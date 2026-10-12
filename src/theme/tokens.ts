// Every token from Spec-Tokens, in one place. Components must read colors, sizes, strokes and
// durations from here (a test checks that no component hardcodes a hex color).
// Single theme: the camera is always the background, so there is no light/dark variant.
import { Platform } from 'react-native';

const BG = '#0B0E14';

export const color = {
  ui: '#FFF4DC',
  bg: BG,
  sheet: '#14161C',
  am: '#8DE8D4',
  pm: '#FFCFA6',
  golden: '#FF9E2C',
  blue: '#3E8BFF',
  blueText: '#7FB2FF',
  now: '#FF5B4D',
  sunCore: '#FFFFFF',
  sunGlow: '#FFE2A8',
  sunGlyph: '#FFD27A',
  white: '#FFFFFF',
} as const;

/** Alpha values are 0–1. Increase Contrast raises casing to 1.0 and ring fill to .80 (Spec-A11y). */
export const alpha = {
  casingStroke: 0.85,
  casingText: 0.9,
  surfaceChip: 0.62,
  surfaceTab: 0.8,
  ringBorder: 0.14,
  ringWedge: 0.1,
  scrim: 0.55,
  scrimPermissions: 0.6,
  segmentTrack: 0.08,
  segmentBorder: 0.12,
  segmentUnselectedText: 0.82,
  closeButton: 0.08,
  grabber: 0.35,
  dialTick: 0.7,
  dialNeighbor: 0.7,
  dialActiveFill: 0.85,
  dialActiveBorder: 0.45,
  dialInactiveFill: 0.35,
  dialInactiveReadout: 0.45,
  dialInactiveBorder: 0.08,
  dialDisabled: 0.35,
  ghostTicks: 0.25,
  nightPath: 0.5,
  compassDim: 0.3,
  increasedContrastCasing: 1,
  increasedContrastRing: 0.8,
  permissionRing: 0.18,
  permissionButtonBorder: 0.5,
  permissionButtonFill: 0.06,
  deniedGlyph: 0.6,
  eventRing: 0.55,
  innerTrack: 0.9,
  skyline: 0.8,
  skylineCasing: 0.4,
} as const;

export const scrimColor = '#05060A';

/** Debug-only simulator backdrop (not a design token; stripped from release with the simulator). */
export const simBackdrop = { sky: ['#3F6FA8', '#A9C3D9', '#F2D4A8'], ground: '#1B2318' } as const;

export const type = {
  family: { medium: 'SpaceGrotesk-Medium', semibold: 'SpaceGrotesk-SemiBold', bold: 'SpaceGrotesk-Bold' },
  dialTime: { size: 22, sizeActive: 24, weight: 700 },
  dialDay: { size: 20, weight: 700 },
  dialMonth: { size: 18, weight: 700 },
  dialLabel: { size: 13, weight: 500 },
  pathHour: { size: 16, weight: 600 },
  event: { size: 15, weight: 600 },
  chipOffset: { size: 16, weight: 600 },
  chipZoom: { size: 15, weight: 600 },
  segment: { size: 17, sizeLandscapeDate: 15, weightSelected: 600, weightUnselected: 500 },
  /** Tabular figures on every string. */
  fontVariant: ['tabular-nums'] as const,
} as const;

export const stroke = {
  pathDay: 3,
  pathGolden: 5,
  pathHidden: 4,
  pathNight: 2.5,
  casingExtra: 3,
  dash: [7, 6] as const,
  tickWidth: 2.5,
  tickLength: 14,
  tickCasing: 6,
  horizon: 1.5,
  horizonCasing: 4,
  skyline: 1.2,
  skylineDash: [2, 4] as const,
  skylineCasing: 3,
  dialTick: 1.5,
  dialTrack: 4,
  glyph24: 2,
  glyphSettings: 1.8,
  glyph64: 3,
  textCasing: 3.5,
  sunRing: 2,
  sunRingCasing: 5,
  markerArc: 2,
  markerArcCasing: 5,
  nowTick: 3,
} as const;

const isAndroid = Platform.OS === 'android';

export const size = {
  touchMin: isAndroid ? 48 : 44,
  sun: { core: 11, ring: 30, glow: 64, eventRing: 48, liftedRing: 40, hollowCore: 14 },
  dial: {
    time: [220, 272] as const,
    day: [172, 216] as const,
    month: [124, 168] as const,
    trackInner: 223,
    trackOuter: 270,
    labelTime: 246,
    labelDay: 194,
    labelMonth: 146,
    notch: [274, 287] as const,
    notchWidthDeg: 2.8,
    selectionDeg: 45,
    wedgeDeg: [38, 52] as const,
    tickMinor: [264, 272] as const,
    tickMajor: [258, 272] as const,
    labelHideDeg: 12,
    nowTick: [262, 280] as const,
    nowDotR: 287,
    nowDot: 9,
    pipR: 298,
    pip: 12,
    pipAngleEarlier: 72,
    pipAngleLater: 12,
    ghostOffsetDeg: 3,
    topClearance: 284,
  },
  gear: { box: isAndroid ? 48 : 44, radius: 12, right: 12, glyph: 24 },
  close: { box: isAndroid ? 48 : 44, glyph: 16 },
  edgeTab: { height: 34, point: 14, minGap: 44, edgePad: 2, topClear: 56, bottomClear: 54 },
  chip: { height: 44, radius: 22, padLeft: 10, padRight: 12, gap: 8, glyph: 26 },
  zoomChip: { width: 64, height: 32, radius: 16, top: 62 },
  sheet: {
    radius: isAndroid ? 28 : 24,
    padding: 16,
    rowGap: 20,
    rowGapLandscape: 16,
    segmentHeight: 52,
    segmentRadius: 11,
    trackRadius: 15,
    trackPadding: 4,
    gap: 4,
    height: 440,
    landscapeWidth: 640,
    grabber: isAndroid ? { w: 32, h: 4 } : { w: 36, h: 5 },
    contentTop: 72,
  },
  edgeDeadZone: 24,
  marker: { arcR: 8, labelOffset: 33 },
  permission: { prompt: 128, ring: 160, openSettings: 72, glyph: 64, glyphSmall: 40, gap: 48 },
  compassCard: { width: 280, height: 230, radius: 28, glyphBox: 44, top: 190 },
} as const;

export const motion = {
  overlayLowPassMs: 80,
  wheelSnap: { response: 0.3, damping: 0.85, androidStiffness: 600 },
  backToNowMs: 400,
  eventPulseMs: 300,
  sheetOpenMs: 300,
  sheetCloseMs: 250,
  calibrationClearMs: 250,
  edgeTabFadeMs: 150,
  zoomChipShowMs: 1200,
  zoomChipFadeMs: 300,
  hint: { fadeIn: 300, dragEnd: 900, holdEnd: 1300, end: 1900, delay: 800, dragMinutes: 25, holdMinutes: 40 },
  compass: { loopMs: 2000, cardMs: 6000, shrinkMs: 250, pulseHz: 1 },
  reduceMotion: { hintStillMs: 2000, linearMs: 150 },
  dialSideMs: 300,
  overlayFadeInMs: 300,
} as const;

/** "rgba()" helper so components never inline color literals. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
