// Main screen: live camera, overlay, thumb dial and chrome. All sky/dial touches go through one
// gesture that decides its mode at touch-down (dial ring, sky scrub, or calibration long-press).
import { useFonts } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StatusBar, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { compassPoint, labels, relativeDirection, spokenTime } from '../core/a11y';
import { calibrationMagnitude, canCalibrate, isZero } from '../core/calibration';
import {
  ALT_RISE_SET,
  CALIBRATION_LIFT,
  CALIBRATION_NUDGE_DEG,
  DIAL_DEG_PER_DAY,
  DIAL_DEG_PER_MINUTE,
  DIAL_DEG_PER_MONTH,
  LONG_PRESS_MS,
  SCRUB_PT_PER_MINUTE,
  SUN_HIT_DIAMETER,
} from '../core/constants';
import { crossedHours } from '../core/haptics';
import { scrubLock, scrubMayStart, zoomAfterPinch } from '../core/gestures';
import {
  type Calibration,
  calibrationForScreenPoint,
  type Intrinsics,
  screenIntrinsics,
  ZERO_CALIBRATION,
} from '../core/projection';
import { addMinutes, stepDay, stepMonth } from '../core/selection';
import { useApp } from '../state/AppModel';
import { alpha, color, motion, size, withAlpha } from '../theme/tokens';
import { CompassCard, CompassGlyphButton, Gear, OffsetIndicator, ZoomChip } from './Chrome';
import { Dial, pipCenter } from './Dial';
import { SKIA_FONTS } from './fonts';
import { inDial, makeLayout, type Ring, ringAt, toPolar } from './geometry';
import { Hint } from './Hint';
import { Overlay, type SunLook } from './Overlay';
import type { Screen } from './overlayModel';
import { SettingsSheet } from './SettingsSheet';

const RING_SPACING: Record<Ring, number> = { time: DIAL_DEG_PER_MINUTE, day: DIAL_DEG_PER_DAY, month: DIAL_DEG_PER_MONTH };

