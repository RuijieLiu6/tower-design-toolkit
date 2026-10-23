// Vista inside Tower Design Toolkit (Real Vancouver). Vista v10.1 is Ruijie Liu's earlier view-cone tool (ARCH 540, handoff
// 22 Oct 2026, audit: 04 Tool Plan/research/vista-audit-2026-10-22.md). This file ports the parts Tower Design Toolkit lacked,
// as pure functions on Tower Design Toolkit's own data (City cones, CONE_PARAMS, EPSG:26910):
//   - Vista's exact cone clip (cone-ceiling.js): triangulate the cone, clip against a convex footprint, evaluate a
//     plane at the clipped vertices. A plane's extremum over a polygon is at a vertex, so this is exact.
//   - Vista's sloping study planes (v10): user what-if planes, never a City limit.
//   - Vista's cone-fit camera rule (report.js): hfov = clamp(1.5 x spread + 8, 24, 100), pitch rule.
//   - Vista's study format (vancouver-site-study/1 and its URL hash) and its three real-tower examples.
// The Vista legacy frame (equirectangular, equatorial degree lengths) is a FALSE ASSUMPTION: it reads north-south
// distances 0.58% short and east-west 0.20% short at 49.28 N (research C04). Vista coordinates are converted through
// latitude/longitude into EPSG:26910 here; nothing in Tower Design Toolkit is computed in the legacy frame.
import { CONES, CONE_PARAMS, bisector, checkFootprint, edgeDistance, limitAt, type Cone, type ConeState } from './viewCones'
import { toUtm10 } from './relaxAviation'
import { EYE_HEIGHT, castRay, curvatureDrop, elevAngle, hasHeight, type FootprintIndex, type HeightsLike, type SkylineInput } from './viewFrom'

export type Pt = [number, number]

// ---------------------------------------------------------------- frames
/** Vista's model frame (src/view_context/geo.py): earth anchor at model (0, 0), +Y = north, metres. */
export const VISTA_FRAME = { lat0: 49.2827, lon0: -123.1207, mPerDegLat: 110574, mPerDegLonEquator: 111320 } as const
const DEG = Math.PI / 180
const M_PER_DEG_LON = VISTA_FRAME.mPerDegLonEquator * Math.cos(VISTA_FRAME.lat0 * DEG)

/** Vista model XY → WGS84 latitude, longitude (Vista's own inverse, which is exact for its frame). */
export function vistaToLatLon([x, y]: Pt): Pt {
  return [VISTA_FRAME.lat0 + y / VISTA_FRAME.mPerDegLat, VISTA_FRAME.lon0 + x / M_PER_DEG_LON]
}
/** Latitude, longitude → Vista model XY. */
export function latLonToVista(lat: number, lon: number): Pt {
  return [(lon - VISTA_FRAME.lon0) * M_PER_DEG_LON, (lat - VISTA_FRAME.lat0) * VISTA_FRAME.mPerDegLat]
}

const GRS80 = { a: 6378137, f: 1 / 298.257222101 }
/** EPSG:26910 (UTM 10N, GRS80) → latitude, longitude. Krüger series, the inverse of relaxAviation.toUtm10 (sub-mm). */
export function utm10ToLatLon([E, N]: Pt): Pt {
  const { a, f } = GRS80, k0 = 0.9996, lon0 = -123 * DEG
  const n = f / (2 - f), A = (a / (1 + n)) * (1 + (n * n) / 4 + n ** 4 / 64)
  const be = [n / 2 - (2 * n * n) / 3 + (37 * n ** 3) / 96, (n * n) / 48 + n ** 3 / 15, (17 * n ** 3) / 480]
  const de = [2 * n - (2 * n * n) / 3 - 2 * n ** 3, (7 * n * n) / 3 - (8 * n ** 3) / 5, (56 * n ** 3) / 15]
  const xi = N / (k0 * A), eta = (E - 500000) / (k0 * A)
  let xp = xi, ep = eta
  be.forEach((b, j) => { const k = 2 * (j + 1); xp -= b * Math.sin(k * xi) * Math.cosh(k * eta); ep -= b * Math.cos(k * xi) * Math.sinh(k * eta) })
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep))
  let phi = chi
  de.forEach((d, j) => { phi += d * Math.sin(2 * (j + 1) * chi) })
  return [phi / DEG, (lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp))) / DEG]
}

/** Vista model XY → EPSG:26910, with no datum shift (City open-data lon/lat equal the City EPSG:26910 vertices, C04 r3). */
export const vistaToCity = (p: Pt): Pt => { const [lat, lon] = vistaToLatLon(p); return toUtm10(lat, lon) }
/** EPSG:26910 → Vista model XY (to show what the legacy frame would have measured). */
export const cityToVista = (p: Pt): Pt => { const [lat, lon] = utm10ToLatLon(p); return latLonToVista(lat, lon) }

