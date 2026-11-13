// Natural ventilation on a floor plate and over the tower, ported from Sinnie Choi's Sun & Wind Studio (study.js:
// planStudy's ventilation part, cpFace, siteWind, ventOpenings, ventFlow, ventStudy, ventFloorQuick, ventTowerQuick,
// flowField, flowSeeds). Pure functions: the floors, façade zones, wind, climate and settings come in as arguments
// instead of LAB.floors / SW.zones / SW.vent / LAB.S.impact.wind / periodInfo().
//
// Deviations from the Studio (stated, not hidden):
//  - The floor mask may be finer than 1 m (SwFloor.mask.h): distances are counted in cells and compared in metres,
//    areas are cells × h², the walk steps half a cell (0.5 m at 1 m cells, as the Studio).
//  - planStudy's sun-patch part (lit cells) is not here: it belongs to the sun / daylight layers.
//  - ventHours takes the period's mean 10 m wind from the hourly record (the Studio averages its monthly rose; the
//    hourly physics, which drive the result, are the same).
//  - airFlow's mechanical case puts the supply diffusers on a 5 m lattice (the Studio's own fallback when the
//    structural grid gives fewer than four); the Studio first places them in the structural bays (towerGrid).
//  - Air-flow velocities are divided by the cell size so they stay m/s on finer grids (identical at 1 m).
import { inPeriod, prepClimate, type Period } from './climate'
import type { ClimatePayload } from './types'
import { ALPHA } from './wind'
import { FACE_AZ, GAP, ORI, STRATS, band, cardinalOf, faceOffset, inCore, solidAt, zoneFor, type Face, type FacadeZone, type SwFloor } from './plate'
import { ENERGY_DEFAULTS } from './energy'

/** SW.vent: opening mode, comfort band, gust limit for open windows (m/s), free opening share of the glass, ΔT inside. */
export interface VentSettings { mode: 'cross' | 'single' | 'stack'; band: 'fixed' | 'adaptive'; tmin: number; tmax: number; umax: number; open: number; dT: number }
export const VENT_DEFAULTS: VentSettings = { mode: 'cross', band: 'fixed', tmin: 12, tmax: 24, umax: 8, open: 0.1, dT: 3 }

/** One wind case (LAB.S.impact.wind): direction the wind comes from (deg, clockwise from true north), 10 m speed m/s. */
export interface WindCase { dir: number; speed: number }

/** Wind pressure coefficient of a tall-building face (study.js cpFace): +0.7 windward, −0.6 side, −0.3 leeward. */
export const cpFace = (windFrom: number, faceAz: number) => {
  const t = (((((windFrom - faceAz) % 360) + 540) % 360) - 180) * Math.PI / 180, c = Math.cos(t)
  return -0.2 + 0.5 * c + 0.4 * (2 * c * c - 1)
}
/** Weather-station wind (airfield, 10 m) to the site at height z (study.js siteWind; ASHRAE / EnergyPlus boundary layers). */
export const siteWind = (ws: number, z: number) => ws * Math.pow(270 / 10, 0.14) * Math.pow(Math.max(10, z) / 400, ALPHA)

/** The period's wind for the plan studies (planStudy with `annual`): most frequent of 8 sectors and the mean 10 m speed. */
export function periodWind(C: ClimatePayload, period: Period): WindCase {
  const P = prepClimate(C), f = new Array(8).fill(0)
  let s = 0, n = 0
  for (let k = 0; k < P.n; k++) {
    if (!inPeriod(period, P.doy[k])) continue
    s += P.ws[k]; n++
    if (P.ws[k] > 0) f[Math.floor((((P.wd[k] % 360) + 360 + 22.5) % 360) / 45)]++
  }
  let top = 0
  for (let i = 1; i < 8; i++) if (f[i] > f[top]) top = i
  return { dir: top * 45, speed: n ? s / n : 3.5 }
}

const FD4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const cellX = (f: SwFloor, ix: number) => f.mask.x0 + (ix + 0.5) * f.mask.h
const cellY = (f: SwFloor, iy: number) => f.mask.y0 + (iy + 0.5) * f.mask.h
const coreCell = (f: SwFloor, ix: number, iy: number) => inCore(f, cellX(f, ix), cellY(f, iy))

/** Strongest vent boost of an operable zone on this floor (double skins let windows open in stronger wind). */
function ventBoost(f: SwFloor, zones: FacadeZone[]): number {
  let b = 1
  for (const o of ORI) { const z = zoneFor(zones, o, f.level); if (z.operable) b = Math.max(b, STRATS[z.strat].ventBoost || 1) }
  return b
}

/**
 * Distance (cells, 1 = touching an operable façade) from every floor cell to the nearest operable opening, by BFS
 * around the core (planStudy / ventFloorQuick). -1 where none within `cap` cells.
 */
