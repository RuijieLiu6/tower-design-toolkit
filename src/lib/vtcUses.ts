// Ground-level use of each competition context building (Ruijie, 6 Nov: "one with the surround program and the legend").
// The base model's Ground Level Use Plan hatches (ctx.ground_uses) say what each piece of street level is used for.
// - A piece standing on the ground takes the use covering most of its footprint (sampled on a grid of about 1 m).
// - A piece that starts above the ground (a tower on its podium) takes the lobby use beneath it: the largest use other
//   than retail under its footprint (the plan's 13 x 17 m residential hatches are tower lobbies inside retail podiums).
// - Otherwise Other / unknown: never guessed from height or shape. The plan covers the ground floor only.
import { isExtruded, type ContextItem, type GroundUseArea, type VtcContext } from '../context'
import { BUILDING_USES, type BuildingUse } from './buildingUse'
import { hull } from './vtcShadeContext'

type Pt = [number, number]

/** The plan's layer names, as Real Vancouver's building types (lib/buildingUse.ts), so both sites share one legend. */
export const USE_OF_LAYER: Record<string, BuildingUse> = {
  Residential: 'residential', Retail: 'retail', Office: 'office', Hotel: 'hotel', Cultural: 'cultural', Institutional: 'institutional', 'Transit Station': 'transit',
}

export interface ContextUses {
  /** One use per ctx.buildings item, in order. */
  buildings: BuildingUse[]
  /** One use per ctx.heritage item, in order. */
  heritage: BuildingUse[]
  /** Buildings and heritage items per use. */
  counts: Record<BuildingUse, number>
  /** False when the context has no use plan (a context built before 6 Nov): every building is then Other / unknown. */
  hasPlan: boolean
}

/** Pieces starting higher than this (m above grade) stand on another piece: they take the lobby use beneath them. */
export const UPPER_Z = 1

/** Lowest point of a piece (m above grade). */
export const baseOf = (it: ContextItem) => {
  if (isExtruded(it)) return it.z0
  let z = Infinity
  for (let i = 2; i < it.positions.length; i += 3) z = Math.min(z, it.positions[i])
  return z
}

/** A building's plan outline: its footprint, or for a mesh the convex hull of its vertices seen from above. */
export function footprintOf(it: ContextItem): Pt[] {
  if (isExtruded(it)) return it.footprint
  const pts: Pt[] = []
  for (let i = 0; i + 1 < it.positions.length; i += 3) pts.push([it.positions[i], it.positions[i + 1]])
  return hull(pts)
}

/** Even-odd point in polygon over all rings (outer ring and holes alike). */
export function inRings(rings: Pt[][], x: number, y: number): boolean {
  let inside = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

interface Area { use: BuildingUse; rings: Pt[][]; x0: number; y0: number; x1: number; y1: number }
const box = (pts: Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { x0, y0, x1, y1 }
}
const ORDER = BUILDING_USES.map((u) => u.id)

/** The use covering most of a footprint (largest share of grid samples), else 'other'. `upper`: retail doesn't count. */
export function useOfFootprint(fp: Pt[], areas: Area[], upper = false): BuildingUse {
  if (fp.length < 3 || !areas.length) return 'other'
  const b = box(fp)
  const near = areas.filter((a) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1)
  if (!near.length) return 'other'
  // About 1 m apart, at most ~4,000 samples for the largest footprints.
  const step = Math.max(1, Math.sqrt(((b.x1 - b.x0) * (b.y1 - b.y0)) / 4000))
  const count = new Map<BuildingUse, number>()
  let inside = 0
  const sample = (x: number, y: number) => {
    inside++
    // Every area under the point counts (a lobby drawn over a podium's area is still seen).
    for (const a of near) if (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1 && inRings(a.rings, x, y)) count.set(a.use, (count.get(a.use) ?? 0) + 1)
  }
  for (let x = b.x0 + step / 2; x < b.x1; x += step) for (let y = b.y0 + step / 2; y < b.y1; y += step) if (inRings([fp], x, y)) sample(x, y)
  if (!inside) { const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length, cy = fp.reduce((s, p) => s + p[1], 0) / fp.length; sample(cx, cy) }
  let best: BuildingUse = 'other', most = 0
  for (const use of ORDER) { const n = upper && use === 'retail' ? 0 : count.get(use) ?? 0; if (n > most) { best = use; most = n } }
  return best
}

const cache = new WeakMap<VtcContext, ContextUses>()

/** Ground-level use of every context building and heritage item (cached per context). */
export function contextUses(ctx: VtcContext): ContextUses {
  const hit = cache.get(ctx)
  if (hit) return hit
  const areas: Area[] = (ctx.ground_uses ?? []).flatMap((g: GroundUseArea) => {
    const use = USE_OF_LAYER[g.use]
    if (!use || !g.rings.length) return []
    return [{ use, rings: g.rings, ...box(g.rings.flat()) }]
  })
  const of = (items: ContextItem[]) => items.map((it) => useOfFootprint(footprintOf(it), areas, baseOf(it) > UPPER_Z))
  const buildings = of(ctx.buildings), heritage = of(ctx.heritage)
  const counts = Object.fromEntries(ORDER.map((u) => [u, 0])) as Record<BuildingUse, number>
  for (const u of [...buildings, ...heritage]) counts[u]++
  const out = { buildings, heritage, counts, hasPlan: areas.length > 0 }
  cache.set(ctx, out)
  return out
}
