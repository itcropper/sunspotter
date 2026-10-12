// Thumb dial (C-Dial): time, day and month rings anchored to the bottom corner on the dial side.
import {
  Canvas,
  Circle,
  Group,
  Paragraph,
  Path,
  Skia,
  type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import { DIAL_DEG_PER_DAY, DIAL_DEG_PER_MINUTE, DIAL_DEG_PER_MONTH, DIAL_NOW_TICK_WINDOW_MIN } from '../core/constants';
import { formatClock } from '../core/format';
import { daysInMonth } from '../core/selection';
import type { LocalZone } from '../core/timezone';
import { alpha, color, size, stroke, type, withAlpha } from '../theme/tokens';
import type { Layout, Ring } from './geometry';
import { polar } from './geometry';
import { makeLabel } from './text';

export type DialProps = {
  layout: Layout;
  fonts: SkTypefaceFontProvider;
  zone: LocalZone;
  selected: number;
  now: number;
  live: boolean;
  timeFormat: '12' | '24';
  goldenSpans: [number, number][];
  blueSpans: [number, number][];
  /** Ring being dragged, if any. */
  active: Ring | null;
  /** Fractional drag angle (deg) for the active ring; ghost ticks trail 3° behind while moving. */
  drag: SharedValue<number>;
  moving: boolean;
  disabled: boolean;
  increasedContrast: boolean;
};

const D = size.dial;

function arcPath(l: Layout, r: number, from: number, to: number) {
  const p = Skia.Path.Make();
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 2));
  for (let i = 0; i <= steps; i++) {
    const q = polar(l, r, from + ((to - from) * i) / steps);
    if (i === 0) p.moveTo(q.x, q.y);
    else p.lineTo(q.x, q.y);
  }
  return p;
}

function bandPath(l: Layout, r0: number, r1: number, from = 0, to = 90) {
  const p = Skia.Path.Make();
  const steps = 45;
  for (let i = 0; i <= steps; i++) {
    const q = polar(l, r1, from + ((to - from) * i) / steps);
    if (i === 0) p.moveTo(q.x, q.y);
    else p.lineTo(q.x, q.y);
  }
  for (let i = steps; i >= 0; i--) {
    const q = polar(l, r0, from + ((to - from) * i) / steps);
    p.lineTo(q.x, q.y);
  }
  p.close();
  return p;
}

function minuteColor(t: number, zone: LocalZone, golden: [number, number][], blue: [number, number][]) {
  if (golden.some(([a, b]) => t >= a && t < b)) return color.golden;
  if (blue.some(([a, b]) => t >= a && t < b)) return color.blueText;
  return zone.fields(t).hour < 12 ? color.am : color.pm;
}

