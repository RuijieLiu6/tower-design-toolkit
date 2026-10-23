// IFC reader on web-ifc (That Open Company, MPL-2.0), research P14-S07. Lengths come out in metres (web-ifc applies
// the file's length unit) and y-up, as web-ifc prepares them for three.js. Massing exports only: a detailed model
// would slice its walls, not its floors (the P14-M04 Path B reader is v1).

import type { RawImport, RawObject, Skipped } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Api = any

/** Reads an IFC with an initialised web-ifc IfcAPI (browser: load.ts; tests: Node). */
export function readIfcWith(api: Api, bytes: Uint8Array, fileName: string, contextType: number): RawImport {
  const model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false })
  if (model < 0) throw new Error('web-ifc could not open this IFC file.')
  const schema = String(api.GetModelSchema(model) ?? 'IFC')
  const notes: string[] = []
  const byId = new Map<number, { positions: number[]; indices: number[] }>()
  api.StreamAllMeshes(model, (mesh: any) => {
    const geoms = mesh.geometries
    for (let i = 0; i < geoms.size(); i++) {
      const pg = geoms.get(i)
      const g = api.GetGeometry(model, pg.geometryExpressID)
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()) as Float32Array
      const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize()) as Uint32Array
      const m = pg.flatTransformation as number[]
      let entry = byId.get(mesh.expressID)
      if (!entry) { entry = { positions: [], indices: [] }; byId.set(mesh.expressID, entry) }
      const base = entry.positions.length / 3
      // Vertices are x, y, z, nx, ny, nz; the 4x4 placement is column-major.
      for (let k = 0; k < v.length; k += 6) {
        const x = v[k], y = v[k + 1], z = v[k + 2]
        entry.positions.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14])
      }
      for (let k = 0; k < ix.length; k++) entry.indices.push(ix[k] + base)
      g.delete?.()
    }
  }, true)
  const objects: RawObject[] = []
  const skipped: Skipped[] = []
  for (const [id, e] of byId) {
    let name = `#${id}`, cls = 'IfcProduct'
    try {
      const line = api.GetLine(model, id)
      name = line?.Name?.value || name
      cls = api.GetNameFromTypeCode?.(line.type) || cls
    } catch { /* keep defaults */ }
    const label = prettyClass(cls)
    if (!e.indices.length) { skipped.push({ name, layer: label, kind: label, reason: 'No triangles' }); continue }
    objects.push({ name, layer: label, kind: label, meshSource: 'IFC tessellation (web-ifc)', mesh: { positions: new Float64Array(e.positions), indices: new Uint32Array(e.indices) } })
  }
  // True north from the model context (IfcGeometricRepresentationContext.TrueNorth).
  let fileNorthDeg: number | null = null, northNote = 'No TrueNorth in the IFC model context'
  try {
    const ids = api.GetLineIDsWithType(model, contextType)
    for (let i = 0; i < ids.size(); i++) {
      const ctx = api.GetLine(model, ids.get(i), true)
      const r = ctx?.TrueNorth?.DirectionRatios?.map((d: any) => d.value ?? d) as number[] | undefined
      if (r && r.length >= 2) {
        fileNorthDeg = Math.round(((Math.atan2(r[0], r[1]) * 180) / Math.PI) * 100) / 100
        northNote = `IFC TrueNorth (${r[0].toFixed(3)}, ${r[1].toFixed(3)}): ${fileNorthDeg}° from +Y`
        break
      }
    }
  } catch { /* no context */ }
  api.CloseModel(model)
  if (objects.some((o) => /Wall|Slab|Column|Beam|Window|Door/.test(o.kind))) notes.push('This looks like a detailed model: walls and slabs are sliced as solids. Leave those classes out, or export only the mass.')
  return {
    format: 'ifc', fileName, objects, skipped,
    unit: 'm', unitNote: `${schema}: lengths converted to metres by web-ifc (unverified)`,
    upAxis: 'y', upNote: 'web-ifc returns y-up geometry',
    fileNorthDeg, northNote, notes,
  }
}

function prettyClass(c: string) {
  const s = c.toUpperCase().startsWith('IFC') ? c.slice(3) : c
  const map: Record<string, string> = { BUILDINGELEMENTPROXY: 'BuildingElementProxy', WALL: 'Wall', WALLSTANDARDCASE: 'Wall', SLAB: 'Slab', SPACE: 'Space', COLUMN: 'Column', BEAM: 'Beam', ROOF: 'Roof', WINDOW: 'Window', DOOR: 'Door', CURTAINWALL: 'CurtainWall', MEMBER: 'Member', PLATE: 'Plate', STAIR: 'Stair', RAILING: 'Railing', COVERING: 'Covering', FURNISHINGELEMENT: 'Furniture', SITE: 'Site' }
  return `Ifc${map[s.toUpperCase()] ?? s.charAt(0) + s.slice(1).toLowerCase()}`
}
