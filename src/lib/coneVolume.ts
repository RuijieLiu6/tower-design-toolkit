// Vista's view-cone volume (Ruijie, 3 Nov: draw every view cone as Vista does, as 3D volumes, not lines), ported from
// Vista's explorer/viewcone-geometry.js prepareSurface @ 917b28e (read only).
// A cone is its ceiling (the limit surface over the corridor polygon) and curtain walls standing on the ceiling along
// every side up to a display cut; edges outline both. Display only: the cut is a scene cut, never a policy cap.
export type V3 = [number, number, number]
export type V2 = [number, number]

/** Keeps the part of a convex polygon where f >= 0 (Vista's half()). */
export function clipHalf(points: V3[], f: (p: V3) => number, eps = 1e-8): V3[] {
  const out: V3[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], c = points[(i + 1) % points.length], da = f(a), dc = f(c), ai = da >= -eps, ci = dc >= -eps
    if (ai !== ci) { const t = Math.max(0, Math.min(1, da / (da - dc))); out.push([a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1]), a[2] + t * (c[2] - a[2])]) }
    if (ci) out.push(c)
  }
  return out
}

/** Ear-clipping triangulation of a simple polygon (counter-clockwise). */
export function earClip(poly: V2[]): [number, number, number][] {
  const idx = poly.map((_, i) => i), out: [number, number, number][] = []
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
  if (area < 0) idx.reverse()
  const cross = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const inside = (p: V2, a: V2, b: V2, c: V2) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0
  let guard = 0
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length]
      const a = poly[ia], b = poly[ib], c = poly[ic]
      if (cross(a, b, c) <= 1e-12) continue
      if (idx.some((k) => k !== ia && k !== ib && k !== ic && inside(poly[k], a, b, c))) continue
      out.push([ia, ib, ic]); idx.splice(i, 1); cut = true; break
    }
    if (!cut) break
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]])
  return out
}

export interface ConeVolume { surface: V3[][]; walls: V3[][]; edges: [V3, V3][] }

/**
 * Vista's prepareSurface: `z(p)` is the ceiling; `lower` and `upper` the display range (Vista: -100 and
 * min(600, max(320, proposal top + 60, study height + 100))).
 */
export function coneVolume(polygon: V2[], z: (p: V2) => number, lower: number, upper: number): ConeVolume {
  const surface: V3[][] = [], walls: V3[][] = [], edges: [V3, V3][] = []
  const at = (p: V3) => z([p[0], p[1]])
  for (const [i, j, k] of earClip(polygon)) {
    let q: V3[] = [i, j, k].map((n) => [polygon[n][0], polygon[n][1], z(polygon[n])] as V3)
    q = clipHalf(q, (v) => v[2] - lower)
    q = clipHalf(q, (v) => upper - v[2])
    if (q.length >= 3) surface.push(q)
  }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], c = polygon[(i + 1) % polygon.length], az = z(a), cz = z(c)
    let e: V3[] = [[a[0], a[1], az], [c[0], c[1], cz]]
    e = clipSeg(e, (v) => v[2] - lower); e = clipSeg(e, (v) => upper - v[2])
    if (e.length === 2) edges.push([e[0], e[1]])
    // The curtain: from the ceiling up to the display cut (a scene cut, never a policy cap).
    let w: V3[] = [[a[0], a[1], az], [c[0], c[1], cz], [c[0], c[1], upper], [a[0], a[1], upper]]
    w = clipHalf(w, (v) => v[2] - at(v))
    w = clipHalf(w, (v) => v[2] - lower)
    w = clipHalf(w, (v) => upper - v[2])
    if (w.length >= 3) { walls.push(w); for (let k = 0; k < w.length; k++) edges.push([w[k], w[(k + 1) % w.length]]) }
  }
  return { surface, walls, edges }
}

/** A segment clipped to f >= 0. */
function clipSeg(s: V3[], f: (p: V3) => number): V3[] {
  if (s.length < 2) return []
  const [a, c] = s, da = f(a), dc = f(c)
  if (da < 0 && dc < 0) return []
  if (da >= 0 && dc >= 0) return s
  const t = da / (da - dc), m: V3 = [a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1]), a[2] + t * (c[2] - a[2])]
  return da >= 0 ? [a, m] : [m, c]
}

/** Vista's display cut for the volumes (viewcone-ui.js getScene): min(600, max(320, proposal top + 60)) metres. */
export const displayCut = (proposalTop: number | null) => Math.min(600, Math.max(320, (proposalTop ?? 0) + 60))