export function Dial(p: DialProps) {
  const { layout: l, fonts, zone, selected, now, live, timeFormat } = p;
  const sel = D.selectionDeg;
  const ringFill = p.increasedContrast ? alpha.increasedContrastRing : alpha.surfaceChip;

  const fill = (ring: Ring) =>
    p.active === ring ? alpha.dialActiveFill : p.active ? alpha.dialInactiveFill : ringFill;
  const border = (ring: Ring) =>
    p.active === ring ? alpha.dialActiveBorder : p.active ? alpha.dialInactiveBorder : alpha.ringBorder;
  const readoutAlpha = (ring: Ring) => (p.active && p.active !== ring ? alpha.dialInactiveReadout : 1);

  const bands = useMemo(
    () => ({
      time: bandPath(l, D.time[0], D.time[1]),
      day: bandPath(l, D.day[0], D.day[1]),
      month: bandPath(l, D.month[0], D.month[1]),
      wedge: bandPath(l, D.month[0], D.time[1], D.wedgeDeg[0], D.wedgeDeg[1]),
      notch: (() => {
        const tip = polar(l, D.notch[0], sel);
        const a = polar(l, D.notch[1], sel - D.notchWidthDeg / 2);
        const b = polar(l, D.notch[1], sel + D.notchWidthDeg / 2);
        const path = Skia.Path.Make();
        path.moveTo(tip.x, tip.y);
        path.lineTo(a.x, a.y);
        path.lineTo(b.x, b.y);
        path.close();
        return path;
      })(),
    }),
    [l, sel],
  );

  const selMinute = Math.floor(selected / 60000) * 60000;
  // Minute at angle θ on the time ring: θ = 45 + 1.4·Δ (later toward the bottom-left end).
  const minuteAt = (theta: number) => selMinute + Math.round((theta - sel) / DIAL_DEG_PER_MINUTE) * 60000;
  const angleOf = (t: number) => sel + ((t - selMinute) / 60000) * DIAL_DEG_PER_MINUTE;

  const timeRing = useMemo(() => {
    const ticks = Skia.Path.Make();
    const labels: { x: number; y: number; t: number }[] = [];
    const startMin = minuteAt(-2);
    for (let t = startMin - 5 * 60000; t <= minuteAt(92) + 5 * 60000; t += 60000) {
      const f = zone.fields(t);
      if (f.minute % 5 !== 0) continue;
      const th = angleOf(t);
      if (th < 0 || th > 90) continue;
      const major = f.minute % 15 === 0;
      const r0 = major ? D.tickMajor[0] : D.tickMinor[0];
      const a = polar(l, r0, th);
      const b = polar(l, D.tickMinor[1], th);
      ticks.moveTo(a.x, a.y);
      ticks.lineTo(b.x, b.y);
      if (major && Math.abs(th - sel) > D.labelHideDeg) labels.push({ ...polar(l, D.labelTime, th), t });
    }
    // Inner track (AM mint / PM peach) with a cream tick at each 12:00; outer track golden/blue.
    const inner: { path: ReturnType<typeof Skia.Path.Make>; c: string }[] = [];
    const outer: { path: ReturnType<typeof Skia.Path.Make>; c: string }[] = [];
    const noonTicks = Skia.Path.Make();
    let runStart = 0;
    let runPm = zone.fields(minuteAt(0)).hour >= 12;
    for (let th = 0; th <= 90; th += 0.7) {
      const pm = zone.fields(minuteAt(th)).hour >= 12;
      if (pm !== runPm || th + 0.7 > 90) {
        inner.push({ path: arcPath(l, D.trackInner, runStart, th), c: runPm ? color.pm : color.am });
        if (pm !== runPm && zone.fields(minuteAt(th)).hour === 12) {
          const a = polar(l, D.trackInner - 6, th);
          const b = polar(l, D.trackInner + 6, th);
          noonTicks.moveTo(a.x, a.y);
          noonTicks.lineTo(b.x, b.y);
        }
        runStart = th;
        runPm = pm;
      }
    }
    const span = (spans: [number, number][], c: string) => {
      for (const [a, b] of spans) {
        const ta = Math.max(0, angleOf(a));
        const tb = Math.min(90, angleOf(b));
        if (tb > ta) outer.push({ path: arcPath(l, D.trackOuter, ta, tb), c });
      }
    };
    span(p.goldenSpans, color.golden);
    span(p.blueSpans, color.blue);
    return { ticks, labels, inner, outer, noonTicks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, selMinute, zone, p.goldenSpans, p.blueSpans]);

  const f = zone.fields(selected);
  const labels = useMemo(() => {
    const mk = (text: string, size: number, weight: 500 | 700, c: string, op = 1) =>
      makeLabel(fonts, text, { size, weight, color: c, opacity: op, casing: false });
    const timeColor = minuteColor(selMinute, zone, p.goldenSpans, p.blueSpans);
    const days = daysInMonth(f.year, f.month);
    const dayN = (d: number) => ((((f.day - 1 + d) % days) + days) % days) + 1;
    const monN = (d: number) => ((((f.month - 1 + d) % 12) + 12) % 12) + 1;
    return {
      time: mk(formatClock(f.hour, f.minute, timeFormat), p.active === 'time' ? type.dialTime.sizeActive : type.dialTime.size, 700, timeColor, readoutAlpha('time')),
      day: mk(String(f.day), type.dialDay.size, 700, color.white, readoutAlpha('day')),
      month: mk(String(f.month), type.dialMonth.size, 700, color.white, readoutAlpha('month')),
      dayNeighbors: [-2, -1, 1, 2].map((d) => ({ d, l: mk(String(dayN(d)), type.dialLabel.size, 500, color.ui, alpha.dialNeighbor) })),
      monthNeighbors: [-1, 1].map((d) => ({ d, l: mk(String(monN(d)), type.dialLabel.size, 500, color.ui, alpha.dialNeighbor) })),
      timeLabels: timeRing.labels.map((x) => {
        const ff = zone.fields(x.t);
        const c = minuteColor(x.t, zone, p.goldenSpans, p.blueSpans);
        return { ...x, l: mk(formatClock(ff.hour, ff.minute, timeFormat), type.dialLabel.size, 500, c, c === color.golden ? 1 : alpha.dialNeighbor) };
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, selMinute, timeFormat, p.active, timeRing, zone, p.goldenSpans, p.blueSpans]);

  const place = (lab: { width: number; height: number }, pt: { x: number; y: number }) => ({
    x: pt.x - lab.width / 2,
    y: pt.y - lab.height / 2,
  });

  // Now marker: red notch when live, else a red tick on the ring (±32 min) or a pip past the end.
  const nowTheta = angleOf(Math.floor(now / 60000) * 60000);
  const nowOnRing = !live && Math.abs(now - selected) <= DIAL_NOW_TICK_WINDOW_MIN * 60000;
  const nowLater = now > selected;

  const timeOffset = useDerivedValue(() => [
    { translateX: l.ax },
    { translateY: l.ay },
    { rotate: (-l.dir * (p.active === 'time' ? p.drag.value : 0) * Math.PI) / 180 },
    { translateX: -l.ax },
    { translateY: -l.ay },
  ]);
  const ghost = useDerivedValue(() => [
    { translateX: l.ax },
    { translateY: l.ay },
    { rotate: (-l.dir * ((p.active === 'time' ? p.drag.value : 0) - (p.moving ? D.ghostOffsetDeg : 0)) * Math.PI) / 180 },
    { translateX: -l.ax },
    { translateY: -l.ay },
  ]);
  const ringRotate = (ring: Ring) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => [
      { translateX: l.ax },
      { translateY: l.ay },
      { rotate: (-l.dir * (p.active === ring ? p.drag.value : 0) * Math.PI) / 180 },
      { translateX: -l.ax },
      { translateY: -l.ay },
    ]);
  const dayRotate = ringRotate('day');
  const monthRotate = ringRotate('month');
  void DIAL_DEG_PER_DAY;
  void DIAL_DEG_PER_MONTH;

  const ring = (key: Ring) => (
    <Group key={key}>
      <Path path={bands[key]} color={withAlpha(color.bg, fill(key))} />
      <Path path={bands[key]} style="stroke" strokeWidth={1} color={withAlpha(color.white, border(key))} />
    </Group>
  );

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width: l.width, height: l.height }} pointerEvents="none">
      <Group opacity={p.disabled ? alpha.dialDisabled : 1}>
        {ring('time')}
        {ring('day')}
        {ring('month')}
        {!p.active && <Path path={bands.wedge} color={withAlpha(color.white, alpha.ringWedge)} />}
        {timeRing.inner.map((s, i) => (
          <Path key={`in${i}`} path={s.path} style="stroke" strokeWidth={stroke.dialTrack} color={withAlpha(s.c, alpha.innerTrack)} />
        ))}
        <Path path={timeRing.noonTicks} style="stroke" strokeWidth={stroke.tickWidth} color={color.ui} />
        {p.moving && p.active === 'time' && (
          <Group transform={ghost}>
            <Path path={timeRing.ticks} style="stroke" strokeWidth={stroke.dialTick} strokeCap="round" color={withAlpha(color.ui, alpha.ghostTicks)} />
          </Group>
        )}
        <Group transform={timeOffset}>
          <Path path={timeRing.ticks} style="stroke" strokeWidth={stroke.dialTick} strokeCap="round" color={withAlpha(color.ui, p.active === 'time' ? 1 : alpha.dialTick)} />
          {labels.timeLabels.map((x, i) => (
            <Paragraph key={`tl${i}`} paragraph={x.l.fill} {...place(x.l, x)} width={1000} />
          ))}
        </Group>
        {timeRing.outer.map((s, i) => (
          <Path key={`out${i}`} path={s.path} style="stroke" strokeWidth={stroke.dialTrack} color={s.c} />
        ))}
        <Group transform={dayRotate}>
          {labels.dayNeighbors.map(({ d, l: lab }) => (
            <Paragraph key={`d${d}`} paragraph={lab.fill} {...place(lab, polar(l, D.labelDay, sel + d * DIAL_DEG_PER_DAY))} width={1000} />
          ))}
        </Group>
        <Group transform={monthRotate}>
          {labels.monthNeighbors.map(({ d, l: lab }) => (
            <Paragraph key={`m${d}`} paragraph={lab.fill} {...place(lab, polar(l, D.labelMonth, sel + d * DIAL_DEG_PER_MONTH))} width={1000} />
          ))}
        </Group>
        <Paragraph paragraph={labels.time.fill} {...place(labels.time, polar(l, D.labelTime, sel))} width={1000} />
        <Paragraph paragraph={labels.day.fill} {...place(labels.day, polar(l, D.labelDay, sel))} width={1000} />
        <Paragraph paragraph={labels.month.fill} {...place(labels.month, polar(l, D.labelMonth, sel))} width={1000} />
        <Path path={bands.notch} color={live ? color.now : color.ui} />
        <Path path={bands.notch} style="stroke" strokeWidth={1.5} strokeJoin="round" color={color.bg} />
        {nowOnRing && nowTheta >= 0 && nowTheta <= 90 && (
          <Group>
            {(() => {
              const a = polar(l, D.nowTick[0], nowTheta);
              const b = polar(l, D.nowTick[1], nowTheta);
              const path = Skia.Path.Make();
              path.moveTo(a.x, a.y);
              path.lineTo(b.x, b.y);
              const dot = polar(l, D.nowDotR, nowTheta);
              return (
                <>
                  <Path path={path} style="stroke" strokeWidth={stroke.nowTick} strokeCap="round" color={color.now} />
                  <Circle cx={dot.x} cy={dot.y} r={D.nowDot / 2} color={color.now} />
                  <Circle cx={dot.x} cy={dot.y} r={D.nowDot / 2} style="stroke" strokeWidth={1.5} color={color.bg} />
                </>
              );
            })()}
          </Group>
        )}
        {!live && !nowOnRing && (
          <NowPip l={l} later={nowLater} />
        )}
      </Group>
    </Canvas>
  );
}

