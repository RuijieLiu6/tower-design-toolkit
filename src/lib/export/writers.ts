// File writers for an ExportScene (lib/export/scene.ts): OBJ + MTL (SketchUp, Revit via conversion, most tools)
// and Rhino .3dm through rhino3dm (passed in, so the WebAssembly module loads only on export and in tests).
import type { ExportScene } from './scene'

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'material'

/** OBJ (Y up by convention: x, z, −y) and its MTL, with one material per layer. */
export function toObj(scene: ExportScene, mtlName = 'model.mtl'): { obj: string; mtl: string } {
  const lines = ['# Tower Design Toolkit massing export (LOD 100), metres, Y up', ...Object.entries(scene.notes).map(([k, v]) => `# ${k}: ${v}`), `mtllib ${mtlName}`]
  let base = 1
  for (const s of scene.solids) {
    lines.push(`o ${slug(s.name)}`, `usemtl ${slug(s.layer)}`)
    for (let i = 0; i < s.positions.length; i += 3) lines.push(`v ${s.positions[i].toFixed(4)} ${s.positions[i + 2].toFixed(4)} ${(-s.positions[i + 1]).toFixed(4)}`)
    for (let i = 0; i < s.indices.length; i += 3) lines.push(`f ${s.indices[i] + base} ${s.indices[i + 1] + base} ${s.indices[i + 2] + base}`)
    base += s.positions.length / 3
  }
  for (const c of scene.curves ?? []) {
    lines.push(`o ${slug(c.name)}`, `usemtl ${slug(c.layer)}`)
    for (let i = 0; i < c.points.length; i += 3) lines.push(`v ${c.points[i].toFixed(4)} ${c.points[i + 2].toFixed(4)} ${(-c.points[i + 1]).toFixed(4)}`)
    const n = c.points.length / 3
    lines.push(`l ${Array.from({ length: n }, (_, i) => base + i).concat(c.closed ? [base] : []).join(' ')}`)
    base += n
  }
  const mtl = ['# Tower Design Toolkit materials: one per layer']
  for (const l of scene.layers) mtl.push(`newmtl ${slug(l.path)}`, `Kd ${(l.color[0] / 255).toFixed(4)} ${(l.color[1] / 255).toFixed(4)} ${(l.color[2] / 255).toFixed(4)}`, 'Ka 0 0 0', 'd 1', '')
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Rhino .3dm (metres): layers with colours, mesh objects with names and user strings, document user text, model north. */
export function to3dm(rh: any, scene: ExportScene, o: { northDeg: number; lat: number; lon: number }): Uint8Array {
  const doc = new rh.File3dm()
  doc.settings().modelUnitSystem = rh.UnitSystem.Meters
  const layerIndex = new Map<string, number>()
  for (const l of scene.layers) layerIndex.set(l.path, doc.layers().addLayer(l.path, { r: l.color[0], g: l.color[1], b: l.color[2], a: 255 }))
  for (const s of scene.solids) {
    const m = new rh.Mesh()
    for (let i = 0; i < s.positions.length; i += 3) m.vertices().add(s.positions[i], s.positions[i + 1], s.positions[i + 2])
    for (let i = 0; i < s.indices.length; i += 3) m.faces().addTriFace(s.indices[i], s.indices[i + 1], s.indices[i + 2])
    m.normals().computeNormals()
    m.compact()
    const a = new rh.ObjectAttributes()
    a.name = s.name
    a.layerIndex = layerIndex.get(s.layer) ?? 0
    for (const [k, v] of Object.entries(s.strings)) a.setUserString(k, v)
    doc.objects().add(m, a)
  }
  for (const c of scene.curves ?? []) {
    const pts: number[][] = []
    for (let i = 0; i < c.points.length; i += 3) pts.push([c.points[i], c.points[i + 1], c.points[i + 2]])
    if (c.closed && pts.length) pts.push(pts[0])
    const a = new rh.ObjectAttributes()
    a.name = c.name
    a.layerIndex = layerIndex.get(c.layer) ?? 0
    for (const [k, v] of Object.entries(c.strings)) a.setUserString(k, v)
    doc.objects().add(new rh.PolylineCurve(pts), a)
  }
  for (const [k, v] of Object.entries(scene.notes)) doc.strings().set(k, v)
  // Model north on the Earth anchor point (Rhino reads north from it once a location is set).
  try {
    const ea = doc.settings().earthAnchorPoint
    const r = (o.northDeg * Math.PI) / 180
    ea.modelNorth = [Math.sin(r), Math.cos(r), 0]
    ea.modelEast = [Math.cos(r), -Math.sin(r), 0]
    ea.earthBasepointLatitude = o.lat
    ea.earthBasepointLongitude = o.lon
    doc.settings().earthAnchorPoint = ea
  } catch { /* older rhino3dm: north stays in the document user text */ }
  return doc.toByteArray()
}
