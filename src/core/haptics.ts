// Haptic policy: kinds, rate limits and re-arm rules (Spec-Interactions "Haptics").
// Pure logic; the platform calls live in the native module.
import { CENTER_BUMP_MIN_INTERVAL_MS, HAPTIC_LIGHT_MAX_PER_SEC } from './constants';

export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

export class HapticGate {
  private lightTimes: number[] = [];
  private lastCenterBump = -Infinity;
  private inCenter = false;
  private warnedThisEpisode = false;

  constructor(private enabled = true) {}

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  /** Light tick: capped at 30 per second (sliding 1 s window). */
  light(now: number): boolean {
    if (!this.enabled) return false;
    while (this.lightTimes.length && now - this.lightTimes[0] >= 1000) this.lightTimes.shift();
    if (this.lightTimes.length >= HAPTIC_LIGHT_MAX_PER_SEC) return false;
    this.lightTimes.push(now);
    return true;
  }

  /** Medium bump for a sun event, a calibration pickup. */
  medium(): boolean {
    return this.enabled;
  }

  /**
   * Sun entering the screen center while the phone moves: fires on entry only (re-arms after
   * leaving the center), at most once per 3 s.
   */
  center(now: number, isInCenter: boolean): boolean {
    const entered = isInCenter && !this.inCenter;
    this.inCenter = isInCenter;
    if (!entered || !this.enabled) return false;
    if (now - this.lastCenterBump < CENTER_BUMP_MIN_INTERVAL_MS) return false;
    this.lastCenterBump = now;
    return true;
  }

  success(): boolean {
    return this.enabled;
  }

  /** Compass accuracy drop: once per episode; recover() re-arms it. */
  warning(): boolean {
    if (this.warnedThisEpisode) return false;
    this.warnedThisEpisode = true;
    return this.enabled;
  }

  /** Compass recovered: success haptic (if the episode warned) and re-arm the warning. */
  recover(): boolean {
    const was = this.warnedThisEpisode;
    this.warnedThisEpisode = false;
    return was && this.enabled;
  }
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
