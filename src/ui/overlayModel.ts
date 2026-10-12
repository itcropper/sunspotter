// Per-frame overlay geometry, computed on the UI thread from the day's path (JS, on date or
// location change) and the current attitude. Pure worklet functions.
import { CLIP_Z, LABEL_AVOID_RADIUS } from '../core/constants';
import { type Intrinsics, type Mat3, project, projectPolyline, screenDirection } from '../core/projection';

export type StyleKey = 'dayAm' | 'dayPm' | 'golden' | 'goldenHidden' | 'blue' | 'nightAm' | 'nightPm' | 'dayHidden';
export const STYLE_KEYS: StyleKey[] = ['nightAm', 'nightPm', 'dayHidden', 'dayAm', 'dayPm', 'blue', 'goldenHidden', 'golden'];
export const DASHED: Record<StyleKey, boolean> = {
  dayAm: false, dayPm: false, golden: false, goldenHidden: true, blue: true, nightAm: true, nightPm: true, dayHidden: true,
};

export type PathModel = {
  /** Flat xyz of every path sample (world ENU unit vectors). */
  xyz: number[];
  /** Runs of samples sharing a style: [from, to, styleIndex] triples (styleIndex into STYLE_KEYS). */
  runs: number[];
  /** Hour marks: xyz triples and the hour (0–23). */
  hourXyz: number[];
  hours: number[];
  /** Astronomical rise/set on the horizon: xyz of (azimuth, 0°), or empty. */
  rise: number[];
  set: number[];
};

export const EMPTY_PATH: PathModel = { xyz: [], runs: [], hourXyz: [], hours: [], rise: [], set: [] };

export type Screen = {
  width: number;
  height: number;
  /** Dial anchor and its outer radius: anything inside is "under the dial". */
  dialX: number;
  dialY: number;
  dialR: number;
  /** Safe area (pt). */
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Which side the dial is on. */
  dialRight: boolean;
};

export type Pt = { x: number; y: number; visible: boolean };

export type EdgeTab = { visible: boolean; right: boolean; y: number; kind: 0 | 1 | 2 };

export type Frame = {
  /** Polylines per style: flat [x, y, ...] arrays, one per run, already dashed if needed. */
  lines: number[][][];
  ticks: number[];
  hourLabels: Pt[];
  horizon: number[][];
  sun: Pt & { depth: number };
  rise: Pt;
  set: Pt;
  tabs: EdgeTab[];
  /** Screen position of the projected sun even when off-screen (for long-press hit tests). */
  sunCenter: { x: number; y: number };
};

function underDial(s: Screen, x: number, y: number, pad = 0) {
  'worklet';
  return Math.hypot(x - s.dialX, y - s.dialY) <= s.dialR + pad;
}

function onScreen(s: Screen, x: number, y: number, margin = 0) {
  'worklet';
  return x >= -margin && x <= s.width + margin && y >= -margin && y <= s.height + margin;
}

