// Plan morph (tool cycle 12, R7 tool 3, research/R7_landmark/R7_SYNTHESIS.md §1 Concept 1 "Compass Turn"): a part's
// plan changes from shape A (`plan`) at its foot to shape B (`planTop`) at its top, storey by storey, so a street-grid
// square can turn into an octagon whose cut corners face true north, east, south and west.
//
// Frame and conventions (as TOOLKIT_FREEFORM.md): both plans are in the part's own frame, metres, centred on the part's
// `centre`, before its `rotation` (degrees, counter-clockwise) and before any `scaleTop`, `steps` or `twist`, which
// still apply on top. On the competition site the model's +y is the street grid and true north lies 45° clockwise from
// +y (context.ts VTC_NORTH_DEG; the block edge measures 44.8°, R7 §0), so with rotation 0 a `chamfer` corner cut faces
// true N (+x+y), E (+x−y), S (−x−y) or W (−x+y): to 0.2° of the measured grid. On Real Vancouver (grid north 0°) the
// same holds for a tower turned with the downtown grid (about 45°).
//
// Vertex matching. Both outlines are resampled to the same vertex list so the morph is a straight blend of matched
// points:
// - Both convex: by edge direction (a Minkowski blend, (1 − s)·A ⊕ s·B). Every edge of either shape keeps its
//   direction all the way up; an edge one shape lacks starts (or ends) at zero length. So a square's corner opens into
//   an octagon's facet, every face is a flat panel within each storey, and the plate area falls steadily when B lies
//   inside A. This equals blending the shape's own parameters when the shapes share a type (chamfer to chamfer).
// - Otherwise (a re-entrant plan): by share of perimeter from a common start, the start turned to the best fit, with
//   every corner of both shapes kept. Ends are exact; faces may turn between storeys (read as warped panels).
//
// Profile (s against t = (z − z0) / (z1 − z0)):
// - `linear`: s = t. Faces are planes: each face's offset changes at a constant rate (the "facet leg grows linearly").
// - `arc`: a circular arc in section, tangent to the vertical at z0 (no kink where the morph starts) and meeting B at
//   z1. The face that travels farthest (δ, measured along its own normal; H = z1 − z0) follows the true arc of radius
//   R = (H² + δ²) / (2δ): s(t) = (R − √(R² − (tH)²)) / δ. Every other face follows the same curve scaled to its own
//   travel, so it is an elliptic arc with the same vertical tangent at z0. Team definition, not from a source.
type P2 = [number, number]

export type PlanShape = 'rect' | 'chamfer' | 'ellipse' | 'superellipse' | 'polygon'
/** A part plan as in TOOLKIT_FREEFORM.md (centred, before rotation). */
export interface PlanSpec { shape?: PlanShape | string; w?: number; d?: number; chamfer?: number; n?: number; exp?: number; pts?: P2[] }
export type MorphProfile = 'linear' | 'arc'
/** The fields of a free-form part the morph reads. `planTop` fields left out keep the `plan`'s (its shape too). */
export interface MorphPart { z0: number; z1: number; plan: PlanSpec; planTop?: PlanSpec | null; profile?: MorphProfile }

/** Ring of a plan spec, exactly as the entry harness builds it (same vertex order, the chamfer kept 0.5 m off the half-width). */
export function planRing(p: PlanSpec): P2[] {
  const w = p.w ?? 40, d = p.d ?? 40, n = p.n ?? 48
  if (p.shape === 'polygon' && p.pts) return p.pts.map(([x, y]) => [x, y] as P2)
  if (p.shape === 'ellipse' || p.shape === 'superellipse') {
    const e = p.shape === 'ellipse' ? 2 : (p.exp ?? 4)
    return Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n, c = Math.cos(a), s = Math.sin(a); return [(w / 2) * Math.sign(c) * Math.abs(c) ** (2 / e), (d / 2) * Math.sign(s) * Math.abs(s) ** (2 / e)] as P2 })
  }
  if (p.shape === 'chamfer') { const c = Math.min(p.chamfer ?? 5, w / 2 - 0.5, d / 2 - 0.5), x = w / 2, y = d / 2; return [[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]] }
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
}

export const signedArea = (r: P2[]) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2
export const ringArea = (r: P2[]) => Math.abs(signedArea(r))
const ccw = (r: P2[]) => (signedArea(r) >= 0 ? r : [...r].reverse())
const near = (a: P2, b: P2, tol = 1e-6) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol
const TAU = 2 * Math.PI

