import { describe, expect, it } from 'vitest'
import { CORNER_SIGN, DEFAULT_EGRESS_PRESETS, LOAD_FACTOR, STAIR_MIN_MM, cornerToward, egressCheck, podiumExitSpots, postedLimitForRoom, stairEnclosure, stairSpots, storeyLoads, straightStairs } from './egress'
import { DEFAULT_LIFT_PRESETS, liftCheck, planRises } from './lifts'
import { skyRoomCheck, stablePostedLimit } from './skyRoom'
import { importedTower, rect, ringArea, stack, type P } from './testStoreys'
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

describe('the edge stair corner (G11)', () => {
  const enc = stairEnclosure(1100, 4.2, DEFAULT_EGRESS_PRESETS)
  const mixed = (patch: Partial<Tower> = {}) => stairSpots({ ...plain, stairPlacement: 'mixed', ...patch }, 2, enc.a, enc.b)
  it('without a corner the edge stair stays at the (−x, −y) corner, as before', () => {
    expect(mixed({ stairCorner: 'sw' })).toEqual(mixed())
    expect(mixed()[1]).toMatchObject({ inCore: false })
    expect(mixed()[1].x).toBeLessThan(0)
    expect(mixed()[1].y).toBeLessThan(0)
  })
  it('puts the edge stair at the chosen corner and the core stair at the opposite core corner', () => {
    for (const k of ['ne', 'nw', 'se', 'sw'] as const) {
      const [i, j] = CORNER_SIGN[k], s = mixed({ stairCorner: k })
      expect(s[1].inCore).toBe(false)
      expect([Math.sign(s[1].x), Math.sign(s[1].y)]).toEqual([i, j])
      expect(Math.abs(s[1].x)).toBeCloseTo(46 / 2 - enc.a / 2, 6)
      expect(s[0].inCore).toBe(true)
      expect([Math.sign(s[0].x), Math.sign(s[0].y)]).toEqual([-i, -j])
    }
    // On the square plate every corner gives the same separation and travel.
    const sw = egressCheck({ ...plain, stairPlacement: 'mixed' }, DEFAULT_EGRESS_PRESETS, li)
    const ne = egressCheck({ ...plain, stairPlacement: 'mixed', stairCorner: 'ne' }, DEFAULT_EGRESS_PRESETS, li)
    expect(ne.separation).toBeCloseTo(sw.separation, 6)
    expect(ne.travel).toBeCloseTo(sw.travel, 6)
    expect(ne.rules.find((r) => r.id === 'separation-t1')!.note).toMatch(/NE corner/)
  })
  it('picks the other diagonal for corner stairs; stairs in the core ignore it', () => {
    const per = stairSpots({ ...plain, stairPlacement: 'perimeter', stairCorner: 'nw' }, 2, enc.a, enc.b)
    expect(per.map((s) => [Math.sign(s.x), Math.sign(s.y)])).toEqual([[1, -1], [-1, 1]])
    expect(stairSpots({ ...plain, stairPlacement: 'core', stairCorner: 'nw' }, 2, enc.a, enc.b)).toEqual(stairSpots({ ...plain, stairPlacement: 'core' }, 2, enc.a, enc.b))
  })
  it('finds the corner facing a true compass bearing', () => {
    const sqPlate = { width: 40, depth: 40, rotation: 0 }
    expect(cornerToward(sqPlate, 45, 0)).toBe('ne')
    expect(cornerToward(sqPlate, 225, 0)).toBe('sw')
    // True north 45° clockwise from the frame's +y (as the competition frame): true north is the frame's NE corner.
    expect(cornerToward(sqPlate, 0, 45)).toBe('ne')
    expect(cornerToward(sqPlate, 90, 45)).toBe('se')
    // A tower turned 90° counter-clockwise: its own +x points along the frame's +y.
    expect(cornerToward({ ...sqPlate, rotation: 90 }, 315, 0)).toBe('ne')
  })
})

