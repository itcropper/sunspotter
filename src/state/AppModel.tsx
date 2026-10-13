// App state: settings, location and zone, selection (live vs pinned), the day's path, calibration,
// compass reliability, zoom, hint, and haptics policy. Per-frame values live in shared values so
// the overlay re-projects on the UI thread.
import { getCalendars, getLocales } from 'expo-localization';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

import { activeCalibration, distanceM, type StoredCalibration } from '../core/calibration';
import { type BodyEvent, type DayPath, direction, type Place, SUN } from '../core/celestial';
import {
  ALT_BLUE_LOW,
  ALT_GOLDEN_HIGH,
  ALT_GOLDEN_LOW,
  ALT_RISE_SET,
  COMPASS_BAD_HOLD_MS,
  PATH_RECOMPUTE_DISTANCE_M,
} from '../core/constants';
import type { DateFormat, TimeFormat } from '../core/format';
import { crossedEvents, HapticGate } from '../core/haptics';
import { type Calibration, type Quat, ZERO_CALIBRATION } from '../core/projection';
import { LIVE, onForeground, pin, type Selection, selectedInstant } from '../core/selection';
import { NO_TERRAIN } from '../core/terrain';
import { LocalZone, zoneForLocation } from '../core/timezone';
import type { HapticKind, PlatformServices } from '../native/platform';
import { EMPTY_PATH, type PathModel, STYLE_KEYS, type StyleKey } from '../ui/overlayModel';

export type Settings = {
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  dialSide: 'left' | 'right';
  haptics: boolean;
};

function defaultSettings(): Settings {
  let uses24 = false;
  let region = 'US';
  try {
    uses24 = !!getCalendars()[0]?.uses24hourClock;
    region = getLocales()[0]?.regionCode ?? 'US';
  } catch {}
  const ymd = ['CN', 'JP', 'KR', 'TW', 'HU', 'LT', 'MN', 'SE', 'CA'];
  const mdy = ['US', 'PH', 'FM', 'MH', 'PW'];
  return {
    timeFormat: uses24 ? '24' : '12',
    dateFormat: mdy.includes(region) ? 'mdy' : ymd.includes(region) ? 'ymd' : 'dmy',
    dialSide: 'right',
    haptics: true,
  };
}

