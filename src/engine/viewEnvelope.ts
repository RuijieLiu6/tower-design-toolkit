// Exact check of the proposal's own triangles against every protected view's estimated lower surface (after Vista's
// view-envelope.js, Ruijie Liu). The surfaces are the View-cone height check's estimates (Z = Lv + k·D, CONE_PARAMS);
// nothing new is estimated here. For each triangle and cone, clearance = limit − z is linear over the part of the
// triangle inside the wedge, so its minimum is at a vertex of that part: the triangle's own vertices, and where its
// edges cross the wedge's sides. Vertical faces are covered by their edges. Exact, not sampled.
// Plan EPSG:26910 metres; heights CGVD28 like the rest of Real Vancouver. The City View Cone Assessment governs.
import { CONES, CONE_PARAMS, bisector, limitAt, type Cone, type ConeParam } from './viewCones'
import { convexHull, edgeFunctions, type P2, type P3 } from './coneSection'
import { towerMasses } from './massing'
import { placedTriangles } from '../lib/interchange/converters'
import type { Tower } from './types'

export interface Tri { a: P3; b: P3; c: P3; tower: string; part: string }

/** Triangles of a vertical prism: top, bottom and walls (fan over a convex or simple ring). */
export function prismTriangles(ring: P2[], z0: number, z1: number, tower: string, part: string): Tri[] {
  const r = ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  const out: Tri[] = []
  for (let i = 1; i + 1 < r.length; i++) {
    out.push({ a: [r[0][0], r[0][1], z1], b: [r[i][0], r[i][1], z1], c: [r[i + 1][0], r[i + 1][1], z1], tower, part })
    out.push({ a: [r[0][0], r[0][1], z0], b: [r[i + 1][0], r[i + 1][1], z0], c: [r[i][0], r[i][1], z0], tower, part })
  }
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length]
    out.push({ a: [p[0], p[1], z0], b: [q[0], q[1], z0], c: [q[0], q[1], z1], tower, part })
    out.push({ a: [p[0], p[1], z0], b: [q[0], q[1], z1], c: [p[0], p[1], z1], tower, part })
  }
  return out
}

export interface MeshLike { positions: ArrayLike<number>; indices: ArrayLike<number> }

/**
 * The proposal as triangles in EPSG:26910 with geodetic heights. Parametric towers and stacked blocks: one prism per
 * block (towerMasses). Imported towers: the uploaded mesh's own triangles when the mesh is loaded (tower frame, z from
 * the entrance floor, rotated and moved like the tower), else the hull prism, marked so the result says so.
 */
export function proposalTriangles(towers: Tower[], base: number, origin: P2, meshes: Record<string, MeshLike | undefined> = {}): { tris: Tri[]; notes: string[] } {
  const tris: Tri[] = [], notes: string[] = []
  for (const t of towers) {
    if (t.imported) {
      // The interchange session's placement (lib/interchange/converters.ts): the mesh in EPSG:26910 + CGVD28, or its sliced storeys.
      const r = placedTriangles(t, meshes[t.imported.meshId], { origin, groundElevation: base })
      const part = r.source === 'mesh' ? t.imported.fileName : `${t.imported.fileName} (storey prisms)`
      for (let k = 0; k + 8 < r.tris.length; k += 9) {
        const q = r.tris
        tris.push({ a: [q[k], q[k + 1], q[k + 2]], b: [q[k + 3], q[k + 4], q[k + 5]], c: [q[k + 6], q[k + 7], q[k + 8]], tower: t.name, part })
      }
      if (r.source !== 'mesh') notes.push(`${t.name}: the uploaded mesh is not loaded in this browser, so its sliced storeys stand in (nothing above the last storey; unverified)`)
      continue
    }
    for (const m of towerMasses(t)) {
      const ring = m.ring.map(([x, y]) => [x + origin[0], y + origin[1]] as P2)
      tris.push(...prismTriangles(ring, base + m.z0, base + m.z1, t.name, m.podium ? `podium block ${m.blockId}` : `block ${m.blockId}`))
    }
  }
  return { tris, notes }
}

export type EnvelopeState = 'no_estimate' | 'outside' | 'clear' | 'within_uncertainty' | 'above'
export interface ConeEnvelope {
  cone: Cone
  state: EnvelopeState
  /** Triangles with some part inside the wedge. */
  tested: number
  /** Lowest limit − z over the proposal inside the wedge (m; negative = above the estimated limit). */
  clearance: number | null
  /** Controlling point on the proposal (EPSG:26910 + CGVD28) and the estimated limit there. */
  at: P3 | null
  limit: number | null
  tower: string | null
  part: string | null
  param: ConeParam | null
}
export interface EnvelopeResult { cones: ConeEnvelope[]; controlling: ConeEnvelope | null; triangles: number; notes: string[] }

interface Wedge { cone: Cone; f: ((p: P2) => number)[]; box: [number, number, number, number] }
const WEDGES: Wedge[] = CONES.map((cone) => {
  const hull = convexHull(cone.ring)
  const xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1])
  return { cone, f: edgeFunctions(cone.ring), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
})
const EPS = 1e-7