function nearOpening(f: SwFloor, zones: FacadeZone[], cap: number): Int16Array {
  const m = f.mask, near = new Int16Array(m.nx * m.ny).fill(-1), q: number[] = []
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!solidAt(m, ix, iy)) continue
    for (const [dx, dy] of FD4) {
      if (!solidAt(m, ix + dx, iy + dy) && zoneFor(zones, cardinalOf(dx, dy, f.rot), f.level).operable) { near[iy * m.nx + ix] = 1; q.push(ix, iy); break }
    }
  }
  let head = 0
  while (head < q.length) {
    const ix = q[head++], iy = q[head++], d = near[iy * m.nx + ix]
    if (d >= cap) continue
    for (const [dx, dy] of FD4) {
      const jx = ix + dx, jy = iy + dy
      if (!solidAt(m, jx, jy) || coreCell(f, jx, jy)) continue
      const k = jy * m.nx + jx
      if (near[k] < 0) { near[k] = d + 1; q.push(jx, jy) }
    }
  }
  return near
}

/** Façade length per compass face. */
const edgeLenOf = (f: SwFloor) => { const L: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }; for (const e of f.edges) L[e.o] += e.L; return L }

export interface VentFloor {
  level: number
  /** Clear storey height (floor-to-floor less the slab gap), m. */
  hh: number
  /** Floor area outside the core, m². */
  area: number
  /** m² ventilated in this wind case, within 8 m of an operable opening, within the CIBSE depth limit of the mode. */
  aVent: number; aWithin8: number; aRule: number
  /** Shares of `area`. */
  within8: number; ruleShare: number; ventShare: number
  /** Distance to the nearest operable opening in cells (cell = mask.h m), -1 for none / not floor; grid of the mask. */
  near: Int16Array
  /** Ventilated cells (indices into the mask grid) for the plan layer. */
  vent: Int32Array
  nx: number; ny: number; x0: number; y0: number; cell: number
  /** Wind case: from-direction and speed at mid-floor (m/s). */
  wdir: number; Uz: number
  /** Gusts (1.8 × Uz) under the floor's limit umax (VentSettings.umax × the zones' ventBoost). */
  windowsOpen: boolean; umax: number
  mode: VentSettings['mode']
  /** Airflow (m³/s): total, wind-driven, stack-driven; air changes per hour. */
  Q: number; Qw: number; Qs: number; ach: number
  /** Free opening area (m²) on the positive-Cp (inlet) and negative-Cp faces; total; as % of the floor area. */
  opIn: number; opOut: number; freeArea: number; freePct: number
  cpIn: number | null; cpOut: number | null
  edgeLen: Record<Face, number>
  /** CIBSE AM10 depth limits, m: single-sided 2.5 h, cross 5 h, stack 12 m. */
  limSingle: number; limCross: number; limStack: number
}

