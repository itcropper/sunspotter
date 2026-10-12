// Gesture recognition thresholds that can be unit tested (Spec-Interactions).
import {
  BOTTOM_DEAD_ZONE,
  EDGE_DEAD_ZONE,
  PINCH_TO_NORMAL,
  PINCH_TO_WIDE,
  SCRUB_LOCK_ANGLE_DEG,
  SCRUB_LOCK_DISTANCE,
  SCRUB_PT_PER_MINUTE,
} from './constants';

export type Rect = { x: number; y: number; width: number; height: number };

/** A sky scrub may not start in the edge dead zones, the bottom 34 pt, or on excluded areas. */
export function scrubMayStart(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  excluded: ((x: number, y: number) => boolean)[] = [],
): boolean {
  'worklet';
  if (x < EDGE_DEAD_ZONE || x > screenW - EDGE_DEAD_ZONE) return false;
  if (y > screenH - BOTTOM_DEAD_ZONE) return false;
  for (const ex of excluded) if (ex(x, y)) return false;
  return true;
}

export type LockState = 'pending' | 'horizontal' | 'rejected';

/** Locks to horizontal after 10 pt of travel within ±30° of horizontal; otherwise ignored. */
export function scrubLock(dx: number, dy: number): LockState {
  'worklet';
  const d = Math.hypot(dx, dy);
  if (d < SCRUB_LOCK_DISTANCE) return 'pending';
  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  return angle <= SCRUB_LOCK_ANGLE_DEG ? 'horizontal' : 'rejected';
}

/** Right = later. 2.2 pt per minute, snapped to whole minutes. Vertical motion is ignored. */
export function scrubMinutes(dx: number): number {
  'worklet';
  return Math.round(dx / SCRUB_PT_PER_MINUTE);
}

export type Zoom = 'normal' | 'wide';

/** Two zoom states. Switch when the pinch scale passes 0.8 (to wide) or 1.25 (to 1×). */
export function zoomAfterPinch(zoom: Zoom, scale: number): Zoom {
  'worklet';
  if (zoom === 'normal' && scale < PINCH_TO_WIDE) return 'wide';
  if (zoom === 'wide' && scale > PINCH_TO_NORMAL) return 'normal';
  return zoom;
}

/** Offset indicator: swipe left past 50% of its width, or fling left, clears calibration. */
export function offsetSwipeClears(dx: number, width: number, vx: number): boolean {
  'worklet';
  return dx < -0.5 * width || vx < -500;
}

/** Settings sheet: dismiss past 30% of its height or on a downward fling over 500 pt/s. */
export function sheetDismisses(dy: number, sheetHeight: number, vy: number): boolean {
  'worklet';
  return dy > 0.3 * sheetHeight || vy > 500;
}

/** Point within a dial ring band (radii from the anchor corner). */
export function inBand(x: number, y: number, ax: number, ay: number, r0: number, r1: number): boolean {
  'worklet';
  const r = Math.hypot(x - ax, y - ay);
  return r >= r0 && r <= r1;
}
