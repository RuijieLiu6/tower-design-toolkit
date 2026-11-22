// Square: seen, crossed, edged, level (book node #17 built.base-edges, an upgrade of built.pr-frontage: NODE_LIST §4 #17,
// placemaking-ch8-10.md §4 P1 and §6, placemaking-critique.md P4, dobson-vertical-studio.md P6). Around the design's own
// square on the competition block (openSpace().largest, the POPS rectangle): its edge split into street, building face
// and blank, with the active share of the face and a glazed public lobby (the square as a fifth frontage); how much of it
// is seen from the sidewalks; the walk from the station exit across it against the straight line; its level against the
// sidewalk; a type label; and the active share of the base storeys L1–L6 along the streets. Book values are read once
// (unverified) and every threshold is the team's. Real Vancouver: one line saying plainly why it waits.
import { towerFloors } from './massing'
import {
  STATION_CORNER, STREETWALL_REACH, VTC_EDGES, VTC_SITE, builtCells, cityFrontageCheck, frontageCheck, linkGeometry, masses, onEdgeParts, openSpace, planParts,
  type CityStreetsCtx, type EdgeId, type PublicRealmInput,
} from './publicRealm'
import { storeySlabs } from './sw/decks'
import type { RuleResult, Tower, UseId } from './types'

type Pt = [number, number]
interface Rect { x0: number; x1: number; y0: number; y1: number; area: number }

const PM = 'Al-Kodmany, Placemaking with Tall Buildings (Routledge 2026); book notes placemaking-critique.md and placemaking-ch8-10.md'
const pm = (page: string) => ({ label: PM, page })
const DOBSON = { label: 'Dobson, vertical studio: the City frames excellence as the envelope plus the base, its bottom six storeys (book notes dobson-vertical-studio.md)', page: 'p.75' }
const RUBIN = 'Rubin, "Skyscrapers and Tall Buildings" (Oxford Research Encyclopedia of American History, 2018), pp.17, 20'

/** Sidewalk band walked and looked from round the block, beyond the property line (m; team). */
export const SIDEWALK = 4
/** Eye height on the sidewalk (m). */
export const EYE = 1.6
/** A building within this distance of the square's edge is its building face (m; NODE_LIST #17). */
export const FACE_REACH = 1
/** A face set back under overhead mass (an arcade) within this distance still faces the square (m; team). */
export const ARCADE_REACH = 6
/** Team thresholds: the active share of the building face, the share of the square seen, the walk's detour. */
export const SQUARE_ACTIVE_MIN = 0.5
export const SQUARE_SEEN_MIN = 0.5
export const DETOUR_MAX = 1.1
/** A square more than this far below or above the sidewalk takes the sunken (or raised) rules (m; placemaking-ch8-10 P1). */
export const LEVEL_BAND = 0.5
export const STEP_FREE_MIN = 2
/** Active share of the street-facing storey length on L1–L6 (team; Dobson p.75 gives no number). */
export const BASE_ACTIVE_MIN = 0.5
/** Below this share of the open ground round it, the rectangle misreads the square (team). */
export const REGULAR_MIN = 0.5
/** Uses that count active or public on the base storeys above the ground (team): shops, civic rooms, amenity. */
const ACTIVE_UP: UseId[] = ['retail', 'civic', 'amenity']
const C = 0.5

