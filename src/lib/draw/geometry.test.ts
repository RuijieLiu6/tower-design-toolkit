import { describe, expect, it } from 'vitest'
import { arrayCopies, area, asPoly, chordEnds, clip, hitPrisms, inPoly, netArea, offsetPoly, pathPoly, prismMesh, pushWall, rotatePts, setWallLength, splitPoly, winding, type Pt } from './geometry'

const box = (w: number, d: number, cx = 0, cy = 0): Pt[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
const cap = (pts: Pt[]) => (pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [])

// The drawing tools' geometry, after Sinnie Choi's Tower Workspace (xubynii/towerdesigntool): each rule in numbers.
describe('plan geometry of the drawing tools', () => {
  it('measures area and winding', () => {
    expect(area(box(20, 10))).toBe(200)
    expect(winding(box(20, 10))).toBe(1)
    expect(winding([...box(20, 10)].reverse())).toBe(-1)
    expect(netArea(box(20, 20), [box(4, 4)])).toBe(384)
  })
  it('offsets an outline out and in, whatever its winding', () => {
    expect(offsetPoly(box(20, 10), 2)).toEqual(box(24, 14))
    expect(offsetPoly([...box(20, 10)].reverse(), 2)).toEqual([...box(24, 14)].reverse())
    expect(area(offsetPoly(box(20, 10), -3))).toBe(14 * 4)
  })
  it('turns a line into a band, and a closed loop into a ring with a courtyard', () => {
    const band = pathPoly([[0, 0], [10, 0]], 4, 'c', false)
    expect(area(band.pts)).toBe(40)
    expect(band.holes).toBeUndefined()
    const ring = pathPoly(box(20, 20), 4, 'c', true)
    expect(area(ring.pts)).toBe(24 * 24)
    expect(ring.holes && area(ring.holes[0])).toBe(16 * 16)
  })
  it('finds the chord of a cut across a mass, and refuses one that misses', () => {
    expect(chordEnds(box(20, 10), [-30, 0], [30, 0])).toEqual([[-10, 0], [10, 0]])
    expect(chordEnds(box(20, 10), [-30, 20], [30, 20])).toBeNull()
  })
  it('splits a mass into two parts that add up, the larger first', () => {
    const r = splitPoly(box(20, 10), [], [-4, -20], [-4, 20])!
    expect(r).not.toBeNull()
    expect(area(r.big.pts) + area(r.small.pts)).toBeCloseTo(200, 6)
    expect(area(r.big.pts)).toBeCloseTo(140, 6)
    expect(r.seam[0][0]).toBeCloseTo(-4, 6)
  })
  it('unions, subtracts and intersects, each part keeping its own height in the caller', () => {
    const u = clip('union', asPoly(box(20, 10)), asPoly(box(20, 10, 10, 0)))
    expect(u).toHaveLength(1)
    expect(area(u[0].pts)).toBeCloseTo(300, 6)
    expect(clip('union', asPoly(box(10, 10)), asPoly(box(10, 10, 50, 0)))).toHaveLength(2)
    const d = clip('difference', asPoly(box(20, 10)), asPoly(box(20, 10, 10, 0)))
    expect(area(d[0].pts)).toBeCloseTo(100, 6)
    const i = clip('intersection', asPoly(box(20, 10)), asPoly(box(20, 10, 10, 0)))
    expect(area(i[0].pts)).toBeCloseTo(100, 6)
    const hole = clip('difference', asPoly(box(20, 20)), asPoly(box(4, 4)))
    expect(hole[0].holes).toHaveLength(1)
  })
  it('pushes a wall out along its normal and sets a wall\'s length, a box staying a box', () => {
    const pushed = pushWall(box(20, 10), 1, 3) // the east wall (x = 10)
    expect(area(pushed)).toBeCloseTo(230, 6)
    expect(pushed[1][0]).toBeCloseTo(13, 6)
    expect(pushed[2][0]).toBeCloseTo(13, 6)
    const longer = setWallLength(box(20, 10), 0, 30) // the south wall
    expect(longer[1][0]).toBeCloseTo(20, 6)
    expect(longer[2][0]).toBeCloseTo(20, 6)
    expect(area(longer)).toBeCloseTo(300, 6)
  })
  it('rotates about the centroid and lays copies in a row', () => {
    const r = rotatePts(box(20, 10), 90)
    expect(area(r)).toBeCloseTo(200, 6)
    expect(Math.abs(r[0][0])).toBeCloseTo(5, 6)
    expect(arrayCopies(box(2, 2), 10, 0, 3).map((c) => c[0][0])).toEqual([9, 19])
    expect(inPoly(0, 0, box(2, 2))).toBe(true)
    expect(inPoly(3, 0, box(2, 2))).toBe(false)
  })
  it('tells a roof from a wall under a pointer ray, nearest first', () => {
    const prisms = [{ id: 'a', pts: box(20, 10), base: 0, top: 30 }, { id: 'b', pts: box(10, 10, 40, 0), base: 0, top: 10 }]
    const down = hitPrisms(prisms, { o: [0, 0, 100], d: [0, 0, -1] })!
    expect(down.id).toBe('a'); expect(down.face).toBe('top'); expect(down.point[2]).toBe(30)
    const side = hitPrisms(prisms, { o: [100, 0, 5], d: [-1, 0, 0] })!
    expect(side.id).toBe('b'); expect(side.face).toBe('wall')
    const miss = hitPrisms(prisms, { o: [0, 50, 100], d: [0, 0, -1] })
    expect(miss).toBeNull()
  })
  it('extrudes a polygon into a closed mesh with the right volume sign', () => {
    const m = prismMesh(box(20, 10), [], 0, 30, cap)
    expect(m.positions.length).toBe(8 * 3)
    expect(m.indices.length).toBe(12 + 4 * 6)
    // a quick signed volume: the divergence of each triangle
    let v = 0
    for (let i = 0; i < m.indices.length; i += 3) {
      const p = (k: number) => [m.positions[m.indices[i + k] * 3], m.positions[m.indices[i + k] * 3 + 1], m.positions[m.indices[i + k] * 3 + 2]]
      const a = p(0), b = p(1), c = p(2)
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
    expect(v).toBeCloseTo(6000, 3)
  })
})
