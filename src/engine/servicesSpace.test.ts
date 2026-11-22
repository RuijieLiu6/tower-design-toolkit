import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { useStore } from '../store'
import { egressCheck } from './egress'
import { DEFAULT_SYSTEMS_PRESETS, SERVICES_BOOK, floorServices, lifeSafety, plantReach, servicesProfile } from './lifeSafety'
import { DEFAULT_LIFT_PRESETS, liftCheck } from './lifts'
import { towerFloors } from './massing'
import type { Floor, RuleResult, Tower } from './types'

// P1 node #14, services space by use (Allen & Iano pp.50, 185, 192–194; unverified analogues on an NBC 2010 base).
const s = useStore.getInitialState()
const base = (patch: Partial<Tower> = {}): Tower => ({ ...s.towers.vtc[0], coreAuto: false, coreShare: 0.22, plantEvery: 0, plantLevels: [], floorUses: {}, skyLobbies: [], skyRoom: null, ...patch })
const office = (patch: Partial<Tower> = {}) => base({ bands: [{ use: 'office', share: 1 }], ...patch })
const homes = (patch: Partial<Tower> = {}) => base({ bands: [{ use: 'residential', share: 1 }], ...patch })
const towerStorey = (t: Tower) => towerFloors(t).find((f) => !f.podium && f.z0 > 0.5 && f.use !== 'mechanical' && !f.skyLobby)!
function run(t: Tower, liftPatch: Partial<typeof s.liftPresets> = {}) {
  const lp = { ...s.liftPresets, ...liftPatch }
  const lifts = liftCheck(t, lp, s.egressPresets)
  const egress = egressCheck(t, s.egressPresets, lp)
  return { lifts, r: lifeSafety(t, lifts, egress, { transitLink: false, liftPresets: lp, presets: DEFAULT_SYSTEMS_PRESETS }) }
}
const line = (rules: RuleResult[], id: string) => rules.find((x) => x.id === id)!

describe('services space by use (P1 node #14)', () => {
  it('an all-air office storey gives 4% of its floor to shafts, plus electrical and telecom rooms and washrooms', () => {
    const t = office(), f = towerStorey(t)
    const r = floorServices(t, f, DEFAULT_LIFT_PRESETS.homeM2)
    expect(r.shafts).toBeCloseTo(0.04 * f.area, 6)
    expect(r.electrical).toBeCloseTo(Math.ceil(f.area / 1400) * 7.2, 6)
    expect(r.comms).toBeCloseTo(11.1, 6)
    expect(r.washrooms).toBe(DEFAULT_SYSTEMS_PRESETS.washroomsM2)
    expect(r.total).toBeCloseTo(r.shafts + r.electrical + r.comms + r.team + r.washrooms, 6)
    // Air-water and other systems: 2% (the reader's reading of "less").
    expect(floorServices(office({ hvac: 'air-water' }), f, 75).shafts).toBeCloseTo(0.02 * f.area, 6)
    expect(floorServices(office({ hvac: 'other' }), f, 75).shafts).toBeCloseTo(0.02 * f.area, 6)
  })
  it('a home storey gets one 0.3 × 1.2 m pipe shaft per two unit stacks and no core washrooms, less than the old flat figure', () => {
    const t = homes(), f = towerStorey(t)
    const r = floorServices(t, f, 75)
    const n = ((f.area - 0.22 * t.width * t.depth) / 75)
    expect(r.shafts).toBeCloseTo(Math.ceil(n / 2 - 1e-9) * SERVICES_BOOK.pipeShaftM2, 6)
    expect(r.washrooms).toBe(0)
    const { r: ls } = run(t)
    expect(r.total).toBeLessThan(ls.systems.servicesNeeded)
    expect(line(ls.systemRules, 'services-residential').label).toBe('Home floor services')
  })
  it('reads "office floor services X m² vs 40.5" and passes while the core check reserves them by use', () => {
    const { r } = run(office())
    const l = line(r.systemRules, 'services-office')
    expect(r.systems.servicesNeeded).toBeCloseTo(40.5 - DEFAULT_SYSTEMS_PRESETS.chuteM2, 6) // no homes or hotel: no chute
    expect(l.value).toMatch(/^\d[\d,]* m² vs 39$/)
    expect(Number(l.value.split(' ')[0].replace(/,/g, ''))).toBeGreaterThan(100)
    expect(l.state).toBe('pass')
    expect(l.flag).toBe('unverified')
    expect(l.source.label).toMatch(/Allen & Iano/)
    expect(l.source.page).toBe('pp.192–193')
    // With "by use" off the core keeps the flat 40 m², which this storey exceeds.
    expect(line(run(office(), { servicesByUse: false }).r.systemRules, 'services-office').state).toBe('warn')
    // The risers line with its flat figure is gone, and so is the Wikipedia source.
    expect(r.systemRules.find((x) => x.id === 'risers')).toBeUndefined()
    expect(JSON.stringify(r.rules)).not.toMatch(/Wikipedia/)
  })
  it('the Core & lift check reserves each storey’s services by use; off, the flat figure as before', () => {
    const t = office()
    const byUse = liftCheck(t, DEFAULT_LIFT_PRESETS, s.egressPresets)
    const prof = new Map(servicesProfile(t, DEFAULT_LIFT_PRESETS.homeM2).map((x) => [x.level, x.total]))
    for (const c of byUse.profile) expect(c.services).toBeCloseTo(prof.get(c.level)!, 6)
    const flat = liftCheck(t, { ...DEFAULT_LIFT_PRESETS, servicesByUse: false }, s.egressPresets)
    for (const c of flat.profile) expect(c.services).toBe(DEFAULT_LIFT_PRESETS.servicesM2)
    expect(byUse.requiredMax).toBeGreaterThan(flat.requiredMax)
    expect(byUse.rules.find((x) => x.id === 'core-fit-t1')!.note).toMatch(/services by use/)
    // A home tower needs less than the flat 40 m² on its typical storeys.
    const h = homes()
    expect(liftCheck(h, DEFAULT_LIFT_PRESETS, s.egressPresets).profile.find((c) => c.level === towerStorey(h).level)!.services).toBeLessThan(DEFAULT_LIFT_PRESETS.servicesM2)
  })
  it('plant and podium storeys carry the tower risers that run through, without rooms of their own', () => {
    const t = office({ plantEvery: 10 })
    const rows = servicesProfile(t, 75)
    const fl = towerFloors(t)
    const i = fl.findIndex((f) => f.use === 'mechanical' && !f.podium)
    expect(rows[i].through).toBe(true)
    expect(rows[i].shafts).toBeCloseTo(rows[i - 1].shafts, 6)
    expect(rows[i].washrooms + rows[i].electrical).toBe(0)
    const pod = fl.findIndex((f) => f.podium && f.z0 > 0.5)
    if (pod >= 0) expect(rows[pod].through).toBe(true)
  })
})

