// Gear, calibration offset indicator, zoom chip, compass card and glyph (C-Indicators, C-Glyphs).
import { Canvas, Circle, Group, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { labels } from '../core/a11y';
import { formatDegrees, formatZoom } from '../core/format';
import { offsetSwipeClears } from '../core/gestures';
import { alpha, color, motion, size, type, withAlpha } from '../theme/tokens';
import { ChevronsGlyph, CompassSmallGlyph, GearGlyph, GLYPH, OffsetGlyph } from './glyphs';
import { FONT } from './fonts';

export function Gear({ top, right, onPress }: { top: number; right: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labels.gear}
      onPress={onPress}
      style={{
        position: 'absolute',
        top,
        right,
        width: size.gear.box,
        height: size.gear.box,
        borderRadius: size.gear.radius,
        backgroundColor: withAlpha(color.bg, alpha.surfaceChip),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GearGlyph />
    </Pressable>
  );
}

export function OffsetIndicator({ top, left, degrees, onClear }: { top: number; left: number; degrees: number; onClear: () => void }) {
  const tx = useSharedValue(0);
  const [width, setWidth] = useState(100);
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      tx.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      if (offsetSwipeClears(e.translationX, width, e.velocityX)) {
        tx.value = withTiming(-width - left, { duration: motion.calibrationClearMs });
        runOnJS(onClear)();
      } else tx.value = withTiming(0, { duration: motion.reduceMotion.linearMs });
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: 1 + tx.value / Math.max(width, 1) / 2,
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={labels.offset(degrees)}
        accessibilityHint={labels.offsetHint}
        accessibilityActions={[{ name: 'clear', label: labels.offsetAction }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'clear' && onClear()}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          {
            position: 'absolute',
            top,
            left,
            height: size.chip.height,
            paddingLeft: size.chip.padLeft,
            paddingRight: size.chip.padRight,
            borderRadius: size.chip.radius,
            backgroundColor: withAlpha(color.bg, alpha.surfaceChip),
            flexDirection: 'row',
            alignItems: 'center',
            gap: size.chip.gap,
          },
          style,
        ]}
      >
        <OffsetGlyph />
        <Text style={{ color: color.ui, fontFamily: FONT.semibold, fontSize: type.chipOffset.size, fontVariant: [...type.fontVariant] }}>
          {formatDegrees(degrees)}
        </Text>
        <ChevronsGlyph />
      </Animated.View>
    </GestureDetector>
  );
}

export function ZoomChip({ wide, shownAt, top, centerX }: { wide: boolean; shownAt: number; top: number; centerX: number }) {
  const op = useSharedValue(0);
  useEffect(() => {
    if (!shownAt) return;
    op.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(1, { duration: motion.zoomChipShowMs }),
      withTiming(0, { duration: motion.zoomChipFadeMs }),
    );
  }, [shownAt, op]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        {
          position: 'absolute',
          top,
          left: centerX - size.zoomChip.width / 2,
          width: size.zoomChip.width,
          height: size.zoomChip.height,
          borderRadius: size.zoomChip.radius,
          backgroundColor: withAlpha(color.bg, alpha.surfaceChip),
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: color.ui, fontFamily: FONT.semibold, fontSize: type.chipZoom.size, fontVariant: [...type.fontVariant] }}>
        {formatZoom(wide)}
      </Text>
    </Animated.View>
  );
}

/** Center card: loops the figure-8 (4 keyframes, 2 s per cycle), then shrinks into the glyph. */
export function CompassCard({ centerX, top, reduceMotion }: { centerX: number; top: number; reduceMotion: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: motion.compass.loopMs, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [reduceMotion, t]);
  const figure8 = useMemo(() => Skia.Path.MakeFromSVGString(GLYPH.figure8) ?? Skia.Path.Make(), []);
  const needle = useMemo(() => Skia.Path.MakeFromSVGString(GLYPH.compassNeedleLarge) ?? Skia.Path.Make(), []);
  const waves = useMemo(() => Skia.Path.MakeFromSVGString(GLYPH.compassWavesLarge) ?? Skia.Path.Make(), []);
  const phone = useMemo(() => {
    const p = Skia.Path.Make();
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(-11, -20, 22, 40), 5, 5));
    return p;
  }, []);
  const [pos, setPos] = useState({ x: 218, y: 150, rot: 0 });
  useEffect(() => {
    // Keyframes (S08-Figure8): right end upright → center −30° → left end upright → center +30°.
    const frames = [
      { x: 218, y: 150, rot: 0 },
      { x: 140, y: 150, rot: -30 },
      { x: 62, y: 150, rot: 0 },
      { x: 140, y: 150, rot: 30 },
    ];
    if (reduceMotion) {
      setPos(frames[0]);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % 4;
      setPos(frames[i]);
    }, motion.compass.loopMs / 4);
    return () => clearInterval(id);
  }, [reduceMotion]);
  const W = size.compassCard.width;
  const H = size.compassCard.height;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={labels.compassCard}
      style={{ position: 'absolute', left: centerX - W / 2, top, width: W, height: H, borderRadius: size.compassCard.radius, backgroundColor: withAlpha(color.bg, alpha.surfaceChip) }}
    >
      <Canvas style={{ width: W, height: H }}>
        <Group transform={[{ translateX: 140 }, { translateY: 52 }]}>
          <Circle cx={0} cy={0} r={22} style="stroke" strokeWidth={2.2} color={color.ui} />
          <Path path={needle} color={color.ui} />
          <Path path={waves} style="stroke" strokeWidth={2} strokeCap="round" color={color.ui} />
        </Group>
        <Path path={figure8} style="stroke" strokeWidth={2} color={withAlpha(color.ui, 0.5)} />
        <Group transform={[{ translateX: pos.x }, { translateY: pos.y }, { rotate: (pos.rot * Math.PI) / 180 }]}>
          <Path path={phone} color={color.bg} />
          <Path path={phone} style="stroke" strokeWidth={2.2} color={color.ui} />
          <RoundedRect x={-4} y={-15.8} width={8} height={1.6} r={0.8} color={color.ui} />
        </Group>
      </Canvas>
    </View>
  );
}

export function CompassGlyphButton({ top, left, onPress }: { top: number; left: number; onPress: () => void }) {
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = withRepeat(withSequence(withTiming(0.5, { duration: 500 }), withTiming(1, { duration: 500 })), -1, false);
  }, [op]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labels.compassGlyph}
      onPress={onPress}
      style={{ position: 'absolute', top, left, width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          { width: 44, height: 44, borderRadius: 22, backgroundColor: withAlpha(color.bg, alpha.surfaceChip), alignItems: 'center', justifyContent: 'center' },
          style,
        ]}
      >
        <CompassSmallGlyph />
      </Animated.View>
    </Pressable>
  );
}
