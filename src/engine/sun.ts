// Sun for the shadow preview and the Layer 0 summary. Same NOAA equations and BC clock as the solar-access test
// (engine/solar.ts): about 0.01° in this century, against 0.5° for the older simplified formula used here before.

import { bcClock, solarPosition, sunDirection } from './solar'

export const VANCOUVER = { lat: 49.283, lon: -123.12 }

/** Sun azimuth (deg clockwise from true north) and apparent altitude (deg) for a UTC instant. */
export function sunPosition(date: Date, lat = VANCOUVER.lat, lon = VANCOUVER.lon) {
  return solarPosition(date, lat, lon)
}

/**
 * Vancouver wall-clock time to a UTC Date. BC has kept UTC-7 all year since 8 Mar 2026 (the Downtown solar guideline,
 * s.5 p.10, also sets studies to "PT, UTC -7"); earlier dates follow the old PDT/PST switch.
 */
export function vancouverTime(month: number, day: number, hour: number, year = 2026): Date {
  return new Date(bcClock(year, month, day, Math.floor(hour), Math.round((hour % 1) * 60)))
}

/** Direction pointing TO the sun in the model frame (x, y, z-up), given where true north points. */
export function sunVector(azimuthDeg: number, altitudeDeg: number, northDegClockwiseFromY: number): [number, number, number] {
  return sunDirection({ azimuth: azimuthDeg, altitude: altitudeDeg }, northDegClockwiseFromY)
}
