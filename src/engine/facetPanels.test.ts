// Facade panel count (tool cycle 12): distinct panel sizes, sloped and warped faces, on known forms.
import { describe, expect, it } from 'vitest'
import { DEFAULT_FACADE, facadeCheck } from './facade'
import { panelLines, panelReading, towerPanels } from './facetPanels'
import { blocksOf } from './blocks'
import { withBlocks } from './massing'
import { morphPlanAt, type MorphPart } from './planMorph'
import { importedTower, rect, ringArea, type P } from './testStoreys'
import { formBlocks } from './towerForms'
import type { ImportedStorey } from './types'
import { fixFor } from '../lib/fixes'
import { defaultTower } from '../store'

/** Imported storeys, bottom-up, each with its own ring (4 m storeys unless given). */
function storeys(rings: P[][], f2f = 4, podium = 0, podiumF2F = 4.8): ImportedStorey[] {
  let z = 0
  return rings.map((r, i) => {
    const h = i < podium ? podiumF2F : f2f, s: ImportedStorey = { level: i + 1, z0: z, z1: z + h, area: ringArea(r), use: i < podium ? 'retail' : 'residential', podium: i < podium, hasFloor: true, loops: [r] }
    z += h
    return s
  })
}
const turn = (r: P[], deg: number): P[] => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return r.map(([x, y]) => [x * c - y * s, x * s + y * c]) }
// The Compass Turn in miniature: ten 54 m square storeys, then 30 storeys turning into the 46.5 m octagon (R7 §1).
const compass: MorphPart = { z0: 40, z1: 160, plan: { shape: 'chamfer', w: 54, d: 54, chamfer: 0 }, planTop: { w: 46.5, d: 46.5, chamfer: 16.5 } }
const compassRings = (): P[][] => [...Array.from({ length: 10 }, () => rect(54, 54)), ...Array.from({ length: 30 }, (_, k) => morphPlanAt(compass, 40 + 4 * k + 2) as P[])]

describe('facade panel sizes', () => {
  it('a box on a podium: three sizes, nothing sloped or warped', () => {
    const t = importedTower(storeys([...Array.from({ length: 3 }, () => rect(90, 60)), ...Array.from({ length: 20 }, () => rect(54, 54))], 4, 3), { podiumTop: 14.4 })
    const r = panelReading([t])
    expect(r.faces).toBe(3 * 4 + 20 * 4)
    expect(r.sizes).toBe(3) // 90 × 4.8, 60 × 4.8, 54 × 4
    expect(r.sloped).toBe(0)
    expect(r.warped).toBe(0)
    const lines = panelLines(r)
    expect(lines.find((x) => x.id === 'fa-panels')?.value).toBe('3 sizes over 92 storey faces · no sloped faces')
    expect(lines.find((x) => x.id === 'fa-planar')?.state).toBe('pass')
  })

  it('the Compass Turn: one size per storey for its grid faces and one for its facets, all sloped, all flat', () => {
    const t = importedTower(storeys(compassRings()))
    const r = panelReading([t])
    // 10 square storeys × 4; 30 morph storeys × 4 grid faces; 29 × 4 facets (the first storey's facet is 0.39 m, under 0.5 m)
    expect(r.faces).toBe(40 + 120 + 116)
    expect(r.sizes).toBe(1 + 30 + 29)
    expect(r.sloped).toBe(120 + 116)
    expect(r.slopedSizes).toBe(59)
    expect(r.warped).toBe(0)
    expect(r.maxLean).toBeCloseTo((Math.atan(((54 - 30) / Math.SQRT2) / 120) * 180) / Math.PI, 6) // the facets, 8.05° over 120 m
    // slab edges are exact for a linear morph, the first and last storeys included
    const grid = (z: number) => 54 - 40.5 * (z - 40) / 120
    const g = towerPanels(t).filter((p) => p.z0 >= 40 && Math.abs(p.lean - (Math.atan(3.75 / 120) * 180) / Math.PI) < 1e-6)
    expect(g).toHaveLength(120)
    for (const p of g) { expect(p.bottom).toBeCloseTo(grid(p.z0), 6); expect(p.top).toBeCloseTo(grid(p.z1), 6) }
    // the last square storey stays vertical: the turn starts at its top slab
    expect(towerPanels(t).filter((p) => p.z0 === 36).every((p) => p.lean === 0 && p.bottom === 54 && p.top === 54)).toBe(true)
  })

  it('a set-back reads as a step, not a slope', () => {
    const t = importedTower(storeys([...Array.from({ length: 10 }, () => rect(54, 54)), ...Array.from({ length: 10 }, () => rect(46.5, 46.5))]))
    const r = panelReading([t])
    expect(r.sloped).toBe(0)
    expect(r.sizes).toBe(2)
  })

  it('a turn of 1° a storey warps every face (a 1.5 m unit by about 26 mm); 0.2° a storey stays flat in units', () => {
    const fast = importedTower(storeys(Array.from({ length: 20 }, (_, k) => turn(rect(54, 54), k))))
    const r = panelReading([fast])
    expect(r.warped).toBe(80)
    expect(r.maxUnitWarp).toBeCloseTo(1.5 * Math.sin(Math.PI / 180), 3)
    expect(r.maxWarp).toBeGreaterThan(0.9) // the whole 54 m face
    const lines = panelLines(r), planar = lines.find((x) => x.id === 'fa-planar')!
    expect(planar.state).toBe('warn')
    expect(planar.specialist).toMatch(/facade engineer/)
    expect(fixFor('fa-planar', 'warn', planar.value)).toMatch(/keep its direction/)
    const slow = importedTower(storeys(Array.from({ length: 20 }, (_, k) => turn(rect(54, 54), 0.2 * k))))
    expect(panelReading([slow]).warped).toBe(0)
  })

  it('reads the toolkit’s own Twisting tower as the smooth surface its blocks step along', () => {
    const t0 = defaultTower('vtc'), podium = blocksOf(t0).filter((b) => b.podium)
    // 60 storeys at the tower's floor-to-floor (as the Tower form panel builds it), 90°: 1.5° a storey, 30 blocks of two
    const base = { w: 40, d: 40, h: 60 * t0.f2f, f2f: t0.f2f }, p = { twist: 90, twistTaper: 1 }
    const t = { ...withBlocks(t0, [...podium, ...formBlocks('twist', p, base)]), form: { type: 'twist' as const, p, base } }
    expect(formBlocks('twist', p, base)).toHaveLength(30)
    const r = panelReading([t])
    // every tower face but the lowest and highest storey's: each sits in a two-storey block, flat to its free end
    expect(r.warped).toBe(58 * 4)
    expect(r.maxUnitWarp).toBeCloseTo(1.5 * Math.sin((1.5 * Math.PI) / 180), 3)
  })

  it('shows in the facade node, on both projects', () => {
    for (const north of [45, 0]) {
      const r = facadeCheck([defaultTower('vtc')], DEFAULT_FACADE, north)
      expect(r.rules.map((x) => x.id)).toEqual(expect.arrayContaining(['fa-panels', 'fa-planar']))
      expect(r.panels.faces).toBeGreaterThan(0)
    }
    const city = facadeCheck([defaultTower('city', [254, 486])], DEFAULT_FACADE, 0)
    expect(city.rules.find((x) => x.id === 'fa-planar')?.state).toBe('pass')
  })
})