// ---------- grid: the block and a sidewalk band round it ----------
export interface Grid { x0: number; y0: number; nx: number; ny: number; grade: Uint8Array; cover: Uint8Array }
export function squareGrid(towers: Tower[]): Grid {
  const x0 = VTC_SITE.xMin - SIDEWALK, y0 = VTC_SITE.yMin - SIDEWALK
  const nx = Math.ceil((VTC_SITE.xMax - VTC_SITE.xMin + 2 * SIDEWALK) / C), ny = Math.ceil((VTC_SITE.yMax - VTC_SITE.yMin + 2 * SIDEWALK) / C)
  // At grade: the ground storeys' outlines (people walk and look under a bridge or canopy). Covered: any mass at any height.
  const ground = towers.flatMap((t) => planParts(t, 'ground').map(([poly, ...holes]) => ({ poly, holes })))
  return { x0, y0, nx, ny, grade: builtCells(ground, x0, y0, C, C, nx, ny), cover: builtCells(masses(towers), x0, y0, C, C, nx, ny) }
}
const cellOf = (g: Grid, x: number, y: number) => {
  const i = Math.floor((x - g.x0) / C), j = Math.floor((y - g.y0) / C)
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i
}
const inSite = (x: number, y: number) => x > VTC_SITE.xMin && x < VTC_SITE.xMax && y > VTC_SITE.yMin && y < VTC_SITE.yMax
const centreOf = (g: Grid, k: number): Pt => [g.x0 + ((k % g.nx) + 0.5) * C, g.y0 + (Math.floor(k / g.nx) + 0.5) * C]
/** Nothing stands at grade on the straight line between two points (`walk`: and it stays on the block or its sidewalks). */
function clear(g: Grid, a: Pt, b: Pt, walk = false): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (C * 0.5)))
  for (let s = 1; s < n; s++) {
    const k = cellOf(g, a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n)
    if (k < 0 ? walk : g.grade[k]) return false
  }
  return true
}

// ---------- the edge: street, building face, blank ----------
export type EdgeKind = 'street' | 'face' | 'blank'
export interface SideSplit { length: number; street: number; face: number; blank: number }
export interface EdgeSplit extends SideSplit { sides: Record<EdgeId, SideSplit> }
const SIDES = (r: Rect): { side: EdgeId; a: Pt; b: Pt; out: Pt }[] => [
  { side: 'south', a: [r.x0, r.y0], b: [r.x1, r.y0], out: [0, -1] },
  { side: 'north', a: [r.x0, r.y1], b: [r.x1, r.y1], out: [0, 1] },
  { side: 'west', a: [r.x0, r.y0], b: [r.x0, r.y1], out: [-1, 0] },
  { side: 'east', a: [r.x1, r.y0], b: [r.x1, r.y1], out: [1, 0] },
]
function edgeKind(g: Grid, p: Pt, out: Pt): EdgeKind {
  const q = (d: number): Pt => [p[0] + out[0] * d, p[1] + out[1] * d]
  for (let d = 0.25; d <= FACE_REACH + 1e-9; d += 0.25) { const k = cellOf(g, ...q(d)); if (k >= 0 && g.grade[k]) return 'face' }
  for (let d = 0.25; d <= FACE_REACH + 1e-9; d += 0.25) if (!inSite(...q(d))) return 'street'
  // An arcade: covered all the way back to a face at grade.
  for (let d = 0.25; d <= ARCADE_REACH + 1e-9; d += 0.25) {
    const [x, y] = q(d), k = cellOf(g, x, y)
    if (k < 0 || !inSite(x, y) || !g.cover[k]) break
    if (g.grade[k]) return 'face'
  }
  return 'blank'
}
export function edgeSplit(g: Grid, r: Rect): EdgeSplit {
  const zero = (): SideSplit => ({ length: 0, street: 0, face: 0, blank: 0 })
  const sides = { south: zero(), west: zero(), north: zero(), east: zero() } as Record<EdgeId, SideSplit>
  for (const s of SIDES(r)) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), n = Math.max(1, Math.round(L / C)), ds = L / n
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      sides[s.side][edgeKind(g, [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t], s.out)] += ds
      sides[s.side].length += ds
    }
  }
  const all = Object.values(sides)
  const sum = (f: keyof SideSplit) => all.reduce((x, s) => x + s[f], 0)
  return { length: sum('length'), street: sum('street'), face: sum('face'), blank: sum('blank'), sides }
}

