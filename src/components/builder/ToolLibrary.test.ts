// The library's own words and tile states (the lists themselves are builderModel's, tested there).
import { describe, expect, it } from 'vitest'
import { availabilityWords, tileState } from './ToolLibrary'
import { libraryEntries } from '../../lib/workflow/builderModel'
import { ALL_NODES } from '../../data/registry'

describe('ToolLibrary', () => {
  it('keeps availability apart from results: one word each, never a pass', () => {
    for (const a of ['available', 'preview', 'custom', 'missing', 'research'] as const) {
      const w = availabilityWords({ availability: a })
      expect(w.word.length).toBeGreaterThan(0)
      expect(w.detail).not.toMatch(/\bpass\b/i)
    }
    expect(availabilityWords({ availability: 'missing' }).word).toBe('Missing tool')
    expect(availabilityWords({ availability: 'research' }).word).toBe('Not runnable')
  })

  it('tiles: on in the workflow, soft when available here, off otherwise', () => {
    expect(tileState({ inWorkflow: true, availability: 'available' }, true)).toBe('on')
    expect(tileState({ inWorkflow: false, availability: 'available' }, true)).toBe('soft')
    expect(tileState({ inWorkflow: false, availability: 'available' }, false)).toBe('off')
    expect(tileState({ inWorkflow: false, availability: 'missing' }, true)).toBe('off')
    expect(tileState({ inWorkflow: false, availability: 'research' }, true)).toBe('off')
  })

  it('lists the design steps before the checks, and research only in its own section', () => {
    const lib = libraryEntries({ board: { nodes: ['community.gone'], edges: [] }, packages: [], research: ALL_NODES })
    const firstCheck = lib.available.findIndex((e) => e.kind === 'check')
    expect(lib.available.slice(0, firstCheck).every((e) => e.kind === 'design')).toBe(true)
    expect(lib.available.some((e) => e.availability === 'research')).toBe(false)
    expect(lib.research.every((e) => e.availability === 'research')).toBe(true)
    expect(lib.mine.find((e) => e.id === 'community.gone')?.availability).toBe('missing')
  })
})
