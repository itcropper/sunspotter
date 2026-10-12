// Vector glyphs from C-Glyphs: round-cap, round-join cream strokes. No SF Symbols, so iOS and
// Android look identical. The "off" slash is drawn twice: a wide gap stroke in the background
// color, then the slash.
import { Canvas, Circle, Group, Path, Rect, RoundedRect, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { color, stroke } from '../theme/tokens';

const p = (d: string) => Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();

export const GLYPH = {
  gear: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  close: 'M3 3l10 10M13 3L3 13',
  camera: 'M8 22a4 4 0 0 1 4-4h8l4-6h16l4 6h8a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z',
  location: 'M32 58s-18-17-18-31a18 18 0 0 1 36 0c0 14-18 31-18 31z',
  openSettings: 'M17 11v3M17 32v3M5 23h3M26 23h3M8.5 14.5l2.1 2.1M23.4 29.4l2.1 2.1M8.5 31.5l2.1-2.1M26 4h10v10M36 4L25 15',
  haptics: 'M5 9v10M25 9v10M1.5 11.5v5M28.5 11.5v5',
  offsetArms: 'M13 2v4M13 20v4M2 13h4M20 13h4',
  offsetArrow: 'M10.5 14.8 L15.5 10.8',
  chevrons: 'M6 3L2 7l4 4M12 3L8 7l4 4',
  compassNeedle: 'M0,-6 L2.5,0 L0,6 L-2.5,0 Z',
  compassWave: 'M12,-6 q2,2 0,4 q-2,2 0,4 q2,2 0,4',
  compassNeedleLarge: 'M0,-15 L5,0 L0,15 L-5,0 Z',
  compassWavesLarge: 'M28,-14 q4,4 0,8 q-4,4 0,8 q4,4 0,8 M-28,-14 q-4,4 0,8 q4,4 0,8 q-4,4 0,8',
  figure8: 'M140,150 C168,112 218,112 218,150 C218,188 168,188 140,150 C112,112 62,112 62,150 C62,188 112,188 140,150 Z',
  dialLeftArc: 'M13,38.5 A11,11 0 0 0 2,27.5',
  dialLeftFill: 'M8,38.5 A6,6 0 0 0 2,32.5 L2,38.5 Z',
  dialRightArc: 'M13,38.5 A11,11 0 0 1 24,27.5',
  dialRightFill: 'M18,38.5 A6,6 0 0 1 24,32.5 L24,38.5 Z',
  dialLeftArcL: 'M1.5,13 A11,11 0 0 1 12.5,24',
  dialLeftFillL: 'M1.5,18 A6,6 0 0 1 7.5,24 L1.5,24 Z',
  dialRightArcL: 'M38.5,13 A11,11 0 0 0 27.5,24',
  dialRightFillL: 'M38.5,18 A6,6 0 0 0 32.5,24 L38.5,24 Z',
  hand: 'M9 11V4.5a1.5 1.5 0 0 1 3 0V10a1.5 1.5 0 0 1 3 0V11a1.5 1.5 0 0 1 3 0V12a1.5 1.5 0 0 1 3 0V16c0 3.5-2.5 6-6 6h-1.5c-2 0-3.5-1-4.6-2.5L5.2 15.2a1.6 1.6 0 0 1 2.5-2L9 14.5Z',
} as const;

export function GearGlyph() {
  const path = useMemo(() => p(GLYPH.gear), []);
  return (
    <Canvas style={{ width: 24, height: 24 }}>
      <Group style="stroke" strokeWidth={stroke.glyph24} strokeCap="round" color={color.ui}>
        <Circle cx={12} cy={12} r={6} />
        <Circle cx={12} cy={12} r={2.2} />
        <Path path={path} />
      </Group>
    </Canvas>
  );
}

export function CloseGlyph() {
  const path = useMemo(() => p(GLYPH.close), []);
  return (
    <Canvas style={{ width: 16, height: 16 }}>
      <Path path={path} style="stroke" strokeWidth={2} strokeCap="round" color={color.ui} />
    </Canvas>
  );
}

/** 64-box permission glyphs, optionally crossed out. */
export function PermissionGlyph({ kind, off, gapColor }: { kind: 'camera' | 'location'; off?: boolean; gapColor: string }) {
  const body = useMemo(() => p(kind === 'camera' ? GLYPH.camera : GLYPH.location), [kind]);
  const slash = useMemo(() => p(kind === 'camera' ? 'M6 58L58 6' : 'M8 58L56 6'), [kind]);
  return (
    <Canvas style={{ width: 64, height: 64 }}>
      <Group style="stroke" strokeWidth={stroke.glyph64} strokeCap="round" strokeJoin="round" color={color.ui}>
        <Path path={body} />
        {kind === 'camera' ? <Circle cx={32} cy={34} r={10} /> : <Circle cx={32} cy={27} r={7} />}
        {off && <Path path={slash} strokeWidth={9} color={gapColor} />}
        {off && <Path path={slash} />}
      </Group>
    </Canvas>
  );
}

export function OpenSettingsGlyph() {
  const path = useMemo(() => p(GLYPH.openSettings), []);
  return (
    <Canvas style={{ width: 40, height: 40 }}>
      <Group style="stroke" strokeWidth={2.4} strokeCap="round" strokeJoin="round" color={color.ui}>
        <Circle cx={17} cy={23} r={8} />
        <Circle cx={17} cy={23} r={3} />
        <Path path={path} />
      </Group>
    </Canvas>
  );
}

export function DialSideGlyph({ left, landscape, tint }: { left: boolean; landscape: boolean; tint: string }) {
  const arc = useMemo(
    () => p(landscape ? (left ? GLYPH.dialLeftArcL : GLYPH.dialRightArcL) : left ? GLYPH.dialLeftArc : GLYPH.dialRightArc),
    [left, landscape],
  );
  const fill = useMemo(
    () => p(landscape ? (left ? GLYPH.dialLeftFillL : GLYPH.dialRightFillL) : left ? GLYPH.dialLeftFill : GLYPH.dialRightFill),
    [left, landscape],
  );
  const w = landscape ? 40 : 26;
  const h = landscape ? 26 : 40;
  return (
    <Canvas style={{ width: w, height: h }}>
      <RoundedRect
        x={landscape ? 1.5 : 2}
        y={landscape ? 2 : 1.5}
        width={landscape ? 37 : 22}
        height={landscape ? 22 : 37}
        r={5}
        style="stroke"
        strokeWidth={stroke.glyphSettings}
        color={tint}
      />
      <Path path={arc} style="stroke" strokeWidth={stroke.glyphSettings} strokeCap="round" color={tint} />
      <Path path={fill} color={tint} />
    </Canvas>
  );
}

export function HapticsGlyph({ off, tint, gapColor }: { off: boolean; tint: string; gapColor: string }) {
  const waves = useMemo(() => p(GLYPH.haptics), []);
  const slash = useMemo(() => p('M4 26L26 2'), []);
  return (
    <Canvas style={{ width: 30, height: 28 }}>
      <Group style="stroke" strokeWidth={stroke.glyphSettings} strokeCap="round" color={tint}>
        <RoundedRect x={9} y={3} width={12} height={22} r={3} />
        <Path path={waves} />
        {off && <Path path={slash} strokeWidth={5} color={gapColor} />}
        {off && <Path path={slash} />}
      </Group>
    </Canvas>
  );
}

export function OffsetGlyph({ arrow = true }: { arrow?: boolean }) {
  const arms = useMemo(() => p(GLYPH.offsetArms), []);
  const arr = useMemo(() => p(GLYPH.offsetArrow), []);
  return (
    <Canvas style={{ width: 26, height: 26 }}>
      <Group style="stroke" strokeWidth={stroke.glyphSettings} strokeCap="round" strokeJoin="round" color={color.ui}>
        <Circle cx={13} cy={13} r={9} />
        <Path path={arms} />
        {arrow && <Path path={arr} strokeWidth={1.6} />}
      </Group>
      {arrow && <Circle cx={9} cy={16} r={2} color={color.ui} opacity={0.45} />}
      <Circle cx={16.5} cy={10} r={2.6} color={color.ui} />
    </Canvas>
  );
}

export function ChevronsGlyph() {
  const path = useMemo(() => p(GLYPH.chevrons), []);
  return (
    <Canvas style={{ width: 14, height: 14 }}>
      <Path path={path} style="stroke" strokeWidth={stroke.glyphSettings} strokeCap="round" strokeJoin="round" color={color.ui} opacity={0.55} />
    </Canvas>
  );
}

export function CompassSmallGlyph() {
  const needle = useMemo(() => p(GLYPH.compassNeedle), []);
  const wave = useMemo(() => p(GLYPH.compassWave), []);
  return (
    <Canvas style={{ width: 30, height: 30 }}>
      <Group transform={[{ translateX: 15 }, { translateY: 15 }]}>
        <Circle cx={0} cy={0} r={9} style="stroke" strokeWidth={stroke.glyphSettings} color={color.ui} />
        <Path path={needle} color={color.ui} />
        <Path path={wave} style="stroke" strokeWidth={1.5} strokeCap="round" color={color.ui} />
      </Group>
    </Canvas>
  );
}

export { Rect };