/** GRS80 length of one degree of latitude and of longitude at a latitude (metres). */
export function degreeLengths(lat: number): { lat: number; lon: number } {
  const { a, f } = GRS80, e2 = f * (2 - f), s = Math.sin(lat * DEG)
  const w = 1 - e2 * s * s
  return { lat: ((a * (1 - e2)) / w ** 1.5) * DEG, lon: (a / Math.sqrt(w)) * Math.cos(lat * DEG) * DEG }
}

/** The legacy-frame error at Vista's anchor: how much shorter its metres are than GRS80 metres (fractions). */
export function frameScaleError(): { northSouth: number; eastWest: number; vista: { lat: number; lon: number }; grs80: { lat: number; lon: number } } {
  const g = degreeLengths(VISTA_FRAME.lat0)
  return { northSouth: VISTA_FRAME.mPerDegLat / g.lat - 1, eastWest: M_PER_DEG_LON / g.lon - 1, vista: { lat: VISTA_FRAME.mPerDegLat, lon: M_PER_DEG_LON }, grs80: g }
}

/** Distance between two EPSG:26910 points as the grid measures it and as Vista's frame would have. */
export function frameDistances(a: Pt, b: Pt): { grid: number; vista: number } {
  const va = cityToVista(a), vb = cityToVista(b)
  return { grid: Math.hypot(b[0] - a[0], b[1] - a[1]), vista: Math.hypot(vb[0] - va[0], vb[1] - va[1]) }
}

/** Vista assumptions found wrong and corrected here, kept visible (Sources hub, panel, report). */
export const VISTA_FALSE_ASSUMPTIONS: { claim: string; correction: string; source: { label: string } }[] = [
  { claim: "Vista's model frame measures true metres (equirectangular about 49.2827 N with the equator's degree lengths, 110,574 m and 111,320 m × cos(latitude))",
    correction: 'At 49.28 N a degree of latitude is 111,215 m and of longitude 72,757 m (GRS80): the frame reads north–south distances 0.58% short and east–west 0.19% short (26 m over the 4.6 km from Queen Elizabeth Park to downtown). Tower Design Toolkit converts Vista coordinates through latitude/longitude into EPSG:26910 and computes nothing in the legacy frame.',
    source: { label: 'Research C04 (Vista audit and frame rule); GRS80 degree lengths recomputed in engine/vista.ts' } },
  { claim: "Vista's protected-view eye is 1.6 m above its modelled ground at the cone polygon's apex",
    correction: "Vista's ground there is a 60 m SRTM grid (EGM96). The City's ViewCone service gives each origin's viewpoint elevation Lv, which is already an eye elevation: Tower Design Toolkit uses Lv. The two differ by −11.8 m (Cambie Bridge deck) to +6.7 m (Cambie Street).",
    source: { label: 'Research C04 r3 (City ViewCone service VIEWPOINT_ELEVATION_M); Vista SRTM grid sampled by tools/build_vista_compare.py' } },
  { claim: "Vista's building and roof heights can stand in for real roofs",
    correction: 'Vista re-grounded the studio model on SRTM (vertical shifts of −12.2 to +21.6 m) and used OSM floor counts; Tower Design Toolkit stands viewers only on City LiDAR 2022 roofs (P90) and never uses Vista roof heights.',
    source: { label: 'Research C04 (context data pack); Vista docs/VISTA_INTEGRATION_HANDOFF.md §10' } },
]

