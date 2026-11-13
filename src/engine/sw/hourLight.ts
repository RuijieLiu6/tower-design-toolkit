// Light on the work plane at one hour, at the quality of Sun & Wind Studio's plan (study.js: the 'lux' branch of
// renderPlan, sunOpening, glassWalker, sunBounce, monthHour). The sun patch is traced on a fine grid (0.1 m on a tower
// plate): from each point toward the sun to where the ray crosses the façade, then through the opening as built: the
// glass band between sill and head, curtain-wall mullions every 1.5 m (80 mm wide, 150 mm deep) and the zone's device at
// its real size, so mullions, fins, louvre slats, reveals and shelves cast their own shadows on the floor.
//
// Two parts, so the hour slider stays live: `hourBase` is everything that does not move with the sun (each face's sky
// component on the 0.5 m daylight grid, carried to the fine grid; the plate's fine mask) and is cached per floor and
// façade; `hourLight` adds the hour's sky, the sun patch and its reflection. Rays are intersected with the plate's edges
// exactly (the Studio steps a 0.125 m walker and then projects to the façade plane; the result is the same).
import { prepClimate, sunAt, TZ_BY_MONTH } from './climate'
import { skyPart, type DaylightOptions, type LightAtHour, type SkyPart } from './daylight'
import { band, DL_R, DL_WP, FACE_AZ, faceOffset, GAP, GLASS_VT, obstructionAngles, ORI, STRATS, zoneFor, type Face, type FacadeZone, type SwFloor } from './plate'
import type { ClimatePayload } from './types'

/** Curtain-wall mullions (study.js MULL): pitch along the façade, width, depth into the room. */
export const MULL = { pitch: 1.5, w: 0.08, d: 0.15 }
const AA2 = [-0.25, 0.25]
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const faceIdx: Record<Face, number> = { N: 0, E: 1, S: 2, W: 3 }

export interface FineGrid { h: number; nx: number; ny: number; x0: number; y0: number }
export interface HourBase {
  key: string
  fine: FineGrid
  /** 1 where the fine cell's centre is on the plate, outside the core. */
  inside: Uint8Array
  cells: number
  /** Sky component of each face (N, E, S, W) at each fine cell: 4 values per cell. */
  sky: Float32Array
  S: SkyPart
}
export interface HourLight extends LightAtHour {
  /** Share of the beam each fine cell gets through the openings (0–1). */
  dim: Float32Array
  /** Beam illuminance on the work plane behind clear glass, lux. */
  beam: number
  inside: Uint8Array
}
export interface HourOptions extends DaylightOptions { /** Fine grid size in metres (default 0.1, coarser on big plates). */ fineH?: number; latLon?: [number, number] }

/** The fine grid of a floor: 0.1 m on a tower plate, coarser when the plate is big, so a slider step stays quick. */
export function fineGridOf(f: SwFloor, want?: number): FineGrid {
  const m = f.mask, W = m.nx * m.h, D = m.ny * m.h
  const h = want ?? Math.max(0.1, Math.ceil(Math.sqrt((W * D) / 170000) * 20) / 20)
  return { h, nx: Math.ceil(W / h - 1e-6), ny: Math.ceil(D / h - 1e-6), x0: m.x0, y0: m.y0 }
}

/** What identifies a floor's interior light: plate, core, height, level's zones, obstruction. */
export function plateKey(f: SwFloor, zones: FacadeZone[], o: DaylightOptions, extra = ''): string {
  const obs = obstructionAngles(f, o.ctx ?? [])
  return JSON.stringify([f.towerId, f.rings.map((r) => r.map((p) => [Math.round(p[0] * 20), Math.round(p[1] * 20)])), f.mask.h, f.h.toFixed(2), f.rot.toFixed(4), f.core, Math.round(f.area),
    ORI.map((q) => zoneFor(zones, q, f.level)), ORI.map((q) => Math.round(obs[q] * 90)), o.vt ?? GLASS_VT, !!o.noDev, extra])
}

