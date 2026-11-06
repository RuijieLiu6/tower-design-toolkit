// Small synthetic Rhino files for the upload tests, the evaluation cases and tools/make_import_fixtures.mjs.
// Never derived from the competition base model. Written with rhino3dm (passed in), so the same builder runs in
// Vitest and in plain Node (the script imports this file directly: plain TypeScript, no runtime imports).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rh = any

export interface FixtureFile { name: string; about: string; bytes: Uint8Array }

/** What the typical file holds, for tests to compare against (metres, before any placement). */
export const TYPICAL = {
  site: { w: 144.8, d: 79.2 },
  podium: { x0: -50, x1: 50, y0: -32, y1: 32, top: 18 },
  towerA: { x0: -40, x1: 0, y0: -20, y1: 20, top: 285 },
  towerB: { x0: 20, x1: 45, y0: -15, y1: 15, top: 150 },
  zones: [{ use: 'office', z0: 18, z1: 150 }, { use: 'hotel', z0: 150, z1: 190 }, { use: 'residential', z0: 190, z1: 285 }],
  core: { x0: -26, x1: -14, y0: -6, y1: 6 },
  context: [{ x: -120, y: 50, w: 30, d: 30, h: 60 }, { x: 90, y: 60, w: 30, d: 30, h: 60 }, { x: -110, y: -70, w: 20, d: 40, h: 90 }],
}

const BOX_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]

function meshBox(rh: Rh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: number) {
  const m = new rh.Mesh()
  for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) m.vertices().add(x * s, y * s, z * s)
  for (const f of BOX_FACES) m.faces().addQuadFace(f[0], f[1], f[2], f[3])
  return m
}
function extrusion(rh: Rh, x0: number, y0: number, x1: number, y1: number, h: number, s: number) {
  const pl = new rh.Polyline(5)
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]) pl.add(x * s, y * s, 0)
  return rh.Extrusion.create(pl.toNurbsCurve(), h * s, true)
}
function brepBox(rh: Rh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: number) {
  return rh.Brep.createFromBox(new rh.Box(new rh.BoundingBox([x0 * s, y0 * s, z0 * s], [x1 * s, y1 * s, z1 * s])))
}
function attrs(rh: Rh, layer: number, name: string, strings: Record<string, string> = {}) {
  const a = new rh.ObjectAttributes()
  a.layerIndex = layer
  a.name = name
  for (const [k, v] of Object.entries(strings)) a.setUserString(k, v)
  return a
}
function earthAnchor(doc: Rh, northDeg: number) {
  const ea = doc.settings().earthAnchorPoint
  ea.earthBasepointLatitude = 49.2827
  ea.earthBasepointLongitude = -123.1207
  const r = (northDeg * Math.PI) / 180
  ea.modelNorth = [Math.sin(r), Math.cos(r), 0]
  ea.modelEast = [Math.cos(r), -Math.sin(r), 0]
  doc.settings().earthAnchorPoint = ea
}

/**
 * A typical practice file, in millimetres with an Earth anchor (north = +Y): two towers on a shared podium, program
 * volumes and a core in tower A, a lot-line curve, context as block instances and an extrusion, an annotation dot and
 * an open setback line. Geometry types on purpose: a Brep without render meshes, extrusions, meshes and blocks.
 */
