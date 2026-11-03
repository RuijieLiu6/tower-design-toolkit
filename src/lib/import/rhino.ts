// Rhino .3dm reader on rhino3dm (openNURBS in WebAssembly, MIT). openNURBS cannot mesh Breps, so a curved Brep needs
// the render meshes Rhino saves with the file (research P14-S68, P14-S21). Planar faces without a saved mesh are meshed
// from their edges here, and extrusions without a saved mesh become exact prisms from their profiles (the P14-M02
// fallback mesher, prism route). Block instances are placed with their transforms; the geometry inside a block
// definition is never read on its own (audit 3 Nov 2026, row 7). Curves are kept for the role mapping (site boundary).

import { topology, type Unit } from '../../engine/meshHealth'
import type { RawCurve, RawImport, RawObject, Skipped } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rh = any
type Mesh = { positions: Float64Array; indices: Uint32Array }
/** Row-major 4 x 4 transform (rhino3dm Transform.toFloatArray(true)). */
type Xf = number[]

const UNIT_NAMES: [string, Unit | null, number][] = [
  ['Millimeters', 'mm', 0.001], ['Centimeters', 'cm', 0.01], ['Meters', 'm', 1], ['Inches', 'in', 0.0254], ['Feet', 'ft', 0.3048],
  ['Decimeters', null, 0.1], ['Kilometers', null, 1000],
]
/** Blocks nested deeper than this are listed as skipped (Rhino allows any depth; massing files rarely go past 3). */
const MAX_BLOCK_DEPTH = 8

export type Progress = (done: number, total: number) => void

interface VisitInfo { name: string; layer: string; layerColor: string; objectId: string; userStrings?: Record<string, string>; block?: string; /** Block definitions above this object, to stop a cycle. */ chain?: string[] }

