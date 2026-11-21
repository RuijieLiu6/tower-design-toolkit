// G8 (vtc-entry TOOL_DEFICITS): natural frequency and across-wind response, research R5 §4.2–4.3. "Lowest natural
// frequency f1" failed with no model frequency, so there was no way to weigh a corner or a twist (B8a/B9a).
import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { ACCEL_LIMIT, acrossWindAccel, ceRough, cornerReduction, f1Empirical, peakFactor, Q10, Q50, speedOf, vortexSpeed } from './acrossWind'
import { importedTower, rect, stack, type P } from './testStoreys'
import type { Tower } from './types'
import { DEFAULT_WIND_PRESETS, windProcedure } from './windStructure'

const rule = (r: ReturnType<typeof windProcedure>, id: string) => r.rules.find((x) => x.id === id)!
const chamfer = (w: number, c: number, cx = 0, cy = 0): P[] => { const x = w / 2; return ([[-x + c, -x], [x - c, -x], [x, -x + c], [x, x - c], [x - c, x], [-x + c, x], [-x, x - c], [-x, -x + c]] as P[]).map(([a, b]) => [a + cx, b + cy]) }

describe('G8: the NBC Commentary I across-wind chain (R5 §4.3)', () => {
  it('reproduces the Commentary’s worked example: 183 m, 30.5 m square, 0.2 Hz, β 0.015, 176 kg/m³, q10 0.37 kPa → about 0.45 m/s²', () => {
    const x = acrossWindAccel({ H: 183, w: 30.5, d: 30.5, f: 0.2, damping: 0.015, density: 176, q10: 0.37 })
    expect(ceRough(183)).toBeCloseTo(1.9, 2) // the sample's CeH
    expect(x.gp).toBeCloseTo(3.79, 2) // Davenport (recalled); the sample prints 3.74
    expect(x.a).toBeGreaterThanOrEqual(0.44)
    expect(x.a).toBeLessThanOrEqual(0.46) // 0.450; the Commentary gives 0.45 m/s², 4.6% g
    expect(x.g * 100).toBeCloseTo(4.6, 1)
    // With the sample's own peak factor the chain gives R5's 0.44 m/s².
    expect(acrossWindAccel({ H: 183, w: 30.5, d: 30.5, f: 0.2, damping: 0.015, density: 176, q10: 0.37, gp: 3.74 }).a).toBeCloseTo(0.445, 3)
  })

  it('reproduces R5’s worked example: 250 m, 50 m square, 250 kg/m³ → 1.3% g at 46/H, 2.1% g at the lower bound; no lock-in', () => {
    const f = f1Empirical(250)
    expect(f.central).toBeCloseTo(0.184, 3)
    expect(f.lower).toBeCloseTo(0.184 / 1.5, 3)
    const base = { H: 250, w: 50, d: 50, damping: 0.015, density: 250 }
    const c = acrossWindAccel({ ...base, f: f.central }), lo = acrossWindAccel({ ...base, f: f.lower })
    expect(c.VH).toBeCloseTo(34.2, 1)
    expect(c.g * 100).toBeCloseTo(1.3, 1)
    expect(lo.g * 100).toBeCloseTo(2.1, 1)
    expect(lo.g).toBeGreaterThan(ACCEL_LIMIT.residential) // the frequency band alone moves the verdict
    expect(vortexSpeed(f.central, 50, 0.14)).toBeGreaterThan(65)
    expect(speedOf(Q50) * Math.sqrt(ceRough(250))).toBeCloseTo(39.3, 1)
    expect(speedOf(Q10)).toBeCloseTo(22.96, 2)
    expect(peakFactor(0.184)).toBeGreaterThan(3.7)
  })

  it('applies the corner credit only where R5 sources it, linear to the tested points and held at b/B 0.10', () => {
    expect(cornerReduction('rounded', 0.05)!.R).toBeCloseTo(0.85, 9)
    expect(cornerReduction('rounded', 0.1)!.R).toBeCloseTo(0.49, 9)
    expect(cornerReduction('rounded', 0.075)!.R).toBeCloseTo(0.67, 9)
    expect(cornerReduction('rounded', 0.5)!.R).toBeCloseTo(0.49, 9) // no extrapolation
    expect(cornerReduction('recessed', 0.05)!.R).toBeCloseTo(0.69, 9)
    expect(cornerReduction('recessed', 0.1)!.R).toBeCloseTo(0.58, 9)
    expect(cornerReduction('chamfered', 0.1)!.R).toBe(0.8)
    expect(cornerReduction('chamfered', 0.1)!.basis).toMatch(/team default/)
    expect(cornerReduction('sharp', 0)).toBeNull()
    expect(cornerReduction('other', 0.1)).toBeNull()
  })
})

