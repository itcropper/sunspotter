// Pinhole projection of world directions onto the screen (Spec-Math "Projection").
// Frames:
//   world  ENU: x east, y north, z up.
//   device: x right, y toward the top edge (natural portrait), z out of the screen.
//   camera: x screen-right, y screen-down, z forward (back camera looks along −z_device).
// Attitude is a unit quaternion [x, y, z, w] rotating device vectors into world (ENU).
// All functions are worklets so the per-frame re-projection runs on the UI thread.

export type Quat = readonly [number, number, number, number];
export type Mat3 = number[]; // row-major 3x3

export type Intrinsics = {
  /** Focal length in screen points. */
  fx: number;
  fy: number;
  /** Principal point in screen points. */
  cx: number;
  cy: number;
};

export type Calibration = {
  /** Degrees; rotation about the vertical (positive = clockwise from above, i.e. azimuth increases). */
  dAz: number;
  /** Degrees; tilt up about the horizontal axis perpendicular to refAz. */
  dAlt: number;
  /** Azimuth (deg) the tilt is measured at (the sun's azimuth when calibrated). */
  refAz: number;
};

export const ZERO_CALIBRATION: Calibration = { dAz: 0, dAlt: 0, refAz: 0 };

const RAD = Math.PI / 180;

export function quatToMatrix(q: Quat): Mat3 {
  'worklet';
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  'worklet';
  const r: Mat3 = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export function transpose3(a: Mat3): Mat3 {
  'worklet';
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

/** Rotation about axis (unit) by angle (rad), right-handed. */
function axisAngle(ax: number, ay: number, az: number, angle: number): Mat3 {
  'worklet';
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
  ];
}

/** World-space calibration rotation: about the vertical by dAz, then tilt by dAlt. */
export function calibrationMatrix(cal: Calibration): Mat3 {
  'worklet';
  // Azimuth increases clockwise seen from above = negative rotation about +z (up).
  const yaw = axisAngle(0, 0, 1, -cal.dAz * RAD);
  // Tilt up at azimuth refAz (after yaw): axis is horizontal, perpendicular to that azimuth.
  const a = (cal.refAz + cal.dAz) * RAD;
  // Direction d = (sin a, cos a, 0); rotating d toward +z needs axis = d × z = (cos a, −sin a, 0).
  const tilt = axisAngle(Math.cos(a), -Math.sin(a), 0, cal.dAlt * RAD);
  return mul3(tilt, yaw);
}

/** Device → camera for a UI rotation (degrees the device is turned counter-clockwise: 0/90/180/270). */
export function deviceToCamera(rotationDeg: number): Mat3 {
  'worklet';
  const r = rotationDeg * RAD;
  const c = Math.round(Math.cos(r));
  const s = Math.round(Math.sin(r));
  // screen-right = (c, −s, 0)_device, screen-up = (s, c, 0)_device; camera y is screen-down.
  return [c, -s, 0, -s, -c, 0, 0, 0, -1];
}

/** Full world → camera matrix for this frame. */
export function viewMatrix(q: Quat, cal: Calibration, rotationDeg: number): Mat3 {
  'worklet';
  const worldToDevice = transpose3(quatToMatrix(q));
  return mul3(mul3(deviceToCamera(rotationDeg), worldToDevice), calibrationMatrix(cal));
}

export type Projected = { x: number; y: number; depth: number };

export function toCamera(m: Mat3, x: number, y: number, z: number) {
  'worklet';
  return {
    x: m[0] * x + m[1] * y + m[2] * z,
    y: m[3] * x + m[4] * y + m[5] * z,
    z: m[6] * x + m[7] * y + m[8] * z,
  };
}

/** Projects a world direction. depth ≤ 0 means behind the camera: x/y are not meaningful. */
export function project(m: Mat3, k: Intrinsics, x: number, y: number, z: number): Projected {
  'worklet';
  const c = toCamera(m, x, y, z);
  if (c.z <= 0) return { x: NaN, y: NaN, depth: c.z };
  return { x: k.cx + (k.fx * c.x) / c.z, y: k.cy + (k.fy * c.y) / c.z, depth: c.z };
}

/**
 * Projects a polyline of world directions (flat xyz array), clipping at camera depth clipZ.
 * Returns runs of screen points [x0, y0, x1, y1, ...]; a run breaks wherever the line goes
 * behind the clip plane, so it can never wrap through infinity.
 */
export function projectPolyline(
  m: Mat3,
  k: Intrinsics,
  xyz: ArrayLike<number>,
  from: number,
  to: number,
  clipZ: number,
): number[][] {
  'worklet';
  const runs: number[][] = [];
  let run: number[] = [];
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let i = from; i <= to; i++) {
    const c = toCamera(m, xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
    const inside = c.z >= clipZ;
    if (i > from) {
      const prevInside = pz >= clipZ;
      if (inside !== prevInside) {
        const t = (clipZ - pz) / (c.z - pz);
        const ix = px + (c.x - px) * t;
        const iy = py + (c.y - py) * t;
        const sx = k.cx + (k.fx * ix) / clipZ;
        const sy = k.cy + (k.fy * iy) / clipZ;
        run.push(sx, sy);
        if (!inside) {
          runs.push(run);
          run = [];
        }
      }
    }
    if (inside) run.push(k.cx + (k.fx * c.x) / c.z, k.cy + (k.fy * c.y) / c.z);
    px = c.x;
    py = c.y;
    pz = c.z;
  }
  if (run.length >= 4) runs.push(run);
  return runs.filter((r) => r.length >= 4);
}

/**
 * Screen-plane direction from the view center toward a world direction, valid in front of
 * and behind the camera. Used for edge arrows. Returns a unit 2D vector (screen y down).
 */
export function screenDirection(m: Mat3, x: number, y: number, z: number) {
  'worklet';
  const c = toCamera(m, x, y, z);
  let dx = c.x;
  let dy = c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    // Exactly ahead or behind: point down (behind) or nowhere.
    dx = 0;
    dy = c.z > 0 ? 0 : 1;
    return { x: dx, y: dy, behind: c.z <= 0 };
  }
  return { x: dx / len, y: dy / len, behind: c.z <= 0 };
}

