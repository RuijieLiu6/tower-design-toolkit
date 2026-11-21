// Corner type read from the plan (gap G3, research R5 §4.1). There is no published classifier, so this rule is a team
// one: simplify each storey outline, frame it in its minimum-area bounding rectangle (B ≥ D), and read what the outline
// does at each of the rectangle's corners. Sharp: it reaches the corner (both legs of any cut under 0.02·B). Chamfered:
// one dominant edge at 30–60° to both sides, no re-entrant vertex. Recessed: re-entrant vertices with every edge within
// 10° of the sides (one per step). Rounded: three or more edges, each turning under 30°. Anything else: "other", with no
// aerodynamic credit. The cut ratio b/B (Ke et al. normalise by the plan width) uses b = the mean of the cut's two legs
// (a tangent arc's radius, a recess's depth, a chamfer's projections). The tower's reading is taken over the storeys
// above H/3, where the across-wind force is dominated by the upper part (inference).
import { convexHull } from './importGeom'
import { blockSpans, rectCorners, spanAt, towerFloors } from './massing'
import type { Floor, Tower } from './types'

type P = [number, number]
export type CornerKind = 'sharp' | 'chamfered' | 'recessed' | 'rounded' | 'other'
export interface CornerRead { kind: CornerKind; b: number; steps: number }
export interface PlanReading { kind: CornerKind | 'mixed'; B: number; D: number; bB: number; steps: number; corners: CornerRead[] }
export interface TowerCorners {
  /** The tower's reading over the height above H/3. */
  kind: CornerKind | 'mixed' | 'none'
  bB: number
  steps: number
  /** Share of the height above H/3 with this reading, and with all four corners modified alike at b/B ≥ 0.05 (the credit share). */
  share: number
  credit: number
  text: string
}

/** Cut ratio from which a modified corner earns credit (team, R5 §4.1 step 6). */
export const CREDIT_BB = 0.05

const shoelace = (r: P[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0 } return a / 2 }
const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Counter-clockwise, without repeated points or vertices within 0.05 m of the line through their neighbours (step 1). */
export function simplify(ring: P[]): P[] {
  let r = ring.filter((p, i) => dist(p, ring[(i + 1) % ring.length]) > 0.01)
  for (let changed = true; changed && r.length > 3;) {
    changed = false
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], q = r[i], b = r[(i + 1) % r.length], L = dist(a, b)
      if (L < 1e-9 || Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L < 0.05) { r = r.filter((_, k) => k !== i); changed = true; break }
    }
  }
  return shoelace(r) < 0 ? [...r].reverse() : r
}

/** Minimum-area bounding rectangle of a point set by rotating calipers over its hull: centre, unit axis along B, B ≥ D (step 2). */
export function minAreaRect(pts: P[]): { c: P; u: P; B: number; D: number } {
  const h = convexHull(pts)
  let best = { area: Infinity, c: [0, 0] as P, u: [1, 0] as P, B: 0, D: 0 }
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], L = dist(a, b)
    if (L < 1e-9) continue
    const u: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], v: P = [-u[1], u[0]]
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const p of h) { const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv) }
    const area = (u1 - u0) * (v1 - v0)
    if (area < best.area - 1e-6) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, c: P = [cu * u[0] + cv * v[0], cu * u[1] + cv * v[1]]
      best = u1 - u0 >= v1 - v0 ? { area, c, u, B: u1 - u0, D: v1 - v0 } : { area, c, u: v, B: v1 - v0, D: u1 - u0 }
    }
  }
  return best
}

