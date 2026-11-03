// Geometry for drawing a protected view cone as a volume and where a building meets it (Ruijie, 3 Nov). Pure maths, no
// three.js: the cone's estimated lower boundary as a plane, convex clipping, the section of a prism by that plane inside
// the wedge, the half-spaces three.js clips with, and the governing point the view-cone check uses. Display only: the
// numbers shown come from checkFootprint, and the City View Cone Assessment governs.
import { CONE_PARAMS, bisector, limitAt, pointInRing, samplePolygon, type Cone } from './viewCones'

export type P2 = [number, number]
export type P3 = [number, number, number]
/** z = a + b·x + c·y in the frame of the points it is used with. */
export interface LimitPlane { a: number; b: number; c: number }

export const planeZ = (p: LimitPlane, x: number, y: number) => p.a + p.b * x + p.c * y

/** The cone's estimated lower boundary Z = Lv + k·D (D along the bisector) in a frame shifted by `origin`, or null without a slope. */
export function conePlane(cone: Cone, origin: P2 = [0, 0]): LimitPlane | null {
  const prm = CONE_PARAMS[cone.id]
  if (!prm) return null
  const O = cone.ring[0], u = bisector(cone)
  return { a: cone.Lv + prm.k * ((origin[0] - O[0]) * u[0] + (origin[1] - O[1]) * u[1]), b: prm.k * u[0], c: prm.k * u[1] }
}