/** Reads a .3dm with an initialised rhino3dm module (browser: load.ts and reader.worker.ts; tests: Node). */
export function read3dmWith(rh: Rh, bytes: Uint8Array, fileName: string, onProgress?: Progress): RawImport & { unitScaleOverride?: number } {
  const doc = rh.File3dm.fromByteArray(bytes)
  if (!doc) throw new Error('Not a readable Rhino file (rhino3dm could not open it).')
  const settings = doc.settings()
  const notes: string[] = []
  // Units: compare against the enum members (they are objects in rhino3dm.js).
  let unit: Unit | null = null, unitNote = 'Rhino model units: not set'
  let scaleOverride: number | undefined
  for (const [name, u, s] of UNIT_NAMES) {
    if (settings.modelUnitSystem === rh.UnitSystem[name]) {
      unitNote = `Rhino model units: ${name}`
      if (u) unit = u
      else { unit = 'm'; scaleOverride = s; notes.push(`Model units are ${name}; scaled by ${s} to metres.`) }
    }
  }
  // North: Rhino's Earth anchor point carries a model north vector, only meaningful once a location is set.
  let fileNorthDeg: number | null = null, northNote = 'No Earth anchor point in the file: north unknown'
  let earthAnchor: RawImport['earthAnchor']
  try {
    const ea = settings.earthAnchorPoint
    if (ea && ea.earthLocationIsSet()) {
      const n = ea.modelNorth as number[]
      fileNorthDeg = Math.round(((Math.atan2(n[0], n[1]) * 180) / Math.PI) * 100) / 100
      northNote = `Rhino Earth anchor: model north ${fileNorthDeg}° from +Y (location ${ea.earthBasepointLatitude.toFixed(3)}, ${ea.earthBasepointLongitude.toFixed(3)})`
      const bp = Array.from((ea.modelBasePoint ?? [0, 0, 0]) as ArrayLike<number>)
      if ([ea.earthBasepointLatitude, ea.earthBasepointLongitude, ...bp].every(Number.isFinite)) earthAnchor = { lat: ea.earthBasepointLatitude, lon: ea.earthBasepointLongitude, basePoint: [bp[0], bp[1], bp[2]] }
    }
  } catch { /* older files */ }
  // Absolute tolerance of the file (its units): welding for the closed-shell check of rebuilt Breps.
  const tol = Number(settings.modelAbsoluteTolerance) > 0 ? Number(settings.modelAbsoluteTolerance) : 0.001
  const layerTable = doc.layers()
  const layerInfo = new Map<number, { path: string; color: string }>()
  const byId = new Map<string, { visible: boolean; parent: string }>()
  for (let i = 0; i < layerTable.count; i++) {
    try {
      const l = layerTable.get(i)
      layerInfo.set(i, { path: l.fullPath || l.name || `Layer ${i}`, color: hexColor(l.color) })
      byId.set(String(l.id), { visible: l.visible !== false, parent: String(l.parentLayerId ?? '') })
    } catch { /* unreadable layer: objects on it show as "Layer N" */ }
  }
  const layerOf = (i: number) => layerInfo.get(i) ?? { path: `Layer ${i}`, color: '#808080' }
  /** A layer is off when it or any parent layer is off (as Vista's browser-rhino.js reads it). */
  const layerOff = (i: number) => {
    try {
      let id = String(layerTable.get(i).id)
      for (let guard = 0; id && guard < 64; guard++) { const l = byId.get(id); if (!l) return false; if (!l.visible) return true; id = l.parent }
    } catch { /* unreadable: treat as on */ }
    return false
  }
  const objects: RawObject[] = []
  const curves: RawCurve[] = []
  const skipped: Skipped[] = []
  const table = doc.objects()
  const OT = rh.ObjectType

  /** Reads one piece of geometry: a top-level object, or a member of a block placed by `xf`. */
  const visit = (geo: Rh, info: VisitInfo, xf: Xf | null, depth: number) => {
    const type = geo.objectType
    const kind = typeName(OT, type)
    const base = { name: info.name, layer: info.layer, kind, objectId: info.objectId, layerColor: info.layerColor, ...(info.userStrings ? { userStrings: info.userStrings } : {}), ...(info.block ? { block: info.block } : {}) }
    const push = (mesh: Mesh, meshSource: string) => objects.push({ ...base, meshSource: info.block ? `${meshSource}, placed by a block` : meshSource, mesh: xf ? applyXf(mesh, xf) : mesh })
    try {
      if (type === OT.Mesh) {
        push(meshToData(geo), 'Mesh object')
      } else if (type === OT.Brep) {
        const r = brepMesh(rh, geo, tol)
        const lost = r.curved + r.invalid
        const why = [r.curved ? `${r.curved} curved face${r.curved === 1 ? '' : 's'} not imported` : '', r.invalid ? `${r.invalid} planar face${r.invalid === 1 ? '' : 's'} could not be rebuilt exactly (${r.reasons.join('; ')})` : ''].filter(Boolean).join('; ')
        const fix = 'In Rhino: shade the view, untick "Save small", save, then upload again; or run Mesh and upload the mesh.'
        if (!r.mesh) skipped.push({ ...base, reason: `Saved without render meshes: ${why}. ${fix}` })
        else {
          if (lost) notes.push(`${info.name}: ${why} (of ${r.total} faces; saved without render meshes). ${fix}`)
          if (r.manifold && (r.manifold.open || r.manifold.nonManifold) && !lost && geo.isSolid) notes.push(`${info.name}: the rebuilt faces do not close (${r.manifold.open} open, ${r.manifold.nonManifold} non-manifold edges after welding at ${tol} file units).`)
          objects.push({ ...base, meshSource: `${info.block ? `${r.source}, placed by a block` : r.source}${lost ? ` (partial: ${why})` : r.manifold && !r.manifold.open && !r.manifold.nonManifold ? ' (closed)' : ''}`, mesh: xf ? applyXf(r.mesh, xf) : r.mesh, ...(lost ? { facesNotImported: { curved: r.curved, invalid: r.invalid, total: r.total } } : {}) })
        }
      } else if (type === OT.Extrusion) {
        const m = geo.getMesh(rh.MeshType.Any)
        if (m) push(meshToData(m), 'Saved render mesh')
        else {
          const prism = extrusionPrism(geo)
          if (prism) push(prism, 'Prism from the extrusion profile')
          else skipped.push({ ...base, reason: 'Extrusion without a saved mesh and with a profile that could not be read' })
        }
      } else if (type === OT.Curve) {
        const pts = curvePoints(geo).map((p) => (xf ? xfPoint(xf, p) : [p[0], p[1], p[2]]) as [number, number, number])
        curves.push({ ...base, points: pts, closed: !!geo.isClosed })
      } else if (type === OT.SubD) {
        skipped.push({ ...base, reason: 'SubD: convert it in Rhino (ToNURBS or Mesh), save, then upload again' })
      } else if (type === OT.InstanceReference) {
        const idef = doc.instanceDefinitions().findId(geo.parentIdefId)
        if (!idef) { skipped.push({ ...base, reason: 'Block instance whose definition is missing from the file (embed linked blocks before upload)' }); return }
        if ((info.chain ?? []).includes(String(idef.id))) { skipped.push({ ...base, reason: 'Block that contains itself (a cyclic definition)' }); return }
        if (depth >= MAX_BLOCK_DEPTH) { skipped.push({ ...base, reason: `Block nested deeper than ${MAX_BLOCK_DEPTH} levels: explode it in Rhino` }); return }
        const m = Array.from(geo.xform.toFloatArray(true) as ArrayLike<number>)
        const next = xf ? mulXf(xf, m) : m
        const path = info.block ? `${info.block} > ${idef.name}` : String(idef.name)
        for (const id of idef.getObjectIds() as string[]) {
          const member = doc.objects().findId(id)
          if (!member) { skipped.push({ ...base, reason: 'A member of this block is missing from the file' }); continue }
          if (member.attributes().visible === false) continue
          // Members take the instance's layer (where the block was placed) and name; their own layer goes in the block path.
          // Transforms compose outer x inner, so the innermost one applies first.
          const own = layerOf(member.attributes().layerIndex).path
          visit(member.geometry(), { ...info, block: own !== info.layer ? `${path} (member on ${own})` : path, chain: [...(info.chain ?? []), String(idef.id)] }, next, depth + 1)
        }
      } else {
        skipped.push({ ...base, reason: reasonFor(kind) })
      }
    } catch (e) {
      skipped.push({ ...base, reason: `Could not read: ${(e as Error).message}` })
    }
  }

  const total = table.count
  let inDefinitions = 0
  for (let i = 0; i < total; i++) {
    if (onProgress && i % 25 === 0) onProgress(i, total)
    const o = table.get(i)
    const attr = o.attributes()
    // Geometry inside a block definition is placed by its instances, never on its own.
    if (attr.isInstanceDefinitionObject) { inDefinitions++; continue }
    const l = layerOf(attr.layerIndex)
    if (attr.visible === false || layerOff(attr.layerIndex)) {
      skipped.push({ name: attr.name || `object ${i + 1}`, layer: l.path, kind: typeName(OT, o.geometry().objectType), objectId: String(attr.id ?? ''), reason: 'Hidden in Rhino (the object or its layer is off): turn it on and save to include it' })
      continue
    }
    const strings = userStrings(attr)
    visit(o.geometry(), { name: attr.name || `object ${i + 1}`, layer: l.path, layerColor: l.color, objectId: String(attr.id ?? ''), ...(strings ? { userStrings: strings } : {}) }, null, 0)
  }
  onProgress?.(total, total)
  if (inDefinitions) notes.push(`${inDefinitions} object${inDefinitions === 1 ? '' : 's'} inside block definitions read through their placed instances only.`)
  return {
    format: '3dm', fileName, objects, curves, skipped, unit, unitNote, upAxis: 'z', upNote: 'Rhino is z-up',
    layers: [...layerInfo.values()],
    fileNorthDeg, northNote, notes, ...(earthAnchor ? { earthAnchor } : {}), ...(scaleOverride ? { unitScaleOverride: scaleOverride } : {}),
  }
}

