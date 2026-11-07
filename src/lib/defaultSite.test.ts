// One click from the competition site to Real Vancouver (6 Nov): the default site and the design on it.
import { beforeEach, describe, expect, it } from 'vitest'
import { ringMetrics, validateRing } from '../engine/site'
import { defaultTower, useStore } from '../store'
import { competitionToCity, DEFAULT_CITY_SITE, longSideDeg, openInRealVancouver } from './defaultSite'
import { inRing } from './towerPosition'

type Pt = [number, number]

describe('one click to Real Vancouver', () => {
  beforeEach(() => useStore.setState(useStore.getInitialState(), true))

  it('the default site is the researched block: about 11,225 m², long side on the 45° street grid', () => {
    const ring = DEFAULT_CITY_SITE.ring as Pt[]
    expect(validateRing(ring)).toBeFalsy() // no problem found
    expect(ringMetrics(ring).area).toBeCloseTo(11225, -1)
    expect(longSideDeg(ring)).toBeCloseTo(45.2, 0)
    expect(DEFAULT_CITY_SITE.label).toMatch(/Granville \/ W Pender \/ Howe \/ Dunsmuir/)
  })

  it('the competition design is turned to the street grid and centred on the site', () => {
    const ring = DEFAULT_CITY_SITE.ring as Pt[]
    const a = { ...defaultTower('vtc'), id: 'a', x: 0, y: 0, rotation: 0 }
    const b = { ...defaultTower('vtc'), id: 'b', x: 40, y: 0, rotation: 10 }
    const [ca, cb] = competitionToCity([a, b], ring)
    const c = ringMetrics(ring).centre
    expect([ca.x, ca.y]).toEqual([expect.closeTo(c[0], 2), expect.closeTo(c[1], 2)])
    expect(Math.hypot(cb.x - ca.x, cb.y - ca.y)).toBeCloseTo(40, 3) // distances kept
    expect(cb.rotation - ca.rotation).toBeCloseTo(10, 6)
    expect(ca.rotation).toBeCloseTo(longSideDeg(ring), 6)
    expect(inRing([cb.x, cb.y], ring)).toBe(true)
  })

  it('switching sets the default site and brings the design, once; a site or towers already there are kept', () => {
    useStore.getState().addTower() // the competition's starting tower
    expect(useStore.getState().towers.city.map((t) => t.id)).toEqual(useStore.getInitialState().towers.city.map((t) => t.id)) // only the untouched study tower
    const n = useStore.getState().towers.vtc.length
    expect(openInRealVancouver()).toEqual({ site: true, towers: n })
    const s = useStore.getState()
    expect(s.project).toBe('city')
    expect(s.citySite?.label).toBe(DEFAULT_CITY_SITE.label)
    expect(inRing([s.towers.city[0].x, s.towers.city[0].y], s.citySite!.ring as Pt[])).toBe(true)
    expect(s.towers.city.map((t) => t.id)).toEqual(s.towers.vtc.map((t) => t.id)) // the design replaced the study tower
    useStore.getState().setProject('vtc')
    expect(openInRealVancouver()).toEqual({ site: false, towers: 0 })
    expect(useStore.getState().towers.city).toHaveLength(n)
  })
})
