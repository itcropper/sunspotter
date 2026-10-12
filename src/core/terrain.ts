// Terrain is out of v1 (brief override 1). The interface stays so a real provider can be added;
// the shipped implementation always reports "no terrain", which gives the design's silent
// fallback: astronomical rise/set only, no skyline, flat horizon.
import { ALT_RISE_SET } from './constants';

export interface TerrainProvider {
  readonly hasTerrain: boolean;
  /** Skyline elevation angle (deg) at an azimuth, or null when unknown. */
  horizonAt(azimuth: number): number | null;
  /** Whether the sun is visible from here at this position. */
  isVisible(azimuth: number, apparentAltitude: number, geometricAltitude: number): boolean;
}

export const NO_TERRAIN: TerrainProvider = {
  hasTerrain: false,
  horizonAt: () => null,
  // Flat horizon: visible between astronomical sunrise and sunset.
  isVisible: (_az, _app, geometric) => geometric > ALT_RISE_SET,
};
