import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENERGY, EF, HBP_TARGETS, VBBL_TABLE_A, areas, blocked, defaultSystem, embodied, energyCarbonCheck, estimateEnergy, pvPotential,
  sunSamples, weightedLimits, type EnergyInput, type Obstacle,
} from './energyCarbon'
import { towerFloors } from './massing'
import type { Tower } from './types'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 0,
}
const office: Tower = { ...vtc, id: 'o', bands: [{ use: 'office', share: 1 }], podiumHeight: 0, podiumUse: 'office' }
const ctx = { cars: 33, northDeg: 45, lat: 49.2827, lon: -123.1207, obstacles: [] as Obstacle[], shortlistSystem: 'core-outriggers' as const, obstaclesKnown: true }
const find = (rules: { id: string }[], id: string) => rules.find((r) => r.id === id) as { state: string; value: string; flag: string } | undefined

describe('limits (HBP s2.2 and VBBL Table 10.2.2.5.A)', () => {
  it('uses the stricter HBP office and retail GHGI of 1.5 and TEDI 15', () => {
    expect(HBP_TARGETS.office).toEqual({ teui: 100, tedi: 15, ghgi: 1.5 })
    expect(VBBL_TABLE_A.residential).toEqual({ teui: 120, tedi: 30, ghgi: 3.0 })
    expect(VBBL_TABLE_A.hotel.ghgi).toBe(4.0)
  })

  it('area-weights the limits over the uses that have a row', () => {
    const w = weightedLimits({ office: 1000, residential: 1000, hotel: 0, retail: 0, civic: 500, amenity: 0, mechanical: 200 })
    expect(w.rowArea).toBe(2000)
    expect(w.hbp.ghgi).toBeCloseTo((1.5 + 3) / 2, 9)
    expect(w.vbbl.teui).toBeCloseTo((100 + 120) / 2, 9)
  })

  it('counts every floor in the modelled floor area and measures the facade', () => {
    const a = areas([vtc])
    const sum = towerFloors(vtc).reduce((s, f) => s + f.area, 0)
    expect(a.mfa).toBeCloseTo(sum, 6)
    expect(a.wall).toBeCloseTo(4 * 46 * (285 - 18) + 2 * (100 + 64) * 18, 6)
    expect(a.vfar).toBeGreaterThan(0.2)
    expect(a.vfar).toBeLessThan(0.65)
  })
})

describe('screening estimate', () => {
  it('an all-electric office meets the HBP GHGI 1.5; gas boilers do not', () => {
    const a = areas([office])
    const hp = estimateEnergy(a, DEFAULT_ENERGY, 0)
    expect(hp.gas).toBe(0)
    expect(hp.ghgi).toBeCloseTo(hp.teui * EF.electricity, 6)
    expect(hp.ghgi).toBeLessThan(1.5)
    const gas = estimateEnergy(a, { ...DEFAULT_ENERGY, heating: 'gas' }, 0)
    expect(gas.ghgi).toBeGreaterThan(1.5)
    const r = energyCarbonCheck([office], { ...DEFAULT_ENERGY, heating: 'gas' }, ctx)
    expect(find(r.operational, 'en-ghgi')!.state).toBe('fail')
    expect(find(r.operational, 'en-gas')!.state).toBe('fail')
  })

  it('a Table A envelope fails the HBP TEDI 15 but passes under the permit regime alone', () => {
    const input: EnergyInput = { ...DEFAULT_ENERGY, envelope: 'table-a' }
    expect(find(energyCarbonCheck([office], input, ctx).operational, 'en-tedi')!.state).toBe('fail')
    expect(find(energyCarbonCheck([office], { ...input, regime: 'permit' }, ctx).operational, 'en-tedi')!.state).toBe('pass')
  })

  it('adds 3 kW per elevator on the schedule and labels the estimate a team assumption', () => {
    const a = areas([office])
    const d = estimateEnergy(a, DEFAULT_ENERGY, 10).elec - estimateEnergy(a, DEFAULT_ENERGY, 0).elec
    expect(d).toBe(10 * 3 * 3000)
    expect(find(energyCarbonCheck([office], DEFAULT_ENERGY, ctx).operational, 'en-teui')!.flag).toBe('team_assumption')
  })

  it('needs the district factor before judging GHGI on district energy', () => {
    const r = energyCarbonCheck([office], { ...DEFAULT_ENERGY, heating: 'district' }, ctx)
    expect(find(r.operational, 'en-ghgi')!.state).toBe('unknown')
  })

  it('flags civic and amenity space for the reference-model rule', () => {
    const r = energyCarbonCheck([vtc], DEFAULT_ENERGY, ctx)
    expect(find(r.operational, 'en-other')).toBeDefined()
    expect(find(r.operational, 'en-other')!.flag).toBe('team_assumption')
  })
})

