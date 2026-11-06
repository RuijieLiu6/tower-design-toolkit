// The competition context, built in the browser from the entrant's own copy of Buildner's "Vancouver Tall Base Model.3dm".
// A port of tools/build_vtc_context.py to rhino3dm.js, with the same output (VtcContext in src/context.ts), so the live
// website shows the context without ever publishing Buildner's model: each entrant adds the file they downloaded with the
// brief, and it stays in their browser (lib/vtcContextSource.ts). vtcContextBuild.test.ts checks the port against the
// Python output on the real model.

import type { ContextItem, MeshItem, VtcContext } from '../context'
import { brepMesh, curvePoints } from './import/rhino'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rh = any

/** Centre of the 144.8 x 79.2 m competition site block in the model's own coordinates (measured from the model). */
export const SITE_CENTRE: [number, number] = [439.7, 143.3]
/** Ground-level use hatches, drawn over the same coordinates as the 3D model; the last layer name is the use. */
const USE_PREFIX = 'Ground Level Use Plan::Ground Level Use::'
const SITE_W = 144.8, SITE_D = 79.2

/** 1 cm precision keeps the context small (the Python script rounds the same way). */
const R = (v: number) => Math.round(v * 100) / 100
const local = (x: number, y: number): [number, number] => [R(x - SITE_CENTRE[0]), R(y - SITE_CENTRE[1])]

/** The file opened, but it is not the competition base model (or its site block has moved). */
export class NotTheBaseModel extends Error {}

/** Python's polyline_points: polylines exactly (closing point kept), other curves at 33 points. */
const ring = (c: Rh) => curvePoints(c, 32, true)

/** Builds the competition context from the bytes of the base model. Throws NotTheBaseModel for any other .3dm. */
export function buildVtcContext(rh: Rh, bytes: Uint8Array): VtcContext {
  const doc = rh.File3dm.fromByteArray(bytes)
  if (!doc) throw new NotTheBaseModel('This file could not be opened as a Rhino model.')
  try {
    return build(rh, doc)
  } finally {
    try { doc.delete?.() } catch { /* already freed */ }
  }
}