/** One floor's natural ventilation in one wind case (study.js planStudy, ventilation part). */
export function ventFloor(f: SwFloor, zones: FacadeZone[], wind: WindCase, vent: VentSettings = VENT_DEFAULTS): VentFloor {
  const m = f.mask, h = m.h, hh = f.h - GAP, lvl = f.level
  const zoneOf = (o: Face) => zoneFor(zones, o, lvl)
  const off = faceOffset(f.rot)
  const wdir = wind.dir, U10 = wind.speed
  const c = Math.cos(-f.rot), s = Math.sin(-f.rot)
  const wf = { x: Math.sin(wdir * Math.PI / 180), y: Math.cos(wdir * Math.PI / 180) }
  const fl = { x: -(wf.x * c - wf.y * s), y: -(wf.x * s + wf.y * c) } // the way the air flows, in the floor's axes
  const zc = f.z + f.h / 2, Uz = U10 * Math.pow(Math.max(10, zc) / 10, ALPHA)
  const cpOf = (o: Face) => cpFace(wdir, FACE_AZ[o] + off)
  const open = vent.open || 0.1, mode = vent.mode
  const umax = vent.umax * ventBoost(f, zones), windowsOpen = Uz * 1.8 <= umax
  const edgeLen = edgeLenOf(f)
  const step = Math.min(0.5, h / 2), maxK = Math.ceil(200 / step)
  // walk from a cell centre until leaving the plate: distance and the compass face left through (null into the core)
  const walk = (ix: number, iy: number, dx: number, dy: number): { D: number; o: Face } | null => {
    let x = cellX(f, ix), y = cellY(f, iy), px = ix, py = iy
    for (let k = 1; k < maxK; k++) {
      x += dx * step; y += dy * step
      if (inCore(f, x, y)) return null
      const cx = Math.floor((x - m.x0) / h), cy = Math.floor((y - m.y0) / h)
      if (!solidAt(m, cx, cy)) {
        let nx = cx !== px ? Math.sign(cx - px) : 0, ny = cy !== py ? Math.sign(cy - py) : 0
        if (nx && ny) { if (Math.abs(dx) >= Math.abs(dy)) ny = 0; else nx = 0 }
        if (!nx && !ny) { nx = Math.sign(dx); ny = Math.sign(dy); if (Math.abs(dx) >= Math.abs(dy)) ny = 0; else nx = 0 }
        return { D: k * step, o: cardinalOf(nx, ny, f.rot) }
      }
      px = cx; py = cy
    }
    return null
  }
  const near = nearOpening(f, zones, Math.ceil(60 / h))
  const limSingle = Math.round(2.5 * hh), limStack = 12, limCross = Math.round(5 * hh)
  const limMode = mode === 'cross' ? limCross : mode === 'single' ? limSingle : limStack
  const ventCells: number[] = []
  let area = 0, aVent = 0, aWithin8 = 0, aRule = 0, cpIn: number | null = null, cpOut: number | null = null
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!solidAt(m, ix, iy) || coreCell(f, ix, iy)) continue
    area++
    const k = iy * m.nx + ix, nd = near[k] * h
    if (nd > 0 && nd <= 8) aWithin8++
    if (nd > 0 && nd <= limMode) aRule++
    if (!windowsOpen) continue
    if (mode === 'cross') {
      const back = walk(ix, iy, -fl.x, -fl.y), fwd = walk(ix, iy, fl.x, fl.y)
      if (back && fwd && back.D <= limCross) {
        const zi = zoneOf(back.o), zo = zoneOf(fwd.o)
        if (zi.operable && zo.operable && cpOf(back.o) > cpOf(fwd.o)) { aVent++; ventCells.push(k); cpIn = cpOf(back.o); cpOut = cpOf(fwd.o) }
      }
    } else if (nd > 0 && nd <= (mode === 'stack' ? limStack : limSingle)) { aVent++; ventCells.push(k) }
  }
  let ghMean = 0, gN = 0, opIn = 0, opOut = 0
  for (const o of ORI) {
    const z = zoneOf(o)
    if (!z.operable || !edgeLen[o]) continue
    const gh = hh * z.wwr; ghMean += gh; gN++
    const A = edgeLen[o] * gh * open
    if (cpOf(o) > 0) opIn += A; else opOut += A
  }
  ghMean = gN ? ghMean / gN : 2
  const h2 = h * h, areaM = area * h2
  const freeArea = opIn + opOut, freePct = areaM ? freeArea / areaM * 100 : 0
  let ach = 0, Q = 0, Qw = 0, Qs = 0
  const vol = areaM * hh, dT = vent.dT || 3, Tm = 283
  if (windowsOpen && vol > 0) {
    if (mode === 'cross' && opIn > 0 && opOut > 0) {
      const Aeff = 1 / Math.sqrt(1 / (opIn * opIn) + 1 / (opOut * opOut))
      Qw = 0.6 * Aeff * Uz * Math.sqrt(Math.max(0.2, (cpIn == null ? 0.7 : cpIn) - (cpOut == null ? -0.3 : cpOut)))
    } else if (mode !== 'cross' && freeArea > 0) {
      Qw = 0.025 * freeArea * Uz
      Qs = 0.6 * freeArea / 3 * Math.sqrt(9.81 * (mode === 'stack' ? hh * 3 : ghMean) * dT / Tm)
    }
    Q = Math.sqrt(Qw * Qw + Qs * Qs); ach = Q * 3600 / vol
  }
  return {
    level: lvl, hh, area: areaM, aVent: aVent * h2, aWithin8: aWithin8 * h2, aRule: aRule * h2,
    within8: area ? aWithin8 / area : 0, ruleShare: area ? aRule / area : 0, ventShare: area ? aVent / area : 0,
    near, vent: Int32Array.from(ventCells), nx: m.nx, ny: m.ny, x0: m.x0, y0: m.y0, cell: h,
    wdir, Uz, windowsOpen, umax, mode, Q, Qw, Qs, ach, opIn, opOut, freeArea, freePct, cpIn, cpOut, edgeLen, limSingle, limCross, limStack,
  }
}

export interface VentFloorQuick { i: number; level: number; area: number; within8: number; freePct: number; operable: boolean }
export interface VentTower {
  rows: VentFloorQuick[]
  /** Floors with an operable face. */
  operable: number
  /** Operable floors whose free opening area is at least 4% of the floor (ASHRAE 62.1 natural ventilation). */
  meet4: number
  /** Area-weighted over the operable floors: share within 8 m of an opening, free opening % of floor. */
  within8: number; freePct: number
}

/** Operable share, free opening % and the 8 m rule for one floor (study.js ventFloorQuick). */
export function ventFloorQuick(f: SwFloor, zones: FacadeZone[], vent: VentSettings = VENT_DEFAULTS): VentFloorQuick {
  const m = f.mask, h = m.h, hh = f.h - GAP, open = vent.open || 0.1
  const near = nearOpening(f, zones, Math.ceil(8 / h))
  let area = 0, within = 0
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!solidAt(m, ix, iy) || coreCell(f, ix, iy)) continue
    area++
    const d = near[iy * m.nx + ix] * h
    if (d > 0 && d <= 8) within++
  }
  let free = 0
  for (const e of f.edges) { const z = zoneFor(zones, e.o, f.level); if (z.operable) free += e.L * hh * z.wwr * open }
  const A = area * h * h
  return { i: f.i, level: f.level, area: A, within8: area ? within / area : 0, freePct: A ? free / A * 100 : 0, operable: free > 0 }
}