export function typicalTower(rh: Rh, version: { towerBTop?: number } = {}): FixtureFile {
  const s = 1000, T = TYPICAL
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters
  earthAnchor(doc, 0)
  const L = (path: string, c: [number, number, number]) => doc.layers().addLayer(path, { r: c[0], g: c[1], b: c[2], a: 255 })
  const towerA = L('Massing::Tower A', [31, 95, 139]), towerB = L('Massing::Tower B', [31, 95, 139]), podium = L('Massing::Podium', [127, 159, 184])
  const office = L('Program::Office', [107, 143, 181]), hotel = L('Program::Hotel', [232, 184, 74]), resid = L('Program::Residential', [155, 191, 133])
  const core = L('Core', [43, 63, 85]), site = L('Site::Lot line', [42, 157, 143]), ctx = L('Context', [154, 149, 139])
  const annot = L('Annotation', [0, 0, 0]), setback = L('Setbacks', [200, 0, 0])
  const o = doc.objects()
  o.add(extrusion(rh, T.podium.x0, T.podium.y0, T.podium.x1, T.podium.y1, T.podium.top, s), attrs(rh, podium, 'Podium', { use: 'retail' }))
  o.add(brepBox(rh, T.towerA.x0, T.towerA.y0, 0, T.towerA.x1, T.towerA.y1, T.towerA.top, s), attrs(rh, towerA, 'Tower A shaft', { tower: 'Tower A' }))
  // A later save can change tower B's height (the update and live-link tests).
  o.add(extrusion(rh, T.towerB.x0, T.towerB.y0, T.towerB.x1, T.towerB.y1, version.towerBTop ?? T.towerB.top, s), attrs(rh, towerB, 'Tower B', { tower: 'Tower B' }))
  const zoneLayer: Record<string, number> = { office, hotel, residential: resid }
  for (const z of T.zones) o.add(meshBox(rh, T.towerA.x0, T.towerA.y0, z.z0, T.towerA.x1, T.towerA.y1, z.z1, s), attrs(rh, zoneLayer[z.use], `${z.use} zone`, { use: z.use }))
  o.add(meshBox(rh, T.core.x0, T.core.y0, 0, T.core.x1, T.core.y1, T.towerA.top, s), attrs(rh, core, 'Core A'))
  const hw = T.site.w / 2, hd = T.site.d / 2
  o.add(new rh.PolylineCurve([[-hw * s, -hd * s, 0], [hw * s, -hd * s, 0], [hw * s, hd * s, 0], [-hw * s, hd * s, 0], [-hw * s, -hd * s, 0]]), attrs(rh, site, 'Lot line'))
  // Context: a "Neighbour" block placed twice, and one extrusion.
  const [n1, n2, n3] = T.context
  const def = doc.instanceDefinitions().add('Neighbour', 'Existing building', '', '', [0, 0, 0], [meshBox(rh, -n1.w / 2, -n1.d / 2, 0, n1.w / 2, n1.d / 2, n1.h, s)], [attrs(rh, ctx, 'Neighbour body')])
  const id = doc.instanceDefinitions().get(def).id
  o.addInstanceObject(new rh.InstanceReference(id, rh.Transform.translationXYZ(n1.x * s, n1.y * s, 0)), attrs(rh, ctx, 'Neighbour 1'))
  o.addInstanceObject(new rh.InstanceReference(id, rh.Transform.translationXYZ(n2.x * s, n2.y * s, 0)), attrs(rh, ctx, 'Neighbour 2'))
  o.add(extrusion(rh, n3.x - n3.w / 2, n3.y - n3.d / 2, n3.x + n3.w / 2, n3.y + n3.d / 2, n3.h, s), attrs(rh, ctx, 'Neighbour 3'))
  o.add(new rh.TextDot('Tower A', [-20 * s, 0, 300 * s]), attrs(rh, annot, 'Label'))
  o.add(new rh.PolylineCurve([[-hw * s, (hd - 5) * s, 0], [hw * s, (hd - 5) * s, 0]]), attrs(rh, setback, 'North setback 5 m'))
  return { name: 'typical-two-towers-mm.3dm', about: 'Typical: millimetres, Earth anchor north, two towers on a podium, program volumes, core, lot line, context blocks', bytes: doc.toByteArray() }
}

/** Boundary case: millimetres, no Earth anchor (north unknown), and a context block pasted from a metres file (1000× small). */
export function mixedUnitsNoNorth(rh: Rh): FixtureFile {
  const s = 1000
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters
  const tower = doc.layers().addLayer('Tower', { r: 31, g: 95, b: 139, a: 255 }), ctx = doc.layers().addLayer('Context', { r: 154, g: 149, b: 139, a: 255 })
  doc.objects().add(extrusion(rh, -18, -26, 18, 26, 262, s), attrs(rh, tower, 'Tower'))
  // Pasted from a file in metres without scaling: 30 x 30 x 60 "millimetres".
  doc.objects().add(meshBox(rh, 60, 0, 0, 90, 30, 60, 1), attrs(rh, ctx, 'Pasted neighbour'))
  return { name: 'mixed-units-no-north.3dm', about: 'Boundary: millimetres, no Earth anchor, one context object 1000× too small', bytes: doc.toByteArray() }
}

