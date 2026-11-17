// Natural-ventilation potential as Sinnie Choi's Sun & Wind Studio computes it: a TypeScript port of study.js ventStudy,
// ventFlow, ventOpenings, cpFace, siteWind, ventFloorQuick and ventTowerQuick at her commit c24addb (16 Nov 2026), on
// the physics of daylightSW.ts (her physics.js prep: hourly CWEC2020 weather, the ASHRAE 55 prevailing mean outdoor
// temperature) and her monthly wind rose (windComfort.ts roseFor).
//
// Hour by hour over the period (her note: Ladybug's natural-ventilation potential and the CBE adaptive model, with the
// airflow of NIST CONTAM / EnergyPlus AirflowNetwork reduced to one zone per floor): a floor's windows open when the air
// the room would reach (outdoor + ΔT) sits in the comfort band (ASHRAE 55 adaptive on the prevailing mean outdoor
// temperature, else a fixed band), the gust at that floor's height (1.8 × the station wind carried to the site and the
// height) stays under the limit, and it is not raining over 1 mm/h; the airflow then balances wind pressure (Cp by wind
// angle on each face) and stack pressure through every operable opening (cross, single-sided with BS 5925 turbulence, or
// a stack). The quick check reads ASHRAE 62.1 as her app does: openable area ≥ 4% of the floor, every point within 8 m.
//
// Checked against her own code: tools/sunwind-ventilation-fixtures.cjs records src/engine/ventilation.fixtures.json and
// ventilationSW.test.ts reproduces every case.
import { band, cardinalOf, edgesOf, FACE_AZ, faceOffset, GAP, inPeriod, ORI, periodInfo as dlPeriodInfo, STRATS, zoneFor, type DlFloor, type DlPeriod, type Ori, type SkyPrep, type Zone } from './daylightSW'
import { periodInfo as windPeriodInfo, roseFor } from './windComfort'

/** Her wind profile exponent at the urban edge (study.js ALPHA). */
const ALPHA = 0.25
export type VentMode = 'cross' | 'single' | 'stack'
/** Her ventilation settings (study.js SW.vent): mode, comfort band, gust limit (m/s), openable share of the glass, indoor rise ΔT (K). */
export interface VentSettings { mode: VentMode; band: 'fixed' | 'adaptive'; tmin: number; tmax: number; umax: number; open: number; dT: number }
export const DEFAULT_VENT: VentSettings = { mode: 'cross', band: 'fixed', tmin: 12, tmax: 24, umax: 8, open: 0.1, dT: 3 }
/** Her outdoor-air rate (core.js S.energy.vent, L/s per m²). */
export const DEFAULT_VENT_RATE = 0.35

/** Wind pressure coefficient of a tall building's face by wind angle (study.js cpFace): +0.7 windward, −0.6 side, −0.3 leeward. */
export const cpFace = (windFrom: number, faceAz: number) => { const t = ((((((windFrom - faceAz) % 360) + 540) % 360) - 180) * Math.PI) / 180, c = Math.cos(t); return -0.2 + 0.5 * c + 0.4 * (2 * c * c - 1) }
/** Station wind (open airfield, 10 m) to the site at height z: ASHRAE Fundamentals boundary layers as EnergyPlus does (study.js siteWind). */
export const siteWind = (ws: number, z: number) => ws * Math.pow(270 / 10, 0.14) * Math.pow(Math.max(10, z) / 400, ALPHA)

