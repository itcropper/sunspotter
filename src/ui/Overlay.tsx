// The AR overlay (C-Sun, C-Path, C-Markers, C-EdgeArrows, C-Legibility). Geometry is
// re-projected every frame on the UI thread from the latest attitude; nothing here runs on JS
// per frame.
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Paragraph,
  Path,
  RadialGradient,
  Skia,
  type SkPath,
  type SkTypefaceFontProvider,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { Calibration, Intrinsics, Quat } from '../core/projection';
import { viewMatrix } from '../core/projection';
import { formatHourNumeral, formatTime, type TimeFormat } from '../core/format';
import type { LocalZone } from '../core/timezone';
import { alpha, color, motion, size, stroke, type, withAlpha } from '../theme/tokens';
import { computeFrame, type Frame, type PathModel, type Screen, STYLE_KEYS } from './overlayModel';
import { makeLabel, type Label } from './text';

const STYLE_COLOR: string[] = STYLE_KEYS.map((k) =>
  k === 'nightAm' ? withAlpha(color.am, alpha.nightPath)
  : k === 'nightPm' ? withAlpha(color.pm, alpha.nightPath)
  : k === 'dayAm' ? color.am
  : k === 'dayPm' || k === 'dayHidden' ? color.pm
  : k === 'blue' ? color.blue
  : color.golden,
);
const STYLE_WIDTH: number[] = STYLE_KEYS.map((k) =>
  k === 'nightAm' || k === 'nightPm' ? stroke.pathNight
  : k === 'dayAm' || k === 'dayPm' || k === 'dayHidden' ? stroke.pathDay
  : k === 'golden' ? stroke.pathGolden
  : stroke.pathHidden,
);

export type SunLook = {
  /** Ring color: white normally; segment color on an event or below the horizon. */
  ring: string;
  below: boolean;
  event: boolean;
};

export type OverlayProps = {
  fonts: SkTypefaceFontProvider;
  zone: LocalZone;
  timeFormat: TimeFormat;
  attitude: SharedValue<Quat>;
  calibration: SharedValue<Calibration>;
  /** Live calibration while dragging (null when not dragging). */
  dragCalibration: SharedValue<Calibration | null>;
  rotation: SharedValue<number>;
  intrinsics: SharedValue<Intrinsics>;
  path: SharedValue<PathModel>;
  sun: SharedValue<{ x: number; y: number; z: number; altitude: number; azimuth: number }>;
  riseSetAlt: SharedValue<[number, number]>;
  screen: Screen;
  hours: number[];
  hourStyles: number[];
  rise: number | null;
  set: number | null;
  sunLook: SunLook;
  calibrating: SharedValue<boolean>;
  finger: SharedValue<{ x: number; y: number }>;
  dimmed: boolean;
  visible: boolean;
  increasedContrast: boolean;
  frameOut: SharedValue<{ x: number; y: number }>;
};

function pathFromRuns(runs: number[][]): SkPath {
  'worklet';
  const p = Skia.Path.Make();
  for (const r of runs) {
    p.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
  }
  return p;
}

