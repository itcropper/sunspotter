// Accessibility labels (Spec-A11y). English source strings. 12-hour mode says AM/PM aloud.
// Terrain labels ("behind the ridge") exist for completeness but never fire in v1 (no terrain).
import type { TimeFormat } from './format';
import type { LocalZone } from './timezone';

const POINTS = [
  'north', 'north-northeast', 'northeast', 'east-northeast',
  'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest',
  'west', 'west-northwest', 'northwest', 'north-northwest',
];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function compassPoint(azimuth: number): string {
  const i = Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[i];
}

export function spokenTime(ms: number, zone: LocalZone, fmt: TimeFormat): string {
  const f = zone.fields(Math.round(ms / 60000) * 60000);
  const mm = String(f.minute).padStart(2, '0');
  if (fmt === '24') return `${f.hour}:${mm}`;
  return `${f.hour % 12 || 12}:${mm} ${f.hour < 12 ? 'AM' : 'PM'}`;
}

/** "5:56 to 6:51 PM" — drops the first AM/PM when both share it. */
export function spokenRange(a: number, b: number, zone: LocalZone, fmt: TimeFormat): string {
  const sa = spokenTime(a, zone, fmt);
  const sb = spokenTime(b, zone, fmt);
  if (fmt === '12' && sa.slice(-2) === sb.slice(-2)) return `${sa.slice(0, -3)} to ${sb}`;
  return `${sa} to ${sb}`;
}

/** Relative direction of a target from the camera heading, for edge tabs. */
export function relativeDirection(targetAz: number, headingAz: number): string {
  const d = ((((targetAz - headingAz) % 360) + 540) % 360) - 180;
  if (Math.abs(d) <= 45) return 'ahead';
  if (Math.abs(d) >= 135) return d > 0 ? 'behind you, to the right' : 'behind you, to the left';
  return d > 0 ? 'to your right' : 'to your left';
}

export type SummaryInput = {
  live: boolean;
  t: number;
  altitude: number;
  azimuth: number;
  rise: number | null;
  set: number | null;
  golden: [number, number] | null;
};

export const labels = {
  summary(s: SummaryInput, zone: LocalZone, fmt: TimeFormat): string {
    const when = s.live ? 'now' : `at ${spokenTime(s.t, zone, fmt)}`;
    const parts = [`Sun ${when}, ${Math.round(s.altitude)} degrees up, ${compassPoint(s.azimuth)}.`];
    if (s.set !== null) parts.push(`Sunset ${spokenTime(s.set, zone, fmt)}.`);
    else if (s.rise !== null) parts.push(`Sunrise ${spokenTime(s.rise, zone, fmt)}.`);
    if (s.golden) parts.push(`Golden hour ${spokenRange(s.golden[0], s.golden[1], zone, fmt)}.`);
    return parts.join(' ');
  },
  sun: 'Sun',
  sunActions: {
    left: 'Calibrate: nudge left',
    right: 'Calibrate: nudge right',
    up: 'Calibrate: nudge up',
    down: 'Calibrate: nudge down',
    clear: 'Clear calibration',
  },
  timeRing: 'Time',
  timeValue(t: number, zone: LocalZone, fmt: TimeFormat, live: boolean, golden: boolean): string {
    return `${spokenTime(t, zone, fmt)}${live ? ', now' : ''}${golden ? ', golden hour' : ''}`;
  },
  timeActions: {
    forward15: 'Forward 15 minutes',
    back15: 'Back 15 minutes',
    nextEvent: 'Next sun event',
    prevEvent: 'Previous sun event',
  },
  dayRing: 'Day',
  monthRing: 'Month',
  monthValue: (month: number) => MONTHS[month - 1],
  backToNow(now: number, zone: LocalZone, fmt: TimeFormat): string {
    const f = zone.fields(now);
    return `Back to now, ${spokenTime(now, zone, fmt)}, ${MONTHS[f.month - 1]} ${f.day}`;
  },
  gear: 'Settings',
  edgeSun: (direction: string) => `Sun is off-screen, ${direction}`,
  edgeRise: (time: string, direction: string) => `Sunrise, ${time}, ${direction}`,
  edgeSet: (time: string, direction: string) => `Sunset, ${time}, ${direction}`,
  edgeRiseVisible: (time: string, direction: string) => `Sunrise over the ridge, ${time}, ${direction}`,
  edgeSetVisible: (time: string, direction: string) => `Sunset behind the ridge, ${time}, ${direction}`,
  markerSet: (time: string) => `Sunset, ${time}`,
  markerRise: (time: string) => `Sunrise, ${time}`,
  markerSetVisible: (time: string) => `Sunset behind the ridge, ${time}`,
  markerRiseVisible: (time: string) => `Sunrise over the ridge, ${time}`,
  offset: (deg: number) => `Manual calibration, ${deg.toFixed(1)} degrees`,
  offsetHint: 'Swipe left to clear',
  offsetAction: 'Clear calibration',
  zoomWide: 'Wide view',
  zoomNormal: 'Normal view',
  compassCard: 'Compass needs calibration. Move your phone in a figure 8.',
  compassGlyph: 'Compass calibration help',
  hint: 'Drag left or right on the sky to change the time.',
  settings: 'Settings',
  timeFormatRow: 'Time format',
  timeFormat12: (sample: string) => `12-hour clock, ${sample}`,
  timeFormat24: (sample: string) => `24-hour clock, ${sample}`,
  dateFormatRow: 'Date format',
  dateMdy: (sample: string) => `Month first, ${sample}`,
  dateDmy: (sample: string) => `Day first, ${sample}`,
  dateYmd: (sample: string) => `Year first, ${sample}`,
  dialSideRow: 'Dial side',
  dialLeft: 'Dial on left, for left hand',
  dialRight: 'Dial on right, for right hand',
  hapticsRow: 'Haptics',
  hapticsOn: 'On',
  hapticsOff: 'Off',
  close: 'Close settings',
  allowCamera: 'Allow camera',
  allowCameraHint: "Shows the sun's path over your camera view",
  cameraOff: 'Camera access is off',
  cameraOpenSettings: 'Open system settings to allow camera',
  allowLocation: 'Allow location',
  allowLocationHint: 'Needed to find where the sun will be from here',
  locationOff: 'Location access is off',
  locationOpenSettings: 'Open system settings to allow location',
} as const;
