// Interior daylight, ported from Sinnie Choi's Sun & Wind Studio (study.js: daylightFloor, dlSky, enHours, blindState,
// sunBounce, aseHours, aseFloor, daylightTower, aseTower and the plan's 'lux' layer). After Radiance / Daysim / Honeybee
// practice: sky component per sensor from sixteen sight lines to the glass under the CIE overcast sky (daylight factor),
// BRE split-flux internally reflected light, then a climate-based run over the LM-83 occupied hours of the CWEC year with
// each face lit by its own Perez sky, LM-83 blinds, DA / sDA300/50% / UDI 100–3000 / EN 17037 and ASE1000/250h.
// Pure functions: the climate, façade zones, context and settings come in as arguments.
import { faceHours, FULL_YEAR, inPeriod, prepClimate, sunAt, TZ_BY_MONTH, type ClimateHours, type Period } from './climate'
import {
  band, cardinalOf, cieBand, devT, DL_E, DL_R, DL_SUB, DL_WP, FACE_AZ, faceOffset, floorSig, GAP, GLASS_VT, ND_PARTS, obstructionAngles, ORI,
  solidAt, stratParts, vertSkyAbove, zoneAvgT, zoneFor, type ContextBlock, type Face, type FacadeZone, type SwFloor,
} from './plate'
import type { ClimatePayload } from './types'

export interface DaylightOptions {
  /** Sensor stride on the grid (the Studio's step; daylightTower uses 2). */
  step?: number
  /** Day stride of the hourly run (the Studio's hs; daylightTower uses 2). */
  hs?: number
  /** Sensors per mask cell along each axis (the Studio's sub; 1 = the floor's own grid). */
  sub?: number
  /** Leave the zones' devices out (the Studio's noDev). */
  noDev?: boolean
  /** Glass visible transmittance (default GLASS_VT). */
  vt?: number
  /** Daylight target, lux (default 300). */
  target?: number
  /** LM-83 operated blinds (default false: blinds up all year). */
  blinds?: boolean
  /** Context buildings for the obstruction angles (default none). */
  ctx?: ContextBlock[]
}

/** A sensor grid over the floor's mask: cell size h = mask.h / sub, same origin as the mask. */
export interface DlGrid { sub: number; h: number; nx: number; ny: number; x0: number; y0: number }

export interface EnResult { t3: number; m1: number; t5: number; m3: number; t7: number; m5: number; /** EN 17037 level 0–3 (none, minimum, medium, high). */ level: number; hours: number }

export interface DaylightFloor {
  /** Daylight factor per sensor (0–1), on `grid`; 0 off the plate or between strided sensors. */
  df: Float32Array
  /** Daylight autonomy per sensor (share of occupied hours at the target). */
  da: Float32Array
  step: number
  /** Mean DF. */
  mean: number
  /** sDA target/50% with the blinds as set. */
  pctLit: number
  /** sDA if the blinds never came down. */
  pctLitNo: number
  /** Share of occupied hours with the blinds up (null when blinds are not operated or no climate). */
  blindsOpen: number | null
  en: EnResult | null
  temporal: { k: Int32Array; sda: Float32Array; sun: Float32Array; blind: Float32Array | null } | null
  /** Sky component per sensor and face (N, E, S, W): 4 values per grid cell. */
  sc: Float32Array
  /** Effective glass area by face (m² × VT × device). */
  Wg: Record<Face, number>
  daMean: number
  udiS: number
  udiU: number
  udiE: number
  pctOver: number
  /** Monthly daylight share (for dimming the lights). */
  dsf: number[]
  cells: number
  target: number
  hourly: boolean
  hours: number
  /** Internally reflected DF, uniform over the plate. */
  irc: number
  grid: DlGrid
  noDev: boolean
}

export interface AseFloor { hrs: Float32Array; step: number; pctOver: number; cells: number; positions: number; period: Period; thr: number; hourly: boolean; grid: DlGrid }

export interface DaylightRow { i: number; level: number; area: number; mean: number; pctLit: number; pctLitNo: number; blindsOpen: number | null; en: number | null; pctOver: number; da: number; udiS: number; udiU: number; udiE: number; dsf: number[]; target: number; hourly: boolean }
export interface DaylightTower { rows: DaylightRow[]; sda: number; sdaNo: number; blindsOpen: number | null; enMin: number | null; enMed: number | null; enHigh: number | null; over: number; mean: number; da: number; udiS: number; udiU: number; udiE: number; target: number; hourly: boolean; unique: number }
export interface AseTower { rows: { i: number; level: number; area: number; pct: number }[]; pct: number; period: string; unique: number }

export interface LightAtHour {
  /** Light on the 0.8 m work plane, lux, on `grid` (0 off the plate). */
  lux: Float32Array
  grid: DlGrid
  sunUp: boolean
  /** Sun altitude and azimuth (deg, azimuth clockwise from true north). */
  alt: number
  az: number
  /** Month-average diffuse horizontal and direct normal illuminance at that clock hour (lux). */
  Ed: number
  Eb: number
  /** Shares of the floor over 300 and over 3,000 lux, and in direct sun. */
  over300: number
  over3000: number
  sunShare: number
  closed: Record<Face, boolean>
  blindsDown: Face[]
  /** Points whose sun the blinds hold back (null when none). */
  held: Uint8Array | null
  cells: number
}

type Hit = { D: number; o: Face }

