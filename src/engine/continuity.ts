// "No column starts" and the cantilever reader (tool cycle 12; R7 synthesis §3 tool 2, R7c T-M2, R7a TP-2), embedded in
// the Structure node's Floors & spans tab. Storey by storey, bottom-up, it reads how each storey's outline stands on the
// storeys below it. No column grid is modelled, so columns are read on the outlines: a column can stand wherever a
// column from below has run unbroken, that is inside every storey below it since the last start (the column field). A
// storey's deepest point beyond that field is its slab cantilever if no column starts; past CANTILEVER_MAX (team) a
// column would have to start there, unless a declared carry holds it: a loggia whose columns continue free-standing
// through open storeys, a transfer girder or truss, storeys hung from a truss (Tower.carries), the outrigger and belt
// floors (Tower.outriggerFloors) or an interior column ring (Tower.columnRing). Where a storey is smaller than the one
// below, the columns of the lower storey's edge stop there; tower C's rule wants each stop on a belt. A facade that moves
// a little at every storey (a taper, a lean, a morph or a twist) makes a column that follows it lean: that lean feeds
// the Type 10 sloped-columns line (engine/structure.ts). Screening only, confidence C: the field is read as the distance
// to each storey below (the largest), a lower bound of the distance to their exact intersection.
import { blockSpans, rectCorners, spanAt, towerFloors } from './massing'
import { FLAT_PLATE_REACH, ringAt, storeyWeights, type WeightResult } from './storeyWeight'
import { towerTwist } from './twist'
import { TWIST_MIN } from './acrossWind'
import type { Floor, RuleResult, RuleState, Source, StructureCarry, Tower } from './types'

type P = [number, number]
/** A storey's plate: its loops (outer rings and holes, read even-odd), tower frame, m. */
type Region = P[][]

/** Deepest slab edge kept past the column lines below before a column must start (m): team assumption, about a third of the 9.1 m flat-plate span (Ching p.8). */
export const CANTILEVER_MAX = 3
/** Largest move of the facade in one storey still read as a column that follows it (m): team, one 1.5 m facade unit of the entry towers; more is a step. */
export const LEAN_MOVE_MAX = 1.5
/** Storeys in a row whose facade moves a little before the moves read as a gradual slope (a taper, lean, morph or twist): team. */
export const GRADUAL_RUN = 3
/** Open storeys a declared loggia's columns may cross free-standing before the line asks for ties (team: tower C's loggia columns run three storeys). */
export const LOGGIA_MAX_OPEN = 3
/** Moves below this are slicing noise (m). */
const TOL = 0.1
/** Regions kept in the column field (the base and the latest); a twisting plate keeps adding them. */
const CHAIN_MAX = 24
/** Sampling step along each edge (m). */
const STEP = 1.5

export const CONT_CHING: Source = { label: 'Ching, Onouye & Zuberbuhler, Building Structures Illustrated (Wiley 2013), ch. 7 High-Rise Structures' }
export const CONT_AOYAMA: Source = { label: 'Aoyama (ed.), Design of Modern Highrise Reinforced Concrete Structures (Japanese practice; an analog)' }

/** One storey's outline for the reader (tower frame). */
export interface StoreyShape { level: number; z0: number; z1: number; podium: boolean; area: number; loops: Region }

/**
 * The storeys bottom-up with their plates: an imported tower's sliced storeys (every loop, those without a floor too, up
 * to the last floored storey), else each floor's block at mid-height. Storeys with no plate at all are left out.
 */
export function storeyShapes(t: Tower, floors: Floor[] = towerFloors(t)): StoreyShape[] {
  if (t.imported?.storeys?.length) {
    const st = [...t.imported.storeys].sort((a, b) => a.level - b.level)
    let last = -1
    st.forEach((s, i) => { if (s.hasFloor) last = i })
    return st.slice(0, last + 1).map((s) => ({ level: s.level, z0: s.z0, z1: s.z1, podium: s.podium, area: s.area, loops: (s.loops ?? []).filter((r) => r.length >= 3) as Region }))
      .filter((s) => s.loops.length > 0)
  }
  const spans = blockSpans(t)
  return floors.map((f) => {
    const b = spanAt(spans, (f.z0 + f.z1) / 2)?.block
    return { level: f.level, z0: f.z0, z1: f.z1, podium: f.podium, area: f.area, loops: [b ? rectCorners(b.dx, b.dy, b.width, b.depth, b.rotation) : rectCorners(0, 0, t.width, t.depth, 0)] }
  })
}

