// Colour ramp for sun on surfaces (Energy & carbon node), shared by the 3D overlay and the Inspector chart.
/** Dark blue (little sun) to yellow (most sun). */
export const RAMP = ['#253494', '#2c7fb8', '#41b6c4', '#a1dab4', '#ffffcc'] as const
/** Scale for the ramp: modelled sun on the surface, kWh/m²·yr. */
export const POA_RANGE: [number, number] = [350, 1150]
