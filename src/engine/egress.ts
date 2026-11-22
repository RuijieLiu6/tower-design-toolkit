// Egress sizing (research P11-M06, occupancy mapping from P11-M09): occupant load per storey, exit stair width,
// stair core area, exits per floor, exit separation, travel distance and flight rise.
// Values are VBBL 2019 Part 3 (consolidated 1 Jul 2024), equal to VBBL 2007; VBBL 2025 and BCBC 2024 are unread,
// so every rule carries an edition note. Early check, not a code review: a code consultant decides.
import { coreAreaAt, coreSide, readsStoreys, towerFloors } from './massing'
import { coreCentre, storeyCore } from './storeyWeight'
import { towerTwist } from './twist'
import type { Floor, RuleResult, StairCorner, StairPlacement, Tower } from './types'
import { floorCounts } from './interior'

export interface EgressPresets {
  /** Exit stairs per floor (at least two, 3.4.2.1). */
  stairs: number
  /** Riser (m). At most 0.18 with a run of at least 0.28 keeps the 8 mm per person stair rate (3.4.3.2). */
  riser: number
  /** Tread run (m). */
  tread: number
  /** Average bedrooms per home (2 persons per sleeping room, 3.1.17.1). */
  bedroomsPerHome: number
  /** Office floors have a public corridor, so exits need be only 9 m apart (3.4.2.3). Team assumption: open plan. */
  officeCorridor: boolean
  /** m² per person on amenity, civic and tenant sky-lobby floors until a floor is programmed: 1.85, the lounge row of
   *  BCBC 2024 Table 3.1.17.1 (p.3-105; P1 #12, 21 Nov; was 4.6, the personal-services row); 1.2 if it is a dining
   *  room, 0.4 if people stand. */
  amenityFactor: number
  /**
   * The second storey's retail is entered from a pedestrian way or the transit concourse (P1 #12): its load is then
   * 3.7 m² per person, as at grade, instead of 5.6 (Allen & Iano p.305, an NBC 2010 reading). Absent or false: 5.6.
   */
  retailLinked?: boolean
}

export const DEFAULT_EGRESS_PRESETS: EgressPresets = { stairs: 2, riser: 0.18, tread: 0.28, bedroomsPerHome: 1.5, officeCorridor: false, amenityFactor: 1.85 }

/** Table 3.1.17.1 occupant load factors, m² per person (VBBL 2019 = VBBL 2007; research P11-S62, P11-S47; lounges
 *  from BCBC 2024 p.3-105). */
export const LOAD_FACTOR = { office: 9.3, personalServices: 4.6, mercantileFirst: 3.7, mercantileUpper: 5.6, dining: 1.2, standing: 0.4, publicCorridor: 3.7, lounge: 1.85 }
/** BC Building Code 2024 Table 3.1.17.1, the lounge row (P1 #12; book notes bcbc-2024.md). */
export const BCBC_LOADS = { label: 'BC Building Code 2024, Division B, Table 3.1.17.1 occupant load (lounges 1.85 m² per person); VBBL 2025 to confirm', page: 'p.3-105' }
/** Allen & Iano on the second storey's retail (an NBC 2010 base: an analogue until the BCBC 2024 row is read). */
export const ASC_RETAIL = { label: 'Allen & Iano, The Architect’s Studio Companion, 6th ed. (mercantile load on a second storey entered from a pedestrian way; NBC 2010 base)', page: 'p.305' }
export const STAIR_MIN_MM = 1100
export const TRAVEL_LIMIT_M = 45
export const FLIGHT_MAX_M = 3.7

const VBBL_EXITS = { label: 'Vancouver Building By-law 2019, Part 3, Section 3.4 Exits (same in VBBL 2007; VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/463712062' }
const VBBL_GENERAL = { label: 'Vancouver Building By-law 2019, Table 3.1.17.1 occupant loads (same in VBBL 2007; VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/519280133' }

/** Inputs shared with the lift presets: area per home and per hotel key. */
export interface LoadInputs { homeM2: number; hotelM2PerKey: number }

export interface StoreyLoad {
  level: number
  z: number
  f2f: number
  use: Floor['use']
  podium: boolean
  skyLobby: boolean
  publicRoom: boolean
  net: number
  load: number
  basis: string
  /** Width each stair needs for this storey alone (mm). */
  needMm: number
  /** Width each stair must have where it passes this storey: the largest need at or above it (mm). */
  stairMm: number
}

/**
 * Net area of a floor: its plate less the core at its own level (team assumption; the code measures the floor area
 * served). A core that steps in (`Tower.coreSteps`) leaves the upper storeys more floor, as on the sky room lines (G46).
 */
function netOf(f: Floor, t: Tower): number {
  return Math.max(0, f.area - coreAreaAt(t, f.level))
}

/**
 * Loads on a public sky room floor: the visitor room at its Table 3.1.17.1 load (`table`) or a lower posted limit
 * (`visitors`), plus the rest of the floor (lift lobby, back of house) as a public corridor.
 */
export function skyRoomLoads(t: Tower, net: number): { visitors: number; table: number; remainder: number; floor: number } {
  const r = t.skyRoom
  if (!r) { const f = net / LOAD_FACTOR.publicCorridor; return { visitors: 0, table: 0, remainder: f, floor: f } }
  const table = (net * r.visitorShare) / (r.loadBasis === 'standing' ? LOAD_FACTOR.standing : LOAD_FACTOR.dining)
  const visitors = r.postedLimit != null && r.postedLimit >= 0 ? Math.min(table, r.postedLimit) : table
  const remainder = (net * (1 - r.visitorShare)) / LOAD_FACTOR.publicCorridor
  return { visitors, table, remainder, floor: visitors + remainder }
}

/**
 * The largest posted visitor limit at which the sky room no longer widens the exit stairs: its floor then needs no
 * more than the widest of the other tower storeys (or the 1100 mm minimum). Null without a room.
 */
export function postedLimitForRoom(t: Tower, e: EgressPresets, li: LoadInputs = { homeM2: 75, hotelM2PerKey: 40 }): { limit: number; widthMm: number } | null {
  if (!t.skyRoom) return null
  const f = towerFloors(t).find((x) => x.skyLobby && x.level === t.skyRoom!.level)
  if (!f) return null
  const rate = e.riser <= 0.18 && e.tread >= 0.28 ? 8 : 9.2
  const n = Math.max(2, Math.round(e.stairs))
  const others = storeyLoads(t, e, li).filter((s) => !s.podium && s.z > 0.5 && s.level !== f.level)
  const widthMm = Math.max(STAIR_MIN_MM, ...others.map((s) => s.needMm))
  return { limit: Math.max(0, Math.floor((widthMm * n) / rate - skyRoomLoads(t, netOf(f, t)).remainder)), widthMm }
}

