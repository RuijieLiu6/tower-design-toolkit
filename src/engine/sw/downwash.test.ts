import { describe, expect, it } from 'vitest'
import type { Tower } from '../types'
import { DOWNWASH_TEAM, downwashReading, downwashReliefText } from './downwash'
import { ALPHA } from './wind'

// G40 (ground-wind review R4-6): "Wind brought down the face" read the height alone, so every tower in the 244–305 m
// band failed it whatever its podium. It now reads the podium step toward the strong winds and a canopy (team factor).
const base: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 270, f2f: 4,
  podiumHeight: 18, podiumWidth: 40, podiumDepth: 40, podiumUse: 'retail',
  bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0,
}
const U10 = 4

describe('G40: downwash reads the podium step and a canopy', () => {
  it('with no podium step and no canopy keeps the height-only value', () => {
    const r = downwashReading(base, 270, U10, { north: 45 })
    expect(r.value).toBeCloseTo(U10 * Math.pow(189 / 10, ALPHA), 9)
    expect(r.factor).toBe(1)
    expect(downwashReliefText(r)).toBe('')
    // no podium at all: the same
    expect(downwashReading({ ...base, podiumHeight: 0 }, 270, U10, { north: 45 }).value).toBeCloseTo(r.raw, 9)
  })
  it('a tower with a 15 m podium step toward the dominant sector reads less than the same tower with none', () => {
    const none = downwashReading(base, 270, U10, { north: 45 })
    const stepped = downwashReading({ ...base, podiumWidth: 70, podiumDepth: 70 }, 270, U10, { north: 45 })
    expect(stepped.sectors.length).toBeGreaterThan(0)
    for (const s of stepped.sectors) expect(s.step).toBeGreaterThanOrEqual(15 - 1e-6)
    expect(stepped.value).toBeLessThan(none.value)
    expect(stepped.podiumRelief).toBeCloseTo(DOWNWASH_TEAM.podiumMax, 9)
    expect(stepped.value).toBeCloseTo(none.value * (1 - DOWNWASH_TEAM.podiumMax), 9)
    expect(downwashReliefText(stepped)).toMatch(/podium step toward the strong winds .*15\.0 m.*−40%/)
  })
  it('a step under the screen minimum (3 m) takes nothing off; a canopy does', () => {
    const small = downwashReading({ ...base, podiumWidth: 44, podiumDepth: 44 }, 270, U10, { north: 45 })
    expect(small.factor).toBe(1)
    const canopy = downwashReading(base, 270, U10, { north: 45, canopy: 6 })
    expect(canopy.value).toBeCloseTo(canopy.raw * (1 - DOWNWASH_TEAM.canopyMax), 9)
    expect(downwashReliefText(canopy)).toBe('canopy 6.0 m deep: −20%')
  })
  it('a podium stepped toward one side only relieves the sectors it faces', () => {
    // podium pushed out on one side only: the step faces some sectors and not others
    const oneSide = downwashReading({ ...base, podiumWidth: 70, podiumDepth: 40, x: 0 }, 270, U10, { north: 0 })
    const full = downwashReading({ ...base, podiumWidth: 70, podiumDepth: 70 }, 270, U10, { north: 0 })
    expect(oneSide.value).toBeLessThan(oneSide.raw)
    expect(oneSide.value).toBeGreaterThanOrEqual(full.value - 1e-9)
  })
})
