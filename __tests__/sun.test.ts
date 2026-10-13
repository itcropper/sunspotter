// Sun position and event times.
// Reference values: NOAA Solar Calculator (gml.noaa.gov/grad/solcalc, main.js run on 2026-10-12;
// see DECISIONS.md). Tolerances: event times ±60 s, azimuth/altitude ±0.05°.
// The design's Spec-Math table is also checked at its own display precision (nearest minute).
import { SUN, type BodyEvent, type Place } from '../src/core/celestial';
import { ALT_BLUE_LOW, ALT_GOLDEN_HIGH, ALT_GOLDEN_LOW, ALT_RISE_SET } from '../src/core/constants';
import { formatTime } from '../src/core/format';
import { apparentAltitude } from '../src/core/sun';
import { LocalZone, intlOffsetProvider, zoneForLocation } from '../src/core/timezone';

const EVENT_TOL_MS = 60_000;
const DEG_TOL = 0.05;

const ASHLAND: Place = { latitude: 42.1946, longitude: -122.7095 };
const TROMSO: Place = { latitude: 69.6492, longitude: 18.9553 };
const REYKJAVIK: Place = { latitude: 64.1466, longitude: -21.9426 };
const SYDNEY: Place = { latitude: -33.8688, longitude: 151.2093 };
const QUITO: Place = { latitude: -0.1807, longitude: -78.4678 };

function zoneAt(p: Place) {
  return LocalZone(zoneForLocation(p.latitude, p.longitude), intlOffsetProvider);
}

function dayEvents(p: Place, y: number, m: number, d: number) {
  const zone = zoneAt(p);
  return { zone, events: SUN.events(zone, zone.instant(y, m, d), p) };
}

function cross(events: BodyEvent[], threshold: number, rising: boolean) {
  return events
    .filter((e) => e.kind === 'cross' && e.threshold === threshold && e.rising === rising)
    .map((e) => e.t);
}

function noon(events: BodyEvent[]) {
  const e = events.find((x) => x.kind === 'noon');
  if (!e || e.kind !== 'noon') throw new Error('no noon');
  return e;
}

const iso = (s: string) => Date.parse(s);
const near = (a: number | undefined, b: number) => {
  expect(a).toBeDefined();
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(EVENT_TOL_MS);
};

describe('NOAA reference: Ashland OR, 2026-10-12 (PDT) — design test case', () => {
  const { zone, events } = dayEvents(ASHLAND, 2026, 10, 12);
  it('uses the zone where the user stands', () => expect(zone.zone).toBe('America/Los_Angeles'));
  it('sunrise, sunset, noon', () => {
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-10-12T14:20:18Z'));
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-10-13T01:33:30Z'));
    near(noon(events).t, iso('2026-10-12T19:57:21Z'));
    expect(noon(events).altitude).toBeCloseTo(40.17, 1);
  });
  it('golden and blue boundaries', () => {
    near(cross(events, ALT_GOLDEN_HIGH, false)[0], iso('2026-10-13T00:55:40Z'));
    near(cross(events, ALT_GOLDEN_LOW, false)[0], iso('2026-10-13T01:50:45Z'));
    near(cross(events, ALT_BLUE_LOW, false)[0], iso('2026-10-13T02:01:36Z'));
  });
  it('position at 5:42 PM', () => {
    const p = SUN.position(iso('2026-10-13T00:42:00Z'), ASHLAND);
    expect(Math.abs(p.azimuth - 251.5065)).toBeLessThan(DEG_TOL);
    expect(Math.abs(p.altitude - 8.4217)).toBeLessThan(DEG_TOL);
    expect(Math.abs(p.apparent - 8.525)).toBeLessThan(DEG_TOL);
  });
  it('matches the design table at display precision', () => {
    const t = (ms: number) => formatTime(ms, zone, '12');
    expect(t(cross(events, ALT_RISE_SET, true)[0])).toBe('7:20');
    expect(t(noon(events).t)).toBe('12:57');
    expect(t(cross(events, ALT_GOLDEN_HIGH, false)[0])).toBe('5:56');
    expect(t(cross(events, ALT_RISE_SET, false)[0])).toBe('6:33');
    expect(t(cross(events, ALT_GOLDEN_LOW, false)[0])).toBe('6:51');
    expect(t(cross(events, ALT_BLUE_LOW, false)[0])).toBe('7:02');
    const p = SUN.position(iso('2026-10-13T00:42:00Z'), ASHLAND);
    expect(p.azimuth.toFixed(1)).toBe('251.5');
    expect(p.altitude.toFixed(2)).toBe('8.42');
    expect(p.apparent.toFixed(2)).toBe('8.53');
  });
});

