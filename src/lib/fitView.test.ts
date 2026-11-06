import { describe, expect, it } from 'vitest'
import { fitPoints, project, viewBasis, type V3 } from './fitView'

/** Screen extent of `pts` seen by the fitted camera. */
function extent(pts: V3[], o: { aspect: number; fov: number; elevationDeg: number; azimuthDeg: number }, cam: { position: V3; target: V3 }) {
  const b = viewBasis(o.elevationDeg, o.azimuthDeg), tanHalf = Math.tan((o.fov * Math.PI) / 360)
  const s = pts.map((p) => project(p, cam.position, b, tanHalf, o.aspect))
  return { x0: Math.min(...s.map((q) => q[0])), x1: Math.max(...s.map((q) => q[0])), y0: Math.min(...s.map((q) => q[1])), y1: Math.max(...s.map((q) => q[1])) }
}

// An L-shaped outline 3 km by 2 km, as a neighbourhood boundary might be, with some relief.
const OUTLINE: V3[] = [[-1500, -1000, 5], [1500, -1000, 20], [1500, 0, 40], [0, 0, 60], [0, 1000, 80], [-1500, 1000, 30]]

describe('fitPoints', () => {
  it('puts every point inside the band the overlays leave free and fills it in the tighter direction', () => {
    const o = { aspect: 1.6, fov: 35, elevationDeg: 60, azimuthDeg: 180 }
    const insets = { top: 0.08, bottom: 0.2, side: 0.02 }
    const cam = fitPoints(OUTLINE, { ...o, insets, fill: 0.9 })
    const e = extent(OUTLINE, o, cam)
    const lo = -1 + 2 * insets.bottom, hi = 1 - 2 * insets.top
    expect(e.y0).toBeGreaterThanOrEqual(lo - 1e-3)
    expect(e.y1).toBeLessThanOrEqual(hi + 1e-3)
    expect(e.x0).toBeGreaterThanOrEqual(-1 + 2 * insets.side - 1e-3)
    expect(e.x1).toBeLessThanOrEqual(1 - 2 * insets.side + 1e-3)
    // Centred in the band, and 90% of it in one direction (the other has room to spare).
    expect((e.y0 + e.y1) / 2).toBeCloseTo((lo + hi) / 2, 2)
    expect((e.x0 + e.x1) / 2).toBeCloseTo(0, 2)
    const fy = (e.y1 - e.y0) / (hi - lo), fx = (e.x1 - e.x0) / (2 - 4 * insets.side)
    expect(Math.max(fx, fy)).toBeCloseTo(0.9, 2)
  })

  it('north up: the camera is south of the target and looks north', () => {
    const cam = fitPoints(OUTLINE, { aspect: 1.5 })
    expect(cam.position[1]).toBeLessThan(cam.target[1])
    expect(Math.abs(cam.position[0] - cam.target[0])).toBeLessThan(1e-6)
    expect(cam.position[2]).toBeGreaterThan(cam.target[2])
  })

  it('a plan view (straight down) fits the outline the same way', () => {
    const o = { aspect: 1.3, fov: 35, elevationDeg: 90, azimuthDeg: 180 }
    const cam = fitPoints(OUTLINE, { ...o, fill: 0.85 })
    const e = extent(OUTLINE, o, cam)
    expect(Math.max(e.x1 - e.x0, (e.y1 - e.y0)) / 2).toBeCloseTo(0.85, 2)
    expect(e.x0).toBeGreaterThan(-1); expect(e.y1).toBeLessThan(1)
  })

  it('a tiny outline is shown at the smallest span, not edge to edge', () => {
    const tiny: V3[] = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]
    const cam = fitPoints(tiny, { aspect: 1.5, minSpan: 300 })
    const d = Math.hypot(cam.position[0] - cam.target[0], cam.position[1] - cam.target[1], cam.position[2] - cam.target[2])
    expect(d).toBeGreaterThanOrEqual(300 / (2 * Math.tan((35 * Math.PI) / 360)) - 1e-6)
  })
})
