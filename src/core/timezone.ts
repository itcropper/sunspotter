// Time zone of the place the user is standing (brief override 2), not the device zone.
// Zone name: bundled offline coordinate lookup. Offset for a given instant: the OS time zone
// database (native module in the app; Intl in tests, which is the same IANA data in Node).
import tzlookup from '@photostructure/tz-lookup';

/** Returns the zone's UTC offset in minutes (east positive) at the given instant. */
export type OffsetProvider = (zone: string, ms: number) => number;

export function zoneForLocation(latitude: number, longitude: number): string {
  try {
    return tzlookup(latitude, longitude);
  } catch {
    return 'UTC';
  }
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

/** Intl-based provider (Node/Jest, and fallback). */
export const intlOffsetProvider: OffsetProvider = (zone, ms) => {
  let dtf = dtfCache.get(zone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    dtfCache.set(zone, dtf);
  }
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
};

/**
 * A zone bound to an offset provider. All "local" values are wall-clock in that zone.
 *
 * Deliberately a plain object, not a class. Reanimated Worklets refuses to copy class
 * instances across the JS→UI thread boundary; a worklet that transitively closes over
 * anything containing a `LocalZone` would otherwise throw `Cannot copy value of type LocalZone`.
 */
export type LocalZone = {
  readonly zone: string;
  offsetMinutes(ms: number): number;
  fields(ms: number): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    minuteOfDay: number;
  };
  instant(year: number, month: number, day: number, hour?: number, minute?: number): number;
  startOfDay(ms: number): number;
  endOfDay(ms: number): number;
};

export function LocalZone(zone: string, offsetOf: OffsetProvider): LocalZone {
  const offsetMinutes = (ms: number) => offsetOf(zone, ms);
  const fields = (ms: number) => {
    const d = new Date(ms + offsetMinutes(ms) * 60000);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
  };
  const instant = (year: number, month: number, day: number, hour = 0, minute = 0) => {
    // In a spring-forward gap the later offset is used; in a fall-back overlap the earlier instant.
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const a = naive - offsetMinutes(naive - 14 * 3600000) * 60000;
    const b = naive - offsetMinutes(naive + 14 * 3600000) * 60000;
    const ok = (ms: number) => ms + offsetMinutes(ms) * 60000 === naive;
    if (ok(a) && ok(b)) return Math.min(a, b);
    if (ok(a)) return a;
    if (ok(b)) return b;
    return naive - offsetMinutes(naive) * 60000;
  };
  const startOfDay = (ms: number) => {
    const f = fields(ms);
    return instant(f.year, f.month, f.day);
  };
  const endOfDay = (ms: number) => {
    const f = fields(ms);
    const next = new Date(Date.UTC(f.year, f.month - 1, f.day + 1));
    return instant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  };
  return { zone, offsetMinutes, fields, instant, startOfDay, endOfDay };
}
