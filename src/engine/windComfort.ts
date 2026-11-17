// Pedestrian wind comfort: a port of the wind engine of Sinnie Choi's Sun & Wind Studio
// (github.com/xubynii/sun-wind-studio, study.js runWind / summarise / runWindStudy and core.js buildSiteRaster /
// towerRaster / plazaCellsAt / rasterTri / dilate / roseFor / periodInfo, at commit c24addb, 16 Nov 2026), rewritten
// in TypeScript for the Toolkit's model. Her method, unchanged: a two-dimensional D2Q9 lattice-Boltzmann flow at
// pedestrian level on 4 m cells over a 680 × 440 m domain (periodic edges, a body force driven to a free-stream target),
// with and without the tower; speeds are ratios to the free wind far from any building, scaled by the site wind (one
// case) or by each of eight sectors of a seasonal wind rose; Lawson comfort bands on the mean speed; a downwash
// allowance from the tower's height against its neighbours, and the effect of a podium, a canopy, corner treatment and
// plaza shelter. Every constant below is hers; src/engine/windComfort.test.ts holds her outputs (recorded from her code
// by tools/sunwind-fixtures.cjs) and this port must reproduce them. Reuse of her code is asked for in
// 04 Tool Plan/permissions/DRAFT_MESSAGES.md §1c (her written OK is still pending): this branch stays unmerged until then.
// Indicative, not CFD: it shows where a massing accelerates or shelters the wind, not absolute values (her own note).
import rose from '../data/sunWindRose.json'

/** Her fixed domain: 680 × 440 m centred on the site origin, 4 m cells for the wind (study.js DOM, buildSiteRaster). */
export const WIND_GRID = { xmin: -340, xmax: 340, ymin: -220, ymax: 220, cs: 4, nx: 170, ny: 110 } as const
/** Wind profile exponent, urban edge (study.js ALPHA). */
export const ALPHA = 0.25
/** Lawson comfort bands on the mean speed (study.js cls / BANDS): sitting ≤ 2.5, standing ≤ 4, strolling ≤ 6, walking ≤ 8 m/s, uncomfortable above. */
export const BANDS = ['sitting', 'standing', 'strolling', 'walking', 'uncomfortable'] as const
export const BAND_LIMITS = [2.5, 4, 6, 8] as const
export const lawsonBand = (v: number): number => (v <= 2.5 ? 0 : v <= 4 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4)

/** A building of the site as her site.json carries it: a triangle mesh (x, y, z triples; z up) with its top height. */
export interface ObstacleMesh { layer: string; v: ArrayLike<number>; f: ArrayLike<number>; top: number }
/** A future tower as a plan rectangle (her site.future). */
export interface FutureBox { pts: [number, number][]; base?: number; top: number }
export interface SiteBuilding { x: number; y: number; top: number; fp: number; layer: string }
export interface SiteRaster { cs: number; nx: number; ny: number; H: Float32Array; bld: SiteBuilding[] }

/** The tower in her terms: a plan box (w × d at cx, cy, turned by rot radians, counter-clockwise) or any plan outline, and its height. */
export interface WindTower { w: number; d: number; cx: number; cy: number; rot: number; height: number; footprint?: [number, number][] }
export type CornerTreatment = 'sharp' | 'rounded' | 'chamfered'
/** Her wind strategies (SW.ws): a podium that reaches podiumExt m beyond the tower at podiumH m, a canopy depth, corners, plaza shelter 0..1. */
export interface WindStrategy { podiumH: number; podiumExt: number; canopy: number; corners: CornerTreatment; shelter: number }
export interface DownwashZone { depth: number; half: number; amp: number; amp0: number; hn: number; note: string[] }
export interface WindField { ratio: Float32Array; solid: Uint8Array; nx: number; ny: number; cs: number; zone: DownwashZone | null }
export interface WindSummary { cats: number[]; catsB: number[]; worse: number; better: number; maxS: number; plazaWorst: number; plazaMean: number }

// ------------------------------------------------------------------------------------------- site raster (core.js)

