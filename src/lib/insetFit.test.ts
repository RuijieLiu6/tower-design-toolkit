import { describe, expect, it } from 'vitest'
import { fitInset } from './insetFit'

const B: [number, number, number, number] = [-8640, -9000, 7140, 6000] // Real Vancouver's model base
const inside = (f: ReturnType<typeof fitInset>, p: [number, number], padPx: number, size: number) => {
  const m = (padPx / size) * 2 * f.half
  return p[0] >= f.rect[0] + m - 1e-6 && p[0] <= f.rect[2] - m + 1e-6 && p[1] >= f.rect[1] + m - 1e-6 && p[1] <= f.rect[3] - m + 1e-6
}

describe('observer corner map framing (Vista inset-camera.js)', () => {
  it('keeps the observer and the tower inside the padding, however far apart', () => {
    for (const [eye, tower] of [[[0, 0], [300, 200]], [[-6000, 4000], [2000, -3000]], [[100, 100], [101, 99]]] as [number, number][][]) {
      const f = fitInset({ points: [eye, tower], width: 196, height: 196, bounds: B, paddingPx: 22 })
      expect(inside(f, eye, 22, 196)).toBe(true)
      expect(inside(f, tower, 22, 196)).toBe(true)
    }
  })
  it('never frames tighter than the minimum half-span, and slides inside the coverage near its edge', () => {
    const f = fitInset({ points: [[7100, 5950]], width: 196, height: 196, bounds: B })
    expect(f.half).toBe(120)
    expect(f.rect[2]).toBeLessThanOrEqual(B[2] + 1e-6)
    expect(f.rect[3]).toBeLessThanOrEqual(B[3] + 1e-6)
    expect(f.extentExceeded).toBe(false)
  })
  it('reports when the coverage cannot hold the frame, without cropping a point', () => {
    const f = fitInset({ points: [[-8600, 0], [7100, 0]], width: 196, height: 100, bounds: [-8640, -100, 7140, 100], paddingPx: 10 })
    expect(f.extentExceeded).toBe(true)
    expect(inside(f, [-8600, 0], 0, 100)).toBe(true)
    expect(inside(f, [7100, 0], 0, 100)).toBe(true)
  })
  it('refuses empty or broken input', () => {
    expect(() => fitInset({ points: [], width: 100, height: 100, bounds: B })).toThrow()
    expect(() => fitInset({ points: [[0, 0]], width: 20, height: 20, bounds: B, paddingPx: 12 })).toThrow()
    expect(() => fitInset({ points: [[0, 0]], width: 100, height: 100, bounds: [1, 1, 0, 0] })).toThrow()
  })
})
