// Geometry for imported massing (research P14-M02, P14-M04): one triangle mesh in metres, z up, then storey slicing.
// Pure functions, no three.js, so the tests run in Node.

/** Triangle mesh: xyz per vertex, three vertex indices per triangle. */
export interface MeshData { positions: Float64Array | Float32Array | number[]; indices: Uint32Array | number[] }

export interface Bounds { min: [number, number, number]; max: [number, number, number] }

export type Pt = [number, number]

export function bounds(m: MeshData): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const p = m.positions
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  }
  return { min, max }
}

/** Append several meshes into one (indices shifted). */
export function mergeMeshes(list: MeshData[]): MeshData {
  let nv = 0, ni = 0
  for (const m of list) { nv += m.positions.length; ni += m.indices.length }
  const positions = new Float64Array(nv), indices = new Uint32Array(ni)
  let pv = 0, pi = 0
  for (const m of list) {
    positions.set(m.positions as ArrayLike<number>, pv)
    const base = pv / 3
    for (let i = 0; i < m.indices.length; i++) indices[pi + i] = m.indices[i] + base
    pv += m.positions.length; pi += m.indices.length
  }
  return { positions, indices }
}

/**
 * Applies, in order: y-up to z-up (x, y, z) -> (x, -z, y), a unit scale, a counter-clockwise rotation about the
 * file origin and a translation. Works in double precision, so UTM-sized coordinates survive until re-centred.
 */
export function transformMesh(m: MeshData, o: { yUp?: boolean; scale?: number; rotateDeg?: number; translate?: [number, number, number] }): MeshData {
  const s = o.scale ?? 1, a = ((o.rotateDeg ?? 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
  const [tx, ty, tz] = o.translate ?? [0, 0, 0]
  const src = m.positions, out = new Float64Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    let x = src[i], y = src[i + 1], z = src[i + 2]
    if (o.yUp) { const yy = -z; z = y; y = yy }
    x *= s; y *= s; z *= s
    out[i] = x * c - y * sn + tx
    out[i + 1] = x * sn + y * c + ty
    out[i + 2] = z + tz
  }
  return { positions: out, indices: m.indices }
}

/** Signed volume by the divergence theorem (positive when the normals face out). Only meaningful for a closed mesh. */
export function signedVolume(m: MeshData): number {
  const p = m.positions, ix = m.indices
  let v = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  return v / 6
}

/**
 * Cuts the mesh with the plane z = h. Each segment is oriented so the solid lies on its left (outer rings run
 * counter-clockwise seen from above, holes clockwise), as long as the triangle normals face out.
 * Returns a flat list x1, y1, x2, y2 per segment.
 */
export function sliceSegments(m: MeshData, h: number): number[] {
  const p = m.positions, ix = m.indices
  const out: number[] = []
  // Nudge the plane off exact vertex heights so every crossed triangle has exactly two crossing edges.
  const z = h + 1e-7
  const pt = (i: number, j: number): Pt => {
    const zi = p[i + 2], zj = p[j + 2], u = (z - zi) / (zj - zi)
    return [p[i] + u * (p[j] - p[i]), p[i + 1] + u * (p[j + 1] - p[i + 1])]
  }
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3
    const za = p[a + 2] > z, zb = p[b + 2] > z, zc = p[c + 2] > z
    if (za === zb && zb === zc) continue
    const hits: Pt[] = []
    if (za !== zb) hits.push(pt(a, b))
    if (zb !== zc) hits.push(pt(b, c))
    if (zc !== za) hits.push(pt(c, a))
    if (hits.length !== 2) continue
    // Triangle normal (plan part decides the direction of travel).
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz
    let [s, e] = hits
    const dx = e[0] - s[0], dy = e[1] - s[1]
    // Outward normal must point to the right of travel: n . (dy, -dx) > 0.
    if (nx * dy - ny * dx < 0) [s, e] = [e, s]
    if (Math.abs(dx) + Math.abs(dy) < 1e-9) continue
    out.push(s[0], s[1], e[0], e[1])
  }
  return out
}