/** The ray walk every Studio study shares: from (x, y) along (dx, dy) to where it leaves the plate, or null into the core. */
function walker(f: SwFloor) {
  const m = f.mask, h = m.h, cx0 = f.core.x, cy0 = f.core.y, ch = f.core.half
  return (x: number, y: number, dx: number, dy: number, ds: number, kmax: number): Hit | null => {
    let px = Math.floor((x - m.x0) / h), py = Math.floor((y - m.y0) / h)
    for (let k = 1; k < kmax; k++) {
      x += dx * ds; y += dy * ds
      if (Math.abs(x - cx0) <= ch && Math.abs(y - cy0) <= ch) return null
      const cx = Math.floor((x - m.x0) / h), cy = Math.floor((y - m.y0) / h)
      if (!solidAt(m, cx, cy)) {
        let nx = cx !== px ? Math.sign(cx - px) : 0, ny = cy !== py ? Math.sign(cy - py) : 0
        if ((nx && ny) || (!nx && !ny)) { if (Math.abs(dx) >= Math.abs(dy)) { nx = Math.sign(dx); ny = 0 } else { ny = Math.sign(dy); nx = 0 } }
        return { D: k * ds, o: cardinalOf(nx, ny, f.rot) }
      }
      px = cx; py = cy
    }
    return null
  }
}

const gridOf = (f: SwFloor, sub: number): DlGrid => ({ sub, h: f.mask.h / sub, nx: f.mask.nx * sub, ny: f.mask.ny * sub, x0: f.mask.x0, y0: f.mask.y0 })
/** A grid point lies on the plate, outside the core. */
function inFloor(f: SwFloor, G: DlGrid) {
  const m = f.mask
  return (ix: number, iy: number) => {
    if (!solidAt(m, (ix / G.sub) | 0, (iy / G.sub) | 0)) return false
    const x = G.x0 + (ix + 0.5) * G.h, y = G.y0 + (iy + 0.5) * G.h
    return !(Math.abs(x - f.core.x) <= f.core.half && Math.abs(y - f.core.y) <= f.core.half)
  }
}
const faceIdx: Record<Face, number> = { N: 0, E: 1, S: 2, W: 3 }

/* ---------- sky component and split-flux IRC (daylightFloor, first half) ---------- */
export interface SkyPart {
  G: DlGrid; sc: Float32Array; df: Float32Array; cellList: number[]; Wg: Record<Face, number>; ircDF: number; fo: Record<Face, number>
  Rfw: number; Rcw: number; Rm: number; Atot: number; kI: number; sum: number; n: number; step: number
}
export function skyPart(f: SwFloor, zones: FacadeZone[], o: DaylightOptions, step: number, sub: number): SkyPart {
  const noDev = !!o.noDev, hh = f.h - GAP, tau = (o.vt ?? GLASS_VT) * DL_R.maint, lvl = f.level
  const obs = obstructionAngles(f, o.ctx ?? [])
  const NR = DL_R.rays, dphi = (2 * Math.PI) / NR, dirs: [number, number][] = []
  for (let i = 0; i < NR; i++) { const a = (i + 0.5) * dphi; dirs.push([Math.cos(a), Math.sin(a)]) }
  const NSUB = step > 1 ? 3 : DL_SUB, offR = faceOffset(f.rot), cR = Math.cos(f.rot), sR = Math.sin(f.rot)
  const FAZ = {} as Record<Face, number>
  for (const q of ORI) FAZ[q] = FACE_AZ[q] + offR
  const G = gridOf(f, sub), DS = Math.min(0.5, G.h * 0.5), KMAX = Math.ceil(80 / DS)
  const nc = G.nx * G.ny, sc = new Float32Array(nc * 4), df = new Float32Array(nc), cellList: number[] = []
  const walk = walker(f), inF = inFloor(f, G)
  for (let iy = 0; iy < G.ny; iy += step) for (let ix = 0; ix < G.nx; ix += step) {
    if (!inF(ix, iy)) continue
    const x0 = G.x0 + (ix + 0.5) * G.h, y0 = G.y0 + (iy + 0.5) * G.h, ci = iy * G.nx + ix
    cellList.push(ci)
    for (const [dx, dy] of dirs) {
      const hit = walk(x0, y0, dx, dy, DS, KMAX)
      if (!hit) continue
      const fo = hit.o, z = zoneFor(zones, fo, lvl), B = band(f, z), d = Math.max(0.5, hit.D)
      const sill = Math.max(0, B.sp - DL_WP), head = Math.max(sill + 0.1, B.head - DL_WP)
      const a0 = Math.atan(sill / d), a2 = Math.atan(head / d)
      if (a2 <= a0) continue
      const ob = obs[fo], wx = dx * cR - dy * sR, wy = dx * sR + dy * cR
      const hsa = ((((Math.atan2(wx, wy) * 180) / Math.PI - FAZ[fo]) % 360) + 540) % 360 - 180
      let v = 0
      for (let q = 0; q < NSUB; q++) {
        const lo = a0 + ((a2 - a0) * q) / NSUB, hi = a0 + ((a2 - a0) * (q + 1)) / NSUB, am = (lo + hi) / 2
        const t = noDev ? 1 : devT(z, am, hsa, d * Math.tan(am), sill, head)
        if (t <= 0) continue
        let w = 0
        if (hi > ob) w += cieBand(Math.sin(Math.max(lo, ob)), Math.sin(hi))
        if (lo < ob) w += DL_R.erc * cieBand(Math.sin(lo), Math.sin(Math.min(hi, ob)))
        v += t * w
      }
      sc[ci * 4 + faceIdx[fo]] += v * dphi * tau
    }
  }
  // internally reflected component (BRE split flux), uniform over the plate
  let perim = 0
  const Wg: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }
  for (const e of f.edges) { const z = zoneFor(zones, e.o, lvl), B = band(f, z); perim += e.L; Wg[e.o] += e.L * B.gh * tau * (noDev ? 1 : zoneAvgT(z, B)) }
  const Af = f.area || cellList.length * step * step * G.h * G.h, walls = (perim + 8 * f.core.half) * hh, Atot = 2 * Af + walls
  const Rm = (DL_R.floor * Af + DL_R.ceil * Af + DL_R.wall * walls) / Atot
  const Rfw = (DL_R.floor * Af + (DL_R.wall * walls) / 2) / (Af + walls / 2), Rcw = (DL_R.ceil * Af + (DL_R.wall * walls) / 2) / (Af + walls / 2), kI = 0.85 / (Atot * (1 - Rm))
  const fo = {} as Record<Face, number>
  for (const q of ORI) fo[q] = vertSkyAbove(obs[q])
  let ircDF = 0
  for (const q of ORI) ircDF += kI * Wg[q] * ((0.396 * fo[q] + DL_R.erc * 0.396 * (1 - fo[q])) * Rfw + 0.1 * Rcw)
  let sum = 0, n = 0
  for (const ci of cellList) { const v = sc[ci * 4] + sc[ci * 4 + 1] + sc[ci * 4 + 2] + sc[ci * 4 + 3] + ircDF; df[ci] = v; sum += v; n++ }
  return { G, sc, df, cellList, Wg, ircDF, fo, Rfw, Rcw, Rm, Atot, kI, sum, n, step }
}

