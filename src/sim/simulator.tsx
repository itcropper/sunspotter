// SIMULATOR MODE (debug builds only; required behind `if (__DEV__)` so release bundles drop it).
// Simulators and emulators have no real camera or orientation sensors. This feeds:
//   - a fixed sky-and-horizon background (drawn procedurally so it stays locked to the attitude),
//   - a scripted attitude (a slow pan from east to west, or a fixed scene for screenshots),
//   - a fixed location and time: the design's mock "now" (Spec-ReadMe), so screenshots compare
//     with the artboards.
// Scene selection: SIM_SCENE below, or the `sim` key in storage (set by `scripts/sim-scene`).
import { Canvas, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import {
  MOCK_LOCATION,
  MOCK_NOW_MS,
  MOCK_POLAR_LOCATION,
  MOCK_POLAR_NOW_MS,
} from '../core/constants';
import { SunSensors } from '../../modules/sun-sensors';
import { direction } from '../core/celestial';
import { projectPolyline, type Quat, uprightAttitude, viewMatrix, ZERO_CALIBRATION } from '../core/projection';
import { intlOffsetProvider } from '../core/timezone';
import type { AttitudeEvent, CameraLayerProps, LocationEvent, PlatformServices, SimInitial } from '../native/platform';
import { simBackdrop } from '../theme/tokens';

export const SIM_MARKER = 'SUNSPOTTER_SIMULATOR_MODE';

export type SimScene = {
  name: string;
  now: number;
  location: { latitude: number; longitude: number };
  /** Heading (deg) and pitch (deg) of the back camera; pan sweeps the heading over time. */
  heading: number;
  pitch: number;
  pan?: { from: number; to: number; seconds: number };
  rotation?: 0 | 90 | 270;
  compassBad?: boolean;
  initial?: SimInitial;
};

// Scenes match the artboards' mock "now". Headings chosen so the sun sits where each screen shows it.
export const SCENES: Record<string, SimScene> = {
  pan: { name: 'pan', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 90, pitch: 5, pan: { from: 90, to: 270, seconds: 60 } },
  main: { name: 'main', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 6 },
  offscreen: { name: 'offscreen', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 157.5, pitch: 6 },
  future: { name: 'future', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 228, pitch: 4, initial: { pinned: Date.UTC(2026, 11, 22, 0, 0) } },
  wide: { name: 'wide', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 8, initial: { wide: true } },
  calibrated: { name: 'calibrated', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 6, initial: { calibration: { dAz: 2, dAlt: 0.6, refAz: 251.5 } } },
  settings: { name: 'settings', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 6, initial: { settings: true } },
  left: { name: 'left', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 6, initial: { dialSide: 'left' } },
  compass: { name: 'compass', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 6, compassBad: true },
  landscape: { name: 'landscape', now: MOCK_NOW_MS, location: MOCK_LOCATION, heading: 248, pitch: 4, rotation: 90 },
  polar: { name: 'polar', now: MOCK_POLAR_NOW_MS, location: MOCK_POLAR_LOCATION, heading: 0, pitch: 4 },
};

const SIM_SCENE = 'main';

function currentScene(): SimScene {
  let key = SIM_SCENE;
  try {
    key = SunSensors.getItem('sim') ?? SIM_SCENE;
  } catch {}
  return SCENES[key] ?? SCENES[SIM_SCENE];
}

const startedAt = Date.now();
const scene = currentScene();

function rollAbout(q: Quat, rotation: number): Quat {
  // Device turned counter-clockwise by `rotation` about its own z axis (screen normal).
  const h = (rotation * Math.PI) / 360;
  const [x, y, z, w] = q;
  const bz = Math.sin(h);
  const bw = Math.cos(h);
  return [x * bw + y * bz, y * bw - x * bz, w * bz + z * bw, w * bw - z * bz];
}

function sceneAttitude(): Quat {
  let heading = scene.heading;
  if (scene.pan) {
    const t = ((Date.now() - startedAt) / 1000 / scene.pan.seconds) % 2;
    const f = t < 1 ? t : 2 - t;
    heading = scene.pan.from + (scene.pan.to - scene.pan.from) * f;
  }
  return rollAbout(uprightAttitude(heading, scene.pitch), scene.rotation ?? 0);
}

/** Procedural sky: gradient above the projected horizon, dark ground below. */
function SimSky({ style }: CameraLayerProps) {
  const { width, height } = useWindowDimensions();
  const [q, setQ] = useState<Quat>(sceneAttitude);
  useEffect(() => {
    const id = setInterval(() => setQ(sceneAttitude()), 33);
    return () => clearInterval(id);
  }, []);
  const rot = scene.rotation ?? 0;
  const m = viewMatrix(q, ZERO_CALIBRATION, rot);
  const f = (Math.max(width, height) / 2) / Math.tan((33 * Math.PI) / 180);
  const k = { fx: f, fy: f, cx: width / 2, cy: height / 2 };
  const xyz: number[] = [];
  for (let az = 0; az <= 360; az += 2) {
    const d = direction(az, -0.6 + 0.5 * Math.sin((az * Math.PI) / 18) + 0.3 * Math.sin((az * Math.PI) / 7));
    xyz.push(d.x, d.y, d.z);
  }
  const runs = projectPolyline(m, k, xyz, 0, xyz.length / 3 - 1, 0.1);
  const ground = Skia.Path.Make();
  for (const run of runs) {
    ground.moveTo(run[0], height * 3);
    for (let i = 0; i < run.length; i += 2) ground.lineTo(run[i], run[i + 1]);
    ground.lineTo(run[run.length - 2], height * 3);
    ground.close();
  }
  return (
    <Canvas style={[StyleSheet.absoluteFill, style]}>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[...simBackdrop.sky]} />
      </Rect>
      <Path path={ground} color={simBackdrop.ground} />
    </Canvas>
  );
}

export function createSimulatorPlatform(real: PlatformServices): PlatformServices {
  return {
    ...real,
    simulated: true,
    subscribeAttitude(cb: (e: AttitudeEvent) => void) {
      const id = setInterval(() => {
        cb({ q: [...sceneAttitude()] as AttitudeEvent['q'], headingReliable: !scene.compassBad, t: Date.now() });
      }, 16);
      return () => clearInterval(id);
    },
    subscribeLocation(cb: (e: LocationEvent) => void) {
      const id = setTimeout(() => cb({ ...scene.location, accuracy: 5, time: Date.now() }), 50);
      return () => clearTimeout(id);
    },
    lastKnownLocation: () => ({ ...scene.location, accuracy: 5, time: Date.now() }),
    displayRotation: () => scene.rotation ?? real.displayRotation(),
    // The OS zone database is the same IANA data; Intl keeps the simulator independent of it.
    tzOffsetMinutes: (zone, ms) => {
      try {
        return real.tzOffsetMinutes(zone, ms);
      } catch {
        return intlOffsetProvider(zone, ms);
      }
    },
    // Time is frozen at the mock "now" plus elapsed time, so screenshots match the artboards.
    now: () => scene.now,
    simInitial: scene.initial,
    cameraPermission: async () => ({ status: 'granted', granted: true, canAskAgain: false }),
    locationPermission: async () => ({ status: 'granted', granted: true, canAskAgain: false }),
    CameraLayer: SimSky,
  };
}

export function simSceneName(): string {
  return `${SIM_MARKER}:${scene.name}`;
}
