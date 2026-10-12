import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { devicePlatform } from './src/native/device';
import type { PlatformServices, PermissionResult } from './src/native/platform';
import { AppModelProvider } from './src/state/AppModel';
import { color } from './src/theme/tokens';
import { MainScreen } from './src/ui/MainScreen';
import { PermissionDenied, PermissionPrompt } from './src/ui/Permissions';

// Simulator mode exists only in debug builds: Metro folds `__DEV__` to false in release and
// drops this require (verified by scripts/check-release.sh).
let platform: PlatformServices = devicePlatform;
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional require keeps the simulator out of release
  const sim = require('./src/sim/simulator') as typeof import('./src/sim/simulator');
  // Simulator mode is on unless the debug build stores sim = "off" (real device debugging).
  let mode: string | null = null;
  try {
    mode = devicePlatform.getItem('sim');
  } catch {}
  if (mode !== 'off') platform = sim.createSimulatorPlatform(devicePlatform);
}

type Gate = 'checking' | 'ask' | 'denied' | 'granted';

function usePermission(check: (ask: boolean) => Promise<PermissionResult>, enabled: boolean) {
  const [gate, setGate] = useState<Gate>('checking');
  const refresh = useCallback(async () => {
    const r = await check(false);
    setGate(r.granted ? 'granted' : r.status === 'denied' && !r.canAskAgain ? 'denied' : 'ask');
  }, [check]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [enabled, refresh]);
  const ask = useCallback(async () => {
    await check(true);
    const r = await check(false);
    setGate(r.granted ? 'granted' : 'denied');
  }, [check]);
  return { gate, ask };
}

function Root() {
  const camera = usePermission(platform.cameraPermission, true);
  const location = usePermission(platform.locationPermission, camera.gate === 'granted');
  if (camera.gate === 'checking') return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (camera.gate === 'ask') return <PermissionPrompt kind="camera" overFeed={false} onPress={camera.ask} />;
  if (camera.gate === 'denied') return <PermissionDenied kind="camera" overFeed={false} onOpenSettings={platform.openSettings} />;
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {location.gate === 'granted' ? (
        <AppModelProvider platform={platform}>
          <MainScreen />
        </AppModelProvider>
      ) : (
        <>
          <platform.CameraLayer style={{ flex: 1 }} active wide={false} onGeometry={() => {}} />
          {location.gate === 'ask' && <PermissionPrompt kind="location" overFeed onPress={location.ask} />}
          {location.gate === 'denied' && <PermissionDenied kind="location" overFeed onOpenSettings={platform.openSettings} />}
        </>
      )}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