/** Consecutive repeated points dropped (the closing point too). */
export function dedupe(r: P2[], tol = 1e-6): P2[] {
  const out: P2[] = []
  for (const p of r) if (!out.length || !near(out[out.length - 1], p, tol)) out.push(p)
  while (out.length > 1 && near(out[0], out[out.length - 1], tol)) out.pop()
  return out
}

/** Convex (no reflex corner beyond a millimetre's worth of turn), for a counter-clockwise ring. */
export function isConvex(ring: P2[]): boolean {
  const r = dedupe(ring)
  if (r.length < 3) return false
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1])
    if (L > 1e-12 && cross / Math.sqrt(L) < -1e-3) return false
  }
  return true
}

/** Outward normal angle of a counter-clockwise ring's edge a→b (radians in [0, 2π)). */
const normalAngle = (a: P2, b: P2) => (Math.atan2(-(b[0] - a[0]), b[1] - a[1]) + TAU) % TAU

function support(r: P2[], th: number): P2 {
  const ux = Math.cos(th), uy = Math.sin(th)
  let best = r[0], bv = -Infinity
  for (const p of r) { const v = p[0] * ux + p[1] * uy; if (v > bv + 1e-12) { bv = v; best = p } }
  return best
}

/** Matched vertex lists by edge direction (both rings convex, counter-clockwise). */
function matchByNormals(A: P2[], B: P2[]): { a: P2[]; b: P2[] } {
  const ang: number[] = []
  for (const r of [A, B]) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9) ang.push(normalAngle(p, q)) }
  ang.sort((x, y) => x - y)
  const u: number[] = []
  for (const x of ang) if (!u.length || x - u[u.length - 1] > 1e-7) u.push(x)
  while (u.length > 1 && u[0] + TAU - u[u.length - 1] <= 1e-7) u.pop()
  const a: P2[] = [], b: P2[] = []
  for (let k = 0; k < u.length; k++) {
    const t0 = u[k], t1 = k + 1 < u.length ? u[k + 1] : u[0] + TAU, mid = (t0 + t1) / 2
    const pa = support(A, mid), pb = support(B, mid)
    if (a.length && near(a[a.length - 1], pa) && near(b[b.length - 1], pb)) continue
    a.push(pa); b.push(pb)
  }
  while (a.length > 1 && near(a[0], a[a.length - 1]) && near(b[0], b[b.length - 1])) { a.pop(); b.pop() }
  return { a, b }
}

function perimeterParams(r: P2[]): { u: number[]; total: number } {
  const len: number[] = [0]
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; len.push(len[i] + Math.hypot(q[0] - p[0], q[1] - p[1])) }
  const total = len[r.length] || 1
  return { u: len.slice(0, r.length).map((x) => x / total), total }
}
function pointAt(r: P2[], u: number[], s: number): P2 {
  const x = ((s % 1) + 1) % 1
  let i = 0
  while (i + 1 < u.length && u[i + 1] <= x) i++
  const u0 = u[i], u1 = i + 1 < u.length ? u[i + 1] : 1, p = r[i], q = r[(i + 1) % r.length]
  const k = u1 - u0 > 1e-12 ? (x - u0) / (u1 - u0) : 0
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
}

/** Matched vertex lists by share of perimeter (any simple rings, counter-clockwise), B's start turned to the best fit. */
function matchByPerimeter(A: P2[], B: P2[]): { a: P2[]; b: P2[] } {
  const pa = perimeterParams(A), pb = perimeterParams(B)
  const N = 64, cost = (phi: number) => { let c = 0; for (let j = 0; j < N; j++) { const p = pointAt(A, pa.u, j / N), q = pointAt(B, pb.u, j / N + phi); c += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 } return c }
  const cands = [...Array.from({ length: 256 }, (_, k) => k / 256), ...pb.u.map((x) => x - pa.u[0])]
  let phi = 0, best = Infinity
  for (const c of cands) { const v = cost(c); if (v < best - 1e-9) { best = v; phi = c } }
  const all = [...pa.u, ...pb.u.map((x) => (((x - phi) % 1) + 1) % 1)].sort((x, y) => x - y)
  const U: number[] = []
  for (const x of all) if (!U.length || x - U[U.length - 1] > 1e-9) U.push(x)
  if (U.length > 1 && U[0] + 1 - U[U.length - 1] <= 1e-9) U.pop()
  return { a: U.map((s) => pointAt(A, pa.u, s)), b: U.map((s) => pointAt(B, pb.u, s + phi)) }
}

