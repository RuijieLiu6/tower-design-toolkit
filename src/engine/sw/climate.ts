// Hourly climate physics, ported from Sinnie Choi's Sun & Wind Studio (physics.js, commit c24addb) so it takes the
// climate as an input instead of reading the app's global state. After the open-source engines it cites: Perez 1990
// all-weather sky on tilted faces (pvlib 'allsitescomposite1990', Radiance gendaymtx, EnergyPlus), Perez 1990 luminous
// efficacy (EnergyPlus WeatherManager), NOAA sun position for every hour of the CWEC typical year, LM-83 occupied hours
// (8:00–18:00 clock time) and the ASHRAE 55 prevailing mean outdoor temperature.
import type { ClimatePayload } from './types'

const PZ = [[-0.008, 0.588, -0.062, -0.060, 0.072, -0.022], [0.130, 0.683, -0.151, -0.019, 0.066, -0.029], [0.330, 0.487, -0.221, 0.055, -0.064, -0.026], [0.568, 0.187, -0.295, 0.109, -0.152, -0.014],
  [0.873, -0.392, -0.362, 0.226, -0.462, 0.001], [1.132, -1.237, -0.412, 0.288, -0.823, 0.056], [1.060, -1.600, -0.359, 0.264, -1.127, 0.131], [0.678, -0.327, -0.250, 0.156, -1.377, 0.251]]
const EPS = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2]
const DIF = { a: [97.24, 107.22, 104.97, 102.39, 100.71, 106.42, 141.88, 152.23], b: [-0.46, 1.15, 2.96, 5.59, 5.94, 3.83, 1.90, 0.35], c: [12.00, 0.59, -5.53, -13.95, -22.75, -36.15, -53.24, -45.27], d: [-8.91, -3.95, -8.77, -13.90, -23.74, -28.83, -14.03, -7.98] }
const DIR = { a: [57.20, 98.99, 109.83, 110.34, 106.36, 107.19, 105.75, 101.18], b: [-4.55, -3.46, -4.90, -5.84, -3.97, -1.25, 0.77, 1.58], c: [-2.98, -1.21, -1.71, -1.99, -1.75, -1.51, -1.26, -1.10], d: [117.12, 12.38, -8.81, -4.56, -6.16, -26.73, -34.44, -8.29] }
const EXT_ILL = [131153, 130613, 128992, 126816, 124731, 123240, 122652, 123120, 124576, 126658, 128814, 130471]
export const ALBEDO = 0.2
/** Daylight-saving offsets by month as Sun & Wind Studio keeps them (Vancouver: PST Nov–Feb, PDT Mar–Oct). */
export const TZ_BY_MONTH = [-8, -8, -7, -7, -7, -7, -7, -7, -7, -7, -8, -8]

export interface SunPos { alt: number; az: number; cz: number }

/** Sun position (radians; az clockwise from true north) for a day of year and a decimal hour of local standard time. */
export function sunAt(latRad: number, lon: number, doy: number, hour: number, tz: number): SunPos {
  const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const ha = ((hour * 60 + eq + 4 * lon - 60 * tz) / 4 - 180) * Math.PI / 180
  const cz = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha)
  const zen = Math.acos(Math.max(-1, Math.min(1, cz)))
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(decl) - Math.sin(latRad) * cz) / (Math.cos(latRad) * Math.sin(zen) || 1e-9))))
  if (ha > 0) az = 2 * Math.PI - az
  return { alt: Math.PI / 2 - zen, az, cz }
}

