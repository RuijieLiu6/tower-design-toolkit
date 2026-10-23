import { describe, expect, it } from 'vitest'
import { bikeAReadings, DEFAULT_MOBILITY, erlangC, mobilityCheck, program, type MobilityInput } from './mobility'
import type { Tower } from './types'

const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 40, f2f: 4, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, ...patch,
})
const opts = { project: 'vtc' as const, transitLink: false, homeM2: 75, hotelM2PerKey: 40 }
const run = (t: Tower[], patch: Partial<MobilityInput> = {}) => mobilityCheck(t, { ...DEFAULT_MOBILITY, ...patch }, opts)

describe('parking, loading and bicycle check (P09-M02)', () => {
  it('never reports a parking shortfall: no minimum applies', () => {
    expect(run([tower()], { carStalls: 0 }).rules.find((r) => r.id === 'mob-min')?.state).toBe('pass')
  })
  it('caps non-residential parking at 1 per 115 m² (s.4.2.5, unverified) and warns above it', () => {
    const r = run([tower()]) // 10 office floors × 1,600 m²
    expect(r.maxStalls).toBe(Math.floor(16000 / 115))
    expect(r.rules.find((x) => x.id === 'mob-max')?.flag).toBe('unverified')
    expect(run([tower()], { carStalls: 200 }).rules.find((x) => x.id === 'mob-max')?.state).toBe('warn')
    // Within the extract's maximum it still cannot turn green until Section 4 is checked.
    expect(run([tower()], { carStalls: 50 }).rules.find((x) => x.id === 'mob-max')?.state).toBe('unknown')
  })
  it('keeps every unchecked by-law row out of pass, each citing its section', () => {
    const r = run([tower()], { carStalls: 10, loadingB: 2, bikeA: 9999 }).rules
    for (const id of ['mob-max', 'mob-accessible', 'mob-visitor', 'mob-ev', 'mob-loading', 'mob-passenger', 'mob-bike-a', 'mob-bike-b']) {
      const x = r.find((y) => y.id === id)!
      expect(x.state).not.toBe('pass')
      expect(x.source.label).toMatch(/Parking By-law No\. 6059, Section [456]/)
    }
    expect(r.filter((x) => x.flag === 'unresolved').map((x) => x.id)).toEqual(expect.arrayContaining(['mob-accessible', 'mob-visitor', 'mob-loading', 'mob-passenger', 'mob-bike-b']))
  })
  it('gives Class A bicycles as a range between the two readings', () => {
    const p = program([tower({ bands: [{ use: 'residential', share: 1 }] })], 75, 40)
    expect(p.dwellings).toBe(Math.floor((10 * 1600 * 0.75) / 75))
    const b = bikeAReadings(p)
    expect(b.council2008).toBe(Math.ceil(1.25 * p.dwellings))
    expect(b.vendorHigh).toBe(Math.ceil(3 * p.dwellings))
    expect(b.low).toBeLessThanOrEqual(b.high)
  })
})

describe('servicing (P09-M05)', () => {
  it('computes Erlang C (2 bays, offered load 1: P(wait) = 1/3)', () => {
    expect(erlangC(2, 1)).toBeCloseTo(1 / 3, 9)
    expect(erlangC(1, 0.5)).toBeCloseTo(0.5, 9)
    expect(erlangC(2, 2)).toBe(1)
  })
  it('stays unresolved until arrivals and dwell are entered, then screens the dock', () => {
    expect(run([tower()], { loadingB: 2 }).rules.find((r) => r.id === 'mob-dock')?.flag).toBe('unresolved')
    const ok = run([tower()], { loadingB: 2, trucksPerHour: 1, dwellMin: 15 }).rules.find((r) => r.id === 'mob-dock')!
    expect(ok.state).toBe('pass')
    expect(run([tower()], { loadingB: 1, trucksPerHour: 4, dwellMin: 30 }).rules.find((r) => r.id === 'mob-dock')?.state).toBe('fail')
  })
  it('ranks access by street: none on the retail high street, side streets first (no lane on the block)', () => {
    const r = run([tower()], { access: [{ id: 'x', kind: 'loading', edge: 'south', at: 0.5 }, { id: 'y', kind: 'ramp', edge: 'north', at: 0.5 }] }).rules
    expect(r.find((x) => x.id === 'mob-access-x')?.state).toBe('fail')
    expect(r.find((x) => x.id === 'mob-access-y')?.state).toBe('pass')
  })
  it('leaves the site sketch and transit row out of the Real Vancouver project', () => {
    const r = mobilityCheck([tower()], DEFAULT_MOBILITY, { ...opts, project: 'city' }).rules
    expect(r.some((x) => x.id.startsWith('mob-access-') || x.id === 'mob-transit')).toBe(false)
  })
})