/** Calls fn(k) for every grid cell whose centre lies in the triangle (core.js rasterTri). */
export function rasterTri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, cs: number, x0: number, y0: number, nx: number, ny: number, fn: (k: number) => void) {
  const minx = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cs)), maxx = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cs))
  const miny = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cs)), maxy = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / cs))
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
  if (Math.abs(det) < 1e-9) return
  for (let iy = miny; iy <= maxy; iy++) {
    const py = y0 + (iy + 0.5) * cs
    for (let ix = minx; ix <= maxx; ix++) {
      const px = x0 + (ix + 0.5) * cs
      const l1 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / det, l2 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / det, l3 = 1 - l1 - l2
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) fn(iy * nx + ix)
    }
  }
}

/** The site's buildings on the wind grid: each cell's tallest top, and one record per building (core.js buildSiteRaster). */
export function siteRaster(meshes: ObstacleMesh[], futures: FutureBox[] | null): SiteRaster {
  const { cs, nx, ny, xmin, ymin } = WIND_GRID, N = nx * ny
  const H = new Float32Array(N), bld: SiteBuilding[] = []
  for (const m of meshes) {
    if (m.top < 3 || m.layer === 'terrain') continue
    let fp = 0, sx = 0, sy = 0, n = 0
    for (let i = 0; i < m.f.length; i += 3) {
      const a = m.f[i] * 3, b = m.f[i + 1] * 3, c = m.f[i + 2] * 3
      const ax = m.v[a], ay = m.v[a + 1], bx = m.v[b], by = m.v[b + 1], cx = m.v[c], cy = m.v[c + 1]
      const nz = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
      const az = m.v[a + 2], bz = m.v[b + 2], cz = m.v[c + 2]
      if (Math.min(az, bz, cz) > m.top - 1.5 && nz > 0) fp += nz / 2
      rasterTri(ax, ay, bx, by, cx, cy, cs, xmin, ymin, nx, ny, (k) => { if (H[k] < m.top) H[k] = m.top })
      sx += ax + bx + cx; sy += ay + by + cy; n += 3
    }
    if (fp < 5) fp = Math.max(fp, 20)
    bld.push({ x: sx / n, y: sy / n, top: m.top, fp, layer: m.layer })
  }
  if (futures) for (const f of futures) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
    for (const q of f.pts) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]) }
    for (let iy = Math.max(0, Math.floor((miny - ymin) / cs)); iy <= Math.min(ny - 1, Math.floor((maxy - ymin) / cs)); iy++)
      for (let ix = Math.max(0, Math.floor((minx - xmin) / cs)); ix <= Math.min(nx - 1, Math.floor((maxx - xmin) / cs)); ix++) { const k = iy * nx + ix; if (H[k] < f.top) H[k] = f.top }
    bld.push({ x: (minx + maxx) / 2, y: (miny + maxy) / 2, top: f.top, fp: (maxx - minx) * (maxy - miny), layer: 'future' })
  }
  return { cs, nx, ny, H, bld }
}

/** Cells of the plazas and mid-block links (core.js plazaCellsAt), from the meshes of those layers. */
export function plazaMask(meshes: ObstacleMesh[]): Uint8Array {
  const { cs, nx, ny, xmin, ymin } = WIND_GRID
  const out = new Uint8Array(nx * ny)
  for (const m of meshes) {
    if (m.layer !== 'plaza' && m.layer !== 'midblock') continue
    for (let i = 0; i < m.f.length; i += 3) {
      const a = m.f[i] * 3, b = m.f[i + 1] * 3, c = m.f[i + 2] * 3
      rasterTri(m.v[a], m.v[a + 1], m.v[b], m.v[b + 1], m.v[c], m.v[c + 1], cs, xmin, ymin, nx, ny, (k) => { out[k] = 1 })
    }
  }
  return out
}

