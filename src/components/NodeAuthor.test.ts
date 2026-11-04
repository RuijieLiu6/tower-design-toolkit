import { describe, expect, it } from 'vitest'
import { validatePackage } from '../lib/nodeValidate'
import { packageFromForm } from './NodeAuthor'

const base = {
  name: 'Office facade-to-core depth', question: 'Is every office desk close enough to the facade for daylight?', category: 'SPAC' as const, stage: 'massing' as const,
  author: 'Ruijie Liu', licence: 'CC-BY-4.0', method: 'Half the plate width minus half the core side.', human: 'Whether deep zones suit their uses.', limits: 'A square centred core is assumed.',
  tests: true,
}
const metric = {
  label: 'Facade-to-core depth', unit: 'm', per: 'tower' as const, expression: '(tower.minSide - sqrt(tower.coreArea)) / 2', decimals: '1',
  direction: 'lower_is_better' as const, good: '12', bad: '15', flag: 'team_assumption' as const, source: 'Team assumption: studio rule of thumb', page: '', url: '',
}

describe('Make it here: a node built in the form (Phase 1 #1)', () => {
  it('becomes a valid tower-studio-node@1 package whose own tests pass on the sample designs', () => {
    const pkg = packageFromForm({ ...base, metrics: [metric] })
    expect(pkg.id).toBe('community.ruijie-liu.office-facade-to-core-depth')
    expect(pkg.inputs).toEqual(['tower.coreArea', 'tower.minSide'])
    expect(pkg.tests?.length).toBeGreaterThan(0)
    const report = validatePackage(JSON.parse(JSON.stringify(pkg)))
    expect(report.problems.filter((p) => p.level === 'error')).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.tests.every((t) => t.ok)).toBe(true)
  })

  it('an information-only metric needs no good or bad; ranges parse as [low, high]', () => {
    const pkg = packageFromForm({ ...base, tests: false, metrics: [{ ...metric, direction: 'info', flag: 'unresolved', source: '' }, { ...metric, label: 'Plate depth range', direction: 'range', good: '6-12', bad: '' }] })
    expect(pkg.metrics[0].threshold).toEqual({ direction: 'info', flag: 'unresolved', source: { label: 'No source yet' } })
    expect(pkg.metrics[1].threshold.good).toEqual([6, 12])
    expect(pkg.metrics[1].id).toBe('plate_depth_range')
    expect(validatePackage(JSON.parse(JSON.stringify(pkg))).problems.filter((p) => p.level === 'error')).toEqual([])
  })
})
