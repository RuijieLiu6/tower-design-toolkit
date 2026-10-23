import { describe, expect, it } from 'vitest'
import { towerFloors } from './massing'
import type { Tower } from './types'
import { SITE, fsrSummary, vtcRules } from './vtcRules'

const base: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 270, f2f: 4,
  podiumHeight: 18, podiumWidth: 120, podiumDepth: 70, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.6 }, { use: 'hotel', share: 0.15 }, { use: 'residential', share: 0.25 }],
  coreShare: 0.25, plantEvery: 0,
}

describe('massing', () => {
  it('allocates every tower floor to a band and stacks without gaps', () => {
    const f = towerFloors(base)
    const tower = f.filter((x) => !x.podium)
    expect(tower.length).toBe(Math.floor((270 - 18) / 4))
    for (let i = 1; i < f.length; i++) expect(f[i].z0).toBeCloseTo(f[i - 1].z1, 6)
  })
})

describe('plant floors (Schematic)', () => {
  it('turns every Nth tower floor into mechanical without changing the floor count', () => {
    const plain = towerFloors(base)
    const withPlant = towerFloors({ ...base, plantEvery: 20 })
    expect(withPlant.length).toBe(plain.length)
    const towerOnly = withPlant.filter((f) => !f.podium)
    expect(towerOnly.filter((f) => f.use === 'mechanical').length).toBe(Math.floor(towerOnly.length / 20))
  })
})

describe('VTC rules', () => {
  it('passes a 270 m tower and fails a 200 m tower on height', () => {
    expect(vtcRules([base], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'height-t1')!.state).toBe('pass')
    expect(vtcRules([{ ...base, height: 200 }], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'height-t1')!.state).toBe('fail')
  })
  it('warns when a height passes in one unit only (304.9 m)', () => {
    expect(vtcRules([{ ...base, height: 304.9 }], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'height-t1')!.state).toBe('warn')
  })
  it('computes FSR on the brief site area', () => {
    const s = fsrSummary([base])
    expect(s.total / SITE.area).toBeCloseTo(s.totalFsr, 6)
    expect(s.tier1).toBeLessThanOrEqual(s.tier2)
    expect(s.tier2).toBeLessThanOrEqual(s.tier3)
  })
  it('fails containment when a tower leaves the block', () => {
    expect(vtcRules([{ ...base, x: 70 }], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'containment')!.state).toBe('fail')
  })
})
