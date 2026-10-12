// Screen layout shared by the dial, overlay and gestures (C-Dial, Spec-Platform).
import type { EdgeInsets } from 'react-native-safe-area-context';

import { size } from '../theme/tokens';

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
};

export function makeLayout(width: number, height: number, insets: EdgeInsets, dialSide: 'left' | 'right'): Layout {
  const landscape = width > height;
  const dialRight = dialSide === 'right';
  // Portrait: physical screen corner. Landscape: safe-area corner (insets the Dynamic Island side).
  const ax = dialRight ? width - (landscape ? insets.right : 0) : landscape ? insets.left : 0;
  const ay = height - (landscape ? insets.bottom : 0);
  return { width, height, landscape, insets, ax, ay, dir: dialRight ? 1 : -1, dialRight };
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

export function ringAt(l: Pick<Layout, 'ax' | 'ay' | 'dir'>, x: number, y: number): Ring | null {
  'worklet';
  const { r, theta } = toPolar(l, x, y);
  if (theta < -5 || theta > 95) return null;
  if (r >= size.dial.time[0] && r <= size.dial.time[1]) return 'time';
  if (r >= size.dial.day[0] && r <= size.dial.day[1]) return 'day';
  if (r >= size.dial.month[0] && r <= size.dial.month[1]) return 'month';
  return null;
}

/** Inside the dial's footprint (outer ring plus notch). */
export function inDial(l: Pick<Layout, 'ax' | 'ay' | 'dir'>, x: number, y: number): boolean {
  'worklet';
  return toPolar(l, x, y).r <= size.dial.notch[1];
}
