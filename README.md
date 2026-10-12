# SunSpotter

Point your phone at the sky to see where the sun will be at any time and date, with its path for the day drawn over the live camera. It works offline, has no words in the UI, and collects no data.

## Requirements
- Node 20+ (this repo was built with Node 24 on Windows) and npm.
- Android: Android Studio (JDK 17+ bundled), Android SDK 36, a USB cable, and developer options turned on with USB debugging.
- iPhone: a Mac with Xcode 16+, CocoaPods, and an Apple ID (a free account can sideload for 7 days; a paid developer account for a year).

```sh
npm install
npm run check        # typecheck + lint + unit tests
```

## Install on your Android phone
1. Plug in the phone and accept the "Allow USB debugging" prompt. `adb devices` should list it.
2. Build and install a release APK. It has no INTERNET permission and no simulator mode.
   ```sh
   npx expo prebuild -p android --clean
   cd android && ./gradlew assembleRelease     # Windows: gradlew.bat assembleRelease
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```
   The release build is signed with the debug keystore, which is fine for sideloading. For the Play Store, set up your own keystore in `android/app/build.gradle`.
3. Debug builds (for development, with Metro): `npx expo run:android --device`. On a real phone, turn the simulator off once: `adb shell "run-as com.sunspotter.app sh -c 'mkdir -p shared_prefs; echo \"<map><string name=\\\"sim\\\">off</string></map>\" > shared_prefs/sunspotter.xml'"`.

## Install on your iPhone (needs a Mac)
1. `npx expo prebuild -p ios --clean`, then `open ios/SunSpotter.xcworkspace`.
2. In Xcode, select the SunSpotter target › Signing & Capabilities, pick your Team, and give it a unique bundle identifier if needed.
3. Plug in the iPhone, trust the computer, and turn on Developer Mode (Settings › Privacy & Security).
4. Pick your iPhone as the run destination, set the scheme's Build Configuration to **Release** (Product › Scheme › Edit Scheme › Run), and press Run.
5. On first launch, trust the developer certificate: Settings › General › VPN & Device Management.

Or from the command line: `npx expo run:ios --device --configuration Release`.

## Simulator mode (debug builds only)
Emulators have no real camera or orientation sensors, so debug builds use a scripted feed: a procedural sky, a fixed attitude or slow pan, and the design's mock "now" (Oct 12 2026, 5:42 PM PDT, Ashland OR). Pick a scene with `scripts/sim-scene.sh <scene>` (main, offscreen, future, wide, calibrated, compass, settings, landscape, left, polar, pan). Release builds don't contain it (`scripts/check-release.sh`).

## Docs
- `sun-ar-prompt.md`: the build brief. `CLAUDE.md`: working notes.
- `DECISIONS.md`: conflicts and judgment calls. `DEPENDENCIES.md`: every dependency and its network behavior.
- `FIELD_TEST.md`: what to check outdoors.