/* ---------- the hourly sky (enHours, dlSky) ---------- */
const enCache = new WeakMap<ClimateHours, Uint8Array>()
/** EN 17037's daylight hours: the brightest half of the year by diffuse light (study.js enHours). */
function enHours(P: ClimateHours): Uint8Array {
  const hit = enCache.get(P)
  if (hit) return hit
  const n = P.Ed.length, ord = Array.from({ length: n }, (_, k) => k).sort((a, b) => P.Ed[b] - P.Ed[a]), v = new Uint8Array(n)
  for (let i = 0; i < Math.min(4380, n); i++) v[ord[i]] = 1
  enCache.set(P, v)
  return v
}

interface DlSky { n: number; mon: Int8Array; k: Int32Array; occ: Uint8Array; en: Uint8Array; face: Record<Face, { sky: Float32Array; gnd: Float32Array }> }
const skyCache = new WeakMap<ClimateHours, Map<string, DlSky>>()
/** The occupied and EN hours and each face's Perez sky for one floor rotation, every hs-th day (study.js dlSky). */
function dlSky(P: ClimateHours, rot: number, hs: number): DlSky {
  const off = faceOffset(rot), key = Math.round(off) + ':' + hs
  let m = skyCache.get(P)
  if (!m) { m = new Map(); skyCache.set(P, m) }
  const hit = m.get(key)
  if (hit) return hit
  const EN = enHours(P), OC = new Uint8Array(P.Ed.length)
  for (const k of P.occ) OC[k] = 1
  const idx: number[] = []
  for (let k = 0; k < P.Ed.length; k++) { if (!(OC[k] || EN[k])) continue; if ((P.doy[k] - 1) % hs !== 0) continue; idx.push(k) }
  const n = idx.length
  const out: DlSky = { n, mon: new Int8Array(n), k: Int32Array.from(idx), occ: new Uint8Array(n), en: new Uint8Array(n), face: {} as DlSky['face'] }
  idx.forEach((k, j) => { out.mon[j] = P.mon[k]; out.occ[j] = OC[k]; out.en[j] = EN[k] })
  for (const o of ORI) {
    const F = faceHours(P, FACE_AZ[o] + off), sky = new Float32Array(n), gnd = new Float32Array(n)
    idx.forEach((k, j) => { sky[j] = F.skyL[k]; gnd[j] = F.gndL[k] })
    out.face[o] = { sky, gnd }
  }
  m.set(key, out)
  return out
}

/* ---------- LM-83 blinds and direct sun (study.js blindState) ---------- */
interface BlindOut { closed: Record<Face, Uint8Array>; sun: Float32Array; bitT: Uint8Array; bitE: Uint8Array; BW: number; flux: Float64Array; flux0: Float64Array }
/**
 * In each occupied hour a face's blinds come down when more than 2% of the sensors get direct sun over 1,000 lux through
 * it (pass 1); pass 2 sets a bit per sensor and hour where direct sun alone reaches the target or 3,000 lux, and sums the
 * beam flux entering the room.
 */
