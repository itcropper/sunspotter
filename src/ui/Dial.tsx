// Thumb dial (C-Dial): time, day and month rings anchored to the bottom corner on the dial side.
//
// UX model
// --------
// Each ring behaves like an iOS/Google picker. Numbers slide smoothly through the arc as the
// user drags/decays and are *always rendered upright* — never tilted — because each label is a
// standalone paragraph whose (x, y) is a UI-thread worklet; it has no rotating parent.
//
// Position math (purely UI-thread, no React state in the hot path)
// ----------------------------------------------------------------
// `scrubBase*` is a snapshot of the value under the notch at the moment the gesture started
// (set by `beginScrub` in MainScreen). It stays constant for the whole gesture, so each label's
// `baseAngle` is a render-time constant:
//
//     baseAngle = 45° + offset · DEG_PER_UNIT        (offset is the integer step from scrubBase)
//     angle     = baseAngle + drag.value             (drag.value changes continuously via withDecay/withSpring)
//
// The committed `selected` on JS updates lazily via `applyRing`; the center readout follows it.
// Positions never depend on `selected`, which is why label flow stays smooth across step crossings
// even when React is behind.
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
import { makeLabel, type Label } from './text';

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
  active: Ring | null;
  /** Raw rotation (deg) accumulated by the current gesture; UI thread. */
  drag: SharedValue<number>;
  /** Pool anchors: snapshotted at gesture start, stable throughout the gesture. */
  scrubBaseTime: number;
  scrubBaseDay: number;
  scrubBaseMonth: number;
  moving: boolean;
  disabled: boolean;
  increasedContrast: boolean;
};

