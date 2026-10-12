// The app talks to sensors, camera, location, haptics and storage only through this interface,
// so the orientation source can be swapped (e.g. after field testing) without touching the
// overlay, and the debug-only simulator can stand in for real hardware.
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import type {
  AttitudeEvent,
  CameraGeometryEvent,
  HapticKind,
  LocationEvent,
  PermissionResult,
} from '../../modules/sun-sensors';

export type { AttitudeEvent, CameraGeometryEvent, HapticKind, LocationEvent, PermissionResult };

export type Unsubscribe = () => void;

export type CameraLayerProps = ViewProps & {
  active: boolean;
  wide: boolean;
  onGeometry: (g: CameraGeometryEvent) => void;
};

/** Debug-only initial state for simulator screenshots. */
export type SimInitial = {
  pinned?: number;
  wide?: boolean;
  settings?: boolean;
  dialSide?: 'left' | 'right';
  calibration?: { dAz: number; dAlt: number; refAz: number };
};

export interface PlatformServices {
  readonly simulated: boolean;
  /** Attitude stream (device → ENU quaternion, true north). */
  subscribeAttitude(cb: (e: AttitudeEvent) => void): Unsubscribe;
  subscribeLocation(cb: (e: LocationEvent) => void): Unsubscribe;
  lastKnownLocation(): LocationEvent | null;
  displayRotation(): number;
  tzOffsetMinutes(zone: string, ms: number): number;
  now(): number;
  getItem(key: string): string | null;
  setItem(key: string, value: string | null): void;
  haptic(kind: HapticKind): void;
  openSettings(): void;
  cameraPermission(ask: boolean): Promise<PermissionResult>;
  locationPermission(ask: boolean): Promise<PermissionResult>;
  CameraLayer: ComponentType<CameraLayerProps>;
  simInitial?: SimInitial;
}