// ---------------------------------------------------------------- Vista's exact cone clip (cone-ceiling.js, ported)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isXY = (p: unknown): p is Pt => Array.isArray(p) && finite(p[0]) && finite(p[1])
const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const same = (a: Pt, b: Pt, eps: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps
function tolerance(points: Pt[]) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  const scale = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  return { linear: scale * 1e-10, area: scale * scale * 1e-12 }
}
type Tol = ReturnType<typeof tolerance>
/** Twice-summed fan area from the first vertex (translated, so large UTM coordinates do not cancel). */
function signedArea(p: Pt[]) {
  let sum = 0
  for (let i = 1; i + 1 < p.length; i++) sum += cross(p[0], p[i], p[i + 1])
  return sum / 2
}
function onSegment(a: Pt, b: Pt, p: Pt, tol: Tol) {
  return Math.abs(cross(a, b, p)) <= tol.area &&
    p[0] >= Math.min(a[0], b[0]) - tol.linear && p[0] <= Math.max(a[0], b[0]) + tol.linear &&
    p[1] >= Math.min(a[1], b[1]) - tol.linear && p[1] <= Math.max(a[1], b[1]) + tol.linear
}
function intersects(a: Pt, b: Pt, c: Pt, d: Pt, tol: Tol) {
  const u = cross(a, b, c), v = cross(a, b, d), w = cross(c, d, a), z = cross(c, d, b)
  if (((u > tol.area && v < -tol.area) || (v > tol.area && u < -tol.area)) && ((w > tol.area && z < -tol.area) || (z > tol.area && w < -tol.area))) return true
  return onSegment(a, b, c, tol) || onSegment(a, b, d, tol) || onSegment(c, d, a, tol) || onSegment(c, d, b, tol)
}
/** A simple polygon (open ring, counter-clockwise), or null if malformed; `convex` also rejects concave input. */
export function polygon(value: unknown, convex: boolean): Pt[] | null {
  if (!Array.isArray(value) || value.length < 3 || !value.every(isXY)) return null
  let p = (value as Pt[]).map((q) => [q[0], q[1]] as Pt)
  const tol = tolerance(p)
  if (same(p[0], p[p.length - 1], tol.linear)) p.pop()
  p = p.filter((q, i) => !i || !same(q, p[i - 1], tol.linear))
  if (p.length < 3 || Math.abs(signedArea(p)) <= tol.area) return null
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
    if (j === i + 1 || (i === 0 && j === p.length - 1)) continue
    if (intersects(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length], tol)) return null
  }
  if (signedArea(p) < 0) p.reverse()
  if (convex && p.some((q, i) => cross(q, p[(i + 1) % p.length], p[(i + 2) % p.length]) < -tol.area)) return null
  return p
}
const insideTriangle = (p: Pt, a: Pt, b: Pt, c: Pt, eps: number) => cross(a, b, p) >= -eps && cross(b, c, p) >= -eps && cross(c, a, p) >= -eps
/** Ear-clipping triangulation of a simple counter-clockwise polygon. */
export function triangulate(input: Pt[]): Pt[][] | null {
  const p = input.slice(), triangles: Pt[][] = [], tol = tolerance(p)
  let changed = true
  while (changed && p.length > 3) {
    changed = false
    for (let i = 0; i < p.length; i++) {
      if (onSegment(p[(i + p.length - 1) % p.length], p[(i + 1) % p.length], p[i], tol)) { p.splice(i, 1); changed = true; break }
    }
  }
  while (p.length > 3) {
    let found = false
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]
      if (cross(a, b, c) <= tol.area) continue
      if (p.some((q) => q !== a && q !== b && q !== c && insideTriangle(q, a, b, c, tol.area))) continue
      triangles.push([a, b, c]); p.splice(i, 1); found = true; break
    }
    if (!found) return null
  }
  triangles.push(p)
  return triangles
}
/** Sutherland–Hodgman clip of a polygon against a convex counter-clockwise footprint. */
export function clip(subject: Pt[], footprint: Pt[]): Pt[] {
  let result = subject
  const tol = tolerance(subject.concat(footprint))
  for (let i = 0; i < footprint.length && result.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length], next: Pt[] = []
    for (let j = 0; j < result.length; j++) {
      const s = result[j], e = result[(j + 1) % result.length]
      const ds = cross(a, b, s), de = cross(a, b, e), si = ds >= -tol.area, ei = de >= -tol.area
      if (si !== ei) { const t = ds / (ds - de); next.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]) }
      if (ei) next.push(e)
    }
    result = next.filter((p, j) => !j || !same(p, next[j - 1], tol.linear))
    if (result.length > 1 && same(result[0], result[result.length - 1], tol.linear)) result.pop()
  }
  return result
}
export function contains(poly: Pt[], point: Pt): boolean {
  const tol = tolerance(poly)
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i]
    if (onSegment(a, b, point, tol)) return true
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
/** Absolute area of a polygon (m²), fan-summed from its first vertex. */
export const areaOf = (p: Pt[]) => (p.length < 3 ? 0 : Math.abs(signedArea(p)))

/** Pieces of a convex footprint inside a (possibly concave) cone polygon: Vista's exact plan overlap. */
export function overlapPieces(coneRing: Pt[], footprint: Pt[]): Pt[][] | null {
  const ring = polygon(coneRing, false), fp = polygon(footprint, true)
  if (!ring || !fp) return null
  const tris = triangulate(ring)
  if (!tris) return null
  return tris.map((t) => clip(t, fp)).filter((p) => p.length)
}