/** A site raster from a sparse [k, top, k, top, …] list (the test fixtures). */
export function rasterFromSparse(cs: number, nx: number, ny: number, sparse: ArrayLike<number>, bld: SiteBuilding[]): SiteRaster {
  const H = new Float32Array(nx * ny)
  for (let i = 0; i + 1 < sparse.length; i += 2) H[sparse[i]] = sparse[i + 1]
  return { cs, nx, ny, H, bld }
}
export function maskFromSparse(nx: number, ny: number, sparse: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(nx * ny)
  for (let i = 0; i < sparse.length; i += 2) out[sparse[i]] = 1
  return out
}

// ---------------------------------------------------------------------------------------- the tower on the grid

const toLocal = (t: WindTower, x: number, y: number) => { const c = Math.cos(t.rot), s = Math.sin(t.rot), dx = x - t.cx, dy = y - t.cy; return { x: dx * c + dy * s, y: -dx * s + dy * c } }
const toWorld = (t: WindTower, lx: number, ly: number) => { const c = Math.cos(t.rot), s = Math.sin(t.rot); return { x: t.cx + lx * c - ly * s, y: t.cy + lx * s + ly * c } }

function inPolygon(p: [number, number][], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Cells under the tower's plan (core.js towerRaster with a full plate mask; or an outline, cell centres inside it). */
export function towerRaster(t: WindTower, cs: number, nx: number, ny: number): Uint8Array {
  const out = new Uint8Array(nx * ny), { xmin, ymin } = WIND_GRID
  if (t.footprint) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
    for (const q of t.footprint) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]) }
    for (let iy = Math.max(0, Math.floor((miny - ymin) / cs)); iy <= Math.min(ny - 1, Math.floor((maxy - ymin) / cs)); iy++) {
      const y = ymin + (iy + 0.5) * cs
      for (let ix = Math.max(0, Math.floor((minx - xmin) / cs)); ix <= Math.min(nx - 1, Math.floor((maxx - xmin) / cs)); ix++) if (inPolygon(t.footprint, xmin + (ix + 0.5) * cs, y)) out[iy * nx + ix] = 1
    }
    return out
  }
  const R = Math.hypot(t.w, t.d) / 2, mnx = Math.max(1, Math.ceil(t.w)), mny = Math.max(1, Math.ceil(t.d)), x0 = -t.w / 2, y0 = -t.d / 2
  for (let iy = 0; iy < ny; iy++) {
    const y = ymin + (iy + 0.5) * cs
    if (Math.abs(y - t.cy) > R) continue
    for (let ix = 0; ix < nx; ix++) {
      const x = xmin + (ix + 0.5) * cs
      if (Math.abs(x - t.cx) > R) continue
      const l = toLocal(t, x, y)
      if (Math.abs(l.x) > t.w / 2 || Math.abs(l.y) > t.d / 2) continue
      const mx = Math.floor(l.x - x0), my = Math.floor(l.y - y0)
      if (mx < 0 || my < 0 || mx >= mnx || my >= mny) continue
      out[iy * nx + ix] = 1
    }
  }
  return out
}

/** Grows a cell mask by n cells (core.js dilate). */
export function dilate(src: Uint8Array, nx: number, ny: number, n: number): Uint8Array {
  if (n <= 0) return src
  const out = new Uint8Array(src)
  for (let k = 0; k < src.length; k++) {
    if (!src[k]) continue
    const x = k % nx, y = (k / nx) | 0
    for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dy * dy > n * n + n) continue
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue
      out[yy * nx + xx] = 1
    }
  }
  return out
}

/** The tower's four base corners in plan (study.js baseCorners). */
const baseCorners = (t: WindTower) => [[-t.w / 2, -t.d / 2], [t.w / 2, -t.d / 2], [t.w / 2, t.d / 2], [-t.w / 2, t.d / 2]].map((p) => toWorld(t, p[0], p[1]))

// ---------------------------------------------------------------------------- the flow (study.js runWind)

/**
 * Pedestrian-level flow for one wind direction (degrees the wind comes from, 0 = +y, 90 = +x), with or without the
 * tower, as her runWind: periodic D2Q9 lattice-Boltzmann, tau 0.58, driven to a mean lattice speed of 0.05 over
 * round(max(nx, ny) × 3.2) steps; `ratio` = speed over the mean speed of cells more than 24 m from any building. With the
 * tower, the downwash allowance and the strategies scale the ratios. `tower` may be null only with `withTower` false.
 */
