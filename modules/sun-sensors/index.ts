import { requireNativeModule, requireNativeViewManager, type EventSubscription } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export type AttitudeEvent = {
  /** Unit quaternion [x, y, z, w], device → world ENU (x east, y north, z up), true north. */
  q: [number, number, number, number];
  /** False while the heading is unreliable (iOS accuracy worse than 15°, Android LOW/UNRELIABLE). */
  headingReliable: boolean;
  headingAccuracy?: number;
  magAccuracy?: number;
  t: number;
};

export type LocationEvent = { latitude: number; longitude: number; accuracy: number; time: number };

export type PermissionResult = { status: 'granted' | 'denied' | 'undetermined'; granted: boolean; canAskAgain: boolean };

export type CameraGeometryEvent = {
  bufferWidth: number;
  bufferHeight: number;
  focalPx: number;
  zoom: number;
  hasUltraWide: boolean;
  source: string;
};

export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

type NativeModule = {
  startSensors(): void;
  stopSensors(): void;
  startLocation(): void;
  stopLocation(): void;
  lastKnownLocation(): LocationEvent | null;
  displayRotation(): number;
  tzOffsetMinutes(zone: string, ms: number): number;
  getItem(key: string): string | null;
  setItem(key: string, value: string | null): void;
  haptic(kind: HapticKind): void;
  openSettings(): void;
  cameraPermission(ask: boolean): Promise<PermissionResult>;
  locationPermission(ask: boolean): Promise<PermissionResult>;
  addListener(event: 'onAttitude', cb: (e: AttitudeEvent) => void): EventSubscription;
  addListener(event: 'onLocation', cb: (e: LocationEvent) => void): EventSubscription;
};

export const SunSensors = requireNativeModule<NativeModule>('SunSensors');

export type SunCameraViewProps = ViewProps & {
  active: boolean;
  wide: boolean;
  onGeometry?: (e: { nativeEvent: CameraGeometryEvent }) => void;
};

export const SunCameraView: ComponentType<SunCameraViewProps> = requireNativeViewManager('SunSensors');
