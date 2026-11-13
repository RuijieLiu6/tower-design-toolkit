// Drawn masses (Sinnie, 12 Nov: "import the design tools from the tower design tool to the design toolkit, exactly the
// same"): a footprint polygon (with holes) extruded from a base by a number of storeys, as the Tower Workspace's masses
// (`P.masses`: pts, holes, base, floors, f2f, core, part, seams). The geometry helpers are the workspace's own
// (area, sgn, cen, inPoly, offsetPoly, pathPoly, chordEnds), on the toolkit's plan frame: x east, y north, metres.
// A drawn mass lives on a Tower as `drawn`; lib/drawn.ts turns it into the imported-mass record (storeys + mesh) every
// check already reads, so drawn masses are measured like any other tower. Only drawn masses take the shape tools;
// parametric towers keep their own (Sinnie's choice, 12 Nov).
import type { ImportedMass, ImportedStorey, UseId } from './types'

export type Pt = [number, number]
export interface DrawnCore { x: number; y: number; w: number; d: number }
export interface Seam { a: Pt; b: Pt; on: 'top' | 'side'; keep: Pt }
export interface DrawnMass {
  /** Outline, plan frame (project coordinates, not the tower frame), counter-clockwise or not. */
  pts: Pt[]
  holes?: Pt[][]
  /** Metres above grade where the mass starts (stacked on a roof). */
  base: number
  floors: number
  f2f: number
  core?: DrawnCore
  /** Parts of one building (Split, Boolean union of different heights) share this id and move together. */
  part?: string
  seams?: Seam[]
}

export const area = (p: Pt[]) => Math.abs(signedArea(p))
export function signedArea(p: Pt[]): number { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }
/** +1 counter-clockwise, -1 clockwise: (dy, -dx) × sgn is an edge's outward normal (the workspace's sgn, y-north frame). */
export const sgn = (p: Pt[]) => (signedArea(p) >= 0 ? 1 : -1)
export function cen(p: Pt[]): Pt { let x = 0, y = 0; p.forEach((q) => { x += q[0]; y += q[1] }); return [x / p.length, y / p.length] }
export function inPoly(x: number, y: number, p: Pt[]): boolean {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) c = !c
  }
  return c
}
export function bb(p: Pt[]) {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x0, x1, y0, y1, w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const rectPts = (cx: number, cy: number, w: number, d: number): Pt[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
export const mArea = (m: DrawnMass) => area(m.pts) - (m.holes ?? []).reduce((s, h) => s + area(h), 0)
export const topOf = (m: DrawnMass) => m.base + m.floors * m.f2f
export function segDist(q: Pt, a: Pt, b: Pt): [number, number] {
  const ex = b[0] - a[0], ey = b[1] - a[1], t = clamp(((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1)
  return [Math.hypot(q[0] - a[0] - ex * t, q[1] - a[1] - ey * t), t]
}

/** The outline moved out (dist > 0) or in, corner by corner (the workspace's offsetPoly). */
export function offsetPoly(pts: Pt[], dist: number): Pt[] {
  const s = sgn(pts), n = pts.length
  return pts.map((v, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
    const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]) || 1, l2 = Math.hypot(b[0] - v[0], b[1] - v[1]) || 1
    const n1x = ((v[1] - a[1]) / l1) * s, n1y = (-(v[0] - a[0]) / l1) * s, n2x = ((b[1] - v[1]) / l2) * s, n2y = (-(b[0] - v[0]) / l2) * s
    const k = dist / Math.max(0.25, 1 + n1x * n2x + n1y * n2y)
    return [Math.round((v[0] + (n1x + n2x) * k) * 100) / 100, Math.round((v[1] + (n1y + n2y) * k) * 100) / 100]
  })
}

/** Line tool, Offset mode: the drawn line becomes a band of width w (a closed loop becomes a ring with a courtyard). */
export function pathPoly(pts: Pt[], w: number, al: 'c' | 'i' | 'e', closed: boolean): { pts: Pt[]; holes?: Pt[][] } {
  const lo = al === 'c' ? -w / 2 : al === 'i' ? -w : 0, hi = al === 'c' ? w / 2 : al === 'i' ? 0 : w
  if (closed && pts.length > 2) {
    const a = offsetPoly(pts, hi), b = offsetPoly(pts, lo), A = area(a) >= area(b) ? a : b, B = A === a ? b : a
    return area(B) > 1 ? { pts: A, holes: [B] } : { pts: A }
  }
  const nrm = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] }
  const side = (o: number) => pts.map((v, i): Pt => {
    const pr = pts[i - 1], nx = pts[i + 1]
    let n: Pt = [0, 0], k = 1
    if (pr && nx) { const n1 = nrm(pr, v), n2 = nrm(v, nx); n = [n1[0] + n2[0], n1[1] + n2[1]]; k = 1 / Math.max(0.25, 1 + n1[0] * n2[0] + n1[1] * n2[1]) } else n = pr ? nrm(pr, v) : nrm(v, nx)
    return [+(v[0] + n[0] * k * o).toFixed(2), +(v[1] + n[1] * k * o).toFixed(2)]
  })
  return { pts: side(hi).concat(side(lo).reverse()) }
}

