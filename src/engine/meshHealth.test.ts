import { describe, expect, it } from 'vitest'
import { box } from './testMeshes'
import { guessUnit, guessUpAxis, healthReport, topology, unitCandidates } from './meshHealth'

const tower = box(-20, -20, 0, 20, 20, 280)
const base = { originDistance: 0, rawCentre: [0, 0] as [number, number], project: 'vtc' as const, unit: 'm' }

describe('geometry health check', () => {
  it('passes a clean closed box', () => {
    const t = topology(tower)
    expect(t).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0, degenerate: 0, shells: 1 })
    const r = healthReport({ ...base, mesh: tower, topo: t })
    expect(r.filter((x) => x.severity !== 'pass')).toEqual([])
  })
  it('catches a hole (missing face)', () => {
    const open = { positions: tower.positions, indices: tower.indices.slice(0, 30) }
    const t = topology(open)
    expect(t.openEdges).toBe(4)
    expect(t.openSegments.length).toBe(4 * 6)
    const r = healthReport({ ...base, mesh: open, topo: t })
    expect(r.find((x) => x.id === 'closed')?.severity).toBe('warn')
  })
  it('catches a flipped face', () => {
    const ix = Uint32Array.from(tower.indices)
    ;[ix[6], ix[7]] = [ix[7], ix[6]]
    const t = topology({ positions: tower.positions, indices: ix })
    expect(t.flippedEdges).toBeGreaterThan(0)
    expect(t.flippedTriangles).toEqual([2])
    expect(healthReport({ ...base, mesh: { positions: tower.positions, indices: ix }, topo: t }).find((x) => x.id === 'normals')?.severity).toBe('warn')
  })
  it('catches an inside-out box', () => {
    const ix = Uint32Array.from(tower.indices)
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]
    const m = { positions: tower.positions, indices: ix }
    expect(healthReport({ ...base, mesh: m, topo: topology(m) }).find((x) => x.id === 'normals')?.title).toBe('Inside out')
  })
  it('catches zero-area faces and edges shared by three faces', () => {
    const ix = [...tower.indices, 0, 0, 1, 0, 1, 5]
    const t = topology({ positions: tower.positions, indices: ix })
    expect(t.degenerate).toBe(1)
    expect(t.nonManifoldEdges).toBeGreaterThan(0)
  })
  it('blocks a 280 km tower (millimetres read as metres) and says which unit fits', () => {
    const mm = box(-20000, -20000, 0, 20000, 20000, 280000)
    const r = healthReport({ ...base, mesh: mm, topo: topology(mm) })
    const u = r.find((x) => x.id === 'units')!
    expect(u.severity).toBe('block')
    expect(u.fix).toMatch(/millimetres/)
  })
  it('warns when the mass is far from the origin, and spots UTM coordinates', () => {
    const r = healthReport({ ...base, mesh: tower, topo: topology(tower), originDistance: 5400, rawCentre: [491600, 5458700] })
    expect(r.find((x) => x.id === 'origin')?.title).toMatch(/UTM/)
    const far = healthReport({ ...base, mesh: tower, topo: topology(tower), originDistance: 5400, rawCentre: [5000, 2000] })
    expect(far.find((x) => x.id === 'origin')?.severity).toBe('warn')
  })
  it('counts separate pieces', () => {
    expect(topology({ positions: new Float64Array([...tower.positions, ...box(100, 0, 0, 110, 10, 10).positions]), indices: [...tower.indices, ...[...box(0, 0, 0, 1, 1, 1).indices].map((i) => i + 8)] }).shells).toBe(2)
  })
})

describe('unit detection', () => {
  it('guesses the unit that gives a brief-sized tower', () => {
    expect(guessUnit({ height: 285000, width: 40000, depth: 40000 })).toBe('mm')
    expect(guessUnit({ height: 28500, width: 4000, depth: 4000 })).toBe('cm')
    expect(guessUnit({ height: 935, width: 131, depth: 131 })).toBe('ft')
    expect(guessUnit({ height: 285, width: 40, depth: 40 })).toBe('m')
    expect(guessUnit({ height: 11220, width: 1575, depth: 1575 })).toBe('in')
  })
  it('falls back to metres for a plausible non-brief tower', () => {
    expect(guessUnit({ height: 120, width: 30, depth: 30 })).toBe('m')
    expect(unitCandidates({ height: 120, width: 30, depth: 30 }).find((c) => c.unit === 'm')?.plausible).toBe(true)
  })
  it('guesses y-up when y is the tall axis', () => {
    expect(guessUpAxis({ min: [0, 0, 0], max: [40, 280, 40] })).toBe('y')
    expect(guessUpAxis({ min: [0, 0, 0], max: [40, 40, 280] })).toBe('z')
  })
})