/** Signed area of oriented segments (shoelace summed per edge): net area for closed, consistently oriented loops. */
export function signedSegmentArea(seg: number[]): number {
  let a = 0
  for (let i = 0; i < seg.length; i += 4) a += seg[i] * seg[i + 3] - seg[i + 2] * seg[i + 1]
  return a / 2
}

/**
 * Area of the region covered at least once (non-zero positive winding), by a scanline sweep. Overlapping solids
 * that were never joined into one count their overlap once, which a plain shoelace sum would count twice.
 */
export function unionSegmentArea(seg: number[]): number {
  const n = seg.length / 4
  if (!n) return 0
  const ys: number[] = []
  for (let i = 0; i < n; i++) ys.push(seg[4 * i + 1], seg[4 * i + 3])
  // Crossing points are events too; between events the covered width changes linearly with y.
  for (let i = 0; i < n; i++) {
    const ax = seg[4 * i], ay = seg[4 * i + 1], bx = seg[4 * i + 2], by = seg[4 * i + 3]
    const minY = Math.min(ay, by), maxY = Math.max(ay, by), minX = Math.min(ax, bx), maxX = Math.max(ax, bx)
    for (let j = i + 1; j < n; j++) {
      const cx = seg[4 * j], cy = seg[4 * j + 1], dx = seg[4 * j + 2], dy = seg[4 * j + 3]
      if (Math.max(cy, dy) < minY || Math.min(cy, dy) > maxY || Math.max(cx, dx) < minX || Math.min(cx, dx) > maxX) continue
      const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy
      const den = rx * sy - ry * sx
      if (Math.abs(den) < 1e-12) continue
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) ys.push(ay + t * ry)
    }
  }
  ys.sort((a, b) => a - b)
  let area = 0
  const xs: [number, number][] = []
  for (let k = 0; k < ys.length - 1; k++) {
    const y0 = ys[k], y1 = ys[k + 1]
    if (y1 - y0 < 1e-9) continue
    const ym = (y0 + y1) / 2
    xs.length = 0
    for (let i = 0; i < n; i++) {
      const ay = seg[4 * i + 1], by = seg[4 * i + 3]
      if ((ay < ym) === (by < ym)) continue
      const ax = seg[4 * i], bx = seg[4 * i + 2]
      // Solid on the left: an edge running down (by < ay) is entered from the left.
      xs.push([ax + ((ym - ay) / (by - ay)) * (bx - ax), by < ay ? 1 : -1])
    }
    xs.sort((a, b) => a[0] - b[0])
    let w = 0, len = 0
    for (let i = 0; i < xs.length; i++) {
      const before = w
      w += xs[i][1]
      if (before > 0 && i > 0) len += xs[i][0] - xs[i - 1][0]
    }
    area += len * (y1 - y0)
  }
  return area
}