// ---------------------------------------------------------------- planes (Vista v10 study planes)
/** A sloping plane through an origin: elevation = E + tan(pitch) × distance along the bearing (Vista v10). */
export interface Plane {
  origin: Pt
  /** Elevation at the origin (geodetic m, CGVD28 like every Real Vancouver height). */
  observerElevationM: number
  /** Degrees clockwise from grid north (+Y). */
  bearingDeg: number
  /** Slope of the lower boundary, degrees (|pitch| < 89). */
  pitchDeg: number
  source: string
}
export function planeFunction(plane: Plane | null | undefined): ((p: Pt) => number) | null {
  if (!plane || !isXY(plane.origin) || !finite(plane.observerElevationM) || !finite(plane.bearingDeg) || !finite(plane.pitchDeg) || Math.abs(plane.pitchDeg) >= 89) return null
  const slope = Math.tan(plane.pitchDeg * DEG)
  const dx = Math.sin(plane.bearingDeg * DEG) * slope, dy = Math.cos(plane.bearingDeg * DEG) * slope
  return (p) => plane.observerElevationM + (p[0] - plane.origin[0]) * dx + (p[1] - plane.origin[1]) * dy
}

export type CeilingStatus = 'no_site' | 'outside' | 'unknown' | 'partial' | 'ready'
export interface CeilingInput {
  cones: { view_number: string; polygon_model_xy: Pt[] }[]
  footprints?: Pt[][]
  point?: Pt | null
  planes: Record<string, Plane | null | undefined>
  groundModelZ?: number | null
  proposalTopModelZ?: number | null
  datumOffsetM?: number | null
}
export interface CeilingResult {
  status: CeilingStatus
  ceilingElevationM: number | null
  maxHeightM: number | null
  clearanceM: number | null
  limitingView: string | null
  limitingPoint: Pt | null
  patches: { view: string; points: [number, number, number][] }[]
  missingViews: string[]
  overlappingViews: string[]
}
/** Vista's ConeCeiling.evaluate, typed. "ready" means calculable from the entered planes, never verified or approved. */
export function evaluateCeiling(o: CeilingInput): CeilingResult {
  const out: CeilingResult = { status: 'no_site', ceilingElevationM: null, maxHeightM: null, clearanceM: null, limitingView: null, limitingPoint: null, patches: [], missingViews: [], overlappingViews: [] }
  const supplied = o.footprints ?? []
  const footprints = supplied.map((f) => polygon(f, true))
  if (footprints.some((f) => !f) || (!footprints.length && !isXY(o.point))) return out
  const point = isXY(o.point) ? ([o.point[0], o.point[1]] as Pt) : null
  let minimum: number | null = null
  for (const cone of o.cones) {
    const view = cone.view_number
    const ring = polygon(cone.polygon_model_xy, false)
    if (!ring) { out.missingViews.push(view); continue }
    const triangles = triangulate(ring)
    if (!triangles) { out.missingViews.push(view); continue }
    const pieces = footprints.length ? footprints.flatMap((f) => triangles.map((t) => clip(t, f as Pt[])).filter((p) => p.length)) : contains(ring, point!) ? [[point!]] : []
    if (!pieces.length) continue
    out.overlappingViews.push(view)
    const elevationAt = planeFunction(o.planes[view])
    if (!elevationAt) { out.missingViews.push(view); continue }
    for (const piece of pieces) {
      const z = piece.map(elevationAt)
      if (!z.every(finite)) { out.missingViews.push(view); continue }
      for (let i = 0; i < piece.length; i++) if (minimum === null || z[i] < minimum) { minimum = z[i]; out.limitingView = view; out.limitingPoint = [piece[i][0], piece[i][1]] }
      const off = o.datumOffsetM
      if (finite(off) && z.every((v) => finite(v - off))) out.patches.push({ view, points: piece.map((p, i) => [p[0], p[1], z[i] - off]) })
    }
  }
  out.missingViews = [...new Set(out.missingViews)]
  out.overlappingViews = [...new Set(out.overlappingViews)]
  out.status = minimum !== null ? (out.missingViews.length ? 'partial' : 'ready') : out.missingViews.length ? 'unknown' : 'outside'
  out.ceilingElevationM = minimum
  const off = o.datumOffsetM
  if (minimum !== null && finite(off)) {
    const z = minimum - off
    if (finite(o.groundModelZ) && finite(z - o.groundModelZ)) out.maxHeightM = z - o.groundModelZ
    if (finite(o.proposalTopModelZ) && finite(z - o.proposalTopModelZ)) out.clearanceM = z - o.proposalTopModelZ
  }
  return out
}

// ---------------------------------------------------------------- Tower Design Toolkit cones seen through Vista's kernels
const bearingOf = (u: Pt) => ((Math.atan2(u[0], u[1]) / DEG) + 360) % 360

