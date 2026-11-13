// Wind-driven rain, ported from Sinnie Choi's Sun & Wind Studio (rain.js, climate.js / weather.json, study.js
// exposurePass) so it computes only from its inputs instead of LAB.S, LAB.floors and LAB.CLIMATE:
//   - the hourly rain by wind sector (rain.js rainBySector / rainFrom),
//   - the ISO 15927-3 airfield driving-rain index per façade orientation, 2/9 · Σ v · r^(8/9) · cos θ over 10° bins
//     (weather.json wdrBins / rain.js exposure), with S&W's wall factor by height (rain.js wallFactor) and its BS 8104
//     exposure bands read on the index / 4 (rain.js bs8104),
//   - roof collection (rain.js roofCollect: catchment × rainfall × 80% run-off),
//   - the rain shadow on the ground (study.js exposurePass, drawn by rain.js drawOverlay): S&W renders one design-storm
//     pass; here it is cast for every rain sector of the period and summed into the share of the rain each cell is
//     sheltered from (team assumption), plus S&W's design-storm "ground kept dry" by the towers.
// Directions: wind is meteorological "from", degrees clockwise from TRUE north; northDeg turns the project frame.
import type { ClimatePayload, LegendBand, Prism } from './types'
import { fillPolygon, gridOver, ringArea, shadowMask, type Grid, type Occluders, type Pt } from '../shadow'
import { edgeAzimuth, ringIsCcw } from './climate'

// ---- periods and hours ------------------------------------------------------------------------------------------------

export type RainPeriod = 'year' | 'winter' | 'spring' | 'summer' | 'fall'
/** S&W's seasons (rain.js seasonsSVG): months 0–11. */
export const RAIN_PERIODS: Record<RainPeriod, { label: string; months: number[] | null }> = {
  year: { label: 'Whole year', months: null },
  winter: { label: 'Winter (Dec–Feb)', months: [11, 0, 1] },
  spring: { label: 'Spring (Mar–May)', months: [2, 3, 4] },
  summer: { label: 'Summer (Jun–Aug)', months: [5, 6, 7] },
  fall: { label: 'Fall (Sep–Nov)', months: [8, 9, 10] },
}

/** Month (0–11) of each of the 8,760 hours, from the climate's days per month. */
export function monthOfHour(days: number[]): Uint8Array {
  const m = new Uint8Array(8760)
  let k = 0
  for (let q = 0; q < 12 && k < 8760; q++) for (let j = 0; j < days[q] * 24 && k < 8760; j++) m[k++] = q
  for (; k < 8760; k++) m[k] = 11
  return m
}

export function keepFor(C: ClimatePayload, period: RainPeriod): (i: number) => boolean {
  const ms = RAIN_PERIODS[period]?.months
  if (!ms) return () => true
  const mo = monthOfHour(C.days)
  return (i) => ms.includes(mo[i])
}

/** Hourly rain (mm), 8,760 values; zeros when the climate carries none. */
export const hourlyRain = (C: ClimatePayload): number[] => (Array.isArray(C.hourly.rain) && C.hourly.rain.length >= 8760 ? C.hourly.rain : new Array(8760).fill(0))

// ---- rain by wind sector (rain.js rainBySector) -----------------------------------------------------------------------

export const N16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const WORD16: Record<string, string> = { N: 'North', NNE: 'North-north-east', NE: 'North-east', ENE: 'East-north-east', E: 'East', ESE: 'East-south-east', SE: 'South-east', SSE: 'South-south-east', S: 'South', SSW: 'South-south-west', SW: 'South-west', WSW: 'West-south-west', W: 'West', WNW: 'West-north-west', NW: 'North-west', NNW: 'North-north-west' }
export const compass16 = (az: number) => N16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16]

export interface RainSector { name: string; dir: number; f: number; mm: number; s: number }
export interface RainBySector { sec: RainSector[]; ranked: RainSector[]; tot: number; calm: number; wetHours: number; stormP95: number }