export interface StairSpot { x: number; y: number; inCore: boolean }

/** Signs of each plate corner in the tower's own frame (e = +x, n = +y). */
export const CORNER_SIGN: Record<StairCorner, readonly [number, number]> = { ne: [1, 1], nw: [-1, 1], se: [1, -1], sw: [-1, -1] }

/**
 * The plate corner whose direction from the tower centre is nearest a true compass bearing (° clockwise from true
 * north), for a project whose true north lies `northDeg` clockwise from the frame's +y (the Sun & Wind convention).
 */
export function cornerToward(t: Pick<Tower, 'width' | 'depth' | 'rotation'>, bearing: number, northDeg: number): StairCorner {
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const off = (k: StairCorner) => {
    const [i, j] = CORNER_SIGN[k], u = (i * t.width) / 2, v = (j * t.depth) / 2
    const az = (Math.atan2(u * c - v * s, u * s + v * c) * 180) / Math.PI - northDeg
    return Math.abs(((((az - bearing) % 360) + 540) % 360) - 180)
  }
  return (Object.keys(CORNER_SIGN) as StairCorner[]).reduce((m, k) => (off(k) < off(m) ? k : m))
}

/** Centres of the exit stairs on the plate (team assumption on geometry), for enclosures a × b. */
export function stairSpots(t: Tower, n: number, a: number, b: number, placement: StairPlacement = t.stairPlacement ?? 'core', corner: StairCorner = t.stairCorner ?? 'sw'): StairSpot[] {
  // In the core, stairs sit against the inner face of its 400 mm walls (team assumption, as drawn on the board plan).
  const c = Math.max(0, coreSide(t) - 0.8)
  const inCore = (i: number, j: number): StairSpot => ({ x: i * Math.max(0, c / 2 - a / 2), y: j * Math.max(0, c / 2 - b / 2), inCore: true })
  const atEdge = (i: number, j: number): StairSpot => ({ x: i * Math.max(0, t.width / 2 - a / 2), y: j * Math.max(0, t.depth / 2 - b / 2), inCore: false })
  // The order mirrored so the second spot (the edge stair of 'mixed') takes the chosen corner and the first the
  // opposite one; 'sw' is the order as before. Stairs all in the core keep it.
  const [ci, cj] = placement === 'core' ? CORNER_SIGN.sw : CORNER_SIGN[corner]
  const order = ([[1, 1], [-1, -1], [1, -1], [-1, 1]] as const).map(([i, j]) => [-ci * i, -cj * j] as const)
  const k = Math.min(4, Math.max(2, n))
  // An edge stair placed by hand (G31) takes the chosen corner's spot.
  const at = stairAtOf(t)
  const edge = (i: number, j: number, m: number): StairSpot => (m === 1 && at ? { x: at[0], y: at[1], inCore: false } : atEdge(i, j))
  if (placement === 'perimeter') return order.slice(0, k).map(([i, j], m) => edge(i, j, m))
  if (placement === 'mixed') return order.slice(0, k).map(([i, j], m) => (m === 1 ? edge(i, j, m) : inCore(i, j)))
  return order.slice(0, k).map(([i, j]) => inCore(i, j))
}

/** The edge stair's centre placed by hand (tower frame, m), when it is two finite numbers. */
const stairAtOf = (t: Tower): [number, number] | null => (t.stairAt?.length === 2 && t.stairAt.every(Number.isFinite) ? [t.stairAt[0], t.stairAt[1]] : null)

type P = [number, number]

/**
 * The podium storeys' true outlines (tower frame, m) of an imported tower read storey by storey (T10, gap G22): every
 * podium storey above grade (the ground storey exits through its street doors), or the podium storeys at grade when the
 * podium has no other. Null for a parametric or drawn tower and an import without storey outlines: those keep the
 * podium rectangle (podiumWidth × podiumDepth about the tower centre).
 */
export function podiumOutlines(t: Tower): { level: number; z0: number; loops: P[][] }[] | null {
  if (!(t.podiumHeight > 0) || !readsStoreys(t)) return null
  const pod = (t.imported?.storeys ?? []).filter((s) => s.podium && s.hasFloor && s.loops?.some((r) => r.length >= 3))
  if (!pod.length) return null
  const upper = pod.filter((s) => s.z0 > 0.5)
  return (upper.length ? upper : pod).map((s) => ({ level: s.level, z0: s.z0, loops: s.loops.filter((r) => r.length >= 3) as P[][] }))
}

const ringArea = (r: P[]) => r.reduce((a, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x * y2 - x2 * y }, 0) / 2

/** `n` points spread evenly round a closed ring, the first half a spacing from its first corner. */
function spreadRound(ring: P[], n: number): { x: number; y: number }[] {
  const L = ring.map((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) })
  const total = L.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return []
  return Array.from({ length: n }, (_, k) => {
    let s = ((k + 0.5) * total) / n, i = 0
    while (i < L.length - 1 && s > L[i]) { s -= L[i]; i++ }
    const a = ring[i], b = ring[(i + 1) % ring.length], f = L[i] > 0 ? s / L[i] : 0
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f }
  })
}

/**
 * Podium exits in the tower's own frame: the positions given, else `count` spread evenly round the podium edge: the
 * podium rectangle (podiumWidth × podiumDepth about the tower centre), counter-clockwise from the (−x, −y) corner, the
 * first half a spacing along; for an imported tower read storey by storey, the outer ring of its largest podium outline
 * (G22). Empty without a podium or without exits.
 */
export function podiumExitSpots(t: Tower): { x: number; y: number }[] {
  const e = t.podiumExits
  if (!e || !(t.podiumHeight > 0)) return []
  if (e.at?.length) return e.at.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([x, y]) => ({ x, y }))
  const n = Math.max(0, Math.round(e.count ?? 0)), W = t.podiumWidth, D = t.podiumDepth, P = 2 * (W + D)
  const outlines = n ? podiumOutlines(t) : null
  if (outlines) {
    const ring = outlines.flatMap((o) => o.loops).reduce<P[] | null>((m, r) => (!m || Math.abs(ringArea(r)) > Math.abs(ringArea(m)) ? r : m), null)
    if (ring) return spreadRound(ring, n)
  }
  if (!n || !(P > 0)) return []
  const at = (s: number) => {
    s = ((s % P) + P) % P
    if (s < W) return { x: -W / 2 + s, y: -D / 2 }
    if (s < W + D) return { x: W / 2, y: -D / 2 + (s - W) }
    if (s < 2 * W + D) return { x: W / 2 - (s - W - D), y: D / 2 }
    return { x: -W / 2, y: D / 2 - (s - 2 * W - D) }
  }
  return Array.from({ length: n }, (_, k) => at(((k + 0.5) * P) / n))
}

