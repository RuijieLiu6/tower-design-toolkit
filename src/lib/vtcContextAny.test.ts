// Any model as the competition context (lib/vtcContextAny.ts; Ruijie, 17 Nov: "let users upload any model of their own",
// no block required): units, up axis, where it lands, the optional site line, and the store taking an OBJ file.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MeshItem } from '../context'
import type { RawImport, RawObject } from './import/types'
import { contextFromRaw } from './vtcContextAny'
import { SITE_CENTRE } from './vtcContextBuild'

/** A closed box between two corners, as a mesh in file units. */
function box(name: string, [x0, y0, z0]: number[], [x1, y1, z1]: number[], layer = 'Buildings'): RawObject {
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { name, layer, kind: 'mesh', mesh: { positions, indices }, meshSource: 'mesh object' }
}

const raw = (o: Partial<RawImport>): RawImport => ({
  format: '3dm', fileName: 'mine.3dm', objects: [], skipped: [], unit: 'm', unitNote: '', upAxis: 'z', upNote: '', fileNorthDeg: null, northNote: '', notes: [], ...o,
})

const zs = (m: MeshItem) => m.positions.filter((_, i) => i % 3 === 2)
const xs = (m: MeshItem) => m.positions.filter((_, i) => i % 3 === 0)
const ys = (m: MeshItem) => m.positions.filter((_, i) => i % 3 === 1)

