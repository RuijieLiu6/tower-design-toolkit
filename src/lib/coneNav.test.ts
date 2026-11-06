import { describe, expect, it } from 'vitest'
import { CONES } from '../engine/viewCones'
import { stepConeId } from './coneNav'

describe('Previous / Next through the protected views', () => {
  const list = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
  it('steps in the picker order and wraps at both ends', () => {
    expect(stepConeId('A', 1, list)).toBe('B')
    expect(stepConeId('C', 1, list)).toBe('A')
    expect(stepConeId('A', -1, list)).toBe('C')
  })
  it('from no protected view, Next is the first and Previous the last', () => {
    expect(stepConeId('', 1, list)).toBe('A')
    expect(stepConeId('', -1, list)).toBe('C')
  })
  it('visits every City view once in a full round', () => {
    const seen = new Set<string>()
    let id = ''
    for (let i = 0; i < CONES.length; i++) { id = stepConeId(id, 1); seen.add(id) }
    expect(seen.size).toBe(CONES.length)
    expect(stepConeId(id, 1)).toBe(CONES[0].id)
  })
})