/** Nonzero winding number of a point in a storey's loops (outer rings counter-clockwise, holes clockwise; parts that overlap stay covered). */
function winding(p: P, loops: P[][]): number {
  let w = 0
  for (const r of loops) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    if (a[1] <= p[1]) { if (b[1] > p[1] && c > 0) w++ } else if (b[1] <= p[1] && c < 0) w--
  }
  return w
}

/**
 * The point of a storey's true outline farthest from every exit, straight line: its corners and edges (holes' too) and
 * a grid of points inside it (about 120 across, or `across`), so an open gap between its parts is never counted as floor (G22).
 */
export function farthestOnOutline(loops: P[][], exits: { x: number; y: number }[], across = 120): { x: number; y: number; d: number } {
  let best = { x: 0, y: 0, d: -1 }
  const test = (x: number, y: number) => {
    let d = Infinity
    for (const s of exits) d = Math.min(d, Math.hypot(x - s.x, y - s.y))
    if (d > best.d) best = { x, y, d }
  }
  const pts = loops.flat()
  if (!pts.length) return best
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const step = Math.max(0.25, Math.max(x1 - x0, y1 - y0) / across)
  for (const r of loops) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 0; k < n; k++) test(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)
  }
  for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) if (winding([x, y], loops) !== 0) test(x, y)
  return best
}

/** The point of a W × D plate (about the origin) farthest from every exit, sampled 80 × 80, straight line. */
function farthestPoint(W: number, D: number, exits: { x: number; y: number }[]): { x: number; y: number; d: number } {
  const n = 80
  let best = { x: 0, y: 0, d: -1 }
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = -W / 2 + (W * i) / n, y = -D / 2 + (D * j) / n
    let d = Infinity
    for (const s of exits) d = Math.min(d, Math.hypot(x - s.x, y - s.y))
    if (d > best.d) best = { x, y, d }
  }
  return best
}

// --- The edge stair of a twisted tower (tool gap G31, life-safety review R3-12) ----------------------------------------
// The edge stair sat at the plate corner of the tower's rectangle. A twisted plate's corner turns with it (B23b: 1° and
// 0.57 m a storey), so that stair's centre left the façade from L12 up, while a stair shaft is straight. For an imported
// tower read storey by storey that twists STAIR_TWIST_MIN or more, each edge stair is now placed where a straight shaft
// fits every tower storey: inside every storey's outline shrunk by half the enclosure's width (its short side, the
// flights along the façade; team assumption), toward its corner, as far as it goes from the core stair ('mixed') or the
// core centre ('perimeter'). Separation and tower travel are measured from it, travel on each storey's true outline.
// An edge stair placed by hand (Tower.stairAt) is checked the same way. Podium storeys are not read: the podium plate
// is taken to hold the shaft on its way down.

/** Smallest twist (deg) from which an imported tower's edge stair is placed as a straight shaft (team: under it the
 *  corner of a 60 m plate moves about 1 m, a third of the enclosure). */
export const STAIR_TWIST_MIN = 2

/** The tower storeys' true outlines (tower frame, m) of an imported tower read storey by storey: every tower storey
 *  above grade with a floor. Null for a parametric or drawn tower and an import without storey outlines. */
export function towerOutlines(t: Tower): { level: number; z0: number; loops: P[][] }[] | null {
  if (!readsStoreys(t)) return null
  const st = (t.imported?.storeys ?? []).filter((s) => !s.podium && s.hasFloor && s.z0 > 0.5 && s.loops?.some((r) => r.length >= 3))
  return st.length ? st.map((s) => ({ level: s.level, z0: s.z0, loops: s.loops.filter((r) => r.length >= 3) as P[][] })) : null
}

/** A point lies inside a storey's loops at least r from every edge. */
function insideBy(x: number, y: number, loops: P[][], r: number): boolean {
  if (winding([x, y], loops) === 0) return false
  for (const ring of loops) for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0
    if (Math.hypot(x - ax - u * dx, y - ay - u * dy) < r) return false
  }
  return true
}

/**
 * The best straight position for an edge stair (G31): inside every storey's loops at least r from its edges, within 45°
 * of `dir` seen from `origin`, farthest from `from`. A grid of about 100 across the storeys' common box, the farthest
 * candidates tried first, then refined to a fifth of a step. Null when no point fits every storey.
 */
export function straightStairSpot(storeys: P[][][], r: number, from: { x: number; y: number }, origin: { x: number; y: number }, dir: [number, number]): { x: number; y: number } | null {
  const seen = new Set<string>(), outs: P[][][] = []
  for (const loops of storeys) { const k = JSON.stringify(loops.map((q) => q.map((p) => [Math.round(p[0] * 100), Math.round(p[1] * 100)]))); if (!seen.has(k)) { seen.add(k); outs.push(loops) } }
  if (!outs.length) return null
  let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity
  for (const loops of outs) {
    const pts = loops.flat()
    x0 = Math.max(x0, Math.min(...pts.map((p) => p[0])) + r); x1 = Math.min(x1, Math.max(...pts.map((p) => p[0])) - r)
    y0 = Math.max(y0, Math.min(...pts.map((p) => p[1])) + r); y1 = Math.min(y1, Math.max(...pts.map((p) => p[1])) - r)
  }
  if (!(x1 >= x0 && y1 >= y0)) return null
  const L = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / L, uy = dir[1] / L
  const toward = (x: number, y: number) => { const vx = x - origin.x, vy = y - origin.y, d = Math.hypot(vx, vy); return d > 1e-9 && (vx * ux + vy * uy) / d >= Math.SQRT1_2 - 1e-9 }
  let killer = 0
  const fits = (x: number, y: number) => {
    if (!insideBy(x, y, outs[killer], r)) return false
    for (let k = 0; k < outs.length; k++) if (k !== killer && !insideBy(x, y, outs[k], r)) { killer = k; return false }
    return true
  }
  const step = Math.max(0.2, Math.max(x1 - x0, y1 - y0) / 100)
  const cands: { x: number; y: number; d: number }[] = []
  for (let x = x0; x <= x1 + 1e-9; x += step) for (let y = y0; y <= y1 + 1e-9; y += step) if (toward(x, y)) cands.push({ x, y, d: Math.hypot(x - from.x, y - from.y) })
  cands.sort((a, b) => b.d - a.d)
  for (const c of cands) {
    if (!fits(c.x, c.y)) continue
    let best = c
    const f = step / 5
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
      const x = c.x + i * f, y = c.y + j * f, d = Math.hypot(x - from.x, y - from.y)
      if (d > best.d && toward(x, y) && fits(x, y)) best = { x, y, d }
    }
    return { x: best.x, y: best.y }
  }
  return null
}

