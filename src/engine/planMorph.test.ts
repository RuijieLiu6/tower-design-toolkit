// Plan morph (tool cycle 12, R7 tool 3): the Compass Turn's square-to-octagon part from R7_SYNTHESIS §1 Concept 1.
import { describe, expect, it } from 'vitest'
import { arcRadius, facetAzimuths, matchRings, morphPlanAt, morphStoreys, morphVertices, planRing, profileAt, ringArea, type MorphPart } from './planMorph'

type P2 = [number, number]
// R7 §1 spec sketch: from the L46 belt to the roof, a 54 m square turns into a 46.5 m octagon with 16.5 m corner legs.
const compass = (profile: 'linear' | 'arc' = 'linear'): MorphPart => ({ z0: 181.7, z1: 299.8, plan: { shape: 'chamfer', w: 54, d: 54, chamfer: 0 }, planTop: { w: 46.5, d: 46.5, chamfer: 16.5 }, profile })
const H = 299.8 - 181.7
const storeys = Array.from({ length: Math.round(H / 4) }, (_, i) => ({ z0: 181.7 + i * 4, z1: Math.min(299.8, 181.7 + (i + 1) * 4) }))
const chamferArea = (w: number, c: number) => w * w - 2 * c * c

describe('planRing: the harness plan shapes', () => {
  it('builds the same rings as the entry harness (vertex order, chamfer limit)', () => {
    expect(planRing({ shape: 'rect', w: 10, d: 6 })).toEqual([[-5, -3], [5, -3], [5, 3], [-5, 3]])
    expect(planRing({ shape: 'chamfer', w: 10, d: 10, chamfer: 2 })[0]).toEqual([-3, -5])
    expect(planRing({ shape: 'chamfer', w: 10, d: 10, chamfer: 9 })[0]).toEqual([-0.5, -5]) // limited to w/2 − 0.5
    expect(planRing({ shape: 'ellipse', w: 20, d: 10 })).toHaveLength(48)
    expect(planRing({ shape: 'polygon', pts: [[0, 0], [1, 0], [0, 1]] })).toEqual([[0, 0], [1, 0], [0, 1]])
  })
})

