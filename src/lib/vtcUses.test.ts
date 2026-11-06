import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { VtcContext } from '../context'
import { contextUses, inRings, useOfFootprint } from './vtcUses'

type Pt = [number, number]
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
const ctxWith = (p: Partial<VtcContext>): VtcContext => ({
  meta: { true_north_deg_clockwise_from_plus_y: 45, north_note: '', source: '' }, site: null, blocks: [], curbs: [], plazas: [], midblock: [],
  buildings: [], heritage: [], future_towers: [], labels: [], ...p,
})

describe('ground-level use of the competition context', () => {
  it('tests points against rings, holes included', () => {
    expect(inRings([rect(0, 0, 10, 10)], 5, 5)).toBe(true)
    expect(inRings([rect(0, 0, 10, 10)], 11, 5)).toBe(false)
    expect(inRings([rect(0, 0, 10, 10), rect(4, 4, 6, 6)], 5, 5)).toBe(false)
  })

  it('a building on the ground takes the use covering most of its footprint, else other', () => {
    const ctx = ctxWith({
      ground_uses: [
        { use: 'Retail', rings: [rect(0, 0, 30, 20)] },
        { use: 'Office', rings: [rect(40, 0, 70, 20)] },
        { use: 'Hotel', rings: [rect(70, 0, 80, 20)] },
      ],
      buildings: [
        { footprint: rect(0, 0, 30, 20).slice(0, -1), z0: 0, z1: 12 },            // all retail
        { footprint: rect(40, 0, 80, 20).slice(0, -1), z0: 0, z1: 30 },           // 3/4 office, 1/4 hotel
        { footprint: rect(200, 200, 220, 220).slice(0, -1), z0: 0, z1: 10 },      // no plan here
        { positions: [0, 0, 0, 30, 0, 0, 30, 20, 0, 0, 20, 0, 0, 0, 9, 30, 20, 9], indices: [0, 1, 2, 0, 2, 3] }, // a mesh over retail
      ],
    })
    const u = contextUses(ctx)
    expect(u.buildings).toEqual(['retail', 'office', 'other', 'retail'])
    expect(u.hasPlan).toBe(true)
    expect(u.counts.retail).toBe(2)
    expect(contextUses(ctx)).toBe(u) // cached per context
  })

  it('a tower on a podium takes the lobby use beneath it, not the retail around the lobby', () => {
    const ctx = ctxWith({
      ground_uses: [{ use: 'Retail', rings: [rect(0, 0, 40, 40)] }, { use: 'Residential', rings: [rect(15, 15, 25, 25)] }],
      buildings: [
        { footprint: rect(0, 0, 40, 40).slice(0, -1), z0: 0, z1: 12 },   // podium: mostly retail
        { footprint: rect(10, 10, 30, 30).slice(0, -1), z0: 12, z1: 90 }, // tower over the residential lobby
        { footprint: rect(0, 0, 8, 8).slice(0, -1), z0: 12, z1: 20 },     // upper piece over retail only
      ],
    })
    expect(contextUses(ctx).buildings).toEqual(['retail', 'residential', 'other'])
  })

  it('without a use plan (a context built before 6 Nov) every building is other', () => {
    const u = contextUses(ctxWith({ buildings: [{ footprint: rect(0, 0, 10, 10).slice(0, -1), z0: 0, z1: 10 }] }))
    expect(u).toMatchObject({ buildings: ['other'], hasPlan: false })
  })

  it('a footprint smaller than the sample grid still gets its use (centroid)', () => {
    expect(useOfFootprint(rect(1, 1, 1.4, 1.4).slice(0, -1), [{ use: 'office', rings: [rect(0, 0, 2, 2)], x0: 0, y0: 0, x1: 2, y1: 2 }])).toBe('office')
  })
})

// The real competition context (Buildner's, local only): skips where it is absent (CI).
const LOCAL = new URL('../../public/local/vtc_context.json', import.meta.url)
describe.skipIf(!existsSync(LOCAL))('ground-level use on the real competition context', () => {
  it('gives every existing building a use, quickly', () => {
    const ctx = JSON.parse(readFileSync(LOCAL, 'utf8')) as VtcContext
    if (!ctx.ground_uses) return // an older dev file: rebuild it with tools/build_vtc_context.py
    const t = performance.now()
    const u = contextUses(ctx)
    expect(performance.now() - t).toBeLessThan(2000)
    const b = (k: string) => u.buildings.filter((x) => x === k).length
    expect(u.buildings).toHaveLength(ctx.buildings.length)
    expect(b('other')).toBeLessThanOrEqual(2)
    for (const k of ['retail', 'office', 'hotel', 'cultural', 'institutional', 'residential']) expect(b(k), k).toBeGreaterThan(0)
  })
})
