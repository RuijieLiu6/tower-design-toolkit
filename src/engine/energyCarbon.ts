// Energy and carbon screen (research P04-M01 limits, P04-M02 massing indicators, P04-M05 PV, P04-M07 embodied
// carbon; P11-M04 low-carbon systems). Screening, not compliance: formal results need an EMG v3.0 energy model and a
// listed whole-building LCA tool. Limits come from documents opened in research P04 r2 (two critique rounds, no final
// gate); every intensity used to *estimate* the design is a team assumption or unverified, and says so.
import { solarPosition } from './solar'
import { sunVector } from './sun'
import { towerFloors, towerFootprint } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower, UseId } from './types'

// ---------------------------------------------------------------- sources (as opened in research P04 r2)
const HBP: Source = { label: 'Higher Buildings Policy (City of Vancouver, amended 31 Mar 2026)', page: 's2.2', url: 'https://guidelines.vancouver.ca/policy-higher-buildings-for-rezonings.pdf' }
const VBBL_A: Source = { label: 'Vancouver Building By-law, official consolidation', page: 'Table 10.2.2.5.A (15 Sep 2025 wording)', url: 'https://bylaws.vancouver.ca/consolidated/14343.pdf' }
const VBBL_EC: Source = { label: 'Vancouver Building By-law, official consolidation', page: '10.4.1.2', url: 'https://bylaws.vancouver.ca/consolidated/14343.pdf' }
const VBBL_WWR: Source = { label: 'VBBL Part 10 (unofficial wording, 15 Sep 2025)', page: '10.2.2.3 reference-building WWR', url: 'https://vancouver.ca/files/cov/vbbl-part-10-unofficial-wording-effective-sept-15-2025.pdf' }
const EMG = (page: string): Source => ({ label: 'Energy Modelling Guidelines v3.0 (City of Vancouver, 2025)', page, url: 'https://guidelines.vancouver.ca/guidelines-energy-modelling.pdf' })
const ADDENDUM: Source = { label: 'City of Vancouver Addendum v1.0 to the National wbLCA Practitioner\'s Guide', page: 'ECI 400, f = 2, ILC ≤ 5%', url: 'https://vancouver.ca/files/cov/embodied-carbon-vancouver-addendum-national-wblca-practitioners-guide.pdf' }
const GBPR: Source = { label: 'Green Buildings Policy for Rezonings (amended 27 Nov 2024)', page: '3.1.1', url: 'https://guidelines.vancouver.ca/policy-green-buildings-for-rezonings.pdf' }
const MH2023: Source = { label: 'Embodied Carbon Reduction Study (Morrison Hershfield for the City, 2023)', page: '30-storey residential archetype', url: 'https://vancouver.ca/files/cov/vancouver-embodied-carbon-reduction-study-report-morrison-hershfield-2023.pdf' }
const CONCRETE2019: Source = { label: 'Concrete High Rise LCA Study (City of Vancouver, 2019)', url: 'https://vancouver.ca/files/cov/cov-concrete-high-rise-study.pdf' }
const STAFF2024: Source = { label: 'Embodied carbon in VBBL 2025, staff slides (City of Vancouver, 19 Sep 2024)', url: 'https://vancouver.ca/files/cov/proposed-embodied-carbon-requirements-vancouver-building-by-law-2025.pdf' }
const IEA_PV: Source = { label: 'IEA PVPS Task 12, T12-19:2020', page: 'Table 3 (Canada averages)', url: 'https://iea-pvps.org/wp-content/uploads/2020/12/IEA-PVPS-LCI-report-2020.pdf' }
const BC_GRID: Source = { label: 'BC electricity emission intensity factors (Province of BC, updated 26 May 2026)', page: 'Integrated Grid 2025', url: 'https://www2.gov.bc.ca/gov/content/environment/climate-change/data/electricity' }
const TEAM: Source = { label: 'Team assumption (research P04)' }

// ---------------------------------------------------------------- limits
export type Metric = 'teui' | 'tedi' | 'ghgi'
export type RowUse = 'residential' | 'hotel' | 'retail' | 'office'
type Triple = Record<Metric, number>

/** HBP s2.2 targets route (with an LCES connection): TEUI, TEDI (kWh/m²·yr), GHGI (kgCO₂e/m²·yr). */
export const HBP_TARGETS: Record<RowUse, Triple> = {
  residential: { teui: 100, tedi: 15, ghgi: 3 },
  hotel: { teui: 120, tedi: 15, ghgi: 4 },
  retail: { teui: 100, tedi: 15, ghgi: 1.5 },
  office: { teui: 100, tedi: 15, ghgi: 1.5 },
}
/** VBBL Table 10.2.2.5.A (15 Sep 2025; GHGI 3.0 / 4.0 from 1 Mar 2025). Residential row is Group C over 6 storeys. */
export const VBBL_TABLE_A: Record<RowUse, Triple> = {
  residential: { teui: 120, tedi: 30, ghgi: 3.0 },
  hotel: { teui: 140, tedi: 20, ghgi: 4.0 },
  retail: { teui: 120, tedi: 20, ghgi: 3.0 },
  office: { teui: 100, tedi: 20, ghgi: 3.0 },
}
/** EMG v3.0 emission factors (kgCO₂e/kWh). */
export const EF = { electricity: 0.011, gas: 0.180 }
/** BC Integrated Grid 2025: 22.8 t/GWh (provincial data page, context for PV payback only). */
export const BC_GRID_2025 = 0.0228

const ROW_OF: Partial<Record<UseId, RowUse>> = { residential: 'residential', hotel: 'hotel', retail: 'retail', office: 'office' }
/** Uses with no HBP or Table A row ("all other" occupancies, Groups A, B, F): GHGI-only rule, 50% below a fossil reference. */
const OTHER: UseId[] = ['civic', 'amenity']

// ---------------------------------------------------------------- inputs and presets
export type Heating = 'heat-pump' | 'district' | 'gas'
export type Envelope = 'table-a' | 'hbp' | 'passive'
export type SystemId = 'core-flat-slab' | 'core-outriggers' | 'steel-composite' | 'timber-hybrid'

