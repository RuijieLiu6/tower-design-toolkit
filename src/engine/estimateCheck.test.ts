import { describe, expect, it } from 'vitest'
import { defaultTower, useStore } from '../store'
import { estimateLines, estimateRows } from './estimateCheck'
import { fsrSummary, SITE } from './vtcRules'
import { interiorCheck } from './interior'
import { towerFloors } from './massing'
import { evidenceGroups } from '../lib/evidence/engines'
import type { RuleResult } from './types'

describe('estimates against the engine (G81)', () => {
  const t = defaultTower('vtc')
  const fsr = fsrSummary([t])
  const homes = interiorCheck(t, towerFloors(t)).totals.homes
  const e = { by: 'hand study', nonResFsr: 5, homes: 100, gfa: 50000, height: 200, homeM2: 75, efficiency: 0.8 }

  it('puts each estimate beside the engine reading of the same model', () => {
    const rows = estimateRows(t, e)
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by['estimate-fsr'].engine).toBeCloseTo(fsr.tier2, 9)
    expect(by['estimate-fsr'].diff).toBeCloseTo(fsr.tier2 - 5, 9)
    expect(by['estimate-gfa'].engine).toBeCloseTo(fsr.total, 6)
    expect(by['estimate-height'].engine).toBe(t.height)
    expect(by['estimate-homes'].engine).toBe(homes)
  })

  it('splits the homes gap into counting and area, which add up to the whole gap', () => {
    const h = estimateRows(t, e).find((r) => r.id === 'estimate-homes')!
    expect(h.split!.ruleOnEngine).toBeCloseTo((fsr.gfa.residential * 0.8) / 75, 9)
    expect(h.split!.counting + h.split!.area).toBeCloseTo(h.diff, 9)
    expect(estimateRows(t, { homes: 100 })[0].split).toBeUndefined()
  })

  it('leaves the FSR row out with no site area, and gives reported lines', () => {
    expect(estimateRows(t, e, null).some((r) => r.id === 'estimate-fsr')).toBe(false)
    const lines = estimateLines(t, e)
    expect(lines).toHaveLength(4)
    for (const l of lines) expect(l.state).toBe('unknown')
    expect(estimateLines(t, undefined)).toEqual([])
    expect(SITE.area).toBeGreaterThan(0)
  })

  it('reaches the evidence (and so any run that walks it) when the tower carries estimates', () => {
    const s = useStore.getState()
    const g = evidenceGroups({ project: 'vtc', towers: [{ ...t, estimates: e }], fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null } })
    const ids = (g['built.vtc-rules'] as RuleResult[]).map((r) => r.id)
    expect(ids).toContain('estimate-homes')
    expect(ids).toContain('estimate-fsr')
  })
})
