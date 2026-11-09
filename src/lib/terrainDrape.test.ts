// Roads draped on the drawn terrain (9 Nov, the Materials road-surface defect). The failure: a road strip set at the ground
// height of its corners dips under the drawn terrain between them (a crest, a curb, a cell diagonal), and the ground shows
// through. Draping cuts the strip along the terrain's own triangles, so at every point the road is the terrain plus its
// lift. Checked at triangle corners, edge midpoints and centres, on flat and sloping ground, a crest between road
// vertices, a junction, a boundary between the 1 m detail and the 30 m top (both details), a bridge and its approach, and
// invalid segments. Tolerance: 1 mm in double precision (the draping maths), 2 mm after float32 storage (positions of a
// few kilometres keep about 0.5 mm): far below the 3.5 cm lift and below any visible step.
import { describe, expect, it } from 'vitest'
import { clipToTriangle, drapePolygon, drawnHeight, gridSurface, meshSurface, stripPolygon, trianglePlane, unionSurface, type DrawnSurface } from './terrainDrape'
import { rtinIndices } from './terrainMesh'
import type { HeightGrid } from './cityLayers'
import { DECK, LEFT, MAJOR, RIGHT, deckHeights, streetGeometry, type StreetDrape, type Streets } from '../components/VistaStreets'

const grid = (cols: number, rows: number, step: number, x0: number, y0: number, f: (x: number, y: number) => number): HeightGrid => {
  const z = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) z[r * cols + c] = f(x0 + c * step, y0 + r * step)
  return { cols, rows, step, x0, y0, z }
}
const LIFT = 0.035
/** Road minus drawn terrain at every corner, edge midpoint and centre of the draped triangles. */
function deviations(pos: ArrayLike<number>, surf: DrawnSurface): number[] {
  const out: number[] = []
  for (let t = 0; t + 8 < pos.length; t += 9) {
    const A = [pos[t], pos[t + 1], pos[t + 2]], B = [pos[t + 3], pos[t + 4], pos[t + 5]], C = [pos[t + 6], pos[t + 7], pos[t + 8]]
    const mid = (P: number[], Q: number[]) => P.map((v, i) => (v + Q[i]) / 2)
    for (const q of [A, B, C, mid(A, B), mid(B, C), mid(C, A), [0, 1, 2].map((i) => (A[i] + B[i] + C[i]) / 3)]) {
      const h = drawnHeight(surf, q[0], q[1])
      if (h !== null) out.push(q[2] - h)
    }
  }
  return out
}
const area = (pos: ArrayLike<number>) => { let a = 0; for (let t = 0; t + 8 < pos.length; t += 9) a += Math.abs((pos[t + 3] - pos[t]) * (pos[t + 7] - pos[t + 1]) - (pos[t + 6] - pos[t]) * (pos[t + 4] - pos[t + 1])) / 2; return a }
const facesUp = (pos: ArrayLike<number>) => { for (let t = 0; t + 8 < pos.length; t += 9) if ((pos[t + 3] - pos[t]) * (pos[t + 7] - pos[t + 1]) - (pos[t + 6] - pos[t]) * (pos[t + 4] - pos[t + 1]) <= 0) return false; return true }

describe('clipping and planes', () => {
  it('clips a convex polygon to a triangle wound either way', () => {
    const sq = [0, 0, 10, 0, 10, 10, 0, 10]
    const ccw = [0, 0, 0, 10, 0, 0, 0, 10, 0], cw = [0, 0, 0, 0, 10, 0, 10, 0, 0]
    for (const t of [ccw, cw]) { const p = clipToTriangle(sq, t); let a = 0; const m = p.length / 2; for (let i = 0; i < m; i++) a += p[i * 2] * p[((i + 1) % m) * 2 + 1] - p[((i + 1) % m) * 2] * p[i * 2 + 1]; expect(Math.abs(a) / 2).toBeCloseTo(50, 6) }
    expect(clipToTriangle(sq, [20, 20, 0, 30, 20, 0, 20, 30, 0])).toEqual([])
  })
  it('finds the plane through a triangle', () => {
    const pl = trianglePlane([0, 0, 1, 10, 0, 2, 0, 10, 3])!
    expect(pl[0] * 4 + pl[1] * 6 + pl[2]).toBeCloseTo(1 + 0.4 + 1.2, 9)
    expect(trianglePlane([0, 0, 0, 1, 1, 0, 2, 2, 0])).toBeNull() // degenerate in plan
  })
})

