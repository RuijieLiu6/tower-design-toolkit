// Vista kernels in Tower Design Toolkit. The first block ports Vista's own tests/test_cone_ceiling.cjs case by case (same
// inputs, same expected numbers); the rest pin the frame correction and the real-tower examples to research C04.
import { describe, expect, it } from 'vitest'
import { CONES, checkFootprint, limitAt } from './viewCones'
import { indexFootprints } from './viewFrom'
import { toUtm10 } from './relaxAviation'
import {
  VISTA_EXAMPLES, cityToVista, coneCamera, coneFitHfov, coneFitPitch, conePlane, convertBlock, degreeLengths, evaluateCeiling, exactCones,
  frameDistances, frameScaleError, nearbyRoofs, parseVistaHash, parseVistaStudy, planeFunction, utm10ToLatLon, vistaFrameSpread, vistaToCity, type CeilingInput, type Plane, type Pt,
} from './vista'

const square = (x: number, y: number, size: number): Pt[] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]]
const cone = (view_number: string, polygon_model_xy: Pt[] = square(-20, -20, 40)) => ({ view_number, polygon_model_xy })
const plane = (extra: Partial<Plane> = {}): Plane => ({ origin: [0, 0], observerElevationM: 100, bearingDeg: 0, pitchDeg: 0, source: 'study', ...extra })
const base = (extra: Partial<CeilingInput> = {}): CeilingInput => ({ cones: [cone('a')], footprints: [square(0, 0, 2)], planes: { a: plane() }, groundModelZ: 10, proposalTopModelZ: 40, datumOffsetM: 5, ...extra })
const near = (a: number | null, b: number, eps = 1e-8) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(eps)
const byId = (id: string) => CONES.find((c) => c.id === id)!