// ---------- seen from the sidewalks ----------
/** Points on the sidewalks round the block, 2 m beyond the property line, every 2.5 m (team). */
export function sidewalkPoints(): Pt[] {
  const out: Pt[] = []
  for (const e of VTC_EDGES) {
    const along = e.out[0] === 0, lo = along ? VTC_SITE.xMin : VTC_SITE.yMin, hi = along ? VTC_SITE.xMax : VTC_SITE.yMax
    const line = e.id === 'south' ? VTC_SITE.yMin : e.id === 'north' ? VTC_SITE.yMax : e.id === 'west' ? VTC_SITE.xMin : VTC_SITE.xMax
    const n = Math.max(1, Math.round((hi - lo) / 2.5))
    for (let k = 0; k < n; k++) {
      const v = lo + ((k + 0.5) * (hi - lo)) / n, w = line + 2 * (e.out[0] + e.out[1])
      out.push(along ? [v, w] : [w, v])
    }
  }
  return out
}
/** Where the line from p (outside) to q (inside) enters the rectangle, as a share of its length (Liang–Barsky). */
function entryAt(p: Pt, q: Pt, r: Rect): number {
  const dx = q[0] - p[0], dy = q[1] - p[1]
  let t0 = 0
  for (const [a, b] of [[-dx, p[0] - r.x0], [dx, r.x1 - p[0]], [-dy, p[1] - r.y0], [dy, r.y1 - p[1]]] as const) if (a < 0) t0 = Math.max(t0, b / a)
  return t0
}
/**
 * The share of the square's floor seen from the sidewalks at eye height, ground storeys as occluders, sampled about every
 * 2 m; and the sidewalk points that see some of it. A sunken square (level < 0) is seen past its rim only where the sight
 * line clears the rim at grade; a raised one only up to eye height. Inside the rectangle nothing stands, so each sight line
 * is traced only to where it enters it.
 */
export function seenFromSidewalks(g: Grid, r: Rect, level = 0): { share: number; points: number; of: number } {
  const pts = sidewalkPoints(), rim = Math.max(0, level)
  const nx = Math.max(2, Math.ceil((r.x1 - r.x0) / 2)), ny = Math.max(2, Math.ceil((r.y1 - r.y0) / 2))
  const samples: Pt[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) samples.push([r.x0 + ((i + 0.5) * (r.x1 - r.x0)) / nx, r.y0 + ((j + 0.5) * (r.y1 - r.y0)) / ny])
  const sees = (p: Pt, q: Pt) => {
    const t = entryAt(p, q, r)
    return EYE + t * (level - EYE) >= rim - 1e-9 && clear(g, p, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
  }
  // Neighbouring samples are mostly seen from the same point (and the reverse): try the last one that worked first.
  const anyOf = <A, B>(from: A, list: B[], hit: { k: number }, test: (a: A, b: B) => boolean) => {
    if (list.length && test(from, list[hit.k])) return true
    for (let k = 0; k < list.length; k++) if (k !== hit.k && test(from, list[k])) { hit.k = k; return true }
    return false
  }
  let seen = 0, points = 0
  const h1 = { k: 0 }, h2 = { k: 0 }
  for (const q of samples) if (anyOf(q, pts, h1, (a, b) => sees(b, a))) seen++
  for (const p of pts) if (anyOf(p, samples, h2, sees)) points++
  return { share: samples.length ? seen / samples.length : 0, points, of: pts.length }
}

// ---------- walked: the desire line from the station exit ----------
/** Shortest walks from one point over the block and its sidewalks, round what stands at grade (8-way grid, no corner cutting). */
function walksFrom(g: Grid, from: Pt): { dist: Float64Array; prev: Int32Array } {
  const N = g.nx * g.ny, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1)
  const k0 = cellOf(g, from[0], from[1])
  if (k0 < 0 || g.grade[k0]) return { dist, prev }
  dist[k0] = 0
  const heap: number[] = [k0]
  const less = (a: number, b: number) => dist[heap[a]] < dist[heap[b]]
  const swap = (a: number, b: number) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t }
  const push = (k: number) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; swap(i, p); i = p } }
  const pop = () => {
    const top = heap[0], last = heap.pop()!
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(l, m)) m = l; if (r < heap.length && less(r, m)) m = r; if (m === i) break; swap(i, m); i = m } }
    return top
  }
  const done = new Uint8Array(N)
  while (heap.length) {
    const k = pop()
    if (done[k]) continue
    done[k] = 1
    const i = k % g.nx, j = (k - i) / g.nx
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue
      const a = i + di, b = j + dj
      if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue
      const n = b * g.nx + a
      if (g.grade[n] || done[n]) continue
      if (di && dj && (g.grade[j * g.nx + a] || g.grade[b * g.nx + i])) continue
      const d = dist[k] + (di && dj ? Math.SQRT2 : 1) * C
      if (d < dist[n]) { dist[n] = d; prev[n] = k; push(n) }
    }
  }
  return { dist, prev }
}
/** Length of the walk from `to` back to the start, the grid path pulled straight where nothing stands in the way. */
function walkLength(g: Grid, w: { dist: Float64Array; prev: Int32Array }, from: Pt, to: Pt): number | null {
  const k = cellOf(g, to[0], to[1])
  if (k < 0 || !Number.isFinite(w.dist[k])) return null
  const path: Pt[] = [to]
  for (let c = w.prev[k]; c >= 0; c = w.prev[c]) path.push(centreOf(g, c))
  path[path.length - 1] = from
  let len = 0
  for (let i = 0; i < path.length - 1;) {
    let j = i + 1
    while (j + 1 < path.length && clear(g, path[i], path[j + 1], true)) j++
    len += Math.hypot(path[j][0] - path[i][0], path[j][1] - path[i][1])
    i = j
  }
  return len
}
export interface DesireLine { label: string; walk: number; straight: number; detour: number }
const EDGE_WORD: Record<EdgeId, string> = Object.fromEntries(VTC_EDGES.map((e) => [e.id, e.street.replace(' (local)', '').toLowerCase()])) as Record<EdgeId, string>
/**
 * The desire line from the station exit (the south-west corner, brief p.18) through the square's centre to the street on
 * its far side, walked round what stands at grade, against the straight line; and from the far end of the mid-block link
 * to the square's centre.
 */
