import { describe, expect, it } from 'vitest'
import { qeFromCones } from './NatureLedger'

describe('QE Park cones from the view-cone results', () => {
  const r = (...states: [string, string][]) => [{ overall: 'x', checks: states.map(([id, state]) => ({ cone: { id }, state })) }]
  it('is true above a 3.2.x cone, null within its uncertainty, false otherwise, undefined without checks', () => {
    expect(qeFromCones(r(['3.2.3', 'above'], ['A', 'outside']))).toBe(true)
    expect(qeFromCones(r(['3.2.3', 'within_uncertainty']))).toBe(null)
    expect(qeFromCones(r(['3.2.3', 'below'], ['B1', 'above']))).toBe(false)
    expect(qeFromCones([{ overall: 'x' }])).toBeUndefined()
    expect(qeFromCones(null)).toBeUndefined()
  })
})
