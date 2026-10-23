import { describe, expect, it } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { towerFloors } from '../../engine/massing'
import { signedVolume } from '../../engine/importGeom'
import type { Tower } from '../../engine/types'
import { readObj } from '../import/obj'
import { read3dmWith } from '../import/rhino'
import { stageA, stageB, stageC, topology, type ImportOptions, type ProjectFrame } from '../import/pipeline'
import type { RawImport } from '../import/types'
import { LAYER, buildScene, prism } from './scene'
import { to3dm, toObj } from './writers'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 10,
}
const opts = { project: 'vtc' as const, northDeg: 45, groundElevation: 0, utmOrigin: null, meshOf: () => undefined, date: '2026-10-22' }
const frame: ProjectFrame = { project: 'vtc', northDeg: 45, siteCentre: [0, 0], groundElevation: 0, utmOrigin: null }
const floors = towerFloors(vtc)

/** Re-import a file with the import pipeline, at the tower's own floor heights. */
function reimport(raw: RawImport, upAxis: 'z' | 'y') {
  const o: ImportOptions = { excluded: [LAYER.core], unit: 'm', unitConfirmed: true, upAxis, placement: 'keep', offset: [0, 0], datum: 'zero', dz: 0, north: 'true', northDeg: 0, f2f: vtc.f2f, podiumTop: vtc.podiumHeight, podiumF2F: vtc.podiumHeight / 4 }
  const A = stageA(raw, o)
  const B = stageB(raw, A, o, frame)
  return stageC(B.local, topology(A.mesh), o, { bands: vtc.bands, podiumUse: vtc.podiumUse })
}

describe('export scene', () => {
  const scene = buildScene([vtc], opts)
  it('makes one closed, outward solid per storey on a layer per use, plus core and plant', () => {
    expect(scene.solids.filter((s) => s.layer !== LAYER.core)).toHaveLength(floors.length)
    expect(scene.layers.map((l) => l.path)).toEqual(expect.arrayContaining(['Massing::Office', 'Massing::Hotel', 'Massing::Residential', 'Massing::Retail / commercial', 'Plant', 'Core']))
    const box = prism([[0, 0], [10, 0], [10, 10], [0, 10]], 0, 3)
    expect(signedVolume({ positions: Float64Array.from(box.positions), indices: Uint32Array.from(box.indices) })).toBeCloseTo(300, 6)
    const cw = prism([[0, 0], [0, 10], [10, 10], [10, 0]], 0, 3) // clockwise input is turned outward too
    expect(signedVolume({ positions: Float64Array.from(cw.positions), indices: Uint32Array.from(cw.indices) })).toBeCloseTo(300, 6)
  })
  it('tags every storey with use, level, area, source and evidence, and writes north and datum notes', () => {
    const s = scene.solids.find((x) => x.strings.level === '30')!
    expect(s.strings).toMatchObject({ tower: 'Tower 1', use: floors.find((f) => f.level === 30)!.use, gross_area_m2: '2116.0' })
    expect(s.strings.source).toMatch(/program bands/)
    expect(scene.solids.find((x) => x.layer === LAYER.plant)!.strings.evidence).toMatch(/team_assumption/)
    expect(scene.solids.find((x) => x.layer === LAYER.core)!.strings.evidence).toMatch(/team_assumption/)
    expect(scene.notes.true_north_deg_clockwise_from_plus_y).toBe('45')
    expect(scene.notes.units).toBe('metres')
  })
})

describe('round trip through the import pipeline', () => {
  it('OBJ: same storey count and areas within 1%', () => {
    const { obj, mtl } = toObj(buildScene([vtc], opts))
    expect(mtl).toMatch(/newmtl Massing_Office/)
    const C = reimport(readObj(obj, 'model.obj'), 'y')
    expect(C.storeys).toHaveLength(floors.length)
    C.storeys.forEach((s, i) => expect(Math.abs(s.area - floors[i].area) / floors[i].area).toBeLessThan(0.01))
    expect(C.podiumTop).toBeCloseTo(18, 6)
  })

  it('Rhino .3dm: same storeys and areas, metres, north 45°, layers and user strings kept', async () => {
    const rh = await rhino3dm()
    const bytes = to3dm(rh, buildScene([vtc], opts), { northDeg: 45, lat: 49.2827, lon: -123.1207 })
    const raw = read3dmWith(rh, bytes, 'model.3dm')
    expect(raw.unit).toBe('m')
    expect(raw.fileNorthDeg).toBeCloseTo(45, 1)
    expect(raw.objects.some((o) => o.layer === 'Massing::Office')).toBe(true)
    const C = reimport(raw, 'z')
    expect(C.storeys).toHaveLength(floors.length)
    C.storeys.forEach((s, i) => expect(Math.abs(s.area - floors[i].area) / floors[i].area).toBeLessThan(0.01))
    // User strings and document text survive.
    const doc = rh.File3dm.fromByteArray(bytes)
    const o = doc.objects().get(0)
    expect(o.attributes().getUserString('use')).toBe(floors[0].use)
    expect(doc.strings().count).toBeGreaterThanOrEqual(8) // units, up axis, frame, north, datum, content, LOD, date
  })
})