export function desireLines(g: Grid, r: Rect, towers: Tower[], input: PublicRealmInput): DesireLine[] {
  const c: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
  const s: Pt = [STATION_CORNER[0] - 2, STATION_CORNER[1] - 2]
  const w = walksFrom(g, c)
  const out: DesireLine[] = []
  // Where the line from the station through the centre leaves the block, then 2 m onto that sidewalk.
  const dx = c[0] - s[0], dy = c[1] - s[1]
  const tx = dx > 0 ? (VTC_SITE.xMax - s[0]) / dx : dx < 0 ? (VTC_SITE.xMin - s[0]) / dx : Infinity
  const ty = dy > 0 ? (VTC_SITE.yMax - s[1]) / dy : dy < 0 ? (VTC_SITE.yMin - s[1]) / dy : Infinity
  const t = Math.min(tx, ty), L = Math.hypot(dx, dy)
  const far: Pt = [s[0] + dx * t + (dx / L) * 2, s[1] + dy * t + (dy / L) * 2]
  const farEdge: EdgeId = tx < ty ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'north' : 'south')
  const a = walkLength(g, w, c, s), b = walkLength(g, w, c, far)
  if (a !== null && b !== null) {
    const straight = Math.hypot(far[0] - s[0], far[1] - s[1])
    out.push({ label: `station → across the square → ${EDGE_WORD[farEdge]}`, walk: a + b, straight, detour: (a + b) / straight })
  }
  const link = linkGeometry(towers, input)
  if (link) {
    const end: Pt = input.link.axis === 'ns' ? [(link.x0 + link.x1) / 2, VTC_SITE.yMax + 2] : [VTC_SITE.xMax + 2, (link.y0 + link.y1) / 2]
    const m = walkLength(g, w, c, end)
    if (m !== null) { const straight = Math.hypot(end[0] - c[0], end[1] - c[1]); out.push({ label: `${input.link.axis === 'ns' ? 'north' : 'east'} end of the link → square`, walk: m, straight, detour: m / Math.max(1e-6, straight) }) }
  }
  return out
}

