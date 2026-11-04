import { describe, expect, it } from 'vitest'
import { clipHalf, coneVolume, displayCut, earClip, type V2 } from './coneVolume'

describe("Vista's view-cone volume", () => {
  const tri: V2[] = [[0, 0], [1000, -100], [1000, 100]]
  const plane = (p: V2) => 100 + p[0] * 0.05 // 100 m at the apex, rising 5 m per 100 m

  it('is the ceiling over the corridor and curtains standing on it to the display cut', () => {
    const v = coneVolume(tri, plane, -100, 320)
    expect(v.surface.length).toBe(1)
    for (const p of v.surface.flat()) expect(p[2]).toBeCloseTo(plane([p[0], p[1]]), 6)
    expect(v.walls.length).toBe(3)
    for (const w of v.walls) for (const p of w) { expect(p[2]).toBeGreaterThanOrEqual(plane([p[0], p[1]]) - 1e-6); expect(p[2]).toBeLessThanOrEqual(320 + 1e-6) }
    expect(v.edges.length).toBeGreaterThan(3)
  })

  it('cuts the ceiling at the display range and never draws below it', () => {
    const v = coneVolume(tri, (p) => 200 + p[0] * 0.3, -100, 320) // reaches 500 m at the far edge
    expect(Math.max(...v.surface.flat().map((p) => p[2]))).toBeLessThanOrEqual(320 + 1e-6)
    const far = v.walls.filter((w) => w.every((p) => p[0] > 999))
    expect(far.length).toBe(0) // the far side is above the cut: no curtain there
  })

  it('triangulates and clips like Vista', () => {
    expect(earClip([[0, 0], [10, 0], [10, 10], [5, 4], [0, 10]]).length).toBe(3)
    expect(clipHalf([[0, 0, 0], [10, 0, 10], [0, 10, 10]], (p) => p[2] - 5).length).toBe(4)
    expect(displayCut(null)).toBe(320); expect(displayCut(300)).toBe(360); expect(displayCut(900)).toBe(600)
  })
})

describe('cone volume edge cases', () => {
  it('drops a side that is entirely below the display range instead of failing', () => {
    const v = coneVolume([[0, 0], [1000, -100], [1000, 100]], () => -500, -100, 320)
    expect(v.surface.length).toBe(0)
    expect(v.edges.every(([a, b]) => a[2] >= -100 - 1e-6 && b[2] >= -100 - 1e-6)).toBe(true)
  })
})
