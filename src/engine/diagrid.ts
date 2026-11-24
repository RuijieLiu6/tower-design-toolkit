// Diagrid reading (gap G79; R7 tool 12, Study 4 C's "six-storey module, 68° members"): a declared diagrid on the tower's
// own storey outlines. The designer gives the module (storeys a member rises between two node rings) and the member
// angle aimed for; the reader lays the grid on the model and reads what it really is:
// - Node rings at every `module` storeys from the first diagrid storey; on each ring n nodes at equal shares of the
//   outline's perimeter, every other ring offset by half a bay, so each member runs from a node to the two nearest nodes
//   on the ring above (a lattice of diamonds). n is fixed for the tower (a diagrid keeps its node count): it is the whole
//   number of bays that gives the aimed angle on the mean ring perimeter, rounded to even and at least 4.
// - Each ring's start follows the node of the ring below (nearest point of the outline), so the grid turns with a twist.
// - Member angle (from horizontal) = atan(rise / run); the run is the member's plan length. With a swell or taper the
//   bay width changes with the perimeter, so the angle changes with height: the reading gives its range.
// - Diamond panels: the four nodes of each diamond and how far the fourth sits off the plane of the other three (m):
//   0 is a flat panel; triangles are flat by construction.
// Geometry only: nothing here is a structural coefficient. The structure lines (`diagridLines`) say what the read
// sources state and give "not assessed" where no source in the toolkit's reading gives a number.
import { floorRing, towerFloors } from './massing'
import { quadWarp } from './planMorph'
import type { Floor, RuleResult, Source, Tower } from './types'

export interface DiagridSpec {
  /** Storeys a member rises between two node rings (her six-storey module: 6). */
  module: number
  /** The member angle aimed for (degrees from horizontal); absent: 65°. The reading reports the angle the grid gets. */
  angle?: number
  /** First and last storey level of the diagrid (absent: the first tower storey above the podium, the top storey). */
  fromLevel?: number
  toLevel?: number
}

type P2 = [number, number]
type P3 = [number, number, number]

export interface DiagridGeometry {
  spec: DiagridSpec
  /** Bays (nodes) per ring. */
  nodes: number
  /** Node rings, bottom-up: height (m above grade) and the nodes (project frame, m). */
  rings: { z: number; level: number; pts: P2[] }[]
  /** Members as segments (project frame, z up). */
  members: [P3, P3][]
  /** Member angle from horizontal (degrees): least, most, mean. */
  angle: { min: number; max: number; mean: number }
  /** Member length (m): least and most. */
  length: { min: number; max: number }
  /** Diamonds: count, how many are not flat (fourth node more than FLAT_TOL off the plane of the other three; a diamond
   *  folded over a plan corner counts), and the largest such offset (m). */
  diamonds: number
  warped: number
  warp: number
  /** Height the diagrid spans (m) and its foot. */
  z0: number
  z1: number
}

const DEFAULT_ANGLE = 65 // the default aim only (the angle Study 4 C aimed for); no reading depends on it
/** A diamond counts as flat to 1 cm: model precision (team), not a facade tolerance. */
export const FLAT_TOL = 0.01

const ccw = (r: P2[]) => (r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) >= 0 ? r : [...r].reverse())
const perim = (r: P2[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)

/** The point at perimeter distance s from the ring's vertex 0 (wraps). */
function along(r: P2[], s: number): P2 {
  const L = perim(r)
  let x = ((s % L) + L) % L
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (x <= d || i === r.length - 1) { const k = d > 1e-12 ? Math.min(1, x / d) : 0; return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k] }
    x -= d
  }
  return r[0]
}

/** Perimeter distance from vertex 0 to the ring's point nearest p. */
function nearestS(r: P2[], p: P2): number {
  let best = Infinity, at = 0, acc = 0
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
    const k = L2 > 1e-12 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
    const d = Math.hypot(a[0] + dx * k - p[0], a[1] + dy * k - p[1])
    if (d < best) { best = d; at = acc + k * Math.sqrt(L2) }
    acc += Math.sqrt(L2)
  }
  return at
}

