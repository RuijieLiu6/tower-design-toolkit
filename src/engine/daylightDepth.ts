// Daylight screen (backlog item 36; research P02-M06, floor-plate depth-to-window): how much of each use's typical
// floor lies within daylight reach of the facade, before any simulation. A geometric proxy only: glazing, neighbours,
// blinds and climate are ignored (P02-M07 is the simulation). Every rule says where it comes from; the research has no
// use-specific depth rule, so that line stays unresolved rather than invented.
import { DEFAULT_INTERIOR } from './interior'
import { coreSide } from './massing'
import type { Floor, Flag, RuleResult, RuleState, Source, Tower } from './types'

/** Presets (all team assumptions in research P02-M06): reach factor k, rear-half reflectance Rb, share tiers. */
export const DAYLIGHT = { k: 2, rb: 0.5, good: 0.75, bad: 0.4 }

/** Uses the research counts as regularly occupied (P02-M06: "office, residential, hotel rooms"). */
export const SCREENED = ['office', 'residential', 'hotel'] as const
export type ScreenedUse = (typeof SCREENED)[number]

const P02: Source = { label: 'Research P02-M06, floor-plate depth-to-window daylight screen (method)' }
const ASHRAE: Source = { label: 'ASHRAE 90.1 sidelit daylight zones, 1 and 2 × window head height (recalled in research P02-M06, not opened)' }
const LEED: Source = { label: 'LEED v4.1 sDA credit tiers 75 / 55 / 40%, as implemented in honeybee-radiance-postprocess leed.py (opened, research P02-S21)', url: 'https://github.com/ladybug-tools/honeybee-radiance-postprocess' }
const BRE: Source = { label: 'BRE / BS 8206-2 limiting room depth, L/W + L/H ≤ 2 / (1 − Rb) (recalled in research P02-M06, not opened)' }
const P12: Source = { label: 'Interior presets: window head = floor-to-floor − head drop (team assumption, research P12)' }

// ---------------------------------------------------------------- geometry
/** A rectangular plate W × D (m) with a central square of side `hole` that is not regularly occupied (core, corridor). */
export interface Plate { W: number; D: number; hole: number }

/** Regularly occupied area: the plate minus the central square. */
export const occupied = (p: Plate) => Math.max(0, p.W * p.D - p.hole * p.hole)

/** Occupied area within distance d of the facade (glazed on all four sides). Exact for this geometry. */
export function areaWithin(p: Plate, d: number): number {
  if (d <= 0) return 0
  const iw = Math.max(0, p.W - 2 * d), id = Math.max(0, p.D - 2 * d)
  // The part beyond d is the inner rectangle minus the part of the central square inside it.
  const beyond = iw * id - Math.min(p.hole, iw) * Math.min(p.hole, id)
  return Math.max(0, occupied(p) - Math.max(0, beyond))
}

export type DaylightBand = 'daylit' | 'marginal' | 'deep'
/** Band of a point at distance `dist` from the facade: daylit up to d1, marginal up to d2, deep beyond (edges inclusive). */
export const bandAt = (dist: number, d1: number, d2: number): DaylightBand => (dist <= d1 ? 'daylit' : dist <= d2 ? 'marginal' : 'deep')

/** Shares of the occupied area in each band. */
export function bandShares(p: Plate, d1: number, d2: number): Record<DaylightBand, number> {
  const occ = occupied(p)
  if (!occ) return { daylit: 0, marginal: 0, deep: 0 }
  const a1 = areaWithin(p, d1), a2 = areaWithin(p, Math.max(d1, d2))
  return { daylit: a1 / occ, marginal: (a2 - a1) / occ, deep: (occ - a2) / occ }
}

/** BRE limiting-depth ratio L/W + L/H for a room L deep, W wide along the window, window head H; and the limit. */
export function limitingDepth(L: number, W: number, H: number, rb = DAYLIGHT.rb): { ratio: number; limit: number } {
  return { ratio: L / Math.max(0.1, W) + L / Math.max(0.1, H), limit: 2 / (1 - Math.min(0.95, Math.max(0, rb))) }
}

// ---------------------------------------------------------------- per use
export interface UseScreen {
  use: ScreenedUse
  floors: number
  /** The typical floor screened (middle floor of this use). */
  level: number
  f2f: number
  head: number
  plate: Plate
  /** Facade-to-core (or corridor) depth from the long facades (facing ±y, across D) and the short ones (across W). */
  depthLong: number
  depthShort: number
  d1: number
  d2: number
  shares: Record<DaylightBand, number>
  withinReach: number
  limit: { ratio: number; limit: number; facade: 'long' | 'short' }
  state: RuleState
}