const skyMemo = new Map<string, SkyPart>(), baseMemo = new Map<string, HourBase>()
const keep = <T,>(m: Map<string, T>, k: string, v: T, max: number) => { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value as string); return v }

/** The parts of the hour's light that do not move with the sun, cached per floor and façade. */
export function hourBase(f: SwFloor, zones: FacadeZone[], opts: HourOptions = {}): HourBase {
  const fine = fineGridOf(f, opts.fineH), sk = plateKey(f, zones, opts), key = sk + '|' + fine.h
  const hit = baseMemo.get(key)
  if (hit) return hit
  const S = skyMemo.get(sk) ?? keep(skyMemo, sk, skyPart(f, zones, opts, 1, Math.max(1, Math.round(f.mask.h / 0.5))), 8)
  // fine mask: scanlines through the rings (even-odd), less the core
  const N = fine.nx * fine.ny, inside = new Uint8Array(N)
  let cells = 0
  for (let iy = 0; iy < fine.ny; iy++) {
    const y = fine.y0 + (iy + 0.5) * fine.h, xs: number[] = []
    for (const r of f.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi) }
    xs.sort((a, b) => a - b)
    const core = Math.abs(y - f.core.y) <= f.core.half
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil((xs[q] - fine.x0) / fine.h - 0.5)), b = Math.min(fine.nx - 1, Math.floor((xs[q + 1] - fine.x0) / fine.h - 0.5))
      for (let ix = a; ix <= b; ix++) { if (core && Math.abs(fine.x0 + (ix + 0.5) * fine.h - f.core.x) <= f.core.half) continue; if (!inside[iy * fine.nx + ix]) { inside[iy * fine.nx + ix] = 1; cells++ } }
    }
  }
  // sky component of each face from the sensor grid to the fine grid: spread past the sensors' edge, then bilinear
  const G = S.G, n0 = G.nx * G.ny, sc = Float32Array.from(S.sc), on = new Uint8Array(n0)
  for (const ci of S.cellList) on[ci] = 1
  for (let pass = 0; pass < 4; pass++) {
    const add: number[] = []
    for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) {
      const k = iy * G.nx + ix
      if (on[k]) continue
      let n = 0, a = 0, b = 0, c = 0, d = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const jx = ix + dx, jy = iy + dy; if (jx < 0 || jy < 0 || jx >= G.nx || jy >= G.ny) continue; const q = jy * G.nx + jx; if (!on[q]) continue; a += sc[q * 4]; b += sc[q * 4 + 1]; c += sc[q * 4 + 2]; d += sc[q * 4 + 3]; n++ }
      if (n) { sc[k * 4] = a / n; sc[k * 4 + 1] = b / n; sc[k * 4 + 2] = c / n; sc[k * 4 + 3] = d / n; add.push(k) }
    }
    for (const k of add) on[k] = 1
  }
  const sky = new Float32Array(N * 4)
  for (let iy = 0; iy < fine.ny; iy++) {
    const gy = ((iy + 0.5) * fine.h) / G.h - 0.5, j0 = Math.max(0, Math.min(G.ny - 1, Math.floor(gy))), j1 = Math.min(G.ny - 1, j0 + 1), ty = Math.max(0, Math.min(1, gy - j0))
    for (let ix = 0; ix < fine.nx; ix++) {
      const k = iy * fine.nx + ix
      if (!inside[k]) continue
      const gx = ((ix + 0.5) * fine.h) / G.h - 0.5, i0 = Math.max(0, Math.min(G.nx - 1, Math.floor(gx))), i1 = Math.min(G.nx - 1, i0 + 1), tx = Math.max(0, Math.min(1, gx - i0))
      const q00 = (j0 * G.nx + i0) * 4, q10 = (j0 * G.nx + i1) * 4, q01 = (j1 * G.nx + i0) * 4, q11 = (j1 * G.nx + i1) * 4
      const w00 = (1 - tx) * (1 - ty) * on[q00 / 4], w10 = tx * (1 - ty) * on[q10 / 4], w01 = (1 - tx) * ty * on[q01 / 4], w11 = tx * ty * on[q11 / 4], w = w00 + w10 + w01 + w11
      if (w > 0) for (let c = 0; c < 4; c++) sky[k * 4 + c] = (sc[q00 + c] * w00 + sc[q10 + c] * w10 + sc[q01 + c] * w01 + sc[q11 + c] * w11) / w
    }
  }
  return keep(baseMemo, key, { key, fine, inside, cells, sky, S }, 8)
}