export interface Opening { o: Ori; A: number; zb: number; gh: number; az: number }
/** A floor's operable openings by face: free area, sill height, glass height, compass azimuth (study.js ventOpenings). */
export function ventOpenings(f: DlFloor, zones: Zone[], open: number): Opening[] {
  const lvl = f.i + 1, op = open || 0.1, off = faceOffset(f.rot); const by: Partial<Record<Ori, Opening>> = {}
  for (const e of edgesOf(f)) {
    const z = zoneFor(zones, e.o, lvl); if (!z.operable) continue; const B = band(f, e.o, z)
    const q = by[e.o] || (by[e.o] = { o: e.o, A: 0, zb: f.z + B.sp, gh: B.gh, az: FACE_AZ[e.o] + off }); q.A += e.L * B.gh * op
  }
  return Object.values(by).filter((q): q is Opening => !!q && q.A > 0)
}
/** Airflow (m³/s) through a floor's openings for one hour: wind and stack pressures balanced by bisection (study.js ventFlow). */
export function ventFlow(ops: Opening[], U: number, wdir: number, Te: number, dT: number, mode: VentMode, zMid: number, hh: number): number {
  if (!ops.length) return 0; const rho = (1.2041 * 293.15) / (Te + 273.15), Ti = Te + dT, rhoI = (rho * (Te + 273.15)) / (Ti + 273.15), Cd = 0.6, g = 9.81
  const items = (fs: Opening[]) => { const it: { A: number; p: number }[] = []; for (const q of fs) { const cp = cpFace(wdir, q.az), pw = 0.5 * rho * U * U * cp; for (const fz of [0.25, 0.75]) { const z = q.zb + q.gh * fz; it.push({ A: q.A / 2, p: pw - (rho - rhoI) * g * (z - zMid) }) } } return it }
  const balance = (it: { A: number; p: number }[]) => {
    if (it.length < 2) return 0; let lo = Infinity, hi = -Infinity; for (const x of it) { lo = Math.min(lo, x.p); hi = Math.max(hi, x.p) } if (hi - lo < 1e-6) return 0
    const net = (P: number) => { let m = 0; for (const x of it) { const d = x.p - P; m += Cd * x.A * Math.sign(d) * Math.sqrt(2 * (d > 0 ? rho : rhoI) * Math.abs(d)) } return m }
    for (let k = 0; k < 32; k++) { const mid = (lo + hi) / 2; if (net(mid) > 0) lo = mid; else hi = mid }
    const P = (lo + hi) / 2; let q = 0; for (const x of it) { const d = x.p - P; if (d > 0) q += Cd * x.A * Math.sqrt((2 * d) / rho) } return q
  }
  const turb = (fs: Opening[]) => 0.025 * fs.reduce((s, q) => s + q.A, 0) * U // BS 5925 single-sided wind turbulence
  if (mode === 'single') return ops.reduce((s, q) => { const b = balance(items([q])), t = turb([q]); return s + Math.sqrt(b * b + t * t) }, 0)
  const it = items(ops); if (mode === 'stack') { const A = ops.reduce((s, q) => s + q.A, 0) * 0.5; it.push({ A, p: 0.5 * rho * U * U * -0.5 - (rho - rhoI) * g * (3 * hh) }) }
  const b = balance(it); if (ops.length === 1) { const t = turb(ops); return Math.sqrt(b * b + t * t) } return b
}