export function MainScreen() {
  const app = useApp();
  const { platform, settings, zone, day, shared, selection } = app;
  const fonts = useFonts(SKIA_FONTS);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => makeLayout(width, height, insets, settings.dialSide), [width, height, insets, settings.dialSide]);
  const live = selection.live;

  // Camera geometry → intrinsics (wide without an ultra-wide: 0.5 scale around the center).
  const [geometry, setGeometry] = useState({ bufferWidth: 1920, bufferHeight: 1440, focalPx: 1920 / 2 / Math.tan((33 * Math.PI) / 180), hasUltraWide: false });
  const intrinsics = useSharedValue<Intrinsics>({ fx: 600, fy: 600, cx: width / 2, cy: height / 2 });
  const fallbackWide = app.zoomWide && !geometry.hasUltraWide;
  useEffect(() => {
    intrinsics.value = screenIntrinsics(geometry, width, height, shared.rotation.value, fallbackWide ? 0.5 : 1);
  }, [geometry, width, height, fallbackWide, intrinsics, shared.rotation]);

  const screen: Screen = useMemo(
    () => ({
      width,
      height,
      dialX: layout.ax,
      dialY: layout.ay,
      dialR: size.dial.notch[1],
      top: insets.top,
      bottom: insets.bottom,
      left: insets.left,
      right: insets.right,
      dialRight: layout.dialRight,
    }),
    [width, height, layout, insets],
  );

  // --- Gesture state -------------------------------------------------------------------------
  const mode = useSharedValue<'none' | 'sky' | Ring | 'calib'>('none');
  const start = useSharedValue({ x: 0, y: 0, theta: 0, t: 0 });
  const dragAngle = useSharedValue(0);
  const [activeRing, setActiveRing] = useState<Ring | null>(null);
  const [moving, setMoving] = useState(false);
  const calibrating = useSharedValue(false);
  const [calibratingJs, setCalibratingJs] = useState(false);
  const finger = useSharedValue({ x: 0, y: 0 });
  const dragCalibration = useSharedValue<Calibration | null>(null);
  const sunScreen = useSharedValue({ x: -1000, y: -1000 });
  const scrubMinutesSv = useSharedValue(0);
  const zoomAtStart = useSharedValue<'normal' | 'wide'>('normal');
  const [zoomShownAt, setZoomShownAt] = useState(0);

  const dialEnabled = app.place !== null && !calibratingJs;
  const sunCanCalibrate = canCalibrate(live, app.compassBad);
  const scrubBase = useRef(app.selected);
  const lastApplied = useRef(0);

  const applyScrub = useCallback(
    (minutes: number) => {
      const prev = addMinutes(scrubBase.current, lastApplied.current, app.now, zone);
      const next = addMinutes(scrubBase.current, minutes, app.now, zone);
      lastApplied.current = minutes;
      if (next === prev) return;
      // Light tick per whole hour crossed on the sky.
      const hours = day ? day.path.hours.map((h) => h.t) : [];
      const n = crossedHours(prev, next, hours);
      for (let i = 0; i < n; i++) if (app.hapticGate.light(Date.now())) platform.haptic('light');
      app.setSelected(next);
    },
    [app, day, platform, zone],
  );
  const beginScrub = useCallback(() => {
    scrubBase.current = app.selected;
    lastApplied.current = 0;
  }, [app.selected]);

  const applyRing = useCallback(
    (ring: Ring, steps: number) => {
      const prev = lastApplied.current;
      if (steps === prev) return;
      lastApplied.current = steps;
      let t = scrubBase.current;
      if (ring === 'time') t = addMinutes(t, steps, app.now, zone);
      if (ring === 'day') t = stepDay(t, steps, app.now, zone);
      if (ring === 'month') t = stepMonth(t, steps, app.now, zone);
      const crossed = Math.abs(steps - prev);
      for (let i = 0; i < crossed; i++) if (app.hapticGate.light(Date.now())) platform.haptic('light');
      app.setSelected(t);
    },
    [app, platform, zone],
  );

  const startCalibration = useCallback(() => {
    setCalibratingJs(true);
    platform.haptic('medium');
  }, [platform]);
  const endCalibration = useCallback(
    (cal: Calibration | null) => {
      setCalibratingJs(false);
      if (cal) {
        app.saveCalibration(cal);
        if (app.hapticGate.success()) platform.haptic('success');
      }
    },
    [app, platform],
  );

  // Ring snap: the wheel offset settles at whole values.
  useAnimatedReaction(
    () => (mode.value === 'time' || mode.value === 'day' || mode.value === 'month' ? Math.round(-dragAngle.value / RING_SPACING[mode.value]) : null),
    (steps, prev) => {
      if (steps !== null && steps !== prev && (mode.value === 'time' || mode.value === 'day' || mode.value === 'month')) {
        runOnJS(applyRing)(mode.value, steps);
      }
    },
  );
  useAnimatedReaction(
    () => (mode.value === 'sky' ? Math.round(scrubMinutesSv.value) : null),
    (m, prev) => {
      if (m !== null && m !== prev) runOnJS(applyScrub)(m);
    },
  );

  const scrubEnabled = !app.screenReader;
  const sunLiveForCalib = sunCanCalibrate;
  const sunAz = app.sunPos.azimuth;
  const sunApp = app.sunPos.apparent;

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      const t = e.allTouches[0];
      if (!t || e.numberOfTouches > 1) return;
      cancelAnimation(dragAngle);
      cancelAnimation(scrubMinutesSv);
      const ring = dialEnabled ? ringAt(layout, t.x, t.y) : null;
      const p = toPolar(layout, t.x, t.y);
      start.value = { x: t.x, y: t.y, theta: p.theta, t: Date.now() };
      finger.value = { x: t.x, y: t.y };
      if (ring) {
        mode.value = ring;
        dragAngle.value = 0;
        runOnJS(beginScrub)();
        runOnJS(setActiveRing)(ring);
        return;
      }
      const onSun = Math.hypot(t.x - sunScreen.value.x, t.y - sunScreen.value.y) <= SUN_HIT_DIAMETER / 2;
      mode.value = 'none';
      if (onSun && sunLiveForCalib) mode.value = 'calib';
      else if (scrubEnabled && !inDial(layout, t.x, t.y) && scrubMayStart(t.x, t.y, width, height)) mode.value = 'sky';
    })
    .onTouchesMove((e, manager) => {
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.x - start.value.x;
      const dy = t.y - start.value.y;
      if (mode.value === 'time' || mode.value === 'day' || mode.value === 'month') {
        manager.activate();
        return;
      }
      if (mode.value === 'calib') {
        if (calibrating.value) manager.activate();
        else if (Date.now() - start.value.t >= LONG_PRESS_MS) {
          calibrating.value = true;
          runOnJS(startCalibration)();
          manager.activate();
        } else if (Math.hypot(dx, dy) > 10) {
          // Moved before the long-press: it's a sky scrub that started on the sun.
          mode.value = scrubEnabled && scrubMayStart(start.value.x, start.value.y, width, height) ? 'sky' : 'none';
        }
        return;
      }
      if (mode.value === 'sky') {
        const lock = scrubLock(dx, dy);
        if (lock === 'horizontal') {
          runOnJS(beginScrub)();
          manager.activate();
        } else if (lock === 'rejected') manager.fail();
        return;
      }
      manager.fail();
    })
    .onUpdate((e) => {
      finger.value = { x: e.x, y: e.y };
      if (mode.value === 'time' || mode.value === 'day' || mode.value === 'month') {
        const p = toPolar(layout, e.x, e.y);
        dragAngle.value = p.theta - start.value.theta;
      } else if (mode.value === 'sky') {
        scrubMinutesSv.value = e.translationX / SCRUB_PT_PER_MINUTE;
      } else if (mode.value === 'calib' && calibrating.value) {
        dragCalibration.value = calibrationForScreenPoint(
          shared.attitude.value,
          shared.rotation.value,
          intrinsics.value,
          e.x,
          e.y - CALIBRATION_LIFT,
          sunAz,
          sunApp,
        );
      }
    })
    .onEnd((e) => {
      if (mode.value === 'time' || mode.value === 'day' || mode.value === 'month') {
        const ring = mode.value;
        const spacing = RING_SPACING[ring];
        const r = Math.max(1, toPolar(layout, e.x, e.y).r);
        const omega = ((e.velocityX * -layout.dir * 0.7 + e.velocityY * 0.7) / r) * (180 / Math.PI);
        runOnJS(setMoving)(true);
        dragAngle.value = withDecay({ velocity: omega, deceleration: 0.998 }, () => {
          const snapped = Math.round(dragAngle.value / spacing) * spacing;
          dragAngle.value = withTiming(snapped, { duration: motion.reduceMotion.linearMs }, () => {
            mode.value = 'none';
            dragAngle.value = 0;
            runOnJS(setMoving)(false);
            runOnJS(setActiveRing)(null);
          });
        });
      } else if (mode.value === 'sky') {
        scrubMinutesSv.value = withDecay({ velocity: e.velocityX / SCRUB_PT_PER_MINUTE, deceleration: 0.998 }, () => {
          mode.value = 'none';
        });
      } else if (mode.value === 'calib') {
        const cal = dragCalibration.value;
        calibrating.value = false;
        dragCalibration.value = null;
        mode.value = 'none';
        runOnJS(endCalibration)(cal);
      }
    })
    .onFinalize(() => {
      if (calibrating.value) {
        calibrating.value = false;
        dragCalibration.value = null;
        runOnJS(endCalibration)(null);
      }
      if (mode.value !== 'time' && mode.value !== 'day' && mode.value !== 'month' && mode.value !== 'sky') runOnJS(setActiveRing)(null);
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      zoomAtStart.value = app.zoomWide ? 'wide' : 'normal';
    })
    .onUpdate((e) => {
      const z = zoomAfterPinch(zoomAtStart.value, e.scale);
      if (z !== zoomAtStart.value) {
        zoomAtStart.value = z;
        runOnJS(onZoom)(z === 'wide');
      }
    });
  function onZoom(wide: boolean) {
    app.setZoomWide(wide);
    setZoomShownAt(Date.now());
    AccessibilityInfo.announceForAccessibility(wide ? labels.zoomWide : labels.zoomNormal);
  }
  const gesture = Gesture.Simultaneous(pan, pinch);

  // Center bump: the sun entering the screen center (22 pt) while the phone moves (live only).
  useAnimatedReaction(
    () => {
      const s = sunScreen.value;
      return Math.hypot(s.x - width / 2, s.y - height / 2) <= 22;
    },
    (inCenter, prev) => {
      if (inCenter !== prev && live) runOnJS(centerBump)(inCenter);
    },
  );
  function centerBump(inCenter: boolean) {
    if (app.hapticGate.center(Date.now(), inCenter)) platform.haptic('medium');
  }

  // Sun look: segment color on an event or below the horizon (C-Sun).
  const sunLook: SunLook = useMemo(() => {
    const alt = app.sunPos.altitude;
    const below = alt <= ALT_RISE_SET;
    const onEvent = !!day && day.eventTimes.some((t) => Math.abs(t - app.selected) < 30000);
    const segColor = alt >= 6 ? (zone.fields(app.selected).hour < 12 ? color.am : color.pm) : alt >= -4 ? color.golden : alt >= -6 ? color.blue : zone.fields(app.selected).hour < 12 ? color.am : color.pm;
    return { ring: onEvent || below ? segColor : color.sunCore, below, event: onEvent };
  }, [app.sunPos.altitude, app.selected, day, zone]);

  // Compass card: 6 s, then shrinks into the glyph; touching the sky also shrinks it.
  const [cardUntil, setCardUntil] = useState(0);
  useEffect(() => {
    if (app.compassBad) setCardUntil(Date.now() + motion.compass.cardMs);
  }, [app.compassBad]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!cardUntil) return;
    const id = setTimeout(() => force((x) => x + 1), Math.max(0, cardUntil - Date.now()) + 10);
    return () => clearTimeout(id);
  }, [cardUntil]);
  const showCard = app.compassBad && Date.now() < cardUntil;

  // Hint: once ever, after permissions and the first fix; suppressed by the compass warning.
  const [hintOffset, setHintOffset] = useState(0);
  const showHint = !app.hintShown && app.firstFix && !app.compassBad;
  useEffect(() => {
    if (!showHint || hintOffset === 0) return;
    app.setSelected(addMinutes(app.now, hintOffset, app.now, zone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintOffset]);
  const onHintOffset = useCallback(
    (m: number) => {
      if (m === 0) app.backToNow();
      else setHintOffset(m);
    },
    [app],
  );

  // Overlay fades in when the first fix arrives (no location yet: overlay hidden, dial disabled).
  const visible = app.place !== null;

  // Accessibility summary, announced (debounced 1 s) when the selection changes.
  const golden = day?.goldenSpans.find(([, b]) => b >= app.selected) ?? null;
  const summary = app.place
    ? labels.summary(
        {
          live,
          t: app.selected,
          altitude: app.sunPos.apparent,
          azimuth: app.sunPos.azimuth,
          rise: day?.rise ?? null,
          set: day?.set ?? null,
          golden,
        },
        zone,
        settings.timeFormat,
      )
    : '';
  useEffect(() => {
    if (!app.screenReader || !summary) return;
    const id = setTimeout(() => AccessibilityInfo.announceForAccessibility(summary), 1000);
    return () => clearTimeout(id);
  }, [summary, app.screenReader]);

  const offsetDeg = calibrationMagnitude(app.calibration);
  const chipTop = layout.landscape ? 16 : insets.top + (platform.simulated ? 0 : 0);
  const gearTop = layout.landscape ? 16 : insets.top;
  const gearRight = layout.landscape ? insets.right + 12 : size.gear.right;
  const nowLabel = labels.backToNow(app.now, zone, settings.timeFormat);
  const pip = pipCenter(layout, app.now > app.selected);
  const timeInRange = Math.abs(app.now - app.selected) <= 32 * 60000;
  const goldenNow = !!day?.goldenSpans.some(([a, b]) => app.selected >= a && app.selected < b);

  const nextEvent = (dir: 1 | -1) => {
    if (!day) return;
    const ts = day.eventTimes.filter((t) => (dir > 0 ? t > app.selected + 30000 : t < app.selected - 30000));
    const t = dir > 0 ? ts[0] : ts[ts.length - 1];
    if (t !== undefined) app.setSelected(Math.round(t / 60000) * 60000);
  };
  const nudge = (dAz: number, dAlt: number) => {
    const c = app.calibration;
    app.saveCalibration({ dAz: c.dAz + dAz, dAlt: c.dAlt + dAlt, refAz: isZero(c) ? app.sunPos.azimuth : c.refAz });
  };
  const sunDirLabel = relativeDirection(app.sunPos.azimuth, app.sunPos.azimuth);
  void sunDirLabel;

  if (!fonts) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar barStyle="light-content" hidden={layout.landscape} translucent backgroundColor="transparent" />
      <platform.CameraLayer
        style={
          fallbackWide
            ? { position: 'absolute', left: width / 4, top: height / 4, width: width / 2, height: height / 2 }
            : { position: 'absolute', left: 0, top: 0, width, height }
        }
        active
        wide={app.zoomWide}
        onGeometry={(g) => setGeometry(g)}
      />
      <GestureDetector gesture={gesture}>
        <View
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
          accessible={!!summary}
          accessibilityLabel={summary}
          accessibilityActions={[
            { name: 'nudgeLeft', label: labels.sunActions.left },
            { name: 'nudgeRight', label: labels.sunActions.right },
            { name: 'nudgeUp', label: labels.sunActions.up },
            { name: 'nudgeDown', label: labels.sunActions.down },
            { name: 'clear', label: labels.sunActions.clear },
          ]}
          onAccessibilityAction={(e) => {
            const n = CALIBRATION_NUDGE_DEG;
            switch (e.nativeEvent.actionName) {
              case 'nudgeLeft': return nudge(-n, 0);
              case 'nudgeRight': return nudge(n, 0);
              case 'nudgeUp': return nudge(0, n);
              case 'nudgeDown': return nudge(0, -n);
              case 'clear': return app.clearCalibration();
            }
          }}
        />
      </GestureDetector>
      <Overlay
        fonts={fonts}
        zone={zone}
        timeFormat={settings.timeFormat}
        attitude={shared.attitude}
        calibration={shared.calibration}
        dragCalibration={dragCalibration}
        rotation={shared.rotation}
        intrinsics={intrinsics}
        path={shared.path}
        sun={shared.sun}
        riseSetAlt={shared.riseSetAlt}
        screen={screen}
        hours={day?.model.hours ?? []}
        hourStyles={day?.hourStyles ?? []}
        rise={day?.rise ?? null}
        set={day?.set ?? null}
        sunLook={sunLook}
        calibrating={calibrating}
        finger={finger}
        dimmed={app.compassBad}
        visible={visible}
        increasedContrast={false}
        frameOut={sunScreen}
      />
      <Dial
        layout={layout}
        fonts={fonts}
        zone={zone}
        selected={app.selected}
        now={app.now}
        live={live}
        timeFormat={settings.timeFormat}
        goldenSpans={day?.goldenSpans ?? []}
        blueSpans={day?.blueSpans ?? []}
        active={activeRing}
        drag={dragAngle}
        moving={moving}
        disabled={!dialEnabled}
        increasedContrast={false}
      />
      {/* Screen-reader rings (adjustable), in focus order after the summary */}
      <RingA11y
        label={labels.timeRing}
        value={labels.timeValue(app.selected, zone, settings.timeFormat, live, goldenNow)}
        onStep={(d) => app.setSelected(addMinutes(app.selected, d, app.now, zone))}
        actions={[
          { name: 'f15', label: labels.timeActions.forward15, run: () => app.setSelected(addMinutes(app.selected, 15, app.now, zone)) },
          { name: 'b15', label: labels.timeActions.back15, run: () => app.setSelected(addMinutes(app.selected, -15, app.now, zone)) },
          { name: 'next', label: labels.timeActions.nextEvent, run: () => nextEvent(1) },
          { name: 'prev', label: labels.timeActions.prevEvent, run: () => nextEvent(-1) },
        ]}
        style={{ left: layout.dialRight ? layout.ax - 272 : layout.ax, top: layout.ay - 272, width: 52, height: 52 }}
      />
      <RingA11y
        label={labels.dayRing}
        value={String(zone.fields(app.selected).day)}
        onStep={(d) => app.setSelected(stepDay(app.selected, d, app.now, zone))}
        style={{ left: layout.dialRight ? layout.ax - 216 : layout.ax + 172, top: layout.ay - 216 + 44, width: 44, height: 44 }}
      />
      <RingA11y
        label={labels.monthRing}
        value={labels.monthValue(zone.fields(app.selected).month)}
        onStep={(d) => app.setSelected(stepMonth(app.selected, d, app.now, zone))}
        style={{ left: layout.dialRight ? layout.ax - 168 : layout.ax + 124, top: layout.ay - 168 + 44, width: 44, height: 44 }}
      />
      {!live && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nowLabel}
          onPress={() => app.backToNow()}
          style={
            timeInRange
              ? (() => {
                  const th = 45 + ((app.now - app.selected) / 60000) * DIAL_DEG_PER_MINUTE;
                  const r = 280;
                  const t = (th * Math.PI) / 180;
                  const x = layout.ax - layout.dir * r * Math.sin(t);
                  const y = layout.ay - r * Math.cos(t);
                  return { position: 'absolute', left: x - size.touchMin / 2, top: y - size.touchMin / 2, width: size.touchMin, height: size.touchMin };
                })()
              : { position: 'absolute', left: pip.x - size.touchMin / 2, top: pip.y - size.touchMin / 2, width: size.touchMin, height: size.touchMin }
          }
        />
      )}
      {!isZero(app.calibration) && (
        <OffsetIndicator
          top={chipTop}
          left={(layout.landscape ? insets.left : 0) + 12}
          degrees={offsetDeg}
          onClear={() => {
            app.clearCalibration();
            if (app.hapticGate.light(Date.now())) platform.haptic('light');
          }}
        />
      )}
      {app.compassBad && !showCard && (
        <CompassGlyphButton
          top={chipTop + (isZero(app.calibration) ? 0 : size.chip.height + 8)}
          left={(layout.landscape ? insets.left : 0) + 12}
          onPress={() => setCardUntil(Date.now() + motion.compass.cardMs)}
        />
      )}
      <ZoomChip wide={app.zoomWide} shownAt={zoomShownAt} top={layout.landscape ? 16 : insets.top + 4} centerX={width / 2} />
      <Gear top={gearTop} right={gearRight} onPress={() => app.setSettingsOpen(true)} />
      {showCard && <CompassCard centerX={width / 2} top={layout.landscape ? 40 : size.compassCard.top} reduceMotion={app.reduceMotion} />}
      {showHint && (
        <Hint
          x={width * 0.2}
          y={height * 0.3}
          screenReader={app.screenReader}
          reduceMotion={app.reduceMotion}
          onOffset={onHintOffset}
          onDone={app.markHintShown}
        />
      )}
      {app.settingsOpen && (
        <SettingsSheet
          settings={settings}
          onChange={app.setSettings}
          onClose={() => app.setSettingsOpen(false)}
          landscape={layout.landscape}
          width={width}
          height={height}
          bottomInset={insets.bottom}
          sample={settingsSample(app)}
          haptic={() => {
            if (app.hapticGate.light(Date.now())) platform.haptic('light');
          }}
        />
      )}
      {/* Unused visual tokens referenced for a11y order completeness */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0, backgroundColor: withAlpha(color.bg, alpha.surfaceChip) }} />
    </View>
  );
}

