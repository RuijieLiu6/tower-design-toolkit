// Book node #1 "built.hbp-area" (21 Nov): Higher Buildings area and ceiling, a fix to Relaxations & aviation and en-hbp-height.
import { describe, expect, it } from 'vitest'
import data from '../data/higherBuildings.json'
import { CITY_ORIGIN, useStore } from '../store'
import { DEFAULT_ENERGY, energyCarbonCheck, type Obstacle } from './energyCarbon'
import { FT, HBP_CEILINGS, HBP_ORIGIN, HBP_PARTS, NEAR_EDGE_M, hbpCeiling, hbpChecklist, hbpReading, hbpFootprint } from './hbpArea'
import { RELAXATIONS, RELAX_AVIATION_FALSE_ASSUMPTIONS, relaxationChecklist } from './relaxAviation'
import { CONES } from './viewCones'
import type { Tower } from './types'

const base = (): Tower => ({ ...useStore.getInitialState().towers.city[0] })
/** A tower centred on an EPSG:26910 point (the project frame is EPSG:26910 minus CITY_ORIGIN). */
const at = ([e, n]: readonly number[], patch: Partial<Tower> = {}): Tower => ({ ...base(), x: e - CITY_ORIGIN[0], y: n - CITY_ORIGIN[1], rotation: 0, width: 30, depth: 30, ...patch })
const find = (rs: { id: string }[], id: string) => rs.find((r) => r.id === id) as { id: string; state: string; flag: string; value: string; threshold: string; note?: string; specialist?: string } | undefined
const off = { routeOn: false, ceilingFt: null, streets: null }
/** Well inside the central core (the layer's label point). */
const CBD = data.layers[0].labelAt
const FAR = [CITY_ORIGIN[0] + 3000, CITY_ORIGIN[1] - 3000]

describe('Higher Buildings area: inside or outside (HBP 2.1(b))', () => {
  it('keeps the parts in the same frame as the City layers', () => {
    expect(HBP_ORIGIN).toEqual(CITY_ORIGIN)
    expect(HBP_PARTS).toHaveLength(14)
    for (const p of HBP_PARTS) expect(HBP_CEILINGS[p.id]).toBeDefined()
  })
  it('reads a footprint in the central core as inside the CBD, with QE View 3 open', () => {
    const r = hbpReading(hbpFootprint(at(CBD), CITY_ORIGIN))
    expect(r.where).toBe('within')
    expect(r.part?.id).toBe('hbp-current-01')
    expect(r.qe3).toBe('yes')
    const l = find(hbpChecklist(at(CBD), 'city', CITY_ORIGIN, off), 'hbp-area')!
    expect(l).toMatchObject({ state: 'pass', flag: 'unverified' })
    expect(l.value).toMatch(/^inside: Central core/)
    expect(l.note).toMatch(/Rule text verified.*unverified/)
  })
  it('reads a footprint far from every part as outside: warn with the route off, fail with it on', () => {
    expect(hbpReading(hbpFootprint(at(FAR), CITY_ORIGIN)).where).toBe('outside')
    expect(find(hbpChecklist(at(FAR), 'city', CITY_ORIGIN, off), 'hbp-area')).toMatchObject({ state: 'warn' })
    const on = find(hbpChecklist(at(FAR), 'city', CITY_ORIGIN, { ...off, routeOn: true }), 'hbp-area')!
    expect(on.state).toBe('fail')
    expect(on.value).toMatch(/^outside \(nearest: .+, \d+ m\)$/)
    // Outside, no Figure 1 ceiling applies unless one is typed.
    expect(find(hbpChecklist(at(FAR), 'city', CITY_ORIGIN, off), 'hbp-ceiling')?.state).toBe('unknown')
  })
})

describe('Higher Buildings ceiling (Figure 1 legend, p.5)', () => {
  it('maps the parts to 600 / 550 / 500 ft and the identified sites, all unverified', () => {
    expect(HBP_CEILINGS['hbp-current-01']).toMatchObject({ ft: 600, cbd: true })
    expect(HBP_CEILINGS['hbp-current-04'].ft).toBe(550)
    expect(HBP_CEILINGS['hbp-current-05'].ft).toBe(500)
    expect(HBP_CEILINGS['hbp-current-07'].ft).toBe(515)
    expect(Object.values(HBP_CEILINGS).filter((c) => c.cbd)).toHaveLength(1)
  })
  it('warns when the top is over the area ceiling and passes under it', () => {
    const tall = find(hbpChecklist(at(CBD, { height: 285 }), 'city', CITY_ORIGIN, off), 'hbp-ceiling')!
    expect(tall).toMatchObject({ state: 'warn', flag: 'unverified' })
    expect(tall.value).toBe('top 285 m (935 ft) vs ceiling 182.9 m (600 ft)')
    expect(tall.threshold).toMatch(/view corridors, else up to 600 ft/)
    expect(find(hbpChecklist(at(CBD, { height: 150 }), 'city', CITY_ORIGIN, off), 'hbp-ceiling')?.state).toBe('pass')
  })
  it('takes a typed site-specific ceiling instead of the area’s', () => {
    const typed = find(hbpChecklist(at(CBD, { height: 285 }), 'city', CITY_ORIGIN, { ...off, ceilingFt: 1000 }), 'hbp-ceiling')!
    expect(typed.state).toBe('pass')
    expect(typed.threshold).toMatch(/you typed/)
    expect(hbpCeiling(hbpReading(null), null)).toMatchObject({ ft: 600, flag: 'team_assumption' })
  })
  it('asks for W Georgia, Burrard or Granville frontage only above 600 ft (2.1(c))', () => {
    const t = at(CBD, { height: 200 }) // 656 ft
    expect(find(hbpChecklist(at(CBD, { height: 150 }), 'city', CITY_ORIGIN, off), 'hbp-street')).toBeUndefined()
    expect(find(hbpChecklist(t, 'city', CITY_ORIGIN, off), 'hbp-street')?.state).toBe('unknown')
    expect(find(hbpChecklist(t, 'city', CITY_ORIGIN, { ...off, streets: ['W Georgia St', 'Howe St'] }), 'hbp-street')).toMatchObject({ state: 'pass', value: 'fronts W Georgia St' })
    expect(find(hbpChecklist(t, 'city', CITY_ORIGIN, { ...off, streets: ['W Pender St'] }), 'hbp-street')?.state).toBe('warn')
  })
})