/** Every hour of the typical year: sun, Perez sky state and luminous efficacy. */
export interface ClimateHours {
  n: number
  doy: Int16Array; mon: Int8Array; hr: Int8Array
  alt: Float32Array; az: Float32Array; cz: Float32Array
  T: Float32Array; ws: Float32Array; wd: Float32Array; rain: Float32Array
  ghi: Float32Array; dni: Float32Array; dhi: Float32Array
  F1: Float32Array; F2: Float32Array; effD: Float32Array; effB: Float32Array; Ed: Float32Array; Eb: Float32Array
  /** ASHRAE 55 prevailing mean outdoor temperature for each hour. */
  tpma: Float32Array
  /** Daily mean temperature. */
  daily: Float32Array
  /** LM-83 occupied hours (8:00–18:00 clock time), as hour indices. */
  occ: Int32Array
}

const cache = new WeakMap<ClimatePayload, ClimateHours>()

/** Prepare the hourly sun and sky once per climate (cached by identity). */
export function prepClimate(C: ClimatePayload): ClimateHours {
  const hit = cache.get(C)
  if (hit) return hit
  const h = C.hourly, n = 8760, lat = C.lat * Math.PI / 180, lon = C.lon
  const o: ClimateHours = {
    n, doy: new Int16Array(n), mon: new Int8Array(n), hr: new Int8Array(n), alt: new Float32Array(n), az: new Float32Array(n), cz: new Float32Array(n),
    T: Float32Array.from(h.t.slice(0, n)), ws: Float32Array.from(h.ws.slice(0, n)), wd: Float32Array.from(h.wd.slice(0, n)),
    rain: Float32Array.from((h.rain ?? new Array(n).fill(0)).slice(0, n)),
    ghi: Float32Array.from(h.ghi.slice(0, n)), dni: Float32Array.from(h.dni.slice(0, n)), dhi: Float32Array.from(h.dhi.slice(0, n)),
    F1: new Float32Array(n), F2: new Float32Array(n), effD: new Float32Array(n), effB: new Float32Array(n), Ed: new Float32Array(n), Eb: new Float32Array(n),
    tpma: new Float32Array(n), daily: new Float32Array(365), occ: new Int32Array(0),
  }
  const mStart: number[] = []
  { let s = 0; for (let m = 0; m < 12; m++) { mStart.push(s); s += C.days[m] } }
  for (let k = 0; k < n; k++) {
    const doy = Math.floor(k / 24) + 1, he = k % 24 + 1
    let m = 11
    for (let q = 0; q < 12; q++) { if (doy <= mStart[q] + C.days[q]) { m = q; break } }
    o.doy[k] = doy; o.mon[k] = m; o.hr[k] = he
    const p = sunAt(lat, lon, doy, he - 0.5, -8)
    o.alt[k] = p.alt; o.az[k] = p.az; o.cz[k] = p.cz
    const dhi = o.dhi[k], dni = o.dni[k]
    if (p.alt <= 0.01 || dhi <= 0) continue
    const z = Math.PI / 2 - p.alt, zeta = 1.041 * z * z * z
    const eps = ((dhi + dni) / (dhi + 1e-4) + zeta) / (1 + zeta)
    let b = 0
    while (b < 7 && eps > EPS[b]) b++
    const altD = p.alt * 180 / Math.PI
    const am = (1 - 0.1 * (C.elev || 4) / 1000) / (Math.sin(p.alt) + 0.15 / Math.pow(altD + 3.885, 1.253))
    const delta = dhi * 93.73 * am / EXT_ILL[m], c = PZ[b]
    o.F1[k] = Math.max(0, c[0] + c[1] * delta + c[2] * z)
    o.F2[k] = c[3] + c[4] * delta + c[5] * z
    const W = Math.exp(0.07 * (o.T[k] - 3) - 0.075) // precipitable water from a dew point ~3 K under air temperature (humid Vancouver)
    o.effD[k] = Math.max(0, DIF.a[b] + DIF.b[b] * W + DIF.c[b] * p.cz + DIF.d[b] * Math.log(Math.max(1e-4, delta)))
    o.effB[k] = Math.max(0, DIR.a[b] + DIR.b[b] * W + DIR.c[b] * Math.exp(5.73 * z - 5) + DIR.d[b] * delta)
    o.Ed[k] = dhi * o.effD[k]; o.Eb[k] = dni * o.effB[k]
  }
  const occ: number[] = []
  for (let k = 0; k < n; k++) {
    const dst = (TZ_BY_MONTH[o.mon[k]] ?? -8) + 8, clockEnd = o.hr[k] + dst
    if (clockEnd >= 9 && clockEnd <= 18) occ.push(k)
  }
  o.occ = Int32Array.from(occ)
  for (let d = 0; d < 365; d++) { let s = 0; for (let q = 0; q < 24; q++) s += o.T[d * 24 + q]; o.daily[d] = s / 24 }
  for (let d = 0; d < 365; d++) { let s = 0; for (let q = 1; q <= 7; q++) s += o.daily[(d - q + 365) % 365]; const v = s / 7; for (let q = 0; q < 24; q++) o.tpma[d * 24 + q] = v }
  cache.set(C, o)
  return o
}