/** Tower Design Toolkit's planar estimate (Z = Lv + k·D along the bisector) written as a Vista plane: the same surface. */
export function conePlane(cone: Cone): Plane | null {
  const prm = CONE_PARAMS[cone.id]
  if (!prm) return null
  return { origin: cone.ring[0], observerElevationM: cone.Lv, bearingDeg: bearingOf(bisector(cone)), pitchDeg: Math.atan(prm.k) / DEG, source: prm.source }
}

/** Shortest distance between a footprint and a cone outline when they do not overlap (m). */
export function polygonGap(footprint: Pt[], ring: Pt[]): number {
  const closedFp = [...footprint, footprint[0]]
  let d = Infinity
  for (const p of footprint) d = Math.min(d, edgeDistance(p, ring))
  for (const p of ring) d = Math.min(d, edgeDistance(p, closedFp))
  return d
}

export interface ExactCone {
  cone: Cone
  /** Exact plan overlap of the footprint with the cone (EPSG:26910 grid m²). */
  overlapM2: number
  /** The same overlap measured in Vista's legacy frame (shorter metres). */
  vistaFrameM2: number
  /** Gap to the cone outline when there is no overlap (m). */
  gapM: number | null
  /** Lowest estimated limit over the overlap, exact at clipped vertices (Vista kernel on Tower Design Toolkit's plane). */
  exactLimit: number | null
  limitPoint: Pt | null
  /** checkFootprint's limit from 2 m edge / 5 m grid samples, and its state. */
  sampledLimit: number | null
  state: ConeState
  /** sampled − exact (m), ≥ 0 by construction when both exist. */
  difference: number | null
}

/** Every cone against a convex footprint (EPSG:26910): exact overlap and limit beside the sampled check. */
export function exactCones(footprint: Pt[], topZ: number, near = 60): ExactCone[] {
  const sampled = checkFootprint(footprint, topZ)
  const out: ExactCone[] = []
  CONES.forEach((cone, i) => {
    const pieces = overlapPieces(cone.ring, footprint) ?? []
    const overlapM2 = pieces.reduce((s, p) => s + areaOf(p), 0)
    const s = sampled[i]
    if (overlapM2 <= 1e-6) {
      const gap = polygonGap(footprint, cone.ring)
      if (gap <= near || s.state !== 'outside') out.push({ cone, overlapM2: 0, vistaFrameM2: 0, gapM: gap, exactLimit: null, limitPoint: null, sampledLimit: s.limit, state: s.state, difference: null })
      return
    }
    const vistaFrameM2 = pieces.reduce((sum, p) => sum + areaOf(p.map(cityToVista)), 0)
    let exactLimit: number | null = null, limitPoint: Pt | null = null
    if (CONE_PARAMS[cone.id]) for (const piece of pieces) for (const p of piece) {
      const z = limitAt(cone, p) as number
      if (exactLimit === null || z < exactLimit) { exactLimit = z; limitPoint = p }
    }
    out.push({ cone, overlapM2, vistaFrameM2, gapM: null, exactLimit, limitPoint, sampledLimit: s.limit, state: s.state,
      difference: exactLimit !== null && s.limit !== null ? s.limit - exactLimit : null })
  })
  return out
}

/** A what-if plane as entered: blanks are allowed and leave the cone without a plane. */
export interface PlaneEntry { elevation: number | null; pitch: number | null; bearing: number | null; note?: string }

/**
 * Vista v10 "study ceiling" on Tower Design Toolkit's cones: the user's planes through each City origin, evaluated exactly over
 * the footprint (EPSG:26910). Heights are CGVD28 throughout, so Vista's datum offset is 0 (an assumption about the
 * user's numbers, stated on the card). Only cones the footprint overlaps take part; a missing plane gives "partial" or
 * "unknown", never an unlimited height. This is a what-if: it never feeds the View-cone height check.
 */
export function whatIfCeiling(footprint: Pt[], entries: Record<string, PlaneEntry>, ground: number, top: number): CeilingResult {
  const planes: Record<string, Plane> = {}
  for (const cone of CONES) {
    const e = entries[cone.id]
    if (!e || e.elevation === null || e.pitch === null) continue
    planes[cone.id] = { origin: cone.ring[0], observerElevationM: e.elevation, bearingDeg: e.bearing ?? bearingOf(bisector(cone)), pitchDeg: e.pitch, source: e.note ?? '' }
  }
  return evaluateCeiling({ cones: CONES.map((c) => ({ view_number: c.id, polygon_model_xy: c.ring })), footprints: [footprint], planes, groundModelZ: ground, proposalTopModelZ: top, datumOffsetM: 0 })
}

