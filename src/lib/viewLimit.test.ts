import { describe, expect, it } from 'vitest'
import { footprintBounds, limitView, registerViewLimit, viewLimit, type Rect, type ViewShape } from './viewLimit'

const rect: Rect = { x0: -4000, y0: -4500, x1: 5000, y1: 4500 } // 9 km by 9 km
const tanHalf = Math.tan((45 / 2) * Math.PI / 180)
const plan = (aspect: number): ViewShape => ({ tanHalf, aspect, right: [1, 0], up: [0, 1] })

describe('limitView (Real Vancouver: no zooming or panning past the built model)', () => {
  it('leaves a view inside the model alone', () => {
    const r = limitView([500, 0, 3000], [500, 0, 0], plan(1.4), rect)
    expect(r.moved).toBe(false)
    expect(r.cam).toEqual([500, 0, 3000])
  })

  it('pulls a top view zoomed out too far back to where the model fills the width', () => {
    const r = limitView([500, 0, 30000], [500, 0, 0], plan(1.4), rect)
    expect(r.moved).toBe(true)
    const d = r.cam[2] - r.target[2]
    expect(d * tanHalf * 1.4).toBeCloseTo(4500, 3) // half the view's width = half the model's width
    expect(r.target[0]).toBeCloseTo(500, 6) // centred: the model's middle
  })

  it('slides a panned target back so the view edge sits on the model edge, keeping the direction', () => {
    const r = limitView([4800, 0, 2000], [4800, 0, 0], plan(1), rect)
    const half = 2000 * tanHalf
    expect(r.target[0]).toBeCloseTo(5000 - half, 6)
    expect(r.cam[0] - r.target[0]).toBeCloseTo(0, 6)
    expect(r.cam[2]).toBeCloseTo(2000, 6)
  })

  it('handles a turned oblique view (the extent follows the screen axes on the ground)', () => {
    const s = Math.SQRT1_2
    const v: ViewShape = { tanHalf, aspect: 1.3, right: [s, -s], up: [s * 0.6, s * 0.6] }
    const r = limitView([20000, 20000, 15000], [0, 0, 0], v, rect)
    expect(r.moved).toBe(true)
    const d = Math.hypot(r.cam[0] - r.target[0], r.cam[1] - r.target[1], r.cam[2] - r.target[2])
    const hw = d * tanHalf * 1.3, hh = d * tanHalf
    expect(s * hw + s * 0.6 * hh).toBeLessThanOrEqual(4500 + 1e-6)
    // the direction is unchanged
    const a = [r.cam[0] - r.target[0], r.cam[1] - r.target[1], r.cam[2] - r.target[2]].map((x) => x / d)
    const b = [20000, 20000, 15000].map((x) => x / Math.hypot(20000, 20000, 15000))
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9))
  })

  it('footprintBounds is the box of every vertex; the registry clears only its own limit', () => {
    const b = footprintBounds([{ outer: [[0, 0], [10, 0], [10, 5]] }, { outer: [[-3, 8], [2, 9], [1, 7]] }])
    expect(b).toEqual({ x0: -3, y0: 0, x1: 10, y1: 9 })
    expect(footprintBounds([])).toBeNull()
    const off = registerViewLimit(rect)
    expect(viewLimit.rect).toBe(rect)
    off()
    expect(viewLimit.rect).toBeNull()
  })
})
