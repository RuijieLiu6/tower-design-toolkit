// The whole building around a clicked roof part (Sinnie, 12 Nov: "it's not selecting the entire building"). The city
// model stores buildings as roof parts (Vista's OSM parts: a tower can be four or five parts of one height), so a click
// lands on one part. The building is grown from it: parts of the same OSM way (a multipart building), and parts that
// touch it with about the same roof height (within 3 m, or 12 % for parts over 40 m). A podium at another height stays a
// separate building, so selecting a tower does not take the block with it.
import type { Footprint, FootprintHeights } from './cityLayers'

type Box = [number, number, number, number]
const boxOf = (f: Footprint): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of f.outer) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
  return [x0, y0, x1, y1]
}
function near(p: [number, number], f: Footprint, tol: number): boolean {
  const o = f.outer
  for (let k = 0; k < o.length; k++) {
    const a = o[k], b = o[(k + 1) % o.length], ex = b[0] - a[0], ey = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)))
    if (Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t) < tol) return true
  }
  return false
}
/** Two parts share a wall: at least two corners of one lie on the other's outline (either way). */
const touching = (a: Footprint, b: Footprint) =>
  a.outer.filter((p) => near(p as [number, number], b, 0.5)).length + b.outer.filter((p) => near(p as [number, number], a, 0.5)).length >= 2

const cache = new WeakMap<Footprint[], Map<number, number[]>>()

export function buildingGroup(footprints: Footprint[], heights: FootprintHeights | null, osmId: readonly string[] | null, i: number): number[] {
  if (i < 0 || i >= footprints.length) return []
  let memo = cache.get(footprints)
  if (!memo) { memo = new Map(); cache.set(footprints, memo) }
  const hit = memo.get(i)
  if (hit) return hit
  const ht = (k: number) => (heights ? heights.roof[k] - heights.ground[k] : NaN)
  const alike = (a: number, b: number) => {
    const ha = ht(a), hb = ht(b)
    if (!Number.isFinite(ha) || !Number.isFinite(hb)) return false
    return Math.abs(ha - hb) <= Math.max(3, Math.max(ha, hb) > 40 ? 0.12 * Math.max(ha, hb) : 0)
  }
  const boxes = new Map<number, Box>()
  const box = (k: number) => { let b = boxes.get(k); if (!b) { b = boxOf(footprints[k]); boxes.set(k, b) } return b }
  const group = new Set([i]), queue = [i]
  // Same OSM way first (cheap), then the touching parts of a like height, part by part.
  if (osmId) { const id = osmId[i]; if (id) for (let k = 0; k < osmId.length; k++) if (k !== i && osmId[k] === id) { group.add(k); queue.push(k) } }
  while (queue.length && group.size < 60) {
    const k = queue.shift()!, B = box(k)
    for (let j = 0; j < footprints.length; j++) {
      if (group.has(j)) continue
      const f = footprints[j], c = f.outer[0]
      if (!c || c[0] < B[0] - 400 || c[0] > B[2] + 400 || c[1] < B[1] - 400 || c[1] > B[3] + 400) continue
      const C = box(j)
      if (C[2] < B[0] - 1 || C[0] > B[2] + 1 || C[3] < B[1] - 1 || C[1] > B[3] + 1) continue
      if (!alike(k, j) || !touching(footprints[k], f)) continue
      group.add(j); queue.push(j)
    }
  }
  const out = [...group].sort((a, b) => a - b)
  for (const k of out) memo.set(k, out)
  return out
}
