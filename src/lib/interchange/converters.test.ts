// One block per converter (Layer 0 interchange → each tool's input), on the typical Rhino fixture, plus the round trip:
// Rhino fixture → Layer 0 → export .3dm → upload again gives the same storeys, areas and roles within tolerance.
import { describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { ringArea } from '../../engine/importGeom'
import { liftCheck } from '../../engine/lifts'
import { egressCheck } from '../../engine/egress'
import { gfaByUse, towerFloors } from '../../engine/massing'
import { shadowMask, gridOver, mergeOccluders } from '../../engine/shadow'
import { checkFootprint } from '../../engine/viewCones'
import type { Tower } from '../../engine/types'
import { to3dm, toObj } from '../export/writers'
import { readObj } from '../import/obj'
import { read3dmWith } from '../import/rhino'
import type { ProjectFrame } from '../import/pipeline'
import { exportProject, readProject, toDesign } from '../project/projectFile'
import { defaultDesign } from '../project/design'
import { buildModel, defaultOptions, type BuildResult } from './build'
import { contextOccluders, placedTriangles, toCustomize, toExportScene, toFloorAreas, toNodeTowers, toPresent, toPublicRealm, toShadowCasters, toViewConeInputs } from './converters'
import { TYPICAL, typicalTower } from './fixtures'
import { autoMapping } from './mapping'

// rhino3dm starts its WebAssembly per file; under load (the evaluation run in parallel) that can pass 5 s.
vi.setConfig({ testTimeout: 30_000 })

const frame: ProjectFrame = { project: 'vtc', northDeg: 0, siteCentre: [0, 0], groundElevation: 0, utmOrigin: null }
const bands = [{ use: 'office' as const, share: 1 }]

async function typical(): Promise<BuildResult & { towers2: Tower[]; rh: Awaited<ReturnType<typeof rhino3dm>> }> {
  const rh = await rhino3dm()
  const f = typicalTower(rh)
  const raw = read3dmWith(rh, f.bytes, f.name)
  const mapping = autoMapping(raw)
  const b = buildModel({ raw, mapping, opts: defaultOptions(raw, mapping, frame, 4.2), frame, bands, podiumUse: 'retail' })
  return { ...b, towers2: b.towers.map((t) => t.tower), rh }
}

describe('1. evaluation nodes: towers, floors, uses, core', () => {
  it('gives each model tower its floors, area by use, core and provenance, and the lift and egress checks run on them', async () => {
    const { model, towers2 } = await typical()
    const nt = toNodeTowers(model, towers2)
    expect(nt.map((t) => t.name)).toEqual(['Tower A', 'Tower B'])
    const a = nt[0]
    expect(a.gfa).toBeCloseTo(gfaByUse([towers2[0]]).office + gfaByUse([towers2[0]]).hotel + gfaByUse([towers2[0]]).residential + gfaByUse([towers2[0]]).retail, 3)
    expect(a.gfaByUse.retail).toBeCloseTo(4 * 6400, 0)
    expect(a.core).toMatchObject({ share: 0.09, flag: 'team_assumption' })
    expect(a.core.source).toMatch(/Measured from the core volumes \(Core\)/)
    expect(a.provenance.layers).toEqual(expect.arrayContaining(['Massing::Tower A', 'Massing::Podium', 'Program::Office', 'Core']))
    expect(nt[1].core.source).toMatch(/Sized to the lifts/)
    // The engines run unchanged on the converted towers.
    expect(liftCheck(towers2[0]).rises.length).toBeGreaterThan(0)
    expect(egressCheck(towers2[0]).rules.length).toBeGreaterThan(0)
    // A tower deleted after upload drops out; one added by hand is not the model's.
    expect(toNodeTowers(model, [towers2[1], { ...towers2[0], id: 'other', imported: undefined }])).toHaveLength(1)
  })
})

describe('2. view cones and the height surface: footprints and top heights', () => {
  it('passes the outline and the top (geodetic in Real Vancouver) to the cone check', async () => {
    const { model, towers2 } = await typical()
    const v = toViewConeInputs(model, towers2, 0)
    expect(v.map((x) => x.topZ)).toEqual([285, 150])
    // Tower A's outline includes its podium: 100 x 64 m.
    expect(Math.abs(ringArea(v[0].footprint))).toBeCloseTo(6400, 0)
    const city = toViewConeInputs({ ...model, project: 'city' }, towers2, 32.8)
    expect(city[0].topZ).toBeCloseTo(317.8, 6)
    expect(city[0].heightSource).toMatch(/32\.80 m CGVD28/)
    // Same inputs the check uses: a footprint far from every cone is outside them all.
    expect(checkFootprint(v[0].footprint, v[0].topZ).every((c) => c.state === 'outside')).toBe(true)
  })
})

describe('3. solar access: shadow-casting meshes', () => {
  it('adds the uploaded context as prisms next to the proposal, and they cast shadow', async () => {
    const { model, towers2 } = await typical()
    const s = toShadowCasters(model, towers2)
    expect(s.context.prisms).toHaveLength(3)
    expect(s.context.prisms.map((p) => p.z1).sort()).toEqual([60, 60, 90])
    expect(s.proposal.prisms.length).toBeGreaterThan(60)
    expect(s.note).toMatch(/3 context prisms from typical-two-towers-mm\.3dm/)
    // Low sun from the south: the context building at (90, 60) shades the ground north of it.
    const g = gridOver(60, 40, 140, 200, 2)
    const sun: [number, number, number] = [0, -Math.cos(0.5), Math.sin(0.5)]
    const shade = (o: typeof s.context) => shadowMask(o, g, sun).reduce((a, v) => a + v, 0)
    expect(shade(contextOccluders(model))).toBeGreaterThan(100)
    expect(shade(mergeOccluders(s.proposal, s.context))).toBeGreaterThanOrEqual(shade(s.context))
  })
})

describe('4. public realm: site boundary and podium edges', () => {
  it('gives the site edges with their compass facing and the podium and tower setbacks', async () => {
    const { model, towers2 } = await typical()
    const p = toPublicRealm(model, towers2, 0)
    expect(p.site!.area).toBeCloseTo(TYPICAL.site.w * TYPICAL.site.d, 1)
    expect(p.edges).toHaveLength(4)
    expect(p.edges.map((e) => e.facing).sort()).toEqual(['east', 'north', 'south', 'west'])
    const south = p.edges.find((e) => e.facing === 'south')!
    // Podium y from -32 against the lot line at -39.6: 7.6 m; tower A (y from -20): 19.6 m; tower B is further.
    expect(south.podiumSetback).toBeCloseTo(7.6, 2)
    expect(south.towerSetback).toBeCloseTo(19.6, 2)
    const west = p.edges.find((e) => e.facing === 'west')!
    expect(west.podiumSetback).toBeCloseTo(22.4, 2)
    // Ground floor: the podium's 6400 m² of 11 468 m² (tower B stands inside it, so it adds nothing).
    expect(p.coverage).toBeCloseTo(6400 / (TYPICAL.site.w * TYPICAL.site.d), 3)
    // North turned 45° (the competition model's north): an edge facing +Y faces north-west.
    expect(toPublicRealm(model, towers2, 45).edges.find((e) => Math.abs(e.a[1] - e.b[1]) < 1e-6 && e.a[1] > 0)!.bearing).toBeCloseTo(315, 6)
    expect(toPublicRealm({ ...model, elements: model.elements.filter((e) => e.role !== 'site') }, towers2, 0).site).toBeNull()
  })
})

describe('5. lifts, egress and interior: floor areas by use', () => {
  it('lists every floor with its use and where the use came from', async () => {
    const { model, towers2 } = await typical()
    const [a, b] = toFloorAreas(model, towers2)
    expect(a.floors).toHaveLength(towerFloors(towers2[0]).length)
    expect(a.fromModel).toBe(a.floors.length)
    expect(a.floors.find((f) => f.use === 'hotel')!.useSource).toBe('Program (floor or zone) "hotel zone" (Program::Hotel)')
    expect(a.floors[0].useSource).toBe('Podium "Podium" (Massing::Podium)')
    expect(b.fromModel).toBe(0)
    expect(b.floors[10].useSource).toBe('Program bands')
    const total = Object.values(a.byUse).reduce((s, v) => s + (v ?? 0), 0)
    expect(total).toBeCloseTo(a.floors.reduce((s, f) => s + f.area, 0), 1)
    // A plant floor set in Schematic says so instead of naming the zone.
    const withPlant = { ...towers2[0], plantEvery: 10 }
    expect(toFloorAreas(model, [withPlant])[0].floors.filter((f) => f.useSource === 'Plant floor (Schematic)').length).toBeGreaterThan(0)
  })
})

describe('6. drawings, boards and Present captures', () => {
  it('gives the caption, evidence lines and plan overlays', async () => {
    const { model, towers2 } = await typical()
    const p = toPresent(model, towers2)
    expect(p.caption).toBe('Massing: typical-two-towers-mm.3dm · north unverified · LOD 100')
    expect(p.lines.map((l) => l.flag)).toEqual(['unverified', 'unverified', 'unverified', 'team_assumption', 'team_assumption'])
    expect(p.lines[1].text).toMatch(/Units mm \(from the file\)/)
    expect(p.overlays.site).toHaveLength(1)
    expect(p.overlays.context.map((c) => c.height).sort()).toEqual([60, 60, 90])
    expect(p.overlays.towers.map((t) => t.id)).toEqual(towers2.map((t) => t.id))
  })
})

describe('7. the Customize canvas', () => {
  it('turns the model into a node output with a line per tower and its flags', async () => {
    const { model, towers2 } = await typical()
    const out = toCustomize(model, towers2)
    expect(out.state).toBe('warn') // two items left out (the text dot, the setback line)
    expect(out.headline).toBe('typical-two-towers-mm.3dm: 2 towers · site · 3 context')
    expect(out.items.map((i) => i.id)).toEqual([`model-${towers2[0].id}`, `model-${towers2[1].id}`, 'model-site', 'model-context', 'model-north', 'model-datum', 'model-ignored'])
    expect(out.items.every((i) => i.flag && i.source)).toBe(true)
    expect(toCustomize(null, towers2)).toEqual({ state: 'idle', headline: 'No model uploaded', items: [] })
    expect(toCustomize(model, [towers2[0]]).headline).toMatch(/1 tower \(1 removed since upload\)/)
  })
})

describe('8. export back with roles and provenance, and the round trip', () => {
  const sceneOpts = (meshOf: (id: string) => undefined | { positions: ArrayLike<number>; indices: ArrayLike<number> }) => ({ project: 'vtc' as const, northDeg: 0, groundElevation: 0, utmOrigin: null, meshOf, date: '2026-11-03' })

  it('writes role, use, level, element id and provenance on every object, and the site as a curve', async () => {
    const { model, towers2, towers } = await typical()
    const meshes = new Map(towers.map((t) => [t.tower.imported!.meshId, t.mesh]))
    const scene = toExportScene(towers2, model, sceneOpts((id) => meshes.get(id) as never))
    expect(new Set(scene.solids.map((s) => s.strings.role))).toEqual(new Set(['podium', 'program', 'tower', 'core', 'ignore', 'context']))
    for (const s of scene.solids) expect(s.strings.element_id).toBeTruthy()
    const office = scene.solids.find((s) => s.strings.use === 'office' && s.strings.role === 'program')!
    expect(office.strings).toMatchObject({ tower: 'Tower A', f2f_m: '4.2', podium_top_m: '18', source_file: 'typical-two-towers-mm.3dm', source_layer: 'Program::Office' })
    expect(scene.curves).toHaveLength(1)
    expect(scene.curves[0].strings).toMatchObject({ role: 'site', source_layer: 'Site::Lot line' })
    const { obj } = toObj(scene)
    expect(obj).toMatch(/^l( \d+){5}$/m) // closed lot line: 4 points + back to the first
  })

  it('round trip: Rhino fixture → Layer 0 → .3dm → upload again: same towers, storeys, areas, uses and roles', async () => {
    const { model, towers2, towers, rh } = await typical()
    const meshes = new Map(towers.map((t) => [t.tower.imported!.meshId, t.mesh]))
    const bytes = to3dm(rh, toExportScene(towers2, model, sceneOpts((id) => meshes.get(id) as never)), { northDeg: 0, lat: 49.2827, lon: -123.1207 })
    const raw = read3dmWith(rh, bytes, 'roundtrip.3dm')
    const mapping = autoMapping(raw)
    expect(mapping.by).toBe('userString') // roles read back from the user strings
    expect(mapping.rules).toMatchObject({ program: { role: 'program' }, podium: { role: 'podium' }, tower: { role: 'tower' }, core: { role: 'core' }, site: { role: 'site' }, context: { role: 'context' }, ignore: { role: 'ignore' } })
    const again = buildModel({ raw, mapping, opts: defaultOptions(raw, mapping, frame, 3.5), frame, bands, podiumUse: 'civic' })
    expect(again.blocked).toBeNull()
    expect(again.towers.map((t) => t.tower.name)).toEqual(['Tower A', 'Tower B'])
    again.towers.forEach((t, n) => {
      const before = towerFloors(towers2[n]), after = towerFloors(t.tower)
      expect(after.length).toBe(before.length)
      after.forEach((f, i) => {
        expect(f.use, `${t.tower.name} L${f.level}`).toBe(before[i].use)
        expect(f.podium).toBe(before[i].podium)
        expect(Math.abs(f.area - before[i].area) / before[i].area).toBeLessThan(0.01)
        expect(Math.abs(f.z0 - before[i].z0)).toBeLessThan(0.01)
      })
      expect(t.tower.height).toBeCloseTo(towers2[n].height, 1)
      expect(Math.hypot(t.tower.x - towers2[n].x, t.tower.y - towers2[n].y)).toBeLessThan(0.05)
    })
    expect(again.model.towers[0].coreShare).toBeCloseTo(0.09, 2)
    // Site and context come back with the same element ids and the same geometry.
    const ids = (m: typeof model, role: string) => m.elements.filter((e) => e.role === role).map((e) => e.id).sort()
    expect(ids(again.model, 'site')).toEqual(ids(model, 'site'))
    expect(ids(again.model, 'context')).toEqual(ids(model, 'context'))
    const area = (m: typeof model) => m.elements.filter((e) => e.role === 'site').reduce((s, e) => s + (e.geometry.kind === 'polygon' ? Math.abs(ringArea(e.geometry.rings[0])) : 0), 0)
    expect(area(again.model)).toBeCloseTo(area(model), 1)
    // The uploaded mesh rides along for reference only: listed as ignored, with the reason.
    expect(again.model.ignored.filter((x) => /set to Ignore/.test(x.reason)).length).toBe(2)
  })

  it('round trip through OBJ keeps storeys and areas (OBJ has no user strings: uses come from layer names)', async () => {
    const { model, towers2 } = await typical()
    const { obj } = toObj(toExportScene(towers2, model, sceneOpts(() => undefined)))
    const raw = readObj(obj, 'roundtrip.obj')
    const mapping = autoMapping(raw)
    const opts = { ...defaultOptions(raw, mapping, frame, 4.2), unit: 'm' as const, unitConfirmed: true, upAxis: 'y' as const }
    const again = buildModel({ raw, mapping, opts, frame, bands, podiumUse: 'retail' })
    expect(again.towers.length).toBeGreaterThanOrEqual(1)
    const all = (ts: Tower[]) => ts.reduce((s, t) => s + towerFloors(t).reduce((a, f) => a + f.area, 0), 0)
    expect(Math.abs(all(again.towers.map((t) => t.tower)) - all(towers2)) / all(towers2)).toBeLessThan(0.01)
  })
})

describe('the model in a project file (tower-studio-project@1, optional `models`)', { timeout: 30_000 }, () => {
  it('validates against the schema, reloads unchanged, and old files without it still load', async () => {
    const { model, towers2 } = await typical()
    const d = { ...defaultDesign(), towers: { ...defaultDesign().towers, vtc: towers2 }, selectedTower: towers2[0].id, models: { vtc: model, city: null } }
    const text = exportProject(d)
    const r = readProject(text)
    expect(r.problems).toEqual([])
    expect(toDesign(r.file!).models.vtc).toEqual(model)
    expect(exportProject(toDesign(r.file!))).toBe(text)
    // A file saved before the interchange existed has no `models` key and opens with none.
    const old = readProject(exportProject(defaultDesign()))
    expect(old.ok).toBe(true)
    expect(JSON.parse(exportProject(defaultDesign())).models).toBeUndefined()
    expect(toDesign(old.file!).models).toEqual({ vtc: null, city: null })
    // A broken model is caught by the schema in plain words.
    const bad = JSON.parse(text); bad.models.vtc.elements[0].role = 'roof'
    expect(readProject(JSON.stringify(bad)).problems.join(' ')).toMatch(/role/)
  })
})

describe('placedTriangles: towers as world triangles for the exact cone check (Integrate Vista)', () => {
  it('places the uploaded mesh in EPSG:26910 and CGVD28, or falls back to storey prisms', async () => {
    const { towers } = await typical()
    const a = towers[0]
    const o = { origin: [491300, 5458600] as [number, number], groundElevation: 32.8 }
    const m = placedTriangles(a.tower, a.mesh, o)
    expect(m.source).toBe('mesh')
    expect(m.tris.length).toBe(a.mesh.indices.length * 3)
    const zs = m.tris.filter((_, i) => i % 3 === 2)
    expect(Math.max(...zs)).toBeCloseTo(32.8 + 285, 6)
    expect(Math.min(...m.tris.filter((_, i) => i % 3 === 0))).toBeCloseTo(491300 + a.tower.x - 50, 3)
    const s = placedTriangles(a.tower, undefined, { origin: null, groundElevation: 0 })
    expect(s.source).toBe('storeys')
    expect(s.flag).toBe('unverified')
    expect(Math.max(...s.tris.filter((_, i) => i % 3 === 2))).toBeCloseTo(a.tower.imported!.storeys[a.tower.imported!.storeys.length - 1].z1, 6)
  })
})

describe('placedTriangles on a parametric tower of stacked blocks', () => {
  it('is one closed prism per block, crown included, so offset and twisted blocks are exact', async () => {
    const { towerMasses } = await import('../../engine/massing')
    const t = defaultDesign().towers.vtc[0]
    const r = placedTriangles(t, undefined, { origin: null, groundElevation: 0 })
    expect(r.source).toBe('storeys')
    const masses = towerMasses(t)
    expect(r.tris.length % 9).toBe(0)
    expect(Math.max(...r.tris.filter((_, i) => i % 3 === 2))).toBeCloseTo(Math.max(...masses.map((m) => m.z1)), 6)
    const xs = r.tris.filter((_, i) => i % 3 === 0), ringXs = masses.flatMap((m) => m.ring.map((p) => p[0]))
    expect(Math.min(...xs)).toBeCloseTo(Math.min(...ringXs), 6)
    expect(Math.max(...xs)).toBeCloseTo(Math.max(...ringXs), 6)
  })
})
