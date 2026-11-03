// Writes small synthetic massing files for trying the import (research P14-M02 fixture idea). Never derived from the
// competition base model. Run: node tools/make_import_fixtures.mjs  ->  tools/import-fixtures/
// The Rhino upload fixtures (typical, boundary, out of scope) come from src/lib/interchange/fixtures.ts, the same
// builder the tests and evaluation cases use; Node 22.18+ reads that TypeScript file directly (type stripping).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { rhinoFixtures } from '../src/lib/interchange/fixtures.ts'

const out = join(dirname(fileURLToPath(import.meta.url)), 'import-fixtures')
mkdirSync(out, { recursive: true })

/** Box as 8 vertices + 6 quads (outward), z up. */
function box(x0, y0, z0, x1, y1, z1) {
  return { v: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] }
}
/** Frustum: square base side a at z0 to side b at z1. */
function frustum(a, b, z0, z1) {
  const p = box(0, 0, 0, 1, 1, 1)
  p.v = [[-a / 2, -a / 2, z0], [a / 2, -a / 2, z0], [a / 2, a / 2, z0], [-a / 2, a / 2, z0], [-b / 2, -b / 2, z1], [b / 2, -b / 2, z1], [b / 2, b / 2, z1], [-b / 2, b / 2, z1]]
  return p
}

function obj(parts, { scale = 1, yUp = false, offset = [0, 0, 0], drop = null, flip = null } = {}) {
  const lines = ['# Synthetic massing for Tower Design Toolkit import tests (not a competition model)']
  let base = 1
  parts.forEach(({ name, shape }, pi) => {
    lines.push(`o ${name}`)
    for (const [x, y, z] of shape.v) {
      const X = (x + offset[0]) * scale, Y = (y + offset[1]) * scale, Z = (z + offset[2]) * scale
      lines.push(yUp ? `v ${X} ${Z} ${-Y}` : `v ${X} ${Y} ${Z}`)
    }
    shape.f.forEach((f, fi) => {
      if (drop && drop[0] === pi && drop[1] === fi) return
      const ids = f.map((i) => i + base)
      lines.push(`f ${(flip && flip[0] === pi && flip[1] === fi ? [...ids].reverse() : ids).join(' ')}`)
    })
    base += shape.v.length
  })
  return lines.join('\n') + '\n'
}

const podium = { name: 'Podium', shape: box(-50, -32, 0, 50, 32, 18) }
const shaft = { name: 'Tower', shape: box(-20, -20, 0, 20, 20, 240) }
const crown = { name: 'Crown', shape: frustum(40, 20, 240, 285) }

// 1. Clean podium + tower + tapered crown, in millimetres, y-up (SketchUp-style OBJ). Un-joined boxes overlap.
writeFileSync(join(out, 'podium-tower-mm-yup.obj'), obj([podium, shaft, crown], { scale: 1000, yUp: true }))
// 2. Broken: a missing roof face and one flipped wall, metres, z-up, at UTM 10N coordinates near the City study site.
writeFileSync(join(out, 'broken-tower-utm.obj'), obj([{ name: 'Tower', shape: box(-15, -15, 0, 15, 15, 120) }], { offset: [491636, 5458756, 0], drop: [0, 1], flip: [0, 3] }))

// 3. Rhino file in millimetres: a mesh podium and an extrusion tower saved without a render mesh, Earth anchor set.
const rh = await rhino3dm()
const doc = new rh.File3dm()
doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters
const lay = doc.layers().addLayer('Massing', { r: 200, g: 120, b: 100, a: 255 })
const ctx = doc.layers().addLayer('Context', { r: 160, g: 160, b: 160, a: 255 })
const add = (geo, name, layer) => { const a = new rh.ObjectAttributes(); a.name = name; a.layerIndex = layer; doc.objects().add(geo, a) }
const m = new rh.Mesh()
for (const [x, y, z] of podium.shape.v) m.vertices().add(x * 1000, y * 1000, z * 1000)
for (const f of podium.shape.f) m.faces().addQuadFace(f[0], f[1], f[2], f[3])
add(m, 'Podium', lay)
const pl = new rh.Polyline(5)
for (const [x, y] of [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]]) pl.add(x * 1000, y * 1000, 0)
add(rh.Extrusion.create(pl.toNurbsCurve(), 270000, true), 'Tower', lay)
const nb = new rh.Mesh()
for (const [x, y, z] of box(-120, 40, 0, -80, 80, 60).v) nb.vertices().add(x * 1000, y * 1000, z * 1000)
for (const f of box(0, 0, 0, 1, 1, 1).f) nb.faces().addQuadFace(f[0], f[1], f[2], f[3])
add(nb, 'Neighbour', ctx)
const ea = doc.settings().earthAnchorPoint
ea.earthBasepointLatitude = 49.2827
ea.earthBasepointLongitude = -123.1207
ea.modelNorth = [0, 1, 0]
ea.modelEast = [1, 0, 0]
doc.settings().earthAnchorPoint = ea
writeFileSync(join(out, 'podium-extrusion-mm.3dm'), doc.toByteArray())

// 4. IFC4 mass in millimetres with TrueNorth 45 degrees counter-clockwise of +Y.
writeFileSync(join(out, 'mass-ifc4-mm.ifc'), `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');
FILE_NAME('mass-ifc4-mm.ifc','2026-10-22T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Synthetic mass',$,$,$,$,(#20),#7);
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
#54=IFCRECTANGLEPROFILEDEF(.AREA.,$,#53,36000.,52000.);
#55=IFCEXTRUDEDAREASOLID(#54,#13,#11,262000.);
#56=IFCSHAPEREPRESENTATION(#21,'Body','SweptSolid',(#55));
#60=IFCPRODUCTDEFINITIONSHAPE($,$,(#56));
#70=IFCRELAGGREGATES('4YvctVUKr0kugbFTf53O9L',$,$,$,#1,(#30));
#71=IFCRELAGGREGATES('5YvctVUKr0kugbFTf53O9L',$,$,$,#30,(#40));
#72=IFCRELCONTAINEDINSPATIALSTRUCTURE('6YvctVUKr0kugbFTf53O9L',$,$,$,(#50),#40);
ENDSEC;
END-ISO-10303-21;
`)
// 5-7. Rhino upload and interchange fixtures (3 Nov 2026): typical, boundary (mixed units, no north), out of scope.
const lines = []
for (const f of rhinoFixtures(rh)) {
  writeFileSync(join(out, f.name), f.bytes)
  lines.push(`- \`${f.name}\` (${(f.bytes.length / 1024).toFixed(0)} KB): ${f.about}`)
}
writeFileSync(join(out, 'README.md'), ['# Import fixtures', '', 'Synthetic files written by `node tools/make_import_fixtures.mjs`. Never derived from the competition base model.', '',
  '- `podium-tower-mm-yup.obj`: podium, tower and tapered crown in millimetres, y-up (SketchUp-style OBJ)',
  '- `broken-tower-utm.obj`: a missing roof face and one flipped wall, at UTM 10N coordinates',
  '- `podium-extrusion-mm.3dm`: mesh podium, extrusion tower without a render mesh, context layer, Earth anchor',
  '- `mass-ifc4-mm.ifc`: IFC4 mass in millimetres with TrueNorth', ...lines, ''].join(String.fromCharCode(10)))
console.log('Wrote fixtures to', out)