/** Narrowest width of a ring (m): the least spread across any edge's normal (rotating calipers on the ring's edges). */
export function minWidth(ring: P2[]): number {
  let w = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-9) continue
    const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L
    let lo = Infinity, hi = -Infinity
    for (const [x, y] of ring) { const v = x * nx + y * ny; lo = Math.min(lo, v); hi = Math.max(hi, v) }
    w = Math.min(w, hi - lo)
  }
  return Number.isFinite(w) ? w : 0
}

/** The diagrid's storeys: the floors it spans, bottom-up. */
function gridFloors(t: Tower, spec: DiagridSpec, floors: Floor[]): Floor[] {
  const tower = floors.filter((f) => !f.podium)
  const lo = spec.fromLevel ?? tower[0]?.level ?? 1, hi = spec.toLevel ?? tower[tower.length - 1]?.level ?? lo
  return floors.filter((f) => f.level >= lo && f.level <= hi)
}

/** The grid laid on the tower (null when there is no diagrid or fewer storeys than one module). */
export function diagridGeometry(t: Tower, floors: Floor[] = towerFloors(t)): DiagridGeometry | null {
  const spec = t.diagrid
  if (!spec || !(spec.module >= 1)) return null
  const fl = gridFloors(t, spec, floors)
  const m = Math.round(spec.module)
  if (fl.length < m) return null
  // node heights: the foot of every m-th storey, and the top of the last full module
  const ringAt: { z: number; level: number; ring: P2[] }[] = []
  for (let i = 0; i + m <= fl.length; i += m) ringAt.push({ z: fl[i].z0, level: fl[i].level, ring: ccw(floorRing(t, fl[i])) })
  const lastTop = fl[ringAt.length * m - 1]
  ringAt.push({ z: lastTop.z1, level: lastTop.level + 1, ring: ccw(floorRing(t, lastTop)) })
  // bays: the whole even number that gives the aimed angle on the mean perimeter
  const aim = Math.max(30, Math.min(85, spec.angle ?? DEFAULT_ANGLE))
  const rise = (ringAt[ringAt.length - 1].z - ringAt[0].z) / (ringAt.length - 1)
  const P = ringAt.reduce((s, r) => s + perim(r.ring), 0) / ringAt.length
  const run = rise / Math.tan((aim * Math.PI) / 180) // a member's plan run is half a bay
  const n = Math.max(4, 2 * Math.round(P / (2 * run) / 2))
  // nodes, each ring's start following the node below
  const rings: DiagridGeometry['rings'] = []
  let prev: P2 | null = null
  ringAt.forEach((r, k) => {
    const L = perim(r.ring)
    const s0 = prev ? nearestS(r.ring, prev) : 0
    const off = k % 2 ? 0.5 : 0
    const pts = Array.from({ length: n }, (_, j) => along(r.ring, s0 + ((j + off) / n) * L))
    prev = along(r.ring, s0) // the ring's reference point (share 0), so offsets alternate consistently
    rings.push({ z: r.z, level: r.level, pts })
  })
  // members: node j of ring k to nodes j and j+1 (odd k: j and j−1 … in share terms: ± half a bay) of ring k+1
  const members: [P3, P3][] = []
  const ang: number[] = [], len: number[] = []
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1], dz = b.z - a.z
    for (let j = 0; j < n; j++) {
      const p = a.pts[j]
      const up = k % 2 === 0 ? [b.pts[(j - 1 + n) % n], b.pts[j]] : [b.pts[j], b.pts[(j + 1) % n]]
      for (const q of up) {
        const h = Math.hypot(q[0] - p[0], q[1] - p[1])
        members.push([[p[0], p[1], a.z], [q[0], q[1], b.z]])
        ang.push((Math.atan2(dz, h) * 180) / Math.PI); len.push(Math.hypot(h, dz))
      }
    }
  }
  // diamonds: bottom node (ring k, j), side nodes on ring k+1, top node (ring k+2, j)
  let diamonds = 0, warp = 0, warped = 0
  for (let k = 0; k + 2 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1], c = rings[k + 2]
    for (let j = 0; j < n; j++) {
      const [l, r] = k % 2 === 0 ? [b.pts[(j - 1 + n) % n], b.pts[j]] : [b.pts[j], b.pts[(j + 1) % n]]
      const lo = a.pts[j], hi = c.pts[j]
      const w = quadWarp([lo[0], lo[1], a.z], [r[0], r[1], b.z], [hi[0], hi[1], c.z], [l[0], l[1], b.z])
      warp = Math.max(warp, w)
      if (w > FLAT_TOL) warped++
      diamonds++
    }
  }
  const mean = ang.reduce((s, x) => s + x, 0) / Math.max(1, ang.length)
  return {
    spec, nodes: n, rings, members, diamonds, warped, warp,
    angle: { min: Math.min(...ang), max: Math.max(...ang), mean },
    length: { min: Math.min(...len), max: Math.max(...len) },
    z0: rings[0].z, z1: rings[rings.length - 1].z,
  }
}

