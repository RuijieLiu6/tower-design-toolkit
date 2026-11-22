import { describe, expect, it } from 'vitest'
import { ALL_BUILT_NODES, CONFIDENCE_LABEL } from './registry'

// Node contract (21 Nov): every node may say how far its method can be trusted (confidence A/B/C) and when it stops
// being reliable (boundary). Where a node says one, it must say both, and the boundary must be a plain sentence.
describe('node contract: confidence and boundary', () => {
  it('pairs confidence with a boundary sentence wherever either is given', () => {
    for (const n of ALL_BUILT_NODES) {
      if (n.confidence === undefined && n.boundary === undefined) continue
      expect(n.confidence, `${n.id} has a boundary but no confidence`).toBeDefined()
      expect(Object.keys(CONFIDENCE_LABEL)).toContain(n.confidence)
      expect(n.boundary && n.boundary.trim().length > 20, `${n.id} needs a boundary sentence`).toBe(true)
    }
  })
})