function blindState(f: SwFloor, zones: FacadeZone[], P: ClimateHours, sky: DlSky, cells: number[], binDeg: number, G: DlGrid, noDev: boolean, tau: number, target: number, operated: boolean, aC: number): BlindOut {
  const lvl = f.level, off = faceOffset(f.rot), N = sky.n
  const closed = {} as Record<Face, Uint8Array>, cnt = {} as Record<Face, Uint16Array>
  for (const o of ORI) { closed[o] = new Uint8Array(N); cnt[o] = new Uint16Array(N) }
  const any = new Uint16Array(N), sun = new Float32Array(N)
  // hours with measurable beam, grouped by solar azimuth so each sensor walks one ray per bin
  const bins = new Map<number, { az: number; j: number[]; alt: number[]; E: number[] }>()
  for (let j = 0; j < N; j++) {
    const k = sky.k[j]
    if (P.alt[k] <= 0.03) continue
    const E = P.Eb[k] * Math.sin(P.alt[k])
    if (E * tau < 100) continue
    const b = Math.round((P.az[k] * 180) / Math.PI / binDeg)
    let q = bins.get(b)
    if (!q) { q = { az: b * binDeg, j: [], alt: [], E: [] }; bins.set(b, q) }
    q.j.push(j); q.alt.push(P.alt[k]); q.E.push(E)
  }
  const c = Math.cos(-f.rot), sn = Math.sin(-f.rot)
  const B = [...bins.values()].map((b) => { const a = (b.az * Math.PI) / 180, sx = Math.sin(a), sy = Math.cos(a); return { b, dx: sx * c - sy * sn, dy: sx * sn + sy * c } })
  const nC = cells.length, NB = B.length, hitO = new Int8Array(nC * NB).fill(-1), hitD = new Float32Array(nC * NB)
  const walk = walker(f)
  for (let ci2 = 0; ci2 < nC; ci2++) {
    const ci = cells[ci2], x0 = G.x0 + ((ci % G.nx) + 0.5) * G.h, y0 = G.y0 + (((ci / G.nx) | 0) + 0.5) * G.h
    for (let bi = 0; bi < NB; bi++) {
      const { b, dx, dy } = B[bi]
      const hit = walk(x0, y0, dx, dy, 0.5, 200)
      if (!hit) continue
      hitO[ci2 * NB + bi] = faceIdx[hit.o]; hitD[ci2 * NB + bi] = hit.D
      const z = zoneFor(zones, hit.o, lvl), Bd = band(f, z), sp = Bd.sp, gh = Bd.gh, faz = FACE_AZ[hit.o] + off, C = cnt[hit.o]
      for (let q = 0; q < b.j.length; q++) {
        const j = b.j[q]
        if (!sky.occ[j]) continue
        const al = b.alt[q], hz = DL_WP + hit.D * Math.tan(al)
        if (hz < sp || hz > sp + gh) continue
        const pr = noDev ? ND_PARTS : stratParts(z, al, b.az, faz, gh)
        if (hz > sp + gh * (1 - pr.cut)) continue
        if (b.E[q] * tau * pr.dim >= 1000) { C[j]++; any[j]++ }
      }
    }
  }
  const lim = 0.02 * nC
  for (let j = 0; j < N; j++) { for (const o of ORI) closed[o][j] = cnt[o][j] > lim ? 1 : 0; sun[j] = nC ? any[j] / nC : 0 }
  // pass 2: direct sun on each sensor, hour by hour (Honeybee enhanced 2-phase / ClimateStudio)
  const BW = (N + 7) >> 3, bitT = new Uint8Array(nC * BW), bitE = new Uint8Array(nC * BW), flux = new Float64Array(N), flux0 = new Float64Array(N), TB = DL_R.blind
  for (let ci2 = 0; ci2 < nC; ci2++) {
    const bo = ci2 * BW
    for (let bi = 0; bi < NB; bi++) {
      const oi = hitO[ci2 * NB + bi]
      if (oi < 0) continue
      const b = B[bi].b, o = ORI[oi], D = hitD[ci2 * NB + bi], z = zoneFor(zones, o, lvl), Bd = band(f, z), sp = Bd.sp, gh = Bd.gh, faz = FACE_AZ[o] + off, shut = closed[o]
      for (let q = 0; q < b.j.length; q++) {
        const al = b.alt[q], hz = DL_WP + D * Math.tan(al)
        if (hz < sp || hz > sp + gh) continue
        const pr = noDev ? ND_PARTS : stratParts(z, al, b.az, faz, gh)
        if (hz > sp + gh * (1 - pr.cut)) continue
        const Ed = b.E[q] * tau * pr.dim
        if (Ed < 1) continue
        const j = b.j[q]
        flux0[j] += Ed * aC
        if (operated && shut[j]) { flux[j] += Ed * TB * aC; continue }
        flux[j] += Ed * aC
        if (Ed >= target) bitT[bo + (j >> 3)] |= 1 << (j & 7)
        if (Ed >= 3000) bitE[bo + (j >> 3)] |= 1 << (j & 7)
      }
    }
  }
  return { closed, sun, bitT, bitE, BW, flux, flux0 }
}

/* ---------- the sun patch reflected inside (study.js sunBounce) ---------- */
/**
 * The sun patch's light reflects off the floor to the ceiling and back to the work plane (two bounces between parallel
 * planes, point-to-point form factor h² / (π (h² + d²)²)); the rest is spread evenly by split flux.
 */
function sunBounce(f: SwFloor, G: DlGrid, inF: (ix: number, iy: number) => boolean, Eb: Float32Array): Float32Array | null {
  const m = f.mask, H = Math.max(1.6, f.h - GAP - DL_WP), H2 = H * H, A = G.h * G.h, N = G.nx * G.ny, Am = m.h * m.h
  const agg = new Map<string, { x: number; y: number; p: number }>()
  let flux = 0
  for (let k = 0; k < N; k++) {
    const E = Eb[k]
    if (!(E > 0)) continue
    const x = G.x0 + ((k % G.nx) + 0.5) * G.h, y = G.y0 + (((k / G.nx) | 0) + 0.5) * G.h, key = Math.floor(x) + '|' + Math.floor(y)
    let s = agg.get(key)
    if (!s) { s = { x: 0, y: 0, p: 0 }; agg.set(key, s) }
    s.x += x * E * A; s.y += y * E * A; s.p += E * A; flux += E * A
  }
  if (!flux) return null
  const src = [...agg.values()].map((s) => ({ x: s.x / s.p, y: s.y / s.p, p: s.p * DL_R.floor }))
  const ceil: number[] = []
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!m.cells[iy * m.nx + ix]) continue
    const x = m.x0 + (ix + 0.5) * m.h, y = m.y0 + (iy + 0.5) * m.h
    if (Math.abs(x - f.core.x) <= f.core.half && Math.abs(y - f.core.y) <= f.core.half) continue
    let E = 0
    for (const s of src) { const d2 = (x - s.x) ** 2 + (y - s.y) ** 2; E += (s.p * H2) / (Math.PI * (H2 + d2) * (H2 + d2)) }
    ceil.push(x, y, E * DL_R.ceil * Am) // exitance × cell area (the Studio's 1 m cells)
  }
  const out = new Float32Array(N), cs = 0.5, cnx = Math.ceil((G.nx * G.h) / cs) + 1, cny = Math.ceil((G.ny * G.h) / cs) + 1, CE = new Float32Array(cnx * cny)
  for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    const x = G.x0 + i * cs, y = G.y0 + j * cs
    let E = 0
    for (let q = 0; q < ceil.length; q += 3) { const d2 = (x - ceil[q]) ** 2 + (y - ceil[q + 1]) ** 2; E += (ceil[q + 2] * H2) / (Math.PI * (H2 + d2) * (H2 + d2)) }
    CE[j * cnx + i] = E
  }
  let sum = 0, n = 0
  for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) {
    if (!inF(ix, iy)) continue
    const gx = ((ix + 0.5) * G.h) / cs, gy = ((iy + 0.5) * G.h) / cs, i0 = Math.min(cnx - 2, Math.floor(gx)), j0 = Math.min(cny - 2, Math.floor(gy)), tx = gx - i0, ty = gy - j0
    const E = CE[j0 * cnx + i0] * (1 - tx) * (1 - ty) + CE[j0 * cnx + i0 + 1] * tx * (1 - ty) + CE[(j0 + 1) * cnx + i0] * (1 - tx) * ty + CE[(j0 + 1) * cnx + i0 + 1] * tx * ty
    out[iy * G.nx + ix] = E; sum += E; n++
  }
  // the bounces after these two, spread evenly (BRE split flux on the whole plate)
  let perim = 0
  for (const e of f.edges) perim += e.L
  const hh = f.h - GAP, Af = f.area || n * A, walls = (perim + 8 * f.core.half) * hh, Atot = 2 * Af + walls
  const Rm = (DL_R.floor * Af + DL_R.ceil * Af + DL_R.wall * walls) / Atot
  const rest = Math.max(0, (flux * DL_R.floor) / (Atot * (1 - Rm)) - (n ? sum / n : 0))
  for (let k = 0; k < N; k++) if (out[k] > 0) out[k] += rest
  return out
}

