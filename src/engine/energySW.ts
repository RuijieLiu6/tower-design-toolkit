// Hourly energy use against Vancouver's TEUI / TEDI / GHGI as Sinnie Choi's Sun & Wind Studio computes it: a TypeScript
// port of energy.js modelHourly (the ISO 13790 simple hourly method, 5R1C, as in ETH Zurich's open-source
// RC_BuildingSimulator), with her per-program operation, schedules and residential profiles, plant efficiencies that
// follow the outdoor temperature, and her indicative City of Vancouver rezoning targets; study.js zoneGlazing; and core.js
// finishMask / cellsIn (each floor's facade length by world orientation and its area), at her commit c24addb.
//
// One thermal zone per program; every hour of the CWEC2020 year (daylightSW.ts prep / face); solar gains from the Perez
// sky on each face at its true azimuth; ventilation with heat recovery and setbacks on the program's schedule; lighting
// dimmed by the monthly daylight share of each floor (the daylight port's dsf) for programs not lived in around the clock.
// Her app runs this model whenever the hourly weather is loaded (her monthly model is only its fallback).
//
// Checked against her own code: tools/sunwind-energy-fixtures.cjs records src/engine/energy.fixtures.json and
// energySW.test.ts reproduces every case.
import { ORI, STRATS, zoneFor, face, faceOffset, type DlMask, type Ori, type SkyPrep, type Zone } from './daylightSW'

export type Prog = 'office' | 'studio' | 'retail' | 'hotel' | 'resi' | 'public' | 'amenity' | 'observation' | 'boh' | 'mep'
/** Per-program operation (energy.js OPS): hours per week, m² per person, hot water kWh/m²·yr, lighting and equipment multipliers, unconditioned. */
export const OPS: Record<Prog, { hrs: number; occ: number; dhw: number; lightF: number; eqF: number; open?: boolean }> = {
  office: { hrs: 60, occ: 18, dhw: 5, lightF: 1, eqF: 1 }, studio: { hrs: 70, occ: 25, dhw: 6, lightF: 1, eqF: 1.1 }, retail: { hrs: 84, occ: 8, dhw: 4, lightF: 1.6, eqF: 0.8 },
  hotel: { hrs: 168, occ: 48, dhw: 45, lightF: 0.8, eqF: 0.5 }, resi: { hrs: 168, occ: 42, dhw: 25, lightF: 0.6, eqF: 0.6 }, public: { hrs: 84, occ: 12, dhw: 8, lightF: 1.2, eqF: 0.7 },
  amenity: { hrs: 84, occ: 30, dhw: 3, lightF: 0.5, eqF: 0.3, open: true }, observation: { hrs: 98, occ: 6, dhw: 5, lightF: 1.2, eqF: 0.8 }, boh: { hrs: 84, occ: 200, dhw: 2, lightF: 0.6, eqF: 0.5 }, mep: { hrs: 168, occ: 1000, dhw: 0, lightF: 0.3, eqF: 2, open: true },
}
/** Her indicative City of Vancouver rezoning targets (energy.js TARGETS: "Zero Emissions Building Plan, approximate"), kWh/m²·yr and kgCO₂e/m²·yr. */
export const TARGETS: Record<Prog, { teui: number; tedi: number; ghgi: number }> = {
  resi: { teui: 100, tedi: 15, ghgi: 3 }, hotel: { teui: 130, tedi: 30, ghgi: 4 }, office: { teui: 100, tedi: 20, ghgi: 3 }, studio: { teui: 110, tedi: 20, ghgi: 3 }, retail: { teui: 150, tedi: 30, ghgi: 4 },
  public: { teui: 120, tedi: 25, ghgi: 3 }, observation: { teui: 150, tedi: 30, ghgi: 4 }, amenity: { teui: 40, tedi: 5, ghgi: 1 }, boh: { teui: 60, tedi: 10, ghgi: 2 }, mep: { teui: 60, tedi: 5, ghgi: 2 },
}
export const USES = [['heat', 'Space heating'], ['cool', 'Cooling'], ['light', 'Lighting'], ['equip', 'Plug and process'], ['dhw', 'Hot water'], ['aux', 'Fans, pumps, lifts']] as const
export type UseKey = (typeof USES)[number][0]
const MASS = { light: { am: 2.5, cm: 110000 }, medium: { am: 2.5, cm: 165000 }, heavy: { am: 3.0, cm: 260000 } }
const SFP = 1.2 // W per L/s of outdoor air: balanced supply and extract with heat recovery
const H24 = (...runs: [number, number][]) => { const a: number[] = []; for (const [n, v] of runs) for (let i = 0; i < n; i++) a.push(v); return a }
/** Diurnal profiles for programs lived in around the clock (energy.js PROF, the shape of the NECB / ASHRAE 90.1 residential schedules). */
export const PROF = { people: H24([7, 0.9], [2, 0.5], [8, 0.25], [5, 0.7], [2, 0.9]), light: H24([6, 0.05], [2, 0.3], [9, 0.1], [6, 0.5], [1, 0.2]), equip: H24([6, 0.3], [3, 0.6], [8, 0.4], [6, 0.8], [1, 0.5]) }

