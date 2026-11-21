// One floor as thermal zones, hour by hour, ported from Sinnie Choi's Sun & Wind Studio (study.js thermalFloor,
// thermMoments; energy.js thermalZones, T_BINS). Each façade side's outer 5 m band and the interior are a zone of the
// ISO 13790 5R1C hourly model (energy.ts's constants: OPS, MASS, schedOf, occupied, ENERGY_DEFAULTS), with or without
// heating, cooling and opening windows: the Studio's 'temp' and 'loss' plan layers.
//
// Deviations (stated): zone areas are their cells × h² (the Studio scales cell counts to the floor's area, which
// includes the core); the glass's device transmission t is the beam-weighted share over the typical year from the
// CWEC record (glazing.ts zoneSolarT, which the Studio takes from its rendered sun study, else STRATS.mod). The
// residential diurnal profiles (energy.js PROF) are repeated here because energy.ts does not export them.
import { TZ_BY_MONTH, faceHours, prepClimate } from './climate'
import type { ClimatePayload } from './types'
import { ENERGY_DEFAULTS, MASS, OPS, PROG_OF, occupied, schedOf, type EnergySettings } from './energy'
import { FACE_AZ, FACE_NAME, ORI, band, cardinalOf, faceOffset, inCore, solidAt, zoneFor, type Face, type FacadeZone, type SwFloor } from './plate'
import { floorExposure } from './form'
import { zoneSolarT } from './glazing'
import type { VentSettings } from './vent'
import type { UseId } from '../types'

/** Systems of the Studio's thermal layers (THERM_SYS). */
export type ThermSys = 'none' | 'win' | 'heat' | 'heatwin' | 'full'
export const THERM_SYS: Record<ThermSys, { name: string; blurb: string }> = {
  none: { name: 'No heating or cooling', blurb: 'Free-running: no heating or cooling, the outdoor-air supply and leakage still run.' },
  win: { name: 'Windows only', blurb: 'No heating or cooling; operable windows open when it is over 24 °C inside and cooler outside.' },
  heat: { name: 'Heating only', blurb: 'Heating to the set point, no cooling and windows kept shut.' },
  heatwin: { name: 'Heating and windows', blurb: 'Heating to the set point, and operable windows open to cool when it is warm.' },
  full: { name: 'Heating and cooling', blurb: 'Heating and mechanical cooling to the Energy set points, windows shut.' },
}
/**
 * The system the Energy use line counts on a floor of this use (gap G37): energy.ts heats and cools every zone to its set
 * points unless its program is open (amenity and plant floors), which it leaves unconditioned.
 */
export function energyLineSys(use: UseId): ThermSys {
  return OPS[PROG_OF[use] ?? 'office']?.open ? 'none' : 'full'
}
/** The indoor-temperature setting that follows the Energy use line storey by storey (gap G37). */
export const FOLLOW_ENERGY = { name: 'As the Energy use line', blurb: 'Each storey as the Energy use line counts it: heating and cooling on conditioned floors, none on amenity and plant floors, which it leaves unconditioned.' }
/** A storey's system under a setting: the chosen one, or the Energy use line's for its use. */
export const sysFor = (setting: ThermSys | 'energy', use: UseId): ThermSys => (setting === 'energy' ? energyLineSys(use) : setting)

/**
 * The storeys the indoor-temperature line reads (gap G37): the study storey and the top storey of each run of one use
 * (each use band's top, where the sun and the roof reach it most), plant and amenity runs left out (the Energy use line
 * leaves them unconditioned). At most `max` band tops, the longest runs first. Indices into `floors`, bottom-up.
 */
export function tempStoreys(floors: Pick<SwFloor, 'level' | 'use'>[], study: number, max = 6): number[] {
  const runs: { top: number; n: number }[] = []
  for (let i = 0; i < floors.length; i++) {
    const u = floors[i].use
    if (i + 1 < floors.length && floors[i + 1].use === u) continue
    let j = i; while (j > 0 && floors[j - 1].use === u) j--
    if (u !== 'mechanical' && u !== 'amenity') runs.push({ top: i, n: i - j + 1 })
  }
  const tops = runs.sort((a, b) => b.n - a.n || b.top - a.top).slice(0, max).map((r) => r.top)
  return [...new Set([...(study >= 0 && study < floors.length ? [study] : []), ...tops])].sort((a, b) => a - b)
}

