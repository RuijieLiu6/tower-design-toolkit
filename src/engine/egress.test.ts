import { describe, expect, it } from 'vitest'
import { DEFAULT_EGRESS_PRESETS, LOAD_FACTOR, STAIR_MIN_MM, egressCheck, postedLimitForRoom, stairEnclosure, stairSpots, storeyLoads } from './egress'
import { DEFAULT_LIFT_PRESETS, liftCheck, planRises } from './lifts'
import { skyRoomCheck, stablePostedLimit } from './skyRoom'
import type { SkyRoom, Tower } from './types'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 0, skyLobbies: [], skyRoom: null,
}
const li = { homeM2: DEFAULT_LIFT_PRESETS.homeM2, hotelM2PerKey: DEFAULT_LIFT_PRESETS.hotelM2PerKey }
const room = (patch: Partial<SkyRoom> = {}): SkyRoom => ({ level: 40, access: 'shared', free: true, hoursOpen: 12, visitorShare: 0.6, loadBasis: 'dining', visitMinutes: 60, ...patch })
// Without an amenity band, so only the sky room can widen the stairs.
const plain: Tower = { ...vtc, bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'residential', share: 0.3 }] }
const withRoom = (patch: Partial<SkyRoom> = {}): Tower => ({ ...plain, skyLobbies: [40], skyRoom: room(patch) })

describe('occupant load (VBBL Table 3.1.17.1)', () => {
  it('uses 9.3 m² per person on office floors and 2 persons per bedroom in homes', () => {
    const st = storeyLoads(vtc, DEFAULT_EGRESS_PRESETS, li)
    const office = st.find((s) => s.use === 'office' && !s.podium)!
    expect(office.load).toBeCloseTo(office.net / LOAD_FACTOR.office, 6)
    const home = st.find((s) => s.use === 'residential')!
    expect(home.load).toBeCloseTo((home.net / li.homeM2) * DEFAULT_EGRESS_PRESETS.bedroomsPerHome * 2, 6)
  })
})

describe('exit stairs (VBBL 3.4.3.2)', () => {
  it('keeps the 1100 mm minimum on office, hotel and home floors', () => {
    const e = egressCheck(plain, DEFAULT_EGRESS_PRESETS, li)
    expect(e.widthMm).toBe(STAIR_MIN_MM)
    expect(e.rules.find((r) => r.id === 'stair-driver-t1')).toBeUndefined()
  })
  it('flags an amenity floor that needs wider stairs, at the 4.6 m² per person team mapping', () => {
    const e = egressCheck(vtc, DEFAULT_EGRESS_PRESETS, li)
    expect(e.governing!.use).toBe('amenity')
    expect(e.widthMm).toBeCloseTo((e.governing!.net / 4.6) * 8 / 2, 6)
    expect(e.rules.find((r) => r.id === 'stair-driver-t1')!.state).toBe('warn')
  })
  it('lets a standing public room widen the stairs from its level down, not above (width does not accumulate)', () => {
    const st = storeyLoads(withRoom({ loadBasis: 'standing' }), DEFAULT_EGRESS_PRESETS, li)
    const roomStorey = st.find((s) => s.level === 40)!
    expect(roomStorey.needMm).toBeGreaterThan(STAIR_MIN_MM)
    for (const s of st) expect(s.stairMm).toBeCloseTo(s.level <= 40 ? roomStorey.needMm : STAIR_MIN_MM, 6)
    expect(egressCheck(withRoom({ loadBasis: 'standing' }), DEFAULT_EGRESS_PRESETS, li).rules.find((r) => r.id === 'stair-driver-t1')!.state).toBe('warn')
  })
  it('draws a switchback stair: 24 risers of 175 mm, 12 per flight, 11 treads', () => {
    const enc = stairEnclosure(1100, 4.2, DEFAULT_EGRESS_PRESETS)
    expect(enc.a).toBeCloseTo(2.3, 6)
    expect(enc.b).toBeCloseTo(11 * 0.28 + 2.2, 6)
    expect(enc.flightRise).toBeCloseTo(2.1, 6)
  })
  it('feeds the stair area into the core profile', () => {
    const r = liftCheck(plain)
    expect(r.breakdownMax.stairs).toBeCloseTo(2 * stairEnclosure(1100, 4.2, DEFAULT_EGRESS_PRESETS).area, 6)
    // A standing sky room widens the stairs, so the core needs more below it.
    expect(liftCheck(withRoom({ loadBasis: 'standing' })).requiredMax).toBeGreaterThan(liftCheck(withRoom()).requiredMax)
  })
})