// --- sources: only what the toolkit's own reading holds (research/books, research R3) ------------------------------
const CHING: Source = { label: 'Ching, Onouye & Zuberbuhler, Building Structures Illustrated (Wiley 2013), ch. 7 High-Rise Structures (single-pass reading, research/books/high-rise-structure-illustration.md)' }
const NBC_4189: Source = { label: 'NBC 2020 Table 4.1.8.9 and Commentary J (as read in research P10)', page: 'Commentary J paras 213–214' }
const MOON_2013: Source = { label: 'Moon, K.S. (2013), Sustainable structural engineering for complex-shaped tall buildings, EASEC-13 (research R3 S12, read in full)' }
const MOON_2018: Source = { label: 'Moon, K.S. (2018), Structural Systems for Tapered Tall Buildings, Buildings 8, 108 (research R3 S13, read in full)' }
const TEAM_GEOM: Source = { label: 'Toolkit geometry: the grid laid on the model storey outlines (engine/diagrid.ts)' }
/** Ching p.50 (as read): a uniform member angle suits towers below an aspect of 7; above it, an angle that varies with height. */
export const DIAGRID_UNIFORM_ASPECT = 7
/** Ching pp.31–32 (as read by a second reader, confidence B): diagrid structures are used up to about 100 storeys. */
export const DIAGRID_STOREYS = 100

const d1 = (v: number) => v.toFixed(1)

