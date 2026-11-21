import { describe, expect, it } from 'vitest'
import { towerFloors } from './massing'
import type { Tower } from './types'
import { SITE, fsrSummary, publicStops, verticalPublic, verticalPublicRead, vtcRules } from './vtcRules'

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
  it('civic floors set by level above the podium are listed, but count only on a public route (G42); one in the podium is not read', () => {
    const tower = towerFloors(base).filter((f) => !f.podium), podium = towerFloors(base).find((f) => f.podium)!
    const l44 = tower.find((f) => f.level === 44)!.level
    expect(line({ ...base, floorUses: { [l44]: 'civic' } }).value).toBe('Public uses at grade only; Civic or amenity floor L44 not reached by a public route (reached by the hotel lifts only)')
    expect(line({ ...base, floorUses: { [l44]: 'civic' } }).state).toBe('warn')
    expect(line({ ...base, floorUses: { [podium.level]: 'civic' } }).value).toBe('Public uses at grade only')
    // a civic band and a floor set by level, both on tenant lifts, and a ticketed sky room: only the room counts
    const both: Tower = { ...base, bands: [...base.bands, { use: 'amenity', share: 0.05 }], floorUses: { [l44]: 'civic' }, skyLobbies: [51], skyRoom: { ...room, level: 51, free: false } }
    const v = line(both).value
    expect(v.startsWith('Public sky room at L51 (ticketed, 60% of the floor open to visitors); Civic or amenity floors ')).toBe(true)
    expect(v).toMatch(/not reached by a public route \(reached by the (hotel and residents'|residents' and hotel) lifts only\)$/)
    expect(line(both).state).toBe('pass')
  })
})

// G42 (vtc-entry cultural review R4-10): L44 typed civic is reached only by the residents' lifts, yet it counted as a
// public use. A civic or amenity level now counts only where a public lift route stops.
describe('G42: a civic level counts only where a public lift route stops', () => {
  const line = (t: Tower) => vtcRules([t], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'vertical-public')!
  const room = { access: 'shared' as const, free: true, hoursOpen: 12, visitorShare: 0.6, loadBasis: 'dining' as const, visitMinutes: 60 }
  const resi = towerFloors(base).find((f) => !f.podium && f.level === 60)!
  it("a civic floor reached only by residents' lifts no longer counts", () => {
    expect(towerFloors(base).find((f) => f.level === 60)!.use).toBe('residential')
    const l = line({ ...base, floorUses: { [resi.level]: 'civic' } })
    expect(l.state).toBe('warn')
    expect(l.value).toBe("Public uses at grade only; Civic or amenity floor L60 not reached by a public route (reached by the residents' lifts only)")
    expect(verticalPublic([{ ...base, floorUses: { [resi.level]: 'civic' } }])).toEqual([])
    expect(verticalPublicRead([{ ...base, floorUses: { [resi.level]: 'civic' } }]).unreached).toHaveLength(1)
  })
  it('a public sky room is a public stop: by its own lifts, or by the shuttle when visitors get part of the floor', () => {
    expect(publicStops({ ...base, skyLobbies: [51], skyRoom: { ...room, level: 51 } })).toEqual([51])
    expect(publicStops({ ...base, skyLobbies: [51], skyRoom: { ...room, level: 51, access: 'dedicated', visitorShare: 0 } })).toEqual([51])
    expect(publicStops({ ...base, skyLobbies: [51], skyRoom: { ...room, level: 51, visitorShare: 0 } })).toEqual([])
    expect(publicStops({ ...base, skyLobbies: [51] })).toEqual([])
    const dedicated = line({ ...base, skyLobbies: [51], skyRoom: { ...room, level: 51, access: 'dedicated' }, floorUses: { [resi.level]: 'civic' } })
    expect(dedicated.state).toBe('pass')
    expect(dedicated.value).toBe("Public sky room at L51 (free entry, 60% of the floor open to visitors, its own public lifts); Civic or amenity floor L60 not reached by a public route (reached by the residents' lifts only)")
  })
})
