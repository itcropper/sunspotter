// Haptic policy: kinds, rate limits and re-arm rules (Spec-Interactions "Haptics").
// Pure logic; the platform calls live in the native module.
import { CENTER_BUMP_MIN_INTERVAL_MS, HAPTIC_LIGHT_MAX_PER_SEC } from './constants';

export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

/**
 * Haptic rate-limit / re-arm state. Deliberately a plain object (not a class) so Reanimated
 * Worklets can serialize it if a worklet transitively closes over it — see timezone.ts for
 * the same pattern.
 */
export type HapticGate = {
  setEnabled(on: boolean): void;
  /** Light tick: capped at 30 per second (sliding 1 s window). */
  light(now: number): boolean;
  /** Medium bump for a sun event, a calibration pickup. */
  medium(): boolean;
  /**
   * Sun entering the screen center while the phone moves: fires on entry only (re-arms after
   * leaving the center), at most once per 3 s.
   */
  center(now: number, isInCenter: boolean): boolean;
  success(): boolean;
  /** Compass accuracy drop: once per episode; recover() re-arms it. */
  warning(): boolean;
  /** Compass recovered: success haptic (if the episode warned) and re-arm the warning. */
  recover(): boolean;
};

export function HapticGate(enabled = true): HapticGate {
  let on = enabled;
  const lightTimes: number[] = [];
  let lastCenterBump = -Infinity;
  let inCenter = false;
  let warnedThisEpisode = false;
  return {
    setEnabled(next: boolean) {
      on = next;
    },
    light(now: number) {
      if (!on) return false;
      while (lightTimes.length && now - lightTimes[0] >= 1000) lightTimes.shift();
      if (lightTimes.length >= HAPTIC_LIGHT_MAX_PER_SEC) return false;
      lightTimes.push(now);
      return true;
    },
    medium() {
      return on;
    },
    center(now: number, isInCenter: boolean) {
      const entered = isInCenter && !inCenter;
      inCenter = isInCenter;
      if (!entered || !on) return false;
      if (now - lastCenterBump < CENTER_BUMP_MIN_INTERVAL_MS) return false;
      lastCenterBump = now;
      return true;
    },
    success() {
      return on;
    },
    warning() {
      if (warnedThisEpisode) return false;
      warnedThisEpisode = true;
      return on;
    },
    recover() {
      const was = warnedThisEpisode;
      warnedThisEpisode = false;
      return was && on;
    },
  };
}

/** Event times crossed when the selection moves from a to b (either direction), excluding a. */
export function crossedEvents(times: number[], a: number, b: number): number[] {
  if (a === b) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return times.filter((t) => (a < b ? t > lo && t <= hi : t >= lo && t < hi));
}

/** Whole hours crossed (for the sky-scrub light tick). */
export function crossedHours(a: number, b: number, hourStarts: number[]): number {
  return crossedEvents(hourStarts, a, b).length;
}
