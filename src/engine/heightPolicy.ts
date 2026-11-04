// Zoning height references at any point or footprint, after Vista v37 explorer/height-policy.js (Ruijie Liu,
// github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e). Data: Vista's generated/height_policy.json, copied
// unchanged to public/data/vista/ (1,621 City zoning polygons, 964 rules; City of Vancouver zoning districts and
// property parcels, OGL-Vancouver, retrieved 2026-10-27). Each rule is a basic district-schedule height that Vista
// transcribed with its by-law URL and section; Tower Design Toolkit has not opened those by-laws, so every number is
// UNVERIFIED here. DD, CD-1 and untranscribed districts have no number: they read "no zoning number" (unresolved),
// never a guessed height (Vista's 213.36 m scenario fallback is not ported).
//
// A footprint gets a number only when every zone it overlaps has a sourced basic height AND the zones cover the whole
// footprint; the number is the lowest of them. Polygons follow Vista's parcel rule (an overlap or a gap counts above
// max(0.25 m², 0.01% of the footprint)); points and segments follow Vista's exact rule (touching counts; slab sweep).
// Geometry: Vista's model frame is converted vertex by vertex to EPSG:26910 through latitude/longitude (vistaToCity),
// then to the Real Vancouver local frame (minus the origin). Everything below runs in that local frame.
import { overlapArea } from './site'
import { vistaToCity, type Pt } from './vista'
import type { Flag } from './types'

export interface PolicyRule {
  basicHeightM: number | null
  sourceUrl: string
  section: string | null
  status: string
  note: string
  conditions: string[] | string
  verifiedAt?: string
}
export interface PolicyZone {
  id: string
  /** District name as the City writes it, e.g. 'C-2A', 'DD', 'CD-1 (56B)'. */
  zone: string
  category: string
  ruleId: string
  /** Polygons, each outer ring then holes (local frame, open rings). */
  polygons: Pt[][][]
  bounds: [number, number, number, number] | null
  valid: boolean
}
export interface PolicyMeta {
  retrievedAt: string
  sources: { url: string; retrievedAt: string; sha256: string; license: string }[]
  limitations: string[]
  attribution: string
  licenceUrl: string
}
export type ZoningStatus = 'no_site' | 'ready' | 'partial' | 'unknown'
export interface ZoningResult {
  /** ready: one number for the whole footprint; partial: some zones have one, not all; unknown: none. */
  status: ZoningStatus
  /** Lowest basic height of the touched zones (m above the by-law's grade), only when ready. */
  heightM: number | null
  zones: PolicyZone[]
  ruleIds: string[]
  /** The rule whose height is the number (the lowest), when ready. */
  controlling: string | null
  sources: string[]
  notes: string[]
  complexityLimited: boolean
}

/** Vista's copy in this app (byte-identical; Vista's release-manifest.json gives the same SHA-256). */
export const POLICY_FILE = {
  path: 'data/vista/height_policy.json',
  bytes: 1636010,
  sha256: '85f7ddf730524f3df1b7f5a3fafbe24e8f3e938dc5b76aa735d410a4ebccd7fa',
  vista: 'Vista v37 (Ruijie Liu), github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e, generated/height_policy.json',
  url: 'https://github.com/RuijieLiu6/vancouver-tall-view-tool',
} as const

const MAX_COVERAGE_WORK = 3_000_000
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isXY = (p: unknown): p is Pt => Array.isArray(p) && finite(p[0]) && finite(p[1])
const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const area = (p: Pt[]) => p.slice(1, -1).reduce((s, q, i) => s + cross(p[0], q, p[i + 2]), 0) / 2
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]
type Box = [number, number, number, number]

