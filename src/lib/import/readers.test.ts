import { describe, expect, it } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { signedVolume, mergeMeshes } from '../../engine/importGeom'
import { topology } from '../../engine/meshHealth'
import { readObj } from './obj'
import { read3dmWith } from './rhino'
import { IfcAPI, IFCGEOMETRICREPRESENTATIONCONTEXT } from 'web-ifc'
import { readIfcWith } from './ifc'
import { bounds } from '../../engine/importGeom'

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
    // A Brep box saved without render meshes: openNURBS cannot mesh it, so it must be listed as skipped.
    // rhino3dm's typings name it CreateFromBox; the binding is createFromBox.
    const R = rh as any // eslint-disable-line @typescript-eslint/no-explicit-any
    doc.objects().add(R.Brep.createFromBox(new R.Box(new R.BoundingBox([0, 0, 0], [10, 10, 10]))), null as never)
    doc.objects().addLine([0, 0, 0], [1, 1, 1])
    const bytes = doc.toByteArray()

    const r = read3dmWith(rh, bytes, 'massing.3dm')
    expect(r.unit).toBe('mm')
    expect(r.fileNorthDeg).toBeNull()
    expect(r.objects.map((o) => o.name)).toEqual(['Podium', 'Tower'])
    expect(r.objects[1].meshSource).toMatch(/Prism/)
    expect(r.objects[0].layer).toBe('Massing::Tower')
    expect(r.skipped.map((s) => s.kind)).toEqual(['Brep', 'Curve'])
    const prism = r.objects[1].mesh
    expect(Math.abs(signedVolume(prism))).toBeCloseTo(40000 * 40000 * 285000, -9)
    expect(signedVolume(prism)).toBeGreaterThan(0)
    const t = topology(mergeMeshes([prism]), 1)
    expect(t.openEdges).toBe(0)
    expect(t.flippedEdges).toBe(0)
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

describe('IFC reader (web-ifc WebAssembly in Node)', () => {
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