/** Default bearing for a what-if plane: the cone axis (degrees clockwise from grid north). */
export const axisBearing = (cone: Cone) => bearingOf(bisector(cone))

// ---------------------------------------------------------------- Vista's cone-fit camera (report.js)
/** Angular spread of a cone at its origin (degrees), from the outermost vertices as seen from the apex. */
export function coneSpread(cone: Cone): number {
  const O = cone.ring[0]
  const angs = cone.ring.slice(1, -1).map(([x, y]) => Math.atan2(y - O[1], x - O[0]))
  return (Math.max(...angs) - Math.min(...angs)) / DEG
}
/** The same spread as Vista measured it, in its legacy frame (reproduces Vista's published spread_deg). */
export function vistaFrameSpread(cone: Cone): number {
  const v = cone.ring.map(cityToVista), O = v[0]
  const angs = v.slice(1, -1).map(([x, y]) => Math.atan2(y - O[1], x - O[0]))
  return (Math.max(...angs) - Math.min(...angs)) / DEG
}
/** Vista's horizontal field for a protected view: clamp(1.5 × spread + 8, 24, 100) degrees. */
export const coneFitHfov = (spreadDeg: number) => Math.min(100, Math.max(24, spreadDeg * 1.5 + 8))
/** Vertical field for a horizontal field and an aspect (width / height). */
export const vfovOf = (hfov: number, aspect: number) => (2 * Math.atan(Math.tan((hfov * DEG) / 2) / aspect)) / DEG
/** Vista's pitch: clamp(max(0.12 × vfov, top angle − 0.32 × vfov), −2, 28) degrees (shows sky above the mountains). */
export const coneFitPitch = (vfov: number, topAngle: number) => Math.max(-2, Math.min(28, Math.max(vfov * 0.12, topAngle - vfov * 0.32)))

export interface ConeCamera { cone: Cone; origin: Pt; eye: number; bearing: number; spread: number; hfov: number }
/** Camera at a protected viewpoint: City origin and Lv (an eye elevation, research C04 r3), looking along the axis. */
export function coneCamera(cone: Cone): ConeCamera {
  const spread = coneSpread(cone)
  return { cone, origin: cone.ring[0], eye: cone.Lv, bearing: bearingOf(bisector(cone)), spread, hfov: coneFitHfov(spread) }
}

// ---------------------------------------------------------------- Vista v08 nearby rooftops, on LiDAR roofs
export interface RoofView {
  index: number
  /** Viewpoint on the roof (local frame), its roof P90 and eye (CGVD28 m). */
  at: Pt
  roof: number
  eye: number
  distance: number
  /** Degrees clockwise from grid north, from the roof to the tower. */
  bearing: number
  /** Elevation angle to the tower top, and the highest obstruction before the tower on that line. */
  topAngle: number
  blockAngle: number
  blockedBy: string
  /** Height of the tower visible above the obstruction line (m; 0 = hidden). */
  visibleM: number
}

/**
 * Vista's "nearby roofs" (v08), rebuilt on City LiDAR roofs: the nearest measured roofs around a tower, and how much of
 * the tower each one sees over nearer roofs and terrain (one ray, curvature with refraction). Optimistic where
 * buildings have no LiDAR height: those neither host a viewpoint nor block (same rule as View from here).
 */