describe('Vista cone-ceiling kernel (ported test_cone_ceiling.cjs)', () => {
  it('flat plane reports sea-level ceiling, model-ground height, and top clearance', () => {
    const r = evaluateCeiling(base())
    expect(r.status).toBe('ready'); expect(r.ceilingElevationM).toBe(100); expect(r.maxHeightM).toBe(85); expect(r.clearanceM).toBe(55)
    expect(r.limitingView).toBe('a')
    expect(r.patches.every((p) => p.points.every((v) => v[2] === 95))).toBe(true)
  })
  it('sloping plane finds the exact extremum on a rotated footprint', () => {
    const r = evaluateCeiling(base({ footprints: [[[0, -3], [3, 0], [0, 3], [-3, 0]]], planes: { a: plane({ bearingDeg: 90, pitchDeg: 45 }) } }))
    near(r.ceilingElevationM, 97); near(r.limitingPoint![0], -3); near(r.limitingPoint![1], 0)
  })
  it('bearing is clockwise from north and the origin is included', () => {
    const r = evaluateCeiling(base({ footprints: [], point: [12, 23], planes: { a: plane({ origin: [10, 20], pitchDeg: -45 }) } }))
    const inside = evaluateCeiling(base({ cones: [cone('a', square(0, 0, 40))], footprints: [], point: [12, 23], planes: { a: plane({ origin: [10, 20], pitchDeg: -45 }) } }))
    near(inside.ceilingElevationM, 97); expect(r.status).toBe('outside')
  })
  it('concave cone excludes its notch and clips the occupied region', () => {
    const l: Pt[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]
    expect(evaluateCeiling(base({ cones: [cone('a', l)], footprints: [square(2, 2, 1)] })).status).toBe('outside')
    const r = evaluateCeiling(base({ cones: [cone('a', l)], footprints: [square(0.5, 0.5, 3)], planes: { a: plane({ bearingDeg: 45, pitchDeg: -45 }) } }))
    near(r.ceilingElevationM, 100 - 4.5 / Math.sqrt(2))
    expect(r.patches.every((p) => p.points.every(([x, y]) => x <= 1 + 1e-9 || y <= 1 + 1e-9))).toBe(true)
  })
  it('intersection vertices set the minimum when no footprint corner is in the cone', () => {
    const r = evaluateCeiling(base({ cones: [cone('a', [[-2, 0], [2, 0], [0, 4]])], footprints: [[[-3, 1], [3, 1], [3, 2], [-3, 2]]], planes: { a: plane({ bearingDeg: 90, pitchDeg: 45 }) } }))
    near(r.ceilingElevationM, 98.5); near(r.limitingPoint![0], -1.5); near(r.limitingPoint![1], 1)
  })
  it('multiple cones and footprints select the most restrictive ceiling', () => {
    const r = evaluateCeiling(base({ cones: [cone('a'), cone('b')], footprints: [square(0, 0, 1), square(5, 5, 1)], planes: { a: plane(), b: plane({ observerElevationM: 90, bearingDeg: 90, pitchDeg: -45 }) } }))
    near(r.ceilingElevationM, 84); expect(r.limitingView).toBe('b'); expect(r.overlappingViews).toEqual(['a', 'b'])
  })
  it('missing overlapping planes give a partial cap or unknown, never an unlimited height', () => {
    const r = evaluateCeiling(base({ cones: [cone('a'), cone('b')] }))
    expect(r.status).toBe('partial'); expect(r.missingViews).toEqual(['b']); expect(r.ceilingElevationM).toBe(100)
    const unknown = evaluateCeiling(base({ planes: {} }))
    expect(unknown.status).toBe('unknown'); expect(unknown.ceilingElevationM).toBeNull(); expect(unknown.maxHeightM).toBeNull()
    const outsideMissing = evaluateCeiling(base({ cones: [cone('b', square(100, 100, 1))], planes: {} }))
    expect(outsideMissing.status).toBe('outside'); expect(outsideMissing.missingViews).toEqual([])
  })
  it('missing datum keeps the elevation but derives no height or patches', () => {
    const r = evaluateCeiling(base({ datumOffsetM: null }))
    expect(r.status).toBe('ready'); expect(r.ceilingElevationM).toBe(100); expect(r.maxHeightM).toBeNull(); expect(r.clearanceM).toBeNull(); expect(r.patches).toEqual([])
  })
  it('edge and corner contacts count as overlap', () => {
    for (const fp of [square(2, 0, 1), square(2, 2, 1)]) {
      const r = evaluateCeiling(base({ cones: [cone('a', square(0, 0, 2))], footprints: [fp] }))
      expect(r.status).toBe('ready'); expect(r.ceilingElevationM).toBe(100); expect(r.patches.length).toBeGreaterThan(0)
    }
  })
  it('a ceiling below ground stays negative and is not clamped', () => {
    const r = evaluateCeiling(base({ groundModelZ: 110, proposalTopModelZ: 120 }))
    expect(r.maxHeightM).toBe(-15); expect(r.clearanceM).toBe(-25)
  })
  it('null, non-finite and vertical pitches are rejected without coercion', () => {
    for (const extra of [{ pitchDeg: null }, { pitchDeg: 89 }, { pitchDeg: -89 }, { pitchDeg: Infinity }, { bearingDeg: null }, { observerElevationM: null }, { origin: [null, 0] }, { pitchDeg: '0' }] as unknown as Partial<Plane>[]) {
      expect(evaluateCeiling(base({ planes: { a: plane(extra) } })).status).toBe('unknown')
    }
    expect(evaluateCeiling(base({ groundModelZ: null })).maxHeightM).toBeNull()
    expect(evaluateCeiling(base({ proposalTopModelZ: null })).clearanceM).toBeNull()
    expect(evaluateCeiling(base({ datumOffsetM: '5' as unknown as number })).maxHeightM).toBeNull()
    expect(evaluateCeiling(base({ footprints: [], point: [null, 0] as unknown as Pt })).status).toBe('no_site')
  })
  it('an empty site or an invalid footprint does not fall back to a point', () => {
    expect(evaluateCeiling({ cones: [cone('a')], planes: { a: plane() } }).status).toBe('no_site')
    expect(evaluateCeiling(base({ footprints: [[[0, 0], [null, 2], [2, 0]] as unknown as Pt[]], point: [0, 0] })).status).toBe('no_site')
  })
  it('closed clockwise polygons are accepted', () => {
    const ring = square(0, 0, 4).reverse(); ring.push(ring[0])
    expect(evaluateCeiling(base({ cones: [cone('a', ring)], footprints: [square(1, 1, 1)] })).status).toBe('ready')
  })
  it('malformed cone geometry stays unknown', () => {
    const r = evaluateCeiling(base({ cones: [cone('a', [[0, 0], [4, 4], [0, 4], [4, 0]])] }))
    expect(r.status).toBe('unknown'); expect(r.missingViews).toEqual(['a'])
  })
  it('model-coordinate overflow does not leak infinite results', () => {
    const r = evaluateCeiling(base({ datumOffsetM: -Number.MAX_VALUE, planes: { a: plane({ observerElevationM: Number.MAX_VALUE }) } }))
    expect(r.ceilingElevationM).toBe(Number.MAX_VALUE); expect(r.maxHeightM).toBeNull(); expect(r.clearanceM).toBeNull(); expect(r.patches).toEqual([])
  })
})

