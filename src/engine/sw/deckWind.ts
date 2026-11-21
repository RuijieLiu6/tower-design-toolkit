// Wind on roofs, terraces and open storeys at height: the free-stream speed at a deck from the 10 m airport wind by the
// NBC 2020 exposure factor, and the comfort class from the hourly record's exceedance statistics (research R5 §1.2 and
// §1.5, "04 Tool Plan/vtc-entry/research/R5_tool_methods.md"). This replaces the Sun & Wind Studio reading the
// "Windiest deck" line used to give, which scaled the season mean by the power law (z/10)^0.25 and read it against the
// band limits: R5 found that reads deck winds about 1.5 times too high in rough-fetch sectors, and that the criteria
// apply to a 5%-exceedance speed (about 1.95 times the mean), not to the mean. Both are fixed together here.
//
// Sources (R5 marks in brackets):
//  • CWEC 2020 Vancouver Intl is an airport, open-terrain record, as the NBC reference velocity pressure is, so the
//    exposure factor converts it directly: U(z) = U10 · √Ce(z) (R5 eq. 4.1).
//  • Rough terrain, dynamic procedure: Ce = 0.5 (z/12.7)^0.5, Ce ≥ 0.5 (NBC 2020 Commentary I, reproduces the sample's
//    CeH = 1.9 at 183 m) [verified (page, reproduced)].
//  • Open terrain, dynamic procedure: Ce = (z/10)^0.28, 1.0 ≤ Ce ≤ 2.5 [unverified: the equation is an image in the
//    NBC PDF; the static open formula (h/10)^0.2 ≥ 0.9 of 4.1.7.3.(5)(a) is verified and reads lower].
//  • Rough applies only where rough terrain runs upwind for at least 1 km or 20 H, whichever is greater (NBC 2020
//    4.1.7.3.(5)(b), Commentary I para 12) [verified (page)]; which sectors those are is a per-site table (team).
//  • Comfort hours 06:00–23:00 (Toronto 2022 notes 2 and 4) [verified (page)], applied to both criteria sets (team).
//  • City of London 2019 (Lawson-based): frequent sitting ≤ 2.5, occasional sitting ≤ 4, standing ≤ 6, walking ≤ 8,
//    uncomfortable > 8 m/s, at 5% exceedance; terraces for occasional use aim at occasional sitting [verified (page),
//    secondary sources; primary PDF not opened].
//  • Toronto 2022: sitting ≤ 10 km/h, standing ≤ 15, walking ≤ 20, uncomfortable above, the gust-equivalent mean met in
//    at least 80% of comfort hours per season; amenity terraces aim at sitting (Table 3, p. 15) [verified (page)].
import type { ClimatePayload } from './types'
import { ALPHA, SEASONS, type Season } from './wind'

// ---- the profile ------------------------------------------------------------------------------------------------------
export type Exposure = 'rough' | 'open'
/** The 8 wind sectors (wind from), centred on N, NE … NW. */
export const SECTOR8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
/**
 * Upwind terrain by sector for downtown Vancouver (team assumption, R5 §1.2): for a 250 m tower rough terrain must run
 * 5 km upwind, so every sector over English Bay, Burrard Inlet or False Creek is open; the city runs on to the east and
 * south-east. Editable per site in the wind settings.
 */
export const DEFAULT_EXPOSURE: Exposure[] = ['open', 'open', 'rough', 'rough', 'open', 'open', 'open', 'open']
/** The sector (0–7) of a wind-from direction in degrees from true north. */
export const sector8 = (wd: number) => Math.floor((((wd % 360) + 360 + 22.5) % 360) / 45) % 8

/** √Ce: the mean speed at height z over the open-terrain 10 m reference, NBC 2020 dynamic exposure factor. */
export function speedRatio(z: number, exp: Exposure): number {
  const h = Math.max(0, z)
  if (exp === 'rough') return Math.sqrt(Math.max(0.5, 0.5 * Math.sqrt(h / 12.7)))
  return Math.sqrt(Math.min(2.5, Math.max(1, Math.pow(h / 10, 0.28))))
}
/** The earlier reading (Sun & Wind Studio's power law, exponent 0.25), kept behind the profile switch. */
export const powerRatio = (z: number) => Math.pow(Math.max(10, z) / 10, ALPHA)
export type DeckProfile = 'nbc' | 'power'
/** The free-stream speed ratio at height z for wind from direction wd. */
export const profileRatio = (z: number, wd: number, exposure: Exposure[], profile: DeckProfile) =>
  (profile === 'power' ? powerRatio(z) : speedRatio(z, exposure[sector8(wd)] ?? 'open'))