/** Red pip with chevron just outside the ring end that now lies beyond (C-Indicators). */
export function pipCenter(l: Layout, later: boolean) {
  return polar(l, D.pipR, later ? D.pipAngleLater : D.pipAngleEarlier);
}

function NowPip({ l, later }: { l: Layout; later: boolean }) {
  // θ 12° (toward the top end) when now is later... the top end holds earlier values, so a later
  // "now" sits beyond the bottom-left end. Spec: θ 72° if earlier, θ 12° if later.
  const c = pipCenter(l, later);
  const chevron = Skia.Path.Make();
  // Chevron points away from the ring along the radial direction.
  const out = polar(l, D.pipR + 13, later ? D.pipAngleLater : D.pipAngleEarlier);
  const nx = out.x - c.x;
  const ny = out.y - c.y;
  const len = Math.hypot(nx, ny) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const tip = { x: c.x + ux * 14, y: c.y + uy * 14 };
  chevron.moveTo(tip.x - ux * 7 - uy * 7, tip.y - uy * 7 + ux * 7);
  chevron.lineTo(tip.x, tip.y);
  chevron.lineTo(tip.x - ux * 7 + uy * 7, tip.y - uy * 7 - ux * 7);
  return (
    <Group>
      <Path path={chevron} style="stroke" strokeWidth={2.5} strokeCap="round" strokeJoin="round" color={color.now} />
      <Circle cx={c.x} cy={c.y} r={D.pip / 2} color={color.now} />
      <Circle cx={c.x} cy={c.y} r={D.pip / 2} style="stroke" strokeWidth={1.5} color={color.bg} />
    </Group>
  );
}