/** Comfort bins on the operative temperature: under 18, 18–20, 20–26, 26–28, over 28 °C. */
export const T_BINS = [18, 20, 26, 28]

const H24 = (...runs: [number, number][]) => { const a: number[] = []; for (const [n, v] of runs) for (let i = 0; i < n; i++) a.push(v); return a }
const PROF = {
  people: H24([7, 0.9], [2, 0.5], [8, 0.25], [5, 0.7], [2, 0.9]),
  light: H24([6, 0.05], [2, 0.3], [9, 0.1], [6, 0.5], [1, 0.2]),
  equip: H24([6, 0.3], [3, 0.6], [8, 0.4], [6, 0.8], [1, 0.5]),
}

export interface ThermalZone {
  /** 'N' | 'E' | 'S' | 'W' for a façade side's 5 m band, 'C' for the interior. */
  key: Face | 'C'
  name: string
  /** Value in `zid` (0–3 = N E S W, 4 = interior). */
  idx: number
  area: number
  /** Glazed and opaque façade (m²), gross façade, roof / soffit share (m²). */
  Agl: number; Aop: number; fac: number; roof: number
  operable: boolean
  /** Operative temperature (mean of air and surfaces) for every hour of the year, °C. */
  To: Float32Array
  /** Occupied hours per T_BINS band, and the occupied hours. */
  bins: number[]; occN: number
  /** Heating and cooling delivered (kWh/yr), hours with windows opened. */
  heat: number; cool: number; openH: number
  /** Heat lost by path while warmer inside than out (kWh/yr). */
  loss: { glass: number; wall: number; roof: number; vent: number; infil: number }
  /** Loss through glass + wall per m² of façade (kWh/m²·yr), the 'loss' layer's edge colour. */
  lossFac: number
  /** Monthly min, max and mean operative temperature. */
  mon: { min: number[]; max: number[]; mean: number[] }
  /** Occupied hours over 26 °C (overheating), and their share of occupied hours. */
  over26: number; overShare: number
  /** Year min / max / mean operative temperature. */
  tMin: number; tMax: number; tMean: number
  /** Operative temperature at the chosen hour (opts.hour), else null. */
  Tk: number | null
}
export interface ThermalFloor {
  sys: ThermSys
  zones: ThermalZone[]
  /** Zone per cell of the floor mask (-1 = not floor / core): colour cells by zones[].idx. */
  zid: Int8Array
  nx: number; ny: number; x0: number; y0: number; cell: number
  /** Loss over the floor by path (kWh/yr), walls and windows split; and per m² of floor. */
  loss: { glass: number; wall: number; roof: number; vent: number; infil: number; total: number; perM2: number }
  hour: number | null
}

interface ZoneIn { key: Face | 'C'; name: string; idx: number; area: number; vol: number; Agl: number; Aop: number; fac: number; roof: number; sol: { az: number; g: number }[]; operable: boolean; ach: number }

