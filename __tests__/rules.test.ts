import { a11yLabelsForAllElements } from './helpers/a11yInventory';
import { activeCalibration, calibrationMagnitude, canCalibrate } from '../src/core/calibration';
import { HapticGate, crossedEvents } from '../src/core/haptics';
import {
  inBand,
  offsetSwipeClears,
  scrubLock,
  scrubMayStart,
  scrubMinutes,
  sheetDismisses,
  zoomAfterPinch,
} from '../src/core/gestures';
import {
  LIVE,
  addMinutes,
  backToNow,
  daysOffered,
  onForeground,
  pin,
  selectedInstant,
  stepDay,
  stepMonth,
} from '../src/core/selection';
import { LocalZone, intlOffsetProvider, zoneForLocation } from '../src/core/timezone';
import { MOCK_NOW_MS } from '../src/core/constants';

const LA = new LocalZone('America/Los_Angeles', intlOffsetProvider);

describe('offline time zone lookup', () => {
  it.each([
    [42.1946, -122.7095, 'America/Los_Angeles'],
    [69.6492, 18.9553, 'Europe/Oslo'],
    [64.1466, -21.9426, 'Atlantic/Reykjavik'],
    [-33.8688, 151.2093, 'Australia/Sydney'],
    [-0.1807, -78.4678, 'America/Guayaquil'],
    [33.4484, -112.074, 'America/Phoenix'],
    [51.5074, -0.1278, 'Europe/London'],
    [35.6762, 139.6503, 'Asia/Tokyo'],
  ])('(%f, %f) → %s', (lat, lon, zone) => {
    expect(zoneForLocation(lat, lon)).toBe(zone);
  });
  it('offset comes from the zone database for the selected date (DST differs)', () => {
    expect(LA.offsetMinutes(Date.UTC(2026, 9, 12, 12))).toBe(-420);
    expect(LA.offsetMinutes(Date.UTC(2026, 11, 21, 12))).toBe(-480);
    const phx = new LocalZone('America/Phoenix', intlOffsetProvider);
    expect(phx.offsetMinutes(Date.UTC(2026, 6, 1))).toBe(-420);
    expect(phx.offsetMinutes(Date.UTC(2026, 0, 1))).toBe(-420);
  });
  it('wall-clock instants survive DST gaps and overlaps', () => {
    expect(LA.instant(2026, 3, 8, 2, 30)).toBe(Date.UTC(2026, 2, 8, 10, 30)); // gap → PDT
    expect(LA.instant(2026, 11, 1, 1, 30)).toBe(Date.UTC(2026, 10, 1, 8, 30)); // overlap → first
  });
});

describe('live vs pinned', () => {
  const now = MOCK_NOW_MS;
  it('live follows the clock; any change pins', () => {
    expect(selectedInstant(LIVE, now)).toBe(now);
    expect(selectedInstant(LIVE, now + 60000)).toBe(now + 60000);
    const p = pin(now + 3600000);
    expect(selectedInstant(p, now + 60000)).toBe(now + 3600000);
  });
  it('back to now returns to live', () => {
    expect(backToNow()).toEqual(LIVE);
  });
  it('reopens at now after more than 15 min in the background', () => {
    const p = pin(now + 1);
    expect(onForeground(p, 15 * 60000)).toBe(p);
    expect(onForeground(p, 15 * 60000 + 1)).toEqual(LIVE);
  });
});

describe('date rules (year = next occurrence, ring wraps)', () => {
  const now = MOCK_NOW_MS; // Oct 12 2026, 5:42 PM PDT
  it('time carries into the day at midnight', () => {
    const t = LA.instant(2026, 10, 12, 23, 59);
    const f = LA.fields(addMinutes(t, 1, now, LA));
    expect([f.year, f.month, f.day, f.hour, f.minute]).toEqual([2026, 10, 13, 0, 0]);
  });
  it('scrubbing back past today moves the date to its next occurrence', () => {
    const t = LA.instant(2026, 10, 12, 0, 5);
    const f = LA.fields(addMinutes(t, -10, now, LA));
    expect([f.year, f.month, f.day, f.hour, f.minute]).toEqual([2027, 10, 11, 23, 55]);
  });
  it('day ring wraps within the month and does not carry into the month', () => {
    const t = LA.instant(2026, 10, 31, 17, 42);
    const f = LA.fields(stepDay(t, 1, now, LA));
    expect([f.month, f.day]).toEqual([10, 1]);
    expect(f.year).toBe(2027); // Oct 1 is before today → next year
  });
  it('month ring wraps 12 → 1 and picks the next occurrence', () => {
    const t = LA.instant(2026, 12, 21, 16, 0);
    const f = LA.fields(stepMonth(t, 1, now, LA));
    expect([f.year, f.month, f.day]).toEqual([2027, 1, 21]);
  });
  it('Feb 29 is offered only when that next February has one', () => {
    expect(daysOffered(2, { year: 2026, month: 10, day: 12 })).toBe(28); // Feb 2027
    expect(daysOffered(2, { year: 2027, month: 10, day: 12 })).toBe(29); // Feb 2028
  });
  it('month change clamps the day to the new month', () => {
    const t = LA.instant(2026, 10, 31, 12, 0);
    const f = LA.fields(stepMonth(t, 1, now, LA));
    expect([f.month, f.day]).toEqual([11, 30]);
  });
});

