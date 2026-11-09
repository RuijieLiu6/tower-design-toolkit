// Display geometry draped on the terrain exactly as it is drawn (9 Nov: in the Materials view the ground showed through
// the asphalt). The road builder used to set each 12 m road patch at the ground height of its corners; the drawn ground
// between them (the 1 m LiDAR patches, simplified to within 0.15 m, with curbs and crowns; the 30 m top with its cell
// diagonals) rose above the patch by up to 2 m, and by more than the 3.5 cm lift at 27% of the points measured around the
// default site. Here a flat polygon (a road, sidewalk or marking strip, a piece of the site paving) is cut along the drawn
// terrain's own triangles, and every piece takes that triangle's plane plus a fixed lift: the surface follows the drawn
// ground exactly (to float32 rounding, about a millimetre), at whichever terrain detail is shown.
// Display only: the terrain data, the analytical ground (surface.at) and every calculation are unchanged.
// Model frame: x east, y north, z up (metres).
import type { HeightGrid } from './cityLayers'

/** A drawn terrain surface: calls `cb` with every triangle (ax ay az bx by bz cx cy cz) whose box meets the query box. */
export interface DrawnSurface { query(x0: number, y0: number, x1: number, y1: number, cb: (t: Float64Array) => void): void }

/**
 * A regular grid as the terrain mesh draws it: each cell split along its south-west to north-east diagonal (a-b-e, a-e-d,
 * CityContext's terrainGeometry; lib/plinth.ts sampleDrawn). Cells with no data are not drawn and give no triangles;
 * `floor` lifts heights to a level (the flat sea), `skip` leaves cells out (by their south-west corner).
 */
export function gridSurface(g: HeightGrid, opt: { floor?: number; skip?: (x: number, y: number) => boolean } = {}): DrawnSurface {
  const t = new Float64Array(9), f = opt.floor ?? -Infinity
  return {
    query(x0, y0, x1, y1, cb) {
      const c0 = Math.max(0, Math.floor((x0 - g.x0) / g.step)), c1 = Math.min(g.cols - 2, Math.floor((x1 - g.x0) / g.step))
      const r0 = Math.max(0, Math.floor((y0 - g.y0) / g.step)), r1 = Math.min(g.rows - 2, Math.floor((y1 - g.y0) / g.step))
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = g.x0 + c * g.step, y = g.y0 + r * g.step
          if (opt.skip?.(x, y)) continue
          const i = r * g.cols + c
          const a = g.z[i], b = g.z[i + 1], d = g.z[i + g.cols], e = g.z[i + g.cols + 1]
          if (Number.isNaN(a + b + d + e)) continue
          const za = Math.max(f, a), zb = Math.max(f, b), zd = Math.max(f, d), ze = Math.max(f, e), X = x + g.step, Y = y + g.step
          t[0] = x; t[1] = y; t[2] = za; t[3] = X; t[4] = y; t[5] = zb; t[6] = X; t[7] = Y; t[8] = ze; cb(t)
          t[0] = x; t[1] = y; t[2] = za; t[3] = X; t[4] = Y; t[5] = ze; t[6] = x; t[7] = Y; t[8] = zd; cb(t)
        }
      }
    },
  }
}

/**
 * An irregular mesh on a grid's nodes (the LiDAR patches' RTIN triangles: `index` into the grid's nodes, three per
 * triangle), bucketed once for box queries.
 */
export function meshSurface(g: HeightGrid, index: Uint32Array, bucket = 8): DrawnSurface {
  const n = index.length / 3
  const x0 = g.x0, y0 = g.y0, bx = Math.max(1, Math.ceil(((g.cols - 1) * g.step) / bucket) + 1), by = Math.max(1, Math.ceil(((g.rows - 1) * g.step) / bucket) + 1)
  const node = (i: number) => [x0 + (i % g.cols) * g.step, y0 + Math.floor(i / g.cols) * g.step] as const
  // bucket ranges of every triangle, then a compressed bucket -> triangles table
  const ranges = new Int32Array(n * 4), counts = new Uint32Array(bx * by + 1)
  for (let k = 0; k < n; k++) {
    const [ax, ay] = node(index[k * 3]), [bxx, byy] = node(index[k * 3 + 1]), [cx, cy] = node(index[k * 3 + 2])
    const i0 = Math.floor((Math.min(ax, bxx, cx) - x0) / bucket), i1 = Math.floor((Math.max(ax, bxx, cx) - x0) / bucket)
    const j0 = Math.floor((Math.min(ay, byy, cy) - y0) / bucket), j1 = Math.floor((Math.max(ay, byy, cy) - y0) / bucket)
    ranges.set([i0, i1, j0, j1], k * 4)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * bx + i + 1]++
  }
  for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1]
  const fill = counts.slice(0, bx * by), ids = new Uint32Array(counts[bx * by])
  for (let k = 0; k < n; k++) {
    const [i0, i1, j0, j1] = ranges.subarray(k * 4, k * 4 + 4)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ids[fill[j * bx + i]++] = k
  }
  const stamp = new Uint32Array(n)
  let q = 0
  const t = new Float64Array(9)
  return {
    query(qx0, qy0, qx1, qy1, cb) {
      q++
      const i0 = Math.max(0, Math.floor((qx0 - x0) / bucket)), i1 = Math.min(bx - 1, Math.floor((qx1 - x0) / bucket))
      const j0 = Math.max(0, Math.floor((qy0 - y0) / bucket)), j1 = Math.min(by - 1, Math.floor((qy1 - y0) / bucket))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          for (let s = counts[j * bx + i]; s < counts[j * bx + i + 1]; s++) {
            const k = ids[s]
            if (stamp[k] === q) continue
            stamp[k] = q
            for (let v = 0; v < 3; v++) { const id = index[k * 3 + v], [x, y] = node(id); t[v * 3] = x; t[v * 3 + 1] = y; t[v * 3 + 2] = g.z[id] }
            if (Number.isNaN(t[2] + t[5] + t[8])) continue
            cb(t)
          }
        }
      }
    },
  }
}