describe('NOAA reference: Ashland OR, 2026-12-21 (PST) — design test case', () => {
  const { zone, events } = dayEvents(ASHLAND, 2026, 12, 21);
  it('events', () => {
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-12-21T15:36:15Z'));
    near(cross(events, ALT_GOLDEN_HIGH, false)[0], iso('2026-12-21T23:56:34Z'));
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-12-22T00:41:55Z'));
    near(cross(events, ALT_GOLDEN_LOW, false)[0], iso('2026-12-22T01:01:39Z'));
    near(cross(events, ALT_BLUE_LOW, false)[0], iso('2026-12-22T01:13:49Z'));
  });
  it('matches the design table at display precision', () => {
    const t = (ms: number) => formatTime(ms, zone, '12');
    expect(t(cross(events, ALT_RISE_SET, true)[0])).toBe('7:36');
    expect(t(cross(events, ALT_GOLDEN_HIGH, false)[0])).toBe('3:57');
    expect(t(cross(events, ALT_RISE_SET, false)[0])).toBe('4:42');
    expect(t(cross(events, ALT_GOLDEN_LOW, false)[0])).toBe('5:02');
    expect(t(cross(events, ALT_BLUE_LOW, false)[0])).toBe('5:14');
  });
});

describe('NOAA reference: Tromsø, 2026-06-21/22 (CEST) — design test case', () => {
  const zone = zoneAt(TROMSO);
  const day21 = SUN.events(zone, zone.instant(2026, 6, 21), TROMSO);
  const day22 = SUN.events(zone, zone.instant(2026, 6, 22), TROMSO);
  it('no sunset', () => {
    expect(cross(day21, ALT_RISE_SET, false)).toHaveLength(0);
    expect(cross(day21, ALT_RISE_SET, true)).toHaveLength(0);
  });
  it('lowest at 12:46 AM, alt 3.09°, az 360°', () => {
    let best = { t: 0, alt: 99, az: 0 };
    for (let t = iso('2026-06-21T22:00:00Z'); t < iso('2026-06-21T23:30:00Z'); t += 1000) {
      const p = SUN.position(t, TROMSO);
      if (p.altitude < best.alt) best = { t, alt: p.altitude, az: p.azimuth };
    }
    near(best.t, iso('2026-06-21T22:46:07Z'));
    expect(Math.abs(best.alt - 3.0861)).toBeLessThan(DEG_TOL);
    expect(Math.min(best.az, 360 - best.az)).toBeLessThan(0.1);
    expect(formatTime(best.t, zone, '12')).toBe('12:46');
  });
  it('golden hour from 10:35 PM to 2:57 AM', () => {
    near(cross(day21, ALT_GOLDEN_HIGH, false)[0], iso('2026-06-21T20:35:07Z'));
    near(cross(day22, ALT_GOLDEN_HIGH, true)[0], iso('2026-06-22T00:57:05Z'));
    expect(formatTime(cross(day21, ALT_GOLDEN_HIGH, false)[0], zone, '12')).toBe('10:35');
    expect(formatTime(cross(day22, ALT_GOLDEN_HIGH, true)[0], zone, '12')).toBe('2:57');
  });
});

