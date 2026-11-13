// The readings behind Sun & Wind Studio's secondary figures that the toolkit's engines did not yet give: the shadow
// range through a day (study.js shadowRangeSVG), sun hours on each face by floor (facadeSunHours), the wind with height
// (windProfile), the design storm on each face by height (rain.js run → faces, wallChart), roof water by month against
// toilet flushing (roofCollect) and the daylight temporal maps (temporalSVG). Geometry is taken in the north frame
// (x east, y true north) so every drawing has north up.
import type { Pt } from '../shadow'
import { prepClimate, sunAt, TZ_BY_MONTH, type ClimateHours } from './climate'
import { OPS, PROG_OF } from './energy'
import { ORI, type Face, type SwFloor } from './plate'
import { DROP_VT, hourlyRain, monthOfHour, wallFactor, type DropType } from './rain'
import type { ClimatePayload, Prism } from './types'
import { ALPHA, GUST } from './wind'

const rad = (d: number) => (d * Math.PI) / 180
/** A ring of the project frame turned to the north frame. */
export const ringToNorth = (r: Pt[], northDeg: number): Pt[] => { const c = Math.cos(rad(northDeg)), s = Math.sin(rad(northDeg)); return r.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt) }
export const prismsToNorth = (ps: Prism[], northDeg: number): Prism[] => ps.map((p) => ({ ...p, ring: ringToNorth(p.ring as Pt[], northDeg) }))

/** Convex hull (monotone chain). */
export function hull(pts: Pt[]): Pt[] {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (P.length < 3) return P
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = []
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  const up: Pt[] = []
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p) }
  up.pop(); lo.pop()
  return lo.concat(up)
}

// ---- shadow range -----------------------------------------------------------------------------------------------------
export interface ShadowHour { h: number; alt: number; az: number; /** one hull per block */ hulls: Pt[][]; /** unit direction the shadow falls */ dir: Pt; /** shadow length per metre of height */ cot: number }
export interface ShadowRange { foot: Pt[][]; hours: ShadowHour[]; box: [number, number, number, number]; top: number }

/** The towers' shadow at each clock hour of a day, in plan (north frame). `prisms` are in the north frame. */
export function shadowRange(prisms: Prism[], C: ClimatePayload, doy: number, month: number, h0: number, h1: number): ShadowRange {
  const lat = rad(C.lat), tz = TZ_BY_MONTH[month] ?? -8
  const foot = prisms.filter((p) => p.z0 < 2).map((p) => p.ring as Pt[])
  const hours: ShadowHour[] = []
  for (let h = Math.ceil(h0); h <= h1; h++) {
    const p = sunAt(lat, C.lon, doy, h - (tz + 8), -8)
    if (p.alt <= 0.12) continue
    const cot = 1 / Math.tan(p.alt)
    if (cot > 8) continue
    const dir: Pt = [-Math.sin(p.az), -Math.cos(p.az)]
    const hulls = prisms.map((b) => hull([...(b.ring as Pt[]).map(([x, y]) => [x + dir[0] * cot * b.z0, y + dir[1] * cot * b.z0] as Pt), ...(b.ring as Pt[]).map(([x, y]) => [x + dir[0] * cot * b.z1, y + dir[1] * cot * b.z1] as Pt)]))
    hours.push({ h, alt: (p.alt * 180) / Math.PI, az: (p.az * 180) / Math.PI, hulls, dir, cot })
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of [...foot, ...hours.flatMap((s) => s.hulls)]) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { foot, hours, box: [x0, y0, x1, y1], top: Math.max(0, ...prisms.map((p) => p.z1)) }
}

// ---- rays against the blocks around --------------------------------------------------------------------------------------
function rayHit(px: number, py: number, dx: number, dy: number, ring: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length], ex = bx - ax, ey = by - ay
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((ax - px) * ey - (ay - py) * ex) / den, u = ((ax - px) * dy - (ay - py) * dx) / den
    if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}
