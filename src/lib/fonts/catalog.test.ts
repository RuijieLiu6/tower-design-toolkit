import { describe, expect, it } from 'vitest'
import { BUILTIN_FONTS, DEFAULT_FAMILY, fontStack } from './catalog'
import { missingFamilies, resolveFamily } from './fontStore'
import { familiesUsed, newBoard } from '../../engine/boards'

// The built-in set ships offline with its licences; a family a board names that this browser lacks falls back to Inter.
describe('the board fonts', () => {
  it('ships Inter and four more open-licence faces, each with a licence file beside it', () => {
    expect(BUILTIN_FONTS.map((f) => f.family)).toEqual(['Inter Variable', 'IBM Plex Sans', 'Lora', 'IBM Plex Mono', 'Barlow Condensed'])
    for (const f of BUILTIN_FONTS) { expect(f.licence).toBe('SIL OFL 1.1'); expect(f.licenceFile).toMatch(/^fonts\/.+\/LICENSE\.txt$/) }
    expect(new Set(BUILTIN_FONTS.map((f) => f.kind)).size).toBeGreaterThanOrEqual(4)
  })
  it('builds a stack with Inter and the system behind the family', () => {
    expect(fontStack('Lora')).toBe('"Lora", "Inter Variable", "Inter", "Segoe UI", system-ui, -apple-system, serif')
    expect(fontStack('Inter Variable')).toMatch(/^"Inter Variable", "Inter"/)
    expect(fontStack('My "odd" font')).toMatch(/^"My odd font", /)
  })
  it('falls back to Inter for a family that is not here, and names the missing ones', () => {
    const have = (f: string) => f === 'Lora' || f === DEFAULT_FAMILY
    expect(resolveFamily('Lora', have)).toBe('Lora')
    expect(resolveFamily('Gone Sans', have)).toBe(DEFAULT_FAMILY)
    expect(resolveFamily(undefined, have)).toBe(DEFAULT_FAMILY)
    expect(missingFamilies(['Lora', 'Gone Sans', 'Gone Sans', 'Inter Variable'], have)).toEqual(['Gone Sans'])
  })
  it('lists every family a board names: the pair first, then each frame\'s own', () => {
    const b = newBoard(0)
    b.frames[1].content = { kind: 'text', text: 'Notes', sizeMm: 4, font: 'IBM Plex Mono' }
    expect(familiesUsed(b, { heading: 'Barlow Condensed', body: 'Lora' })).toEqual(['Barlow Condensed', 'Lora', 'IBM Plex Mono'])
    expect(familiesUsed(newBoard(1), { heading: 'Lora', body: 'Lora' })).toEqual(['Lora'])
  })
})