export interface EnergyInput {
  regime: 'both' | 'rezoning' | 'permit'
  route: 'targets' | 'passive-house'
  lces: boolean
  heating: Heating
  /** Share of space heating and hot water from gas boilers (back-up or peak), 0–1. */
  gasShare: number
  /** District (LCES) emission factor from the utility, kgCO₂e per kWh delivered; null = not known. */
  districtFactor: number | null
  envelope: Envelope
  wwr: number
  manual: { teui: number | null; tedi: number | null; ghgi: number | null } | null
  system: SystemId | null
  scm: 20 | 30 | 40
  facade: 'window-wall' | 'curtain-wall'
  triple: boolean
  parkadeLevels: number
  ilc: number
  pv: { roof: boolean; podium: boolean; facade: boolean; roofUsable: number; podiumUsable: number; facadeUsable: number; kwpRoof: number; kwpFacade: number; ecPerKwp: number; life: number }
}

export const DEFAULT_ENERGY: EnergyInput = {
  regime: 'both', route: 'targets', lces: false, heating: 'heat-pump', gasShare: 0, districtFactor: null, envelope: 'hbp', wwr: 0.4, manual: null,
  system: null, scm: 20, facade: 'window-wall', triple: false, parkadeLevels: 4, ilc: 0,
  pv: { roof: true, podium: true, facade: false, roofUsable: 0.4, podiumUsable: 0.5, facadeUsable: 0.3, kwpRoof: 0.2, kwpFacade: 0.15, ecPerKwp: 1200, life: 30 },
}

/** Screening end-use intensities (kWh/m²·yr of each use), team assumptions until the shoebox model (P04-M03) is built. */
export const END_USE: Record<UseId, { base: number; dhw: number; cooling: number }> = {
  residential: { base: 45, dhw: 30, cooling: 10 },
  hotel: { base: 55, dhw: 35, cooling: 20 },
  office: { base: 50, dhw: 3, cooling: 25 },
  retail: { base: 55, dhw: 3, cooling: 30 },
  civic: { base: 45, dhw: 5, cooling: 15 },
  amenity: { base: 45, dhw: 5, cooling: 15 },
  mechanical: { base: 0, dhw: 0, cooling: 0 },
}
export const ENVELOPE_LABEL: Record<Envelope, string> = { 'table-a': 'Just meets VBBL Table A TEDI', hbp: 'Just meets HBP TEDI 15', passive: 'Passive House level (TEDI 10, team)' }
/** Space-heating demand (TEDI, kWh/m²·yr) for each envelope choice: defined by the limits it just meets (Passive = team). */
const tediFor = (e: Envelope, use: UseId) => e === 'table-a' ? (ROW_OF[use] ? VBBL_TABLE_A[ROW_OF[use]!].tedi : 20) : e === 'hbp' ? 15 : 10
export const EFFICIENCY = { hpHeating: 2.8, hpDhw: 2.3, boiler: 0.9, cooling: 3.5 } // seasonal COPs and boiler efficiency (team)
export const ELEVATOR = { kw: 3, hours: 3000 } // EMG: 3 kW per elevator on the building schedule; 3,000 equivalent hours (team)

export const HEATING_LABEL: Record<Heating, string> = { 'heat-pump': 'Electric heat pumps (building LCES)', district: 'District energy (neighbourhood LCES)', gas: 'Gas boilers' }

export const SYSTEMS: Record<SystemId, { label: string; band: [number, number, number]; concrete: number }> = {
  'core-flat-slab': { label: 'Concrete core and flat slabs', band: [180, 260, 340], concrete: 1 },
  'core-outriggers': { label: 'Concrete core with outriggers or belt trusses', band: [195, 280, 365], concrete: 1 },
  'steel-composite': { label: 'Steel frame and composite decks around a core', band: [200, 290, 390], concrete: 0.5 },
  'timber-hybrid': { label: 'Mass-timber floors on a concrete core (hybrid)', band: [150, 220, 300], concrete: 0.6 },
}

// ---------------------------------------------------------------- helpers
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })
const f1 = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1))
const polyArea = (p: [number, number][]) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y }, 0)) / 2
const perimeter = (p: [number, number][]) => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + Math.hypot(x2 - x, y2 - y) }, 0)

export interface Areas { byUse: Record<UseId, number>; mfa: number; storeys: number; wall: number; vfar: number }

/** Modelled floor area by use (EMG: all floors including mechanical; no parking in the massing) and above-ground wall area. */
export function areas(towers: Tower[]): Areas {
  const byUse = { retail: 0, office: 0, hotel: 0, residential: 0, civic: 0, amenity: 0, mechanical: 0 } as Record<UseId, number>
  let storeys = 0, wall = 0
  for (const t of towers) {
    const floors = towerFloors(t)
    for (const f of floors) byUse[f.use] += f.area
    storeys = Math.max(storeys, floors.length)
    const podiumH = t.podiumHeight > 0 ? t.podiumHeight : 0
    wall += perimeter(towerFootprint(t)) * (t.height - podiumH) + (podiumH > 0 ? perimeter(towerFootprint(t, true)) * podiumH : 0)
  }
  const mfa = Object.values(byUse).reduce((a, b) => a + b, 0)
  return { byUse, mfa, storeys, wall, vfar: mfa ? wall / mfa : 0 }
}

/** Area-weighted limits per regime over the uses that have a table row (team weighting; EMG Section 5 not opened). */
export function weightedLimits(byUse: Record<UseId, number>) {
  const rows = (Object.keys(ROW_OF) as UseId[]).filter((u) => byUse[u] > 0)
  const total = rows.reduce((s, u) => s + byUse[u], 0)
  const w = (table: Record<RowUse, Triple>, m: Metric) => total ? rows.reduce((s, u) => s + byUse[u] * table[ROW_OF[u]!][m], 0) / total : NaN
  const hbp = { teui: w(HBP_TARGETS, 'teui'), tedi: w(HBP_TARGETS, 'tedi'), ghgi: w(HBP_TARGETS, 'ghgi') }
  const vbbl = { teui: w(VBBL_TABLE_A, 'teui'), tedi: w(VBBL_TABLE_A, 'tedi'), ghgi: w(VBBL_TABLE_A, 'ghgi') }
  return { rowArea: total, hbp, vbbl }
}

