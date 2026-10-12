// Settings sheet: four flat wordless rows, applied instantly (Settings*, Spec-Interactions).
import { useEffect } from 'react';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { labels } from '../core/a11y';
import { formatClock, formatDate } from '../core/format';
import { sheetDismisses } from '../core/gestures';
import type { Settings } from '../state/AppModel';
import { alpha, color, motion, scrimColor, size, type, withAlpha } from '../theme/tokens';
import { CloseGlyph, DialSideGlyph, HapticsGlyph } from './glyphs';
import { FONT } from './fonts';

type Option<T> = { value: T; label: string; render: (selected: boolean) => React.ReactNode };

function Row<T extends string | boolean>({ a11y, options, value, onPick }: { a11y: string; options: Option<T>[]; value: T; onPick: (v: T) => void }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={a11y}
      style={{
        flexDirection: 'row',
        gap: size.sheet.gap,
        padding: size.sheet.trackPadding,
        borderRadius: size.sheet.trackRadius,
        backgroundColor: withAlpha(color.ui, alpha.segmentTrack),
        borderWidth: 1,
        borderColor: withAlpha(color.ui, alpha.segmentBorder),
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onPick(o.value)}
            style={{
              flex: 1,
              minWidth: 0,
              height: size.sheet.segmentHeight,
              borderRadius: size.sheet.segmentRadius,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? color.ui : 'transparent',
            }}
          >
            {o.render(selected)}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsSheet({
  settings,
  onChange,
  onClose,
  landscape,
  width,
  height,
  bottomInset,
  sample,
  haptic,
}: {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  onClose: () => void;
  landscape: boolean;
  width: number;
  height: number;
  bottomInset: number;
  /** Sample values: sunset time today (fallback 18:33/6:33 → see notes) and a date. */
  sample: { hour: number; minute: number; year: number; month: number; day: number };
  haptic: () => void;
}) {
  const sheetH = landscape ? Math.min(height - 24, 300) : size.sheet.height + bottomInset;
  const sheetW = landscape ? size.sheet.landscapeWidth : width;
  const ty = useSharedValue(sheetH);
  useEffect(() => {
    ty.value = withTiming(0, { duration: motion.sheetOpenMs, easing: Easing.out(Easing.ease) });
  }, [ty]);
  const close = () => {
    ty.value = withTiming(sheetH, { duration: motion.sheetCloseMs, easing: Easing.in(Easing.ease) }, () => runOnJS(onClose)());
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const drag = Gesture.Pan()
    .onUpdate((e) => {
      ty.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (sheetDismisses(e.translationY, sheetH, e.velocityY)) {
        ty.value = withTiming(sheetH, { duration: motion.sheetCloseMs }, () => runOnJS(onClose)());
      } else ty.value = withTiming(0, { duration: motion.sheetOpenMs });
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - ty.value / sheetH }));

  const pick = <K extends keyof Settings>(k: K) => (v: Settings[K]) => {
    if (settings[k] !== v) haptic();
    onChange({ [k]: v } as Partial<Settings>);
  };
  const segText = (selected: boolean, text: string, small = false) => (
    <Text
      numberOfLines={1}
      style={{
        color: selected ? color.sheet : withAlpha(color.ui, alpha.segmentUnselectedText),
        fontFamily: selected ? FONT.semibold : FONT.medium,
        fontSize: small ? type.segment.sizeLandscapeDate : type.segment.size,
        fontVariant: [...type.fontVariant],
      }}
    >
      {text}
    </Text>
  );
  const t12 = formatClock(sample.hour, sample.minute, '12');
  const t24 = formatClock(sample.hour, sample.minute, '24');
  const dates = {
    mdy: formatDate(sample.year, sample.month, sample.day, 'mdy'),
    dmy: formatDate(sample.year, sample.month, sample.day, 'dmy'),
    ymd: formatDate(sample.year, sample.month, sample.day, 'ymd'),
  };
  const tint = (s: boolean) => (s ? color.sheet : withAlpha(color.ui, alpha.segmentUnselectedText));
  const pmSpoken = sample.hour >= 12 ? 'PM' : 'AM';

  const rows = {
    time: (
      <Row
        a11y={labels.timeFormatRow}
        value={settings.timeFormat}
        onPick={pick('timeFormat')}
        options={[
          { value: '12', label: labels.timeFormat12(`${t12} ${pmSpoken}`), render: (s) => segText(s, t12) },
          { value: '24', label: labels.timeFormat24(t24), render: (s) => segText(s, t24) },
        ]}
      />
    ),
    date: (
      <Row
        a11y={labels.dateFormatRow}
        value={settings.dateFormat}
        onPick={pick('dateFormat')}
        options={[
          { value: 'mdy', label: labels.dateMdy(dates.mdy), render: (s) => segText(s, dates.mdy, landscape) },
          { value: 'dmy', label: labels.dateDmy(dates.dmy), render: (s) => segText(s, dates.dmy, landscape) },
          { value: 'ymd', label: labels.dateYmd(dates.ymd), render: (s) => segText(s, dates.ymd, landscape) },
        ]}
      />
    ),
    side: (
      <Row
        a11y={labels.dialSideRow}
        value={settings.dialSide}
        onPick={pick('dialSide')}
        options={[
          { value: 'left', label: labels.dialLeft, render: (s) => <DialSideGlyph left landscape={landscape} tint={tint(s)} /> },
          { value: 'right', label: labels.dialRight, render: (s) => <DialSideGlyph left={false} landscape={landscape} tint={tint(s)} /> },
        ]}
      />
    ),
    haptics: (
      <Row
        a11y={labels.hapticsRow}
        value={settings.haptics}
        onPick={pick('haptics')}
        options={[
          { value: true, label: labels.hapticsOn, render: (s) => <HapticsGlyph off={false} tint={tint(s)} gapColor={s ? color.ui : color.sheet} /> },
          { value: false, label: labels.hapticsOff, render: (s) => <HapticsGlyph off tint={tint(s)} gapColor={s ? color.ui : color.sheet} /> },
        ]}
      />
    ),
  };
  const gap = landscape ? size.sheet.rowGapLandscape : size.sheet.rowGap;

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width, height }} accessibilityViewIsModal>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: withAlpha(scrimColor, alpha.scrim) }, scrimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessible={false} importantForAccessibility="no" />
      </Animated.View>
      <Animated.View
        accessibilityLabel={labels.settings}
        style={[
          {
            position: 'absolute',
            left: (width - sheetW) / 2,
            bottom: 0,
            width: sheetW,
            height: sheetH,
            backgroundColor: color.sheet,
            borderTopLeftRadius: size.sheet.radius,
            borderTopRightRadius: size.sheet.radius,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={drag}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 60 }}>
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: (sheetW - size.sheet.grabber.w) / 2,
                width: size.sheet.grabber.w,
                height: size.sheet.grabber.h,
                borderRadius: 3,
                backgroundColor: withAlpha(color.ui, alpha.grabber),
              }}
            />
          </View>
        </GestureDetector>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.close}
          onPress={close}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: size.close.box,
            height: size.close.box,
            borderRadius: size.close.box / 2,
            backgroundColor: withAlpha(color.ui, alpha.closeButton),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CloseGlyph />
        </Pressable>
        {landscape ? (
          <View style={{ position: 'absolute', left: size.sheet.padding, right: size.sheet.padding, top: size.sheet.contentTop, flexDirection: 'row', gap: size.sheet.padding }}>
            <View style={{ flex: 1, gap }}>
              {rows.time}
              {rows.date}
            </View>
            <View style={{ flex: 1, gap }}>
              {rows.side}
              {rows.haptics}
            </View>
          </View>
        ) : (
          <View style={{ position: 'absolute', left: size.sheet.padding, right: size.sheet.padding, top: size.sheet.contentTop, gap }}>
            {rows.time}
            {rows.date}
            {rows.side}
            {rows.haptics}
          </View>
        )}
      </Animated.View>
    </View>
  );
}
