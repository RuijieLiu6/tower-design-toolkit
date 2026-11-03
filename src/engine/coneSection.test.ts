import { describe, expect, it } from 'vitest'
import { CITY_ORIGIN } from '../store'
import { rectCorners } from './massing'
import { SKYLINE_CAP_DEG, buildingCrossings, clipConvex, clipHalfPlane, conePlane, coneSolid, coneVolumeRings, convexHull, edgeFunctions, governingPoint, planeZ, protectedHalfSpaces, sectionPolygon, type P2 } from './coneSection'
import { CONES, CONE_PARAMS, checkFootprint, limitAt } from './viewCones'

const area = (r: P2[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
const box: P2[] = [[0, 0], [10, 0], [10, 10], [0, 10]]

describe('view-cone volume geometry', () => {
  it('clips a polygon by a half-plane and by a convex polygon of either winding', () => {
    expect(area(clipHalfPlane(box, ([x]) => 4 - x))).toBeCloseTo(40, 9)
    const tri: P2[] = [[5, -5], [20, 5], [5, 15]]
    const a = area(clipConvex(box, tri)), b = area(clipConvex(box, [...tri].reverse()))
    expect(a).toBeCloseTo(b, 9)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(100)
  })

  it('cuts a box by an inclined plane: the full footprint when the plane crosses all walls, less when it leaves through the roof', () => {
    const plane = { a: 50, b: 0.1, c: 0 }                       // z = 50 + 0.1 x, inside 50-51 m over the box
    const all = sectionPolygon(box, 0, 100, plane, [[-1e4, -1e4], [1e4, -1e4], [1e4, 1e4], [-1e4, 1e4]])
    expect(all).toHaveLength(4)
    for (const [x, , z] of all) expect(z).toBeCloseTo(50 + 0.1 * x, 9)
    const roof = sectionPolygon(box, 0, 50.5, plane, [[-1e4, -1e4], [1e4, -1e4], [1e4, 1e4], [-1e4, 1e4]])
    expect(area(roof.map(([x, y]) => [x, y] as P2))).toBeCloseTo(50, 9) // only where the plane is under the 50.5 m roof (x <= 5)
    expect(sectionPolygon(box, 0, 40, plane, [[-1e4, -1e4], [1e4, -1e4], [1e4, 1e4], [-1e4, 1e4]])).toEqual([]) // plane above the roof
  })

  it('keeps only the part inside the wedge', () => {
    const wedge: P2[] = [[0, 5], [20, -5], [20, 15]] // the box's left edge touches the apex
    const s = sectionPolygon(box, 0, 100, { a: 30, b: 0, c: 0 }, wedge)
    const inside = edgeFunctions(wedge)
    for (const [x, y] of s) for (const f of inside) expect(f([x, y])).toBeGreaterThan(-1e-9)
    expect(area(s.map(([x, y]) => [x, y] as P2))).toBeCloseTo(50, 9) // the wedge opens from the apex: width x at x, so ∫0..10 x dx
  })

  it('every City cone wedge is convex to within 0.01% (its hull), so the wedge clip and the clipping planes are exact', () => {
    for (const c of CONES) {
      const r = c.ring.slice(0, -1) as P2[]
      expect(Math.abs(area(convexHull(r)) - area(r)) / area(r), c.id).toBeLessThan(1e-4)
    }
  })

  it('half-spaces in three.js world space keep exactly the protected part (above the limit, inside the wedge)', () => {
    const cone = CONES.find((c) => c.id === '3.2.3')!
    const plane = conePlane(cone, CITY_ORIGIN)!
    const wedge = cone.ring.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]] as P2)
    const hs = protectedHalfSpaces(plane, wedge)
    const keep = (x: number, y: number, z: number) => hs.every(([nx, ny, nz, d]) => nx * x + ny * z + nz * -y + d >= 0) // model (x, y, z) → world (x, z, −y)
    const p: P2 = [336, 156] // the default study tower
    const z = planeZ(plane, ...p)
    expect(keep(p[0], p[1], z + 1)).toBe(true)
    expect(keep(p[0], p[1], z - 1)).toBe(false)
    expect(keep(p[0] + 5000, p[1], z + 1)).toBe(false) // far outside the wedge
    expect(planeZ(plane, ...p)).toBeCloseTo(limitAt(cone, [p[0] + CITY_ORIGIN[0], p[1] + CITY_ORIGIN[1]])!, 6)
  })

  it('the overshoot label carries the check\'s own number at the case-5 site (cone 3.2.3)', () => {
    const cone = CONES.find((c) => c.id === '3.2.3')!
    const fp: P2[] = [[491635.1, 5458754.9], [491637.1, 5458754.9], [491637.1, 5458756.9], [491635.1, 5458756.9]] // cases.ts C5 square
    for (const top of [126.37, 140, 100]) {
      const check = checkFootprint(fp, top).find((c) => c.cone.id === '3.2.3')!
      const g = governingPoint(fp, cone)!
      expect(top - g.limit).toBeCloseTo(check.exceed!, 9)
    }
    // A full tower there: the exact minimum over footprint ∩ wedge (a vertex) is within 0.1 m of the sampled check.
    const tower = rectCorners(491636.1, 5458755.9, 30, 30, 0)
    const check = checkFootprint(tower, 152.8).find((c) => c.cone.id === '3.2.3')!
    const plane = conePlane(cone)!
    const exact = Math.min(...clipConvex(tower, cone.ring).map(([x, y]) => planeZ(plane, x, y)))
    expect(152.8 - exact).toBeGreaterThanOrEqual(check.exceed! - 1e-9)
    expect(152.8 - exact - check.exceed!).toBeLessThan(0.1)
  })

  it('draws a volume only for cones with an estimate', () => {
    const known = CONES.filter((c) => CONE_PARAMS[c.id]), unknown = CONES.filter((c) => !CONE_PARAMS[c.id])
    expect(known.every((c) => conePlane(c))).toBe(true)
    expect(unknown.every((c) => conePlane(c) === null)).toBe(true)
    const v = coneVolumeRings(known[0].ring, conePlane(known[0])!, 60)
    expect(v.top.every((p, i) => Math.abs(p[2] - v.bottom[i][2] - 60) < 1e-9)).toBe(true)
  })
})