describe('needs a specialist near an edge or a ceiling (node contract)', () => {
  it('marks a footprint near the digitized edge and a top near a ceiling, and nothing well clear of both', () => {
    const clear = hbpChecklist(at(CBD, { height: 150 }), 'city', CITY_ORIGIN, off)
    expect(clear.every((l) => l.specialist === undefined)).toBe(true)
    expect(hbpReading(hbpFootprint(at(CBD), CITY_ORIGIN)).clearOfBandM).toBeGreaterThan(NEAR_EDGE_M)
    // A footprint straddling the central core's edge: across the edge, so the area line asks for the City's map.
    const p = HBP_PARTS[0].ring[0]
    const edge = at([p[0] + HBP_ORIGIN[0], p[1] + HBP_ORIGIN[1]])
    expect(find(hbpChecklist(edge, 'city', CITY_ORIGIN, off), 'hbp-area')!.specialist).toMatch(/Figure 1 map/)
    // 182 m is within 5% of 600 ft (182.9 m); a typed ceiling is the user's own figure, so no marker.
    expect(find(hbpChecklist(at(CBD, { height: 182 }), 'city', CITY_ORIGIN, off), 'hbp-ceiling')!.specialist).toMatch(/within 5%/)
    expect(find(hbpChecklist(at(CBD, { height: 182 }), 'city', CITY_ORIGIN, { ...off, ceilingFt: 600 }), 'hbp-ceiling')!.specialist).toBeUndefined()
  })
})

describe('the competition site is an assumed site', () => {
  it('says so instead of inside or outside, and reads the CBD ceiling as a team assumption', () => {
    const lines = hbpChecklist({ ...base(), height: 285 }, 'vtc', CITY_ORIGIN, { routeOn: true, ceilingFt: null, streets: null })
    expect(find(lines, 'hbp-area')).toMatchObject({ state: 'unknown', flag: 'team_assumption', value: 'assumed site: no real policy area' })
    expect(find(lines, 'hbp-ceiling')).toMatchObject({ state: 'warn', flag: 'team_assumption' })
    expect(find(lines, 'hbp-ceiling')!.value).toMatch(/assumed site$/)
    expect(find(lines, 'hbp-street')).toMatchObject({ state: 'unknown', value: 'assumed site: the brief names no real street' })
  })
})

describe('fixes to Relaxations & aviation and en-hbp-height', () => {
  it('no longer calls the policy heights guidance, not caps', () => {
    expect(RELAXATIONS.hbp.eligibility).not.toMatch(/guidance, not caps/)
    expect(RELAXATIONS.hbp.eligibility).toMatch(/600 ft/)
    expect(RELAXATIONS.hbp.eligibility).toMatch(/unverified/)
    const fa = RELAX_AVIATION_FALSE_ASSUMPTIONS.find((f) => /Higher Buildings/.test(f.claim))!
    expect(fa.correction).toMatch(/ceiling/)
  })
  it('applies the route to QE View 3 only inside the CBD outline', () => {
    // A point inside a QE Park cone: the route is switched on; it applies only where the footprint is inside the CBD.
    const ring = CONES.find((c) => c.id === '3.2.1')!.ring
    const pts = ring.map((p, i) => [(p[0] + ring[(i + 2) % ring.length][0]) / 2, (p[1] + ring[(i + 2) % ring.length][1]) / 2])
    let checked = 0
    for (const p of pts) {
      const t = at(p)
      const lines = relaxationChecklist(t, ['hbp'], 15, null, CITY_ORIGIN)
      const l = find(lines, 'relax-hbp')
      if (!l) continue
      checked++
      const qe3 = hbpReading(hbpFootprint(t, CITY_ORIGIN)).qe3
      expect(/not applied/.test(l.value)).toBe(qe3 !== 'yes')
      expect(l.threshold).not.toMatch(/guidance, not caps/)
    }
    expect(checked).toBeGreaterThan(0)
  })
  it('en-hbp-height warns between 600 and 700 ft by default, and reads a site ceiling when given', () => {
    const t: Tower = { ...base(), height: 198 } // ≈ 650 ft
    const ctx = { cars: 30, northDeg: 0, lat: 49.2827, lon: -123.1207, obstacles: [] as Obstacle[], shortlistSystem: 'core-outriggers' as const, obstaclesKnown: true }
    const def = find(energyCarbonCheck([t], DEFAULT_ENERGY, ctx).operational, 'en-hbp-height')!
    expect(def).toMatchObject({ state: 'warn', flag: 'unverified' })
    expect(def.threshold).not.toMatch(/guidance/)
    expect(find(energyCarbonCheck([t], DEFAULT_ENERGY, { ...ctx, hbpCeiling: { ft: 700, basis: 'typed' } }).operational, 'en-hbp-height')?.state).toBe('pass')
    expect(198 / FT).toBeGreaterThan(600)
  })
})
