import { describe, expect, it } from 'vitest'
import { towerFloors } from './massing'
import type { Tower } from './types'
import { SITE, fsrSummary, vtcRules } from './vtcRules'

const base: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 270, f2f: 4,
  podiumHeight: 18, podiumWidth: 120, podiumDepth: 70, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.6 }, { use: 'hotel', share: 0.15 }, { use: 'residential', share: 0.25 }],
  coreShare: 0.25, plantEvery: 0,
}

describe('massing', () => {
  it('allocates every tower floor to a band and stacks without gaps', () => {
    const f = towerFloors(base)
    const tower = f.filter((x) => !x.podium)
    expect(tower.length).toBe(Math.floor((270 - 18) / 4))
    for (let i = 1; i < f.length; i++) expect(f[i].z0).toBeCloseTo(f[i - 1].z1, 6)
  })
})

describe('plant floors (Schematic)', () => {
  it('turns every Nth tower floor into mechanical without changing the floor count', () => {
    const plain = towerFloors(base)
    const withPlant = towerFloors({ ...base, plantEvery: 20 })
    expect(withPlant.length).toBe(plain.length)
    const towerOnly = withPlant.filter((f) => !f.podium)
    expect(towerOnly.filter((f) => f.use === 'mechanical').length).toBe(Math.floor(towerOnly.length / 20))
  })
})

describe('VTC rules', () => {
  it('passes a 270 m tower and fails a 200 m tower on height', () => {
    expect(vtcRules([base], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'height-t1')!.state).toBe('pass')
    expect(vtcRules([{ ...base, height: 200 }], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'height-t1')!.state).toBe('fail')
  })
  it('warns when a height passes in one unit only (304.9 m)', () => {
    expect(vtcRules([{ ...base, height: 304.9 }], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'height-t1')!.state).toBe('warn')
  })
  it('computes FSR on the brief site area', () => {
    const s = fsrSummary([base])
    expect(s.total / SITE.area).toBeCloseTo(s.totalFsr, 6)
    expect(s.tier1).toBeLessThanOrEqual(s.tier2)
    expect(s.tier2).toBeLessThanOrEqual(s.tier3)
  })
  it('fails containment when a tower leaves the block', () => {
    expect(vtcRules([{ ...base, x: 70 }], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'containment')!.state).toBe('fail')
  })
})

// G36 (vtc-entry urban review R3-15): the line read the use bands only, so a public sky room or civic floors set by level
// read "at grade only".
describe('G36: public uses extend vertically', () => {
  const line = (t: Tower) => vtcRules([t], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'vertical-public')!
  const room = { access: 'shared' as const, free: true, hoursOpen: 12, visitorShare: 0.6, loadBasis: 'dining' as const, visitMinutes: 60 }
  it('a tower with bands only of office, hotel and homes reads at grade only', () => {
    expect(line(base).value).toBe('Public uses at grade only')
    expect(line(base).state).toBe('warn')
  })
  it('a free sky room at L51 counts', () => {
    const t: Tower = { ...base, skyLobbies: [51], skyRoom: { ...room, level: 51 } }
    expect(towerFloors(t).find((f) => f.level === 51)?.skyLobby).toBe(true)
    const l = line(t)
    expect(l.state).toBe('pass')
    expect(l.value).toBe('Public sky room at L51 (free entry, 60% of the floor open to visitors)')
    // a sky lobby that stays tenant-only, or a room with no visitor area, does not
    expect(line({ ...base, skyLobbies: [51] }).value).toBe('Public uses at grade only')
    expect(line({ ...t, skyRoom: { ...room, level: 51, visitorShare: 0 } }).value).toBe('Public uses at grade only')
  })
  it('civic floors set by level above the podium count; one in the podium does not', () => {
    const tower = towerFloors(base).filter((f) => !f.podium), podium = towerFloors(base).find((f) => f.podium)!
    const l44 = tower.find((f) => f.level === 44)!.level
    expect(line({ ...base, floorUses: { [l44]: 'civic' } }).value).toBe('Civic or amenity floor L44 above the podium (floor uses)')
    expect(line({ ...base, floorUses: { [podium.level]: 'civic' } }).value).toBe('Public uses at grade only')
    // the band rule as before, and every source listed
    const both: Tower = { ...base, bands: [...base.bands, { use: 'amenity', share: 0.05 }], floorUses: { [l44]: 'civic' }, skyLobbies: [51], skyRoom: { ...room, level: 51, free: false } }
    expect(line(both).value).toBe('Civic or amenity use above the podium; Civic or amenity floor L44 above the podium (floor uses); Public sky room at L51 (ticketed, 60% of the floor open to visitors)')
  })
})