function reasonFor(kind: string): string {
  if (kind === 'Point' || kind === 'PointSet') return 'Points carry no massing'
  if (kind === 'TextDot' || kind === 'Annotation') return 'Text and dimensions are annotation, not geometry'
  if (kind === 'Hatch') return 'Hatches are 2D drawing fills'
  if (kind === 'Light' || kind === 'ClipPlane' || kind === 'Detail') return 'Lights, clipping planes and layout details are not geometry'
  if (kind === 'Surface') return 'Open surface: join it into a closed polysurface in Rhino, then upload again'
  return 'Not a surface, solid, mesh or curve'
}

function userStrings(attr: Rh): Record<string, string> | undefined {
  try {
    const list = attr.getUserStrings() as [string, string][]
    if (!list?.length) return undefined
    return Object.fromEntries(list.map(([k, v]) => [String(k), String(v)]))
  } catch { return undefined }
}

function hexColor(c: { r: number; g: number; b: number } | undefined): string {
  if (!c) return '#808080'
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

function mulXf(a: Xf, b: Xf): Xf {
  const out = new Array<number>(16).fill(0)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[4 * r + c] += a[4 * r + k] * b[4 * k + c]
  return out
}
function xfPoint(m: Xf, p: ArrayLike<number>): [number, number, number] {
  const w = m[12] * p[0] + m[13] * p[1] + m[14] * p[2] + m[15] || 1
  return [(m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3]) / w, (m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7]) / w, (m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]) / w]
}
/** A block placed with a mirror turns its triangles inside out; the winding is turned back so normals still face out. */
function applyXf(mesh: Mesh, m: Xf): Mesh {
  const p = mesh.positions, out = new Float64Array(p.length)
  for (let i = 0; i < p.length; i += 3) { const q = xfPoint(m, [p[i], p[i + 1], p[i + 2]]); out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2] }
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])
  if (det >= 0) return { positions: out, indices: mesh.indices }
  const ix = Uint32Array.from(mesh.indices)
  for (let t = 0; t < ix.length; t += 3) { const a = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = a }
  return { positions: out, indices: ix }
}

