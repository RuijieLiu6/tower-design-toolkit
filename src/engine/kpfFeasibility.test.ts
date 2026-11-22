import { describe, expect, it } from 'vitest'
import { economics, type EconInputs } from './economics'
import { costBandReading, kpfCostBand, kpfReadings, KPF_OFFICE_LOT, officeStack, officeStackReading, slenderRiskReading } from './kpfFeasibility'
import { slenderBand } from './slenderBand'
import { gfaByUse } from './massing'
import type { Tower } from './types'
import { extraOutput, type ExtraInputs } from '../lib/extraLive'

// Developer lens (21 Nov): KPF's office lot test and cost band against height, reported beside the residual.
const box = (patch: Partial<Tower>): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 120, f2f: 4, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, ...patch,
})
const inp: EconInputs = { permitYear: 2027, landPrice: null, siteArea: 11468, includeRegional: false, homeM2: 75, hotelM2PerKey: 40 }

describe('KPF cost band against height (pp.27–28)', () => {
  it('reads the band at or below the height, relative to a 300 ft tower', () => {
    expect(kpfCostBand(200).band).toBeNull() // 656 ft: below the bands
    expect(kpfCostBand(243.84).band).toMatchObject({ low: 1.7, high: 2.1 }) // 800 ft
    expect(kpfCostBand(285).band).toMatchObject({ low: 2.1, high: 3.0 }) // 935 ft
    expect(kpfCostBand(304.8).band).toMatchObject({ low: 1.5, high: 4.1 }) // 1,000 ft
    expect(kpfCostBand(285).ft).toBeCloseTo(935.04, 1)
  })

  it('is a reported line, unverified, with its page and the poor correlation said; specialist only past the test fits', () => {
    const r = costBandReading(box({ height: 285 }))
    expect(r).toMatchObject({ id: 'kpf-cost-t', state: 'unknown', flag: 'unverified', source: { page: 'pp.27–28' } })
    expect(r.value).toContain('2.1–3.0×')
    expect(r.note).toMatch(/poor/)
    expect(r.note).toMatch(/Confidence B/)
    expect(r.specialist).toBeUndefined()
    expect(costBandReading(box({ height: 320 })).specialist).toMatch(/1,000 ft/)
    expect(costBandReading(box({ height: 200 })).value).toMatch(/under 800 ft/)
  })
})

describe('office stack against the KPF lot test (KPF pp.6–8; Dobson pp.66, 72)', () => {
  it('sums office floor area and finds the top of the office stack', () => {
    const t = box({ height: 120 })
    const s = officeStack(t)
    expect(s.gfa).toBeCloseTo(gfaByUse([t]).office, 6)
    expect(s.top).toBeCloseTo(120, 6)
    expect(officeStack(box({ bands: [{ use: 'residential', share: 1 }] }))).toEqual({ gfa: 0, top: null })
  })

  it('reports the share of KPF’s office tower with state unknown, and asks for a specialist past it', () => {
    const small = officeStackReading(box({ height: 120 })) // 30 storeys of 1,600 m²: 48,000 m²
    expect(small).toMatchObject({ state: 'unknown', flag: 'unverified', source: { page: 'KPF pp.6–8; Dobson pp.66, 72' } })
    expect(small.value).toContain(`${Math.round((100 * officeStack(box({ height: 120 })).gfa) / KPF_OFFICE_LOT.gfaM2)}%`)
    expect(small.note).toMatch(/Boundary: An analog/)
    expect(small.specialist).toBeUndefined()
    const big = officeStackReading(box({ height: 240, width: 50, depth: 50 })) // 60 storeys of 2,500 m², up to 240 m
    expect(big.note).toMatch(/More office, or office higher/)
    expect(big.specialist).toMatch(/vertical-transportation/)
  })
})

describe('beside the residual, never in it', () => {
  it('rides on the economics result without touching the residual or the verdict', () => {
    const towers = [box({ height: 285, width: 45, depth: 45 })]
    const r = economics(towers, inp)
    expect(r.readings).toEqual(kpfReadings(towers))
    expect(r.readings.map((x) => x.id)).toEqual(['kpf-office-t', 'kpf-cost-t', 'kpf-slender-t'])
    expect(r.readings.every((x) => x.state === 'unknown')).toBe(true)
    // The live node output keeps the residual's own state; the readings sit beside it as items.
    const x = { econ: r } as unknown as ExtraInputs
    const out = extraOutput('built.economics', x)!
    const without = extraOutput('built.economics', { econ: { ...r, readings: [] } } as unknown as ExtraInputs)!
    expect(out.state).toBe(without.state)
    expect(out.headline).toBe(without.headline)
    expect(out.items.map((i) => i.id)).toEqual(['econ-rlv', 'kpf-office-t', 'kpf-cost-t', 'kpf-slender-t'])
  })
})

describe('KPF slenderness band in the developer view (node placement, 21 Nov)', () => {
  it('reads the same band as the wind procedure, reported only', () => {
    const tall = box({ height: 285, width: 32, depth: 45 })
    const r = slenderRiskReading(tall)
    const b = slenderBand(285, 32)
    expect(b.risk).toBe(true)
    expect(r.value).toContain(b.value)
    expect(r.value.startsWith('In the higher-risk band')).toBe(true)
    expect(r.state).toBe('unknown')
    expect(r.flag).toBe('unverified')
    expect(r.source.page).toContain('29–34')
  })
  it('says when the tower lies outside the band (under 244 m, or under 8:1)', () => {
    expect(slenderRiskReading(box({ height: 200, width: 20, depth: 45 })).value.startsWith('Outside the higher-risk band')).toBe(true)
    expect(slenderRiskReading(box({ height: 285, width: 45, depth: 45 })).value.startsWith('Outside the higher-risk band')).toBe(true)
  })
})