function build(rh: Rh, doc: Rh): VtcContext {
  const layerTable = doc.layers()
  const layers: string[] = []
  for (let i = 0; i < layerTable.count; i++) {
    try { const l = layerTable.get(i); layers.push(String(l.fullPath || l.name || '')) } catch { layers.push('') }
  }
  const out: VtcContext = {
    meta: {
      source: 'Vancouver Tall Challenge base model (Buildner). Not for redistribution.',
      true_north_deg_clockwise_from_plus_y: 45.0,
      north_note: 'Read from the drawn north arrow. FALSE ASSUMPTION in the file: its saved north is +Y and its saved location is 49.16 N, -123.07 W (Richmond).',
    },
    site: null, blocks: [], curbs: [], plazas: [], midblock: [], buildings: [], heritage: [], future_towers: [], labels: [], ground_uses: [],
  }
  const futureOutlines: { z0: number; ring: [number, number][] }[] = []
  const futureRails: { at: [number, number]; z1: number }[] = []

  const table = doc.objects()
  for (let i = 0; i < table.count; i++) {
    const obj = table.get(i)
    const layer = layers[obj.attributes().layerIndex] ?? ''
    const g = obj.geometry()
    if (!g) continue
    // A use hatch: rhino3dm has no hatch loops, so its outline is read from the planar Brep it converts to.
    if (layer.startsWith(USE_PREFIX)) {
      const brep = g instanceof rh.Hatch ? rh.Brep.tryConvertBrep(g) : null
      if (!brep) continue
      const edges = brep.edges(), rings: [number, number][][] = []
      for (let k = 0; k < edges.count; k++) {
        const r = ring(edges.get(k)).map((p) => local(p[0], p[1]))
        if (r.length >= 4) rings.push(r)
      }
      try { brep.delete?.() } catch { /* freed */ }
      if (rings.length) out.ground_uses!.push({ use: layer.slice(USE_PREFIX.length), rings })
      continue
    }
    if (!layer.startsWith('3D Model')) continue
    const name = layer.split('::').pop() as string

    if (g instanceof rh.Extrusion) {
      const pts = ring(g.profile3d(0, 0))
      const bb = g.getBoundingBox()
      const item: ContextItem = { footprint: pts.slice(0, -1).map((p) => local(p[0], p[1])), z0: R(bb.min[2]), z1: R(bb.max[2]) }
      ;(name === 'Heritage' ? out.heritage : out.buildings).push(item)
    } else if (g instanceof rh.Brep) {
      const target = name === 'Heritage' ? out.heritage : name === 'Plaza' ? out.plazas : name === 'Mid-block Connection' ? out.midblock : name === 'Existing Buildings' ? out.buildings : null
      if (!target) continue
      const m = brepMesh(rh, g).mesh
      if (!m || !m.indices.length) continue
      const positions: number[] = new Array(m.positions.length)
      for (let k = 0; k < m.positions.length; k += 3) {
        positions[k] = R(m.positions[k] - SITE_CENTRE[0])
        positions[k + 1] = R(m.positions[k + 1] - SITE_CENTRE[1])
        positions[k + 2] = R(m.positions[k + 2])
      }
      const item: MeshItem = { positions, indices: Array.from(m.indices) }
      ;(target as ContextItem[]).push(item)
    } else if ((name === 'Block' || name === 'Curb') && (g instanceof rh.PolylineCurve || g instanceof rh.PolyCurve)) {
      const pts = ring(g).map((p) => local(p[0], p[1]))
      if (name === 'Curb') { out.curbs.push(pts); continue }
      const bb = g.getBoundingBox()
      const w = bb.max[0] - bb.min[0], d = bb.max[1] - bb.min[1]
      const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2
      if (Math.abs(w - SITE_W) < 0.5 && Math.abs(d - SITE_D) < 0.5 && Math.abs(cx - SITE_CENTRE[0]) < 1 && Math.abs(cy - SITE_CENTRE[1]) < 1) {
        out.site = { outline: pts, width_m: R(w), depth_m: R(d), area_m2: R(w * d) }
      } else out.blocks.push(pts)
    } else if (name === 'Future Towers' && g instanceof rh.PolylineCurve) {
      const bb = g.getBoundingBox()
      if (bb.max[0] - bb.min[0] > 1 && bb.max[1] - bb.min[1] > 1) futureOutlines.push({ z0: R(bb.min[2]), ring: ring(g).map((p) => local(p[0], p[1])) })
      else futureRails.push({ at: local(bb.min[0], bb.min[1]), z1: R(bb.max[2]) })
    } else if (name === 'Text' && g instanceof rh.Text) {
      const o = g.plane.origin as number[]
      out.labels.push({ text: String(g.plainText).replace(/\r\n|\r|\n/g, ' '), at: local(o[0], o[1]) })
    }
  }

  // Future towers: each footprint outline with the tallest rail standing on it (the top outline of a pair is skipped).
  for (const { z0, ring: r } of futureOutlines) {
    if (z0 > 20) continue
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1]
    const tops = futureRails.filter((t) => t.at[0] >= x0 && t.at[0] <= x1 && t.at[1] >= y0 && t.at[1] <= y1).map((t) => t.z1)
    out.future_towers.push({ footprint: r.slice(0, -1), z0, z1: tops.length ? Math.max(...tops) : null })
  }

  if (!out.site) throw new NotTheBaseModel(`This doesn't look like the Vancouver Tall base model: its "3D Model::Block" layer has no ${SITE_W} × ${SITE_D} m site block at the expected place. Add the unchanged "Vancouver Tall Base Model.3dm" from the competition download.`)
  if (!out.buildings.length && !out.heritage.length) throw new NotTheBaseModel('This doesn\'t look like the Vancouver Tall base model: it has no context buildings on the "3D Model::Existing Buildings" or "3D Model::Heritage" layers.')
  return out
}