function typeName(OT: Rh, t: unknown): string {
  for (const k of ['Mesh', 'Brep', 'Extrusion', 'SubD', 'Curve', 'Point', 'PointSet', 'Annotation', 'InstanceReference', 'TextDot', 'Hatch', 'Surface', 'ClipPlane', 'Light', 'Detail']) if (OT[k] === t) return k
  return 'object'
}

function meshToData(m: Rh): Mesh {
  const b = m.toThreejsBuffers(false) as { position: Float32Array; index: Uint32Array; vertexCount: number }
  const verts = m.vertices()
  // Double-precision vertices when the vertex list matches (keeps UTM-sized coordinates exact).
  let positions: Float64Array
  if (verts.count === b.vertexCount) {
    const pts = verts.toPoint3dArray() as number[][]
    positions = new Float64Array(pts.length * 3)
    pts.forEach((p, i) => { positions[3 * i] = p[0]; positions[3 * i + 1] = p[1]; positions[3 * i + 2] = p[2] })
  } else positions = Float64Array.from(b.position)
  let indices = b.index
  if (!indices || !indices.length) indices = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  return { positions, indices: Uint32Array.from(indices) }
}

function join(list: Mesh[]): Mesh {
  let nv = 0, ni = 0
  for (const m of list) { nv += m.positions.length; ni += m.indices.length }
  const positions = new Float64Array(nv), indices = new Uint32Array(ni)
  let pv = 0, pi = 0
  for (const m of list) {
    positions.set(m.positions, pv)
    for (let i = 0; i < m.indices.length; i++) indices[pi + i] = m.indices[i] + pv / 3
    pv += m.positions.length; pi += m.indices.length
  }
  return { positions, indices }
}

export interface BrepResult {
  mesh: Mesh | null
  total: number
  /** Faces with saved render meshes, faces rebuilt exactly from their planar edges, curved faces left out, invalid planar faces left out. */
  saved: number
  planar: number
  curved: number
  invalid: number
  source: string
  /** Rebuilt solid: open (naked) and non-manifold edges after welding at the file tolerance; null when nothing was rebuilt. */
  manifold: { open: number; nonManifold: number } | null
  reasons: string[]
}