export interface EnergyEstimate { teui: number; tedi: number; ghgi: number; elec: number; gas: number; district: number; elevators: number; ghgiOtherRef: number | null; perUse: Partial<Record<UseId, { teui: number; ghgi: number }>>; manual: boolean }

/** Screening estimate from end-use presets, system efficiencies and the lift car count (all team assumptions). */
export function estimateEnergy(a: Areas, input: EnergyInput, cars: number): EnergyEstimate {
  let elec = 0, gas = 0, district = 0
  const perUse: EnergyEstimate['perUse'] = {}
  let otherThermal = 0, otherElec = 0, otherArea = 0
  for (const use of Object.keys(a.byUse) as UseId[]) {
    const A = a.byUse[use]
    if (!A || use === 'mechanical') continue
    const eu = END_USE[use]
    const heat = tediFor(input.envelope, use) * A, dhw = eu.dhw * A
    const thermal = heat + dhw
    let e = eu.base * A + (eu.cooling * A) / EFFICIENCY.cooling, g = 0, d = 0
    const gShare = input.heating === 'gas' ? 1 : Math.min(1, Math.max(0, input.gasShare))
    g += (thermal * gShare) / EFFICIENCY.boiler
    const rest = 1 - gShare
    if (input.heating === 'district') d += thermal * rest
    else if (input.heating === 'heat-pump') e += (heat * rest) / EFFICIENCY.hpHeating + (dhw * rest) / EFFICIENCY.hpDhw
    elec += e; gas += g; district += d
    const dEF = input.districtFactor ?? 0
    perUse[use] = { teui: (e + g + d) / A, ghgi: (e * EF.electricity + g * EF.gas + d * dEF) / A }
    if (OTHER.includes(use)) { otherThermal += thermal; otherElec += eu.base * A + (eu.cooling * A) / EFFICIENCY.cooling; otherArea += A }
  }
  const elevators = (cars * ELEVATOR.kw * ELEVATOR.hours)
  elec += elevators
  const tediW = a.mfa ? (Object.keys(a.byUse) as UseId[]).reduce((s, u) => s + (u === 'mechanical' ? 0 : tediFor(input.envelope, u) * a.byUse[u]), 0) / a.mfa : 0
  const est: EnergyEstimate = {
    teui: a.mfa ? (elec + gas + district) / a.mfa : 0,
    tedi: tediW,
    ghgi: a.mfa ? (elec * EF.electricity + gas * EF.gas + district * (input.districtFactor ?? 0)) / a.mfa : 0,
    elec, gas, district, elevators,
    // EMG s5.3 shortcut, approximated: a fossil-only reference with gas heating and DHW (team approximation).
    ghgiOtherRef: otherArea ? ((otherThermal / EFFICIENCY.boiler) * EF.gas + otherElec * EF.electricity) / otherArea : null,
    perUse, manual: false,
  }
  if (input.manual) {
    if (input.manual.teui !== null) est.teui = input.manual.teui
    if (input.manual.tedi !== null) est.tedi = input.manual.tedi
    if (input.manual.ghgi !== null) est.ghgi = input.manual.ghgi
    est.manual = true
  }
  return est
}

// ---------------------------------------------------------------- PV (P04-M05)
export interface Obstacle { footprint: [number, number][]; height: number; /** bounding circle, filled by prepObstacles */ cx?: number; cy?: number; r?: number }

/** Add bounding circles so most obstacles are rejected before the edge tests. */
export function prepObstacles(list: Obstacle[]): Obstacle[] {
  return list.map((o) => {
    const cx = o.footprint.reduce((s, p) => s + p[0], 0) / o.footprint.length, cy = o.footprint.reduce((s, p) => s + p[1], 0) / o.footprint.length
    return { ...o, cx, cy, r: Math.max(...o.footprint.map(([x, y]) => Math.hypot(x - cx, y - cy))) }
  })
}
export interface PvSurface { id: string; kind: 'roof' | 'podium' | 'facade'; towerId: string; label: string; area: number; usable: number; kwp: number; poa: number; shaded: number; yieldKwhKwp: number; kwh: number; azimuth: number | null
  /** Geometry for the overlay: quad corners (model frame, z up). */
  quad: [number, number, number][] }
export interface PvResult { surfaces: PvSurface[]; kwh: number; kwp: number; refPoa: number; teuiCredit: number; ghgiCredit: number; paybackRoof: number | null; paybackFacade: number | null; paybackRoofBC: number | null; share: number }

/** Sunshine fraction by month, Vancouver (approximate climate normals, unverified: replace with an EPW file). */
export const SUNSHINE = [0.22, 0.3, 0.35, 0.43, 0.5, 0.5, 0.65, 0.62, 0.52, 0.37, 0.24, 0.2]
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** IEA PVPS Canada average specific yield, rooftop and facade (kWh/kWp·yr); Canadian averages, not Vancouver. */
export const IEA_YIELD = { roof: 1173, facade: 821 }

export interface SunSample { dir: [number, number, number]; beam: number; diffuse: number; ghi: number; hours: number }

