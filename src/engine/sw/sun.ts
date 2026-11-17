// Sun study after Sinnie Choi's Sun & Wind Studio (study.js runSunStudy, commit c24addb), on the toolkit's CPU shadow
// grid (engine/shadow.ts) instead of the studio's GPU render targets, so it runs as a pure function in a node.
//
// Ground: for each study instant the cells in shadow with and without the proposed towers; "new shadow" is the time a
// cell is shaded by the towers that it would not be by the context alone. Date scope: the studio's four dates, hours
// h0–h1 local clock time, 10-minute steps, thresholds 1 / 2 / 4 h (as the studio). Period scope: every 4th day of the
// period, hourly, each hour counted only when the CWEC record has direct sun (DNI ≥ 120 W/m², the WMO sunshine
// definition) — a measured stand-in for the studio's monthly sunshine-fraction weighting; thresholds 100 / 250 / 500 h
// a year scaled to the period's length (as the studio).
// Façades: annual irradiance per block face from the Perez sky (engine/sw/climate.ts faceHours), beam blocked hour by
// hour when the sun ray from the face's mid-point meets a context prism or another block (every 4th day sampled).
import type { FacadeFace, LegendBand, Prism } from './types'
import { fillPolygon, gridOver, shadowMask, type Grid, type Occluders, type Pt } from '../shadow'
import { edgeAzimuth, faceHours, prepClimate, ringIsCcw, sunAt, TZ_BY_MONTH, type ClimateHours } from './climate'
import type { ClimatePayload } from './types'

export type SunDate = 'equinox' | 'summer' | 'autumn' | 'winter'
export const SUN_DATES: Record<SunDate, { doy: number; label: string; m: number }> = {
  equinox: { doy: 80, label: 'Equinox · 21 March', m: 2 },
  summer: { doy: 172, label: 'Summer solstice · 21 June', m: 5 },
  autumn: { doy: 264, label: 'Equinox · 21 September', m: 8 },
  winter: { doy: 355, label: 'Winter solstice · 21 December', m: 11 },
}
export type SunPeriod = 'year' | 'spring' | 'summer' | 'autumn' | 'winter'
export const SUN_PERIODS: Record<SunPeriod, { d0: number; d1: number; label: string }> = {
  year: { d0: 1, d1: 365, label: 'Whole year' },
  spring: { d0: 60, d1: 151, label: 'Spring · Mar–May' },
  summer: { d0: 152, d1: 243, label: 'Summer · Jun–Aug' },
  autumn: { d0: 244, d1: 334, label: 'Autumn · Sep–Nov' },
  winter: { d0: 335, d1: 59, label: 'Winter · Dec–Feb' },
}

export interface SunOptions {
  scope: 'date' | 'period'
  date: SunDate
  period: SunPeriod
  /** Period scope: a day range (day of year, d1 < d0 wraps over the new year); overrides `period` (Studio's From / To). */
  range?: { d0: number; d1: number }
  /** Study hours, local clock time (date scope). */
  h0: number
  h1: number
  /** Ground cell (m). */
  cell: number
  /** Margin around the towers (m). */
  margin: number
}

export interface SunGround {
  grid: Grid
  /** Hours of new shadow per cell (NaN inside a building). */
  newShadow: Float32Array
  /** Hours of direct sun per cell with the towers (NaN inside a building). */
  sunHours: Float32Array
  /** Inside the site boundary (1) — the open ground the studio calls plaza. */
  siteMask: Uint8Array | null
  th: [number, number, number]
  /** Areas (m²) with at least th[0], th[1], th[2] hours of new shadow. */
  a: [number, number, number]
  siteOpen: number
  siteInShadow: number
  hoursStudied: number
  unit: 'h'
}

const occOf = (prisms: Prism[]): Occluders => ({ prisms: prisms.map((p) => ({ ring: p.ring, z0: p.z0, z1: p.z1 })), tris: [] })

/** Sun direction in the project frame (unit vector towards the sun), from altitude/azimuth relative to true north. */
function sunVec(alt: number, az: number, northDeg: number): [number, number, number] {
  const a = az + northDeg * Math.PI / 180 // compass → frame (clockwise from +y)
  const c = Math.cos(alt)
  return [Math.sin(a) * c, Math.cos(a) * c, Math.sin(alt)]
}