describe('podium exits (G11)', () => {
  const run = (t: Tower) => egressCheck(t, DEFAULT_EGRESS_PRESETS, li)
  const podRule = (t: Tower) => run(t).rules.find((r) => r.id === 'travel-podium-t1')!
  it('none entered: podium travel to the core stairs from the corners, as before', () => {
    const before = run(vtc)
    expect(before.podiumExits).toEqual([])
    expect(before.podiumFar).toBeNull()
    for (const pe of [{}, { count: 0 }, { at: [] }]) {
      const e = run({ ...vtc, podiumExits: pe })
      expect(e.podiumTravel).toBe(before.podiumTravel)
      expect(e.rules).toEqual(before.rules)
    }
    expect(podRule(vtc).state).toBe('fail')
  })
  it('four exits round the edge of the 100 × 64 m podium bring every point within 45 m', () => {
    const t: Tower = { ...vtc, podiumExits: { count: 4 } }
    const spots = podiumExitSpots(t)
    expect(spots).toHaveLength(4)
    for (const s of spots) expect(Math.abs(Math.abs(s.x) - 50) < 1e-9 || Math.abs(Math.abs(s.y) - 32) < 1e-9).toBe(true)
    const e = run(t)
    expect(e.podiumTravel!).toBeLessThanOrEqual(45)
    expect(podRule(t).state).toBe('pass')
    expect(podRule(t).value).toMatch(/4 podium exits/)
    // The tower floors do not change.
    expect(e.travel).toBe(run(vtc).travel)
    expect(e.separation).toBe(run(vtc).separation)
  })
  it('placed exits: one at the east end leaves the west end too far, a second at the west end passes', () => {
    const one: Tower = { ...vtc, podiumExits: { at: [[50, 0]] } }
    expect(podiumExitSpots(one)).toEqual([{ x: 50, y: 0 }])
    const e1 = run(one)
    expect(podRule(one).state).toBe('fail')
    expect(e1.podiumFar![0]).toBeLessThan(0)
    const two: Tower = { ...vtc, podiumExits: { at: [[50, 0], [-50, 0]] } }
    expect(podRule(two).state).toBe('pass')
    expect(run(two).podiumTravel!).toBeLessThan(e1.podiumTravel!)
  })
  it('no podium, no podium exits', () => {
    expect(podiumExitSpots({ ...vtc, podiumHeight: 0, podiumExits: { count: 4 } })).toEqual([])
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

// G22 (vtc-entry R3-5 urban review on A20a): podium travel on the true podium storey outlines of an imported tower, not
// on a stand-in rectangle about the model origin, with the core stairs at the core and the podium exits as declared.
describe('podium travel on the true outlines (G22)', () => {
  const run = (t: Tower) => egressCheck(t, DEFAULT_EGRESS_PRESETS, li)
  const podRule = (t: Tower) => run(t).rules.find((r) => r.id === `travel-podium-${t.id}`)!
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
  // An L-shaped podium (four storeys of 4.5 m) with a 30 m tower over its north-east arm, its 12 m core at (25, 15).
  const L: P[] = [[-40, -30], [40, -30], [40, 30], [10, 30], [10, 0], [-40, 0]]
  const lTower = (o: Partial<Tower> = {}): Tower => ({ ...importedTower(stack([{ n: 4, f2f: 4.5, ring: L, podium: true }, { n: 30, f2f: 4, ring: rect(30, 30, 25, 15) }]), { podiumTop: 18, coreSide: 12 }), ...o })

  it('an L-shaped podium reports its true far corner, from the core stairs at the core', () => {
    const t = lTower()
    const e = run(t)
    expect(e.podiumOutline?.levels).toEqual([2, 3, 4]) // the ground storey exits through its street doors
    expect(e.podiumOutline?.core).toMatch(/typical tower storey/)
    const stairs = e.spots.map((s) => ({ x: s.x + 25, y: s.y + 15 }))
    expect(e.podiumOutline?.stairs).toEqual(stairs)
    expect(e.podiumFar).toEqual([-40, -30])
    expect(e.podiumTravel!).toBeCloseTo(Math.min(...stairs.map((s) => Math.hypot(-40 - s.x, -30 - s.y))), 9)
    expect(podRule(t).state).toBe('fail')
    expect(podRule(t).value).toMatch(/^\d+\.\d m from the farthest point of L2 to the nearest exit \(core stairs\)$/)
    expect(podRule(t).note).toMatch(/true outlines of the podium storeys L2–L4/)
    // The stand-in rectangle (the podium's equal-area box about the origin, stairs about the origin) read it as a pass.
    const standIn = Math.max(...corners.map(([i, j]) => Math.min(...e.spots.map((s) => Math.hypot((i * t.podiumWidth) / 2 - s.x, (j * t.podiumDepth) / 2 - s.y)))))
    expect(standIn).toBeLessThan(45)
    expect(e.podiumTravel!).toBeGreaterThan(70)
    // A core placed by hand moves the stairs with it.
    const moved = run(lTower({ coreCentre: [0, -15] }))
    expect(moved.podiumOutline?.stairs).toEqual(e.spots.map((s) => ({ x: s.x, y: s.y - 15 })))
    expect(moved.podiumTravel!).toBeLessThan(e.podiumTravel!)
    // An exit at the far corner moves the farthest point elsewhere.
    const exit = run(lTower({ podiumExits: { at: [[-40, -30]] } }))
    expect(exit.podiumTravel!).toBeLessThan(e.podiumTravel!)
    expect(exit.podiumFar).not.toEqual([-40, -30])
    // Exits by count are spread round the true outline.
    for (const s of podiumExitSpots(lTower({ podiumExits: { count: 5 } }))) {
      const onEdge = L.some((a, i) => { const b = L[(i + 1) % L.length]; return Math.abs((b[0] - a[0]) * (s.y - a[1]) - (b[1] - a[1]) * (s.x - a[0])) < 1e-6 && s.x >= Math.min(a[0], b[0]) - 1e-9 && s.x <= Math.max(a[0], b[0]) + 1e-9 && s.y >= Math.min(a[1], b[1]) - 1e-9 && s.y <= Math.max(a[1], b[1]) + 1e-9 })
      expect(onEdge).toBe(true)
    }
  })

  it('a split podium (a forum cut) does not count the open gap as floor', () => {
    // A west pavilion and the main podium, a 20 m forum between them, an exit in the pavilion; the tower over the east part.
    const west = rect(30, 40, -35, 0), east = rect(40, 40, 20, 0)
    const build = (loops: P[][]): Tower => {
      const st = stack([{ n: 4, f2f: 4.5, ring: east, podium: true }, { n: 30, f2f: 4, ring: rect(30, 30, 20, 0) }])
        .map((s) => (s.podium ? { ...s, loops, area: loops.reduce((a, r) => a + ringArea(r), 0) } : s))
      return { ...importedTower(st, { podiumTop: 18, coreSide: 12 }), podiumExits: { at: [[-35, 0]] } }
    }
    const split = run(build([west, east])), solid = run(build([rect(90, 40, -5, 0)]))
    const inGap = (p: [number, number] | null) => !!p && p[0] > -20 + 1e-6 && p[0] < -1e-6
    expect(inGap(solid.podiumFar)).toBe(true)
    expect(inGap(split.podiumFar)).toBe(false)
    expect(split.podiumTravel!).toBeLessThan(solid.podiumTravel!)
    // On the parts: the main podium's far corner, from the nearer core stair (the pavilion's corners are 25 m from its exit).
    expect(split.podiumFar).toEqual([40, -20])
    expect(split.podiumTravel!).toBeCloseTo(Math.min(...split.podiumOutline!.stairs.map((s) => Math.hypot(40 - s.x, -20 - s.y))), 9)
    expect(podRule(build([west, east])).state).toBe('pass')
  })

  it('a parametric tower keeps the podium rectangle', () => {
    expect(run(vtc).podiumOutline).toBeNull()
    expect(run({ ...vtc, podiumExits: { count: 4 } }).podiumOutline).toBeNull()
  })
})

// G31 (vtc-entry R3-12 life-safety review on B23b): the edge stair of a twisted tower sat at the plate corner, which
// turns with the plate, so its centre left the façade higher up; a stair shaft is straight.
describe('the edge stair of a twisted tower as a straight shaft (G31)', () => {
  const run = (t: Tower) => egressCheck(t, DEFAULT_EGRESS_PRESETS, li)
  const turned = (side: number, deg: number, dx = 0): P[] => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    return rect(side, side).map(([x, y]) => [dx + x * c - y * s, x * s + y * c] as P)
  }
  // 71 storeys of 4 m on a 46 m square, turned 90° bottom to top (B23b turns 1° a storey), or straight
  const twisted = (o: Partial<Tower> = {}, total = 90, side = 46, shift = 0): Tower => {
    const st = stack(Array.from({ length: 71 }, (_, i) => ({ n: 1, f2f: 4, ring: turned(side, (total * i) / 70, shift * i), use: 'office' as const })))
    return { ...importedTower(st, { coreSide: 16 }), stairPlacement: 'mixed', stairCorner: 'ne', ...o }
  }
  /** The point stands inside the turned square at least r from its edges. */
  const inside = (x: number, y: number, side: number, deg: number, r: number) => {
    const a = (-deg * Math.PI) / 180, u = x * Math.cos(a) - y * Math.sin(a), v = x * Math.sin(a) + y * Math.cos(a)
    return Math.abs(u) <= side / 2 - r + 1e-6 && Math.abs(v) <= side / 2 - r + 1e-6
  }

  it('on a 90° twisted square the edge stair stays inside every storey and the separation falls against the corner', () => {
    const t = twisted(), e = run(t)
    const s = e.straightStairs!
    expect(s.twist).toBeGreaterThan(85)
    expect(s.levels.length).toBe(70) // the storeys above grade
    expect(s.edge).toHaveLength(1)
    expect(s.edge[0].how).toBe('found')
    expect(s.edge[0].corner).toBe('ne')
    const edge = e.spots.find((p) => !p.inCore)!
    expect(edge.x).toBeGreaterThan(0)
    expect(edge.y).toBeGreaterThan(0)
    for (let i = 1; i <= 70; i++) expect(inside(edge.x, edge.y, 46, (90 * i) / 70, e.enclosure.a / 2)).toBe(true)
    // the stair at the corner of the tower's rectangle leaves the plate on most storeys
    expect(s.edge[0].outside.length).toBeGreaterThan(30)
    // separation from the core stair, against the same square straight with its stair at the corner
    const core = e.spots.find((p) => p.inCore)!
    expect(e.separation).toBeCloseTo(Math.hypot(edge.x - core.x, edge.y - core.y), 9)
    const straight = run(twisted({}, 0))
    expect(straight.straightStairs).toBeNull()
    expect(e.separation).toBeLessThan(straight.separation)
    expect(e.separation).toBeGreaterThan(0.6 * straight.separation)
    // as far from the core stair as a straight shaft goes: the inscribed circle less half the enclosure
    expect(Math.hypot(edge.x, edge.y)).toBeGreaterThan(23 - e.enclosure.a / 2 - 0.3)
    const rule = e.rules.find((r) => r.id === `stair-straight-${t.id}`)!
    expect(rule.state).toBe('pass')
    expect(rule.value).toMatch(/^NE stair at \(\d+\.\d, \d+\.\d\) m, a straight shaft inside every tower storey \(L2–L71\)$/)
    expect(rule.note).toMatch(/twists 90°.*would leave the plate at L2–L\d+/)
    // tower travel on each storey's true outline, from the stairs as placed
    const travel = e.rules.find((r) => r.id === `travel-${t.id}`)!
    expect(travel.value).toMatch(/from the farthest point of L\d+$/)
    expect(e.travel).toBeLessThan(45)
  })
  it('an untwisted imported tower and a parametric tower keep the corner', () => {
    const st = twisted({}, 0), e = run(st)
    expect(e.straightStairs).toBeNull()
    expect(e.spots).toEqual(stairSpots(st, 2, e.enclosure.a, e.enclosure.b, 'mixed'))
    expect(e.rules.find((r) => r.id === `stair-straight-${st.id}`)).toBeUndefined()
    expect(run({ ...plain, stairPlacement: 'mixed' }).straightStairs).toBeNull()
    // both stairs in the core: nothing to place
    expect(run(twisted({ stairPlacement: 'core' })).straightStairs).toBeNull()
  })
  it('an edge stair placed by hand is checked against every storey', () => {
    const ok = run(twisted({ stairAt: [12, 12] }))
    expect(ok.straightStairs!.edge[0]).toMatchObject({ how: 'placed', x: 12, y: 12, outside: [] })
    expect(ok.spots.find((p) => !p.inCore)).toMatchObject({ x: 12, y: 12 })
    expect(ok.rules.find((r) => r.id === 'stair-straight-i')!.state).toBe('pass')
    const out = run(twisted({ stairAt: [21, 21] }))
    expect(out.straightStairs!.edge[0].outside.length).toBeGreaterThan(10)
    const rule = out.rules.find((r) => r.id === 'stair-straight-i')!
    expect(rule.state).toBe('warn')
    expect(rule.value).toMatch(/^Placed at \(21\.0, 21\.0\) m: outside the plate .* at L\d+/)
    // a parametric tower takes the hand-placed stair as given
    const par = stairSpots({ ...plain, stairAt: [5, -3] }, 2, 3, 6, 'mixed')
    expect(par[1]).toEqual({ x: 5, y: -3, inCore: false })
    expect(stairSpots({ ...plain, stairAt: [5, -3] }, 2, 3, 6, 'core').every((p) => p.inCore)).toBe(true)
  })
  it('reports when no straight position fits every storey', () => {
    // a 20 m plate that twists 90° while it drifts 0.5 m a storey: its first and last storeys share no floor
    const t = twisted({}, 90, 20, 0.5), e = run(t)
    const s = straightStairs(t, stairSpots(t, 2, e.enclosure.a, e.enclosure.b, 'mixed'), e.enclosure.a, 'mixed')!
    expect(s.edge[0].how).toBe('none')
    const rule = e.rules.find((r) => r.id === `stair-straight-${t.id}`)!
    expect(rule.state).toBe('warn')
    expect(rule.value).toMatch(/^No straight position toward the NE corner lies inside every tower storey/)
    // separation keeps the corner position
    const corner = stairSpots(t, 2, e.enclosure.a, e.enclosure.b, 'mixed')
    expect(e.spots[1]).toEqual(corner[1])
    expect(e.separation).toBeCloseTo(Math.hypot(e.spots[1].x - e.spots[0].x, e.spots[1].y - e.spots[0].y), 9)
  })
})

describe('sky room floor with a core that steps in (G45)', () => {
  // A 54 m plate with a 24 m core (576 m²) that steps to 15 m (225 m²) from level 35, below the room at level 40.
  const base: Tower = { ...withRoom(), width: 54, depth: 54, coreShare: 576 / (54 * 54) }
  const stepped: Tower = { ...base, coreSteps: [{ fromLevel: 35, side: 15 }] }
  const check = (t: Tower) => skyRoomCheck(t, liftCheck(t), egressCheck(t, DEFAULT_EGRESS_PRESETS, li))
  it('deducts the core at the room level, so the public area and share read larger', () => {
    const a = check(base), b = check(stepped)
    expect(b.room!.area).toBeCloseTo(a.room!.area, 6)
    expect(a.visitorArea).toBeCloseTo((a.room!.area - 576) * 0.6, 6)
    expect(b.visitorArea).toBeCloseTo((b.room!.area - 225) * 0.6, 6)
    expect(b.visitorArea - a.visitorArea).toBeCloseTo((576 - 225) * 0.6, 6)
    expect(b.shareAbovePodium).toBeGreaterThan(a.shareAbovePodium)
    expect(b.capacity).toBeGreaterThan(a.capacity)
    const share = (r: ReturnType<typeof check>) => r.rules.find((x) => x.id === 'skyroom-share-t1')!.value
    expect(share(b)).toBe(`${b.shareAbovePodium.toFixed(1)}% of tower floor area`)
  })
  it('leaves a tower without core steps, or with a step above the room, as before', () => {
    const a = check(base)
    expect(a.visitorArea).toBeCloseTo(Math.max(0, a.room!.area - base.coreShare * base.width * base.depth) * 0.6, 6)
    const above = check({ ...base, coreSteps: [{ fromLevel: 45, side: 15 }] })
    expect(above.visitorArea).toBeCloseTo(a.visitorArea, 6)
    expect(above.shareAbovePodium).toBeCloseTo(a.shareAbovePodium, 6)
  })
})
