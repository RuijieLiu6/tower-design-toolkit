// Solar envelope (research P02; Solar Access Guidelines for the Downtown Peninsula, July 2026): over a site, the
// tallest column at each point that casts no shadow on a protected space through that space's test window. Columns are
// tested every 15 minutes (the Detailed study's step, 5.2.1). Conservative: shadow the existing city already casts is
// not subtracted, so the true "no new shadow" envelope can only be higher.
import { solarPosition, sunDirection, instants, type StudyWindow } from './solar'
import type { Pt } from './shadow'

export interface EnvSpace { id: string; name: string; rings: Pt[][]; /** Elevation of the space (m). */ z: number; win: StudyWindow }
export interface Envelope {
  x0: number; y0: number; cell: number; nx: number; ny: number
  /** Allowed height above the site base (m) at each cell centre, capped at `cap`. Row-major from (x0, y0). */
  h: Float32Array
  /** Index into `spaces` of the space that sets each cell (−1 = cap). */
  by: Int16Array
  cap: number
  spaces: EnvSpace[]
}

const inside = (p: Pt, ring: Pt[]) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Distance along a unit ray from p to the first edge of any ring (0 if p is inside one; Infinity if none is hit). */
export function rayToRings(p: Pt, u: Pt, rings: Pt[][]): number {
  let best = Infinity
  for (const r of rings) {
    if (inside(p, r)) return 0
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j], [bx, by] = r[i]
      const ex = bx - ax, ey = by - ay
      const den = u[0] * ey - u[1] * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((ax - p[0]) * ey - (ay - p[1]) * ex) / den
      const s = ((ax - p[0]) * u[1] - (ay - p[1]) * u[0]) / den
      if (t >= 0 && s >= 0 && s <= 1 && t < best) best = t
    }
  }
  return best
}

export function solarEnvelope(spaces: EnvSpace[], site: { x0: number; y0: number; x1: number; y1: number }, o: { cell: number; base: number; northDeg: number; stepMin?: number; cap?: number }): Envelope {
  const cap = o.cap ?? 400
  const nx = Math.max(1, Math.ceil((site.x1 - site.x0) / o.cell)), ny = Math.max(1, Math.ceil((site.y1 - site.y0) / o.cell))
  const h = new Float32Array(nx * ny).fill(cap), by = new Int16Array(nx * ny).fill(-1)
  // Sun at each instant of each space's window: the horizontal shadow direction and the tangent of the altitude.
  const suns = spaces.map((s) => instants(s.win, o.stepMin ?? 15).map((utc) => {
    const p = solarPosition(utc)
    if (p.altitude <= 0.5) return null
    const d = sunDirection(p, o.northDeg), hl = Math.hypot(d[0], d[1])
    return { u: [-d[0] / hl, -d[1] / hl] as Pt, tan: d[2] / hl }
  }).filter((x): x is { u: Pt; tan: number } => x !== null))
  // Bounding circles, so most rays skip a space without testing its edges.
  const circles = spaces.map((s) => {
    const pts = s.rings.flat(), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
    return { cx, cy, r: Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) }
  })
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p: Pt = [site.x0 + (i + 0.5) * o.cell, site.y0 + (j + 0.5) * o.cell]
    let best = cap, who = -1
    spaces.forEach((s, k) => {
      const c = circles[k], dz = o.base - s.z // a column standing higher than the space reaches further
      for (const sun of suns[k]) {
        const dx = c.cx - p[0], dy = c.cy - p[1], along = dx * sun.u[0] + dy * sun.u[1]
        if (along < -c.r || Math.abs(dx * sun.u[1] - dy * sun.u[0]) > c.r) continue
        // Reach needed to touch the space, capped: beyond best/tan nothing lower than `best` can shade it.
        if (along - c.r > (best + dz) / sun.tan) continue
        const d = rayToRings(p, sun.u, s.rings)
        if (!Number.isFinite(d)) continue
        const allowed = d * sun.tan - dz
        if (allowed < best) { best = Math.max(0, allowed); who = k }
      }
    })
    h[j * nx + i] = best; by[j * nx + i] = who
  }
  return { x0: site.x0, y0: site.y0, cell: o.cell, nx, ny, h, by, cap, spaces }
}

/** The envelope under a footprint: its lowest point, and how much of the footprint a tower of `top` m pokes through. */
export function envelopeUnder(env: Envelope, footprint: Pt[], top: number) {
  let min = Infinity, minBy = -1, inCells = 0, over = 0
  for (let j = 0; j < env.ny; j++) for (let i = 0; i < env.nx; i++) {
    const p: Pt = [env.x0 + (i + 0.5) * env.cell, env.y0 + (j + 0.5) * env.cell]
    if (!inside(p, footprint)) continue
    inCells++
    const v = env.h[j * env.nx + i]
    if (v < min) { min = v; minBy = env.by[j * env.nx + i] }
    if (top > v + 0.01) over++
  }
  return { min: Number.isFinite(min) ? min : env.cap, by: minBy >= 0 ? env.spaces[minBy].name : null, share: inCells ? over / inCells : 0, cells: inCells }
}