/* ---------- one floor (study.js daylightFloor) ---------- */
/** Climate-based daylight of one floor; without a climate, DF-derived estimates as the Studio falls back to. */
export function daylightFloor(f: SwFloor, zones: FacadeZone[], C: ClimatePayload | null, opts: DaylightOptions = {}): DaylightFloor {
  const step = opts.step ?? 1, hs = opts.hs ?? 1, sub = opts.sub ?? 1, noDev = !!opts.noDev, target = opts.target ?? 300, opB = !!opts.blinds
  const S = skyPart(f, zones, opts, step, sub)
  const { G, sc, df, cellList, Wg, ircDF, fo, Rfw, Rcw, Rm, Atot, kI, n } = S
  const nc = G.nx * G.ny, da = new Float32Array(nc), dsfM = new Float64Array(12), hM = new Float64Array(12)
  let hourly = false, lit = 0, lit0 = 0, daSum = 0, uS = 0, uU = 0, uE = 0, nOccT = 0
  let blindsOpen: number | null = null, en: EnResult | null = null, temporal: DaylightFloor['temporal'] = null
  if (C) {
    hourly = true
    const P = prepClimate(C), sky = dlSky(P, f.rot, hs), N = sky.n, OC = sky.occ, ENh = sky.en
    const BL = blindState(f, zones, P, sky, cellList, step > 1 ? 6 : 3, G, noDev, opts.vt ?? GLASS_VT, target, opB, (step * G.h) ** 2)
    const TB = DL_R.blind, BW = BL.BW, BLt = BL.bitT, BLe = BL.bitE, kSun = (DL_R.maint * Rfw) / (Atot * (1 - Rm))
    if (!opB) for (const o of ORI) BL.closed[o].fill(0)
    const bf = {} as Record<Face, Float32Array>
    for (const o of ORI) { const cl = BL.closed[o], a = new Float32Array(N); for (let j = 0; j < N; j++) a[j] = cl[j] ? TB : 1; bf[o] = a }
    let wgT = 0
    for (const o of ORI) wgT += Wg[o]
    const irc0 = new Float32Array(N), ircB = new Float32Array(N), shut = new Float32Array(N)
    for (let j = 0; j < N; j++) {
      let v0 = 0, vB = 0, sh = 0
      for (const o of ORI) {
        const q = sky.face[o], x = Wg[o] * ((q.sky[j] * fo[o] + DL_R.erc * q.sky[j] * (1 - fo[o])) * Rfw + q.gnd[j] * Rcw)
        v0 += x; vB += x * bf[o][j]
        if (BL.closed[o][j]) sh += Wg[o]
      }
      irc0[j] = kI * v0 + kSun * BL.flux0[j]; ircB[j] = kI * vB + kSun * BL.flux[j]; shut[j] = wgT ? sh / wgT : 0
      if (OC[j]) { nOccT++; hM[sky.mon[j]]++ }
    }
    // sky light through each face scales with that face's Perez sky against the CIE overcast vertical/horizontal ratio 0.396
    const kN = new Float32Array(N), kE = new Float32Array(N), kS = new Float32Array(N), kW = new Float32Array(N)
    for (let j = 0; j < N; j++) { kN[j] = sky.face.N.sky[j] / 0.396; kE[j] = sky.face.E.sky[j] / 0.396; kS[j] = sky.face.S.sky[j] / 0.396; kW[j] = sky.face.W.sky[j] / 0.396 }
    const bN = bf.N, bE = bf.E, bS = bf.S, bW = bf.W
    const a300 = new Uint16Array(N), e1 = new Uint16Array(N), e3 = new Uint16Array(N), e5 = new Uint16Array(N), e7 = new Uint16Array(N)
    const cellDsf = new Float64Array(12), nO = Math.max(1, nOccT)
    for (let cix = 0; cix < cellList.length; cix++) {
      const ci = cellList[cix], bo = cix * BW, a = sc[ci * 4], b = sc[ci * 4 + 1], c = sc[ci * 4 + 2], d = sc[ci * 4 + 3]
      let ok = 0, ok0 = 0, s = 0, u = 0, e = 0
      cellDsf.fill(0)
      for (let j = 0; j < N; j++) {
        const S0 = a * kN[j] + b * kE[j] + c * kS[j] + d * kW[j], mk = 1 << (j & 7), dT = BLt[bo + (j >> 3)] & mk, dE = BLe[bo + (j >> 3)] & mk
        if (ENh[j]) {
          const E0 = S0 + irc0[j], dt = (th: number) => E0 >= th || !!dE || (!!dT && target >= th)
          if (dt(100)) { e1[j]++; if (dt(300)) { e3[j]++; if (dt(500)) { e5[j]++; if (dt(750)) e7[j]++ } } }
        }
        if (!OC[j]) continue
        if (S0 + irc0[j] >= target || dT) ok0++
        const E = a * kN[j] * bN[j] + b * kE[j] * bE[j] + c * kS[j] * bS[j] + d * kW[j] * bW[j] + ircB[j]
        if (E >= target || dT) { ok++; a300[j]++; cellDsf[sky.mon[j]] += 1 } else cellDsf[sky.mon[j]] += E / target
        if (E > DL_R.udiHi || dE) e++
        else if (E < DL_R.udiLo && !dT) s++
        else u++
      }
      const daC = ok / nO
      da[ci] = daC; daSum += daC
      if (daC >= 0.5) lit++
      if (ok0 / nO >= 0.5) lit0++
      uS += s / nO; uU += u / nO; uE += e / nO
      for (let q = 0; q < 12; q++) dsfM[q] += cellDsf[q]
    }
    for (let q = 0; q < 12; q++) dsfM[q] = hM[q] && n ? dsfM[q] / (hM[q] * n) : 0
    // EN 17037: an hour passes a level when the target covers half the floor and the minimum 95%; the floor meets it in half the daylight hours (blinds up)
    const nn = Math.max(1, n)
    let nE = 0
    const H = { t3: 0, m1: 0, t5: 0, m3: 0, t7: 0, m5: 0 }
    for (let j = 0; j < N; j++) {
      if (!ENh[j]) continue
      nE++
      if (e3[j] / nn >= 0.5) H.t3++
      if (e1[j] / nn >= 0.95) H.m1++
      if (e5[j] / nn >= 0.5) H.t5++
      if (e3[j] / nn >= 0.95) H.m3++
      if (e7[j] / nn >= 0.5) H.t7++
      if (e5[j] / nn >= 0.95) H.m5++
    }
    for (const q of Object.keys(H) as (keyof typeof H)[]) H[q] = nE ? H[q] / nE : 0
    const lv = (t: number, mn: number) => t >= 0.5 && mn >= 0.5
    en = { ...H, level: lv(H.t7, H.m5) ? 3 : lv(H.t5, H.m3) ? 2 : lv(H.t3, H.m1) ? 1 : 0, hours: nE * hs }
    // the year hour by hour, for the temporal maps
    const tk: number[] = [], tS: number[] = [], tU: number[] = [], tB: number[] = []
    let bo = 0
    for (let j = 0; j < N; j++) { if (!OC[j]) continue; tk.push(sky.k[j]); tS.push(a300[j] / nn); tU.push(BL.sun[j]); tB.push(shut[j]); bo += 1 - shut[j] }
    blindsOpen = opB ? (nOccT ? bo / nOccT : 1) : null
    temporal = { k: Int32Array.from(tk), sda: Float32Array.from(tS), sun: Float32Array.from(tU), blind: opB ? Float32Array.from(tB) : null }
  } else {
    const t = target / DL_E
    for (const ci of cellList) {
      const v = df[ci], daC = Math.max(0, Math.min(1, 1 - (0.5 * t) / Math.max(1e-6, v)))
      da[ci] = daC; daSum += daC
      if (v >= t) lit++
      if (v < DL_R.udiLo / DL_E) uS++
      else if (v > DL_R.udiHi / DL_E) uE++
      else uU++
    }
    lit0 = lit
    for (let q = 0; q < 12; q++) dsfM[q] = n ? daSum / n : 0
  }
  return {
    df, da, step, mean: n ? S.sum / n : 0, pctLit: n ? lit / n : 0, pctLitNo: n ? lit0 / n : 0, blindsOpen, en, temporal, sc, Wg,
    daMean: n ? daSum / n : 0, udiS: n ? uS / n : 0, udiU: n ? uU / n : 0, udiE: n ? uE / n : 0, pctOver: n ? uE / n : 0, dsf: Array.from(dsfM),
    cells: n, target, hourly, hours: hourly ? nOccT * hs : 0, irc: ircDF, grid: G, noDev,
  }
}