/** How the edge stairs of a twisted imported tower were placed (G31). */
export interface StraightStairs {
  /** The tower's twist (deg) and the tower storey levels read. */
  twist: number
  levels: number[]
  /** Half the enclosure's width kept from every façade (m). */
  clear: number
  /** Every stair's centre (tower frame, m): core stairs at the core centre, edge stairs where they were placed. */
  stairs: { x: number; y: number }[]
  /** Each edge stair: its corner, how it was placed, where, and the storeys the corner (or hand-placed) position leaves. */
  edge: { corner: StairCorner; how: 'placed' | 'found' | 'none'; x: number; y: number; outside: number[] }[]
}

const cornerOfSign = (x: number, y: number): StairCorner => (y >= 0 ? (x >= 0 ? 'ne' : 'nw') : (x >= 0 ? 'se' : 'sw'))
const levelRuns = (lv: number[]) => {
  const out: string[] = []
  for (let i = 0; i < lv.length; i++) { let j = i; while (j + 1 < lv.length && lv[j + 1] === lv[j] + 1) j++; out.push(j > i ? `L${lv[i]}–L${lv[j]}` : `L${lv[i]}`); i = j }
  return out.join(', ')
}

/**
 * The edge stairs of an imported tower read storey by storey, as straight shafts (G31): when it twists STAIR_TWIST_MIN
 * or more, or an edge stair is placed by hand. Null otherwise (the stairs stay at the corners of the tower's
 * rectangle, as before) and with both stairs in the core.
 */
export function straightStairs(t: Tower, spots: StairSpot[], a: number, placement: StairPlacement): StraightStairs | null {
  if (placement === 'core' || !spots.some((s) => !s.inCore)) return null
  const outs = towerOutlines(t)
  if (!outs) return null
  const twist = towerTwist(t).deg, at = stairAtOf(t)
  if (!at && twist < STAIR_TWIST_MIN) return null
  const base = coreCentre(t), r = a / 2
  const stairs = spots.map((s) => (s.inCore ? { x: s.x + base.x, y: s.y + base.y } : { x: s.x, y: s.y }))
  const coreStair = spots.findIndex((s) => s.inCore)
  const from = placement === 'mixed' && coreStair >= 0 ? stairs[coreStair] : { x: base.x, y: base.y }
  const edge: StraightStairs['edge'] = []
  spots.forEach((s, m) => {
    if (s.inCore) return
    const handed = m === 1 && !!at
    // the corner of the tower's rectangle this stair stands for (a hand-placed stair: the chosen corner)
    const [i, j] = handed ? CORNER_SIGN[t.stairCorner ?? 'sw'] : [Math.sign(s.x) || 1, Math.sign(s.y) || 1]
    const corner = cornerOfSign(i, j)
    const outside = outs.filter((o) => !insideBy(s.x, s.y, o.loops, r)).map((o) => o.level)
    if (handed) { edge.push({ corner, how: 'placed', x: s.x, y: s.y, outside }); return }
    const p = straightStairSpot(outs.map((o) => o.loops), r, from, base, [i * t.width, j * t.depth])
    if (p) { stairs[m] = p; edge.push({ corner, how: 'found', x: p.x, y: p.y, outside }) }
    else edge.push({ corner, how: 'none', x: s.x, y: s.y, outside })
  })
  return { twist, levels: outs.map((o) => o.level), clear: r, stairs, edge }
}

export const PLACEMENT_LABEL: Record<StairPlacement, string> = {
  core: 'both in the core',
  mixed: 'one in the core, one at the far plate corner',
  perimeter: 'at opposite plate corners',
}

/** Occupant load per storey and the stair width each storey needs (3.1.17.1, 3.4.3.2). */
export function storeyLoads(t: Tower, e: EgressPresets, li: LoadInputs): StoreyLoad[] {
  const rate = e.riser <= 0.18 && e.tread >= 0.28 ? 8 : 9.2
  const n = Math.max(2, Math.round(e.stairs))
  const floors = towerFloors(t)
  // The second storey: the lowest storey above grade (P1 #12, linked retail).
  const second = floors.filter((f) => f.z0 >= 0.5).reduce<number | null>((m, f) => (m === null || f.level < m ? f.level : m), null)
  const out: StoreyLoad[] = floors.map((f) => {
    const net = netOf(f, t)
    const publicRoom = !!(f.skyLobby && t.skyRoom && t.skyRoom.level === f.level)
    const c = floorCounts(t, f)
    let load = 0, basis = ''
    if (publicRoom) {
      const r = t.skyRoom!, l = skyRoomLoads(t, net)
      load = l.floor
      basis = r.postedLimit != null && l.visitors < l.table
        ? `public sky room, posted limit ${Math.round(l.visitors)} visitors (Table load ${Math.round(l.table)})`
        : `public sky room, ${r.loadBasis} ${r.loadBasis === 'standing' ? LOAD_FACTOR.standing : LOAD_FACTOR.dining} m²/person on ${Math.round(r.visitorShare * 100)}% of the floor`
    }
    else if (f.skyLobby && c?.publicEgress !== undefined) { load = c.publicEgress; basis = 'sky lobby activities (interior programme)' }
    else if (f.skyLobby) { const k = Math.max(0.3, e.amenityFactor); load = net / k; basis = `sky lobby as amenity, ${k} m²/person` }
    else if (f.use === 'office') { load = net / LOAD_FACTOR.office; basis = 'office, 9.3 m²/person' }
    else if (f.use === 'retail') {
      const linked = !!e.retailLinked && f.z0 >= 0.5 && f.level === second
      const k = f.z0 < 0.5 || linked ? LOAD_FACTOR.mercantileFirst : LOAD_FACTOR.mercantileUpper
      load = net / k; basis = `mercantile${linked ? ' on the second storey entered from a pedestrian way' : ''}, ${k} m²/person`
    }
    else if (f.use === 'residential' && c?.bedrooms !== undefined) { load = c.bedrooms * 2; basis = `${c.homes} homes, ${c.bedrooms} bedrooms × 2 persons (interior layout)` }
    else if (f.use === 'residential') { load = (net / li.homeM2) * e.bedroomsPerHome * 2; basis = `homes × ${e.bedroomsPerHome} bedrooms × 2 persons` }
    else if (f.use === 'hotel' && c?.keys !== undefined) { load = c.keys * 2; basis = `${c.keys} hotel keys × 2 persons (interior layout)` }
    else if (f.use === 'hotel') { load = (net / li.hotelM2PerKey) * 2; basis = 'hotel keys × 2 persons' }
    else if (f.use === 'amenity' && c?.publicEgress !== undefined) { load = c.publicEgress; basis = 'amenity activities (interior programme)' }
    else if (f.use === 'amenity' || f.use === 'civic') { const k = Math.max(0.3, e.amenityFactor); load = net / k; basis = `${f.use === 'civic' ? 'civic' : 'amenity'}, ${k} m²/person` }
    else { load = 0; basis = 'plant (service space)' }
    const needMm = Math.max(STAIR_MIN_MM, (load * rate) / n)
    return { level: f.level, z: f.z0, f2f: f.z1 - f.z0, use: f.use, podium: f.podium, skyLobby: !!f.skyLobby, publicRoom, net, load, basis, needMm, stairMm: needMm }
  })
  // Width need not accumulate for floors one above the other (3.4.3.2.(4)), but a stair must be wide enough
  // for every storey it serves, so below a heavily loaded floor it keeps that floor's width down to grade.
  // The core stairs serve the tower floors; podium floors get exits of their own (team assumption, see the podium rules).
  let run = STAIR_MIN_MM
  for (let i = out.length - 1; i >= 0; i--) { if (!out[i].podium) run = Math.max(run, out[i].needMm); out[i].stairMm = run }
  return out
}

