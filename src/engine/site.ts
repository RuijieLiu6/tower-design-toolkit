// The Real Vancouver study site (after Vista v34, Ruijie Liu: site-geometry.js, import-parcels.js). Pure geometry in
// the local frame (EPSG:26910 minus the City origin, metres): a site boundary that is a valid simple polygon, its
// metrics, a site made from existing City footprints, and the City parcels under it, joined only where that is exact.
// A drawn site or one taken from buildings is a study boundary, not a legal parcel; parcels are a dated City snapshot.

export type Pt = [number, number]

// ---------------------------------------------------------------- Vista site-geometry.js, ported
/** Tolerances scale with the polygon extent (Vista), so the same checks work at any scale. */
function extent(points: Pt[]): number {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const p of points) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]) }
  return Math.max(1, Math.hypot(xmax - xmin, ymax - ymin))
}
const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
function onSegment(a: Pt, b: Pt, p: Pt, linearTol: number, crossTol: number) {
  return Math.abs(cross(a, b, p)) <= crossTol && p[0] >= Math.min(a[0], b[0]) - linearTol && p[0] <= Math.max(a[0], b[0]) + linearTol &&
    p[1] >= Math.min(a[1], b[1]) - linearTol && p[1] <= Math.max(a[1], b[1]) + linearTol
}
function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt, linearTol: number, crossTol: number) {
  const sign = (v: number) => (v > crossTol ? 1 : v < -crossTol ? -1 : 0)
  const s1 = sign(cross(a, b, c)), s2 = sign(cross(a, b, d)), s3 = sign(cross(c, d, a)), s4 = sign(cross(c, d, b))
  if (s1 * s2 < 0 && s3 * s4 < 0) return true
  return (s1 === 0 && onSegment(a, b, c, linearTol, crossTol)) || (s2 === 0 && onSegment(a, b, d, linearTol, crossTol)) ||
    (s3 === 0 && onSegment(c, d, a, linearTol, crossTol)) || (s4 === 0 && onSegment(c, d, b, linearTol, crossTol))
}

/** Why a ring is not a usable site boundary (Vista's messages), or null when it is a simple polygon. Open ring expected. */
export function validateRing(points: unknown): string | null {
  if (!Array.isArray(points)) return 'Polygon points must be an array.'
  if (points.length < 3) return 'A polygon needs at least 3 points.'
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!Array.isArray(p) || p.length !== 2) return `Point ${i + 1} must contain exactly two coordinates.`
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return `Point ${i + 1} coordinates must be finite numbers.`
  }
  const pts = points as Pt[], scale = extent(pts), linearTol = scale * 1e-9, crossTol = scale * scale * 1e-12, n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= linearTol) return `Polygon edge ${i + 1} is duplicated or too short.`
  }
  // Adjacent edges may meet at their shared vertex, but may not double back over one another along the same line.
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n], here = pts[i], next = pts[(i + 1) % n]
    if (Math.abs(cross(prev, here, next)) <= crossTol) {
      const ux = here[0] - prev[0], uy = here[1] - prev[1], vx = next[0] - here[0], vy = next[1] - here[1]
      if (ux * vx + uy * vy < -linearTol * linearTol) return 'Adjacent polygon edges overlap or double back.'
    }
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue // consecutive edges share one endpoint
      if (segmentsIntersect(a, b, pts[j], pts[(j + 1) % n], linearTol, crossTol)) return 'Polygon edges cross or touch.'
    }
  }
  let twice = 0
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; twice += a[0] * b[1] - b[0] * a[1] }
  if (Math.abs(twice) <= crossTol) return 'Polygon is degenerate or collinear.'
  return null
}

