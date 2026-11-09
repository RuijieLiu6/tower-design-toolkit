// The Higher Buildings dataset and the item's state: what the data must carry (sources, dates, basis, accuracy,
// stable IDs, a declared CRS), the policy facts it must reproduce, and that the layer's settings touch nothing else.
import { describe, expect, it } from 'vitest'
import data from '../data/higherBuildings.json'
import defaultSite from '../data/defaultSite.json'
import fixture from './testdata/higherBuildingsSites.json'
import { validateRing, type Pt } from '../engine/site'
import { CITY_ORIGIN, useStore } from '../store'
import { HB_DASHED, HB_LABEL_AT, HB_ORIGIN, HB_PARTS, closeHb, hbRelation, hbVisible, longDate, matchesHb, pinLayer, previewHb, readPrefs, selectHb, showLabels, useHigherBuildings } from './higherBuildings'

describe('dataset', () => {
  const layer = data.layers[0]
  it('declares a projected CRS and the app frame shares its origin', () => {
    expect(data.crs.horizontal).toBe('EPSG:26910')
    expect(data.crs.vertical).toBeNull()
    expect(HB_ORIGIN).toEqual(CITY_ORIGIN)
    // UTM 10N metres downtown, never degrees
    for (const p of layer.parts) for (const [e, n] of p.ring) { expect(e).toBeGreaterThan(488000); expect(e).toBeLessThan(494000); expect(n).toBeGreaterThan(5456000); expect(n).toBeLessThan(5461000) }
  })
  it('keeps every part apart, with a stable unique id, a valid ring and its own tolerance', () => {
    expect(layer.parts).toHaveLength(14)
    expect(new Set(layer.parts.map((p) => p.id)).size).toBe(14)
    layer.parts.forEach((p, i) => expect(p.id).toBe(`hbp-current-${String(i + 1).padStart(2, '0')}`))
    for (const p of HB_PARTS) { expect(validateRing(p.ring)).toBeNull(); expect(p.toleranceM).toBeGreaterThanOrEqual(10) }
    // parts are rounded to whole m² one by one
    expect(Math.abs(layer.areaM2 - layer.parts.reduce((s, p) => s + p.areaM2, 0))).toBeLessThanOrEqual(layer.parts.length)
  })
  it('records source, version, page, dates, basis and accuracy; retrieval is not adoption', () => {
    const s = layer.source
    expect(s.url).toMatch(/^https:\/\/syc\.vancouver\.ca\//)
    expect(s.page).toBe(40)
    expect(s.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(s.documentDate).toBe('2026-05-14')
    expect(s.retrieved).toBe('2026-11-08')
    expect(data.policy.adopted).toBe('1997')
    expect(new Set([s.documentDate, s.retrieved, data.policy.adopted]).size).toBe(3)
    expect(layer.geometryBasis).toMatch(/^Digitized/)
    expect(layer.accuracy.controlPoints).toBeGreaterThan(100)
    expect(layer.accuracy.georeferenceRmsM).toBeLessThan(3)
    expect(data.policy.pdf.inspected).toBe(false)
  })
  it('policy status and geometry accuracy are separate fields; published policy draws solid', () => {
    expect(layer.status).toBe('published')
    expect(HB_DASHED).toBe(false)
    expect(data.policy.status).toBe('in-force')
  })
  it('review material is not drawn unless verified, and says why', () => {
    for (const r of data.reviewReferences) { expect(r.drawn).toBe(false); expect(r.why.length).toBeGreaterThan(40) }
  })
  it('never names a future tallest tower or a height for the area', () => {
    const text = JSON.stringify(data)
    expect(text).not.toMatch(/tallest tower/i)
    expect(text).not.toMatch(/"height(M|_m)?"\s*:/i)
  })
  it('the label sits inside the central core', () => {
    const core = HB_PARTS[0].ring
    let inside = false
    for (let i = 0, j = core.length - 1; i < core.length; j = i++) {
      const a = core[j], b = core[i]
      if ((a[1] > HB_LABEL_AT[1]) !== (b[1] > HB_LABEL_AT[1]) && HB_LABEL_AT[0] < a[0] + ((HB_LABEL_AT[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside
    }
    expect(inside).toBe(true)
  })
})

describe('relationship on real sites (same answers as the independent shapely check)', () => {
  for (const s of fixture.sites) {
    it(`${s.name}: ${s.relation}`, () => {
      const r = hbRelation(s.ring as Pt[])!
      expect(r.relation).toBe(s.relation)
      expect(r.share).toBeCloseTo(s.share, 2)
      // the fixture rings are rounded to 1 cm
      expect(Math.abs(r.siteM2 - s.siteM2) / s.siteM2).toBeLessThan(0.001)
    })
  }
  it('City FAQ and exhibit p.13: the Bay Parkade block is outside and the block across Seymour St is mostly inside', () => {
    const by = Object.fromEntries(fixture.sites.map((s) => [s.name.split(' ')[0], s]))
    expect(hbRelation(by.bay_parkade_block.ring as Pt[])!.relation).toBe('outside')
    expect(hbRelation(by.across_seymour.ring as Pt[])!.share).toBeGreaterThan(0.9)
  })
  it("the Toolkit's default Real Vancouver site lies outside the drawn area (about 25 m away)", () => {
    const r = hbRelation(defaultSite.ring as Pt[])!
    expect(r.relation).toBe(fixture.defaultSite.relation)
    expect(r.relation).toBe('outside')
    expect(r.nearest!.distanceM).toBeCloseTo(fixture.defaultSite.distanceM, 0)
  })
  it('no site, no relationship', () => {
    expect(hbRelation(null)).toBeNull()
    expect(hbRelation([[0, 0], [1, 1]])).toBeNull()
  })
})

describe('state', () => {
  it('layer and label visibility are separate, and preview or selection shows the outline without pinning it', () => {
    useHigherBuildings.setState({ shown: false, labels: true, preview: false, hover: false, selected: false })
    previewHb(true); expect(hbVisible(useHigherBuildings.getState())).toBe(true); expect(useHigherBuildings.getState().shown).toBe(false)
    previewHb(false); selectHb(); expect(hbVisible(useHigherBuildings.getState())).toBe(true)
    closeHb(); expect(hbVisible(useHigherBuildings.getState())).toBe(false)
    pinLayer(true); showLabels(false)
    expect(useHigherBuildings.getState()).toMatchObject({ shown: true, labels: false })
    pinLayer(false); showLabels(true)
  })
  it('switching the layer changes nothing in the project', () => {
    const before = JSON.stringify({ ...useStore.getState(), cameraRequest: undefined })
    pinLayer(true); showLabels(false); selectHb(); previewHb(true); closeHb(); previewHb(false); pinLayer(false); showLabels(true)
    expect(JSON.stringify({ ...useStore.getState(), cameraRequest: undefined })).toBe(before)
    expect(useStore.getState().cameraRequest ?? null).toBeNull()
  })
  it('remembered settings survive bad storage', () => {
    expect(readPrefs(null)).toEqual({ shown: false, labels: true })
    expect(readPrefs({ getItem: () => '{oops' })).toEqual({ shown: false, labels: true })
    expect(readPrefs({ getItem: () => '{"shown":true,"labels":false}' })).toEqual({ shown: true, labels: false })
  })
})

describe('words', () => {
  it('search finds the item by name and by planning words, not by two letters', () => {
    for (const q of ['hig', 'Higher', 'higher buildings', 'tall buildings', 'policy', 'HBP']) expect(matchesHb(q)).toBe(true)
    for (const q of ['hi', '1128 W Georgia', 'West End']) expect(matchesHb(q)).toBe(false)
  })
  it('dates read as calendar dates', () => {
    expect(longDate('2026-05-14')).toBe('14 May 2026')
    expect(longDate('2026-11-08')).toBe('8 Nov 2026')
    expect(longDate('1997')).toBe('1997')
  })
})
