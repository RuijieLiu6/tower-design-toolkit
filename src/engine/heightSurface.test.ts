import { describe, expect, it } from 'vitest'
import { CITY_ORIGIN } from '../store'
import { limitGrid, maxHeightAt } from './heightSurface'
import { CONES, checkFootprint, edgeDistance } from './viewCones'

// Downtown box (the footprint layer's extent), EPSG:26910.
const BOX = { x0: CITY_ORIGIN[0] - 2400, y0: CITY_ORIGIN[1] - 2000, x1: CITY_ORIGIN[0] + 2500, y1: CITY_ORIGIN[1] + 1900 }
const tiny = ([x, y]: [number, number]): [number, number][] => [[x - 0.01, y - 0.01], [x + 0.01, y - 0.01], [x + 0.01, y + 0.01], [x - 0.01, y + 0.01]]
const clearOfEdges = (p: [number, number]) => CONES.every((c) => edgeDistance(p, c.ring) > 0.1)

describe('view-cone max-height surface', () => {
  it('the readout matches checkFootprint at sample points across downtown', () => {
    const counts = { none: 0, unknown: 0, limit: 0 }
    for (let x = BOX.x0 + 13; x < BOX.x1; x += 97) {
      for (let y = BOX.y0 + 29; y < BOX.y1; y += 97) {
        const p: [number, number] = [x, y]
        if (!clearOfEdges(p)) continue
        const h = maxHeightAt(p)
        const inside = checkFootprint(tiny(p), 0).filter((c) => c.state !== 'outside' && c.state !== 'near_edge')
        counts[h.state]++
        if (!inside.length) {
          expect(h.state).toBe('none')
        } else if (inside.some((c) => c.state === 'limit_unknown')) {
          expect(h.state).toBe('unknown')
          expect(h.limit).toBeNull()
          expect(h.unknown.map((c) => c.id).sort()).toEqual(inside.filter((c) => c.state === 'limit_unknown').map((c) => c.cone.id).sort())
        } else {
          const lowest = inside.reduce((a, b) => ((b.limit as number) < (a.limit as number) ? b : a))
          expect(h.state).toBe('limit')
          expect(h.limit as number).toBeCloseTo(lowest.limit as number, 2)
          expect(h.governing?.id).toBe(lowest.cone.id)
        }
      }
    }
    // The sample really exercises all three answers.
    expect(counts.none).toBeGreaterThan(50)
    expect(counts.unknown).toBeGreaterThan(50)
    expect(counts.limit).toBeGreaterThan(50)
  })

  it('never gives a number where a covering cone has no estimate', () => {
    const g = limitGrid(BOX, 25)
    for (let k = 0; k < g.state.length; k++) {
      if (g.state[k] !== 2) expect(Number.isNaN(g.limit[k])).toBe(true)
      else expect(Number.isFinite(g.limit[k])).toBe(true)
    }
  })

  it('the raster agrees with the point readout at its cell centres', () => {
    const g = limitGrid(BOX, 25)
    const code = { none: 0, unknown: 1, limit: 2 } as const
    let checked = 0
    for (let k = 0; k < g.state.length; k += 173) {
      const c = k % g.cols, r = Math.floor(k / g.cols)
      const p: [number, number] = [g.x0 + (c + 0.5) * g.step, g.y0 + (r + 0.5) * g.step]
      const h = maxHeightAt(p)
      expect(g.state[k]).toBe(code[h.state])
      if (h.state === 'limit') {
        expect(g.limit[k]).toBeCloseTo(h.limit as number, 3)
        expect(CONES[g.governing[k]].id).toBe(h.governing?.id)
      }
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('gives the same 3.2.3 limit as the design check at the default study tower (126.4 m)', () => {
    const h = maxHeightAt([491636, 5458756])
    expect(h.state).toBe('limit')
    expect(h.governing?.id).toBe('3.2.3')
    expect(h.limit as number).toBeCloseTo(126.4, 1)
    expect(h.u95).toBe(0.5)
  })
})