export function Overlay(props: OverlayProps) {
  const { screen, fonts } = props;
  const casingA = props.increasedContrast ? alpha.increasedContrastCasing : alpha.casingStroke;

  const frame = useDerivedValue<Frame>(() => {
    const cal = props.dragCalibration.value ?? props.calibration.value;
    const m = viewMatrix(props.attitude.value, cal, props.rotation.value);
    const f = computeFrame(
      m,
      props.intrinsics.value,
      screen,
      props.path.value,
      props.sun.value,
      props.riseSetAlt.value[0],
      props.riseSetAlt.value[1],
      stroke.dash[0],
      stroke.dash[1],
    );
    props.frameOut.value = f.sunCenter;
    return f;
  });

  const linePaths = STYLE_KEYS.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => pathFromRuns(frame.value.lines[i])),
  );
  const horizonPath = useDerivedValue(() => pathFromRuns(frame.value.horizon));
  const ticksPath = useDerivedValue(() => {
    const t = frame.value.ticks;
    const p = Skia.Path.Make();
    for (let i = 0; i < t.length; i += 4) {
      p.moveTo(t[i], t[i + 1]);
      p.lineTo(t[i + 2], t[i + 3]);
    }
    return p;
  });

  // Sun marker position: lifted 56 pt above the finger while calibrating.
  const sunX = useDerivedValue(() => frame.value.sun.x);
  const sunY = useDerivedValue(() => frame.value.sun.y);
  const sunOpacity = useDerivedValue(() => (frame.value.sun.visible ? 1 : 0));
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (props.sunLook.event) {
      pulse.value = 0;
      pulse.value = withTiming(1, { duration: motion.eventPulseMs });
    }
  }, [props.sunLook.event, pulse]);
  const eventR = useDerivedValue(() => (size.sun.ring + (size.sun.eventRing - size.sun.ring) * pulse.value) / 2);
  const eventOpacity = useDerivedValue(() => (props.sunLook.event ? 1 - (1 - alpha.eventRing) * pulse.value : 0));
  const notCalibrating = useDerivedValue(() => (props.calibrating.value ? 0 : 1));
  const isCalibrating = useDerivedValue(() => (props.calibrating.value ? 1 : 0));

  // Labels: built on JS when the date or format changes.
  const hourLabels = useMemo<Label[]>(
    () =>
      props.hours.map((h, i) => {
        const st = STYLE_KEYS[props.hourStyles[i]] ?? 'dayAm';
        const c = st === 'golden' || st === 'goldenHidden' ? color.golden
          : st === 'blue' ? color.blueText
          : h < 12 ? color.am : color.pm;
        return makeLabel(fonts, formatHourNumeral(h, props.timeFormat), { size: type.pathHour.size, weight: 600, color: c });
      }),
    [fonts, props.hours, props.hourStyles, props.timeFormat],
  );
  const riseLabel = useMemo(
    () => (props.rise === null ? null : makeLabel(fonts, formatTime(props.rise, props.zone, props.timeFormat), { size: type.event.size, weight: 600, color: color.ui })),
    [fonts, props.rise, props.zone, props.timeFormat],
  );
  const setLabel = useMemo(
    () => (props.set === null ? null : makeLabel(fonts, formatTime(props.set, props.zone, props.timeFormat), { size: type.event.size, weight: 600, color: color.ui })),
    [fonts, props.set, props.zone, props.timeFormat],
  );
  const tabLabels = useMemo(
    () => ({
      rise: props.rise === null ? null : makeLabel(fonts, formatTime(props.rise, props.zone, props.timeFormat), { size: type.event.size, weight: 600, color: color.ui, casing: false }),
      set: props.set === null ? null : makeLabel(fonts, formatTime(props.set, props.zone, props.timeFormat), { size: type.event.size, weight: 600, color: color.ui, casing: false }),
    }),
    [fonts, props.rise, props.set, props.zone, props.timeFormat],
  );

  const glowShader = useMemo(() => [withAlpha(color.sunCore, 0.9), withAlpha(color.sunGlow, 0.35), withAlpha(color.sunGlow, 0)], []);
  const ringColor = props.sunLook.ring;
  const sunTransform = useDerivedValue(() => [{ translateX: sunX.value }, { translateY: sunY.value }]);
  const liftTransform = useDerivedValue(() => [
    { translateX: props.finger.value.x },
    { translateY: props.finger.value.y - 56 },
  ]);
  const opacity = props.visible ? (props.dimmed ? alpha.compassDim : 1) : 0;

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width: screen.width, height: screen.height }} pointerEvents="none">
      <Group opacity={opacity}>
        {/* Horizon (apparent altitude 0°) */}
        <Path path={horizonPath} style="stroke" strokeWidth={stroke.horizonCasing} color={withAlpha(color.bg, casingA)} />
        <Path path={horizonPath} style="stroke" strokeWidth={stroke.horizon} color={color.ui} />
        {/* Path casings, then colored strokes */}
        {linePaths.map((p, i) => (
          <Path key={`c${i}`} path={p} style="stroke" strokeWidth={STYLE_WIDTH[i] + stroke.casingExtra} strokeJoin="round" strokeCap={i <= 2 || i === 5 || i === 6 ? 'butt' : 'round'} color={withAlpha(color.bg, casingA)} />
        ))}
        {linePaths.map((p, i) => (
          <Path key={`p${i}`} path={p} style="stroke" strokeWidth={STYLE_WIDTH[i]} strokeJoin="round" strokeCap={i <= 2 || i === 5 || i === 6 ? 'butt' : 'round'} color={STYLE_COLOR[i]} />
        ))}
        {/* Hour ticks and numerals */}
        <Path path={ticksPath} style="stroke" strokeWidth={stroke.tickCasing} strokeCap="round" color={withAlpha(color.bg, casingA)} />
        <Path path={ticksPath} style="stroke" strokeWidth={stroke.tickWidth} strokeCap="round" color={color.ui} />
        {hourLabels.map((lab, i) => (
          <HourLabel key={`h${i}`} frame={frame} index={i} label={lab} />
        ))}
        {/* Astronomical sunrise/sunset markers on the horizon */}
        <EventMarker frame={frame} which="set" label={setLabel} casingA={casingA} />
        <EventMarker frame={frame} which="rise" label={riseLabel} casingA={casingA} />
        {/* Edge tabs */}
        <EdgeTabs frame={frame} screen={screen} riseLabel={tabLabels.rise} setLabel={tabLabels.set} />
        {/* Sun marker: top overlay layer */}
        <Group opacity={sunOpacity}>
          <Group transform={sunTransform} opacity={notCalibrating}>
            <Circle cx={0} cy={0} r={size.sun.glow / 2}>
              <RadialGradient c={vec(0, 0)} r={size.sun.glow / 2} colors={glowShader} positions={[0, 0.45, 1]} />
            </Circle>
            <Circle cx={0} cy={0} r={eventR} style="stroke" strokeWidth={2} color={withAlpha(ringColor, alpha.eventRing)} opacity={eventOpacity} />
            <Circle cx={0} cy={0} r={size.sun.ring / 2} style="stroke" strokeWidth={stroke.sunRingCasing} color={withAlpha(color.bg, casingA)} />
            <Circle cx={0} cy={0} r={size.sun.ring / 2} style="stroke" strokeWidth={props.sunLook.event ? 2.5 : stroke.sunRing} color={ringColor}>
              {props.sunLook.below && <DashPathEffect intervals={[4, 3]} />}
            </Circle>
            {props.sunLook.below ? (
              <Circle cx={0} cy={0} r={size.sun.core / 2} style="stroke" strokeWidth={1.5} color={color.sunCore} />
            ) : (
              <>
                <Circle cx={0} cy={0} r={size.sun.core / 2} color={color.sunCore} />
                <Circle cx={0} cy={0} r={size.sun.core / 2} style="stroke" strokeWidth={1.5} color={withAlpha(color.bg, casingA)} />
              </>
            )}
          </Group>
        </Group>
        {/* Lifted (calibrating): hollow so the real sun shows through */}
        <Group transform={liftTransform} opacity={isCalibrating}>
          <Circle cx={0} cy={0} r={size.sun.liftedRing / 2} style="stroke" strokeWidth={stroke.sunRingCasing} color={withAlpha(color.bg, casingA)} />
          <Circle cx={0} cy={0} r={size.sun.liftedRing / 2} style="stroke" strokeWidth={stroke.sunRing} color={color.sunCore} />
          <Circle cx={0} cy={0} r={size.sun.hollowCore / 2} style="stroke" strokeWidth={1.5} color={color.sunCore} />
        </Group>
      </Group>
    </Canvas>
  );
}

