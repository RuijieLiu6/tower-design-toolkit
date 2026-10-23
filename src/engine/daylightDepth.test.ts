import { describe, expect, it } from 'vitest'
import { demoDesign } from '../lib/demo'
import { areaWithin, bandAt, bandShares, daylightScreen, DAYLIGHT, limitingDepth, occupied, screenUse, verdict, type Plate } from './daylightDepth'
import { towerFloors } from './massing'

// A 40 × 30 m plate with a 10 m central core: 1,100 m² occupied.
const P: Plate = { W: 40, D: 30, hole: 10 }

describe('depth maths', () => {
  it('measures the occupied area within a distance of the glass', () => {
    expect(occupied(P)).toBe(1100)
    expect(areaWithin(P, 0)).toBe(0)
    expect(areaWithin(P, 5)).toBe(600) // a 5 m ring: 1,200 − 30 × 20; the core lies wholly inside
    expect(areaWithin(P, 12)).toBe(1064) // beyond 12 m: the 16 × 6 m middle minus the 10 × 6 m of core in it
    expect(areaWithin(P, 15)).toBe(1100) // every occupied point is within half the short side
    expect(areaWithin(P, 40)).toBe(1100)
  })

  it('grows with distance and never exceeds the occupied area', () => {
    let prev = 0
    for (let d = 0; d <= 20; d += 0.5) { const a = areaWithin(P, d); expect(a).toBeGreaterThanOrEqual(prev); expect(a).toBeLessThanOrEqual(occupied(P)); prev = a }
  })

  it('splits the floor into daylit, marginal and deep bands that add up', () => {
    const s = bandShares(P, 5, 12)
    expect(s.daylit).toBeCloseTo(600 / 1100)
    expect(s.marginal).toBeCloseTo(464 / 1100)
    expect(s.deep).toBeCloseTo(36 / 1100)
    expect(s.daylit + s.marginal + s.deep).toBeCloseTo(1)
    expect(bandShares({ W: 10, D: 10, hole: 10 }, 3, 6)).toEqual({ daylit: 0, marginal: 0, deep: 0 }) // nothing occupied
  })

  it('puts the band edges at 1 and k × head height, edges inclusive', () => {
    expect(bandAt(0, 3, 6)).toBe('daylit')
    expect(bandAt(3, 3, 6)).toBe('daylit')
    expect(bandAt(3.01, 3, 6)).toBe('marginal')
    expect(bandAt(6, 3, 6)).toBe('marginal')
    expect(bandAt(6.01, 3, 6)).toBe('deep')
  })

  it('applies the limiting room depth formula', () => {
    expect(limitingDepth(12, 40, 3, 0.5)).toEqual({ ratio: 0.3 + 4, limit: 4 })
    expect(limitingDepth(6, 30, 3, 0.5).ratio).toBeCloseTo(2.2)
    expect(limitingDepth(6, 30, 3, 0.6).limit).toBeCloseTo(5)
  })
})

describe('daylight screen of a tower', () => {
  const t = demoDesign().towers.vtc[0]
  const floors = towerFloors(t)

  it('screens each occupied use on its typical floor, with head height from floor-to-floor', () => {
    const r = daylightScreen(t, floors)
    expect(r.uses.length).toBeGreaterThan(0)
    for (const u of r.uses) {
      expect(u.head).toBeCloseTo(Math.max(2.2, u.f2f - 1.2)) // default head drop 1.2 m (team assumption)
      expect(u.d1).toBeCloseTo(u.head)
      expect(u.d2).toBeCloseTo(DAYLIGHT.k * u.head)
      expect(u.shares.daylit + u.shares.marginal + u.shares.deep).toBeCloseTo(1)
      expect(u.depthLong).toBeCloseTo((t.depth - u.plate.hole) / 2)
      expect(verdict(u)).toContain('within daylight reach')
    }
  })

  it('cites every rule and keeps the missing use-specific rule unresolved', () => {
    const r = daylightScreen(t, floors)
    for (const x of r.rules) { expect(x.source.label.length).toBeGreaterThan(10); expect(x.flag).toBeTruthy() }
    for (const u of r.uses) {
      const own = r.rules.find((x) => x.id === `dl-${u.use}-rule`)!
      expect(own).toMatchObject({ state: 'unknown', flag: 'unresolved', value: 'none in the research' })
      expect(r.rules.find((x) => x.id === `dl-${u.use}-share`)!.flag).toBe('team_assumption')
      expect(r.rules.find((x) => x.id === `dl-${u.use}-limit`)!.flag).toBe('unverified')
    }
  })

  it('sets the corridor ring aside on home floors but not on office floors', () => {
    const office = screenUse({ ...t }, 'office', floors.map((f) => ({ ...f, use: 'office' as const })))!
    const homes = screenUse({ ...t }, 'residential', floors.map((f) => ({ ...f, use: 'residential' as const })))!
    expect(homes.plate.hole).toBeCloseTo(Math.min(t.width, t.depth, office.plate.hole + 2 * 1.8))
    expect(homes.withinReach).toBeGreaterThanOrEqual(office.withinReach) // less deep floor once the corridor is set aside
  })

  it('grades a deep plate as poor and a slim one as good', () => {
    const deep = { ...t, width: 60, depth: 60, coreShare: 0.1 }
    const slim = { ...t, width: 40, depth: 14, coreShare: 0.05 }
    const office = (x: typeof t) => screenUse(x, 'office', towerFloors(x).map((f) => ({ ...f, use: 'office' as const })))!
    expect(office(deep).state).toBe('fail')
    expect(office(slim).state).toBe('pass')
  })

  it('says so when there is nothing to screen', () => {
    const r = daylightScreen(t, floors.map((f) => ({ ...f, use: 'retail' as const })))
    expect(r.uses).toEqual([])
    expect(r.rules[0]).toMatchObject({ id: 'dl-none', flag: 'unresolved' })
  })
})
