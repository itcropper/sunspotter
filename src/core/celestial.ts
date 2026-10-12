// CelestialBody: position at a time and place, events for a day, path for a day.
// The overlay only consumes this interface, so the moon can be added later.
import {
  ALT_BLUE_LOW,
  ALT_GOLDEN_HIGH,
  ALT_GOLDEN_LOW,
  ALT_RISE_SET,
  BISECT_PRECISION_MS,
  PATH_SAMPLE_MS,
} from './constants';
import { apparentAltitude, solarPosition } from './sun';
import { NO_TERRAIN, TerrainProvider } from './terrain';
import type { LocalZone } from './timezone';

export type Place = { latitude: number; longitude: number };

export type BodyPosition = {
  azimuth: number;
  /** Geometric altitude: classifies golden/blue/rise/set. */
  altitude: number;
  /** Apparent altitude (with refraction): what the camera sees, used for drawing. */
  apparent: number;
};

export type Band = 'day' | 'golden' | 'blue' | 'night';

export type BodyEvent =
  | { kind: 'cross'; threshold: number; rising: boolean; t: number; azimuth: number }
  | { kind: 'noon'; t: number; azimuth: number; altitude: number }
  | { kind: 'midnight'; t: number };

export type PathSample = BodyPosition & {
  t: number;
  /** Unit direction in world ENU (x east, y north, z up), from apparent altitude. */
  x: number;
  y: number;
  z: number;
};

/** A run of consecutive samples drawn with one style. */
export type PathSegment = {
  band: Band;
  /** Sun visible from here (upper limb above the horizon/terrain). Solid if true, dashed if false. */
  visible: boolean;
  pm: boolean;
  /** Inclusive sample index range. */
  from: number;
  to: number;
};

export type HourMark = PathSample & { hour: number };

export type DayPath = {
  start: number;
  end: number;
  samples: PathSample[];
  segments: PathSegment[];
  hours: HourMark[];
  events: BodyEvent[];
};

export interface CelestialBody {
  readonly id: string;
  position(ms: number, place: Place): BodyPosition;
  events(zone: LocalZone, dayStart: number, place: Place): BodyEvent[];
  path(zone: LocalZone, dayStart: number, place: Place, terrain?: TerrainProvider): DayPath;
}

const RAD = Math.PI / 180;

export function direction(azimuth: number, altitude: number) {
  const ca = Math.cos(altitude * RAD);
  return { x: Math.sin(azimuth * RAD) * ca, y: Math.cos(azimuth * RAD) * ca, z: Math.sin(altitude * RAD) };
}

export function bandOf(altitude: number): Band {
  if (altitude >= ALT_GOLDEN_HIGH) return 'day';
  if (altitude >= ALT_GOLDEN_LOW) return 'golden';
  if (altitude >= ALT_BLUE_LOW) return 'blue';
  return 'night';
}

export const THRESHOLDS = [ALT_GOLDEN_HIGH, ALT_RISE_SET, ALT_GOLDEN_LOW, ALT_BLUE_LOW] as const;

function bisect(f: (t: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  while (hi - lo > BISECT_PRECISION_MS / 4) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (flo * fm <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return Math.round((lo + hi) / 2);
}

export class SunBody implements CelestialBody {
  readonly id = 'sun';

  position(ms: number, place: Place): BodyPosition {
    const p = solarPosition(ms, place.latitude, place.longitude);
    return { azimuth: p.azimuth, altitude: p.altitude, apparent: apparentAltitude(p.altitude) };
  }

  private hourAngle(ms: number, place: Place) {
    return solarPosition(ms, place.latitude, place.longitude).hourAngle;
  }

  events(zone: LocalZone, dayStart: number, place: Place): BodyEvent[] {
    const end = zone.endOfDay(dayStart);
    const out: BodyEvent[] = [{ kind: 'midnight', t: dayStart }];
    const alt = (t: number) => this.position(t, place).altitude;
    let t0 = dayStart;
    let a0 = alt(t0);
    let h0 = this.hourAngle(t0, place);
    while (t0 < end) {
      const t1 = Math.min(t0 + PATH_SAMPLE_MS, end);
      const a1 = alt(t1);
      const h1 = this.hourAngle(t1, place);
      for (const th of THRESHOLDS) {
        if ((a0 - th) * (a1 - th) < 0 || (a1 === th && a0 !== th)) {
          const t = bisect((x) => alt(x) - th, t0, t1);
          out.push({ kind: 'cross', threshold: th, rising: a1 > a0, t, azimuth: this.position(t, place).azimuth });
        }
      }
      // Solar noon: hour angle crosses 0 going up (it wraps from +180 to −180 at solar midnight).
      if (h0 < 0 && h1 >= 0) {
        const t = bisect((x) => this.hourAngle(x, place), t0, t1);
        const p = this.position(t, place);
        out.push({ kind: 'noon', t, azimuth: p.azimuth, altitude: p.altitude });
      }
      t0 = t1;
      a0 = a1;
      h0 = h1;
    }
    return out.sort((a, b) => a.t - b.t);
  }

  path(zone: LocalZone, dayStart: number, place: Place, terrain: TerrainProvider = NO_TERRAIN): DayPath {
    const end = zone.endOfDay(dayStart);
    const events = this.events(zone, dayStart, place);
    const f = zone.fields(dayStart);

    const times = new Set<number>();
    for (let t = dayStart; t < end; t += PATH_SAMPLE_MS) times.add(t);
    times.add(end);
    for (const e of events) if (e.kind === 'cross') times.add(e.t);
    // AM/PM switch at local 12:00 (the path's colour changes at the 12 tick).
    const noonClock = zone.instant(f.year, f.month, f.day, 12, 0);
    if (noonClock > dayStart && noonClock < end) times.add(noonClock);

    const sample = (t: number): PathSample => {
      const p = this.position(t, place);
      return { t, ...p, ...direction(p.azimuth, p.apparent) };
    };
    const samples = [...times].sort((a, b) => a - b).map(sample);

    const segments: PathSegment[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const mid = (samples[i].t + samples[i + 1].t) / 2;
      const p = this.position(mid, place);
      const band = bandOf(p.altitude);
      const visible = terrain.isVisible(p.azimuth, p.apparent, p.altitude);
      const pm = mid >= noonClock;
      const last = segments[segments.length - 1];
      if (last && last.band === band && last.visible === visible && last.pm === pm && last.to === i) {
        last.to = i + 1;
      } else {
        segments.push({ band, visible, pm, from: i, to: i + 1 });
      }
    }

    const hours: HourMark[] = [];
    for (let h = 0; h < 24; h++) {
      const t = zone.instant(f.year, f.month, f.day, h, 0);
      if (t >= dayStart && t < end && zone.fields(t).hour === h) hours.push({ ...sample(t), hour: h });
    }
    return { start: dayStart, end, samples, segments, hours, events };
  }
}

export const SUN = new SunBody();