/** Month-average diffuse horizontal and direct normal illuminance at a clock hour (study.js monthHour), and the sun. */
export function monthHour(C: ClimatePayload | null, doy: number, hour: number, latLon?: [number, number]) {
  const days = C?.days ?? MONTH_DAYS
  let m = 11
  { let acc = 0; for (let q = 0; q < 12; q++) { acc += days[q]; if (doy <= acc) { m = q; break } } }
  const tz = TZ_BY_MONTH[m] ?? -8, lat = C?.lat ?? latLon?.[0] ?? 49.2, lon = C?.lon ?? latLon?.[1] ?? -123.1
  const p = sunAt((lat * Math.PI) / 180, lon, doy, hour, tz)
  let Ed = 0, Eb = 0
  if (C) {
    const P = prepClimate(C), hs = (((Math.floor(hour) - (tz + 8)) % 24) + 24) % 24
    let n = 0
    for (let k = hs; k < 8760; k += 24) { if (P.mon[k] !== m) continue; Ed += P.Ed[k]; Eb += P.Eb[k]; n++ }
    n = n || 1; Ed /= n; Eb /= n
  }
  return { m, p, Ed, Eb }
}

interface Opening {
  mx: number; my: number; ux: number; uy: number; ox: number; oy: number; L: number; so: number; run: number; rise: number; o: number
  sp: number; head: number; gh: number; D: number; strat: FacadeZone['strat']; device: boolean
}

/** The share of the beam one ray gets through an opening (study.js sunOpening): u along the edge, D metres to the façade. */
function through(e: Opening, u: number, D: number, tanA: number, noDev: boolean): number {
  const zg = DL_WP + D * tanA
  if (zg < e.sp || zg > e.head) return 0
  const h = e.L / 2, between = (p: number, a: number, b: number, pad: number) => p >= Math.min(a, b) - pad && p <= Math.max(a, b) + pad
  if (e.strat === 'punched') {
    const nW = Math.max(1, Math.floor(e.L / 2.4)), stp = e.L / nW, w = Math.min(1.8, stp - 0.4)
    if (w <= 0.4) return 0
    const i = Math.max(0, Math.min(nW - 1, Math.floor((u + h) / stp))), c = -h + (i + 0.5) * stp
    if (Math.abs(u - c) > w / 2) return 0
    if (!noDev) { const ue = u + e.run * e.D; if (ue < c - w / 2 || ue > c + w / 2) return 0; if (zg + e.rise * e.D > e.head) return 0 }
  } else {
    const nm = Math.max(1, Math.round(e.L / MULL.pitch)), mp = e.L / nm, i0 = Math.round((u + h) / mp), u2 = u - e.run * MULL.d
    for (let i = Math.max(0, i0 - 1); i <= Math.min(nm, i0 + 1); i++) if (between(-h + i * mp, u, u2, MULL.w / 2)) return 0
  }
  if (!noDev && e.device && e.D > 0) {
    const s = e.strat, D2 = e.D
    if (s === 'overhang' || s === 'balcony') { if (zg + e.rise * D2 > e.head) return 0 }
    if (s === 'louvres' || s === 'eggcrate') { const nl = Math.floor(e.gh / 0.5), z2 = zg + e.rise * D2; for (let i = 0; i < nl; i++) if (between(e.sp + (i + 0.5) * 0.5, zg, z2, 0.025)) return 0 }
    if (s === 'fins' || s === 'eggcrate') { const nf = Math.max(1, Math.floor(e.L / 1.5)), stp = e.L / nf, u2 = u + e.run * D2, i0 = Math.floor((u + h) / stp); for (let i = Math.max(0, i0 - 2); i <= Math.min(nf - 1, i0 + 2); i++) if (between(-h + (i + 0.5) * stp, u, u2, 0.05)) return 0 }
    if (s === 'lightshelf') { const zs = e.gh > 2.3 ? e.sp + Math.min(2.1, e.gh - 0.3) : e.head; if (zg < zs && zg + e.rise * D2 > zs) return 0 }
  }
  return e.strat === 'doubleskin' ? 0.8 : 1
}

