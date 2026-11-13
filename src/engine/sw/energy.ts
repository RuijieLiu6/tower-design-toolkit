// Hourly energy model for a tower, ported from Sinnie Choi's Sun & Wind Studio (energy.js modelHourly, program OPS,
// TARGETS, schedOf, occupied, PROF; settings defaults from core.js initState `energy`). It is the ISO 13790 five-
// resistance, one-capacitance (5R1C) hourly model as in the open-source RC_BuildingSimulator: one zone per program,
// all 8,760 hours of the CWEC typical year, Perez all-weather solar gains on each face at its true azimuth, program
// schedules with a 4 K setback, ventilation heat recovery, heat-pump and chiller efficiency following the outdoor
// temperature. Here it takes the floors, the climate and the settings as inputs instead of LAB.S / LAB.floors /
// LAB.CLIMATE / LAB.phys.
//
// Deviations from Sun & Wind Studio (stated, not hidden):
//  - Envelope from the toolkit's plate rings: each ring edge is a wall of compass azimuth edgeAzimuth(...) at its true
//    angle (S&W folds a floor's rotation into ±45° and keeps four N/E/S/W faces). Solar gains use the edge's own azimuth
//    (S&W does too, via faceOffset); WWR is taken from the nearest compass face (N/E/S/W 45° sectors).
//  - Glazing is the uniform setting per face (wwrN/E/S/W, one SHGC, shading transmission t = 1). S&W reads the façade
//    zones (zoneGlazing) and their shading devices when the user has drawn them; these are the same defaults.
//  - Roofs, terraces and soffits from plate-area differences between floors that touch (not a polygon overlap).
//  - No daylight-linked dimming (S&W also credits none until its daylight run exists).
//  - Toolkit uses map to S&W programs: residential → resi, civic → public, mechanical → mep (unconditioned),
//    amenity → amenity (S&W treats it as an open sky garden: unconditioned).
//  - True north: the caller passes northDeg (0 when no site is known: frame +y = true north).
//  - The monthly fallback (modelMonthly) is not ported: the climate payload always carries 8,760 hours.
//  - Optional façade irradiance from the Sun node (FacadeField 'facade-irradiance'): see solarScale below.
import type { ClimatePayload, FacadeFace } from './types'
import type { UseId } from '../types'
import { TZ_BY_MONTH, edgeAzimuth, faceHours, prepClimate, ringIsCcw, type ClimateHours } from './climate'

type Pt = [number, number]

/** Sun & Wind Studio program ids used by the energy model. */
export type SwProg = 'office' | 'retail' | 'hotel' | 'resi' | 'public' | 'amenity' | 'mep'

/** Toolkit use → S&W program (team mapping). */
export const PROG_OF: Record<UseId, SwProg> = {
  office: 'office', retail: 'retail', hotel: 'hotel', residential: 'resi', civic: 'public', amenity: 'amenity', mechanical: 'mep',
}

/** Per-program operation (S&W OPS): hours per week, m² per person, hot water kWh/m²·yr, lighting / equipment factors. */
export const OPS: Record<SwProg, { hrs: number; occ: number; dhw: number; lightF: number; eqF: number; open?: boolean }> = {
  office: { hrs: 60, occ: 18, dhw: 5, lightF: 1, eqF: 1 },
  retail: { hrs: 84, occ: 8, dhw: 4, lightF: 1.6, eqF: 0.8 },
  hotel: { hrs: 168, occ: 48, dhw: 45, lightF: 0.8, eqF: 0.5 },
  resi: { hrs: 168, occ: 42, dhw: 25, lightF: 0.6, eqF: 0.6 },
  public: { hrs: 84, occ: 12, dhw: 8, lightF: 1.2, eqF: 0.7 },
  amenity: { hrs: 84, occ: 30, dhw: 3, lightF: 0.5, eqF: 0.3, open: true },
  mep: { hrs: 168, occ: 1000, dhw: 0, lightF: 0.3, eqF: 2, open: true },
}

/**
 * S&W TARGETS: "indicative City of Vancouver rezoning targets (Zero Emissions Building Plan, approximate)", TEUI and
 * TEDI in kWh/m²·yr, GHGI in kgCO₂e/m²·yr, weighted by program floor area. Transcribed, not checked against the bylaw.
 */