/** Rain (mm) by 16 wind sectors in the kept hours; rain in calm hours (wind under 0.5 m/s) is counted apart (rain.js). */
export function rainBySector(C: ClimatePayload, keep: (i: number) => boolean): RainBySector | null {
  const H = C.hourly, R = hourlyRain(C)
  const mm = new Array(16).fill(0), ws = new Array(16).fill(0), wet: number[] = []
  let tot = 0, calm = 0
  for (let i = 0; i < 8760; i++) {
    const r = R[i]
    if (!(r > 0) || !keep(i)) continue
    tot += r; wet.push(H.ws[i])
    if (H.ws[i] < 0.5) { calm += r; continue }
    const k = Math.round((((H.wd[i] % 360) + 360) % 360) / 22.5) % 16
    mm[k] += r; ws[k] += H.ws[i] * r
  }
  if (tot <= 0) return null
  const sec = mm.map((v, k) => ({ name: N16[k], dir: k * 22.5, f: v / tot, mm: v, s: v > 0 ? ws[k] / v : 0 }))
  wet.sort((a, b) => a - b)
  // the storm wind: 95th percentile of the wind in wet hours (weather.json stormSpeedP95)
  const stormP95 = wet[Math.floor(0.95 * (wet.length - 1))]
  return { sec, ranked: sec.slice().sort((a, b) => b.f - a.f), tot, calm: calm / tot, wetHours: wet.length, stormP95 }
}

// ---- ISO 15927-3 airfield index (weather.json wdrBins, rain.js exposure) ----------------------------------------------

/** Σ v · r^(8/9) over the kept wet hours in 36 bins of 10° by wind direction (calm hours left out). */
export function wdrBins(C: ClimatePayload, keep: (i: number) => boolean): number[] {
  const H = C.hourly, R = hourlyRain(C), S = new Array(36).fill(0)
  for (let i = 0; i < 8760; i++) {
    const r = R[i]
    if (!(r > 0) || !keep(i) || H.ws[i] < 0.5) continue
    S[Math.floor((((H.wd[i] % 360) + 360) % 360) / 10) % 36] += H.ws[i] * Math.pow(r, 8 / 9)
  }
  return S
}

/** Airfield driving-rain index (L/m²) on a wall facing compass azimuth az: 2/9 · Σ S_b · cos(bin − az), cos > 0. */
export function airfieldIndex(bins: number[], az: number): number {
  let I = 0
  for (let b = 0; b < bins.length; b++) I += bins[b] * Math.max(0, Math.cos(((b * 10 + 5 - az) * Math.PI) / 180))
  return (2 / 9) * I
}

/** S&W's wall factor (after ISO 15927-3): ~0.2 low on a tall wall rising to 0.5 at the top. */
export function wallFactor(z: number, top: number): number {
  const t = Math.max(0, Math.min(1, z / Math.max(1, top)))
  return 0.2 + 0.3 * t * t
}
/** Mean wall factor over a wall from z0 to z1 (the integral of wallFactor). */
export function meanWallFactor(z0: number, z1: number, top: number): number {
  const T = Math.max(1, top), t0 = Math.max(0, Math.min(1, z0 / T)), t1 = Math.max(0, Math.min(1, z1 / T))
  if (t1 - t0 < 1e-9) return wallFactor((z0 + z1) / 2, top)
  return 0.2 + 0.1 * (t1 ** 3 - t0 ** 3) / (t1 - t0)
}

export type RainBand = 'sheltered' | 'moderate' | 'severe' | 'very severe'
export const RAIN_BANDS: RainBand[] = ['sheltered', 'moderate', 'severe', 'very severe']
/** BS 8104 spell-index bands (L/m² per spell): 33, 56.5, 100 (rain.js bs8104). */
export const bs8104 = (spell: number): RainBand => (spell < 33 ? 'sheltered' : spell < 56.5 ? 'moderate' : spell < 100 ? 'severe' : 'very severe')
/** S&W reads the annual airfield index against the spell bands as index / 4 (a worst spell). */
export const indexBand = (I: number): RainBand => bs8104(I / 4)

