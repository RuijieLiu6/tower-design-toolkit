// Daylight screen (backlog item 36; research P02-M06, floor-plate depth-to-window): how much of each use's typical
// floor lies within daylight reach of the facade, before any simulation. A geometric proxy only: glazing, neighbours,
// blinds and climate are ignored (P02-M07 is the simulation). Every rule says where it comes from.
// P1 #7 (21 Nov, book notes): the three depth rules that stood side by side (1 x / 2 x window head here, 6 m and
// 3 x head in interior.ts) are one sourced reading: the primary daylit zone within 6 m of the glass (Environmental
// performance pp.199, 229-230), about 1.5 x the clear height under overcast skies (p.204) and full daylight depth
// 2.5 x (head - 0.76 m) (Allen & Iano p.151). The bands run from the strictest of the three to the most generous.
import { DEFAULT_INTERIOR } from './interior'
import { coreSideAt } from './massing'
import { TWIST_MIN } from './acrossWind'
import { towerTwist } from './twist'
import type { Floor, Flag, RuleResult, RuleState, Source, Tower } from './types'

/** Presets (team assumptions in research P02-M06): rear-half reflectance Rb, share tiers. `k` is kept for callers that
 *  still pass it; the bands now come from the sourced depths below (DAYLIGHT_RULE), not from k × head. */
export const DAYLIGHT = { k: 2, rb: 0.5, good: 0.75, bad: 0.4 }

/** The sourced daylight depths (P1 #7): primary zone (m), overcast factor on the clear height, full-depth factor and
 *  work-plane height (m) of the sidelight rule, and the over-lit UDI line (lux). */
export const DAYLIGHT_RULE = { primary: 6, overcast: 1.5, full: 2.5, workPlane: 0.76, overlit: 1500 }

/** Full daylight depth of a side window, 2.5 × (head − 0.76 m) (Allen & Iano p.151). */
export const fullDepth = (head: number) => Math.max(0, DAYLIGHT_RULE.full * (head - DAYLIGHT_RULE.workPlane))
/** Daylit depth under overcast skies, about 1.5 × the floor-to-ceiling height (EP p.204); the window head stands in for
 *  the ceiling (team: glass taken up to the ceiling). */
export const overcastDepth = (clear: number) => DAYLIGHT_RULE.overcast * clear
/** The three sourced readings of daylit depth for a window head (m), and the band edges: daylit to the strictest,
 *  marginal to the most generous. */
export function sourcedDepths(head: number) {
  const primary = DAYLIGHT_RULE.primary, overcast = overcastDepth(head), full = fullDepth(head)
  return { primary, overcast, full, d1: Math.min(primary, overcast, full), d2: Math.max(primary, overcast, full) }
}

/** Uses the research counts as regularly occupied (P02-M06: "office, residential, hotel rooms"). */
export const SCREENED = ['office', 'residential', 'hotel'] as const
export type ScreenedUse = (typeof SCREENED)[number]

const P02: Source = { label: 'Research P02-M06, floor-plate depth-to-window daylight screen (method)' }
const EP: Source = { label: 'Environmental performance of tall buildings (EP, book notes 21 Nov): primary daylit zone within 6 m of the window; Grade 1 area ÷ usable area', page: 'pp.199, 229–230' }
const EP_UDI: Source = { label: 'Environmental performance of tall buildings (EP): useful daylight illuminance bands, over 1,500 lux over-lit (blinds close)', page: 'p.198' }
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

/** Node contract (21 Nov): why a tower lies outside this screen's boundary (a rectangular box plate with a central
 *  core), or undefined when it does not. */
export function daylightSpecialist(t: Tower): string | undefined {
  if (t.imported) return 'Imported storeys: the screen reads a rectangular box plate, not their outlines; a daylight specialist or a simulation on the real plates confirms it.'
  if (t.drawn) return 'A drawn free-form mass: the screen reads a rectangular box plate; a daylight specialist or a simulation on the real plates confirms it.'
  if (t.form && t.form.type !== 'none') return `A ${t.form.type} tower form: the plate changes with height, so the typical box plate stands in; a daylight specialist confirms it.`
  const tw = towerTwist(t)
  if (tw.deg >= TWIST_MIN) return `The plate turns ${tw.deg.toFixed(0)}° with height: depths are read on the untwisted box plate; a daylight specialist confirms it.`
  return undefined
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
  /** The sourced depths behind d1 and d2 (P1 #7): primary zone 6 m, overcast 1.5 × clear height, full 2.5 × (head − 0.76). */
  depths: { primary: number; overcast: number; full: number }
  /** Share of the occupied floor within the 6 m primary zone, and the deepest point from the glass (m). */
  primary: number
  deepest: number
  /** Levels of this use's floors with a deck declared garden or loggia (deck use occupied or planted): edges count as glass. */
  innerEdges: number[]
  shares: Record<DaylightBand, number>
  withinReach: number
  limit: { ratio: number; limit: number; facade: 'long' | 'short' }
  state: RuleState
}

