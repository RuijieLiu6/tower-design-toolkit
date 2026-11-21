// Photovoltaic yield on the roofs and terraces and on PV spandrels of the façade zones, ported from Sinnie Choi's
// Sun & Wind Studio (study.js solarStudy, its PV rows: 'Photovoltaics' table; SW.pv settings).
//
// The Studio: kWp = area × eff; kWh = (beam on the surface + diffuse allowance × area) × eff × PR, with the roof
// share SW.pv.roof of roofs and terraces, and zone.pv of each zone's spandrel (the opaque 1 − WWR band).
// Deviations (stated): beam is unobstructed from the CWEC hourly record (times an optional context share `shade`),
// where the Studio measures it from shadow renders; the roof's diffuse is 0.9 × the hourly diffuse horizontal (the
// Studio: 0.9 × monthly GHI × diffuse share); the façade's diffuse is the Perez sky plus ground reflection on the
// face's true azimuth (faceHours) instead of the Studio's flat 0.4 × diffuse horizontal.
import { FULL_YEAR, faceHours, inPeriod, prepClimate, type Period } from './climate'
import type { ClimatePayload } from './types'
import { floorExposure } from './form'
import { ORI, zoneFor, type Face, type FacadeZone, type SwFloor } from './plate'
import { zoneLabel } from './glazing'

/** SW.pv: share of roofs and terraces covered, module efficiency, performance ratio. */
export interface PvSettings { roof: number; eff: number; pr: number }
export const PV_DEFAULTS: PvSettings = { roof: 0.5, eff: 0.2, pr: 0.8 }

export interface PvRow {
  name: string
  /** 'roof' or the façade zone index (-1 = faces no zone covers). */
  zone: number | 'roof'
  area: number
  kwp: number
  /** kWh in the period, and per m² of panel. */
  kwh: number; perM2: number
  /** Spandrel yield by face (kWh); empty for the roof. */
  byFace: Partial<Record<Face, number>>
}
export interface PvStudy {
  rows: PvRow[]
  /** kWh in the period, kWp installed. */
  pvTot: number; kwpTot: number
  /** Roof and façade yield split, and by face. */
  roofKwh: number; facadeKwh: number; byFace: Record<Face, number>
  /** Irradiation in the period (kWh/m²): horizontal (beam + 0.9 diffuse as used) and on each face's spandrel. */
  roofIrr: number
  /** Roof and terrace area (m²) before the coverage share. */
  roofArea: number
  /** Share of the building's electricity (when `elecKwh` is given), else null. */
  share: number | null
}

/**
 * Annual (or period) PV yield: roofs + terraces at `pv.roof` coverage and PV spandrels per façade zone.
 * `elecKwh` = the building's electricity use in the same period (e.g. energyModel(...).elec) for the share.
 */
export function photovoltaics(floors: SwFloor[], zones: FacadeZone[], C: ClimatePayload, pv: PvSettings = PV_DEFAULTS, period: Period = FULL_YEAR, opts: { shade?: number; elecKwh?: number } = {}): PvStudy {
  const P = prepClimate(C), shade = opts.shade ?? 1
  // roofs and terraces
  const ex = floorExposure(floors)
  const roofArea = ex.reduce((s, e) => s + e.roof + e.terrace, 0)
  let beamH = 0, difH = 0
  for (let k = 0; k < P.n; k++) {
    if (!inPeriod(period, P.doy[k])) continue
    difH += P.dhi[k]
    if (P.alt[k] > 0.01) beamH += P.dni[k] * Math.sin(P.alt[k])
  }
  const roofIrr = (beamH * shade + 0.9 * difH) / 1000
  const rows: PvRow[] = []
  const add = (name: string, zone: number | 'roof', area: number, kwhPerM2: number, byFace: Partial<Record<Face, number>> = {}) => {
    if (area <= 0) return
    const kwp = area * pv.eff, kwh = kwhPerM2 * area * pv.eff * pv.pr
    rows.push({ name, zone, area, kwp, kwh, perM2: kwh / area, byFace })
  }
  add(`Roofs and terraces · ${Math.round(pv.roof * 100)}% covered`, 'roof', roofArea * pv.roof, roofIrr)
  // PV spandrels: per zone and face azimuth
  const irrCache = new Map<number, number>()
  const irrOf = (az: number) => {
    let v = irrCache.get(az)
    if (v == null) {
      const F = faceHours(P, az)
      let s = 0
      for (let k = 0; k < P.n; k++) if (inPeriod(period, P.doy[k])) s += F.beam[k] * shade + F.sky[k] + F.gnd[k]
      v = s / 1000; irrCache.set(az, v)
    }
    return v
  }
  const topLevel = floors.reduce((s, f) => Math.max(s, f.level), 0)
  const acc = new Map<FacadeZone, { area: number; irrA: number; byFace: Partial<Record<Face, number>> }>()
  for (const f of floors) for (const e of f.edges) {
    const z = zoneFor(zones, e.zf, f.level)
    if (!(z.pv > 0)) continue
    const A = e.L * f.h * (1 - z.wwr) * z.pv
    if (A <= 0) continue
    const irr = irrOf(Math.round(e.az) % 360)
    let a = acc.get(z)
    if (!a) { a = { area: 0, irrA: 0, byFace: {} }; acc.set(z, a) }
    a.area += A; a.irrA += irr * A
    a.byFace[e.o] = (a.byFace[e.o] ?? 0) + irr * A * pv.eff * pv.pr
  }
  for (const [z, a] of acc) add(`${zoneLabel(z, topLevel)} · PV on ${Math.round(z.pv * 100)}% of the spandrel`, zones.indexOf(z), a.area, a.irrA / a.area, a.byFace)
  const byFace: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }
  for (const r of rows) for (const o of ORI) byFace[o] += r.byFace[o] ?? 0
  const pvTot = rows.reduce((s, x) => s + x.kwh, 0), kwpTot = rows.reduce((s, x) => s + x.kwp, 0)
  const roofKwh = rows.filter((r) => r.zone === 'roof').reduce((s, r) => s + r.kwh, 0)
  return { rows, pvTot, kwpTot, roofKwh, facadeKwh: pvTot - roofKwh, byFace, roofIrr, roofArea, share: opts.elecKwh && opts.elecKwh > 0 ? pvTot / opts.elecKwh : null }
}