export function runWind(sr: SiteRaster, tower: WindTower | null, withTower: boolean, dir: number, strat: WindStrategy | null, plaza: Uint8Array | null): WindField {
  const { cs, nx, ny, H } = sr, N = nx * ny, { xmin, ymin } = WIND_GRID
  const solid = new Uint8Array(N)
  for (let k = 0; k < N; k++) if (H[k] > 3) solid[k] = 1
  const podium = !!(withTower && strat && strat.podiumH > 0 && strat.podiumExt > 0)
  if (withTower && tower) {
    let tr = towerRaster(tower, cs, nx, ny)
    if (podium && strat) tr = dilate(tr, nx, ny, Math.round(strat.podiumExt / cs))
    for (let k = 0; k < N; k++) if (tr[k]) solid[k] = 1
  }
  const ex = [0, 1, 0, -1, 0, 1, -1, -1, 1], ey = [0, 0, 1, 0, -1, 1, 1, -1, -1], w = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36], opp = [0, 3, 4, 1, 2, 7, 8, 5, 6]
  let f = new Float32Array(9 * N), g = new Float32Array(9 * N)
  for (let k = 0; k < N; k++) for (let i = 0; i < 9; i++) f[i * N + k] = w[i]
  const th = ((dir + 180) * Math.PI) / 180
  const fx0 = Math.sin(th), fy0 = Math.cos(th)
  const tau = 0.58, uT = 0.05
  let F = 2e-5
  const steps = Math.round(Math.max(nx, ny) * 3.2)
  const ux = new Float32Array(N), uy = new Float32Array(N)
  for (let s = 0; s < steps; s++) {
    let umean = 0, cnt = 0
    for (let k = 0; k < N; k++) {
      if (solid[k]) continue
      let rho = 0, vx = 0, vy = 0
      for (let i = 0; i < 9; i++) { const fi = f[i * N + k]; rho += fi; vx += fi * ex[i]; vy += fi * ey[i] }
      vx = vx / rho + (F * fx0 * tau) / rho; vy = vy / rho + (F * fy0 * tau) / rho; ux[k] = vx; uy[k] = vy
      const sp = Math.hypot(vx, vy)
      if (sp > 0.25) { vx *= 0.25 / sp; vy *= 0.25 / sp }
      const usq = 1.5 * (vx * vx + vy * vy)
      for (let i = 0; i < 9; i++) { const eu = 3 * (ex[i] * vx + ey[i] * vy); const feq = w[i] * rho * (1 + eu + 0.5 * eu * eu - usq); f[i * N + k] += -(f[i * N + k] - feq) / tau }
      umean += Math.hypot(ux[k], uy[k]) * (fx0 * ux[k] + fy0 * uy[k] > 0 ? 1 : 0.5); cnt++
    }
    umean /= Math.max(1, cnt)
    F = Math.max(0, F + Math.max(-1e-5, Math.min(1e-5, (uT - umean) * 4e-5)))
    for (let k = 0; k < N; k++) {
      if (solid[k]) continue
      const x = k % nx, y = (k / nx) | 0
      for (let i = 0; i < 9; i++) {
        const v = f[i * N + k]
        const xn = (x + ex[i] + nx) % nx, yn = (y + ey[i] + ny) % ny, kn = yn * nx + xn
        if (solid[kn]) g[opp[i] * N + k] = v; else g[i * N + kn] = v
      }
    }
    const t = f; f = g; g = t
  }
  // distance to the nearest building (up to 6 cells), the free-wind reference, and the ratios
  const dist = new Float32Array(N).fill(1e9)
  for (let k = 0; k < N; k++) {
    if (!solid[k]) continue
    const x = k % nx, y = (k / nx) | 0
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue
      const j = yy * nx + xx, dd = Math.hypot(dx, dy) * cs
      if (dd < dist[j]) dist[j] = dd
    }
  }
  let ref = 0, rc = 0
  for (let k = 0; k < N; k++) if (!solid[k] && dist[k] > 24) { ref += Math.hypot(ux[k], uy[k]); rc++ }
  ref = ref / Math.max(1, rc) || 1
  const ratio = new Float32Array(N)
  for (let k = 0; k < N; k++) ratio[k] = solid[k] ? 0 : Math.hypot(ux[k], uy[k]) / ref
  let zone: DownwashZone | null = null
  if (withTower && tower) {
    // downwash: the tower against the mean roof of its neighbours within 120 m
    let hs = 0, hc = 0
    for (const b of sr.bld) if (Math.hypot(b.x - tower.cx, b.y - tower.cy) < 120) { hs += b.top; hc++ }
    const hn = hc ? hs / hc : 20
    let amp = Math.min(2.1, Math.max(1, 1 + 0.45 * Math.log2(tower.height / Math.max(8, hn))))
    const amp0 = amp, note: string[] = []
    if (strat) {
      if (podium) { const kk = 1 - 0.8 * Math.min(1, strat.podiumH / 30); amp = 1 + (amp - 1) * kk; note.push('podium') }
      if (strat.canopy > 0) { amp = 1 + (amp - 1) * (1 - 0.35 * Math.min(1, strat.canopy / 6)); note.push('canopy') }
    }
    const depth = 0.22 * tower.height, half = Math.max(tower.w, tower.d) * 0.6
    zone = { depth, half, amp, amp0, hn, note }
    for (let k = 0; k < N; k++) {
      if (solid[k]) continue
      const x = xmin + ((k % nx) + 0.5) * cs - tower.cx, y = ymin + (((k / nx) | 0) + 0.5) * cs - tower.cy
      const along = -(x * fx0 + y * fy0), across = Math.abs(-x * fy0 + y * fx0)
      if (along > 0 && along < depth && across < half) ratio[k] *= 1 + (amp - 1) * (1 - along / depth)
    }
    if (strat && strat.corners !== 'sharp') {
      const cs4 = baseCorners(tower)
      for (let k = 0; k < N; k++) {
        if (solid[k]) continue
        const x = xmin + ((k % nx) + 0.5) * cs, y = ymin + (((k / nx) | 0) + 0.5) * cs
        for (const c of cs4) if (Math.hypot(x - c.x, y - c.y) < 14) { ratio[k] *= strat.corners === 'rounded' ? 0.78 : 0.85; break }
      }
    }
    if (strat && strat.shelter > 0 && plaza) for (let k = 0; k < N; k++) if (plaza[k] && !solid[k]) ratio[k] *= 1 - 0.4 * strat.shelter
  }
  return { ratio, solid, nx, ny, cs, zone }
}

