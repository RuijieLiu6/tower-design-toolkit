// Direct sun on the tower and the sunlight its neighbours lose, on a clear day (Sun & Wind Studio study.js runSunStudy
// → r.heat {sunH, intensity, by, area} and r.lostKWh / r.towerKWh), by rays instead of the Studio's GPU renders.
// Clear-sky beam: the Studio's dni(alt) = 1353 · 0.7^(AM^0.678). Each face is sampled on a ~4 m grid (roofs on a ~6 m
// grid); a sample counts the sun when the sun is in front of it, over 2° high, and no block stands in the way.
// Neighbours: the walls and roofs of the buildings within 250 m of the towers; a sample loses the sun at a step when
// the towers block it and the buildings around do not. All geometry in the north frame (x east, y true north).
import { blocked, boxed, type Boxed } from './detail'
import { sunAt } from './climate'
import type { ClimatePayload, Prism } from './types'
import type { Pt } from '../shadow'

export type SunFace = 'N' | 'E' | 'S' | 'W' | 'roof'
export const SUN_FACES: SunFace[] = ['N', 'E', 'S', 'W', 'roof']
export interface SunImpact {
  /** Mean clear-day hours of direct sun per face. */
  sunH: Record<SunFace, number>
  /** Beam kWh per m² of face, clear day. */
  intensity: Record<SunFace, number>
  /** Beam kWh on the face in total, clear day. */
  by: Record<SunFace, number>
  area: Record<SunFace, number>
  towerKWh: number
  lostKWh: number
}

const dni = (alt: number) => (alt <= 0.02 ? 0 : 1353 * Math.pow(0.7, Math.pow(1 / Math.sin(alt), 0.678)))
const zero = (): Record<SunFace, number> => ({ N: 0, E: 0, S: 0, W: 0, roof: 0 })
const ccw = (r: Pt[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return a > 0 }
const inside = (x: number, y: number, r: Pt[]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o } return o }
const faceOf = (nx: number, ny: number): SunFace => { const az = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360; return (['N', 'E', 'S', 'W'] as const)[Math.round(az / 90) % 4] }

interface Sample { x: number; y: number; z: number; nx: number; ny: number; roof: boolean; a: number; face: SunFace }

/** Wall and roof samples of blocks; parts covered by another block of `cover` (a stacked or touching block) are left out. */
function samples(ps: Prism[], cover: Prism[], step: number, roofStep: number, cap = Infinity): Sample[] {
  const out: Sample[] = []
  for (const p of ps) {
    const ring = p.ring as Pt[], dir = ccw(ring) ? 1 : -1, h = p.z1 - p.z0
    if (h <= 0.5 || ring.length < 3) continue
    const nz = Math.max(1, Math.round(h / step)), dz = h / nz
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length], L = Math.hypot(bx - ax, by - ay)
      if (L < 0.5) continue
      const nx = (dir * (by - ay)) / L, ny = (-dir * (bx - ax)) / L, nl = Math.max(1, Math.round(L / step)), dl = L / nl, f = faceOf(nx, ny)
      for (let u = 0; u < nl; u++) for (let k = 0; k < nz; k++) {
        const t = (u + 0.5) / nl, x = ax + (bx - ax) * t + nx * 0.3, y = ay + (by - ay) * t + ny * 0.3, z = p.z0 + (k + 0.5) * dz
        if (cover.some((q) => q !== p && z > q.z0 && z < q.z1 && inside(x, y, q.ring as Pt[]))) continue
        out.push({ x, y, z, nx, ny, roof: false, a: dl * dz, face: f })
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    for (let x = x0 + roofStep / 2; x < x1; x += roofStep) for (let y = y0 + roofStep / 2; y < y1; y += roofStep) {
      if (!inside(x, y, ring)) continue
      const z = p.z1 + 0.1
      if (cover.some((q) => q !== p && q.z0 <= p.z1 + 0.5 && q.z1 > p.z1 && inside(x, y, q.ring as Pt[]))) continue
      out.push({ x, y, z, nx: 0, ny: 0, roof: true, a: roofStep * roofStep, face: 'roof' })
    }
  }
  if (out.length > cap) { const k = Math.ceil(out.length / cap); return out.filter((_, i) => i % k === 0).map((s) => ({ ...s, a: s.a * k })) }
  return out
}

export function sunImpact(towers: Prism[], context: Prism[], C: ClimatePayload, doy: number): SunImpact {
  const lat = (C.lat * Math.PI) / 180, dt = 0.25
  const sun: { dx: number; dy: number; tan: number; cosA: number; sinA: number; E: number }[] = []
  for (let h = dt / 2; h < 24; h += dt) {
    const p = sunAt(lat, C.lon, doy, h, -8)
    if (p.alt > 0.035) sun.push({ dx: Math.sin(p.az), dy: Math.cos(p.az), tan: Math.tan(p.alt), cosA: Math.cos(p.alt), sinA: Math.sin(p.alt), E: dni(p.alt) })
  }
  let cx = 0, cy = 0, n = 0, R = 0
  for (const t of towers) for (const [x, y] of t.ring as Pt[]) { cx += x; cy += y; n++ }
  cx /= n || 1; cy /= n || 1
  for (const t of towers) for (const [x, y] of t.ring as Pt[]) R = Math.max(R, Math.hypot(x - cx, y - cy))
  const near = context.filter((p) => (p.ring as Pt[]).some(([x, y]) => Math.hypot(x - cx, y - cy) < R + 400))
  const obsAll: Boxed[] = boxed([...near, ...towers]), obsCtx: Boxed[] = boxed(near), obsTow: Boxed[] = boxed(towers)
  const facing = (s: Sample, q: (typeof sun)[number]) => (s.roof ? q.sinA : q.cosA * (s.nx * q.dx + s.ny * q.dy))

  // the towers' own faces
  const sunH = zero(), by = zero(), area = zero()
  for (const s of samples(towers, towers, 4, 6)) {
    area[s.face] += s.a
    for (const q of sun) {
      const c = facing(s, q)
      if (c <= 0.02 || blocked(s.x, s.y, s.z, q.dx, q.dy, q.tan, obsAll)) continue
      sunH[s.face] += dt * s.a; by[s.face] += (q.E * c * dt * s.a) / 1000
    }
  }
  const intensity = zero()
  for (const f of SUN_FACES) { if (area[f] > 0) { intensity[f] = by[f] / area[f]; sunH[f] /= area[f] } }
  const towerKWh = SUN_FACES.reduce((a, f) => a + by[f], 0)

  // the neighbours: what the towers take from them
  const close = near.filter((p) => (p.ring as Pt[]).some(([x, y]) => Math.hypot(x - cx, y - cy) < R + 250))
  let lostKWh = 0
  for (const s of samples(close, close, 5, 8, 40000)) {
    for (const q of sun) {
      const c = facing(s, q)
      if (c <= 0.02 || !blocked(s.x, s.y, s.z, q.dx, q.dy, q.tan, obsTow) || blocked(s.x, s.y, s.z, q.dx, q.dy, q.tan, obsCtx)) continue
      lostKWh += (q.E * c * dt * s.a) / 1000
    }
  }
  return { sunH, intensity, by, area, towerKWh, lostKWh }
}
