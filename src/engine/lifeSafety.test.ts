import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { egressCheck } from './egress'
import { DEFAULT_SYSTEMS_PRESETS, LIFE_SAFETY_FALSE_ASSUMPTIONS, PRV_LIMIT_KPA, lifeSafety, type SystemsPresets } from './lifeSafety'
import { liftCheck } from './lifts'
import { towerFloors } from './massing'
import type { Tower } from './types'

const s = useStore.getInitialState()
const vtc = (patch: Partial<Tower> = {}): Tower => ({ ...s.towers.vtc[0], ...patch })
const city = (patch: Partial<Tower> = {}): Tower => ({ ...s.towers.city[0], ...patch })
function run(t: Tower, opts: { transitLink?: boolean; presets?: Partial<SystemsPresets>; servicesM2?: number } = {}) {
  const lifts = liftCheck(t, s.liftPresets, s.egressPresets)
  const egress = egressCheck(t, s.egressPresets, s.liftPresets)
  const r = lifeSafety(t, lifts, egress, { transitLink: opts.transitLink ?? false, liftPresets: { ...s.liftPresets, servicesM2: opts.servicesM2 ?? s.liftPresets.servicesM2 }, presets: { ...DEFAULT_SYSTEMS_PRESETS, ...opts.presets } })
  return { r, lifts, egress }
}
const find = (list: { id: string }[], id: string) => list.find((x) => x.id === id) as (typeof list)[number] & { state: string; value: string; flag: string; basis?: string; clause?: string }

describe('high-building checklist (P11-M05)', () => {
  it('a 285 m tower is a high building, sprinklered, and every item cites its clause and is flagged for the unread VBBL 2025', () => {
    const { r } = run(vtc())
    expect(r.highBuilding).toBe(true)
    expect(r.topStorey).toBeGreaterThan(200)
    expect(find(r.checklist, 'high-building').state).toBe('warn')
    expect(find(r.checklist, 'sprinklers').state).toBe('pass')
    for (const x of [...r.checklist, ...r.access]) {
      expect(x.clause, x.id).toBeTruthy()
      expect(x.source.label.length, x.id).toBeGreaterThan(5)
      if (x.source.label.includes('Vancouver Building By-law 2019') && x.basis !== 'linked') expect(x.flag, x.id).toBe('unverified')
    }
    expect(new Set(r.rules.map((x) => x.id)).size).toBe(r.rules.length)
    expect(find(run(city({ height: 15 })).r.checklist, 'high-building').state).toBe('pass')
  })
  it('links the egress and lift results instead of checking them again', () => {
    const { r, lifts, egress } = run(vtc())
    const ff = lifts.rules.find((x) => x.id === 'firefighter-t1')!
    expect(find(r.checklist, 'ff-elevator')).toMatchObject({ state: ff.state, value: ff.value, basis: 'linked', linked: 'built.core-lifts' })
    const exits = egress.rules.find((x) => x.id === 'exits-t1')!
    expect(find(r.checklist, 'exits')).toMatchObject({ state: exits.state, value: exits.value, basis: 'linked', linked: 'built.egress' })
  })
  it('the transit link brings in the connected-building and below-grade smoke items', () => {
    const off = run(vtc()).r, on = run(vtc(), { transitLink: true }).r
    expect(find(off.checklist, 'connected').state).toBe('pass')
    expect(find(on.checklist, 'connected').state).toBe('warn')
    expect(find(on.checklist, 'below-exit-stairs').state).toBe('unknown')
    expect(find(on.access, 'bf-transit').state).toBe('warn')
  })
  it('sizes the stair vent from the doors (0.05 m² each, at least 1.8 m²)', () => {
    const { r } = run(vtc())
    const doors = towerFloors(vtc()).filter((f) => f.z0 > 0.5).length
    expect(find(r.checklist, 'stair-vent').value).toContain(`${Math.round(Math.max(1.8, 0.05 * doors) * 10) / 10} m²`)
  })
  it('keeps the corrected assumptions (no mandatory refuge floor, protected zones deleted)', () => {
    expect(LIFE_SAFETY_FALSE_ASSUMPTIONS.map((f) => f.claim).join(' ')).toMatch(/refuge floors/)
    expect(find(run(vtc()).r.checklist, 'protected-zones').value).toMatch(/deleted/)
  })
})