describe('G8: the wind procedure node reads f1, across-wind and vortex lines', () => {
  const vtc = (): Tower => ({ ...useStore.getInitialState().towers.vtc[0] })

  it('replaces the bare "no model frequency" with the empirical estimate, while the tunnel trigger stays', () => {
    const r = windProcedure(vtc())
    const f1 = rule(r, 'f1')
    expect(f1.value).toBe('≈ 0.161 Hz, empirical (46/H; 0.108–0.242 Hz at ±50%)')
    expect(f1.state).toBe('fail') // even the upper estimate is under 0.25 Hz
    expect(f1.flag).toBe('verified')
    expect(f1.note).toMatch(/never replaces the engineer’s model frequency/)
    expect(r.procedure).toBe('tunnel')
    expect(r.trigger).toMatch(/slenderness over 6/)
    const tall = windProcedure({ ...vtc(), width: 80, depth: 80, podiumHeight: 0 }) // stocky: only the team default sends it to the tunnel
    expect(tall.trigger).toMatch(/180 m or more with no model frequency/)
  })

  it('gives the across-wind acceleration at both ends of the frequency band, against the use’s limit', () => {
    const r = windProcedure(vtc())
    const a = rule(r, 'across-wind-accel')
    expect(a.value).toMatch(/^\d+\.\d% g at f1 0\.161 Hz; \d+\.\d% g at the lower 0\.108 Hz$/)
    expect(a.threshold).toMatch(/^≤ 1\.5% g \(homes or hotel rooms in the top third\)/) // the default bands end in homes
    expect(a.flag).toBe('team_assumption')
    expect(a.note).toMatch(/damping ratio 0\.015 \(team assumption/)
    const [c, lo] = [...a.value.matchAll(/(\d+\.\d)% g/g)].map((m) => Number(m[1]))
    expect(lo).toBeGreaterThan(c)
    expect(a.state).toBe(c > 1.5 ? 'fail' : lo > 1.5 ? 'warn' : 'pass')
    // More damping, less motion; the engineer's frequency replaces the band.
    const damped = rule(windProcedure(vtc(), { ...DEFAULT_WIND_PRESETS, damping: 0.03 }), 'across-wind-accel')
    expect(Number(damped.value.match(/^(\d+\.\d)/)![1])).toBeLessThan(c)
    expect(rule(windProcedure(vtc(), { ...DEFAULT_WIND_PRESETS, f1: 0.2 }), 'across-wind-accel').value).toMatch(/^\d+\.\d% g at f1 0\.200 Hz$/)
    // An office top takes the 2.5% g limit.
    const office = rule(windProcedure({ ...vtc(), bands: [{ use: 'office', share: 1 }] }), 'across-wind-accel')
    expect(office.threshold).toMatch(/^≤ 2\.5% g \(offices\)/)
  })

  it('shows the corner credit as a range beside the plain reading for B8c-like chamfers', () => {
    const b8c = importedTower(stack([{ n: 3, f2f: 4, ring: rect(90, 60), podium: true }, { n: 70, f2f: 4, ring: chamfer(50, 5, 17, 2) }]), { podiumTop: 12 })
    const a = rule(windProcedure(b8c), 'across-wind-accel')
    const v = [...a.value.matchAll(/(\d+\.\d+)% g/g)].map((m) => Number(m[1]))
    expect(a.value).toMatch(/; with the corner credit \d+\.\d–\d+\.\d% g$/)
    const credit = a.value.match(/with the corner credit (\d+\.\d)–(\d+\.\d)% g$/)!.slice(1).map(Number)
    expect(credit[0]).toBeCloseTo(v[0] * 0.8, 1)
    expect(credit[1]).toBeCloseTo(v[1] * 0.8, 1)
    expect(a.note).toMatch(/Corner credit R = 0\.80 \(chamfered corners, 0\.8 a team default/)
    expect(a.note).toMatch(/an inference, shown as a range and never as a pass/)
    // The state ignores the credit.
    const sq = importedTower(stack([{ n: 3, f2f: 4, ring: rect(90, 60), podium: true }, { n: 70, f2f: 4, ring: rect(50, 50, 17, 2) }]), { podiumTop: 12 })
    expect(a.state).toBe(rule(windProcedure(sq), 'across-wind-accel').state)
  })

  it('checks vortex shedding V = f1·B/St against the design winds at the top', () => {
    const r = windProcedure(vtc())
    const v = rule(r, 'vortex')
    const lo = vortexSpeed(f1Empirical(285).lower, r.w, 0.14)
    expect(v.value).toMatch(new RegExp(`^${lo.toFixed(0)}–\\d+ m/s against \\d+ m/s \\(10-year\\) and \\d+ m/s \\(50-year\\) at the top$`))
    const VH50 = speedOf(Q50) * Math.sqrt(ceRough(285))
    expect(v.state).toBe(lo < VH50 ? 'warn' : 'pass')
    expect(v.flag).toBe('verified')
  })

  it('keeps the old line for low buildings, where 46/H does not apply', () => {
    const low = windProcedure({ ...vtc(), height: 40, podiumHeight: 0 })
    expect(rule(low, 'f1')).toMatchObject({ value: 'no model frequency', state: 'unknown' })
    expect(low.rules.some((x) => x.id === 'across-wind-accel' || x.id === 'vortex')).toBe(false)
  })
})