export const TARGETS: Record<SwProg, { teui: number; tedi: number; ghgi: number }> = {
  resi: { teui: 100, tedi: 15, ghgi: 3 }, hotel: { teui: 130, tedi: 30, ghgi: 4 }, office: { teui: 100, tedi: 20, ghgi: 3 },
  retail: { teui: 150, tedi: 30, ghgi: 4 }, public: { teui: 120, tedi: 25, ghgi: 3 }, amenity: { teui: 40, tedi: 5, ghgi: 1 },
  mep: { teui: 60, tedi: 5, ghgi: 2 },
}

/** Thermal mass per m² of floor: effective mass area factor and heat capacity (J/K·m²), ISO 13790 Table 12. */
export const MASS = { light: { am: 2.5, cm: 110000 }, medium: { am: 2.5, cm: 165000 }, heavy: { am: 3.0, cm: 260000 } } as const
export type MassId = keyof typeof MASS
export type HeatId = 'hp' | 'gas' | 'res'
/** Fan power, W per L/s of outdoor air (balanced supply and extract with heat recovery). */
const SFP = 1.2
/** Emission factors used by S&W: gas 0.18, BC electricity 0.011 kgCO₂e/kWh. */
export const EF = { gas: 0.18, elec: 0.011 }

const H24 = (...runs: [number, number][]) => { const a: number[] = []; for (const [n, v] of runs) for (let i = 0; i < n; i++) a.push(v); return a }
/** Diurnal profiles for programs lived in around the clock (NECB / ASHRAE 90.1 residential shapes), by clock hour. */
const PROF = {
  people: H24([7, 0.9], [2, 0.5], [8, 0.25], [5, 0.7], [2, 0.9]),
  light: H24([6, 0.05], [2, 0.3], [9, 0.1], [6, 0.5], [1, 0.2]),
  equip: H24([6, 0.3], [3, 0.6], [8, 0.4], [6, 0.8], [1, 0.5]),
}

interface Sched { d: number; a: number; b: number }
export function schedOf(p: SwProg): Sched {
  const h = OPS[p].hrs
  return h >= 168 ? { d: 7, a: 0, b: 24 } : h >= 98 ? { d: 7, a: 8, b: 22 } : h >= 84 ? { d: 7, a: 8, b: 20 } : h >= 70 ? { d: 5, a: 7, b: 21 } : { d: 5, a: 7, b: 19 }
}
const clockOf = (P: ClimateHours, k: number) => (k % 24 + ((TZ_BY_MONTH[P.mon[k]] ?? -8) + 8)) % 24
export function occupied(s: Sched, k: number, P: ClimateHours): boolean {
  const dow = Math.floor(k / 24) % 7
  if (s.d === 5 && dow >= 5) return false
  const clock = clockOf(P, k)
  return clock >= s.a && clock < s.b
}

/** S&W energy settings (core.js initState `energy`). */
export interface EnergySettings {
  wwrN: number; wwrE: number; wwrS: number; wwrW: number
  glazU: number; wallU: number; roofU: number; shgc: number
  infil: number; vent: number; hr: number; lpd: number; equip: number
  heat: HeatId; cop: number; setH: number; setC: number
  /** Share of solar gain reaching the façade past context (S&W 'Context shading on solar gains'). */
  shade: number
  mass: MassId
}
export const ENERGY_DEFAULTS: EnergySettings = {
  wwrN: 0.35, wwrE: 0.4, wwrS: 0.45, wwrW: 0.4, glazU: 1.4, wallU: 0.28, roofU: 0.18, shgc: 0.35, infil: 0.2, vent: 0.35,
  hr: 0.7, lpd: 6, equip: 8, heat: 'hp', cop: 3.5, setH: 21, setC: 25, shade: 0.85, mass: 'medium',
}

export interface EnergyFloor { z0: number; z1: number; area: number; use: UseId; ring: Pt[] }