/** Every triangle of each surface (the near detail: the 30 m top outside the patches, plus the patches). */
export const unionSurface = (...s: DrawnSurface[]): DrawnSurface => ({ query: (a, b, c, d, cb) => { for (const x of s) x.query(a, b, c, d, cb) } })

/**
 * The part of a convex polygon (flat x, y list) inside a triangle (Sutherland–Hodgman against its three edges); [] when
 * they do not meet. The triangle may be wound either way.
 */
export function clipToTriangle(poly: number[], t: ArrayLike<number>): number[] {
  const turn = (t[3] - t[0]) * (t[7] - t[1]) - (t[4] - t[1]) * (t[6] - t[0])
  if (Math.abs(turn) < 1e-9) return []
  const s = Math.sign(turn)
  let out = poly
  for (let e = 0; e < 3 && out.length >= 6; e++) {
    const ax = t[e * 3], ay = t[e * 3 + 1], bx = t[((e + 1) % 3) * 3], by = t[((e + 1) % 3) * 3 + 1]
    const side = (x: number, y: number) => s * ((bx - ax) * (y - ay) - (by - ay) * (x - ax))
    const next: number[] = [], m = out.length / 2
    for (let i = 0; i < m; i++) {
      const px = out[i * 2], py = out[i * 2 + 1], qx = out[((i + 1) % m) * 2], qy = out[((i + 1) % m) * 2 + 1]
      const dp = side(px, py), dq = side(qx, qy)
      if (dp >= 0) next.push(px, py)
      if ((dp >= 0) !== (dq >= 0)) { const k = dp / (dp - dq); next.push(px + (qx - px) * k, py + (qy - py) * k) }
    }
    out = next
  }
  return out.length >= 6 ? out : []
}

/** The plane through a triangle: z = a x + b y + c (null when it is degenerate in plan). */
export function trianglePlane(t: ArrayLike<number>): [number, number, number] | null {
  const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2]
  const nz = ux * vy - uy * vx
  if (Math.abs(nz) < 1e-12) return null
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz
  return [-nx / nz, -ny / nz, t[2] + (nx * t[0] + ny * t[1]) / nz]
}

export interface DrapeStats { pieces: number; triangles: number }
/**
 * Drapes a convex polygon (flat x, y list, any winding) on a drawn surface: one piece per terrain triangle it crosses,
 * each on that triangle's plane plus `lift`, fanned into triangles wound counter-clockwise (facing up). Appends x y z per
 * vertex to `out`. Parts over no terrain triangle (no data) are left out.
 */
export function drapePolygon(poly: number[], surf: DrawnSurface, lift: number, out: number[], stats?: DrapeStats) {
  if (poly.length < 6 || poly.some((v) => !Number.isFinite(v))) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]) }
  surf.query(x0, y0, x1, y1, (t) => {
    if (Math.max(t[0], t[3], t[6]) < x0 || Math.min(t[0], t[3], t[6]) > x1 || Math.max(t[1], t[4], t[7]) < y0 || Math.min(t[1], t[4], t[7]) > y1) return
    const piece = clipToTriangle(poly, t)
    if (!piece.length) return
    const pl = trianglePlane(t)
    if (!pl) return
    const m = piece.length / 2
    let area = 0
    for (let i = 0; i < m; i++) area += piece[i * 2] * piece[((i + 1) % m) * 2 + 1] - piece[((i + 1) % m) * 2] * piece[i * 2 + 1]
    if (Math.abs(area) < 1e-8) return
    const z = (i: number) => pl[0] * piece[i * 2] + pl[1] * piece[i * 2 + 1] + pl[2] + lift
    for (let i = 1; i < m - 1; i++) {
      const [p, q] = area > 0 ? [i, i + 1] : [i + 1, i]
      out.push(piece[0], piece[1], z(0), piece[p * 2], piece[p * 2 + 1], z(p), piece[q * 2], piece[q * 2 + 1], z(q))
    }
    if (stats) { stats.pieces++; stats.triangles += m - 2 }
  })
}

/** The drawn height at a point: the plane of the triangle under it (null over no terrain). */
export function drawnHeight(surf: DrawnSurface, x: number, y: number): number | null {
  let h: number | null = null
  surf.query(x - 1e-6, y - 1e-6, x + 1e-6, y + 1e-6, (t) => {
    if (h !== null) return
    const d = (t[4] - t[7]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[1] - t[7])
    if (!d) return
    const u = ((t[4] - t[7]) * (x - t[6]) + (t[6] - t[3]) * (y - t[7])) / d, v = ((t[7] - t[1]) * (x - t[6]) + (t[0] - t[6]) * (y - t[7])) / d
    if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9) h = u * t[2] + v * t[5] + (1 - u - v) * t[8]
  })
  return h
}

/** A rectangle across a segment (offsets o0..o1 to its left), from t0 to t1 along it, as a flat polygon. */
export function stripPolygon(ax: number, ay: number, ux: number, uy: number, len: number, t0: number, t1: number, o0: number, o1: number): number[] {
  const nx = -uy, ny = ux, p = (t: number, o: number) => [ax + ux * len * t + nx * o, ay + uy * len * t + ny * o]
  return [...p(t0, o0), ...p(t1, o0), ...p(t1, o1), ...p(t0, o1)]
}
