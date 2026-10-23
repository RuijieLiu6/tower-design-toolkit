import { describe, expect, it } from 'vitest'
import { CITY_ORIGIN, useStore } from '../store'
import { CONES } from './viewCones'
import {
  RELAX_AVIATION_FALSE_ASSUMPTIONS, aerodromeDistances, aviationChecklist, coneRoute, instrumentsFor, notificationHeight, relaxationAt, relaxationChecklist, toUtm10,
} from './relaxAviation'
import type { Tower } from './types'

const city = (patch: Partial<Tower> = {}): Tower => ({ ...useStore.getInitialState().towers.city[0], ...patch })
const find = (rs: { id: string }[], id: string) => rs.find((r) => r.id === id) as { id: string; state: string; flag: string; value: string } | undefined
/** A point inside a cone: the mean of its plan ring, nudged in until it is inside. */
function inside(id: string): [number, number] {
  const ring = CONES.find((c) => c.id === id)!.ring
  const [x, y] = ring.reduce(([a, b], p) => [a + p[0] / ring.length, b + p[1] / ring.length], [0, 0])
  return [x, y]
}

describe('relaxation masks (C01-M06)', () => {
  it('knows which route can relax each cone, and which views get none', () => {
    expect(instrumentsFor('3.2.1')).toEqual(['hbp'])
    expect(instrumentsFor('B1')).toEqual(['eds'])
    expect(instrumentsFor('A')).toEqual([])
    expect(coneRoute('E')).toBe('none')
    expect(coneRoute('K')).toBe('unlisted')
    expect(coneRoute('12.2')).toBe('unlisted') // removed from Table 1 in 2025
  })
  it('switching a route on moves its cones from binding to relaxed, nothing more', () => {
    const p = inside('B1')
    const off = relaxationAt(p, [])
    expect(off.covering).toContain('B1')
    expect(off.binding).toContain('B1')
    const on = relaxationAt(p, ['eds'])
    expect(on.relaxed).toContain('B1')
    expect(on.binding).not.toContain('B1')
    expect(relaxationAt(p, ['hbp']).binding).toContain('B1')
  })
  it('lists the routes over a tower footprint and never decides eligibility it cannot know', () => {
    const [x, y] = inside('B1')
    const lines = relaxationChecklist(city({ x: x - CITY_ORIGIN[0], y: y - CITY_ORIGIN[1] }), ['eds'], 15, null, CITY_ORIGIN)
    expect(find(lines, 'relax-eds')).toMatchObject({ state: 'unknown' })
    expect(find(lines, 'relax-limit')).toBeDefined()
    const big = relaxationChecklist(city({ x: x - CITY_ORIGIN[0], y: y - CITY_ORIGIN[1] }), ['eds'], 15, 11468, CITY_ORIGIN)
    expect(find(big, 'relax-eds')?.state).toBe('warn')
    const small = relaxationChecklist(city({ x: x - CITY_ORIGIN[0], y: y - CITY_ORIGIN[1] }), ['eds'], 15, 5000, CITY_ORIGIN)
    expect(find(small, 'relax-eds')?.state).toBe('fail')
    const far = relaxationChecklist(city({ x: 30000, y: 30000 }), [], 15, null, CITY_ORIGIN)
    expect(far.map((l) => l.id)).toEqual(['relax-none-needed'])
  })
})

describe('aviation obligations (C01-M06)', () => {
  it('projects aerodromes into the city frame (UTM 10N)', () => {
    const [e, n] = toUtm10(49, -123)
    expect(e).toBeCloseTo(500000, 3)
    expect(n).toBeGreaterThan(5427000)
    expect(n).toBeLessThan(5428000)
    const d = aerodromeDistances(CITY_ORIGIN)
    expect(d[0].id).toMatch(/CYHC|CBC7/)
    expect(d[0].d).toBeGreaterThan(300)
    expect(d[0].d).toBeLessThan(3000) // about 2 km from the CBD (research C01)
  })
  it('flags every competition-height tower downtown, with sourced triggers', () => {
    const r = aviationChecklist(city({ height: 285 }), [CITY_ORIGIN[0], CITY_ORIGIN[1]])
    expect(find(r, 'car-150')).toMatchObject({ state: 'warn', flag: 'verified' })
    expect(find(r, 'car-90-6km')?.state).toBe('warn')
    expect(find(r, 'car-notice')?.state).toBe('warn')
    expect(find(r, 'ac-601-007')?.state).toBe('warn')
    expect(find(r, 'car-vfr')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(find(r, 'nav-canada')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(find(r, 'yvr-zoning')).toMatchObject({ state: 'pass', flag: 'verified' })
    for (const x of r) expect((x as unknown as { source: { label: string } }).source.label.length).toBeGreaterThan(10)
  })
  it('stays quiet for a low building far from aerodromes; assumes the CBD on the hypothetical site', () => {
    const r = aviationChecklist(city({ height: 50 }), [CITY_ORIGIN[0] + 40000, CITY_ORIGIN[1] + 40000])
    expect(find(r, 'car-150')?.state).toBe('pass')
    expect(find(r, 'car-90-6km')?.state).toBe('pass')
    expect(find(r, 'car-notice')?.state).toBe('pass')
    expect(find(aviationChecklist(city({ height: 120 }), [CITY_ORIGIN[0], CITY_ORIGIN[1]]), 'car-notice')?.state).toBe('warn') // 90–150 m near an aerodrome is an obstacle too
    expect(find(r, 'ac-601-007')?.state).toBe('pass')
    const vtc = aviationChecklist(city({ height: 285 }), null)
    expect(find(vtc, 'car-90-6km')).toMatchObject({ state: 'warn', flag: 'team_assumption' })
  })
  it('uses the lowest AC 601-007 surface while the aerodrome category is unknown', () => {
    expect(notificationHeight('water', 2000)).toBeCloseTo(40)
    expect(notificationHeight('water', 4000)).toBe(60)
    expect(notificationHeight('heliport', 1000)).toBeCloseTo(40)
    expect(notificationHeight('heliport', 2000)).toBe(60)
  })
  it('keeps each corrected assumption with its correction', () => {
    for (const f of RELAX_AVIATION_FALSE_ASSUMPTIONS) expect(f.correction.length).toBeGreaterThan(30)
    expect(RELAX_AVIATION_FALSE_ASSUMPTIONS.map((f) => f.claim).join(' ')).toMatch(/YVR/)
  })
})
