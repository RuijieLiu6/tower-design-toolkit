import { describe, expect, it } from 'vitest'
import { facadeAttribute, vistaFamily, vistaSeed } from './ContextStyle'
import { DECK, LEFT, MAJOR, RIGHT, deckHeights, streetGeometry, streetJoins, type Streets } from './VistaStreets'
import { gridSurface } from '../lib/terrainDrape'

describe("Vista's Context facades", () => {
  it('seeds each building from its OSM id, as Vista does (FNV-1a)', () => {
    expect(vistaSeed('w1')).toBe(vistaSeed('w1'))
    expect(vistaSeed('w1')).not.toBe(vistaSeed('w2'))
    for (const id of ['w27926613', 'w36893897']) { const s = vistaSeed(id); expect(s >= 0 && s < 1).toBe(true) }
  })

  it('chooses the facade family from the OSM type, and only a glazing rhythm from tall proportions', () => {
    expect(vistaFamily('office', 20, 30, 0.9)).toEqual({ family: 0, floorH: 3.8 })
    expect(vistaFamily('apartments', 60, 30, 0.9).family).toBe(1)
    expect(vistaFamily('house', 8, 10, 0.5).family).toBe(4)
    expect(vistaFamily('warehouse', 10, 60, 0.5).family).toBe(5)
    expect(vistaFamily('yes', 80, 60, 0.5).family).toBe(0) // tall and wide: office grid rhythm, never a claimed use
    expect(vistaFamily('yes', 8, 10, 0.1).family).toBe(5)
  })

  it('packs family, floor height, seed, base and top into 16-bit integers per vertex', () => {
    const a = facadeAttribute(6, [[0, 0, 3], [1, 3, 3]], (p) => ({ family: p ? 3 : 0, floorH: 3.8, seed: 0.25, base: 32.8, top: 152.81 }))
    expect([...a.array.slice(0, 4)]).toEqual([13, 250, 328, 1528])
    expect(a.array[12]).toBe(3 * 16 + 13)
  })
})

/** Three segments east along y = 0: ground 0-10, a deck 10-30 (two segments), ground 30-40. */
const chain = (): Streets => ({
  seg: Float32Array.from([0, 0, 10, 0, 10, 0, 20, 0, 20, 0, 30, 0, 30, 0, 40, 0]), width: Float32Array.from([8, 8, 8, 8]),
  bits: Uint8Array.from([MAJOR | LEFT | RIGHT, DECK, DECK, LEFT]), way: Uint32Array.from([0, 1, 1, 2]), count: 4,
})

describe('Context streets', () => {
  it('lifts a deck between its approach ends and keeps it at least 1 m above the ground', () => {
    const z = deckHeights(chain(), (x) => (x <= 10 ? 4 : x >= 30 ? 12 : 0))
    expect(z[2]).toBeCloseTo(4) // the west approach end
    expect(z[5]).toBeCloseTo(12) // the east approach end
    expect(z[3]).toBeCloseTo(8, 1) // the middle: halfway between them
    expect(Number.isNaN(z[0])).toBe(true) // ground segments have no deck height
  })

  it('draws asphalt everywhere but sidewalks and dashes only near the site, and slab sides under decks', () => {
    // flat ground drawn as a 30 m grid (the 30 m top); no 1 m patches
    const flat = { cols: 6, rows: 4, step: 30, x0: -30, y0: -45, z: new Float32Array(24) }
    const none = { query() {} }
    const drape = { outside: gridSurface(flat), near: none, far: none, ground: { near: () => 0, far: () => 0 } }
    const near = streetGeometry(chain(), drape, [20, 0], 100), far = streetGeometry(chain(), drape, [5000, 0], 100)
    const tris = (g: { getAttribute: (n: string) => { count: number } }) => g.getAttribute('position').count / 3
    expect(tris(near.outside.asphalt)).toBe(tris(far.outside.asphalt))
    expect(tris(near.outside.asphalt)).toBeGreaterThan(0)
    expect(tris(near.outside.sidewalk)).toBeGreaterThan(0) // both sides of segment 0, the left of segment 3
    expect(tris(far.outside.sidewalk)).toBe(0)
    expect(tris(near.outside.marking)).toBeGreaterThan(0) // the major road, 8 m wide
    expect(tris(far.outside.marking)).toBe(0)
    // decks are never draped: their slabs (two 10 m deck segments in 2 m pieces, two sides, two triangles) at each detail
    expect(tris(near.near.sides)).toBe(2 * 5 * 2 * 2)
    expect(tris(near.far.sides)).toBe(2 * 5 * 2 * 2)
    expect(tris(near.outside.sides)).toBe(0)
    expect(near.decks).toBe(2)
  })
})