/** Her envelope and systems (core.js S.energy): U-values (W/m²K), infiltration (ach), outdoor air (L/s·m²), heat recovery, LPD and plug (W/m²), plant, set points, context shading, thermal mass. */
export interface EnergySettings { glazU: number; wallU: number; roofU: number; infil: number; vent: number; hr: number; lpd: number; equip: number; heat: 'hp' | 'gas' | 'res'; cop: number; setH: number; setC: number; shade: number; mass: 'light' | 'medium' | 'heavy' }
export const DEFAULT_ENERGY: EnergySettings = { glazU: 1.4, wallU: 0.28, roofU: 0.18, infil: 0.2, vent: 0.35, hr: 0.7, lpd: 6, equip: 8, heat: 'hp', cop: 3.5, setH: 21, setC: 25, shade: 0.85, mass: 'medium' }

// ------------------------------------------------------------------------------------------------ floors

/** One floor as the energy model reads it. */
export interface EnergyFloor {
  i: number; prog: Prog; h: number; rot: number; area: number
  /** Facade length (m) by world orientation, as her finishMask counts exposed cell edges. */
  facade: Record<Ori, number>
  /** More than 55% of the plate open: a sky garden, unconditioned. */
  garden: boolean
  /** Exposed top (m²): a terrace (not the top floor) or the roof (the top floor); plate above an open floor below. */
  terrace: number; roof: number; coveredVoid: number
  /** Glazing on each face: window-to-wall ratio, SHGC and the device's solar modifier (her zoneGlazing). */
  glazing: Record<Ori, { wwr: number; shgc: number; t: number }>
}
/** Her finishMask: the core forced solid, the area (w × d × solid share), the open share, the facade lengths by world orientation. */
export function finishPlate(f: { w: number; d: number; cx: number; cy: number; rot: number; core: number; mask: DlMask }, posX: number, posY: number) {
  const m = f.mask, c = Math.cos(f.rot), s = Math.sin(f.rot), dx = posX - f.cx, dy = posY - f.cy
  const cc = { x: dx * c + dy * s, y: -dx * s + dy * c }, ch = f.core / 2 + 0.3
  // cellsIn: every cell whose centre is inside the box
  { const x0 = cc.x - ch, x1 = cc.x + ch, y0 = cc.y - ch, y1 = cc.y + ch
    const ix0 = Math.max(0, Math.floor(x0 - m.x0)), ix1 = Math.min(m.nx - 1, Math.ceil(x1 - m.x0)), iy0 = Math.max(0, Math.floor(y0 - m.y0)), iy1 = Math.min(m.ny - 1, Math.ceil(y1 - m.y0))
    for (let iy = iy0; iy <= iy1; iy++) { const ly = m.y0 + iy + 0.5; if (ly < y0 || ly > y1) continue; for (let ix = ix0; ix <= ix1; ix++) { const lx = m.x0 + ix + 0.5; if (lx < x0 || lx > x1) continue; m.cells[iy * m.nx + ix] = 1 } } }
  let solid = 0, total = 0
  for (let iy = 0; iy < m.ny; iy++) { const ly = m.y0 + iy + 0.5; if (ly > f.d / 2) continue; for (let ix = 0; ix < m.nx; ix++) { const lx = m.x0 + ix + 0.5; if (lx > f.w / 2) continue; total++; if (m.cells[iy * m.nx + ix]) solid++ } }
  const voidFrac = total ? 1 - solid / total : 0, area = f.w * f.d * (total ? solid / total : 1)
  const fac: Record<Ori, number> = { N: 0, E: 0, S: 0, W: 0 }; const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!m.cells[iy * m.nx + ix]) continue; const lx = m.x0 + ix + 0.5, ly = m.y0 + iy + 0.5; if (lx > f.w / 2 || ly > f.d / 2) continue
    for (const [ddx, ddy] of dirs) {
      const jx = ix + ddx, jy = iy + ddy; const outside = jx < 0 || jy < 0 || jx >= m.nx || jy >= m.ny || m.x0 + jx + 0.5 > f.w / 2 || m.y0 + jy + 0.5 > f.d / 2; if (!outside && m.cells[jy * m.nx + jx]) continue
      const a = Math.atan2(ddy, ddx) + f.rot; const deg = (((a * 180) / Math.PI) % 360 + 360) % 360; const o: Ori = deg < 45 || deg >= 315 ? 'E' : deg < 135 ? 'N' : deg < 225 ? 'W' : 'S'; fac[o] += 1
    }
  }
  return { facade: fac, area, voidFrac, garden: voidFrac > 0.55 }
}
/** A face's glazing from the façade zones (study.js zoneGlazing, without her solar study's per-zone transmittance: the strategy's modifier). */
export const zoneGlazing = (zones: Zone[], level: number, o: Ori) => { const z = zoneFor(zones, o, level); return { wwr: z.wwr, shgc: z.shgc, t: STRATS[z.strat].mod || 1 } }