/** The rectangle's share of the open ground it sits in (open cells joined to its centre, under no mass, on the block). */
function regularity(g: Grid, r: Rect): number {
  const k0 = cellOf(g, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
  if (k0 < 0 || g.cover[k0]) return 1
  const seen = new Uint8Array(g.nx * g.ny), stack = [k0]
  seen[k0] = 1
  let n = 0
  while (stack.length) {
    const k = stack.pop()!
    n++
    const i = k % g.nx, j = (k - i) / g.nx
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue
      const m = b * g.nx + a, [x, y] = centreOf(g, m)
      if (seen[m] || g.cover[m] || !inSite(x, y)) continue
      seen[m] = 1
      stack.push(m)
    }
  }
  return Math.min(1, r.area / Math.max(1e-6, n * C * C))
}

// ---------- the base storeys, L1–L6 ----------
/** Street-facing storey length on L1–L6 and its active share: L1 from the street inputs, L2–L6 from each storey's use. */
export function baseSix(towers: Tower[], input: PublicRealmInput): { length: number; active: number; rows: { level: number; word: string }[] } {
  let length = 0, active = 0
  const words = new Map<number, Set<string>>()
  for (const t of towers) {
    const slabs = storeySlabs(t)
    for (const f of towerFloors(t).filter((x) => x.level >= 1 && x.level <= 6)) {
      const mid = (f.z0 + f.z1) / 2
      const slab = slabs.find((s) => s.z0 <= mid && mid < s.z1)
      if (!slab) continue
      const rings = slab.poly.map((pg) => pg[0] as Pt[])
      for (const e of VTC_EDGES) {
        const len = onEdgeParts(rings, e, STREETWALL_REACH).covered
        length += len
        active += f.level === 1 ? len * Math.max(0, Math.min(1, input.frontage[e.id].active)) : ACTIVE_UP.includes(f.use) ? len : 0
      }
      ;(words.get(f.level) ?? words.set(f.level, new Set()).get(f.level)!).add(f.level === 1 ? 'by street' : f.use)
    }
  }
  const rows = [...words.entries()].sort((a, b) => a[0] - b[0]).map(([level, s]) => ({ level, word: [...s].join(' and ') }))
  return { length, active, rows }
}
const runsOf = (rows: { level: number; word: string }[]) => {
  const out: string[] = []
  for (let i = 0; i < rows.length; i++) {
    let j = i
    while (j + 1 < rows.length && rows[j + 1].word === rows[i].word && rows[j + 1].level === rows[j].level + 1) j++
    out.push(`${j > i ? `L${rows[i].level}–L${rows[j].level}` : `L${rows[i].level}`} ${rows[i].word}`)
    i = j
  }
  return out.join(', ')
}

// ---------- the lines ----------
export interface SquareReading {
  square: Rect | null
  split: EdgeSplit | null
  lobby: number
  activeShare: number | null
  seen: { share: number; points: number; of: number } | null
  seenAtGrade: number | null
  desire: DesireLine[]
  regular: number
  type: string[]
}
const pct = (v: number) => `${Math.round(v * 100)}%`
const f1 = (v: number) => v.toFixed(1)
const fmt = (v: number) => Math.round(v).toLocaleString()
const SIDE_WORD: Record<EdgeId, string> = { south: 'south', west: 'west', north: 'north', east: 'east' }