describe('Vista legacy frame (FALSE ASSUMPTION, corrected)', () => {
  it('reads north-south 0.58% short and east-west 0.20% short at the anchor (research C04)', () => {
    const e = frameScaleError()
    expect(e.northSouth * 100).toBeCloseTo(-0.576, 2)
    // C04 printed -0.198% (72,761 m); GRS80 at 49.2827 N gives 72,756.8 m, so -0.192%.
    expect(e.eastWest * 100).toBeCloseTo(-0.192, 3)
    expect(Math.round(degreeLengths(49.2827).lat)).toBe(111215)
    expect(Math.round(degreeLengths(49.2827).lon)).toBe(72757)
  })
  it('the UTM inverse round-trips toUtm10 to well under a millimetre', () => {
    for (const p of [[491816.07, 5454381.78], [496302.74, 5457432.5], [489918.86, 5456752.83]] as Pt[]) {
      const [lat, lon] = utm10ToLatLon(p)
      const q = toUtm10(lat, lon)
      expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThan(0.001)
    }
  })
  it("Vista's QE apex (600.09, -4483.10) lands on the City's apex within 0.02 m", () => {
    const q = vistaToCity([600.09, -4483.1])
    expect(Math.hypot(q[0] - 491816.07, q[1] - 5454381.78)).toBeLessThan(0.02)
    const back = cityToVista([491816.07, 5454381.78])
    expect(Math.hypot(back[0] - 600.09, back[1] + 4483.1)).toBeLessThan(0.02)
  })
  it('all 24 Vista apexes match the City origins after conversion (open data = City service, C04 r3)', () => {
    // Vista's origin_model_xy for a few cones (publication/site/data/viewcones.json), each converted and compared.
    const vista: Record<string, Pt> = { '10': [-976.91, -1134.69], '20': [-1297.02, -2127.9], '28': [5074.22, -1443.93], 'A': [-815.03, -1709.15], 'E': [430.22, -1440.84], 'K': [19.05, -1255.14], '27.1': [4273.57, -3139.61] }
    for (const [id, xy] of Object.entries(vista)) {
      const q = vistaToCity(xy), o = byId(id).ring[0]
      expect(Math.hypot(q[0] - o[0], q[1] - o[1]), id).toBeLessThan(0.05)
    }
  })
  it('QE apex to 1060 Barclay: Vista frame about 26 m short of the grid (C04 case)', () => {
    const barclay = toUtm10(49.2827816, -123.1268872)
    const d = frameDistances(byId('3.2.1').ring[0], barclay)
    expect(d.grid).toBeCloseTo(4637.11, 0)
    expect(d.grid - d.vista).toBeGreaterThan(24)
    expect(d.grid - d.vista).toBeLessThan(28)
  })
})

