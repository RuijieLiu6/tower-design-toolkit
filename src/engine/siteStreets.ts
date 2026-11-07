// The streets around a Real Vancouver study site (Ruijie, 7 Nov: "type the streets around the Real Vancouver study site:
// names from city_streets.json, widths measured to the facing parcels, a street type I pick per street"). Pure geometry
// in the local frame (EPSG:26910 minus the City origin, metres).
//
// Method (team): along every side of the site, rays go out square to the side every ~4 m. A ray that steps straight into
// another lot is on a shared lot line (no street). Otherwise the first City street or lane centreline it meets names the
// street, and the right-of-way is measured property line to property line along the ray: from the last parcel edge before
// the centreline (the site's own property line; zero when the site was drawn on it) to the first parcel edge past it (the
// facing lot). Where no facing lot is found (a park, the water, a plaza without a parcel) the width is twice the distance
// to the centreline, said as such: City centre lines approximate the dedicated right-of-way centre (city_streets.json
// notes), so that fallback is weaker. The street type is never guessed: the user picks it.
import type { Pt } from './site'

export interface StreetLineLike { id?: number; name: string; kind: 'street' | 'lane'; bridge?: boolean; points: Pt[] }
export interface ParcelLike { outer: Pt[] }

export interface StreetEdge {
  /** Ring index of the side (from ring[i] to ring[i + 1]). */
  i: number
  a: Pt
  b: Pt
  /** Unit normal pointing out of the site, into the street. */
  out: Pt
  length: number
}

export interface SiteStreet {
  /** Upper-case City name ("W PENDER ST"); settings are kept by it, so a re-drawn site keeps its street types. */
  key: string
  /** For display: "W Pender St". */
  name: string
  kind: 'street' | 'lane'
  /** The site's sides on this street, in ring order. */
  edges: StreetEdge[]
  /** Site frontage on this street (m). */
  frontage: number
  /** Right-of-way, property line to property line (m): the median of the rays. */
  row: number
  /** Least and greatest ray (m), after dropping the outer tenth at each end. */
  rowRange: [number, number]
  /** 'parcels': measured to the facing lots on most rays; 'centreline': twice the distance to the centreline. */
  basis: 'parcels' | 'centreline'
  /** Median distance from the site's property line to the City centreline (m). */
  toCentreline: number
  rays: number
  /** Length-weighted outward direction of its sides (unit). */
  out: Pt
}

export interface SiteStreetsResult {
  streets: SiteStreet[]
  /** Site sides on a shared lot line or facing no street within reach (m of frontage). */
  lotLine: number
  noStreet: number
}

/** How far out a street is looked for (m): wider than any downtown right-of-way. */
export const STREET_REACH = 45
const STEP = 4

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]

