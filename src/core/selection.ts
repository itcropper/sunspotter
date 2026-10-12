// Selected date/time and the live vs pinned rules (Spec-Interactions, Spec-ReadMe §3, C-Dial).
import { BACKGROUND_RESET_MS } from './constants';
import type { LocalZone } from './timezone';

export type Selection = { live: true } | { live: false; t: number };

export const LIVE: Selection = { live: true };

export function selectedInstant(s: Selection, now: number): number {
  return s.live ? now : s.t;
}

/** Any scrub, dial drag or date change pins the selection. */
export function pin(t: number): Selection {
  return { live: false, t };
}

/** Back to now (tap on the now tick or pip). */
export function backToNow(): Selection {
  return LIVE;
}

/** Returning from background: reopen at now after 15 min away. */
export function onForeground(s: Selection, backgroundedMs: number): Selection {
  return backgroundedMs > BACKGROUND_RESET_MS ? LIVE : s;
}

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Year of the next occurrence of (month, day) on or after today's local date. */
export function nextOccurrenceYear(month: number, day: number, today: { year: number; month: number; day: number }) {
  const before = month < today.month || (month === today.month && day < today.day);
  return before ? today.year + 1 : today.year;
}

/** Days offered on the day ring for a month (Feb 29 only when that next February has one). */
export function daysOffered(month: number, today: { year: number; month: number; day: number }): number {
  const y = nextOccurrenceYear(month, 1, today);
  // A month earlier than today's month happens next year; today's month uses this year.
  const year = month === today.month ? today.year : y;
  return daysInMonth(year, month);
}

/**
 * Re-applies the year rule to an instant: its local (month, day) moves to the next occurrence on
 * or after today. Used after scrubbing or a time-ring carry crosses into another day.
 */
export function normalizeYear(t: number, now: number, zone: LocalZone): number {
  const f = zone.fields(t);
  const today = zone.fields(now);
  let month = f.month;
  let day = f.day;
  let year = nextOccurrenceYear(month, day, today);
  if (month === 2 && day === 29 && !isLeap(year)) {
    // That next February has no 29th: fall through to March 1.
    month = 3;
    day = 1;
    year = nextOccurrenceYear(month, day, today);
  }
  if (year === f.year && month === f.month && day === f.day) return t;
  return zone.instant(year, month, day, f.hour, f.minute);
}

/** Moves the selection by whole minutes (time ring or sky scrub). Carries across midnight. */
export function addMinutes(t: number, minutes: number, now: number, zone: LocalZone): number {
  const base = Math.floor(t / 60000) * 60000;
  return normalizeYear(base + Math.round(minutes) * 60000, now, zone);
}

/** Day ring: wraps within the month's real length and does not carry into the month. */
export function stepDay(t: number, delta: number, now: number, zone: LocalZone): number {
  const f = zone.fields(t);
  const today = zone.fields(now);
  const n = daysOffered(f.month, today);
  const day = ((((f.day - 1 + delta) % n) + n) % n) + 1;
  const year = nextOccurrenceYear(f.month, day, today);
  return zone.instant(year, f.month, day, f.hour, f.minute);
}

/** Month ring: wraps 12 → 1 without changing the year rule. The day clamps to the month's length. */
export function stepMonth(t: number, delta: number, now: number, zone: LocalZone): number {
  const f = zone.fields(t);
  const today = zone.fields(now);
  const month = ((((f.month - 1 + delta) % 12) + 12) % 12) + 1;
  const day = Math.min(f.day, daysOffered(month, today));
  const year = nextOccurrenceYear(month, day, today);
  return zone.instant(year, month, day, f.hour, f.minute);
}
