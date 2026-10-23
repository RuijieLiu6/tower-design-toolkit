// Evaluation cases from 04 Tool Plan/mid-review/FIRST_ATTEMPT_SPEC.md (deterministic: no model in the loop).
import { describe, expect, it } from 'vitest'
import { CONES, checkFootprint, limitAt, overall } from './viewCones'

const square = (x: number, y: number, h = 1): [number, number][] => [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]
const cone = (id: string) => CONES.find((c) => c.id === id)!

describe('City data', () => {
  it('has 24 cones from 16 distinct origins', () => {
    expect(CONES.length).toBe(24)
    const origins = new Set(CONES.map((c) => c.ring[0].map((v) => Math.round(v)).join(',')))
    expect(origins.size).toBeGreaterThanOrEqual(15) // 3.2.2 differs from 3.2.1 by 0.33 m
  })
})

describe('Case 1: regression against the City site sheet (cone A, Robson/Cambie)', () => {
  it('reproduces 104.02 m at point A within 0.1 m', () => {
    expect(Math.abs((limitAt(cone('A'), [491613.46, 5458350.75]) as number) - 104.02)).toBeLessThan(0.1)
  })
})

describe('Case 3: inside 3.2.2 only -> must stop', () => {
  it('returns IN CONE: NO ESTIMATE at any height', () => {
    for (const top of [50, 150, 400]) {
      const checks = checkFootprint(square(491272.2, 5458589.7), top)
      const covering = checks.filter((c) => c.state !== 'outside' && c.state !== 'near_edge')
      expect(covering.map((c) => c.cone.id)).toEqual(['3.2.2'])
      expect(overall(checks)).toBe('limit_unknown')
    }
  })
})

describe('Case 4: inside 3.2.1 and D -> both no estimate', () => {
  it('flags both cones', () => {
    const checks = checkFootprint(square(491154.9, 5458001.8), 100)
    const ids = checks.filter((c) => c.state === 'limit_unknown').map((c) => c.cone.id).sort()
    expect(ids).toEqual(['3.2.1', 'D'])
  })
})

describe('Case 5: inside 3.2.3 only -> estimate 126.37 m', () => {
  it('estimates the limit and classifies around it', () => {
    const fp = square(491636.1, 5458755.9, 0.5)
    const at = checkFootprint(fp, 126.37).find((c) => c.cone.id === '3.2.3')!
    expect(at.limit).toBeCloseTo(126.37, 1)
    expect(at.state).toBe('within_uncertainty')
    expect(checkFootprint(fp, 140).find((c) => c.cone.id === '3.2.3')!.state).toBe('above')
    expect(checkFootprint(fp, 100).find((c) => c.cone.id === '3.2.3')!.state).toBe('clear')
  })
})

describe('Case 7: repeated runs are identical', () => {
  it('gives the same output five times', () => {
    const runs = Array.from({ length: 5 }, () => JSON.stringify(checkFootprint(square(491636.1, 5458755.9), 130).map((c) => [c.cone.id, c.state, c.limit])))
    expect(new Set(runs).size).toBe(1)
  })
})