function inside(p: Pt, poly: Pt[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Distance along the ray p + s·d (|d| = 1) to segment a–b, or null. */
function rayHit(p: Pt, d: Pt, a: Pt, b: Pt): number | null {
  const e: Pt = sub(b, a)
  const den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-12) return null
  const w = sub(a, p)
  const s = (w[0] * e[1] - w[1] * e[0]) / den
  const t = (w[0] * d[1] - w[1] * d[0]) / den
  return t >= 0 && t <= 1 && s > 0 ? s : null
}

const median = (v: number[]) => { const s = [...v].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
function trimmedRange(v: number[]): [number, number] {
  const s = [...v].sort((x, y) => x - y), k = Math.floor(s.length * 0.1)
  return [s[k], s[s.length - 1 - k]]
}

/** "W PENDER ST" → "W Pender St"; "W 16TH AV" → "W 16th Av". */
export function streetName(raw: string): string {
  const t = raw.trim()
  if (!t) return 'Unnamed street'
  return t.toLowerCase().split(/\s+/).map((w) => (w.length === 1 ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ')
}

const signedArea = (r: Pt[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2

interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (pts: Pt[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { x0, y0, x1, y1 }
}
const overlaps = (a: Box, b: Box, r = 0) => a.x1 >= b.x0 - r && a.x0 <= b.x1 + r && a.y1 >= b.y0 - r && a.y0 <= b.y1 + r

/** The streets and lanes along the study site's sides, with their measured right-of-way. */
export function siteStreets(ring: Pt[], lines: readonly StreetLineLike[], parcels: readonly ParcelLike[]): SiteStreetsResult {
  const n = ring.length
  if (n < 3) return { streets: [], lotLine: 0, noStreet: 0 }
  const ccw = signedArea(ring) > 0
  const siteBox = boxOf(ring)
  // Only what can be reached matters.
  const segs: { a: Pt; b: Pt; line: StreetLineLike }[] = []
  for (const l of lines) {
    if (l.bridge || l.points.length < 2 || !overlaps(boxOf(l.points), siteBox, STREET_REACH)) continue
    for (let k = 1; k < l.points.length; k++) segs.push({ a: l.points[k - 1], b: l.points[k], line: l })
  }
  const near = parcels.filter((p) => p.outer.length >= 3 && overlaps(boxOf(p.outer), siteBox, STREET_REACH + 40)).map((p) => p.outer)
  const parcelEdges: { a: Pt; b: Pt }[] = []
  for (const r of near) for (let k = 0; k < r.length; k++) parcelEdges.push({ a: r[k], b: r[(k + 1) % r.length] })

  type Ray = { key: string; line: StreetLineLike; row: number | null; cl: number }
  const perEdge: { edge: StreetEdge; rays: Ray[]; lot: number; none: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < 0.5) continue
    const u: Pt = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    const out: Pt = ccw ? [u[1], -u[0]] : [-u[1], u[0]]
    const edge: StreetEdge = { i, a, b, out, length }
    const count = Math.max(2, Math.round(length / STEP))
    const rays: Ray[] = []
    let lot = 0, none = 0
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count
      const p: Pt = [a[0] + u[0] * length * t, a[1] + u[1] * length * t]
      // A lot just outside that is not the site's own (the one just inside): a shared lot line.
      const pin: Pt = [p[0] - out[0], p[1] - out[1]], pout: Pt = [p[0] + out[0], p[1] + out[1]]
      const own = near.filter((r) => inside(pin, r))
      if (near.some((r) => !own.includes(r) && inside(pout, r))) { lot++; continue }
      let best: { s: number; line: StreetLineLike } | null = null
      for (const sg of segs) {
        const s = rayHit(p, out, sg.a, sg.b)
        if (s !== null && s > 0.3 && s <= STREET_REACH && (!best || s < best.s)) best = { s, line: sg.line }
      }
      if (!best) { none++; continue }
      let sNear = 0, sFar: number | null = null
      for (const e of parcelEdges) {
        const s = rayHit(p, out, e.a, e.b)
        if (s === null || s <= 0.3) continue
        if (s < best.s) sNear = Math.max(sNear, s)
        else if (s - best.s <= STREET_REACH && (sFar === null || s < sFar)) sFar = s
      }
      rays.push({ key: best.line.name.trim().toUpperCase() || `~${best.line.kind}`, line: best.line, row: sFar === null ? null : sFar - sNear, cl: best.s - sNear })
    }
    perEdge.push({ edge, rays, lot, none })
  }

  // Each side goes to the street most of its rays met (a side mostly on a lot line is a lot line).
  const groups = new Map<string, { line: StreetLineLike; edges: StreetEdge[]; rays: Ray[] }>()
  let lotLine = 0, noStreet = 0
  for (const { edge, rays, lot, none } of perEdge) {
    const votes = new Map<string, number>()
    for (const r of rays) votes.set(r.key, (votes.get(r.key) ?? 0) + 1)
    const [key, v] = [...votes.entries()].sort((x, y) => y[1] - x[1])[0] ?? [null, 0]
    if (!key || v < Math.max(lot, none)) { if (lot >= none) lotLine += edge.length; else noStreet += edge.length; continue }
    const mine = rays.filter((r) => r.key === key)
    const g = groups.get(key) ?? { line: mine[0].line, edges: [], rays: [] }
    g.edges.push(edge); g.rays.push(...mine)
    groups.set(key, g)
  }

  const streets: SiteStreet[] = [...groups.entries()].map(([key, g]) => {
    const measured = g.rays.filter((r) => r.row !== null).map((r) => r.row as number)
    const basis: SiteStreet['basis'] = measured.length * 2 >= g.rays.length ? 'parcels' : 'centreline'
    const widths = basis === 'parcels' ? measured : g.rays.map((r) => 2 * r.cl)
    const frontage = g.edges.reduce((s, e) => s + e.length, 0)
    const ox = g.edges.reduce((s, e) => s + e.out[0] * e.length, 0), oy = g.edges.reduce((s, e) => s + e.out[1] * e.length, 0), ol = Math.hypot(ox, oy) || 1
    return {
      key, name: key.startsWith('~') ? (g.line.kind === 'lane' ? 'Lane' : 'Unnamed street') : streetName(g.line.name), kind: g.line.kind,
      edges: g.edges.sort((x, y) => x.i - y.i), frontage, row: median(widths), rowRange: trimmedRange(widths), basis,
      toCentreline: median(g.rays.map((r) => r.cl)), rays: g.rays.length, out: [ox / ol, oy / ol] as Pt,
    }
  })
  streets.sort((x, y) => (x.kind === y.kind ? y.frontage - x.frontage : x.kind === 'street' ? -1 : 1))
  return { streets, lotLine, noStreet }
}

/** A polygon against one street: least setback from its property line and the frontage it covers within `near` m. */
export function againstStreet(poly: Pt[], edges: readonly StreetEdge[], near = 1): { setback: number; covered: number; span: number } {
  let setback = Infinity, covered = 0, span = 0
  for (const e of edges) {
    const u: Pt = [(e.b[0] - e.a[0]) / e.length, (e.b[1] - e.a[1]) / e.length]
    const ts = poly.map((p) => dot(sub(p, e.a), u))
    const from = Math.max(0, Math.min(...ts)), to = Math.min(e.length, Math.max(...ts))
    if (to <= from) continue
    const sb = Math.min(...poly.map((p) => -dot(sub(p, e.a), e.out)))
    setback = Math.min(setback, sb)
    span += to - from
    if (sb <= near) covered += to - from
  }
  return { setback, covered, span }
}

/** A tower's extent along a street (m): the longest projection of its outline on the street's sides. */
export function extentAlong(poly: Pt[], edges: readonly StreetEdge[]): number {
  let best = 0
  for (const e of edges) {
    const u: Pt = [(e.b[0] - e.a[0]) / e.length, (e.b[1] - e.a[1]) / e.length]
    const ts = poly.map((p) => dot(p, u))
    best = Math.max(best, Math.max(...ts) - Math.min(...ts))
  }
  return best
}

/** The part of a side a polygon spans (m along the side from `a`), or null. */
export function spanOn(poly: Pt[], e: StreetEdge): [number, number] | null {
  const u: Pt = [(e.b[0] - e.a[0]) / e.length, (e.b[1] - e.a[1]) / e.length]
  const ts = poly.map((p) => dot(sub(p, e.a), u))
  const from = Math.max(0, Math.min(...ts)), to = Math.min(e.length, Math.max(...ts))
  return to > from ? [from, to] : null
}

/** Distance from a point to the nearest of a street's sides (m). */
export function distanceToStreet(p: Pt, edges: readonly StreetEdge[]): number {
  let d = Infinity
  for (const e of edges) {
    const v = sub(e.b, e.a), l2 = dot(v, v)
    const k = l2 ? Math.max(0, Math.min(1, dot(sub(p, e.a), v) / l2)) : 0
    d = Math.min(d, Math.hypot(p[0] - e.a[0] - k * v[0], p[1] - e.a[1] - k * v[1]))
  }
  return d
}

// ---------- what the user sets per street and for the site (saved in the study site) ----------
export type CityStreetType = 'retail' | 'arterial' | 'local'
/** A street's type (picked by the user; null = not yet) and its frontage inputs (absent = the starting values). */
export interface StreetSetting {
  type: CityStreetType | null
  active?: number
  entrances?: number
  canopy?: number
  crossings?: number
}
/** A mid-block link across the study site, in the site's own frame (its longest side runs along x). */
export interface CityLinkInput {
  enabled: boolean
  /** false: across the site (square to its longest side); true: along it. */
  along: boolean
  /** From the site's centre (m), along the long side when across, across it when along. */
  offset: number
  width: number
  openToSky: boolean
  srw: boolean
}
export const DEFAULT_CITY_LINK: CityLinkInput = { enabled: false, along: false, offset: 0, width: 9.1, openToSky: true, srw: true }
