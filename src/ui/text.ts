// Skia text with tabular figures ("tnum") and the legibility casing (C-Legibility):
// a 3.5 dark stroke painted under the fill. Built on the JS thread when content changes;
// positioned per frame on the UI thread.
import { type SkParagraph, Skia, type SkTypefaceFontProvider, PaintStyle, StrokeJoin } from '@shopify/react-native-skia';

import { alpha, color, stroke, withAlpha } from '../theme/tokens';

export const FAMILY = 'SpaceGrotesk';

export type Label = { fill: SkParagraph; casing: SkParagraph | null; width: number; height: number };

export function makeLabel(
  fonts: SkTypefaceFontProvider,
  text: string,
  opts: { size: number; weight: 500 | 600 | 700; color: string; opacity?: number; casing?: boolean; casingAlpha?: number },
): Label {
  const style = {
    fontFamilies: [FAMILY],
    fontSize: opts.size,
    fontStyle: { weight: opts.weight },
    fontFeatures: [{ name: 'tnum', value: 1 }],
  };
  const build = (paint: ReturnType<typeof Skia.Paint>) => {
    const b = Skia.ParagraphBuilder.Make({}, fonts);
    b.pushStyle(style, paint);
    b.addText(text);
    const p = b.build();
    p.layout(1000);
    return p;
  };
  const fillPaint = Skia.Paint();
  fillPaint.setColor(Skia.Color(opts.opacity === undefined ? opts.color : withAlpha(opts.color, opts.opacity)));
  const fill = build(fillPaint);
  let casing: SkParagraph | null = null;
  if (opts.casing !== false) {
    const cp = Skia.Paint();
    cp.setStyle(PaintStyle.Stroke);
    cp.setStrokeWidth(stroke.textCasing);
    cp.setStrokeJoin(StrokeJoin.Round);
    cp.setColor(Skia.Color(withAlpha(color.bg, opts.casingAlpha ?? alpha.casingText)));
    casing = build(cp);
  }
  return { fill, casing, width: fill.getLongestLine(), height: fill.getHeight() };
}
