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

/** A zone bound to an offset provider. All "local" values are wall-clock in that zone. */
export class LocalZone {
  constructor(
    readonly zone: string,
    private readonly offsetOf: OffsetProvider,
  ) {}

  offsetMinutes(ms: number): number {
    return this.offsetOf(this.zone, ms);
  }

  /** Wall-clock fields at an instant. */
  fields(ms: number) {
    const d = new Date(ms + this.offsetMinutes(ms) * 60000);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
  }

  /**
   * Instant for a wall-clock time. In a spring-forward gap the later offset is used;
   * in a fall-back overlap the earlier instant is returned.
   */
  instant(year: number, month: number, day: number, hour = 0, minute = 0): number {
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const a = naive - this.offsetMinutes(naive - 14 * 3600000) * 60000;
    const b = naive - this.offsetMinutes(naive + 14 * 3600000) * 60000;
    const ok = (ms: number) => ms + this.offsetMinutes(ms) * 60000 === naive;
    if (ok(a) && ok(b)) return Math.min(a, b);
    if (ok(a)) return a;
    if (ok(b)) return b;
    return naive - this.offsetMinutes(naive) * 60000;
  }

  /** Start of the local day containing ms. */
  startOfDay(ms: number): number {
    const f = this.fields(ms);
    return this.instant(f.year, f.month, f.day);
  }

  /** Start of the next local day after the one containing ms. */
  endOfDay(ms: number): number {
    const f = this.fields(ms);
    const next = new Date(Date.UTC(f.year, f.month - 1, f.day + 1));
    return this.instant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
}