describe('any model as the competition context', () => {
  it('centres a model drawn far from the origin on the site, its lowest point at street level; no site line, no block', () => {
    const { ctx, notes } = contextFromRaw(raw({ objects: [box('A', [10_000, 5_000, 12], [10_040, 5_030, 112]), box('B', [10_060, 5_000, 12], [10_080, 5_020, 52])] }))
    expect(ctx.buildings).toHaveLength(2)
    const [a, b] = ctx.buildings as MeshItem[]
    expect(Math.min(...xs(a))).toBe(-40); expect(Math.max(...xs(b))).toBe(40)
    expect(Math.min(...ys(a))).toBe(-15); expect(Math.max(...ys(a))).toBe(15)
    expect(Math.min(...zs(a))).toBe(0); expect(Math.max(...zs(a))).toBe(100)
    expect(ctx.site).toBeNull()
    expect(notes.join(' ')).toMatch(/Centred on the competition site/)
    expect(notes.join(' ')).toMatch(/no block is drawn/)
    expect(ctx.meta.true_north_deg_clockwise_from_plus_y).toBe(45)
  })

  it('keeps a model in the base model\'s coordinates on the same spot as the competition context', () => {
    const [cx, cy] = SITE_CENTRE
    const { ctx, notes } = contextFromRaw(raw({ objects: [box('Edited', [cx - 100, cy - 50, 0], [cx + 100, cy + 50, 30])] }))
    const m = ctx.buildings[0] as MeshItem
    expect(Math.min(...xs(m))).toBe(-100); expect(Math.max(...ys(m))).toBe(50)
    expect(notes.join(' ')).toMatch(/base model's own coordinates/)
  })

  it('keeps a model around the origin where it is (the Toolkit\'s own competition frame)', () => {
    const { ctx } = contextFromRaw(raw({ objects: [box('Mine', [-20, -10, 3], [20, 10, 60])] }))
    const m = ctx.buildings[0] as MeshItem
    expect(Math.min(...xs(m))).toBe(-20); expect(Math.min(...zs(m))).toBe(3)
  })

  it('centres a model whose origin sits at its corner', () => {
    const { ctx, notes } = contextFromRaw(raw({ objects: [box('A', [0, 0, 0], [400, 260, 50])] }))
    const m = ctx.buildings[0] as MeshItem
    expect(Math.min(...xs(m))).toBe(-200); expect(Math.max(...ys(m))).toBe(130)
    expect(notes.join(' ')).toMatch(/Centred on the competition site/)
  })

  it('reads an OBJ without units or up axis: millimetres, Y up (the usual OBJ export)', () => {
    // 300 m by 200 m in plan, 90 m tall, in millimetres, Y up; around the origin.
    const { ctx, notes } = contextFromRaw(raw({ format: 'obj', unit: null, upAxis: null, objects: [box('Block', [-150_000, 0, -100_000], [150_000, 90_000, 100_000])] }))
    const m = ctx.buildings[0] as MeshItem
    expect(Math.max(...zs(m))).toBe(90)
    expect(Math.max(...xs(m)) - Math.min(...xs(m))).toBe(300)
    expect(Math.max(...ys(m)) - Math.min(...ys(m))).toBe(200)
    expect(notes.join(' ')).toMatch(/read as millimetres/)
    expect(notes.join(' ')).toMatch(/read as Y up/)
  })

  it('takes the largest closed curve on a Site / Block / Lot layer as the site line, of any size', () => {
    const lot = (layer: string, w: number): RawImport['curves'] => [{ name: '', layer, kind: 'curve', closed: true, points: [[-w, -w, 0], [w, -w, 0], [w, w, 0], [-w, w, 0]] }]
    const { ctx } = contextFromRaw(raw({ objects: [box('A', [-5, -5, 0], [5, 5, 10])], curves: [...lot('Layer 01::Lot', 30)!, ...lot('Plan::Site boundary', 60)!, ...lot('Streets', 500)!] }))
    expect(ctx.site).toMatchObject({ width_m: 120, depth_m: 120, area_m2: 14_400 })
    expect(ctx.site!.outline[0]).toEqual(ctx.site!.outline[ctx.site!.outline.length - 1])
  })

  it('refuses a file with nothing to show', () => {
    expect(() => contextFromRaw(raw({ fileName: 'lines.3dm', skipped: [{ name: 'c', layer: 'x', kind: 'Curve', reason: 'curves are not volumes' }] }))).toThrow(/no solids or meshes/)
  })
})

describe('the context store takes any model', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it('shows an OBJ file as your own model in place of the competition model, and goes back', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', undefined)
    const included = { meta: { source: 'x', true_north_deg_clockwise_from_plus_y: 45, north_note: '' }, site: { outline: [[0, 0], [1, 0], [1, 1], [0, 0]], width_m: 1, depth_m: 1, area_m2: 1 }, blocks: [], curbs: [], plazas: [], midblock: [], buildings: [{ footprint: [[0, 0], [1, 0], [1, 1]], z0: 0, z1: 3 }], heritage: [], future_towers: [], labels: [] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('context/vtc/context.json') ? { ok: true, json: async () => included } : { ok: false, json: async () => ({}) })))
    const m = await import('./vtcContextSource')
    await m.loadVtcContext()
    expect(m.useVtcSource.getState().source).toBe('included')
    const obj = 'o Tower\nv -10 0 -10\nv 10 0 -10\nv 10 0 10\nv -10 0 10\nv -10 80 -10\nv 10 80 -10\nv 10 80 10\nv -10 80 10\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n'
    expect(await m.addVtcModel(new File([obj], 'my-context.obj'))).toBe(true)
    const s = m.useVtcSource.getState()
    expect(s).toMatchObject({ status: 'ready', source: 'browser', own: 'model', fileName: 'my-context.obj' })
    expect(s.ctx!.buildings).toHaveLength(1)
    expect(Math.max(...zs(s.ctx!.buildings[0] as MeshItem))).toBe(80)
    expect(s.ctx!.site).toBeNull()
    expect(s.notes.length).toBeGreaterThan(0)
    await m.removeVtcModel()
    expect(m.useVtcSource.getState()).toMatchObject({ source: 'included', own: null })
  })

  it('refuses a file that is not a model', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', undefined)
    const m = await import('./vtcContextSource')
    expect(await m.addVtcModel(new File(['hello'], 'notes.txt'))).toBe(false)
    expect(m.useVtcSource.getState().error).toMatch(/3DM, OBJ, glTF/)
  })
})