/** The tower's ventilation reach without a wind case (study.js ventTowerQuick). Floors with the same plate are computed once. */
export function ventTower(floors: SwFloor[], zones: FacadeZone[], vent: VentSettings = VENT_DEFAULTS): VentTower {
  const memo = new Map<string, Omit<VentFloorQuick, 'i' | 'level'>>()
  const rows = floors.map((f) => {
    const key = JSON.stringify([f.mask.nx, f.mask.ny, f.mask.x0, f.mask.y0, f.h.toFixed(2), f.rot.toFixed(3), f.core.half.toFixed(2), f.edges.length, ORI.map((o) => zones.indexOf(zoneFor(zones, o, f.level)))])
    let r = memo.get(key)
    if (!r) { const q = ventFloorQuick(f, zones, vent); r = { area: q.area, within8: q.within8, freePct: q.freePct, operable: q.operable }; memo.set(key, r) }
    return { i: f.i, level: f.level, ...r }
  })
  const op = rows.filter((r) => r.operable), A = op.reduce((s, r) => s + r.area, 0)
  return {
    rows, operable: op.length, meet4: op.filter((r) => r.freePct >= 4).length,
    within8: op.reduce((s, r) => s + r.within8 * r.area, 0) / Math.max(1, A), freePct: op.reduce((s, r) => s + r.freePct * r.area, 0) / Math.max(1, A),
  }
}

// ---- hour by hour over the typical year (study.js ventOpenings, ventFlow, ventStudy) --------------------------------

interface Opening { o: Face; A: number; zb: number; gh: number; az: number }

/** Operable openings of a floor by face: free area, sill height above grade, glass height, true azimuth. */
function ventOpenings(f: SwFloor, zones: FacadeZone[], vent: VentSettings): Opening[] {
  const open = vent.open || 0.1, off = faceOffset(f.rot), by: Partial<Record<Face, Opening>> = {}
  for (const e of f.edges) {
    const z = zoneFor(zones, e.o, f.level)
    if (!z.operable) continue
    const B = band(f, z)
    const q = by[e.o] ?? (by[e.o] = { o: e.o, A: 0, zb: f.z + B.sp, gh: B.gh, az: FACE_AZ[e.o] + off })
    q.A += e.L * B.gh * open
  }
  return Object.values(by).filter((q): q is Opening => !!q && q.A > 0)
}

/** Airflow (m³/s) through a floor's openings balancing wind and stack pressure (NIST CONTAM / AirflowNetwork, one zone). */
export function ventFlow(ops: Opening[], U: number, wdir: number, Te: number, dT: number, mode: VentSettings['mode'], zMid: number, hh: number): number {
  if (!ops.length) return 0
  const rho = 1.2041 * 293.15 / (Te + 273.15), Ti = Te + dT, rhoI = rho * (Te + 273.15) / (Ti + 273.15), Cd = 0.6, g = 9.81
  const items = (fs: Opening[]) => {
    const it: { A: number; p: number }[] = []
    for (const q of fs) {
      const pw = 0.5 * rho * U * U * cpFace(wdir, q.az)
      for (const fz of [0.25, 0.75]) { const z = q.zb + q.gh * fz; it.push({ A: q.A / 2, p: pw - (rho - rhoI) * g * (z - zMid) }) }
    }
    return it
  }
  const balance = (it: { A: number; p: number }[]) => {
    if (it.length < 2) return 0
    let lo = Infinity, hi = -Infinity
    for (const x of it) { lo = Math.min(lo, x.p); hi = Math.max(hi, x.p) }
    if (hi - lo < 1e-6) return 0
    const net = (P: number) => { let m = 0; for (const x of it) { const d = x.p - P; m += Cd * x.A * Math.sign(d) * Math.sqrt(2 * (d > 0 ? rho : rhoI) * Math.abs(d)) } return m }
    for (let k = 0; k < 32; k++) { const mid = (lo + hi) / 2; if (net(mid) > 0) lo = mid; else hi = mid }
    const P = (lo + hi) / 2
    let q = 0
    for (const x of it) { const d = x.p - P; if (d > 0) q += Cd * x.A * Math.sqrt(2 * d / rho) }
    return q
  }
  const turb = (fs: Opening[]) => 0.025 * fs.reduce((s, q) => s + q.A, 0) * U // BS 5925 single-sided wind turbulence
  if (mode === 'single') return ops.reduce((s, q) => { const b = balance(items([q])), t = turb([q]); return s + Math.sqrt(b * b + t * t) }, 0)
  const it = items(ops)
  if (mode === 'stack') { const A = ops.reduce((s, q) => s + q.A, 0) * 0.5; it.push({ A, p: 0.5 * rho * U * U * -0.5 - (rho - rhoI) * g * (3 * hh) }) }
  const b = balance(it)
  if (ops.length === 1) { const t = turb(ops); return Math.sqrt(b * b + t * t) }
  return b
}

