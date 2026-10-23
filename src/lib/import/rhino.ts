// Rhino .3dm reader on rhino3dm (openNURBS in WebAssembly, MIT). openNURBS cannot mesh Breps, so a Brep needs the
// render meshes Rhino saves with the file (research P14-S68, P14-S21). Extrusions without a saved mesh become exact
// prisms from their profiles (the P14-M02 fallback mesher, prism route).

import type { Unit } from '../../engine/meshHealth'
import type { RawImport, RawObject, Skipped } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rh = any

const UNIT_NAMES: [string, Unit | null, number][] = [
  ['Millimeters', 'mm', 0.001], ['Centimeters', 'cm', 0.01], ['Meters', 'm', 1], ['Inches', 'in', 0.0254], ['Feet', 'ft', 0.3048],
  ['Decimeters', null, 0.1], ['Kilometers', null, 1000],
]

/** Reads a .3dm with an initialised rhino3dm module (browser: see load.ts; tests: Node). */
export function read3dmWith(rh: Rh, bytes: Uint8Array, fileName: string): RawImport & { unitScaleOverride?: number } {
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
  try {
    const ea = settings.earthAnchorPoint
    if (ea && ea.earthLocationIsSet()) {
      const n = ea.modelNorth as number[]
      fileNorthDeg = Math.round(((Math.atan2(n[0], n[1]) * 180) / Math.PI) * 100) / 100
      northNote = `Rhino Earth anchor: model north ${fileNorthDeg}° from +Y (location ${ea.earthBasepointLatitude.toFixed(3)}, ${ea.earthBasepointLongitude.toFixed(3)})`
    }
  } catch { /* older files */ }
  const layers = doc.layers()
  const layerName = (i: number) => { try { return layers.get(i)?.fullPath || layers.get(i)?.name || `Layer ${i}` } catch { return `Layer ${i}` } }
  const objects: RawObject[] = []
  const skipped: Skipped[] = []
  const table = doc.objects()
  const OT = rh.ObjectType
  for (let i = 0; i < table.count; i++) {
    const o = table.get(i)
    const geo = o.geometry()
    const attr = o.attributes()
    const name = attr.name || `object ${i + 1}`
    const layer = layerName(attr.layerIndex)
    const type = geo.objectType
    const kind = typeName(OT, type)
    try {
      if (type === OT.Mesh) {
        objects.push({ name, layer, kind, meshSource: 'Mesh object', mesh: meshToData(geo) })
      } else if (type === OT.Brep) {
        const faces = geo.faces()
        const parts: { positions: Float64Array; indices: Uint32Array }[] = []
        let missing = 0
        for (let f = 0; f < faces.count; f++) {
          const m = faces.get(f).getMesh(rh.MeshType.Any)
          if (m) parts.push(meshToData(m)); else missing++
        }
        if (!parts.length) skipped.push({ name, layer, kind, reason: 'Saved without render meshes (openNURBS cannot mesh it). In Rhino: shade the view, untick "Save small", save, then import again; or run Mesh and import the mesh.' })
        else {
          if (missing) notes.push(`${name}: ${missing} of ${faces.count} faces had no saved mesh and are missing.`)
          objects.push({ name, layer, kind, meshSource: missing ? 'Saved render mesh (partial)' : 'Saved render mesh', mesh: join(parts) })
        }
      } else if (type === OT.Extrusion) {
        const m = geo.getMesh(rh.MeshType.Any)
        if (m) objects.push({ name, layer, kind, meshSource: 'Saved render mesh', mesh: meshToData(m) })
        else {
          const prism = extrusionPrism(geo)
          if (prism) objects.push({ name, layer, kind, meshSource: 'Prism from the extrusion profile', mesh: prism })
          else skipped.push({ name, layer, kind, reason: 'Extrusion without a saved mesh and with a profile that could not be read' })
        }
      } else if (type === OT.SubD) {
        skipped.push({ name, layer, kind, reason: 'SubD: convert it in Rhino (ToNURBS or Mesh), save, then import again' })
      } else if (type === OT.InstanceReference) {
        skipped.push({ name, layer, kind, reason: 'Block instance: explode blocks in Rhino before importing' })
      } else {
        skipped.push({ name, layer, kind, reason: 'Not a surface or solid (curves, points and notes are not massing)' })
      }
    } catch (e) {
      skipped.push({ name, layer, kind, reason: `Could not read: ${(e as Error).message}` })
    }
  }
  return {
    format: '3dm', fileName, objects, skipped, unit, unitNote, upAxis: 'z', upNote: 'Rhino is z-up',
    fileNorthDeg, northNote, notes, ...(scaleOverride ? { unitScaleOverride: scaleOverride } : {}),
  }
}

function typeName(OT: Rh, t: unknown): string {
  for (const k of ['Mesh', 'Brep', 'Extrusion', 'SubD', 'Curve', 'Point', 'PointSet', 'Annotation', 'InstanceReference', 'TextDot', 'Hatch', 'Surface', 'ClipPlane', 'Light', 'Detail']) if (OT[k] === t) return k
  return 'object'
}

function meshToData(m: Rh): { positions: Float64Array; indices: Uint32Array } {
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

function join(list: { positions: Float64Array; indices: Uint32Array }[]) {
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
function earcutFlat(contours: [number, number][][]): number[] {
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