describe('exit separation and travel (VBBL 3.4.2.3, 3.4.2.5)', () => {
  it('needs half the plate diagonal on open-plan floors but only 9 m with public corridors', () => {
    const e = egressCheck(vtc, DEFAULT_EGRESS_PRESETS, li)
    expect(e.separationNeeded).toBeCloseTo(Math.hypot(46, 46) / 2, 6)
    const homes = egressCheck({ ...vtc, bands: [{ use: 'residential', share: 1 }] }, DEFAULT_EGRESS_PRESETS, li)
    expect(homes.separationNeeded).toBe(9)
    expect(homes.rules.find((r) => r.id === 'separation-t1')!.state).toBe('pass')
  })
  it('reaches a 46 m plate within 45 m but not a 100 × 64 m podium', () => {
    const e = egressCheck(vtc, DEFAULT_EGRESS_PRESETS, li)
    expect(e.travel).toBeLessThanOrEqual(45)
    expect(e.rules.find((r) => r.id === 'travel-podium-t1')!.state).toBe('fail')
  })
})

describe('public sky room', () => {
  it('puts visitors on the tenant shuttle when shared, or on public lifts of their own', () => {
    const shared = planRises(withRoom(), DEFAULT_LIFT_PRESETS)
    expect(shared.find((g) => g.kind === 'shuttle')!.visitors5).toBeGreaterThan(0)
    expect(shared.some((g) => g.cls === 'public')).toBe(false)
    const own = planRises(withRoom({ access: 'dedicated' }), DEFAULT_LIFT_PRESETS)
    const pub = own.find((g) => g.cls === 'public')!
    expect(pub.floors[0].level).toBe(40)
    expect(own.find((g) => g.kind === 'shuttle' && g.cls !== 'public')!.visitors5).toBeUndefined()
  })
  it('sizes the visitor lifts and flags shared lobbies', () => {
    for (const access of ['shared', 'dedicated'] as const) {
      const t = withRoom({ access })
      const r = skyRoomCheck(t, liftCheck(t), egressCheck(t, DEFAULT_EGRESS_PRESETS, li))
      expect(r.room?.level).toBe(40)
      expect(r.group?.state).toBe('pass')
      expect(r.rules.find((x) => x.id === 'skyroom-security-t1')!.state).toBe(access === 'dedicated' ? 'pass' : 'warn')
    }
  })
  it('reports no room until a sky lobby is made public', () => {
    const r = skyRoomCheck(vtc, liftCheck(vtc), egressCheck(vtc, DEFAULT_EGRESS_PRESETS, li))
    expect(r.room).toBeNull()
    expect(r.rules[0].state).toBe('warn')
  })
})