/* ---------- annual sunlight exposure (study.js aseHours, aseFloor) ---------- */
interface AseBins { bins: { az: number; alt: Float32Array; E: Float32Array }[]; occN: number; hours: number }
const aseCache = new WeakMap<ClimateHours, Map<string, AseBins>>()
/** Occupied hours of the period with direct sun over 1,000 lux, in 2° azimuth bins. */
function aseHours(P: ClimateHours, PI: Period): AseBins {
  const key = PI.full ? 'full' : PI.d0 + ':' + PI.d1
  let m = aseCache.get(P)
  if (!m) { m = new Map(); aseCache.set(P, m) }
  const hit = m.get(key)
  if (hit) return hit
  const bins = new Map<number, { az: number; alt: number[]; E: number[] }>()
  let occN = 0
  for (const k of P.occ) {
    if (!inPeriod(PI, P.doy[k])) continue
    occN++
    if (P.alt[k] <= 0.03) continue
    const E = P.Eb[k] * Math.sin(P.alt[k])
    if (E < 1000) continue
    const b = Math.round((P.az[k] * 90) / Math.PI)
    let o = bins.get(b)
    if (!o) { o = { az: b * 2, alt: [], E: [] }; bins.set(b, o) }
    o.alt.push(P.alt[k]); o.E.push(E)
  }
  const v: AseBins = { bins: [...bins.values()].map((o) => ({ az: o.az, alt: Float32Array.from(o.alt), E: Float32Array.from(o.E) })), occN, hours: [...bins.values()].reduce((s, o) => s + o.alt.length, 0) }
  m.set(key, v)
  return v
}