/** Plan of one switchback stair enclosure (m): two flights per storey, landings as deep as the stair is wide (team assumption). */
export function stairEnclosure(widthMm: number, f2f: number, e: EgressPresets): { a: number; b: number; area: number; flightRise: number } {
  const w = widthMm / 1000
  const risers = Math.ceil(f2f / Math.max(0.1, e.riser) - 1e-9)
  const perFlight = Math.ceil(risers / 2)
  const run = Math.max(0, perFlight - 1) * e.tread
  const a = 2 * w + 0.1, b = run + 2 * w
  return { a, b, area: a * b, flightRise: (perFlight * f2f) / risers }
}

/** Stair area at each level, split into stairs inside the core and stairs at the plate edge (used by the core & lift check). */
export function stairAreaByLevel(t: Tower, e: EgressPresets, li: LoadInputs): { core: Map<number, number>; edge: Map<number, number> } {
  const n = Math.max(2, Math.round(e.stairs))
  const spots = stairSpots(t, n, 1, 1)
  const inCore = spots.filter((s) => s.inCore).length, atEdge = spots.length - inCore
  const core = new Map<number, number>(), edge = new Map<number, number>()
  for (const s of storeyLoads(t, e, li)) {
    const area = stairEnclosure(s.stairMm, s.f2f, e).area
    core.set(s.level, inCore * area)
    edge.set(s.level, atEdge * area)
  }
  return { core, edge }
}

export interface EgressResult {
  storeys: StoreyLoad[]
  stairs: number
  placement: StairPlacement
  /** Stair centres on the typical tower plate, at the governing width. */
  spots: StairSpot[]
  /** The plate corner farthest from any stair, for the plan diagram. */
  farCorner: [number, number]
  governing: StoreyLoad | null
  widthMm: number
  enclosure: { a: number; b: number; area: number }
  separation: number
  separationNeeded: number
  travel: number
  podiumTravel: number | null
  /** The podium's own exits (tower frame), and the podium point farthest from any exit when there are some (an imported tower read on its true podium outlines: always). */
  podiumExits: { x: number; y: number }[]
  podiumFar: [number, number] | null
  /**
   * An imported tower read storey by storey (G22): the podium storey levels read on their true outlines, the storey with
   * the farthest point, the core stairs there (tower frame) and how the core was placed. Null: the podium rectangle.
   */
  podiumOutline: { levels: number[]; level: number; stairs: { x: number; y: number }[]; core: string } | null
  /** A twisted imported tower (or an edge stair placed by hand on one read storey by storey): how its edge stairs were
   *  placed as straight shafts (G31); `spots` are then every stair's centre in the tower frame. Null: the corners. */
  straightStairs: StraightStairs | null
  rules: RuleResult[]
}

const fmt = (v: number) => Math.round(v).toLocaleString()

