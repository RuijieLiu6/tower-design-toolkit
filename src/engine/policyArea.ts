// A digitized planning-policy area against a study site (Higher Buildings, 9 Nov). Pure geometry in the local frame
// (EPSG:26910 minus the City origin, metres). The relationship is geographic only and uses the whole site polygon:
//   - within: every part of the site lies inside the area, clear of each part's tolerance band;
//   - outside: no part of the site lies inside the area or in a band;
//   - overlapping: some of the site is clearly inside and some clearly outside;
//   - uncertain: otherwise (the site touches a band around an approximate, digitized edge).
// Membership is not a planning approval and says nothing about height or outcome; callers must say so.
import { distanceToRing, earTriangles, normalizeRing, overlapArea, ringMetrics, type Pt } from './site'

export interface PolicyPart {
  id: string
  label: string
  /** 'area' or 'small' (under 10,000 m²): a size class only; the source legend gives every part one class. */
  sizeClass: 'area' | 'small'
  areaM2: number
  /** Half-width of the band around this part's boundary where membership is uncertain (m). */
  toleranceM: number
  /** Local frame, open ring, counter-clockwise. */
  ring: Pt[]
}

export type SiteRelation = 'within' | 'outside' | 'overlapping' | 'uncertain'

export interface RelationResult {
  relation: SiteRelation
  siteM2: number
  /** Area of the site inside the drawn area (exact, triangulated clipping). */
  insideM2: number
  share: number
  /** The part nearest the site (0 m when they meet) and the distance to it. */
  nearest: { id: string; label: string; distanceM: number } | null
  /** Parts whose band the site reaches (why a result is uncertain). */
  bandParts: string[]
  samples: number
}

/** How the relationship is computed, in words (shown in the inspector). */
export const RELATION_METHOD =
  'Whole site polygon against each digitized part: the site edge sampled every 1 m and its inside on a 2 m grid, each point classed as clearly inside, clearly outside or in a part\'s tolerance band; the area inside is exact (the site triangulated, each part clipped by the triangles), in the local EPSG:26910 frame.'

/** EPSG:26910 coordinates to the local frame. */
export function toLocal(ring: readonly (readonly number[])[], origin: readonly [number, number]): Pt[] {
  return normalizeRing(ring.map((p) => [p[0] - origin[0], p[1] - origin[1]] as Pt))
}

/** Point in polygon by ray casting (rings are validated once, when the data is built; this runs per sample). */
export function insideRing([x, y]: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]
    if ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside
  }
  return inside
}

type Box = [number, number, number, number]
function bounds(ring: Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return [x0, y0, x1, y1]
}
const inBox = ([x, y]: Pt, b: Box, pad: number) => x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad

/** Extent of several parts (local frame). */
export function partsBounds(parts: readonly PolicyPart[]): Box {
  return bounds(parts.flatMap((p) => p.ring))
}

/** Distance between two simple polygons (0 when they overlap or touch). */
export function polygonDistance(a: Pt[], b: Pt[]): number {
  if (a.some((p) => insideRing(p, b)) || b.some((p) => insideRing(p, a))) return 0
  // Two outlines can cross with no corner of either inside the other (a plus sign over a bar).
  const cr = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const r = b[j], s = b[(j + 1) % b.length]
      if (cr(p, q, r) * cr(p, q, s) < 0 && cr(r, s, p) * cr(r, s, q) < 0) return 0
    }
  }
  let d = Infinity
  for (const p of a) d = Math.min(d, distanceToRing(p, b))
  for (const p of b) d = Math.min(d, distanceToRing(p, a))
  return d
}

/** Points along the site edge every `edge` m and on a `step` m grid inside it. */
export function sitePoints(ring: Pt[], step = 2, edge = 1): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / edge))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  const [x0, y0, x1, y1] = bounds(ring)
  // Large sites: a coarser grid keeps the count bounded (about 40,000 inside points at most).
  const s = Math.max(step, Math.sqrt(((x1 - x0) * (y1 - y0)) / 40000))
  for (let y = y0 + s / 2; y < y1; y += s) for (let x = x0 + s / 2; x < x1; x += s) if (insideRing([x, y], ring)) out.push([x, y])
  return out
}

/** The geographic relationship between a site polygon and the digitized parts (see the header). */
export function siteRelation(site: Pt[], parts: readonly PolicyPart[]): RelationResult {
  const ring = normalizeRing(site)
  const siteM2 = ringMetrics(ring).area
  const boxes = parts.map((p) => bounds(p.ring))
  let insideM2 = 0
  if (earTriangles(ring).length) for (const p of parts) insideM2 += overlapArea(ring, [p.ring])
  insideM2 = Math.min(siteM2, insideM2)
  const pts = sitePoints(ring)
  let clearIn = 0, clearOut = 0
  const band = new Set<string>()
  for (const q of pts) {
    let inside = -1
    for (let k = 0; k < parts.length; k++) if (inBox(q, boxes[k], 0) && insideRing(q, parts[k].ring)) { inside = k; break }
    if (inside >= 0) {
      if (distanceToRing(q, parts[inside].ring) > parts[inside].toleranceM) clearIn++
      else band.add(parts[inside].id)
      continue
    }
    let near = false
    for (let k = 0; k < parts.length; k++) {
      const t = parts[k].toleranceM
      if (inBox(q, boxes[k], t) && distanceToRing(q, parts[k].ring) <= t) { near = true; band.add(parts[k].id) }
    }
    if (!near) clearOut++
  }
  const n = pts.length
  const relation: SiteRelation = clearIn === n ? 'within' : clearOut === n ? 'outside' : clearIn > 0 && clearOut > 0 ? 'overlapping' : 'uncertain'
  let nearest: RelationResult['nearest'] = null
  for (const p of parts) {
    const d = polygonDistance(ring, p.ring)
    if (!nearest || d < nearest.distanceM) nearest = { id: p.id, label: p.label, distanceM: d }
  }
  return { relation, siteM2, insideM2, share: siteM2 > 0 ? insideM2 / siteM2 : 0, nearest, bandParts: [...band], samples: n }
}

/** Words for each relationship (never an approval word, never a pass or fail). */
export const RELATION_WORD: Record<SiteRelation, string> = {
  within: 'Within',
  outside: 'Outside',
  overlapping: 'Overlapping',
  uncertain: 'Uncertain',
}
export const RELATION_HINT: Record<SiteRelation, string> = {
  within: 'The whole site lies inside the drawn area, clear of its approximate edge.',
  outside: 'No part of the site lies inside the drawn area or near its approximate edge.',
  overlapping: 'The site crosses the boundary: part of it is clearly inside and part clearly outside.',
  uncertain: 'The site lies near the digitized edge, inside its tolerance band, so the map cannot settle it.',
}