/**
 * Mesh of a Brep: the render mesh Rhino saved for each face, else (planar faces bounded by straight or polyline edges
 * only) the face rebuilt exactly from its BRep topology, after Vista's rhino-planar.js (Ruijie Liu, Vista v34): loops
 * from the trims' edges in trim order, one outer loop, every point on the plane, no crossing or touching boundaries,
 * ear clipping, then an area check that the triangles cover exactly the face. Curved faces (or planar faces with a
 * curved edge) are never sampled or replaced by boxes: they are counted as "curved face not imported".
 */
export function brepMesh(rh: Rh, brep: Rh, tol = 0.001): BrepResult {
  const faces = brep.faces()
  const edges = brep.edges()
  const parts: Mesh[] = []
  const reasons: string[] = []
  let saved = 0, planar = 0, curved = 0, invalid = 0
  for (let f = 0; f < faces.count; f++) {
    const face = faces.get(f)
    const m = face.getMesh(rh.MeshType.Any)
    if (m) { parts.push(meshToData(m)); saved++; continue }
    const r = planarFace(rh, face, edges)
    if ('mesh' in r) { parts.push(r.mesh); planar++ }
    else { if (r.curved) curved++; else { invalid++; reasons.push(r.reason) } }
  }
  const mesh = parts.length ? join(parts) : null
  let manifold: BrepResult['manifold'] = null
  if (mesh && planar) {
    const t = topology(mesh, Math.max(tol, 1e-9))
    manifold = { open: t.openEdges, nonManifold: t.nonManifoldEdges }
  }
  const source = saved && planar ? 'Saved render mesh + exact planar faces rebuilt from the BRep' : saved ? 'Saved render mesh' : 'Exact planar faces rebuilt from the BRep'
  return { mesh, total: faces.count, saved, planar, curved, invalid, source, manifold, reasons: [...new Set(reasons)] }
}

type FaceResult = { mesh: Mesh } | { curved: boolean; reason: string }