/** The sun patch: the share of the beam reaching each fine cell, and the face it comes through. */
export function sunPatch(f: SwFloor, zones: FacadeZone[], base: HourBase, altRad: number, azRad: number, noDev = false): { dim: Float32Array; face: Int8Array } {
  const { fine, inside } = base, N = fine.nx * fine.ny, dim = new Float32Array(N), face = new Int8Array(N).fill(-1)
  if (!(altRad > 0.02)) return { dim, face }
  const c = Math.cos(-f.rot), s = Math.sin(-f.rot), wx = Math.sin(azRad), wy = Math.cos(azRad), sx = wx * c - wy * s, sy = wx * s + wy * c, tanA = Math.tan(altRad)
  const E: Opening[] = []
  let maxHead = 0
  for (const e of f.edges) {
    const so = sx * e.ox + sy * e.oy
    if (so <= 0.02) continue
    const z = zoneFor(zones, e.o, f.level), B = band(f, z), st = STRATS[z.strat]
    E.push({ mx: e.mx, my: e.my, ux: e.ux, uy: e.uy, ox: e.ox, oy: e.oy, L: e.L, so, run: (sx * e.ux + sy * e.uy) / so, rise: tanA / so, o: faceIdx[e.o], sp: B.sp, head: B.head, gh: B.gh, D: z.depth || 0, strat: z.strat, device: st.device })
    maxHead = Math.max(maxHead, B.head)
  }
  if (!E.length) return { dim, face }
  const reach = (maxHead - DL_WP) / tanA + fine.h, cx = f.core.x, cy = f.core.y, ch = f.core.half, nE = E.length
  for (let iy = 0; iy < fine.ny; iy++) for (let ix = 0; ix < fine.nx; ix++) {
    const k = iy * fine.nx + ix
    if (!inside[k]) continue
    const x0 = fine.x0 + (ix + 0.5) * fine.h, y0 = fine.y0 + (iy + 0.5) * fine.h
    let acc = 0, fo = -1
    for (let a = 0; a < 4; a++) {
      const px = x0 + AA2[a & 1] * fine.h, py = y0 + AA2[a >> 1] * fine.h
      let best = reach, be = -1, bu = 0
      for (let q = 0; q < nE; q++) {
        const e = E[q], D = ((e.mx - px) * e.ox + (e.my - py) * e.oy) / e.so
        if (!(D >= 0) || D >= best) continue
        const u = (px + sx * D - e.mx) * e.ux + (py + sy * D - e.my) * e.uy
        if (Math.abs(u) > e.L / 2 + 1e-6) continue
        best = D; be = q; bu = u
      }
      if (be < 0) continue
      // the core stands in the way
      if (ch > 0) {
        const t1 = (cx - ch - px) / (sx || 1e-9), t2 = (cx + ch - px) / (sx || 1e-9), t3 = (cy - ch - py) / (sy || 1e-9), t4 = (cy + ch - py) / (sy || 1e-9)
        const tn = Math.max(Math.min(t1, t2), Math.min(t3, t4)), tf = Math.min(Math.max(t1, t2), Math.max(t3, t4))
        if (tf > 0 && tn < tf && tn < best) continue
      }
      const t = through(E[be], bu, best, tanA, noDev)
      if (t > 0) { acc += t; if (fo < 0) fo = E[be].o }
    }
    const t = acc / 4
    if (t > 0.02) { dim[k] = t; face[k] = fo }
  }
  return { dim, face }
}

