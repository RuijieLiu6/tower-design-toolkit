import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Tower } from '../engine/types'
import { castRay, inRing, indexFootprints, pickAt, type FootprintLike, type HeightsLike, type Pt } from '../engine/viewFrom'
import { VISTA_EXAMPLES, convertBlock, nearbyRoofs, parseVistaHash } from '../engine/vista'
import { applyBuildingForms, type BuildingForms } from './cityGeometry'
import { decodeFootprints, decodeHeights, type Manifest } from './cityLayers'
import {
  designOutlines, footprintsUnder, maskHeights, maskIndex, overlaps, removalCounts, removalUnder, shrinkRing, visibleIndex,
} from './cityRemoval'

const sq = (x: number, y: number, s: number, holes: Pt[][] = []): FootprintLike => ({ outer: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], holes })
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const tower = (o: Partial<Tower>) => ({ id: 't1', name: 'T', x: 0, y: 0, width: 20, depth: 20, rotation: 0, height: 100, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40, ...o }) as Tower

describe('which existing footprints a design outline hides', () => {
  it('moves every edge of the outline in by 0.5 m, whichever way the ring turns', () => {
    const s = shrinkRing(rect(-10, -5, 10, 5))
    expect(s[2][0]).toBeCloseTo(9.5, 9)
    expect(s[2][1]).toBeCloseTo(4.5, 9)
    // A closed ring (first point repeated) and a clockwise ring give the same outline.
    expect(shrinkRing([...rect(-10, -5, 10, 5), [-10, -5]])).toEqual(s)
    const cw = shrinkRing(rect(-10, -5, 10, 5).reverse())
    expect(cw.map(([x, y]) => [Math.abs(x), Math.abs(y)])).toEqual(s.map(([x, y]) => [Math.abs(x), Math.abs(y)]))
    // An outline under 1 m wide hides nothing.
    expect(shrinkRing(rect(0, 0, 0.8, 30))).toEqual([])
    expect(footprintsUnder([sq(0, 0, 10)], [rect(0, 0, 0.8, 30)])).toEqual([[]])
  })

  it('keeps a neighbour that only shares a wall with the design, hides one it overlaps by 1 m', () => {
    const design = rect(0, 0, 20, 20)
    const [under] = footprintsUnder([sq(20, 0, 20), sq(19, 0, 20), sq(-30, 0, 20)], [design])
    expect(under).toEqual([1])
  })

  it('hides a building wholly inside the design and one the design sits wholly inside', () => {
    const [under] = footprintsUnder([sq(5, 5, 5), sq(-50, -50, 200)], [rect(0, 0, 20, 20)])
    expect(under).toEqual([0, 1])
  })

  it('finds a crossing where no corner of either outline is inside the other', () => {
    const bar = rect(-5, 4, 15, 6) // a 20 × 2 m bar through a 10 m square
    expect(overlaps(sq(0, 0, 10), bar)).toBe(true)
    expect(footprintsUnder([sq(0, 0, 10)], [bar])[0]).toEqual([0])
  })

  it('keeps a courtyard building when the design stands in the courtyard, hides it when the design reaches the wings', () => {
    const court = sq(0, 0, 60, [rect(15, 15, 45, 45)])
    expect(overlaps(court, shrinkRing(rect(20, 20, 40, 40)))).toBe(false)
    expect(overlaps(court, shrinkRing(rect(30, 20, 50, 40)))).toBe(true)
  })

  it('hides under the podium too', () => {
    const fps = [sq(15, -5, 10)] // east of a 20 m tower, under its 40 m podium
    expect(removalUnder(fps, [tower({})]).hidden.size).toBe(0)
    expect(removalUnder(fps, [tower({ podiumHeight: 12 })]).byTower[0].indices).toEqual([0])
    expect(designOutlines(tower({ podiumHeight: 12 }))).toHaveLength(2)
  })

  it('follows a rotated tower', () => {
    // A 40 × 4 m slab turned 90° covers x ∈ [-2, 2], y ∈ [-20, 20]: it hides the building to the north, not the one to the east.
    const fps = [sq(-3, 15, 6), sq(15, -3, 6)]
    expect(removalUnder(fps, [tower({ width: 40, depth: 4, rotation: 90 })]).byTower[0].indices).toEqual([0])
    expect(removalUnder(fps, [tower({ width: 40, depth: 4, rotation: 0 })]).byTower[0].indices).toEqual([1])
  })

  it('counts measured roofs and height-unknown outlines separately', () => {
    const h: HeightsLike = { ground: Float32Array.from([10, NaN, 10]), roof: Float32Array.from([40, NaN, 50]), max: Float32Array.from([42, NaN, 52]), points: Uint16Array.from([100, 0, 90]) }
    expect(removalCounts(new Set([0, 1]), h)).toEqual({ total: 2, measured: 1, outlines: 1 })
    expect(removalCounts(new Set([0, 1]), null)).toEqual({ total: 2, measured: 0, outlines: 2 })
  })
})