export function screenUse(t: Tower, use: ScreenedUse, floors: Floor[], k = DAYLIGHT.k): UseScreen | null {
  const fl = floors.filter((f) => f.use === use && !f.podium && !f.skyLobby)
  if (!fl.length) return null
  const f = fl[Math.floor(fl.length / 2)]
  const i = t.interior ?? DEFAULT_INTERIOR
  const c = coreSide(t)
  // Homes and hotel rooms sit outside a corridor ring; an office floor is open from the core to the glass.
  const hole = Math.min(t.width, t.depth, use === 'office' ? c : c + 2 * i.corridor)
  const plate: Plate = { W: t.width, D: t.depth, hole }
  const f2f = f.z1 - f.z0
  const head = Math.max(2.2, f2f - i.headDrop)
  const d1 = head, d2 = k * head
  const shares = bandShares(plate, d1, d2)
  const withinReach = shares.daylit + shares.marginal
  const depthLong = (t.depth - hole) / 2, depthShort = (t.width - hole) / 2
  const long = limitingDepth(depthLong, t.width, head), short = limitingDepth(depthShort, t.depth, head)
  const limit = long.ratio >= short.ratio ? { ...long, facade: 'long' as const } : { ...short, facade: 'short' as const }
  const state: RuleState = withinReach >= DAYLIGHT.good ? 'pass' : withinReach >= DAYLIGHT.bad ? 'warn' : 'fail'
  return { use, floors: fl.length, level: f.level, f2f, head, plate, depthLong, depthShort, d1, d2, shares, withinReach, limit, state }
}

const LABEL: Record<ScreenedUse, string> = { office: 'Office', residential: 'Homes', hotel: 'Hotel rooms' }
const pct = (v: number) => `${Math.round(v * 100)}%`
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

/** A one-line verdict per use, for the node card. */
export function verdict(u: UseScreen): string {
  const word = u.state === 'pass' ? 'mostly daylit' : u.state === 'warn' ? 'partly deep' : 'mostly deep'
  return `${LABEL[u.use]}: ${pct(u.withinReach)} of the occupied floor within daylight reach (${word}); deepest point ${Math.max(u.depthLong, u.depthShort).toFixed(1)} m from the glass against a reach of ${u.d2.toFixed(1)} m.`
}

export interface DaylightResult { uses: UseScreen[]; rules: RuleResult[]; k: number }

export function daylightScreen(t: Tower, floors: Floor[], k = DAYLIGHT.k): DaylightResult {
  const uses = SCREENED.map((u) => screenUse(t, u, floors, k)).filter((x): x is UseScreen => !!x)
  const rules: RuleResult[] = []
  if (!uses.length) {
    rules.push(rule('dl-none', 'Regularly occupied floors', 'no office, home or hotel floors in this tower', 'office, residential or hotel programme', 'unknown', 'unresolved', P02))
    return { uses, rules, k }
  }
  for (const u of uses) {
    const L = LABEL[u.use]
    const to = u.use === 'office' ? 'core' : 'corridor'
    rules.push(rule(`dl-${u.use}-head`, `${L}: window head height`, `${u.head.toFixed(1)} m (floor-to-floor ${u.f2f.toFixed(2)} m, level ${u.level}, ${u.floors} floor${u.floors === 1 ? '' : 's'})`, 'floor-to-floor minus the head drop', 'pass', 'team_assumption', P12))
    rules.push(rule(`dl-${u.use}-depth`, `${L}: depth from the glass to the ${to}`, `${u.depthLong.toFixed(1)} m from the long facades · ${u.depthShort.toFixed(1)} m from the short ones`,
      `daylit ≤ ${u.d1.toFixed(1)} m (1 × head) · marginal ≤ ${u.d2.toFixed(1)} m (${k} × head) · deep beyond`, Math.max(u.depthLong, u.depthShort) <= u.d2 ? 'pass' : 'warn', 'unverified', ASHRAE,
      `The ${k} × head reach factor is a team assumption (research P02-M06); the 1 × and 2 × zones mirror ASHRAE 90.1 sidelighting, recalled, not opened.`))
    rules.push(rule(`dl-${u.use}-share`, `${L}: occupied floor within daylight reach`, `${pct(u.withinReach)} (daylit ${pct(u.shares.daylit)} · marginal ${pct(u.shares.marginal)} · deep ${pct(u.shares.deep)})`,
      `≥ ${pct(DAYLIGHT.good)} good, < ${pct(DAYLIGHT.bad)} poor`, u.state, 'team_assumption', LEED,
      'A distance proxy, not daylight: the LEED sDA tiers are borrowed from a simulation metric (team assumption). Run a climate-based simulation (P02-M07) before relying on it.'))
    rules.push(rule(`dl-${u.use}-limit`, `${L}: limiting room depth (second check)`, `L/W + L/H = ${u.limit.ratio.toFixed(2)} from the ${u.limit.facade} facades`, `≤ ${u.limit.limit.toFixed(1)} (Rb ${DAYLIGHT.rb}, team assumption)`,
      u.limit.ratio <= u.limit.limit ? 'pass' : 'warn', 'unverified', BRE, 'Treats the band between the glass and the core or corridor as one room as wide as the facade.'))
    rules.push(rule(`dl-${u.use}-rule`, `${L}: a depth rule for this use`, 'none in the research', 'a sourced daylight depth for this use', 'unknown', 'unresolved', P02,
      'Acceptable depth for offices versus bedrooms is a human judgement in the research; no rule is invented. The generic reach screen above applies meanwhile.'))
  }
  return { uses, rules, k }
}