export interface RingMetrics { area: number; perimeter: number; centre: Pt; bounds: [number, number, number, number]; lengths: number[] }
/** Area, perimeter, centroid, bounds and edge lengths of a valid ring (throws on an invalid one, like Vista). */
export function ringMetrics(points: Pt[]): RingMetrics {
  const error = validateRing(points)
  if (error) throw new Error(error)
  const n = points.length
  let twice = 0, cx = 0, cy = 0, perimeter = 0, xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  const lengths: number[] = []
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n], term = a[0] * b[1] - b[0] * a[1]
    twice += term; cx += (a[0] + b[0]) * term; cy += (a[1] + b[1]) * term
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]); lengths.push(l); perimeter += l
    xmin = Math.min(xmin, a[0]); xmax = Math.max(xmax, a[0]); ymin = Math.min(ymin, a[1]); ymax = Math.max(ymax, a[1])
  }
  const f = 1 / (3 * twice)
  return { area: Math.abs(twice / 2), perimeter, centre: [cx * f, cy * f], bounds: [xmin, ymin, xmax, ymax], lengths }
}

/** Point in or on a valid ring (Vista pointInPolygon). */
export function pointInRing(point: Pt, ring: Pt[]): boolean {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || validateRing(ring)) return false
  const scale = extent(ring), linearTol = scale * 1e-9, crossTol = scale * scale * 1e-12
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]
    if (onSegment(a, b, point, linearTol, crossTol)) return true
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside
  }
  return inside
}

export const signedArea = (r: Pt[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2
/** Open ring, counter-clockwise. */
export function normalizeRing(r: Pt[]): Pt[] {
  let out = r.map((p) => [p[0], p[1]] as Pt)
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out = out.slice(0, -1)
  return signedArea(out) < 0 ? out.reverse() : out
}

/** Distance from a point to the ring's boundary (m). */
export function distanceToRing(p: Pt, ring: Pt[]): number {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    d = Math.min(d, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
  }
  return d
}

// ---------------------------------------------------------------- exact shared-edge union (Vista import-parcels.js, ported)
// Confirms a rounded zero determinant with exact binary arithmetic. This never snaps coordinates: nearly adjacent
// boundaries must never become fake bridges.
const floatBits = new DataView(new ArrayBuffer(8))
function dyadic(x: number): [bigint, number] {
  floatBits.setFloat64(0, x)
  const bits = floatBits.getBigUint64(0), exp = Number((bits >> 52n) & 2047n), fraction = bits & ((1n << 52n) - 1n)
  return [(bits >> 63n ? -1n : 1n) * (exp ? fraction + (1n << 52n) : fraction), exp ? exp - 1075 : -1074]
}
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]
export function exactCollinear(a: Pt, b: Pt, c: Pt): boolean {
  if (same(a, b)) return true
  if (cross(a, b, c) !== 0) return false
  if (a[0] === b[0]) return c[0] === a[0]
  if (a[1] === b[1]) return c[1] === a[1]
  const values = [...a, ...b, ...c].map(dyadic), exponent = Math.min(...values.map((v) => v[1]))
  const n = values.map((v) => v[0] << BigInt(v[1] - exponent))
  return (n[2] - n[0]) * (n[5] - n[1]) === (n[3] - n[1]) * (n[4] - n[0])
}
const onLoose = (a: Pt, b: Pt, p: Pt) => Math.abs(cross(a, b, p)) < 1e-8 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
function ringState(p: Pt, r: Pt[]): 0 | 1 | 2 {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i]
    if (onLoose(a, b, p)) return 2
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? 1 : 0
}
const edgesOf = (r: Pt[]) => r.map((a, i) => [a, r[(i + 1) % r.length]] as [Pt, Pt]).filter(([a, b]) => !same(a, b))

/** A polygon with holes: [outer, ...holes]. */
export type Poly = Pt[][]

/**
 * Union of polygons that meet only along exactly shared (or exactly collinear, split) edges: shared edges cancel,
 * the rest is chained into rings. Returns null whenever the topology is not exact: crossing edges, interior overlap or
 * containment, a vertex shared by more than two boundary edges, an open chain. Null means "keep them separate and
 * review", never "join approximately" (Vista import-parcels.js union, unchanged in behaviour).
 */
