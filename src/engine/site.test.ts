// Study site geometry and parcel matching (after Vista v34 site-geometry.js and import-parcels.js).
import { describe, expect, it } from 'vitest'
import { exactCollinear, exactUnion, matchParcels, overlapArea, pointInRing, polyArea, ringMetrics, siteFromFootprints, validateRing, type Pt } from './site'

const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]

describe('site boundary validation (Vista site-geometry.js)', () => {
  it('accepts a simple polygon and gives its metrics', () => {
    expect(validateRing(sq(0, 0, 10))).toBeNull()
    const m = ringMetrics([[0, 0], [30, 0], [30, 20], [0, 20]])
    expect(m.area).toBe(600); expect(m.perimeter).toBe(100); expect(m.centre).toEqual([15, 10]); expect(m.lengths).toEqual([30, 20, 30, 20])
  })
  it('rejects the cases Vista rejects, with its messages', () => {
    expect(validateRing([[0, 0], [1, 1]])).toBe('A polygon needs at least 3 points.')
    expect(validateRing([[0, 0], [10, 0], [10, 0], [0, 10]])).toMatch(/duplicated or too short/)
    expect(validateRing([[0, 0], [10, 10], [0, 10], [10, 0]])).toBe('Polygon edges cross or touch.')
    expect(validateRing([[0, 0], [10, 0], [5, 0], [5, 5]])).toBe('Adjacent polygon edges overlap or double back.')
    expect(validateRing([[0, 0], [5, 0], [10, 0]])).toBe('Adjacent polygon edges overlap or double back.') // Vista's order of checks
    expect(validateRing([[0, 0], [Number.NaN, 0], [0, 1]])).toMatch(/finite numbers/)
    // A vertex touching another edge (a pinch) is not a simple polygon.
    expect(validateRing([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]])).toBe('Polygon edges cross or touch.')
  })
  it('works at City-frame scale and tests points on the boundary as inside', () => {
    const r = sq(-1200.4, 830.2, 41.7)
    expect(validateRing(r)).toBeNull()
    expect(pointInRing([-1200.4, 850], r)).toBe(true)
    expect(pointInRing([-1150, 850], r)).toBe(false)
    expect(ringMetrics(r).area).toBeCloseTo(41.7 * 41.7, 6)
  })
})

describe('exact shared-edge union (Vista import-parcels.js)', () => {
  it('joins two lots sharing a lot line, and a lot meeting a longer line (split, no snapping)', () => {
    const u = exactUnion([[sq(0, 0, 10)], [sq(10, 0, 10)]])!
    expect(u).toHaveLength(1); expect(polyArea(u[0])).toBe(200); expect(u[0][0]).toHaveLength(4)
    const t = exactUnion([[[[0, 0], [20, 0], [20, 10], [0, 10]]], [sq(5, 10, 10)]])!
    expect(t).toHaveLength(1); expect(polyArea(t[0])).toBe(300)
  })
  it('refuses overlaps and duplicates (strata copies) instead of guessing', () => {
    expect(exactUnion([[sq(0, 0, 10)], [sq(5, 0, 10)]])).toBeNull()
    expect(exactUnion([[sq(0, 0, 10)], [sq(0, 0, 10)]])).toBeNull()
  })
  it('keeps nearly touching lots apart: a 1 mm gap is never bridged', () => {
    const u = exactUnion([[sq(0, 0, 10)], [sq(10.001, 0, 10)]])!
    expect(u).toHaveLength(2)
  })
  it('exact collinearity uses exact binary arithmetic', () => {
    expect(exactCollinear([0, 0], [1, 1], [2, 2 + 1e-12])).toBe(false)
    expect(exactCollinear([0, 0], [4, 2], [2, 1])).toBe(true)
    // Decimetre City coordinates far from the origin: exact, not rounded.
    expect(exactCollinear([-1234.5, 678.9], [-1234.5, 700.1], [-1234.5, 689.3])).toBe(true)
    expect(exactCollinear([100.1, 200.2], [300.3, 600.6], [200.2, 400.4 + 1e-9])).toBe(false)
  })
})

describe('parcels under a site', () => {
  const parcels = [sq(0, 0, 20), sq(20, 0, 20), sq(40, 0, 20), sq(0, 30, 20)].map((outer) => ({ outer, holes: [] as Pt[][] }))
  it('overlap areas are exact for any polygon', () => {
    expect(overlapArea([[0, 0], [40, 0], [40, 20], [0, 20]], [sq(20, 0, 20)])).toBeCloseTo(400, 9)
    const L: Pt[] = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]]
    expect(overlapArea(L, [sq(0, 0, 20)])).toBeCloseTo(300, 9)
  })
  it('inside / partial / touching, joined only when exact, area from the joined lots', () => {
    const site: Pt[] = [[0, 0], [46, 0], [46, 20], [0, 20]]
    const m = matchParcels(site, parcels)
    expect(m.hits.map((h) => [h.index, h.kind])).toEqual([[0, 'inside'], [1, 'inside'], [2, 'partial']])
    expect(m.included).toEqual([0, 1])
    expect(m.join.status).toBe('joined')
    if (m.join.status === 'joined') expect(m.join.area).toBe(800)
    const withPartial = matchParcels(site, parcels, [2])
    expect(withPartial.join.status === 'joined' && withPartial.join.area).toBe(1200)
  })
  it('a site drawn a little past a lot line does not take the neighbour', () => {
    const m = matchParcels([[0, 0], [20.5, 0], [20.5, 20], [0, 20]], parcels)
    expect(m.hits.find((h) => h.index === 1)?.kind).toBe('touching')
    expect(m.included).toEqual([0])
  })
  it('records with an identical outline (strata, air space) count once; a real overlap stays separate for review', () => {
    // 1128 W Georgia St has four parcel records with one outline in the City layer (found 3 Nov).
    const strata = [...parcels, { outer: [[20, 0], [20, 20], [0, 20], [0, 0]] as Pt[], holes: [] }, { outer: sq(0, 0, 20), holes: [] }]
    const m = matchParcels(sq(-1, -1, 22), strata)
    expect(m.included).toHaveLength(3)
    expect(m.join.status === 'joined' && m.join.area).toBe(400)
    expect(m.join.reason).toMatch(/2 more records repeat an identical lot outline/)
    const overlap = [...parcels, { outer: sq(5, 0, 20), holes: [] }]
    expect(matchParcels([[0, 0], [46, 0], [46, 20], [0, 20]], overlap).join.status).toBe('review')
  })
  it('no parcel under the site: says so', () => {
    expect(matchParcels(sq(500, 500, 10), parcels).join.status).toBe('none')
  })
})

describe('a site from picked buildings (Vista replace existing buildings)', () => {
  it('one footprint is its own outline; wall-sharing footprints are joined; others become their hull, said', () => {
    expect(siteFromFootprints([{ outer: sq(0, 0, 10), holes: [] }])!.method).toBe('single')
    const u = siteFromFootprints([{ outer: sq(0, 0, 10), holes: [] }, { outer: sq(10, 0, 10), holes: [] }])!
    expect(u.method).toBe('union'); expect(ringMetrics(u.ring).area).toBe(200)
    const h = siteFromFootprints([{ outer: sq(0, 0, 10), holes: [] }, { outer: sq(15, 0, 10), holes: [] }])!
    expect(h.method).toBe('hull'); expect(ringMetrics(h.ring).area).toBe(250); expect(h.note).toMatch(/convex hull/)
  })
})
