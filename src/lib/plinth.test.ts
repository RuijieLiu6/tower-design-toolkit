import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { VtcContext } from '../context'
import type { HeightGrid } from './cityLayers'
import { CITY_PLINTH, plinthGeometry, plinthRing, plinthTopGrid, sampleDrawn, skirtPositions, vtcPlinth, type Plinth } from './plinth'

const DATA = new URL('../../public/data/', import.meta.url)
const grid = (x0: number, y0: number, step: number, cols: number, rows: number, f: (x: number, y: number) => number): HeightGrid => {
  const z = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) z[r * cols + k] = f(x0 + k * step, y0 + r * step)
  return { x0, y0, step, cols, rows, z }
}

/** Unit normal of each triangle in a flat position array. */
function normals(pos: ArrayLike<number>): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < pos.length; i += 9) {
    const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]), b = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]), c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8])
    out.push(b.sub(a).cross(c.sub(a)).normalize())
  }
  return out
}

describe('city plinth extent', () => {
  it('sits on node lines shared by R1 and both R2 grids, and holds every building', () => {
    const layers = JSON.parse(readFileSync(new URL('layers.json', DATA), 'utf8')).layers as { id: string; grid?: { x0: number; y0: number; step_m: number } }[]
    for (const id of ['terrain_r1', 'terrain_r2', 'terrain_r2_detail']) {
      const g = layers.find((l) => l.id === id)!.grid!
      for (const v of [CITY_PLINTH.x0, CITY_PLINTH.x1]) expect(Number.isInteger((v - g.x0) / g.step_m)).toBe(true)
      for (const v of [CITY_PLINTH.y0, CITY_PLINTH.y1]) expect(Number.isInteger((v - g.y0) / g.step_m)).toBe(true)
    }
    // Extents measured on 3 Nov: buildings (LiDAR core, 2009 ring, continuity fill) x -2,241..6,976, y -4,260..1,778;
    // draped City layers (parks, zoning, shoreline inside the City) x -8,547..7,037, y -8,934..4,014.
    expect(CITY_PLINTH.x0).toBeLessThan(-8547); expect(CITY_PLINTH.x1).toBeGreaterThan(7037)
    expect(CITY_PLINTH.y0).toBeLessThan(-8934); expect(CITY_PLINTH.y1).toBeGreaterThan(4014)
  })

  it('holds the parks and zoning layers whole (they are draped on the plinth top)', () => {
    for (const file of ['parks.json', 'zoning.json']) {
      const text = readFileSync(new URL(file, DATA), 'utf8')
      const j = JSON.parse(text) as unknown
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      const walk = (o: unknown) => {
        if (Array.isArray(o) && o.length >= 2 && o.every((v) => typeof v === 'number')) {
          for (let i = 0; i + 1 < o.length; i += 2) { const x = o[i] / 10, y = o[i + 1] / 10; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
        } else if (Array.isArray(o)) o.forEach(walk)
        else if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => k !== 'origin' && walk(v))
      }
      walk(j)
      expect([x0 > CITY_PLINTH.x0, y0 > CITY_PLINTH.y0, x1 < CITY_PLINTH.x1, y1 < CITY_PLINTH.y1]).toEqual([true, true, true, true])
    }
  })
})

describe('plinth top', () => {
  it('takes R1 nodes where R1 reaches and R2 east of it', () => {
    const p: Plinth = { x0: 0, y0: 0, x1: 120, y1: 60, bottom: -10 }
    const r1 = grid(0, 0, 30, 3, 3, (x, y) => 100 + x + y)
    const r2 = grid(-60, -60, 60, 6, 4, () => 7)
    const top = plinthTopGrid(r1, r2, p)
    expect([top.cols, top.rows, top.step]).toEqual([5, 3, 30])
    expect(top.z[0]).toBe(100); expect(top.z[2]).toBe(160); expect(top.z[2 * 5 + 2]).toBe(220)
    expect(top.z[3]).toBe(7); expect(top.z[2 * 5 + 4]).toBe(7)
  })

  it('samples the drawn surface: nodes exactly, each half cell on its own triangle', () => {
    const g = grid(0, 0, 10, 2, 2, (x, y) => (x === 10 && y === 0 ? 10 : 0))
    expect(sampleDrawn(g, 10, 0)).toBe(10)
    // Triangle a-b-e (below the a-e diagonal) carries the raised corner b; triangle a-e-d does not.
    expect(sampleDrawn(g, 7.5, 2.5)).toBeCloseTo(5)
    expect(sampleDrawn(g, 2.5, 7.5)).toBe(0)
    expect(sampleDrawn(g, 11, 0)).toBeNull()
  })
})