describe('embodied carbon (VBBL 10.4.1.2: 2 × 400)', () => {
  it('sets the limit at 800, or up to 820 with credits', () => {
    const a = areas([vtc])
    expect(embodied([vtc], a, DEFAULT_ENERGY, 'core-flat-slab').limit).toBe(800)
    expect(embodied([vtc], a, { ...DEFAULT_ENERGY, ilc: 0.1 }, 'core-flat-slab').limit).toBeCloseTo(820, 9)
  })

  it('takes the shortlisted system by default, ranks timber hybrid lowest and SCM 40% below 20%', () => {
    const a = areas([vtc])
    expect(defaultSystem([{ id: 'outriggers', fit: 'shortlist' }])).toBe('core-outriggers')
    expect(defaultSystem(null)).toBe('core-flat-slab')
    const base = embodied([vtc], a, DEFAULT_ENERGY, 'core-flat-slab')
    expect(base.fromShortlist).toBe(true)
    expect(embodied([vtc], a, { ...DEFAULT_ENERGY, system: 'timber-hybrid' }, 'core-flat-slab').band[1]).toBeLessThan(base.band[1])
    expect(embodied([vtc], a, { ...DEFAULT_ENERGY, scm: 40 }, 'core-flat-slab').band[1]).toBeLessThan(base.band[1])
    expect(base.band[0]).toBeLessThan(base.band[1]); expect(base.band[1]).toBeLessThan(base.band[2])
    expect(base.totalT[1]).toBeCloseTo((base.band[1] * a.mfa) / 1000, 6)
  })

  it('keeps the 240 line as a corrected false assumption', () => {
    const r = energyCarbonCheck([vtc], DEFAULT_ENERGY, ctx)
    expect(find(r.carbon, 'ec-240')!.flag).toBe('false_assumption')
    expect(find(r.carbon, 'ec-limit')!.flag).toBe('verified')
  })
})

describe('PV potential', () => {
  it('samples daytime sun only, and blocks a ray through a taller box', () => {
    const sun = sunSamples(0, 49.2827, -123.1207)
    expect(sun.length).toBeGreaterThan(100)
    expect(sun.every((s) => s.dir[2] > 0)).toBe(true)
    const box: Obstacle = { footprint: [[10, -5], [20, -5], [20, 5], [10, 5]], height: 100 }
    expect(blocked([0, 0, 10], [1, 0, 0.5], [box])).toBe(true) // reaches x = 10 at z = 15 < 100
    expect(blocked([0, 0, 10], [1, 0, 20], [box])).toBe(false) // steep ray clears the top
    expect(blocked([0, 0, 10], [-1, 0, 0.5], [box])).toBe(false) // facing away
  })

  it('ranks the south face above the north face and credits TEUI and GHGI per EMG', () => {
    const r = pvPotential([office], DEFAULT_ENERGY, { northDeg: 0, lat: 49.2827, lon: -123.1207, obstacles: [], mfa: 100000, elec: 5e6 })
    const face = (az: number) => r.surfaces.filter((s) => s.kind === 'facade' && s.azimuth !== null && Math.abs(((s.azimuth - az + 540) % 360) - 180) < 1)
    const south = face(180), north = face(0)
    expect(south.length).toBeGreaterThan(0)
    expect(south[0].poa).toBeGreaterThan(north[0].poa * 1.5)
    const roof = r.surfaces.find((s) => s.kind === 'roof')!
    expect(roof.yieldKwhKwp).toBeCloseTo(1173, -1) // unshaded roof ≈ the reference
    expect(r.teuiCredit).toBeCloseTo(r.kwh / 100000, 9)
    expect(r.ghgiCredit).toBeCloseTo((r.kwh * 0.011) / 100000, 9)
  })

  it('loses yield on a facade facing a taller neighbour', () => {
    const on = { ...DEFAULT_ENERGY, pv: { ...DEFAULT_ENERGY.pv, facade: true } }
    const free = pvPotential([office], on, { northDeg: 0, lat: 49.2827, lon: -123.1207, obstacles: [], mfa: 1e5, elec: 5e6 })
    const wall: Obstacle = { footprint: [[-60, -60], [20, -60], [20, -50], [-60, -50]], height: 400 } // a tall slab just south
    const shaded = pvPotential([office], on, { northDeg: 0, lat: 49.2827, lon: -123.1207, obstacles: [wall], mfa: 1e5, elec: 5e6 })
    expect(shaded.kwh).toBeLessThan(free.kwh)
    expect(Math.max(...shaded.surfaces.map((s) => s.shaded))).toBeGreaterThan(0.3)
  })
})