export function exactUnion(polys: Poly[]): Poly[] | null {
  const all: { a: Pt; b: Pt; pi: number }[] = []
  for (let pi = 0; pi < polys.length; pi++) for (let ri = 0; ri < polys[pi].length; ri++) {
    let r = polys[pi][ri].slice()
    if (r.length > 1 && same(r[0], r[r.length - 1])) r.pop()
    if (r.length < 3 || !signedArea(r)) return null
    if ((signedArea(r) > 0) !== (ri === 0)) r = r.reverse()
    for (const [a, b] of edgesOf(r)) all.push({ a, b, pi })
  }
  if (all.length > 600) return null
  const splits = all.map((e) => [e.a, e.b])
  const exactOn = (a: Pt, b: Pt, p: Pt) => exactCollinear(a, b, p) && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j]
    if (a.pi === b.pi) continue
    if (exactCollinear(a.a, a.b, b.a) && exactCollinear(a.a, a.b, b.b)) {
      for (const p of [b.a, b.b]) if (exactOn(a.a, a.b, p)) splits[i].push(p)
      for (const p of [a.a, a.b]) if (exactOn(b.a, b.b, p)) splits[j].push(p)
    } else if (cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) < 0 && cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) < 0) return null
  }
  const segmented: { a: Pt; b: Pt }[] = []
  for (let i = 0; i < all.length; i++) {
    const e = all[i], axis = e.a[0] !== e.b[0] ? 0 : 1, sign = Math.sign(e.b[axis] - e.a[axis])
    const points = splits[i].sort((p, q) => (p[axis] - q[axis]) * sign).filter((p, j, arr) => !j || !same(p, arr[j - 1]))
    for (let j = 1; j < points.length; j++) segmented.push({ a: points[j - 1], b: points[j] })
  }
  // Interior overlap or containment cannot be resolved by shared-edge cancellation.
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    for (const [a, b] of [[polys[i], polys[j]], [polys[j], polys[i]]]) if (a[0].some((p) => ringState(p, b[0]) === 1 && !b.slice(1).some((h) => ringState(p, h)))) return null
  }
  const key = (p: Pt) => `${p[0]},${p[1]}`, pending = new Map<string, { a: Pt; b: Pt }>()
  for (const e of segmented) {
    const k = `${key(e.a)}|${key(e.b)}`, rev = `${key(e.b)}|${key(e.a)}`
    if (pending.has(rev)) pending.delete(rev)
    else if (pending.has(k)) return null
    else pending.set(k, e)
  }
  const next = new Map<string, { a: Pt; b: Pt }>()
  for (const e of pending.values()) { const k = key(e.a); if (next.has(k)) return null; next.set(k, e) }
  const rings: Pt[][] = []
  while (next.size) {
    const first = next.values().next().value!, r: Pt[] = [], start = key(first.a)
    let e: { a: Pt; b: Pt } | undefined = first, closed = false
    while (e) {
      const k = key(e.a)
      if (!next.has(k)) return null
      r.push(e.a); next.delete(k)
      if (key(e.b) === start) { closed = true; break }
      e = next.get(key(e.b))
    }
    if (!closed || r.length < 3) return null
    rings.push(r)
  }
  const out: Poly[] = rings.filter((r) => signedArea(r) > 0).map((r) => [dropCollinear(r)])
  for (const h of rings.filter((r) => signedArea(r) < 0).map(dropCollinear)) {
    const owners = out.filter((p) => ringState(h[0], p[0]) > 0).sort((a, b) => Math.abs(signedArea(a[0])) - Math.abs(signedArea(b[0])))
    if (!owners.length) return null
    owners[0].push(h)
  }
  return out.length ? out : null
}