export interface VentMonth {
  m: string; days: number
  /** Monthly mean outdoor temperature (°C). */
  T: number
  /** Share of the month's hours when the air inside (outdoor + ΔT) sits in the comfort band. */
  fT: number
  hours: number
  /** Floor-weighted hours with windows open (sum over hours of the share of operable floors open). */
  vent: number
  /** Adaptive comfort temperature (ASHRAE 55) when the adaptive band applies, else null; band limits. */
  comfort: number | null; tmin: number; tmax: number
}
export interface VentHoursFloor { i: number; level: number; share: number; ofComfort: number; achMed: number; fresh: number }
export interface VentHours {
  rows: VentMonth[]
  /** Floor-weighted open hours, period hours, and their ratio (share of the period with windows open). */
  total: number; hoursTot: number; share: number
  /** Open hours as a share of the comfortable hours. */
  fW: number
  /** Mean wind at the operable floors, 10 m wind, wind at the top, gust pressure at the top (Pa). */
  Um: number; U10: number; Utop: number; qTop: number
  operable: number; nF: number
  /** Highest level whose windows can open at least 80% of the comfortable hours (gusts); `all` if every floor. */
  limit: number; all: boolean
  adaptive: boolean
  floors: VentHoursFloor[]
  /** Share of operable floors open, per hour of the year (-1 outside the period). */
  grid: Float32Array
  achMed: number
  /** Share of open hours that also meet the outdoor-air rate. */
  fresh: number
  rainH: number; comfortH: number; reqACH: number
}

/**
 * Hours by month when opening the windows keeps each floor in the comfort band (study.js ventStudy): fixed band or
 * ASHRAE 55 adaptive on the prevailing mean outdoor temperature, gusts at the floor's height under the limit, no hard
 * rain; airflow then from ventFlow. `oaRate` = outdoor-air rate, L/s per m² (S.energy.vent).
 */