function ring(raw: unknown): Pt[] | null {
  if (!Array.isArray(raw) || !raw.length || !raw.every(isXY)) return null
  const p = (raw as Pt[]).map((q) => [q[0], q[1]] as Pt).filter((q, i, a) => !i || !same(q, a[i - 1]))
  if (p.length > 1 && same(p[0], p[p.length - 1])) p.pop()
  return p
}
function box(points: Pt[]): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of points) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]) }
  return b
}
const boxesMeet = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
function onSegment(a: Pt, b: Pt, p: Pt) {
  const error = Number.EPSILON * 16 * (Math.abs((b[0] - a[0]) * (p[1] - a[1])) + Math.abs((b[1] - a[1]) * (p[0] - a[0])) + 1)
  return Math.abs(cross(a, b, p)) <= error && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
}
/** 0 outside, 1 interior, 2 boundary; hole boundaries are conservative contacts. */
function inRing(p: Pt, r: Pt[]): 0 | 1 | 2 {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i]
    if (onSegment(a, b, p)) return 2
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1])) inside = !inside
  }
  return inside ? 1 : 0
}
function inPolygon(p: Pt, rings: Pt[][]): boolean {
  const outer = inRing(p, rings[0])
  if (!outer) return false
  if (outer === 2) return true
  for (const h of rings.slice(1)) { const s = inRing(p, h); if (s === 2) return true; if (s === 1) return false }
  return true
}
const edges = (p: Pt[]): [Pt, Pt][] => (p.length === 1 ? [[p[0], p[0]]] : p.map((q, i) => [q, p[(i + 1) % p.length]] as [Pt, Pt]))
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1]
  const den = dx * ey - dy * ex
  if (!den) return null
  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den
  const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * dx, a[1] + t * dy] : null
}
const segmentsMeet = (a: Pt, b: Pt, c: Pt, d: Pt) => !!crossing(a, b, c, d) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
function intersectsFootprint(f: Pt[], polygon: Pt[][]): boolean {
  if (f.length === 1) return inPolygon(f[0], polygon)
  if (f.some((p) => inPolygon(p, polygon))) return true
  if (f.length >= 3 && polygon[0].some((p) => inRing(p, f))) return true
  const fe = edges(f)
  return polygon.some((r) => edges(r).some(([c, d]) => fe.some(([a, b]) => segmentsMeet(a, b, c, d))))
}
/** A footprint ring, a segment (vertical mesh part seen in plan) or a point; null when self-intersecting. */
export function normalizeFootprint(raw: unknown): Pt[] | null {
  const p = ring(raw)
  if (!p || !p.length || !finite(area(p))) return null
  if (p.length < 3 || area(p) === 0) {
    let a = p[0], b = a, distance = 0
    for (const q of p) for (const r of p) { const d = Math.hypot(q[0] - r[0], q[1] - r[1]); if (d > distance) { distance = d; a = q; b = r } }
    if (p.some((q) => !onSegment(a, b, q))) return null
    return distance ? [a, b] : [a]
  }
  const es = edges(p)
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    if (j === i + 1 || (i === 0 && j === es.length - 1)) continue
    if (segmentsMeet(es[i][0], es[i][1], es[j][0], es[j][1])) return null
  }
  return area(p) < 0 ? p.reverse() : p
}
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const v of intervals.sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && v[0] <= last[1]) last[1] = Math.max(last[1], v[1]); else out.push([v[0], v[1]])
  }
  return out
}
function vertical(r: Pt[], x: number): [number, number][] {
  const y: number[] = []
  for (const [a, b] of edges(r)) if ((a[0] > x) !== (b[0] > x)) y.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]))
  y.sort((a, b) => a - b)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < y.length; i += 2) out.push([y[i], y[i + 1]])
  return out
}
function polygonIntervals(polygon: Pt[][], x: number): [number, number][] {
  let out = vertical(polygon[0], x)
  for (const h of polygon.slice(1)) for (const [lo, hi] of vertical(h, x)) {
    out = out.flatMap(([a, b]) => (hi <= a || lo >= b ? [[a, b] as [number, number]] : ([[a, Math.min(b, lo)], [Math.max(a, hi), b]] as [number, number][]).filter(([c, d]) => d > c)))
  }
  return out
}
function coveredLine(f: Pt[], polygons: Pt[][][]): boolean {
  const a = f[0], b = f[f.length - 1], ts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1]
  const tAt = (p: Pt) => (Math.abs(dx) >= Math.abs(dy) ? (p[0] - a[0]) / dx : (p[1] - a[1]) / dy)
  for (const poly of polygons) for (const r of poly) for (const [c, d] of edges(r)) {
    const p = crossing(a, b, c, d); if (p) ts.push(tAt(p))
    if (onSegment(a, b, c)) ts.push(tAt(c)); if (onSegment(a, b, d)) ts.push(tAt(d))
  }
  const at = (t: number): Pt => [a[0] + t * dx, a[1] + t * dy]
  ts.sort((x, y) => x - y)
  return ts.every((t) => polygons.some((p) => inPolygon(at(t), p))) && ts.slice(1).every((t, i) => polygons.some((p) => inPolygon(at((ts[i] + t) / 2), p)))
}
/** Is the footprint inside the union of the polygons? true / false, or null when the work budget would be exceeded. */
function fullyCovered(f: Pt[], polygons: Pt[][][], budget: { remaining: number }): boolean | null {
  if (!polygons.length) return false
  if (f.length === 1) return polygons.some((p) => inPolygon(f[0], p))
  const bounds = box(f), all = [f].concat(polygons.flat())
  const totalVertices = all.reduce((sum, r) => sum + r.length, 0)
  const es = all.flatMap(edges).filter((e) => boxesMeet(box(e), bounds))
  const xs = [bounds[0], bounds[2]]
  for (const r of all) for (const p of r) if (p[0] > bounds[0] && p[0] < bounds[2]) xs.push(p[0])
  const localPairs = es.length ** 2
  const holeCount = polygons.reduce((sum, polygon) => sum + Math.max(0, polygon.length - 1), 0)
  const estimatedWork = totalVertices + localPairs + (2 + holeCount) * (xs.length + localPairs) * totalVertices
  if (!Number.isSafeInteger(estimatedWork) || estimatedWork > budget.remaining) return null
  budget.remaining -= estimatedWork
  if (f.length === 2) return coveredLine(f, polygons)
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    if (!boxesMeet(box(es[i]), box(es[j]))) continue
    const p = crossing(es[i][0], es[i][1], es[j][0], es[j][1])
    if (p && p[0] > bounds[0] && p[0] < bounds[2]) xs.push(p[0])
  }
  const cuts = [...new Set(xs)].sort((a, b) => a - b)
  // Every edge-order change is a cut, so a midpoint in each open slab proves coverage of the whole slab.
  for (let i = 1; i < cuts.length; i++) {
    const x = cuts[i - 1] + (cuts[i] - cuts[i - 1]) / 2
    if (x === cuts[i - 1] || x === cuts[i]) continue
    const covered = mergeIntervals(polygons.flatMap((p) => polygonIntervals(p, x)))
    for (const [lo, hi] of vertical(f, x)) if (!covered.some(([a, b]) => a <= lo && b >= hi)) return false
  }
  return true
}