const inside = (x: number, y: number, r: Pt[]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o } return o }
interface Boxed { ring: Pt[]; z0: number; z1: number; cx: number; cy: number; r: number }
const boxed = (ps: Prism[]): Boxed[] => ps.map((p) => {
  const ring = p.ring as Pt[]
  const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cy = ring.reduce((s, q) => s + q[1], 0) / ring.length
  return { ring, z0: p.z0, z1: p.z1, cx, cy, r: Math.max(...ring.map((q) => Math.hypot(q[0] - cx, q[1] - cy))) }
})
/** True when a ray from (x, y, z) along the plan direction (dx, dy), rising tanAlt per metre, meets a block. */
function blocked(x: number, y: number, z: number, dx: number, dy: number, tanAlt: number, obs: Boxed[]): boolean {
  for (const p of obs) {
    if (p.z1 <= z) continue
    // the block's centre must lie near the ray
    const rx = p.cx - x, ry = p.cy - y, along = rx * dx + ry * dy
    if (along < -p.r || Math.abs(rx * dy - ry * dx) > p.r) continue
    // the block the point belongs to (a plate drawn a little inside its own block) does not shade itself
    if (z >= p.z0 && Math.hypot(rx, ry) <= p.r && inside(x, y, p.ring)) continue
    const t = rayHit(x, y, dx, dy, p.ring)
    if (t < Infinity) { const zz = z + t * tanAlt; if (zz >= p.z0 && zz <= p.z1) return true }
  }
  return false
}
/** A floor's edges in the north frame: midpoint just outside the wall, outward direction, length, face. */
function edgesNorth(f: SwFloor) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot)
  return f.edges.map((e) => {
    const a = rad(e.az), nx = Math.sin(a), ny = Math.cos(a)
    return { o: e.o, L: e.L, az: e.az, nx, ny, x: f.cx + e.mx * c - e.my * s + nx * 0.3, y: f.cy + e.mx * s + e.my * c + ny * 0.3 }
  })
}

// ---- sun hours on each face by floor ---------------------------------------------------------------------------------------
export interface FaceSunHours { levels: number[]; hours: Record<Face, (number | null)[]>; max: number; byFace: Record<Face, number> }

/**
 * Clear-day hours each face of each floor sees the sun on one date (study.js facadeSunHours, by rays instead of
 * renders): the sun in front of the face, over 2° high and not hidden by the blocks around. `obstacles` are in the
 * north frame and may include the towers' own blocks.
 */
export function faceSunHours(floors: SwFloor[], obstacles: Prism[], C: ClimatePayload, doy: number): FaceSunHours {
  const lat = rad(C.lat), dt = 0.5, obs = boxed(obstacles)
  const sun: { dx: number; dy: number; tan: number }[] = []
  for (let h = dt / 2; h < 24; h += dt) { const p = sunAt(lat, C.lon, doy, h, -8); if (p.alt > 0.035) sun.push({ dx: Math.sin(p.az), dy: Math.cos(p.az), tan: Math.tan(p.alt) }) }
  const hours = { N: [], E: [], S: [], W: [] } as Record<Face, (number | null)[]>
  const tot = { N: 0, E: 0, S: 0, W: 0 }, len = { N: 0, E: 0, S: 0, W: 0 }
  let max = 0
  for (const f of floors) {
    const z = f.z + f.h / 2, es = edgesNorth(f)
    const near = obs.filter((p) => p.z1 > z && Math.hypot(p.cx - f.cx, p.cy - f.cy) < 600 + p.r)
    for (const o of ORI) {
      const mine = es.filter((e) => e.o === o), L = mine.reduce((s, e) => s + e.L, 0)
      if (!(L > 0)) { hours[o].push(null); continue }
      let v = 0
      for (const e of mine) for (const s of sun) { if (e.nx * s.dx + e.ny * s.dy > 0.05 && !blocked(e.x, e.y, z, s.dx, s.dy, s.tan, near)) v += (dt * e.L) / L }
      hours[o].push(v); tot[o] += v * L; len[o] += L; max = Math.max(max, v)
    }
  }
  return { levels: floors.map((f) => f.level), hours, max, byFace: Object.fromEntries(ORI.map((o) => [o, len[o] ? tot[o] / len[o] : 0])) as Record<Face, number> }
}

