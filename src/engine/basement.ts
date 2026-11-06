// Below grade (Ruijie, 6 Nov 2026: "the site model need to consider the traffic and basement experience, so that to avoid
// conflict on geometric assume a safe and thick ground height and assume that users will need to dig on the ground to
// bring in basement levels"). A tower can carry basement levels under its podium (or its tower): whole storeys dug into
// a ground that is always thick enough to hold them, with the parking they give, the ramp they need and whether that
// ramp fits. Basements are never floor area above grade (FSR, VTC rules and lifts read towerFloors, which stops at 0 m).
// Every number here that is not geometry is a team assumption, flagged as such where it is shown.
import { blockSpans } from './blocks'
import { towerFootprint } from './massing'
import type { Flag, RuleResult, Tower } from './types'

export type BasementUse = 'parking' | 'mixed'
export interface Basement {
  levels: number
  /** Floor-to-floor of every basement level (m). */
  f2f: number
  /** Parking (stalls, ramps, loading) or mixed (parking with storage, plant and a transit concourse). */
  use: BasementUse
  /** Dug under the podium (default), only under the tower, or to the site boundary (`ring`). */
  extent: 'podium' | 'tower' | 'site'
  /** The site boundary the dig follows when `extent` is 'site' (project frame, m; kept with the basement, so it stays
   * with the site when the tower moves). */
  ring?: [number, number][]
  /** 'model': set by the uploaded model (Rhino's window or its Below grade layer); the model's next update sets it again. */
  from?: 'model'
}

/** A first basement when the person adds one (team assumption; parking floor-to-floor after Sinnie Choi's dtmass, 3.2 m). */
export const DEFAULT_BASEMENT: Basement = { levels: 2, f2f: 3.2, use: 'parking', extent: 'podium' }
export const MAX_BASEMENT_LEVELS = 8
/** The site model's ground is at least this thick, and always this much deeper than the deepest basement (team assumption). */
export const GROUND_MIN_THICKNESS = 30
export const GROUND_MARGIN = 10
/** Gross basement area per car stall, aisles and ramps included (team assumption, a common planning rule of thumb). */
export const STALL_AREA_M2 = 30
/** Share of a mixed basement given to parking (team assumption). */
export const MIXED_PARKING_SHARE = 0.6
/** Ramp: 12.5 % slope plus 8 m of transitions, 6.1 m wide (after Sinnie Choi's dtmass; team assumption, by-law unread). */
export const RAMP_SLOPE = 0.125
export const RAMP_TRANSITIONS = 8
export const RAMP_WIDTH = 6.1

type Pt = [number, number]

export const hasBasement = (t: Tower) => (t.basement?.levels ?? 0) > 0

/** Plan outline of the dig, project frame: the widest podium block, the tower's footprint, or the site boundary. */
export function basementRing(t: Tower): Pt[] {
  if (t.basement?.extent === 'site' && (t.basement.ring?.length ?? 0) >= 3) return t.basement.ring!
  if (t.basement?.extent === 'tower') return towerFootprint(t)
  if (!t.imported && t.blocks?.length) {
    const pod = blockSpans(t).filter((s) => s.podium)
    if (pod.length) return pod.reduce((a, b) => (b.block.width * b.block.depth > a.block.width * a.block.depth ? b : a)).ring
  }
  return towerFootprint(t, true)
}

const ringArea = (r: Pt[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0)) / 2

export interface BasementLevel { name: string; z0: number; z1: number; area: number }

/** Basement levels top-down (B1 first), z below the tower's base (negative). */
export function basementLevels(t: Tower): BasementLevel[] {
  const b = t.basement
  if (!b || b.levels <= 0) return []
  const area = ringArea(basementRing(t))
  return Array.from({ length: Math.min(MAX_BASEMENT_LEVELS, Math.round(b.levels)) }, (_, i) => ({ name: `B${i + 1}`, z0: -(i + 1) * b.f2f, z1: -i * b.f2f, area }))
}

export const basementDepth = (t: Tower) => (t.basement && t.basement.levels > 0 ? Math.min(MAX_BASEMENT_LEVELS, Math.round(t.basement.levels)) * t.basement.f2f : 0)

/** How thick the site model's ground must be to hold every basement with a margin (never thinner than 30 m). */
export function groundThickness(towers: Tower[]): number {
  return Math.max(GROUND_MIN_THICKNESS, ...towers.map((t) => basementDepth(t) + GROUND_MARGIN))
}

export interface BasementSummary {
  levels: number
  depth: number
  areaPerLevel: number
  area: number
  stalls: number
  rampLength: number
  /** Longest straight run inside the dig's plan outline, for the ramp check. */
  longestRun: number
  rules: RuleResult[]
}

const TEAM: Flag = 'team_assumption'
const f0 = (v: number) => Math.round(v).toLocaleString('en-CA')

/** What a tower's basement gives and needs: area, stalls, the ramp and whether it fits, as checks with their flags. */
export function basementSummary(t: Tower): BasementSummary | null {
  const levels = basementLevels(t)
  if (!levels.length) return null
  const b = t.basement!
  const depth = basementDepth(t)
  const ring = basementRing(t)
  const areaPerLevel = levels[0].area
  const area = areaPerLevel * levels.length
  const parkingArea = b.use === 'parking' ? area : area * MIXED_PARKING_SHARE
  const stalls = Math.floor(parkingArea / STALL_AREA_M2)
  const rampLength = depth / RAMP_SLOPE + RAMP_TRANSITIONS
  // The ramp runs along a side of the dig: the longest side bounds it (a straight ramp; a helix is the designer's call).
  let longestRun = 0
  for (let i = 0; i < ring.length; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length]; longestRun = Math.max(longestRun, Math.hypot(x1 - x0, y1 - y0)) }
  const src = { label: 'Team assumption (Tower Design Toolkit); ramp after Sinnie Choi\'s Downtown Massing Tool' }
  const rules: RuleResult[] = [
    { id: 'basement-ground', label: 'Ground deep enough to dig', value: `${depth.toFixed(1)} m of basement in a ${groundThickness([t]).toFixed(0)} m ground`, threshold: `ground ≥ basement depth + ${GROUND_MARGIN} m and ≥ ${GROUND_MIN_THICKNESS} m`, state: 'pass', flag: TEAM, source: src },
    { id: 'basement-ramp', label: 'Ramp fits along the dig', value: `${rampLength.toFixed(1)} m ramp, longest side ${longestRun.toFixed(1)} m`, threshold: `straight ramp at ${(RAMP_SLOPE * 100).toFixed(1)} % plus ${RAMP_TRANSITIONS} m transitions`, state: rampLength <= longestRun ? 'pass' : 'warn', flag: TEAM, source: src, note: rampLength <= longestRun ? undefined : 'Longer than any side of the dig: fold it (a switchback or helix), or reduce the levels.' },
    { id: 'basement-stalls', label: 'Parking the basement holds', value: `about ${f0(stalls)} stalls on ${f0(parkingArea)} m²`, threshold: `${STALL_AREA_M2} m² gross per stall${b.use === 'mixed' ? `, ${Math.round(MIXED_PARKING_SHARE * 100)} % of a mixed basement` : ''}`, state: 'pass', flag: TEAM, source: src },
  ]
  return { levels: levels.length, depth, areaPerLevel, area, stalls, rampLength, longestRun, rules }
}