export function ventHours(floors: SwFloor[], zones: FacadeZone[], C: ClimatePayload, vent: VentSettings = VENT_DEFAULTS, period: Period = { d0: 1, d1: 365, full: true, label: 'Whole year' }, opts: { oaRate?: number } = {}): VentHours {
  const P = prepClimate(C), V = vent, adaptive = V.band === 'adaptive', dT = V.dT || 3
  const monthDays = new Array(12).fill(0), mT = new Array(12).fill(0), mN = new Array(12).fill(0)
  let wsS = 0, wsN = 0
  for (let k = 0; k < P.n; k++) {
    mT[P.mon[k]] += P.T[k]; mN[P.mon[k]]++
    if (k % 24 === 0 && inPeriod(period, P.doy[k])) monthDays[P.mon[k]]++
    if (inPeriod(period, P.doy[k])) { wsS += P.ws[k]; wsN++ }
  }
  const U10m = wsN ? wsS / wsN : 3.5
  const height = floors.reduce((s, f) => Math.max(s, f.z + f.h), 0)
  const Utop = U10m * Math.pow(Math.max(10, height) / 10, ALPHA)
  const op = floors.map((f) => {
    const ops = ventOpenings(f, zones, V)
    if (!ops.length) return null
    const hh = f.h - GAP, area = Math.max(1, f.area)
    return { f, ops, zm: f.z + f.h / 2, hh, umax: V.umax * ventBoost(f, zones), vol: area * hh, open: 0, comfortH: 0, windBlocked: 0, achs: [] as number[], fresh: 0 }
  }).filter((q): q is NonNullable<typeof q> => !!q)
  const reqACH = (opts.oaRate ?? ENERGY_DEFAULTS.vent) * 3.6 // L/s per m² → air changes per metre of storey height
  const rows: (VentMonth & { cSum: number; cN: number })[] = C.months.map((m, i) => ({ m, days: monthDays[i], T: C.temp?.[i] ?? mT[i] / Math.max(1, mN[i]), fT: 0, hours: 0, vent: 0, comfort: null, tmin: V.tmin, tmax: V.tmax, cSum: 0, cN: 0 }))
  const grid = new Float32Array(8760).fill(-1)
  let total = 0, hoursTot = 0, rainH = 0
  for (let k = 0; k < P.n; k++) {
    if (!inPeriod(period, P.doy[k])) continue
    const R = rows[P.mon[k]]
    R.hours++; hoursTot++
    const Te = P.T[k], tp = P.tpma[k]
    let lo = V.tmin, hi = V.tmax
    if (adaptive && tp >= 10 && tp <= 33.5) { const tc = 0.31 * tp + 17.8; lo = tc - 3.5; hi = tc + 3.5; R.cSum += tc; R.cN++ }
    const Ti = Te + dT, comfy = Ti >= lo && Ti <= hi
    if (comfy) R.fT++
    const wet = P.rain[k] > 1
    if (comfy && wet) rainH++
    if (!op.length) continue
    let n = 0
    if (comfy && !wet) {
      const ws = P.ws[k], wd = P.wd[k]
      for (const q of op) {
        q.comfortH++
        const U = siteWind(ws, q.zm)
        if (1.8 * U > q.umax) { q.windBlocked++; continue }
        q.open++; n++
        const Q = ventFlow(q.ops, U, wd, Te, dT, V.mode, q.zm, q.hh), ach = Q * 3600 / q.vol
        q.achs.push(ach)
        if (ach >= reqACH / q.hh) q.fresh++
      }
    }
    const sh = n / op.length
    grid[k] = sh; R.vent += sh; total += sh
  }
  for (const R of rows) { R.fT = R.hours ? R.fT / R.hours : 0; if (R.cN) { R.comfort = R.cSum / R.cN; R.tmin = R.comfort - 3.5; R.tmax = R.comfort + 3.5 } }
  const med = (a: number[]) => { if (!a.length) return 0; const s = Float32Array.from(a).sort(); return s[s.length >> 1] }
  const fl = op.map((q) => ({ i: q.f.i, level: q.f.level, share: hoursTot ? q.open / hoursTot : 0, ofComfort: q.comfortH ? q.open / q.comfortH : 0, achMed: med(q.achs), fresh: q.open ? q.fresh / q.open : 0 }))
  let limit = 0
  for (const q of op) if (!q.comfortH || q.windBlocked / q.comfortH < 0.2) limit = Math.max(limit, q.f.level)
  const allAch: number[] = []
  for (const q of op) for (let j = 0; j < q.achs.length; j += 4) allAch.push(q.achs[j])
  const openTot = op.reduce((s, q) => s + q.open, 0), freshTot = op.reduce((s, q) => s + q.fresh, 0)
  const comfortTot = rows.reduce((s, R) => s + R.fT * R.hours, 0)
  const Um = op.length ? op.reduce((s, q) => s + U10m * Math.pow(Math.max(10, q.zm) / 10, ALPHA), 0) / op.length : U10m * Math.pow(height / 20, ALPHA)
  const topLevel = floors.reduce((s, f) => Math.max(s, f.level), 0)
  return {
    rows: rows.map(({ cSum: _a, cN: _b, ...r }) => r), total, hoursTot, share: hoursTot ? total / hoursTot : 0, fW: comfortTot ? total / comfortTot : 0,
    Um, U10: U10m, Utop, qTop: 0.613 * Utop * Utop * 1.8 * 1.8, operable: op.length, nF: floors.length, limit, all: op.length > 0 && limit >= topLevel,
    adaptive, floors: fl, grid, achMed: med(allAch), fresh: openTot ? freshTot / openTot : 0, rainH, comfortH: comfortTot, reqACH,
  }
}

// ---- the 'Air flow' plan layer (study.js flowField, flowSeeds) -------------------------------------------------------

export interface FlowLink { k: number; d: number; g: number; p: number; kind: 'win' | 'shaft' | 'ret'; o?: Face; frac?: number; /** flow into the floor (+), network units scaled */ q?: number }
export interface AirFlow {
  sys: 'nat' | 'mech'
  nx: number; ny: number; x0: number; y0: number; cell: number
  /** 1 where air moves (floor outside the core). */
  fluid: Uint8Array
  /** m² of fluid floor. */
  area: number; hh: number
  links: FlowLink[]
  /** Supply diffuser cells (mechanical). */
  diff: number[]
  /** Velocity per cell (m/s) in the floor's axes, and speed. */
  vx: Float32Array; vy: Float32Array; spd: Float32Array
  /** Speed of the 92nd percentile cell (colour scale), mean speed, share of still cells (< 0.05 m/s). */
  uRef: number; mean: number; still: number
  /** false with a reason when windows are shut or no face opens. */
  on: boolean; why: string
  /** Single-sided (no pressure difference across the plate): in and out at the same windows. */
  breath: boolean
  shaft: boolean
  Q: number; ach: number
  /** Arrow anchors, one per 4 m where the air moves: position (floor axes, m) and unit direction. */
  seeds: { x: number; y: number; ux: number; uy: number }[]
  vent: VentFloor
}

/**
 * The 1 m pressure-network flow field of one floor (study.js flowField): cells joined to their neighbours, windows
 * (Cp of the face), the stack shaft or returns at the core as boundary links, solved by SOR; velocities scaled to the
 * floor's airflow. Mechanical: diffusers supply `supply` L/s per m² (≥ the outdoor-air rate) and return at the core.
 */
