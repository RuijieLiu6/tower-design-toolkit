// The plan geometry of the drawing tools (Ruijie, 17 Nov: bring Sinnie Choi's modelling tools into the main tool). The
// rules are hers, rewritten: Sinnie Choi's Toolkit build (artifact 1794900977-6d89) and her plain-JS Tower Workspace,
// github.com/xubynii/towerdesigntool (index.html, "model: pointer tools"). Pure functions on rings in the project frame
// (x east, y north, metres): area and winding, offsetting an outline, a line that becomes a band, the cut across a mass,
// the booleans (vendor/polygon-clipping), a wall pushed, a wall's length set, copies in a row, rotation, the prism a
// pointer ray hits. Tested in geometry.test.ts.
import { pc, type MultiPoly, type Poly, type Ring } from '../../vendor/polygon-clipping'

export type Pt = [number, number]
export type Ray3 = { o: [number, number, number]; d: [number, number, number] }
const r2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Signed area (positive counter-clockwise). */
export function signedArea(r: Pt[]): number {
  let a = 0
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] }
  return a / 2
}
export const area = (r: Pt[]) => Math.abs(signedArea(r))
/** The winding sign: +1 counter-clockwise, -1 clockwise. */
export const winding = (r: Pt[]): 1 | -1 => (signedArea(r) >= 0 ? 1 : -1)
/** Area of a ring with its holes taken out. */
export const netArea = (pts: Pt[], holes: Pt[][] = []) => area(pts) - holes.reduce((s, h) => s + area(h), 0)

export function centroid(r: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], k = x0 * y1 - x1 * y0; a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k }
  if (Math.abs(a) < 1e-9) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
  return [cx / (3 * a), cy / (3 * a)]
}
export function bbox(r: Pt[]) {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x0, y0, x1, y1, w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
export function inPoly(x: number, y: number, r: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const rectPts = (cx: number, cy: number, w: number, d: number): Pt[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
export const circlePts = (cx: number, cy: number, r: number, n = 28): Pt[] => Array.from({ length: n }, (_, i) => [r2(cx + r * Math.cos((i / n) * Math.PI * 2)), r2(cy + r * Math.sin((i / n) * Math.PI * 2))])
/** The nearest point on a segment and how far along it (0..1). */
export function segDist(q: Pt, a: Pt, b: Pt): { dist: number; t: number } {
  const ex = b[0] - a[0], ey = b[1] - a[1], t = clamp(((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1)
  return { dist: Math.hypot(q[0] - a[0] - ex * t, q[1] - a[1] - ey * t), t }
}

/** The outline moved out (dist > 0) or in, each corner along the bisector of its edge normals. */
export function offsetPoly(pts: Pt[], dist: number): Pt[] {
  const s = winding(pts), n = pts.length
  return pts.map((v, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
    const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]) || 1, l2 = Math.hypot(b[0] - v[0], b[1] - v[1]) || 1
    const n1x = ((v[1] - a[1]) / l1) * s, n1y = (-(v[0] - a[0]) / l1) * s, n2x = ((b[1] - v[1]) / l2) * s, n2y = (-(b[0] - v[0]) / l2) * s
    const k = dist / Math.max(0.25, 1 + n1x * n2x + n1y * n2y)
    return [r2(v[0] + (n1x + n2x) * k), r2(v[1] + (n1y + n2y) * k)]
  })
}

/** A drawn line as a band of width w: centred, inside or outside the line; a closed loop becomes a ring with a courtyard. */
export function pathPoly(pts: Pt[], w: number, align: 'c' | 'i' | 'e', closed: boolean): { pts: Pt[]; holes?: Pt[][] } {
  const lo = align === 'c' ? -w / 2 : align === 'i' ? -w : 0, hi = align === 'c' ? w / 2 : align === 'i' ? 0 : w
  if (closed && pts.length > 2) {
    const a = offsetPoly(pts, hi), b = offsetPoly(pts, lo), A = area(a) >= area(b) ? a : b, B = A === a ? b : a
    return area(B) > 1 ? { pts: A, holes: [B] } : { pts: A }
  }
  const nrm = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] }
  const side = (o: number): Pt[] => pts.map((v, i) => {
    const pr = pts[i - 1], nx = pts[i + 1]
    let n: Pt = [0, 0], k = 1
    if (pr && nx) { const n1 = nrm(pr, v), n2 = nrm(v, nx); n = [n1[0] + n2[0], n1[1] + n2[1]]; k = 1 / Math.max(0.25, 1 + n1[0] * n2[0] + n1[1] * n2[1]) } else n = pr ? nrm(pr, v) : nrm(v, nx)
    return [r2(v[0] + n[0] * k * o), r2(v[1] + n[1] * k * o)]
  })
  return { pts: side(hi).concat(side(lo).reverse()) }
}

// ---------------------------------------------------------------- booleans and the cut
const closeRing = (r: Pt[]): Ring => [...r, r[0]] as Ring
const openRing = (r: Ring): Pt[] => r.slice(0, -1).map((q) => [r2(q[0]), r2(q[1])])
export const asPoly = (pts: Pt[], holes: Pt[][] = []): Poly => [closeRing(pts), ...holes.map(closeRing)]
/** Run a boolean; each result polygon is [outer, ...holes], opened; the tiny ones dropped. */
export function clip(op: 'union' | 'difference' | 'intersection', A: Poly, B: Poly): { pts: Pt[]; holes: Pt[][] }[] {
  let out: MultiPoly
  try { out = pc[op](A, B) } catch { return [] }
  return out.map((pg) => ({ pts: openRing(pg[0]), holes: pg.slice(1).map(openRing) })).filter((pg) => area(pg.pts) > 1)
}

/** Where the line a→b, extended, crosses the ring: the two crossing points either side of the middle, or null. */
export function chordEnds(ring: Pt[], a: Pt, b: Pt): [Pt, Pt] | null {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (L < 1e-6) return null
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux
  const X: { t: number; pt: Pt }[] = []
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], sp = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny, sq = (q[0] - a[0]) * nx + (q[1] - a[1]) * ny
    if (Math.abs(sp - sq) < 1e-12) return
    const f = sp / (sp - sq)
    if (f < -1e-9 || f > 1 + 1e-9) return
    const ff = clamp(f, 0, 1), pt: Pt = [p[0] + (q[0] - p[0]) * ff, p[1] + (q[1] - p[1]) * ff]
    X.push({ t: (pt[0] - a[0]) * ux + (pt[1] - a[1]) * uy, pt })
  })
  X.sort((u, v) => u.t - v.t)
  let lo: { t: number; pt: Pt } | null = null, hi: { t: number; pt: Pt } | null = null
  for (const x of X) { if (x.t <= L / 2 + 1e-9) lo = x; else if (!hi) hi = x }
  if (!(lo && hi && hi.t - lo.t > 0.3)) return null
  const mx = (lo.pt[0] + hi.pt[0]) / 2, my = (lo.pt[1] + hi.pt[1]) / 2
  if (!inPoly(mx + nx * 0.2, my + ny * 0.2, ring) || !inPoly(mx - nx * 0.2, my - ny * 0.2, ring)) return null
  return [lo.pt.map((v) => Math.round(v * 1000) / 1000) as Pt, hi.pt.map((v) => Math.round(v * 1000) / 1000) as Pt]
}

