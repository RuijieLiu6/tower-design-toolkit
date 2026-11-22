// Grooves (tool cycle 12): the Datum Bundle's rounded grooves between 18 m shafts (R7_SYNTHESIS §1 Concept 3).
import { describe, expect, it } from 'vitest'
import { panelReading } from './facetPanels'
import { applyGrooves, grooveArea, grooveSize, roundCorners } from './planGrooves'
import { morphPlanAt, planRing, ringArea } from './planMorph'
import { importedTower, type P } from './testStoreys'
import type { ImportedStorey } from './types'

const square = planRing({ shape: 'rect', w: 54, d: 54 }) as P[]
const shaftLines = { x: [-9, 9], y: [-9, 9] } // 3 × 3 shafts of 18 m
const fine = 24

describe('grooves between the shafts', () => {
  it('cuts eight half-round grooves into the 54 m bundle, losing their exact area', () => {
    const g = { depth: 3, radius: 3, lines: shaftLines, segments: fine }
    const r = applyGrooves(square, g)
    expect(r.placed).toBe(8)
    expect(r.skipped).toBe(0)
    expect(grooveArea(g)).toBeCloseTo((Math.PI * 9) / 2, 9) // 14.14 m² each
    expect(r.areaLost).toBeCloseTo(8 * grooveArea(g), 0)
    expect(Math.abs(r.areaLost / (8 * grooveArea(g)) - 1)).toBeLessThan(0.002)
    expect(ringArea(r.ring)).toBeCloseTo(54 * 54 - r.areaLost, 6)
    // the deepest points sit 3 m behind each face, on the shaft lines
    expect(r.ring.some(([x, y]) => Math.abs(x - 9) < 1e-9 && Math.abs(y + 24) < 1e-9)).toBe(true)
  })

  it('adds straight walls and rounded lips: area 2r(depth − r) + πr²/2 + 2·lip²(1 − π/4)', () => {
    const g = { depth: 4.5, radius: 1.5, lip: 1.5, lines: { x: [0] }, segments: fine }
    expect(grooveSize(g)).toEqual({ depth: 4.5, radius: 1.5, lip: 1.5, width: 6 })
    const exact = 2 * 1.5 * 3 + (Math.PI * 2.25) / 2 + 2 * 2.25 * (1 - Math.PI / 4)
    expect(grooveArea(g)).toBeCloseTo(exact, 9)
    const r = applyGrooves(square, g)
    expect(r.placed).toBe(2) // the top and bottom faces cross x = 0
    expect(Math.abs(r.areaLost / (2 * exact) - 1)).toBeLessThan(0.002)
  })

  it('reads two rounded shaft corners meeting as a cusp as deep as the lip', () => {
    const g = { depth: 3, radius: 0, lip: 3, lines: shaftLines, segments: fine }
    expect(grooveSize(g).depth).toBe(3)
    const r = applyGrooves(square, g)
    expect(r.placed).toBe(8)
    expect(Math.abs(r.areaLost / (8 * 2 * 9 * (1 - Math.PI / 4)) - 1)).toBeLessThan(0.005)
  })

  it('skips a groove with no room before a corner or over another, and works on a clockwise ring', () => {
    const r = applyGrooves(square, { depth: 3, radius: 3, at: [[25, -27], [0, -27], [2, -27]] })
    expect(r.placed).toBe(1)
    expect(r.skipped).toBe(2)
    const cw = applyGrooves([...square].reverse(), { depth: 3, radius: 3, lines: shaftLines })
    expect(cw.placed).toBe(8)
    expect(ringArea(cw.ring)).toBeCloseTo(ringArea(applyGrooves(square, { depth: 3, radius: 3, lines: shaftLines }).ring), 9)
  })

  it('rounds the cross and the bar of the upper tiers: convex corners by the lip, re-entrant ones by the radius', () => {
    // the five-shaft cross once the four corner shafts have ended (R7 §1 Concept 3)
    const cross: P[] = [[-9, -27], [9, -27], [9, -9], [27, -9], [27, 9], [9, 9], [9, 27], [-9, 27], [-9, 9], [-27, 9], [-27, -9], [-9, -9]]
    const g = { depth: 3, radius: 3, lip: 4.5, lines: shaftLines, corners: true, segments: fine }
    const r = applyGrooves(cross, g)
    expect(r.placed).toBe(0) // its faces meet the shaft lines only at corners
    const lost = 8 * 4.5 * 4.5 * (1 - Math.PI / 4) - 4 * 9 * (1 - Math.PI / 4) // corners rounded off, re-entrant corners filled
    expect(Math.abs(r.areaLost / lost - 1)).toBeLessThan(0.005)
    // the hotel bar, 18 × 54 m: the shaft lines cross its long faces four times
    const bar = applyGrooves(planRing({ shape: 'rect', w: 18, d: 54 }) as P[], { ...g, corners: false })
    expect(bar.placed).toBe(4)
    expect(roundCorners(square, 3, 3).length).toBe(4 * 7)
  })

  it('composes with a plan morph (grooves cut into each storey’s morphed ring)', () => {
    const part = { z0: 0, z1: 120, plan: { shape: 'chamfer', w: 54, d: 54, chamfer: 0 }, planTop: { w: 46.5, d: 46.5, chamfer: 16.5 } }
    const r = applyGrooves(morphPlanAt(part, 2) as P[], { depth: 3, radius: 3, lines: shaftLines })
    expect(r.placed).toBe(8)
  })

  it('needs few panel sizes on a grooved shaft: two face widths and one groove facet', () => {
    const ring = applyGrooves(square, { depth: 3, radius: 3, lines: shaftLines }).ring
    const storeys: ImportedStorey[] = Array.from({ length: 20 }, (_, i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, area: ringArea(ring), use: 'residential', podium: false, hasFloor: true, loops: [ring] }))
    const p = panelReading([importedTower(storeys)])
    expect(p.sizes).toBe(3) // 15 m and 12 m faces between grooves, one 0.78 m chord of the groove
    expect(p.sloped).toBe(0)
  })
})