/** Streets from [ax, ay, bx, by] pieces, all 8 m wide with sidewalks on both sides. */
const net = (...p: number[][]): Streets => ({
  seg: Float32Array.from(p.flat()), width: new Float32Array(p.length).fill(8), bits: new Uint8Array(p.length).fill(LEFT | RIGHT),
  way: new Uint32Array(p.length), count: p.length,
})
/** Is (x, y) inside any of these convex polygons (flat x, y lists), or triangles (x y z positions with stride 3)? */
function covered(tris: number[][] | ArrayLike<number>, x: number, y: number, stride = 2): boolean {
  const list: number[][] = Array.isArray(tris) ? tris : []
  if (!Array.isArray(tris)) for (let i = 0; i < tris.length; i += stride * 3) list.push([tris[i], tris[i + 1], tris[i + stride], tris[i + stride + 1], tris[i + 2 * stride], tris[i + 2 * stride + 1]])
  // convex polygons: inside when on the same side of every edge
  return list.some((t) => {
    let pos = true, neg = true
    for (let i = 0; i < t.length; i += 2) {
      const ax = t[i], ay = t[i + 1], bx = t[(i + 2) % t.length], by = t[(i + 3) % t.length], c = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
      if (c < 0) pos = false
      if (c > 0) neg = false
    }
    return pos || neg
  })
}
const all = () => true

describe('Context street joins', () => {
  it('fills the outside of a right-angle bend with a quarter round of asphalt and of sidewalk, and nothing inside it', () => {
    // east along y = 0, then north along x = 10: the outside of the turn is south-east of (10, 0)
    const j = streetJoins(net([0, 0, 10, 0], [10, 0, 10, 10]), all, all)
    // one wedge each (pieces of one width): the centre and a 90 degree arc in 15 degree steps
    expect(j.asphalt.map((p) => p.length / 2)).toEqual([8])
    expect(j.sidewalk.map((p) => p.length / 2)).toEqual([8])
    expect(covered(j.asphalt, 12, -2)).toBe(true) // the corner the two rectangles left open
    expect(covered(j.asphalt, 14.5, -1)).toBe(false) // beyond the 4 m half width: sidewalk
    expect(covered(j.sidewalk, 14.5, -1)).toBe(true)
    expect(covered(j.asphalt, 8, 2)).toBe(false) // the inside of the turn: the rectangles already overlap there
    // the same bend drawn with the second piece reversed (north to south) joins the same way
    const r = streetJoins(net([0, 0, 10, 0], [10, 10, 10, 0]), all, all)
    expect(r.asphalt.length).toBe(1)
    expect(covered(r.asphalt, 12, -2)).toBe(true)
  })

  it('adds a sidewalk wedge only where both pieces have a sidewalk on the outside, and only near the site', () => {
    const s = net([0, 0, 10, 0], [10, 0, 10, 10])
    s.bits[0] = LEFT // the first piece has no sidewalk on its right (the outside of this turn)
    expect(streetJoins(s, all, all).sidewalk.length).toBe(0)
    expect(streetJoins(net([0, 0, 10, 0], [10, 0, 10, 10]), all, () => false).sidewalk.length).toBe(0)
    expect(streetJoins(net([0, 0, 10, 0], [10, 0, 10, 10]), all, () => false).asphalt.length).toBe(1)
  })

  it('closes a gentle curve with one thin wedge per joint, and leaves straight runs, T junctions, dead ends and doubled pieces alone', () => {
    const a = (5 * Math.PI) / 180 // a 5 degree bend
    const bend = streetJoins(net([0, 0, 10, 0], [10, 0, 10 + 10 * Math.cos(a), 10 * Math.sin(a)]), all, all)
    expect(bend.asphalt.length).toBe(1)
    expect(covered(bend.asphalt, 10.15, -3.9)).toBe(true) // the 35 cm wedge at the outer edge
    expect(streetJoins(net([0, 0, 10, 0], [10, 0, 20, 0]), all, all).asphalt.length).toBe(0)
    expect(streetJoins(net([0, 0, 10, 0], [10, 0, 20, 0], [10, 0, 10, 10]), all, all).asphalt.length).toBe(0)
    expect(streetJoins(net([0, 0, 10, 0]), all, all).asphalt.length).toBe(0)
    expect(streetJoins(net([0, 0, 10, 0], [0, 0, 10, 0]), all, all).asphalt.length).toBe(0)
    // pieces left out (decks, or off the drawn top) take no part
    expect(streetJoins(net([0, 0, 10, 0], [10, 0, 10, 10]), (i) => i === 0, all).asphalt.length).toBe(0)
  })

  it('drapes the joins with the streets, so the corner is asphalt on the drawn ground', () => {
    const flat = { cols: 6, rows: 6, step: 30, x0: -60, y0: -60, z: new Float32Array(36) }
    const none = { query() {} }
    const drape = { outside: gridSurface(flat), near: none, far: none, ground: { near: () => 0, far: () => 0 } }
    const g = streetGeometry(net([0, 0, 10, 0], [10, 0, 10, 10]), drape, [0, 0], 100)
    const pos = g.outside.asphalt.getAttribute('position').array as ArrayLike<number>
    expect(covered(pos, 12, -2, 3)).toBe(true)
    expect(covered(g.outside.sidewalk.getAttribute('position').array as ArrayLike<number>, 14.5, -1, 3)).toBe(true)
    expect(g.stats.joins).toBe(2)
  })
})
