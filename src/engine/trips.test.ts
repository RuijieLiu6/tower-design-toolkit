import { describe, expect, it } from 'vitest'
import { DEFAULT_LIFT_PRESETS, liftCheck } from './lifts'
import { CBD_AM, DEFAULT_TRIPS, STATIONS, tripCheck, type Population } from './trips'
import type { Tower } from './types'
import { populationFrom } from '../hooks/useTrips'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.25, plantEvery: 0,
}
const pop: Population = { office: 10000, residents: 1000, hotelGuests: 500, retailCivicM2: 6400, basis: 'test' }

describe('trip generation and mode split (P09-M01)', () => {
  it('uses the 2008 destination-end row for trips into the tower, adding up to one', () => {
    expect(CBD_AM.transit).toBeCloseTo(0.459, 3)
    expect(CBD_AM.autoDriver).toBeCloseTo(0.331, 3)
    expect(CBD_AM.transit + CBD_AM.autoDriver + CBD_AM.other).toBeCloseTo(1, 9)
  })
  it('computes AM peak-hour trips by use from populations and presets', () => {
    const r = tripCheck(pop)
    const office = r.uses.find((u) => u.use.startsWith('Office'))!
    expect(office.persons).toBeCloseTo(10000 * DEFAULT_TRIPS.officePeakShare, 6)
    expect(office.transit).toBeCloseTo(office.persons * CBD_AM.transit, 6)
    expect(r.am.in).toBeCloseTo(4500 + 64, 6) // office + 1 per 100 m² retail
    expect(r.am.out).toBeCloseTo(1000 * 0.12 + 500 * 0.1, 6)
    expect(r.uses.find((u) => u.use.startsWith('Residents'))!.basis).toBe('unsourced scenario')
  })
  it('applies no occupancy factor to car drivers: parking demand is driver arrivals', () => {
    const r = tripCheck(pop, DEFAULT_TRIPS, { maxStalls: 500 })
    expect(r.parking.arrivals).toBeCloseTo(r.am.in * CBD_AM.autoDriver, 6)
    expect(r.rules.find((x) => x.id === 'parking-demand')!.state).toBe('warn') // over the (unverified) maximum
  })
})

describe('station entrance, tier 0 (P09-M03)', () => {
  it('adds tower link riders to the proxy station share and sizes the link for one train', () => {
    const r = tripCheck(pop)
    const st = STATIONS.find((s) => s.name === DEFAULT_TRIPS.station)!
    expect(r.station.stationIn).toBeCloseTo(st.alightAm * 0.3, 6)
    expect(r.station.linkIn).toBeCloseTo(r.am.transitIn * 0.7, 6)
    const perTrain = (r.station.linkIn + r.station.stationIn) / (60 / 2.5)
    expect(r.station.perTrain).toBeCloseTo(perTrain, 6)
    expect(r.station.required).toBeCloseTo((perTrain / 60) / (1.0 / 1.4), 6)
  })
  it('never shows a width green, and widens the need when the headway grows', () => {
    const narrow = tripCheck(pop, { ...DEFAULT_TRIPS, clearWidth: 1 })
    const wide = tripCheck(pop, { ...DEFAULT_TRIPS, clearWidth: 50 })
    expect(narrow.rules.find((x) => x.id === 'passage-width')!.state).toBe('warn')
    expect(wide.rules.find((x) => x.id === 'passage-width')!.state).toBe('unknown')
    expect(tripCheck(pop, { ...DEFAULT_TRIPS, headwayMin: 5 }).station.required).toBeCloseTo(2 * tripCheck(pop).station.required, 6)
    expect(wide.rules.find((x) => x.id === 'egress')!.flag).toBe('unresolved')
  })
  it('reports the transit-level share for the lifts and every rule has a source and a threshold', () => {
    const r = tripCheck(pop, { ...DEFAULT_TRIPS, lineCapacity: 12000 })
    expect(r.transitLevel.share).toBeCloseTo(r.station.linkIn / r.am.in, 9)
    for (const x of r.rules) { expect(x.source.label).toBeTruthy(); expect(x.threshold).toBeTruthy() }
    expect(r.rules.some((x) => x.id === 'line-context')).toBe(true)
    expect(r.rules.some((x) => x.state === 'pass' && x.id === 'passage-width')).toBe(false)
  })
})

describe('populations come from the lift check', () => {
  it('sums local rises by class and skips shuttles, so a sky lobby does not double count', () => {
    const direct = populationFrom([liftCheck(vtc, DEFAULT_LIFT_PRESETS, undefined, { skipDirect: true })], 0)
    const sky = populationFrom([liftCheck({ ...vtc, skyLobbies: [40] }, DEFAULT_LIFT_PRESETS, undefined, { skipDirect: true })], 0)
    expect(direct.office).toBeGreaterThan(0)
    expect(direct.residents).toBeGreaterThan(0)
    // The sky lobby floor becomes amenity, so one floor's people go; shuttles add nobody.
    expect(sky.office + sky.residents + sky.hotelGuests).toBeLessThanOrEqual(direct.office + direct.residents + direct.hotelGuests + 1e-6)
  })
})
