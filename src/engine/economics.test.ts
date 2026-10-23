import { describe, expect, it } from 'vitest'
import { chargeRates, DEFAULT_ECON as P, economics, type EconInputs } from './economics'
import type { Tower } from './types'

const inp: EconInputs = { permitYear: 2027, landPrice: null, siteArea: 11468, includeRegional: false, homeM2: 75, hotelM2PerKey: 40, costBasis: 'pvv' }
const box = (patch: Partial<Tower>): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 4, f2f: 4, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, ...patch,
})

describe('economics (Program Value Visualizer method)', () => {
  it('prices one office floor by hand', () => {
    const r = economics([box({})], inp)
    // Level 1, band 1-20: 0.80 / 0.78 efficiency, 1 floor above podium.
    const value = 1600 * (0.8 / 0.78) * 6600 * (1 + 0.002) * (1 - 0.15)
    const hard = 1600 * 4465 + 1600 * 860
    const soft = hard * 0.25
    const city = 1600 * (214.89 + 67.33 + 32.29) * 1.03
    const fin = 0.065 * 6 * 0.5 * (hard + soft)
    const cost = hard + soft + city + fin
    expect(r.value).toBeCloseTo(value, 2)
    expect(r.cost).toBeCloseTo(cost, 2)
    expect(r.rlvBefore).toBeCloseTo(value - cost * 1.15, 2)
    expect(r.floors[0].residual).toBeCloseTo(r.rlvBefore, 2)
  })
  it('raises residential value with height and adds the supertall premium to cost', () => {
    const r = economics([box({ height: 280, bands: [{ use: 'residential', share: 1 }] })], inp)
    const f = r.floors
    expect(f[f.length - 1].value).toBeGreaterThan(f[0].value)
    const low = economics([box({ height: 240, bands: [{ use: 'residential', share: 1 }] })], inp)
    expect(r.hard / r.gfa).toBeGreaterThan(low.hard / low.gfa)
  })
  it('values retail at street level only (level 2 at 40%, above nothing)', () => {
    const r = economics([box({ height: 12, bands: [{ use: 'retail', share: 1 }] })], inp)
    expect(r.floors.map((x) => Math.round(x.value / (1600 * 12500) * 10) / 10)).toEqual([1, 0.4, 0])
  })
  it('charges plant floors nothing and prices them at the project average', () => {
    const r = economics([box({ height: 8, plantEvery: 2 })], inp)
    expect(r.averaged).toBe(1)
    expect(r.byUse.mechanical.value).toBe(0)
  })
  it('steps the residential ACC on 30 Sep 2027 and escalates 3% a year', () => {
    const a = chargeRates(P, 2026), b = chargeRates(P, 2027), c = chargeRates(P, 2028)
    expect(a.residential).toBeCloseTo(214.89 + 134.65 + 53.82, 6)
    expect(b.residential).toBeCloseTo((214.89 + 134.65) * 1.03 + 110.87, 6)
    expect(c.commercial).toBeCloseTo((214.89 + 67.33 + 32.29) * 1.03 * 1.03, 6)
  })
  it('takes no CAC from a 100% employment scheme, and 75% of the lift otherwise', () => {
    const office = economics([box({ height: 120 })], { ...inp, landPrice: 0 })
    expect(office.employmentOnly).toBe(true)
    expect(office.cac).toBe(0)
    const res = economics([box({ height: 120, bands: [{ use: 'residential', share: 1 }] })], { ...inp, siteArea: 100 })
    expect(res.cac).toBeCloseTo(Math.max(0, 0.75 * (res.rlvBefore - (res.landCurrent ?? 0))), 2)
  })
  it('reads the verdict against the land price', () => {
    const t = [box({ height: 120, bands: [{ use: 'residential', share: 1 }] })]
    const free = economics(t, { ...inp, landPrice: 0 })
    expect(free.verdict).toBe(free.rlvAfter >= 0 ? 'works' : 'fails')
    expect(economics(t, { ...inp, landPrice: 1e12 }).verdict).toBe('fails')
    expect(economics(t, { ...inp, landPrice: null, siteArea: null }).verdict).toMatch(/land-needed|fails/)
    expect(economics([box({ bands: [{ use: 'amenity', share: 1 }] })], inp).verdict).toBe('incomplete')
  })
  it('adds Metro and TransLink charges per home and per m² when switched on', () => {
    const t = [box({ height: 40, bands: [{ use: 'residential', share: 1 }] })]
    const off = economics(t, inp), on = economics(t, { ...inp, includeRegional: true })
    const homes = (10 * 1600 * 0.75) / 75
    expect(on.regionalCharges).toBeCloseTo(homes * (17323 + 1774), 2)
    expect(off.regionalCharges).toBe(0)
  })
})
