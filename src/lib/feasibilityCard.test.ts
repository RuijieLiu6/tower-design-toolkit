import { describe, expect, it } from 'vitest'
import { DEFAULT_ECON, economics } from '../engine/economics'
import type { Tower } from '../engine/types'
import { fsrSummary, MIN_NONRES_FSR, SITE } from '../engine/vtcRules'
import { demoDesign } from './demo'
import { changeText, feasibilityCard, feasibilityChange, type CardDesign, type CardSite, type EconSettings } from './feasibilityCard'

// The economics lens on design options (product #2): the card's numbers are the economics node's and the FSR summary's,
// on each option's own design, at one set of settings, and the change is child − parent.
const S: EconSettings = { permitYear: 2027, landPrice: null, includeRegional: true, costBasis: 'research', residentialBase: 'coriolis', contingency: 0, civicReduced: false, accTreatment: 'payable' }
const BLOCK: CardSite = { area: SITE.area, source: 'brief p.15', flag: 'verified' }
const parent = demoDesign() as unknown as CardDesign
const withTowers = (d: CardDesign, f: (t: Tower) => Tower): CardDesign => ({ ...d, towers: { ...d.towers, [d.project]: d.towers[d.project].map(f) } })
// The fork: the same tower with every band turned to office (more employment floor area, a different residual).
const child = withTowers(parent, (t) => ({ ...t, bands: t.bands.map((b) => ({ ...b, use: 'office' as const })) }))

describe('feasibility card (Design options, per scheme)', () => {
  it('gives the economics node’s residual and the brief’s non-residential margin for the scheme’s own design', () => {
    const towers = parent.towers.vtc
    const c = feasibilityCard(parent, BLOCK, S, DEFAULT_ECON)
    const e = economics(towers, { ...S, siteArea: SITE.area, homeM2: parent.liftPresets.homeM2, hotelM2PerKey: parent.liftPresets.hotelM2PerKey })
    expect(parent.project).toBe('vtc')
    expect(c.residual.value).toBeCloseTo(e.rlvAfter, 2)
    expect(c.residual.land).toBeCloseTo(e.land!, 2)
    const f = fsrSummary(towers)
    const tierFsr = parent.fsrTier === 1 ? f.tier1 : parent.fsrTier === 2 ? f.tier2 : f.tier3
    expect(c.nonRes.fsr).toBeCloseTo(tierFsr, 6)
    expect(c.nonRes.margin).toBeCloseTo(tierFsr - MIN_NONRES_FSR, 6)
    expect(c.nonRes.flag).toBe('verified')
    // Every figure names its basis, and team assumptions as such.
    expect(c.residual.flag).toBe('unverified')
    expect(c.residual.basis).toMatch(/team assumptions: soft cost 25%, finance 6\.5% over 6 years/)
    expect(c.residual.detail).toMatch(/land estimated from current zoning/)
    expect(c.nonRes.basis).toMatch(/9\.0 minimum \(verified rule\).*team’s reading/)
  })

  it('reads the change against the parent as child − parent', () => {
    const a = feasibilityCard(parent, BLOCK, S, DEFAULT_ECON)
    const b = feasibilityCard(child, BLOCK, S, DEFAULT_ECON)
    const d = feasibilityChange(b, a)
    expect(d.comparable).toBe(true)
    expect(d.residual).toBeCloseTo(b.residual.value! - a.residual.value!, 2)
    expect(d.margin).toBeCloseTo(b.nonRes.margin! - a.nonRes.margin!, 6)
    expect(d.margin).toBeGreaterThan(0) // all office: more non-residential floor area
    expect(d.fsr).toBeCloseTo(d.margin!, 6)
    expect(feasibilityChange(a, a)).toEqual({ comparable: true, residual: 0, margin: 0, fsr: 0 })
  })

  it('names the land price as a team assumption when entered, and counts edited ledger rows', () => {
    const c = feasibilityCard(parent, BLOCK, { ...S, landPrice: 200e6 }, DEFAULT_ECON, 2)
    expect(c.residual.land).toBe(200e6)
    expect(c.residual.basis).toMatch(/the land price, 2 edited ledger rows/)
    expect(c.residual.detail).toMatch(/land price entered by you \(team assumption\)/)
  })

  it('on Real Vancouver: the FSR without a 9.0 margin (the brief’s rule), and no site, no FSR', () => {
    const city: CardDesign = { ...parent, project: 'city' }
    const site: CardSite = { area: 2000, source: 'the study site boundary', flag: 'unverified' }
    const c = feasibilityCard(city, site, S, DEFAULT_ECON)
    const f = fsrSummary(city.towers.city, 2000)
    expect(c.nonRes.margin).toBeNull()
    expect(c.nonRes.fsr).toBeCloseTo(city.fsrTier === 1 ? f.tier1 : city.fsrTier === 2 ? f.tier2 : f.tier3, 6)
    expect(c.nonRes.text).toMatch(/no 9\.0 minimum here/)
    expect(c.nonRes.flag).toBe('unverified')
    const none = feasibilityCard(city, { area: null, source: 'No study site yet', flag: 'unresolved' }, S, DEFAULT_ECON)
    expect(none.nonRes).toMatchObject({ fsr: null, margin: null, flag: 'unresolved', text: 'no study site yet' })
    // A scheme on another project does not compare.
    expect(feasibilityChange(c, feasibilityCard(parent, BLOCK, S, DEFAULT_ECON))).toEqual({ comparable: false, residual: null, margin: null, fsr: null })
  })

  it('writes a change with its sign', () => {
    expect(changeText(12e6, 'money')).toBe('+C$12.0 M')
    expect(changeText(-0.4, 'fsr')).toBe('−0.40 FSR')
    expect(changeText(0, 'fsr')).toBe('no change')
    expect(changeText(null, 'money')).toBe('—')
  })
})