export function airFlow(f: SwFloor, zones: FacadeZone[], wind: WindCase, vent: VentSettings = VENT_DEFAULTS, opts: { sys?: 'nat' | 'mech'; oaRate?: number; supply?: number } = {}): AirFlow {
  const R = ventFloor(f, zones, wind, vent)
  const mech = opts.sys === 'mech', rate = opts.oaRate ?? 0.4, supply = Math.max(rate, opts.supply ?? 5)
  const m = f.mask, nx = m.nx, ny = m.ny, N = nx * ny, h = m.h, hh = R.hh, lvl = f.level
  const solid = (cx: number, cy: number) => solidAt(m, cx, cy)
  const fluid = new Uint8Array(N)
  let area = 0
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) if (solid(ix, iy) && !coreCell(f, ix, iy)) { fluid[iy * nx + ix] = 1; area++ }
  const off = faceOffset(f.rot), cpOf = (o: Face) => cpFace(R.wdir, FACE_AZ[o] + off)
  const res: AirFlow = {
    sys: mech ? 'mech' : 'nat', nx, ny, x0: m.x0, y0: m.y0, cell: h, fluid, area: area * h * h, hh, links: [], diff: [],
    vx: new Float32Array(N), vy: new Float32Array(N), spd: new Float32Array(N), uRef: 0.1, mean: 0, still: 1, on: true, why: '', breath: false, shaft: false, Q: 0, ach: 0, seeds: [], vent: R,
  }
  const bG = new Float32Array(N), bGP = new Float32Array(N), src = new Float32Array(N)
  let anyOpenFace = false
  const faceOpen = {} as Record<Face, boolean>
  for (const o of ORI) { faceOpen[o] = zoneFor(zones, o, lvl).operable && R.edgeLen[o] > 0; if (faceOpen[o]) anyOpenFace = true }
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const k = iy * nx + ix
    if (!fluid[k]) continue
    FD4.forEach(([dx, dy], d) => {
      const jx = ix + dx, jy = iy + dy
      if (solid(jx, jy)) {
        if (!coreCell(f, jx, jy)) return
        if (mech) res.links.push({ k, d, g: 1, p: 0, kind: 'ret' })
        else if (vent.mode === 'stack' && R.windowsOpen) { res.links.push({ k, d, g: 0.12, p: -0.8, kind: 'shaft' }); res.shaft = true }
        return
      }
      if (mech || !R.windowsOpen) return
      const o = cardinalOf(dx, dy, f.rot)
      if (!faceOpen[o]) return
      const z = zoneFor(zones, o, lvl), frac = z.wwr * (vent.open || 0.1)
      res.links.push({ k, d, g: 0.25 * Math.min(2, Math.max(0.2, frac / 0.06)), p: cpOf(o), kind: 'win', o, frac })
    })
  }
  for (const L of res.links) { bG[L.k] += L.g; bGP[L.k] += L.g * L.p }
  if (mech) {
    // simplified: diffusers on a 5 m lattice (the Studio's fallback; it first uses the structural bays)
    const st = Math.max(1, Math.round(5 / h)), o0 = Math.floor(st / 2)
    for (let iy = o0; iy < ny; iy += st) for (let ix = o0; ix < nx; ix += st) { const k = iy * nx + ix; if (fluid[k]) { res.diff.push(k); src[k] = 1 } }
    if (!res.links.length) { // no core on this plate: return at the cell nearest the core centre
      const cx = (f.core.x - m.x0) / h, cy = (f.core.y - m.y0) / h
      let best = -1, bd = 1e9
      for (let k = 0; k < N; k++) { if (!fluid[k]) continue; const d = Math.hypot(k % nx - cx, ((k / nx) | 0) - cy); if (d < bd) { bd = d; best = k } }
      if (best >= 0) { res.links.push({ k: best, d: 0, g: 1, p: 0, kind: 'ret' }); bG[best] += 1 }
    }
    res.Q = supply / 1000 * res.area; res.ach = res.area * hh > 0 ? res.Q * 3600 / (res.area * hh) : 0
  } else {
    if (!R.windowsOpen) { res.on = false; res.why = `Windows closed: gusts over ${R.umax.toFixed(0)} m/s at this height` }
    else if (!anyOpenFace) { res.on = false; res.why = 'No operable face on this floor: open one, or switch to mechanical' }
    res.Q = R.Q; res.ach = R.ach
  }
  const win = res.links.filter((L) => L.kind === 'win')
  if (!mech && res.on && !res.shaft) {
    let lo = 1e9, hi = -1e9
    for (const L of win) { lo = Math.min(lo, L.p); hi = Math.max(hi, L.p) }
    if (!win.length || hi - lo < 0.05) res.breath = true
  }
  if (res.on && !res.breath && res.links.length) {
    const p = new Float32Array(N), w = 1.85
    for (let it = 0; it < 1500; it++) {
      let dmax = 0
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        const k = iy * nx + ix
        if (!fluid[k]) continue
        let g = bG[k], r = bGP[k] + src[k]
        if (ix + 1 < nx && fluid[k + 1]) { g++; r += p[k + 1] }
        if (ix > 0 && fluid[k - 1]) { g++; r += p[k - 1] }
        if (iy + 1 < ny && fluid[k + nx]) { g++; r += p[k + nx] }
        if (iy > 0 && fluid[k - nx]) { g++; r += p[k - nx] }
        if (!g) continue
        const nv = p[k] + w * (r / g - p[k]), dd = Math.abs(nv - p[k])
        if (dd > dmax) dmax = dd
        p[k] = nv
      }
      if (dmax < (mech ? 1e-4 : 1e-6)) break
    }
    const lk = new Map<number, FlowLink>()
    for (const L of res.links) lk.set(L.k * 4 + L.d, L)
    const fx = (k: number, side: number) => {
      const ix = k % nx
      if (side > 0) { if (ix + 1 < nx && fluid[k + 1]) return p[k] - p[k + 1]; const L = lk.get(k * 4); return L ? L.g * (p[k] - L.p) : 0 }
      if (ix > 0 && fluid[k - 1]) return p[k - 1] - p[k]
      const L = lk.get(k * 4 + 1); return L ? L.g * (L.p - p[k]) : 0
    }
    const fy = (k: number, side: number) => {
      const iy = (k / nx) | 0
      if (side > 0) { if (iy + 1 < ny && fluid[k + nx]) return p[k] - p[k + nx]; const L = lk.get(k * 4 + 2); return L ? L.g * (p[k] - L.p) : 0 }
      if (iy > 0 && fluid[k - nx]) return p[k - nx] - p[k]
      const L = lk.get(k * 4 + 3); return L ? L.g * (L.p - p[k]) : 0
    }
    for (let k = 0; k < N; k++) { if (!fluid[k]) continue; res.vx[k] = (fx(k, 1) + fx(k, -1)) / 2; res.vy[k] = (fy(k, 1) + fy(k, -1)) / 2 }
    for (const L of res.links) L.q = L.g * (L.p - p[L.k])
    let scale = 1
    if (mech) scale = res.diff.length ? (res.Q / res.diff.length) / hh : 0
    else {
      let phys = 0, num = 0
      for (const L of res.links) { if (!(L.q! > 0)) continue; const dp = L.p - p[L.k]; phys += 0.6 * R.Uz * Math.sqrt(Math.max(0, dp)) * (L.kind === 'win' ? L.frac! : 0.05); num += L.q! }
      scale = num > 0 ? (R.Q > 0 ? R.Q / (hh * num) : phys / num) : 0
    }
    scale /= h // a link is one cell wide
    for (let k = 0; k < N; k++) { if (!fluid[k]) continue; res.vx[k] *= scale; res.vy[k] *= scale; res.spd[k] = Math.hypot(res.vx[k], res.vy[k]) }
  } else if (res.on && res.breath) { // single-sided: in and out at the windows, fading with depth
    const nr = R.near, lim = R.limSingle / h, U = 0.05 * R.Uz
    for (let k = 0; k < N; k++) {
      if (!fluid[k]) continue
      const d = nr[k]
      if (d <= 0 || d > lim) continue
      const ix = k % nx, iy = (k / nx) | 0
      const nv = (jx: number, jy: number) => { if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) return d; const v = nr[jy * nx + jx]; return v > 0 ? v : d }
      const gx = (nv(ix + 1, iy) - nv(ix - 1, iy)) / 2, gy = (nv(ix, iy + 1) - nv(ix, iy - 1)) / 2, gl = Math.hypot(gx, gy) || 1
      const u = U * (1 - (d - 1) / lim)
      res.vx[k] = gx / gl * u; res.vy[k] = gy / gl * u; res.spd[k] = u
    }
    for (const L of res.links) L.q = 0
  }
  const sp: number[] = []
  let sum = 0, still = 0
  for (let k = 0; k < N; k++) { if (!fluid[k]) continue; const v = res.spd[k]; sp.push(v); sum += v; if (v < 0.05) still++ }
  sp.sort((a, b) => a - b)
  res.mean = sp.length ? sum / sp.length : 0; res.still = sp.length ? still / sp.length : 1
  res.uRef = Math.max(0.02, (sp.length ? sp[Math.floor(sp.length * 0.92)] : 0) || 0.02)
  // flowSeeds: one arrow per 4 m where the air moves
  const st = Math.max(1, Math.round(4 / h)), mid = Math.floor(st / 2), cut = res.uRef * 0.05
  for (let k = 0; k < N; k++) {
    const ix = k % nx, iy = (k / nx) | 0
    if (!fluid[k] || ix % st !== mid || iy % st !== mid) continue
    const v = res.spd[k]
    if (v < cut || !(v > 0)) continue
    res.seeds.push({ x: cellX(f, ix), y: cellY(f, iy), ux: res.vx[k] / v, uy: res.vy[k] / v })
  }
  return res
}