/** One planar face from its trimming loops, or why it cannot be rebuilt exactly. */
function planarFace(rh: Rh, face: Rh, edges: Rh): FaceResult {
  const fail = (reason: string, curved = false): FaceResult => ({ curved, reason })
  try {
    const loops = face.loops
    if (!loops || loops.count < 1 || loops.count > 128) return fail('invalid or excessive boundary loops')
    const OUTER = rh.BrepLoopType.Outer.value, INNER = rh.BrepLoopType.Inner.value
    const rings: { outer: boolean; segments: number[][][] }[] = []
    let vertices = 0
    for (let l = 0; l < loops.count; l++) {
      const loop = loops.get(l), kind = loop.loopType?.value
      if (kind !== OUTER && kind !== INNER) return fail('unsupported trim loop (slit or curve on surface)')
      const trims = loop.trims
      if (!trims || trims.count < 1 || trims.count > 2048) return fail('invalid or excessive trims')
      const segments: number[][][] = []
      for (let k = 0; k < trims.count; k++) {
        const trim = trims.get(k)
        const ei = trim.edgeIndex
        if (!Number.isInteger(ei) || ei < 0 || ei >= edges.count) return fail('a trim has no boundary edge')
        // The edge's own polygon: a straight line or a polyline. A curved edge is never sampled.
        const pts = edgePolyline(edges.get(ei))
        if (!pts) return fail('curved boundary edge', true)
        if (trim.isReversed) pts.reverse()
        vertices += pts.length - 1
        if (vertices > 2048) return fail('more than 2048 boundary vertices: save render meshes in Rhino')
        segments.push(pts)
      }
      rings.push({ outer: kind === OUTER, segments })
    }
    const all = rings.flatMap((r) => r.segments.flat())
    const span = Math.max(...[0, 1, 2].map((k) => Math.max(...all.map((p) => p[k])) - Math.min(...all.map((p) => p[k]))))
    const magnitude = Math.max(1, ...all.flat().map(Math.abs))
    const eps = Math.max(span * 1e-10, magnitude * Number.EPSILON * 32, 1e-12), areaEps = eps * Math.max(span, eps)
    if (!(span > eps)) return fail('degenerate face')
    if (!face.isPlanar(Math.max(eps, span * 1e-9))) return fail('curved face', true)
    // Chain each loop's segments in trim order; the end of one must meet the start of the next.
    const closed: { outer: boolean; points: number[][] }[] = []
    for (const r of rings) {
      const points: number[][] = []
      for (const s of r.segments) {
        if (points.length && dist(points[points.length - 1], s[0]) > eps * 1e3) return fail('disconnected trims')
        points.push(...(points.length ? s.slice(1) : s))
      }
      if (dist(points[0], points[points.length - 1]) > eps * 1e3) return fail('open trim boundary')
      points.pop()
      const clean = points.filter((p, i) => !i || dist(p, points[i - 1]) > eps)
      if (clean.length < 3) return fail('degenerate boundary')
      closed.push({ outer: r.outer, points: clean })
    }
    const outers = closed.filter((r) => r.outer)
    if (outers.length !== 1) return fail('a planar face needs exactly one outer boundary')
    const ordered = [outers[0], ...closed.filter((r) => !r.outer)]
    // Plane frame: the surface normal (flipped with the face's orientation) and an in-plane axis.
    const [u0, u1] = face.domain(0) as number[], [v0, v1] = face.domain(1) as number[]
    let n = face.normalAt((u0 + u1) / 2, (v0 + v1) / 2) as number[]
    if (!n || n.some((x) => !Number.isFinite(x)) || Math.hypot(n[0], n[1], n[2]) < 0.5) return fail('invalid surface normal')
    n = norm(n).map((x) => (face.orientationIsReversed ? -x : x))
    const origin = ordered[0].points[0]
    let ax = ordered[0].points.map((p) => sub(p, origin)).reduce((a, b) => (dot(a, a) > dot(b, b) ? a : b))
    ax = sub(ax, n.map((x) => x * dot(ax, n)))
    if (Math.hypot(ax[0], ax[1], ax[2]) <= eps) return fail('degenerate plane frame')
    ax = norm(ax)
    const ay = cross(n, ax)
    const flat: [number, number][][] = []
    for (const r of ordered) {
      const ring: [number, number][] = []
      for (const p of r.points) {
        const d = sub(p, origin)
        if (Math.abs(dot(d, n)) > Math.max(eps * 4, span * 1e-7)) return fail('boundary not on its plane')
        ring.push([dot(d, ax), dot(d, ay)])
      }
      flat.push(ring)
    }
    // No crossing or touching boundaries; holes inside the outer ring and not inside each other.
    for (let a = 0; a < flat.length; a++) {
      if (Math.abs(area2(flat[a])) / 2 <= areaEps) return fail('zero-area boundary')
      for (let i = 0; i < flat[a].length; i++) for (let b = a; b < flat.length; b++) for (let j = b === a ? i + 1 : 0; j < flat[b].length; j++) {
        if (b === a && (j === i + 1 || (i === 0 && j === flat[a].length - 1))) continue
        if (segmentsTouch(flat[a][i], flat[a][(i + 1) % flat[a].length], flat[b][j], flat[b][(j + 1) % flat[b].length], eps, areaEps)) return fail('crossing or touching boundaries')
      }
      if (a && !inPolygon(flat[0], flat[a][0])) return fail('a hole lies outside the boundary')
      for (let b = 1; b < a; b++) if (inPolygon(flat[b], flat[a][0]) || inPolygon(flat[a], flat[b][0])) return fail('nested holes')
    }
    // Outer ring counter-clockwise, holes clockwise in the plane frame, so the triangles face along n.
    const rings3 = ordered.map((r) => r.points)
    flat.forEach((r, i) => { if ((i === 0) !== (area2(r) > 0)) { r.reverse(); rings3[i] = [...rings3[i]].reverse() } })
    const tris = earcutFlat(flat)
    const pts2 = flat.flat()
    const target = Math.abs(area2(flat[0])) / 2 - flat.slice(1).reduce((s, r) => s + Math.abs(area2(r)) / 2, 0)
    if (!tris.length || tris.length % 3 || !(target > areaEps)) return fail('could not be triangulated')
    let covered = 0
    for (let t = 0; t < tris.length; t += 3) {
      const a = pts2[tris[t]], b = pts2[tris[t + 1]], c = pts2[tris[t + 2]]
      const twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      if (Math.abs(twice) <= areaEps) return fail('degenerate triangle')
      const g: [number, number] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
      if (!inPolygon(flat[0], g) || flat.slice(1).some((h) => inPolygon(h, g))) return fail('a triangle falls outside the face')
      covered += Math.abs(twice) / 2
      if (twice < 0) { const s = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = s }
    }
    // Area check: the triangles cover the face exactly (Vista's tolerance).
    if (Math.abs(covered - target) > Math.max(target * 1e-9, areaEps * tris.length)) return fail('triangles do not cover the face')
    return { mesh: { positions: Float64Array.from(rings3.flat().flat()), indices: Uint32Array.from(tris) } }
  } catch (e) {
    return fail(`could not be read (${(e as Error).message})`)
  }
}