/** Hourly sun samples on the 15th of each month (each weighted by the days in its month): direction and all-sky irradiance (W/m²). */
export function sunSamples(northDeg: number, lat: number, lon: number, year = 2026): SunSample[] {
  const out: SunSample[] = []
  for (let m = 0; m < 12; m++) {
    for (let h = 0; h < 24; h++) {
      const p = solarPosition(Date.UTC(year, m, 15, h, 30), lat, lon)
      const alt = p.altitude
      if (alt <= 0.5) continue
      const sinA = Math.sin((alt * Math.PI) / 180)
      // Kasten-Young air mass, Meinel clear-sky beam, clear-sky diffuse 10% of beam (team).
      const am = 1 / (sinA + 0.50572 * Math.pow(alt + 6.07995, -1.6364))
      const dni = 1353 * Math.pow(0.7, Math.pow(am, 0.678))
      const dhi = 0.1 * dni
      const ghiClear = dni * sinA + dhi
      const s = SUNSHINE[m]
      const beam = s * dni, diffuse = s * dhi + (1 - s) * 0.35 * ghiClear // overcast diffuse = 35% of clear-sky GHI (team)
      out.push({ dir: sunVector(p.azimuth, alt, northDeg), beam, diffuse, ghi: beam * sinA + diffuse, hours: DAYS[m] })
    }
  }
  return out
}

/** Does the ray from p toward the sun pass through an extruded footprint below its height? */
export function blocked(p: [number, number, number], dir: [number, number, number], obs: Obstacle[]): boolean {
  const hl = Math.hypot(dir[0], dir[1])
  if (hl < 1e-9) return false
  const hx = dir[0] / hl, hy = dir[1] / hl, k = dir[2] / hl
  for (const o of obs) {
    if (o.height <= p[2]) continue
    const reach = (o.height - p[2]) / k // horizontal distance at which the ray clears the obstacle's top
    if (o.r !== undefined) {
      const dx = o.cx! - p[0], dy = o.cy! - p[1]
      const along = dx * hx + dy * hy
      if (along < -o.r || along - o.r > reach || Math.abs(dx * hy - dy * hx) > o.r) continue
    }
    const fp = o.footprint
    let tMin = Infinity
    for (let i = 0; i < fp.length; i++) {
      const [ax, ay] = fp[i], [bx, by] = fp[(i + 1) % fp.length]
      const ex = bx - ax, ey = by - ay
      const den = hx * ey - hy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((ax - p[0]) * ey - (ay - p[1]) * ex) / den
      const u = ((ax - p[0]) * hy - (ay - p[1]) * hx) / den
      if (t > 1e-6 && u >= 0 && u <= 1 && t < tMin) tMin = t
    }
    if (tMin < reach) return true
  }
  return false
}

/** Plane-of-array annual irradiance (kWh/m²·yr) at points with a normal and tilt, and the shaded share of beam. */
function poaAt(points: [number, number, number][], n: [number, number, number], tiltDeg: number, sun: SunSample[], obs: Obstacle[]) {
  const cosT = Math.cos((tiltDeg * Math.PI) / 180)
  const svf = (1 + cosT) / 2, gnd = 0.2 * (1 - cosT) / 2
  let total = 0, beamAll = 0, beamLost = 0
  for (const s of sun) {
    const c = n[0] * s.dir[0] + n[1] * s.dir[1] + n[2] * s.dir[2]
    let beamHere = 0
    if (c > 0) {
      let lit = 0
      for (const pt of points) if (!blocked(pt, s.dir, obs)) lit++
      const frac = points.length ? lit / points.length : 1
      beamHere = s.beam * c * frac
      beamAll += s.beam * c * s.hours; beamLost += s.beam * c * (1 - frac) * s.hours
    }
    total += (beamHere + s.diffuse * svf + s.ghi * gnd) * s.hours
  }
  return { poa: total / 1000, shaded: beamAll ? beamLost / beamAll : 0 }
}

/** Unit vector of true south in the model frame (true north at northDeg clockwise from +y). */
const southVec = (northDeg: number): [number, number] => { const a = ((northDeg + 180) * Math.PI) / 180; return [Math.sin(a), Math.cos(a)] }