describe('plant floor reach (Allen & Iano p.185)', () => {
  const stack = (uses: Floor['use'][]): Floor[] => uses.map((use, i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, use, area: 1000, podium: false }) as Floor)
  it('measures the farthest occupied storey from a plant floor or the roof plant', () => {
    const r = plantReach(stack([...Array(30).fill('office'), 'mechanical', ...Array(10).fill('office')]))
    expect(r).toMatchObject({ storeys: 30, level: 1, from: 'the L31 plant floor' })
    expect(plantReach(stack(Array(10).fill('office')))).toMatchObject({ storeys: 10, level: 1, from: 'the roof plant' })
  })
  it('passes to 13 storeys, checks 14–25 and fails beyond (default tower without plant fails)', () => {
    const state = (t: Tower) => line(run(t).r.systemRules, 'plant-reach')
    const tall = office()
    const n = towerFloors(tall).length
    expect(state(tall).state).toBe(n > 25 ? 'fail' : n > 13 ? 'warn' : 'pass')
    expect(state(tall).value).toMatch(/^farthest coverage \d+ storeys \(L\d+ \w+, from the roof plant\)$/)
    // A plant floor every 20 tower floors still leaves the podium and the low tower floors far from plant (no basement plant).
    expect(state(office({ plantEvery: 20 })).state).not.toBe('fail')
    const levels = towerFloors(tall)
    const mid = levels[levels.length - 26].level // 25 storeys from the top: roof reach 1 + 24 above, the base far below
    const r = state(office({ plantLevels: [mid, levels[20].level] }))
    expect(['warn', 'fail']).toContain(r.state)
    expect(line(run(office({ plantLevels: [levels[8].level, levels[30].level, levels[52].level] })).r.systemRules, 'plant-reach').state).toBe('pass')
  })
})

describe('core share and the KPF cross-check (Core & lift check)', () => {
  it('sets the base core against 20–25% of the floor (pp.50, 192)', () => {
    const at = (coreShare: number) => liftCheck(office({ coreShare }), DEFAULT_LIFT_PRESETS, s.egressPresets).rules.find((x) => x.id === 'core-share-t1')!
    expect(at(0.22)).toMatchObject({ state: 'pass', value: '22%', flag: 'unverified' })
    expect(at(0.3).state).toBe('warn')
    expect(at(0.15).state).toBe('warn')
    expect(at(0.22).source.page).toBe('pp.50, 192')
  })
  it('lists each core step’s share', () => {
    const t = office()
    const lv = towerFloors(t).filter((f) => !f.podium).at(-20)!.level
    const r = liftCheck({ ...t, coreSteps: [{ fromLevel: lv, side: 12 }] }, DEFAULT_LIFT_PRESETS, s.egressPresets).rules.find((x) => x.id === 'core-share-t1')!
    expect(r.value).toMatch(new RegExp(`^22% · \\d+% from L${lv} \\(12\\.0 m core\\)$`))
  })
  it('reports the KPF rule of thumb (KPF 2025 p.5) beside the lift plan, never deciding', () => {
    const t = office()
    const r = liftCheck(t, DEFAULT_LIFT_PRESETS, s.egressPresets)
    const k = r.rules.find((x) => x.id === 'lifts-kpf-t1')!
    const gfa = towerFloors(t).filter((f) => f.use === 'office' && f.z0 > 0.5).reduce((a, f) => a + f.area, 0)
    expect(k.state).toBe('unknown')
    expect(k.value).toContain(`office ${Math.ceil(gfa / 4181)} vs`)
    expect(k.source.page).toBe('p.5')
    // Homes: 2 cars for the first 100 units, then 1 more per 100.
    expect(liftCheck(homes(), DEFAULT_LIFT_PRESETS, s.egressPresets).rules.find((x) => x.id === 'lifts-kpf-t1')!.value).toMatch(/homes \d+ vs \d+/)
  })
})

describe('node contract (21 Nov)', () => {
  it('the life-safety entry that hosts services space says B and its boundary; lines name a specialist outside it', () => {
    const n = BUILT_NODES.find((x) => x.id === 'built.life-safety')!
    expect(n.confidence).toBe('B')
    expect(n.boundary).toMatch(/NBC 2010/)
    expect(line(run(office()).r.systemRules, 'services-office').specialist).toBeUndefined()
    expect(line(run(office({ hvac: 'other' })).r.systemRules, 'services-office').specialist).toMatch(/all-water or in-suite/)
    expect(line(run(office({ hvac: 'other' })).r.systemRules, 'plant-reach').specialist).toBeTruthy()
  })
})