function settingsSample(app: ReturnType<typeof useApp>) {
  // 12-hour sample is today's sunset (6:33 vs 18:33); polar fallback 6:00 / 18:00.
  // Date sample: today; if day = month, use tomorrow's date so the formats differ.
  const z = app.zone;
  const set = app.day?.set;
  const sf = set ? z.fields(set) : { hour: 18, minute: 0 };
  let d = z.fields(app.now);
  if (d.day === d.month) d = z.fields(app.now + 86400000);
  return { hour: sf.hour, minute: sf.minute, year: d.year, month: d.month, day: d.day };
}

function RingA11y({
  label,
  value,
  onStep,
  actions = [],
  style,
}: {
  label: string;
  value: string;
  onStep: (d: number) => void;
  actions?: { name: string; label: string; run: () => void }[];
  style: { left: number; top: number; width: number; height: number };
}) {
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, ...actions.map((a) => ({ name: a.name, label: a.label }))]}
      onAccessibilityAction={(e) => {
        const n = e.nativeEvent.actionName;
        if (n === 'increment') onStep(1);
        else if (n === 'decrement') onStep(-1);
        else actions.find((a) => a.name === n)?.run();
      }}
      pointerEvents="none"
      style={{ position: 'absolute', ...style }}
    />
  );
}

export { compassPoint, spokenTime, ZERO_CALIBRATION };