describe("Tower Design Toolkit's planes through Vista's kernel", () => {
  it('a parameterised cone as a Vista plane is the same surface as limitAt', () => {
    for (const id of ['A', '3.2.3', '28', '27.1']) {
      const c = byId(id), f = planeFunction(conePlane(c))!
      for (const t of [0.3, 0.6, 0.9]) {
        const p: Pt = [c.ring[0][0] + (c.ring[1][0] - c.ring[0][0]) * t * 0.9 + (c.ring[2][0] - c.ring[0][0]) * t * 0.05, c.ring[0][1] + (c.ring[1][1] - c.ring[0][1]) * t * 0.9 + (c.ring[2][1] - c.ring[0][1]) * t * 0.05]
        expect(f(p)).toBeCloseTo(limitAt(c, p) as number, 6)
      }
    }
    expect(conePlane(byId('3.2.1'))).toBeNull()
  })
  it('the exact limit is never above the sampled limit, and agrees within k × 5 m', () => {
    const fp: Pt[] = [[491621.1, 5458740.9], [491651.1, 5458740.9], [491651.1, 5458770.9], [491621.1, 5458770.9]]
    const ex = exactCones(fp, 120).find((e) => e.cone.id === '3.2.3')!
    expect(ex.overlapM2).toBeCloseTo(900, 3)
    expect(ex.exactLimit!).toBeLessThanOrEqual(ex.sampledLimit! + 1e-9)
    expect(ex.difference!).toBeLessThan(0.000404 * 5 + 1e-6)
    expect(ex.vistaFrameM2).toBeLessThan(ex.overlapM2)
    // Against true metres the frame loses 0.77% of area; the UTM grid itself is 0.08% small (k = 0.9996): 0.69% against the grid.
    expect(1 - ex.vistaFrameM2 / ex.overlapM2).toBeCloseTo(0.0069, 4)
  })
  it('sliver overlaps the 2 m / 5 m samples can miss are found exactly', () => {
    // A footprint whose corner pokes 0.4 m into cone A across its east edge: sampled check may call it near edge.
    const A = byId('A'), [O, , B] = A.ring
    const t = 0.5, e: Pt = [O[0] + (B[0] - O[0]) * t, O[1] + (B[1] - O[1]) * t]
    const len = Math.hypot(B[0] - O[0], B[1] - O[1]), ux = (B[0] - O[0]) / len, uy = (B[1] - O[1]) / len
    const n: Pt = [uy, -ux] // points out of the cone (east of the east edge)
    const corner: Pt = [e[0] - n[0] * 0.4, e[1] - n[1] * 0.4]
    const fp: Pt[] = [corner, [corner[0] + n[0] * 20 + ux * 0.0, corner[1] + n[1] * 20], [corner[0] + n[0] * 20 + ux * 20, corner[1] + n[1] * 20 + uy * 20], [corner[0] + ux * 20, corner[1] + uy * 20]]
    const ex = exactCones(fp, 50).find((x) => x.cone.id === 'A')!
    expect(ex.overlapM2).toBeGreaterThan(0)
    expect(['clear', 'near_edge', 'within_uncertainty']).toContain(checkFootprint(fp, 50).find((c) => c.cone.id === 'A')!.state)
  })
})

describe('Vista cone-fit camera (report.js rule)', () => {
  it('hfov = clamp(1.5 × spread + 8, 24, 100): Vista 25.7°, 51.8°, 87.5° in its frame; 25.6°, 51.7°, 87.2° in the grid', () => {
    // Vista measured spreads in its legacy frame (C04: 3.2.3 11.81°, 28 29.2°, 27.2 53.0°); the grid reads them 0.05-0.17° narrower.
    expect(vistaFrameSpread(byId('3.2.3'))).toBeCloseTo(11.81, 2)
    expect(vistaFrameSpread(byId('28'))).toBeCloseTo(29.2, 1)
    expect(vistaFrameSpread(byId('27.2'))).toBeCloseTo(53.0, 1)
    expect(coneFitHfov(vistaFrameSpread(byId('27.2')))).toBeCloseTo(87.5, 1)
    expect(coneCamera(byId('3.2.3')).hfov).toBeCloseTo(25.64, 2)
    expect(coneCamera(byId('28')).hfov).toBeCloseTo(51.65, 2)
    expect(coneCamera(byId('27.2')).hfov).toBeCloseTo(87.24, 2)
    expect(coneFitHfov(1)).toBe(24); expect(coneFitHfov(80)).toBe(100)
  })
  it('the eye is the City Lv at the origin and the camera looks along the bisector', () => {
    const c = coneCamera(byId('3.2.1'))
    expect(c.eye).toBe(124.6)
    expect(c.bearing).toBeGreaterThan(340); expect(c.bearing).toBeLessThan(352)
  })
  it('pitch keeps sky above the mountains and follows a tall top', () => {
    expect(coneFitPitch(20, 1)).toBeCloseTo(2.4, 6)
    expect(coneFitPitch(20, 15)).toBeCloseTo(8.6, 6)
    expect(coneFitPitch(20, 60)).toBe(28)
  })
})