describe('NOAA reference: extra locations', () => {
  it('Reykjavik, June 21 (sunset just after local midnight)', () => {
    const { events } = dayEvents(REYKJAVIK, 2026, 6, 21);
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-06-21T02:55:08Z'));
    // Sunset of June 20 falls at 00:03:50 on the 21st (local = UTC).
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-06-21T00:03:50Z'));
    expect(cross(events, ALT_BLUE_LOW, false)).toHaveLength(0);
    near(noon(events).t, iso('2026-06-21T13:29:30Z'));
  });
  it('Reykjavik, December 21', () => {
    const { events } = dayEvents(REYKJAVIK, 2026, 12, 21);
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-12-21T11:22:20Z'));
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-12-21T15:29:25Z'));
    expect(cross(events, ALT_GOLDEN_HIGH, true)).toHaveLength(0);
    near(cross(events, ALT_BLUE_LOW, true)[0], iso('2026-12-21T10:03:00Z'));
  });
  it('Sydney, January 15 (AEDT, southern summer)', () => {
    const { zone, events } = dayEvents(SYDNEY, 2026, 1, 15);
    expect(zone.zone).toBe('Australia/Sydney');
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-01-14T18:59:30Z'));
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-01-15T09:09:00Z'));
    near(noon(events).t, iso('2026-01-15T02:04:15Z'));
    // Southern hemisphere: the sun is north at noon.
    const n = noon(events);
    expect(Math.min(n.azimuth, 360 - n.azimuth)).toBeLessThan(1);
  });
  it('Quito, March 20 (equator, equinox)', () => {
    const { zone, events } = dayEvents(QUITO, 2026, 3, 20);
    expect(zone.zone).toBe('America/Guayaquil');
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-03-20T11:17:59Z'));
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-03-20T23:24:30Z'));
    near(noon(events).t, iso('2026-03-20T17:21:23Z'));
    expect(noon(events).altitude).toBeGreaterThan(89);
  });
});

describe('DST transitions (Ashland)', () => {
  it('2026-11-01, fall back: the local day is 25 h and times use PST', () => {
    const zone = zoneAt(ASHLAND);
    const start = zone.instant(2026, 11, 1);
    expect(zone.endOfDay(start) - start).toBe(25 * 3600000);
    const events = SUN.events(zone, start, ASHLAND);
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-11-01T14:44:04Z'));
    near(cross(events, ALT_RISE_SET, false)[0], iso('2026-11-02T01:04:07Z'));
    expect(formatTime(cross(events, ALT_RISE_SET, true)[0], zone, '12')).toBe('6:44');
    expect(formatTime(cross(events, ALT_RISE_SET, false)[0], zone, '24')).toBe('17:04');
  });
  it('2026-03-08, spring forward: the local day is 23 h and times use PDT', () => {
    const zone = zoneAt(ASHLAND);
    const start = zone.instant(2026, 3, 8);
    expect(zone.endOfDay(start) - start).toBe(23 * 3600000);
    const events = SUN.events(zone, start, ASHLAND);
    near(cross(events, ALT_RISE_SET, true)[0], iso('2026-03-08T14:34:15Z'));
    expect(formatTime(cross(events, ALT_RISE_SET, true)[0], zone, '12')).toBe('7:34');
    expect(formatTime(cross(events, ALT_RISE_SET, false)[0], zone, '24')).toBe('19:09');
  });
});

describe('refraction', () => {
  it('is continuous through −1° and zero below −4°', () => {
    const r = (h: number) => apparentAltitude(h) - h;
    expect(Math.abs(r(-1.0001) - r(-0.9999))).toBeLessThan(1e-3);
    expect(r(-4)).toBe(0);
    expect(r(-5)).toBe(0);
    expect(r(-2.5)).toBeCloseTo(r(-1) / 2, 6);
  });
});

describe('day path', () => {
  const zone = zoneAt(ASHLAND);
  const path = SUN.path(zone, zone.instant(2026, 10, 12), ASHLAND);
  it('samples every 2 min plus exact boundaries', () => {
    expect(path.samples.length).toBeGreaterThanOrEqual(721);
    for (let i = 1; i < path.samples.length; i++) {
      expect(path.samples[i].t - path.samples[i - 1].t).toBeLessThanOrEqual(120000);
    }
  });
  it('splits at golden start and the 12:00 AM/PM switch', () => {
    const goldenStart = cross(path.events, ALT_GOLDEN_HIGH, false)[0];
    expect(path.samples.some((s) => s.t === goldenStart)).toBe(true);
    const pmStart = path.segments.find((s) => s.pm)!;
    expect(formatTime(path.samples[pmStart.from].t, zone, '24')).toBe('12:00');
  });
  it('has 24 hour marks and classifies bands', () => {
    expect(path.hours).toHaveLength(24);
    const bands = new Set(path.segments.map((s) => s.band));
    expect([...bands].sort()).toEqual(['blue', 'day', 'golden', 'night']);
    expect(path.segments.find((s) => s.band === 'blue')!.visible).toBe(false);
  });
});