/** Monthly climate beside the hourly year: mean temperature and month names (her CLIMATE.temp / months). */
export interface MonthlyClimate { temp: number[]; months: string[]; days: number[] }
export interface VentMonth { m: string; days: number; T: number; fT: number; hours: number; vent: number; comfort: number | null; tmin: number; tmax: number }
export interface VentFloorRow { i: number; share: number; ofComfort: number; achMed: number; fresh: number }
export interface VentResult {
  rows: VentMonth[]
  /** Sum over the period's hours of the share of operable floors with windows open; hours in the period. */
  total: number; hoursTot: number
  /** Open hours against the hours whose outdoor air is comfortable. */
  fW: number
  Um: number; U10: number; operable: number; nF: number
  /** Highest level (1-based) whose windows are not blocked by gusts in 20% or more of the comfortable hours; all: every floor. */
  limit: number; all: boolean
  Utop: number; qTop: number; adaptive: boolean
  floors: VentFloorRow[]
  /** Per hour of the year: share of operable floors open (−1 outside the period). */
  grid: Float32Array
  achMed: number; fresh: number; rainH: number; comfortH: number; reqACH: number
}
/** Natural-ventilation potential of the floors over a period, hour by hour (study.js ventStudy). */
export function ventStudy(P: SkyPrep, C: MonthlyClimate, floors: DlFloor[], zones: Zone[], V: VentSettings, period: DlPeriod, height: number, ventRate = DEFAULT_VENT_RATE): VentResult {
  const PI = dlPeriodInfo(period, C.days), WPI = windPeriodInfo(period), rose = roseFor(WPI); const U10m = rose.reduce((s, r) => s + r.f * r.s, 0)
  const adaptive = V.band === 'adaptive'; const Utop = U10m * Math.pow(height / 10, ALPHA)
  interface Op { f: DlFloor; ops: Opening[]; zm: number; hh: number; area: number; umax: number; vol: number; open: number; comfortH: number; windBlocked: number; achs: number[]; fresh: number }
  const op: Op[] = []
  for (const f of floors) {
    const ops = ventOpenings(f, zones, V.open); if (!ops.length) continue
    let boost = 1; for (const o of ORI) { const z = zoneFor(zones, o, f.i + 1); if (z.operable) boost = Math.max(boost, STRATS[z.strat].ventBoost || 1) }
    const hh = f.h - GAP; const area = Math.max(1, f.area); op.push({ f, ops, zm: f.z + f.h / 2, hh, area, umax: V.umax * boost, vol: area * hh, open: 0, comfortH: 0, windBlocked: 0, achs: [], fresh: 0 })
  }
  const reqACH = (ventRate || 0.35) * 3.6 // per metre of storey height: L/s per m² → air changes
  const rows = C.months.map((m, i) => ({ m, days: WPI.monthDays[i], T: C.temp[i], fT: 0, hours: 0, vent: 0, comfort: null as number | null, tmin: V.tmin, tmax: V.tmax, cSum: 0, cN: 0 }))
  const grid = new Float32Array(8760).fill(-1); let total = 0, hoursTot = 0, rainH = 0
  const dT = V.dT || 3
  for (let k = 0; k < 8760; k++) {
    if (!inPeriod(PI, P.doy[k])) continue; const m = P.mon[k], R = rows[m]; R.hours++; hoursTot++
    const Te = P.T[k]; let lo = V.tmin, hi = V.tmax; const tp = P.tpma[k]; if (adaptive && tp >= 10 && tp <= 33.5) { const tc = 0.31 * tp + 17.8; lo = tc - 3.5; hi = tc + 3.5; R.cSum += tc; R.cN++ }
    const Ti = Te + dT; const comfy = Ti >= lo && Ti <= hi; if (comfy) R.fT++; const wet = P.rain[k] > 1; if (comfy && wet) rainH++
    if (!op.length) continue; let n = 0
    if (comfy && !wet) {
      const ws = P.ws[k], wd = P.wd[k]
      for (const q of op) {
        q.comfortH++; const U = siteWind(ws, q.zm); if (1.8 * U > q.umax) { q.windBlocked++; continue } q.open++; n++
        const Q = ventFlow(q.ops, U, wd, Te, dT, V.mode, q.zm, q.hh); const ach = (Q * 3600) / q.vol; q.achs.push(ach); if (ach >= reqACH / q.hh) q.fresh++
      }
    }
    const sh = n / op.length; grid[k] = sh; R.vent += sh; total += sh
  }
  rows.forEach((R) => { R.fT = R.hours ? R.fT / R.hours : 0; if (R.cN) { R.comfort = R.cSum / R.cN; R.tmin = R.comfort - 3.5; R.tmax = R.comfort + 3.5 } })
  const med = (a: number[]) => { if (!a.length) return 0; const s = Float32Array.from(a).sort(); return s[s.length >> 1] }
  const fl = op.map((q) => ({ i: q.f.i, share: hoursTot ? q.open / hoursTot : 0, ofComfort: q.comfortH ? q.open / q.comfortH : 0, achMed: med(q.achs), fresh: q.open ? q.fresh / q.open : 0 }))
  let limit = 0; for (const q of op) { if (!q.comfortH || q.windBlocked / q.comfortH < 0.2) limit = q.f.i + 1 }
  const allAch: number[] = []; op.forEach((q) => { for (let j = 0; j < q.achs.length; j += 4) allAch.push(q.achs[j]) })
  const openTot = op.reduce((s, q) => s + q.open, 0), freshTot = op.reduce((s, q) => s + q.fresh, 0)
  const comfortTot = rows.reduce((s, R) => s + R.fT * R.hours, 0)
  const Um = op.length ? op.reduce((s, q) => s + U10m * Math.pow(Math.max(10, q.zm) / 10, ALPHA), 0) / op.length : U10m * Math.pow(height / 20, ALPHA)
  return { rows: rows.map(({ cSum: _s, cN: _n, ...R }) => R), total, hoursTot, fW: comfortTot ? total / comfortTot : 0, Um, U10: U10m, operable: op.length, nF: floors.length, limit, all: op.length > 0 && limit >= floors.length, Utop, qTop: 0.613 * Utop * Utop * 1.8 * 1.8, adaptive,
    floors: fl, grid, achMed: med(allAch), fresh: openTot ? freshTot / openTot : 0, rainH, comfortH: comfortTot, reqACH }
}