describe('plinth walls', () => {
  const p: Plinth = { x0: -50, y0: -20, x1: 50, y1: 20, bottom: -16 }
  const top = (x: number) => 2 + x / 50

  it('walks the edge counter-clockwise with a point on every step', () => {
    const ring = plinthRing(p, top, 10)
    expect(ring.length).toBe(2 * (10 + 4))
    expect(ring[0]).toEqual([-50, -20, 1])
    expect(ring[10]).toEqual([50, -20, 3])
    expect(plinthRing(p, () => 0).length).toBe(4)
  })

  it('faces every wall outward and the underside down, from the top edge to the bottom', () => {
    const ring = plinthRing(p, top, 25)
    const { solid, edge } = plinthGeometry(p, ring, 0.5)
    const pos = solid.getAttribute('position').array
    const ns = normals(pos)
    for (let t = 0; t < ns.length; t++) {
      const cx = (pos[t * 9] + pos[t * 9 + 3] + pos[t * 9 + 6]) / 3, cy = (pos[t * 9 + 1] + pos[t * 9 + 4] + pos[t * 9 + 7]) / 3
      const n = ns[t]
      if (Math.abs(n.z) > 0.99) { expect(n.z).toBeLessThan(0); continue } // underside
      expect(n.x * cx + n.y * cy).toBeGreaterThan(0) // outward from the centre
    }
    const zs = Array.from(pos).filter((_, i) => i % 3 === 2)
    expect(Math.min(...zs)).toBe(-16)
    expect(Math.max(...zs)).toBeCloseTo(3)
    // One line segment per ring segment, just outside the top edge.
    const line = edge.getAttribute('position').array
    expect(line.length).toBe(ring.length * 6)
    expect([line[0], line[1], line[2]]).toEqual([-50.5, -20.5, 1])
  })

  it('a wall under a polyline faces the right of its direction of travel', () => {
    const [n] = normals(skirtPositions([[0, 0, 5], [10, 0, 5]], 0))
    expect(n.y).toBeCloseTo(-1)
  })
})

describe('competition plinth', () => {
  it('wraps the context model with a margin, rounded out to 10 m', () => {
    const ctx = {
      blocks: [[[-247, -143], [237, 139]]], curbs: [[[-252, -148], [242, 144]]], buildings: [{ footprint: [[0, 0], [10, 10]], z0: 0, z1: 5 }],
      heritage: [], labels: [{ text: 'Main', at: [296, 0] }], site: null,
    } as unknown as VtcContext
    // A thick ground (6 Nov): 30 m unless a basement asks for more (engine/basement.ts groundThickness).
    expect(vtcPlinth(ctx)).toEqual({ x0: -280, y0: -170, x1: 320, y1: 170, bottom: -30 })
    expect(vtcPlinth(null)).toEqual({ x0: -300, y0: -200, x1: 300, y1: 200, bottom: -30 })
    expect(vtcPlinth(ctx, 20, 46).bottom).toBe(-46)
  })
})

describe('plinth edge line', () => {
  it('can leave out a side, as the city does where the mountain backdrop carries on', () => {
    const p: Plinth = { x0: 0, y0: 0, x1: 100, y1: 50, bottom: -5 }
    const ring = plinthRing(p, () => 0, 25)
    const all = plinthGeometry(p, ring).edge.getAttribute('position').count / 2
    const line = plinthGeometry(p, ring, 0.5, ['south', 'east', 'west']).edge.getAttribute('position').array
    expect(all).toBe(ring.length)
    expect(line.length / 6).toBe(ring.length - 4) // the four north segments (100 m in 25 m steps)
    for (let k = 0; k < line.length; k += 6) expect(line[k + 1] > 50 && line[k + 4] > 50).toBe(false) // no segment along y = 50
  })
})