describe('calibration persistence', () => {
  const stored = { dAz: 2, dAlt: -0.5, refAz: 250, savedAt: 0, latitude: 42.1946, longitude: -122.7095 };
  const here = { latitude: 42.1946, longitude: -122.7095 };
  it('persists until 12 h pass', () => {
    expect(activeCalibration(stored, 12 * 3600000, here).dAz).toBe(2);
    expect(activeCalibration(stored, 12 * 3600000 + 1, here).dAz).toBe(0);
  });
  it('clears when the device moves more than 1 km', () => {
    expect(activeCalibration(stored, 1000, { latitude: 42.2026, longitude: -122.7095 }).dAz).toBe(2); // ~890 m
    expect(activeCalibration(stored, 1000, { latitude: 42.2046, longitude: -122.7095 }).dAz).toBe(0); // ~1.11 km
  });
  it('magnitude is √(Δaz² + Δalt²)', () => {
    expect(calibrationMagnitude({ dAz: 2, dAlt: 0.6, refAz: 0 })).toBeCloseTo(2.088, 3);
  });
  it('only while live and with a good compass', () => {
    expect(canCalibrate(true, false)).toBe(true);
    expect(canCalibrate(false, false)).toBe(false);
    expect(canCalibrate(true, true)).toBe(false);
  });
});

describe('haptic rate limits and re-arm', () => {
  it('light ticks are capped at 30 per second', () => {
    const g = new HapticGate();
    let fired = 0;
    for (let i = 0; i < 100; i++) if (g.light(i * 5)) fired++; // 100 ticks in 0.5 s
    expect(fired).toBe(30);
    expect(g.light(1000)).toBe(true); // window slides
  });
  it('center bump fires on entry, at most once per 3 s, and re-arms after leaving', () => {
    const g = new HapticGate();
    expect(g.center(0, true)).toBe(true);
    expect(g.center(100, true)).toBe(false); // still inside: no re-fire
    expect(g.center(200, false)).toBe(false);
    expect(g.center(300, true)).toBe(false); // re-entered too soon
    expect(g.center(3400, false)).toBe(false);
    expect(g.center(3500, true)).toBe(true);
  });
  it('compass warning fires once per episode; recovery gives success and re-arms', () => {
    const g = new HapticGate();
    expect(g.warning()).toBe(true);
    expect(g.warning()).toBe(false);
    expect(g.recover()).toBe(true);
    expect(g.recover()).toBe(false);
    expect(g.warning()).toBe(true);
  });
  it('everything is silent when haptics are off', () => {
    const g = new HapticGate(false);
    expect(g.light(0)).toBe(false);
    expect(g.medium()).toBe(false);
    expect(g.success()).toBe(false);
    expect(g.center(0, true)).toBe(false);
    expect(g.warning()).toBe(false);
  });
  it('event crossings are detected in both scrub directions', () => {
    expect(crossedEvents([10, 20, 30], 5, 25)).toEqual([10, 20]);
    expect(crossedEvents([10, 20, 30], 25, 5)).toEqual([10, 20]);
    expect(crossedEvents([10, 20, 30], 20, 25)).toEqual([]);
  });
});

describe('gesture thresholds', () => {
  it('scrub locks horizontal after 10 pt within ±30°', () => {
    expect(scrubLock(9, 0)).toBe('pending');
    expect(scrubLock(10, 0)).toBe('horizontal');
    expect(scrubLock(10, 5.7)).toBe('horizontal'); // 29.7°
    expect(scrubLock(10, 6)).toBe('rejected'); // 31°
    expect(scrubLock(0, -12)).toBe('rejected');
  });
  it('2.2 pt per minute, right = later', () => {
    expect(scrubMinutes(390)).toBe(177);
    expect(scrubMinutes(-22)).toBe(-10);
  });
  it('dead zones: 24 pt edges and bottom 34 pt', () => {
    expect(scrubMayStart(23, 400, 390, 844)).toBe(false);
    expect(scrubMayStart(25, 400, 390, 844)).toBe(true);
    expect(scrubMayStart(370, 400, 390, 844)).toBe(false);
    expect(scrubMayStart(200, 811, 390, 844)).toBe(false);
    expect(scrubMayStart(200, 400, 390, 844, [() => true])).toBe(false);
  });
  it('pinch switches at 0.8 and 1.25 only', () => {
    expect(zoomAfterPinch('normal', 0.81)).toBe('normal');
    expect(zoomAfterPinch('normal', 0.79)).toBe('wide');
    expect(zoomAfterPinch('wide', 1.24)).toBe('wide');
    expect(zoomAfterPinch('wide', 1.26)).toBe('normal');
  });
  it('offset swipe clears past 50% or on a fling', () => {
    expect(offsetSwipeClears(-49, 100, 0)).toBe(false);
    expect(offsetSwipeClears(-51, 100, 0)).toBe(true);
    expect(offsetSwipeClears(-10, 100, -600)).toBe(true);
  });
  it('sheet dismisses past 30% or on a 500 pt/s fling', () => {
    expect(sheetDismisses(29, 100, 0)).toBe(false);
    expect(sheetDismisses(31, 100, 0)).toBe(true);
    expect(sheetDismisses(5, 100, 501)).toBe(true);
  });
  it('dial ring bands', () => {
    expect(inBand(390 - 246 * Math.SQRT1_2, 844 - 246 * Math.SQRT1_2, 390, 844, 220, 272)).toBe(true);
    expect(inBand(390 - 218 * Math.SQRT1_2, 844 - 218 * Math.SQRT1_2, 390, 844, 220, 272)).toBe(false);
  });
});

describe('accessibility inventory', () => {
  it('every Spec-A11y element has a label in the app', () => {
    for (const [element, label] of a11yLabelsForAllElements()) {
      expect([element, typeof label === 'string' && label.length > 0]).toEqual([element, true]);
    }
  });
});
