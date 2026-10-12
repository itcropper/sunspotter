import { direction } from '../src/core/celestial';
import {
  calibrationMatrix,
  type Intrinsics,
  project,
  projectPolyline,
  screenDirection,
  screenIntrinsics,
  toCamera,
  uprightAttitude,
  viewMatrix,
  visibleFov,
  ZERO_CALIBRATION,
} from '../src/core/projection';

const K: Intrinsics = { fx: 600, fy: 600, cx: 195, cy: 422 };

describe('projection with known attitude and intrinsics', () => {
  it('a target straight ahead lands on the principal point', () => {
    const m = viewMatrix(uprightAttitude(90), ZERO_CALIBRATION, 0);
    const d = direction(90, 0);
    const p = project(m, K, d.x, d.y, d.z);
    expect(p.x).toBeCloseTo(195, 6);
    expect(p.y).toBeCloseTo(422, 6);
    expect(p.depth).toBeCloseTo(1, 6);
  });
  it('east of the heading is to the right, up is up (screen y down)', () => {
    const m = viewMatrix(uprightAttitude(0), ZERO_CALIBRATION, 0);
    const right = direction(10, 0);
    const up = direction(0, 10);
    const pr = project(m, K, right.x, right.y, right.z);
    const pu = project(m, K, up.x, up.y, up.z);
    expect(pr.x).toBeCloseTo(195 + 600 * Math.tan((10 * Math.PI) / 180), 4);
    expect(pr.y).toBeCloseTo(422, 4);
    expect(pu.y).toBeCloseTo(422 - 600 * Math.tan((10 * Math.PI) / 180), 4);
    expect(pu.x).toBeCloseTo(195, 4);
  });
  it('pitching the phone up moves a horizon target down the screen', () => {
    const m = viewMatrix(uprightAttitude(0, 10), ZERO_CALIBRATION, 0);
    const d = direction(0, 0);
    expect(project(m, K, d.x, d.y, d.z).y).toBeCloseTo(422 + 600 * Math.tan((10 * Math.PI) / 180), 4);
  });
  it('points behind the camera are off-screen (depth ≤ 0, no coordinates)', () => {
    const m = viewMatrix(uprightAttitude(0), ZERO_CALIBRATION, 0);
    const d = direction(180, 5);
    const p = project(m, K, d.x, d.y, d.z);
    expect(p.depth).toBeLessThan(0);
    expect(Number.isNaN(p.x)).toBe(true);
    const side = direction(90.0001, 0);
    expect(project(m, K, side.x, side.y, side.z).depth).toBeLessThanOrEqual(0);
  });
  it('edge-arrow direction works behind the camera', () => {
    const m = viewMatrix(uprightAttitude(0), ZERO_CALIBRATION, 0);
    const behindRight = direction(150, 0);
    const s = screenDirection(m, behindRight.x, behindRight.y, behindRight.z);
    expect(s.behind).toBe(true);
    expect(s.x).toBeGreaterThan(0.99);
  });
  it('landscape rotation keeps the overlay locked to the sky', () => {
    // Device turned 90° CCW (top to the left) while the camera still faces north.
    const q = uprightAttitude(0);
    const roll = [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)] as const; // +90° about device z
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const [bx, by, bz, bw] = roll;
    const ql = [
      qw * bx + qx * bw + qy * bz - qz * by,
      qw * by - qx * bz + qy * bw + qz * bx,
      qw * bz + qx * by - qy * bx + qz * bw,
      qw * bw - qx * bx - qy * by - qz * bz,
    ] as const;
    const m = viewMatrix(ql, ZERO_CALIBRATION, 90);
    const k = { fx: 600, fy: 600, cx: 422, cy: 195 };
    const right = direction(10, 0);
    const up = direction(0, 10);
    expect(project(m, k, right.x, right.y, right.z).x).toBeGreaterThan(422 + 100);
    expect(project(m, k, right.x, right.y, right.z).y).toBeCloseTo(195, 3);
    expect(project(m, k, up.x, up.y, up.z).y).toBeLessThan(195 - 100);
  });
});

