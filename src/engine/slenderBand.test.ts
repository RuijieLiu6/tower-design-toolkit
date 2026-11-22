import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { streetwallCheck, DEFAULT_PUBLIC_REALM } from './publicRealm'
import { SLENDER, slenderBand } from './slenderBand'
import { systemShortlist, windProcedure } from './windStructure'

describe('sourced slenderness bands (P1 #9)', () => {
  it('reads the base slenderness with KPF and CDDG in one line', () => {
    const b = slenderBand(299.2, 54)
    expect(b.ratio).toBeCloseTo(5.54, 2)
    expect(b.value.startsWith('5.54:1 (54 m): KPF efficient 5–6.67; CDDG ≥ 6')).toBe(true)
    expect(b.band).toBe('efficient')
    expect(b.state).toBe('pass')
    expect(b.risk).toBe(false)
  })

  it('checks at 8:1 or more and names the higher bands', () => {
    expect(slenderBand(7.99 * 30, 30).state).toBe('pass')
    expect(slenderBand(8 * 30, 30)).toMatchObject({ state: 'warn', band: 'damper' })
    expect(slenderBand(12 * 20, 20).band).toBe('damping')
    expect(slenderBand(16 * 20, 20).band).toBe('rare')
    expect(slenderBand(4 * 50, 50).band).toBe('stocky')
    expect(slenderBand(7 * 40, 40).band).toBe('slender')
  })

  it('names the KPF higher-risk band only with 244 m or more AND 8:1 or more', () => {
    const r = slenderBand(250, 30) // 8.33:1 at 250 m
    expect(r).toMatchObject({ risk: true, state: 'warn' })
    expect(r.value).toContain('KPF higher-risk band: 800 ft (244 m) or more and 8:1 or more')
    expect(slenderBand(240, 30).risk).toBe(false) // 8:1 but under 800 ft
    expect(slenderBand(300, 50).risk).toBe(false) // 800 ft but 6:1
    expect(SLENDER.riskHeight).toBeCloseTo(243.84)
  })

  it('cites the seismic RC examples and Allen & Iano, and marks designs outside the evidence', () => {
    const b = slenderBand(302, 50) // B35n: 6.04
    expect(b.note).toContain('pp.291, 416')
    expect(b.note).toContain('p.51')
    expect(b.note).toContain('pp.11, 32, 34')
    expect(b.specialist).toMatch(/seismic RC/)
    expect(slenderBand(300, 50).specialist).toBeUndefined() // A35n: 6.00, at the edge, inside
    expect(slenderBand(320, 60).specialist).toMatch(/304\.8 m/)
  })

  it('replaces the unsourced super-slender band in the wind procedure', () => {
    const t = { ...defaultTower('vtc'), height: 300, width: 30, depth: 40 }
    const w = windProcedure(t)
    const line = w.rules.find((r) => r.id === 'super-slender')!
    expect(line).toMatchObject({ state: 'warn', flag: 'unverified' })
    expect(line.source.label).toContain('KPF')
    expect(line.value.startsWith('10.00:1 (30 m)')).toBe(true)
    expect(line.specialist).toBeTruthy()
    const ok = windProcedure({ ...t, width: 50, depth: 50 }).rules.find((r) => r.id === 'super-slender')!
    expect(ok.state).toBe('pass')
  })

  it('keeps the CDDG meaning on the streetwall line and adds the upper Check', () => {
    const base = defaultTower('vtc')
    const at = (h: number, w: number) => streetwallCheck([{ ...base, height: h, width: w, depth: w }], DEFAULT_PUBLIC_REALM).rules.find((r) => r.id === `pr-slender-${base.id}`)!
    expect(at(270, 50).state).toBe('warn') // 5.4: under the CDDG tip
    expect(at(270, 50).note).toContain('5–6 answers the tip with efficiency')
    expect(at(300, 50).state).toBe('pass') // 6.0
    expect(at(300, 36).state).toBe('warn') // 8.3: KPF Check
    expect(at(300, 36).value).toContain('higher-risk')
  })

  it('cites BCBC 2024 Table 3.2.2.93 for encapsulated mass timber, with the base articles beside it', () => {
    const t = defaultTower('vtc')
    const timber = systemShortlist(t, windProcedure(t)).find((s) => s.id === 'timber')!
    expect(timber.fit).toBe('out')
    expect(timber.route).toContain('18 storeys / 76 m')
    expect(timber.route).toContain('12 storeys / 50 m')
    expect(timber.source.page).toContain('p.3-148')
  })
})