/** The square's lines (competition block). Thresholds are the team's; the method rests on book pages read once. */
export function squareEdges(towers: Tower[], input: PublicRealmInput): { rules: RuleResult[]; reading: SquareReading } {
  const sq = input.square ?? {}
  const level = Number.isFinite(sq.level as number) ? (sq.level as number) : 0
  const reading: SquareReading = { square: null, split: null, lobby: 0, activeShare: null, seen: null, seenAtGrade: null, desire: [], regular: 1, type: [] }
  const rules: RuleResult[] = []
  const os = openSpace(towers, input)
  const r = os.largest
  const g = squareGrid(towers)
  const base = baseSix(towers, input)
  const baseShare = base.length > 0 ? base.active / base.length : 0
  const baseLine: RuleResult = {
    id: 'pr-base-six', label: 'Active base, L1–L6', value: base.length > 0 ? `${pct(baseShare)} of ${fmt(base.length)} m of street-facing storey length active (${runsOf(base.rows)})` : 'No storey within 3 m of a street on L1–L6',
    threshold: `≥ ${pct(BASE_ACTIVE_MIN)} (team; the source gives no number)`, state: base.length <= 0 ? 'unknown' : baseShare >= BASE_ACTIVE_MIN ? 'pass' : 'warn', flag: 'team_assumption', source: DOBSON,
    note: `The bottom six storeys along the streets, each storey's face within ${f1(STREETWALL_REACH)} m of a property line. L1 takes your active share for each street; L2–L6 count active where the storey is retail, civic or amenity (team), so hotel rooms, offices and homes above the ground do not. Several towers sharing a podium count it once each.`,
  }
  if (!r || !towers.length) {
    rules.push({ id: 'pr-square-edge', label: 'Square edges: street, building face, blank', value: 'No clear open rectangle on the site', threshold: `≥ ${pct(SQUARE_ACTIVE_MIN)} of the building face on the square active (team)`, state: 'unknown', flag: 'team_assumption', source: pm('pp.10, 50, 82') })
    if (towers.length) rules.push(baseLine)
    return { rules, reading }
  }
  const rect: Rect = { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, area: r.area }
  reading.square = rect
  const split = edgeSplit(g, rect)
  reading.split = split
  const regular = regularity(g, rect)
  reading.regular = regular
  const specialist = regular < REGULAR_MIN
    ? `The square is irregular: its largest clear rectangle is ${pct(regular)} of the open ground it sits in, so its edges, sightlines and walks need an urban designer's reading.`
    : undefined
  const sp = specialist ? { specialist } : {}

  // The face's active share: typed, else the ground storey's use (an active use at grade reads as all active; team).
  const groundUses = [...new Set(towers.map((t) => towerFloors(t).find((f) => f.level === 1)?.use).filter((u): u is UseId => !!u))]
  const typed = sq.active != null && Number.isFinite(sq.active)
  const activeOfFace = typed ? Math.max(0, Math.min(1, sq.active as number)) : groundUses.some((u) => ACTIVE_UP.includes(u) || u === 'hotel') ? 1 : 0
  const lobbySide = sq.lobby && sq.lobby.length > 0 ? sq.lobby.side : null
  const lobby = lobbySide ? Math.min(Math.max(0, sq.lobby!.length), split.sides[lobbySide].face) : 0
  reading.lobby = lobby
  const activeLen = lobby + (split.face - lobby) * activeOfFace
  const activeShare = split.face > 0 ? activeLen / split.face : null
  reading.activeShare = activeShare
  const P = (v: number) => pct(split.length > 0 ? v / split.length : 0)
  rules.push({
    id: 'pr-square-edge', label: 'Square edges: street, building face, blank',
    value: `${fmt(split.length)} m round the square: ${P(split.street)} street, ${P(split.face)} building face, ${P(split.blank)} blank${activeShare === null ? '; no building face on it' : `; ${pct(activeShare)} of the face active${lobby > 0 ? ` (${f1(lobby)} m glazed public lobby)` : ''}`}`,
    threshold: `≥ ${pct(SQUARE_ACTIVE_MIN)} of the building face on the square active, and no more blank edge than building face (team)`,
    // More blank edge than face: a square edged mostly by nothing, however active its little face (Rubin pp.17, 20).
    state: activeShare === null ? 'unknown' : activeShare >= SQUARE_ACTIVE_MIN && split.blank <= split.face ? 'pass' : 'warn', flag: 'team_assumption', source: pm('pp.10, 50, 82; Dobson p.75; ' + RUBIN), ...sp,
    note: `The edge of the largest clear rectangle (the POPS line): a building at grade within ${FACE_REACH} m is its face (an arcade's face up to ${ARCADE_REACH} m back under the floors above counts too); within ${FACE_REACH} m of the property line it opens to the street; anything else is blank (open ground running on, or overhead mass with no face under it). ${typed ? 'The face\'s active share is yours (Ground & public realm › Square).' : `No active share typed for the square: read from the ground storey's use (${groundUses.join(', ') || 'none'}), so ${activeOfFace ? 'all of it counts active' : 'none counts active'} (team); type it for a closer read.`} A glazed public lobby counts active. Plazas made by pulling back from the street wall went dead without active edges (Rubin pp.17, 20).`,
  })

  // Seen from the sidewalks, and how a sunken square loses it.
  const seen = seenFromSidewalks(g, rect, level)
  reading.seen = seen
  const off = Math.abs(level) > LEVEL_BAND
  const atGrade = off ? seenFromSidewalks(g, rect, 0).share : seen.share
  reading.seenAtGrade = atGrade
  rules.push({
    id: 'pr-square-seen', label: 'Square seen from the sidewalks',
    value: `${pct(seen.share)} of the square seen from the sidewalks at ${EYE} m (some of it from ${seen.points} of ${seen.of} sidewalk points)${off ? `; ${pct(atGrade)} if it were at grade` : ''}`,
    threshold: `≥ ${pct(SQUARE_SEEN_MIN)} of the square (team)`, state: seen.share >= SQUARE_SEEN_MIN ? 'pass' : 'warn', flag: 'team_assumption', source: pm('pp.173, 199'), ...sp,
    note: `Sight lines from points on the sidewalks round the block (2 m beyond the property line, every 2.5 m) to points on the square (about every 2 m); the storeys at grade block them, so a bridge or canopy above eye height does not. A plaza seen from the street invites people in. ${level < -LEVEL_BAND ? 'Sunken: a point counts only where the sight line clears the rim at the sidewalk.' : ''}Context buildings are not occluders here: they stand beyond the sidewalks.`,
  })

  // The desire line from the station exit.
  const desire = desireLines(g, rect, towers, input)
  reading.desire = desire
  const worst = desire.reduce((m, d) => Math.max(m, d.detour), 0)
  rules.push({
    id: 'pr-square-desire', label: 'Desire line from the station across the square',
    value: desire.length ? desire.map((d) => `${d.label}: walk ${fmt(d.walk)} m against ${fmt(d.straight)} m straight, detour ${d.detour.toFixed(2)}`).join('; ') : 'No walk found from the station corner to the square',
    threshold: `detour ≤ ${DETOUR_MAX.toFixed(2)} (team)`, state: !desire.length ? 'warn' : worst <= DETOUR_MAX + 1e-9 ? 'pass' : 'warn', flag: 'team_assumption', source: pm('pp.190, 195'), ...sp,
    note: 'From the station exit at the south-west corner (brief p.18) through the square\'s centre to the street beyond it, walked over the block and its sidewalks round what stands at grade, against the straight line; and from the far end of the mid-block link to the square. A straight path on the desire line makes the plaza both a way through and a place to stop.',
  })

  // A glazed public lobby on the square.
  rules.push({
    id: 'pr-square-lobby', label: 'Glazed public lobby on the square',
    value: lobbySide ? (lobby > 0 ? `${f1(lobby)} m on the square's ${SIDE_WORD[lobbySide]} side (${P(lobby)} of its edge)` : `Declared on the ${SIDE_WORD[lobbySide]} side, which has no building face`) : 'None declared',
    threshold: 'a floor-to-ceiling glazed lobby that runs on from the square (described; team)', state: !lobbySide ? 'unknown' : lobby > 0 ? 'pass' : 'warn', flag: 'team_assumption', source: pm('pp.192, 213–214'),
    note: 'Say which podium face on the square is a glazed public lobby (Ground & public realm › Square): it is clipped to the building face found on that side. A hotel lobby on the square counts active here, but never as the public benefit at height (see the sky room\'s community benefit line).',
  })

  // Level against the sidewalk.
  const steps = Math.max(0, Math.round(sq.stepFree ?? 0))
  const levelOk = !off || (steps >= STEP_FREE_MIN && seen.share >= SQUARE_SEEN_MIN)
  rules.push({
    id: 'pr-square-level', label: 'Square level against the sidewalk',
    value: !off ? `At grade (${level >= 0 ? '+' : '−'}${f1(Math.abs(level))} m)` : `${f1(Math.abs(level))} m ${level < 0 ? 'below' : 'above'} the sidewalk: ${steps} step-free entr${steps === 1 ? 'y' : 'ies'}, ${pct(seen.share)} seen (${pct(atGrade)} at grade)`,
    threshold: `within ±${LEVEL_BAND} m; beyond it ≥ ${STEP_FREE_MIN} step-free entries and ≥ ${pct(SQUARE_SEEN_MIN)} seen from the sidewalks (team)`,
    state: levelOk ? 'pass' : 'warn', flag: 'team_assumption', source: pm('p.172'),
    note: `A sunken plaza risks isolation and poor visibility; visual links, accessible entrances and active uses beside it are the cure. The level is yours (Ground & public realm › Square); the model's ground is flat, so the square's floor is not drawn lower.`,
  })

  // Type label from the geometry (Table 8.1).
  const sides = (Object.keys(split.sides) as EdgeId[])
  const street = sides.filter((s) => split.sides[s].length > 0 && split.sides[s].street / split.sides[s].length >= 0.5)
  const faced = sides.filter((s) => split.sides[s].length > 0 && split.sides[s].face / split.sides[s].length >= 0.5)
  const corner = (street.includes('south') || street.includes('north')) && (street.includes('west') || street.includes('east'))
  const type: string[] = []
  if (level < -LEVEL_BAND) type.push('sunken (p.172)')
  if (faced.length >= 3) type.push('courtyard (cf. Trinity Place, pp.185–186)')
  if (corner) type.push('corner (cf. 155 N Wacker, pp.189–190)')
  if (lobby > 0) type.push('flanking, beside an entrance (cf. the glazed lobby at One South Dearborn, p.192)')
  reading.type = type
  rules.push({
    id: 'pr-square-type', label: 'Square type (Table 8.1)',
    value: type.length ? type.join(' + ') : `none of the geometric types: open to the street on ${street.length ? street.map((s) => SIDE_WORD[s]).join(' and ') : 'no'} side${street.length === 1 ? '' : 's'}`,
    threshold: 'described, not judged', state: 'unknown', flag: 'unverified', source: pm('pp.171–172; Table 8.1 pp.202–204'), ...sp,
    note: `Read from the edge: building faces on three or more sides make a courtyard, streets on two meeting sides a corner, a declared glazed lobby a flanking plaza, a floor below −${LEVEL_BAND} m a sunken one. The book's other types (paved, lawn, water, community, ornamental, transformative) turn on surface and programme, which the model does not hold.${rect.area >= 4000 ? ` At ${fmt(rect.area)} m², about an acre or more, it is at the scale of the book's civic plazas (Trinity Place 1 ac, Chase 1.5 ac, Daley 2 ac; pp.173, 176, 185).` : ''}`,
  })
  rules.push(baseLine)
  return { rules, reading }
}