// ------------------------------------------------------------------------------------------------ the model

interface Sched { d: number; a: number; b: number }
const schedOf = (p: Prog): Sched => { const h = OPS[p].hrs; return h >= 168 ? { d: 7, a: 0, b: 24 } : h >= 98 ? { d: 7, a: 8, b: 22 } : h >= 84 ? { d: 7, a: 8, b: 20 } : h >= 70 ? { d: 5, a: 7, b: 21 } : { d: 5, a: 7, b: 19 } }
const DAYLIT_PROG = (p: Prog) => OPS[p].hrs < 168

export interface EnergyRow {
  p: Prog; area: number; floors: number; heat: number; cool: number; light: number; equip: number; dhw: number; aux: number; tedi: number; solar: number; internal: number
  Htr: number; Hve: number; cond: boolean; peakH: number; peakC: number; tMax: number; over26: number; lightSave: number; total: number; teui: number; tediI: number; peakHw: number; peakCw: number; ghgi: number
}
export interface EnergyResult {
  rows: EnergyRow[]
  monthly: Record<UseKey, number[]>
  uses: Record<UseKey, number>
  gfa: number; total: number; teui: number; tedi: number; ghgi: number; gas: number; elec: number
  /** Her targets weighted by each program's area. */
  tgt: { teui: number; tedi: number; ghgi: number }
  envelope: { gl: number; op: number; roof: number }
  glz: Record<Ori, { A: number; wwr: number; shgcT: number; wwrAvg: number; shgcEff: number }>
  people: { jobs: number; residents: number; guests: number; visitors: number; total: number }
  hourly: { heat: Float32Array; cool: Float32Array }
  loss: { glass: Record<Ori, number>; wall: Record<Ori, number>; roof: number; vent: number; infil: number; recov: number; solar: number; internal: number }
  peakH: number; peakC: number; lightSave: number; lightShare: number; daylit: boolean
}
function peopleFor(floors: EnergyFloor[]) {
  const r = { jobs: 0, residents: 0, guests: 0, visitors: 0, total: 0 }
  for (const f of floors) { const a = f.area; switch (f.prog) { case 'office': r.jobs += a / 18; break; case 'studio': r.jobs += a / 25; break; case 'retail': r.jobs += a / 35; r.visitors += a / 8; break; case 'hotel': r.guests += a / 48; r.jobs += a / 300; break; case 'resi': r.residents += a / 42; break; case 'public': r.jobs += a / 60; r.visitors += a / 12; break; case 'observation': r.visitors += a / 5; break; case 'boh': r.jobs += a / 200; break } }
  r.total = r.jobs + r.residents + r.guests; return r
}

/**
 * The tower's energy over the CWEC year (energy.js modelHourly). `dsf`: each floor's monthly daylight share (the daylight
 * port's rows), or null when no daylight result is at hand (no dimming credited, as on her page before a daylight run).
 */
