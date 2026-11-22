// G6 (vtc-entry TOOL_DEFICITS): storey weight by use, research R5 §3. A planted garden storey read as floor area was the
// lightest storey (A8a/A8b: 434%, "a modelling artefact"); by weight it carries its garden and reads as the heaviest.
import { describe, expect, it } from 'vitest'
import { structureCheck } from './structure'
import { DEFAULT_WEIGHT_PRESETS, GAMMA_C, HARD_DECK, PLANTED_BUILDUP, PLANTED_SLAB, SNOW_W, soilKpa, storeyWeights, USE_LOADS, worstWeightStep } from './storeyWeight'
import { importedTower, rect, stack } from './testStoreys'
import type { RuleResult, Tower, UseId } from './types'
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
/** The use presets of slab thickness (0.20 / 0.25 m at any span) and 0.6 m walls full height, which the hand arithmetic
 *  below uses (P1 #13 made the span the default, P1 #10 the banded walls). */
const BY_USE = { ...DEFAULT_WEIGHT_PRESETS, slabFrom: 'use' as const, coreWallBands: null }

describe('G6: storey weight by use (R5 §3)', () => {
  it('reads the open garden storey as the heaviest, not 434% light', () => {
    const r = structureCheck(A8, windProcedure(A8), BY_USE)
    const w = r.rules.find((x) => x.id === 'weight')!
    expect(w.label).toBe('Weight irregularity (Type 2)')
    expect(w.value).not.toMatch(/434%/)
    expect(w.value).toMatch(/by weight/)
    expect(w.note).toMatch(/By floor area alone: 434% between L24 and L25/) // 576 m² core under a 2,500 m² plate
    expect(w.note).toMatch(/Planted deck: L25 \(1,924 m², open garden storey\), each carried by its own floor/)
    const lv = r.weights.levels
    const g = lv.find((l) => l.level === GARDEN)!, below = lv.find((l) => l.level === GARDEN - 1)!, above = lv.find((l) => l.level === GARDEN + 1)!
    expect(g.garden).toBe(true)
    expect(g.deckKind).toBe('planted')
    expect(g.W).toBeGreaterThan(1.5 * below.W)
    expect(g.W).toBeGreaterThan(1.5 * above.W)
    expect(w.value).toMatch(new RegExp(`between L(${GARDEN - 1} and L${GARDEN}|${GARDEN} and L${GARDEN + 1})$`))
    expect(w.state).toBe('warn') // a real Type 2 reading now, not an artefact
    // With slabs from the span (13 m from the core face: about 0.29 m) and banded walls, the garden storey is still heavier than its neighbours.
    const span = storeyWeights(A8).levels
    expect(span.find((l) => l.level === GARDEN)!.W).toBeGreaterThan(1.5 * span.find((l) => l.level === GARDEN - 1)!.W)
  })

  it('builds each floor from its plate, its open deck, facade and core walls (equation 6.1)', () => {
    const lv = storeyWeights(A8, BY_USE).levels
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

  it('plants the open deck of a public-amenity floor (A10a/A11a: the garden at 100 m beside an enclosed wind wall)', () => {
    // The Z-shaped enclosed part of the garden storeys (1,707 m²) over a 2,500 m² office plate, both storeys tagged amenity.
    const wall: [number, number][] = [[-8, -23], [5, -23], [5, -10], [29, -10], [29, 14], [42, 14], [42, 27], [-8, 27]]
    const a11 = importedTower(stack([
      { n: 4, f2f: 4.8, ring: rect(64, 60, 24, 0), podium: true },
      { n: 20, f2f: 4, ring: shaft, use: 'office' },
      { n: 2, f2f: 4, ring: wall, use: 'amenity' },
      { n: 20, f2f: 4, ring: shaft, use: 'office' },
    ]), { podiumTop: 19.2 })
    const lv = storeyWeights(a11).levels
    const g1 = lv.find((l) => l.level === 25)!, g2 = lv.find((l) => l.level === 26)!
    expect(g1.garden).toBe(false) // not an open garden storey: more than half the plate is enclosed
    expect(g1.deckKind).toBe('planted')
    expect(g1.deck).toBeCloseTo(793, 6)
    expect(g2.deck).toBe(0) // the garden is double height: one deck, at 100 m
    const w = structureCheck(a11, windProcedure(a11)).rules.find((x) => x.id === 'weight')!
    expect(w.note).toMatch(/Planted deck: L25 \(793 m², public amenity floor\)/)
    expect(storeyWeights(a11, { ...DEFAULT_WEIGHT_PRESETS, planted: 'none' }).levels.find((l) => l.level === 25)!.deckKind).toBe('hard')
  })

  it('a uniform tower reads as before: uniform', () => {
    const uni = importedTower(stack([{ n: 40, f2f: 4, ring: rect(40, 40) }]), { podiumTop: 0 })
    const r = structureCheck(uni, windProcedure(uni), BY_USE).rules.find((x) => x.id === 'weight')!
    expect(r.value).toBe('uniform by weight')
    expect(r.state).toBe('pass')
    expect(worstWeightStep(storeyWeights(uni, BY_USE).levels)!.ratio).toBeCloseTo(1, 6)
    // banded walls (P1 #10) step the weight a little where a band ends: still a pass
    expect(structureCheck(uni, windProcedure(uni)).rules.find((x) => x.id === 'weight')!.state).toBe('pass')
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

// G21 (vtc-entry A19a structural review): the storey-weight presets come from an input, so a design can say 450 mm of soil.
describe('G21: storey-weight presets from the evidence input', () => {
  it('450 mm of soil lowers the garden storey’s weight step; fields left out keep the defaults', async () => {
    const { evidenceGroups } = await import('../lib/evidence/engines')
    const { useStore } = await import('../store')
    const s = useStore.getState()
    const base = { project: 'vtc' as const, towers: [A8], fsrTier: 2 as const, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets }
    const weight = (g: Record<string, unknown>) => (g['built.structure'] as RuleResult[][])[0].find((x) => x.id === 'weight')!
    const share = (r: RuleResult) => Number(/^(\d+)% by weight between L\d+ and L\d+$/.exec(r.value)![1])
    // the use presets of slab thickness, so the garden step governs (with slabs from the span the podium roof does)
    const dflt = weight(evidenceGroups({ ...base, weightPresets: { slabFrom: 'use', coreWall: 0.6 } })), soil = weight(evidenceGroups({ ...base, weightPresets: { slabFrom: 'use', coreWall: 0.6, soilMm: 450 } }))
    expect(share(soil)).toBeLessThan(share(dflt))
    expect(dflt.note).toMatch(/planted: 600 mm of soil/)
    expect(soil.note).toMatch(/planted: 450 mm of soil, 7\.2 kPa/)
    // The same as the engine run with those presets; an empty or absent input is the default.
    const engine = structureCheck(A8, windProcedure(A8, s.windPresets), { ...BY_USE, soilMm: 450 }).rules.find((x) => x.id === 'weight')!
    expect(soil.value).toBe(engine.value)
    const none = weight(evidenceGroups(base))
    expect(weight(evidenceGroups({ ...base, weightPresets: {} })).value).toBe(none.value)
    expect(weight(evidenceGroups({ ...base, weightPresets: null })).value).toBe(none.value)
    // The garden storey alone is lighter, by the 150 mm of soil on its 1,924 m² deck.
    const g = (soilMm: number) => storeyWeights(A8, { ...DEFAULT_WEIGHT_PRESETS, soilMm }).levels.find((l) => l.level === GARDEN)!.W
    expect(g(600) - g(450)).toBeCloseTo(1924 * soilKpa(150), 6)
    // No planted decks at all: the garden deck is hard.
    expect(share(weight(evidenceGroups({ ...base, weightPresets: { slabFrom: 'use', coreWall: 0.6, planted: 'none' } })))).toBeLessThan(share(soil))
  })
})

// G32 (vtc-entry C21a, structural review R3-10): soil was set for the whole tower and planted only on amenity floors, so an
// occupied loggia on an amenity floor read planted and the planted roof over it, on a residential storey, read hard.
describe('G32: soil per deck from the deck-use input', () => {
  // A 40 m square of homes; L21–L22 an amenity loggia 9 m deep on the south; L23 carried out over it (its roof); from L24
  // the inset plate again, so the loggia's roof is an open deck at L24, a residential storey.
  const inset = rect(40, 31, 0, 4.5)
  const C21 = (deckUses?: Tower['deckUses']): Tower => ({ ...importedTower(stack([
    { n: 20, f2f: 4, ring: rect(40, 40) },
    { n: 2, f2f: 4, ring: inset, use: 'amenity' },
    { n: 1, f2f: 4, ring: rect(40, 40) },
    { n: 16, f2f: 4, ring: inset },
  ])), ...(deckUses ? { deckUses } : {}) })
  const lv = (t: Tower, level: number) => storeyWeights(t, BY_USE).levels.find((l) => l.level === level)!
  const hardRes = 0.2 * GAMMA_C + HARD_DECK + SNOW_W, hardAm = 0.25 * GAMMA_C + HARD_DECK + SNOW_W
  const plantedAt = (mm: number) => PLANTED_SLAB * GAMMA_C + soilKpa(mm) + PLANTED_BUILDUP + SNOW_W
  const USES: Tower['deckUses'] = [{ level: 21, use: 'occupied' }, { level: 24, use: 'planted', soilMm: 600 }]

  it('by the storey’s use (before): the loggia floor reads planted, the roof over it hard', () => {
    expect(lv(C21(), 21)).toMatchObject({ deck: 360, deckKind: 'planted' })
    expect(lv(C21(), 24)).toMatchObject({ deck: 360, deckKind: 'hard' })
    expect(lv(C21(), 21).deckUse).toBeUndefined()
  })
  it('a planted roof on a residential storey adds its soil; an occupied loggia on an amenity storey adds only paving', () => {
    const before24 = lv(C21(), 24), after24 = lv(C21(USES), 24)
    expect(after24.deckKind).toBe('planted')
    expect(after24.deckUse).toEqual({ soilMm: 600 })
    expect(after24.W - before24.W).toBeCloseTo(360 * (plantedAt(600) - hardRes), 6)
    const before21 = lv(C21(), 21), after21 = lv(C21(USES), 21)
    expect(after21.deckKind).toBe('hard')
    expect(before21.W - after21.W).toBeCloseTo(360 * (plantedAt(600) - hardAm), 6)
    // the same as no planting at all on that floor: paving only
    expect(after21.W).toBeCloseTo(storeyWeights(C21(), { ...BY_USE, planted: 'none' }).levels.find((l) => l.level === 21)!.W, 6)
  })
  it('each deck carries its own soil depth; absent, the presets’ depth', () => {
    const at = (soilMm?: number) => lv(C21([{ level: 24, use: 'planted', ...(soilMm != null ? { soilMm } : {}) }]), 24)
    expect(at(600).W - at(300).W).toBeCloseTo(360 * soilKpa(300), 6)
    expect(at().W).toBeCloseTo(at(DEFAULT_WEIGHT_PRESETS.soilMm).W, 6)
    expect(storeyWeights(C21([{ level: 24, use: 'planted' }]), { ...BY_USE, soilMm: 450 }).levels.find((l) => l.level === 24)!.W).toBeCloseTo(at(450).W, 6)
  })
  it('a facing picks the deck: the planted weight sits on the south deck', () => {
    const s = lv(C21([{ level: 24, facing: 'S', use: 'planted', soilMm: 600 }]), 24), n = lv(C21([{ level: 24, facing: 'N', use: 'planted', soilMm: 600 }]), 24)
    expect(s.deckKind).toBe('planted')
    expect(s.W).toBeCloseTo(lv(C21(USES), 24).W, 6)
    expect(s.cy).toBeLessThan(lv(C21(), 24).cy) // the heavier deck pulls the weight centre south
    expect(n.deckKind).toBe('hard') // no deck faces north at L24
    expect(n.W).toBeCloseTo(lv(C21(), 24).W, 6)
  })
  it('the weight line names the decks the input set', () => {
    const w = structureCheck(C21(USES), windProcedure(C21(USES))).rules.find((x) => x.id === 'weight')!
    expect(w.note).toMatch(/Planted deck: L24 \(360 m², deck-use input, 600 mm of soil\)/)
    expect(w.note).toMatch(/Deck uses \(the deck-use input\) set the decks at L21, L24/)
  })
})