/** The Structure node's diagrid lines (empty with no diagrid declared). */
export function diagridLines(t: Tower, floors: Floor[] = towerFloors(t)): RuleResult[] {
  if (!t.diagrid) return []
  const g = diagridGeometry(t, floors)
  if (!g) return [{ id: 'diagrid', label: 'Diagrid (declared)', value: `module ${t.diagrid.module} storeys: fewer diagrid storeys than one module`, threshold: 'at least one module of storeys', state: 'warn', flag: 'verified', source: TEAM_GEOM }]
  const out: RuleResult[] = []
  const ringsN = g.rings.length, members = g.members.length
  const aim = t.diagrid.angle ?? DEFAULT_ANGLE
  out.push({
    id: 'diagrid', label: 'Diagrid (declared)',
    value: `${g.nodes} nodes a ring × ${ringsN} rings, module ${Math.round(t.diagrid.module)} storeys, +${d1(g.z0)} to +${d1(g.z1)} m; members ${d1(g.angle.min)}–${d1(g.angle.max)}° (aimed ${aim}°), ${members} members ${d1(g.length.min)}–${d1(g.length.max)} m`,
    threshold: 'read from the storey outlines', state: 'unknown', flag: 'verified', source: TEAM_GEOM,
    note: `Nodes at equal shares of each node ring's perimeter, every other ring offset half a bay, each ring's start following the node below (the grid turns with a twist). ${g.nodes} bays is the even count nearest the aimed angle on the mean ring; the angle then changes with the perimeter (a swell flattens it, a taper steepens it). The aimed angle is the designer's: the toolkit's reading gives no optimum angle, so none is checked.`,
  })
  // angle against slenderness (Ching p.50)
  const base = g.rings[0].pts.length >= 3 ? minWidth(floorRing(t, floors.find((f) => f.level === g.rings[0].level) ?? floors[0])) : 0
  const H = t.height, aspect = base > 0 ? H / base : Infinity
  const spread = g.angle.max - g.angle.min
  out.push({
    id: 'diagrid-angle', label: 'Diagrid angle against slenderness',
    value: `aspect ${Number.isFinite(aspect) ? aspect.toFixed(1) : '—'}:1 (${d1(H)} m on a ${d1(base)} m base); member angle ${d1(g.angle.min)}–${d1(g.angle.max)}° (spread ${d1(spread)}°)`,
    threshold: `below ${DIAGRID_UNIFORM_ASPECT}:1 a uniform angle suits; from ${DIAGRID_UNIFORM_ASPECT}:1 an angle that varies with height (Ching)`,
    state: aspect < DIAGRID_UNIFORM_ASPECT ? 'pass' : 'warn', flag: 'unverified', source: { ...CHING, page: 'p. 50 (printed page of the chapter PDF)' },
    note: `${aspect < DIAGRID_UNIFORM_ASPECT ? 'Under the book\'s aspect, a uniform angle is the book\'s suggestion; the angle here varies only as the perimeter does.' : 'Past the book\'s aspect, it suggests an angle that varies with height; set the module per zone with the engineer.'} The optimum angle itself is not assessed: no source the toolkit has read gives a number (a figure attributed to Moon et al. is quoted in the team study but was not read here).`,
  })
  // system route and range
  const storeys = floors.filter((f) => !f.podium).length
  out.push({
    id: 'diagrid-route', label: 'Diagrid as the perimeter system',
    value: `${storeys} tower storeys; not a listed SFRS at SC4`,
    threshold: `alternative solution (equivalence) with peer review, Rd = Ro = 1.0; diagrids are used to about ${DIAGRID_STOREYS} storeys (Ching)`,
    state: 'warn', flag: 'unverified', source: { ...NBC_4189 },
    note: `The core walls stay the seismic force-resisting system; the diagrid carries gravity and the perimeter's share of wind, triangulated (Ching pp. 49–53: diagonals carry gravity and lateral load; a curved or spiral grid needs ring hoops at its nodes). ${storeys > DIAGRID_STOREYS ? `${storeys} storeys is past the ~${DIAGRID_STOREYS}-storey range the book gives (pp. 31–32, read by a second reader).` : `${storeys} storeys is within the ~${DIAGRID_STOREYS}-storey range the book gives (pp. 31–32, read by a second reader).`}`,
  })
  // effect on stiffness: not assessed (no coefficient for this tower)
  out.push({
    id: 'diagrid-stiffness', label: 'Diagrid effect on sway and stiffness',
    value: 'not assessed', threshold: 'no source gives a stiffness for this grid', state: 'unknown', flag: 'unresolved', source: { label: `${MOON_2013.label}; ${MOON_2018.label}; ${CHING.label}`, page: 'R3 §1 and §3; Ching p. 51' },
    note: 'What the reading does say, none of it applied here as a number: diagrids lose stiffness more slowly under twist than the 60-storey outrigger tower the twist line reads (Moon 2013), so that line\'s sway figure is not this structure\'s; in a 100-storey diagrid a 3° taper cut the top displacement to about 40% at constant floor area with the angles re-tuned (Moon 2018; a different tower); the Hearst Tower diagrid used about 20% less steel than a conventional frame (Ching p. 51; one building). The engineer models the grid.',
  })
  out.push({
    id: 'diagrid-panels', label: 'Diagrid nodes and panels',
    value: `${g.nodes * ringsN} nodes, ${g.diamonds} diamonds, ${g.warped} not flat${g.warped ? ` (a fourth node up to ${g.warp.toFixed(2)} m off the plane of the other three)` : ''}`,
    threshold: 'flat to 1 cm (model precision); a diamond that is not flat splits into two flat triangles', state: 'unknown', flag: 'verified', source: TEAM_GEOM,
    note: 'Geometry only. A diamond folded over a plan corner, or warped by a twist or a swell, is glazed as two flat triangles or cold-bent; no tolerance is sourced here, so no pass or fail is given. Every node is a member junction to detail (a curved grid needs a ring hoop there).',
  })
  return out
}