export function sunGround(towers: Prism[], context: Prism[], site: Pt[] | null, C: ClimatePayload, northDeg: number, o: SunOptions): SunGround {
  const P = prepClimate(C)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const t of towers) for (const [x, y] of t.ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  if (site) for (const [x, y] of site) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const grid = gridOver(x0 - o.margin, y0 - o.margin, x1 + o.margin, y1 + o.margin, o.cell)
  const N = grid.nx * grid.ny
  const near = context.filter((p) => p.ring.some(([x, y]) => x > grid.x0 - 400 && x < grid.x0 + grid.nx * grid.cell + 400 && y > grid.y0 - 400 && y < grid.y0 + grid.ny * grid.cell + 400))
  const occCtx = occOf(near), occAll = occOf([...near, ...towers])
  const foot = new Uint8Array(N)
  for (const p of [...near, ...towers]) if (p.z0 < 2) fillPolygon(foot, grid, p.ring)
  const siteMask = site ? (() => { const m = new Uint8Array(N); fillPolygon(m, grid, site); return m })() : null
  const newSh = new Float32Array(N), sun = new Float32Array(N)
  const a = new Uint8Array(N), b = new Uint8Array(N)
  let hoursStudied = 0
  const lat = C.lat * Math.PI / 180
  const step = (alt: number, az: number, w: number) => {
    if (alt <= 0.035) return // below 2°: no meaningful direct sun on the ground
    const v = sunVec(alt, az, northDeg)
    shadowMask(occCtx, grid, v, a.fill(0))
    shadowMask(occAll, grid, v, b.fill(0))
    for (let k = 0; k < N; k++) { if (!b[k]) sun[k] += w; else if (!a[k]) newSh[k] += w }
  }
  let th: [number, number, number]
  if (o.scope === 'date') {
    const D = SUN_DATES[o.date], tz = TZ_BY_MONTH[D.m]
    const dt = 10 / 60
    for (let h = o.h0; h < o.h1 - 1e-9; h += dt) {
      const std = h + dt / 2 - (tz + 8) // clock → standard time
      const p = sunAt(lat, C.lon, D.doy, std, -8)
      step(p.alt, p.az, dt); hoursStudied += dt
    }
    th = [1, 2, 4]
  } else {
    const Pd = o.range ?? SUN_PERIODS[o.period]
    const days = Pd.d1 >= Pd.d0 ? Pd.d1 - Pd.d0 + 1 : 365 - Pd.d0 + 1 + Pd.d1
    // Every 4th day over a season; every day over a short range (a week, one day), each sample weighted by the days it stands for.
    const every = days <= 21 ? 1 : 4
    for (let i = 0; i < days; i += every) {
      const doy = ((Pd.d0 - 1 + i) % 365) + 1, w = Math.min(every, days - i)
      for (let q = 0; q < 24; q++) {
        const k = (doy - 1) * 24 + q
        if (P.dni[k] < 120) continue
        step(P.alt[k], P.az[k], w)
      }
      hoursStudied += 24 * w
    }
    th = [100, 250, 500].map((t) => Math.max(1, Math.round(t * days / 365))) as [number, number, number]
  }
  const area = o.cell * o.cell
  const A: [number, number, number] = [0, 0, 0]
  let siteOpen = 0, siteIn = 0
  for (let k = 0; k < N; k++) {
    if (foot[k]) { newSh[k] = NaN; sun[k] = NaN; continue }
    const v = newSh[k]
    if (v >= th[0]) A[0] += area
    if (v >= th[1]) A[1] += area
    if (v >= th[2]) A[2] += area
    if (siteMask?.[k]) { siteOpen += area; if (v >= th[0]) siteIn += area }
  }
  return { grid, newShadow: newSh, sunHours: sun, siteMask, th, a: A, siteOpen, siteInShadow: siteIn, hoursStudied, unit: 'h' }
}