function load<T>(p: PlatformServices, key: string): T | null {
  try {
    const v = p.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function save(p: PlatformServices, key: string, v: unknown) {
  try {
    p.setItem(key, v === null ? null : JSON.stringify(v));
  } catch {}
}

export type DayInfo = {
  path: DayPath;
  model: PathModel;
  rise: number | null;
  set: number | null;
  riseAz: number | null;
  setAz: number | null;
  goldenSpans: [number, number][];
  blueSpans: [number, number][];
  eventTimes: number[];
  /** Style index (into STYLE_KEYS) of the path at each hour mark. */
  hourStyles: number[];
};

const styleIndex = (k: StyleKey) => STYLE_KEYS.indexOf(k);

function bandSpans(events: BodyEvent[], start: number, end: number, hi: number, lo: number, altAtStart: number) {
  // Spans where lo ≤ altitude < hi, from threshold crossings.
  const marks = events
    .filter((e) => e.kind === 'cross' && (e.threshold === hi || e.threshold === lo))
    .map((e) => e.t)
    .sort((a, b) => a - b);
  const spans: [number, number][] = [];
  let inside = altAtStart < hi && altAtStart >= lo;
  let from = start;
  for (const t of marks) {
    if (inside) spans.push([from, t]);
    else from = t;
    inside = !inside;
  }
  if (inside) spans.push([from, end]);
  return spans;
}

function buildDay(zone: LocalZone, dayStart: number, place: Place): DayInfo {
  const path = SUN.path(zone, dayStart, place, NO_TERRAIN);
  const xyz: number[] = [];
  for (const s of path.samples) xyz.push(s.x, s.y, s.z);
  const runs: number[] = [];
  for (const seg of path.segments) {
    let key: StyleKey;
    if (seg.band === 'night') key = seg.pm ? 'nightPm' : 'nightAm';
    else if (seg.band === 'blue') key = 'blue';
    else if (seg.band === 'golden') key = seg.visible ? 'golden' : 'goldenHidden';
    else key = seg.visible ? (seg.pm ? 'dayPm' : 'dayAm') : 'dayHidden';
    runs.push(seg.from, seg.to, styleIndex(key));
  }
  const hourXyz: number[] = [];
  const hours: number[] = [];
  for (const h of path.hours) {
    hourXyz.push(h.x, h.y, h.z);
    hours.push(h.hour);
  }
  const crosses = path.events.filter((e) => e.kind === 'cross');
  const riseE = crosses.find((e) => e.kind === 'cross' && e.threshold === ALT_RISE_SET && e.rising);
  const setE = [...crosses].reverse().find((e) => e.kind === 'cross' && e.threshold === ALT_RISE_SET && !e.rising);
  const at = (e: BodyEvent | undefined) => {
    if (!e || e.kind !== 'cross') return [];
    const d = direction(e.azimuth, 0);
    return [d.x, d.y, d.z];
  };
  const alt0 = path.samples[0]?.altitude ?? 0;
  return {
    path,
    model: { xyz, runs, hourXyz, hours, rise: at(riseE), set: at(setE) },
    rise: riseE?.t ?? null,
    set: setE?.t ?? null,
    riseAz: riseE && riseE.kind === 'cross' ? riseE.azimuth : null,
    setAz: setE && setE.kind === 'cross' ? setE.azimuth : null,
    goldenSpans: bandSpans(path.events, path.start, path.end, ALT_GOLDEN_HIGH, ALT_GOLDEN_LOW, alt0),
    blueSpans: bandSpans(path.events, path.start, path.end, ALT_GOLDEN_LOW, ALT_BLUE_LOW, alt0),
    eventTimes: path.events.map((e) => e.t),
    hourStyles: path.hours.map((h) => {
      const i = path.segments.findIndex((sg) => path.samples[sg.from].t <= h.t && h.t < path.samples[sg.to].t);
      return i < 0 ? styleIndex('dayAm') : runs[i * 3 + 2];
    }),
  };
}

export type Shared = {
  attitude: SharedValue<Quat>;
  calibration: SharedValue<Calibration>;
  rotation: SharedValue<number>;
  path: SharedValue<PathModel>;
  sun: SharedValue<{ x: number; y: number; z: number; altitude: number; azimuth: number }>;
  riseSetAlt: SharedValue<[number, number]>;
};

export type AppModel = {
  platform: PlatformServices;
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  place: Place | null;
  zone: LocalZone;
  now: number;
  selection: Selection;
  selected: number;
  setSelected: (t: number) => void;
  backToNow: () => void;
  day: DayInfo | null;
  sunPos: { azimuth: number; altitude: number; apparent: number };
  calibration: Calibration;
  calibrationRaw: StoredCalibration | null;
  saveCalibration: (c: Calibration) => void;
  clearCalibration: () => void;
  compassBad: boolean;
  zoomWide: boolean;
  setZoomWide: (w: boolean) => void;
  hintShown: boolean;
  markHintShown: () => void;
  screenReader: boolean;
  reduceMotion: boolean;
  haptic: (kind: HapticKind) => void;
  hapticGate: HapticGate;
  shared: Shared;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;
  firstFix: boolean;
};

const Ctx = createContext<AppModel | null>(null);

export function useApp(): AppModel {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppModel missing');
  return v;
}

const shared: Shared = {
  attitude: makeMutable<Quat>([0, 0, 0, 1]),
  calibration: makeMutable<Calibration>(ZERO_CALIBRATION),
  rotation: makeMutable(0),
  path: makeMutable<PathModel>(EMPTY_PATH),
  sun: makeMutable({ x: 0, y: 1, z: 0, altitude: 0, azimuth: 0 }),
  riseSetAlt: makeMutable<[number, number]>([0, 0]),
};

export function AppModelProvider({ platform, children }: { platform: PlatformServices; children: ReactNode }) {
  const init = platform.simInitial;
  const [settings, setSettingsState] = useState<Settings>(() => ({
    ...defaultSettings(),
    ...(load<Settings>(platform, 'settings') ?? {}),
    ...(init?.dialSide ? { dialSide: init.dialSide } : {}),
  }));
  const setSettings = useCallback(
    (s: Partial<Settings>) =>
      setSettingsState((prev) => {
        const next = { ...prev, ...s };
        save(platform, 'settings', next);
        return next;
      }),
    [platform],
  );

  // Location: draw immediately from the last known fix (persisted or OS), refine on GPS.
  const [place, setPlace] = useState<Place | null>(() => {
    const os = platform.lastKnownLocation();
    const stored = load<Place>(platform, 'lastLocation');
    const p = os ?? stored;
    return p ? { latitude: p.latitude, longitude: p.longitude } : null;
  });
  const [firstFix, setFirstFix] = useState(place !== null);
  useEffect(
    () =>
      platform.subscribeLocation((e) => {
        setFirstFix(true);
        setPlace((prev) => {
          if (prev && distanceM(prev.latitude, prev.longitude, e.latitude, e.longitude) < PATH_RECOMPUTE_DISTANCE_M) return prev;
          const p = { latitude: e.latitude, longitude: e.longitude };
          save(platform, 'lastLocation', p);
          return p;
        });
      }),
    [platform],
  );

  const zone = useMemo(() => {
    const name = place ? zoneForLocation(place.latitude, place.longitude) : 'UTC';
    return LocalZone(name, (z, ms) => platform.tzOffsetMinutes(z, ms));
  }, [place, platform]);

  // Clock.
  const [now, setNow] = useState(() => platform.now());
  useEffect(() => {
    const id = setInterval(() => setNow(platform.now()), 1000);
    return () => clearInterval(id);
  }, [platform]);

  const [selection, setSelection] = useState<Selection>(() => (init?.pinned ? pin(init.pinned) : LIVE));
  const selected = selectedInstant(selection, now);
  const hapticGate = useRef(HapticGate(settings.haptics)).current;
  useEffect(() => hapticGate.setEnabled(settings.haptics), [settings.haptics, hapticGate]);
  const haptic = useCallback(
    (kind: HapticKind) => {
      if (!settings.haptics) return;
      platform.haptic(kind);
    },
    [platform, settings.haptics],
  );

  // Day path: recomputed only when the local date or the location changes.
  const dayStart = zone.startOfDay(selected);
  const day = useMemo(() => (place ? buildDay(zone, dayStart, place) : null), [zone, dayStart, place]);
  useEffect(() => {
    shared.path.value = day ? day.model : EMPTY_PATH;
    if (day && place) {
      const a = (t: number | null) => (t === null ? 0 : SUN.position(t, place).apparent);
      shared.riseSetAlt.value = [a(day.rise), a(day.set)];
    }
  }, [day, place]);

  const lastSelected = useRef(selected);
  const setSelected = useCallback(
    (t: number) => {
      const prev = lastSelected.current;
      lastSelected.current = t;
      // Medium bump on crossing a sun event (golden/blue boundaries, rise/set, noon, midnight).
      if (day && crossedEvents(day.eventTimes, prev, t).length > 0 && hapticGate.medium()) platform.haptic('medium');
      setSelection(pin(t));
    },
    [day, hapticGate, platform],
  );
  const backToNow = useCallback(() => {
    lastSelected.current = platform.now();
    setSelection(LIVE);
    if (hapticGate.success()) platform.haptic('success');
  }, [hapticGate, platform]);

  // Sun at the selected instant.
  const sunPos = useMemo(
    () => (place ? SUN.position(selected, place) : { azimuth: 0, altitude: -90, apparent: -90 }),
    [place, selected],
  );
  useEffect(() => {
    const d = direction(sunPos.azimuth, sunPos.apparent);
    shared.sun.value = { ...d, altitude: sunPos.apparent, azimuth: sunPos.azimuth };
  }, [sunPos]);

  // Calibration persistence (1 km / 12 h).
  const [calibrationRaw, setCalibrationRaw] = useState<StoredCalibration | null>(() => {
    if (init?.calibration && place) return { ...init.calibration, savedAt: platform.now(), ...place };
    return load<StoredCalibration>(platform, 'calibration');
  });
  const calibration = useMemo(() => activeCalibration(calibrationRaw, now, place), [calibrationRaw, now, place]);
  useEffect(() => {
    shared.calibration.value = calibration;
  }, [calibration]);
  const saveCalibration = useCallback(
    (c: Calibration) => {
      if (!place) return;
      const stored = { ...c, savedAt: platform.now(), ...place };
      setCalibrationRaw(stored);
      save(platform, 'calibration', stored);
    },
    [place, platform],
  );
  const clearCalibration = useCallback(() => {
    setCalibrationRaw(null);
    save(platform, 'calibration', null);
  }, [platform]);

  // Attitude stream → UI thread; compass reliability with a 1 s hold.
  const [compassBad, setCompassBad] = useState(false);
  const badSince = useRef<number | null>(null);
  useEffect(() => {
    return platform.subscribeAttitude((e) => {
      shared.attitude.value = e.q;
      if (!e.headingReliable) {
        if (badSince.current === null) badSince.current = e.t;
        else if (e.t - badSince.current > COMPASS_BAD_HOLD_MS) setCompassBad(true);
      } else {
        badSince.current = null;
        setCompassBad(false);
      }
    });
  }, [platform]);
  const wasBad = useRef(false);
  useEffect(() => {
    if (compassBad && !wasBad.current && hapticGate.warning()) platform.haptic('warning');
    if (!compassBad && wasBad.current && hapticGate.recover()) platform.haptic('success');
    wasBad.current = compassBad;
  }, [compassBad, hapticGate, platform]);

  // Display rotation (all four orientations; the overlay uses the true camera attitude).
  useEffect(() => {
    const update = () => {
      shared.rotation.value = platform.displayRotation();
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [platform]);

  // Background: back to now after 15 min away.
  const bgAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') bgAt.current = Date.now();
      if (s === 'active' && bgAt.current !== null) {
        const away = Date.now() - bgAt.current;
        bgAt.current = null;
        setSelection((sel) => onForeground(sel, away));
      }
    });
    return () => sub.remove();
  }, []);

  const [zoomWide, setZoomWide] = useState(!!init?.wide);
  const [hintShown, setHintShown] = useState(() => load<boolean>(platform, 'hintShown') === true || platform.simulated);
  const markHintShown = useCallback(() => {
    setHintShown(true);
    save(platform, 'hintShown', true);
  }, [platform]);

  const [screenReader, setScreenReader] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const a = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const b = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(!!init?.settings);

  const value: AppModel = {
    platform,
    settings,
    setSettings,
    place,
    zone,
    now,
    selection,
    selected,
    setSelected,
    backToNow,
    day,
    sunPos,
    calibration,
    calibrationRaw,
    saveCalibration,
    clearCalibration,
    compassBad,
    zoomWide,
    setZoomWide,
    hintShown,
    markHintShown,
    screenReader,
    reduceMotion,
    haptic,
    hapticGate,
    shared,
    settingsOpen,
    setSettingsOpen,
    firstFix,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
