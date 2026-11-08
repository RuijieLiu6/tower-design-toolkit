// Colour ramp for sun on surfaces (Energy & carbon node), shared by the 3D overlay and the Inspector chart: the design
// system's sequential data scale (lib/design/tokens.ts DATA), an increasing quantity from light (little sun) to dark.
import { SEQUENTIAL } from '../lib/displayMode'

/** Light (little sun) to dark (most sun). */
export const RAMP: readonly string[] = SEQUENTIAL
/** Scale for the ramp: modelled sun on the surface, kWh/m²·yr; fixed, so options compare on one scale. */
export const POA_RANGE: [number, number] = [350, 1150]
