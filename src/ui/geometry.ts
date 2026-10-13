// Screen layout shared by the dial, overlay and gestures (C-Dial, Spec-Platform).
import type { EdgeInsets } from 'react-native-safe-area-context';

import { size } from '../theme/tokens';

/**
 * Dial ring radii, derived at runtime from screen width so the outermost (time) ring reaches the
 * opposite bottom corner on any phone. Ring widths are 15% larger than the design spec so the
 * thumb has more room to land on each band. Everything else (track positions, label radii, notch,
 * now-pip) is derived by preserving the design's inner/outer offsets relative to the time ring.
 */
export type DialSizes = {
  readonly time: readonly [number, number];
  readonly day: readonly [number, number];
  readonly month: readonly [number, number];
  readonly trackInner: number;
  readonly trackOuter: number;
  readonly labelTime: number;
  readonly labelDay: number;
  readonly labelMonth: number;
  readonly notch: readonly [number, number];
  readonly notchWidthDeg: number;
  readonly selectionDeg: number;
  readonly wedgeDeg: readonly [number, number];
  readonly tickMinor: readonly [number, number];
  readonly tickMajor: readonly [number, number];
  readonly labelHideDeg: number;
  readonly nowTick: readonly [number, number];
  readonly nowDotR: number;
  readonly nowDot: number;
  readonly pipR: number;
  readonly pip: number;
  readonly pipAngleEarlier: number;
  readonly pipAngleLater: number;
  readonly ghostOffsetDeg: number;
  readonly topClearance: number;
};

const EDGE_PADDING = 10;
const RING_WIDTH_SCALE = 1.15;
const RING_GAP = 4;

export function computeDialSizes(screenWidth: number, screenHeight: number): DialSizes {
  // Ring widths from the design spec, each widened by 15% per user feedback.
  const timeWidth = Math.round((size.dial.time[1] - size.dial.time[0]) * RING_WIDTH_SCALE);
  const dayWidth = Math.round((size.dial.day[1] - size.dial.day[0]) * RING_WIDTH_SCALE);
  const monthWidth = Math.round((size.dial.month[1] - size.dial.month[0]) * RING_WIDTH_SCALE);
  // Dial dimension uses the shorter screen edge so the dial stays the same physical size when the
  // device rotates. In portrait that's `width`; in landscape we clamp to the shorter `height` so
  // the dial doesn't balloon to fill the screen. The outer radius sits halfway between the design
  // spec's 272 dp and the full "reaches the opposite bottom corner" value — splits the difference
  // between the original tight-to-thumb and the maximum-reach versions.
  const shortEdge = Math.round(Math.min(screenWidth, screenHeight));
  const maxOuter = shortEdge - EDGE_PADDING;
  const timeOuter = Math.max(size.dial.time[1], Math.round((size.dial.time[1] + maxOuter) / 2));
  const timeInner = timeOuter - timeWidth;
  const dayOuter = timeInner - RING_GAP;
  const dayInner = dayOuter - dayWidth;
  const monthOuter = dayInner - RING_GAP;
  const monthInner = monthOuter - monthWidth;
  // Offsets preserved from the design tokens, applied around the new outer edge of the time ring.
  const trackInnerOffset = size.dial.trackInner - size.dial.time[0]; // 3
  const trackOuterOffset = size.dial.time[1] - size.dial.trackOuter; // 2
  const tickMinorInside = size.dial.time[1] - size.dial.tickMinor[0]; // 8
  const tickMajorInside = size.dial.time[1] - size.dial.tickMajor[0]; // 14
  const notchInside = size.dial.notch[0] - size.dial.time[1]; // 2
  const notchOutside = size.dial.notch[1] - size.dial.time[1]; // 15
  const nowTickInside = size.dial.time[1] - size.dial.nowTick[0]; // 10
  const nowTickOutside = size.dial.nowTick[1] - size.dial.time[1]; // 8
  const nowDotOffset = size.dial.nowDotR - size.dial.time[1]; // 15
  const pipOffset = size.dial.pipR - size.dial.time[1]; // 26
  const topClearanceOffset = size.dial.topClearance - size.dial.time[1]; // 12
  return {
    time: [timeInner, timeOuter],
    day: [dayInner, dayOuter],
    month: [monthInner, monthOuter],
    trackInner: timeInner + trackInnerOffset,
    trackOuter: timeOuter - trackOuterOffset,
    labelTime: Math.round((timeInner + timeOuter) / 2),
    labelDay: Math.round((dayInner + dayOuter) / 2),
    labelMonth: Math.round((monthInner + monthOuter) / 2),
    notch: [timeOuter + notchInside, timeOuter + notchOutside],
    notchWidthDeg: size.dial.notchWidthDeg,
    selectionDeg: size.dial.selectionDeg,
    wedgeDeg: size.dial.wedgeDeg,
    tickMinor: [timeOuter - tickMinorInside, timeOuter],
    tickMajor: [timeOuter - tickMajorInside, timeOuter],
    labelHideDeg: size.dial.labelHideDeg,
    nowTick: [timeOuter - nowTickInside, timeOuter + nowTickOutside],
    nowDotR: timeOuter + nowDotOffset,
    nowDot: size.dial.nowDot,
    pipR: timeOuter + pipOffset,
    pip: size.dial.pip,
    pipAngleEarlier: size.dial.pipAngleEarlier,
    pipAngleLater: size.dial.pipAngleLater,
    ghostOffsetDeg: size.dial.ghostOffsetDeg,
    topClearance: timeOuter + topClearanceOffset,
  };
}

