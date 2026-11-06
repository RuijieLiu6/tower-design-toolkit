import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { basementDepth, basementLevels, basementRing, basementSummary, groundThickness, GROUND_MIN_THICKNESS, RAMP_SLOPE, RAMP_TRANSITIONS } from './basement'
import { gfaByUse, towerFloors } from './massing'

const withB = (levels: number, extra = {}) => ({ ...defaultTower('vtc'), basement: { levels, f2f: 3.2, use: 'parking' as const, extent: 'podium' as const, ...extra } })

describe('below grade: basements dug into a thick ground', () => {
  it('levels go down from the tower base, B1 first, under the podium\'s footprint', () => {
    const t = withB(3)
    const L = basementLevels(t)
    expect(L.map((l) => l.name)).toEqual(['B1', 'B2', 'B3'])
    expect(L[0]).toMatchObject({ z0: -3.2, z1: -0 })
    expect(L[2].z0).toBeCloseTo(-9.6, 6)
    expect(L[0].area).toBeCloseTo(100 * 64, 0) // the competition tower's podium, 100 × 64 m
    expect(basementDepth(t)).toBeCloseTo(9.6, 6)
  })
  it('the ground is never thinner than 30 m, and always 10 m below the deepest basement', () => {
    expect(groundThickness([defaultTower('vtc')])).toBe(GROUND_MIN_THICKNESS)
    expect(groundThickness([withB(8, { f2f: 4.5 })])).toBeCloseTo(46, 6)
  })
  it('basements never count as floor area above grade', () => {
    const plain = defaultTower('vtc')
    expect(gfaByUse([withB(4)])).toEqual(gfaByUse([plain]))
    expect(towerFloors(withB(4)).every((f) => f.z0 >= 0)).toBe(true)
  })
  it('parking, the ramp and whether it fits; the tower extent digs only under the tower', () => {
    const s = basementSummary(withB(2))!
    expect(s.stalls).toBe(Math.floor((2 * 6400) / 30))
    expect(s.rampLength).toBeCloseTo(6.4 / RAMP_SLOPE + RAMP_TRANSITIONS, 6)
    expect(s.rules.find((r) => r.id === 'basement-ramp')?.state).toBe('pass')
    expect(s.rules.every((r) => r.flag === 'team_assumption')).toBe(true)
    const small = basementSummary(withB(8, { extent: 'tower' }))!
    expect(basementRing(withB(1, { extent: 'tower' })).length).toBe(4)
    expect(small.areaPerLevel).toBeCloseTo(46 * 46, 0)
    expect(small.rules.find((r) => r.id === 'basement-ramp')?.state).toBe('warn') // 25.6 m deep: a 213 m ramp on a 46 m side
    expect(basementSummary(defaultTower('vtc'))).toBeNull()
  })
})