export function nearbyRoofs(inp: { idx: FootprintIndex; heights: HeightsLike | null; terrain: SkylineInput['terrain'] }, tower: { centre: Pt; base: number; top: number; radius: number }, opts: { max?: number; within?: number; eye?: number; minDistance?: number } = {}): RoofView[] {
  const { idx, heights } = inp
  if (!heights) return []
  const within = opts.within ?? 1200, eyeH = opts.eye ?? EYE_HEIGHT
  const minD = Math.max(tower.radius + 15, opts.minDistance ?? 0)
  const cands: { i: number; c: Pt; d: number }[] = []
  idx.footprints.forEach((f, i) => {
    if (!hasHeight(heights, i)) return
    let sx = 0, sy = 0
    for (const [x, y] of f.outer) { sx += x; sy += y }
    const c: Pt = [sx / f.outer.length, sy / f.outer.length]
    const d = Math.hypot(c[0] - tower.centre[0], c[1] - tower.centre[1])
    if (d > minD && d <= within) cands.push({ i, c, d })
  })
  cands.sort((a, b) => a.d - b.d)
  // Around the compass: the few nearest roofs in each 45° sector seen from the tower, so suggestions are not all on one side.
  const sector = (c: Pt) => Math.floor((((Math.atan2(c[0] - tower.centre[0], c[1] - tower.centre[1]) / DEG) + 360 + 22.5) % 360) / 45)
  const perSector = Math.max(1, Math.ceil((opts.max ?? 24) / 8))
  const count = new Array(8).fill(0)
  const picked = cands.filter((k) => count[sector(k.c)]++ < perSector)
  const out: RoofView[] = []
  for (const { i, c, d } of picked) {
    const eye = heights.roof[i] + eyeH
    const bearing = ((Math.atan2(tower.centre[0] - c[0], tower.centre[1] - c[1]) / DEG) + 360) % 360
    const ray = castRay({ eye: [c[0], c[1], eye], terrain: inp.terrain, idx, heights, towers: [], farMin: Infinity, maxDistance: Math.max(5, d - tower.radius - 2) }, bearing)
    const topAngle = elevAngle(tower.top, eye, d)
    const hiddenBelow = eye + Math.tan(Math.max(-89, ray.near.angle) * DEG) * d + curvatureDrop(d)
    out.push({ index: i, at: c, roof: heights.roof[i], eye, distance: d, bearing, topAngle, blockAngle: ray.near.angle, blockedBy: ray.near.label,
      visibleM: Math.max(0, tower.top - Math.max(hiddenBelow, tower.base)) })
  }
  return out
}

// ---------------------------------------------------------------- Vista studies (vancouver-site-study/1 and URL hash)
export interface VistaBlock { h: number; w: number; d: number; dx: number; dy: number; name: string; rotation: number }
export interface VistaStudy {
  name: string
  /** Site point in Vista's frame. */
  site: Pt | null
  blocks: VistaBlock[]
  observer: { xy: Pt; source: string; eye: number; fov: number } | null
  /** Vista's sloping study planes (hash key cp), keyed by view number; origins in Vista's frame. */
  planes: Record<string, Plane>
  warnings: string[]
}
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s))

/** Read a Vista URL fragment (#site=…&parts=…). Unknown keys are ignored; nothing is executed. */
export function parseVistaHash(hash: string): VistaStudy {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const warnings: string[] = []
  const xy = (s: string | null): Pt | null => {
    if (!s) return null
    const [a, b] = s.split(',').map(Number)
    return finite(a) && finite(b) ? [a, b] : null
  }
  const blocks: VistaBlock[] = []
  for (const chunk of (p.get('parts') ?? '').split(';').filter(Boolean)) {
    const f = chunk.split(',')
    if (f.length < 5 || !f.slice(0, 5).every((v) => finite(num(v)))) { warnings.push(`Skipped a malformed block "${chunk.slice(0, 40)}"`); continue }
    let name = 'Block'
    try { name = decodeURIComponent(f.slice(5).join(',') || 'Block') } catch { name = f.slice(5).join(',') || 'Block' }
    blocks.push({ h: clampN(+f[0], 1, 400), w: clampN(+f[1], 1, 300), d: clampN(+f[2], 1, 300), dx: clampN(+f[3], -500, 500), dy: clampN(+f[4], -500, 500), name: name.slice(0, 60), rotation: 0 })
  }
  const rots = (p.get('rot') ?? '').split(',').map(Number)
  blocks.forEach((b, i) => { b.rotation = finite(rots[i]) ? clampN(rots[i], -180, 180) : 0 })
  const obs = xy(p.get('obs'))
  const eye = num(p.get('eye') ?? undefined), fov = num(p.get('fov') ?? undefined)
  const planes: Record<string, Plane> = {}
  if (p.has('cp')) {
    try {
      const cp = JSON.parse(p.get('cp')!) as { planes?: Record<string, Partial<Plane>> } | null
      for (const [view, q] of Object.entries(cp?.planes ?? {})) {
        const plane = { origin: q.origin as Pt, observerElevationM: q.observerElevationM as number, bearingDeg: q.bearingDeg as number, pitchDeg: q.pitchDeg as number, source: String(q.source ?? '').slice(0, 200) }
        if (planeFunction(plane)) planes[view] = plane
        else warnings.push(`Study plane for view ${view} is incomplete and was not imported`)
      }
    } catch { warnings.push('The study planes (cp) could not be read') }
  }
  let name = p.get('name') ?? 'Vista study'
  name = name.slice(0, 120)
  return { name, site: xy(p.get('site')), blocks, observer: obs ? { xy: obs, source: p.get('osrc') ?? 'ground', eye: finite(eye) ? clampN(eye, 0, 3) : 1.6, fov: finite(fov) ? clampN(fov, 20, 110) : 60 } : null, planes, warnings }
}

