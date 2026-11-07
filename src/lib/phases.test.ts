// The phases a workflow runs through (7 Nov): every built node in exactly one phase, and every preset's first phase.
import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { firstPhase, PHASES } from './phases'
import { USER_TYPES } from './userTypes'

describe('workflow phases', () => {
  it('five phases on the guided steps, every built node in exactly one', () => {
    expect(PHASES.map((p) => p.step)).toEqual(['site', 'volume', 'program', 'plates', 'frame'])
    for (const n of BUILT_NODES) expect(PHASES.filter((p) => p.nodes.includes(n.id)).length, n.id).toBe(1)
    for (const p of PHASES) for (const id of p.nodes) expect(BUILT_NODES.some((n) => n.id === id), id).toBe(true)
  })

  it('a workflow opens on its first phase with a node', () => {
    expect(firstPhase(['built.energy-carbon', 'built.sun']).id).toBe('form')
    expect(firstPhase([]).id).toBe('site')
    for (const t of USER_TYPES) for (const p of t.presets) expect(firstPhase(p.nodes)).toBeDefined()
  })
})