export interface ZoneResult {
  prog: SwProg; area: number; floors: number; cond: boolean
  heat: number; cool: number; light: number; equip: number; dhw: number; aux: number; total: number
  tedi: number; solar: number; internal: number; teui: number; ghgi: number
}
export interface EnergyResult {
  gfa: number
  /** kWh/m²·yr */
  teui: number; tedi: number
  /** kgCO₂e/m²·yr */
  ghgi: number
  /** kWh/yr */
  total: number; gas: number; elec: number; solar: number
  /** Design-hour peaks of the typical year, W/m² of floor (heating and cooling demand before the plant). */
  peakH: number; peakC: number
  /** Program-weighted targets. */
  tgt: { teui: number; tedi: number; ghgi: number }
  zones: ZoneResult[]
  /** Glazed area (m²) and opaque wall (m²). */
  glazing: number; wall: number
  /** Mean scale applied to the unshaded solar gains (shade setting, or from the façade field), glass-area weighted. */
  solarScale: number
  /** Share of glazed area whose solar gains were scaled by the façade field (0 when no field). */
  fieldCover: number
  /** Energy by end use and month (kWh), as the Studio's monthly chart. */
  mon: Record<EndUse, number[]>
  /** Heating and cooling demand per hour of the year (kW, the whole building), for the load carpet. */
  hourly: { heat: Float32Array; cool: Float32Array }
  /** Heat lost by path over the hours the inside is warmer than the outside (kWh a year), with what offsets it. */
  loss: { glass: Record<Ori, number>; wall: Record<Ori, number>; roof: number; vent: number; infil: number; recov: number; solar: number; internal: number }
  /** Envelope areas (m²): glass and opaque wall by face, roofs and soffits. */
  env: { glass: Record<Ori, number>; wall: Record<Ori, number>; roof: number }
  /** People in the building (floor area over the program's m² per person). */
  people: number
}
export type EndUse = 'heat' | 'cool' | 'light' | 'equip' | 'dhw' | 'aux'
export const END_USES: EndUse[] = ['heat', 'cool', 'light', 'equip', 'dhw', 'aux']

const ORI = ['N', 'E', 'S', 'W'] as const
type Ori = (typeof ORI)[number]
const oriOf = (az: number): Ori => ORI[Math.round((((az % 360) + 360) % 360) / 90) % 4]
const ringArea = (r: Pt[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; s += x0 * y1 - x1 * y0 } return Math.abs(s) / 2 }
const angDiff = (a: number, b: number) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return d > 180 ? 360 - d : d }

/** Unshaded annual irradiance on a vertical face (kWh/m²·yr), Perez sky + beam + ground, as the model uses it. */
function annualOnFace(P: ClimateHours, az: number): number {
  const F = faceHours(P, az)
  let s = 0
  for (let k = 0; k < P.n; k++) s += F.sky[k] + F.gnd[k] + F.beam[k]
  return s / 1000
}

/**
 * Solar scale for one wall from the Sun node's façade field: the area- and height-overlap-weighted annual irradiance of
 * the field faces of this tower within ±45° of the wall's azimuth that overlap its height, divided by the unshaded
 * annual irradiance this model computes for that azimuth. The hourly shape stays the climate's; the annual amount
 * becomes the field's (context shading included). Clamped to 0–1.5. Null when no field face matches.
 */
function fieldScale(faces: FacadeFace[], az: number, z0: number, z1: number, unshaded: number): number | null {
  let w = 0, v = 0, best = 46
  for (const f of faces) best = Math.min(best, angDiff(f.az, az))
  if (best > 45) return null
  for (const f of faces) {
    if (angDiff(f.az, az) > best + 5) continue
    const ov = Math.min(z1, f.z1) - Math.max(z0, f.z0)
    if (ov <= 0) continue
    const wt = ov * Math.max(1e-6, f.area) / Math.max(1e-6, f.z1 - f.z0)
    w += wt; v += wt * f.value
  }
  if (w <= 0 || unshaded <= 0) return null
  return Math.max(0, Math.min(1.5, v / w / unshaded))
}

interface Zone {
  p: SwProg; area: number; vol: number; floors: number; open: boolean
  Agl: Record<Ori, number>; Aop: Record<Ori, number>; roof: number
  /** Effective solar aperture (m²: glazed area × SHGC × t × scale) by rounded azimuth. */
  Gaz: Map<number, number>
}

