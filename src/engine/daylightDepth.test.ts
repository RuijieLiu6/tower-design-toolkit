import { describe, expect, it } from 'vitest'
import { demoDesign } from '../lib/demo'
import { areaWithin, bandAt, bandShares, daylightScreen, DAYLIGHT_RULE, fullDepth, limitingDepth, occupied, overcastDepth, screenUse, sourcedDepths, verdict, type Plate } from './daylightDepth'
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

describe('sourced daylight depths (P1 #7)', () => {
  it('reads full depth 2.5 × (head − 0.76), overcast 1.5 × clear height and the 6 m zone', () => {
    expect(fullDepth(2.8)).toBeCloseTo(5.1) // book notes, B: a 2.8 m head reaches about 5.1 m
    expect(fullDepth(3.2)).toBeCloseTo(6.1) // and a 3.2 m head about 6.1 m
    expect(overcastDepth(2.8)).toBeCloseTo(4.2)
    expect(DAYLIGHT_RULE.primary).toBe(6)
    const s = sourcedDepths(2.8)
    expect(s.d1).toBeCloseTo(4.2)
    expect(s.d2).toBe(6)
    expect(sourcedDepths(3.4).d2).toBeCloseTo(6.6) // the sidelight rule passes 6 m once the head is over 3.16 m
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
      expect(u.d1).toBeCloseTo(Math.min(6, 1.5 * u.head, 2.5 * (u.head - 0.76)))
      expect(u.d2).toBeCloseTo(Math.max(6, 1.5 * u.head, 2.5 * (u.head - 0.76)))
      expect(u.deepest).toBeCloseTo(Math.max(u.depthLong, u.depthShort))
      expect(u.primary).toBeCloseTo(areaWithin(u.plate, 6) / occupied(u.plate))
      expect(u.shares.daylit + u.shares.marginal + u.shares.deep).toBeCloseTo(1)
      expect(u.depthLong).toBeCloseTo((t.depth - u.plate.hole) / 2)
      expect(verdict(u)).toContain('within daylight reach')
    }
  })

  it('cites every rule and reads one sourced daylight rule per use (P1 #7)', () => {
    const r = daylightScreen(t, floors)
    for (const x of r.rules) { expect(x.source.label.length).toBeGreaterThan(10); expect(x.flag).toBeTruthy() }
    for (const u of r.uses) {
      const own = r.rules.find((x) => x.id === `dl-${u.use}-rule`)!
      expect(own).toMatchObject({ state: 'pass', flag: 'verified', value: `${Math.round(u.primary * 100)}% of the usable area` })
      expect(own.source.page).toBe('pp.199, 229–230')
      expect(own.note).toContain('p.204')
      expect(own.note).toContain('p.151')
      const deep = r.rules.find((x) => x.id === `dl-${u.use}-depth`)!
      expect(deep).toMatchObject({ flag: 'verified', state: u.deepest <= 6 ? 'pass' : 'warn' })
      expect(deep.value.startsWith(`${u.deepest.toFixed(1)} m`)).toBe(true)
      expect(deep.threshold).toContain('6 m')
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
    const deep = { ...t, width: 80, depth: 80, coreShare: 0.1 }
    const slim = { ...t, width: 40, depth: 14, coreShare: 0.05 }
    const office = (x: typeof t) => screenUse(x, 'office', towerFloors(x).map((f) => ({ ...f, use: 'office' as const })))!
    expect(office(deep).state).toBe('fail')
    expect(office(slim).state).toBe('pass')
  })

  it('reads the 50 m plate with a 24 m core as 13 m deep and about 55% within 6 m (book notes, A and B)', () => {
    const ab = { ...t, width: 50, depth: 50, coreShare: (24 * 24) / (50 * 50), coreSteps: undefined }
    const u = screenUse(ab, 'office', towerFloors(ab).map((f) => ({ ...f, use: 'office' as const })))!
    expect(u.deepest).toBeCloseTo(13, 0)
    expect(u.primary).toBeGreaterThan(0.5)
    expect(u.primary).toBeLessThan(0.6)
    const r = daylightScreen(ab, towerFloors(ab).map((f) => ({ ...f, use: 'office' as const })))
    expect(r.rules.find((x) => x.id === 'dl-office-depth')!.state).toBe('warn')
  })

  it('counts a declared garden or loggia deck at a screened floor as an inner facade', () => {
    const fl = floors.map((f) => ({ ...f, use: 'residential' as const }))
    const lvl = fl.filter((f) => !f.podium && !f.skyLobby)[3].level
    const u = screenUse({ ...t, deckUses: [{ level: lvl, use: 'planted' }, { level: lvl + 1, use: 'none' }] }, 'residential', fl)!
    expect(u.innerEdges).toEqual([lvl])
    const r = daylightScreen({ ...t, deckUses: [{ level: lvl, use: 'occupied' }] }, fl)
    expect(r.rules.find((x) => x.id === 'dl-residential-rule')!.note).toContain(`L${lvl}`)
    expect(screenUse({ ...t, deckUses: [{ level: lvl, use: 'none' }] }, 'residential', fl)!.innerEdges).toEqual([])
  })

  it('adds an over-lit UDI line at 1,500 lux, not computed by the depth screen', () => {
    const r = daylightScreen(t, floors)
    expect(r.rules.find((x) => x.id === 'dl-udi')).toMatchObject({ state: 'unknown', flag: 'verified', source: { page: 'p.198' } })
  })

  it('says so when there is nothing to screen', () => {
    const r = daylightScreen(t, floors.map((f) => ({ ...f, use: 'retail' as const })))
    expect(r.uses).toEqual([])
    expect(r.rules[0]).toMatchObject({ id: 'dl-none', flag: 'unresolved' })
  })
})