// ---- the hourly record by direction ------------------------------------------------------------------------------------
/** Direction bins of 10° (the CWEC record's own resolution), centred on 0°, 10° … 350°. */
export const BINS = 36
export const binDir = (b: number) => b * 10
export const binOf = (wd: number) => Math.round((((wd % 360) + 360) % 360) / 10) % BINS
/** Hours of one period: their number (calms included, at 0 m/s) and the 10 m speeds by direction bin, ascending. */
export interface HourSet { n: number; byBin: Float32Array[] }
export type DeckSeason = Exclude<Season, 'year'>
export const DECK_SEASONS: DeckSeason[] = ['winter', 'spring', 'summer', 'fall']
export interface DeckHours {
  /** Comfort hours (06:00–23:00) of each season and of the year. */
  comfort: Record<Season, HourSet>
  /** Every hour of the year (the safety reading). */
  all: HourSet
  /** 'record' = the CWEC hours; 'one' = the one wind case of the settings (one value, no statistics). */
  source: 'record' | 'one'
}

const cache = new WeakMap<ClimatePayload, DeckHours>()
/** The record's hours sorted into periods and direction bins (cached per climate), or one wind case. */
export function deckHours(C: ClimatePayload, one?: { dir: number; speed: number }): DeckHours {
  if (one) {
    const set = (): HourSet => ({ n: 1, byBin: Array.from({ length: BINS }, (_, b) => (b === binOf(one.dir) ? Float32Array.of(Math.max(0, one.speed)) : new Float32Array(0))) })
    return { comfort: { year: set(), winter: set(), spring: set(), summer: set(), fall: set() }, all: set(), source: 'one' }
  }
  const hit = cache.get(C)
  if (hit) return hit
  const ends: number[] = []
  { let s = 0; for (let m = 0; m < 12; m++) { s += C.days[m]; ends.push(s) } }
  const seasonOf = (m: number): DeckSeason => (DECK_SEASONS.find((k) => SEASONS[k].months.includes(m)) ?? 'winter')
  const lists = (): number[][] => Array.from({ length: BINS }, () => [])
  const acc = { year: lists(), winter: lists(), spring: lists(), summer: lists(), fall: lists(), all: lists() }
  const n = { year: 0, winter: 0, spring: 0, summer: 0, fall: 0, all: 0 }
  let m = 0
  for (let k = 0; k < Math.min(8760, C.hourly.ws.length); k++) {
    const doy = Math.floor(k / 24) + 1
    while (m < 11 && doy > ends[m]) m++
    const ws = C.hourly.ws[k], wd = C.hourly.wd[k], calm = !(ws > 0) || !Number.isFinite(wd)
    const b = calm ? -1 : binOf(wd)
    n.all++
    if (b >= 0) acc.all[b].push(ws)
    const start = k % 24 // the hour from start to start + 1, local standard time
    if (start < 6 || start >= 23) continue
    const se = seasonOf(m)
    n.year++; n[se]++
    if (b >= 0) { acc.year[b].push(ws); acc[se][b].push(ws) }
  }
  const pack = (l: number[][], c: number): HourSet => ({ n: c, byBin: l.map((v) => Float32Array.from(v).sort()) })
  const out: DeckHours = {
    comfort: { year: pack(acc.year, n.year), winter: pack(acc.winter, n.winter), spring: pack(acc.spring, n.spring), summer: pack(acc.summer, n.summer), fall: pack(acc.fall, n.fall) },
    all: pack(acc.all, n.all), source: 'record',
  }
  cache.set(C, out)
  return out
}