export interface FaceHours { az: number; sky: Float32Array; gnd: Float32Array; beam: Float32Array; skyL: Float32Array; gndL: Float32Array; beamL: Float32Array }
const faceCache = new WeakMap<ClimateHours, Map<number, FaceHours>>()

/** Irradiance (W/m²) and illuminance (lux) on a vertical face of compass azimuth az (deg) for every hour, Perez 1990. */
export function faceHours(P: ClimateHours, az: number): FaceHours {
  const key = Math.round(((az % 360) + 360) % 360)
  let m = faceCache.get(P)
  if (!m) { m = new Map(); faceCache.set(P, m) }
  const hit = m.get(key)
  if (hit) return hit
  const n = P.n, a0 = key * Math.PI / 180, b85 = Math.cos(85 * Math.PI / 180)
  const sky = new Float32Array(n), gnd = new Float32Array(n), beam = new Float32Array(n), skyL = new Float32Array(n), gndL = new Float32Array(n), beamL = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    if (P.alt[k] <= 0.01) continue
    const cosT = Math.cos(P.alt[k]) * Math.cos(P.az[k] - a0), a = Math.max(0, cosT), b = Math.max(b85, P.cz[k])
    const s = Math.max(0, P.dhi[k] * ((1 - P.F1[k]) * 0.5 + P.F1[k] * a / b + P.F2[k]))
    sky[k] = s; beam[k] = P.dni[k] * a; gnd[k] = P.ghi[k] * ALBEDO * 0.5
    skyL[k] = s * P.effD[k]; beamL[k] = beam[k] * P.effB[k]; gndL[k] = (P.Eb[k] * P.cz[k] + P.Ed[k]) * ALBEDO * 0.5
  }
  const f = { az: key, sky, gnd, beam, skyL, gndL, beamL }
  m.set(key, f)
  return f
}

/** A month-day period by day of year (d0..d1, wrapping over the new year), or the whole year. */
export interface Period { d0: number; d1: number; full?: boolean; label: string }
export const FULL_YEAR: Period = { d0: 1, d1: 365, full: true, label: 'Whole year' }
export function inPeriod(p: Period, doy: number): boolean { return !!p.full || (p.d1 >= p.d0 ? doy >= p.d0 && doy <= p.d1 : doy >= p.d0 || doy <= p.d1) }

/** Compass azimuth (deg, clockwise from true north) of a wall's outward normal, from its plan edge a→b in the project frame. */
export function edgeAzimuth(a: [number, number], b: [number, number], northDeg: number, ccwRing: boolean): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  // Outward normal: right of the edge for a counter-clockwise ring.
  const nx = ccwRing ? dy : -dy, ny = ccwRing ? -dx : dx
  const frameAz = Math.atan2(nx, ny) * 180 / Math.PI // clockwise from +y
  return (((frameAz - northDeg) % 360) + 360) % 360
}

export const ringIsCcw = (r: [number, number][]) => { let s = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; s += x0 * y1 - x1 * y0 } return s > 0 }
