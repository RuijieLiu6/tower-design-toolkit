import { describe, expect, it } from 'vitest'
import { DEFAULT_EGRESS_PRESETS, egressCheck } from './egress'
import { DEFAULT_LIFT_PRESETS, liftCheck, planRises, publicStopFloors } from './lifts'
import { coreAreaAt, towerFloors } from './massing'
import { skyRoomCheck } from './skyRoom'
import type { SkyRoom, Tower } from './types'
import { publicStops, vtcRules } from './vtcRules'

// G43 (vtc-entry review R5-1, public realm): one public room per tower. A public garden low and a public restaurant high
// could count only one; further public levels now ride the sky room's own public lifts.
const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'residential', share: 0.3 }],
  coreShare: 0.21, plantEvery: 0, skyLobbies: [25], skyRoom: null,
}
const li = { homeM2: DEFAULT_LIFT_PRESETS.homeM2, hotelM2PerKey: DEFAULT_LIFT_PRESETS.hotelM2PerKey }
const room = (patch: Partial<SkyRoom> = {}): SkyRoom => ({ level: 25, access: 'dedicated', free: true, hoursOpen: 16, visitorShare: 0.9, loadBasis: 'dining', visitMinutes: 60, ...patch })
const alone: Tower = { ...vtc, skyRoom: room() }
const two: Tower = { ...alone, publicStops: [{ level: 55, visitorShare: 0.6, free: false, hoursOpen: 12, label: 'restaurant' }] }
const check = (t: Tower) => skyRoomCheck(t, liftCheck(t), egressCheck(t, DEFAULT_EGRESS_PRESETS, li))
const line = (t: Tower) => vtcRules([t], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'vertical-public')!

describe('G43: further public levels on the sky room\'s public lifts', () => {
  it('a sky room and one public stop read a larger public share than the sky room alone', () => {
    const a = check(alone), b = check(two)
    const f55 = towerFloors(two).find((f) => f.level === 55)!
    const added = Math.max(0, f55.area - coreAreaAt(two, 55)) * 0.6
    expect(added).toBeGreaterThan(0)
    expect(b.shareAbovePodium).toBeGreaterThan(a.shareAbovePodium)
    const abovePodium = towerFloors(two).filter((f) => !f.podium).reduce((s, f) => s + f.area, 0)
    // the room's own net area (less the core at its level) times its share, plus the stop's, over the floor above the podium
    expect(b.shareAbovePodium).toBeCloseTo(((b.visitorArea + added) / abovePodium) * 100, 6)
    expect(b.publicStops.map((x) => x.floor.level)).toEqual([55])
    const share = b.rules.find((r) => r.id === 'skyroom-share-t1')!
    expect(share.value).toContain('L55 restaurant')
  })
  it('the public lift group stops at every public level and carries their visitors', () => {
    const a = liftCheck(alone).rises.find((r) => r.cls === 'public')!
    const b = liftCheck(two).rises.find((r) => r.cls === 'public')!
    expect(a.floors.map((f) => f.level)).toEqual([25])
    expect(b.floors.map((f) => f.level)).toEqual([25, 55])
    expect(b.topZ).toBeGreaterThan(a.topZ)
    expect(b.visitors5!).toBeCloseTo(a.visitors5! + publicStopFloors(two)[0].visitors5, 6)
    expect(b.label).toBe(`${b.id} Public lifts to the sky room L25 and public level L55`)
    // the sky room still finds its group, and its visitor line counts the stop
    const lifts = check(two).rules.find((r) => r.id === 'skyroom-lifts-t1')!
    expect(lifts.value).toContain(b.id)
    expect(lifts.value).toContain('(the room and L55)')
  })
  it('"Public uses extend vertically" lists the public stop; the vertical-public stops include it', () => {
    expect(publicStops(two)).toEqual([25, 55])
    expect(line(two).value).toBe('Public sky room at L25 (free entry, 90% of the floor open to visitors, its own public lifts); Public level L55 restaurant (ticketed, 12 h a day, 60% of the floor open to visitors, on the sky room\'s public lifts)')
  })
  it('a stop needs a public sky room on its own lifts: on the shared shuttle it is listed apart and not counted', () => {
    const shared: Tower = { ...two, skyRoom: room({ access: 'shared' }) }
    expect(publicStopFloors(shared)).toEqual([])
    expect(check(shared).shareAbovePodium).toBeCloseTo(check({ ...shared, publicStops: undefined }).shareAbovePodium, 9)
    expect(line(shared).value).toContain('Public level L55 not on a public route')
    // a stop at the room's own level, on plant or with no visitor area is not counted twice or at all
    expect(publicStopFloors({ ...alone, publicStops: [{ level: 25, visitorShare: 1 }, { level: 55, visitorShare: 0 }] })).toEqual([])
  })
  it('a tower without publicStops is unchanged', () => {
    const empty: Tower = { ...alone, publicStops: [] }
    for (const t of [alone, { ...vtc, skyRoom: room({ access: 'shared' }) }]) {
      const withEmpty = { ...t, publicStops: [] }
      expect(check(withEmpty)).toEqual(check(t))
      expect(liftCheck(withEmpty)).toEqual(liftCheck(t))
      expect(planRises(withEmpty, DEFAULT_LIFT_PRESETS)).toEqual(planRises(t, DEFAULT_LIFT_PRESETS))
      expect(line(withEmpty)).toEqual(line(t))
    }
    const a = check(alone)
    expect(a.publicStops).toEqual([])
    expect(a.rules.find((r) => r.id === 'skyroom-share-t1')!.value).toBe(`${a.shareAbovePodium.toFixed(1)}% of tower floor area`)
    expect(liftCheck(empty).rises.find((r) => r.cls === 'public')!.label).toMatch(/^P1 Public lifts to the sky room L25$/)
    expect(publicStops(alone)).toEqual([25])
  })
})
