// Grooves (tool cycle 12, R7_SYNTHESIS §1 Concept 3 "Datum Bundle"): rounded re-entrant grooves cut into a plan, between
// the bundle's shafts or anywhere along a face. "Grooves at least 3 m deep separate the shafts (rounded corners,
// r 3–4.5 m)"; the spec sketch gives `"grooves": {"depth": 3, "radius": 3}`.
//
// Shape (team definition), across the groove, in plan, from the face inward:
// - two convex lips of radius `lip` (default 0) where the groove meets the face: the shafts' rounded corners;
// - straight walls 2·`radius` apart;
// - a semicircular bottom of radius `radius`, its deepest point `depth` behind the face line.
// So the groove is 2·(radius + lip) wide at the face. {depth 3, radius 3} is a half-round groove 6 m wide and 3 m deep;
// {lip 3, radius 0} is two 3 m rounded shaft corners meeting in a cusp 3 m deep (depth is then the lip). The depth is
// at least radius + lip. Area of one groove: 2r(depth − r) + πr²/2 + 2·lip²(1 − π/4).
//
// Placement, in the part's frame (before rotation, as `plan`): a groove wherever a straight face crosses one of the
// `lines` (x = c or y = c: the shaft lines, e.g. ±9 m for 3 × 3 shafts of 18 m), or at the face point nearest each of
// `at`. A groove runs square to its face, needs a straight stretch as wide as itself, and never overlaps another: one
// that does not fit is skipped and counted. `corners: true` also rounds the plan's own corners: convex ones by `lip`,
// re-entrant ones by `radius` (the cross and bar plans of the bundle). The harness applies it to a part's ring in the
// part frame, after the plan (or the plan morph) and before scale, rotation and centre.
type P2 = [number, number]

export interface GrooveSpec {
  /** Depth of the groove's innermost point behind the face line (m). */
  depth: number
  /** Radius of its rounded re-entrant bottom (m); half the distance between its walls. */
  radius: number
  /** Radius of the two convex lips at the face (m, default 0). */
  lip?: number
  /** A groove wherever a face crosses one of these lines (part frame, m). */
  lines?: { x?: number[]; y?: number[] }
  /** A groove at the face point nearest each of these points (part frame, m). */
  at?: P2[]
  /** Also round the plan's corners: convex by `lip`, re-entrant by `radius` (default false). */
  corners?: boolean
  /** Points per quarter circle (default 6). */
  segments?: number
}

export interface GrooveResult {
  /** The grooved ring, counter-clockwise. */
  ring: P2[]
  /** Grooves cut, and grooves asked for that did not fit (too near a corner or another groove). */
  placed: number
  skipped: number
  /** Plate area the grooves and rounded corners take (m², from the rings). */
  areaLost: number
}

const sArea = (r: P2[]) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2

/** The groove's dimensions as cut: effective depth (at least radius + lip; the lip alone when radius is 0), width at the face. */
export function grooveSize(g: Pick<GrooveSpec, 'depth' | 'radius' | 'lip'>): { depth: number; radius: number; lip: number; width: number } {
  const r = Math.max(0, g.radius), lip = Math.max(0, g.lip ?? 0)
  const depth = r > 1e-9 ? Math.max(g.depth, r + lip) : lip
  return { depth, radius: r, lip, width: 2 * (r + lip) }
}

/** Exact plan area of one groove (m²). */
export function grooveArea(g: Pick<GrooveSpec, 'depth' | 'radius' | 'lip'>): number {
  const { depth, radius: r, lip } = grooveSize(g)
  return 2 * r * (depth - r) + (Math.PI * r * r) / 2 + 2 * lip * lip * (1 - Math.PI / 4)
}

const arc = (c: P2, r: number, a0: number, a1: number, n: number): P2[] => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as P2 })

/** One groove's outline in edge coordinates (u along the face, v into the plate), centred at u = 0, left to right. */
function profile(g: GrooveSpec): [number, number][] {
  const { depth: D, radius: R, lip: L } = grooveSize(g), n = Math.max(1, Math.round(g.segments ?? 6))
  const pts: [number, number][] = []
  const push = (p: P2) => { const q = pts[pts.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9) pts.push(p) }
  const h = Math.PI / 2
  if (L > 0) for (const p of arc([-R - L, L], L, -h, 0, n)) push(p); else push([-R, 0])
  if (R > 0) { push([-R, D - R]); for (const p of arc([0, D - R], R, Math.PI, 0, 2 * n)) push(p); push([R, L]) }
  if (L > 0) for (const p of arc([R + L, L], L, Math.PI, Math.PI + h, n)) push(p); else push([R, 0])
  return pts
}

