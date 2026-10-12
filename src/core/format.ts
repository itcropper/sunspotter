// Visible strings. The UI has no words: only the characters in VISIBLE_CHARSET may be returned
// from here (Spec-ReadMe §2). Spoken strings live in a11y.ts.
import type { LocalZone } from './timezone';

/**
 * Spec-ReadMe allows numerals, ":", "/", "-", "°" and "×". The design itself also shows a decimal
 * point ("2.1°", "0.5×"), so "." is allowed too (logged in DECISIONS.md).
 */
export const VISIBLE_CHARSET = /^[0-9:/\-°×.]*$/;

export type TimeFormat = '12' | '24';
export type DateFormat = 'mdy' | 'dmy' | 'ymd';

export function formatClock(hour: number, minute: number, fmt: TimeFormat): string {
  const h = fmt === '12' ? hour % 12 || 12 : hour;
  return `${h}:${String(minute).padStart(2, '0')}`;
}

/** Event and readout times: rounded to the nearest minute. */
export function formatTime(ms: number, zone: LocalZone, fmt: TimeFormat): string {
  const f = zone.fields(Math.round(ms / 60000) * 60000);
  return formatClock(f.hour, f.minute, fmt);
}

export function isPm(ms: number, zone: LocalZone): boolean {
  return zone.fields(ms).hour >= 12;
}

export function formatHourNumeral(hour: number, fmt: TimeFormat): string {
  return String(fmt === '12' ? hour % 12 || 12 : hour);
}

export function formatDate(year: number, month: number, day: number, fmt: DateFormat): string {
  if (fmt === 'mdy') return `${month}/${day}`;
  if (fmt === 'dmy') return `${day}/${month}`;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDegrees(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

export function formatZoom(wide: boolean): string {
  return wide ? '0.5×' : '1×';
}