export type CameraGeometry = {
  /** Preview buffer size in pixels, in the sensor's native (landscape) orientation. */
  bufferWidth: number;
  bufferHeight: number;
  /** Focal length in buffer pixels (from intrinsics or FOV). */
  focalPx: number;
  /** Principal point offset from buffer center, buffer pixels (0 when unknown). */
  principalDx?: number;
  principalDy?: number;
};

/**
 * Intrinsics in screen points for an aspect-fill preview of the buffer in a viewW × viewH view.
 * `scale` shrinks the projection around the center (wide view without an ultra-wide camera).
 */
export function screenIntrinsics(
  g: CameraGeometry,
  viewW: number,
  viewH: number,
  rotationDeg: number,
  scale = 1,
): Intrinsics {
  const portrait = rotationDeg % 180 === 0;
  const dispW = portrait ? g.bufferHeight : g.bufferWidth;
  const dispH = portrait ? g.bufferWidth : g.bufferHeight;
  const fill = Math.max(viewW / dispW, viewH / dispH) * scale;
  const f = g.focalPx * fill;
  return { fx: f, fy: f, cx: viewW / 2, cy: viewH / 2 };
}

/** Horizontal and vertical field of view (deg) visible on screen. */
export function visibleFov(k: Intrinsics, viewW: number, viewH: number) {
  return {
    h: (2 * Math.atan(viewW / 2 / k.fx)) / RAD,
    v: (2 * Math.atan(viewH / 2 / k.fy)) / RAD,
  };
}

/** Slerp-free unit quaternion from yaw/pitch/roll — used only by the simulator feed and tests. */
export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  'worklet';
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

export function quatMul(a: Quat, b: Quat): Quat {
  'worklet';
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Attitude for a phone held upright (portrait, screen vertical) with the back camera facing
 * `headingDeg` (clockwise from north) and pitched up by `pitchDeg`.
 */
export function uprightAttitude(headingDeg: number, pitchDeg = 0): Quat {
  'worklet';
  // Start: device y = up (world z), device z = toward user = south when facing north.
  // Rotate +90° about world x (east): device y (north) → up, device z (up) → south.
  const stand = quatFromAxisAngle(1, 0, 0, Math.PI / 2);
  const pitch = quatFromAxisAngle(1, 0, 0, pitchDeg * RAD);
  const yaw = quatFromAxisAngle(0, 0, 1, -headingDeg * RAD);
  return quatMul(yaw, quatMul(stand, pitch));
}

/**
 * Calibration that makes a target (azimuth/altitude) project onto screen point (px, py): the
 * world direction under that point (with no calibration) minus the target's direction.
 */
export function calibrationForScreenPoint(
  q: Quat,
  rotationDeg: number,
  k: Intrinsics,
  px: number,
  py: number,
  targetAz: number,
  targetAlt: number,
): Calibration {
  'worklet';
  const m = mul3(deviceToCamera(rotationDeg), transpose3(quatToMatrix(q)));
  const cx = (px - k.cx) / k.fx;
  const cy = (py - k.cy) / k.fy;
  const n = Math.hypot(cx, cy, 1);
  // Camera → world is the transpose of world → camera.
  const wx = (m[0] * cx + m[3] * cy + m[6]) / n;
  const wy = (m[1] * cx + m[4] * cy + m[7]) / n;
  const wz = (m[2] * cx + m[5] * cy + m[8]) / n;
  const az = ((Math.atan2(wx, wy) / RAD) % 360 + 360) % 360;
  const alt = Math.asin(Math.max(-1, Math.min(1, wz))) / RAD;
  let dAz = az - targetAz;
  dAz = ((dAz % 360) + 540) % 360 - 180;
  return { dAz, dAlt: alt - targetAlt, refAz: targetAz };
}
