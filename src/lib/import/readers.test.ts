import { describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { signedVolume, mergeMeshes } from '../../engine/importGeom'
import { topology } from '../../engine/meshHealth'
import { readObj } from './obj'
import { read3dmWith } from './rhino'
import { IfcAPI, IFCGEOMETRICREPRESENTATIONCONTEXT } from 'web-ifc'
import { readIfcWith } from './ifc'
import { bounds } from '../../engine/importGeom'

// rhino3dm starts its WebAssembly per file; under load (the evaluation run in parallel) that can pass 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe('OBJ reader', () => {
  it('reads groups, quads and negative indices', () => {
    const obj = ['# test', 'o Tower', 'v 0 0 0', 'v 10 0 0', 'v 10 10 0', 'v 0 10 0', 'v 0 0 30', 'v 10 0 30', 'v 10 10 30', 'v 0 10 30',
      'f 1 4 3 2', 'f 5 6 7 8', 'f 1/1/1 2/2/2 6/6/6 5/5/5', 'f 2 3 7 6', 'f 3 4 8 7', 'f -4 -8 -5 -1', 'g Ghost', 'f 1 2 99'].join('\n')
    const r = readObj(obj, 'test.obj')
    expect(r.objects).toHaveLength(1)
    expect(r.objects[0].name).toBe('Tower')
    expect(r.unit).toBeNull()
    expect(r.skipped).toHaveLength(1)
    expect(signedVolume(r.objects[0].mesh)).toBeCloseTo(3000, 6)
    expect(topology(r.objects[0].mesh).openEdges).toBe(0)
  })
})

describe('Rhino 3DM reader (rhino3dm WebAssembly in Node)', () => {
  it('reads units, layers, meshes and extrusions, and lists what it skips', async () => {
    const rh = await rhino3dm()
    const doc = new rh.File3dm()
    doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters
    const layer = doc.layers().addLayer('Massing::Tower', { r: 200, g: 120, b: 100, a: 255 })
    const attrs = new rh.ObjectAttributes()
    attrs.layerIndex = layer
    attrs.name = 'Podium'
    // A mesh box 100 x 64 x 18 m, in mm.
    const m = new rh.Mesh()
    for (const p of [[0, 0, 0], [100000, 0, 0], [100000, 64000, 0], [0, 64000, 0], [0, 0, 18000], [100000, 0, 18000], [100000, 64000, 18000], [0, 64000, 18000]]) m.vertices().add(p[0], p[1], p[2])
    for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) m.faces().addQuadFace(f[0], f[1], f[2], f[3])
    doc.objects().add(m, attrs)
    // An extrusion with no saved mesh (as Rhino's Box or ExtrudeCrv makes): becomes an exact prism.
    const pl = new rh.Polyline(5)
    for (const p of [[30000, 12000, 0], [70000, 12000, 0], [70000, 52000, 0], [30000, 52000, 0], [30000, 12000, 0]]) pl.add(p[0], p[1], p[2])
    const ex = rh.Extrusion.create(pl.toNurbsCurve(), 285000, true)
    const a2 = new rh.ObjectAttributes(); a2.name = 'Tower'; a2.layerIndex = layer
    doc.objects().add(ex, a2)
    // A Brep box saved without render meshes: openNURBS cannot mesh it, but its faces are planar, so they are meshed
    // from their edges (audit 3 Nov 2026, row 9). rhino3dm's typings name it CreateFromBox; the binding is createFromBox.
    const R = rh as any // eslint-disable-line @typescript-eslint/no-explicit-any
    doc.objects().add(R.Brep.createFromBox(new R.Box(new R.BoundingBox([0, 0, 0], [10, 10, 10]))), null as never)
    doc.objects().addLine([0, 0, 0], [1, 1, 1])
    const bytes = doc.toByteArray()

    const r = read3dmWith(rh, bytes, 'massing.3dm')
    expect(r.unit).toBe('mm')
    expect(r.fileNorthDeg).toBeNull()
    expect(r.objects.map((o) => o.name)).toEqual(['Podium', 'Tower', 'object 3'])
    expect(r.objects[1].meshSource).toMatch(/Prism/)
    expect(r.objects[0].layer).toBe('Massing::Tower')
    expect(r.skipped).toEqual([])
    expect(r.objects[2].meshSource).toBe('Exact planar faces rebuilt from the BRep (closed)')
    expect(signedVolume(r.objects[2].mesh)).toBeCloseTo(1000, 6)
    expect(topology(r.objects[2].mesh, 1e-6).openEdges).toBe(0)
    expect(r.curves).toHaveLength(1)
    expect(r.curves![0]).toMatchObject({ kind: 'Curve', closed: false })
    const prism = r.objects[1].mesh
    expect(Math.abs(signedVolume(prism))).toBeCloseTo(40000 * 40000 * 285000, -9)
    expect(signedVolume(prism)).toBeGreaterThan(0)
    const t = topology(mergeMeshes([prism]), 1)
    expect(t.openEdges).toBe(0)
    expect(t.flippedEdges).toBe(0)
  })
})