export function pvPotential(towers: Tower[], input: EnergyInput, ctx: { northDeg: number; lat: number; lon: number; obstacles: Obstacle[]; mfa: number; elec: number }): PvResult {
  const sun = sunSamples(ctx.northDeg, ctx.lat, ctx.lon)
  const tiltRoof = 10
  const [sx, sy] = southVec(ctx.northDeg)
  const roofN: [number, number, number] = [sx * Math.sin((tiltRoof * Math.PI) / 180), sy * Math.sin((tiltRoof * Math.PI) / 180), Math.cos((tiltRoof * Math.PI) / 180)]
  const ref = poaAt([[0, 0, 1e5]], roofN, tiltRoof, sun, []).poa
  const own: Obstacle[] = towers.flatMap((t) => [{ footprint: towerFootprint(t), height: t.height }, ...(t.podiumHeight > 0 ? [{ footprint: towerFootprint(t, true), height: t.podiumHeight }] : [])])
  const surfaces: PvSurface[] = []
  const add = (s: Omit<PvSurface, 'yieldKwhKwp' | 'kwh' | 'kwp'>, kwpPerM2: number, on: boolean) => {
    const kwp = on ? s.area * s.usable * kwpPerM2 : 0
    const y = ref ? IEA_YIELD.roof * (s.poa / ref) : 0
    surfaces.push({ ...s, kwp, yieldKwhKwp: y, kwh: kwp * y })
  }
  for (const t of towers) {
    const fp = towerFootprint(t)
    // Own boxes can stay in the list: points sit above their own roof or outside a convex face, so they never self-hit.
    const others = prepObstacles([...ctx.obstacles, ...own])
    // Roof: 3 × 3 points inside the footprint at roof height (+0.5 m).
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length, cy = fp.reduce((s, p) => s + p[1], 0) / fp.length
    const roofPts = fp.flatMap(([x, y]) => [[cx + (x - cx) * 0.6, cy + (y - cy) * 0.6, t.height + 0.5] as [number, number, number]]).concat([[cx, cy, t.height + 0.5]])
    const r = poaAt(roofPts, roofN, tiltRoof, sun, others)
    add({ id: `${t.id}-roof`, kind: 'roof', towerId: t.id, label: `${t.name}: roof`, area: polyArea(fp), usable: input.pv.roofUsable, poa: r.poa, shaded: r.shaded, azimuth: null, quad: fp.map(([x, y]) => [x, y, t.height + 0.3]) }, input.pv.kwpRoof, input.pv.roof)
    if (t.podiumHeight > 0) {
      const pf = towerFootprint(t, true)
      const pcx = pf.reduce((s, p) => s + p[0], 0) / pf.length, pcy = pf.reduce((s, p) => s + p[1], 0) / pf.length
      const pts = pf.map(([x, y]) => [pcx + (x - pcx) * 0.8, pcy + (y - pcy) * 0.8, t.podiumHeight + 0.5] as [number, number, number])
      const pr = poaAt(pts, roofN, tiltRoof, sun, others)
      add({ id: `${t.id}-podium`, kind: 'podium', towerId: t.id, label: `${t.name}: podium roof`, area: Math.max(0, polyArea(pf) - polyArea(fp)), usable: input.pv.podiumUsable, poa: pr.poa, shaded: pr.shaded, azimuth: null, quad: pf.map(([x, y]) => [x, y, t.podiumHeight + 0.3]) }, input.pv.kwpRoof, input.pv.podium)
    }
    // Facades: each footprint edge, in height bands above the podium.
    const ccw = fp.reduce((s, [x, y], i) => { const [x2, y2] = fp[(i + 1) % fp.length]; return s + x * y2 - x2 * y }, 0) > 0
    const z0 = t.podiumHeight > 0 ? t.podiumHeight : 0
    const bands = Math.max(1, Math.min(12, Math.round((t.height - z0) / 25)))
    const bh = (t.height - z0) / bands
    for (let i = 0; i < fp.length; i++) {
      const [ax, ay] = fp[i], [bx, by] = fp[(i + 1) % fp.length]
      const len = Math.hypot(bx - ax, by - ay)
      if (len < 1) continue
      let nx = (by - ay) / len, ny = -(bx - ax) / len
      if (!ccw) { nx = -nx; ny = -ny }
      const az = ((Math.atan2(nx, ny) * 180) / Math.PI - ctx.northDeg + 720) % 360
      const dirName = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8]
      for (let b = 0; b < bands; b++) {
        const za = z0 + b * bh, zb = za + bh, zc = (za + zb) / 2
        const pts = [0.15, 0.5, 0.85].map((u) => [ax + (bx - ax) * u + nx * 0.2, ay + (by - ay) * u + ny * 0.2, zc] as [number, number, number])
        const res = poaAt(pts, [nx, ny, 0], 90, sun, others)
        add({ id: `${t.id}-f${i}-b${b}`, kind: 'facade', towerId: t.id, label: `${t.name}: ${dirName} face, ${Math.round(za)}–${Math.round(zb)} m`, area: len * bh, usable: (input.pv.facadeUsable * (1 - input.wwr)) / 0.6 /* preset is for a 40% WWR facade */, poa: res.poa, shaded: res.shaded, azimuth: az,
          quad: [[ax + nx * 0.3, ay + ny * 0.3, za], [bx + nx * 0.3, by + ny * 0.3, za], [bx + nx * 0.3, by + ny * 0.3, zb], [ax + nx * 0.3, ay + ny * 0.3, zb]] }, input.pv.kwpFacade, input.pv.facade)
      }
    }
  }
  const kwh = surfaces.reduce((s, x) => s + x.kwh, 0), kwp = surfaces.reduce((s, x) => s + x.kwp, 0)
  const yRoof = surfaces.filter((s) => s.kind !== 'facade' && s.kwp > 0), yFac = surfaces.filter((s) => s.kind === 'facade' && s.kwp > 0)
  const avgY = (l: PvSurface[]) => { const p = l.reduce((s, x) => s + x.kwp, 0); return p ? l.reduce((s, x) => s + x.kwh, 0) / p : 0 }
  const payback = (y: number, f: number) => (y > 0 ? input.pv.ecPerKwp / (y * f) : null)
  return {
    surfaces, kwh, kwp, refPoa: ref,
    teuiCredit: ctx.mfa ? kwh / ctx.mfa : 0,
    ghgiCredit: ctx.mfa ? (Math.min(kwh, ctx.elec) * EF.electricity) / ctx.mfa : 0,
    paybackRoof: payback(avgY(yRoof), EF.electricity), paybackFacade: payback(avgY(yFac), EF.electricity), paybackRoofBC: payback(avgY(yRoof), BC_GRID_2025),
    share: ctx.elec ? kwh / ctx.elec : 0,
  }
}

// ---------------------------------------------------------------- embodied carbon (P04-M07)
export interface EmbodiedResult { system: SystemId; fromShortlist: boolean; gfa: number; band: [number, number, number]; limit: number; totalT: [number, number, number]; storeys: number }

/** Default structure system from the lateral shortlist (item 11): outriggers when they are shortlisted, else core walls. */
export function defaultSystem(shortlist: { id: string; fit: string }[] | null): SystemId {
  if (!shortlist) return 'core-flat-slab'
  if (shortlist.find((s) => s.id === 'outriggers')?.fit === 'shortlist') return 'core-outriggers'
  return 'core-flat-slab'
}

export function embodied(towers: Tower[], a: Areas, input: EnergyInput, shortlistSystem: SystemId): EmbodiedResult {
  const system = input.system ?? shortlistSystem
  const sys = SYSTEMS[system]
  const over40 = Math.max(0, a.storeys - 40)
  const premium = [1 + 0.002 * over40, 1 + 0.004 * over40, 1 + 0.008 * over40] // height premium above 40 storeys (team)
  const scm = input.scm === 20 ? 1 : input.scm === 30 ? 0.93 : 0.86 // MH 2023 SCM cuts relative to its 20% baseline (team arithmetic)
  const scmF = 1 - (1 - scm) * sys.concrete
  const fac = (input.facade === 'curtain-wall' ? 1.08 : 1) * (input.triple ? 1.02 : 1)
  const podiumFoot = towers.reduce((s, t) => s + (t.podiumHeight > 0 ? polyArea(towerFootprint(t, true)) : polyArea(towerFootprint(t))), 0)
  // Parkade: presets include the archetype's 4-level parkade; each level more or less moves 0.30 tCO₂e per m² of parkade floor (team).
  const parkDelta = a.mfa ? ((input.parkadeLevels - 4) * podiumFoot * 300) / a.mfa : 0
  const band = sys.band.map((v, i) => Math.max(0, v * premium[i] * scmF * fac + parkDelta)) as [number, number, number]
  const limit = 400 * (2 + Math.min(0.05, Math.max(0, input.ilc)))
  return { system, fromShortlist: input.system === null, gfa: a.mfa, band, limit, totalT: band.map((v) => (v * a.mfa) / 1000) as [number, number, number], storeys: a.storeys }
}

