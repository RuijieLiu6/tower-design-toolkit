import { describe, expect, it } from 'vitest'
import { rectCorners } from '../engine/massing'
import { snapAngle, snapFootprint, type Pt, type SnapTarget } from './edgeSnap'

const square = (x: number, y: number, s: number): Pt[] => rectCorners(x, y, s, s, 0)
const site: SnapTarget = { ring: rectCorners(0, 0, 100, 60, 0), kind: 'site' } // corners (±50, ±30)

describe('snapFootprint', () => {
  it('snaps a corner onto the nearest target corner first', () => {
    const s = snapFootprint([square(38.8, 18.6, 20)], [site], 3) // corner (48.8, 28.6) → (50, 30)
    expect(s?.how).toBe('corner')
    expect(s?.dx).toBeCloseTo(1.2, 9)
    expect(s?.dy).toBeCloseTo(1.4, 9)
  })
  it('snaps one edge onto a parallel, overlapping target edge', () => {
    const s = snapFootprint([square(38, 0, 20)], [site], 3) // east face 48 → 50, nothing else in reach
    expect(s).toMatchObject({ kind: 'site', how: 'edge' })
    expect(s!.dx).toBeCloseTo(2, 9)
    expect(s!.dy).toBeCloseTo(0, 9)
    expect(s!.segments).toHaveLength(1)
  })
  it('solves two edges in different directions together (a corner without the corners being in reach)', () => {
    // East face 47.5 → 50 and north face 27.6 → 30: the corner is 3.5 m from the site corner, beyond a 3 m corner reach.
    const s = snapFootprint([square(37.5, 17.6, 20)], [site], 3)
    expect(s?.how).toBe('edge')
    expect(s!.dx).toBeCloseTo(2.5, 9)
    expect(s!.dy).toBeCloseTo(2.4, 9)
    expect(s!.segments).toHaveLength(2)
  })
  it('ignores edges that are out of reach, not parallel, or that do not overlap', () => {
    expect(snapFootprint([square(30, 0, 20)], [site], 3)).toBeNull()
    expect(snapFootprint([rectCorners(38, 0, 20, 20, 10)], [site], 3)).toBeNull() // turned 10°: no parallel edge, no corner near
    const far: SnapTarget = { ring: [[49, 200], [49, 260], [80, 260], [80, 200]], kind: 'parcel' } // collinear-ish line far to the north
    expect(snapFootprint([square(38, 0, 20)], [far], 3)).toBeNull()
  })
  it('limits the shift to the dragged axis', () => {
    const s = snapFootprint([square(37.5, 17.6, 20)], [site], 3, [1, 0])
    expect(s!.dx).toBeCloseTo(2.5, 9)
    expect(s!.dy).toBe(0)
    expect(snapFootprint([square(0, 18.8, 20)], [site], 3, [1, 0])).toBeNull() // only the north face is in reach, across the axis
  })
  it('catches turned edges too (a parcel at 30°)', () => {
    const parcel: SnapTarget = { ring: rectCorners(0, 0, 40, 40, 30), kind: 'parcel' }
    const fp = rectCorners(0, 0, 20, 20, 30).map(([x, y]) => [x + 9 * Math.cos(Math.PI / 6) + 0.0, y + 9 * Math.sin(Math.PI / 6)] as Pt)
    const s = snapFootprint([fp], [parcel], 2)
    expect(s?.kind).toBe('parcel')
    // After the shift the footprint's outer face lies on the parcel's: 10 m from the centre along 30°.
    const moved = fp.map(([x, y]) => [x + s!.dx, y + s!.dy] as Pt)
    const along = Math.max(...moved.map(([x, y]) => x * Math.cos(Math.PI / 6) + y * Math.sin(Math.PI / 6)))
    expect(along).toBeCloseTo(20, 6)
  })
})

describe('snapAngle', () => {
  const parcel: SnapTarget = { ring: rectCorners(0, 0, 40, 20, 30), kind: 'parcel' }
  it('turns parallel to an edge within the tolerance, every 90°', () => {
    expect(snapAngle(28.5, [parcel], 3)?.rotation).toBeCloseTo(30, 9)
    expect(snapAngle(118.5, [parcel], 3)?.rotation).toBeCloseTo(120, 9)
    expect(snapAngle(-61, [parcel], 3)?.rotation).toBeCloseTo(-60, 9)
    expect(snapAngle(45, [parcel], 3)).toBeNull()
  })
})