export interface HeightPolicy {
  meta: PolicyMeta
  rules: Record<string, PolicyRule>
  zones: PolicyZone[]
  /** Zoning reference for footprints (local frame). An invalid footprint never falls back to a point. */
  zoning: (footprints: (Pt[] | null)[]) => ZoningResult
  /** Zoning reference at one point (local frame). */
  atPoint: (p: Pt) => ZoningResult
  /** The zone under a point, cheaply (for map grids): the first zone whose polygon contains it. */
  zoneAt: (p: Pt) => PolicyZone | null
}

/** Build the policy from Vista's JSON, converting every vertex from Vista's frame to the local frame. */
export function loadPolicy(raw: unknown, origin: Pt): HeightPolicy {
  const data = (raw ?? {}) as { metadata?: PolicyMeta; rules?: Record<string, PolicyRule>; zones?: { id: string; zone: string; category: string; ruleId: string; polygons: unknown; bbox?: unknown }[] }
  if (!data.metadata || !data.rules || !Array.isArray(data.zones)) throw new Error('Not a Vista height_policy.json (metadata, rules and zones expected).')
  const rules = data.rules, cell = 250
  const conv = (p: Pt): Pt => { const [e, n] = vistaToCity(p); return [e - origin[0], n - origin[1]] }
  const zones: PolicyZone[] = data.zones.map((source) => {
    const polygons = (Array.isArray(source.polygons) ? source.polygons : []).map((poly: unknown) => (Array.isArray(poly) ? poly.map((r: unknown) => { const q = ring(r); return q ? q.map(conv) : null }) : []))
    const valid = polygons.length > 0 && polygons.every((poly) => poly.length > 0 && poly.every((r) => !!r && r.length >= 3 && finite(area(r)) && area(r) !== 0))
    const points = (polygons.flat().filter(Boolean) as Pt[][]).flat()
    return { id: source.id, zone: source.zone, category: source.category, ruleId: source.ruleId, polygons: valid ? (polygons as Pt[][][]) : [], bounds: points.length ? box(points) : null, valid }
  })
  const grid = new Map<string, number[]>(), large: number[] = []
  zones.forEach((z, index) => {
    if (!z.bounds) { large.push(index); return }
    const b = z.bounds.map((v) => Math.floor(v / cell))
    if (!b.every(Number.isSafeInteger) || (b[2] - b[0] + 1) * (b[3] - b[1] + 1) > 4096) { large.push(index); return }
    for (let x = b[0]; x <= b[2]; x++) for (let y = b[1]; y <= b[3]; y++) { const k = x + ',' + y; const l = grid.get(k); if (l) l.push(index); else grid.set(k, [index]) }
  })
  function candidates(bounds: Box): PolicyZone[] {
    const b = bounds.map((v) => Math.floor(v / cell)), ids = new Set(large)
    if (!b.every(Number.isSafeInteger) || (b[2] - b[0] + 1) * (b[3] - b[1] + 1) > 10000) return zones.filter((z) => !z.bounds || boxesMeet(z.bounds, bounds))
    for (let x = b[0]; x <= b[2]; x++) for (let y = b[1]; y <= b[3]; y++) for (const i of grid.get(x + ',' + y) ?? []) ids.add(i)
    return [...ids].map((i) => zones[i]).filter((z) => !z.bounds || boxesMeet(z.bounds, bounds))
  }
  function zoning(footprints: (Pt[] | null)[]): ZoningResult {
    const out: ZoningResult = { status: 'no_site', heightM: null, zones: [], ruleIds: [], controlling: null, sources: [], notes: [], complexityLimited: false }
    if (!footprints.length || footprints.some((f) => !f)) { if (footprints.length) out.notes.push('Invalid footprint geometry; a point cannot replace the full footprint.'); return out }
    const fs = footprints as Pt[][]
    const touched = new Set<PolicyZone>(), cover: Pt[][][] = [], notes = new Set<string>()
    const known: { h: number; rule: string }[] = []
    let unknown = false, areaCovered = true
    for (const f of fs) {
      if (f.length < 3) { for (const z of candidates(box(f))) if (!z.valid || z.polygons.some((p) => intersectsFootprint(f, p))) touched.add(z); continue }
      // Polygons use Vista's parcel rule (height_policy.json metadata.intersectionTolerance): a zone counts when it
      // overlaps by more than max(0.25 m², 0.01% of the footprint), and so does an uncovered remainder. Zone lines run
      // along lot lines, so a lot that only shares an edge with the next district is not judged by that district.
      const fa = Math.abs(area(f)), tol = Math.max(0.25, 1e-4 * fa)
      let got = 0
      for (const z of candidates(box(f))) {
        if (!z.valid) { touched.add(z); continue }
        const ov = z.polygons.reduce((s, poly) => s + overlapArea(f, poly), 0)
        if (ov > tol) { touched.add(z); got += ov }
      }
      if (fa - got > tol) areaCovered = false
    }
    for (const z of touched) {
      const rule = rules[z.ruleId], h = rule?.basicHeightM
      const sourced = !!rule && typeof rule.sourceUrl === 'string' && /^https?:\/\//.test(rule.sourceUrl)
      if (z.valid) cover.push(...z.polygons)
      if (z.valid && finite(h) && h >= 0 && sourced) known.push({ h, rule: z.ruleId }); else unknown = true
      if (!z.valid) notes.add('Invalid zoning geometry prevents complete coverage assessment.')
      if (rule?.note) notes.add(String(rule.note))
      if (rule?.conditions && (typeof rule.conditions === 'string' ? rule.conditions : rule.conditions.length)) notes.add(typeof rule.conditions === 'string' ? rule.conditions : rule.conditions.join(' '))
    }
    const coverage = cover.map((polygon) => ({ polygon, bounds: box(polygon.flat()) }))
    const budget = { remaining: MAX_COVERAGE_WORK }
    let limited = false
    const covered = areaCovered && fs.every((f) => {
      if (f.length >= 3) return true // judged by area above
      const b = box(f), nearby = coverage.filter((r) => boxesMeet(r.bounds, b)).map((r) => r.polygon)
      const proved = fullyCovered(f, nearby, budget)
      if (proved === null) limited = true
      return proved === true
    })
    if (!covered) { unknown = true; if (!limited) notes.add('Part of the footprint has no mapped zoning coverage.') }
    if (limited) notes.add('Whole-footprint zoning coverage exceeds the bounded geometry budget; no zoning height is inferred.')
    out.zones = [...touched]
    out.ruleIds = [...new Set(out.zones.map((z) => z.ruleId).filter(Boolean))]
    out.sources = [...new Set(out.ruleIds.map((id) => rules[id]?.sourceUrl).filter((u): u is string => !!u))]
    out.status = !unknown && known.length ? 'ready' : known.length ? 'partial' : 'unknown'
    if (out.status === 'ready') { const low = known.reduce((m, k) => (k.h < m.h ? k : m)); out.heightM = low.h; out.controlling = low.rule }
    out.complexityLimited = limited
    if (known.length) notes.add('Basic zoning height reference only; applicable use, grade, conditions, exceptions and other controls require review.')
    if (unknown && touched.size) notes.add('Every intersecting zone needs an explicit sourced basic height reference.')
    out.notes = [...notes]
    return out
  }
  const atPoint = (p: Pt) => zoning(isXY(p) ? [[[p[0], p[1]]]] : [])
  function zoneAt(p: Pt): PolicyZone | null {
    for (const z of candidates([p[0], p[1], p[0], p[1]])) if (z.valid && z.polygons.some((poly) => inPolygon(p, poly))) return z
    return null
  }
  return { meta: data.metadata, rules, zones, zoning, atPoint, zoneAt }
}

