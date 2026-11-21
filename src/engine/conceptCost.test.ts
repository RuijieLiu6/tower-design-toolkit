// G29 (vtc-entry TOOL_DEFICITS, cost review R3-11): the residual counted an open storey as money saved, since its deck,
// soffit, exposed core wall and screens, a declared damper, public lifts and trees carried no cost. They are now priced
// at team-assumption unit costs (to confirm) and the residual is shown with and without them.
import { describe, expect, it } from 'vitest'
import { CONCEPT_COSTS, conceptCosts, SCREEN_H } from './conceptCost'
import { economics, type EconInputs } from './economics'
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
