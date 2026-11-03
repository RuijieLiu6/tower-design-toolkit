// The site model's base, built like a physical model: the ground (terrain or the flat competition site) on top,
// vertical skirt walls down to a flat bottom, and a crisp line along the top edge. One source for the plinth's extent,
// shared by the scenes that draw it and by the camera clamp (lib/cameraClamp.ts) that keeps the view above it.
import * as THREE from 'three'
import type { VtcContext } from '../context'
import { sampleGrid, type HeightGrid } from './cityLayers'

/** A rectangle in the model frame (x east, y north, metres) and the height of the base's underside. */
export interface Plinth { x0: number; y0: number; x1: number; y1: number; bottom: number }

/**
 * Real Vancouver: the inner terrain ring (MRDEM 30 m, to y = 6 km in the north), widened to hold every building
 * (east to x = 6,976 m) and every City layer draped on the ground (parks, zoning and shoreline reach the Fraser at
 * y = -8,934 m and Pacific Spirit at x = -8,547 m). Every side lies on a node line shared by R1 (30 m) and R2 (30 m
 * detail and 60 m), so the top, the walls and the mountain backdrop meet without seams. 15.8 × 15 km, 160 m deep.
 */
export const CITY_PLINTH: Plinth = { x0: -8640, y0: -9000, x1: 7140, y1: 6000, bottom: -160 }

/** Real Vancouver's sea: the flat water surface inside the plinth (MRDEM reads water about 2 m lower). */
export const SEA_Z = -0.05

/** Competition site without its context model: the site with room around it. */
const VTC_DEFAULT: Plinth = { x0: -300, y0: -200, x1: 300, y1: 200, bottom: -16 }

/**
 * Competition site: the context model's extent (blocks, curbs, buildings and street labels) plus a margin, rounded
 * out to 10 m, on a 16 m deep base (about 3 cm at 1:500).
 */
export function vtcPlinth(ctx: VtcContext | null, margin = 20): Plinth {
  if (!ctx) return VTC_DEFAULT
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = ([x, y]: [number, number]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (const ring of [...ctx.blocks, ...ctx.curbs]) ring.forEach(add)
  for (const b of [...ctx.buildings, ...ctx.heritage]) {
    if ('footprint' in b) b.footprint.forEach(add)
    else for (let i = 0; i + 1 < b.positions.length; i += 3) add([b.positions[i], b.positions[i + 1]])
  }
  ctx.labels.forEach((l) => add(l.at))
  if (ctx.site) ctx.site.outline.forEach(add)
  if (!Number.isFinite(x0)) return VTC_DEFAULT
  const out = (v: number, up: boolean) => (up ? Math.ceil : Math.floor)(v / 10) * 10
  return { x0: out(x0 - margin, false), y0: out(y0 - margin, false), x1: out(x1 + margin, true), y1: out(y1 + margin, true), bottom: VTC_DEFAULT.bottom }
}

export const insidePlinth = (p: Plinth, x: number, y: number) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1

/**
 * The city plinth's top as one 30 m grid on R1's nodes: R1 where it reaches, R2 (detail 30 m or base 60 m, sampled on
 * the same nodes) around it.
 */
export function plinthTopGrid(r1: HeightGrid, r2: HeightGrid, p: Plinth = CITY_PLINTH): HeightGrid {
  const step = r1.step
  const cols = Math.round((p.x1 - p.x0) / step) + 1, rows = Math.round((p.y1 - p.y0) / step) + 1
  const z = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = p.x0 + k * step, y = p.y0 + r * step
      const c1 = Math.round((x - r1.x0) / step), r1r = Math.round((y - r1.y0) / step)
      z[r * cols + k] = c1 >= 0 && c1 < r1.cols && r1r >= 0 && r1r < r1.rows ? r1.z[r1r * r1.cols + c1] : (sampleGrid(r2, x, y) ?? NaN)
    }
  }
  return { cols, rows, step, x0: p.x0, y0: p.y0, z, source: r1.source }
}

/**
 * Height on a grid as the regular terrain mesh draws it: each cell is split along its south-west to north-east
 * diagonal (triangles a-b-e and a-e-d in CityContext's terrainGeometry), so the value is exactly on the drawn surface.
 */