export type Layout = {
  width: number;
  height: number;
  landscape: boolean;
  insets: EdgeInsets;
  /** Dial anchor (bottom corner on the dial side). */
  ax: number;
  ay: number;
  /** +1 when the dial opens to the left (right-hand dial), −1 when mirrored. */
  dir: 1 | -1;
  dialRight: boolean;
  /** Runtime-scaled dial geometry — shared source of truth for rendering and hit testing. */
  dial: DialSizes;
};

export function makeLayout(width: number, height: number, insets: EdgeInsets, dialSide: 'left' | 'right'): Layout {
  const landscape = width > height;
  const dialRight = dialSide === 'right';
  // Portrait: physical screen corner. Landscape: safe-area corner (insets the Dynamic Island side).
  const ax = dialRight ? width - (landscape ? insets.right : 0) : landscape ? insets.left : 0;
  const ay = height - (landscape ? insets.bottom : 0);
  return {
    width,
    height,
    landscape,
    insets,
    ax,
    ay,
    dir: dialRight ? 1 : -1,
    dialRight,
    dial: computeDialSizes(width, height),
  };
}

/** Point at radius r and angle θ (deg) from the anchor; θ = 0 points up, 90 toward the open side. */
export function polar(l: Pick<Layout, 'ax' | 'ay' | 'dir'>, r: number, thetaDeg: number) {
  'worklet';
  const t = (thetaDeg * Math.PI) / 180;
  return { x: l.ax - l.dir * r * Math.sin(t), y: l.ay - r * Math.cos(t) };
}

/** Angle θ (deg) and radius of a screen point around the anchor. */
export function toPolar(l: Pick<Layout, 'ax' | 'ay' | 'dir'>, x: number, y: number) {
  'worklet';
  const dx = (l.ax - x) * l.dir;
  const dy = l.ay - y;
  return { r: Math.hypot(dx, dy), theta: (Math.atan2(dx, dy) * 180) / Math.PI };
}

export type Ring = 'time' | 'day' | 'month';

export function ringAt(l: Layout, x: number, y: number): Ring | null {
  'worklet';
  const { r, theta } = toPolar(l, x, y);
  if (theta < -5 || theta > 95) return null;
  if (r >= l.dial.time[0] && r <= l.dial.time[1]) return 'time';
  if (r >= l.dial.day[0] && r <= l.dial.day[1]) return 'day';
  if (r >= l.dial.month[0] && r <= l.dial.month[1]) return 'month';
  return null;
}

/** Inside the dial's footprint (outer ring plus notch). */
export function inDial(l: Layout, x: number, y: number): boolean {
  'worklet';
  return toPolar(l, x, y).r <= l.dial.notch[1];
}