describe('views pass through hidden buildings', () => {
  // A street eye at the origin; a 90 m building 100 m north (under the design), a 30 m one 300 m north.
  const fps = [sq(-10, 100, 20), sq(-10, 300, 20), sq(-10, -200, 20)]
  const heights: HeightsLike = { ground: Float32Array.from([10, 10, 10]), roof: Float32Array.from([100, 40, 30]), max: Float32Array.from([102, 42, 32]), points: Uint16Array.from([500, 400, 300]) }
  const idx = indexFootprints(fps)
  const hidden = new Set([0])
  const mIdx = maskIndex(idx, hidden), mH = maskHeights(heights, hidden)

  it('cannot pick the hidden roof: the click is street (or the design tower) instead', () => {
    expect(pickAt(idx, heights, 0, 110).kind).toBe('roof')
    expect(pickAt(mIdx, mH, 0, 110).kind).toBe('street')
    expect(pickAt(mIdx, mH, 0, 310)).toMatchObject({ kind: 'roof', index: 1 })
  })

  it('the hidden building no longer blocks the sightline; the next one does', () => {
    const inp = { eye: [0, 0, 11.6] as [number, number, number], terrain: () => 10, towers: [], farMin: Infinity, maxDistance: 1000 }
    const before = castRay({ ...inp, idx, heights }, 0)
    const after = castRay({ ...inp, idx: mIdx, heights: mH }, 0)
    expect(before.near.distance).toBeLessThan(125)
    expect(after.near.label).toBe('a building (measured roof)')
    expect(after.near.distance).toBeGreaterThan(295)
  })

  it("Vista's nearby-roof list no longer offers the hidden roof", () => {
    const tw = { centre: [0, 20] as Pt, base: 10, top: 150, radius: 5 }
    const all = nearbyRoofs({ idx, heights, terrain: () => 10 }, tw, { within: 1000 }).map((r) => r.index)
    const masked = nearbyRoofs({ idx: mIdx, heights: mH, terrain: () => 10 }, tw, { within: 1000 }).map((r) => r.index)
    expect(all).toContain(0)
    expect(masked).not.toContain(0)
    expect(masked).toContain(1)
  })

  it('leaves the inputs untouched and indices unchanged', () => {
    expect(heights.roof[0]).toBe(100)
    expect(mH!.roof[1]).toBe(40)
    expect(mIdx.footprints).toBe(fps)
    expect(maskIndex(idx, new Set())).toBe(idx)
    expect(maskHeights(heights, new Set())).toBe(heights)
  })

  it('writes a draw index without the hidden parts', () => {
    const out = new Uint32Array(10)
    expect(visibleIndex([[0, 0, 3], [1, 3, 4], [2, 7, 2]], new Set([1]), out)).toBe(5)
    expect([...out.subarray(0, 5)]).toEqual([0, 1, 2, 7, 8])
  })
})

describe('on the real Real Vancouver context (public/data)', () => {
  const DIR = new URL('../../public/data/', import.meta.url)
  const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
  const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
  const layer = (id: string) => manifest.layers.find((l) => l.id === id)!
  const base = decodeFootprints(read(layer('footprints').file))
  const forms = JSON.parse(readFileSync(new URL(layer('building_forms').file, DIR), 'utf8')) as BuildingForms
  const city = applyBuildingForms(base, decodeHeights(read(layer('footprint_heights').file), base.length), forms)
  const ORIGIN = [491300, 5458600] // CITY_ORIGIN (store.ts), EPSG:26910

  it("hides the existing building under Vista's Shangri-La example, and only buildings that touch its outline", () => {
    const s = parseVistaHash(VISTA_EXAMPLES.find((e) => e.key === 'shangri-la')!.hash)
    const c = convertBlock(s.site!, s.blocks[0])
    const t = tower({ name: 'Shangri-La', x: c.centre[0] - ORIGIN[0], y: c.centre[1] - ORIGIN[1], width: c.block.w, depth: c.block.d, rotation: c.rotation, height: 201 })
    const r = removalUnder(city.footprints, [t])
    expect(r.hidden.size).toBeGreaterThan(0)
    expect(r.hidden.size).toBeLessThan(40)
    // Every hidden footprint comes within the outline's half-diagonal of the site centre (nothing far away).
    const reach = Math.hypot(c.block.w, c.block.d) / 2
    const toSegment = (p: Pt, a: Pt, b: Pt) => {
      const ex = b[0] - a[0], ey = b[1] - a[1], u = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)))
      return Math.hypot(a[0] + ex * u - p[0], a[1] + ey * u - p[1])
    }
    for (const i of r.hidden) {
      const ring = city.footprints[i].outer
      const near = inRing([t.x, t.y], ring) ? 0 : Math.min(...ring.map((a, k) => toSegment([t.x, t.y], a, ring[(k + 1) % ring.length])))
      expect(near).toBeLessThan(reach)
    }
  })
})