/** Values in an ascending array above x. */
function countAbove(a: Float32Array, x: number): number {
  let lo = 0, hi = a.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] > x) hi = mid; else lo = mid + 1 }
  return a.length - lo
}
/** Hours of the set with the deck speed (10 m speed × f[bin]) above v. */
export function hoursAbove(H: HourSet, f: ArrayLike<number>, v: number): number {
  let c = 0
  for (let b = 0; b < BINS; b++) { const k = f[b]; if (k > 0 && H.byBin[b].length) c += countAbove(H.byBin[b], v / k) }
  return c
}
/** The deck speed exceeded in a share q of the set's hours (q = 0.05: the 5%-exceedance speed). */
export function exceeded(H: HourSet, f: ArrayLike<number>, q: number): number {
  let hi = 0
  for (let b = 0; b < BINS; b++) { const a = H.byBin[b]; if (a.length && f[b] > 0) hi = Math.max(hi, a[a.length - 1] * f[b]) }
  if (!(hi > 0) || !H.n) return 0
  const lim = q * H.n
  if (hoursAbove(H, f, 0) <= lim) return 0
  let lo = 0
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (hoursAbove(H, f, mid) <= lim) hi = mid; else lo = mid }
  return hi
}

// ---- the criteria ------------------------------------------------------------------------------------------------------
export type Criteria = 'london2019' | 'toronto2022'
export interface CriteriaSet {
  name: string
  /** Share of comfort hours the class limit may be exceeded in. */
  q: number
  /** Upper speed of each class (m/s); above the last is the last class. */
  limits: number[]
  classes: string[]
  /** The class a terrace people use should reach, and the class still read as "check". */
  target: number
  check: number
  stat: string
  source: string
}
export const CRITERIA: Record<Criteria, CriteriaSet> = {
  london2019: {
    name: 'City of London 2019', q: 0.05, limits: [2.5, 4, 6, 8], classes: ['frequent sitting', 'occasional sitting', 'standing', 'walking', 'uncomfortable'],
    target: 1, check: 2, stat: 'exceeded in 5% of comfort hours',
    source: 'City of London Wind Microclimate Guidelines (2019), Lawson-based, 5% exceedance; read via SimScale, Orbital Stack and Local Transport Today (primary PDF not opened)',
  },
  toronto2022: {
    name: 'Toronto 2022', q: 0.2, limits: [10 / 3.6, 15 / 3.6, 20 / 3.6], classes: ['sitting', 'standing', 'walking', 'uncomfortable'],
    target: 0, check: 1, stat: 'gust-equivalent mean met in 80% of comfort hours',
    source: 'City of Toronto, Pedestrian Level Wind Study Terms of Reference Guide (2022), Table 3 p. 15',
  },
}
/** The class (0 = calmest) of a speed under a criteria set. */
export function classOf(c: CriteriaSet, v: number): number {
  for (let i = 0; i < c.limits.length; i++) if (v <= c.limits[i] + 1e-9) return i
  return c.limits.length
}
export const stateOf = (c: CriteriaSet, cls: number): 'pass' | 'warn' | 'fail' => (cls <= c.target ? 'pass' : cls <= c.check ? 'warn' : 'fail')

// ---- the free-stream reading at a deck (the "Windiest deck" line before local factors) ------------------------------------
export interface DeckOptions { exposure: Exposure[]; profile: DeckProfile; criteria: Criteria }
export interface SeasonRead { v: number; cls: number }
export interface DeckRead {
  seasons: Record<Season, SeasonRead>
  /** The season with the highest class (then the highest speed), and its reading. */
  worst: DeckSeason
  v: number
  cls: number
}
/** The class speed of a multiplier set f (by direction bin) in every season, under the chosen criteria. */
export function readSeasons(H: DeckHours, f: ArrayLike<number>, c: CriteriaSet): DeckRead {
  const seasons = {} as Record<Season, SeasonRead>
  for (const k of ['year', ...DECK_SEASONS] as Season[]) { const v = exceeded(H.comfort[k], f, c.q); seasons[k] = { v, cls: classOf(c, v) } }
  const worst = DECK_SEASONS.reduce((a, k) => (seasons[k].cls > seasons[a].cls || (seasons[k].cls === seasons[a].cls && seasons[k].v > seasons[a].v) ? k : a), DECK_SEASONS[0])
  return { seasons, worst, v: seasons[worst].v, cls: seasons[worst].cls }
}
/** The free-stream multiplier at height z by direction bin (local factor 1). */
export function freeStream(z: number, o: Pick<DeckOptions, 'exposure' | 'profile'>): Float32Array {
  const f = new Float32Array(BINS)
  for (let b = 0; b < BINS; b++) f[b] = profileRatio(z, binDir(b), o.exposure, o.profile)
  return f
}
