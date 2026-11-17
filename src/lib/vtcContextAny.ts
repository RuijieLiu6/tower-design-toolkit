// Any model as the competition context (Ruijie, 17 Nov: "users can upload new model blocks … the competition page does not
// need a block to bound the model; let users upload any model of their own"). The competition base model keeps its own
// reader (lib/vtcContextBuild.ts: layers, future towers, ground uses); every other file, in any format the massing import
// reads (3DM, OBJ, glTF, IFC), comes here as a RawImport and becomes a VtcContext: each solid a context building, a closed
// curve on a site / block / lot layer the site line. No layer names, no block size and no place are required.
//
// Where it lands: a file still in Buildner's coordinates (its plan box holds the competition block's centre) keeps them,
// moved by the same offset as the base model; a file in the Toolkit's own competition frame (its export, or any model
// around the origin) stays where it is; anything else is centred on the competition site, its lowest point at street
// level. Each choice is written into the context's notes, so the dock can say what was assumed.

import type { MeshItem, VtcContext } from '../context'
import { UNIT_LABEL, UNIT_SCALE, type Unit } from '../engine/meshHealth'
import type { RawImport } from './import/types'
import { SITE_CENTRE } from './vtcContextBuild'

/** 1 cm precision, like the base model's context. */
const R = (v: number) => Math.round(v * 100) / 100
/** A closed curve on a layer named like this (or named like this itself) is the site line. */
const SITE_LAYER = /\b(site|block|lot|property|boundary|parcel)\b/i
/** Plan sizes a context model plausibly spans, in metres. */
const MIN_SPAN = 5, MAX_SPAN = 20_000

export interface ContextBuild { ctx: VtcContext; notes: string[] }

/** The unit a file without one (OBJ) is most likely in: the first whose plan span is a plausible city model. */
function unitFor(raw: RawImport, span: number): { unit: Unit; note: string } {
  if (raw.unit) return { unit: raw.unit, note: `Units from the file: ${UNIT_LABEL[raw.unit]}.` }
  const order: Unit[] = ['m', 'mm', 'cm', 'ft', 'in']
  const unit = order.find((u) => span * UNIT_SCALE[u] >= MIN_SPAN && span * UNIT_SCALE[u] <= MAX_SPAN) ?? 'm'
  return { unit, note: `The file does not say its units: read as ${UNIT_LABEL[unit]} (the size that makes a plausible city model).` }
}

