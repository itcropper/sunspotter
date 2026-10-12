// Astronomy thresholds and timing constants (Spec-ReadMe §3, Spec-Math, Spec-Interactions).
// These are judgment calls in the design; keep them here, in one place.

/** Geometric altitude (deg) of astronomical sunrise/sunset. */
export const ALT_RISE_SET = -0.833;
/** Golden hour: geometric altitude from +6° down to −4°. */
export const ALT_GOLDEN_HIGH = 6;
export const ALT_GOLDEN_LOW = -4;
/** Blue hour: −4° to −6°. Night is below −6°. */
export const ALT_BLUE_LOW = -6;
/** Upper limb offset used for "visible" (Spec-Math terrain section; horizon is flat in v1). */
export const SUN_SEMI_DIAMETER = 0.27;

/** Path sampling interval and boundary precision (Spec-Math). */
export const PATH_SAMPLE_MS = 2 * 60 * 1000;
export const BISECT_PRECISION_MS = 1000;
/** Recompute the day's path when the location moves more than this (m). */
export const PATH_RECOMPUTE_DISTANCE_M = 100;

/** Clip the projected polyline at this camera-space depth (Spec-Math). */
export const CLIP_Z = 0.1;

/** Live/pinned (Spec-Interactions state rules). */
export const BACKGROUND_RESET_MS = 15 * 60 * 1000;

/** Calibration persistence (Spec-Interactions). */
export const CALIBRATION_MAX_DISTANCE_M = 1000;
export const CALIBRATION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Screen-reader nudge step (Spec-A11y). */
export const CALIBRATION_NUDGE_DEG = 0.25;

/** Compass accuracy (C-Indicators). */
export const COMPASS_BAD_ACCURACY_DEG = 15;
export const COMPASS_BAD_HOLD_MS = 1000;

/** Sky scrub (Spec-Interactions). */
export const SCRUB_PT_PER_MINUTE = 2.2;
export const SCRUB_LOCK_DISTANCE = 10;
export const SCRUB_LOCK_ANGLE_DEG = 30;
export const EDGE_DEAD_ZONE = 24;
export const BOTTOM_DEAD_ZONE = 34;

/** Pinch thresholds (Spec-Interactions). */
export const PINCH_TO_WIDE = 0.8;
export const PINCH_TO_NORMAL = 1.25;
export const WIDE_ZOOM = 0.5;

/** Long-press (C-Sun, Spec-Interactions). */
export const LONG_PRESS_MS = 450;
export const CALIBRATION_LIFT = 56;
export const SUN_HIT_DIAMETER = 56;

/** Haptics (Spec-Interactions). */
export const HAPTIC_LIGHT_MAX_PER_SEC = 30;
export const CENTER_BUMP_RADIUS = 22;
export const CENTER_BUMP_MIN_INTERVAL_MS = 3000;

/** Dial (C-Dial). */
export const DIAL_DEG_PER_MINUTE = 1.4;
export const DIAL_DEG_PER_DAY = 18;
export const DIAL_DEG_PER_MONTH = 30;
export const DIAL_NOW_TICK_WINDOW_MIN = 32;

/** Sun marker label avoidance (C-Sun). */
export const LABEL_AVOID_RADIUS = 32;

/** Mock "now" from Spec-ReadMe: Oct 12 2026, 5:42 PM PDT, Ashland OR. */
export const MOCK_NOW_MS = Date.UTC(2026, 9, 13, 0, 42);
export const MOCK_LOCATION = { latitude: 42.1946, longitude: -122.7095 };
/** Polar mock: Tromsø, June 22 2026, 12:15 AM CEST. */
export const MOCK_POLAR_NOW_MS = Date.UTC(2026, 5, 21, 22, 15);
export const MOCK_POLAR_LOCATION = { latitude: 69.6492, longitude: 18.9553 };