/** Keep the part of a polygon where the linear function f >= 0 (Sutherland–Hodgman against one half-plane). */
export function clipHalfPlane(poly: P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const fa = f(a), fb = f(b)
    if (fa >= 0) out.push(a)
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

const signedArea = (r: P2[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2
/** Open ring (no repeated closing vertex). */
export const openRing = (r: P2[]): P2[] => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r)

/**
 * Convex hull (monotone chain). The City wedges are convex sectors; cone 28's edge carries three nearly collinear
 * vertices (coordinate rounding) whose hull is 0.0003% larger, so clipping uses the hull (tested for every cone).
 */
export function convexHull(points: P2[]): P2[] {
  const p = [...openRing(points)].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (pts: P2[]) => pts.reduce<P2[]>((h, q) => { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); return h }, [])
  const lower = half(p), upper = half([...p].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Inside-positive linear functions of a convex polygon's edges (its hull, so any winding and stray vertices are fine). */
export function edgeFunctions(ring: P2[]): ((p: P2) => number)[] {
  const r = convexHull(ring), s = Math.sign(signedArea(r)) || 1
  return r.map((p1, i) => {
    const p2 = r[(i + 1) % r.length], ex = p2[0] - p1[0], ey = p2[1] - p1[1]
    return (p: P2) => s * (ex * (p[1] - p1[1]) - ey * (p[0] - p1[0]))
  })
}

/** Clip a polygon by a convex polygon (the view-cone wedges are convex sectors). */
export const clipConvex = (poly: P2[], convex: P2[]) => edgeFunctions(convex).reduce((acc, f) => (acc.length ? clipHalfPlane(acc, f) : acc), openRing(poly))

/**
 * Where a vertical prism (footprint `ring`, from z0 to z1) meets the cone's lower boundary inside the wedge: the
 * footprint ∩ wedge ∩ {z0 <= plane <= z1}, lifted onto the plane. Its outline is the line to draw thick: on the walls it
 * is the trace of the limit on the building, on the roof the line where the limit leaves it, and along the wedge the
 * edge of the protected view inside the mass. Empty when the plane misses the mass.
 */
export function sectionPolygon(ring: P2[], z0: number, z1: number, plane: LimitPlane, wedge: P2[]): P3[] {
  let poly = clipConvex(ring, wedge)
  poly = clipHalfPlane(poly, ([x, y]) => planeZ(plane, x, y) - z0)
  poly = clipHalfPlane(poly, ([x, y]) => z1 - planeZ(plane, x, y))
  return poly.length >= 3 ? poly.map(([x, y]) => [x, y, planeZ(plane, x, y)] as P3) : []
}

/**
 * Half-spaces in three.js world space (x, z-up model → world x, y, −z), as [nx, ny, nz, d] with n·p + d >= 0 kept:
 * above the limit plane, then inside each wedge edge. Clipping a building with all of them leaves exactly its part
 * inside the protected view.
 */
export function protectedHalfSpaces(plane: LimitPlane, wedge: P2[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [[-plane.b, 1, plane.c, -plane.a]]
  const r = convexHull(wedge), s = Math.sign(signedArea(r)) || 1
  r.forEach((p1, i) => {
    const p2 = r[(i + 1) % r.length], ex = p2[0] - p1[0], ey = p2[1] - p1[1]
    // s·(ex·(y − y1) − ey·(x − x1)) with y = −Z, x = X
    out.push([-s * ey, 0, -s * ex, s * (ey * p1[0] - ex * p1[1])])
  })
  return out
}

/**
 * The point the view-cone check governs on: among the same footprint samples (vertices, edges every 2 m, a 5 m grid)
 * inside the cone, the one with the lowest estimated limit. Same inputs, same result as checkFootprint, so a label
 * placed here carries the check's own number.
 */
export function governingPoint(footprint: P2[], cone: Cone): { at: P2; limit: number } | null {
  if (!CONE_PARAMS[cone.id]) return null
  let best: { at: P2; limit: number } | null = null
  for (const p of samplePolygon(footprint)) {
    if (!pointInRing(p, cone.ring)) continue
    const l = limitAt(cone, p) as number
    if (!best || l < best.limit) best = { at: p, limit: l }
  }
  return best
}

// ---------- the cone as a solid seen from its viewpoint (Ruijie, 3 Nov: "make them read as a cone") ----------

/** Upper face where no skyline rises above the lower boundary along a bearing: a fixed visual cap above it (degrees). */
export const SKYLINE_CAP_DEG = 1
const EARTH_R = 6371000, REFRACTION_K = 0.13 // as View from here (research C02)
const drop = (d: number) => ((d * d) / (2 * EARTH_R)) * (1 - REFRACTION_K)

export interface ConeSolid {
  /** The viewpoint: the cone origin at eye level Lv. Every face meets here. */
  apex: P3
  /** The wedge's far edge (densified by bearing) on the estimated lower boundary. */
  bottom: P3[]
  /** The same plan points on the upper face: the sight line from the eye to the skyline (a visual construction). */
  top: P3[]
  /** Per far point: true when no terrain skyline rose above the lower boundary, so the upper face is the fixed cap. */
  capped: boolean[]
}

/**
 * A view cone as a solid from its viewpoint. Lower face: the estimate Z = Lv + k·D (it passes through the eye).
 * Upper face, per bearing: the highest elevation angle from the eye to the terrain out to `maxDist` (curvature with
 * refraction as View from here), i.e. the skyline the protected view frames. The City publishes only the lower boundary,
 * so the upper face is a visual construction (team assumption, unverified). `sample` returns terrain (CGVD28) or null.
 */
export function coneSolid(cone: Cone, origin: P2, sample: (x: number, y: number) => number | null,
  opt: { maxDist?: number; step?: number; densifyDeg?: number } = {}): ConeSolid | null {
  const plane = conePlane(cone, origin)
  if (!plane) return null
  const { maxDist = 25000, step = 60, densifyDeg = 1 } = opt
  const r = openRing(cone.ring.map(([x, y]) => [x - origin[0], y - origin[1]] as P2))
  const O = r[0], far = r.slice(1), Lv = cone.Lv
  const pts: P2[] = []
  far.forEach((p, i) => {
    pts.push(p)
    const q = far[i + 1]
    if (!q) return
    const a = Math.abs(Math.atan2((p[0] - O[0]) * (q[1] - O[1]) - (p[1] - O[1]) * (q[0] - O[0]), (p[0] - O[0]) * (q[0] - O[0]) + (p[1] - O[1]) * (q[1] - O[1])))
    const n = Math.ceil((a * 180) / Math.PI / densifyDeg)
    for (let k = 1; k < n; k++) pts.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n])
  })
  const bottom: P3[] = [], top: P3[] = [], capped: boolean[] = []
  for (const p of pts) {
    const d0 = Math.hypot(p[0] - O[0], p[1] - O[1]), ex = (p[0] - O[0]) / d0, ey = (p[1] - O[1]) / d0
    const zLow = planeZ(plane, p[0], p[1])
    const low = Math.atan2(zLow - Lv, d0)
    let sky = -Infinity
    for (let d = Math.max(step, 300); d <= maxDist; d += step) {
      const h = sample(O[0] + ex * d, O[1] + ey * d)
      if (h !== null) sky = Math.max(sky, Math.atan2(h - Lv - drop(d), d))
    }
    const cap = !(sky > low + 1e-6)
    const up = cap ? low + (SKYLINE_CAP_DEG * Math.PI) / 180 : sky
    bottom.push([p[0], p[1], zLow])
    top.push([p[0], p[1], Lv + d0 * Math.tan(up)])
    capped.push(cap)
  }
  return { apex: [O[0], O[1], Lv], bottom, top, capped }
}

export interface Crossing { index: number; section: P3[] }

/**
 * Existing buildings (footprints with ground and roof, same frame as the plane and wedge) that rise above a cone's
 * estimated lower boundary inside its wedge, with the section of each by that boundary (empty when the whole part
 * inside the wedge is above it). Static data: compute once per cone at load, never per frame.
 */
export function buildingCrossings(footprints: { outer: P2[] }[], ground: ArrayLike<number>, roof: ArrayLike<number>, plane: LimitPlane, wedge: P2[]): Crossing[] {
  const w = convexHull(wedge)
  const xs = w.map((p) => p[0]), ys = w.map((p) => p[1])
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys)
  const out: Crossing[] = []
  footprints.forEach((f, i) => {
    const g = ground[i], t = roof[i]
    if (!Number.isFinite(g) || !Number.isFinite(t) || !(t > g)) return
    let fx0 = Infinity, fx1 = -Infinity, fy0 = Infinity, fy1 = -Infinity
    for (const [x, y] of f.outer) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y) }
    if (fx1 < bx0 || fx0 > bx1 || fy1 < by0 || fy0 > by1) return
    const above = clipHalfPlane(clipConvex(f.outer, w), ([x, y]) => t - planeZ(plane, x, y))
    if (above.length < 3) return
    out.push({ index: i, section: sectionPolygon(f.outer, g, t, plane, w) })
  })
  return out
}

/** Vertices of a cone volume for display: the wedge on the lower boundary, and the same wedge `depth` metres above it. */
export function coneVolumeRings(wedge: P2[], plane: LimitPlane, depth: number): { bottom: P3[]; top: P3[] } {
  const r = openRing(wedge)
  return { bottom: r.map(([x, y]) => [x, y, planeZ(plane, x, y)]), top: r.map(([x, y]) => [x, y, planeZ(plane, x, y) + depth]) }
}