// --- plane geometry (even-odd regions) -----------------------------------------------------------------------------
export const signedArea = (r: P[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0 } return a / 2 }
function inside(p: P, g: Region): boolean {
  let o = false
  for (const r of g) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o
  }
  return o
}
function segDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy
  const u = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0
  return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy)
}
/** Distance from a point to a region: 0 inside it or on its edge. */
export function distTo(p: P, g: Region): number {
  if (inside(p, g)) return 0
  let d = Infinity
  for (const r of g) for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length]))
  return d
}
/** Points along every edge of a region: the vertices and at most STEP apart. */
function samplesOf(g: Region): P[] {
  const out: P[] = []
  for (const r of g) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}
const keyOf = (g: Region) => g.map((r) => r.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(' ')).join('|')
function centroidOf(g: Region): P {
  let a = 0, cx = 0, cy = 0
  for (const r of g) for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], k = x0 * y1 - x1 * y0; a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k }
  if (Math.abs(a) > 1e-9) return [cx / (3 * a), cy / (3 * a)]
  const pts = g.flat()
  return pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [0, 0]
}
/** Outer rings of a plate: counter-clockwise loops when the plate has holes marked clockwise, else every loop. */
export function outerLoops(g: Region): P[][] {
  const big = g.filter((r) => Math.abs(signedArea(r)) > 1)
  return big.some((r) => signedArea(r) < 0) ? big.filter((r) => signedArea(r) > 0) : big
}
/**
 * Separate parts of a plate: groups of outer loops that touch (within 0.1 m: a slicer may leave touching parts unjoined),
 * each group holding at least SPLIT_SHARE of the plate (slivers do not count).
 */
export function partsOf(g: Region): number {
  const outs = outerLoops(g)
  const area = outs.map((r) => Math.abs(signedArea(r)))
  const up = outs.map((_, i) => i)
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])))
  const touch = (a: P[], b: P[]) => a.some((p) => distTo(p, [b]) <= 0.1) || b.some((p) => distTo(p, [a]) <= 0.1)
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) if (find(i) !== find(j) && touch(outs[i], outs[j])) up[find(i)] = find(j)
  const sum = new Map<number, number>()
  outs.forEach((_, i) => sum.set(find(i), (sum.get(find(i)) ?? 0) + area[i]))
  const total = area.reduce((s, a) => s + a, 0)
  return [...sum.values()].filter((a) => a >= SPLIT_SHARE * total).length
}
/** Share of a plate a loop must hold to count as a separate part (team). */
export const SPLIT_SHARE = 0.15

/** The deepest point of `a`'s edge outside `b` (or the nearer of two regions), and the points within reach of it. */
function deepest(a: P[], b: Region, b2?: Region | null): { d: number; at: P | null } {
  const ds = a.map((p) => Math.min(distTo(p, b), b2 ? distTo(p, b2) : Infinity))
  return near(a, ds)
}
/** The largest of the distances and the mean of the points near it (a face reads as its middle, not a corner). */
function near(a: P[], ds: number[]): { d: number; at: P | null } {
  const d = ds.reduce((m, x) => Math.max(m, x), 0)
  if (!(d > 0)) return { d: 0, at: null }
  const lim = d - Math.max(0.2, 0.1 * d)
  let sx = 0, sy = 0, k = 0
  ds.forEach((x, i) => { if (x >= lim) { sx += a[i][0]; sy += a[i][1]; k++ } })
  return { d, at: k ? [sx / k, sy / k] : null }
}

