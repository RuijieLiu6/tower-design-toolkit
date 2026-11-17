import { describe, expect, it } from 'vitest'
import { countByPhase } from './phaseCounts'
import type { PhaseId } from '../phases'
import type { ResultLine } from '../trace/digest'

// Line ids of custom tools name their node after the last colon (lib/options.ts nodeOfLine), so the test needs no registry.
const line = (node: string, state: ResultLine['state']): ResultLine => ({ id: `community:${node}:${node}`, state } as ResultLine)
const home = (id: string): PhaseId => (id === 'community.a' ? 'form' : id === 'community.b' ? 'program' : 'present')

// The compact phase list carries each phase's fail and check counts (Ruijie, 17 Nov), summed from the live digest.
describe('fail and check counts per phase', () => {
  it('sums each node\'s lines into its home phase, for the nodes that are on', () => {
    const d = { lines: [line('community.a', 'fail'), line('community.a', 'warn'), line('community.a', 'pass'), line('community.b', 'warn'), line('community.c', 'fail'), line('community.off', 'fail')] }
    const c = countByPhase(d, { 'community.a': true, 'community.b': true, 'community.c': true }, home)
    expect(c.form).toEqual({ pass: 1, warn: 1, fail: 1, unknown: 0 })
    expect(c.program).toEqual({ pass: 0, warn: 1, fail: 0, unknown: 0 })
    expect(c.present).toEqual({ pass: 0, warn: 0, fail: 1, unknown: 0 })
    expect(c.site).toBeUndefined()
  })
  it('is empty with no lines', () => {
    expect(countByPhase({ lines: [] }, {}, home)).toEqual({})
  })
})