// ---- the design storm on each face ------------------------------------------------------------------------------------------
export interface FaceStorm { o: Face; area: number; /** L/m² an hour, face mean */ storm: number; /** share of the face the storm wets */ wetShare: number; byHeight: { z: number; storm: number; wet: number }[] }
export interface StormFaces { faces: FaceStorm[]; alphaDeg: number; dir: number; speed: number; intensity: number; top: number }

/**
 * Wind-driven rain on each face in the design storm (rain.js: catch 0.222 · U · R^0.88 · cos θ · wall factor by height)
 * and the share of each face the storm reaches, by rays against the blocks around instead of the Studio's renders.
 */
export function stormOnFaces(floors: SwFloor[], obstacles: Prism[], storm: { dir: number; speed: number }, drop: DropType = 'steady', intensity = 80): StormFaces {
  const alpha = Math.atan(Math.max(0, storm.speed) / (DROP_VT[drop] ?? 5)), tanAlt = Math.tan(Math.PI / 2 - alpha)
  const a = rad(storm.dir), dx = Math.sin(a), dy = Math.cos(a), obs = boxed(obstacles)
  const top = Math.max(1, ...floors.map((f) => f.z + f.h))
  const nb = Math.min(12, Math.max(1, floors.length)), bins = ORI.map(() => Array.from({ length: nb }, () => ({ A: 0, s: 0, w: 0 })))
  for (const f of floors) {
    const z = f.z + f.h / 2, wf = wallFactor(z, top), b = Math.min(nb - 1, Math.floor((z / top) * nb))
    const near = obs.filter((p) => p.z1 > z)
    for (const e of edgesNorth(f)) {
      const cos = Math.max(0, e.nx * dx + e.ny * dy), A = e.L * f.h, q = bins[ORI.indexOf(e.o)][b]
      q.A += A; q.s += 0.222 * storm.speed * Math.pow(intensity, 0.88) * cos * wf * A
      if (cos > 0.05 && !blocked(e.x, e.y, z, dx, dy, tanAlt, near)) q.w += A
    }
  }
  const faces = ORI.map((o, i): FaceStorm => {
    const A = bins[i].reduce((s, q) => s + q.A, 0)
    return { o, area: A, storm: A ? bins[i].reduce((s, q) => s + q.s, 0) / A : 0, wetShare: A ? bins[i].reduce((s, q) => s + q.w, 0) / A : 0, byHeight: bins[i].map((q, k) => ({ z: ((k + 0.5) / nb) * top, storm: q.A ? q.s / q.A : 0, wet: q.A ? q.w / q.A : 0 })) }
  })
  return { faces, alphaDeg: (alpha * 180) / Math.PI, dir: storm.dir, speed: storm.speed, intensity, top }
}

// ---- roof water by month ----------------------------------------------------------------------------------------------------
/** Non-potable toilet flushing, litres a person a day (rain.js FLUSH). */
export const FLUSH = 25
/** People the floors hold (floor area over the program's m² per person; open and plant floors left out). */
export const peopleOf = (floors: SwFloor[]) => floors.reduce((s, f) => { const o = OPS[PROG_OF[f.use] ?? 'office']; return s + (o.open ? 0 : f.area / o.occ) }, 0)
export interface RoofMonth { m: string; mm: number; m3: number; demand: number }
export interface RoofYear { months: RoofMonth[]; people: number; flushNeed: number; flushShare: number | null; stormMM: number; storm: number; peakLs: number; cistern: number }

