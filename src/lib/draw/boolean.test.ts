import { describe, expect, it } from 'vitest'
import { cutPieces, tooSmallACut } from './boolean'
import type { Pt } from './geometry'

const box = (w: number, d: number, cx = 0, cy = 0): Pt[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]

// Subtract and Intersect measure what they change: a cut that would change under 4 m² is no cut (the second mass
// used to be deleted all the same), and a sliver left over is not a mass.
describe('a Boolean cut', () => {
  it('subtracts the overlap and says how much the first mass changed', () => {
    const r = cutPieces('subtract', { pts: box(20, 20) }, { pts: box(20, 20, 10, 0) })
    expect(r.pieces).toHaveLength(1)
    expect(r.change).toBeCloseTo(200, 3)
    expect(tooSmallACut(r.change)).toBe(false)
  })
  it('keeps the shared part on Intersect', () => {
    const r = cutPieces('intersect', { pts: box(20, 20) }, { pts: box(20, 20, 10, 0) })
    expect(r.pieces).toHaveLength(1)
    expect(Math.abs(r.change - 200)).toBeLessThan(1e-6)
  })
  it('a corner touch of 1 m² is too small a cut: nothing changes and the second mass stays', () => {
    const r = cutPieces('subtract', { pts: box(20, 20) }, { pts: box(2, 2, 10, 10) })
    expect(r.change).toBeCloseTo(1, 3)
    expect(tooSmallACut(r.change)).toBe(true)
  })
  it('drops a sliver under 4 m² left by the cut', () => {
    // the second mass leaves a 1 m strip of the first on one side
    const r = cutPieces('subtract', { pts: box(20, 20) }, { pts: box(19, 40, 0.5, 0) })
    expect(r.pieces.every((p) => Math.abs(p.pts.reduce((a, q, i, arr) => { const n = arr[(i + 1) % arr.length]; return a + q[0] * n[1] - n[0] * q[1] }, 0) / 2) >= 4)).toBe(true)
  })
})
