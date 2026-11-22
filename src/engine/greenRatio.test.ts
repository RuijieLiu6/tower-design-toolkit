// Node built.green-ratio (NODE_LIST #5): greenwall facade zones (sw/plate.ts STRATS.greenwall) count in the vegetated
// area as face length × band height (the storey) × (1 − WWR), beside planted decks and planting at grade, and two lines
// read the total against the site and the floor area with the split. No threshold yet: unknown, unresolved.
import { describe, expect, it } from 'vitest'
import { DEFAULT_NATURE, type NatureInput, type NatureResult } from './cityInNature'
import { greenwallArea, cityInNatureFrom } from './natureSources'
import type { FacadeZone } from './sw/plate'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'
import { SITE } from './vtcRules'
import { towerFloors } from './massing'

const green = (from: number, to: number, wwr = 0.3): FacadeZone => ({ face: 'all', from, to, strat: 'greenwall', wwr, shgc: 0.4, depth: 0, pv: 0, operable: false })
// 40 m square homes (3.2 m storeys) on a 60 m podium; the roof over the top storey (level 44) declared planted.
const base = (patch: Partial<Tower> = {}): Tower => ({ ...importedTower(stack([{ n: 3, f2f: 4.5, ring: rect(60, 60), podium: true }, { n: 40, f2f: 3.2, ring: rect(40, 40) }]), { podiumTop: 13.5, coreSide: 16 }), ...patch })
const run = (t: Tower, input: Partial<NatureInput> = {}): NatureResult => cityInNatureFrom({ ...DEFAULT_NATURE, ...input }, SITE.area, { project: 'vtc', towers: [t], north: 0, facade: null, facadeFromSettings: false })
const row = (r: NatureResult, id: string) => r.rows.find((x) => x.id === id)!
// The lines' own rounding: two decimals under 1, one under 10, none above.
const ratio = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2))

describe('Vegetated area: decks, walls, grade (node built.green-ratio)', () => {
  it('counts a greenwall zone as face length × storey height × (1 − WWR)', () => {
    const t = base({ facadeZones: [green(10, 19)] })
    const storeys = towerFloors(t).filter((f) => f.level >= 10 && f.level <= 19)
    expect(storeys.every((f) => Math.abs(f.z1 - f.z0 - 3.2) < 1e-6)).toBe(true)
    // 10 storeys of a 40 m square: 160 m of face × 3.2 m × 0.7 opaque each.
    const w = greenwallArea([t], 0)!
    expect(w.m2).toBeCloseTo(160 * 3.2 * 0.7 * storeys.length, 0)
    expect(w.parts).toEqual([expect.objectContaining({ face: 'All', from: 10, to: 19 })])
    // No greenwall zone (the Studio's default zones have none): nothing counted.
    expect(greenwallArea([base()], 0)).toBeNull()
  })

  it('adds walls to decks and grade, reads them against site and GFA with the split, unknown and unresolved', () => {
    const t = base({ facadeZones: [green(10, 19)], deckUses: [{ level: 44, use: 'planted', soilMm: 450 }] })
    const r = run(t, { groundPlantedM2: 1000 })
    const walls = greenwallArea([t], 0)!.m2, deck = 1600, grade = 1000, total = walls + deck + grade
    const gfa = towerFloors(t).reduce((s, f) => s + f.area, 0)
    const site = row(r, 'green-site'), perGfa = row(r, 'green-gfa')
    expect(site.value).toContain(`${ratio(total / SITE.area)} × site`)
    expect(site.value).toContain(`decks ${Math.round((deck / total) * 100)}%, walls ${Math.round((walls / total) * 100)}%, grade ${Math.round((grade / total) * 100)}%`)
    expect(perGfa.value).toContain(`${ratio(total / gfa)} × GFA`)
    for (const x of [site, perGfa]) {
      expect(x.state).toBe('unknown')
      expect(x.flag).toBe('unresolved')
      expect(x.threshold).toMatch(/awaits Ecocity in the Sky/)
      expect(String(x.source.page)).toBe('pp.151–161')
    }
    // The walls join the modelled vegetated cover too, said in its note.
    expect(row(r, 'cover').note).toMatch(/of planted wall \(greenwall facade zones/)
  })

  it('says what to model when there is no vegetated area', () => {
    const r = run(base())
    expect(row(r, 'green-site').value).toMatch(/^no vegetated area modelled/)
    expect(row(r, 'green-gfa').state).toBe('unknown')
  })
})