// ---------------------------------------------------------------- rules
export interface EnergyCarbonResult {
  areas: Areas
  limits: ReturnType<typeof weightedLimits> & { effective: Triple }
  estimate: EnergyEstimate
  net: { teui: number; ghgi: number }
  pv: PvResult
  embodied: EmbodiedResult
  operational: RuleResult[]
  carbon: RuleResult[]
  solar: RuleResult[]
}

const cmp = (est: number, lim: number): RuleState => (!Number.isFinite(lim) ? 'unknown' : est <= lim ? 'pass' : 'fail')
const margin = (est: number, lim: number) => (Number.isFinite(lim) && lim > 0 ? `${est <= lim ? '' : '+'}${Math.round(((est - lim) / lim) * 100)}%` : '')

export function energyCarbonCheck(towers: Tower[], input: EnergyInput, ctx: { cars: number; northDeg: number; lat: number; lon: number; obstacles: Obstacle[]; shortlistSystem: SystemId; obstaclesKnown: boolean }): EnergyCarbonResult {
  const a = areas(towers)
  const wl = weightedLimits(a.byUse)
  const pick = (m: Metric) => input.regime === 'rezoning' ? wl.hbp[m] : input.regime === 'permit' ? wl.vbbl[m] : Math.min(wl.hbp[m], wl.vbbl[m])
  const effective = { teui: pick('teui'), tedi: pick('tedi'), ghgi: pick('ghgi') }
  const est = estimateEnergy(a, input, ctx.cars)
  const pv = pvPotential(towers, input, { northDeg: ctx.northDeg, lat: ctx.lat, lon: ctx.lon, obstacles: ctx.obstacles, mfa: a.mfa, elec: est.elec })
  const net = { teui: Math.max(0, est.teui - pv.teuiCredit), ghgi: Math.max(0, est.ghgi - pv.ghgiCredit) }
  const regimeLabel = input.regime === 'rezoning' ? 'HBP s2.2' : input.regime === 'permit' ? 'VBBL Table A' : 'stricter of HBP s2.2 and VBBL Table A'
  const estFlag: Flag = est.manual ? 'unverified' : 'team_assumption'
  const estNote = est.manual ? 'Your entered values (from your own model); not checked here.' : 'Screening estimate from team end-use presets and system efficiencies, not an EMG v3.0 model; it shows direction and levers, not compliance.'
  const ph = input.route === 'passive-house'
  const op: RuleResult[] = []
  const src = input.regime === 'permit' ? VBBL_A : HBP
  const otherArea = OTHER.reduce((s, u) => s + a.byUse[u], 0)

  op.push(rule('en-limits', 'Governing limits for this program mix', `TEUI ${f1(effective.teui)} · TEDI ${f1(effective.tedi)} · GHGI ${effective.ghgi.toFixed(2)}`, `${regimeLabel}, area-weighted over ${Math.round(wl.rowArea).toLocaleString('en-CA')} m² with a table row`, 'pass', 'verified', src,
    `HBP: ${f1(wl.hbp.teui)} / ${f1(wl.hbp.tedi)} / ${wl.hbp.ghgi.toFixed(2)}. VBBL Table A: ${f1(wl.vbbl.teui)} / ${f1(wl.vbbl.tedi)} / ${wl.vbbl.ghgi.toFixed(2)}. Weighting by area is a team assumption (EMG Section 5 not opened). Residential uses the over-6-storeys row: a tower and its podium are one building.`))
  if (ph) op.push(rule('en-ph', 'Passive House route', 'Passive House certification', 'certified by a Passive House certifier', 'unknown', 'unverified', HBP, 'The Passive House route replaces the TEUI/TEDI/GHGI targets (HBP s2.2; VBBL 10.2.2.5(4) deemed-to-comply). Passive House criteria were not opened in research.'))
  else {
    op.push(rule('en-teui', 'TEUI (net of PV)', `${f1(net.teui)} kWh/m²·yr ${margin(net.teui, effective.teui)}`, `≤ ${f1(effective.teui)}`, cmp(net.teui, effective.teui), estFlag, src, `${estNote} PV credit ${pv.teuiCredit.toFixed(1)} kWh/m² (EMG Eq. 5). Elevators: ${Math.round(est.elevators / Math.max(1, a.mfa) * 10) / 10} kWh/m² at 3 kW per car on the building schedule (EMG).`))
    op.push(rule('en-tedi', 'TEDI (space heating demand)', `${f1(est.tedi)} kWh/m²·yr ${margin(est.tedi, effective.tedi)}`, `≤ ${f1(effective.tedi)}`, cmp(est.tedi, effective.tedi), estFlag, src, est.manual ? estNote : `Envelope: ${ENVELOPE_LABEL[input.envelope]}. HBP's TEDI 15 is stricter than every Table A cell.`))
    const ghgiState: RuleState = input.heating === 'district' && input.districtFactor === null && !est.manual ? 'unknown' : cmp(net.ghgi, effective.ghgi)
    op.push(rule('en-ghgi', 'GHGI (net of PV)', ghgiState === 'unknown' ? 'needs the district utility\'s emission factor' : `${net.ghgi.toFixed(2)} kgCO₂e/m²·yr ${margin(net.ghgi, effective.ghgi)}`, `≤ ${effective.ghgi.toFixed(2)}`, ghgiState, estFlag, src,
      `${HEATING_LABEL[input.heating]}${input.heating !== 'gas' && input.gasShare > 0 ? ` with ${Math.round(input.gasShare * 100)}% gas` : ''}. Factors: electricity 0.011, gas 0.180 kgCO₂e/kWh (EMG v3.0). Refrigerant GHGI-R is reported separately and has no limit.`))
  }
  op.push(rule('en-gas', 'Gas headroom under the GHGI limit', `${f1(effective.ghgi / EF.gas)} kWh/m²·yr of gas at most`, `limit ÷ 0.180 (all-electric: ${f1(effective.ghgi / EF.electricity)} kWh/m²)`, est.gas / Math.max(1, a.mfa) <= effective.ghgi / EF.gas ? 'pass' : 'fail', 'verified', EMG('emission factors'),
    `This design burns ${f1(est.gas / Math.max(1, a.mfa))} kWh/m² of gas. Gas emits about 16 times more per kWh than BC electricity, so gas heating is close to excluded under the HBP office and retail limit of 1.5.`))
  if (!ph) op.push(rule('en-lces', 'Low Carbon Energy System connection', input.lces ? 'marked as planned' : 'not confirmed', 'required on the HBP targets route', input.lces ? 'pass' : 'warn', 'verified', HBP, 'Higher buildings take Passive House or the targets plus an LCES connection, with no aggregation of another LCES\'s reductions. Which systems the City recognises as an LCES is for the City to confirm.'))
  if (otherArea > 0) {
    const ref = est.ghgiOtherRef
    const civ = OTHER.filter((u) => a.byUse[u] > 0)
    const g = civ.reduce((s, u) => s + (est.perUse[u]?.ghgi ?? 0) * a.byUse[u], 0) / otherArea
    op.push(rule('en-other', 'Civic, cultural and amenity space (no table row)', ref !== null ? `${g.toFixed(2)} vs ${(0.5 * ref).toFixed(2)} kgCO₂e/m²·yr` : 'needs a reference model', 'GHGI ≤ 50% of a fossil-fuel-only reference model', ref === null ? 'unknown' : g <= 0.5 * ref ? 'pass' : 'fail', 'team_assumption', VBBL_A,
      `${Math.round(otherArea).toLocaleString('en-CA')} m² of Groups A/B/F. VBBL sets a GHGI-only rule for "all other" occupancies; HBP has no row (VBBL rule used as a team proxy). The reference here is approximated with gas heating and hot water; a real reference model is needed.`))
  }
  op.push(rule('en-vfar', 'Vertical facade-to-floor ratio (VFAR)', a.vfar.toFixed(2), 'report only; 0.65 or more may earn the EMG form adjustment', a.vfar >= 0.65 ? 'warn' : 'pass', 'verified', EMG('VFAR definition'), 'Above-ground wall area ÷ modelled floor area. A higher VFAR raises TEDI; towers usually sit below 0.65.'))
  op.push(rule('en-wwr', 'Window-to-wall ratio', `${Math.round(input.wwr * 100)}% (design intent)`, '≤ 40% (reference-building cap)', input.wwr <= 0.4 ? 'pass' : 'warn', 'verified', VBBL_WWR, 'Glazing above 40% earns no allowance in reference-model comparisons and raises TEDI. Set it in the energy inputs until the facade module exists.'))
  const ft = Math.max(0, ...towers.map((t) => t.height)) * 3.281
  op.push(rule('en-hbp-height', 'HBP height guidance', `${Math.round(ft)} ft tallest`, '~550–700 ft for the highest CBD buildings (guidance, not a limit)', ft <= 700 ? 'pass' : 'warn', 'verified', { ...HBP, page: '2.1(c), 3(b)' }, 'Above about 700 ft the competition tower conflicts with HBP height guidance; the policy is under review and the VTC site is hypothetical.'))

  // Embodied carbon
  const shortlistSystem = ctx.shortlistSystem
  const ec = embodied(towers, a, input, shortlistSystem)
  const [lo, mid, hi] = ec.band
  const carbon: RuleResult[] = []
  carbon.push(rule('ec-limit', 'Embodied carbon vs VBBL limit', `${Math.round(lo)}–${Math.round(hi)} kgCO₂e/m² (likely ${Math.round(mid)}; ratio ${(mid / 400).toFixed(2)})`, `≤ ${Math.round(ec.limit)} (2 × the 400 benchmark${input.ilc > 0 ? ' + credits' : ''})`, hi <= ec.limit ? 'pass' : mid <= ec.limit ? 'warn' : 'fail', 'verified', VBBL_EC,
    `Cradle to grave, substructure and shell, per m² GFA (NRC definition). ${SYSTEMS[ec.system].label}${ec.fromShortlist ? ' (from the structure shortlist)' : ''}; total ${Math.round(ec.totalT[1]).toLocaleString('en-CA')} tCO₂e (${Math.round(ec.totalT[0]).toLocaleString('en-CA')}–${Math.round(ec.totalT[2]).toLocaleString('en-CA')}). The range comes from team presets, so this is indicative: the City needs a listed tool (One Click LCA Carbon Designer, Embodied Carbon Pathfinder or C.Scale).`))
  carbon.push(rule('ec-intensity', 'Structure and height presets', `${Math.round(mid)} kgCO₂e/m², ${ec.storeys} storeys`, 'context: a 30-storey archetype ranged 97–424 (median 260, baseline 311)', mid <= 311 ? 'pass' : 'warn', 'unverified', MH2023,
    `Presets start from the archetype's band and add a height premium above 40 storeys (team). The archetype is a 30-storey residential tower; transfer to a ${ec.storeys}-storey mixed-use tower is unverified. SCM ${input.scm}% and ${input.facade === 'curtain-wall' ? 'curtain wall (+8%, team)' : 'window wall (archetype baseline)'}${input.triple ? ', triple glazing (+2%, 2019 City study)' : ''}.`))
  carbon.push(rule('ec-2025', 'Proposed tighter limit (not adopted)', `${Math.round(mid)} kgCO₂e/m²`, '≤ 360 (380 with maximum credits), proposed for VBBL 2025 and delayed', mid <= 360 ? 'pass' : 'warn', 'unverified', STAFF2024, 'Forward risk only: the Green Buildings Policy asks the rezoning report to show the tower is on track for limits expected at its first Building Permit.'))
  carbon.push(rule('ec-report', 'Embodied Carbon Design Report', 'one per building, at rezoning', 'with a City-listed tool', 'unknown', 'verified', GBPR, 'Required with the resilience worksheet; no energy model is required at rezoning. Massing-stage numbers here inform design only.'))
  carbon.push(rule('ec-240', '"240 is the City\'s 2030 target"', 'false: the 2030 proposal is baseline path −40%, absolute value TBD', '240 = 0.6 × 400 is team arithmetic, drawn dashed', mid <= 240 ? 'pass' : 'warn', 'false_assumption', STAFF2024, 'Kept visible with its correction (research P04-M07).'))

  // Solar PV
  const solar: RuleResult[] = []
  const roofY = pv.surfaces.filter((s) => s.kind === 'roof')
  const fac = pv.surfaces.filter((s) => s.kind === 'facade')
  const best = [...fac].sort((x, y) => y.poa - x.poa)[0], worst = [...fac].sort((x, y) => x.poa - y.poa)[0]
  solar.push(rule('pv-total', 'PV generation', `${Math.round(pv.kwh / 1000).toLocaleString('en-CA')} MWh/yr from ${Math.round(pv.kwp)} kWp`, 'no Vancouver benchmark: report and rank surfaces', 'unknown', 'unverified', IEA_PV,
    `Yields are scaled to the Canadian rooftop average of 1,173 kWh/kWp (IEA PVPS) by each surface's sun and shade, computed hourly on the 15th of each month with approximate monthly sunshine (unverified; replace with an EPW file). ${ctx.obstaclesKnown ? 'Shading counts context buildings and future towers.' : 'Context shading is not counted in this project.'}`))
  solar.push(rule('pv-share', 'PV share of the tower\'s electricity', `${(pv.share * 100).toFixed(1)}%`, 'no code requirement for on-site renewables found', 'unknown', 'unverified', VBBL_A))
  solar.push(rule('pv-credit', 'TEUI and GHGI credit', `TEUI −${pv.teuiCredit.toFixed(2)} kWh/m² · GHGI −${pv.ghgiCredit.toFixed(3)} kgCO₂e/m²`, 'on-site generation is deducted before the factor', 'pass', 'verified', EMG('Eq. 2 and Eq. 5'), 'The GHGI credit is small because BC electricity is low-carbon (0.011).'))
  if (pv.paybackRoof !== null) solar.push(rule('pv-payback', 'PV carbon payback', `roofs ${Math.round(pv.paybackRoof)} yr${pv.paybackFacade !== null ? `, facades ${Math.round(pv.paybackFacade)} yr` : ''} at 0.011; roofs ${Math.round(pv.paybackRoofBC ?? 0)} yr at the 2025 grid factor`, `below the ${input.pv.life}-year module life (team)`, pv.paybackRoof <= input.pv.life ? 'pass' : 'warn', 'team_assumption', BC_GRID,
    `Module embodied carbon ${input.pv.ecPerKwp} kgCO₂e/kWp is a team assumption (no EPD entered). On BC's low-carbon grid, PV may not repay its own embodied carbon: rank surfaces by net carbon before placing panels.`))
  if (best && worst) solar.push(rule('pv-rank', 'Best and worst facade bands', `${best.label}: ${Math.round(best.yieldKwhKwp)} kWh/kWp; ${worst.label}: ${Math.round(worst.yieldKwhKwp)} kWh/kWp (${Math.round(worst.shaded * 100)}% of its sun blocked)`, 'facade average in Canada 821 kWh/kWp (context)', 'unknown', 'unverified', IEA_PV))
  if (roofY[0]) solar.push(rule('pv-roof', 'Roof yield', `${Math.round(roofY[0].yieldKwhKwp)} kWh/kWp, ${Math.round(roofY[0].shaded * 100)}% of sun blocked`, `usable roof ${Math.round(input.pv.roofUsable * 100)}% (team: plant, terraces, green roof)`, 'unknown', 'team_assumption', TEAM, 'Non-accessible roofs also need extensive green roof alongside panels (Sustainable Large Developments A.3.2, per research).'))

  return { areas: a, limits: { ...wl, effective }, estimate: est, net, pv, embodied: ec, operational: op, carbon, solar }
}

