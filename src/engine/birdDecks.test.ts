import { describe, expect, it } from 'vitest'
import { cityInNature, DEFAULT_NATURE, fourthStoreyTop } from './cityInNature'
import { DEFAULT_FACADE, facadeCheck, plantedDeckFaces, SYSTEMS } from './facade'
import { towerFloors, withBlocks } from './massing'
import { towerDecks } from './sw/decks'
import type { Tower } from './types'

// G34 (City in Nature review R3-13): the bird-collision zone stopped at the 4th storey (16 m on the facade node), but
// glass next to planting counts at any height (guideline 3.3(c)(ii), as cited by the team, to confirm).
const base: Tower = {
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 50, depth: 50, height: 250, f2f: 4, podiumHeight: 0, podiumWidth: 60, podiumDepth: 60,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.2, plantEvery: 0,
}
/** 50 m square to +100 m, then the north (+y) face steps back 10 m to +250 m: a 50 × 10 m deck at +100 m. */
const stepped = (patch: Partial<Tower> = {}) => withBlocks({ ...base, ...patch }, [
  { id: 'a', height: 100, width: 50, depth: 50, dx: 0, dy: 0, rotation: 0 },
  { id: 'b', height: 150, width: 50, depth: 40, dx: 0, dy: -5, rotation: 0 },
])
const deck = towerDecks(stepped(), 0).find((d) => Math.abs(d.z - 100) < 0.5)!

describe('G34: glass beside a planted deck counts at any height', () => {
  it('finds the +100 m setback deck', () => {
    expect(deck).toBeTruthy()
    expect(deck.type).toBe('setback')
  })
  it('a planted deck at +100 m adds glass to the bird line; an occupied paved deck does not', () => {
    const planted = stepped({ deckUses: [{ level: deck.level, use: 'planted' }] })
    const paved = stepped({ deckUses: [{ level: deck.level, use: 'occupied' }] })
    const none = facadeCheck([stepped()], DEFAULT_FACADE, 0)
    const p = facadeCheck([planted], DEFAULT_FACADE, 0)
    const o = facadeCheck([paved], DEFAULT_FACADE, 0)
    // the wall rising from the deck: 50 m long, the deck's storey and the one above (2 × 4 m), curtain-wall 60% glass
    expect(p.deckFaces).toHaveLength(1)
    expect(p.deckFaces[0].z0).toBeCloseTo(100, 6)
    expect(p.deckFaces[0].z1).toBeCloseTo(108, 6)
    expect(p.deckGlass).toBeCloseTo(50 * 8 * SYSTEMS['curtain-wall'].wwr, 6)
    expect(o.deckGlass).toBe(0)
    expect(o.deckFaces).toHaveLength(0)
    // the facade node's line: reported apart, the zone below 16 m unchanged
    const bird = (r: typeof p) => r.rules.find((x) => x.id === 'fa-bird')!.value
    expect(p.zoneGlass).toBeCloseTo(none.zoneGlass, 6)
    expect(bird(p)).toContain('plus 240 m² of glass beside planted decks at +100 m (any height, 3.3(c)(ii))')
    expect(bird(o)).toBe(bird(none))
    // City in Nature's line: added to the 4th-storey zone's glazing, and reported apart
    const nature = (t: Tower, fa: typeof p) => cityInNature(DEFAULT_NATURE, 10000, null, { fourthStoreyTop: fourthStoreyTop([towerFloors(t)]), faces: fa.faces, deckFaces: fa.deckFaces }).rows.find((r) => r.id === 'bird-zone')!.value
    expect(nature(planted, p)).toContain('(240 m² of it beside planted decks at +100 m, any height)')
    expect(nature(paved, o)).toBe(nature(stepped(), none))
    expect(nature(paved, o)).not.toContain('planted')
  })
  it('a planted roof with nothing rising from it adds no glass', () => {
    const top = towerDecks(stepped(), 0).find((d) => d.type === 'roof' && d.z > 200)!
    expect(plantedDeckFaces([stepped({ deckUses: [{ level: top.level, use: 'planted' }] })], DEFAULT_FACADE, 0)).toHaveLength(0)
  })
})
