// Twist read from the storey outlines (gap G19, research R5 §4.1 step 2: "this frame also gives the twist: the change
// of rectangle angle between storeys"). Each tower storey's outline is framed in its minimum-area bounding rectangle;
// the rectangle's axis is the storey's principal axis, read modulo 90° (a square looks the same turned a quarter). The
// turn from one storey to the next is taken the short way (within ±45°) and summed, so a twist of any total is read as
// long as no single storey turns 45° or more. A turn over 15° in one storey, or between storeys whose plates differ by
// more than a quarter in area, is read as a change of plan, not a twist (team rule: tested and built twists turn a few
// degrees per storey: the 180° helical models of Tanaka et al., Shanghai Tower's 120°, Cayan Tower's 90°). A round plan
// has no axis and is skipped. Parametric towers read their blocks' rotations the same way (a twisting form's blocks).
import { floorOutline, minAreaRect, simplify } from './corners'
import { towerFloors } from './massing'
import type { Floor, Tower } from './types'

type P = [number, number]

/** Largest turn in one storey still read as a twist (deg, team). */
export const TWIST_MAX_PER_STOREY = 15
/** Largest change of plate area between two storeys whose turn still counts as a twist (team). */
export const TWIST_AREA_CHANGE = 0.25
/** A storey turn below this is read as straight (slicing noise, deg). */
const STRAIGHT = 0.2

export interface StoreyTwist {
  level: number
  /** Mid-height of the storey (m). */
  z: number
  /** Rotation of the storey's principal axes from the lowest tower storey (deg, counter-clockwise positive). */
  angle: number
}

export interface TowerTwist {
  /** Rotation from the lowest to the highest tower storey (deg, counter-clockwise positive). */
  total: number
  /** Its size (deg). */
  deg: number
  /** Mean turn per storey over the twisting run, and the largest (deg). */
  perStorey: number
  maxPerStorey: number
  /** Mean turn per metre of height over the twisting run (deg/m). */
  perMetre: number
  /** Levels where the twisting run starts and ends (null when straight). */
  from: number | null
  to: number | null
  /** Share of the tower's height (above the podium) the twisting run spans. */
  share: number
  /** Storeys read, bottom-up, with their rotation from the lowest. */
  storeys: StoreyTwist[]
  /** Levels where the plan turns more than the twist limit or changes size: read as a change of plan and not counted. */
  breaks: number[]
  text: string
}

/** Principal axis of one plan outline: the minimum-area rectangle's axis, modulo 90° (deg in [0, 90)); null for a round plan. */
export function planAxis(ring: P[]): number | null {
  const r = simplify(ring)
  if (r.length < 3) return null
  const { u, B, D } = minAreaRect(r)
  if (!(B > 0 && D > 0)) return null
  // Round when the rectangle turned 45° is barely larger: no axis to read (a 48-gon circle reads 1.004).
  const a = Math.atan2(u[1], u[0]), c = Math.cos(a + Math.PI / 4), s = Math.sin(a + Math.PI / 4)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const p of r) { const pu = p[0] * c + p[1] * s, pv = -p[0] * s + p[1] * c; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv) }
  if ((u1 - u0) * (v1 - v0) < 1.02 * B * D) return null
  const m = ((((a * 180) / Math.PI) % 90) + 90) % 90
  return m > 90 - 1e-7 ? 0 : m
}

/** The short way between two axes read modulo 90° (deg in (−45, 45]). */
const turnMod90 = (from: number, to: number) => { let d = (to - from) % 90; if (d > 45) d -= 90; if (d <= -45) d += 90; return d }
const shoelace = (r: P[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0 } return Math.abs(a / 2) }

/** The tower's twist from its storey outlines (podium storeys left out). */
export function towerTwist(t: Tower, floors: Floor[] = towerFloors(t)): TowerTwist {
  const tower = floors.filter((f) => !f.podium)
  const read: { f: Floor; axis: number; area: number }[] = []
  const memo = new Map<string, number | null>()
  for (const f of tower) {
    const ring = floorOutline(t, f)
    const key = ring.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(';')
    let axis = memo.get(key)
    if (axis === undefined) { axis = planAxis(ring); memo.set(key, axis) }
    if (axis !== null) read.push({ f, axis, area: shoelace(ring) })
  }
  const H0 = tower.length ? tower[0].z0 : 0, H1 = tower.length ? tower[tower.length - 1].z1 : 0
  const none = (text: string): TowerTwist => ({ total: 0, deg: 0, perStorey: 0, maxPerStorey: 0, perMetre: 0, from: null, to: null, share: 0, storeys: read.map(({ f }) => ({ level: f.level, z: (f.z0 + f.z1) / 2, angle: 0 })), breaks: [], text })
  if (read.length < 2) return none(read.length ? 'one storey with a plan axis' : 'no tower storey with a plan axis (round or none)')
  const storeys: StoreyTwist[] = [{ level: read[0].f.level, z: (read[0].f.z0 + read[0].f.z1) / 2, angle: 0 }]
  const breaks: number[] = []
  let angle = 0, first = -1, last = -1, maxStep = 0
  for (let k = 1; k < read.length; k++) {
    const a = read[k - 1], b = read[k]
    const d = turnMod90(a.axis, b.axis)
    const resized = Math.abs(b.area - a.area) > TWIST_AREA_CHANGE * Math.max(a.area, b.area)
    if (Math.abs(d) > TWIST_MAX_PER_STOREY || (resized && Math.abs(d) >= STRAIGHT)) breaks.push(b.f.level)
    else {
      angle += d
      if (Math.abs(d) >= STRAIGHT) { if (first < 0) first = k; last = k; maxStep = Math.max(maxStep, Math.abs(d)) }
    }
    storeys.push({ level: b.f.level, z: (b.f.z0 + b.f.z1) / 2, angle })
  }
  if (first < 0 || Math.abs(angle) < STRAIGHT) return { ...none(`straight${breaks.length ? `; the plan turns at ${breaks.map((l) => `L${l}`).join(', ')} (read as a change of plan)` : ''}`), storeys, breaks }
  // The run spans from the storey below its first turn to the storey of its last.
  const lo = read[first - 1].f, hi = read[last].f
  const span = hi.z1 - lo.z0, steps = last - first + 1
  const deg = Math.abs(angle)
  const share = H1 > H0 ? Math.min(1, span / (H1 - H0)) : 0
  const perStorey = deg / steps, perMetre = span > 0 ? deg / span : 0
  const sense = angle > 0 ? 'counter-clockwise' : 'clockwise'
  const text = `${deg.toFixed(0)}° ${sense} from L${lo.level} to L${hi.level} (${perStorey.toFixed(1)}° per storey${share < 0.995 ? `, over ${Math.round(share * 100)}% of the tower's height` : ''})`
    + (breaks.length ? `; the plan turns at ${breaks.map((l) => `L${l}`).join(', ')} (read as a change of plan, not counted)` : '')
  return { total: angle, deg, perStorey, maxPerStorey: maxStep, perMetre, from: lo.level, to: hi.level, share, storeys, breaks, text }
}
