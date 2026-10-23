// View-cone height estimate (Context Model C01-M01/M03/M05 + C04-M04, simplified for v0.1).
// Lower boundary: Z = Lv + k * D, D measured along the wedge bisector (planar form).
// Every result is an ESTIMATE; the City View Cone Assessment governs.
import conesData from '../data/viewcones.json'
import type { Flag } from './types'

export interface Cone { id: string; name: string; subject: string; Lv: number; url: string; ring: [number, number][] }
export const CONES: Cone[] = (conesData as unknown as { cones: Cone[] }).cones
export const CONE_ATTRIBUTION: string = (conesData as { attribution: string }).attribution

export type Tier = 'T1a' | 'T1b' | 'endorsed'
export interface ConeParam { k: number; tier: Tier; flag: Flag; u95: number; source: string }

/** Planar slopes from research packet C01 (Council reports and City site sheets). */
export const CONE_PARAMS: Record<string, ConeParam> = {
  'A': { k: 0.05889, tier: 'T1a', flag: 'verified', u95: 0.5, source: 'Fitted to City site sheet (118-150 Robson / 828 Cambie, 3 Oct 2024), 4 points, residual 0.012 m' },
  '3.2.3': { k: 0.000404, tier: 'T1a', flag: 'verified', u95: 0.5, source: 'Fitted to City site sheet (same site), 5 points, residual 0.003 m' },
  '3.2.4': { k: 0.000404, tier: 'endorsed', flag: 'team_assumption', u95: 1.0, source: 'Council Appendix K (endorsed 16 Dec 2025): aligned with 3.2.3; value unconfirmed' },
  '28': { k: 0.05007, tier: 'T1b', flag: 'verified', u95: 1.0, source: 'Council report (adopted 4 Feb 2026): 65.7 m at 197.7 m' },
  'H': { k: 0.05354, tier: 'endorsed', flag: 'team_assumption', u95: 1.5, source: 'Council Appendix K (endorsed 16 Dec 2025): 58 m at the Sun Yat-Sen pavilion; value unconfirmed' },
  'J2': { k: 0.07572, tier: 'endorsed', flag: 'team_assumption', u95: 1.5, source: 'Council Appendix K (endorsed 16 Dec 2025): 43.5 m at the Sun Yat-Sen pavilion; value unconfirmed' },
  '27.1': { k: 0.04549, tier: 'T1b', flag: 'verified', u95: 1.0, source: 'Council report: 59.8 m from the NE corner of 1975 E 12th Ave' },
  '27.2': { k: 0.04115, tier: 'T1b', flag: 'verified', u95: 1.0, source: 'Council report: 54.3 m from the NE corner of 1975 E 12th Ave' },
}

export type ConeState = 'outside' | 'near_edge' | 'limit_unknown' | 'clear' | 'within_uncertainty' | 'above'

export const STATE_LABEL: Record<ConeState, string> = {
  outside: 'Outside',
  near_edge: 'Near edge',
  limit_unknown: 'In cone: no estimate',
  clear: 'Below estimated limit',
  within_uncertainty: 'Within uncertainty',
  above: 'Above estimated limit',
}

export function pointInRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

export function edgeDistance([x, y]: [number, number], ring: [number, number][]): number {
  let d = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1]
    const dx = x2 - x1, dy = y2 - y1
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    d = Math.min(d, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
  }
  return d
}

/** Unit vector of the wedge bisector, from the origin (first vertex). */
export function bisector(cone: Cone): [number, number] {
  const O = cone.ring[0]
  const angs = cone.ring.slice(1, -1).map(([x, y]) => Math.atan2(y - O[1], x - O[0]))
  const a = (Math.min(...angs) + Math.max(...angs)) / 2
  return [Math.cos(a), Math.sin(a)]
}

/** Estimated lower-boundary elevation (geodetic m) at a point, or null without a slope. */
export function limitAt(cone: Cone, p: [number, number]): number | null {
  const prm = CONE_PARAMS[cone.id]
  if (!prm) return null
  const O = cone.ring[0], u = bisector(cone)
  return cone.Lv + prm.k * ((p[0] - O[0]) * u[0] + (p[1] - O[1]) * u[1])
}

export interface ConeCheck { cone: Cone; state: ConeState; limit: number | null; exceed: number | null; param?: ConeParam }

/** Sample a footprint polygon: vertices, edges every 2 m and an interior grid every 5 m. */
export function samplePolygon(poly: [number, number][]): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
  const closed = [...poly, poly[0]]
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 5)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 5) if (pointInRing([x, y], closed)) pts.push([x, y])
  return pts
}

/** Check a tower footprint (EPSG:26910) whose top sits at topZ (geodetic m) against every cone. */
export function checkFootprint(footprint: [number, number][], topZ: number): ConeCheck[] {
  const samples = samplePolygon(footprint)
  return CONES.map((cone) => {
    const inside = samples.filter((p) => pointInRing(p, cone.ring))
    if (!inside.length) {
      const near = samples.some((p) => edgeDistance(p, cone.ring) < 1.5)
      return { cone, state: near ? 'near_edge' : 'outside', limit: null, exceed: null }
    }
    const param = CONE_PARAMS[cone.id]
    if (!param) return { cone, state: 'limit_unknown', limit: null, exceed: null }
    // Governing point: the lowest limit under the footprint.
    const limits = inside.map((p) => limitAt(cone, p) as number)
    const limit = Math.min(...limits)
    const exceed = topZ - limit
    const state: ConeState = exceed > param.u95 ? 'above' : exceed >= -param.u95 ? 'within_uncertainty' : 'clear'
    return { cone, state, limit, exceed, param }
  })
}

const RANK: Record<ConeState, number> = { above: 0, limit_unknown: 1, within_uncertainty: 2, near_edge: 3, clear: 4, outside: 5 }

/** Overall state: CLEAR only when every covering cone is estimated and clear. */
export function overall(checks: ConeCheck[]): ConeState {
  const covering = checks.filter((c) => c.state !== 'outside')
  if (!covering.length) return 'outside'
  return covering.map((c) => c.state).sort((a, b) => RANK[a] - RANK[b])[0]
}