/** Real Vancouver: why the square's lines wait (both-sites rule). */
export function squareCityLine(): RuleResult {
  return {
    id: 'pr-square-edge', label: 'Square: seen, crossed, edged, level', value: 'Read on the competition block only for now',
    threshold: 'edges, sightlines from the sidewalks, the walk from the station exit, the level (team)', state: 'unknown', flag: 'unresolved', source: pm('pp.172–173, 190, 192, 195, 199, 213–214'),
    note: 'The sight lines need the sidewalks round the block and the desire line the station exit; the Toolkit holds neither for a Real Vancouver study site yet. The square itself (its size, shape and sun) is read on both sites under Open space & links.',
    specialist: 'Real Vancouver: the station exit and the sidewalks are not loaded, so the square\'s edges and sight lines need an urban designer\'s reading.',
  }
}

/** Active frontage with the square's lines (book node #17): the competition block. */
export function frontageWithSquare(towers: Tower[], input: PublicRealmInput): ReturnType<typeof frontageCheck> & { square: SquareReading | null } {
  const f = frontageCheck(towers, input)
  if (!towers.length) return { ...f, square: null }
  const s = squareEdges(towers, input)
  return { ...f, rules: [...f.rules, ...s.rules], square: s.reading }
}
/** Active frontage on Real Vancouver, with the line saying why the square's lines wait. */
export function cityFrontageWithSquare(towers: Tower[], ctx: CityStreetsCtx | null = null): ReturnType<typeof cityFrontageCheck> {
  const f = cityFrontageCheck(towers, ctx)
  return towers.length ? { ...f, rules: [...f.rules, squareCityLine()] } : f
}
