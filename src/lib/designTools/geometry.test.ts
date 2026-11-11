// Returned storeys → the Toolkit's imported mass and a closed prism mesh (brief §7 geometry/topology, §8 preview).
import { describe, expect, it } from 'vitest'
import { MIN_FLOOR_AREA } from '../../engine/imported'
import type { ProposalStorey } from './contract'
import { hull, massFromStoreys, orientLoops, prism, type MassMeta } from './geometry'
import { ringArea } from './validate'

type Pt = [number, number]
const rect = (w: number, d: number, cx = 0, cy = 0): Pt[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
const cw = (r: Pt[]) => [...r].reverse()
/** An L: a 20×20 square with its top-right 10×10 quarter cut away (concave, counter-clockwise). */
const ell = (): Pt[] => [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]
const meta = (): MassMeta => ({ meshId: 'tool-abc-t1', toolName: 'Form Studio', f2f: 4.2, podiumUse: 'retail', bandUse: 'office' })

/** Two podium storeys of 5 m on a 50×40 plate, then eight tower storeys of 4 m on 30×30: top at 42 m. */
const sample = (): ProposalStorey[] => [
  { z0: 0, z1: 5, loops: [rect(50, 40)], podium: true },
  { z0: 5, z1: 10, loops: [rect(50, 40)], podium: true },
  ...Array.from({ length: 8 }, (_, i) => ({ z0: 10 + i * 4, z1: 14 + i * 4, loops: [rect(30, 30)] })),
]

/** A closed, consistently oriented mesh: every directed edge once, its reverse once (no border, no flipped face). */
function closedEdges(m: { positions: number[]; indices: number[] }): number {
  const edges = new Map<string, number>()
  for (let i = 0; i < m.indices.length; i += 3) {
    const t = [m.indices[i], m.indices[i + 1], m.indices[i + 2]]
    for (let k = 0; k < 3; k++) { const key = `${t[k]}>${t[(k + 1) % 3]}`; edges.set(key, (edges.get(key) ?? 0) + 1) }
  }
  for (const [key, n] of edges) {
    expect(n, `edge ${key} used ${n} times`).toBe(1)
    const [u, v] = key.split('>')
    expect(edges.get(`${v}>${u}`), `edge ${key} has no partner`).toBe(1)
  }
  return edges.size
}
/** Signed volume by the divergence theorem: positive when every face points outward. */
function volume(m: { positions: number[]; indices: number[] }): number {
  const p = m.positions, v = (i: number) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]]
  let sum = 0
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [v(m.indices[i]), v(m.indices[i + 1]), v(m.indices[i + 2])]
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  return sum / 6
}

describe('orientLoops', () => {
  it('turns the outer loop counter-clockwise and holes clockwise, whatever the tool sent', () => {
    const o = orientLoops([cw(rect(10, 10)), rect(2, 2)])
    expect(ringArea(o[0])).toBeGreaterThan(0)
    expect(ringArea(o[1])).toBeLessThan(0)
    expect(o[0]).toEqual(rect(10, 10))
    expect(o[1]).toEqual(cw(rect(2, 2)))
  })
  it('leaves loops that are already right untouched (same references)', () => {
    const outer = rect(10, 10), hole = cw(rect(2, 2))
    const o = orientLoops([outer, hole])
    expect(o[0]).toBe(outer)
    expect(o[1]).toBe(hole)
  })
})

describe('hull', () => {
  it('is the convex hull, counter-clockwise, without inner points', () => {
    const h = hull([...rect(10, 10), [0, 0], [1, 2], [-3, 3]])
    expect(h).toEqual([[-5, -5], [5, -5], [5, 5], [-5, 5]])
    expect(ringArea(h)).toBe(100)
  })
  it('drops collinear points and copes with fewer than three', () => {
    expect(hull([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]])).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]])
    expect(hull([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]])
    expect(hull([])).toEqual([])
  })
})

describe('prism', () => {
  it('is a closed box with outward faces for a square plate', () => {
    const m = prism([rect(10, 10)], 0, 4)
    expect(m.positions).toHaveLength(8 * 3)
    expect(m.indices.length / 3).toBe(2 * 2 + 4 * 2) // two caps of two triangles, four walls of two
    expect(closedEdges(m)).toBe(m.indices.length) // every triangle edge is distinct and paired
    expect(volume(m)).toBeCloseTo(400, 6)
  })
  it('stays closed and outward around a hole (outer counter-clockwise, hole clockwise)', () => {
    const m = prism([rect(20, 20), cw(rect(10, 10))], 3, 7)
    expect(m.positions).toHaveLength(16 * 3)
    closedEdges(m)
    expect(volume(m)).toBeCloseTo((400 - 100) * 4, 6)
  })
  it('stays closed and outward for a concave plate', () => {
    const m = prism([ell()], 0, 3)
    closedEdges(m)
    expect(volume(m)).toBeCloseTo(300 * 3, 6)
  })
  it('puts the base at z0 and the top at z1', () => {
    const m = prism([rect(10, 10)], 12, 16)
    const zs = new Set<number>()
    for (let i = 2; i < m.positions.length; i += 3) zs.add(m.positions[i])
    expect([...zs].sort((a, b) => a - b)).toEqual([12, 16])
  })
})

