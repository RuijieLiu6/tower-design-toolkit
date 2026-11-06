import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { DESIGN_TOOLS } from './tools/registry'
import { NODE_WORDS, nodeWord } from './NodeBar'
import { shortName } from './tools/ToolPanel'

// Ruijie, 6 Nov: tools and checks show an icon with one or two key words under it; the full name and what it does on
// hover. The words must stay short enough to read under an icon, and a tool's word must be part of its full name, so
// the visible text is in the accessible name (WCAG 2.5.3, voice control: "click Place").
describe('key words under the icons', () => {
  it('every design tool has one or two short words, found in its full name', () => {
    for (const t of DESIGN_TOOLS) {
      const word = shortName(t) // `short`, or the label when it is already one or two words
      expect(word.split(/\s+/).length, t.id).toBeLessThanOrEqual(2)
      expect(word.length, t.id).toBeLessThanOrEqual(11)
      expect(t.label.toLowerCase(), t.id).toContain(word.toLowerCase())
    }
  })
  it('every built check has a word of one or two words under its icon in the bottom bar', () => {
    for (const n of BUILT_NODES) {
      expect(NODE_WORDS[n.id], n.id).toBeTruthy()
      expect(NODE_WORDS[n.id].split(/\s+/).length, n.id).toBeLessThanOrEqual(2)
      expect(NODE_WORDS[n.id].length, n.id).toBeLessThanOrEqual(12)
    }
  })
  it('a community node without a word of its own shows the first word of its name', () => {
    expect(nodeWord({ id: 'community.x', name: 'Noise: road traffic' })).toBe('Noise')
    expect(nodeWord({ id: 'community.y', name: 'Embodied carbon & reuse' })).toBe('Embodied')
  })
})
