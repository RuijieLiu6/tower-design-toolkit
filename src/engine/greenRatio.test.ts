// Node built.green-ratio (NODE_LIST #5): greenwall facade zones (sw/plate.ts STRATS.greenwall) count in the vegetated
// area as face length × band height (the storey) × (1 − WWR), beside planted decks and planting at grade, and two lines
// read the total against the site and the floor area with the split. No threshold: Ecocity in the Sky gives no green plot
// ratio (read 21 Nov), so the lines stay unknown and any target is the team's. Three more lines (Ecocity note §6): planted
// area above grade ÷ footprint, vegetated area per resident beside the book's city-scale figures, and declared planters.
import { describe, expect, it } from 'vitest'
import { DEFAULT_NATURE, type NatureInput, type NatureResult } from './cityInNature'
import { greenwallArea, cityInNatureFrom, planterArea } from './natureSources'
import { towerHomes } from './interior'
import { DEFAULT_LIFT_PRESETS } from './lifts'
import type { FacadeZone } from './sw/plate'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'
import { SITE } from './vtcRules'
import { towerFloors } from './massing'
import { defaultTower } from '../store'

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

  it('adds walls to decks and grade, reads them against site and GFA with the split, unknown, thresholds the team’s', () => {
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
      expect(x.flag).toBe('team_assumption')
      expect(x.threshold).toMatch(/Ecocity in the Sky gives no green plot ratio/)
      expect(x.threshold).not.toMatch(/awaits|pending/)
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

describe('node contract on the vegetated-area lines', () => {
  it('marks Needs specialist when a tower with greenwall zones is twisted, never changing the state', () => {
    // The default parametric tower (no imported storeys, no turned block): inside the boundary.
    const plain = run({ ...defaultTower('vtc'), facadeZones: [green(10, 19)] })
    expect(row(plain, 'green-site').value).toMatch(/walls [1-9]/)
    expect(row(plain, 'green-site').specialist).toBeUndefined()
    // Imported storeys count as free form.
    const r = run(base({ facadeZones: [green(10, 19)] }))
    expect(row(r, 'green-site').specialist).toMatch(/twisted or free-form/)
    expect(row(r, 'green-site').state).toBe('unknown')
    expect(r.rules.find((l) => l.id === 'green-gfa')!.specialist).toMatch(/specialist/)
  })
})

describe('green ratio, three more lines (Ecocity in the Sky note §6)', () => {
  // Footprint = the lowest storey, a 60 m square podium: 3,600 m².
  it('reads planted area above grade against the footprint, leaving grade planting out', () => {
    const t = base({ facadeZones: [green(10, 19)], deckUses: [{ level: 44, use: 'planted', soilMm: 450 }] })
    const r = run(t, { groundPlantedM2: 1000 })
    const walls = greenwallArea([t], 0)!.m2, above = 1600 + walls
    const line = row(r, 'green-above')
    expect(line.value).toContain(`${Math.round((above / 3600) * 1000) / 10}% of the footprint`)
    expect(line.value).toContain('on 3,600 m²')
    expect(line).toMatchObject({ state: 'unknown', flag: 'team_assumption' })
    expect(line.source.page).toBe('pp.84–85')
    expect(line.threshold).toMatch(/gives no figure/)
    // Nothing above grade: 0% of the footprint (B35n and A35n today), not a missing value.
    expect(row(run(base(), { groundPlantedM2: 1000 }), 'green-above').value).toMatch(/^0% of the footprint \(3,600 m²\)/)
  })

  it('reads vegetated area per resident beside the book’s city figures, never as a pass line', () => {
    const t = base({ deckUses: [{ level: 44, use: 'planted' }] })
    const homes = towerHomes(t, towerFloors(t), DEFAULT_LIFT_PRESETS.homeM2)
    expect(homes).toBeGreaterThan(100)
    const r = run(t, { groundPlantedM2: 400 })
    const line = row(r, 'green-resident')
    const people = homes * DEFAULT_LIFT_PRESETS.personsPerHome
    expect(line.value).toContain(`${(2000 / people).toFixed(1)} m² per resident`)
    expect(line.threshold).toMatch(/Vancouver neighbourhood green 23\.46 m² per person \(p\.146\); Seoul legal minimum 6\.0 and ideal 16\.0 \(p\.100\)/)
    expect(line).toMatchObject({ state: 'unknown', flag: 'unverified', force: 'comparator_other_jurisdiction' })
    expect(line.source.page).toBe('pp.100, 146')
    // Persons per home come from the lift presets the caller gives.
    const three = cityInNatureFrom({ ...DEFAULT_NATURE, groundPlantedM2: 400 }, SITE.area, { project: 'vtc', towers: [t], north: 0, facade: null, facadeFromSettings: false, personsPerHome: 3 })
    expect(row(three, 'green-resident').value).toContain(`homes × 3)`)
    // An office tower: no homes, said so.
    const office = base({ imported: { ...base().imported!, storeys: base().imported!.storeys.map((s) => ({ ...s, use: s.podium ? s.use : 'office' as const })) } })
    expect(row(run(office), 'green-resident').value).toBe('no homes in the design')
  })

  it('counts declared planters as width × length on each storey, in the cover, the ratios and their own line', () => {
    // A 0.6 m ring planter round the 40 m square (160 m) on every storey from L10 to L19, and a box on L44 past the top.
    const t = base({ planters: [{ level: 10, to: 19, length: 160, width: 0.6, label: 'ring planter' }, { level: 50, length: 10, width: 1 }, { level: 20, length: 0, width: 1 }] })
    const p = planterArea([t])!
    expect(p.m2).toBeCloseTo(160 * 0.6 * 10)
    expect(p.parts).toEqual([expect.objectContaining({ from: 10, to: 19, storeys: 10, label: 'ring planter' })])
    const r = run(t)
    expect(row(r, 'green-planters')).toMatchObject({ state: 'pass', value: '1 planter, 960 m² counted (width × length on each storey)', entered: true })
    expect(row(r, 'green-planters').source.page).toBe('pp.90, 159')
    expect(row(r, 'green-site').value).toContain('planters 100%')
    expect(row(r, 'green-above').value).toContain('planters 960 m²')
    expect(row(r, 'cover').note).toMatch(/960 m² of declared planters/)
    expect(row(run(base()), 'green-planters')).toMatchObject({ state: 'unknown', value: 'none declared' })
  })

  it('runs on the default towers of both projects', () => {
    for (const p of ['vtc', 'city'] as const) {
      const x = defaultTower(p, p === 'city' ? [254, 486] : undefined)
      const r = cityInNatureFrom(DEFAULT_NATURE, 10000, { project: p, towers: [x], north: 0, facade: null, facadeFromSettings: false })
      for (const id of ['green-above', 'green-resident', 'green-planters']) expect(row(r, id).value.length, id).toBeGreaterThan(5)
      expect(row(r, 'green-above').value).toMatch(/of the footprint/)
    }
  })
})