/** Out of scope: annotation, points and an open curve, but no closed volume to slice. */
export function noGeometry(rh: Rh): FixtureFile {
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Meters
  doc.layers().addLayer('Notes', { r: 0, g: 0, b: 0, a: 255 })
  const notes = doc.layers().count - 1
  doc.objects().add(new rh.TextDot('Tower goes here', [0, 0, 0]), attrs(rh, notes, 'Note'))
  for (const p of [[0, 0, 0], [10, 0, 0], [10, 10, 0]]) doc.objects().add(new rh.Point(p), attrs(rh, notes, 'Survey point'))
  doc.objects().add(new rh.PolylineCurve([[0, 0, 0], [40, 0, 0], [40, 40, 0]]), attrs(rh, notes, 'Sketch line'))
  return { name: 'no-usable-geometry.3dm', about: 'Out of scope: a text dot, three points and an open curve; nothing to slice', bytes: doc.toByteArray() }
}

/** What the no-render-mesh file holds (metres): plates of the two polysurfaces and the curved cylinder's faces. */
export const NO_MESH = {
  lTower: { area: 40 * 40 - 20 * 20, height: 120 },
  atrium: { area: 36 * 36 - 12 * 12, height: 90, x: 80 },
  cylinderFaces: 3,
}

function polyline(rh: Rh, pts: [number, number][], s: number) {
  const pl = new rh.Polyline(pts.length + 1)
  for (const [x, y] of [...pts, pts[0]]) pl.add(x * s, y * s, 0)
  return pl.toNurbsCurve()
}

/**
 * Polysurfaces saved without render meshes, as Rhino writes them with "Save small": an L-shaped tower (concave caps),
 * a tower with an atrium (caps with a hole) and a cylinder (curved faces, which must be reported, never faked).
 * Millimetres, no Earth anchor.
 */
export function noRenderMesh(rh: Rh): FixtureFile {
  const s = 1000
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters
  const tower = doc.layers().addLayer('Tower', { r: 31, g: 95, b: 139, a: 255 })
  const L = rh.Extrusion.create(polyline(rh, [[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]], s), NO_MESH.lTower.height * s, true).toBrep(false)
  doc.objects().add(L, attrs(rh, tower, 'L tower'))
  const x = NO_MESH.atrium.x
  const at = rh.Extrusion.create(polyline(rh, [[x, 0], [x + 36, 0], [x + 36, 36], [x, 36]], s), NO_MESH.atrium.height * s, true)
  // Inner profiles are in the profile plane, whose origin is the outer curve's start point (x, 0).
  at.addInnerProfile(polyline(rh, [[12, 12], [12, 24], [24, 24], [24, 12]], s))
  doc.objects().add(at.toBrep(false), attrs(rh, tower, 'Atrium tower'))
  doc.objects().add(rh.Brep.createFromCylinder(new rh.Cylinder(new rh.Circle([0, 120 * s, 0], 15 * s), 60 * s), true, true), attrs(rh, tower, 'Round tower'))
  return { name: 'no-render-mesh-mm.3dm', about: 'Polysurfaces saved without render meshes: an L-shaped tower and an atrium tower (rebuilt exactly from their planar faces) and a cylinder (curved faces, reported as not imported)', bytes: doc.toByteArray() }
}

/**
 * Blocks done right: a "Floor stack" block nested inside a "Tower" block, placed plainly, rotated 30 degrees and scaled
 * 1.5 in plan, and mirrored; a block on a hidden layer; the definitions' own geometry must never appear. Metres.
 */