/** IES LM-83 ASE1000/250h of one floor: hours of direct sun over 1,000 lux per sensor (`step` 2 = the Studio's coarse). */
export function aseFloor(f: SwFloor, zones: FacadeZone[], C: ClimatePayload | null, period: Period = FULL_YEAR, opts: DaylightOptions = {}): AseFloor {
  const sub = opts.sub ?? 1, step = opts.step ?? 1, noDev = !!opts.noDev, tau = opts.vt ?? GLASS_VT, off = faceOffset(f.rot), lvl = f.level
  const G = gridOf(f, sub), DS = Math.min(0.5, G.h * 0.5), KMAX = Math.ceil(100 / DS), hrs = new Float32Array(G.nx * G.ny)
  if (!C) return { hrs, step, pctOver: 0, cells: 0, positions: 0, period, thr: 250, hourly: false, grid: G }
  const AH = aseHours(prepClimate(C), period), thr = 250 * (period.full ? 1 : AH.occN / 3650)
  const c = Math.cos(-f.rot), s = Math.sin(-f.rot)
  const B = AH.bins.map((b) => { const a = (b.az * Math.PI) / 180, sx = Math.sin(a), sy = Math.cos(a); return { b, dx: sx * c - sy * s, dy: sx * s + sy * c } })
  const walk = walker(f), inF = inFloor(f, G)
  let n = 0, over = 0
  for (let iy = 0; iy < G.ny; iy += step) for (let ix = 0; ix < G.nx; ix += step) {
    if (!inF(ix, iy)) continue
    const x0 = G.x0 + (ix + 0.5) * G.h, y0 = G.y0 + (iy + 0.5) * G.h
    n++
    let Hh = 0
    for (const { b, dx, dy } of B) {
      const hit = walk(x0, y0, dx, dy, DS, KMAX)
      if (!hit) continue
      const z = zoneFor(zones, hit.o, lvl), Bd = band(f, z), sp = Bd.sp, gh = Bd.gh, faz = FACE_AZ[hit.o] + off
      for (let j = 0; j < b.alt.length; j++) {
        const al = b.alt[j], hz = DL_WP + hit.D * Math.tan(al)
        if (hz < sp || hz > sp + gh) continue
        if (b.E[j] * tau < 1000) continue
        const pr = noDev ? ND_PARTS : stratParts(z, al, b.az, faz, gh)
        if (hz > sp + gh * (1 - pr.cut)) continue
        if (b.E[j] * tau * pr.dim >= 1000) Hh++
      }
    }
    hrs[iy * G.nx + ix] = Hh
    if (Hh >= thr) over++
  }
  return { hrs, step, pctOver: n ? over / n : 0, cells: n, positions: AH.hours, period, thr, hourly: true, grid: G }
}

/* ---------- tower summaries (study.js daylightTower, aseTower) ---------- */
/** Signature of a floor for the memo: plate, zones, obstruction (as the Studio's floorSig) and the options. */
function sigOf(f: SwFloor, zones: FacadeZone[], opts: DaylightOptions, extra: string): string {
  const obs = obstructionAngles(f, opts.ctx ?? [])
  return floorSig(f, zones, JSON.stringify([f.mask.h, f.area | 0, ORI.map((o) => Math.round(obs[o] * 90)), extra]))
}

/** Area-weighted daylight of a tower; floors with the same signature compute once. Defaults step 2, hs 2 as the Studio. */
export function daylightTower(floors: SwFloor[], zones: FacadeZone[], C: ClimatePayload | null, opts: DaylightOptions = {}): DaylightTower {
  const o: DaylightOptions = { step: 2, hs: 2, ...opts }, memo = new Map<string, DaylightFloor>()
  const rows: DaylightRow[] = floors.map((f) => {
    const sig = sigOf(f, zones, o, '')
    let r = memo.get(sig)
    if (!r) { r = daylightFloor(f, zones, C, o); memo.set(sig, r) }
    return { i: f.i, level: f.level, area: f.area, mean: r.mean, pctLit: r.pctLit, pctLitNo: r.pctLitNo, blindsOpen: r.blindsOpen, en: r.en ? r.en.level : null, pctOver: r.pctOver, da: r.daMean, udiS: r.udiS, udiU: r.udiU, udiE: r.udiE, dsf: r.dsf, target: r.target, hourly: r.hourly }
  })
  const A = rows.reduce((s, r) => s + r.area, 0), aw = (g: (r: DaylightRow) => number) => rows.reduce((s, r) => s + g(r) * r.area, 0) / Math.max(1, A)
  const hasEN = rows.some((r) => r.en != null)
  return {
    rows, sda: aw((r) => r.pctLit), sdaNo: aw((r) => r.pctLitNo), blindsOpen: rows.some((r) => r.blindsOpen != null) ? aw((r) => r.blindsOpen ?? 1) : null,
    enMin: hasEN ? aw((r) => ((r.en ?? 0) >= 1 ? 1 : 0)) : null, enMed: hasEN ? aw((r) => ((r.en ?? 0) >= 2 ? 1 : 0)) : null, enHigh: hasEN ? aw((r) => ((r.en ?? 0) >= 3 ? 1 : 0)) : null,
    over: aw((r) => r.pctOver), mean: aw((r) => r.mean), da: aw((r) => r.da), udiS: aw((r) => r.udiS), udiU: aw((r) => r.udiU), udiE: aw((r) => r.udiE),
    target: o.target ?? 300, hourly: rows.length ? rows[0].hourly : false, unique: memo.size,
  }
}

/** Area-weighted ASE of a tower (step 2, as the Studio's coarse run); synchronous, with an optional progress callback. */
export function aseTower(floors: SwFloor[], zones: FacadeZone[], C: ClimatePayload | null, period: Period = FULL_YEAR, opts: DaylightOptions & { onProgress?: (msg: string, done: number, total: number) => void } = {}): AseTower {
  const o: DaylightOptions = { step: 2, ...opts }, memo = new Map<string, AseFloor>()
  const rows = floors.map((f, k) => {
    const sig = sigOf(f, zones, o, period.d0 + ':' + period.d1)
    let r = memo.get(sig)
    if (!r) { opts.onProgress?.(`Annual sun · L${f.level} of ${floors.length}`, k, floors.length); r = aseFloor(f, zones, C, period, o); memo.set(sig, r) }
    return { i: f.i, level: f.level, area: f.area, pct: r.pctOver }
  })
  const A = rows.reduce((s, r) => s + r.area, 0)
  return { rows, pct: rows.reduce((s, r) => s + r.pct * r.area, 0) / Math.max(1, A), period: period.label, unique: memo.size }
}

/* ---------- light at one hour (renderPlan 'lux' layer, monthHour) ---------- */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const AA2 = [-0.25, 0.25]

