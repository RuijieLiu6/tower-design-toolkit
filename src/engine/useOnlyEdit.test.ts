// A use-only edit must not change the floor area or the FSR (overnight brief, 8 Nov, F05: "A use-only edit must not
// change GFA/FSR unless its area inputs change"). A band's floor-to-floor comes from the band or the tower, never from its
// use (engine/blocks.ts bandF2f), so changing what a band is used for moves area between uses and leaves the total, the
// floor count and the FSR as they were; the non-residential tiers move with the use, as they should. Changing a band's
// share (an area input) does change how the floors split, and an explicit floor height changes the floor count.
import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { gfaByUse, towerFloors } from './massing'
import { USES, type UseId } from './types'
import { fsrSummary } from './vtcRules'

const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

describe('a use-only band edit', () => {
  const t = defaultTower('vtc')
  const base = fsrSummary([t])
  it.each(Object.keys(USES) as UseId[])('changing band 1 to %s keeps every floor, the total GFA and the total FSR', (use) => {
    const edited = { ...t, bands: t.bands.map((b, i) => (i === 0 ? { ...b, use } : b)) }
    const a = towerFloors(t), b = towerFloors(edited)
    expect(b.length).toBe(a.length)
    expect(b.map((f) => [f.z0, f.z1, f.area])).toEqual(a.map((f) => [f.z0, f.z1, f.area]))
    const s = fsrSummary([edited])
    expect(s.total).toBeCloseTo(base.total, 6)
    expect(s.totalFsr).toBeCloseTo(base.totalFsr, 9)
    expect(total(gfaByUse([edited]))).toBeCloseTo(total(gfaByUse([t])), 6)
  })
  it('moves area between uses, so the non-residential tiers follow the use', () => {
    const i = t.bands.findIndex((b) => b.use === 'office')
    expect(i).toBeGreaterThanOrEqual(0)
    const edited = { ...t, bands: t.bands.map((b, k) => (k === i ? { ...b, use: 'residential' as UseId } : b)) }
    const before = gfaByUse([t]), after = gfaByUse([edited])
    expect(after.office).toBeLessThan(before.office)
    expect(after.residential).toBeGreaterThan(before.residential)
    expect(fsrSummary([edited]).tier1).toBeLessThan(base.tier1)
  })
  it('an area input (a band floor height) is what changes the floor count', () => {
    const edited = { ...t, bands: t.bands.map((b, i) => (i === 0 ? { ...b, f2f: (t.f2f || 4) * 1.5 } : b)) }
    expect(towerFloors(edited).length).toBeLessThan(towerFloors(t).length)
  })
})