describe('Rhino 3DM reader: what the audit of 3 Nov 2026 found missing', () => {
  it('places block instances (nested, mirrored), never reads definition geometry alone, and keeps ids, user strings, colours and curves', async () => {
    const rh = await rhino3dm()
    const R = rh as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const doc = new rh.File3dm()
    doc.settings().modelUnitSystem = rh.UnitSystem.Meters
    const ctx = doc.layers().addLayer('Context', { r: 160, g: 150, b: 140, a: 255 })
    const site = doc.layers().addLayer('Site', { r: 0, g: 128, b: 0, a: 255 })
    // Block "Box": a 10 x 10 x 20 m Brep box at the origin (no render mesh).
    const inner = new R.ObjectAttributes(); inner.layerIndex = ctx
    const idx = doc.instanceDefinitions().add('Box', '', '', '', [0, 0, 0], [R.Brep.createFromBox(new R.Box(new R.BoundingBox([0, 0, 0], [10, 10, 20])))], [inner])
    const boxDef = doc.instanceDefinitions().get(idx)
    // Block "Pair": two Box instances, 30 m apart (nested blocks).
    const pairIdx = doc.instanceDefinitions().add('Pair', '', '', '', [0, 0, 0], [new R.InstanceReference(boxDef.id, R.Transform.translationXYZ(0, 0, 0)), new R.InstanceReference(boxDef.id, R.Transform.translationXYZ(30, 0, 0))], [inner, inner])
    const pairDef = doc.instanceDefinitions().get(pairIdx)
    const place = new R.ObjectAttributes(); place.layerIndex = ctx; place.name = 'Neighbours'; place.setUserString('role', 'context')
    doc.objects().addInstanceObject(new R.InstanceReference(pairDef.id, R.Transform.translationXYZ(200, 100, 0)), place)
    // A mirrored instance: normals must still face out.
    const mirror = R.Transform.mirror([500, 0, 0], [1, 0, 0])
    doc.objects().addInstanceObject(new R.InstanceReference(boxDef.id, mirror), place)
    const curveAttr = new R.ObjectAttributes(); curveAttr.layerIndex = site; curveAttr.name = 'Lot line'
    doc.objects().add(new R.PolylineCurve([[0, 0, 0], [80, 0, 0], [80, 60, 0], [0, 60, 0], [0, 0, 0]]), curveAttr)
    const r = read3dmWith(rh, doc.toByteArray(), 'blocks.3dm')
    // 3 boxes placed (two through the nested pair, one mirrored); the definitions' own geometry is not read.
    expect(r.objects).toHaveLength(3)
    const xs = r.objects.map((o) => Math.round(bounds(o.mesh).min[0])).sort((a, b) => a - b)
    expect(xs).toEqual([200, 230, 990])
    for (const o of r.objects) {
      expect(o.layer).toBe('Context')
      expect(o.name).toBe('Neighbours')
      expect(o.userStrings).toEqual({ role: 'context' })
      expect(o.layerColor).toBe('#a0968c')
      expect(o.objectId).toMatch(/^[0-9a-f-]{36}$/)
      expect(signedVolume(o.mesh)).toBeCloseTo(2000, 6)
    }
    expect(r.objects[0].block).toMatch(/^Pair > Box/)
    expect(r.notes.join(' ')).toMatch(/inside block definitions read through their placed instances only/)
    expect(r.curves).toHaveLength(1)
    expect(r.curves![0]).toMatchObject({ name: 'Lot line', layer: 'Site', closed: true })
    expect(r.curves![0].points).toHaveLength(4)
    expect(r.layers!.map((l) => l.path)).toEqual(['Context', 'Site'])
  })
})