/**
 * The 5R1C hourly model for one building (one tower's floors). Floors carry their plate ring (project frame, x east,
 * y north); northDeg turns the frame to true north. `facade` = the Sun node's façade faces for this building.
 */
export function energyModel(floors: EnergyFloor[], C: ClimatePayload, s: EnergySettings, opts: { northDeg?: number; facade?: FacadeFace[] } = {}): EnergyResult {
  const P = prepClimate(C), n = P.n, northDeg = opts.northDeg ?? 0
  const facade = opts.facade && opts.facade.length ? opts.facade : null
  const ms = MASS[s.mass] ?? MASS.medium
  const gasHeat = s.heat === 'gas'
  const etaH = 3.0 / (308.15 / 28), etaC = s.cop / (280.15 / 38)
  const copH = (T: number) => s.heat === 'hp' ? Math.max(1.5, Math.min(5, etaH * 308.15 / Math.max(5, 35 - T))) : (gasHeat ? 0.92 : 1)
  const copC = (T: number) => Math.max(s.cop * 0.6, Math.min(s.cop * 1.6, etaC * 280.15 / Math.max(5, T + 3)))
  const effW = s.heat === 'hp' ? 2.5 : (gasHeat ? 0.85 : 1)
  const wwr: Record<Ori, number> = { N: s.wwrN, E: s.wwrE, S: s.wwrS, W: s.wwrW }
  const unshadedCache = new Map<number, number>()
  const unshaded = (az: number) => { const k = Math.round(az) % 360; let v = unshadedCache.get(k); if (v === undefined) { v = annualOnFace(P, k); unshadedCache.set(k, v) } return v }

  // ---- zones and envelope from the floors
  const zones = new Map<SwProg, Zone>()
  const areas = floors.map((f) => ringArea(f.ring))
  let glazing = 0, wall = 0, scaleW = 0, scaleA = 0, fieldA = 0
  floors.forEach((f, i) => {
    if (!(f.area > 0)) return
    const p = PROG_OF[f.use] ?? 'office'
    let z = zones.get(p)
    if (!z) { z = { p, area: 0, vol: 0, floors: 0, open: !!OPS[p].open, Agl: { N: 0, E: 0, S: 0, W: 0 }, Aop: { N: 0, E: 0, S: 0, W: 0 }, roof: 0, Gaz: new Map() }; zones.set(p, z) }
    const h = f.z1 - f.z0
    z.area += f.area; z.vol += f.area * Math.max(0.1, h - 0.4); z.floors++
    // exposed roof / terrace above and soffit below, from the plate areas of the floors that touch
    let above = 0, below = 0
    floors.forEach((g, j) => { if (j === i) return; if (Math.abs(g.z0 - f.z1) < 0.05) above += areas[j]; if (Math.abs(g.z1 - f.z0) < 0.05) below += areas[j] })
    z.roof += Math.max(0, areas[i] - above) + (f.z0 > 0.05 ? Math.max(0, areas[i] - below) : 0)
    const ring = f.ring, ccw = ringIsCcw(ring)
    for (let e = 0; e < ring.length; e++) {
      const a = ring[e], b = ring[(e + 1) % ring.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-6) continue
      const az = edgeAzimuth(a, b, northDeg, ccw), o = oriOf(az), A = len * h, Ag = A * wwr[o]
      z.Agl[o] += Ag; z.Aop[o] += A - Ag; glazing += Ag; wall += A - Ag
      const key = Math.round(az) % 360
      const fs = facade ? fieldScale(facade, az, f.z0, f.z1, unshaded(key)) : null
      // S&W: gain = glazed area × SHGC × t × 0.9 (frame) × shade; with the field, its scale replaces `shade`.
      const scale = fs ?? s.shade
      if (fs !== null) fieldA += Ag
      scaleW += Ag * scale; scaleA += Ag
      z.Gaz.set(key, (z.Gaz.get(key) ?? 0) + Ag * s.shgc * 1 * scale)
    }
  })

  // ---- per-hour clock (shared)
  const clock = new Int8Array(n)
  for (let k = 0; k < n; k++) clock[k] = clockOf(P, k)

  const hH = new Float64Array(n), hC = new Float64Array(n)
  const out: ZoneResult[] = []
  let gasK = 0, elecK = 0, tediK = 0, totalK = 0, solarK = 0
  const mon = Object.fromEntries(END_USES.map((u) => [u, new Array(12).fill(0)])) as Record<EndUse, number[]>
  const z4 = (): Record<Ori, number> => ({ N: 0, E: 0, S: 0, W: 0 })
  const loss = { glass: z4(), wall: z4(), roof: 0, vent: 0, infil: 0, recov: 0, solar: 0, internal: 0 }
  const env = { glass: z4(), wall: z4(), roof: 0 }
  let people = 0
  for (const z of zones.values()) {
    const p = z.p, ops = OPS[p], sch = schedOf(p), cond = !z.open, Af = z.area
    const Hw = ORI.reduce((t, o) => t + z.Agl[o] * s.glazU, 0)
    const Hop = ORI.reduce((t, o) => t + z.Aop[o] * s.wallU, 0) + z.roof * s.roofU
    const At = 4.5 * Af, Am = ms.am * Af, Cm = ms.cm * Af, His = 3.45 * At, Hms = 9.1 * Am
    const Hem = Hop < Hms * 0.99 ? 1 / (1 / Hop - 1 / Hms) : Hop * 50
    // hourly solar gain (W) on this zone's glass: Perez sky + beam + ground per azimuth × aperture × 0.9 frame
    const sol = new Float64Array(n)
    for (const [az, g] of z.Gaz) {
      if (!(g > 0)) continue
      const F = faceHours(P, az), gg = g * 0.9
      for (let k = 0; k < n; k++) sol[k] += gg * (F.sky[k] + F.gnd[k] + F.beam[k])
    }
    const r: ZoneResult = { prog: p, area: Af, floors: z.floors, cond, heat: 0, cool: 0, light: 0, equip: 0, dhw: 0, aux: 0, total: 0, tedi: 0, solar: 0, internal: 0, teui: 0, ghgi: 0 }
    let Tm = 20
    const lightOn = s.lpd * ops.lightF * 0.75 * Af
    const allDay = p === 'resi' || p === 'hotel'
    const occAirFix = s.vent / 1000 * Af * (1 - s.hr), infAir = s.infil * z.vol / 3600
    for (const o of ORI) { env.glass[o] += z.Agl[o]; env.wall[o] += z.Aop[o] }
    env.roof += z.roof
    if (cond) people += Af / ops.occ
    for (let k = 0; k < n; k++) {
      const Te = P.T[k], occ = occupied(sch, k, P), ck = clock[k], so = sol[k]
      const dim = 0 // no daylight run in the toolkit: S&W credits no dimming without it
      const lightW = allDay ? s.lpd * ops.lightF * Af * PROF.light[ck] : (occ ? lightOn * (1 - dim) : 0)
      const equipW = s.equip * ops.eqF * Af * (allDay ? PROF.equip[ck] : (occ ? 1 : 0.2))
      const peopleW = allDay ? Af / ops.occ * 75 * PROF.people[ck] : (occ ? Af / ops.occ * 75 : 0)
      const phiInt = peopleW + lightW + equipW
      const Hve = Math.max(1e-6, 1200 * ((occ ? occAirFix : 0) + infAir))
      const H1 = 1 / (1 / Hve + 1 / His), H2 = H1 + Hw, H3 = 1 / (1 / H2 + 1 / Hms)
      const phiM0 = Am / At * (0.5 * phiInt + so), phiSt0 = (1 - Am / At - Hw / (9.1 * At)) * (0.5 * phiInt + so)
      const solve = (phiHC: number) => {
        const phiIa = 0.5 * phiInt + phiHC
        const mtot = phiM0 + Hem * Te + H3 * (phiSt0 + Hw * Te + H1 * (phiIa / Hve + Te)) / H2
        const TmN = (Tm * (Cm / 3600 - 0.5 * (H3 + Hem)) + mtot) / (Cm / 3600 + 0.5 * (H3 + Hem))
        const Tmm = (TmN + Tm) / 2
        const Ts = (Hms * Tmm + phiSt0 + Hw * Te + H1 * (Te + phiIa / Hve)) / (Hms + Hw + H1)
        const Ta = (His * Ts + Hve * Te + phiIa) / (His + Hve)
        return { Ta, TmN }
      }
      let res = solve(0), phi = 0
      if (cond) {
        const sH = occ ? s.setH : s.setH - 4, sC = occ ? s.setC : s.setC + 4
        if (res.Ta < sH || res.Ta > sC) {
          const tgt = res.Ta < sH ? sH : sC
          const r10 = solve(10 * Af)
          phi = 10 * Af * (tgt - res.Ta) / (r10.Ta - res.Ta)
          res = solve(phi)
        }
      }
      Tm = res.TmN
      const qh = phi > 0 ? phi / 1000 : 0, qc = phi < 0 ? -phi / 1000 : 0
      hH[k] += qh; hC[k] += qc
      const aux = (occ ? SFP * s.vent * Af / 1000 : 0) + 0.02 * (qh + qc) + 4 * Af / 8760
      r.heat += qh / copH(Te); r.cool += qc / copC(Te); r.light += lightW / 1000; r.equip += equipW / 1000; r.aux += aux
      r.tedi += qh; r.solar += so / 1000; r.internal += phiInt / 1000
      const m = P.mon[k]
      mon.heat[m] += qh / copH(Te); mon.cool[m] += qc / copC(Te); mon.light[m] += lightW / 1000; mon.equip[m] += equipW / 1000; mon.aux[m] += aux
      const dT = res.Ta - Te
      if (cond && dT > 0) {
        const kd = dT / 1000
        for (const o of ORI) { loss.glass[o] += z.Agl[o] * s.glazU * kd; loss.wall[o] += z.Aop[o] * s.wallU * kd }
        loss.roof += z.roof * s.roofU * kd; loss.infil += 1200 * infAir * kd
        if (occ) { loss.vent += 1200 * occAirFix * kd; loss.recov += 1200 * (s.vent / 1000 * Af * s.hr) * kd }
        loss.solar += so / 1000; loss.internal += phiInt / 1000
      }
    }
    r.dhw = ops.dhw * Af / effW
    for (let m = 0; m < 12; m++) mon.dhw[m] += r.dhw * C.days[m] / 365
    r.total = r.heat + r.cool + r.light + r.equip + r.dhw + r.aux
    r.teui = r.total / Af
    const gas = gasHeat ? r.heat + r.dhw : 0, elec = r.total - gas
    r.ghgi = (gas * EF.gas + elec * EF.elec) / Af
    gasK += gas; elecK += elec; tediK += r.tedi; totalK += r.total; solarK += r.solar
    r.tedi /= Af // per m² from here on
    out.push(r)
  }
  out.sort((a, b) => b.total - a.total)
  const gfa = floors.reduce((t, f) => t + (f.area > 0 ? f.area : 0), 0)
  const tgt = { teui: 0, tedi: 0, ghgi: 0 }
  for (const r of out) { const t = TARGETS[r.prog]; tgt.teui += t.teui * r.area; tgt.tedi += t.tedi * r.area; tgt.ghgi += t.ghgi * r.area }
  if (gfa > 0) { tgt.teui /= gfa; tgt.tedi /= gfa; tgt.ghgi /= gfa }
  let pkH = 0, pkC = 0
  for (let k = 0; k < n; k++) { if (hH[k] > pkH) pkH = hH[k]; if (hC[k] > pkC) pkC = hC[k] }
  const g = gfa || 1
  return {
    gfa, teui: totalK / g, tedi: tediK / g, ghgi: (gasK * EF.gas + elecK * EF.elec) / g, total: totalK, gas: gasK, elec: elecK, solar: solarK,
    peakH: pkH * 1000 / g, peakC: pkC * 1000 / g, tgt, zones: out, glazing, wall,
    solarScale: scaleA ? scaleW / scaleA : s.shade, fieldCover: scaleA ? fieldA / scaleA : 0,
    mon, hourly: { heat: Float32Array.from(hH), cool: Float32Array.from(hC) }, loss, env, people,
  }
}
