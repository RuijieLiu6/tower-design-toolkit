// Colour ramps of the solar map, shared by the 3D overlay and the panel legend (kept free of three.js so the panel,
// which loads with the app, does not pull the 3D code into the main bundle).
/** Sequential ramp for hours (dark = little sun, pale yellow = full window). */
export const HOURS_RAMP = ['#25264a', '#4a3a83', '#9b4c8f', '#e0725d', '#f5b453', '#fbeb8e']
/** Ramp for hours lost against the baseline (none = transparent). */
export const LOSS_RAMP = ['#fde0c5', '#f6a46b', '#e4572e', '#a3162b']
export const LOSS_MAX_H = 3