export const SHADOW_BANDS = (th: [number, number, number]): LegendBand[] => [
  { to: th[0] - 1e-6, label: `< ${th[0]} h`, color: '#f4efe2' },
  { to: th[1] - 1e-6, label: `${th[0]}–${th[1]} h`, color: '#c9d4e3' },
  { to: th[2] - 1e-6, label: `${th[1]}–${th[2]} h`, color: '#8fa6c4' },
  { to: Infinity, label: `≥ ${th[2]} h`, color: '#4f6f97' },
]

// ---- façades ---------------------------------------------------------------------------------------------------------

/** 2-D ray–polygon: distance along (dx, dy) from (px, py) to the first crossing of the ring, or Infinity. */
function rayHit(px: number, py: number, dx: number, dy: number, ring: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length]
    const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((ax - px) * ey - (ay - py) * ex) / den, u = ((ax - px) * dy - (ay - py) * dx) / den
    if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

export interface FaceIn { towerId: string; ring: Pt[]; z0: number; z1: number }

/** Annual irradiance (kWh/m²·yr) on every block face, Perez sky, beam shaded by the context and the other blocks. */
export function facadeIrradiance(blocks: FaceIn[], obstacles: Prism[], C: ClimatePayload, northDeg: number): FacadeFace[] {
  const P: ClimateHours = prepClimate(C)
  const faces: FacadeFace[] = []
  const every = 4
  for (const [bi, bl] of blocks.entries()) {
    const ccw = ringIsCcw(bl.ring as [number, number][])
    const others = [...obstacles, ...blocks.filter((_, j) => j !== bi).map((x) => ({ ring: x.ring, z0: x.z0, z1: x.z1 }))]
    for (let i = 0; i < bl.ring.length; i++) {
      const A = bl.ring[i], B = bl.ring[(i + 1) % bl.ring.length]
      const len = Math.hypot(B[0] - A[0], B[1] - A[1])
      if (len < 0.5 || bl.z1 - bl.z0 < 0.5) continue
      const az = edgeAzimuth(A as [number, number], B as [number, number], northDeg, ccw)
      const F = faceHours(P, az)
      // Outward normal in the frame, to start the shading ray just outside the wall.
      const nx = ccw ? (B[1] - A[1]) / len : -(B[1] - A[1]) / len, ny = ccw ? -(B[0] - A[0]) / len : (B[0] - A[0]) / len
      const mx = (A[0] + B[0]) / 2 + nx * 0.2, my = (A[1] + B[1]) / 2 + ny * 0.2, mz = (bl.z0 + bl.z1) / 2
      const near = others.filter((p) => p.z1 > mz && p.ring.some(([x, y]) => Math.hypot(x - mx, y - my) < 600))
      let diffuse = 0, beam = 0, beamAll = 0
      for (let k = 0; k < P.n; k++) diffuse += F.sky[k] + F.gnd[k]
      for (let d = 0; d < 365; d += every) for (let q = 0; q < 24; q++) {
        const k = d * 24 + q
        if (F.beam[k] <= 0) continue
        beamAll += F.beam[k]
        const a = P.az[k] + northDeg * Math.PI / 180, dx = Math.sin(a), dy = Math.cos(a), tanAlt = Math.tan(P.alt[k])
        let lit = true
        for (const p of near) { const t = rayHit(mx, my, dx, dy, p.ring); if (t < Infinity) { const z = mz + t * tanAlt; if (z >= p.z0 && z <= p.z1) { lit = false; break } } }
        if (lit) beam += F.beam[k]
      }
      const beamYear = beamAll > 0 ? (beam / beamAll) * sumOf(F.beam) : 0
      faces.push({ towerId: bl.towerId, az, z0: bl.z0, z1: bl.z1, area: len * (bl.z1 - bl.z0), value: (diffuse + beamYear) / 1000, a: A, b: B })
    }
  }
  return faces
}
const sumOf = (a: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s }

export const IRRADIANCE_BANDS: LegendBand[] = [
  { to: 300, label: '< 300', color: '#d9e2ec' },
  { to: 500, label: '300–500', color: '#f1dca7' },
  { to: 700, label: '500–700', color: '#e9b562' },
  { to: Infinity, label: '≥ 700 kWh/m²', color: '#c9822b' },
]
