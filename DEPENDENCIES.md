# Dependencies

Every runtime dependency, why it's here, and its network behavior. The app makes no network calls; the Android release manifest has no INTERNET permission, so even a stray call could not leave the device.

| Package | Why | Network |
|---|---|---|
| `expo` | App runtime, config plugins, native module system (Expo Modules API) | No network calls at runtime. `expo-updates` is **not** installed. |
| `expo-dev-client` | Debug builds only: development client for Metro | Debug builds talk to Metro on the dev machine; not used in release (no INTERNET permission there). |
| `expo-build-properties` | Sets Android min/target SDK and iOS deployment target at build time | Build-time only. |
| `expo-font` | Config plugin embeds the bundled Space Grotesk files at build time | None; fonts are bundled, never downloaded. |
| `expo-splash-screen` | Plain #0B0E14 launch screen (Launch artboard) | None. |
| `expo-status-bar` | Light status bar in portrait, hidden in landscape | None. |
| `expo-localization` | Device 12/24-hour and date-order defaults for Settings | None (reads OS locale). |
| `react`, `react-native` | UI framework | None. |
| `react-native-reanimated`, `react-native-worklets` | UI-thread animation and per-frame re-projection | None. |
| `react-native-gesture-handler` | Sky scrub, dial, pinch, long-press, swipes on the UI thread | None. |
| `@shopify/react-native-skia` | Overlay, dial, glyphs; paragraphs with tabular figures and casings | None; fonts loaded from the app bundle. |
| `react-native-safe-area-context` | Safe-area and cutout insets | None. |
| `@photostructure/tz-lookup` | Offline coordinate → IANA time zone (CC0, ~70 KB) | None; data is embedded in the package. |

Native (inside `modules/sun-sensors`):

| Library | Why | Network |
|---|---|---|
| AndroidX CameraX (`camera-core`, `camera-camera2`, `camera-lifecycle`, `camera-view`) | Back-camera preview, zoom ratio for ultra-wide, camera characteristics for intrinsics | None. |
| Android platform `SensorManager`, `LocationManager`, `GeomagneticField` | Rotation vector, location, magnetic declination | None from the app. (The OS may use its own network location provider; that is outside the app and needs no app permission.) |
| iOS CoreMotion, CoreLocation, AVFoundation, UIKit feedback generators | Attitude, location/heading accuracy, camera, haptics | None. |

Not used, on purpose: Google Play services / Fused Orientation Provider (see DECISIONS.md), expo-camera, expo-location, expo-sensors, expo-haptics, expo-updates, any analytics/crash/attribution SDK.

Dev-only (not shipped): `typescript`, `jest`, `jest-expo`, `@types/jest`, `@types/react`, `eslint`, `eslint-config-expo`.
