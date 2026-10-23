import { describe, expect, it } from 'vitest'
import { DEFAULT_LIFT_PRESETS, autoCoreShare, flightTime, liftCheck, planRises, stopsAndReversal, suggestSkyLobby, upPeakRtt } from './lifts'
import { towerFloors } from './massing'
import type { Tower } from './types'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.25, plantEvery: 0,
}
const officeOnly: Tower = { ...vtc, podiumHeight: 0, height: 60, f2f: 4, bands: [{ use: 'office', share: 1 }] }

/** Small seeded generator so the Monte Carlo check is repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('up-peak stops and reversal floor', () => {
  it('matches exact cases', () => {
    expect(stopsAndReversal(1, 10)).toEqual({ S: 1, H: 1 })
    const two = stopsAndReversal(2, 1)
    expect(two.S).toBeCloseTo(1, 10)
    expect(two.H).toBeCloseTo(1.5, 10)
  })
  it('matches a seeded simulation of random destinations (n = 12, P = 10)', () => {
    const rnd = mulberry32(540)
    const trips = 40000
    let stops = 0, highest = 0
    for (let k = 0; k < trips; k++) {
      const seen = new Set<number>()
      let top = 0
      for (let p = 0; p < 10; p++) { const f = 1 + Math.floor(rnd() * 12); seen.add(f); top = Math.max(top, f) }
      stops += seen.size; highest += top
    }
    const { S, H } = stopsAndReversal(12, 10)
    expect(Math.abs(stops / trips - S) / S).toBeLessThan(0.01)
    expect(Math.abs(highest / trips - H) / H).toBeLessThan(0.01)
  })
})

describe('round trip time', () => {
  it('reduces to the classic formula with instant acceleration and no express run', () => {
    const n = 12, P = 16.8, d = 4, v = 2.5, door = 5, tp = 1.2
    const { S, H } = stopsAndReversal(n, P)
    const { rtt } = upPeakRtt({ n, P, dExpress: d, dFloor: d, v, a: 1e9, doorTime: door, transferTime: tp })
    expect(rtt).toBeCloseTo(2 * H * (d / v) + (S + 1) * door + 2 * P * tp, 3)
  })
  it('uses a triangular profile when the car cannot reach rated speed in one floor', () => {
    expect(flightTime(4, 6, 1)).toBeCloseTo(2 * Math.sqrt(4), 10)
    expect(flightTime(100, 5, 1)).toBeCloseTo(100 / 5 + 5, 10)
  })
  it('lengthens with an express run below the rise', () => {
    const base = { n: 12, P: 16.8, dFloor: 4, v: 6, a: 1, doorTime: 5, transferTime: 1.2 }
    expect(upPeakRtt({ ...base, dExpress: 150 }).rtt).toBeGreaterThan(upPeakRtt({ ...base, dExpress: 4 }).rtt)
  })
})

describe('lift sizing and core', () => {
  it('needs more cars for a denser office', () => {
    const sparse = liftCheck(officeOnly, { ...DEFAULT_LIFT_PRESETS, officeM2PerPerson: 14 })
    const dense = liftCheck(officeOnly, { ...DEFAULT_LIFT_PRESETS, officeM2PerPerson: 7 })
    expect(dense.totalCars).toBeGreaterThan(sparse.totalCars)
  })
  it('splits the default tower into rises of at most 15 floors, by use', () => {
    const rises = planRises(vtc, DEFAULT_LIFT_PRESETS)
    expect(rises.length).toBeGreaterThan(2)
    for (const r of rises) expect(r.floors.length).toBeLessThanOrEqual(15)
    const served = rises.reduce((s, r) => s + r.floors.length, 0)
    expect(served).toBe(Math.floor((285 - 18) / 4.2))
  })
  it('does not serve plant floors, the podium or a tower floor at grade', () => {
    const withPlant = planRises({ ...vtc, plantEvery: 10 }, DEFAULT_LIFT_PRESETS).flatMap((r) => r.floors)
    expect(withPlant.every((f) => f.use !== 'mechanical' && !f.podium && f.z0 > 0)).toBe(true)
    expect(planRises(officeOnly, DEFAULT_LIFT_PRESETS).flatMap((r) => r.floors)[0].z0).toBeCloseTo(4, 6)
  })
  it('sizes every rise of the default tower inside its band, and counts the whole core', () => {
    const r = liftCheck(vtc)
    for (const rise of r.rises) expect(rise.state).toBe('pass')
    const b = r.breakdownMax
    const rooms = b.passenger + b.lobby + b.service + b.stairs + b.services
    expect(r.requiredMax).toBeCloseTo(rooms * (1 + DEFAULT_LIFT_PRESETS.wallAllowance), 6)
    expect(b.walls).toBeCloseTo(rooms * DEFAULT_LIFT_PRESETS.wallAllowance, 6)
    expect(b.stairs).toBeGreaterThan(0)
    // The worst level is a served tower floor, so its lift lobby counts.
    expect(b.lobby).toBeGreaterThan(0)
    expect(r.maxLevel).toBe(r.rises[0].floors[0].level)
    // With every rise starting at grade, all passenger shafts pass the worst level.
    expect(r.breakdownMax.passenger).toBe(r.totalCars * DEFAULT_LIFT_PRESETS.shaftM2)
    expect(r.requiredTop).toBeLessThan(r.requiredMax)
  })
  it('flags a core that is too small for its lifts', () => {
    const small = liftCheck({ ...vtc, coreShare: 0.08 })
    expect(small.rules.find((x) => x.id === 'core-fit-t1')!.state).toBe('fail')
  })
})

describe('sky lobbies', () => {
  const level = 36
  const sky = { ...vtc, skyLobbies: [level] }
  it('turns the sky lobby floor into public amenity, not served by local rises', () => {
    const f = towerFloors(sky).find((x) => x.level === level)!
    expect(f.use).toBe('amenity')
    expect(f.skyLobby).toBe(true)
    const locals = planRises(sky, DEFAULT_LIFT_PRESETS).filter((g) => g.kind === 'local')
    expect(locals.flatMap((g) => g.floors).some((x) => x.level === level)).toBe(false)
  })
  it('adds a shuttle from grade and starts the upper rises at the sky lobby', () => {
    const groups = planRises(sky, DEFAULT_LIFT_PRESETS)
    const shuttle = groups.find((g) => g.kind === 'shuttle')!
    expect(shuttle.floors.map((x) => x.level)).toEqual([level])
    expect(shuttle.base).toBeNull()
    for (const g of groups.filter((x) => x.kind === 'local')) {
      const above = g.floors[0].level > level
      expect(g.base?.level ?? null).toBe(above ? level : null)
      expect(g.floors.every((x) => (x.level > level) === above)).toBe(true)
    }
    const riders = shuttle.riders.map((x) => x.level)
    expect(Math.min(...riders)).toBeGreaterThan(level)
  })
  it('puts fewer shafts at grade and compares with direct service', () => {
    const r = liftCheck(sky)
    expect(r.direct).toBeDefined()
    expect(r.shaftsAtGrade).toBeLessThan(r.direct!.shaftsAtGrade)
    for (const rise of r.rises) expect(rise.state).toBe('pass')
  })
  it('suggests a level inside the tower, away from its ends', () => {
    const lv = suggestSkyLobby(vtc)!
    const tower = towerFloors(vtc).filter((f) => !f.podium)
    expect(lv).toBeGreaterThan(tower[4].level)
    expect(lv).toBeLessThan(tower[tower.length - 5].level)
  })
})

describe('core sized to the lifts', () => {
  it('finds a core share that just holds the lifts', () => {
    for (const t of [vtc, { ...vtc, skyLobbies: [36] }, officeOnly]) {
      const share = autoCoreShare(t)
      const r = liftCheck({ ...t, coreShare: share })
      expect(share * t.width * t.depth).toBeGreaterThanOrEqual(r.requiredMax - 1e-6)
      // Within one rounding step and one car of the need.
      expect(share * t.width * t.depth - r.requiredMax).toBeLessThan(0.005 * t.width * t.depth + 2 * (DEFAULT_LIFT_PRESETS.shaftM2 + DEFAULT_LIFT_PRESETS.lobbyM2PerCar))
    }
  })
})

describe('firefighter lift', () => {
  it('reaches the top of a 285 m tower within a minute at 6 m/s, not at 4 m/s', () => {
    expect(liftCheck(vtc).rules.find((x) => x.id === 'firefighter-t1')!.state).toBe('pass')
    expect(liftCheck(vtc, { ...DEFAULT_LIFT_PRESETS, firefighterSpeed: 4 }).rules.find((x) => x.id === 'firefighter-t1')!.state).toBe('fail')
  })
})