/** The sun patch reflected off the floor to the ceiling and back to the work plane (study.js sunBounce), on 1 m cells. */
function bounceOf(f: SwFloor, base: HourBase, Eb: Float32Array): Float32Array | null {
  const { fine, inside } = base, H = Math.max(1.6, f.h - GAP - DL_WP), H2 = H * H, A = fine.h * fine.h, N = fine.nx * fine.ny
  const cnx = Math.ceil(fine.nx * fine.h), cny = Math.ceil(fine.ny * fine.h), sp = new Float64Array(cnx * cny), sxm = new Float64Array(cnx * cny), sym = new Float64Array(cnx * cny)
  let flux = 0
  for (let k = 0; k < N; k++) {
    const E = Eb[k]
    if (!(E > 0)) continue
    const x = ((k % fine.nx) + 0.5) * fine.h, y = (((k / fine.nx) | 0) + 0.5) * fine.h, q = Math.min(cny - 1, y | 0) * cnx + Math.min(cnx - 1, x | 0), p = E * A
    sp[q] += p; sxm[q] += x * p; sym[q] += y * p; flux += p
  }
  if (!flux) return null
  const src: number[] = []
  for (let q = 0; q < cnx * cny; q++) if (sp[q] > 0) src.push(sxm[q] / sp[q], sym[q] / sp[q], sp[q] * DL_R.floor)
  const ceil: number[] = []
  for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    const x = i + 0.5, y = j + 0.5, fk = Math.min(fine.ny - 1, Math.floor(y / fine.h)) * fine.nx + Math.min(fine.nx - 1, Math.floor(x / fine.h))
    if (!inside[fk]) continue
    let E = 0
    for (let q = 0; q < src.length; q += 3) { const d2 = (x - src[q]) ** 2 + (y - src[q + 1]) ** 2; E += (src[q + 2] * H2) / (Math.PI * (H2 + d2) * (H2 + d2)) }
    ceil.push(x, y, E * DL_R.ceil)
  }
  const gnx = cnx + 1, gny = cny + 1, CE = new Float32Array(gnx * gny)
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {
    let E = 0
    for (let q = 0; q < ceil.length; q += 3) { const d2 = (i - ceil[q]) ** 2 + (j - ceil[q + 1]) ** 2; E += (ceil[q + 2] * H2) / (Math.PI * (H2 + d2) * (H2 + d2)) }
    CE[j * gnx + i] = E
  }
  const out = new Float32Array(N)
  let sum = 0
  for (let iy = 0; iy < fine.ny; iy++) {
    const gy = (iy + 0.5) * fine.h, j0 = Math.min(gny - 2, gy | 0), ty = gy - j0
    for (let ix = 0; ix < fine.nx; ix++) {
      const k = iy * fine.nx + ix
      if (!inside[k]) continue
      const gx = (ix + 0.5) * fine.h, i0 = Math.min(gnx - 2, gx | 0), tx = gx - i0
      const E = CE[j0 * gnx + i0] * (1 - tx) * (1 - ty) + CE[j0 * gnx + i0 + 1] * tx * (1 - ty) + CE[(j0 + 1) * gnx + i0] * (1 - tx) * ty + CE[(j0 + 1) * gnx + i0 + 1] * tx * ty
      out[k] = E; sum += E
    }
  }
  // the bounces after these two, spread evenly (BRE split flux on the whole plate)
  let perim = 0
  for (const e of f.edges) perim += e.L
  const n = base.cells, hh = f.h - GAP, Af = f.area || n * A, walls = (perim + 8 * f.core.half) * hh, Atot = 2 * Af + walls
  const Rm = (DL_R.floor * Af + DL_R.ceil * Af + DL_R.wall * walls) / Atot
  const rest = Math.max(0, (flux * DL_R.floor) / (Atot * (1 - Rm)) - (n ? sum / n : 0))
  if (rest > 0) for (let k = 0; k < N; k++) if (inside[k]) out[k] += rest
  return out
}