// ---------------------------------------------------------------- reading a rule
export type RuleKind = 'number' | 'site_specific' | 'not_transcribed' | 'surface_required' | 'unmapped'
export interface RuleReading { kind: RuleKind; heightM: number | null; flag: Flag; label: string; detail: string }

/** How the app shows one district's rule: a number (unverified: Vista's citation, not opened here) or why there is none. */
export function readRule(policy: Pick<HeightPolicy, 'rules'>, ruleId: string | null, zone?: string): RuleReading {
  const rule = ruleId ? policy.rules[ruleId] : undefined
  const name = zone ?? ruleId?.replace(/^unresolved:/, '') ?? 'this location'
  if (!rule) return { kind: 'unmapped', heightM: null, flag: 'unresolved', label: 'no zoning number', detail: `No mapped zoning district at ${name} in the City snapshot (2026-10-27).` }
  if (finite(rule.basicHeightM)) {
    return { kind: 'number', heightM: rule.basicHeightM, flag: 'unverified', label: `${rule.basicHeightM} m basic height (${name})`,
      detail: `${rule.note} By-law ${rule.section ?? 'section not given'}, transcribed by Vista${rule.verifiedAt ? ` on ${rule.verifiedAt}` : ''}; not opened by the team (unverified). Status: ${rule.status}.` }
  }
  if (rule.status === 'site-specific') return { kind: 'site_specific', heightM: null, flag: 'unresolved', label: `no zoning number (${name}, site-specific)`, detail: `${rule.note} The CD-1 by-law for this site sets its height.` }
  if (rule.status === 'reference-surface-required') return { kind: 'surface_required', heightM: null, flag: 'unresolved', label: `no zoning number (${name}, measured from a reference surface)`, detail: rule.note }
  return { kind: 'not_transcribed', heightM: null, flag: 'unresolved', label: `no zoning number (${name})`, detail: `${rule.note || 'Schedule not transcribed.'} No height is guessed.` }
}