/** Read a saved Vista study file. Only the fields Tower Design Toolkit can use are read; imported models were never embedded. */
export function parseVistaStudy(json: unknown): VistaStudy {
  const d = json as { schema?: unknown; resume_hash?: unknown; name?: unknown } | null
  if (!d || typeof d !== 'object' || d.schema !== 'vancouver-site-study/1' || typeof d.resume_hash !== 'string') {
    throw new Error('Not a Vista study file (schema vancouver-site-study/1 with a resume_hash)')
  }
  const s = parseVistaHash(d.resume_hash)
  if (typeof d.name === 'string') s.name = d.name.slice(0, 120)
  return s
}

/** A Vista block as a Tower Design Toolkit footprint (EPSG:26910 corners) with its centre and rotation in the grid. */
export interface ConvertedBlock {
  block: VistaBlock
  /** Centre, EPSG:26910. */
  centre: Pt
  /** Degrees counter-clockwise (Tower Design Toolkit convention), including grid convergence. */
  rotation: number
  corners: Pt[]
  /** What the legacy frame did to this block: its footprint area there and in the grid (m²). */
  vistaArea: number
  gridArea: number
}
/** Vista blocks sit on the site point plus offsets; rotation is clockwise from above. Corners convert one by one. */
export function convertBlock(site: Pt, b: VistaBlock): ConvertedBlock {
  const c: Pt = [site[0] + b.dx, site[1] + b.dy]
  const a = (-b.rotation * DEG), cs = Math.cos(a), sn = Math.sin(a)
  const local: Pt[] = [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]]
  const vCorners = local.map(([u, v]) => [c[0] + u * cs - v * sn, c[1] + u * sn + v * cs] as Pt)
  const corners = vCorners.map(vistaToCity)
  const centre = vistaToCity(c)
  const e = [corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]]
  return { block: b, centre, rotation: Math.atan2(e[1], e[0]) / DEG, corners, vistaArea: b.w * b.d, gridArea: areaOf(corners) }
}

export interface VistaExample { key: string; name: string; address: string; facts: string; hash: string }
/** Vista's three real-tower examples (explorer.js EXAMPLES, v09.15): one block of the published height each. */
export const VISTA_EXAMPLES: VistaExample[] = [
  { key: 'shangri-la', name: 'Shangri-La Vancouver', address: '1128 W Georgia St', facts: '201 m · 62 storeys · 2008 · James K.M. Cheng Architects',
    hash: '#name=Example+-+Shangri-La+Vancouver&site=-216.123%2C338.145&parts=201%2C29%2C43%2C0%2C0%2CShangri-La%2520Vancouver&rot=0&obs=-305.253%2C101.423&osrc=rooftop&eye=1.6&fov=60' },
  { key: 'vancouver-house', name: 'Vancouver House', address: '1480 Howe St', facts: '152 m to roof · 52 storeys · 2020 · BIG with DIALOG',
    hash: '#name=Example+-+Vancouver+House&site=-750.065%2C-859.650&parts=152%2C41%2C41%2C0%2C0%2CVancouver%2520House&rot=0&obs=-501.343%2C-891.570&osrc=rooftop&eye=1.6&fov=60' },
  { key: 'butterfly', name: 'The Butterfly', address: '969 Burrard St', facts: '170 m to roof (179 m to top) · 57 storeys · 2024 · Revery Architecture',
    hash: '#name=Example+-+The+Butterfly&site=-425.360%2C-93.910&parts=170%2C29%2C34%2C0%2C0%2CThe%2520Butterfly&rot=0&obs=-500.647%2C148.167&osrc=rooftop&eye=1.6&fov=60' },
]

/** Vista's v09 sentence for a study, rebuilt on Tower Design Toolkit's results ("The study in one sentence"). */
export function studySentence(name: string, height: number, exact: ExactCone[]): string {
  const inside = exact.filter((e) => e.overlapM2 > 0)
  const near = exact.filter((e) => e.overlapM2 === 0 && e.gapM !== null && e.gapM < 1.5)
  if (!inside.length) return `${name} (${Math.round(height)} m) sits outside every mapped protected view${near.length ? `, but within 1.5 m of ${near.map((e) => e.cone.id).join(', ')}` : ''}. Outside the cones does not mean unlimited height.`
  const parts = inside.map((e) => `${e.cone.id} ${e.cone.name} (${Math.round(e.overlapM2).toLocaleString('en-CA')} m² in plan)`)
  return `${name} (${Math.round(height)} m) overlaps ${parts.join(', ')} in plan${near.length ? `, and sits within 1.5 m of ${near.map((e) => e.cone.id).join(', ')}` : ''}. Estimates only: the City View Cone Assessment governs.`
}