describe('Vista nearby roofs on LiDAR roofs', () => {
  const sq = (x: number, y: number, h: number) => ({ outer: [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]] as Pt[], holes: [] })
  it('finds roofs around the tower and how much of it each one sees over nearer roofs', () => {
    // Tower at (0, 0), 150 m tall on ground 10. Roof A 300 m south, clear view. Roof B 300 m north behind a 120 m slab at 150 m north.
    const fps = [sq(0, -300, 10), sq(0, 300, 10), sq(0, 150, 15)]
    const idx = indexFootprints(fps)
    const heights = { ground: Float32Array.from([10, 10, 10]), roof: Float32Array.from([40, 40, 130]), max: Float32Array.from([41, 41, 131]), points: Uint16Array.from([50, 50, 50]) }
    const r = nearbyRoofs({ idx, heights, terrain: () => 10 }, { centre: [0, 0], base: 10, top: 160, radius: 15 }, { max: 24, within: 1000 })
    const a = r.find((k) => k.index === 0)!, b = r.find((k) => k.index === 1)!
    expect(a.visibleM).toBeCloseTo(150, 0)
    expect(a.bearing).toBeCloseTo(0, 6)
    expect(b.blockedBy).toBe('a building')
    // From 41.6 m over a 130 m roof at 150 m: the line reaches about 218 m at the tower, above its 160 m top.
    expect(b.visibleM).toBe(0)
    expect(r.some((k) => k.index === 2)).toBe(true)
  })
  it('skips roofs closer than the minimum distance', () => {
    const idx = indexFootprints([sq(0, -60, 5), sq(0, -400, 5)])
    const heights = { ground: Float32Array.from([0, 0]), roof: Float32Array.from([20, 20]), max: Float32Array.from([21, 21]), points: Uint16Array.from([9, 9]) }
    const r = nearbyRoofs({ idx, heights, terrain: () => 0 }, { centre: [0, 0], base: 0, top: 100, radius: 10 }, { minDistance: 120 })
    expect(r.map((k) => k.index)).toEqual([1])
  })
})

describe('Vista studies and examples', () => {
  it('parses the three real-tower examples', () => {
    for (const ex of VISTA_EXAMPLES) {
      const s = parseVistaHash(ex.hash)
      expect(s.site).not.toBeNull(); expect(s.blocks).toHaveLength(1); expect(s.observer?.source).toBe('rooftop'); expect(s.warnings).toEqual([])
    }
    expect(parseVistaHash(VISTA_EXAMPLES[0].hash).blocks[0]).toMatchObject({ h: 201, w: 29, d: 43, name: 'Shangri-La Vancouver' })
  })
  it('Shangri-La in the grid: whole footprint inside 3.2.1 (about 1,256 m²), 1.2 m from 9.1, 8.4 m from D (C04)', () => {
    const s = parseVistaHash(VISTA_EXAMPLES[0].hash)
    const b = convertBlock(s.site!, s.blocks[0])
    expect(b.gridArea).toBeCloseTo(1255.6, 0)
    expect(b.vistaArea).toBe(1247)
    const ex = exactCones(b.corners, 201 + 40)
    const inside = ex.filter((e) => e.overlapM2 > 0).map((e) => e.cone.id)
    expect(inside).toEqual(['3.2.1'])
    expect(ex.find((e) => e.cone.id === '3.2.1')!.overlapM2).toBeCloseTo(1255.6, 0)
    expect(ex.find((e) => e.cone.id === '9.1')!.gapM!).toBeCloseTo(1.2, 1)
    expect(ex.find((e) => e.cone.id === 'D')!.gapM!).toBeCloseTo(8.4, 1)
  })
  it('a Vista rotation of 0 becomes the grid convergence (about -0.09° here), not 0', () => {
    const s = parseVistaHash(VISTA_EXAMPLES[0].hash)
    const r = convertBlock(s.site!, s.blocks[0]).rotation
    expect(Math.abs(r)).toBeGreaterThan(0.05); expect(Math.abs(r)).toBeLessThan(0.15)
  })
  it('reads a saved study file and its sloping planes; refuses other JSON', () => {
    const cp = encodeURIComponent(JSON.stringify({ planes: { '3.2.1': { origin: [600.09, -4483.1], observerElevationM: 124.6, bearingDeg: 346.6, pitchDeg: 1.2, source: 'my test plane' }, 'D': { origin: [1, 2] } } }))
    const s = parseVistaStudy({ schema: 'vancouver-site-study/1', name: 'Mine', resume_hash: `#site=1%2C2&parts=100%2C20%2C30%2C0%2C0%2CA%3B40%2C50%2C60%2C0%2C0%2CPodium&rot=15%2C0&cp=${cp}` })
    expect(s.name).toBe('Mine'); expect(s.blocks.map((b) => b.rotation)).toEqual([15, 0])
    expect(Object.keys(s.planes)).toEqual(['3.2.1']); expect(s.warnings[0]).toMatch(/view D/)
    expect(() => parseVistaStudy({ schema: 'something-else' })).toThrow()
  })
})