// ---- the rain's angle (rain.js angle) ---------------------------------------------------------------------------------

export type DropType = 'drizzle' | 'steady' | 'heavy'
/** Terminal velocity of the drops (m/s): 0.5 mm drizzle 2, 1.5 mm steady rain 5, 3 mm heavy rain 8 (rain.js VT). */
export const DROP_VT: Record<DropType, number> = { drizzle: 2, steady: 5, heavy: 8 }
/** Angle of the rain from vertical (alpha) and its altitude (alt), radians, for a wind speed and drop type. */
export function rainAngle(speed: number, drop: DropType): { alpha: number; alt: number } {
  const alpha = Math.atan(Math.max(0, speed) / (DROP_VT[drop] ?? 5))
  return { alpha, alt: Math.PI / 2 - alpha }
}
/** S&W's design storm: from the wettest sector, at the 95th-percentile wet-hour wind, no less than 6 m/s (rain.js state). */
export function designStorm(A: RainBySector): { dir: number; speed: number } {
  return { dir: A.ranked[0].dir, speed: Math.max(6, Math.round(A.stormP95 * 2) / 2) }
}

// ---- façades ------------------------------------------------------------------------------------------------------------

export interface RainTower { id: string; name: string; height: number; blocks: (Prism & { podium?: boolean })[] }

export interface FaceRain { towerId: string; az: number; z0: number; z1: number; area: number; a: Pt; b: Pt; podium: boolean; index: number; wf: number; value: number; band: RainBand }

/**
 * One face per block edge of every tower: the orientation's airfield index (L/m², S&W's face index), the mean wall
 * factor over the face's height on that tower, and value = index × wall factor (the wall's annual driving rain, L/m²).
 * Faces shared between blocks side by side are not removed; the neighbours' shelter is not applied (S&W applies it only
 * to the design-storm wetted share).
 */