export function sampleDrawn(g: HeightGrid, x: number, y: number): number | null {
  const fc = (x - g.x0) / g.step, fr = (y - g.y0) / g.step
  if (!(fc >= 0 && fr >= 0 && fc <= g.cols - 1 && fr <= g.rows - 1)) return null
  const c = Math.min(Math.floor(fc), g.cols - 2), r = Math.min(Math.floor(fr), g.rows - 2)
  const u = fc - c, v = fr - r, i = r * g.cols + c
  const a = g.z[i], b = g.z[i + 1], d = g.z[i + g.cols], e = g.z[i + g.cols + 1]
  const h = u >= v ? a + u * (b - a) + v * (e - b) : a + v * (d - a) + u * (e - d)
  return Number.isNaN(h) ? null : h
}

/**
 * The top edge, walked counter-clockwise from the south-west corner (x, y, z), with a point every `step` metres.
 * A step aligned with the top grid puts a point on every boundary node, so the walls meet the top exactly.
 */
export function plinthRing(p: Plinth, top: (x: number, y: number) => number, step = Infinity): [number, number, number][] {
  const corners: [number, number][] = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]]
  const ring: [number, number, number][] = []
  corners.forEach(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % 4]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step - 1e-9))
    for (let s = 0; s < n; s++) {
      const x = ax + ((bx - ax) * s) / n, y = ay + ((by - ay) * s) / n
      ring.push([x, y, top(x, y)])
    }
  })
  return ring
}

/**
 * A vertical wall under a polyline, down to `bottom`, as triangle positions. It faces the right-hand side of the
 * direction of travel, which is outward for a counter-clockwise ring.
 */
export function skirtPositions(line: [number, number, number][], bottom: number, closed = false): number[] {
  const pos: number[] = []
  const n = closed ? line.length : line.length - 1
  for (let i = 0; i < n; i++) {
    const a = line[i], b = line[(i + 1) % line.length]
    pos.push(a[0], a[1], bottom, b[0], b[1], bottom, b[0], b[1], b[2])
    pos.push(a[0], a[1], bottom, b[0], b[1], b[2], a[0], a[1], a[2])
  }
  return pos
}

export type Side = 'south' | 'east' | 'north' | 'west'
const SIDES: Side[] = ['south', 'east', 'north', 'west']

/**
 * Skirt walls (facing out) from the ring down to the base's underside, the underside itself (facing down), and the
 * edge line just outside the top edge (`pad` metres out, so it never fights the ground for depth) on the given sides
 * (leave out a side where scenery carries the ground on, as the city's mountain backdrop does in the north).
 */
export function plinthGeometry(p: Plinth, ring: [number, number, number][], pad = 0.5, edges: Side[] = SIDES): { solid: THREE.BufferGeometry; edge: THREE.BufferGeometry } {
  const pos = skirtPositions(ring, p.bottom, true), line: number[] = []
  const outward = ([x, y]: [number, number, number]) => [
    x + (x <= p.x0 ? -pad : x >= p.x1 ? pad : 0), y + (y <= p.y0 ? -pad : y >= p.y1 ? pad : 0)]
  const side = (a: [number, number, number], b: [number, number, number]): Side =>
    a[1] <= p.y0 && b[1] <= p.y0 ? 'south' : a[0] >= p.x1 && b[0] >= p.x1 ? 'east' : a[1] >= p.y1 && b[1] >= p.y1 ? 'north' : 'west'
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if (!edges.includes(side(a, b))) continue
    const [ax, ay] = outward(a), [bx, by] = outward(b)
    line.push(ax, ay, a[2], bx, by, b[2])
  }
  // Underside: clockwise seen from above, so it faces down.
  const q = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]]
  for (const [i, j, k] of [[0, 2, 1], [0, 3, 2]]) pos.push(q[i][0], q[i][1], p.bottom, q[j][0], q[j][1], p.bottom, q[k][0], q[k][1], p.bottom)
  const solid = new THREE.BufferGeometry()
  solid.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  solid.computeVertexNormals()
  const edge = new THREE.BufferGeometry()
  edge.setAttribute('position', new THREE.Float32BufferAttribute(line, 3))
  return { solid, edge }
}
