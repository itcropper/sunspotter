# Decisions log

Conflicts between the design and the brief, and judgment calls where the design is silent.

## Brief overrides applied
- **No terrain (override 1).** `TerrainProvider` + `NO_TERRAIN`. Consequences: no skyline, no visible rise/set markers, the "behind the ridge" labels exist in `a11y.ts` but never fire, the "visible rise/set" haptic never fires. Screens that show the visible-sunset marker (Main, S03, S04, S06, S07b, S08, S10) will differ: e.g. Main hides hour 6 because it collides with the visible-sunset marker; in this build it can show.
- **Time zone (override 2).** Design says device zone; brief says where the user stands. `tz-lookup` + OS tz database via the native module. The design's rule "offset for the selected date" still applies.
- **Location precision (override 4).** Spec-Platform says precise is needed for terrain. Precise is still requested; coarse-only works (Android re-checks and accepts a coarse-only grant).
- **Placeholder icon (override 3).** `scripts/make-icon.py`: sun glyph (C-Glyphs edge-tab sun, #FFD27A) on #0B0E14. Adaptive icon foreground/monochrome from the same glyph.

## NOAA check of the design's test values
Ran NOAA's own Solar Calculator script (gml.noaa.gov/grad/solcalc/main.js, fetched 2026-10-12) for every row of the Spec-Math test table. **All design values agree with NOAA within ±1 min and ±0.01°**, so nothing was overridden. Notes: Ashland Oct 12 sunset is 18:33:29.6 by bisection (NOAA's own iterative formula: 18:33:30), so "6:33" depends on rounding; we round to the nearest minute.
Test tolerance: event times ±60 s, azimuth/altitude ±0.05° vs NOAA; design table values compared at their own display precision.

## Design conflicts and gaps
- **Decimal point.** Spec-ReadMe's allowed characters omit ".", but the design shows "2.1°" and "0.5×". "." is allowed as a decimal point (lint rule and test).
- **Calibration storage.** Spec-Math stores (Δaz, Δalt). A rigid "tilt by Δalt" needs an axis, so we also store `refAz` (the sun's azimuth when calibrated). The indicator still shows √(Δaz²+Δalt²).
- **Year rule vs scrubbing backwards.** Scrubbing/carrying before today moves that (month, day) to its next occurrence (next year), per the year rule. Month change clamps the day to the new month's length.
- **DST.** Time ring and scrub move in real instants; labels show wall time. In the fall-back hour, 1:xx appears twice; in spring-forward, 2:xx is skipped. Wall-clock times in a gap map to the later offset.
- **Polar night** (not designed): no markers/arrows, night-styled path.
- **AM/PM split** at local 12:00 (clock noon), not solar noon (S02 note: "turns mint to peach at the 12 tick").
- **Default settings**: 12/24 h and date order from the device locale; dial right; haptics on.
- **Center bump** only while live (it's about the phone moving, not scrubbing).
- **Calibration expiry** (1 km / 12 h) is also checked at launch against the stored fix and time.
- **Hint "first sensor fix"** = a location fix (attitude starts immediately).
- **Edge tab, behind the camera**: y from altitude scaled ±45° to half the screen height, then clamped (design gives no scale).
- **Hour numeral placement**: 20 pt from the path on its upper side; moved to the other side or hidden when within 32 pt of the sun, under the dial, or on an event label (C-Markers collision order).
- **Simulator background**: the artboards' camera images aren't exported files, so the simulator draws a procedural sky/ground locked to the scripted attitude (so the overlay and "camera" agree as in a real pan).

## Engineering decisions
- **Orientation**: native module, OS-fused attitude (iOS CoreMotion `xTrueNorthZVertical`; Android `TYPE_ROTATION_VECTOR` + `GeomagneticField` declination), 80 ms slerp low-pass in native code. No fusion in JS. Quaternions/matrices only.
- **Fused Orientation Provider (Android)**: evaluated, not used. It needs Google Play services (closed, network-capable, absent on de-Googled phones and some markets) and adds a dependency we can't vouch for under "no network, no data". Its advantage (better magnetic-disturbance handling) is real; the module boundary (`PlatformServices.subscribeAttitude`) allows swapping after field tests.
- **Rendering**: Skia + Reanimated. The day path is computed on JS only when the date or location (>100 m) changes; every frame a UI-thread worklet re-projects ~720 points and builds the Skia paths. Attitude reaches the UI thread as a Reanimated shared value set from the native event on the JS thread (option B in the plan). Option A (a JSI reader installed in the UI runtime, no JS hop) was not built in this pass: it needs C++ JSI glue into react-native-worklets' runtime. Risk: if the JS thread stalls, attitude updates stall with it. Field-test item; the swap is isolated to `AppModel` + the module.
- **Text**: all overlay/dial text is Skia Paragraph with `tnum` and a stroke-paint casing; chips/settings are RN Text with `fontVariant: ['tabular-nums']`.
- **Haptics**: native module maps exactly to the Spec-Interactions table (expo-haptics' Android mapping doesn't use `HapticFeedbackConstants`).
- **Storage**: tiny native key-value store (UserDefaults / SharedPreferences) — synchronous reads at startup, no extra dependency.
- **Camera**: own native preview views (AVCaptureVideoPreviewLayer / CameraX PreviewView, aspect fill) that report buffer size and focal length in buffer pixels. Intrinsics in points are computed in TS (`screenIntrinsics`, unit tested). Android prefers `LENS_INTRINSIC_CALIBRATION`, then focal length / sensor size. Wide: zoom ratio 0.5 (ultra-wide) when supported, else the 1× preview at 50% in the center with the projection scaled 0.5.
- **iOS**: no Mac is available in this environment. The Swift code is written but **not compiled**; iOS build, launch, screenshots and cold start are not done.