/** The last argument (the old reach factor k) is ignored: the bands come from the sourced depths (P1 #7). */
export function screenUse(t: Tower, use: ScreenedUse, floors: Floor[], ..._k: number[]): UseScreen | null {
  const fl = floors.filter((f) => f.use === use && !f.podium && !f.skyLobby)
  if (!fl.length) return null
  const f = fl[Math.floor(fl.length / 2)]
  const i = t.interior ?? DEFAULT_INTERIOR
  const c = coreSideAt(t, f.level) // the screened floor's core (a core that steps with the tiers, G18)
  // Homes and hotel rooms sit outside a corridor ring; an office floor is open from the core to the glass.
  const hole = Math.min(t.width, t.depth, use === 'office' ? c : c + 2 * i.corridor)
  const plate: Plate = { W: t.width, D: t.depth, hole }
  const f2f = f.z1 - f.z0
  const head = Math.max(2.2, f2f - i.headDrop)
  const { primary: p6, overcast, full, d1, d2 } = sourcedDepths(head)
  const shares = bandShares(plate, d1, d2)
  const occ = occupied(plate)
  const primary = occ ? areaWithin(plate, p6) / occ : 0
  const levels = new Set(fl.map((x) => x.level))
  const innerEdges = [...new Set((t.deckUses ?? []).filter((d) => (d.use === 'occupied' || d.use === 'planted') && levels.has(d.level)).map((d) => d.level))].sort((a, b) => a - b)
  const withinReach = shares.daylit + shares.marginal
  const depthLong = (t.depth - hole) / 2, depthShort = (t.width - hole) / 2
  const long = limitingDepth(depthLong, t.width, head), short = limitingDepth(depthShort, t.depth, head)
  const limit = long.ratio >= short.ratio ? { ...long, facade: 'long' as const } : { ...short, facade: 'short' as const }
  const state: RuleState = withinReach >= DAYLIGHT.good ? 'pass' : withinReach >= DAYLIGHT.bad ? 'warn' : 'fail'
  const deepest = Math.max(depthLong, depthShort)
  return { use, floors: fl.length, level: f.level, f2f, head, plate, depthLong, depthShort, d1, d2, depths: { primary: p6, overcast, full }, primary, deepest, innerEdges, shares, withinReach, limit, state }
}

const LABEL: Record<ScreenedUse, string> = { office: 'Office', residential: 'Homes', hotel: 'Hotel rooms' }
const pct = (v: number) => `${Math.round(v * 100)}%`
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

/** A one-line verdict per use, for the node card. */
export function verdict(u: UseScreen): string {
  const word = u.state === 'pass' ? 'mostly daylit' : u.state === 'warn' ? 'partly deep' : 'mostly deep'
  return `${LABEL[u.use]}: ${pct(u.withinReach)} of the occupied floor within daylight reach (${word}); ${pct(u.primary)} within the 6 m primary zone; deepest point ${u.deepest.toFixed(1)} m from the glass against a reach of ${u.d2.toFixed(1)} m.`
}

export interface DaylightResult { uses: UseScreen[]; rules: RuleResult[]; k: number }