describe('plan morph: square to a true-N/E/S/W octagon (Compass Turn)', () => {
  it('matches the two outlines vertex for vertex by edge direction', () => {
    const m = matchRings(planRing(compass().plan), planRing({ shape: 'chamfer', w: 46.5, d: 46.5, chamfer: 16.5 }))
    expect(m.method).toBe('edge-direction')
    expect(m.a).toHaveLength(8)
    expect(m.b).toHaveLength(8)
    // each square corner is matched twice, to the two ends of the octagon facet it opens into
    expect(m.a.filter(([x, y]) => x === 27 && y === 27)).toHaveLength(2)
    // the farthest face travel is the facet's: (54 − 24) / √2 … from the 54 m square's corner line to the 46.5 m facet
    expect(m.travel).toBeCloseTo((54 - (2 * 23.25 - 16.5)) / Math.SQRT2, 6)
  })

  it('gives the exact square at the foot and the exact octagon at the top', () => {
    const foot = morphPlanAt(compass(), 181.7), top = morphPlanAt(compass(), 299.8)
    expect(foot).toHaveLength(4)
    expect(ringArea(foot)).toBeCloseTo(54 * 54, 6)
    expect(top).toHaveLength(8)
    expect(ringArea(top)).toBeCloseTo(chamferArea(46.5, 16.5), 6) // 1,617.75 m²
  })

  it('blends the chamfer parameters linearly: half way is a 50.25 m square with 8.25 m legs', () => {
    const mid = morphPlanAt(compass(), 181.7 + H / 2)
    expect(mid).toHaveLength(8)
    expect(ringArea(mid)).toBeCloseTo(chamferArea(50.25, 8.25), 6)
    const want = planRing({ shape: 'chamfer', w: 50.25, d: 50.25, chamfer: 8.25 })
    for (const p of want) expect(mid.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9)).toBe(true)
  })

  it('faces true N, E, S and W with its facets (competition frame: north 45° clockwise from +y)', () => {
    const az = facetAzimuths(morphPlanAt(compass(), 299.8), 0, 45)
    const facets = az.filter((f) => Math.abs(f.length - 16.5 * Math.SQRT2) < 1e-6).map((f) => f.azimuth).sort((a, b) => a - b)
    const grid = az.filter((f) => Math.abs(f.length - 13.5) < 1e-6).map((f) => f.azimuth).sort((a, b) => a - b)
    expect(facets).toEqual([0, 90, 180, 270])
    expect(grid).toEqual([45, 135, 225, 315])
    // Real Vancouver (grid north 0°): the tower turned with the downtown grid (45.2°) faces within 0.2° of true north
    expect(facetAzimuths(morphPlanAt(compass(), 299.8), 45.2, 0).some((f) => Math.abs(f.azimuth - 359.8) < 1e-6)).toBe(true)
  })

  it('shrinks the plate storey by storey and moves every vertex one way only (monotone)', () => {
    const areas = storeys.map((s) => ringArea(morphPlanAt(compass(), (s.z0 + s.z1) / 2)))
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeLessThan(areas[i - 1])
    for (const profile of ['linear', 'arc'] as const) {
      const v0 = morphVertices(compass(profile), 181.7)
      let last = v0.map(() => 0)
      for (const s of storeys) {
        const d = morphVertices(compass(profile), s.z1).map((p, k) => Math.hypot(p[0] - v0[k][0], p[1] - v0[k][1]))
        d.forEach((x, k) => expect(x).toBeGreaterThanOrEqual(last[k] - 1e-9))
        last = d
      }
    }
  })

  it('reports the plate area and facet lean per storey: facets 8.2°, grid faces 1.8°, all flat panels', () => {
    const r = morphStoreys(compass(), storeys)
    expect(r).toHaveLength(storeys.length)
    expect(r[0].area).toBeCloseTo(ringArea(morphPlanAt(compass(), (storeys[0].z0 + storeys[0].z1) / 2)), 6)
    const facetLean = (Math.atan(((54 - 30) / Math.SQRT2) / H) * 180) / Math.PI, gridLean = (Math.atan(3.75 / H) * 180) / Math.PI
    expect(facetLean).toBeCloseTo(8.18, 2) // R7 §1: the facets cross the corner columns at 8.2°
    expect(gridLean).toBeCloseTo(1.82, 2) // R7 §1: face columns lean 1.82°
    for (const s of r.slice(1)) {
      expect(s.maxSlope).toBeCloseTo(facetLean, 6)
      expect(s.faces.filter((f) => Math.abs(f.slope - gridLean) < 1e-6)).toHaveLength(4)
      expect(s.warp).toBeLessThan(1e-9)
    }
  })

  it('arc profile: tangent to the vertical at the foot, exact at both ends, steeper toward the top', () => {
    const m = matchRings(planRing(compass().plan), planRing({ shape: 'chamfer', w: 46.5, d: 46.5, chamfer: 16.5 }))
    const R = arcRadius(H, m.travel)!
    expect(R).toBeCloseTo((H * H + m.travel ** 2) / (2 * m.travel), 9)
    expect(profileAt('arc', 0, H, m.travel)).toBe(0)
    expect(profileAt('arc', 1, H, m.travel)).toBeCloseTo(1, 12)
    let prev = 0
    for (let k = 1; k <= 20; k++) { const s = profileAt('arc', k / 20, H, m.travel); expect(s).toBeGreaterThan(prev); prev = s }
    // the farthest-travelling face follows a true circle of radius R through both ends
    for (const t of [0.25, 0.5, 0.75]) expect(profileAt('arc', t, H, m.travel) * m.travel).toBeCloseTo(R - Math.sqrt(R * R - (t * H) ** 2), 9)
    const arc = morphStoreys(compass('arc'), storeys), lin = morphStoreys(compass(), storeys)
    expect(arc[0].maxSlope).toBeLessThan(0.5)
    expect(arc[arc.length - 1].maxSlope).toBeGreaterThan(lin[lin.length - 1].maxSlope)
    expect(ringArea(morphPlanAt(compass('arc'), 299.8))).toBeCloseTo(chamferArea(46.5, 16.5), 6)
    expect(arc.every((s) => s.warp < 1e-9)).toBe(true) // edges keep their direction: still flat panels
  })

  it('keeps the plan as it is without planTop', () => {
    const p: MorphPart = { z0: 0, z1: 100, plan: { shape: 'rect', w: 30, d: 20 } }
    expect(morphPlanAt(p, 50)).toEqual(planRing(p.plan))
  })
})

describe('plan morph: re-entrant plans (matched by share of perimeter)', () => {
  const L = (k: number): P2[] => [[0, 0], [30, 0], [30, 12], [12, 12], [12, 30], [0, 30]].map(([x, y]) => [x * k - 10, y * k - 10] as P2)
  const part: MorphPart = { z0: 0, z1: 40, plan: { shape: 'polygon', pts: L(1) }, planTop: { pts: L(0.7) } }

  it('matches vertex counts, keeps every corner of both shapes and is exact at both ends', () => {
    const m = matchRings(L(1), L(0.7))
    expect(m.method).toBe('perimeter')
    expect(m.a.length).toBe(m.b.length)
    for (const p of L(1)) expect(m.a.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)).toBe(true)
    for (const p of L(0.7)) expect(m.b.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)).toBe(true)
    expect(ringArea(morphPlanAt(part, 0))).toBeCloseTo(ringArea(L(1)), 6)
    expect(ringArea(morphPlanAt(part, 40))).toBeCloseTo(ringArea(L(0.7)), 6)
  })

  it('shrinks monotonically between two nested L-shapes', () => {
    let prev = Infinity
    for (let z = 2; z < 40; z += 4) { const a = ringArea(morphPlanAt(part, z)); expect(a).toBeLessThan(prev); prev = a }
  })
})
