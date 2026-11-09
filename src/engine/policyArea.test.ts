// The site relationship to a digitized policy area, on synthetic parts and on the real Higher Buildings data. The real
// sites and the expected results come from the georeferencing work (04 Tool Plan/higher-buildings/work/checks.py,
// shapely buffers): the same rule, computed independently.
import { describe, expect, it } from 'vitest'
import { polygonDistance, siteRelation, toLocal, type PolicyPart } from './policyArea'
import type { Pt } from './site'

const sq = (cx: number, cy: number, h: number): Pt[] => [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]]
const part = (ring: Pt[], toleranceM = 10, id = 'p'): PolicyPart => ({ id, label: id, sizeClass: 'area', areaM2: 0, toleranceM, ring })

describe('siteRelation on a 200 m square area with a 10 m band', () => {
  const A = [part(sq(0, 0, 100))]
  it('a site deep inside is within, all of it inside', () => {
    const r = siteRelation(sq(0, 0, 20), A)
    expect(r.relation).toBe('within'); expect(r.share).toBeCloseTo(1, 6); expect(r.nearest?.distanceM).toBe(0)
  })
  it('a site far away is outside, with its distance', () => {
    const r = siteRelation(sq(300, 0, 20), A)
    expect(r.relation).toBe('outside'); expect(r.insideM2).toBe(0); expect(r.nearest?.distanceM).toBeCloseTo(180, 6)
  })
  it('a site across the edge is overlapping, with the exact share', () => {
    const r = siteRelation(sq(100, 0, 40), A)
    expect(r.relation).toBe('overlapping'); expect(r.share).toBeCloseTo(0.5, 6)
  })
  it('a site inside but within the band is uncertain, not within', () => {
    const r = siteRelation(sq(94, 0, 4), A)
    expect(r.relation).toBe('uncertain'); expect(r.share).toBeCloseTo(1, 6); expect(r.bandParts).toEqual(['p'])
  })
  it('a site outside but within the band is uncertain, not outside', () => {
    const r = siteRelation(sq(106, 0, 4), A)
    expect(r.relation).toBe('uncertain'); expect(r.insideM2).toBe(0)
  })
  it('the whole polygon counts, not its centroid: a long site with its centre outside still overlaps', () => {
    const r = siteRelation([[60, -5], [400, -5], [400, 5], [60, 5]], A)
    expect(r.relation).toBe('overlapping'); expect(r.share).toBeGreaterThan(0)
  })
  it('a wider band for a small, less certain part', () => {
    const r = siteRelation(sq(130, 0, 5), [part(sq(0, 0, 100), 40)])
    expect(r.relation).toBe('uncertain')
  })
  it('clockwise input gives the same answer', () => {
    expect(siteRelation([...sq(100, 0, 40)].reverse(), A).share).toBeCloseTo(0.5, 6)
  })
})

describe('polygonDistance', () => {
  it('is zero when outlines cross without a corner inside the other', () => {
    const bar: Pt[] = [[-50, -5], [50, -5], [50, 5], [-50, 5]], pole: Pt[] = [[-5, -50], [5, -50], [5, 50], [-5, 50]]
    expect(polygonDistance(bar, pole)).toBe(0)
  })
})

describe('toLocal', () => {
  it('subtracts the origin (metres, never degrees) and returns a counter-clockwise ring', () => {
    const r = toLocal([[491310, 5458610], [491310, 5458620], [491320, 5458620], [491320, 5458610]], [491300, 5458600])
    expect(r).toContainEqual([10, 10]); expect(r).toContainEqual([20, 20])
    let s = 0
    r.forEach((p, i) => { const q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1] })
    expect(s).toBeGreaterThan(0)
  })
})
