// G29 (vtc-entry TOOL_DEFICITS, cost review R3-11): the residual counted an open storey as money saved, since its deck,
// soffit, exposed core wall and screens, a declared damper, public lifts and trees carried no cost. They are now priced
// at team-assumption unit costs (to confirm) and the residual is shown with and without them.
import { describe, expect, it } from 'vitest'
import { CONCEPT_COSTS, conceptCosts, SCREEN_H } from './conceptCost'
import { economics, type EconInputs } from './economics'
import { towerDecks } from './sw/decks'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'

const INP: EconInputs = { permitYear: 2027, landPrice: null, siteArea: null, includeRegional: true, homeM2: 70, hotelM2PerKey: 40 }
// 40 m square homes on a podium; at L22–L23 an open garden storey keeps only its 16 m core, under the slab of L24.
const garden = (): Tower => importedTower(stack([
  { n: 3, f2f: 4.5, ring: rect(60, 60), podium: true },
  { n: 18, f2f: 3.2, ring: rect(40, 40) },
  { n: 2, f2f: 3.2, ring: rect(16, 16), use: 'amenity' },
  { n: 20, f2f: 3.2, ring: rect(40, 40) },
]), { podiumTop: 13.5, coreSide: 16 })
const plain = (): Tower => importedTower(stack([{ n: 3, f2f: 4.5, ring: rect(60, 60), podium: true }, { n: 40, f2f: 3.2, ring: rect(40, 40) }]), { podiumTop: 13.5, coreSide: 16 })

describe('G29: the concept’s own costs', () => {
  it('prices the open garden storey’s deck, soffit, exposed core wall and screens', () => {
    const c = conceptCosts([garden()])
    const by = (id: string) => c.lines.find((l) => l.id === id)!
    const deck = 40 * 40 - 16 * 16
    expect(by('deckPlanted').qty).toBeCloseTo(deck, 0) // an amenity garden storey: planted
    expect(by('soffit').qty).toBeCloseTo(deck, 0)
    expect(by('screen').qty).toBeCloseTo(4 * 40 * SCREEN_H, 0)
    expect(by('coreWall').qty).toBeCloseTo(4 * 16 * 2 * 3.2, 0) // the core outdoors over the two storeys to the slab above
    expect(c.lines.every((l) => l.rate.flag === 'team_assumption' && /^Team assumption, to confirm/.test(l.rate.source))).toBe(true)
    expect(c.total).toBeCloseTo(c.lines.reduce((s, l) => s + l.qty * CONCEPT_COSTS[l.id].value, 0), 3)
    // A tower with no open storey, no damper, no public lifts and no trees has none.
    expect(conceptCosts([plain()]).lines).toEqual([])
  })

  it('a tower with an open garden storey shows a lower residual once the open-storey costs are included', () => {
    const e = economics([garden()], INP)
    expect(e.concept.total).toBeGreaterThan(0)
    expect(e.concept.rlvAfter).toBeLessThan(e.rlvAfter) // the old reading stays in rlvAfter
    expect(e.concept.cost).toBeGreaterThan(e.cost)
    // Soft cost, finance and profit follow the added hard cost.
    expect(e.rlvBefore - e.concept.rlvBefore).toBeGreaterThan(e.concept.total)
    // Without an open storey both readings are the same.
    const p = economics([plain()], INP)
    expect(p.concept.rlvAfter).toBe(p.rlvAfter)
  })

  it('adds a declared damper, public lifts and trees as allowances', () => {
    const c = conceptCosts([plain()], { supplementalDamping: 0.02, damperNote: 'sloshing tanks in the crown', publicLifts: 2, trees: 27 })
    expect(c.lines.map((l) => l.id)).toEqual(['damper', 'publicLift', 'tree'])
    expect(c.total).toBe(CONCEPT_COSTS.damper.value + 2 * CONCEPT_COSTS.publicLift.value + 27 * CONCEPT_COSTS.tree.value)
    expect(c.lines[0].note).toBe('sloshing tanks in the crown')
    const e = economics([plain()], { ...INP, concept: { supplementalDamping: 0.02 } })
    expect(e.concept.rlvAfter).toBeLessThan(e.rlvAfter)
  })
})

// G40/T22 (cost review R4-5): the forest-square trees were priced as trees at height and the no-access ring as a deck.
describe('G40/T22: trees at grade and no-access decks at their own rates', () => {
  const level = towerDecks(garden(), 0).find((d) => d.cover != null)!.level
  const withUse = (use: 'occupied' | 'none'): Tower => ({ ...garden(), deckUses: [{ level, use }] })

  it('a deck declared none costs less than the same deck occupied', () => {
    const occ = conceptCosts([withUse('occupied')]), none = conceptCosts([withUse('none')])
    const by = (c: typeof occ, id: string) => c.lines.find((l) => l.id === id)
    const deck = 40 * 40 - 16 * 16
    expect(by(occ, 'deckHard')!.qty).toBeCloseTo(deck, 0)
    expect(by(none, 'deckHard')).toBeUndefined()
    expect(by(none, 'deckNone')!.qty).toBeCloseTo(deck, 0)
    expect(by(none, 'screen')).toBeUndefined() // no one stands there: no guard screens
    expect(by(none, 'soffit')!.qty).toBeCloseTo(deck, 0) // the slab above still needs its soffit
    expect(none.total).toBeLessThan(occ.total)
    expect(CONCEPT_COSTS.deckNone.value).toBeLessThan(CONCEPT_COSTS.deckHard.value)
  })

  it('prices trees at grade apart from trees at height, typed or from the ground wind study', () => {
    const c = conceptCosts([plain()], { trees: 4, treesAtGrade: 35 })
    expect(c.lines.map((l) => l.id)).toEqual(['tree', 'treeGrade'])
    expect(c.total).toBe(4 * CONCEPT_COSTS.tree.value + 35 * CONCEPT_COSTS.treeGrade.value)
    expect(CONCEPT_COSTS.treeGrade.value).toBeLessThan(CONCEPT_COSTS.tree.value)
    const wind = conceptCosts([plain()], { groundPorous: [{ kind: 'tree' }, { kind: 'tree' }, { kind: 'screen' }] })
    expect(wind.lines).toHaveLength(1)
    expect(wind.lines[0]).toMatchObject({ id: 'treeGrade', qty: 2, note: 'the ground wind study’s trees' })
    // a typed count wins over the wind study's trees, and 0 typed is none
    expect(conceptCosts([plain()], { treesAtGrade: 0, groundPorous: [{ kind: 'tree' }] }).lines).toEqual([])
    for (const id of ['deckNone', 'treeGrade'] as const) {
      expect(CONCEPT_COSTS[id].flag).toBe('team_assumption')
      expect(CONCEPT_COSTS[id].source).toMatch(/^Team assumption, to confirm/)
    }
  })
})