describe('draping a road on the drawn terrain', () => {
  const road = stripPolygon(5, 7, Math.SQRT1_2, Math.SQRT1_2, 70, 0, 1, -6, 6) // 70 m long, 12 m wide, at 45°

  it('flat ground: the road is the ground plus its lift, with its whole area, facing up', () => {
    const s = gridSurface(grid(6, 6, 30, -30, -30, () => 12))
    const pos: number[] = []
    drapePolygon(road, s, LIFT, pos)
    expect(area(pos)).toBeCloseTo(70 * 12, 6)
    expect(facesUp(pos)).toBe(true)
    for (const d of deviations(pos, s)) expect(Math.abs(d - LIFT)).toBeLessThan(1e-3)
  })

  it('sloping ground: the same, the road follows the slope', () => {
    const s = gridSurface(grid(6, 6, 30, -30, -30, (x, y) => 20 + 0.08 * x - 0.05 * y))
    const pos: number[] = []
    drapePolygon(road, s, LIFT, pos)
    expect(area(pos)).toBeCloseTo(70 * 12, 6)
    for (const d of deviations(pos, s)) expect(Math.abs(d - LIFT)).toBeLessThan(1e-3)
  })

  it('a crest between road vertices: corner sampling dips under it, draping does not', () => {
    // a 1 m grid with a 0.4 m crown across the road's middle, meshed as the patches are (RTIN within 0.15 m)
    const g = grid(65, 65, 1, 0, 0, (x) => 10 + 0.4 * Math.exp(-(((x - 32) / 3) ** 2)))
    const s = meshSurface(g, rtinIndices(g.z, g.cols, g.rows, { tile: 64, maxError: 0.15 }))
    // the old way: one 12 m patch from x = 26 to 38, at its corners' ground
    const z0 = drawnHeight(s, 26, 30)!, z1 = drawnHeight(s, 38, 30)!
    const oldMid = (z0 + z1) / 2 + LIFT
    expect(drawnHeight(s, 32, 30)! - oldMid).toBeGreaterThan(0.2) // the ground stands 0.2 m+ above the old asphalt
    const pos: number[] = []
    drapePolygon(stripPolygon(20, 30, 1, 0, 24, 0, 1, -4, 4), s, LIFT, pos)
    const d = deviations(pos, s)
    expect(d.length).toBeGreaterThan(50)
    for (const v of d) expect(Math.abs(v - LIFT)).toBeLessThan(1e-3)
  })

  it('a junction and a bend: crossing strips each follow the ground, with no gaps in either', () => {
    const s = gridSurface(grid(8, 8, 30, -60, -60, (x, y) => 5 + 3 * Math.sin(x / 40) + 2 * Math.cos(y / 35)))
    const a: number[] = [], b: number[] = [], c: number[] = []
    drapePolygon(stripPolygon(-50, 0, 1, 0, 100, 0, 1, -5, 5), s, LIFT, a) // east-west
    drapePolygon(stripPolygon(0, -50, 0, 1, 100, 0, 1, -5, 5), s, LIFT, b) // north-south, crossing it
    drapePolygon(stripPolygon(0, 0, Math.cos(0.6), Math.sin(0.6), 40, 0, 1, -4, 4), s, LIFT, c) // a bend leaving the junction
    for (const [pos, A] of [[a, 1000], [b, 1000], [c, 320]] as const) { expect(area(pos)).toBeCloseTo(A, 4); for (const d of deviations(pos, s)) expect(Math.abs(d - LIFT)).toBeLessThan(1e-3) }
  })

  it('across a boundary between the 1 m detail and the 30 m top, at both details', () => {
    // a 30 m top over 0..240 with one 60 m square of 1 m detail at 60..120 (two by two cells: the holes)
    const f = (x: number, y: number) => 8 + 0.03 * x + 0.3 * Math.sin(x / 3) * Math.sin(y / 4)
    const top = grid(9, 9, 30, 0, 0, f), patch = grid(61, 61, 1, 60, 60, f)
    const hole = (x: number, y: number) => x >= 60 && x < 120 && y >= 60 && y < 120
    const outside = gridSurface(top, { skip: hole }), near = meshSurface(patch, rtinIndices(patch.z, 61, 61, { tile: 64, maxError: 0.15 })), far = gridSurface(top, { skip: (x, y) => !hole(x, y) })
    const strip = stripPolygon(30, 90, 1, 0, 120, 0, 1, -6, 6) // runs from the top into the detail and out again
    for (const inner of [near, far]) {
      const o: number[] = [], i: number[] = []
      drapePolygon(strip, outside, LIFT, o)
      drapePolygon(strip, inner, LIFT, i)
      expect(area(o) + area(i)).toBeCloseTo(120 * 12, 3) // no gap where the details meet
      for (const d of [...deviations(o, outside), ...deviations(i, inner)]) expect(Math.abs(d - LIFT)).toBeLessThan(1e-3)
    }
  })

  it('leaves out what lies over no terrain, and never writes a non-finite value', () => {
    const s = gridSurface(grid(4, 4, 30, 0, 0, (x) => (x > 60 ? NaN : 3)))
    const pos: number[] = []
    drapePolygon(stripPolygon(10, 45, 1, 0, 80, 0, 1, -5, 5), s, LIFT, pos)
    expect(area(pos)).toBeLessThan(80 * 10)
    expect(pos.every(Number.isFinite)).toBe(true)
    const none: number[] = []
    drapePolygon([0, 0, NaN, 1, 1, 1], s, LIFT, none)
    expect(none).toEqual([])
  })
})

