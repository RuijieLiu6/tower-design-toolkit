// The browser port of tools/build_vtc_context.py, run on the real competition model in Node, against the Python output.
// Both files belong to Buildner and stay on the entrant's computer (never in git), so this test skips where they are
// absent (CI, a fresh clone).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { isExtruded, type ContextItem, type VtcContext } from '../context'
import { NotTheBaseModel, buildVtcContext } from './vtcContextBuild'

vi.setConfig({ testTimeout: 60_000 })

const MODEL = new URL('../../../03 Vancouver Tall Competition Brief/SITE PLANS & 3D MODEL/Vancouver Tall Base Model.3dm', import.meta.url)
const PYTHON = new URL('../../public/local/vtc_context.json', import.meta.url)
const have = existsSync(MODEL) && existsSync(PYTHON)

const near = (a: number[], b: number[], what: string) => {
  expect(a.length, `${what}: length`).toBe(b.length)
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.0101) expect.fail(`${what}[${i}]: ${a[i]} vs ${b[i]}`)
}
const flat = (pts: [number, number][]) => pts.flat()
const sameItems = (js: ContextItem[], py: ContextItem[], what: string) => {
  expect(js.length, `${what}: count`).toBe(py.length)
  js.forEach((a, i) => {
    const b = py[i]
    expect(isExtruded(a), `${what}[${i}] kind`).toBe(isExtruded(b))
    if (isExtruded(a) && isExtruded(b)) { near(flat(a.footprint), flat(b.footprint), `${what}[${i}].footprint`); near([a.z0, a.z1], [b.z0, b.z1], `${what}[${i}].z`) }
    else if (!isExtruded(a) && !isExtruded(b)) { near(a.positions, b.positions, `${what}[${i}].positions`); expect(a.indices.length, `${what}[${i}].indices`).toBe(b.indices.length) }
  })
}

describe.skipIf(!have)('competition context built in the browser (rhino3dm.js) matches tools/build_vtc_context.py', () => {
  it('gives the same items and coordinates within 1 cm', async () => {
    const rh = await rhino3dm()
    const js = buildVtcContext(rh, new Uint8Array(readFileSync(MODEL)))
    const py = JSON.parse(readFileSync(PYTHON, 'utf8')) as VtcContext
    expect(js.buildings).toHaveLength(99)
    expect(js.heritage).toHaveLength(325)
    expect(js.blocks).toHaveLength(24)
    expect(js.curbs).toHaveLength(9)
    expect(js.plazas).toHaveLength(2)
    expect(js.midblock).toHaveLength(4)
    expect(js.labels).toHaveLength(10)
    expect(js.future_towers.map((f) => f.z1)).toEqual(py.future_towers.map((f) => f.z1))
    expect(js.future_towers[0].z1).toBe(185.5)

    expect(js.site).not.toBeNull()
    near(flat(js.site!.outline), flat(py.site!.outline), 'site.outline')
    near([js.site!.width_m, js.site!.depth_m, js.site!.area_m2], [py.site!.width_m, py.site!.depth_m, py.site!.area_m2], 'site size')
    js.blocks.forEach((b, i) => near(flat(b), flat(py.blocks[i]), `blocks[${i}]`))
    js.curbs.forEach((c, i) => near(flat(c), flat(py.curbs[i]), `curbs[${i}]`))
    sameItems(js.buildings, py.buildings, 'buildings')
    sameItems(js.heritage, py.heritage, 'heritage')
    sameItems(js.plazas, py.plazas, 'plazas')
    sameItems(js.midblock, py.midblock, 'midblock')
    js.future_towers.forEach((f, i) => { near(flat(f.footprint), flat(py.future_towers[i].footprint), `future_towers[${i}]`); expect(f.z0).toBeCloseTo(py.future_towers[i].z0, 1) })
    expect(js.labels.map((l) => l.text)).toEqual(py.labels.map((l) => l.text))
    js.labels.forEach((l, i) => near(l.at, py.labels[i].at, `labels[${i}]`))
    expect(js.meta.true_north_deg_clockwise_from_plus_y).toBe(45)

    // Ground-level use areas (6 Nov): 138 hatches on the Ground Level Use Plan layers, same order, same outlines.
    expect(js.ground_uses).toHaveLength(138)
    expect(py.ground_uses, 'rebuild public/local/vtc_context.json with tools/build_vtc_context.py').toHaveLength(138)
    js.ground_uses!.forEach((u, i) => {
      expect(u.use, `ground_uses[${i}].use`).toBe(py.ground_uses![i].use)
      expect(u.rings.length, `ground_uses[${i}] rings`).toBe(py.ground_uses![i].rings.length)
      u.rings.forEach((r, k) => near(flat(r), flat(py.ground_uses![i].rings[k]), `ground_uses[${i}].rings[${k}]`))
    })
    expect(new Set(js.ground_uses!.map((u) => u.use))).toEqual(new Set(['Retail', 'Office', 'Cultural', 'Hotel', 'Institutional', 'Residential', 'Transit Station']))
  })
})

describe('competition context: any other Rhino file is refused', () => {
  it('says the file is not the base model', async () => {
    const rh = await rhino3dm()
    const doc = new rh.File3dm()
    const layer = doc.layers().addLayer('3D Model::Block', { r: 0, g: 0, b: 0, a: 255 })
    const attrs = new rh.ObjectAttributes()
    attrs.layerIndex = layer
    doc.objects().add(new rh.PolylineCurve([[0, 0, 0], [80, 0, 0], [80, 60, 0], [0, 60, 0], [0, 0, 0]]), attrs)
    const bytes = doc.toByteArray() as Uint8Array
    expect(() => buildVtcContext(rh, bytes)).toThrow(NotTheBaseModel)
    expect(() => buildVtcContext(rh, bytes)).toThrow(/doesn't look like the Vancouver Tall base model/)
  })
})