function HourLabel({ frame, index, label }: { frame: SharedValue<Frame>; index: number; label: Label }) {
  const x = useDerivedValue(() => (frame.value.hourLabels[index]?.x ?? 0) - label.width / 2);
  const y = useDerivedValue(() => (frame.value.hourLabels[index]?.y ?? 0) - label.height / 2);
  const op = useDerivedValue(() => (frame.value.hourLabels[index]?.visible ? 1 : 0));
  return (
    <Group opacity={op}>
      {label.casing && <Paragraph paragraph={label.casing} x={x} y={y} width={1000} />}
      <Paragraph paragraph={label.fill} x={x} y={y} width={1000} />
    </Group>
  );
}

function EventMarker({ frame, which, label, casingA }: { frame: SharedValue<Frame>; which: 'rise' | 'set'; label: Label | null; casingA: number }) {
  const R = size.marker.arcR;
  const glyph = useMemo(() => {
    const arc = Skia.Path.Make();
    arc.addArc({ x: -R, y: -R, width: 2 * R, height: 2 * R }, 180, 180);
    const tri = Skia.Path.Make();
    if (which === 'set') {
      tri.moveTo(-6, 6);
      tri.lineTo(6, 6);
      tri.lineTo(0, 13);
    } else {
      tri.moveTo(-6, 13);
      tri.lineTo(6, 13);
      tri.lineTo(0, 6);
    }
    tri.close();
    return { arc, tri };
  }, [R, which]);
  const t = useDerivedValue(() => {
    const m = frame.value[which];
    return [{ translateX: m.x }, { translateY: m.y }];
  });
  const op = useDerivedValue(() => (frame.value[which].visible ? 1 : 0));
  const lx = label ? -label.width / 2 : 0;
  const ly = label ? size.marker.labelOffset - label.height * 0.8 : 0;
  return (
    <Group transform={t} opacity={op}>
      <Path path={glyph.arc} style="stroke" strokeWidth={stroke.markerArcCasing} color={withAlpha(color.bg, casingA)} />
      <Path path={glyph.arc} style="stroke" strokeWidth={stroke.markerArc} color={color.ui} />
      <Path path={glyph.tri} style="stroke" strokeWidth={2} strokeJoin="round" color={color.bg} />
      <Path path={glyph.tri} color={color.ui} />
      {label?.casing && <Paragraph paragraph={label.casing} x={lx} y={ly} width={1000} />}
      {label && <Paragraph paragraph={label.fill} x={lx} y={ly} width={1000} />}
    </Group>
  );
}