/** The mass cut along the chord: the larger part first, each with its holes; null when the cut misses or does not split it in two. */
export function splitPoly(pts: Pt[], holes: Pt[][], a: Pt, b: Pt): { big: { pts: Pt[]; holes: Pt[][] }; small: { pts: Pt[]; holes: Pt[][] }; seam: [Pt, Pt] } | null {
  const X = chordEnds(pts, a, b)
  if (!X) return null
  const L = Math.hypot(X[1][0] - X[0][0], X[1][1] - X[0][1]), ux = (X[1][0] - X[0][0]) / L, uy = (X[1][1] - X[0][1]) / L, Bg = 1e4
  const half = (k: number): Poly => [closeRing([[X[0][0] - ux * Bg, X[0][1] - uy * Bg], [X[0][0] + ux * Bg, X[0][1] + uy * Bg], [X[0][0] + ux * Bg - uy * Bg * k, X[0][1] + uy * Bg + ux * Bg * k], [X[0][0] - ux * Bg - uy * Bg * k, X[0][1] - uy * Bg + ux * Bg * k]])]
  const Pa = clip('intersection', asPoly(pts, holes), half(1)), Pb = clip('intersection', asPoly(pts, holes), half(-1))
  if (Pa.length !== 1 || Pb.length !== 1) return null
  const [big, small] = area(Pa[0].pts) >= area(Pb[0].pts) ? [Pa[0], Pb[0]] : [Pb[0], Pa[0]]
  return { big, small, seam: X }
}

/** The polygon turned about its centroid (degrees counter-clockwise). */
export function rotatePts(pts: Pt[], deg: number, about: Pt = centroid(pts)): Pt[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return pts.map((q) => [r2(about[0] + (q[0] - about[0]) * c - (q[1] - about[1]) * s), r2(about[1] + (q[0] - about[0]) * s + (q[1] - about[1]) * c)])
}
export const shiftPts = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((q) => [r2(q[0] + dx), r2(q[1] + dy)])