describe('the cone as a solid from its viewpoint', () => {
  const cone = CONES.find((c) => c.id === '3.2.3')!
  const O = [cone.ring[0][0] - CITY_ORIGIN[0], cone.ring[0][1] - CITY_ORIGIN[1]] as P2

  it('has its apex at the viewpoint, eye level Lv, and its lower face on the estimate', () => {
    const s = coneSolid(cone, CITY_ORIGIN, () => 0)!
    expect(s.apex).toEqual([O[0], O[1], cone.Lv])
    const plane = conePlane(cone, CITY_ORIGIN)!
    for (const [x, y, z] of s.bottom) expect(z).toBeCloseTo(planeZ(plane, x, y), 9)
    expect(s.bottom.length).toBeGreaterThan(cone.ring.length - 2) // the far edge is densified by bearing
  })

  it('caps the upper face at a fixed visual angle where no skyline rises above the lower boundary (flat ground)', () => {
    const s = coneSolid(cone, CITY_ORIGIN, () => 0)!
    expect(s.capped.every(Boolean)).toBe(true)
    s.top.forEach(([x, y, z], i) => {
      const d = Math.hypot(x - O[0], y - O[1]), low = Math.atan2(s.bottom[i][2] - cone.Lv, d)
      expect(z).toBeCloseTo(cone.Lv + d * Math.tan(low + (SKYLINE_CAP_DEG * Math.PI) / 180), 6)
    })
  })

  it('frames the skyline: a 1,000 m ridge from 10 km sets the upper face along the sight line to its crest', () => {
    const ridge = (x: number, y: number) => (Math.hypot(x - O[0], y - O[1]) >= 10000 ? 1000 : 0)
    const s = coneSolid(cone, CITY_ORIGIN, ridge, { step: 50 })!
    expect(s.capped.some(Boolean)).toBe(false)
    const R = 6371000, drop = (d: number) => ((d * d) / (2 * R)) * 0.87
    const alpha = Math.atan2(1000 - cone.Lv - drop(10000), 10000) // the first sample past 10 km is the crest seen highest
    const [x, y, z] = s.top[0]
    const d = Math.hypot(x - O[0], y - O[1])
    expect(z).toBeCloseTo(cone.Lv + d * Math.tan(alpha), 3)
  })

  it('no solid for a cone without an estimate', () => {
    expect(coneSolid(CONES.find((c) => !CONE_PARAMS[c.id])!, CITY_ORIGIN, () => 0)).toBeNull()
  })

  it('finds existing buildings that rise above the lower boundary inside the wedge, with their section', () => {
    const plane = { a: 30, b: 0, c: 0 }, wedge: P2[] = [[0, 0], [100, -50], [100, 50]]
    const fp = (x: number) => ({ outer: [[x, -5], [x + 10, -5], [x + 10, 5], [x, 5]] as P2[] })
    const footprints = [fp(40), fp(60), fp(200), fp(70)]
    const ground = [10, 10, 10, 35], roof = [50, 20, 80, NaN] // crosses · below · outside the wedge · no height
    const x = buildingCrossings(footprints, ground, roof, plane, wedge)
    expect(x.map((c) => c.index)).toEqual([0])
    expect(x[0].section.every(([, , z]) => z === 30)).toBe(true)
    const whollyAbove = buildingCrossings([fp(40)], [35], [60], plane, wedge) // on higher ground: inside the view, no section line
    expect(whollyAbove).toHaveLength(1)
    expect(whollyAbove[0].section).toEqual([])
  })
})