/** The 5R1C model per zone with the chosen system (energy.js thermalZones). */
export function thermalZones(prog: keyof typeof OPS, zs: ZoneIn[], sys: ThermSys, C: ClimatePayload, E: EnergySettings = ENERGY_DEFAULTS, hour: number | null = null): ThermalZone[] {
  const P = prepClimate(C), n = P.n, ms = MASS[E.mass] ?? MASS.medium
  const ops = OPS[prog] ?? OPS.office, sch = schedOf(OPS[prog] ? prog : 'office'), allDay = prog === 'resi' || prog === 'hotel'
  const heatOn = sys === 'heat' || sys === 'heatwin' || sys === 'full', coolOn = sys === 'full', winOn = sys === 'win' || sys === 'heatwin'
  const clock = new Int8Array(n)
  for (let k = 0; k < n; k++) clock[k] = (k % 24 + ((TZ_BY_MONTH[P.mon[k]] ?? -8) + 8)) % 24
  return zs.map((z): ThermalZone => {
    const Af = Math.max(1, z.area), Hw = z.Agl * E.glazU, Hop = z.Aop * E.wallU + z.roof * E.roofU
    const At = 4.5 * Af, Am = ms.am * Af, Cm = ms.cm * Af, His = 3.45 * At, Hms = 9.1 * Am, Hem = Hop > 0 ? (Hop < Hms * 0.99 ? 1 / (1 / Hop - 1 / Hms) : Hop * 50) : 0
    const faces = z.sol.map((q) => ({ g: q.g * 0.9 * (E.shade ?? 0.85), F: faceHours(P, q.az) }))
    const To = new Float32Array(n), bins = [0, 0, 0, 0, 0]
    let occN = 0, heat = 0, cool = 0, openH = 0, over26 = 0
    const loss = { glass: 0, wall: 0, roof: 0, vent: 0, infil: 0 }
    const mon = { min: new Array(12).fill(99), max: new Array(12).fill(-99), sum: new Array(12).fill(0), cnt: new Array(12).fill(0) }
    let Tm = 20
    const lightOn = E.lpd * ops.lightF * 0.75 * Af
    // two passes: the last two weeks warm the mass up, then the year
    for (let pass = 0; pass < 2; pass++) for (let k = pass ? 0 : n - 336; k < n; k++) {
      const m = P.mon[k], Te = P.T[k], occ = occupied(sch, k, P), ck = clock[k]
      let sol = 0
      for (const q of faces) sol += q.g * (q.F.sky[k] + q.F.gnd[k] + q.F.beam[k])
      const lightW = allDay ? E.lpd * ops.lightF * Af * PROF.light[ck] : (occ ? lightOn : 0)
      const equipW = E.equip * ops.eqF * Af * (allDay ? PROF.equip[ck] : (occ ? 1 : 0.2))
      const peopleW = allDay ? Af / ops.occ * 75 * PROF.people[ck] : (occ ? Af / ops.occ * 75 : 0)
      const phiInt = peopleW + lightW + equipW
      const Hmech = 1200 * (occ ? E.vent / 1000 * Af * (1 - E.hr) : 0), Hinf = 1200 * E.infil * z.vol / 3600
      const solveH = (phiHC: number, Hve: number) => {
        const H1 = 1 / (1 / Hve + 1 / His), H2 = H1 + Hw, H3 = 1 / (1 / H2 + 1 / Hms)
        const phiM0 = Am / At * (0.5 * phiInt + sol), phiSt0 = (1 - Am / At - Hw / (9.1 * At)) * (0.5 * phiInt + sol), phiIa = 0.5 * phiInt + phiHC
        const mtot = phiM0 + Hem * Te + H3 * (phiSt0 + Hw * Te + H1 * (phiIa / Hve + Te)) / H2
        const TmN = (Tm * (Cm / 3600 - 0.5 * (H3 + Hem)) + mtot) / (Cm / 3600 + 0.5 * (H3 + Hem)), Tmm = (TmN + Tm) / 2
        const Ts = (Hms * Tmm + phiSt0 + Hw * Te + H1 * (Te + phiIa / Hve)) / (Hms + Hw + H1)
        const Ta = (His * Ts + Hve * Te + phiIa) / (His + Hve)
        return { Ta, Ts, TmN }
      }
      let Hve = Math.max(1e-6, Hmech + Hinf), res = solveH(0, Hve), phi = 0, opened = false
      if (winOn && z.operable && res.Ta > 24 && Te < res.Ta - 1 && Te > 10 && (occ || allDay)) { Hve += 1200 * z.ach * z.vol / 3600; res = solveH(0, Hve); opened = true }
      const sH = occ ? E.setH : E.setH - 4, sC = occ ? E.setC : E.setC + 4
      if ((heatOn && res.Ta < sH) || (coolOn && res.Ta > sC)) {
        const tgt = res.Ta < sH ? sH : sC, r10 = solveH(10 * Af, Hve)
        phi = 10 * Af * (tgt - res.Ta) / (r10.Ta - res.Ta)
        if (phi < 0 && !coolOn) phi = 0
        if (phi > 0 && !heatOn) phi = 0
        res = solveH(phi, Hve)
      }
      Tm = res.TmN
      if (!pass) continue
      const t = (res.Ta + res.Ts) / 2
      To[k] = t
      if (occ) { occN++; let b = 0; while (b < 4 && t >= T_BINS[b]) b++; bins[b]++; if (t > 26) over26++ }
      if (phi > 0) heat += phi / 1000; else cool -= phi / 1000
      if (opened) openH++
      const dT = res.Ta - Te
      if (dT > 0) { loss.glass += Hw * dT / 1000; loss.wall += z.Aop * E.wallU * dT / 1000; loss.roof += z.roof * E.roofU * dT / 1000; loss.vent += Hmech * dT / 1000; loss.infil += Hinf * dT / 1000 }
      if (t < mon.min[m]) mon.min[m] = t
      if (t > mon.max[m]) mon.max[m] = t
      mon.sum[m] += t; mon.cnt[m]++
    }
    let tMin = Infinity, tMax = -Infinity, tS = 0
    for (let k = 0; k < n; k++) { const t = To[k]; if (t < tMin) tMin = t; if (t > tMax) tMax = t; tS += t }
    return {
      key: z.key, name: z.name, idx: z.idx, area: z.area, Agl: z.Agl, Aop: z.Aop, fac: z.fac, roof: z.roof, operable: z.operable,
      To, bins, occN, heat, cool, openH, loss, lossFac: z.fac ? (loss.glass + loss.wall) / z.fac : 0,
      mon: { min: mon.min, max: mon.max, mean: mon.sum.map((v, i) => v / Math.max(1, mon.cnt[i])) },
      over26, overShare: occN ? over26 / occN : 0, tMin, tMax, tMean: tS / n, Tk: hour != null && hour >= 0 && hour < n ? To[hour] : null,
    }
  })
}