export function egressCheck(t: Tower, e: EgressPresets = DEFAULT_EGRESS_PRESETS, li: LoadInputs = { homeM2: 75, hotelM2PerKey: 40 }): EgressResult {
  const storeys = storeyLoads(t, e, li)
  const n = Math.max(2, Math.round(e.stairs))
  const above = storeys.filter((s) => s.z > 0.5)
  const towerAbove = above.filter((s) => !s.podium)
  const governing = towerAbove.reduce<StoreyLoad | null>((m, s) => (!m || s.needMm > m.needMm ? s : m), null)
  // Upper podium floors exit by stairs; the ground floor exits through street doors.
  const podiumBusiest = storeys.filter((s) => s.podium && s.z > 0.5).reduce<StoreyLoad | null>((m, s) => (!m || s.load > m.load ? s : m), null)
  const widthMm = governing?.stairMm ?? STAIR_MIN_MM
  const typical = storeys.find((s) => !s.podium && s.z > 0.5) ?? storeys[0]
  const enclosure = stairEnclosure(widthMm, typical?.f2f ?? t.f2f, e)
  const narrow = stairEnclosure(STAIR_MIN_MM, typical?.f2f ?? t.f2f, e)

  // Geometry (team assumption): stairs at the chosen spots on a plate with a square core centred on it.
  const c = coreSide(t)
  const placement = t.stairPlacement ?? 'core'
  const corner = stairSpots(t, n, enclosure.a, enclosure.b, placement)
  // G31: a twisted imported tower's edge stairs as straight shafts inside every tower storey
  const straight = straightStairs(t, corner, enclosure.a, placement)
  const spots = straight ? corner.map((s, m) => ({ ...s, ...straight.stairs[m] })) : corner
  let separation = 0
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) separation = Math.max(separation, Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y))
  const halfDiag = Math.hypot(t.width, t.depth) / 2
  const openUses = above.filter((s) => !s.podium && (s.use === 'office' ? !e.officeCorridor : s.use !== 'residential' && s.use !== 'hotel' && s.use !== 'mechanical'))
  const separationNeeded = openUses.length ? halfDiag : Math.min(halfDiag, 9)
  // Travel: farthest plate corner to the nearest stair, straight line (a proxy; the research method is a visibility graph).
  const corners = (W: number, D: number) => ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([i, j]) => {
    const x = (i * W) / 2, y = (j * D) / 2
    return { x, y, d: Math.min(...spots.map((s) => Math.hypot(x - s.x, y - s.y))) }
  })
  const towerCorners = corners(t.width, t.depth)
  let far: { x: number; y: number; d: number; level?: number } = towerCorners.reduce((m, k) => (k.d > m.d ? k : m))
  if (straight) {
    // each tower storey on its true outline, its core stairs at that storey's core and the edge stairs where they stand
    const base = coreCentre(t), coreAt = storeyCore(t, base)
    far = towerOutlines(t)!.map((o) => {
      const c = coreAt(o.level)
      const exits = spots.map((s, m) => (s.inCore ? { x: corner[m].x + c.x, y: corner[m].y + c.y } : { x: s.x, y: s.y }))
      // 40 across (about a metre on a tower plate): with two stairs the farthest point lies on the outline, sampled as finely
      return { ...farthestOnOutline(o.loops, exits, 40), level: o.level }
    }).reduce((m, x) => (x.d > m.d ? x : m))
  }
  const travel = far.d
  // Podium travel: to the core stairs from the podium's corners; with podium exits, from the podium point farthest from
  // any of them or the core stairs (the corners are then no longer always the farthest).
  const podiumExits = podiumExitSpots(t)
  // An imported tower read storey by storey (G22): each upper podium storey's true outline, from its farthest point to
  // the core stairs placed at that storey's core (the core placed by hand or read from the model, core steps applied)
  // or a podium exit. Otherwise the podium rectangle about the tower centre, as before.
  const outlines = podiumOutlines(t)
  let podFar: { x: number; y: number; d: number } | null = null
  let podiumOutline: EgressResult['podiumOutline'] = null
  if (outlines) {
    const base = coreCentre(t), coreAt = storeyCore(t, base)
    // edge stairs placed as straight shafts (G31) stand where they were placed; every other stair moves with the core
    const stairsAt = (level: number) => { const c = coreAt(level); return spots.map((s, m) => (straight && !s.inCore ? { x: s.x, y: s.y } : { x: corner[m].x + c.x, y: corner[m].y + c.y })) }
    const far = outlines.map((o) => ({ ...farthestOnOutline(o.loops, [...stairsAt(o.level), ...podiumExits]), level: o.level })).reduce((m, x) => (x.d > m.d ? x : m))
    podFar = far
    podiumOutline = { levels: outlines.map((o) => o.level), level: far.level, stairs: stairsAt(far.level), core: base.how }
  } else if (t.podiumHeight > 0 && podiumExits.length) podFar = farthestPoint(t.podiumWidth, t.podiumDepth, [...spots, ...podiumExits])
  const podiumTravel = t.podiumHeight > 0 ? (podFar ? podFar.d : Math.max(...corners(t.podiumWidth, t.podiumDepth).map((k) => k.d))) : null
  const edgeSpots = spots.filter((s) => !s.inCore).length
  const maxFlight = Math.max(...storeys.map((s) => stairEnclosure(s.stairMm, s.f2f, e).flightRise))
  const rate = e.riser <= 0.18 && e.tread >= 0.28 ? 8 : 9.2

  const rules: RuleResult[] = []
  rules.push({
    id: `stair-width-${t.id}`,
    label: 'Exit stair width',
    value: `${n} stairs × ${fmt(widthMm)} mm, ${PLACEMENT_LABEL[placement]}${governing ? `; set by level ${governing.level} (${fmt(governing.load)} people)` : ''}`,
    threshold: `≥ ${STAIR_MIN_MM} mm and ≥ ${rate} mm per person ÷ ${n} stairs, storey by storey`,
    state: 'pass',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.3.2 and Table 3.4.3.2.-A' },
    note: `Sized to the busiest storey; width does not accumulate down the tower (3.4.3.2.(4)), but each stair keeps the widest need of the storeys it serves. ${rate === 8 ? 'Risers ≤ 180 mm and treads ≥ 280 mm keep the 8 mm rate.' : 'Steeper stairs use 9.2 mm per person.'} Whether width accumulates in VBBL 2025 is unresolved.`,
  })
  if (governing && governing.needMm > STAIR_MIN_MM + 1) {
    const below = above.filter((s) => s.z < governing.z && !s.podium).length
    const extra = n * (stairEnclosure(governing.needMm, typical.f2f, e).area - narrow.area)
    rules.push({
      id: `stair-driver-${t.id}`,
      label: 'One floor sets the stair width',
      value: `Level ${governing.level} (${governing.basis.split(',')[0]}) needs ${fmt(governing.needMm)} mm stairs from there down`,
      threshold: `${STAIR_MIN_MM} mm everywhere else`,
      state: 'warn',
      flag: 'team_assumption',
      source: { label: 'Team design flag on the 3.4.3.2 sizing (not a code limit)' },
      note: `${fmt(governing.load)} people (${governing.basis}). Wider stairs add about ${fmt(extra)} m² of core on each of the ${below} tower floors below. Options: post a lower occupant load, add a third stair, or an alternative solution with phased evacuation (fire engineer).`,
    })
  }
  rules.push({
    id: `exits-${t.id}`,
    label: 'Exits per floor',
    value: `${n} exit stairs`,
    threshold: 'at least 2 (3.4.2.1)',
    state: n >= 2 ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.2.1' },
  })
  rules.push({
    id: `separation-${t.id}`,
    label: 'Exit separation',
    value: `${separation.toFixed(1)} m between the stairs`,
    threshold: `≥ ${separationNeeded.toFixed(1)} m (half the plate diagonal${openUses.length ? '' : '; 9 m cap with public corridors'})`,
    state: separation >= separationNeeded - 0.05 ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.2.3' },
    note: `Stairs ${PLACEMENT_LABEL[placement]}${placement === 'core' ? ` of a ${c.toFixed(1)} m core` : ''}${placement !== 'core' && t.stairCorner ? ` (the ${t.stairCorner.toUpperCase()} corner in the tower's frame)` : ''} (team assumption on geometry). ${openUses.length ? `Open-plan floors (${[...new Set(openUses.map((s) => s.use))].join(', ')}) need half the ${(2 * halfDiag).toFixed(1)} m diagonal; floors with a public corridor need only 9 m. ` : ''}${placement === 'core' ? 'A central core often fails this on open floors: move a stair to the plate edge, split or widen the core, or show a public corridor.' : `${edgeSpots} stair${edgeSpots > 1 ? 's' : ''} at the plate edge take about ${fmt(edgeSpots * enclosure.area)} m² of lettable floor and ${(edgeSpots * (enclosure.a + enclosure.b)).toFixed(0)} m of facade per floor.`}`,
  })
  if (straight) {
    const e1 = straight.edge.find((e) => e.how !== 'found') ?? straight.edge[0]
    const lv = straight.levels.length > 1 ? `L${straight.levels[0]}–L${straight.levels[straight.levels.length - 1]}` : `L${straight.levels[0]}`
    const tw = straight.twist >= STAIR_TWIST_MIN ? `The tower twists ${straight.twist.toFixed(0)}°, so its plate corners turn with it. ` : ''
    const value = e1.how === 'found'
      ? straight.edge.map((e) => `${e.corner.toUpperCase()} stair at (${e.x.toFixed(1)}, ${e.y.toFixed(1)}) m`).join('; ') + `, a straight shaft inside every tower storey (${lv})`
      : e1.how === 'placed'
        ? `Placed at (${e1.x.toFixed(1)}, ${e1.y.toFixed(1)}) m${e1.outside.length ? `: outside the plate (or within ${straight.clear.toFixed(1)} m of the façade) at ${levelRuns(e1.outside)}` : `, inside every tower storey (${lv})`}`
        : `No straight position toward the ${e1.corner.toUpperCase()} corner lies inside every tower storey (${lv})`
    const ok = straight.edge.every((e) => e.how === 'found' || (e.how === 'placed' && !e.outside.length))
    const cornerLeaves = straight.edge.filter((e) => e.how !== 'placed' && e.outside.length)
    rules.push({
      id: `stair-straight-${t.id}`,
      label: 'Edge stair, straight shaft',
      value,
      threshold: `the stair enclosure inside every tower storey's plate (its centre ${straight.clear.toFixed(1)} m or more from the façade)`,
      state: ok ? 'pass' : 'warn',
      flag: 'team_assumption',
      source: { label: 'Team geometry check on the stair placement (not a code clause)' },
      note: `${tw}${cornerLeaves.length ? `A stair at the ${cornerLeaves.map((e) => e.corner.toUpperCase()).join(' and ')} corner of the tower's rectangle would leave the plate at ${levelRuns(cornerLeaves[0].outside)}. ` : ''}${e1.how === 'found' ? `Placed inside every storey's outline shrunk by half the enclosure's width (${straight.clear.toFixed(1)} m), toward its corner and as far as it goes from the ${placement === 'mixed' ? 'core stair' : 'core centre'}; exit separation and tower travel are measured from it. Set the tower's stairAt to place it by hand.` : e1.how === 'placed' ? (e1.outside.length ? 'A straight shaft there leaves the plate on those storeys: move it inward (toward the core) or let the stair drift as an alternative solution (fire engineer).' : 'Exit separation and tower travel are measured from it.') : 'Separation and travel keep the corner position, which the plate leaves: place the stair by hand (stairAt) nearer the core, put both stairs in the core, or let it drift as an alternative solution (fire engineer).'} The shaft takes lettable floor inside the plate (judgement).`,
    })
  }
  rules.push({
    id: `travel-${t.id}`,
    label: 'Travel distance, tower floors',
    value: straight && far.level != null ? `${travel.toFixed(1)} m from the farthest point of L${far.level}` : `${travel.toFixed(1)} m from the farthest corner`,
    threshold: `≤ ${TRAVEL_LIMIT_M} m, sprinklered (3.4.2.5.(1)(c))`,
    state: travel <= TRAVEL_LIMIT_M ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.2.5' },
    note: `Straight-line distance to the nearer stair, a proxy (unverified method): the real path bends around the core and furniture.${straight ? ' Read on every tower storey\'s true outline, from the stairs as placed for a straight shaft (G31).' : ''} Every new building is sprinklered (3.2.2.18.(3)).`,
  })
  if (podiumBusiest) {
    const width = podiumBusiest.load * rate
    rules.push({
      id: `podium-exits-${t.id}`,
      label: 'Podium exits',
      value: `Level ${podiumBusiest.level}: ${fmt(podiumBusiest.load)} people need about ${(width / 1000).toFixed(1)} m of exit stair width`,
      threshold: `${rate} mm per person, at least 2 exits, none counted for more than half`,
      state: 'warn',
      flag: 'verified',
      source: { ...VBBL_EXITS, page: '3.4.3.2' },
      note: `${podiumBusiest.basis}. The tower core stairs are sized for the tower floors only (team assumption), so the podium needs exits of its own: ${podiumExits.length ? `${podiumExits.length} entered, about ${Math.ceil(width / Math.max(2, podiumExits.length) / 100) / 10} m each (their widths are not modelled: check them, and that none counts for more than half)` : `about ${Math.ceil(width / 2 / 100) / 10} m each if there are two, or more, narrower exits at its edges`}.`,
    })
  }
  if (podiumTravel !== null && podiumOutline && podFar) {
    const levels = podiumOutline.levels, lv = levels.length > 1 ? `L${levels[0]}–L${levels[levels.length - 1]}` : `L${levels[0]}`
    const to = podiumExits.length ? `core stairs or ${podiumExits.length} podium exit${podiumExits.length > 1 ? 's' : ''}` : 'core stairs'
    const ok = podiumTravel <= TRAVEL_LIMIT_M
    const atGrade = (outlines ?? []).every((o) => o.z0 <= 0.5)
    rules.push({
      id: `travel-podium-${t.id}`,
      label: 'Travel distance, podium floors',
      value: `${podiumTravel.toFixed(1)} m from the farthest point of L${podiumOutline.level} to the nearest exit (${to})`,
      threshold: `≤ ${TRAVEL_LIMIT_M} m`,
      state: ok ? 'pass' : 'fail',
      flag: 'verified',
      source: { ...VBBL_EXITS, page: '3.4.2.5' },
      note: `${ok ? `The ${to} reach every point of the podium storeys` : `Part of L${podiumOutline.level} is more than ${TRAVEL_LIMIT_M} m from an exit, farthest at (${podFar.x.toFixed(0)}, ${podFar.y.toFixed(0)}) m in the tower's frame: add an exit or move one toward it`}. Read on the true outlines of the podium storeys ${lv} (an open gap between parts is not floor; ${atGrade ? 'the podium has no storey above grade' : 'the ground storey exits through its street doors'}), straight line from each storey's farthest point to the nearest exit, a proxy (unverified method). Core stairs at the core: ${podiumOutline.core}${podiumExits.length ? '; podium exits as entered (team input)' : ''}.`,
    })
  } else if (podiumTravel !== null) {
    rules.push({
      id: `travel-podium-${t.id}`,
      label: 'Travel distance, podium floors',
      value: podFar ? `${podiumTravel.toFixed(1)} m to the nearest exit (core stairs or ${podiumExits.length} podium exit${podiumExits.length > 1 ? 's' : ''})` : `${podiumTravel.toFixed(1)} m to the core stairs`,
      threshold: `≤ ${TRAVEL_LIMIT_M} m`,
      state: podiumTravel <= TRAVEL_LIMIT_M ? 'pass' : 'fail',
      flag: 'verified',
      source: { ...VBBL_EXITS, page: '3.4.2.5' },
      note: podFar
        ? `${podiumTravel <= TRAVEL_LIMIT_M ? 'The core stairs and the podium exits reach the whole podium' : `Part of the podium is still more than ${TRAVEL_LIMIT_M} m from an exit, farthest at (${podFar.x.toFixed(0)}, ${podFar.y.toFixed(0)}) m from the tower centre: add an exit or move one toward it`}. Straight line from the farthest point of the podium rectangle to the nearest exit, a proxy (unverified method); podium exits as entered (team input).`
        : podiumTravel <= TRAVEL_LIMIT_M ? 'The tower stairs reach the whole podium.' : 'The podium needs its own exits: the tower core stairs are too far from its corners.',
    })
  }
  rules.push({
    id: `flight-${t.id}`,
    label: 'Rise per stair flight',
    value: `${maxFlight.toFixed(2)} m (two flights per storey)`,
    threshold: `≤ ${FLIGHT_MAX_M} m (3.4.6.3)`,
    state: maxFlight <= FLIGHT_MAX_M ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.6.3' },
  })
  // P1 #12 (21 Nov): amenity, lounge and tenant sky-lobby floors at the BCBC 2024 lounge row, storey by storey.
  const amenity = storeys.filter((s) => !s.podium && !s.publicRoom && (s.use === 'amenity' || s.use === 'civic' || s.skyLobby))
  if (amenity.length) {
    const word = (s: StoreyLoad) => (s.skyLobby ? 'sky lobby' : s.use === 'civic' ? 'civic' : 'amenity')
    const drives = governing && governing.needMm > STAIR_MIN_MM + 1 ? amenity.find((s) => s.level === governing.level) ?? null : null
    const shown = amenity.slice().sort((a, b) => b.load - a.load).slice(0, 4).sort((a, b) => a.level - b.level)
    rules.push({
      id: `amenity-load-${t.id}`,
      label: 'Amenity and lounge occupant load',
      value: shown.map((s) => `L${s.level} ${word(s)}: ${fmt(s.load)} people → stair width ${fmt(s.needMm)} mm`).join('; ') + (amenity.length > shown.length ? `; ${amenity.length - shown.length} more` : ''),
      threshold: `lounges ${LOAD_FACTOR.lounge} m² per person (Table 3.1.17.1); ${rate} mm per person ÷ ${n} stairs, ≥ ${STAIR_MIN_MM} mm`,
      state: drives ? 'warn' : 'pass',
      flag: 'verified',
      source: BCBC_LOADS,
      note: `${drives ? `L${drives.level} (${word(drives)}) sets the exit stair width from there down (${fmt(drives.needMm)} mm). ` : ''}Unprogrammed amenity, civic and tenant sky-lobby floors at ${e.amenityFactor} m² per person (the lounge row; it was 4.6, the personal-services row, about 2.5 times fewer people); floors with an interior programme add up their activities (residents' lounge ${LOAD_FACTOR.lounge}). The public sky room keeps its own dining 1.2 or standing 0.4. BCBC 2024 text; VBBL 2025, which governs in Vancouver, is to confirm.`,
    })
  }
  const linked = e.retailLinked ? storeys.find((s) => s.use === 'retail' && s.z >= 0.5 && /pedestrian way/.test(s.basis)) ?? null : null
  if (linked) {
    rules.push({
      id: `retail-linked-${t.id}`,
      label: 'Second-storey retail on a walkway or concourse',
      value: `L${linked.level} retail: ${fmt(linked.load)} people → ${linked.podium ? `about ${((linked.load * rate) / 1000).toFixed(1)} m of podium exit width` : `stair width ${fmt(linked.needMm)} mm`}`,
      threshold: `${LOAD_FACTOR.mercantileFirst} m² per person, as at grade (instead of ${LOAD_FACTOR.mercantileUpper})`,
      state: 'pass',
      flag: 'unverified',
      source: ASC_RETAIL,
      specialist: 'The 3.7 value is an NBC 2010 analogue (Allen & Iano, confidence B): a code consultant confirms the BCBC 2024 and VBBL 2025 row.',
      note: 'You said the second storey’s shops open onto a pedestrian way or the transit concourse (retailLinked), so they fill like ground-floor shops. Allen & Iano read NBC 2010: the BCBC 2024 and VBBL 2025 rows are to confirm.',
    })
  }
  rules.push({
    id: `loads-${t.id}`,
    label: 'Occupant load basis',
    value: governing ? `Busiest storey: level ${governing.level}, ${fmt(governing.load)} people` : '—',
    threshold: 'Table 3.1.17.1 factors',
    state: 'pass',
    flag: 'verified',
    source: VBBL_GENERAL,
    note: `Office 9.3, personal services 4.6, mercantile 3.7 (first storey${e.retailLinked ? ', and a second storey entered from a pedestrian way' : ''}) or 5.6, dining 1.2, standing 0.4, lounges 1.85 (BCBC 2024 p.3-105), public corridor 3.7 m² per person; 2 persons per sleeping room. Team mapping: amenity, civic and tenant sky-lobby floors at ${e.amenityFactor} m² per person (the lounge row) until programmed, hotel keys as 2 persons, plant floors as 0, net area = floor less the core.`,
  })

  return { storeys, stairs: n, placement, spots, farCorner: [far.x, far.y], governing, widthMm, enclosure, separation, separationNeeded, travel, podiumTravel, podiumExits, podiumFar: podFar ? [podFar.x, podFar.y] : null, podiumOutline, straightStairs: straight, rules }
}
