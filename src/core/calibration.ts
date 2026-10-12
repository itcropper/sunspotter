// Manual calibration offset and its persistence rules (Spec-Math, Spec-Interactions).
import { CALIBRATION_MAX_AGE_MS, CALIBRATION_MAX_DISTANCE_M } from './constants';
import { type Calibration, ZERO_CALIBRATION } from './projection';

export type StoredCalibration = Calibration & {
  savedAt: number;
  latitude: number;
  longitude: number;
};

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The offset persists until cleared, the device moves more than 1 km, or 12 h pass. */
export function activeCalibration(
  stored: StoredCalibration | null,
  now: number,
  place: { latitude: number; longitude: number } | null,
): Calibration {
  if (!stored) return ZERO_CALIBRATION;
  if (now - stored.savedAt > CALIBRATION_MAX_AGE_MS || now < stored.savedAt) return ZERO_CALIBRATION;
  if (place && distanceM(stored.latitude, stored.longitude, place.latitude, place.longitude) > CALIBRATION_MAX_DISTANCE_M)
    return ZERO_CALIBRATION;
  return { dAz: stored.dAz, dAlt: stored.dAlt, refAz: stored.refAz };
}

/** Indicator magnitude: √(Δaz² + Δalt²), degrees. */
export function calibrationMagnitude(c: Calibration): number {
  return Math.hypot(c.dAz, c.dAlt);
}

export function isZero(c: Calibration): boolean {
  return c.dAz === 0 && c.dAlt === 0;
}

/** Calibration is only possible while live, with a trustworthy compass. */
export function canCalibrate(live: boolean, compassBad: boolean): boolean {
  return live && !compassBad;
}

/** Wraps an azimuth difference into (−180, 180]. */
export function wrapDeg(d: number): number {
  let x = ((d % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
}