/** Chains oriented segments into rings (open chains are returned too, with closed = false). */
export function chainLoops(seg: number[], tol = 1e-3): { ring: Pt[]; closed: boolean }[] {
  const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`
  const n = seg.length / 4
  const byStart = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const k = key(seg[4 * i], seg[4 * i + 1])
    const l = byStart.get(k)
    if (l) l.push(i); else byStart.set(k, [i])
  }
  const used = new Uint8Array(n)
  const out: { ring: Pt[]; closed: boolean }[] = []
  for (let i0 = 0; i0 < n; i0++) {
    if (used[i0]) continue
    used[i0] = 1
    const ring: Pt[] = [[seg[4 * i0], seg[4 * i0 + 1]]]
    const startKey = key(seg[4 * i0], seg[4 * i0 + 1])
    let cur = i0, closed = false
    for (let guard = 0; guard < n; guard++) {
      const ex = seg[4 * cur + 2], ey = seg[4 * cur + 3]
      const k = key(ex, ey)
      if (k === startKey) { closed = true; break }
      ring.push([ex, ey])
      const next = byStart.get(k)?.find((j) => !used[j])
      if (next === undefined) break
      used[next] = 1
      cur = next
    }
    if (ring.length >= 2) out.push({ ring, closed })
  }
  return out
}

/** Drops points that sit on a straight line within tol (m), for lighter outlines. */
export function simplifyRing(ring: Pt[], tol = 0.02): Pt[] {
  if (ring.length < 4) return ring
  const out: Pt[] = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = out.length ? out[out.length - 1] : ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n]
    const abx = c[0] - a[0], aby = c[1] - a[1], L = Math.hypot(abx, aby)
    const d = L < 1e-9 ? Math.hypot(b[0] - a[0], b[1] - a[1]) : Math.abs((b[0] - a[0]) * aby - (b[1] - a[1]) * abx) / L
    if (d > tol) out.push(b)
  }
  return out.length >= 3 ? out : ring
}

export function ringArea(r: Pt[]): number {
  let a = 0
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] }
  return a / 2
}

/** Convex hull of plan points (monotone chain), counter-clockwise. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = [], upper: Pt[] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export function planHull(m: MeshData): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < m.positions.length; i += 3) pts.push([m.positions[i], m.positions[i + 1]])
  return convexHull(pts)
}

/**
 * Union and signed area of a cut. A single closed counter-clockwise ring is a simple plate, so its union is its
 * signed area and the scanline is skipped (dense curved meshes cut into thousands of segments).
 */
export function plateAreas(seg: number[]): { area: number; signed: number; loops: { ring: Pt[]; closed: boolean }[] } {
  const loops = chainLoops(seg)
  const signed = signedSegmentArea(seg)
  const simple = loops.length === 1 && loops[0].closed && signed > 0
  return { area: simple ? signed : unionSegmentArea(seg), signed, loops }
}

/** Plate at one height: union area, net signed area and simplified outline rings. */
export function plateAt(m: MeshData, h: number): { area: number; signed: number; loops: Pt[][]; open: number } {
  const seg = sliceSegments(m, h)
  const { area, signed, loops } = plateAreas(seg)
  return {
    area,
    signed,
    loops: loops.filter((l) => l.closed && l.ring.length >= 3).map((l) => simplifyRing(l.ring).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as Pt)),
    open: loops.filter((l) => !l.closed).length,
  }
}

export interface StoreyBand { z0: number; z1: number; podium: boolean }

/**
 * Storey schedule, the same rule as the parametric towers: podium storeys share the podium height evenly
 * (about podiumF2F each), then whole tower storeys of f2f up to the top; what is left above is crown or parapet.
 */
export function storeySchedule(top: number, f2f: number, podiumTop: number, podiumF2F: number): StoreyBand[] {
  const out: StoreyBand[] = []
  const pt = Math.max(0, Math.min(podiumTop, top))
  const np = pt > 0 ? Math.max(1, Math.round(pt / Math.max(0.5, podiumF2F))) : 0
  for (let i = 0; i < np; i++) out.push({ z0: (i * pt) / np, z1: ((i + 1) * pt) / np, podium: true })
  const step = Math.max(0.5, f2f)
  const nt = Math.max(0, Math.floor((top - pt) / step + 1e-6))
  for (let i = 0; i < nt; i++) out.push({ z0: pt + i * step, z1: pt + (i + 1) * step, podium: false })
  return out
}

/**
 * Finds a podium: the lowest height (below maxZ) where the plate shrinks to under `ratio` of the plate below and
 * stays smaller for the next 10 m. Returns 0 when the mass has no such step. A heuristic (team assumption).
 */
export function detectPodiumTop(m: MeshData, top: number, step = 0.5, maxZ = 80, ratio = 0.7): number {
  const zs: number[] = [], areas: number[] = []
  // The plain signed area is enough to find a step (overlapping solids count twice on both sides of it) and is cheap.
  for (let z = step / 2; z < Math.min(top, maxZ + 10); z += step) { zs.push(z); areas.push(Math.abs(signedSegmentArea(sliceSegments(m, z)))) }
  const look = Math.round(10 / step)
  for (let i = 1; i < areas.length - 1 && zs[i] < maxZ; i++) {
    if (areas[i - 1] < 1 || areas[i] >= ratio * areas[i - 1]) continue
    const after = areas.slice(i, i + look)
    if (after.every((a) => a < ratio * areas[i - 1])) return Math.round((zs[i] - step / 2) * 2) / 2
  }
  return 0
}
