# Field test checklist

Do these on real phones. Nothing here has been verified yet.

## Setup
- Install a **release** build (README). Turn on **airplane mode** (Wi-Fi and Bluetooth off too).
- Pick a clear afternoon with the sun visible and an open horizon. Note the time.

## Overlay accuracy
1. Open the app. It should show the camera and overlay within about a second, before GPS locks, if you've used it before.
2. Point at the sun (don't look at it directly; use the screen). Record the offset between the drawn sun and the real sun in degrees, using the sun's diameter (about 0.5°) as a ruler:
   - Headings: facing the sun, sun at the left edge, sun at the right edge.
   - Tilts: phone level, tilted up 20°, tilted down 10°.
3. Repeat in landscape (both directions) and portrait upside down.
4. Pinch to wide (0.5×) and repeat one reading.
5. Note whether errors are mostly sideways (compass) or vertical (tilt).

## Startup
6. Force-quit, wait 10 s, launch, and time it from tap to camera plus overlay (screen recording at 60 fps). Do it 5 times on each phone.

## Compass warning
7. Hold the phone next to a car body or a laptop speaker. The overlay should dim and the figure-8 card should appear within about 1 s, with one warning haptic. Move away and do the figure 8: the glyph should fade out with a success haptic.

## Calibration
8. While live, long-press the drawn sun, then drag it onto the real sun and release. Check the offset chip shows a sensible value, and that the path, horizon and markers all moved together.
9. Turn around and back: the overlay should still line up.
10. Swipe the chip left: the offset clears.
11. Relaunch within 12 h at the same place: the calibration should still be applied. Move more than 1 km: it should be cleared.

## Haptics (low-end Android too)
12. Turn the time ring slowly, then fling it: ticks per minute, never a buzz, capped at about 30 per second.
13. Scrub across golden hour start and sunset: one medium bump each.
14. Tap the now pip: a success haptic. Turn Settings › haptics off: everything stays silent.

## AM/PM colors (known color-vision risk)
15. Ask at least one person with red-green color-vision deficiency whether mint (AM) and peach (PM) paths and readouts look different, in bright sun and at dusk.

## Battery and heat
16. Run for 10 minutes continuously; note the battery drop and whether the phone gets warm.

Record results with the phone model and OS version.