/** Builds the competition context from any model. Throws when the file has no solid to show. */
export function contextFromRaw(raw: RawImport & { unitScaleOverride?: number }): ContextBuild {
  const notes: string[] = []
  const objects = raw.objects.filter((o) => o.mesh.indices.length >= 3)
  if (!objects.length) throw new Error(`"${raw.fileName}" has no solids or meshes to show as context.${raw.skipped.length ? ` ${raw.skipped.length} object${raw.skipped.length === 1 ? ' was' : 's were'} left out (${raw.skipped[0].reason}).` : ''}`)

  // File box, in file units and axes.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const o of objects) {
    const p = o.mesh.positions
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  }
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  // When the format does not say (OBJ), Y is up: Rhino, SketchUp and Blender write OBJ that way by default.
  const yUp = raw.upAxis ? raw.upAxis === 'y' : true
  if (!raw.upAxis) notes.push('The file does not say which axis is up: read as Y up, the usual OBJ export setting (Rhino, SketchUp, Blender).')
  const plan = yUp ? [0, 2] : [0, 1]
  const { unit, note } = unitFor(raw, Math.max(ext[plan[0]], ext[plan[1]]))
  notes.push(note)
  const s = raw.unitScaleOverride ?? UNIT_SCALE[unit]
  // File point → metres, Z up (y-up files: plan y = −file z, like the massing import).
  const toM = (x: number, y: number, z: number): [number, number, number] => (yUp ? [x * s, -z * s, y * s] : [x * s, y * s, z * s])

  const lo = toM(min[0], min[1], min[2]), hi = toM(max[0], max[1], max[2])
  const bx0 = Math.min(lo[0], hi[0]), bx1 = Math.max(lo[0], hi[0]), by0 = Math.min(lo[1], hi[1]), by1 = Math.max(lo[1], hi[1])
  const bz0 = Math.min(lo[2], hi[2])
  const holds = (x: number, y: number) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1
  // Well inside the model (its middle 80% each way): a file whose origin sits at a corner is centred instead.
  const centred = (x: number, y: number) => Math.abs(x - (bx0 + bx1) / 2) <= 0.4 * (bx1 - bx0) && Math.abs(y - (by0 + by1) / 2) <= 0.4 * (by1 - by0)
  let dx: number, dy: number, dz: number
  if (holds(SITE_CENTRE[0], SITE_CENTRE[1])) {
    ;[dx, dy, dz] = [-SITE_CENTRE[0], -SITE_CENTRE[1], 0]
    notes.push('Placed in the competition base model\'s own coordinates (the file still holds the site block\'s centre).')
  } else if (/^VTC competition model grid/.test(raw.docStrings?.frame ?? '') || centred(0, 0)) {
    ;[dx, dy, dz] = [0, 0, 0]
    notes.push('Kept where it is: the file is centred around its origin, which is the centre of the competition block here.')
  } else {
    ;[dx, dy, dz] = [-(bx0 + bx1) / 2, -(by0 + by1) / 2, -bz0]
    notes.push('Centred on the competition site, its lowest point at street level: the file is not in the competition model\'s coordinates.')
  }

  const buildings: MeshItem[] = objects.map((o) => {
    const p = o.mesh.positions, positions: number[] = new Array(p.length)
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = toM(p[i], p[i + 1], p[i + 2])
      positions[i] = R(x + dx); positions[i + 1] = R(y + dy); positions[i + 2] = R(z + dz)
    }
    // Y up to Z up is a rotation, so the triangles keep their winding.
    return { positions, indices: Array.from(o.mesh.indices) }
  })

  // The site line: the largest closed curve on a site-like layer (or named like one). Optional.
  const ringOf = (pts: [number, number, number][]) => pts.map(([x, y, z]) => { const m = toM(x, y, z); return [R(m[0] + dx), R(m[1] + dy)] as [number, number] })
  const area = (r: [number, number][]) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
  const siteRings = (raw.curves ?? []).filter((c) => c.closed && c.points.length >= 3 && (SITE_LAYER.test(c.layer) || SITE_LAYER.test(c.name))).map((c) => ringOf(c.points))
  const ring = siteRings.sort((a, b) => area(b) - area(a))[0]
  let site: VtcContext['site'] = null
  if (ring) {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
    const outline = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]]
    site = { outline, width_m: R(Math.max(...xs) - Math.min(...xs)), depth_m: R(Math.max(...ys) - Math.min(...ys)), area_m2: R(area(ring)) }
    notes.push(`Site line from the file (${site.area_m2.toLocaleString('en-CA')} m²).`)
  } else notes.push('No site line in the file (a closed curve on a Site, Block or Lot layer): no block is drawn. The competition rules still read the brief\'s 144.8 × 79.2 m block.')
  if (raw.skipped.length) notes.push(`${raw.skipped.length} object${raw.skipped.length === 1 ? '' : 's'} left out: ${raw.skipped[0].reason}${raw.skipped.length > 1 ? ', …' : ''}.`)

  return {
    ctx: {
      meta: {
        source: `Your own model: ${raw.fileName}, read in this browser.`,
        true_north_deg_clockwise_from_plus_y: 45.0,
        north_note: 'The competition model\'s north (45° from +Y), assumed for your model.',
      },
      site, blocks: [], curbs: [], plazas: [], midblock: [], buildings, heritage: [], future_towers: [], labels: [], ground_uses: [],
    },
    notes,
  }
}
