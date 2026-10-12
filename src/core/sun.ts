// NOAA solar position equations (Meeus), as used by the NOAA Solar Calculator.
// Inputs: latitude, longitude (deg, east positive), UTC instant (ms).
// Outputs: azimuth (deg from true north, clockwise), geometric altitude (deg), hour angle.

const RAD = Math.PI / 180;

export type SolarPosition = {
  /** Degrees clockwise from true north, [0, 360). */
  azimuth: number;
  /** Geometric (airless) altitude in degrees. */
  altitude: number;
  /** Hour angle in degrees, (−180, 180]. 0 at solar noon. */
  hourAngle: number;
};

function julianCentury(ms: number): number {
  const jd = ms / 86400000 + 2440587.5;
  return (jd - 2451545) / 36525;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function solarPosition(ms: number, latitude: number, longitude: number): SolarPosition {
  const t = julianCentury(ms);
  const l0 = mod(280.46646 + t * (36000.76983 + t * 0.0003032), 360);
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mr = m * RAD;
  const c =
    Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mr) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mr) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD));

  const y = Math.tan((eps * RAD) / 2) ** 2;
  const l0r = l0 * RAD;
  const eqTime =
    4 /
    RAD *
    (y * Math.sin(2 * l0r) -
      2 * e * Math.sin(mr) +
      4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
      0.5 * y * y * Math.sin(4 * l0r) -
      1.25 * e * e * Math.sin(2 * mr));

  const utcMinutes = mod(ms / 60000, 1440);
  const trueSolarTime = mod(utcMinutes + eqTime + 4 * longitude, 1440);
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle <= -180) hourAngle += 360;

  const lat = latitude * RAD;
  const ha = hourAngle * RAD;
  const cosZenith = Math.min(
    1,
    Math.max(-1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)),
  );
  const zenith = Math.acos(cosZenith);
  const azimuth = mod(
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / RAD + 180,
    360,
  );
  return { azimuth, altitude: 90 - zenith / RAD, hourAngle };
}

/**
 * Atmospheric refraction (deg) for a geometric altitude, Sæmundsson's formula.
 * Altitude is clamped at −1°; below −1° R scales linearly to 0 at −4° so the path has no kink.
 */
export function refraction(geometricAltitude: number): number {
  const saemundsson = (h: number) => 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD) / 60;
  if (geometricAltitude >= -1) return saemundsson(geometricAltitude);
  if (geometricAltitude <= -4) return 0;
  return (saemundsson(-1) * (geometricAltitude + 4)) / 3;
}

export function apparentAltitude(geometricAltitude: number): number {
  return geometricAltitude + refraction(geometricAltitude);
}
