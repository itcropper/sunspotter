// Real hardware implementation of PlatformServices.
import { SunCameraView, SunSensors } from '../../modules/sun-sensors';
import type { CameraLayerProps, PlatformServices } from './platform';

function CameraLayer({ active, wide, onGeometry, style }: CameraLayerProps) {
  return (
    <SunCameraView
      style={style}
      active={active}
      wide={wide}
      onGeometry={(e) => onGeometry(e.nativeEvent)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export const devicePlatform: PlatformServices = {
  simulated: false,
  subscribeAttitude(cb) {
    const sub = SunSensors.addListener('onAttitude', cb);
    SunSensors.startSensors();
    return () => {
      sub.remove();
      SunSensors.stopSensors();
    };
  },
  subscribeLocation(cb) {
    const sub = SunSensors.addListener('onLocation', cb);
    SunSensors.startLocation();
    return () => {
      sub.remove();
      SunSensors.stopLocation();
    };
  },
  lastKnownLocation: () => SunSensors.lastKnownLocation(),
  displayRotation: () => SunSensors.displayRotation(),
  tzOffsetMinutes: (zone, ms) => SunSensors.tzOffsetMinutes(zone, ms),
  now: () => Date.now(),
  getItem: (k) => SunSensors.getItem(k),
  setItem: (k, v) => SunSensors.setItem(k, v),
  haptic: (k) => SunSensors.haptic(k),
  openSettings: () => SunSensors.openSettings(),
  cameraPermission: (ask) => SunSensors.cameraPermission(ask),
  locationPermission: (ask) => SunSensors.locationPermission(ask),
  CameraLayer,
};
