// Every built design node has its illustration (one family, icons/nodeArt.tsx) and a short visible name (Ruijie, 7 Nov).
import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../../data/registry'
import { NODE_WORDS } from '../../data/nodeWords'
import { hasNodeArt } from './nodeArt'

describe('design-node illustrations', () => {
  it('every built node has a drawing and a short name', () => {
    for (const n of BUILT_NODES) {
      expect(hasNodeArt(n.id), n.id).toBe(true)
      expect(NODE_WORDS[n.id], n.id).toBeTruthy()
    }
  })
})
