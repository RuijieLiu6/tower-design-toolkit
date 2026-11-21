// G6 (vtc-entry TOOL_DEFICITS): storey weight by use, research R5 §3. A planted garden storey read as floor area was the
// lightest storey (A8a/A8b: 434%, "a modelling artefact"); by weight it carries its garden and reads as the heaviest.
import { describe, expect, it } from 'vitest'
import { structureCheck } from './structure'
import { DEFAULT_WEIGHT_PRESETS, GAMMA_C, HARD_DECK, PLANTED_BUILDUP, PLANTED_SLAB, SNOW_W, soilKpa, storeyWeights, USE_LOADS, worstWeightStep } from './storeyWeight'
import { importedTower, rect, stack } from './testStoreys'
import type { UseId } from './types'
import { windProcedure } from './windStructure'

// A8-like: a 90 × 60 m podium, a 50 × 50 m tower set 17 m east and 2 m north, and an open garden storey at mid-height
// whose plate is the 24 m core alone (the harness's open sky garden).
const core = rect(24, 24, 17, 2), shaft = rect(50, 50, 17, 2)
const A8 = importedTower(stack([
  { n: 4, f2f: 4, ring: rect(90, 60), podium: true },
  { n: 20, f2f: 4, ring: shaft },
  { n: 1, f2f: 4, ring: core, use: 'amenity' },
  { n: 20, f2f: 4, ring: shaft },
]), { podiumTop: 16 })
const GARDEN = 25

describe('G6: storey weight by use (R5 §3)', () => {
  it('reads the open garden storey as the heaviest, not 434% light', () => {
    const r = structureCheck(A8, windProcedure(A8))
    const w = r.rules.find((x) => x.id === 'weight')!
    expect(w.label).toBe('Weight irregularity (Type 2)')
    expect(w.value).not.toMatch(/434%/)
    expect(w.value).toMatch(/by weight/)
    expect(w.note).toMatch(/By floor area alone: 434% between L24 and L25/) // 576 m² core under a 2,500 m² plate
    expect(w.note).toMatch(/Open garden storey L25 \(1,924 m² planted deck\)/)
    const lv = r.weights.levels
    const g = lv.find((l) => l.level === GARDEN)!, below = lv.find((l) => l.level === GARDEN - 1)!, above = lv.find((l) => l.level === GARDEN + 1)!
    expect(g.garden).toBe(true)
    expect(g.deckKind).toBe('planted')
    expect(g.W).toBeGreaterThan(1.5 * below.W)
    expect(g.W).toBeGreaterThan(1.5 * above.W)
    expect(w.value).toMatch(new RegExp(`between L(${GARDEN - 1} and L${GARDEN}|${GARDEN} and L${GARDEN + 1})$`))
    expect(w.state).toBe('warn') // a real Type 2 reading now, not an artefact
  })

  it('builds each floor from its plate, its open deck, facade and core walls (equation 6.1)', () => {
    const lv = storeyWeights(A8).levels
    const q = (u: UseId) => USE_LOADS[u].slab * GAMMA_C + USE_LOADS[u].sdl + USE_LOADS[u].part
    const coreWalls = 4 * 24 * DEFAULT_WEIGHT_PRESETS.coreWall * GAMMA_C * 4
    // A typical tower floor: 2,500 m² of homes, 200 m of facade over 4 m, the core walls over 4 m.
    const typ = lv.find((l) => l.level === 10)!
    expect(typ.W).toBeCloseTo(2500 * q('residential') + 200 * 4 * DEFAULT_WEIGHT_PRESETS.facadeKpa + coreWalls, 6)
    // The garden: the core plate, the 1,924 m² planted deck at 600 mm, the facade of the floor below over half its height.
    const planted = PLANTED_SLAB * GAMMA_C + soilKpa(600) + PLANTED_BUILDUP + SNOW_W
    expect(soilKpa(600)).toBeCloseTo(9.54, 2) // Alberta guide: 600 mm intensive about 9.52 kPa
    const g = lv.find((l) => l.level === GARDEN)!
    expect(g.W).toBeCloseTo(576 * q('amenity') + 1924 * planted + 200 * 2 * 0.6 + coreWalls, 6)
    // The first tower floor carries the podium roof (5,400 − 2,500 m²) as a hard deck with a quarter of the snow.
    const first = lv.find((l) => l.level === 5)!
    expect(first.deck).toBeCloseTo(2900, 6)
    expect(first.deckKind).toBe('hard')
    expect(first.W).toBeCloseTo(2500 * q('residential') + 2900 * (0.2 * GAMMA_C + HARD_DECK + SNOW_W) + 300 * 2 * 0.6 + 200 * 2 * 0.6 + coreWalls, 6)
    // The floor on grade is the base; the roof is a level of its own, exempt when lighter than the floor below.
    expect(lv.some((l) => l.level === 1)).toBe(false)
    expect(lv[lv.length - 1].roof).toBe(true)
  })

  it('a uniform tower reads as before: uniform', () => {
    const uni = importedTower(stack([{ n: 40, f2f: 4, ring: rect(40, 40) }]), { podiumTop: 0 })
    const r = structureCheck(uni, windProcedure(uni)).rules.find((x) => x.id === 'weight')!
    expect(r.value).toBe('uniform by weight')
    expect(r.state).toBe('pass')
    expect(worstWeightStep(storeyWeights(uni).levels)!.ratio).toBeCloseTo(1, 6)
  })

  it('the planted-deck preset changes only the deck load', () => {
    const none = storeyWeights(A8, { ...DEFAULT_WEIGHT_PRESETS, planted: 'none' }).levels.find((l) => l.level === GARDEN)!
    const deep = storeyWeights(A8, { ...DEFAULT_WEIGHT_PRESETS, soilMm: 900 }).levels.find((l) => l.level === GARDEN)!
    const dflt = storeyWeights(A8).levels.find((l) => l.level === GARDEN)!
    expect(none.deckKind).toBe('hard')
    expect(none.W).toBeLessThan(dflt.W)
    expect(deep.W - dflt.W).toBeCloseTo(1924 * soilKpa(300), 6)
  })

  it('gives a building density in the range of concrete towers (the NBC sample used 176 kg/m³)', () => {
    const d = storeyWeights(A8).density
    expect(d).toBeGreaterThan(150)
    expect(d).toBeLessThan(400)
  })
})
