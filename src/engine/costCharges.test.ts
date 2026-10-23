// Construction cost and tall-building premium (P08-M03) and statutory charges (P08-M04), backlog item 39.
// Expected values are the spec's own worked numbers (research/modules-completion/P08/revise-r2_P08.json).
import { describe, expect, it } from 'vitest'
import { COST_LEDGER as L, costRange, heightPremium, SF } from './costCharges'
import { economics, type EconInputs } from './economics'
import type { Tower } from './types'

const inp: EconInputs = { permitYear: 2026, landPrice: null, siteArea: 11468, includeRegional: true, homeM2: 75, hotelM2PerKey: 40 }
const box = (patch: Partial<Tower>): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 4, f2f: 4, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, ...patch,
})

describe('tall-building premium (P08-M03)', () => {
  it('reproduces the spec at 60 storeys: x1.12, x1.27, x1.16 (70/30), x1.42 linear, x1.52 compound', () => {
    const com = heightPremium(60, 0), res = heightPremium(60, 1), mix = heightPremium(60, 0.3)
    expect(com.factor).toBeCloseTo(1.12, 2)
    expect(res.factor).toBeCloseTo(1.27, 2)
    expect(mix.factor).toBeCloseTo(1.16, 2)
    expect(mix.lines.linear).toBeCloseTo(1.42, 2)
    expect(mix.lines.compound).toBeCloseTo(1.52, 2)
    expect(mix.above).toBe(21)
    // $455/ft² band top -> $509-579/ft² at 60 storeys.
    expect(455 * com.factor).toBeCloseTo(509, 0)
    expect(455 * res.factor).toBeCloseTo(579, 0)
  })
  it('adds nothing at or below the 39-storey anchor (the sourced band stays intact)', () => {
    expect(heightPremium(39, 1).factor).toBe(1)
    expect(heightPremium(12, 0.5).above).toBe(0)
  })
  it('shows no cost range until contingency is above 0, then Class 5 with the 2x high side above the band', () => {
    expect(costRange(100, 0, true)).toBeNull()
    const r = costRange(100, 0.1, true)!
    expect(r.p10).toBeCloseTo(70, 6)
    expect(r.p90).toBeCloseTo(200, 6)
    expect(costRange(100, 0.1, false)!.p90).toBeCloseTo(150, 6)
  })
})

describe('research cost basis in the residual', () => {
  it('prices one office floor from the Coriolis base by hand', () => {
    const r = economics([box({})], { ...inp, includeRegional: false })
    expect(r.hard).toBeCloseTo(1600 * 585 * SF + 1600 * 860, 2)
    expect(r.construction.basis).toBe('research')
    expect(r.construction.sourcedShare).toBe(1)
    expect(r.construction.range).toBeNull()
  })
  it('applies the premium once to a 70-storey residential tower and widens the high side', () => {
    const t = box({ height: 280, bands: [{ use: 'residential', share: 1 }] })
    const r = economics([t], { ...inp, contingency: 0.1 })
    const prem = Math.pow(70 / 39, 0.56)
    expect(r.construction.towers[0].premium.factor).toBeCloseTo(prem, 6)
    expect(r.hard).toBeCloseTo(70 * 1600 * L.base.residential!.value * prem, 0)
    expect(r.construction.contingency).toBeCloseTo(0.1 * r.hard, 2)
    expect(r.construction.range!.multiplier).toBe(2)
    // The contingency feeds the residual.
    expect(economics([t], inp).rlvBefore).toBeGreaterThan(r.rlvBefore)
  })
  it('leaves hotel without a sourced base: priced at the average and counted in the sourced share', () => {
    const r = economics([box({ height: 8, bands: [{ use: 'office', share: 0.5 }, { use: 'hotel', share: 0.5 }] })], inp)
    expect(r.construction.sourcedShare).toBeCloseTo(0.5, 6)
    expect(r.averaged).toBe(1)
  })
})

describe('statutory charges (P08-M04)', () => {
  it('matches the spec example for office: about $477/m² (City $29.22 + Metro $13.94 + TransLink $1.16 per ft²)', () => {
    const r = economics([box({})], inp)
    expect(r.charges.perM2).toBeCloseTo(214.89 + 67.33 + 32.29 + (13.94 + 1.16) * SF, 1)
    expect(r.charges.perM2 / SF).toBeCloseTo(44.32, 1)
  })
  it('charges designated public uses $10 per permit in each City schedule, commercial rates otherwise', () => {
    const t = [box({ height: 8, bands: [{ use: 'civic', share: 1 }] })]
    const plain = economics(t, { ...inp, includeRegional: false })
    expect(plain.cityCharges).toBeCloseTo(2 * 1600 * (214.89 + 67.33 + 32.29), 2)
    const reduced = economics(t, { ...inp, includeRegional: false, civicReduced: true })
    expect(reduced.cityCharges).toBe(30)
  })
  it('switches the ACC treatment: not payable drops it; netted credits it against the CAC', () => {
    const t = [box({ height: 120, bands: [{ use: 'residential', share: 1 }] })]
    const base = economics(t, { ...inp, siteArea: 100 })
    const none = economics(t, { ...inp, siteArea: 100, accTreatment: 'not-payable' })
    expect(base.cityCharges - none.cityCharges).toBeCloseTo(30 * 1600 * 53.82, 2)
    const netted = economics(t, { ...inp, siteArea: 100, accTreatment: 'netted' })
    expect(netted.cac).toBeCloseTo(Math.max(0, base.cac - 30 * 1600 * 53.82), 2)
  })
  it('lists every line with a status, keeps blank lines unresolved and the total incomplete, and defers 75%', () => {
    const r = economics([box({ height: 280, bands: [{ use: 'residential', share: 1 }] })], inp)
    const ids = r.charges.lines.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['acc-com', 'acc-res', 'dcl', 'udcl', 'reduced', 'metro', 'translink', 'ssac', 'permit-fees', 'legacy-cac']))
    expect(r.charges.lines.find((l) => l.id === 'ssac')).toMatchObject({ total: null, status: 'blank', flag: 'unresolved' })
    expect(r.charges.lines.find((l) => l.id === 'legacy-cac')!.flag).toBe('false_assumption')
    expect(r.charges.complete).toBe(false)
    for (const l of r.charges.lines) expect(l.source.length).toBeGreaterThan(10)
    const city = r.charges.lines.filter((l) => ['acc-com', 'acc-res', 'dcl', 'udcl'].includes(l.id)).reduce((a, l) => a + (l.total ?? 0), 0)
    expect(r.charges.deferral!.atPermit).toBeCloseTo(0.25 * city, 2)
    expect(r.charges.total).toBeCloseTo(r.cityCharges + r.regionalCharges, 2)
  })
})