/**
 * Light on the work plane at one clock hour on a typical day of the month of `doy` (the Studio's month-average sky at that
 * hour): sky part from the DF grid times the diffuse sky, the sun patch through each face's glass band and device, LM-83
 * blinds at that hour, and the sun patch reflected off floor and ceiling.
 */
export function lightAtHour(f: SwFloor, zones: FacadeZone[], C: ClimatePayload | null, at: { doy: number; hour: number }, opts: DaylightOptions & { latLon?: [number, number] } = {}): LightAtHour {
  const sub = opts.sub ?? 1, vt = opts.vt ?? GLASS_VT, blinds = !!opts.blinds, noDev = !!opts.noDev, lvl = f.level
  const S = skyPart(f, zones, opts, 1, sub), G = S.G, N = G.nx * G.ny, lux = new Float32Array(N), inF = inFloor(f, G)
  // monthHour: month-average diffuse and beam at that clock hour
  const days = C?.days ?? MONTH_DAYS
  let m = 11
  { let acc = 0; for (let q = 0; q < 12; q++) { acc += days[q]; if (at.doy <= acc) { m = q; break } } }
  const tz = TZ_BY_MONTH[m] ?? -8, lat = C?.lat ?? opts.latLon?.[0] ?? 49.2, lon = C?.lon ?? opts.latLon?.[1] ?? -123.1
  const p = sunAt((lat * Math.PI) / 180, lon, at.doy, at.hour, tz), azDeg = (p.az * 180) / Math.PI
  let Ed = 0, Eb = 0
  if (C) {
    const P = prepClimate(C), hs = (((Math.floor(at.hour) - (tz + 8)) % 24) + 24) % 24
    let n = 0
    for (let k = hs; k < 8760; k += 24) { if (P.mon[k] !== m) continue; Ed += P.Ed[k]; Eb += P.Eb[k]; n++ }
    n = n || 1; Ed /= n; Eb /= n
  }
  const sunUp = p.alt > 0.02, beam = Eb * Math.max(0, Math.sin(p.alt)) * vt
  // the sun patch: each point traced toward the sun to the façade, through the glass band and the zone's device (stratParts, as planStudy)
  const dim = new Float32Array(N), face = new Int8Array(N).fill(-1)
  let a = 0
  if (sunUp && Eb > 0) {
    const c = Math.cos(-f.rot), s = Math.sin(-f.rot), wx = Math.sin(p.az), wy = Math.cos(p.az), sx = wx * c - wy * s, sy = wx * s + wy * c
    const walk = walker(f), ds = Math.min(0.125, G.h * 0.5), km = Math.ceil(100 / ds), tanA = Math.tan(p.alt)
    for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) {
      if (!inF(ix, iy)) continue
      a++
      const k = iy * G.nx + ix, cx = G.x0 + (ix + 0.5) * G.h, cy = G.y0 + (iy + 0.5) * G.h
      let acc = 0, fo = -1
      for (const oy of AA2) for (const ox of AA2) {
        const ex = walk(cx + ox * G.h, cy + oy * G.h, sx, sy, ds, km)
        if (!ex) continue
        const z = zoneFor(zones, ex.o, lvl), B = band(f, z), hz = DL_WP + ex.D * tanA
        if (hz < B.sp || hz > B.sp + B.gh) continue
        const pr = noDev ? ND_PARTS : stratParts(z, p.alt, azDeg, FACE_AZ[ex.o] + faceOffset(f.rot), B.gh)
        if (hz > B.sp + B.gh * (1 - pr.cut)) continue
        acc += pr.dim
        if (fo < 0) fo = faceIdx[ex.o]
      }
      const t = acc / 4
      if (t > 0.02) { dim[k] = t; face[k] = fo }
    }
  } else for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) if (inF(ix, iy)) a++
  // LM-83 blinds at this hour: a face drops its blinds when it lets direct sun over 1,000 lux onto more than 2% of the floor
  let sunny = 0
  const byF = [0, 0, 0, 0]
  for (let k = 0; k < N; k++) if (face[k] >= 0 && beam * dim[k] >= 1000) { sunny++; byF[face[k]]++ }
  const closed = {} as Record<Face, boolean>, blindsDown: Face[] = []
  ORI.forEach((o, i) => { closed[o] = blinds && byF[i] > 0.02 * a; if (closed[o]) blindsDown.push(o) })
  const bfo = ORI.map((o) => (closed[o] ? DL_R.blind : 1))
  let wg = 0, wgB = 0
  ORI.forEach((o, i) => { wg += S.Wg[o]; wgB += S.Wg[o] * bfo[i] })
  const ircF = wg ? wgB / wg : 1
  const EbG = new Float32Array(N)
  for (let k = 0; k < N; k++) if (face[k] >= 0 && !closed[ORI[face[k]]]) EbG[k] = beam * dim[k]
  const bounce = sunBounce(f, G, inF, EbG)
  let o300 = 0, o3k = 0
  for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) {
    if (!inF(ix, iy)) continue
    const k = iy * G.nx + ix, q = k * 4
    const sky = S.sc[q] * bfo[0] + S.sc[q + 1] * bfo[1] + S.sc[q + 2] * bfo[2] + S.sc[q + 3] * bfo[3]
    const v = (bounce ? bounce[k] : 0) + (sky + S.ircDF * ircF) * Ed + EbG[k]
    lux[k] = v
    if (v >= 300) o300++
    if (v >= 3000) o3k++
  }
  const held = new Uint8Array(N)
  let nHeld = 0
  for (let k = 0; k < N; k++) if (face[k] >= 0 && closed[ORI[face[k]]] && beam * dim[k] >= 1000) { held[k] = 1; nHeld++ }
  return {
    lux, grid: G, sunUp, alt: (p.alt * 180) / Math.PI, az: azDeg, Ed, Eb, over300: a ? o300 / a : 0, over3000: a ? o3k / a : 0, sunShare: a ? sunny / a : 0,
    closed, blindsDown, held: nHeld ? held : null, cells: a,
  }
}