export function nestedBlocks(rh: Rh): FixtureFile {
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Meters
  const lay = doc.layers().addLayer('Towers', { r: 31, g: 95, b: 139, a: 255 })
  const hidden = doc.layers().addLayer('Old options', { r: 200, g: 200, b: 200, a: 255 })
  doc.layers().get(hidden).visible = false
  const member = new rh.ObjectAttributes(); member.layerIndex = lay
  // Inner block: a 20 x 20 x 50 m stack of floors (one box), drawn at the origin.
  const stack = doc.instanceDefinitions().add('Floor stack', '', '', '', [0, 0, 0], [meshBox(rh, -10, -10, 0, 10, 10, 50, 1)], [member])
  const stackId = doc.instanceDefinitions().get(stack).id
  // Outer block: two stacks, one above the other (0-50 m and 50-100 m).
  const tower = doc.instanceDefinitions().add('Tower', '', '', '', [0, 0, 0],
    [new rh.InstanceReference(stackId, rh.Transform.translationXYZ(0, 0, 0)), new rh.InstanceReference(stackId, rh.Transform.translationXYZ(0, 0, 50))], [member, member])
  const towerId = doc.instanceDefinitions().get(tower).id
  const place = (name: string, xf: Rh, layer = lay) => doc.objects().addInstanceObject(new rh.InstanceReference(towerId, xf), attrs(rh, layer, name))
  place('Tower plain', rh.Transform.translationXYZ(0, 0, 0))
  const rot = rh.Transform.rotation(Math.PI / 6, [0, 0, 1], [0, 0, 0])
  const scale = rh.Transform.scale([0, 0, 0], 1)
  const xy = rh.Transform.translationXYZ(100, 0, 0)
  // Plan scale 1.5 (x and y), height kept: a non-uniform transform built by hand, then rotated and moved.
  scale.m00 = 1.5; scale.m11 = 1.5
  place('Tower rotated and scaled', rh.Transform.multiply(xy, rh.Transform.multiply(rot, scale)))
  place('Tower mirrored', rh.Transform.multiply(rh.Transform.translationXYZ(0, 100, 0), rh.Transform.mirror([0, 0, 0], [1, 0, 0])))
  place('Tower on a hidden layer', rh.Transform.translationXYZ(-100, 0, 0), hidden)
  return { name: 'nested-blocks-m.3dm', about: 'Blocks: a nested Tower block placed plainly, rotated 30 degrees and scaled 1.5 in plan, mirrored, and once on a hidden layer', bytes: doc.toByteArray() }
}

/**
 * A model as the Rhino link (public/rhino/tdt_link.py 2.x) sends it: metres, its Toolkit layers (tower, below grade,
 * landscape, urban design), a basement volume 6.4 m deep under the tower, and the link's document settings.
 */
export function rhinoLinkModel(rh: Rh): FixtureFile {
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Meters
  const L = (path: string, c: [number, number, number]) => doc.layers().addLayer(path, { r: c[0], g: c[1], b: c[2], a: 255 })
  const tower = L('Toolkit::Tower massing', [31, 95, 139]), below = L('Toolkit::Below grade', [61, 90, 128])
  const land = L('Toolkit::Landscape', [111, 159, 90]), urban = L('Toolkit::Urban design', [179, 154, 107])
  const o = doc.objects()
  o.add(extrusion(rh, -15, -15, 15, 15, 120, 1), attrs(rh, tower, 'Tower'))
  o.add(meshBox(rh, -30, -25, -6.4, 30, 25, 0, 1), attrs(rh, below, 'Parking'))
  o.add(meshBox(rh, 40, -10, 0, 60, 0, 0.3, 1), attrs(rh, land, 'Lawn'))
  o.add(meshBox(rh, 40, 5, 0, 42, 7, 4, 1), attrs(rh, urban, 'Canopy'))
  doc.strings().set('tdt.ground_z', '0')
  doc.strings().set('tdt.basement_f2f', '3.2')
  return { name: 'rhino-link-m.3dm', about: 'The Rhino link: Toolkit layers, a basement under the tower, landscape and a canopy, link settings in document text', bytes: doc.toByteArray() }
}

export function rhinoFixtures(rh: Rh): FixtureFile[] {
  return [typicalTower(rh), mixedUnitsNoNorth(rh), noGeometry(rh), noRenderMesh(rh), nestedBlocks(rh), rhinoLinkModel(rh)]
}