/** Where a straight cut through a and b crosses the outline nearest a and b (the workspace's chordEnds). */
export function chordEnds(ring: Pt[], a: Pt, b: Pt): [Pt, Pt] | null {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return null
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux, X: { t: number; pt: Pt }[] = []
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], sp = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny, sq = (q[0] - a[0]) * nx + (q[1] - a[1]) * ny
    if (Math.abs(sp - sq) < 1e-12) return
    const f = sp / (sp - sq); if (f < -1e-9 || f > 1 + 1e-9) return
    const ff = clamp(f, 0, 1), pt: Pt = [p[0] + (q[0] - p[0]) * ff, p[1] + (q[1] - p[1]) * ff]
    X.push({ t: (pt[0] - a[0]) * ux + (pt[1] - a[1]) * uy, pt })
  })
  X.sort((u, v) => u.t - v.t)
  let lo: { t: number; pt: Pt } | null = null, hi: { t: number; pt: Pt } | null = null
  X.forEach((x) => { if (x.t <= L / 2 + 1e-9) lo = x; else if (!hi) hi = x })
  if (!lo || !hi) return null
  const LO = lo as { t: number; pt: Pt }, HI = hi as { t: number; pt: Pt }
  if (HI.t - LO.t <= 0.3) return null
  const mx = (LO.pt[0] + HI.pt[0]) / 2, my = (LO.pt[1] + HI.pt[1]) / 2
  if (!inPoly(mx + nx * 0.2, my + ny * 0.2, ring) || !inPoly(mx - nx * 0.2, my - ny * 0.2, ring)) return null
  return [LO.pt.map((v) => +v.toFixed(3)) as Pt, HI.pt.map((v) => +v.toFixed(3)) as Pt]
}

/** Counter-clockwise copy of a ring (outer rings counter-clockwise, holes clockwise, as the imported storeys). */
const ccw = (r: Pt[]) => (signedArea(r) >= 0 ? r : [...r].reverse())
const cw = (r: Pt[]) => (signedArea(r) <= 0 ? r : [...r].reverse())

/**
 * The imported-mass record of a drawn mass, in the tower frame (centred on `c`): one storey a floor from the base, each
 * plate the footprint less its holes and the floor area that. The mesh is built in lib/drawn.ts.
 */
export function drawnImported(m: DrawnMass, c: Pt, use: UseId, meshId: string): ImportedMass {
  const loc = (r: Pt[]) => r.map(([x, y]): Pt => [+(x - c[0]).toFixed(3), +(y - c[1]).toFixed(3)])
  const outer = ccw(loc(m.pts)), holes = (m.holes ?? []).map((h) => cw(loc(h)))
  const a = Math.round(mArea(m) * 10) / 10
  const lvl0 = Math.round(m.base / m.f2f)
  const storeys: ImportedStorey[] = Array.from({ length: Math.max(1, m.floors) }, (_, i) => ({
    level: lvl0 + i + 1, z0: +(m.base + i * m.f2f).toFixed(3), z1: +(m.base + (i + 1) * m.f2f).toFixed(3), area: a, use, podium: false, hasFloor: true, loops: [outer, ...holes],
  }))
  return {
    meshId, fileName: 'Drawn mass', format: 'drawn', unit: 'm', unitSource: 'chosen', fileNorthDeg: 0, northSource: 'Drawn in the toolkit (plan north)',
    datumShift: 0, datumSource: 'Drawn on the ground or a roof', f2f: m.f2f, podiumTop: 0, podiumF2F: m.f2f, storeys,
    hull: outer, volume: Math.round(a * m.floors * m.f2f), top: +topOf(m).toFixed(3), health: { block: 0, warn: 0 },
  }
}