describe('bridge decks clear the ground under them', () => {
  it('raises the free end of a deck until its straight run clears a rise in the ground by 0.5 m, keeping its anchor', () => {
    // a road on the ground to x = 10, then a deck to x = 40 that ends free (cut by the model's edge); the ground rises 3 m at x = 16
    const s: Streets = { seg: Float32Array.from([0, 0, 10, 0, 10, 0, 40, 0]), width: Float32Array.from([6, 6]), bits: Uint8Array.from([0, DECK]), way: Uint32Array.from([0, 1]), count: 2 }
    const ground = (x: number) => 2 + 3 * Math.exp(-(((x - 16) / 3) ** 2))
    const z = deckHeights(s, ground)
    expect(z[2]).toBeCloseTo(ground(10), 6) // the anchor stays on the ground where the deck meets the road
    for (let x = 10.5; x < 40; x += 0.5) { const t = (x - 10) / 30; expect(z[2] + (z[3] - z[2]) * t).toBeGreaterThanOrEqual(ground(x) + 0.5 * Math.min(1, (x - 10) / 5) - 0.05) } // the clearance ramps up over 5 m from the anchor
  })
})

describe('streetGeometry on the drawn terrain', () => {
  // a road on the ground (0..10), a bridge deck (10..30), a road again (30..40), plus a zero-length and a broken segment
  const chain = (): Streets => ({
    seg: Float32Array.from([0, 0, 10, 0, 10, 0, 20, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 50, 50, 50, 60, 0, NaN, 0]),
    width: Float32Array.from([8, 8, 8, 8, 8, 8]), bits: Uint8Array.from([MAJOR | LEFT | RIGHT, DECK, DECK, LEFT, 0, 0]), way: Uint32Array.from([0, 1, 1, 2, 3, 4]), count: 6,
  })
  const slope = (x: number, y: number) => 4 + 0.1 * x + 0.02 * y
  const top = grid(6, 5, 30, -60, -60, slope), patch = grid(41, 41, 1, -10, -20, (x, y) => slope(x, y) + 0.2 * Math.sin(x) * Math.cos(y / 2))
  const hole = (x: number, y: number) => x >= -10 && x < 30 && y >= -20 && y < 20
  const outside = gridSurface(top, { skip: () => false }), near = meshSurface(patch, rtinIndices(patch.z, 41, 41, { tile: 64, maxError: 0.15 }))
  const far = gridSurface(top, { skip: (x, y) => !hole(x, y) })
  const drape: StreetDrape = {
    outside: gridSurface(top, { skip: hole }), near, far,
    ground: { near: (x, y) => drawnHeight(unionSurface(gridSurface(top, { skip: hole }), near), x, y) ?? slope(x, y), far: (x, y) => drawnHeight(outside, x, y) ?? slope(x, y) },
  }
  const g = streetGeometry(chain(), drape, [20, 0], 500)
  const arr = (geo: { getAttribute: (n: string) => { array: ArrayLike<number> } }) => geo.getAttribute('position').array

  it('skips segments of no length or with a non-finite coordinate', () => {
    expect(g.stats.skipped).toBe(2)
    for (const set of [g.outside, g.near, g.far]) for (const k of ['asphalt', 'sidewalk', 'marking', 'sides'] as const) expect(Array.from(arr(set[k])).every(Number.isFinite)).toBe(true)
  })

  it('keeps every road, sidewalk and marking on the drawn ground (float32: within 2 mm of the lift)', () => {
    for (const [set, surf] of [[g.outside, drape.outside], [g.near, near], [g.far, far]] as const) {
      for (const [k, lift] of [['asphalt', 0.035], ['sidewalk', 0.02]] as const) {
        const d = deviations(arr(set[k]), surf)
        for (const v of d) if (Math.abs(v - lift) > 0.002) {
          // only deck slabs may stand off the ground: none of these layers are decks except asphalt on the bridge
          expect(k === 'asphalt' && set !== g.outside).toBe(true)
        }
      }
    }
  })

  it('keeps the bridge deck on its own heights and meets its approaches where they touch the ground, at both details', () => {
    for (const v of ['near', 'far'] as const) {
      const pos = arr(g[v].asphalt), ground = drape.ground[v]
      // the deck strip's vertices at x along its edges (y = ±4): level across the deck, at the deck's own height there
      const deckAt = (x: number) => { const z: number[] = []; for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i] - x) < 1e-3 && Math.abs(Math.abs(pos[i + 1]) - 4) < 1e-3) z.push(pos[i + 2]); return z }
      // its ends sit on the drawn ground at the nodes it shares with the approaches (x = 10 and x = 30, on the centreline)
      expect(deckAt(10).some((z) => Math.abs(z - (ground(10, 0) + 0.035)) < 0.002)).toBe(true)
      expect(deckAt(30).some((z) => Math.abs(z - (ground(30, 0) + 0.035)) < 0.002)).toBe(true)
      // in between it keeps the deck rule (at least 1 m above the ground at its free node, x = 20) and runs straight
      // between its nodes, never draped: at x = 15 it is halfway between its heights at 10 and 20
      const z20 = Math.max(...deckAt(20))
      expect(z20).toBeGreaterThanOrEqual(ground(20, 0) + 1 + 0.035 - 0.002)
      const z10 = deckAt(10).find((z) => Math.abs(z - (ground(10, 0) + 0.035)) < 0.002)!
      const pos15: number[] = []
      for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i] - 15) < 1e-3 && Math.abs(Math.abs(pos[i + 1]) - 4) < 1e-3) pos15.push(pos[i + 2])
      if (pos15.length) expect(pos15.some((z) => Math.abs(z - (z10 + z20) / 2) < 0.002)).toBe(true)
    }
  })
})
