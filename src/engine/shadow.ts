// Ground shadows on a grid (research P02-M02 / M03). Every occluder (a prism or a triangle) is projected along the
// sun onto the ground plane and scan-filled into a cell mask; a cell is in shadow if its centre falls inside any
// projected shape. Exact for flat ground and straight-walled geometry; no light transport, no trees.

export type Pt = [number, number]

/** A vertical prism: plan ring (no repeated closing point needed) from z0 to z1 (m). */
export interface Prism { ring: Pt[]; z0: number; z1: number }

export interface Occluders {
  prisms: Prism[]
  /** Free triangles, 9 numbers each (x, y, z × 3). */
  tris: number[]
}

export interface Grid { x0: number; y0: number; cell: number; nx: number; ny: number }

export const emptyOccluders = (): Occluders => ({ prisms: [], tris: [] })
export const mergeOccluders = (...o: Occluders[]): Occluders => ({ prisms: o.flatMap((x) => x.prisms), tris: o.flatMap((x) => x.tris) })

/** Grid covering a box with square cells. */
export function gridOver(minX: number, minY: number, maxX: number, maxY: number, cell: number): Grid {
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell)), ny = Math.max(1, Math.ceil((maxY - minY) / cell))
  return { x0: minX, y0: minY, cell, nx, ny }
}

export const cellCentre = (g: Grid, i: number, j: number): Pt => [g.x0 + (i + 0.5) * g.cell, g.y0 + (j + 0.5) * g.cell]

/** Ground displacement per metre of height for a sun direction (to the sun): the shadow of (x, y, z) lands at (x, y) + z · d. */
export function groundOffset(sun: [number, number, number]): Pt {
  return [-sun[0] / sun[2], -sun[1] / sun[2]]
}

/**
 * Scan-fill a polygon into a mask (even-odd, cell centres). Rows outside the polygon's span are skipped, so a small
 * grid is cheap even with many polygons.
 */
export function fillPolygon(mask: Uint8Array, g: Grid, poly: Pt[], value = 1): void {
  const n = poly.length
  if (n < 3) return
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const [x, y] of poly) { if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x }
  if (maxX < g.x0 || minX > g.x0 + g.nx * g.cell || maxY < g.y0 || minY > g.y0 + g.ny * g.cell) return
  const j0 = Math.max(0, Math.ceil((minY - g.y0) / g.cell - 0.5)), j1 = Math.min(g.ny - 1, Math.floor((maxY - g.y0) / g.cell - 0.5))
  const xs: number[] = []
  for (let j = j0; j <= j1; j++) {
    const yc = g.y0 + (j + 0.5) * g.cell
    xs.length = 0
    for (let k = 0, l = n - 1; k < n; l = k++) {
      const [xa, ya] = poly[l], [xb, yb] = poly[k]
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa))
    }
    xs.sort((a, b) => a - b)
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - g.x0) / g.cell - 0.5)), i1 = Math.min(g.nx - 1, Math.floor((xs[q + 1] - g.x0) / g.cell - 0.5))
      for (let i = i0; i <= i1; i++) mask[j * g.nx + i] = value
    }
  }
}

const shift = (ring: Pt[], d: Pt, z: number): Pt[] => ring.map(([x, y]) => [x + d[0] * z, y + d[1] * z])

const ringBoxes = new WeakMap<Prism, [number, number, number, number]>()
function ringBox(p: Prism): [number, number, number, number] {
  let b = ringBoxes.get(p)
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of p.ring) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y }
    ringBoxes.set(p, b)
  }
  return b
}

/** Shadow of everything for one sun direction (cells set to 1). Sun must be above the horizon. */
export function shadowMask(occ: Occluders, g: Grid, sun: [number, number, number], out?: Uint8Array): Uint8Array {
  const mask = out ?? new Uint8Array(g.nx * g.ny)
  if (out) mask.fill(0)
  const d = groundOffset(sun)
  const gx1 = g.x0 + g.nx * g.cell, gy1 = g.y0 + g.ny * g.cell
  for (const p of occ.prisms) {
    const r = p.ring, n = r.length
    if (n < 3 || p.z1 <= p.z0) continue
    // Skip casters whose whole shadow misses the grid, before building any polygon.
    const [bx0, by0, bx1, by1] = ringBox(p)
    const xa = d[0] * p.z0, xb = d[0] * p.z1, ya = d[1] * p.z0, yb = d[1] * p.z1
    if (bx1 + Math.max(xa, xb) < g.x0 || bx0 + Math.min(xa, xb) > gx1 || by1 + Math.max(ya, yb) < g.y0 || by0 + Math.min(ya, yb) > gy1) continue
    // The prism's shadow is its top and bottom rings moved along the sun, joined by the sweep of every wall.
    fillPolygon(mask, g, shift(r, d, p.z1))
    fillPolygon(mask, g, shift(r, d, p.z0))
    for (let k = 0; k < n; k++) {
      const a = r[k], b = r[(k + 1) % n]
      fillPolygon(mask, g, [
        [a[0] + d[0] * p.z0, a[1] + d[1] * p.z0], [b[0] + d[0] * p.z0, b[1] + d[1] * p.z0],
        [b[0] + d[0] * p.z1, b[1] + d[1] * p.z1], [a[0] + d[0] * p.z1, a[1] + d[1] * p.z1],
      ])
    }
  }
  const t = occ.tris
  for (let k = 0; k + 8 < t.length; k += 9) {
    fillPolygon(mask, g, [
      [t[k] + d[0] * t[k + 2], t[k + 1] + d[1] * t[k + 2]],
      [t[k + 3] + d[0] * t[k + 5], t[k + 4] + d[1] * t[k + 5]],
      [t[k + 6] + d[0] * t[k + 8], t[k + 7] + d[1] * t[k + 8]],
    ])
  }
  return mask
}

/** Cells under a building at ground level (not open ground, left out of sun hours and areas). */
export function footprintMask(occ: Occluders, g: Grid): Uint8Array {
  const mask = new Uint8Array(g.nx * g.ny)
  for (const p of occ.prisms) if (p.z0 <= 0.5) fillPolygon(mask, g, p.ring)
  return mask
}

/** Cells whose centre lies inside any of the rings (even-odd per ring). */
export function polygonMask(rings: Pt[][], g: Grid): Uint8Array {
  const mask = new Uint8Array(g.nx * g.ny)
  for (const r of rings) fillPolygon(mask, g, r)
  return mask
}

/** Shoelace area of a ring (m², always positive). */
export function ringArea(r: Pt[]): number {
  let s = 0
  for (let k = 0, l = r.length - 1; k < r.length; l = k++) s += (r[l][0] + r[k][0]) * (r[l][1] - r[k][1])
  return Math.abs(s) / 2
}

/** Triangles of an indexed mesh, placed by a 2D rotation (degrees) and translation. */
export function meshTris(positions: ArrayLike<number>, indices: ArrayLike<number>, place?: { x: number; y: number; deg: number }): number[] {
  const out: number[] = []
  const a = ((place?.deg ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  for (let k = 0; k + 2 < indices.length; k += 3) {
    for (let q = 0; q < 3; q++) {
      const v = indices[k + q] * 3
      const x = positions[v], y = positions[v + 1]
      out.push(place ? place.x + x * c - y * s : x, place ? place.y + x * s + y * c : y, positions[v + 2])
    }
  }
  return out
}