describe('massFromStoreys', () => {
  it('reads areas, floor-to-floor, the podium top and the hull off the storeys', () => {
    const { mass } = massFromStoreys(sample(), meta())
    expect(mass.storeys).toHaveLength(10)
    expect(mass.storeys[0]).toMatchObject({ level: 1, z0: 0, z1: 5, area: 2000, use: 'retail', podium: true, hasFloor: true })
    expect(mass.storeys[2]).toMatchObject({ level: 3, z0: 10, z1: 14, area: 900, use: 'office', podium: false, hasFloor: true })
    expect(mass.storeys[9]).toMatchObject({ level: 10, z1: 42 })
    expect(mass.f2f).toBe(4)
    expect(mass.podiumTop).toBe(10)
    expect(mass.podiumF2F).toBe(5)
    expect(mass.top).toBe(42)
    expect(mass.volume).toBe(2000 * 10 + 900 * 32)
    expect(mass.hull).toEqual([[-25, -20], [25, -20], [25, 20], [-25, 20]])
    expect(mass).toMatchObject({ meshId: 'tool-abc-t1', format: 'design-tool', unit: 'm', unitSource: 'chosen', datumShift: 0, health: { block: 0, warn: 0 } })
    expect(mass.fileName).toMatch(/Form Studio/)
  })
  it('builds one closed mesh of every storey, with the report the import panel reads', () => {
    const { mesh } = massFromStoreys(sample(), meta())
    expect(mesh.positions).toBeInstanceOf(Float32Array)
    expect(mesh.indices).toBeInstanceOf(Uint32Array)
    expect(mesh.positions.length).toBe(10 * 8 * 3)
    closedEdges({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })
    expect(volume({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })).toBeCloseTo(2000 * 10 + 900 * 32, 2)
    expect(mesh.report).toMatchObject({ objects: 10, triangles: mesh.indices.length / 3 })
    expect(mesh.report.sources.join(' ')).toMatch(/Form Studio/)
    expect(mesh.openSegments).toHaveLength(0)
    expect(mesh.flippedTriangles).toHaveLength(0)
    expect(mesh.health).toEqual([])
  })
  it('without a podium: podium top 0, the default podium floor-to-floor, the tower f2f from the storeys', () => {
    const { mass } = massFromStoreys(sample().slice(2), meta())
    expect(mass.podiumTop).toBe(0)
    expect(mass.podiumF2F).toBe(4.5)
    expect(mass.f2f).toBe(4)
    expect(mass.hull).toEqual([[-15, -15], [15, -15], [15, 15], [-15, 15]])
    expect(mass.storeys.every((s) => !s.podium)).toBe(true)
  })
  it('podium only: the tower f2f falls back to the tower’s own', () => {
    const { mass } = massFromStoreys(sample().slice(0, 2), meta())
    expect(mass.f2f).toBe(4.2)
    expect(mass.podiumTop).toBe(10)
    expect(mass.top).toBe(10)
  })
  it('a hole subtracts from the plate area, and the loops keep the storey convention', () => {
    const { mass } = massFromStoreys([{ z0: 0, z1: 4, loops: [rect(30, 30), rect(10, 10)] }], meta())
    expect(mass.storeys[0].area).toBe(800)
    expect(ringArea(mass.storeys[0].loops[0])).toBeGreaterThan(0)
    expect(ringArea(mass.storeys[0].loops[1])).toBeLessThan(0)
    expect(mass.volume).toBe(3200)
  })
  it('keeps a use the tool set, and marks a plate under the minimum as a void', () => {
    const { mass } = massFromStoreys([
      { z0: 0, z1: 4, loops: [rect(30, 30)], use: 'hotel' },
      { z0: 4, z1: 8, loops: [rect(4, 4)] },
    ], meta())
    expect(mass.storeys[0].use).toBe('hotel')
    expect(mass.storeys[1]).toMatchObject({ area: 16, hasFloor: false })
    expect(16).toBeLessThan(MIN_FLOOR_AREA)
  })
  it('rounds to centimetres and ignores the winding the tool used', () => {
    const { mass, mesh } = massFromStoreys([{ z0: 0.004, z1: 3.996, loops: [cw(rect(30, 30))] }], meta())
    expect(mass.storeys[0]).toMatchObject({ z0: 0, z1: 4, area: 900 })
    expect(mass.top).toBe(4)
    expect(volume({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })).toBeGreaterThan(0)
  })
})
