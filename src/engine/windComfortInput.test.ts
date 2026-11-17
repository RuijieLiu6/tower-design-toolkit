// The Toolkit's model into Sinnie's wind engine (engine/windComfortInput.ts): obstacles from the competition context and
// the City layers, the tower in her terms, the strategy mapping, and the evidence lines' invariants.
import { describe, expect, it } from 'vitest'
import type { VtcContext } from '../context'
import type { Footprint, FootprintHeights } from '../lib/cityLayers'
import type { Tower } from './types'
import { plazaMask, runWind, siteRaster, summarise, towerRaster, WIND_GRID, windStudy } from './windComfort'
import { cityObstacles, DEFAULT_WIND_PRESETS, readingsOf, SRC, strategyOf, towerObstacles, vtcObstacles, windRules, windTowerOf } from './windComfortInput'

const tower: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.6 }, { use: 'residential', share: 0.4 }], coreShare: 0.25, plantEvery: 0,
}
const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const flat = (ring: [number, number][], z: number) => ({ positions: ring.flatMap(([x, y]) => [x, y, z]), indices: [0, 1, 2, 0, 2, 3] })
const ctx: VtcContext = {
  meta: { true_north_deg_clockwise_from_plus_y: 45, north_note: '', source: 'test' }, site: null, blocks: [], curbs: [],
  plazas: [flat(box(-140, 60, -60, 96), 0)], midblock: [],
  buildings: [{ footprint: box(100, -60, 140, -20), z0: 0, z1: 40 }, flat(box(-200, -100, -160, -60), 2)], // the second is a 2 m slab: below her 3 m
  heritage: [{ footprint: box(-60, -100, -20, -70), z0: 0, z1: 20 }],
  future_towers: [{ footprint: box(96, 7, 127, 37), z0: 18.3, z1: 185.5 }, { footprint: box(-36, 62, 1, 92), z0: 18.3, z1: null }],
  labels: [],
}

