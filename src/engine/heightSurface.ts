// View-cone max-height surface (Context Model C01-M03): at every point, the lowest estimated lower-boundary
// elevation of all the cones that cover it. A point covered by any cone without an estimate is "limit unknown":
// that cone could be the lowest, so no number is given. Same maths as checkFootprint (Z = Lv + k * D).
// Every value is an ESTIMATE; the City View Cone Assessment governs.
import { CONES, CONE_PARAMS, edgeDistance, limitAt, pointInRing, type Cone } from './viewCones'

export type LimitState = 'none' | 'unknown' | 'limit'

export interface HeightAt {
  /** none: no protected view covers the point; unknown: a covering cone has no estimate; limit: every covering cone has one. */
  state: LimitState
  /** Lowest estimated limit (geodetic m), only when state is 'limit'. */
  limit: number | null
  /** The cone that sets the limit. */
  governing: Cone | null
  /** That cone's 95% uncertainty (m). */
  u95: number | null
  covering: Cone[]
  /** Covering cones without an estimate. */
  unknown: Cone[]
  /** Within 1.5 m of a cone boundary: the answer may change across the line (checkFootprint's near-edge band). */
  nearEdge: boolean
}

interface Box { x0: number; y0: number; x1: number; y1: number }
const BOXES: Box[] = CONES.map((c) => {
  const xs = c.ring.map((p) => p[0]), ys = c.ring.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
})

/** The max-height answer at one point (EPSG:26910). */
export function maxHeightAt(p: [number, number]): HeightAt {
  const covering: Cone[] = [], unknown: Cone[] = []
  let limit: number | null = null, governing: Cone | null = null, nearEdge = false
  CONES.forEach((cone, i) => {
    const b = BOXES[i]
    if (p[0] < b.x0 - 2 || p[0] > b.x1 + 2 || p[1] < b.y0 - 2 || p[1] > b.y1 + 2) return
    if (edgeDistance(p, cone.ring) < 1.5) nearEdge = true
    if (!pointInRing(p, cone.ring)) return
    covering.push(cone)
    const z = limitAt(cone, p)
    if (z === null) unknown.push(cone)
    else if (limit === null || z < limit) { limit = z; governing = cone }
  })
  if (!covering.length) return { state: 'none', limit: null, governing: null, u95: null, covering, unknown, nearEdge }
  if (unknown.length) return { state: 'unknown', limit: null, governing: null, u95: null, covering, unknown, nearEdge }
  const g = governing as Cone | null
  return { state: 'limit', limit, governing: g, u95: g ? CONE_PARAMS[g.id].u95 : null, covering, unknown, nearEdge }
}

/** A raster of the surface. Cell centres sit at x0 + (c + 0.5) * step, y0 + (r + 0.5) * step; rows run south to north. */
export interface LimitGrid {
  x0: number; y0: number; step: number; cols: number; rows: number
  /** 0 none, 1 unknown, 2 limit. */
  state: Uint8Array
  /** Geodetic limit (m) where state is 2, NaN elsewhere. */
  limit: Float32Array
  /** Index into CONES of the governing cone, -1 where there is none. */
  governing: Int16Array
}

/** Compute the surface over a box (EPSG:26910). Each cone only visits the cells inside its bounding box. */
export function limitGrid(box: Box, step: number): LimitGrid {
  const cols = Math.max(1, Math.ceil((box.x1 - box.x0) / step)), rows = Math.max(1, Math.ceil((box.y1 - box.y0) / step))
  const n = cols * rows
  const covered = new Uint8Array(n), unknown = new Uint8Array(n)
  const limit = new Float32Array(n).fill(Infinity), governing = new Int16Array(n).fill(-1)
  CONES.forEach((cone, i) => {
    const b = BOXES[i]
    const c0 = Math.max(0, Math.floor((b.x0 - box.x0) / step)), c1 = Math.min(cols - 1, Math.ceil((b.x1 - box.x0) / step))
    const r0 = Math.max(0, Math.floor((b.y0 - box.y0) / step)), r1 = Math.min(rows - 1, Math.ceil((b.y1 - box.y0) / step))
    const param = CONE_PARAMS[cone.id]
    for (let r = r0; r <= r1; r++) {
      const y = box.y0 + (r + 0.5) * step
      for (let c = c0; c <= c1; c++) {
        const x = box.x0 + (c + 0.5) * step
        if (!pointInRing([x, y], cone.ring)) continue
        const k = r * cols + c
        covered[k] = 1
        if (!param) { unknown[k] = 1; continue }
        const z = limitAt(cone, [x, y]) as number
        if (z < limit[k]) { limit[k] = z; governing[k] = i }
      }
    }
  })
  const state = new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    state[k] = !covered[k] ? 0 : unknown[k] ? 1 : 2
    if (state[k] !== 2) { limit[k] = NaN; governing[k] = -1 }
  }
  return { x0: box.x0, y0: box.y0, step, cols, rows, state, limit, governing }
}

/** Cones the spec keeps at "limit unknown" until the 1008 Cambie roof test passes (CONTEXT_MODEL_SPEC.md s11). */
export const ROOF_ALIGNED = ['E', 'G1', 'G2', 'J1', '9.1', '9.2', '22']
