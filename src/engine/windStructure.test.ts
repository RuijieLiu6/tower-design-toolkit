import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import type { Tower } from './types'
import { WIND_FALSE_ASSUMPTIONS, systemShortlist, windProcedure, windStudyRules, windStudyTriggers } from './windStructure'

const base = (): Tower => ({ ...useStore.getInitialState().towers.vtc[0] })
const box = (height: number, side: number, patch: Partial<Tower> = {}): Tower => ({ ...base(), height, width: side, depth: side, podiumHeight: 0, ...patch })
const rule = (r: ReturnType<typeof windProcedure>, id: string) => r.rules.find((x) => x.id === id)!

describe('wind procedure from slenderness (P10-M02)', () => {
  it('the default competition tower: over 60 m, and slender enough (H/w > 6) for the mandatory Wind Tunnel Procedure', () => {
    const r = windProcedure(base())
    // Effective width is height-weighted: 267 m of 46 m tower plate and 18 m of podium (64 m across its short side).
    expect(r.w).toBeCloseTo((267 * 46 + 18 * 64) / 285, 1)
    expect(r.aspect).toBeGreaterThan(6)
    expect(rule(r, 'height-60').state).toBe('warn')
    expect(rule(r, 'aspect').state).toBe('fail')
    expect(r.procedure).toBe('tunnel')
    expect(r.trigger).toMatch(/slenderness over 6/)
  })
  it('a stockier 150 m tower is dynamically sensitive but not tunnel-bound by slenderness', () => {
    const r = windProcedure(box(150, 40))
    expect(r.aspect).toBeCloseTo(3.75, 2)
    expect(rule(r, 'aspect').state).toBe('pass')
    expect(rule(r, 'f1').state).toBe('unknown') // under the 180 m default, no model frequency
    expect(r.procedure).toBe('dynamic')
  })
  it('uses the engineer’s model frequency when there is one, and the team default otherwise', () => {
    expect(windProcedure(box(200, 60)).procedure).toBe('tunnel') // 200 m ≥ 180 m and no f1
    expect(windProcedure(box(200, 60), { tunnelDefaultHeight: 180, f1: 0.4 }).procedure).toBe('dynamic')
    expect(windProcedure(box(200, 60), { tunnelDefaultHeight: 180, f1: 0.2 }).trigger).toMatch(/0\.25 Hz/)
  })
  it('finds the true minimum width for a rotated tower', () => {
    expect(windProcedure(box(200, 40, { rotation: 37 })).w).toBeCloseTo(40, 6)
    expect(windProcedure(box(200, 40, { width: 30, depth: 50, rotation: 12 })).w).toBeCloseTo(30, 6)
  })
  it('flags across-wind dominance below 1/3', () => {
    expect(rule(windProcedure(box(285, 46)), 'across-wind').state).toBe('warn')
    expect(rule(windProcedure(box(100, 40)), 'across-wind').state).toBe('pass')
  })
  it('keeps the corrected Strouhal assumption visible', () => {
    expect(WIND_FALSE_ASSUMPTIONS[0].correction).toMatch(/1\/7/)
  })
})

describe('lateral system shortlist (P10-M01)', () => {
  it('never picks one best; rules capped systems out above their SC4 height limits', () => {
    const t = base()
    const s = Object.fromEntries(systemShortlist(t, windProcedure(t)).map((x) => [x.id, x.fit]))
    expect(s['md-walls']).toBe('out') // 60 m cap
    expect(s.brbf).toBe('out') // 40 m cap
    expect(s.timber).toBe('out')
    expect(s['core-walls']).toBe('shortlist') // 67 storeys, within the ~70-storey precedent envelope
    expect(s.outriggers).toBe('shortlist') // slender: perimeter engagement
    expect(s['steel-mrf']).toBe('check')
    expect(s.diagrid).toBe('check')
    expect(Object.values(s).filter((f) => f === 'shortlist').length).toBeGreaterThan(1)
  })
})

describe('pedestrian wind-study triggers (P03-M02)', () => {
  it('every analog city asks for a tunnel study at 244–305 m; Vancouver has no numeric trigger', () => {
    const t = Object.fromEntries(windStudyTriggers(285).map((x) => [x.id, x]))
    expect(t.toronto.level).toMatch(/wind-tunnel/)
    expect(t.hamilton.level).toMatch(/wind-tunnel/)
    expect(t.london.level).toMatch(/Tunnel or CFD/)
    expect(t.vancouver).toMatchObject({ state: 'unknown', flag: 'unresolved' })
  })
  it('does not invent bands the research did not extract', () => {
    const t = Object.fromEntries(windStudyTriggers(80).map((x) => [x.id, x]))
    expect(t.toronto.level).toMatch(/read Table 1/)
    expect(t.toronto.state).toBe('unknown')
    expect(t.london.state).toBe('unknown')
  })
  it('labels every output as analog criteria', () => {
    for (const r of windStudyRules(285)) expect(r.note).toMatch(/analog \(team assumption\)/)
  })
})
