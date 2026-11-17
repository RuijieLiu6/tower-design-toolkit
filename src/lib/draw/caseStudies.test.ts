import { describe, expect, it } from 'vitest'
import { CASE_STUDIES, caseStudyPatch } from './caseStudies'

// Each case-study row is verified only with a source (a URL and the date it was read) that confirms its height and
// storeys; a row with no source stays unverified. The plate and podium are approximate in every row.
describe('the case-study towers', () => {
  it('every row has a source and is verified, or stays unverified', () => {
    for (const c of CASE_STUDIES) {
      if (c.source) {
        expect(c.flag, c.name).toBe('verified')
        expect(c.source.url, c.name).toMatch(/^https:\/\/\S+$/)
        expect(c.source.accessed, c.name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(c.source.what, c.name).toBeTruthy()
      } else expect(c.flag, c.name).toBe('unverified')
    }
  })
  it('the known buildings carry the CTBUH Skyscraper Center page; the type has none', () => {
    const named = CASE_STUDIES.filter((c) => c.id !== 'vancouver-point-tower')
    expect(named).toHaveLength(8)
    for (const c of named) expect(c.source?.url, c.name).toContain('skyscrapercenter.com/building/')
    const type = CASE_STUDIES.find((c) => c.id === 'vancouver-point-tower')!
    expect(type.flag).toBe('unverified')
    expect(type.source).toBeUndefined()
  })
  it('a corrected number says what it was', () => {
    const vh = CASE_STUDIES.find((c) => c.id === 'vancouver-house')!
    expect(vh).toMatchObject({ height: 155.6, storeys: 52 })
    expect(vh.changed).toMatch(/150 m, 59 storeys/)
  })
  it('places a tower with the row\'s height and a floor-to-floor that gives its storeys', () => {
    for (const c of CASE_STUDIES) {
      const p = caseStudyPatch(c)
      expect(p.height).toBe(c.height)
      expect(p.f2f).toBeGreaterThan(2.5)
      expect(p.f2f).toBeLessThan(6)
    }
  })
})
