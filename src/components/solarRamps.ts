// Colour ramps of the solar map, shared by the 3D overlay and the panel legend (kept free of three.js so the panel,
// which loads with the app, does not pull the 3D code into the main bundle). From the design system's data scales
// (lib/design/tokens.ts DATA, via lib/displayMode.ts), picked by the data: sun hours increase, so sequential (light =
// little sun, dark = the whole window); hours lost are a change against the existing context, so the losing half of the
// diverging scale, starting at its neutral middle (no change).
import type { SunHours } from '../engine/solarRules'
import { LOSS_SIDE, MISSING, SEQUENTIAL, rampColour } from '../lib/displayMode'

/** Sequential ramp for hours (light = little sun, dark = the whole window). */
export const HOURS_RAMP: readonly string[] = SEQUENTIAL
/** Ramp for hours lost against the baseline: the diverging scale's neutral middle (0 h, no change) to its dark end. */
export const LOSS_RAMP: readonly string[] = LOSS_SIDE
export const LOSS_MAX_H = 3

const MISSING_RGB = rampColour([MISSING, MISSING], 0)

/**
 * One texel per grid cell, in sRGB (the texture is tagged sRGB, so the ramp is interpolated in sRGB, as the legend's
 * CSS gradient is). Cells under buildings have no value: a diagonal hatch of the missing-data grey, never the colour of
 * zero. In the loss view, zero loss is drawn in the scale's neutral middle (a measured "no change"), not left blank.
 */
export function mapTexels(m: SunHours, view: 'hours' | 'loss'): Uint8Array {
  const { nx, ny } = m.grid
  const data = new Uint8Array(nx * ny * 4)
  for (let k = 0; k < nx * ny; k++) {
    let rgb: [number, number, number], alpha: number
    if (m.covered[k]) {
      // Stripes three cells apart along the diagonal, so the hatch reads at the map's own cell size.
      const i = k % nx, j = Math.floor(k / nx)
      if ((i + j) % 3 !== 0) continue
      rgb = MISSING_RGB; alpha = 0.55
    } else if (view === 'hours') {
      rgb = rampColour(HOURS_RAMP, m.possible > 0 ? m.proposal[k] / m.possible : 0)
      alpha = 0.78
    } else {
      rgb = rampColour(LOSS_RAMP, Math.max(0, m.baseline[k] - m.proposal[k]) / LOSS_MAX_H)
      alpha = 0.8
    }
    data[k * 4] = Math.round(rgb[0] * 255); data[k * 4 + 1] = Math.round(rgb[1] * 255); data[k * 4 + 2] = Math.round(rgb[2] * 255); data[k * 4 + 3] = Math.round(alpha * 255)
  }
  return data
}
