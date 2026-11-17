// One click from the competition site to Real Vancouver (6 Nov): the default site and the design on it.
import { beforeEach, describe, expect, it } from 'vitest'
import { ringMetrics, validateRing } from '../engine/site'
import { defaultTower, useStore } from '../store'
import { competitionToCity, DEFAULT_CITY_SITE, longSideDeg, openInRealVancouver } from './defaultSite'
import { inRing } from './towerPosition'
import { towerFromDrawn } from './draw/mass'

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

  it('a drawn mass comes along with its outline, holes and core turned and centred like the towers', () => {
    const ring = DEFAULT_CITY_SITE.ring as Pt[]
    const box = { ...defaultTower('vtc'), id: 'p', x: 30, y: 0, rotation: 0 }
    const d = { pts: [[-10, -10], [10, -10], [10, 10], [-10, 10]] as Pt[], base: 0, floors: 6, f2f: 3.6, holes: [[[-2, -2], [2, -2], [2, 2], [-2, 2]] as Pt[]], core: { x: 4, y: 4, w: 4, d: 4 } }
    const mass = towerFromDrawn({ ...defaultTower('vtc'), id: 'm', name: 'Mass 1' }, d)
    const [cb, cm] = competitionToCity([box, mass], ring)
    const turn = longSideDeg(ring), r = (turn * Math.PI) / 180
    // the outline's centroid is where the mass now stands, and the mass is as far from the box as before
    expect(Math.hypot(cb.x - cm.x, cb.y - cm.y)).toBeCloseTo(30, 2)
    expect(cm.drawn).toBeTruthy()
    const c = cm.drawn!.pts.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4], [0, 0] as Pt)
    expect([cm.x, cm.y]).toEqual([expect.closeTo(c[0], 1), expect.closeTo(c[1], 1)])
    // a corner went round by the grid's turn: the first corner is (-10, -10) turned, from the new centre
    const [px, py] = cm.drawn!.pts[0]
    expect([px - c[0], py - c[1]]).toEqual([expect.closeTo(-10 * Math.cos(r) + 10 * Math.sin(r), 1), expect.closeTo(-10 * Math.sin(r) - 10 * Math.cos(r), 1)])
    // the hole and the core moved with it, the core keeping its size
    const h = cm.drawn!.holes![0].reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4], [0, 0] as Pt)
    expect([h[0], h[1]]).toEqual([expect.closeTo(c[0], 1), expect.closeTo(c[1], 1)])
    expect(cm.drawn!.core).toMatchObject({ w: 4, d: 4 })
    expect(Math.hypot(cm.drawn!.core!.x + 2 - c[0], cm.drawn!.core!.y + 2 - c[1])).toBeCloseTo(Math.hypot(6, 6), 1)
    // the storeys were sliced again from the moved outline: the same count and floor area as before
    expect(cm.imported?.storeys.length).toBe(mass.imported?.storeys.length)
    expect(cm.rotation).toBe(0)
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