/**
 * Light on the 0.8 m work plane at one clock hour on a typical day of the month of `doy`: each face's sky component times
 * the month's average diffuse sky at that hour, the light reflected inside, the sun patch through the openings as built,
 * its reflection off floor and ceiling, and LM-83 blinds at that hour.
 */
export function hourLight(f: SwFloor, zones: FacadeZone[], C: ClimatePayload | null, at: { doy: number; hour: number }, opts: HourOptions = {}, base: HourBase = hourBase(f, zones, opts)): HourLight {
  const { fine, inside, sky, S } = base, N = fine.nx * fine.ny, a = base.cells, vt = opts.vt ?? GLASS_VT, blinds = !!opts.blinds
  const M = monthHour(C, at.doy, at.hour, opts.latLon), p = M.p, sunUp = p.alt > 0.02, beam = M.Eb * Math.max(0, Math.sin(p.alt)) * vt
  const { dim, face } = sunUp && M.Eb > 0 ? sunPatch(f, zones, base, p.alt, p.az, !!opts.noDev) : { dim: new Float32Array(N), face: new Int8Array(N).fill(-1) }
  // LM-83 blinds at this hour: a face drops its blinds when it lets direct sun over 1,000 lux onto more than 2% of the floor
  let sunny = 0
  const byF = [0, 0, 0, 0]
  for (let k = 0; k < N; k++) if (face[k] >= 0 && beam * dim[k] >= 1000) { sunny++; byF[face[k]]++ }
  const closed = {} as Record<Face, boolean>, blindsDown: Face[] = []
  ORI.forEach((o, i) => { closed[o] = blinds && byF[i] > 0.02 * a; if (closed[o]) blindsDown.push(o) })
  const b0 = closed.N ? DL_R.blind : 1, b1 = closed.E ? DL_R.blind : 1, b2 = closed.S ? DL_R.blind : 1, b3 = closed.W ? DL_R.blind : 1
  let wg = 0, wgB = 0
  ORI.forEach((o, i) => { wg += S.Wg[o]; wgB += S.Wg[o] * [b0, b1, b2, b3][i] })
  const irc = S.ircDF * (wg ? wgB / wg : 1) * M.Ed
  const EbG = new Float32Array(N), held = new Uint8Array(N), shut = [closed.N, closed.E, closed.S, closed.W]
  let nHeld = 0
  for (let k = 0; k < N; k++) { const fo = face[k]; if (fo < 0) continue; if (!shut[fo]) EbG[k] = beam * dim[k]; else if (beam * dim[k] >= 1000) { held[k] = 1; nHeld++ } }
  const bounce = bounceOf(f, base, EbG), lux = new Float32Array(N)
  let o300 = 0, o3k = 0
  for (let k = 0; k < N; k++) {
    if (!inside[k]) continue
    const q = k * 4, v = (sky[q] * b0 + sky[q + 1] * b1 + sky[q + 2] * b2 + sky[q + 3] * b3) * M.Ed + irc + (bounce ? bounce[k] : 0) + EbG[k]
    lux[k] = v
    if (v >= 300) o300++
    if (v >= 3000) o3k++
  }
  return {
    lux, grid: { sub: Math.max(1, Math.round(f.mask.h / fine.h)), ...fine }, dim, beam, inside, sunUp, alt: (p.alt * 180) / Math.PI, az: (p.az * 180) / Math.PI, Ed: M.Ed, Eb: M.Eb,
    over300: a ? o300 / a : 0, over3000: a ? o3k / a : 0, sunShare: a ? sunny / a : 0, closed, blindsDown, held: nHeld ? held : null, cells: a,
  }
}

/** Compass azimuth (deg) of each plate edge's face as the daylight studies read it. */
export const faceAzOf = (f: SwFloor, o: Face) => FACE_AZ[o] + faceOffset(f.rot)
