import { describe, expect, it } from 'vitest'
import { towerFloors } from '../../engine/massing'
import type { Tower } from '../../engine/types'
import { extrude, nearbyBuildings, sunWindFile, sunWindPayload, sunWindSiteFile, SW_PROTOCOL, type SwPayload } from './sunWind'

const BASE: Tower = {
  id: 't1', name: 'Tower A', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 10,
}
const tower = (over: Partial<Tower> = {}): Tower => ({ ...BASE, ...over })
const opts = { project: 'vtc' as const, selectedId: 't1', northDeg: 45, groundElevation: 0, meshOf: () => undefined, rev: 1 }

/** Signed volume of a closed mesh (positive when its faces point out). */
function volume(v: number[], f: number[]): number {
  let s = 0
  for (let i = 0; i < f.length; i += 3) {
    const a = f[i] * 3, b = f[i + 1] * 3, c = f[i + 2] * 3
    s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])
  }
  return s / 6
}
const finite = (p: SwPayload) => p.meshes.every((m) => m.v.every(Number.isFinite) && m.v.length % 3 === 0 && m.f.length % 3 === 0 && m.f.every((i) => Number.isInteger(i) && i >= 0 && i < m.v.length / 3))

describe('Sun & Wind Studio payload', () => {
  it('sends the selected tower as massing storeys in place on the competition block, the others as context', () => {
    const a = tower(), b = tower({ id: 't2', name: 'Tower B', x: 40, y: 10, height: 120 })
    const p = sunWindPayload([a, b], opts)!
    expect(p.protocol).toBe(SW_PROTOCOL)
    expect(p.trueNorthDeg).toBe(45)
    const mass = p.meshes.filter((m) => m.role === 'massing'), ctx = p.meshes.filter((m) => m.role === 'context')
    expect(mass.length).toBe(towerFloors(a).length) // one solid per storey, no core
    expect(mass.every((m) => m.part === 'mass' && m.layer.startsWith('Toolkit::Tower A::'))).toBe(true)
    expect(ctx.length).toBeGreaterThan(0)
    expect(ctx.every((m) => m.layer.includes('Tower B'))).toBe(true)
    // In place: the competition frame is shared, nothing is shifted.
    const xs = mass.flatMap((m) => m.v.filter((_, i) => i % 3 === 0))
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 3)
    expect(p.program.length).toBe(mass.length)
    expect(p.program.every((s) => ['retail', 'office', 'hotel', 'resi', 'public', 'mep'].includes(s.prog))).toBe(true)
    expect(finite(p)).toBe(true)
    for (const m of mass) expect(volume(m.v, m.f)).toBeGreaterThan(0)
  })

  it('makes a model file without a top-level meta (Sun & Wind Studio would read it as a whole site)', () => {
    const p = sunWindPayload([tower()], opts)!
    const j = JSON.parse(sunWindFile(p))
    expect(j.meta).toBeUndefined()
    expect(j.site).toBeUndefined()
    expect(Array.isArray(j.meshes)).toBe(true)
    expect(sunWindSiteFile(p)).toBeNull()
  })

  it('Real Vancouver: centres the tower, and the buildings around it become a site with origin (0, 0)', () => {
    const t = tower({ x: -845, y: 1072 })
    const fp = [
      { id: 1, outer: [[-800, 1060], [-780, 1060], [-780, 1080], [-790, 1080], [-790, 1070], [-800, 1070]] as [number, number][], holes: [] }, // concave L
      { id: 2, outer: [[2000, 2000], [2010, 2000], [2010, 2010]] as [number, number][], holes: [] }, // far away
      { id: 3, outer: [[-850, 1100], [-840, 1100], [-840, 1110]] as [number, number][], holes: [] }, // no height
    ]
    const heights = { ground: new Float32Array([10, 5, NaN]), roof: new Float32Array([40, 30, NaN]), max: new Float32Array(3), points: new Uint16Array(3) }
    const context = nearbyBuildings(fp, heights, [t.x, t.y], 350, { source: () => 'LiDAR 2022' })
    expect(context.length).toBe(1)
    expect(context[0].z1).toBe(30)
    const p = sunWindPayload([t], { ...opts, project: 'city', northDeg: 0, groundElevation: 12.5, context, siteRing: [[-870, 1050], [-820, 1050], [-820, 1095], [-870, 1095]] })!
    expect(p.trueNorthDeg).toBe(0)
    const xs = p.meshes.flatMap((m) => m.v.filter((_, i) => i % 3 === 0)), ys = p.meshes.flatMap((m) => m.v.filter((_, i) => i % 3 === 1))
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 3)
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 3)
    expect(p.site!.meta.origin).toEqual([0, 0])
    expect(p.site!.meta.north).toBe('+y')
    expect(p.site!.meshes.length).toBe(1)
    const b = p.site!.meshes[0]
    expect(b.layer).toBe('existing')
    expect(b.top).toBe(30)
    expect(volume(b.v, b.f)).toBeCloseTo(300 * 30, 3) // the L-shape: 20×10 + 10×10 m, 30 m tall
    expect(p.site!.site!.area).toBe(2250)
    expect(JSON.parse(sunWindSiteFile(p)!).meta).toBeDefined()
    expect(JSON.parse(sunWindFile(p)).meta).toBeUndefined()
  })

  it('extrudes a concave ring into a closed solid facing out, whichever way the ring turns', () => {
    const ring: [number, number][] = [[0, 0], [10, 0], [10, 10], [5, 10], [5, 5], [0, 5]]
    for (const r of [ring, [...ring].reverse()]) {
      const m = extrude(r, 2, 12)!
      expect(volume(m.v, m.f)).toBeCloseTo(75 * 10, 6)
    }
    expect(extrude([[0, 0], [1, 0]], 0, 1)).toBeNull()
    expect(extrude(ring, 5, 5)).toBeNull()
  })
})