describe('barrier-free vertical access (P11-M07)', () => {
  it('reaches every occupied tower floor by lift; podium floors above grade need their own stop', () => {
    expect(find(run(vtc()).r.access, 'bf-route').state).toBe('warn')
    expect(find(run(city()).r.access, 'bf-route').state).toBe('pass')
  })
  it('counts hotel rooms and adaptable homes from the program', () => {
    const t = vtc({ bands: [{ use: 'hotel', share: 0.5 }, { use: 'residential', share: 0.5 }] })
    const { r } = run(t)
    const keys = Number(find(r.access, 'bf-hotel').value.match(/about (\d+) keys/)![1])
    expect(find(r.access, 'bf-hotel').value).toContain(`at least ${Math.ceil(keys / 40)} accessible rooms and ${Math.ceil(keys / 20)} more`)
    expect(find(r.access, 'bf-adaptable').value).toMatch(/every one designed to 3\.8\.5/)
    expect(find(run(city()).r.access, 'bf-hotel')).toBeUndefined()
  })
})

describe('plant, risers and emergency power (P11-M03)', () => {
  it('zones domestic water so no fixture sees more than 550 kPa and the top keeps P_min', () => {
    const { r } = run(vtc())
    const h = (PRV_LIMIT_KPA - DEFAULT_SYSTEMS_PRESETS.pMinKpa) / 9.81
    expect(r.systems.water.length).toBe(Math.ceil(towerFloors(vtc()).at(-1)!.z1 / h))
    for (const z of r.systems.water) expect(z.headKpa).toBeLessThanOrEqual(PRV_LIMIT_KPA - DEFAULT_SYSTEMS_PRESETS.pMinKpa + 1)
  })
  it('gives a plant-floor range and a plant spacing that meets its minimum', () => {
    const { r } = run(vtc())
    const pl = r.systems.plant
    expect(pl.min).toBeGreaterThan(0)
    expect(pl.max).toBeGreaterThanOrEqual(pl.min)
    expect(find(r.systemRules, 'plant-floors').state).toBe('warn') // the default tower has no plant floors
    const t = vtc({ plantEvery: pl.suggestEvery! })
    expect(towerFloors(t).filter((f) => f.use === 'mechanical').length).toBeGreaterThanOrEqual(pl.min)
    expect(find(run(t).r.systemRules, 'plant-floors').state).toBe('pass')
  })
  it('feeds the core: the riser estimate passes once the core uses it', () => {
    const { r } = run(vtc(), { servicesM2: 20 })
    expect(find(r.systemRules, 'risers').state).toBe('warn')
    expect(find(run(vtc(), { servicesM2: Math.ceil(r.systems.servicesNeeded) }).r.systemRules, 'risers').state).toBe('pass')
  })
  it('lists every 3.2.7.9 load on a generator that runs at least 2 h', () => {
    const { r, egress } = run(vtc())
    const ids = r.systems.emergency.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['ff-lift', 'lift', 'pump', 'stair-fans', 'smoke-fans']))
    expect(r.systems.emergency.find((x) => x.id === 'stair-fans')!.kw).toBe(egress.stairs * DEFAULT_SYSTEMS_PRESETS.stairFanKw)
    expect(r.systems.generatorKw).toBe(r.systems.emergency.reduce((a, x) => a + x.kw, 0))
    expect(find(r.checklist, 'emergency-power').state).toBe('pass')
    expect(find(run(vtc(), { presets: { runtimeH: 1 } }).r.checklist, 'emergency-power').state).toBe('fail')
  })
  it('classifies every storey (P11-M09 subset)', () => {
    const { r } = run(vtc())
    const total = towerFloors(vtc()).reduce((a, f) => a + f.area, 0)
    expect(r.occupancy.reduce((a, o) => a + o.area, 0)).toBeCloseTo(total, 6)
    expect(r.occupancy.map((o) => o.group)).toEqual(expect.arrayContaining(['D']))
    expect(new Set(r.occupancy.map((o) => o.group)).size).toBe(r.occupancy.length) // one row per group: hotel and homes are both Group C
  })
})

describe('barrier-free entrances read the frontage input (node audit, 7 Nov)', () => {
  it('counts the entrances half of which must be barrier-free, and says so when none are known', () => {
    const s = useStore.getState()
    const t = s.towers.vtc[0] ?? (s.addTower(), useStore.getState().towers[useStore.getState().project][0])
    const lifts = liftCheck(t, s.liftPresets, s.egressPresets), egress = egressCheck(t, s.egressPresets, s.liftPresets)
    const row = (entrances: number | null) => lifeSafety(t, lifts, egress, { transitLink: false, liftPresets: s.liftPresets, entrances }).rules.find((r) => r.id.startsWith('bf-entrances'))!
    expect(row(21).value).toBe('21 pedestrian entrances on the frontage (team input): the principal one and at least 11 barrier-free')
    expect(row(null).value).toBe('entrances are not in the model yet')
    expect(row(21).state).toBe('warn')
  })
})