/** Points of the segment a→b inside the wedge: its clipped ends (none when it misses). */
function clipSegment(w: Wedge, a: P3, b: P3): P3[] {
  let t0 = 0, t1 = 1
  for (const f of w.f) {
    const fa = f([a[0], a[1]]), fb = f([b[0], b[1]])
    if (fa < -EPS && fb < -EPS) return []
    if (fa < -EPS || fb < -EPS) {
      const t = fa / (fa - fb)
      if (fa < -EPS) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
    }
    if (t0 > t1 + 1e-12) return []
  }
  const at = (t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  return t1 - t0 < 1e-12 ? [at(t0)] : [at(t0), at(t1)]
}

/** Wedge corners that lie inside a non-vertical triangle, lifted onto it (the clipped part's interior vertices). */
function cornersInside(w: Wedge, t: Tri): P3[] {
  const { a, b, c } = t
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
  if (Math.abs(det) < 1e-9) return []
  const out: P3[] = []
  for (const p of convexHull(w.cone.ring)) {
    const l1 = ((b[0] - p[0]) * (c[1] - p[1]) - (c[0] - p[0]) * (b[1] - p[1])) / det
    const l2 = ((c[0] - p[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - p[1])) / det
    const l3 = 1 - l1 - l2
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) out.push([p[0], p[1], l1 * a[2] + l2 * b[2] + l3 * c[2]])
  }
  return out
}

/** The lowest clearance (surface − z) of the triangles inside a convex wedge, exact; null surface = presence only. */
function scanWedge(w: Wedge, tris: Tri[], surface: ((x: number, y: number) => number) | null) {
  let tested = 0, best: { clear: number; at: P3; limit: number; t: Tri } | null = null
  for (const t of tris) {
    const x0 = Math.min(t.a[0], t.b[0], t.c[0]), x1 = Math.max(t.a[0], t.b[0], t.c[0]), y0 = Math.min(t.a[1], t.b[1], t.c[1]), y1 = Math.max(t.a[1], t.b[1], t.c[1])
    if (x1 < w.box[0] || x0 > w.box[2] || y1 < w.box[1] || y0 > w.box[3]) continue
    const pts = [...clipSegment(w, t.a, t.b), ...clipSegment(w, t.b, t.c), ...clipSegment(w, t.c, t.a), ...cornersInside(w, t)]
    if (!pts.length) continue
    tested++
    if (!surface) continue
    for (const p of pts) {
      const limit = surface(p[0], p[1]), clear = limit - p[2]
      if (!best || clear < best.clear) best = { clear, at: p, limit, t }
    }
  }
  return { tested, best }
}

export interface Surface { id: string; ring: P2[]; z: (x: number, y: number) => number }
/** Any planar (or other) surfaces over convex plan regions: the lowest clearance of the triangles under each (Vista intersectProposal). */
export function surfaceCheck(tris: Tri[], surfaces: Surface[]): { id: string; tested: number; clearance: number | null; at: P3 | null; limit: number | null; part: string | null }[] {
  return surfaces.map((s) => {
    const hull = convexHull(s.ring), xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1])
    const w: Wedge = { cone: { id: s.id, name: s.id, subject: '', Lv: 0, url: '', ring: s.ring }, f: edgeFunctions(s.ring), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
    const { tested, best } = scanWedge(w, tris, s.z)
    return { id: s.id, tested, clearance: best?.clear ?? null, at: best?.at ?? null, limit: best?.limit ?? null, part: best?.t.part ?? null }
  })
}

/** z = a + b·x + c·y through three points (Vista transformPlane re-fit: a Vista bearing/pitch cannot be reused in another frame). */
export function fitPlane(p: [P3, P3, P3]): { a: number; b: number; c: number; bearingDeg: number; slopeDeg: number } {
  const [A, B, C] = p
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]
  const det = ux * vy - uy * vx
  if (Math.abs(det) <= 1e-10 * Math.max(1, Math.hypot(ux, uy) * Math.hypot(vx, vy))) throw new Error('Plane reference points must not be collinear.')
  const b = (uz * vy - uy * vz) / det, c = (ux * vz - uz * vx) / det
  return { a: A[2] - b * A[0] - c * A[1], b, c, bearingDeg: ((Math.atan2(b, c) * 180) / Math.PI + 360) % 360, slopeDeg: (Math.atan(Math.hypot(b, c)) * 180) / Math.PI }
}