export function energyHourly(P: SkyPrep, C: { tz: number[]; days: number[] }, floors: EnergyFloor[], E: EnergySettings, dsf: (number[] | null)[] | null): EnergyResult {
  const n = 8760; const ms = MASS[E.mass] || MASS.medium
  const gasHeat = E.heat === 'gas'; const etaH = 3.0 / (308.15 / 28), etaC = E.cop / (280.15 / 38)
  const copH = (T: number) => (E.heat === 'hp' ? Math.max(1.5, Math.min(5, (etaH * 308.15) / Math.max(5, 35 - T))) : gasHeat ? 0.92 : 1)
  const copC = (T: number) => Math.max(E.cop * 0.6, Math.min(E.cop * 1.6, (etaC * 280.15) / Math.max(5, T + 3)))
  const effW = E.heat === 'hp' ? 2.5 : E.heat === 'gas' ? 0.85 : 1
  const occupied = (sch: Sched, k: number) => { const doy = Math.floor(k / 24), m = P.mon[k]; const dst = (C.tz[m] || -8) + 8; const clock = ((k % 24) + dst) % 24; const dow = doy % 7; if (sch.d === 5 && dow >= 5) return false; return clock >= sch.a && clock < sch.b }
  interface Z { p: Prog; area: number; vol: number; Agl: Record<Ori, number>; Aop: Record<Ori, number>; Gaz: Record<number, number>; roof: number; soffit: number; floors: number; open: boolean; dsf: number[]; dsfA: number }
  const zones: Record<string, Z> = {}; const glz = {} as EnergyResult['glz']; for (const o of ORI) glz[o] = { A: 0, wwr: 0, shgcT: 0, wwrAvg: 0, shgcEff: 0 }
  floors.forEach((fl, i) => {
    const z = zones[fl.prog] || (zones[fl.prog] = { p: fl.prog, area: 0, vol: 0, Agl: { N: 0, E: 0, S: 0, W: 0 }, Aop: { N: 0, E: 0, S: 0, W: 0 }, Gaz: {}, roof: 0, soffit: 0, floors: 0, open: false, dsf: new Array(12).fill(0), dsfA: 0 })
    z.area += fl.area; z.vol += fl.area * (fl.h - 0.4); z.floors++; z.roof += fl.terrace + fl.roof; z.soffit += i > 0 ? floors[i - 1].coveredVoid : 0
    const off = faceOffset(fl.rot || 0)
    for (const o of ORI) {
      const A = (fl.facade ? fl.facade[o] : 0) * fl.h; const g = fl.glazing[o]; z.Agl[o] += A * g.wwr; z.Aop[o] += A * (1 - g.wwr)
      const az = Math.round(({ N: 0, E: 90, S: 180, W: 270 }[o] + off + 360) % 360); z.Gaz[az] = (z.Gaz[az] || 0) + A * g.wwr * g.shgc * g.t
      glz[o].A += A; glz[o].wwr += A * g.wwr; glz[o].shgcT += A * g.wwr * g.shgc * g.t
    }
    const dr = dsf && dsf[i]; if (dr) { for (let m = 0; m < 12; m++) z.dsf[m] += dr[m] * fl.area; z.dsfA += fl.area }
    if (fl.garden || OPS[fl.prog].open) z.open = true
  })
  for (const o of ORI) { glz[o].wwrAvg = glz[o].A ? glz[o].wwr / glz[o].A : 0; glz[o].shgcEff = glz[o].wwr ? glz[o].shgcT / glz[o].wwr : 0 }
  const monthly = { heat: new Array(12).fill(0), cool: new Array(12).fill(0), light: new Array(12).fill(0), equip: new Array(12).fill(0), dhw: new Array(12).fill(0), aux: new Array(12).fill(0) } as Record<UseKey, number[]>
  const hH = new Float32Array(n), hC = new Float32Array(n); const rows: EnergyRow[] = []; let gasK = 0, elecK = 0, tediK = 0, totalK = 0, saveK = 0
  const envelope = { gl: 0, op: 0, roof: 0 }; const shade = E.shade || 0.85
  const LS: EnergyResult['loss'] = { glass: { N: 0, E: 0, S: 0, W: 0 }, wall: { N: 0, E: 0, S: 0, W: 0 }, roof: 0, vent: 0, infil: 0, recov: 0, solar: 0, internal: 0 }
  for (const p in zones) {
    const z = zones[p], pp = p as Prog, ops = OPS[pp], sch = schedOf(pp), cond = !z.open; const Af = z.area
    if (z.dsfA) for (let m = 0; m < 12; m++) z.dsf[m] /= z.dsfA
    const Hw = ORI.reduce((s, o) => s + z.Agl[o] * E.glazU, 0), Hop = ORI.reduce((s, o) => s + z.Aop[o] * E.wallU, 0) + (z.roof + z.soffit) * E.roofU
    const At = 4.5 * Af, Am = ms.am * Af, Cm = ms.cm * Af, His = 3.45 * At, Hms = 9.1 * Am, Hem = Hop < Hms * 0.99 ? 1 / (1 / Hop - 1 / Hms) : Hop * 50
    envelope.gl += Object.values(z.Agl).reduce((s, v) => s + v, 0); envelope.op += Object.values(z.Aop).reduce((s, v) => s + v, 0); envelope.roof += z.roof + z.soffit
    const faces = Object.entries(z.Gaz).filter(([, g]) => g > 0).map(([az, g]) => { const F = face(P, +az); return { g: g * 0.9 * shade, F } })
    const r: EnergyRow = { p: pp, area: Af, floors: z.floors, heat: 0, cool: 0, light: 0, equip: 0, dhw: 0, aux: 0, tedi: 0, solar: 0, internal: 0, Htr: Hw + Hop, Hve: 0, cond, peakH: 0, peakC: 0, tMax: -99, over26: 0, lightSave: 0, total: 0, teui: 0, tediI: 0, peakHw: 0, peakCw: 0, ghgi: 0 }
    let Tm = 20; const lightOn = E.lpd * ops.lightF * 0.75 * Af, dimOK = DAYLIT_PROG(pp)
    for (let k = 0; k < n; k++) {
      const m = P.mon[k], Te = P.T[k]; const occ = occupied(sch, k)
      let sol = 0; for (const q of faces) sol += q.g * (q.F.sky[k] + q.F.gnd[k] + q.F.beam[k])
      const dst = (C.tz[m] || -8) + 8, clock = ((k % 24) + dst) % 24, dayHour = clock >= 8 && clock < 18
      const dim = occ && dimOK && dayHour ? Math.min(0.9, (z.dsf[m] || 0) * 0.9) : 0; const allDay = pp === 'resi' || pp === 'hotel'
      const lightW = allDay ? E.lpd * ops.lightF * Af * PROF.light[clock] : occ ? lightOn * (1 - dim) : 0; const equipW = E.equip * ops.eqF * Af * (allDay ? PROF.equip[clock] : occ ? 1 : 0.2)
      const peopleW = allDay ? (Af / ops.occ) * 75 * PROF.people[clock] : occ ? (Af / ops.occ) * 75 : 0; const phiInt = peopleW + lightW + equipW
      const Hve = 1200 * ((occ ? (E.vent / 1000) * Af * (1 - E.hr) : 0) + (E.infil * z.vol) / 3600)
      const H1 = 1 / (1 / Hve + 1 / His), H2 = H1 + Hw, H3 = 1 / (1 / H2 + 1 / Hms)
      const phiM0 = (Am / At) * (0.5 * phiInt + sol), phiSt0 = (1 - Am / At - Hw / (9.1 * At)) * (0.5 * phiInt + sol)
      const solve = (phiHC: number) => {
        const phiIa = 0.5 * phiInt + phiHC; const mtot = phiM0 + Hem * Te + (H3 * (phiSt0 + Hw * Te + H1 * (phiIa / Hve + Te))) / H2
        const TmN = (Tm * (Cm / 3600 - 0.5 * (H3 + Hem)) + mtot) / (Cm / 3600 + 0.5 * (H3 + Hem)); const Tmm = (TmN + Tm) / 2
        const Ts = (Hms * Tmm + phiSt0 + Hw * Te + H1 * (Te + phiIa / Hve)) / (Hms + Hw + H1); const Ta = (His * Ts + Hve * Te + phiIa) / (His + Hve); return { Ta, TmN }
      }
      let res = solve(0), phi = 0
      if (cond) { const sH = occ ? E.setH : E.setH - 4, sC = occ ? E.setC : E.setC + 4; if (res.Ta < sH || res.Ta > sC) { const tgt = res.Ta < sH ? sH : sC; const r10 = solve(10 * Af); phi = (10 * Af * (tgt - res.Ta)) / (r10.Ta - res.Ta); res = solve(phi) } }
      {
        const dT = res.Ta - Te
        if (dT > 0) { for (const o of ORI) { LS.glass[o] += (z.Agl[o] * E.glazU * dT) / 1000; LS.wall[o] += (z.Aop[o] * E.wallU * dT) / 1000 } LS.roof += ((z.roof + z.soffit) * E.roofU * dT) / 1000; const oa = occ ? (E.vent / 1000) * Af : 0; LS.vent += (1200 * oa * (1 - E.hr) * dT) / 1000; LS.recov += (1200 * oa * E.hr * dT) / 1000; LS.infil += (((1200 * E.infil * z.vol) / 3600) * dT) / 1000 }
        LS.solar += sol / 1000; LS.internal += phiInt / 1000
      }
      Tm = res.TmN; if (!cond) { if (res.Ta > r.tMax) r.tMax = res.Ta; if (occ && res.Ta > 26) r.over26++ }
      const qh = phi > 0 ? phi / 1000 : 0, qc = phi < 0 ? -phi / 1000 : 0; hH[k] += qh; hC[k] += qc; if (phi > r.peakH) r.peakH = phi; if (-phi > r.peakC) r.peakC = -phi
      const heat = qh / copH(Te), cool = qc / copC(Te); const light = lightW / 1000, equip = equipW / 1000; const aux = (occ ? (SFP * E.vent * Af) / 1000 : 0) + 0.02 * (qh + qc) + (4 * Af) / 8760
      monthly.heat[m] += heat; monthly.cool[m] += cool; monthly.light[m] += light; monthly.equip[m] += equip; monthly.aux[m] += aux
      r.heat += heat; r.cool += cool; r.light += light; r.equip += equip; r.aux += aux; r.tedi += qh; r.solar += sol / 1000; r.internal += phiInt / 1000; r.Hve += Hve / n; r.lightSave += occ ? (lightOn * dim) / 1000 : 0
    }
    for (let m = 0; m < 12; m++) { const dhw = ((ops.dhw * Af) / effW * C.days[m]) / 365; monthly.dhw[m] += dhw; r.dhw += dhw }
    r.total = r.heat + r.cool + r.light + r.equip + r.dhw + r.aux; r.teui = r.total / Af; r.tediI = r.tedi / Af; r.peakHw = r.peakH / Af; r.peakCw = r.peakC / Af
    const gas = gasHeat ? r.heat + r.dhw : 0, elec = r.total - gas; r.ghgi = (gas * 0.18 + elec * 0.011) / Af
    gasK += gas; elecK += elec; tediK += r.tedi; totalK += r.total; saveK += r.lightSave; rows.push(r)
  }
  rows.sort((x, y) => y.total - x.total)
  const gfa = floors.reduce((s, f) => s + f.area, 0)
  const tgt = { teui: 0, tedi: 0, ghgi: 0 }; for (const r of rows) { const t = TARGETS[r.p] || TARGETS.office; tgt.teui += t.teui * r.area; tgt.tedi += t.tedi * r.area; tgt.ghgi += t.ghgi * r.area } tgt.teui /= gfa; tgt.tedi /= gfa; tgt.ghgi /= gfa
  const uses = {} as Record<UseKey, number>; for (const [k] of USES) uses[k] = monthly[k].reduce((s, v) => s + v, 0)
  let pkH = 0, pkC = 0; for (let k = 0; k < n; k++) { if (hH[k] > pkH) pkH = hH[k]; if (hC[k] > pkC) pkC = hC[k] }
  return { rows, monthly, uses, gfa, total: totalK, teui: totalK / gfa, tedi: tediK / gfa, ghgi: (gasK * 0.18 + elecK * 0.011) / gfa, gas: gasK, elec: elecK, tgt, envelope, glz, people: peopleFor(floors),
    hourly: { heat: hH, cool: hC }, loss: LS, peakH: (pkH * 1000) / gfa, peakC: (pkC * 1000) / gfa, lightSave: saveK, lightShare: saveK / Math.max(1, uses.light + saveK), daylit: !!dsf }
}