export function daylightScreen(t: Tower, floors: Floor[], k = DAYLIGHT.k): DaylightResult {
  const uses = SCREENED.map((u) => screenUse(t, u, floors, k)).filter((x): x is UseScreen => !!x)
  const rules: RuleResult[] = []
  const specialist = uses.length ? daylightSpecialist(t) : undefined
  if (!uses.length) {
    rules.push(rule('dl-none', 'Regularly occupied floors', 'no office, home or hotel floors in this tower', 'office, residential or hotel programme', 'unknown', 'unresolved', P02))
    return { uses, rules, k }
  }
  for (const u of uses) {
    const L = LABEL[u.use]
    const to = u.use === 'office' ? 'core' : 'corridor'
    rules.push(rule(`dl-${u.use}-head`, `${L}: window head height`, `${u.head.toFixed(1)} m (floor-to-floor ${u.f2f.toFixed(2)} m, level ${u.level}, ${u.floors} floor${u.floors === 1 ? '' : 's'})`, 'floor-to-floor minus the head drop', 'pass', 'team_assumption', P12))
    const edges = u.innerEdges.length ? `L${u.innerEdges.join(', L')}` : ''
    rules.push(rule(`dl-${u.use}-depth`, `${L}: deepest point from the glass`, `${u.deepest.toFixed(1)} m to the ${to} (${u.depthLong.toFixed(1)} m from the long facades · ${u.depthShort.toFixed(1)} m from the short ones)`,
      `≤ ${DAYLIGHT_RULE.primary} m: the primary daylit zone`, u.deepest <= DAYLIGHT_RULE.primary ? 'pass' : 'warn', 'verified', EP,
      `The book's simple guideline; its rigorous version is by UDI (EP p.199). Measured on the typical floor's box plate to the ${to}.`
      + (edges ? ` Garden or loggia decks at ${edges} (deck use): their edges count as an inner facade, which the box plate does not draw, so those floors read better than this.` : '')))
    rules.push(rule(`dl-${u.use}-share`, `${L}: occupied floor within daylight reach`, `${pct(u.withinReach)} (daylit ${pct(u.shares.daylit)} · marginal ${pct(u.shares.marginal)} · deep ${pct(u.shares.deep)})`,
      `≥ ${pct(DAYLIGHT.good)} good, < ${pct(DAYLIGHT.bad)} poor`, u.state, 'team_assumption', LEED,
      `Daylit to ${u.d1.toFixed(1)} m (the strictest sourced depth), marginal to ${u.d2.toFixed(1)} m (the most generous), deep beyond: see the daylight rule line. A distance proxy, not daylight: the LEED sDA tiers are borrowed from a simulation metric (team assumption). Run a climate-based simulation (P02-M07) before relying on it.`))
    rules.push(rule(`dl-${u.use}-limit`, `${L}: limiting room depth (second check)`, `L/W + L/H = ${u.limit.ratio.toFixed(2)} from the ${u.limit.facade} facades`, `≤ ${u.limit.limit.toFixed(1)} (Rb ${DAYLIGHT.rb}, team assumption)`,
      u.limit.ratio <= u.limit.limit ? 'pass' : 'warn', 'unverified', BRE, 'Treats the band between the glass and the core or corridor as one room as wide as the facade.'))
    rules.push(rule(`dl-${u.use}-rule`, `${L}: primary daylit zone (within ${DAYLIGHT_RULE.primary} m)`, `${pct(u.primary)} of the usable area`,
      'reported, no sourced share: compare variants (Grade 1 area ÷ usable area)', 'pass', 'verified', EP,
      `One sourced reading in place of the 1 × / 2 × head, 6 m and 3 × head rules. Daylit depth at this window head (${u.head.toFixed(2)} m): primary zone ${u.depths.primary} m (EP pp.199, 229–230); overcast about ${u.depths.overcast.toFixed(1)} m, 1.5 × the clear height (EP p.204; Vancouver winters are overcast; the head stands in for the ceiling, team); full daylight depth ${u.depths.full.toFixed(1)} m, 2.5 × (${u.head.toFixed(2)} − 0.76) (Allen & Iano, The Architect’s Studio Companion, 6th ed., p.151). Each 0.1 m of window head adds 0.25 m of full depth: Storey height by use shows what that height costs the tower.`
      + (edges ? ` Garden or loggia edges at ${edges} count as an inner facade (deck use).` : '')))
  }
  if (specialist) for (const r of rules) if (/^dl-.*-(depth|share|rule)$/.test(r.id)) r.specialist = specialist
  rules.push(rule('dl-udi', 'Over-lit daylight (UDI)', 'not computed by the depth screen: the sDA and ASE tab counts useful daylight up to 3,000 lux', `over ${DAYLIGHT_RULE.overlit.toLocaleString('en-CA')} lux reads as over-lit, where occupants close the blinds`, 'unknown', 'verified', EP_UDI,
    'UDI bands: under 200 lux none, 200–500 partial, 500–1,500 adequate, over 1,500 over-lit (EP p.198). Bright south and west faces may read better in a 3,000 lux count than occupants would find them.'))
  return { uses, rules, k }
}