describe('wind comfort input', () => {
  it('turns the competition context into her meshes, future boxes and plaza cells', () => {
    const o = vtcObstacles(ctx, true)
    expect(o.loaded).toBe(true)
    expect(o.meshes.map((m) => m.layer)).toEqual(['existing', 'existing', 'heritage'])
    expect(o.meshes.map((m) => m.top)).toEqual([40, 2, 20])
    expect(o.futures).toEqual([{ pts: box(96, 7, 127, 37), base: 18.3, top: 185.5 }]) // the one without a height is left out
    expect(vtcObstacles(ctx, false).futures).toBeNull()
    expect(o.plazaMeshes).toHaveLength(1)
    const sr = siteRaster(o.meshes, o.futures)
    expect(sr.bld.map((b) => b.layer)).toEqual(['existing', 'heritage', 'future']) // the 2 m slab is no building (< 3 m)
    let solid = 0
    for (let k = 0; k < sr.H.length; k++) if (sr.H[k] > 3) solid++
    expect(solid).toBeGreaterThan(0)
    expect(solid).toBeGreaterThan(200); expect(solid).toBeLessThan(300) // about the plan areas (4,330 m²) in 4 m cells, grid-aligned
    const plaza = plazaMask(o.plazaMeshes)
    expect(plaza.reduce((a, b) => a + b, 0)).toBeCloseTo((80 * 36) / 16, -1)
    expect(vtcObstacles(null, true)).toMatchObject({ loaded: false, meshes: [], futures: null })
  })

  it('takes City buildings within the domain around the tower at their height above the project ground, counting unknown heights', () => {
    const footprints: Footprint[] = [
      { id: 1, outer: box(1000, 1000, 1040, 1030), holes: [] }, // near the tower at (1000, 1000)
      { id: 2, outer: box(2000, 2000, 2040, 2030), holes: [] }, // far away
      { id: 3, outer: box(1100, 1000, 1140, 1030), holes: [] }, // no height
      { id: 4, outer: box(900, 950, 940, 980), holes: [] }, // hidden under the design
    ]
    const heights: FootprintHeights = { ground: new Float32Array([10, 10, NaN, 10]), roof: new Float32Array([70, 70, NaN, 60]), max: new Float32Array(4), points: new Uint16Array(4) }
    const o = cityObstacles(footprints, heights, new Set([3]), [1000, 1000], 15)
    expect(o.meshes).toHaveLength(1)
    expect(o.meshes[0].top).toBe(55) // roof 70 above the project ground of 15
    expect(Array.from(o.meshes[0].v).slice(0, 3)).toEqual([0, 0, 55]) // shifted so the tower is the origin
    expect(o.unknownHeights).toBe(1)
    expect(o.loaded).toBe(true)
    expect(cityObstacles(footprints, null, new Set(), [1000, 1000], 15).loaded).toBe(false)
  })

  it('gives her the tower as a turned plan outline, and the other towers as roofs', () => {
    const t = { ...tower, x: 20, y: -10, rotation: 30 }
    const w = windTowerOf(t, [0, 0])
    expect(w).toMatchObject({ w: 46, d: 46, cx: 20, cy: -10, height: 285 })
    expect(w.rot).toBeCloseTo(Math.PI / 6, 9)
    expect(w.footprint).toHaveLength(4)
    const cells = towerRaster(w, WIND_GRID.cs, WIND_GRID.nx, WIND_GRID.ny).reduce((a, b) => a + b, 0)
    expect(cells).toBeCloseTo((46 * 46) / 16, -1)
    const others = towerObstacles([{ ...tower, id: 't2', x: 80, y: 0 }], [0, 0])
    // 17 Nov review (7): the podium to its own height, the tower to full height, not the podium outline at 285 m
    expect(others.map((m) => m.top)).toEqual([18, 285])
    expect(others.every((m) => m.layer === 'design')).toBe(true)
    // 17 Nov review (6): an imported mass gets no second, uniform podium
    expect(strategyOf({ ...tower, imported: { hull: [[-23, -23], [23, -23], [23, 23], [-23, 23]] } } as never, DEFAULT_WIND_PRESETS)).toBeNull()
  })

  it('maps the Toolkit podium to her uniform podium reach, and the presets to the rest', () => {
    expect(strategyOf(tower, DEFAULT_WIND_PRESETS)).toEqual({ podiumH: 18, podiumExt: 9, canopy: 0, corners: 'sharp', shelter: 0 }) // (64 − 46) / 2 = 9 is the smaller overhang
    expect(strategyOf({ ...tower, podiumHeight: 0 }, DEFAULT_WIND_PRESETS)).toBeNull()
    expect(strategyOf({ ...tower, podiumHeight: 0 }, { ...DEFAULT_WIND_PRESETS, canopy: 4 })).toEqual({ podiumH: 0, podiumExt: 0, canopy: 4, corners: 'sharp', shelter: 0 })
  })

  it('every evidence line has a source, a flag and a threshold; no context means unknown', () => {
    const w = windTowerOf(tower, [0, 0]), o = vtcObstacles(ctx, true)
    const sr = siteRaster(o.meshes, o.futures), plaza = plazaMask(o.plazaMeshes)
    const r = windStudy(sr, w, plaza, { annual: false, dir: 270, speed: 4.5, period: { from: '01-01', to: '12-31' }, strat: strategyOf(tower, DEFAULT_WIND_PRESETS) })
    const readings = readingsOf(r, plaza.reduce((a, b) => a + b, 0))
    expect(readings.calm + readings.uncomfortable).toBeLessThanOrEqual(1)
    expect(readings.hasPlaza).toBe(true)
    const rules = windRules({ readings, result: r, obstacles: { loaded: true, unknownHeights: 0, source: SRC.vtc }, presets: DEFAULT_WIND_PRESETS, towerName: tower.name })
    expect(rules.map((x) => x.id)).toEqual(['calm-ground', 'plaza-peak', 'uncomfortable', 'worse-better', 'downwash', 'strategies', 'method'])
    for (const x of rules) { expect(x.source.label).toBeTruthy(); expect(x.threshold).toBeTruthy(); expect(['pass', 'warn', 'fail', 'unknown']).toContain(x.state); expect(x.flag).not.toBe('verified') }
    expect(rules[0].state).not.toBe('unknown')
    const none = windRules({ readings, result: r, obstacles: { loaded: false, unknownHeights: 0, source: SRC.vtc }, presets: DEFAULT_WIND_PRESETS, towerName: tower.name })
    expect(none[0].state).toBe('unknown')
    expect(none[0].note).toMatch(/optimistic/)
    // the raw flow agrees with itself: summarise of the same fields is the study's summary
    const a = runWind(sr, w, true, 270, strategyOf(tower, DEFAULT_WIND_PRESETS), plaza), b = runWind(sr, null, false, 270, null, plaza)
    expect(summarise(a, b, 4.5, plaza).cats.reduce((p, c) => p + c, 0)).toBe(r.cats.reduce((p, c) => p + c, 0))
  }, 60_000)
})
