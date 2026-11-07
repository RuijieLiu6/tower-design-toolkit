import { describe, expect, it } from 'vitest'
import { DEFAULT_NATURE, cityInNature } from '../engine/cityInNature'
import { ringMetrics } from '../engine/site'
import { SITE } from '../engine/vtcRules'
import { defaultTower } from '../store'
import { DEFAULT_CITY_SITE } from './defaultSite'
import { layer0Summary } from './layer0Summary'
import { projectSiteArea, siteAreaNote } from './siteArea'

// Node audit (7 Nov): on Real Vancouver the study site's area was known but City in Nature, the Exceptional Downtown
// Site test and the land value still said "needs a site area".
const study = { area: ringMetrics(DEFAULT_CITY_SITE.ring).area, basis: 'boundary' as const, source: 'Drawn study boundary', flag: 'team_assumption' as const }

describe('the site area every check reads', () => {
  it('is the competition block on the competition site, from the brief', () => {
    const a = projectSiteArea('vtc', study)
    expect(a.area).toBeCloseTo(SITE.area, 6)
    expect(a.flag).toBe('verified')
    expect(a.source).toMatch(/p\.15/)
  })
  it('is the study site on Real Vancouver, with its source and flag', () => {
    const a = projectSiteArea('city', study)
    expect(a.area).toBeCloseTo(11224.7, 0)
    expect(a.flag).toBe('team_assumption')
    expect(siteAreaNote(a)).toMatch(/^Site 11,225 m² \(the study site boundary; Drawn study boundary\)\.$/)
  })
  it('falls back to the study site boundary until the Site step has worked out its area', () => {
    const a = projectSiteArea('city', null, DEFAULT_CITY_SITE)
    expect(a.area).toBeCloseTo(11224.7, 0)
    expect(a.basis).toBe('boundary')
    expect(a.flag).toBe('team_assumption')
    expect(a.source).toMatch(/not a legal parcel/)
    expect(projectSiteArea('city', null, { ...DEFAULT_CITY_SITE, ring: [[0, 0], [1, 0]] }).area).toBeNull()
  })
  it('stays unknown, and says why, before a study site is chosen', () => {
    const a = projectSiteArea('city', null)
    expect(a.area).toBeNull()
    expect(a.flag).toBe('unresolved')
    expect(siteAreaNote(a)).toMatch(/Site step/)
  })

  it('lets City in Nature work out its site shares on the default Real Vancouver site', () => {
    const before = cityInNature(DEFAULT_NATURE, null, null)
    const after = cityInNature(DEFAULT_NATURE, study.area, null)
    const needs = (r: typeof before) => r.rows.filter((x) => /needs a site area/.test(String(x.value))).map((x) => x.id)
    expect(needs(before).length).toBeGreaterThan(3)
    expect(needs(after)).toEqual([])
    // The default site is over the 8,000 m² Exceptional Downtown Site size (PVG 3.4.1).
    expect(after.rows.find((x) => x.id === 'eds-eligible')?.value).toBe('11,225 m²')
  })

  it('gives community nodes the study area and FSR on Real Vancouver', () => {
    const towers = [defaultTower('city', [254, 486.1])]
    const sum = layer0Summary({ project: 'city', towers, sun: { month: 9, day: 22, hour: 12 }, groundElevation: 23, studyArea: study.area })
    expect(sum.project.siteArea).toBeCloseTo(study.area, 6)
    expect(sum.project.fsr).toBeCloseTo((sum.project.gfa as number) / study.area, 6)
    const none = layer0Summary({ project: 'city', towers, sun: { month: 9, day: 22, hour: 12 }, groundElevation: 23 })
    expect(none.project.siteArea).toBeNull()
  })
})