export function facadeRain(towers: RainTower[], northDeg: number, bins: number[]): FaceRain[] {
  const out: FaceRain[] = []
  for (const t of towers) {
    const top = Math.max(1, t.height, ...t.blocks.map((b) => b.z1))
    for (const blk of t.blocks) {
      const r = blk.ring, ccw = ringIsCcw(r), h = blk.z1 - blk.z0
      if (h <= 0) continue
      const wf = meanWallFactor(blk.z0, blk.z1, top)
      for (let k = 0; k < r.length; k++) {
        const a = r[k], b = r[(k + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len < 0.01) continue
        const az = edgeAzimuth(a, b, northDeg, ccw), index = airfieldIndex(bins, az)
        out.push({ towerId: t.id, az, z0: blk.z0, z1: blk.z1, area: len * h, a, b, podium: !!blk.podium, index, wf, value: index * wf, band: indexBand(index) })
      }
    }
  }
  return out
}

/** Legend for the façade field (L/m² a year on the wall): S&W's BS 8104 limits (index / 4 → 33, 56.5, 100) scaled by
 *  the top-of-wall factor 0.5, so the top of a wall reads S&W's face band and lower parts read lower (team assumption). */
export const FACADE_BANDS: LegendBand[] = [
  { to: 4 * 33 * 0.5, label: 'sheltered', color: '#dfe9f1' },
  { to: 4 * 56.5 * 0.5, label: 'moderate', color: '#a9c6dc' },
  { to: 4 * 100 * 0.5, label: 'severe', color: '#6f9cc0' },
  { to: Infinity, label: 'very severe', color: '#3f6f98' },
]

// ---- roof collection (rain.js roofCollect) ------------------------------------------------------------------------------

export interface RoofSurface { name: string; towerId: string; z: number; area: number; m3: number }
export interface RoofWater { area: number; rainMM: number; eff: number; annual: number; perMm: number; surfaces: RoofSurface[] }

/**
 * Catchment = the top surface over every plan point of a tower (main roof and exposed terraces), found on a 0.5 m raster
 * of the blocks; collected = area × rainfall × run-off efficiency (S&W: 80%, the share after first flush, evaporation
 * and splash). Overlaps between towers are counted per tower.
 */
export function roofCollect(towers: RainTower[], rainMM: number, eff: number): RoofWater {
  const surfaces: RoofSurface[] = []
  const cs = 0.5
  for (const t of towers) {
    const blocks = t.blocks.filter((b) => b.ring.length >= 3 && b.z1 > b.z0)
    if (!blocks.length) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const b of blocks) for (const [x, y] of b.ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    const g = gridOver(x0 - cs, y0 - cs, x1 + cs, y1 + cs, cs), N = g.nx * g.ny
    if (N > 4e6) { // a huge plate: each block top counted whole (no raster)
      for (const b of blocks) surfaces.push({ name: 'Roof', towerId: t.id, z: b.z1, area: ringArea(b.ring), m3: 0 })
      continue
    }
    const top = new Float32Array(N).fill(-Infinity), owner = new Int16Array(N).fill(-1), m = new Uint8Array(N)
    blocks.forEach((b, bi) => {
      m.fill(0); fillPolygon(m, g, b.ring)
      for (let k = 0; k < N; k++) if (m[k] && b.z1 > top[k]) { top[k] = b.z1; owner[k] = bi }
    })
    const cnt = new Array(blocks.length).fill(0)
    for (let k = 0; k < N; k++) if (owner[k] >= 0) cnt[owner[k]]++
    const zMax = Math.max(...blocks.map((b) => b.z1))
    blocks.forEach((b, bi) => {
      const area = cnt[bi] * cs * cs
      if (area < 5) return
      const name = b.z1 >= zMax - 0.01 ? 'Main roof' : b.podium ? `Podium roof at ${Math.round(b.z1)} m` : `Terrace at ${Math.round(b.z1)} m`
      surfaces.push({ name, towerId: t.id, z: b.z1, area, m3: 0 })
    })
  }
  for (const s of surfaces) s.m3 = s.area * rainMM / 1000 * eff
  surfaces.sort((a, b) => b.area - a.area)
  const area = surfaces.reduce((a, s) => a + s.area, 0)
  return { area, rainMM, eff, annual: area * rainMM / 1000 * eff, perMm: area * eff, surfaces }
}

// ---- rain shelter on the ground (study.js exposurePass + rain.js drawOverlay, per sector) ------------------------------

/** Unit vector (project frame) towards where the rain comes from: compass azimuth `from`, altitude alt (radians). */
export function rainVec(fromDeg: number, alt: number, northDeg: number): [number, number, number] {
  const a = ((fromDeg + northDeg) * Math.PI) / 180, c = Math.cos(alt)
  return [Math.sin(a) * c, Math.cos(a) * c, Math.max(1e-3, Math.sin(alt))]
}

export interface ShelterOptions { cell: number; drop: DropType; storm: { dir: number; speed: number }; margin?: number }
export interface GroundShelter {
  grid: Grid
  /** Share (%) of the period's rain each open cell is sheltered from (NaN inside buildings). */
  values: Float32Array
  /** Design storm: ground newly kept dry by the towers (m²), and how much of it lies inside the site. */
  dryStorm: number
  dryStormSite: number
  stormAlphaDeg: number
  /** Open ground inside the site (m²) and the part sheltered from at least half of the rain. */
  siteOpen: number
  siteHalf: number
}

export const SHELTER_BANDS: LegendBand[] = [
  { to: 10, label: 'open to the rain', color: '#eef2f4' },
  { to: 25, label: 'some shelter', color: '#cfdde3' },
  { to: 50, label: 'sheltered', color: '#9dbcc8' },
  { to: Infinity, label: 'well sheltered', color: '#5f8fa3' },
]

const occOf = (ps: Prism[]): Occluders => ({ prisms: ps.map((p) => ({ ring: p.ring, z0: p.z0, z1: p.z1 })), tris: [] })

/**
 * Each wind sector's rain falls at its own angle (its rain-weighted mean wind over the drops' terminal velocity) from
 * its direction; a cell is sheltered from that sector's share when any building (tower or context) stands between it
 * and the rain — the prism's sweep along the rain vector, as S&W renders it for one storm. Rain in calm hours falls
 * vertically and is sheltered only under raised blocks. No downwash, eddies or splash.
 */
export function groundShelter(towers: Prism[], context: Prism[], site: Pt[] | null, northDeg: number, A: RainBySector, o: ShelterOptions): GroundShelter {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const t of towers) for (const [x, y] of t.ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  if (site) for (const [x, y] of site) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  if (!Number.isFinite(x0)) { x0 = -50; y0 = -50; x1 = 50; y1 = 50 }
  const st = rainAngle(o.storm.speed, o.drop)
  const hMax = Math.max(0, ...towers.map((t) => t.z1))
  // margin: the design storm's rain shadow of the tallest tower, 40–300 m
  const margin = o.margin ?? Math.min(300, Math.max(40, Math.ceil(hMax * Math.tan(st.alpha))))
  const grid = gridOver(x0 - margin, y0 - margin, x1 + margin, y1 + margin, o.cell)
  const N = grid.nx * grid.ny, ca = o.cell * o.cell
  const gx0 = grid.x0 - 400, gx1 = grid.x0 + grid.nx * grid.cell + 400, gy0 = grid.y0 - 400, gy1 = grid.y0 + grid.ny * grid.cell + 400
  const near = context.filter((p) => p.ring.some(([x, y]) => x > gx0 && x < gx1 && y > gy0 && y < gy1))
  const all = [...near, ...towers], occAll = occOf(all), occCtx = occOf(near)
  const foot = new Uint8Array(N), over = new Uint8Array(N)
  for (const p of all) fillPolygon(p.z0 < 2 ? foot : over, grid, p.ring)
  const siteMask = site ? (() => { const m = new Uint8Array(N); fillPolygon(m, grid, site); return m })() : null
  const sh = new Float32Array(N), mask = new Uint8Array(N)
  for (const s of A.sec) {
    if (!(s.f > 0)) continue
    shadowMask(occAll, grid, rainVec(s.dir, rainAngle(s.s, o.drop).alt, northDeg), mask)
    for (let k = 0; k < N; k++) if (mask[k]) sh[k] += s.f
  }
  if (A.calm > 0) for (let k = 0; k < N; k++) if (over[k]) sh[k] += A.calm
  const values = new Float32Array(N)
  let siteOpen = 0, siteHalf = 0
  for (let k = 0; k < N; k++) {
    if (foot[k]) { values[k] = NaN; continue }
    values[k] = Math.min(100, 100 * sh[k])
    if (siteMask && siteMask[k]) { siteOpen += ca; if (values[k] >= 50) siteHalf += ca }
  }
  // S&W's design storm: ground the towers newly keep dry (with the towers minus the context alone)
  const v = rainVec(o.storm.dir, st.alt, northDeg)
  const a = shadowMask(occCtx, grid, v), b = shadowMask(occAll, grid, v)
  let dryStorm = 0, dryStormSite = 0
  for (let k = 0; k < N; k++) if (b[k] && !a[k] && !foot[k]) { dryStorm += ca; if (siteMask && siteMask[k]) dryStormSite += ca }
  return { grid, values, dryStorm, dryStormSite, stormAlphaDeg: (st.alpha * 180) / Math.PI, siteOpen, siteHalf }
}