const SUN_RAYS = 'M0,-11v3M0,8v3M-11,0h3M8,0h3M-7.8,-7.8l2.1,2.1M5.7,5.7l2.1,2.1M-7.8,7.8l2.1,-2.1M5.7,-5.7l2.1,-2.1';

function EdgeTabs({ frame, screen, riseLabel, setLabel }: { frame: SharedValue<Frame>; screen: Screen; riseLabel: Label | null; setLabel: Label | null }) {
  return (
    <>
      <EdgeTab frame={frame} screen={screen} index={0} label={null} />
      <EdgeTab frame={frame} screen={screen} index={1} label={setLabel} />
      <EdgeTab frame={frame} screen={screen} index={2} label={riseLabel} />
    </>
  );
}

function EdgeTab({ frame, screen, index, label }: { frame: SharedValue<Frame>; screen: Screen; index: number; label: Label | null }) {
  const T = size.edgeTab;
  const kind = index === 0 ? 0 : index === 1 ? 2 : 1;
  const bodyW = kind === 0 ? 46 : 80;
  const shapes = useMemo(() => {
    const mk = (right: boolean) => {
      const p = Skia.Path.Make();
      const s = right ? -1 : 1;
      p.moveTo(0, 0);
      p.lineTo(s * T.point, -T.height / 2);
      p.lineTo(s * (T.point + bodyW), -T.height / 2);
      p.lineTo(s * (T.point + bodyW), T.height / 2);
      p.lineTo(s * T.point, T.height / 2);
      p.close();
      return p;
    };
    const rays = Skia.Path.MakeFromSVGString(SUN_RAYS) ?? Skia.Path.Make();
    const arc = Skia.Path.Make();
    arc.addArc({ x: -8, y: -8, width: 16, height: 16 }, 180, 180);
    const tri = Skia.Path.Make();
    if (kind === 2) {
      tri.moveTo(-6, 5);
      tri.lineTo(6, 5);
      tri.lineTo(0, 11);
    } else {
      tri.moveTo(-6, 11);
      tri.lineTo(6, 11);
      tri.lineTo(0, 5);
    }
    tri.close();
    return { left: mk(false), right: mk(true), rays, arc, tri };
  }, [T, bodyW, kind]);
  const op = useDerivedValue(() => withTiming(frame.value.tabs[index]?.visible ? 1 : 0, { duration: motion.edgeTabFadeMs }));
  const right = useDerivedValue(() => frame.value.tabs[index]?.right ?? true);
  const tr = useDerivedValue(() => {
    const t = frame.value.tabs[index];
    const x = t?.right ? screen.width - screen.right - T.edgePad : screen.left + T.edgePad;
    return [{ translateX: x }, { translateY: t?.y ?? 0 }];
  });
  const leftOp = useDerivedValue(() => (right.value ? 0 : 1));
  const rightOp = useDerivedValue(() => (right.value ? 1 : 0));
  // Glyph sits next to the point; the time on the side away from the edge.
  const glyphT = useDerivedValue(() => [{ translateX: (right.value ? -1 : 1) * (T.point + (kind === 0 ? 23 : 16)) }]);
  const labelX = useDerivedValue(() => (right.value ? -(T.point + 30 + (label?.width ?? 0)) : T.point + 32));
  return (
    <Group transform={tr} opacity={op}>
      <Path path={shapes.left} color={withAlpha(color.bg, alpha.surfaceTab)} opacity={leftOp} />
      <Path path={shapes.right} color={withAlpha(color.bg, alpha.surfaceTab)} opacity={rightOp} />
      <Group transform={glyphT}>
        {kind === 0 ? (
          <>
            <Circle cx={0} cy={0} r={5} color={color.sunGlyph} />
            <Path path={shapes.rays} style="stroke" strokeWidth={2} strokeCap="round" color={color.sunGlyph} />
          </>
        ) : (
          <>
            <Path path={shapes.arc} style="stroke" strokeWidth={2} color={color.ui} />
            <Path path={shapes.tri} color={color.ui} />
          </>
        )}
      </Group>
      {label && <Paragraph paragraph={label.fill} x={labelX} y={-label.height / 2} width={1000} />}
    </Group>
  );
}