describe('posted occupant limit', () => {
  it('finds the visitor limit that keeps the stairs at 1100 mm, and uses it', () => {
    const t = withRoom({ loadBasis: 'standing' })
    const { limit, widthMm } = postedLimitForRoom(t, DEFAULT_EGRESS_PRESETS, li)!
    expect(widthMm).toBe(STAIR_MIN_MM)
    expect(limit).toBeGreaterThan(0)
    const posted = { ...t, skyRoom: { ...t.skyRoom!, postedLimit: limit } }
    const roomStorey = storeyLoads(posted, DEFAULT_EGRESS_PRESETS, li).find((s) => s.level === 40)!
    expect(roomStorey.needMm).toBeLessThanOrEqual(STAIR_MIN_MM + 1e-6)
    expect(egressCheck(posted, DEFAULT_EGRESS_PRESETS, li).widthMm).toBe(STAIR_MIN_MM)
    // One more visitor tips it over.
    const over = { ...t, skyRoom: { ...t.skyRoom!, postedLimit: limit + 2 } }
    expect(storeyLoads(over, DEFAULT_EGRESS_PRESETS, li).find((s) => s.level === 40)!.needMm).toBeGreaterThan(STAIR_MIN_MM)
  })
  it('caps visitors and lifts at the posted limit and flags it for acceptance', () => {
    const t = { ...withRoom(), skyRoom: room({ postedLimit: 150 }) }
    const r = skyRoomCheck(t, liftCheck(t), egressCheck(t, DEFAULT_EGRESS_PRESETS, li))
    expect(r.capacity).toBe(150)
    expect(r.tableLoad).toBeGreaterThan(150)
    const rule = r.rules.find((x) => x.id === 'skyroom-posted-t1')!
    expect(rule.state).toBe('warn')
    expect(rule.flag).toBe('unverified')
    const free = skyRoomCheck(withRoom(), liftCheck(withRoom()), egressCheck(withRoom(), DEFAULT_EGRESS_PRESETS, li))
    expect(r.peak5).toBeLessThan(free.peak5)
  })
})

describe('stair placement', () => {
  const enc = stairEnclosure(1100, 4.2, DEFAULT_EGRESS_PRESETS)
  it('puts stairs in the core, one at the edge, or both at plate corners', () => {
    expect(stairSpots({ ...plain, stairPlacement: 'core' }, 2, enc.a, enc.b).every((s) => s.inCore)).toBe(true)
    expect(stairSpots({ ...plain, stairPlacement: 'mixed' }, 2, enc.a, enc.b).map((s) => s.inCore)).toEqual([true, false])
    const edge = stairSpots({ ...plain, stairPlacement: 'perimeter' }, 2, enc.a, enc.b)
    expect(edge.every((s) => !s.inCore)).toBe(true)
    expect(Math.abs(edge[0].x)).toBeCloseTo(46 / 2 - enc.a / 2, 6)
  })
  it('passes exit separation at the plate corners where the core fails', () => {
    const core = egressCheck({ ...plain, stairPlacement: 'core' }, DEFAULT_EGRESS_PRESETS, li)
    const edge = egressCheck({ ...plain, stairPlacement: 'perimeter' }, DEFAULT_EGRESS_PRESETS, li)
    expect(core.rules.find((r) => r.id === 'separation-t1')!.state).toBe('fail')
    expect(edge.rules.find((r) => r.id === 'separation-t1')!.state).toBe('pass')
    expect(edge.travel).toBeLessThanOrEqual(45)
  })
  it('takes edge stairs out of the core but still off net-to-gross', () => {
    const inCore = liftCheck({ ...plain, stairPlacement: 'core' })
    const atEdge = liftCheck({ ...plain, stairPlacement: 'perimeter' })
    expect(atEdge.breakdownMax.stairs).toBe(0)
    expect(atEdge.edgeStairs).toBeCloseTo(2 * enc.area, 6)
    expect(atEdge.requiredMax).toBeLessThan(inCore.requiredMax)
    const mixed = liftCheck({ ...plain, stairPlacement: 'mixed' })
    expect(mixed.breakdownMax.stairs).toBeCloseTo(enc.area, 6)
    expect(mixed.edgeStairs).toBeCloseTo(enc.area, 6)
  })
})

describe('posted limit with other busy floors and an auto core', () => {
  it('aims at the width the other floors need, and settles as the core resizes', () => {
    const t: Tower = { ...vtc, coreAuto: true, skyLobbies: [40], skyRoom: room() }
    const s = stablePostedLimit(t, DEFAULT_LIFT_PRESETS, DEFAULT_EGRESS_PRESETS)!
    // The amenity floor already needs more than 1100 mm, so the room may hold more than the 1100 mm limit would allow.
    expect(s.widthMm).toBeGreaterThan(STAIR_MIN_MM)
    const posted: Tower = { ...t, skyRoom: room({ postedLimit: s.limit }) }
    const again = stablePostedLimit(posted, DEFAULT_LIFT_PRESETS, DEFAULT_EGRESS_PRESETS)!
    expect(Math.abs(again.limit - s.limit)).toBeLessThanOrEqual(2)
  })
})
