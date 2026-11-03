// Exact triangle check against the cones' estimated lower surfaces (after Vista view-envelope.js): agreement with the
// View-cone height check where both are exact, the cases where triangles beat a box, and the exports.
import { describe, expect, it } from 'vitest'
import { CONES, checkFootprint, limitAt } from './viewCones'
import { governingPoint, type P2 } from './coneSection'
import { blockSpans, towerFootprint } from './massing'
import type { Tower } from './types'
import { constraintSurfaces, envelopeCheck, envelopeJson, envelopeObj, fitPlane, prismTriangles, proposalTriangles, surfaceCheck } from './viewEnvelope'

const ORIGIN: P2 = [491300, 5458600]
const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 'c1', name: 'Study tower', x: 491636 - ORIGIN[0], y: 5458756 - ORIGIN[1], rotation: 0, width: 30, depth: 30, height: 120, f2f: 4,
  podiumHeight: 0, podiumWidth: 30, podiumDepth: 30, podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: false, skyLobbies: [], ...patch,
})
const abs = (t: Tower) => towerFootprint(t).map(([x, y]) => [x + ORIGIN[0], y + ORIGIN[1]] as P2)

describe('view envelope: exact triangles against the estimated cone surfaces', () => {
  it('case 5 site: equals the View-cone height check and the cone overlay governing point', () => {
    const t = tower(), base = 32.8
    const { tris } = proposalTriangles([t], base, ORIGIN)
    const r = envelopeCheck(tris)
    const c = r.cones.find((k) => k.cone.id === '3.2.3')!
    const sampled = checkFootprint(abs(t), base + t.height).find((k) => k.cone.id === '3.2.3')!
    const g = governingPoint(abs(t), CONES.find((k) => k.id === '3.2.3')!)!
    expect(c.state).toBe('above')
    expect(c.clearance!).toBeCloseTo(-sampled.exceed!, 6)
    expect(c.limit!).toBeCloseTo(g.limit, 6)
    expect(c.at![2]).toBeCloseTo(base + t.height, 9)
    expect(r.controlling?.cone.id).toBe('3.2.3')
  })
  it('a stacked tower is judged on its blocks, not on a box at the top', () => {
    // Wide low podium inside cone A's wedge edge, slim tall tower set back out of the wedge.
    const A = CONES.find((c) => c.id === 'A')!
    const t = tower({ x: 491613.46 - ORIGIN[0], y: 5458350.75 - ORIGIN[1], blocks: [
      { id: 'p', height: 20, width: 60, depth: 60, dx: 0, dy: 0, rotation: 0, podium: true },
      { id: 't', height: 180, width: 20, depth: 20, dx: 0, dy: 0, rotation: 0 },
    ] })
    const spans = blockSpans(t)
    expect(spans.map((s) => s.z1)).toEqual([20, 200])
    const r = envelopeCheck(proposalTriangles([t], 10, ORIGIN).tris).cones.find((k) => k.cone.id === 'A')!
    // The governing z is a block top inside the wedge: never above the stack's top.
    expect(r.at![2]).toBeLessThanOrEqual(210 + 1e-9)
    expect(r.clearance!).toBeCloseTo((limitAt(A, [r.at![0], r.at![1]]) as number) - r.at![2], 9)
  })
  it('a sloping roof is tested where it is high, not at its top everywhere', () => {
    // One roof triangle rising to 150 m in the middle of cone 3.2.3, low at its ends.
    const c = CONES.find((k) => k.id === '3.2.3')!
    const m: P2 = [491636, 5458756]
    const tris = [{ a: [m[0] - 20, m[1] - 20, 100] as [number, number, number], b: [m[0] + 20, m[1] - 20, 100] as [number, number, number], c: [m[0], m[1] + 20, 150] as [number, number, number], tower: 'X', part: 'roof' }]
    const r = envelopeCheck(tris).cones.find((k) => k.cone.id === '3.2.3')!
    expect(r.at![2]).toBeCloseTo(150, 9)
    expect(r.clearance!).toBeCloseTo((limitAt(c, [m[0], m[1] + 20]) as number) - 150, 9)
  })
  it('a vertical wall crossing a wedge edge is tested at the crossing', () => {
    const tris = prismTriangles([[0, 0], [10, 0], [10, 1], [0, 1]], 0, 50, 'X', 'wall')
    expect(tris).toHaveLength(12)
    const none = envelopeCheck(tris)
    expect(none.cones.every((c) => c.state === 'outside')).toBe(true)
  })
  it('cones without an estimate are reported but never given a number', () => {
    // Case 3 site, inside 3.2.2 only.
    const t = tower({ x: 491272.2 - ORIGIN[0], y: 5458589.7 - ORIGIN[1], width: 2, depth: 2, height: 150 })
    const r = envelopeCheck(proposalTriangles([t], 15, ORIGIN).tris)
    const c = r.cones.find((k) => k.cone.id === '3.2.2')!
    expect(c.state).toBe('no_estimate')
    expect(c.clearance).toBeNull()
    expect(r.controlling).toBeNull()
  })
  it('an imported tower uses its mesh triangles when loaded, else says it used the hull', () => {
    const t = tower({ imported: { meshId: 'm1', fileName: 'tower.obj', format: 'obj', unit: 'm', unitSource: 'file', fileNorthDeg: 0, northSource: '', datumShift: 0, datumSource: '', f2f: 4, podiumTop: 0, podiumF2F: 4, storeys: [], hull: [[-15, -15], [15, -15], [15, 15], [-15, 15]], volume: null, top: 120, health: { block: 0, warn: 0 } } })
    const mesh = { positions: [-15, -15, 120, 15, -15, 120, 0, 15, 130], indices: [0, 1, 2] }
    const withMesh = proposalTriangles([t], 30, ORIGIN, { m1: mesh })
    expect(withMesh.tris).toHaveLength(1); expect(withMesh.notes).toEqual([])
    expect(withMesh.tris[0].c).toEqual([491636, 5458771, 160])
    const without = proposalTriangles([t], 30, ORIGIN, {})
    expect(without.notes[0]).toMatch(/hull/)
  })
  it("reproduces Vista's envelope self-test: stacked rotated blocks, exact 83.012086 m vs 68.175785 m for the bounding prism", () => {
    // envelope-selftest.js fixture: blocks 120 m and 80 m (20 × 20 m) at site ± 20 m, Vista rotations 17° and −11°
    // clockwise (Tower Design Toolkit turns counter-clockwise, so −17° and +11°); plane through the site at top + 80 m,
    // bearing 90°, slope +20°. Base cancels; take site (0, 0) and base 0.
    const t = tower({ x: 0, y: 0, blocks: [
      { id: 'lower', height: 120, width: 20, depth: 20, dx: -20, dy: 0, rotation: -17 },
      { id: 'upper', height: 80, width: 20, depth: 20, dx: 20, dy: 0, rotation: 11 },
    ] })
    const { tris } = proposalTriangles([t], 0, [0, 0])
    expect(tris).toHaveLength(24) // 2 boxes × 12 (Vista check 7)
    const tan20 = Math.tan((20 * Math.PI) / 180), ring: P2[] = [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]]
    const plane = { id: 'synthetic', ring, z: (x: number) => 280 + x * tan20 }
    const [r] = surfaceCheck(tris, [plane])
    expect(r.clearance!).toBeCloseTo(83.012086, 5)
    expect(r.at![0]).toBeCloseTo(8.2756, 3); expect(r.at![1]).toBeCloseTo(7.9082, 3); expect(r.at![2]).toBe(200)
    // The bounding prism of the whole stack, tested at the top everywhere (what a box check would say).
    const xs = tris.flatMap((k) => [k.a[0], k.b[0], k.c[0]]), ys = tris.flatMap((k) => [k.a[1], k.b[1], k.c[1]])
    const box = prismTriangles([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], 0, 200, 'box', 'box')
    expect(surfaceCheck(box, [plane])[0].clearance!).toBeCloseTo(68.175785, 5)
  })
  it('re-fits a plane from three points in UTM (Vista source catalogue, 888 W Broadway sheet, 3.2.1): predicts the held-back point', () => {
    const E: [number, number, number] = [491043.0543, 5456686.6408, 134.2757], F: [number, number, number] = [491071.9994, 5456723.9471, 134.395], G: [number, number, number] = [491070.8462, 5456685.8175, 134.2476]
    const p = fitPlane([E, F, G])
    const atH = p.a + p.b * 491030.385 + p.c * 5456725.3488
    expect(atH).toBeCloseTo(134.437733, 4) // sheet H 134.4373 (+0.0004)
    expect(p.bearingDeg).toBeCloseTo(347.0416, 3); expect(p.slopeDeg).toBeCloseTo(0.228871, 5)
    expect(() => fitPlane([E, E, F])).toThrow(/collinear/)
  })
  it('exports the constraint surfaces as JSON and OBJ', () => {
    const s = constraintSurfaces()
    expect(s.map((k) => k.cone.id).sort()).toEqual(['27.1', '27.2', '28', '3.2.3', '3.2.4', 'A', 'H', 'J2'])
    const json = JSON.parse(envelopeJson(ORIGIN))
    expect(json.format).toBe('tower-design-toolkit-view-envelope@1')
    expect(json.cones).toHaveLength(24)
    expect(json.cones.find((c: { id: string }) => c.id === '3.2.2').surface).toBeNull()
    const a = json.cones.find((c: { id: string }) => c.id === 'A')
    expect(a.surface[0][2]).toBeCloseTo(4.54, 2) // the origin vertex sits at Lv
    const obj = envelopeObj(ORIGIN)
    expect((obj.match(/^o /gm) ?? []).length).toBe(8)
    expect((obj.match(/^f /gm) ?? []).length).toBe(s.reduce((n, k) => n + k.polygon.length - 2, 0))
  })
})
