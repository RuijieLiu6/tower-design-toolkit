// "Hide existing buildings under the design" (Real Vancouver), after Vista's automatic demolition (Vista v10.1
// explorer.js updateCleared; not ported on 22 Oct, audit 04 Tool Plan/research/vista-audit-2026-10-22.md §2).
// Pure geometry: which City footprints and LiDAR roof parts a design outline overlaps, and copies of the picking and
// ray-cast inputs without them. Indices never shift, so data.footprints[i] keeps meaning the same building.
// Hiding is a hypothetical removal (team assumption), never evidence of vacancy or redevelopment eligibility.
import { towerFootprint, towerMasses } from '../engine/massing'
import type { Tower } from '../engine/types'
import { hasHeight, inRing, type FootprintIndex, type FootprintLike, type HeightsLike, type Pt } from '../engine/viewFrom'

/** Design outlines shrink by this much first, so a shared wall or a touching neighbour is not hidden (Vista's 0.5 m; team assumption). */
export const REMOVAL_SHRINK_M = 0.5
export const REMOVAL_FLAG = 'team_assumption' as const
export const REMOVAL_CAVEAT = 'Hypothetical removal; not evidence of vacancy or redevelopment eligibility.'

type Box = [number, number, number, number]
const boxOf = (ring: Pt[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return [x0, y0, x1, y1]
}
const openRing = (ring: Pt[]) => (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring)

const signedArea2 = (r: Pt[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)

/**
 * Moves every edge of a convex outline (a tower rectangle or an imported hull) in by `by` metres. Vista scaled about
 * the centre instead, which pulls the ends of a long slab in by more than 0.5 m. An outline narrower than 2 × `by`
 * comes back empty: it hides nothing.
 */
export function shrinkRing(ring: Pt[], by = REMOVAL_SHRINK_M): Pt[] {
  const r = openRing(ring).filter((p, i, all) => { const q = all[(i + all.length - 1) % all.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9 })
  const a2 = r.length >= 3 ? signedArea2(r) : 0
  if (Math.abs(a2) < 1e-9) return []
  const s = a2 > 0 ? 1 : -1, n = r.length
  // Each edge as a line moved along its inward normal (left of the edge for a counter-clockwise ring).
  const lines = r.map((a, i) => {
    const b = r[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey)
    return { px: a[0] - (ey / L) * s * by, py: a[1] + (ex / L) * s * by, ex, ey }
  })
  const out = r.map((_, i): Pt => {
    const p = lines[(i + n - 1) % n], q = lines[i], den = p.ex * q.ey - p.ey * q.ex
    if (Math.abs(den) < 1e-12) return [q.px, q.py]
    const t = ((q.px - p.px) * q.ey - (q.py - p.py) * q.ex) / den
    return [p.px + p.ex * t, p.py + p.ey * t]
  })
  return signedArea2(out) * a2 > 0 ? out : []
}

const orient = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const opposite = (p: number, q: number) => (p > 0 && q < 0) || (p < 0 && q > 0)
/** Some edge of `p` properly crosses some edge of `q` (touching does not count). */
function edgesCross(p: Pt[], q: Pt[]): boolean {
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j], b = p[i]
    for (let k = 0, m = q.length - 1; k < q.length; m = k++) {
      const c = q[m], d = q[k]
      if (opposite(orient(c, d, a), orient(c, d, b)) && opposite(orient(a, b, c), orient(a, b, d))) return true
    }
  }
  return false
}

/** The footprint (outer ring minus courtyards) and the design outline share some area. */
export function overlaps(f: FootprintLike, design: Pt[]): boolean {
  if (f.outer.length < 3 || design.length < 3) return false
  if ([f.outer, ...f.holes].some((ring) => edgesCross(ring, design))) return true
  if (design.some((p) => inRing(p, f.outer) && !f.holes.some((h) => inRing(p, h)))) return true
  return f.outer.some((p) => inRing(p, design))
}

const boxCache = new WeakMap<readonly FootprintLike[], Box[]>()
const boxes = (footprints: readonly FootprintLike[]) => {
  let b = boxCache.get(footprints)
  if (!b) { b = footprints.map((f) => boxOf(f.outer)); boxCache.set(footprints, b) }
  return b
}

/** Indices of the footprints each design outline overlaps, after shrinking the outline by `shrink`; one list per outline. */
export function footprintsUnder(footprints: readonly FootprintLike[], designs: Pt[][], shrink = REMOVAL_SHRINK_M): number[][] {
  const bb = boxes(footprints)
  return designs.map((ring) => {
    if (ring.length < 3) return []
    const d = shrinkRing(ring, shrink), [dx0, dy0, dx1, dy1] = boxOf(d)
    const out: number[] = []
    for (let i = 0; i < footprints.length; i++) {
      const [x0, y0, x1, y1] = bb[i]
      if (x1 < dx0 || x0 > dx1 || y1 < dy0 || y0 > dy1) continue
      if (overlaps(footprints[i], d)) out.push(i)
    }
    return out
  })
}

/** Plan outlines of each design tower (local frame): every stacked block (an imported mass: its hull). */
export function designOutlines(t: Tower): Pt[][] {
  return towerMasses(t).map((m) => m.ring)
}

export interface Removal {
  /** Every hidden footprint index (into the same footprint list). */
  hidden: Set<number>
  /** Per design tower, the footprints it hides (tower and podium together, sorted). */
  byTower: { id: string; name: string; indices: number[] }[]
}

/** Footprints under the design towers. Empty when there are no towers. */
export function removalUnder(footprints: readonly FootprintLike[], towers: Tower[], shrink = REMOVAL_SHRINK_M): Removal {
  const byTower = towers.map((t) => {
    const indices = [...new Set(footprintsUnder(footprints, designOutlines(t), shrink).flat())].sort((a, b) => a - b)
    return { id: t.id, name: t.name, indices }
  })
  return { hidden: new Set(byTower.flatMap((b) => b.indices)), byTower }
}

/** How many hidden footprints had a height (solid) and how many were height-unknown outlines. */
export function removalCounts(hidden: ReadonlySet<number>, heights: HeightsLike | null): { total: number; measured: number; outlines: number } {
  let measured = 0
  for (const i of hidden) if (hasHeight(heights, i)) measured++
  return { total: hidden.size, measured, outlines: hidden.size - measured }
}

/**
 * The overlap rule in words. A building part that the inset outline overlaps at all is hidden whole, including any of
 * it outside the tower, so nothing existing shows through the proposal. A building drawn as several parts loses only
 * the parts the tower touches.
 */
export const REMOVAL_RULE = 'Every existing building part that a tower or podium outline overlaps (outline inset 0.5 m, so a shared wall or an overlap under 0.5 m keeps the neighbour) is hidden whole, including any of it outside the outline; parts of the same building that the outline does not touch stay.'

/**
 * One statement for reports and captions: how many footprints are hidden, under which towers, and the caveat. `site`
 * counts footprints the study site replaces (lib/siteStore). Null when nothing is hidden.
 */
export function removalNote(total: number, towers: string[], site = 0): string | null {
  if (!total) return null
  const where = [towers.length ? `under ${towers.join(', ')}` : '', site ? `${site} replaced by the study site` : ''].filter(Boolean).join('; ')
  return `Existing buildings under the design: ${total.toLocaleString('en-CA')} existing building footprint${total === 1 ? ' is' : 's are'} hidden${where ? ` (${where})` : ''}, so ${total === 1 ? 'it is' : 'they are'} not drawn and do not block sightlines or host viewpoints. ${REMOVAL_RULE} ${REMOVAL_CAVEAT}`
}

/** The same footprint index without the hidden footprints, so picking and ray casts pass through them (indices unchanged). */
export function maskIndex(idx: FootprintIndex, hidden: ReadonlySet<number>): FootprintIndex {
  if (!hidden.size) return idx
  const cells = new Map<string, number[]>()
  for (const [k, list] of idx.cells) {
    const kept = list.filter((i) => !hidden.has(i))
    if (kept.length) cells.set(k, kept)
  }
  return { ...idx, cells }
}

/** Heights with the hidden footprints set to unknown, so no roof list offers them and no ray stops on them. */
export function maskHeights<H extends HeightsLike>(h: H | null, hidden: ReadonlySet<number>): H | null {
  if (!h || !hidden.size) return h
  const ground = h.ground.slice(), roof = h.roof.slice(), max = h.max.slice()
  for (const i of hidden) { ground[i] = NaN; roof[i] = NaN; max[i] = NaN }
  return { ...h, ground, roof, max }
}

/** Vertex index for a merged mesh without the hidden parts. `ranges` = [footprint, first vertex, vertex count]; returns the count written. */
export function visibleIndex(ranges: readonly (readonly [number, number, number])[], hidden: ReadonlySet<number>, out: Uint32Array): number {
  let n = 0
  for (const [f, start, count] of ranges) {
    if (hidden.has(f)) continue
    for (let k = 0; k < count; k++) out[n++] = start + k
  }
  return n
}