/** Comfort bands with (a) and without (b) the tower at site wind U m/s: areas in m² per band, and the plaza readings (study.js summarise). */
export function summarise(a: WindField, b: WindField, U: number, plaza: Uint8Array): WindSummary {
  const N = a.nx * a.ny, cats = [0, 0, 0, 0, 0], catsB = [0, 0, 0, 0, 0]
  let worse = 0, better = 0, maxS = 0, plazaWorst = 0, plazaMean = 0, pc = 0
  for (let k = 0; k < N; k++) {
    if (a.solid[k]) continue
    const s = a.ratio[k] * U, sb = b.solid[k] ? s : b.ratio[k] * U
    cats[lawsonBand(s)] += a.cs * a.cs; catsB[lawsonBand(sb)] += a.cs * a.cs
    if (lawsonBand(s) > lawsonBand(sb)) worse += a.cs * a.cs
    if (lawsonBand(s) < lawsonBand(sb)) better += a.cs * a.cs
    if (s > maxS) maxS = s
    if (plaza[k]) { plazaWorst = Math.max(plazaWorst, s); plazaMean += s; pc++ }
  }
  return { cats, catsB, worse, better, maxS, plazaWorst, plazaMean: pc ? plazaMean / pc : 0 }
}

// ------------------------------------------------------------------------------- the wind rose (study.js roseFor)