export interface MatchedRings {
  /** Shape A's and shape B's vertices, matched one to one (counter-clockwise, same count). */
  a: P2[]
  b: P2[]
  method: 'edge-direction' | 'perimeter'
  /** The farthest any face travels from A to B, along its own normal (m): the arc profile's δ. */
  travel: number
}

/** The two outlines resampled to matching vertices (see the header for the two methods). */
export function matchRings(ringA: P2[], ringB: P2[]): MatchedRings {
  const A = ccw(dedupe(ringA)), B = ccw(dedupe(ringB))
  const convex = isConvex(A) && isConvex(B)
  const { a, b } = convex ? matchByNormals(A, B) : matchByPerimeter(A, B)
  let travel = 0
  for (let k = 0; k < a.length; k++) {
    const j = (k + 1) % a.length, useB = Math.hypot(a[j][0] - a[k][0], a[j][1] - a[k][1]) < 1e-9
    const p = useB ? b[k] : a[k], q = useB ? b[j] : a[j]
    const L = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (L < 1e-9) continue
    const nx = (q[1] - p[1]) / L, ny = -(q[0] - p[0]) / L
    travel = Math.max(travel, Math.abs((b[k][0] - a[k][0]) * nx + (b[k][1] - a[k][1]) * ny), Math.abs((b[j][0] - a[j][0]) * nx + (b[j][1] - a[j][1]) * ny))
  }
  return { a, b, method: convex ? 'edge-direction' : 'perimeter', travel }
}

/** The blend s at height fraction t (0 at z0, 1 at z1) for a profile; `height` and `travel` (m) set the arc's radius. */
export function profileAt(profile: MorphProfile | undefined, t: number, height: number, travel: number): number {
  const x = Math.max(0, Math.min(1, t))
  if (profile !== 'arc' || !(travel > 1e-6) || !(height > 0)) return x
  const R = (height * height + travel * travel) / (2 * travel)
  return Math.min(1, (R - Math.sqrt(Math.max(0, R * R - (x * height) ** 2))) / travel)
}

/** The arc profile's section radius (m) for a part height and face travel; null for a linear profile or no travel. */
export const arcRadius = (height: number, travel: number) => (travel > 1e-6 && height > 0 ? (height * height + travel * travel) / (2 * travel) : null)

/** The top plan: `planTop`'s fields over the `plan`'s. */
export const topPlan = (p: MorphPart): PlanSpec => ({ ...p.plan, ...(p.planTop ?? {}) })

const cache = new Map<string, MatchedRings>()
/** The part's matched rings (cached by plan, top plan; parts are read, never changed). */
export function partMatch(p: MorphPart): MatchedRings {
  const key = JSON.stringify([p.plan, p.planTop ?? null])
  let m = cache.get(key)
  if (!m) {
    m = matchRings(planRing(p.plan), planRing(topPlan(p)))
    if (cache.size > 64) cache.delete(cache.keys().next().value as string)
    cache.set(key, m)
  }
  return m
}

/** The blend at height z (m), clamped to the part. */
export function morphBlend(p: MorphPart, z: number): number {
  const H = p.z1 - p.z0
  return profileAt(p.profile, H > 0 ? (z - p.z0) / H : 1, H, partMatch(p).travel)
}

/** Matched (not deduplicated) vertices at height z: the same count at every height, for slopes and panels. */
export function morphVertices(p: MorphPart, z: number): P2[] {
  const { a, b } = partMatch(p), s = morphBlend(p, z)
  return a.map((q, k) => [q[0] + (b[k][0] - q[0]) * s, q[1] + (b[k][1] - q[1]) * s] as P2)
}

/**
 * The part's plan at height z (m, the same datum as z0/z1): one counter-clockwise ring in the part frame (before
 * rotation, scale and centre). Without `planTop` it is the plan's own ring. The harness calls this per storey at the
 * storey's mid-height, where it now calls baseRing(p.plan).
 */
export function morphPlanAt(p: MorphPart, z: number): P2[] {
  if (!p.planTop) return planRing(p.plan)
  return dedupe(morphVertices(p, z), 1e-4)
}