export interface VentQuickRow { i: number; area: number; within8: number; freePct: number; operable: boolean }
/** ASHRAE 62.1 as her app reads it, per floor: free opening area as a share of the floor, floor within 8 m of an operable opening (study.js ventFloorQuick). */
export function ventFloorQuick(f: DlFloor, zones: Zone[], open: number, posX: number, posY: number): VentQuickRow {
  const m = f.mask, lvl = f.i + 1, hh = f.h - GAP, W2 = f.w / 2, D2 = f.d / 2; const c0 = Math.cos(f.rot), s0 = Math.sin(f.rot), dx0 = posX - f.cx, dy0 = posY - f.cy
  const cc = { x: dx0 * c0 + dy0 * s0, y: -dx0 * s0 + dy0 * c0 }, ch = f.core / 2; const op = open || 0.1
  const solid = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < m.nx && cy < m.ny && m.x0 + cx + 0.5 <= W2 && m.y0 + cy + 0.5 <= D2 && !!m.cells[cy * m.nx + cx]
  const inCore = (x: number, y: number) => Math.abs(x - cc.x) <= ch && Math.abs(y - cc.y) <= ch
  const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const near = new Int16Array(m.nx * m.ny).fill(-1); const q: number[] = []; let area = 0
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!solid(ix, iy)) continue; if (inCore(m.x0 + ix + 0.5, m.y0 + iy + 0.5)) continue; area++
    for (const [dx, dy] of N4) { if (!solid(ix + dx, iy + dy) && zoneFor(zones, cardinalOf(dx, dy, f.rot), lvl).operable) { near[iy * m.nx + ix] = 1; q.push(ix, iy); break } }
  }
  let head = 0
  while (head < q.length) {
    const ix = q[head++], iy = q[head++]; const d = near[iy * m.nx + ix]; if (d >= 8) continue
    for (const [dx, dy] of N4) { const jx = ix + dx, jy = iy + dy; if (!solid(jx, jy) || inCore(m.x0 + jx + 0.5, m.y0 + jy + 0.5)) continue; const k = jy * m.nx + jx; if (near[k] < 0) { near[k] = d + 1; q.push(jx, jy) } }
  }
  let within = 0; for (let k = 0; k < near.length; k++) if (near[k] > 0 && near[k] <= 8) within++
  let free = 0; for (const e of edgesOf(f)) { const z = zoneFor(zones, e.o, lvl); if (z.operable) free += e.L * hh * z.wwr * op }
  return { i: f.i, area, within8: area ? within / area : 0, freePct: area ? (free / area) * 100 : 0, operable: free > 0 }
}
export interface VentQuick { rows: VentQuickRow[]; operable: number; meet4: number; within8: number; freePct: number }
/** The tower's ASHRAE 62.1 reading, area-weighted over the operable floors (study.js ventTowerQuick). */
export function ventTowerQuick(floors: DlFloor[], zones: Zone[], open: number, posX: number, posY: number): VentQuick {
  const rows = floors.map((f) => ventFloorQuick(f, zones, open, posX, posY)); const op = rows.filter((r) => r.operable); const A = op.reduce((s, r) => s + r.area, 0)
  return { rows, operable: op.length, meet4: op.filter((r) => r.freePct >= 4).length, within8: op.reduce((s, r) => s + r.within8 * r.area, 0) / Math.max(1, A), freePct: op.reduce((s, r) => s + r.freePct * r.area, 0) / Math.max(1, A) }
}