export interface Period { from: string; to: string }
export interface PeriodInfo { days: number; monthDays: number[]; full: boolean; label: string }
export interface RoseSector { dir: number; name: string; f: number; s: number }
const DAYS = rose.days as number[]
const MONTHS = rose.months as string[]
const parseMD = (s: string) => { const p = String(s || '01-01').split('-'); const m = Math.min(12, Math.max(1, parseInt(p[0], 10) || 1)) - 1; const d = Math.min(DAYS[m], Math.max(1, parseInt(p[1], 10) || 1)); return { m, d } }
const doyOf = (m: number, d: number) => { let n = 0; for (let i = 0; i < m; i++) n += DAYS[i]; return n + d }
const monthOf = (doy: number) => { let n = 0; for (let i = 0; i < 12; i++) { n += DAYS[i]; if (doy <= n) return i } return 11 }

/** Days per month of a period 'MM-DD' to 'MM-DD' (wrapping over the new year), as her periodInfo. */
export function periodInfo(p: Period): PeriodInfo {
  const a = parseMD(p.from), b = parseMD(p.to), d0 = doyOf(a.m, a.d), d1 = doyOf(b.m, b.d)
  const days = d1 >= d0 ? d1 - d0 + 1 : 365 - d0 + 1 + d1
  const monthDays = new Array<number>(12).fill(0)
  for (let k = 0; k < days; k++) monthDays[monthOf(((d0 - 1 + k) % 365) + 1)]++
  const full = days >= 365
  return { days, monthDays, full, label: full ? 'whole year' : `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}` }
}

/** The eight-sector rose of a period: frequency and frequency-weighted mean speed from her monthly roses (study.js roseFor). */
export function roseFor(pi: PeriodInfo): RoseSector[] {
  const names = rose.names as string[], dirs = rose.dirs as number[], monthly = rose.monthly as { f: number; s: number }[][]
  const out: RoseSector[] = names.map((name, i) => ({ dir: dirs[i], name, f: 0, s: 0 }))
  let tot = 0
  for (let m = 0; m < 12; m++) {
    const w = pi.monthDays[m]
    if (!w) continue
    const RM = monthly[m]
    out.forEach((r, i) => { const f = RM[i].f, s = RM[i].s; r.f += w * f; r.s += w * f * s })
    tot += w
  }
  out.forEach((r) => { r.s = r.f ? r.s / r.f : 3.5; r.f = tot ? r.f / tot : 0 })
  return out
}

/** Mean, gust and gust pressure with height from the 10 m speed (study.js windProfile): U(z) = U10 (z/10)^0.25, gust 1.8 U, q = 0.613 U². */
export function windProfile(U10: number, top: number) {
  const zs = [10, 30, 60, 100, 150, 200, 250, 300].filter((z) => z < top - 5).concat([top])
  return zs.map((z) => { const U = U10 * Math.pow(z / 10, ALPHA); return { z, U, gust: U * 1.8, q: 0.613 * U * U } })
}

// --------------------------------------------------------------------------- the study (study.js runWindStudy)

export interface WindStudySettings {
  /** One case: the wind from `dir` at `speed` m/s (10 m). Annual: the eight sectors of the period's rose. */
  annual: boolean
  dir: number
  speed: number
  period: Period
  strat: WindStrategy | null
  /**
   * Degrees from the domain's +y to true north, clockwise (the competition model: 45°). `dir` and the rose sectors are compass
   * bearings; the flow is solved from `bearing + north` in the domain. 0 or absent: her frame, +y read as north.
   */
  north?: number
}
export interface SectorResult extends RoseSector, WindSummary { }
export interface WindStudyResult extends WindSummary {
  annual: boolean
  /** Site wind the ratios are scaled by: the case speed, or 1 (the annual maps are already in m/s). */
  U: number
  a: WindField
  b: WindField
  /** With the tower but without the strategies, when strategies are on. */
  a0: WindField | null
  vsBase: (WindSummary & { plazaMean0: number }) | null
  period: PeriodInfo | null
  sectors: SectorResult[]
  /** Open ground where the gust (1.8 × mean) tops 6 m/s in more than 5 % of hours, m² (annual only). */
  gusty: number
  gustyB: number
  strat: WindStrategy | null
}