export const polyArea = (p: Poly) => Math.abs(signedArea(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(signedArea(h)), 0)

/** Drops vertices that lie exactly on the line through their neighbours (exact arithmetic; nothing moves). */
export function dropCollinear(ring: Pt[]): Pt[] {
  let r = ring.slice(), changed = true
  while (changed && r.length > 3) {
    changed = false
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length]
      if (exactCollinear(a, c, b) && b[0] >= Math.min(a[0], c[0]) && b[0] <= Math.max(a[0], c[0]) && b[1] >= Math.min(a[1], c[1]) && b[1] <= Math.max(a[1], c[1])) { r = r.filter((_, k) => k !== i); changed = true; break }
    }
  }
  return r
}

// ---------------------------------------------------------------- overlap area (exact, for parcel matching)
/** Sutherland–Hodgman: a subject ring (any shape) clipped by a convex counter-clockwise ring. Area is exact. */
function clipByConvex(subject: Pt[], convex: Pt[]): Pt[] {
  let out = subject
  for (let i = 0; i < convex.length && out.length; i++) {
    const a = convex[i], b = convex[(i + 1) % convex.length], input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const s = input[j], e = input[(j + 1) % input.length], ds = cross(a, b, s), de = cross(a, b, e)
      if (ds >= 0) out.push(s)
      if ((ds >= 0) !== (de >= 0)) { const t = ds / (ds - de); out.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]) }
    }
  }
  return out
}
/** Ear-clipping triangulation of a simple counter-clockwise ring. */
export function earTriangles(ring: Pt[]): [Pt, Pt, Pt][] {
  const p = normalizeRing(ring), out: [Pt, Pt, Pt][] = []
  const inside = (q: Pt, a: Pt, b: Pt, c: Pt) => cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0
  let guard = 0
  while (p.length > 3 && guard++ < 10000) {
    let cut = false
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]
      if (cross(a, b, c) <= 0) continue
      if (p.some((q) => q !== a && q !== b && q !== c && inside(q, a, b, c))) continue
      out.push([a, b, c]); p.splice(i, 1); cut = true; break
    }
    if (!cut) p.splice(0, 1) // collinear remainder: drop a vertex rather than loop
  }
  if (p.length === 3 && cross(p[0], p[1], p[2]) > 0) out.push([p[0], p[1], p[2]])
  return out
}
/** Area of `poly` (outer minus holes) inside a simple site ring, exactly (site triangulated, parcel clipped by each piece). */
export function overlapArea(site: Pt[], poly: Poly): number {
  let a = 0
  for (const t of earTriangles(site)) {
    a += Math.abs(signedArea(clipByConvex(poly[0], t)))
    for (const h of poly.slice(1)) a -= Math.abs(signedArea(clipByConvex(h, t)))
  }
  return Math.max(0, a)
}

// ---------------------------------------------------------------- parcels under the site
/** Team presets (not from a source): what counts as a parcel inside the site, partly in it, or only touching it. */
export const PARCEL_INSIDE_SHARE = 0.95
export const PARCEL_PARTIAL_SHARE = 0.05
export const PARCEL_MIN_M2 = 1

export interface ParcelLike { outer: Pt[]; holes: Pt[][] }
export interface ParcelHit { index: number; area: number; overlap: number; share: number; kind: 'inside' | 'partial' | 'touching' }
export type ParcelJoin =
  | { status: 'none'; reason: string }
  | { status: 'joined'; polys: Poly[]; area: number; reason: string }
  | { status: 'review'; reason: string }

export interface ParcelMatch { hits: ParcelHit[]; included: number[]; join: ParcelJoin }

/**
 * The parcels a site covers. A parcel is "inside" when at least 95% of it lies in the site, "partial" from 5%, and
 * "touching" below that (drawing slack along a lot line); thresholds are team presets. The included parcels (inside,
 * plus any partial ones the user adds) are joined with the exact union only; when that fails they stay separate and
 * the site area is not taken from them.
 */