export interface MorphStorey {
  z0: number
  z1: number
  /** Plate area at mid-height (m²), the plan as the storey is cut. */
  area: number
  /** Steepest face lean in the storey (degrees from vertical; positive leans in, negative oversails). */
  maxSlope: number
  /** Each face of the mid-height plan: width (m), outward normal (degrees counter-clockwise from the part's +x), lean (deg). */
  faces: { width: number; normal: number; slope: number }[]
  /** Largest out-of-plane offset of a storey face's fourth corner from the plane of the other three (m): 0 = flat panels. */
  warp: number
}

/** Per storey {z0, z1}: the plate area at mid-height, the faces' lean between the two slabs, and how flat each face is. */
export function morphStoreys(p: MorphPart, storeys: { z0: number; z1: number }[]): MorphStorey[] {
  const clamp = (z: number) => Math.max(p.z0, Math.min(p.z1, z))
  return storeys.map(({ z0, z1 }) => {
    const lo = morphVertices(p, clamp(z0)), hi = morphVertices(p, clamp(z1)), mid = morphVertices(p, (z0 + z1) / 2)
    const dz = Math.max(1e-9, z1 - z0)
    const faces: MorphStorey['faces'] = []
    let warp = 0
    for (let k = 0; k < mid.length; k++) {
      const j = (k + 1) % mid.length, L = Math.hypot(mid[j][0] - mid[k][0], mid[j][1] - mid[k][1])
      if (L < 1e-3) continue
      const nx = (mid[j][1] - mid[k][1]) / L, ny = -(mid[j][0] - mid[k][0]) / L
      // inward travel of the face line from the lower slab to the upper (the larger at its two ends)
      const ta = -((hi[k][0] - lo[k][0]) * nx + (hi[k][1] - lo[k][1]) * ny), tb = -((hi[j][0] - lo[j][0]) * nx + (hi[j][1] - lo[j][1]) * ny)
      const lean = Math.abs(ta) >= Math.abs(tb) ? ta : tb
      faces.push({ width: L, normal: (Math.atan2(ny, nx) * 180) / Math.PI, slope: (Math.atan2(lean, dz) * 180) / Math.PI })
      warp = Math.max(warp, quadWarp([lo[k][0], lo[k][1], z0], [lo[j][0], lo[j][1], z0], [hi[j][0], hi[j][1], z1], [hi[k][0], hi[k][1], z1]))
    }
    const maxSlope = faces.reduce((m, f) => (Math.abs(f.slope) > Math.abs(m) ? f.slope : m), 0)
    return { z0, z1, area: ringArea(dedupe(mid)), maxSlope, faces, warp }
  })
}

type P3 = [number, number, number]
/** Distance of a quad's fourth corner from the plane through the first three (0 for a degenerate, triangular quad). */
export function quadWarp(a: P3, b: P3, c: P3, d: P3): number {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const L = Math.hypot(n[0], n[1], n[2])
  if (L < 1e-9) return 0 // a, b, c in a line (a zero-length edge): a triangle, flat
  return Math.abs((d[0] - a[0]) * n[0] + (d[1] - a[1]) * n[1] + (d[2] - a[2]) * n[2]) / L
}

/**
 * Facing of each edge of a plan (true-north azimuth of its outward normal, degrees clockwise; edges under `minLen` m
 * left out). `rotationDeg` is the part's rotation (counter-clockwise), `northDeg` true north clockwise from model +y
 * (45 on the competition site, 0 on Real Vancouver), as engine/facade.ts.
 */
export function facetAzimuths(ring: P2[], rotationDeg = 0, northDeg = 0, minLen = 0.5): { azimuth: number; length: number }[] {
  const r = ccw(dedupe(ring)), a = (rotationDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const out: { azimuth: number; length: number }[] = []
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], L = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (L < minLen) continue
    const nx0 = (q[1] - p[1]) / L, ny0 = -(q[0] - p[0]) / L
    const nx = nx0 * c - ny0 * s, ny = nx0 * s + ny0 * c
    const bearing = (Math.atan2(nx, ny) * 180) / Math.PI
    out.push({ azimuth: Math.round(((((bearing - northDeg) % 360) + 360) % 360) * 1e6) / 1e6 % 360, length: L })
  }
  return out
}