export const ENERGY_FALSE_ASSUMPTIONS = [
  { claim: 'VBBL Table A sets the energy targets for the VTC towers.', correction: 'A higher building goes through rezoning under the Higher Buildings Policy s2.2, whose targets are stricter (office and retail GHGI 1.5, TEDI 15). The tool takes the stricter of HBP and VBBL by default.', source: HBP },
  { claim: 'High-rise residential GHGI is 6 and hotel 8.', correction: 'Those applied July 2023 to February 2025. From 1 March 2025 they are 3.0 and 4.0.', source: VBBL_A },
  { claim: 'PV has no effect on GHGI.', correction: 'EMG v3.0 Eq. 2 subtracts on-site generation before the emission factor, so PV lowers GHGI at 0.011 per kWh.', source: EMG('Eq. 2') },
  { claim: '240 kgCO₂e/m² is the City\'s 2030 embodied carbon aspiration.', correction: 'The 2030 proposal is 40% below the baseline path with the absolute value to be decided; 240 is only 0.6 × 400.', source: STAFF2024 },
]

export const SOURCES = { HBP, VBBL_A, VBBL_EC, EMG: EMG('Eq. 2, Eq. 5'), ADDENDUM, GBPR, MH2023, CONCRETE2019, STAFF2024, IEA_PV, BC_GRID }