/** Minimal IFC4 file: one 40 x 40 x 285 m extruded mass in millimetres, true north 45 degrees counter-clockwise of +Y. */
const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');
FILE_NAME('mass.ifc','2026-10-22T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Test',$,$,$,$,(#20),#7);
#2=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#3=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#4=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#5=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#7=IFCUNITASSIGNMENT((#2,#3,#4,#5));
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCDIRECTION((0.,0.,1.));
#12=IFCDIRECTION((1.,0.,0.));
#13=IFCAXIS2PLACEMENT3D(#10,#11,#12);
#14=IFCDIRECTION((-0.7071067811865476,0.7071067811865476));
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#13,#14);
#21=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#20,$,.MODEL_VIEW.,$);
#30=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$);
#31=IFCLOCALPLACEMENT($,#13);
#40=IFCBUILDING('2YvctVUKr0kugbFTf53O9L',$,'Building',$,$,#41,$,$,.ELEMENT.,$,$,$);
#41=IFCLOCALPLACEMENT(#31,#13);
#50=IFCBUILDINGELEMENTPROXY('3YvctVUKr0kugbFTf53O9L',$,'Tower mass',$,$,#51,#60,$,$);
#51=IFCLOCALPLACEMENT(#41,#13);
#52=IFCCARTESIANPOINT((0.,0.));
#53=IFCAXIS2PLACEMENT2D(#52,$);
#54=IFCRECTANGLEPROFILEDEF(.AREA.,$,#53,40000.,40000.);
#55=IFCEXTRUDEDAREASOLID(#54,#13,#11,285000.);
#56=IFCSHAPEREPRESENTATION(#21,'Body','SweptSolid',(#55));
#60=IFCPRODUCTDEFINITIONSHAPE($,$,(#56));
#70=IFCRELAGGREGATES('4YvctVUKr0kugbFTf53O9L',$,$,$,#1,(#30));
#71=IFCRELAGGREGATES('5YvctVUKr0kugbFTf53O9L',$,$,$,#30,(#40));
#72=IFCRELCONTAINEDINSPATIALSTRUCTURE('6YvctVUKr0kugbFTf53O9L',$,$,$,(#50),#40);
ENDSEC;
END-ISO-10303-21;
`

describe('IFC reader (web-ifc WebAssembly in Node)', { timeout: 30_000 }, () => {
  it('reads a millimetre mass in metres, y-up, with its TrueNorth', async () => {
    const api = new IfcAPI()
    await api.Init()
    const r = readIfcWith(api, new TextEncoder().encode(IFC), 'mass.ifc', IFCGEOMETRICREPRESENTATIONCONTEXT)
    expect(r.objects).toHaveLength(1)
    expect(r.objects[0].name).toBe('Tower mass')
    expect(r.objects[0].layer).toBe('IfcBuildingElementProxy')
    expect(r.fileNorthDeg).toBeCloseTo(-45, 1)
    const b = bounds(r.objects[0].mesh)
    expect(b.max[1] - b.min[1]).toBeCloseTo(285, 3)
    expect(b.max[0] - b.min[0]).toBeCloseTo(40, 3)
    expect(Math.abs(signedVolume(r.objects[0].mesh))).toBeCloseTo(40 * 40 * 285, 0)
  })
})

describe('Rhino items 9 and 10 (3 Nov 2026, after Vista v34 rhino-planar.js and browser-rhino.js)', () => {
  it('rebuilds planar polysurfaces saved without render meshes exactly and reports curved faces, never fakes them', async () => {
    const { noRenderMesh, NO_MESH } = await import('../interchange/fixtures')
    const rh = await rhino3dm()
    const f = noRenderMesh(rh)
    const r = read3dmWith(rh, f.bytes, f.name)
    const byName = (n: string) => r.objects.find((o) => o.name === n)!
    for (const [name, spec] of [['L tower', NO_MESH.lTower], ['Atrium tower', NO_MESH.atrium]] as const) {
      const o = byName(name)
      expect(o.meshSource).toBe('Exact planar faces rebuilt from the BRep (closed)')
      // Volume = plate area x height, in mm³: concave caps and caps with a hole are covered exactly.
      expect(signedVolume(o.mesh) / 1e9).toBeCloseTo(spec.area * spec.height, 3)
      const t = topology(o.mesh, 0.001)
      expect(t.openEdges).toBe(0)
      expect(t.flippedEdges).toBe(0)
    }
    // The cylinder's three faces are all curved (two caps have a circular edge): left out and counted, no bounding box.
    expect(r.objects.find((o) => o.name === 'Round tower')).toBeUndefined()
    const cyl = r.skipped.find((s) => s.name === 'Round tower')!
    expect(cyl.reason).toMatch(/^Saved without render meshes: 3 curved faces not imported\. In Rhino: shade the view/)
  })

  it('places nested, rotated, scaled and mirrored blocks, keeps normals outward, and leaves hidden layers out with a reason', async () => {
    const { nestedBlocks } = await import('../interchange/fixtures')
    const rh = await rhino3dm()
    const f = nestedBlocks(rh)
    const r = read3dmWith(rh, f.bytes, f.name)
    // 3 visible towers x 2 nested stacks; the definitions' own boxes never appear.
    expect(r.objects).toHaveLength(6)
    const of = (n: string) => r.objects.filter((o) => o.name === n)
    for (const n of ['Tower plain', 'Tower rotated and scaled', 'Tower mirrored']) expect(of(n)).toHaveLength(2)
    // Every stack is a closed box with outward normals, including the mirrored ones; the scaled ones are 1.5² larger.
    // (Block meshes keep single-precision vertices, so a rotated and scaled copy is within a few litres.)
    for (const o of r.objects) expect(signedVolume(o.mesh)).toBeCloseTo((o.name === 'Tower rotated and scaled' ? 2.25 : 1) * 20 * 20 * 50, 1)
    // Inner transform first: the upper stack of each tower sits 50 m up.
    expect(of('Tower plain').map((o) => Math.round(bounds(o.mesh).min[2])).sort((a, b) => a - b)).toEqual([0, 50])
    // Rotated 30° about the tower base and moved 100 m east: the corner (15, -15) of the 1.5 x stack lands where R x it says.
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6)
    const xs = of('Tower rotated and scaled').flatMap((o) => { const b = bounds(o.mesh); return [b.max[0]] })
    expect(xs[0]).toBeCloseTo(100 + 15 * c + 15 * s, 4)
    expect(of('Tower mirrored')[0].block).toMatch(/^Tower > Floor stack/)
    expect(r.skipped.find((x) => x.name === 'Tower on a hidden layer')!.reason).toMatch(/^Hidden in Rhino/)
  })
})
