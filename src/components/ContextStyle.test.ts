import { describe, expect, it } from 'vitest'
import { facadeAttribute, vistaFamily, vistaSeed } from './ContextStyle'
import { DECK, LEFT, MAJOR, RIGHT, deckHeights, streetGeometry, type Streets } from './VistaStreets'

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
    const near = streetGeometry(chain(), () => 0, [20, 0], 100), far = streetGeometry(chain(), () => 0, [5000, 0], 100)
    const tris = (g: { getAttribute: (n: string) => { count: number } }) => g.getAttribute('position').count / 3
    expect(tris(near.asphalt)).toBe(tris(far.asphalt))
    expect(tris(near.sidewalk)).toBe(2 * 2 + 2) // both sides of segment 0, the left of segment 3 (one 10 m patch each)
    expect(tris(far.sidewalk)).toBe(0)
    expect(tris(near.marking)).toBeGreaterThan(0) // the major road, 8 m wide
    expect(tris(far.marking)).toBe(0)
    expect(tris(near.sides)).toBe(2 * 2 * 2) // two deck segments, two sides, two triangles
    expect(near.decks).toBe(2)
  })
})
