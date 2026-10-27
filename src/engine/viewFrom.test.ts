import { describe, expect, it } from 'vitest'
import { castRay, compass, conesCrossed, curvatureDrop, EYE_HEIGHT, floorEye, indexFootprints, pickAt, skyline, topEye, type FootprintLike, type HeightsLike, type Pt } from './viewFrom'

const sq = (x: number, y: number, s: number): FootprintLike => ({ outer: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], holes: [] })
const footprints = [sq(0, 0, 20), sq(100, 0, 20), sq(0, 100, 20)]
const heights: HeightsLike = {
  ground: Float32Array.from([10, 12, NaN]), roof: Float32Array.from([40, 92, NaN]), max: Float32Array.from([43, 95, NaN]), points: Uint16Array.from([200, 180, 0]),
}
const idx = indexFootprints(footprints)

describe('picking a viewpoint', () => {
  it('stands on a LiDAR roof at roof P90 + 1.6 m', () => {
    const p = pickAt(idx, heights, 10, 10)
    expect(p.kind).toBe('roof')
    if (p.kind === 'roof') { expect(p.roof).toBe(40); expect(p.eye).toBeCloseTo(41.6, 6) }
  })
  it('refuses a roof without a LiDAR height, with a plain reason', () => {
    const p = pickAt(idx, heights, 10, 110)
    expect(p.kind).toBe('unknown')
    if (p.kind === 'unknown') expect(p.reason).toMatch(/no measured roof height/)
  })
  it('treats anything else as the street', () => {
    expect(pickAt(idx, heights, 60, 60).kind).toBe('street')
  })
  it('respects courtyards (holes)', () => {
    const ring: FootprintLike = { outer: [[0, 0], [50, 0], [50, 50], [0, 50]], holes: [[[20, 20], [30, 20], [30, 30], [20, 30]]] }
    const i2 = indexFootprints([ring])
    const h: HeightsLike = { ground: Float32Array.from([5]), roof: Float32Array.from([30]), max: Float32Array.from([31]), points: Uint16Array.from([50]) }
    expect(pickAt(i2, h, 25, 25).kind).toBe('street')
    expect(pickAt(i2, h, 5, 5).kind).toBe('roof')
  })
})

describe('eye-height and curvature maths', () => {
  it('adds 1.6 m to a floor or the tower top, from the ground', () => {
    expect(EYE_HEIGHT).toBe(1.6)
    expect(floorEye(15, 42, 1.6)).toBeCloseTo(58.6, 9)
    expect(topEye(15, 285)).toBeCloseTo(301.6, 9)
  })
  it('matches the research hand checks for the earth-curvature drop', () => {
    expect(curvatureDrop(5000, 0)).toBeCloseTo(1.96, 2)
    expect(curvatureDrop(5100, 0)).toBeCloseTo(2.04, 2)
    expect(curvatureDrop(5100)).toBeCloseTo(1.78, 2)
    expect(curvatureDrop(30000, 0)).toBeCloseTo(70.6, 1)
  })
})

describe('skyline and visibility', () => {
  // Flat ground at 10 m, a 1,000 m ridge from 8 km to 12 km north.
  const terrain = (_x: number, y: number) => (y > 8000 && y < 12000 ? 1000 : 10)
  const base = { terrain, idx, heights, towers: [], farMin: 200 }
  it('sees the ridge to the north from the street', () => {
    const r = castRay({ ...base, eye: [60, 60, 11.6] }, 0)
    expect(r.far?.height).toBe(1000)
    expect(r.farVisible).toBe(true)
  })
  it('loses the ridge behind a design tower right in front', () => {
    const tower = { poly: [[40, 80], [80, 80], [80, 120], [40, 120]] as Pt[], top: 300, label: 'Study tower' }
    const r = castRay({ ...base, eye: [60, 60, 11.6], towers: [tower] }, 0)
    expect(r.near.label).toBe('Study tower')
    expect(r.farVisible).toBe(false)
  })
  it('sweeps the full circle and finds no mountains to the south', () => {
    const s = skyline({ ...base, eye: [60, 60, 11.6], maxDistance: 13000 }, 45)
    expect(s).toHaveLength(8)
    expect(s.find((x) => x.bearing === 180)!.far).toBeNull()
    expect(compass(0)).toBe('N'); expect(compass(225)).toBe('SW')
  })
})

describe('cones crossed by a sightline', () => {
  const cones = [
    { id: 'A', name: 'Cone A', ring: [[-50, 500], [50, 500], [50, 600], [-50, 600]] as Pt[] },
    { id: 'B', name: 'Cone B', ring: [[500, -50], [600, -50], [600, 50], [500, 50]] as Pt[] },
  ]
  it('lists the cones ahead, nearest first, and none behind', () => {
    expect(conesCrossed([0, 0], 0, 2000, cones).map((c) => c.id)).toEqual(['A'])
    expect(conesCrossed([0, 0], 90, 2000, cones)[0].from).toBeCloseTo(500, 6)
    expect(conesCrossed([0, 0], 180, 2000, cones)).toEqual([])
    expect(conesCrossed([0, 550], 90, 10, cones)[0].inside).toBe(true)
  })
})