/** Rain the roofs collect each month against flushing demand, and the design storm on the roof (rain.js roofCollect). */
export function roofYear(C: ClimatePayload, area: number, eff: number, people: number, stormI = 80, durMin = 60): RoofYear {
  const mm = new Array(12).fill(0), r = hourlyRain(C), mo = monthOfHour(C.days)
  let tot = 0
  for (let k = 0; k < 8760; k++) { mm[mo[k]] += r[k]; tot += r[k] }
  if (!(tot > 0)) for (let m = 0; m < 12; m++) mm[m] = C.rain[m] ?? 0
  const months = C.months.map((n, m) => ({ m: n, mm: mm[m], m3: (area * mm[m] * eff) / 1000, demand: (people * FLUSH * C.days[m]) / 1000 }))
  const annual = months.reduce((s, x) => s + x.m3, 0), flushNeed = (people * FLUSH * 365) / 1000
  // the store that carries the wet months' surplus through the dry ones: the largest running shortfall
  let short = 0, cistern = 0
  for (let pass = 0; pass < 2; pass++) for (const x of months) { short = Math.max(0, short + x.demand - x.m3); cistern = Math.max(cistern, short) }
  const stormMM = (stormI * durMin) / 60
  return { months, people, flushNeed, flushShare: flushNeed ? Math.min(1, annual / flushNeed) : null, stormMM, storm: (area * stormMM * eff) / 1000, peakLs: (area * stormI) / 3600, cistern: Math.min(cistern, flushNeed) }
}

// ---- wind with height ---------------------------------------------------------------------------------------------------------
export interface ProfilePoint { z: number; U: number; gust: number; /** gust pressure, Pa */ q: number }
/** Mean wind and gust up the tower by the power law (study.js windProfile). */
export function windProfile(U10: number, top: number): ProfilePoint[] {
  const zs = [10, 30, 60, 100, 150, 200, 250, 300].filter((z) => z < top)
  if (top > 10) zs.push(top)
  return zs.map((z) => { const U = U10 * Math.pow(Math.max(10, z) / 10, ALPHA), gust = U * GUST; return { z, U, gust, q: 0.613 * gust * gust } })
}

// ---- daylight temporal maps -----------------------------------------------------------------------------------------------------
export interface TemporalMaps { nd: number; nh: number; sda: Float32Array; sun: Float32Array; blind: Float32Array | null }
/**
 * The sampled occupied hours of a daylight run as day-of-year × clock-hour maps (study.js temporalSVG): ten rows for
 * 8:00 to 18:00, 365 columns; days the run skipped borrow the day before.
 */
export function temporalMaps(T: { k: Int32Array; sda: Float32Array; sun: Float32Array; blind: Float32Array | null }, C: ClimatePayload): TemporalMaps {
  const P: ClimateHours = prepClimate(C), ND = 365, NH = 10
  const cnt = new Uint16Array(ND * NH)
  const sum = { sda: new Float32Array(ND * NH), sun: new Float32Array(ND * NH), blind: new Float32Array(ND * NH) }
  for (let j = 0; j < T.k.length; j++) {
    const k = T.k[j], d = Math.min(ND - 1, P.doy[k] - 1), hr = P.hr[k] + ((TZ_BY_MONTH[P.mon[k]] ?? -8) + 8) - 9
    if (hr < 0 || hr >= NH) continue
    const i = hr * ND + d
    cnt[i]++; sum.sda[i] += T.sda[j]; sum.sun[i] += T.sun[j]; if (T.blind) sum.blind[i] += T.blind[j]
  }
  const fill = (s: Float32Array) => { const v = new Float32Array(ND * NH).fill(NaN); for (let h = 0; h < NH; h++) { let last = NaN; for (let d = 0; d < ND; d++) { const i = h * ND + d; if (cnt[i]) last = s[i] / cnt[i]; v[i] = last } } return v }
  return { nd: ND, nh: NH, sda: fill(sum.sda), sun: fill(sum.sun), blind: T.blind ? fill(sum.blind) : null }
}