/** Rounds a counter-clockwise ring's corners: convex by `convexR`, re-entrant by `concaveR` (fillets kept within half of each edge). */
export function roundCorners(ring: P2[], convexR: number, concaveR: number, segments = 6): P2[] {
  const r = ring.filter((p, i) => Math.hypot(p[0] - ring[(i + 1) % ring.length][0], p[1] - ring[(i + 1) % ring.length][1]) > 1e-9)
  const out: P2[] = []
  for (let i = 0; i < r.length; i++) {
    const a = r[(i + r.length - 1) % r.length], v = r[i], b = r[(i + 1) % r.length]
    const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]), l2 = Math.hypot(b[0] - v[0], b[1] - v[1])
    const d1: P2 = [(v[0] - a[0]) / l1, (v[1] - a[1]) / l1], d2: P2 = [(b[0] - v[0]) / l2, (b[1] - v[1]) / l2]
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) // left turn > 0: convex
    const want = turn > 0 ? convexR : concaveR
    if (!(want > 0) || Math.abs(turn) < 1e-3) { out.push(v); continue }
    const tanHalf = Math.tan(Math.abs(turn) / 2), t = Math.min(want * tanHalf, l1 / 2, l2 / 2), rr = t / tanHalf
    const p1: P2 = [v[0] - d1[0] * t, v[1] - d1[1] * t], side = turn > 0 ? 1 : -1
    const c: P2 = [p1[0] - side * d1[1] * rr, p1[1] + side * d1[0] * rr]
    const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0])
    const n = Math.max(1, Math.ceil((segments * Math.abs(turn)) / (Math.PI / 2)))
    out.push(...arc(c, rr, a0, a0 + turn, n))
  }
  return out
}

/** Cuts the grooves (and, with `corners`, the rounded corners) into a ring in the part frame. */
export function applyGrooves(ring: P2[], g: GrooveSpec): GrooveResult {
  const base = sArea(ring) >= 0 ? ring : [...ring].reverse()
  const { width, lip, radius } = grooveSize(g), W = width / 2
  const r = g.corners ? roundCorners(base, lip, radius, g.segments ?? 6) : base
  // grooves asked for, as (edge, distance along it)
  const want: { e: number; u: number }[] = []
  let asked = 0
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    for (const c of g.lines?.x ?? []) if ((a[0] - c) * (b[0] - c) < 0) { want.push({ e: i, u: Math.hypot(b[0] - a[0], b[1] - a[1]) * ((c - a[0]) / (b[0] - a[0])) }); asked++ }
    for (const c of g.lines?.y ?? []) if ((a[1] - c) * (b[1] - c) < 0) { want.push({ e: i, u: Math.hypot(b[0] - a[0], b[1] - a[1]) * ((c - a[1]) / (b[1] - a[1])) }); asked++ }
  }
  for (const p of g.at ?? []) {
    asked++
    let best: { e: number; u: number } | null = null, bd = Infinity
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey
      if (L2 < 1e-12) continue
      const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2))
      const d = Math.hypot(p[0] - a[0] - ex * k, p[1] - a[1] - ey * k)
      if (d < bd) { bd = d; best = { e: i, u: k * Math.sqrt(L2) } }
    }
    if (best) want.push(best)
  }
  // keep those with room on a straight stretch, none overlapping (first come)
  const byEdge = new Map<number, number[]>()
  for (const w of want.sort((x, y) => x.e - y.e || x.u - y.u)) {
    const a = r[w.e], b = r[(w.e + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const list = byEdge.get(w.e) ?? []
    if (w.u - W < -1e-9 || w.u + W > L + 1e-9 || list.some((u) => Math.abs(u - w.u) < 2 * W - 1e-9)) continue
    list.push(w.u)
    byEdge.set(w.e, list)
  }
  const prof = W > 0 ? profile(g) : []
  const out: P2[] = []
  let placed = 0
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    out.push(a)
    if (!prof.length) continue
    const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], m: P2 = [-d[1], d[0]] // inward: left of a counter-clockwise edge
    for (const u of byEdge.get(i) ?? []) {
      for (const [pu, pv] of prof) out.push([a[0] + d[0] * (u + pu) + m[0] * pv, a[1] + d[1] * (u + pu) + m[1] * pv])
      placed++
    }
  }
  const ringOut = out.filter((p, i) => Math.hypot(p[0] - out[(i + 1) % out.length][0], p[1] - out[(i + 1) % out.length][1]) > 1e-9)
  return { ring: ringOut, placed, skipped: asked - placed, areaLost: sArea(base) - sArea(ringOut) }
}
