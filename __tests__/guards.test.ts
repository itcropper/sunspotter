// Build guards: design tokens, no words, no hardcoded colors, no networking code.
import * as fs from 'fs';
import * as path from 'path';

import { VISIBLE_CHARSET, formatClock, formatDate, formatDegrees, formatHourNumeral, formatZoom } from '../src/core/format';
import { alpha, color, motion, scrimColor, size, stroke, type } from '../src/theme/tokens';

const ROOT = path.join(__dirname, '..');
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|kt|swift)$/.test(e.name) ? [p] : [];
  });
}
const APP_SOURCES = [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'modules')), path.join(ROOT, 'App.tsx')];

describe('Spec-Tokens: every token exists in the theme file', () => {
  it('colors', () => {
    expect(color).toMatchObject({
      ui: '#FFF4DC', bg: '#0B0E14', sheet: '#14161C', am: '#8DE8D4', pm: '#FFCFA6', golden: '#FF9E2C',
      blue: '#3E8BFF', blueText: '#7FB2FF', now: '#FF5B4D', sunCore: '#FFFFFF', sunGlow: '#FFE2A8', sunGlyph: '#FFD27A',
    });
    expect(alpha).toMatchObject({ casingStroke: 0.85, casingText: 0.9, surfaceChip: 0.62, surfaceTab: 0.8, ringBorder: 0.14, ringWedge: 0.1, scrim: 0.55, scrimPermissions: 0.6, segmentTrack: 0.08, segmentBorder: 0.12, segmentUnselectedText: 0.82 });
    expect(scrimColor).toBe('#05060A');
  });
  it('typography', () => {
    expect(type.dialTime).toEqual({ size: 22, sizeActive: 24, weight: 700 });
    expect([type.dialDay.size, type.dialMonth.size, type.dialLabel.size, type.pathHour.size, type.event.size]).toEqual([20, 18, 13, 16, 15]);
    expect([type.chipOffset.size, type.chipZoom.size, type.segment.size, type.segment.sizeLandscapeDate]).toEqual([16, 15, 17, 15]);
    expect(type.fontVariant).toContain('tabular-nums');
  });
  it('strokes', () => {
    expect([stroke.pathDay, stroke.pathGolden, stroke.pathHidden, stroke.pathNight, stroke.casingExtra]).toEqual([3, 5, 4, 2.5, 3]);
    expect(stroke.dash).toEqual([7, 6]);
    expect([stroke.tickWidth, stroke.tickLength, stroke.tickCasing, stroke.horizon, stroke.horizonCasing]).toEqual([2.5, 14, 6, 1.5, 4]);
    expect([stroke.skyline, stroke.skylineCasing, stroke.dialTick, stroke.dialTrack]).toEqual([1.2, 3, 1.5, 4]);
    expect([stroke.glyph24, stroke.glyphSettings, stroke.glyph64]).toEqual([2, 1.8, 3]);
  });
  it('sizes', () => {
    expect(size.sun).toEqual({ core: 11, ring: 30, glow: 64, eventRing: 48, liftedRing: 40, hollowCore: 14 });
    expect([size.dial.time, size.dial.day, size.dial.month]).toEqual([[220, 272], [172, 216], [124, 168]]);
    expect([size.dial.trackInner, size.dial.trackOuter, size.dial.labelTime, size.dial.labelDay, size.dial.labelMonth]).toEqual([223, 270, 246, 194, 146]);
    expect(size.dial.notch).toEqual([274, 287]);
    expect([size.edgeTab.height, size.edgeTab.point, size.edgeTab.minGap]).toEqual([34, 14, 44]);
    expect([size.chip.height, size.chip.radius, size.chip.padLeft, size.chip.padRight, size.chip.gap]).toEqual([44, 22, 10, 12, 8]);
    expect([size.sheet.padding, size.sheet.rowGap, size.sheet.rowGapLandscape, size.sheet.segmentHeight, size.sheet.trackPadding, size.sheet.gap]).toEqual([16, 20, 16, 52, 4, 4]);
    expect(size.edgeDeadZone).toBe(24);
    expect([size.gear.radius, size.gear.right]).toEqual([12, 12]);
  });
  it('motion', () => {
    expect(motion.overlayLowPassMs).toBe(80);
    expect(motion.wheelSnap).toEqual({ response: 0.3, damping: 0.85, androidStiffness: 600 });
    expect([motion.backToNowMs, motion.eventPulseMs, motion.sheetOpenMs, motion.sheetCloseMs, motion.calibrationClearMs]).toEqual([400, 300, 300, 250, 250]);
    expect([motion.edgeTabFadeMs, motion.zoomChipShowMs, motion.zoomChipFadeMs]).toEqual([150, 1200, 300]);
    expect(motion.hint).toMatchObject({ fadeIn: 300, dragEnd: 900, holdEnd: 1300, end: 1900, delay: 800 });
    expect(motion.compass).toMatchObject({ loopMs: 2000, cardMs: 6000, shrinkMs: 250 });
    expect(motion.reduceMotion).toEqual({ hintStillMs: 2000, linearMs: 150 });
  });
  it('no component hardcodes a color outside the theme file', () => {
    const offenders = APP_SOURCES.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(path.join('theme', 'tokens.ts')))
      .filter((f) => /['"`](#[0-9a-fA-F]{3,8}|rgba?\()/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('no words in the UI', () => {
  it('every visible formatter returns allowed characters only', () => {
    const samples = [
      formatClock(17, 42, '12'), formatClock(17, 42, '24'), formatClock(0, 5, '12'),
      formatDate(2026, 10, 12, 'mdy'), formatDate(2026, 10, 12, 'dmy'), formatDate(2026, 10, 12, 'ymd'),
      formatDegrees(2.08), formatZoom(true), formatZoom(false),
      ...Array.from({ length: 24 }, (_, h) => formatHourNumeral(h, '12')),
    ];
    for (const s of samples) expect([s, VISIBLE_CHARSET.test(s)]).toEqual([s, true]);
  });
  it('the lint rule fails the build on visible words', () => {
    const { Linter } = require('eslint');
    const sunspotter = require('../eslint-rules');
    const linter = new Linter({ configType: 'flat' });
    const config = [{
      files: ['**/*.jsx'],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { sunspotter },
      rules: { 'sunspotter/no-words': 'error' },
    }];
    const lint = (code: string) => linter.verify(code, config, 'probe.jsx').filter((m: { ruleId: string }) => m.ruleId === 'sunspotter/no-words');
    expect(lint('const A = () => <Text>Sunset</Text>;')).toHaveLength(1);
    expect(lint('const A = () => <Text>{"PM"}</Text>;')).toHaveLength(1);
    expect(lint('const A = () => <Text title="Close" />;')).toHaveLength(1);
    expect(lint('const A = () => <Text>6:33</Text>;')).toHaveLength(0);
    expect(lint('const A = () => <Text accessibilityLabel="Close settings">2.1°</Text>;')).toHaveLength(0);
  });
});

describe('no network', () => {
  it('no networking or analytics code in the app source (JS and native)', () => {
    const banned = /\b(fetch\(|XMLHttpRequest|WebSocket|EventSource|HttpURLConnection|OkHttp|URLSession|NSURLConnection|Socket\(|firebase|analytics|crashlytics|sentry|amplitude|mixpanel|segment\.io|bugsnag)\b/i;
    const hits = APP_SOURCES.filter((f) => !f.includes('__tests__')).flatMap((f) =>
      fs.readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const).filter(([, , l]) => banned.test(l) && !/^\s*(\/\/|\*)/.test(l)),
    );
    expect(hits).toEqual([]);
  });
  it('no network-capable or tracking dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies);
    const banned = /(axios|expo-updates|expo-network|analytics|sentry|crash|firebase|amplitude|mixpanel|segment|expo-notifications|expo-insights|expo-camera|expo-location|in-app|purchase|revenuecat)/;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
    const documented = fs.readFileSync(path.join(ROOT, 'DEPENDENCIES.md'), 'utf8');
    for (const d of deps) expect([d, documented.includes(`\`${d}\``)]).toEqual([d, true]);
  });
  it('INTERNET is blocked in the release manifest config', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    expect(app.expo.android.blockedPermissions).toContain('android.permission.INTERNET');
    expect(app.expo.android.permissions).not.toContain('android.permission.INTERNET');
  });
});