/** Points of a straight or polyline edge; null for a curved one. */
function edgePolyline(e: Rh): number[][] | null {
  try {
    const pl = e.tryGetPolyline?.()
    if (pl && typeof pl.count === 'number' && pl.count >= 2) { const out: number[][] = []; for (let i = 0; i < pl.count; i++) out.push(Array.from(pl.get(i) as number[])); if (out.every((p) => p.length === 3 && p.every(Number.isFinite))) return out }
  } catch { /* not a polyline */ }
  try { if (e.isLinear(1e-9)) return [Array.from(e.pointAtStart as number[]), Array.from(e.pointAtEnd as number[])] } catch { /* curved */ }
  return null
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const area2 = (r: [number, number][]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
const orient2 = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
function onSeg(a: [number, number], b: [number, number], p: [number, number], eps: number, areaEps: number) {
  return Math.abs(orient2(a, b, p)) <= areaEps && p[0] >= Math.min(a[0], b[0]) - eps && p[0] <= Math.max(a[0], b[0]) + eps && p[1] >= Math.min(a[1], b[1]) - eps && p[1] <= Math.max(a[1], b[1]) + eps
}
function segmentsTouch(a: [number, number], b: [number, number], c: [number, number], d: [number, number], eps: number, areaEps: number) {
  const x = orient2(a, b, c), y = orient2(a, b, d), z = orient2(c, d, a), w = orient2(c, d, b)
  return (((x > areaEps && y < -areaEps) || (x < -areaEps && y > areaEps)) && ((z > areaEps && w < -areaEps) || (z < -areaEps && w > areaEps)))
    || onSeg(a, b, c, eps, areaEps) || onSeg(a, b, d, eps, areaEps) || onSeg(c, d, a, eps, areaEps) || onSeg(c, d, b, eps, areaEps)
}
function inPolygon(ring: [number, number][], p: [number, number]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** Samples a curve into points (polylines exactly, curves at 48 steps). */
function curvePoints(c: Rh): number[][] {
  const [t0, t1] = c.domain as number[]
  let pts: number[][] | null = null
  try {
    const pl = c.tryGetPolyline?.()
    if (pl && typeof pl.count === 'number' && pl.count >= 3) { pts = []; for (let i = 0; i < pl.count; i++) pts.push(pl.get(i)) }
    else if (pl && Array.isArray(pl) && pl.length >= 3) pts = pl
  } catch { pts = null }
  if (!pts) { pts = []; for (let i = 0; i <= 48; i++) pts.push(c.pointAt(t0 + ((t1 - t0) * i) / 48)) }
  // Drop the closing duplicate.
  const a = pts[0], b = pts[pts.length - 1]
  if (pts.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9) pts = pts.slice(0, -1)
  return pts
}

/** Exact prism of a capped extrusion: walls between the bottom and top profiles, caps triangulated in the profile plane. */
export function extrusionPrism(ex: Rh): { positions: Float64Array; indices: Uint32Array } | null {
  const n = ex.profileCount as number
  if (!n || !ex.isCappedAtBottom || !ex.isCappedAtTop) return null
  const s = ex.pathStart as number[], e = ex.pathEnd as number[]
  const up = norm([e[0] - s[0], e[1] - s[1], e[2] - s[2]])
  const ref = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = norm(cross(ref, up)), v = cross(up, u)
  const rings: { bot: number[][]; top: number[][] }[] = []
  for (let i = 0; i < n; i++) {
    const bot = curvePoints(ex.profile3d(i, 0)), top = curvePoints(ex.profile3d(i, 1))
    if (bot.length !== top.length || bot.length < 3) return null
    rings.push({ bot, top })
  }
  const positions: number[] = [], indices: number[] = []
  const flat = (r: number[][]) => r.map((p) => [dot(p, u), dot(p, v)] as [number, number])
  const area = (r: [number, number][]) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0) / 2
  const capContours: [number, number][][] = []
  const capBot: number[][][] = [], capTop: number[][][] = []
  rings.forEach((r, i) => {
    let bot = r.bot, top = r.top
    const a = area(flat(bot))
    // Outer ring counter-clockwise about the path, holes clockwise: walls then face out.
    if ((i === 0 && a < 0) || (i > 0 && a > 0)) { bot = [...bot].reverse(); top = [...top].reverse() }
    const base = positions.length / 3, m = bot.length
    for (const p of bot) positions.push(p[0], p[1], p[2])
    for (const p of top) positions.push(p[0], p[1], p[2])
    for (let k = 0; k < m; k++) {
      const k2 = (k + 1) % m
      indices.push(base + k, base + k2, base + m + k2, base + k, base + m + k2, base + m + k)
    }
    capContours.push(flat(bot)); capBot.push(bot); capTop.push(top)
  })
  const tris = earcutFlat(capContours)
  const allBot = capBot.flat(), allTop = capTop.flat()
  const b0 = positions.length / 3
  for (const p of allBot) positions.push(p[0], p[1], p[2])
  const t0 = positions.length / 3
  for (const p of allTop) positions.push(p[0], p[1], p[2])
  for (let k = 0; k < tris.length; k += 3) {
    indices.push(b0 + tris[k], b0 + tris[k + 2], b0 + tris[k + 1]) // bottom faces down
    indices.push(t0 + tris[k], t0 + tris[k + 1], t0 + tris[k + 2])
  }
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) }
}