export interface ThermalOptions {
  sys?: ThermSys
  energy?: EnergySettings
  /** Ventilation mode (window air changes: cross 6 / single 4 at the perimeter; interior 2, single-sided 0.5). */
  ventMode?: VentSettings['mode']
  /** Hour of the year (0–8759) to report Tk for (see thermMoments). */
  hour?: number | null
}

const FD4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * One floor split into 5 m perimeter zones per face and the interior, each run through thermalZones (study.js
 * thermalFloor). `floors` = the tower's floors, for the roof, terrace and void under the floor above.
 */
export function thermalFloor(f: SwFloor, floors: SwFloor[], zones: FacadeZone[], C: ClimatePayload, opts: ThermalOptions = {}): ThermalFloor {
  const sys = opts.sys ?? 'full', E = opts.energy ?? ENERGY_DEFAULTS, mode = opts.ventMode ?? 'cross', hour = opts.hour ?? null
  const m = f.mask, nx = m.nx, ny = m.ny, N = nx * ny, h = m.h, lvl = f.level, band5 = Math.max(1, Math.round(5 / h))
  const core = (ix: number, iy: number) => inCore(f, m.x0 + (ix + 0.5) * h, m.y0 + (iy + 0.5) * h)
  // each floor cell to the zone of the nearest face within 5 m, else the interior
  const zid = new Int8Array(N).fill(-1), dist = new Int16Array(N), q: number[] = []
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!solidAt(m, ix, iy) || core(ix, iy)) continue
    const k = iy * nx + ix
    for (const [dx, dy] of FD4) if (!solidAt(m, ix + dx, iy + dy)) { zid[k] = ORI.indexOf(cardinalOf(dx, dy, f.rot)); dist[k] = 1; q.push(k); break }
  }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], ix = k % nx, iy = (k / nx) | 0
    if (dist[k] >= band5) continue
    for (const [dx, dy] of FD4) {
      const jx = ix + dx, jy = iy + dy
      if (!solidAt(m, jx, jy) || core(jx, jy)) continue
      const j = jy * nx + jx
      if (zid[j] < 0) { zid[j] = zid[k]; dist[j] = dist[k] + 1; q.push(j) }
    }
  }
  const cnt = [0, 0, 0, 0, 0]
  for (let k = 0; k < N; k++) {
    if (zid[k] >= 0) cnt[zid[k]]++
    else { const ix = k % nx, iy = (k / nx) | 0; if (solidAt(m, ix, iy) && !core(ix, iy)) { zid[k] = 4; cnt[4]++ } }
  }
  const tot = cnt.reduce((a, b) => a + b, 0) || 1, off = faceOffset(f.rot)
  const fac: Record<Face, { A: number; gl: number; sol: number }> = { N: { A: 0, gl: 0, sol: 0 }, E: { A: 0, gl: 0, sol: 0 }, S: { A: 0, gl: 0, sol: 0 }, W: { A: 0, gl: 0, sol: 0 } }
  for (const e of f.edges) {
    const z = zoneFor(zones, e.zf, lvl), A = e.L * f.h, t = zoneSolarT(C, z, e.az, band(f, z).gh)
    fac[e.o].A += A; fac[e.o].gl += A * z.wwr; fac[e.o].sol += A * z.wwr * z.shgc * t
  }
  // the floor's own roof / terrace and the void under the floor above (the Studio: terrace + roof + below.coveredVoid)
  const near = floors.filter((g) => g.towerId === f.towerId && (g === f || Math.abs(g.z - (f.z + f.h)) < 0.05 || Math.abs(g.z + g.h - f.z) < 0.05))
  const ex = floorExposure(near), me = ex[near.indexOf(f)], bi = near.findIndex((g) => Math.abs(g.z + g.h - f.z) < 0.05)
  const roofA = (me?.terrace ?? 0) + (me?.roof ?? 0) + (bi >= 0 ? ex[bi].coveredVoid : 0)
  const anyOp = ORI.some((o) => zoneFor(zones, o, lvl).operable && fac[o].A > 0)
  const zs: ZoneIn[] = []
  for (let i = 0; i < 5; i++) {
    if (!cnt[i]) continue
    const area = cnt[i] * h * h, o = ORI[i], F = i < 4 ? fac[o] : { A: 0, gl: 0, sol: 0 }
    zs.push({
      key: i < 4 ? o : 'C', name: i < 4 ? FACE_NAME[o] + ' side' : 'Interior', idx: i, area, vol: area * (f.h - 0.4), Agl: F.gl, Aop: Math.max(0, F.A - F.gl), fac: F.A,
      roof: roofA * cnt[i] / tot, sol: i < 4 && F.sol > 0 ? [{ az: Math.round((FACE_AZ[o] + off + 360) % 360), g: F.sol }] : [],
      operable: i < 4 ? (zoneFor(zones, o, lvl).operable && F.A > 0) : anyOp, ach: i < 4 ? (mode === 'cross' ? 6 : 4) : (mode === 'single' ? 0.5 : 2),
    })
  }
  const prog = PROG_OF[f.use] ?? 'office'
  const out = thermalZones(prog, zs, sys, C, E, hour)
  const loss = { glass: 0, wall: 0, roof: 0, vent: 0, infil: 0, total: 0, perM2: 0 }
  let area = 0
  for (const z of out) { loss.glass += z.loss.glass; loss.wall += z.loss.wall; loss.roof += z.loss.roof; loss.vent += z.loss.vent; loss.infil += z.loss.infil; area += z.area }
  loss.total = loss.glass + loss.wall + loss.roof + loss.vent + loss.infil
  loss.perM2 = area ? loss.total / area : 0
  return { sys, zones: out, zid, nx, ny, x0: m.x0, y0: m.y0, cell: h, loss, hour }
}

/** The hours the cold-snap and heat-wave views show: 7:00 on the coldest day, 16:00 on the hottest (study.js thermMoments). */
export function thermMoments(C: ClimatePayload): { cold: { k: number; Te: number }; hot: { k: number; Te: number } } {
  const P = prepClimate(C)
  let dc = 0, dh = 0, mc = 1e9, mh = -1e9
  for (let d = 0; d < 365; d++) {
    let s = 0, mx = -1e9
    for (let hh = 0; hh < 24; hh++) { const t = P.T[d * 24 + hh]; s += t; if (t > mx) mx = t }
    if (s / 24 < mc) { mc = s / 24; dc = d }
    if (mx > mh) { mh = mx; dh = d }
  }
  return { cold: { k: dc * 24 + 7, Te: P.T[dc * 24 + 7] }, hot: { k: dh * 24 + 16, Te: P.T[dh * 24 + 16] } }
}
