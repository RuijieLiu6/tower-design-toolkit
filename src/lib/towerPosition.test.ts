// Tower position (6 Nov): picking a tower under the pointer, and the view that frames the site.
import { describe, expect, it } from 'vitest'
import { rectCorners } from '../engine/massing'
import type { Tower } from '../engine/types'
import { defaultTower } from '../store'
import { VTC_SITE } from './siteGeometry'
import { hitPrism, siteFrame, towerUnderRay } from './towerPosition'

type Pt = [number, number]
const down = (x: number, y: number) => ({ o: [x, y, 500] as [number, number, number], d: [0, 0, -1] as [number, number, number] })

describe('tower position', () => {
  it('a ray from above meets a prism at its roof; a slanted one at the side it enters', () => {
    const ring = rectCorners(0, 0, 20, 20, 0) as Pt[]
    expect(hitPrism(ring, 0, 100, down(5, 5))!.point[2]).toBeCloseTo(100, 6)
    expect(hitPrism(ring, 0, 100, down(50, 5))).toBeNull()
    // From the west, 45° down: it enters the west wall (x = -10) at z = 500 - (x0 - (-10)) where it starts at x0 = -300.
    const s2 = Math.SQRT1_2
    const h = hitPrism(ring, 0, 100, { o: [-300, 0, 330], d: [s2, 0, -s2] })!
    expect(h.point[0]).toBeGreaterThan(-10)
    expect(h.point[2]).toBeGreaterThan(30 - 100 / 32 - 1e-9)
    expect(h.point[2]).toBeLessThanOrEqual(40)
  })

  it('picks the nearest tower under the pointer', () => {
    const a: Tower = { ...defaultTower('vtc'), id: 'a', x: 0, y: 0, height: 100 }
    const b: Tower = { ...defaultTower('vtc'), id: 'b', x: 200, y: 0, height: 100 }
    expect(towerUnderRay([a, b], 0, down(200, 0))?.tower.id).toBe('b')
    expect(towerUnderRay([a, b], 0, down(100, 300))).toBeNull()
  })

  it('frames the site with air around it, and the tower without a site', () => {
    const f = siteFrame(VTC_SITE.ring as Pt[], null, 0)
    expect(f.centre[0]).toBeCloseTo(0, 6)
    expect(f.radius).toBeGreaterThan(Math.hypot(144.8, 79.2) / 2)
    const t: Tower = { ...defaultTower('city'), x: 500, y: 500 }
    const g = siteFrame(null, t, 30)
    expect(g.centre.slice(0, 2)).toEqual([expect.closeTo(500, 0), expect.closeTo(500, 0)])
    expect(g.radius).toBeGreaterThanOrEqual(150)
  })
})