// Ear clipping for one outer ring with holes joined by bridges (small profiles only; massing caps are simple).
export function earcutFlat(contours: [number, number][][]): number[] {
  // Build one polygon by bridging each hole to the outer ring at its nearest vertex.
  const pts: [number, number][] = []
  const idx: number[] = []
  let ring = contours[0].map((p, i) => i)
  contours[0].forEach((p) => pts.push(p))
  for (let h = 1; h < contours.length; h++) {
    const hole = contours[h]
    const off = pts.length
    hole.forEach((p) => pts.push(p))
    // Rightmost hole vertex to the nearest outer vertex.
    let hi = 0
    hole.forEach((p, i) => { if (p[0] > hole[hi][0]) hi = i })
    let best = 0, bd = Infinity
    ring.forEach((ri, k) => { const d = Math.hypot(pts[ri][0] - hole[hi][0], pts[ri][1] - hole[hi][1]); if (d < bd) { bd = d; best = k } })
    const holeSeq = hole.map((_, i) => off + ((hi + i) % hole.length))
    ring = [...ring.slice(0, best + 1), ...holeSeq, off + hi, ...ring.slice(best)]
  }
  const V = [...ring]
  const area2 = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  let guard = 0
  while (V.length > 3 && guard++ < 10000) {
    let clipped = false
    for (let i = 0; i < V.length; i++) {
      const a = V[(i - 1 + V.length) % V.length], b = V[i], c = V[(i + 1) % V.length]
      if (area2(pts[a], pts[b], pts[c]) <= 1e-12) continue
      let inside = false
      for (const p of V) {
        if (p === a || p === b || p === c) continue
        const q = pts[p]
        if (area2(pts[a], pts[b], q) >= 0 && area2(pts[b], pts[c], q) >= 0 && area2(pts[c], pts[a], q) >= 0 && !(q[0] === pts[a][0] && q[1] === pts[a][1]) && !(q[0] === pts[c][0] && q[1] === pts[c][1])) { inside = true; break }
      }
      if (inside) continue
      idx.push(a, b, c)
      V.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (V.length === 3) idx.push(V[0], V[1], V[2])
  return idx
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