/** The outward unit normal of edge i (from pts[i] to pts[i+1]). */
export function edgeNormal(pts: Pt[], i: number): Pt {
  const s = winding(pts), a = pts[i], b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1
  return [(ey / l) * s, (-ex / l) * s]
}
/** Wall i pushed out by d metres (in when negative): both its corners move along the wall's normal. */
export function pushWall(pts: Pt[], i: number, d: number): Pt[] {
  const n = edgeNormal(pts, i), out = pts.map((q) => [...q] as Pt), k = pts.length
  for (const j of [i, (i + 1) % k]) { out[j][0] = r2(out[j][0] + n[0] * d); out[j][1] = r2(out[j][1] + n[1] * d) }
  return out
}
/** Wall i set to a new length: its far corner slides along the wall, and the corner after it follows (a box stays a box). */
export function setWallLength(pts: Pt[], i: number, len: number): Pt[] {
  const k = pts.length, out = pts.map((q) => [...q] as Pt), a = out[i], b = out[(i + 1) % k], c = out[(i + 2) % k]
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = ((b[0] - a[0]) / l) * (len - l), dy = ((b[1] - a[1]) / l) * (len - l)
  b[0] = r2(b[0] + dx); b[1] = r2(b[1] + dy)
  if (k > 3) { c[0] = r2(c[0] + dx); c[1] = r2(c[1] + dy) }
  return out
}
/** The wall of the mass closest to a point, by distance and facing the given direction. */
export function nearestWall(pts: Pt[], q: Pt, toward?: Pt): number {
  let bi = 0, bs = -Infinity
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], n = edgeNormal(pts, i), { dist } = segDist(q, a, b)
    const facing = toward ? n[0] * toward[0] + n[1] * toward[1] : 0
    if (facing - dist > bs) { bs = facing - dist; bi = i }
  })
  return bi
}
/** n copies in a row at the same spacing (the original is not among them). */
export const arrayCopies = (pts: Pt[], dx: number, dy: number, n: number): Pt[][] => Array.from({ length: Math.max(0, n - 1) }, (_, i) => shiftPts(pts, dx * (i + 1), dy * (i + 1)))

// ---------------------------------------------------------------- what a pointer ray meets
export interface Prism { id: string; pts: Pt[]; base: number; top: number }
export interface PrismHit { id: string; face: 'top' | 'wall'; wall: number; point: [number, number, number]; dist: number }
/** Where the ray meets the horizontal plane at z. */
export function planeHit(ray: Ray3, z: number): Pt | null {
  if (Math.abs(ray.d[2]) < 1e-9) return null
  const k = (z - ray.o[2]) / ray.d[2]
  return k > 0 ? [ray.o[0] + ray.d[0] * k, ray.o[1] + ray.d[1] * k] : null
}
/** The first prism the ray meets: its roof, or one of its walls (edge i from pts[i] to pts[i+1]). */
export function hitPrisms(prisms: Prism[], ray: Ray3): PrismHit | null {
  let best: PrismHit | null = null
  const take = (h: PrismHit) => { if (!best || h.dist < best.dist) best = h }
  for (const p of prisms) {
    if (p.top - p.base <= 0) continue
    // the roof
    if (Math.abs(ray.d[2]) > 1e-9) {
      const k = (p.top - ray.o[2]) / ray.d[2]
      if (k > 0) { const x = ray.o[0] + ray.d[0] * k, y = ray.o[1] + ray.d[1] * k; if (inPoly(x, y, p.pts)) take({ id: p.id, face: 'top', wall: -1, point: [x, y, p.top], dist: k }) }
    }
    // the walls: a vertical quad each
    p.pts.forEach((a, i) => {
      const b = p.pts[(i + 1) % p.pts.length], n = edgeNormal(p.pts, i)
      const denom = n[0] * ray.d[0] + n[1] * ray.d[1]
      if (Math.abs(denom) < 1e-9) return
      const k = (n[0] * (a[0] - ray.o[0]) + n[1] * (a[1] - ray.o[1])) / denom
      if (k <= 0) return
      const x = ray.o[0] + ray.d[0] * k, y = ray.o[1] + ray.d[1] * k, z = ray.o[2] + ray.d[2] * k
      if (z < p.base - 1e-6 || z > p.top + 1e-6) return
      const { dist, t } = segDist([x, y], a, b)
      if (dist > 1e-3 || t <= 0 || t >= 1) return
      take({ id: p.id, face: 'wall', wall: i, point: [x, y, z], dist: k })
    })
  }
  return best
}

/** The polygon as a closed prism mesh (project frame, z up): positions xyz and triangle indices; the caps from `cap`. */
export function prismMesh(pts: Pt[], holes: Pt[][], base: number, top: number, cap: (pts: Pt[], holes: Pt[][]) => number[]): { positions: number[]; indices: number[] } {
  const rings = [pts, ...holes]
  const positions: number[] = [], indices: number[] = []
  const flat: Pt[] = rings.flat()
  // bottom and top vertices of every ring point
  for (const q of flat) positions.push(q[0], q[1], base)
  const topOff = flat.length
  for (const q of flat) positions.push(q[0], q[1], top)
  const capTri = cap(pts, holes) // indices into `flat`
  for (let i = 0; i < capTri.length; i += 3) {
    const a = capTri[i], b = capTri[i + 1], c = capTri[i + 2]
    indices.push(topOff + a, topOff + b, topOff + c) // top, counter-clockwise seen from above
    indices.push(a, c, b) // bottom, facing down
  }
  // walls
  let off = 0
  rings.forEach((ring, ri) => {
    const n = ring.length, outer = ri === 0, ccw = winding(ring) === 1
    for (let i = 0; i < n; i++) {
      const a = off + i, b = off + ((i + 1) % n)
      // outward for the outer ring (ccw: left-hand rule), inward for holes
      if (ccw === outer) indices.push(a, b, topOff + b, a, topOff + b, topOff + a)
      else indices.push(b, a, topOff + a, b, topOff + a, topOff + b)
    }
    off += n
  })
  return { positions, indices }
}
