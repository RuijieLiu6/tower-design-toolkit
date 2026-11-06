import { describe, expect, it } from 'vitest'
import { sectionDrawing } from './drawings'
import type { Tower } from './types'

describe('two primary sections (brief p.30 suggests two; run-through G6)', () => {
  it('B–B cuts at right angles to A–A, across the depth', () => {
    const t: Tower = { id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 30, height: 285, f2f: 4.2, podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.21, plantEvery: 0 }
    const o = { northDeg: 0, projectLabel: 'test', mode: 'tight' as const }
    const a = sectionDrawing(t, o), b = sectionDrawing(t, o, 'B')
    expect(a.title).toBe('Section A–A')
    expect(b.title).toBe('Section B–B')
    expect(b.svg).toContain('at right angles to A–A')
    expect(b.svg).not.toBe(a.svg)
    // The key plan marks B–B's cut ends with B, not A.
    const sheet = sectionDrawing(t, { ...o, mode: 'sheet' }, 'B').svg
    expect(sheet).toMatch(/>B</)
    expect(sheet).not.toMatch(/>A</)
  })
})