const WEDGE_MIN = 0;
const WEDGE_MAX = 90;
const WEDGE_FADE = 6;
// Pool sizes — each capped under the one-revolution overlap limit for its ring:
//   time:  17 labels @ 15 min = ±2 h of coverage (per-label spacing 21°)
//   day:   19 labels @ 1 day  stays under the 360° / 18° = 20 overlap boundary
//   month: 12 labels @ 1 month covers exactly 360° at 30°/mo (no overlap possible)
const TIME_LABELS_PER_SIDE = 8;
const DAY_LABELS_PER_SIDE = 9;
const MONTH_LABELS_PER_SIDE = 6;
const TIME_STEP_MS = 15 * 60000;

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
  // Destructure into locals so no worklet captures `p` whole (LocalZone can't cross threads).
  const {
    layout: l,
    fonts,
    zone,
    selected,
    now,
    live,
    timeFormat,
    active,
    drag,
    scrubBaseTime,
    scrubBaseDay,
    scrubBaseMonth,
    moving,
  } = p;
  const sel = l.dial.selectionDeg;
  const ringFill = p.increasedContrast ? alpha.increasedContrastRing : alpha.surfaceChip;

  const fill = (ring: Ring) =>
    p.active === ring ? alpha.dialActiveFill : p.active ? alpha.dialInactiveFill : ringFill;
  const border = (ring: Ring) =>
    p.active === ring ? alpha.dialActiveBorder : p.active ? alpha.dialInactiveBorder : alpha.ringBorder;

  const bands = useMemo(
    () => ({
      time: bandPath(l, l.dial.time[0], l.dial.time[1]),
      day: bandPath(l, l.dial.day[0], l.dial.day[1]),
      month: bandPath(l, l.dial.month[0], l.dial.month[1]),
      wedge: bandPath(l, l.dial.month[0], l.dial.time[1], l.dial.wedgeDeg[0], l.dial.wedgeDeg[1]),
    }),
    [l],
  );

  const f = zone.fields(selected);

  // Per-ring effective drag: only the active ring moves, inactive rings stay at rest.
  const timeDrag = useDerivedValue(() => (active === 'time' ? drag.value : 0));
  const dayDrag = useDerivedValue(() => (active === 'day' ? drag.value : 0));
  const monthDrag = useDerivedValue(() => (active === 'month' ? drag.value : 0));

  // --- Time ring --------------------------------------------------------------------------------
  // Pool is anchored on the nearest 5-min boundary around scrubBaseTime so every displayed time
  // ends in a clean round number (:00, :05, :10, …) rather than an arbitrary offset from "now".
  // The anchor stays constant for the whole gesture, so each label's baseAngle is a render-time
  // constant that depends only on its integer offset from the anchor. Ticks and the AM/PM inner
  // track are generated across the full ±168° drag coverage so the pattern is continuous all the
  // way around the visible wedge no matter how fast the ring spins.
  const timeAnchor = Math.round(scrubBaseTime / (5 * 60000)) * 5 * 60000;
  const timeRing = useMemo(() => {
    // How many degrees the ring content shifts off center at rest, because the pool is centered
    // on the nearest 5-min boundary rather than on scrubBaseTime exactly.
    const anchorOffsetDeg = ((timeAnchor - scrubBaseTime) / 60000) * DIAL_DEG_PER_MINUTE;
    // Tick path: minor every 5 min, major every 15 min, covering ±120 min relative to the anchor.
    const ticks = Skia.Path.Make();
    for (let o = -120; o <= 120; o += 5) {
      const t = timeAnchor + o * 60000;
      const ff = zone.fields(t);
      if (ff.minute % 5 !== 0) continue;
      const major = ff.minute % 15 === 0;
      const base = sel + anchorOffsetDeg + o * DIAL_DEG_PER_MINUTE;
      const r0 = major ? l.dial.tickMajor[0] : l.dial.tickMinor[0];
      const a = polar(l, r0, base);
      const b = polar(l, l.dial.tickMinor[1], base);
      ticks.moveTo(a.x, a.y);
      ticks.lineTo(b.x, b.y);
    }
    // 15-min labels at anchor + i·15 min for i ∈ [-TIME_LABELS_PER_SIDE, +TIME_LABELS_PER_SIDE].
    const labels: { offset: number; label: Label; baseAngle: number }[] = [];
    for (let i = -TIME_LABELS_PER_SIDE; i <= TIME_LABELS_PER_SIDE; i++) {
      const t = timeAnchor + i * TIME_STEP_MS;
      const ff = zone.fields(t);
      const c = minuteColor(t, zone, p.goldenSpans, p.blueSpans);
      labels.push({
        offset: i,
        baseAngle: sel + anchorOffsetDeg + i * 15 * DIAL_DEG_PER_MINUTE, // 15 min · 1.4°/min = 21°
        label: makeLabel(fonts, formatClock(ff.hour, ff.minute, timeFormat), {
          size: type.dialLabel.size,
          weight: 500,
          color: c,
          opacity: 1,
          casing: false,
        }),
      });
    }
    // AM/PM inner track and the noon tick: cover the full ±168° drag range (same as ticks), so
    // the color pattern fills the band even during a long momentum spin.
    const inner: { path: ReturnType<typeof Skia.Path.Make>; c: string }[] = [];
    const noonTicks = Skia.Path.Make();
    const minuteAtAnchorRest = (theta: number) =>
      timeAnchor + Math.round((theta - sel - anchorOffsetDeg) / DIAL_DEG_PER_MINUTE) * 60000;
    const INNER_FROM = sel - 168;
    const INNER_TO = sel + 168;
    const INNER_STEP = 0.7;
    let runStart = INNER_FROM;
    let runPm = zone.fields(minuteAtAnchorRest(INNER_FROM)).hour >= 12;
    for (let th = INNER_FROM; th <= INNER_TO; th += INNER_STEP) {
      const pm = zone.fields(minuteAtAnchorRest(th)).hour >= 12;
      if (pm !== runPm || th + INNER_STEP > INNER_TO) {
        inner.push({ path: arcPath(l, l.dial.trackInner, runStart, th), c: runPm ? color.pm : color.am });
        if (pm !== runPm && zone.fields(minuteAtAnchorRest(th)).hour === 12) {
          const a = polar(l, l.dial.trackInner - 6, th);
          const b = polar(l, l.dial.trackInner + 6, th);
          noonTicks.moveTo(a.x, a.y);
          noonTicks.lineTo(b.x, b.y);
        }
        runStart = th;
        runPm = pm;
      }
    }
    // Golden/blue outer track: fixed solar events, drawn at rest coordinates (not rotated).
    const outer: { path: ReturnType<typeof Skia.Path.Make>; c: string }[] = [];
    const angleAtRest = (t: number) => sel + ((t - selected) / 60000) * DIAL_DEG_PER_MINUTE;
    const span = (spans: [number, number][], c: string) => {
      for (const [a, b] of spans) {
        const ta = Math.max(0, angleAtRest(a));
        const tb = Math.min(90, angleAtRest(b));
        if (tb > ta) outer.push({ path: arcPath(l, l.dial.trackOuter, ta, tb), c });
      }
    };
    span(p.goldenSpans, color.golden);
    span(p.blueSpans, color.blue);
    return { ticks, labels, inner, outer, noonTicks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, timeAnchor, scrubBaseTime, selected, zone, timeFormat, fonts, p.goldenSpans, p.blueSpans]);

  // --- Day ring ---------------------------------------------------------------------------------
  // Pool: ±9 integer-day offsets from the anchor. Each label's text is the modular day of the
  // month, so wrapping past the end just loops to day 1 without an angle collision.
  const monthDays = daysInMonth(f.year, f.month);
  const dayRing = useMemo(() => {
    const labels: { offset: number; label: Label; baseAngle: number }[] = [];
    for (let i = -DAY_LABELS_PER_SIDE; i <= DAY_LABELS_PER_SIDE; i++) {
      const dayNumber = (((scrubBaseDay + i - 1) % monthDays) + monthDays) % monthDays + 1;
      labels.push({
        offset: i,
        baseAngle: sel + i * DIAL_DEG_PER_DAY,
        label: makeLabel(fonts, String(dayNumber), {
          size: type.dialLabel.size,
          weight: 500,
          color: color.ui,
          opacity: alpha.dialNeighbor,
          casing: false,
        }),
      });
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, scrubBaseDay, monthDays]);

  // --- Month ring -------------------------------------------------------------------------------
  // Full 12-month wheel. 12 × 30° = 360° exactly, so pool size matches a revolution.
  const monthRing = useMemo(() => {
    const labels: { offset: number; label: Label; baseAngle: number }[] = [];
    for (let i = -MONTH_LABELS_PER_SIDE; i <= MONTH_LABELS_PER_SIDE - 1; i++) {
      const m = (((scrubBaseMonth + i - 1) % 12) + 12) % 12 + 1;
      labels.push({
        offset: i,
        baseAngle: sel + i * DIAL_DEG_PER_MONTH,
        label: makeLabel(fonts, String(m), {
          size: type.dialLabel.size,
          weight: 500,
          color: color.ui,
          opacity: alpha.dialNeighbor,
          casing: false,
        }),
      });
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, scrubBaseMonth]);

  // --- Center readouts ---------------------------------------------------------------------------
  // The big number in the middle of each ring is the committed `selected`. It updates on each
  // React render (lagged a few ms behind the UI thread, which is fine for a readout). The pool
  // label at offset 0 of the active ring is hidden to avoid double-stacking.
  const selMinute = Math.floor(selected / 60000) * 60000;

  // Group transforms for the TICKS — rotate directly by the per-ring drag (ticks are lines, so
  // rotation does the right thing). Labels are positioned individually below.
  const timeTicksTransform = useDerivedValue(() => [
    { translateX: l.ax },
    { translateY: l.ay },
    { rotate: (-l.dir * timeDrag.value * Math.PI) / 180 },
    { translateX: -l.ax },
    { translateY: -l.ay },
  ]);
  const ghostTicksTransform = useDerivedValue(() => [
    { translateX: l.ax },
    { translateY: l.ay },
    { rotate: (-l.dir * (timeDrag.value - (moving ? l.dial.ghostOffsetDeg : 0)) * Math.PI) / 180 },
    { translateX: -l.ax },
    { translateY: -l.ay },
  ]);

  // Now marker on the time ring.
  const nowTheta = sel + ((Math.floor(now / 60000) * 60000 - selMinute) / 60000) * DIAL_DEG_PER_MINUTE;
  const nowOnRing = !live && Math.abs(now - selected) <= DIAL_NOW_TICK_WINDOW_MIN * 60000;
  const nowLater = now > selected;

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width: l.width, height: l.height }} pointerEvents="none">
      <Group opacity={p.disabled ? alpha.dialDisabled : 1}>
        {/* Band fills + borders */}
        <Group>
          <Path path={bands.time} color={withAlpha(color.bg, fill('time'))} />
          <Path path={bands.time} style="stroke" strokeWidth={1} color={withAlpha(color.white, border('time'))} />
        </Group>
        <Group>
          <Path path={bands.day} color={withAlpha(color.bg, fill('day'))} />
          <Path path={bands.day} style="stroke" strokeWidth={1} color={withAlpha(color.white, border('day'))} />
        </Group>
        <Group>
          <Path path={bands.month} color={withAlpha(color.bg, fill('month'))} />
          <Path path={bands.month} style="stroke" strokeWidth={1} color={withAlpha(color.white, border('month'))} />
        </Group>
        {/* Selection highlight wedge: always visible so the user can see where "selected" is even
            while the ring is spinning (the old `!p.active` guard made this flicker during gestures). */}
        <Path path={bands.wedge} color={withAlpha(color.white, alpha.ringWedge)} />

        {/* AM/PM inner track and ticks: rotate with time drag via the group transform. */}
        <Group clip={bands.time}>
          <Group transform={timeTicksTransform}>
            {timeRing.inner.map((s, i) => (
              <Path key={`in${i}`} path={s.path} style="stroke" strokeWidth={stroke.dialTrack} color={withAlpha(s.c, alpha.innerTrack)} />
            ))}
            <Path path={timeRing.noonTicks} style="stroke" strokeWidth={stroke.tickWidth} color={color.ui} />
            {moving && active === 'time' && (
              <Group transform={ghostTicksTransform}>
                <Path path={timeRing.ticks} style="stroke" strokeWidth={stroke.dialTick} strokeCap="round" color={withAlpha(color.ui, alpha.ghostTicks)} />
              </Group>
            )}
            <Path path={timeRing.ticks} style="stroke" strokeWidth={stroke.dialTick} strokeCap="round" color={withAlpha(color.ui, active === 'time' ? 1 : alpha.dialTick)} />
          </Group>
        </Group>

        {/* Golden/blue outer track: positioned at rest, not rotating. */}
        {timeRing.outer.map((s, i) => (
          <Path key={`out${i}`} path={s.path} style="stroke" strokeWidth={stroke.dialTrack} color={s.c} />
        ))}

        {/* Per-ring labels — standalone paragraphs, no parent transform, always upright. */}
        <Group clip={bands.time}>
          {timeRing.labels.map((lab) => (
            <RingLabel
              key={`tl${lab.offset}`}
              l={l}
              label={lab.label}
              radius={l.dial.labelTime}
              baseAngle={lab.baseAngle}
              drag={timeDrag}
              hideAtNotch={false}
            />
          ))}
        </Group>
        <Group clip={bands.day}>
          {dayRing.map((lab) => (
            <RingLabel
              key={`d${lab.offset}`}
              l={l}
              label={lab.label}
              radius={l.dial.labelDay}
              baseAngle={lab.baseAngle}
              drag={dayDrag}
              hideAtNotch={false}
            />
          ))}
        </Group>
        <Group clip={bands.month}>
          {monthRing.map((lab) => (
            <RingLabel
              key={`m${lab.offset}`}
              l={l}
              label={lab.label}
              radius={l.dial.labelMonth}
              baseAngle={lab.baseAngle}
              drag={monthDrag}
              hideAtNotch={false}
            />
          ))}
        </Group>

        {/* The big enlarged readouts and the pointed notch triangle used to live here. They were
            removed because the wheel label at the notch position already shows the selected value
            (now that `hideAtNotch=false` keeps it visible) and the highlighted wedge marks the
            selection point clearly on its own. */}

        {nowOnRing && nowTheta >= 0 && nowTheta <= 90 && (
          <Group>
            {(() => {
              const a = polar(l, l.dial.nowTick[0], nowTheta);
              const b = polar(l, l.dial.nowTick[1], nowTheta);
              const path = Skia.Path.Make();
              path.moveTo(a.x, a.y);
              path.lineTo(b.x, b.y);
              const dot = polar(l, l.dial.nowDotR, nowTheta);
              return (
                <>
                  <Path path={path} style="stroke" strokeWidth={stroke.nowTick} strokeCap="round" color={color.now} />
                  <Circle cx={dot.x} cy={dot.y} r={l.dial.nowDot / 2} color={color.now} />
                  <Circle cx={dot.x} cy={dot.y} r={l.dial.nowDot / 2} style="stroke" strokeWidth={1.5} color={color.bg} />
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

/**
 * One dial label. Position and opacity are driven purely by the ring's `drag` SharedValue on the
 * UI thread — no React state in the hot path, no parent transform. The label stays upright at
 * every rotation; `hideAtNotch` suppresses the pool's center-offset label while that ring is
 * active, so it doesn't double up with the big center readout.
 */
function RingLabel({
  l,
  label,
  radius,
  baseAngle,
  drag,
  hideAtNotch,
}: {
  l: Layout;
  label: Label;
  radius: number;
  baseAngle: number;
  drag: SharedValue<number>;
  hideAtNotch: boolean;
}) {
  const halfW = label.width / 2;
  const halfH = label.height / 2;
  const x = useDerivedValue(() => {
    const angle = baseAngle + drag.value;
    return polar(l, radius, angle).x - halfW;
  });
  const y = useDerivedValue(() => {
    const angle = baseAngle + drag.value;
    return polar(l, radius, angle).y - halfH;
  });
  const op = useDerivedValue(() => {
    const angle = baseAngle + drag.value;
    if (angle < WEDGE_MIN - WEDGE_FADE || angle > WEDGE_MAX + WEDGE_FADE) return 0;
    let a: number;
    if (angle < WEDGE_MIN + WEDGE_FADE) a = (angle - (WEDGE_MIN - WEDGE_FADE)) / (2 * WEDGE_FADE);
    else if (angle > WEDGE_MAX - WEDGE_FADE) a = ((WEDGE_MAX + WEDGE_FADE) - angle) / (2 * WEDGE_FADE);
    else a = 1;
    return hideAtNotch ? 0 : a;
  });
  return (
    <Group opacity={op}>
      <Paragraph paragraph={label.fill} x={x} y={y} width={1000} />
    </Group>
  );
}

/** Red pip with chevron just outside the ring end that now lies beyond (C-Indicators). */
export function pipCenter(l: Layout, later: boolean) {
  return polar(l, l.dial.pipR, later ? l.dial.pipAngleLater : l.dial.pipAngleEarlier);
}

function NowPip({ l, later }: { l: Layout; later: boolean }) {
  // "Now" marker: a target glyph (outer ring + inner solid dot). Reads as a current-position
  // indicator, more intuitive than the previous chevron-into-dot which looked like a plain arrow.
  const c = pipCenter(l, later);
  const outerR = l.dial.pip * 0.9;
  const innerR = l.dial.pip * 0.32;
  return (
    <Group>
      <Circle cx={c.x} cy={c.y} r={outerR} style="stroke" strokeWidth={2.5} color={color.now} />
      <Circle cx={c.x} cy={c.y} r={innerR} color={color.now} />
    </Group>
  );
}