export function matchParcels(site: Pt[], parcels: readonly ParcelLike[], extra: number[] = [], skip: number[] = []): ParcelMatch {
  const ring = normalizeRing(site)
  const [x0, y0, x1, y1] = ringMetrics(ring).bounds
  const hits: ParcelHit[] = []
  parcels.forEach((p, index) => {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    for (const [x, y] of p.outer) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y) }
    if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) return
    const poly: Poly = [p.outer, ...p.holes]
    const area = polyArea(poly)
    const overlap = overlapArea(ring, poly)
    if (overlap < PARCEL_MIN_M2 || area <= 0) return
    const share = overlap / area
    hits.push({ index, area, overlap, share, kind: share >= PARCEL_INSIDE_SHARE ? 'inside' : share >= PARCEL_PARTIAL_SHARE ? 'partial' : 'touching' })
  })
  hits.sort((a, b) => b.overlap - a.overlap)
  const included = hits.filter((h) => (h.kind === 'inside' || extra.includes(h.index)) && !skip.includes(h.index)).map((h) => h.index)
  if (!included.length) return { hits, included, join: { status: 'none', reason: hits.length ? 'No parcel lies wholly in the site; add the partial ones you mean, or draw the site on the lot lines.' : 'No City parcel under this site (outside the parcel layer, or on a street).' } }
  // Records with exactly the same outline are one lot (strata or air-space parcels): counted once. Exact equality only.
  const seen = new Map<string, number>()
  for (const i of included) { const k = outlineKey([parcels[i].outer, ...parcels[i].holes]); if (!seen.has(k)) seen.set(k, i) }
  const unique = [...seen.values()], dup = included.length - unique.length
  const dupNote = dup ? ` ${dup} more record${dup === 1 ? '' : 's'} repeat${dup === 1 ? 's' : ''} an identical lot outline (strata or air-space parcels), counted once.` : ''
  const merged = exactUnion(unique.map((i) => [parcels[i].outer, ...parcels[i].holes]))
  if (!merged) return { hits, included, join: { status: 'review', reason: `The parcels do not meet along exactly shared lot lines (a gap or an overlap), so they stay separate for review and the site area is not taken from them.${dupNote}` } }
  return { hits, included, join: { status: 'joined', polys: merged, area: merged.reduce((s, p) => s + polyArea(p), 0), reason: `${merged.length === 1 ? 'Joined along shared lot lines (exact; no snapping).' : `Joined into ${merged.length} separate pieces along shared lot lines (exact; no snapping).`}${dupNote}` } }
}

/** The same outline regardless of start vertex and winding (exact coordinates). */
export function outlineKey(poly: Poly): string {
  return poly.map((r) => {
    const ring = normalizeRing(r).map((p) => `${p[0]},${p[1]}`)
    let best = ''
    for (let s = 0; s < ring.length; s++) { const k = [...ring.slice(s), ...ring.slice(0, s)].join(';'); if (!best || k < best) best = k }
    return best
  }).join('|')
}

// ---------------------------------------------------------------- a site from existing buildings
/**
 * A site from one or more picked City footprints (Vista "replace existing buildings"): one footprint is its own
 * outline; several are joined with the exact union when they share walls exactly, else the site is their convex hull
 * (stated, so the user can redraw). Courtyards are filled: a site has no holes.
 */
export function siteFromFootprints(footprints: ParcelLike[]): { ring: Pt[]; method: 'single' | 'union' | 'hull'; note: string } | null {
  const outers = footprints.map((f) => normalizeRing(f.outer)).filter((r) => r.length >= 3 && signedArea(r) > 0)
  if (!outers.length) return null
  if (outers.length === 1) return { ring: outers[0], method: 'single', note: 'The building\'s City footprint.' }
  const u = exactUnion(outers.map((r) => [r]))
  if (u && u.length === 1) return { ring: u[0][0], method: 'union', note: `${outers.length} footprints joined along exactly shared walls.` }
  return { ring: convexHull(outers.flat()), method: 'hull', note: `${outers.length} footprints do not share walls exactly, so the site is their convex hull. Redraw it if the outline matters.` }
}

export function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const half = (pts: Pt[]) => pts.reduce<Pt[]>((h, q) => { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); return h }, [])
  const lower = half(p), upper = half([...p].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}