/**
 * Her runWindStudy: one case, or the frequency-weighted mean of the eight sectors of the period's rose, each solved
 * with and without the tower (and without the strategies when they are on). `onSector` reports progress.
 */
export function windStudy(sr: SiteRaster, tower: WindTower, plaza: Uint8Array, settings: WindStudySettings, onSector?: (i: number, n: number, name: string) => void): WindStudyResult {
  const strat = settings.strat
  if (!settings.annual) {
    const gd = settings.dir + (settings.north ?? 0)
    const a = runWind(sr, tower, true, gd, strat, plaza), b = runWind(sr, null, false, gd, null, plaza)
    const s = summarise(a, b, settings.speed, plaza)
    let a0: WindField | null = null, vsBase: WindStudyResult['vsBase'] = null
    if (strat) { a0 = runWind(sr, tower, true, gd, null, plaza); vsBase = { ...summarise(a, a0, settings.speed, plaza), plazaMean0: summarise(a0, b, settings.speed, plaza).plazaMean } }
    return { annual: false, U: settings.speed, a, b, a0, vsBase, period: null, sectors: [], gusty: 0, gustyB: 0, strat, ...s }
  }
  const N = sr.nx * sr.ny
  const meanA = new Float32Array(N), meanB = new Float32Array(N), meanA0 = new Float32Array(N), pOver6 = new Float32Array(N), pOver6B = new Float32Array(N)
  const sectors: SectorResult[] = []
  let solidA: Uint8Array | null = null, zone: DownwashZone | null = null
  const PI = periodInfo(settings.period), rs = roseFor(PI)
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]
    onSector?.(i, rs.length, r.name)
    const gd = r.dir + (settings.north ?? 0)
    const a = runWind(sr, tower, true, gd, strat, plaza), b = runWind(sr, null, false, gd, null, plaza)
    const a0 = strat ? runWind(sr, tower, true, gd, null, plaza) : null
    solidA = a.solid; zone = a.zone || zone
    const s = summarise(a, b, r.s, plaza)
    for (let k = 0; k < N; k++) {
      if (a.solid[k]) continue
      const sa = a.ratio[k] * r.s, sb = b.solid[k] ? sa : b.ratio[k] * r.s
      meanA[k] += r.f * sa; meanB[k] += r.f * sb
      if (a0) meanA0[k] += r.f * (a0.solid[k] ? sa : a0.ratio[k] * r.s)
      if (sa * 1.8 > 6) pOver6[k] += r.f
      if (sb * 1.8 > 6) pOver6B[k] += r.f
    }
    sectors.push({ dir: r.dir, name: r.name, f: r.f, s: r.s, ...s })
  }
  const a: WindField = { ratio: meanA, solid: solidA!, nx: sr.nx, ny: sr.ny, cs: sr.cs, zone }, b: WindField = { ratio: meanB, solid: solidA!, nx: a.nx, ny: a.ny, cs: a.cs, zone: null }
  const s = summarise(a, b, 1, plaza)
  let gusty = 0, gustyB = 0
  for (let k = 0; k < N; k++) { if (solidA![k]) continue; if (pOver6[k] > 0.05) gusty += a.cs * a.cs; if (pOver6B[k] > 0.05) gustyB += a.cs * a.cs }
  let a0: WindField | null = null, vsBase: WindStudyResult['vsBase'] = null
  if (strat) { a0 = { ratio: meanA0, solid: solidA!, nx: a.nx, ny: a.ny, cs: a.cs, zone: null }; vsBase = { ...summarise(a, a0, 1, plaza), plazaMean0: summarise(a0, b, 1, plaza).plazaMean } }
  return { annual: true, U: 1, a, b, a0, vsBase, period: PI, sectors, gusty, gustyB, strat, ...s }
}