/** Deviation of an edge from the nearer rectangle axis (0–45°). */
const axisOff = (e: P) => { const d = Math.abs((Math.atan2(e[1], e[0]) * 180) / Math.PI) % 90; return Math.min(d, 90 - d) }
const turn = (u: P, v: P) => (Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI

/** One corner of the rectangle (signs sx, sy) in the rectangle's frame, half sides a ≥ h (steps 3–4). */
function corner(r: P[], a: number, h: number, sx: number, sy: number, B: number): CornerRead {
  const n = r.length, tol = Math.max(0.05, 0.002 * B)
  let i1 = -1, i2 = -1
  for (let i = 0; i < n; i++) {
    const [x, y] = r[i]
    if (Math.abs(y - sy * h) < tol && (i1 < 0 || sx * x > sx * r[i1][0])) i1 = i
    if (Math.abs(x - sx * a) < tol && (i2 < 0 || sy * y > sy * r[i2][1])) i2 = i
  }
  if (i1 < 0 || i2 < 0) return { kind: 'other', b: 0, steps: 0 }
  const L1 = a - sx * r[i1][0], L2 = h - sy * r[i2][1]
  if (Math.max(L1, L2) < 0.02 * B) return { kind: 'sharp', b: 0, steps: 0 }
  // The outline between the last points on the two sides, the short way round.
  const walk = (from: number, to: number) => { const out = [from]; for (let k = from; k !== to && out.length <= n;) { k = (k + 1) % n; out.push(k) } return out }
  const len = (ids: number[]) => ids.slice(1).reduce((s, k, j) => s + dist(r[ids[j]], r[k]), 0)
  const fw = walk(i1, i2), bw = walk(i2, i1)
  const pts = (len(fw) <= len(bw) ? fw : bw).map((k) => r[k])
  const edges: P[] = pts.slice(1).map((p, j) => [p[0] - pts[j][0], p[1] - pts[j][1]])
  if (!edges.length) return { kind: 'other', b: 0, steps: 0 }
  const total = edges.reduce((s, e) => s + Math.hypot(e[0], e[1]), 0)
  const turns = edges.slice(1).map((e, j) => turn(edges[j], e))
  const reflex = turns.filter((x) => x < -5).length
  const b = (L1 + L2) / 2
  if (reflex > 0) return edges.every((e) => axisOff(e) <= 10) ? { kind: 'recessed', b, steps: reflex } : { kind: 'other', b, steps: 0 }
  const dom = edges.reduce((m, e) => (Math.hypot(e[0], e[1]) > Math.hypot(m[0], m[1]) ? e : m), edges[0])
  if (Math.hypot(dom[0], dom[1]) >= 0.7 * total && axisOff(dom) >= 30) return { kind: 'chamfered', b, steps: 0 }
  if (edges.length >= 3 && turns.every((x) => Math.abs(x) < 30)) return { kind: 'rounded', b, steps: 0 }
  return { kind: 'other', b, steps: 0 }
}

/** The four corners of one plan outline, and its reading when all four agree. */
export function readCorners(ring: P[]): PlanReading {
  const r0 = simplify(ring)
  if (r0.length < 3) return { kind: 'other', B: 0, D: 0, bB: 0, steps: 0, corners: [] }
  const { c, u, B, D } = minAreaRect(r0)
  const v: P = [-u[1], u[0]]
  const r = r0.map((p): P => [(p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1], (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1]])
  const corners = ([[1, -1], [1, 1], [-1, 1], [-1, -1]] as const).map(([sx, sy]) => corner(r, B / 2, D / 2, sx, sy, B))
  const same = corners.every((k) => k.kind === corners[0].kind)
  return { kind: same ? corners[0].kind : 'mixed', B, D, bB: B > 0 ? corners.reduce((s, k) => s + k.b, 0) / 4 / B : 0, steps: Math.max(...corners.map((k) => k.steps)), corners }
}

/** One floor's outer outline in the tower frame: an imported storey's largest loop (else the stored hull), or the block at mid-height. */
export function floorOutline(t: Tower, f: Floor): P[] {
  if (t.imported) {
    const s = t.imported.storeys?.find((x) => x.level === f.level)
    const loops = (s?.loops ?? []).filter((x) => x.length >= 3) as P[][]
    if (loops.length) return loops.reduce((m, x) => (Math.abs(shoelace(x)) > Math.abs(shoelace(m)) ? x : m), loops[0])
    if (t.imported.hull?.length >= 3) return t.imported.hull as P[]
  }
  const b = spanAt(blockSpans(t), (f.z0 + f.z1) / 2)?.block
  return b ? rectCorners(b.dx, b.dy, b.width, b.depth, b.rotation) : rectCorners(0, 0, t.width, t.depth, 0)
}

const TREATED: CornerKind[] = ['chamfered', 'recessed', 'rounded']
const pct = (x: number) => `${Math.round(x * 100)}%`

/** The tower's corners over the height above H/3 (step 6): the commonest reading by height, with its credited share. */
export function towerCorners(t: Tower): TowerCorners {
  const floors = towerFloors(t).filter((f) => !f.podium && (f.z0 + f.z1) / 2 >= t.height / 3)
  const memo = new Map<string, PlanReading>()
  const tally = new Map<string, { h: number; bB: number; steps: number; credit: number }>()
  let total = 0
  for (const f of floors) {
    const ring = floorOutline(t, f)
    const key = ring.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(';')
    let read = memo.get(key)
    if (!read) { read = readCorners(ring); memo.set(key, read) }
    const h = Math.max(0, f.z1 - f.z0), x = tally.get(read.kind) ?? { h: 0, bB: 0, steps: 0, credit: 0 }
    x.h += h; x.bB += read.bB * h; x.steps = Math.max(x.steps, read.steps)
    if (TREATED.includes(read.kind as CornerKind) && read.bB >= CREDIT_BB - 1e-9) x.credit += h
    tally.set(read.kind, x)
    total += h
  }
  if (total <= 0) return { kind: 'none', bB: 0, steps: 0, share: 0, credit: 0, text: 'no tower storeys' }
  const [kind, x] = [...tally.entries()].sort((a, b) => b[1].h - a[1].h || b[1].credit - a[1].credit)[0]
  const share = x.h / total, credit = x.credit / total, bB = x.h > 0 ? x.bB / x.h : 0
  const k = kind as TowerCorners['kind']
  const what = k === 'sharp' ? 'sharp' : k === 'mixed' ? 'mixed corners' : k === 'other' ? 'indeterminate corners' : `${k}${x.steps > 1 ? ` (${x.steps} steps)` : ''}, b/B ${bB.toFixed(2)}`
  const under = TREATED.includes(k as CornerKind) && bB < CREDIT_BB - 1e-9 ? ` (under the ${CREDIT_BB} the screen credits)` : ''
  return { kind: k, bB, steps: x.steps, share, credit, text: `${what}${under}${share < 0.995 ? ` over ${pct(share)} of the height above H/3` : ''}` }
}