/** Splits a polyline into dashes [on, off] with a continuous phase carried in `phase`. */
function dashify(run: number[], on: number, off: number, phase: { v: number }): number[][] {
  'worklet';
  const out: number[][] = [];
  const period = on + off;
  let cur: number[] | null = null;
  for (let i = 0; i < run.length - 2; i += 2) {
    const x0 = run[i];
    const y0 = run[i + 1];
    const x1 = run[i + 2];
    const y1 = run[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let t = 0;
    while (t < len) {
      const p = phase.v % period;
      const inOn = p < on;
      const remain = (inOn ? on : period) - p;
      const step = Math.min(remain, len - t);
      const ax = x0 + ((x1 - x0) * t) / len;
      const ay = y0 + ((y1 - y0) * t) / len;
      const bx = x0 + ((x1 - x0) * (t + step)) / len;
      const by = y0 + ((y1 - y0) * (t + step)) / len;
      if (inOn) {
        if (!cur) {
          cur = [ax, ay];
          out.push(cur);
        }
        cur.push(bx, by);
      } else {
        cur = null;
      }
      t += step;
      phase.v += step;
    }
  }
  return out.filter((r) => r.length >= 4);
}

function runLength(run: number[]) {
  'worklet';
  let l = 0;
  for (let i = 0; i < run.length - 2; i += 2) l += Math.hypot(run[i + 2] - run[i], run[i + 3] - run[i + 1]);
  return l;
}

/** Edge-tab placement (C-EdgeArrows). */
function placeTab(
  m: Mat3,
  k: Intrinsics,
  s: Screen,
  x: number,
  y: number,
  z: number,
  altitudeDeg: number,
): { right: boolean; y: number } {
  'worklet';
  const d = screenDirection(m, x, y, z);
  const cx = s.width / 2;
  const cy = s.height / 2;
  let right: boolean;
  let ty: number;
  // Within 90° of where the camera points (depth > 0): ray from center to the projected point.
  if (!d.behind && Math.abs(d.x) > 1e-6) {
    right = d.x > 0;
    const edgeX = right ? s.width - s.right : s.left;
    const t = (edgeX - cx) / d.x;
    ty = cy + d.y * t;
  } else {
    // Behind: shorter turn; y from altitude (0° at center, ±45° to the clamps).
    right = d.x >= 0;
    ty = cy - (altitudeDeg / 45) * (s.height / 2);
  }
  const top = s.top + 56;
  const bottomDial = s.height - 284;
  const bottomOther = s.height - 54;
  const bottom = right === s.dialRight ? bottomDial : bottomOther;
  ty = Math.max(top, Math.min(bottom, ty));
  return { right, y: ty };
}

export function computeFrame(
  m: Mat3,
  k: Intrinsics,
  s: Screen,
  path: PathModel,
  sun: { x: number; y: number; z: number; altitude: number },
  riseAlt: number,
  setAlt: number,
  dashOn: number,
  dashOff: number,
): Frame {
  'worklet';
  const lines: number[][][] = [];
  for (let i = 0; i < 8; i++) lines.push([]);
  const phase = { v: 0 };
  const ticks: number[] = [];
  for (let r = 0; r < path.runs.length; r += 3) {
    const from = path.runs[r];
    const to = path.runs[r + 1];
    const style = path.runs[r + 2];
    const projected = projectPolyline(m, k, path.xyz, from, to, CLIP_Z);
    const dashed = style === 0 || style === 1 || style === 2 || style === 5 || style === 6;
    for (const run of projected) {
      if (dashed) {
        const parts = dashify(run, dashOn, dashOff, phase);
        for (const p of parts) lines[style].push(p);
      } else {
        lines[style].push(run);
        phase.v += runLength(run);
      }
    }
  }

  const sp = project(m, k, sun.x, sun.y, sun.z);
  const sunVisible = sp.depth > 0 && onScreen(s, sp.x, sp.y, 0);
  const sunPt = { x: sp.x, y: sp.y, visible: sunVisible, depth: sp.depth };

  const marker = (xyz: number[]): Pt => {
    if (xyz.length < 3) return { x: 0, y: 0, visible: false };
    const p = project(m, k, xyz[0], xyz[1], xyz[2]);
    const vis = p.depth > 0 && onScreen(s, p.x, p.y, 0) && !underDial(s, p.x, p.y, 8);
    return { x: p.x, y: p.y, visible: vis };
  };
  const rise = marker(path.rise);
  const set = marker(path.set);

  // Hour ticks and numerals.
  const hourLabels: Pt[] = [];
  for (let h = 0; h < path.hours.length; h++) {
    const i = h * 3;
    const p = project(m, k, path.hourXyz[i], path.hourXyz[i + 1], path.hourXyz[i + 2]);
    let vis = p.depth > CLIP_Z && onScreen(s, p.x, p.y, 0);
    let lx = 0;
    let ly = 0;
    if (vis) {
      // Local path direction from a point a few minutes later (same hour sample + tiny step).
      const nx = path.hourXyz[i] + 0.01;
      const q = project(m, k, nx, path.hourXyz[i + 1], path.hourXyz[i + 2]);
      void q;
      // Tangent from neighbouring hour marks when available.
      const j = h + 1 < path.hours.length ? h + 1 : h - 1;
      const pn = project(m, k, path.hourXyz[j * 3], path.hourXyz[j * 3 + 1], path.hourXyz[j * 3 + 2]);
      let tx = (pn.x - p.x) * (j > h ? 1 : -1);
      let ty = (pn.y - p.y) * (j > h ? 1 : -1);
      if (!(pn.depth > 0) || !Number.isFinite(tx)) {
        tx = 1;
        ty = 0;
      }
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // Normal pointing up the screen.
      let nX = -ty;
      let nY = tx;
      if (nY > 0) {
        nX = -nX;
        nY = -nY;
      }
      ticks.push(p.x - nX * 7, p.y - nY * 7, p.x + nX * 7, p.y + nY * 7);
      lx = p.x + nX * 20;
      ly = p.y + nY * 20;
      const nearSun = sunVisible && Math.hypot(lx - sp.x, ly - sp.y) < LABEL_AVOID_RADIUS;
      if (nearSun) {
        // Move to the other side of the path, or hide if it still overlaps.
        lx = p.x - nX * 20;
        ly = p.y - nY * 20;
        if (Math.hypot(lx - sp.x, ly - sp.y) < LABEL_AVOID_RADIUS) vis = false;
      }
      if (underDial(s, lx, ly, 10)) vis = false;
      for (const mk of [rise, set]) {
        if (mk.visible && Math.hypot(lx - mk.x, ly - (mk.y + 20)) < 26) vis = false;
      }
    }
    hourLabels.push({ x: lx, y: ly, visible: vis });
  }

  // Horizon: apparent altitude 0°, full-bleed.
  const hz: number[] = [];
  for (let az = 0; az <= 360; az += 3) {
    const a = (az * Math.PI) / 180;
    hz.push(Math.sin(a), Math.cos(a), 0);
  }
  const horizon = projectPolyline(m, k, hz, 0, hz.length / 3 - 1, CLIP_Z);

  // Edge tabs: sun, and rise/set when off-screen or under the dial/gear.
  const tabs: EdgeTab[] = [];
  const sunUnder = sunVisible && (underDial(s, sp.x, sp.y, 0) || (sp.y < s.top + 44 && Math.abs(sp.x - (s.dialRight ? s.width - 34 : 34)) < 30));
  if (!sunVisible || sunUnder) {
    const t = placeTab(m, k, s, sun.x, sun.y, sun.z, sun.altitude);
    tabs.push({ visible: true, right: t.right, y: t.y, kind: 0 });
  } else tabs.push({ visible: false, right: true, y: 0, kind: 0 });
  const tabFor = (xyz: number[], mk: Pt, kind: 1 | 2, alt: number): EdgeTab => {
    if (xyz.length < 3 || mk.visible) return { visible: false, right: true, y: 0, kind };
    const t = placeTab(m, k, s, xyz[0], xyz[1], xyz[2], alt);
    return { visible: true, right: t.right, y: t.y, kind };
  };
  tabs.push(tabFor(path.set, set, 2, setAlt));
  tabs.push(tabFor(path.rise, rise, 1, riseAlt));
  // Stacking: same edge ≥ 44 apart; sort by y, push apart upward first; sun wins.
  for (const side of [true, false]) {
    const same = tabs.filter((t) => t.visible && t.right === side).sort((a, b) => a.y - b.y);
    for (let i = same.length - 1; i > 0; i--) {
      if (same[i].y - same[i - 1].y < 44) same[i - 1].y = same[i].y - 44;
    }
    const top = s.top + 56;
    if (same.length && same[0].y < top) {
      const shift = top - same[0].y;
      for (const t of same) t.y += shift;
      const bottom = side === s.dialRight ? s.height - 284 : s.height - 54;
      // Still doesn't fit: hide the lowest priority (rise, then set).
      for (let i = same.length - 1; i >= 0 && same[same.length - 1].y > bottom; i--) {
        const victim = same.filter((t) => t.visible && t.kind !== 0).sort((a, b) => a.kind - b.kind)[0];
        if (!victim) break;
        victim.visible = false;
      }
    }
  }
  return {
    lines,
    ticks,
    hourLabels,
    horizon,
    sun: sunPt,
    rise,
    set,
    tabs,
    sunCenter: { x: sp.depth > 0 ? sp.x : -1000, y: sp.depth > 0 ? sp.y : -1000 },
  };
}