const NAMES8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** True compass name of the way from c to p (tower frame); `turn` is the tower rotation plus true north (clockwise from +y). */
function faceOf(p: P | null, c: P, turn: number): string {
  if (!p || Math.hypot(p[0] - c[0], p[1] - c[1]) < 1) return ''
  const ang = (Math.atan2(p[0] - c[0], p[1] - c[1]) * 180) / Math.PI - turn
  return NAMES8[Math.round((((ang % 360) + 360) % 360) / 45) % 8]
}

// --- the reading ---------------------------------------------------------------------------------------------------
export interface Carry { kind: 'loggia' | 'transfer' | 'hung' | 'belt' | 'ring'; text: string }
/** A storey where a column would start (past the cantilever limit), with what carries it if declared. */
export interface ColumnStart { level: number; depth: number; face: string; gradual: boolean; carry: Carry | null; ring?: boolean; suggest?: StructureCarry }
/** Where the columns of a storey's edge stop (the storey above is smaller there), and the belt or carry it stops on. */
export interface ColumnStop { level: number; depth: number; face: string; on: string | null }
export interface StoreyContinuity {
  level: number; z0: number; z1: number; podium: boolean
  /** Deepest point outside the storey below (m), carried or not. */
  overhang: number
  /** Deepest point of the storey below outside this storey: its columns stop (m). */
  setIn: number
  /** Deepest point outside the column field from below: the slab cantilever if no column starts (m). */
  cantilever: number
  face: string
  /** Part of a run of small storey-by-storey moves (a taper, lean, morph or twist). */
  gradual: boolean
  /** Lean of a column that follows the facade over this storey (deg; 0 outside gradual runs). */
  lean: number
}
export interface ContinuityReading {
  storeys: StoreyContinuity[]
  starts: ColumnStart[]
  /** Overhangs past the limit held by a declared loggia or the column ring: no column starts. */
  carried: { level: number; depth: number; face: string; carry: Carry }[]
  stops: ColumnStop[]
  /** The deepest slab cantilever kept where no column starts (null: none past slicing noise). */
  cantilever: { depth: number; level: number; face: string; ring: boolean } | null
  /** The largest lean of a column that follows a gradually moving facade (null: none). */
  lean: { deg: number; level: number; move: number; h: number } | null
  gradual: { from: number; to: number; move: number; sense: 'in' | 'out' | 'both' }[]
  /** Declared carries as read (levels on the model's storeys). */
  carries: StructureCarry[]
  /** Outrigger and belt floors on tower storeys. */
  belts: number[]
  /** Loggia carries whose columns cross more open storeys than LOGGIA_MAX_OPEN. */
  tall: StructureCarry[]
  /** Why the design lies past the method's boundary ('' inside it). */
  specialist: string
}

/** The declared carries that name storeys of the model, loggias with their lowest open storey (default: the storey below). */
export function carriesOf(t: Tower, levels: number[]): StructureCarry[] {
  const has = new Set(levels)
  return (t.carries ?? []).filter((c) => c && Number.isFinite(c.level) && has.has(c.level))
    .map((c) => (c.kind === 'loggia' ? { ...c, from: Math.min(c.level - 1, Math.max(1, Math.round(c.from ?? c.level - 1))) } : c.kind === 'hung' ? { ...c, to: Math.max(c.level, Math.round(c.to ?? c.level)) } : { ...c }))
}

const carryText = (c: StructureCarry): string => c.kind === 'loggia' ? `the declared loggia carry (columns continue through ${c.from === c.level - 1 ? `L${c.from}` : `L${c.from}–L${c.level - 1}`})`
  : c.kind === 'transfer' ? `the declared transfer at L${c.level}` : `the declared hung storeys L${c.level}${c.to && c.to > c.level ? `–L${c.to}` : ''}`

/**
 * Reads every storey's overhang, set-in, cantilever and lean, the column starts and stops, and the declared carries.
 * `north` (true north clockwise from the project frame's +y) names the faces.
 */