/** Every cone against the proposal's triangles. Cones without an estimate are reported, never given a number. */
export function envelopeCheck(tris: Tri[], notes: string[] = []): EnvelopeResult {
  const cones: ConeEnvelope[] = WEDGES.map((w) => {
    const param = CONE_PARAMS[w.cone.id] ?? null
    const { tested, best } = scanWedge(w, tris, param ? (x, y) => limitAt(w.cone, [x, y]) as number : null)
    if (!tested) return { cone: w.cone, state: 'outside', tested, clearance: null, at: null, limit: null, tower: null, part: null, param }
    if (!param || !best) return { cone: w.cone, state: 'no_estimate', tested, clearance: null, at: null, limit: null, tower: null, part: null, param }
    const exceed = -best.clear
    const state: EnvelopeState = exceed > param.u95 ? 'above' : exceed >= -param.u95 ? 'within_uncertainty' : 'clear'
    return { cone: w.cone, state, tested, clearance: best.clear, at: best.at, limit: best.limit, tower: best.t.tower, part: best.t.part, param }
  })
  const numbered = cones.filter((c) => c.clearance !== null)
  const controlling = numbered.length ? numbered.reduce((m, c) => (c.clearance! < m.clearance! ? c : m)) : null
  return { cones, controlling, triangles: tris.length, notes }
}

// ---------------------------------------------------------------- the constraint surface, for other tools

const bearingDeg = (c: Cone) => { const u = bisector(c); return ((Math.atan2(u[0], u[1]) * 180) / Math.PI + 360) % 360 }

/** Each estimated cone's lower surface over its wedge, as a convex polygon of EPSG:26910 + CGVD28 points. */
export function constraintSurfaces(): { cone: Cone; param: ConeParam; polygon: P3[] }[] {
  return CONES.filter((c) => CONE_PARAMS[c.id]).map((c) => ({ cone: c, param: CONE_PARAMS[c.id], polygon: convexHull(c.ring).map(([x, y]) => [x, y, limitAt(c, [x, y]) as number] as P3) }))
}

export const ENVELOPE_FORMAT = 'tower-design-toolkit-view-envelope@1'

/** JSON: every cone (estimated or not), its parameters and sources, the surface polygon, and the check if given. */
export function envelopeJson(origin: P2, result?: EnvelopeResult): string {
  const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d
  const doc = {
    format: ENVELOPE_FORMAT,
    note: 'Estimated lower surfaces of the City protected views (Z = Lv + k·D along the cone axis), not City limits; the City View Cone Assessment governs. After Vista view-envelope.js (Ruijie Liu).',
    frame: { horizontal: 'EPSG:26910 (NAD83 UTM 10N, the City numbers)', vertical: 'CGVD28 (geodetic metres)', localOrigin: origin },
    cones: CONES.map((c) => {
      const p = CONE_PARAMS[c.id]
      return {
        id: c.id, name: c.name, subject: c.subject, origin: c.ring[0].map((v) => round(v)), Lv: c.Lv, axisBearingDeg: round(bearingDeg(c), 4),
        k: p?.k ?? null, slopeDeg: p ? round((Math.atan(p.k) * 180) / Math.PI, 5) : null, u95: p?.u95 ?? null, flag: p?.flag ?? 'unresolved',
        source: p?.source ?? 'No estimate: slope not found in any opened City source (City Request 0)', url: c.url,
        surface: p ? convexHull(c.ring).map(([x, y]) => [round(x), round(y), round(limitAt(c, [x, y]) as number)]) : null,
        plan: c.ring.map(([x, y]) => [round(x), round(y)]),
      }
    }),
    check: result ? {
      triangles: result.triangles, notes: result.notes,
      controlling: result.controlling ? { cone: result.controlling.cone.id, clearance: round(result.controlling.clearance!), at: result.controlling.at!.map((v) => round(v)), limit: round(result.controlling.limit!), tower: result.controlling.tower, part: result.controlling.part } : null,
      cones: result.cones.filter((c) => c.state !== 'outside').map((c) => ({ cone: c.cone.id, state: c.state, tested: c.tested, clearance: c.clearance === null ? null : round(c.clearance), at: c.at?.map((v) => round(v)) ?? null, limit: c.limit === null ? null : round(c.limit), tower: c.tower, part: c.part })),
    } : null,
  }
  return JSON.stringify(doc, null, 1)
}

/** OBJ (Y up like the app's model export: x, z, −y), local metres from `origin`, one object per estimated cone. */
export function envelopeObj(origin: P2): string {
  const lines = ['# Tower Design Toolkit: estimated lower surfaces of the protected views (not City limits; the City View Cone Assessment governs)',
    `# x = E - ${origin[0]}, y (up) = CGVD28 height, z = -(N - ${origin[1]}); EPSG:26910 metres. After Vista view-envelope.js (Ruijie Liu).`]
  let base = 1
  for (const s of constraintSurfaces()) {
    lines.push(`o cone_${s.cone.id.replace(/[^A-Za-z0-9]/g, '_')}`, `# ${s.cone.name}: k ${s.param.k}, ${s.param.flag}; ${s.param.source}`)
    for (const [x, y, z] of s.polygon) lines.push(`v ${(x - origin[0]).toFixed(3)} ${z.toFixed(3)} ${(-(y - origin[1])).toFixed(3)}`)
    for (let i = 1; i + 1 < s.polygon.length; i++) lines.push(`f ${base} ${base + i} ${base + i + 1}`)
    base += s.polygon.length
  }
  return lines.join('\n') + '\n'
}