describe('polyline clipping', () => {
  it('breaks the line where it passes behind z = 0.1 and never wraps', () => {
    const m = viewMatrix(uprightAttitude(0), ZERO_CALIBRATION, 0);
    const xyz: number[] = [];
    for (let az = -120; az <= 120; az += 10) {
      const d = direction((az + 360) % 360, 0);
      xyz.push(d.x, d.y, d.z);
    }
    const runs = projectPolyline(m, K, xyz, 0, xyz.length / 3 - 1, 0.1);
    expect(runs).toHaveLength(1);
    const run = runs[0];
    // Interior samples stay finite and in order left → right.
    for (let i = 2; i < run.length; i += 2) expect(run[i]).toBeGreaterThan(run[i - 2]);
    // The first point is the clip point between az −90° and −80° on the z = 0.1 plane.
    const s80 = Math.sin((80 * Math.PI) / 180);
    const t = 0.1 / Math.cos((80 * Math.PI) / 180);
    expect(run[0]).toBeCloseTo(195 + (600 * (-1 + (1 - s80) * t)) / 0.1, 6);
  });
  it('returns two runs for a line that goes behind and comes back', () => {
    const m = viewMatrix(uprightAttitude(0), ZERO_CALIBRATION, 0);
    const xyz: number[] = [];
    for (const az of [-30, 0, 30, 120, 180, 240, 330, 0]) {
      const d = direction((az + 360) % 360, 0);
      xyz.push(d.x, d.y, d.z);
    }
    expect(projectPolyline(m, K, xyz, 0, 7, 0.1)).toHaveLength(2);
  });
});

describe('calibration offset', () => {
  it('rotates about the vertical by Δaz, then tilts by Δalt (not a screen shift)', () => {
    const r = calibrationMatrix({ dAz: 2, dAlt: 1, refAz: 250 });
    const d = direction(250, 8);
    const c = toCamera(r, d.x, d.y, d.z);
    const az = ((Math.atan2(c.x, c.y) * 180) / Math.PI + 360) % 360;
    const alt = (Math.asin(c.z) * 180) / Math.PI;
    expect(az).toBeCloseTo(252, 3);
    expect(alt).toBeCloseTo(9, 3);
  });
});

describe('intrinsics from the preview crop', () => {
  it('aspect-fill crop of a 4:3 buffer on a 390×844 portrait view', () => {
    // 4032×3024 buffer, 70° horizontal FOV along the long side.
    const focalPx = 4032 / 2 / Math.tan((35 * Math.PI) / 180);
    const k = screenIntrinsics({ bufferWidth: 4032, bufferHeight: 3024, focalPx }, 390, 844, 0);
    const fov = visibleFov(k, 390, 844);
    // Height (long side) fills 844 pt; the visible vertical FOV is the full 70°.
    expect(fov.v).toBeCloseTo(70, 3);
    expect(fov.h).toBeLessThan(36); // ≈ 35.9°: the design's 30–35° estimate is close
    expect(fov.h).toBeGreaterThan(30);
  });
  it('wide fallback halves the angular scale', () => {
    const g = { bufferWidth: 4032, bufferHeight: 3024, focalPx: 2880 };
    const a = screenIntrinsics(g, 390, 844, 0);
    const b = screenIntrinsics(g, 390, 844, 0, 0.5);
    expect(b.fx).toBeCloseTo(a.fx / 2, 6);
  });
});

describe('calibration from a screen point', () => {
  it('round-trips: the target then projects onto the chosen point', () => {
    const { calibrationForScreenPoint } = require('../src/core/projection');
    const q = uprightAttitude(250, 5);
    const cal = calibrationForScreenPoint(q, 0, K, 240, 380, 251.5, 8.5);
    const m = viewMatrix(q, cal, 0);
    const d = direction(251.5, 8.5);
    const p = project(m, K, d.x, d.y, d.z);
    expect(p.x).toBeCloseTo(240, 1);
    expect(p.y).toBeCloseTo(380, 1);
  });
});