export function columnContinuity(t: Tower, o: { floors?: Floor[]; weights?: WeightResult; north?: number } = {}): ContinuityReading {
  const floors = o.floors ?? towerFloors(t)
  const shapes = storeyShapes(t, floors)
  const w = o.weights ?? storeyWeights(t)
  const turn = (t.rotation ?? 0) + (o.north ?? 0)
  const n = shapes.length
  const smp = shapes.map((s) => samplesOf(s.loops))
  const keys = shapes.map((s) => keyOf(s.loops))
  const cen = shapes.map((s) => centroidOf(s.loops))
  const transitional = new Set(w.levels.filter((l) => l.transitional).map((l) => l.level))
  const levels = shapes.map((s) => s.level)
  const tower = new Set(shapes.filter((s) => !s.podium).map((s) => s.level))
  const belts = [...new Set(t.outriggerFloors ?? [])].filter((l) => tower.has(l)).sort((a, b) => a - b)
  const carries = carriesOf(t, levels)
  const loggiaAt = new Map(carries.filter((c) => c.kind === 'loggia').map((c) => [c.level, c]))
  const openSkip = new Set<number>()
  for (const c of loggiaAt.values()) for (let l = c.from!; l < c.level; l++) openSkip.add(l)
  const transferAt = new Map(carries.filter((c) => c.kind === 'transfer').map((c) => [c.level, c]))
  const hungOf = (level: number) => carries.find((c) => c.kind === 'hung' && level >= c.level && level <= (c.to ?? c.level)) ?? null

  // Pass 1: each storey against the one below (overhang, set-in) and the runs of small moves.
  const pair = shapes.map((s, k) => {
    if (k === 0 || keys[k] === keys[k - 1]) return { over: 0, overAt: null as P | null, setIn: 0, setAt: null as P | null }
    const below = shapes[k - 1]
    const a = deepest(smp[k], below.loops), b = deepest(smp[k - 1], s.loops)
    return { over: a.d, overAt: a.at, setIn: b.d, setAt: b.at }
  })
  const moves = pair.map((p, k) => (k > 0 && !shapes[k].podium && !shapes[k - 1].podium ? Math.max(p.over, p.setIn) : 0))
  const small = moves.map((m) => m > TOL && m <= LEAN_MOVE_MAX)
  const gradualK = shapes.map(() => false)
  const gradual: ContinuityReading['gradual'] = []
  for (let k = 1; k < n; k++) {
    if (!small[k]) continue
    let j = k
    while (j + 1 < n && small[j + 1]) j++
    if (j - k + 1 >= GRADUAL_RUN) {
      for (let i = k; i <= j; i++) gradualK[i] = true
      const outs = pair.slice(k, j + 1).some((p) => p.over > TOL), ins = pair.slice(k, j + 1).some((p) => p.setIn > TOL)
      gradual.push({ from: shapes[k - 1].level, to: shapes[j].level, move: Math.max(...moves.slice(k, j + 1)), sense: outs && ins ? 'both' : outs ? 'out' : 'in' })
    }
    k = j
  }
  const hmid = (k: number) => Math.max(0.1, (shapes[k].z1 + shapes[k].z0) / 2 - (shapes[k - 1].z1 + shapes[k - 1].z0) / 2)
  const leanK = shapes.map((_, k) => (gradualK[k] ? (Math.atan(moves[k] / hmid(k)) * 180) / Math.PI : 0))

  // The column ring (P1 #13): a square ring about the core at half the reach of its lowest storey, vertical from there.
  const ringLevels = shapes.filter((s) => !s.podium && ringAt(t, s.level)).map((s) => s.level)
  let ringSq: Region | null = null
  if (ringLevels.length) {
    const l0 = w.levels.find((l) => l.level === ringLevels[0] && !l.roof)
    if (l0?.reach && l0.reach.axial > 0) {
      const h = (l0.coreSide ?? w.core.side) / 2 + l0.reach.axial / 2, x = l0.coreX ?? w.core.x, y = l0.coreY ?? w.core.y
      ringSq = [[[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]]
    }
  }

  // Pass 2: the column field (a chain of regions, intersected), the cantilever, starts and carried overhangs.
  const out: StoreyContinuity[] = []
  const starts: ColumnStart[] = [], carried: ContinuityReading['carried'] = []
  let kept: ContinuityReading['cantilever'] = null
  let chain: { key: string; g: Region }[] = []
  const add = (k: number) => {
    const sm = smp[k]
    chain = chain.filter((c) => c.key !== keys[k] && !sm.every((p) => distTo(p, c.g) <= TOL))
    chain.push({ key: keys[k], g: shapes[k].loops })
    if (chain.length > CHAIN_MAX) chain.splice(1, chain.length - CHAIN_MAX)
  }
  const beltBy = (level: number) => belts.find((b) => b === level - 1 || b === level)
  for (let k = 0; k < n; k++) {
    const s = shapes[k]
    const base: StoreyContinuity = { level: s.level, z0: s.z0, z1: s.z1, podium: s.podium, overhang: 0, setIn: pair[k].setIn, cantilever: 0, face: '', gradual: gradualK[k], lean: leanK[k] }
    if (k === 0) { out.push(base); add(0); continue }
    const lg = loggiaAt.get(s.level)
    const ring = ringSq && !s.podium && ringAt(t, s.level) ? ringSq : null
    const dChain = smp[k].map((p) => { let d = 0; for (const r of chain) d = Math.max(d, distTo(p, r.g)); return d })
    const dRing = ring ? smp[k].map((p) => distTo(p, ring)) : null
    const ds = dRing ? dChain.map((d, i) => Math.min(d, dRing[i])) : dChain
    const { d: c, at: cAt } = near(smp[k], ds)
    const cNoRing = dChain.reduce((m, x) => Math.max(m, x), 0)
    const byRing = !!dRing && c < cNoRing - 1e-6
    const face = faceOf(cAt ?? pair[k].overAt, cen[k], turn)
    out.push({ ...base, overhang: pair[k].over, cantilever: c, face })
    // a podium storey over a smaller one (an arcade, a canopy): its column grid is not modelled; columns are taken as there
    if (c > CANTILEVER_MAX + 1e-6 && s.podium) { chain = []; add(k); continue }
    if (c > CANTILEVER_MAX + 1e-6) {
      const tr = transferAt.get(s.level), hg = hungOf(s.level), b = beltBy(s.level)
      const carry: Carry | null = tr ? { kind: 'transfer', text: carryText(tr) } : hg ? { kind: 'hung', text: carryText(hg) } : b != null ? { kind: 'belt', text: `the belt at L${b} (a transfer by truss)` } : null
      let suggest: StructureCarry | undefined
      if (!carry && !gradualK[k]) {
        for (let j = k - 2; j >= Math.max(0, k - 1 - LOGGIA_MAX_OPEN); j--) {
          if (shapes[j].podium) break
          if (smp[k].every((p) => Math.min(distTo(p, shapes[j].loops), distTo(p, shapes[k - 1].loops)) <= CANTILEVER_MAX)) { suggest = { kind: 'loggia', level: s.level, from: shapes[j + 1].level }; break }
        }
      }
      starts.push({ level: s.level, depth: c, face, gradual: gradualK[k], carry, ...(suggest ? { suggest } : {}) })
      chain = []
      add(k)
      continue
    }
    if (lg && pair[k].over > CANTILEVER_MAX) carried.push({ level: s.level, depth: pair[k].over, face: faceOf(pair[k].overAt, cen[k], turn), carry: { kind: 'loggia', text: carryText(lg) } })
    else if (byRing && cNoRing > CANTILEVER_MAX) carried.push({ level: s.level, depth: cNoRing, face, carry: { kind: 'ring', text: 'the declared column ring' } })
    if (c > TOL && (!kept || c > kept.depth)) kept = { depth: c, level: s.level, face, ring: byRing }
    if (!openSkip.has(s.level)) add(k)
  }
  // The ring's own columns start where its range begins above the lowest tower storey.
  const towerLevels = shapes.filter((s) => !s.podium).map((s) => s.level)
  if (ringLevels.length && towerLevels.length && ringLevels[0] > towerLevels[0]) {
    const l = ringLevels[0], tr = transferAt.get(l), b = beltBy(l)
    starts.push({ level: l, depth: 0, face: '', gradual: false, ring: true, carry: tr ? { kind: 'transfer', text: carryText(tr) } : b != null ? { kind: 'belt', text: `the belt at L${b} (a transfer by truss)` } : null })
    starts.sort((a, b2) => a.level - b2.level)
  }

  // Stops: the storey above is smaller by a step (not a gradual move), above the podium and its transitional run.
  const loggiaTop = new Set(carries.filter((c) => c.kind === 'loggia').map((c) => c.level))
  const stops: ColumnStop[] = []
  for (let k = 1; k < n; k++) {
    const lower = shapes[k - 1], upper = shapes[k]
    if (pair[k].setIn <= TOL || gradualK[k] || lower.podium || transitional.has(lower.level) || openSkip.has(upper.level)) continue
    const b = belts.find((x) => Math.abs(x - lower.level) <= 1)
    const hg = carries.find((c) => c.kind === 'hung' && (c.to ?? c.level) === lower.level)
    const on = b != null ? `the belt at L${b}` : loggiaTop.has(lower.level) ? 'the declared loggia roof' : hg ? 'the declared hung storeys' : transferAt.has(upper.level) ? `the declared transfer at L${upper.level}` : null
    stops.push({ level: lower.level, depth: pair[k].setIn, face: faceOf(pair[k].setAt, cen[k - 1], turn), on })
  }

  // The largest lean of a column that follows a gradually moving facade (Type 10 reads it).
  let lean: ContinuityReading['lean'] = null
  for (let k = 1; k < n; k++) if (gradualK[k] && (!lean || leanK[k] > lean.deg)) lean = { deg: leanK[k], level: shapes[k].level, move: moves[k], h: hmid(k) }

  // Past the method's boundary (node contract): a twist, a gradual morph, taper or lean, or a plate that splits.
  const tw = towerTwist(t, floors)
  const parts = shapes.map((s) => partsOf(s.loops))
  const split = shapes.filter((s, k) => !s.podium && k > 0 && parts[k] > 1 && parts[k - 1] < parts[k]).map((s) => s.level)
  const specialist = [
    tw.deg >= TWIST_MIN ? `the plate turns ${Math.round(tw.deg)}°, so column lines lean or stop at every storey` : '',
    gradual.length && tw.deg < TWIST_MIN ? `the outline moves storey by storey (${gradual.map((g) => `L${g.from}–L${g.to}`).join(', ')}): a tapered, leaning or morphed plate whose column path (stop, lean or diagrid) the engineer decides` : '',
    split.length ? `the plate splits into separate parts at ${split.map((l) => `L${l}`).join(', ')}` : '',
  ].filter(Boolean).join('; ')
  const tall = carries.filter((c) => c.kind === 'loggia' && c.level - c.from! > LOGGIA_MAX_OPEN)
  return { storeys: out, starts, carried, stops, cantilever: kept, lean, gradual, carries, belts, tall, specialist }
}

// --- result lines (Floors & spans) ---------------------------------------------------------------------------------
const m1 = (v: number) => v.toFixed(1)
const at = (f: string) => (f ? `${f}, ` : '')
const SRC_STARTS: Source = { ...CONT_CHING, page: 'pp.10, 41, 45–46 (PDF pages: long-span floors and perimeter columns; belts at plant floors; bundled tubes end whole on continuous column lines); Aoyama p.12 (regular elevation); research R7c (Trump Chicago: setbacks off the column grid took transfer floors, S20)' }
const SRC_CANT: Source = { label: 'Team assumption: 3.0 m, about a third of the flat-plate span', page: `Ching p.8 (${FLAT_PLATE_REACH} m flat plate); no cantilever limit in the books read` }
const SRC_STOPS: Source = { ...CONT_CHING, page: 'pp.13, 41, 45–46 (PDF pages: a belt where columns stop at a step; belts at plant floors; stopped tubes end on full column lines); tower C’s rule (columns stop at a belt, never start)' }

/**
 * The reader's three lines for Floors & spans: column starts (overhangs past the cantilever limit, beyond declared
 * carries), the deepest slab cantilever kept, and where column lines stop.
 */
export function continuityLines(r: ContinuityReading): RuleResult[] {
  const sp = r.specialist ? { specialist: r.specialist } : {}
  const undeclared = r.starts.filter((s) => !s.carry)
  const declared = r.starts.filter((s) => s.carry)
  const startText = (s: ColumnStart) => s.ring ? `L${s.level} (the column ring’s columns${s.carry ? `, on ${s.carry.text}` : ''})`
    : `L${s.level} (${at(s.face)}${m1(s.depth)} m past the column lines below${s.carry ? `, on ${s.carry.text}` : ''})`
  const list = (xs: ColumnStart[], max = 4) => xs.slice(0, max).map(startText).join(', ') + (xs.length > max ? ` and ${xs.length - max} more` : '')
  const g = r.gradual.length ? ` The facade moves a little at every storey over ${r.gradual.map((x) => `L${x.from}–L${x.to} (up to ${m1(x.move)} m a storey, ${x.sense === 'in' ? 'inward' : x.sense === 'out' ? 'outward' : 'both ways'})`).join(', ')}: a column that follows it leans (the sloped-columns line), else columns stop as the facade passes them and new ones start where it grows.` : ''
  const sugg = undeclared.filter((s) => s.suggest).map((s) => `L${s.level}: if the columns of L${s.suggest!.from! - 1} continue through ${s.suggest!.from === s.level - 1 ? `L${s.suggest!.from}` : `L${s.suggest!.from}–L${s.level - 1}`}, declare a loggia carry`).join('; ')
  const value = undeclared.length ? `columns would start at ${list(undeclared)}${declared.length ? `; on declared carries at ${list(declared, 3)}` : ''}`
    : declared.length ? `columns start on declared carries at ${list(declared)}`
      : `no column starts: every storey stands within ${m1(CANTILEVER_MAX)} m of the column lines below${r.carried.length ? `, or on a declared carry (${r.carried.map((c) => `L${c.level}`).join(', ')})` : ''}`
  const state: RuleState = r.starts.length ? 'warn' : 'pass'
  const out: RuleResult[] = []
  out.push({ ...sp, ...(!r.specialist && declared.length ? { specialist: 'Columns start on a declared transfer, belt or hung truss: the structural engineer designs it for the started columns’ load and its storey for the stiffness and strength it changes.' } : {}),
    id: 'column-starts', label: 'No column starts (overhangs)', value,
    threshold: `columns may stop but never start: each storey stands within ${m1(CANTILEVER_MAX)} m (team) of the column lines below, or on a declared carry (a loggia whose columns continue, the column ring); a start on a transfer, belt or hung truss is declared and costed`,
    state, flag: 'team_assumption', source: SRC_STARTS,
    note: 'Storeys bottom-up on their own outlines (no column grid is modelled): a column can stand wherever a column from below has run unbroken, inside every storey below it since the last start (the column field). The deepest point of each storey beyond that field is its slab cantilever if no column starts; past '
      + `${m1(CANTILEVER_MAX)} m (team: about a third of the ${FLAT_PLATE_REACH} m flat-plate span, Ching p.8) a column would have to start there: on a transfer girder or truss (setbacks off the column grid cost Trump Chicago a three-storey transfer, research R7c), on a belt, hung from a truss above, or on nothing. `
      + 'Declared carries (Structure › Floors & spans): a loggia (the columns of the storey under an open band continue free-standing through it and carry the storey above; ties needed past '
      + `${LOGGIA_MAX_OPEN} open storeys, team), a transfer, hung storeys, the outrigger and belt floors, and the interior column ring (its slab edges cantilever from the ring; a ring that starts above the lowest tower storey starts its own columns). `
      + (r.carried.length ? `Carried: ${r.carried.map((c) => `L${c.level} (${at(c.face)}${m1(c.depth)} m over the storey below) by ${c.carry.text}`).join('; ')}. ` : '')
      + (sugg ? `Possible carries: ${sugg}. ` : '')
      + (r.tall.length ? `Loggia columns crossing more than ${LOGGIA_MAX_OPEN} open storeys: ${r.tall.map((c) => `L${c.from}–L${c.level - 1}`).join(', ')} (free-standing columns need ties). ` : '')
      + g
      + ' Confidence C: the column field is read as the distance to each storey below (the largest), a lower bound of the distance to their exact intersection. Podium storeys count in the field, so a tower over a podium opening reads too; a podium storey over a smaller one (an arcade, a canopy) is not read, as the podium’s column grid is not modelled. Book values read once: unverified.' })

  const kc = r.cantilever
  const cState: RuleState = kc && kc.depth > CANTILEVER_MAX + 1e-6 ? 'warn' : 'pass'
  out.push({ ...sp, id: 'cantilever', label: 'Slab cantilever past the column lines',
    value: kc ? `deepest ${m1(kc.depth)} m at L${kc.level}${kc.face ? ` (${kc.face})` : ''}${kc.ring ? ', from the column ring' : ''}${undeclared.length ? `; where a column would start instead, up to ${m1(Math.max(...undeclared.map((s) => s.depth)))} m` : ''}`
      : `none: every storey sits on the column lines below${undeclared.length ? `; where a column would start instead, up to ${m1(Math.max(...undeclared.map((s) => s.depth)))} m` : ''}`,
    threshold: `≤ ${m1(CANTILEVER_MAX)} m past the column lines below (team: about a third of the ${FLAT_PLATE_REACH} m flat-plate span)`,
    state: cState, flag: 'team_assumption', source: SRC_CANT,
    note: 'The slab edge each storey keeps beyond the column field from below where no column starts (the column-starts line lists the storeys past the limit, which need a column, a carry or a long cantilever). '
      + 'With an interior column ring the edge may cantilever from the ring instead (a square about the core at half the reach of the ring’s lowest storey, Ching p.10). The floor-reach line reads the reach from the core itself. A cantilever of this depth needs the engineer’s deflection and vibration check; the books read give no cantilever limit, so 3.0 m is a team value.' })

  const off = r.stops.filter((s) => !s.on)
  const stopText = (s: ColumnStop) => `L${s.level} (${at(s.face)}${m1(s.depth)} m)${s.on ? ` on ${s.on}` : ''}`
  const stopList = (xs: ColumnStop[], max = 4) => xs.slice(0, max).map(stopText).join(', ') + (xs.length > max ? ` and ${xs.length - max} more` : '')
  out.push({ ...sp, id: 'column-stops', label: 'Where column lines stop',
    value: r.stops.length ? (off.length ? `${off.length} of ${r.stops.length} stop${r.stops.length > 1 ? 's' : ''} off a belt: ${stopList(off)}${off.length < r.stops.length ? `; on a belt or carry: ${stopList(r.stops.filter((s) => s.on), 3)}` : ''}` : `every stop on a belt or carry: ${stopList(r.stops)}`)
      : `no column line stops at a step above the podium${r.gradual.length ? ' (the facade moves gradually: see the note)' : ''}`,
    threshold: 'a column line stops at a belt or outrigger storey (within one storey) or at the top of a declared carry',
    state: off.length ? 'warn' : 'pass', flag: 'unverified', source: SRC_STOPS,
    note: 'Where a storey is smaller than the one below by a step, the columns along the lower storey’s edge stop there (the level is the last storey they carry). '
      + `Belts and outriggers read: ${r.belts.length ? r.belts.map((l) => `L${l}`).join(', ') : 'none declared'}. A belt at each step ties the stopped line back and evens the load as the frame changes (Ching pp.13, 41); stopped tubes keep their remaining column lines whole (pp.45–46), and the upper face must land on a full column line of the tier below, which the toolkit cannot see (no column grid). `
      + 'Steps of the podium and of the wider run just above it are left out. Differential shortening between stopped and continuing lines (Ching p.45) is not read.' + g })
  return out
}
