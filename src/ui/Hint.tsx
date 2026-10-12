// First-launch hint: a translucent ghost hand drags right on the sky and the selection follows
// (+25 min, hold at +40, then springs back to now). Plays once ever; any touch cancels it.
// With a screen reader on, only the announcement plays. Reduce Motion: frame 2 as a still for 2 s.
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { labels } from '../core/a11y';
import { SCRUB_PT_PER_MINUTE } from '../core/constants';
import { color, motion } from '../theme/tokens';
import { GLYPH } from './glyphs';

export function Hint({
  x,
  y,
  screenReader,
  reduceMotion,
  onOffset,
  onDone,
}: {
  x: number;
  y: number;
  screenReader: boolean;
  reduceMotion: boolean;
  /** Called with the hint's minute offset from now (0 = back to now). */
  onOffset: (minutes: number) => void;
  onDone: () => void;
}) {
  const H = motion.hint;
  const op = useSharedValue(0);
  const dx = useSharedValue(0);
  const hand = useMemo(() => Skia.Path.MakeFromSVGString(GLYPH.hand) ?? Skia.Path.Make(), []);
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onOffset(0);
      onDone();
    };
    if (screenReader) {
      AccessibilityInfo.announceForAccessibility(labels.hint);
      finish();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, H.delay + ms));
    if (reduceMotion) {
      at(0, () => {
        op.value = 1;
        dx.value = H.dragMinutes * SCRUB_PT_PER_MINUTE;
        onOffset(H.dragMinutes);
      });
      at(motion.reduceMotion.hintStillMs, finish);
    } else {
      at(0, () => {
        op.value = withTiming(1, { duration: H.fadeIn });
      });
      // Drag +25 min, then on to +40 and hold, then lift and spring back to now.
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        at(H.fadeIn + ((H.dragEnd - H.fadeIn) * i) / steps, () => onOffset(Math.round((H.dragMinutes * i) / steps)));
      }
      at(H.fadeIn, () => {
        dx.value = withSequence(
          withTiming(H.dragMinutes * SCRUB_PT_PER_MINUTE, { duration: H.dragEnd - H.fadeIn }),
          withTiming(H.holdMinutes * SCRUB_PT_PER_MINUTE, { duration: H.holdEnd - H.dragEnd }),
        );
      });
      at(H.dragEnd + 1, () => onOffset(H.holdMinutes));
      at(H.holdEnd, () => {
        op.value = withTiming(0, { duration: H.end - H.holdEnd });
        onOffset(0);
      });
      at(H.end, finish);
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: dx.value }] }));
  if (screenReader) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ position: 'absolute', left: x, top: y, width: 40, height: 40 }, style]}
    >
      <Canvas style={{ width: 40, height: 40 }}>
        <Group transform={[{ scale: 1.6 }]}>
          <Path path={hand} color={color.white} opacity={0.35} />
          <Path path={hand} style="stroke" strokeWidth={1.2} strokeJoin="round" strokeCap="round" color={color.white} opacity={0.9} />
        </Group>
      </Canvas>
    </Animated.View>
  );
}
