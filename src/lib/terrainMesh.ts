// Error-bounded terrain mesh: right-triangulated irregular network (RTIN), the method of Evans, Kirkpatrick and
// Townsend (2001) as implemented in Mapbox's Martini (ISC licence; re-implemented here, no code copied).
// The grid is cut into tiles of 2^k cells. Inside a tile, flat ground collapses into large triangles while every
// node stays within about maxError of the mesh; tile edges and any node the caller pins keep full resolution, so
// neighbouring tiles share every edge vertex and the surface has no cracks.

const coordCache = new Map<number, Uint16Array>()

/** Corner coordinates (ax, ay, bx, by) of every triangle in the RTIN hierarchy of a tile of `size` cells. */
function triangleCoords(size: number): Uint16Array {
  const cached = coordCache.get(size)
  if (cached) return cached
  const count = size * size * 2 - 2
  const coords = new Uint16Array(count * 4)
  for (let i = 0; i < count; i++) {
    let id = i + 2
    let ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0
    if (id & 1) { bx = by = cx = size } else { ax = ay = cy = size }
    while ((id >>= 1) > 1) {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy } else { ax = bx; ay = by; bx = cx; by = cy }
      cx = mx; cy = my
    }
    coords.set([ax, ay, bx, by], i * 4)
  }
  coordCache.set(size, coords)
  return coords
}

export interface RtinOptions {
  /** Tile size in cells, a power of two. */
  tile: number
  /** Largest allowed vertical gap between a grid node and the mesh (m). */
  maxError: number
  /** Nodes that must stay in the mesh (for example the boundary shared with another mesh). */
  pin?: (col: number, row: number) => boolean
  /** Cells to leave out (for example the inner ring's square); their nodes are pinned too. */
  skipCell?: (col: number, row: number) => boolean
}

/**
 * Triangle indices (into the full cols x rows node grid, row-major) of an error-bounded mesh of heights z.
 * NaN nodes are pinned and every cell touching one is left out, so no-data stays a hole.
 * Cells beyond the last whole tile are emitted at full resolution.
 */
export function rtinIndices(z: Float32Array, cols: number, rows: number, opt: RtinOptions): Uint32Array {
  const S = opt.tile, n = S + 1
  const coords = triangleCoords(S)
  const parents = coords.length / 4 - S * S
  const out: number[] = []
  const skip = (c: number, r: number) => {
    const i = r * cols + c
    if (Number.isNaN(z[i] + z[i + 1] + z[i + cols] + z[i + cols + 1])) return true
    return opt.skipCell ? opt.skipCell(c, r) : false
  }
  const cell = (c: number, r: number) => {
    if (skip(c, r)) return
    const a = r * cols + c
    out.push(a, a + 1, a + cols + 1, a, a + cols + 1, a + cols)
  }
  const tx = Math.floor((cols - 1) / S), ty = Math.floor((rows - 1) / S)
  const err = new Float32Array(n * n)
  for (let t = 0; t < ty; t++) {
    for (let s = 0; s < tx; s++) {
      const c0 = s * S, r0 = t * S
      const h = (x: number, y: number) => z[(r0 + y) * cols + c0 + x]
      err.fill(0)
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const c = c0 + x, r = r0 + y
          const edge = x === 0 || y === 0 || x === S || y === S
          let pinned = edge || Number.isNaN(h(x, y)) || (opt.pin?.(c, r) ?? false)
          if (!pinned && opt.skipCell) {
            // A node of a skipped cell is pinned, so no large triangle can span the hole.
            pinned = (c > 0 && r > 0 && opt.skipCell(c - 1, r - 1)) || (r > 0 && c < cols - 1 && opt.skipCell(c, r - 1))
              || (c > 0 && r < rows - 1 && opt.skipCell(c - 1, r)) || (c < cols - 1 && r < rows - 1 && opt.skipCell(c, r))
          }
          if (pinned) err[y * n + x] = Infinity
        }
      }
      for (let i = coords.length / 4 - 1; i >= 0; i--) {
        const k = i * 4, ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3]
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx
        const m = my * n + mx
        const e = Math.abs((h(ax, ay) + h(bx, by)) / 2 - h(mx, my))
        if (e > err[m] || Number.isNaN(e)) err[m] = Number.isNaN(e) ? Infinity : e
        if (i < parents) {
          const l = ((ay + cy) >> 1) * n + ((ax + cx) >> 1), rr = ((by + cy) >> 1) * n + ((bx + cx) >> 1)
          err[m] = Math.max(err[m], err[l], err[rr])
        }
      }
      const emit = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        if (Math.abs(ax - cx) + Math.abs(ay - cy) === 1) {
          // Finest level: half a cell. Leave it out if its cell is skipped.
          if (skip(c0 + Math.min(ax, bx, cx), r0 + Math.min(ay, by, cy))) return
        }
        // RTIN triangles run clockwise with rows going north; emit a, c, b so faces point up (counter-clockwise).
        out.push((r0 + ay) * cols + c0 + ax, (r0 + cy) * cols + c0 + cx, (r0 + by) * cols + c0 + bx)
      }
      const walk = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1
        if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && err[my * n + mx] > opt.maxError) {
          walk(cx, cy, ax, ay, mx, my)
          walk(bx, by, cx, cy, mx, my)
        } else emit(ax, ay, bx, by, cx, cy)
      }
      walk(0, 0, S, S, S, 0)
      walk(S, S, 0, 0, 0, S)
    }
  }
  // Remainder strips beyond the last whole tile: full resolution.
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) if (c >= tx * S || r >= ty * S) cell(c, r)
  return Uint32Array.from(out)
}
