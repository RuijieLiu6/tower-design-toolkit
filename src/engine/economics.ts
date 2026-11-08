// Economics node (research P08-M01 value, M03 cost, M04 charges, M05a residual): a port of the Program Value
// Visualizer method (RuijieLiu6/program-value-visualizer, docs/method.md, read 22 Oct 2026) onto Tower Design Toolkit floors.
// Defaults come from that tool's Vancouver 2026 pack (grade A/B/C as the pack rates them) and, for the regional
// charges it leaves out, from research packet P08 round 2. Indicative early-design estimate: not a feasibility study,
// an appraisal or a compliance check.

import { chargeSchedule, COST_LEDGER, costRange, heightPremium, NO_CHARGES, CHARGE_LEDGER, SF as SQFT, type AccTreatment, type ChargeLine, type ChargeParts, type CRow, type Premium } from './costCharges'
import { floorCounts } from './interior'
import { netToGross, towerFloors } from './massing'
import type { Flag, Tower, UseId } from './types'

export interface Row { value: number; unit: string; flag: Flag; source: string; note?: string; low?: number; high?: number }

/** Every number the node uses, each with its flag and source (P08-M00 assumption ledger). */
export interface EconPresets {
  valuePerGfa: Record<UseId, Row>
  hardCost: Record<UseId, Row | null>
  /** Height premium per floor above the podium (value x (1 + p x floors above)). */
  premiumResidential: Row
  premiumOffice: Row
  premiumHotel: Row
  officeLeasing: Row
  sellingCost: Row
  tenantAllowance: Row
  ffePerKey: Row
  tallPremium: Row
  softShare: Row
  financeRate: Row
  buildYears: Row
  drawFactor: Row
  profitOnCost: Row
  dcl: Row
  udclResidential: Row
  udclCommercial: Row
  accResidential1: Row
  accResidential2: Row
  accCommercial: Row
  chargeEscalation: Row
  metroNonRes: Row
  metroPerHome: Row
  translinkOffice: Row
  translinkRetail: Row
  translinkInstitutional: Row
  translinkPerHome: Row
  cacShare: Row
  currentZoningFsr: Row
  landRate: Row
  purchasePremium: Row
  /** P08-M03 cost and P08-M04 charge ledgers (engine/costCharges.ts), read-only here. */
  research: { cost: typeof COST_LEDGER; charges: typeof CHARGE_LEDGER }
}

const PVV = 'Program Value Visualizer, Vancouver 2026 pack'
const PVV_C = (what: string) => `${PVV} (grade C${what ? `, ${what}` : ''})`
const ALTUS = 'Altus Group 2026 Canadian Cost Guide, Vancouver, midpoint (via the PVV pack, grade A, 31 Jan 2026; not re-opened here)'
const SF = 10.7639 // ft² per m²

export const DEFAULT_ECON: EconPresets = {
  valuePerGfa: {
    retail: { value: 12500, unit: 'C$/m² GFA', flag: 'unverified', source: PVV_C('SE1 street retail, RENX Vancouver retail 2022'), note: 'Evidence from 2022: stale (P08-M01 evidence age)' },
    office: { value: 6600, unit: 'C$/m² GFA', flag: 'unverified', source: PVV_C('WK1 office AAA/A, CBRE Canada Office Q3 2026; ÷ 5.4% cap × 0.78 efficiency') },
    hotel: { value: 8000, unit: 'C$/m² GFA', flag: 'unverified', source: PVV_C('ST2 upscale / select-service hotel, CoStar Canadian hotels 2025') },
    residential: { value: 11700, unit: 'C$/m² GFA', flag: 'unverified', source: `${PVV} (grade B, LV1 market condo, Rain City Properties 2026 cost comparison)` },
    civic: { value: 0, unit: 'C$/m² GFA', flag: 'team_assumption', source: `${PVV}: civic floors earn nothing` },
    amenity: { value: 0, unit: 'C$/m² GFA', flag: 'team_assumption', source: `${PVV}: public floors earn nothing (a ticketed deck would)` },
    mechanical: { value: 0, unit: 'C$/m² GFA', flag: 'team_assumption', source: `${PVV}: plant floors earn nothing` },
  },
  hardCost: {
    retail: { value: 4360, unit: 'C$/m² GFA', flag: 'unverified', source: `${ALTUS}: enclosed mall (nearest line)`, low: 3770, high: 4950 },
    office: { value: 4465, unit: 'C$/m² GFA', flag: 'unverified', source: `${ALTUS}: office class A, 31-60 storeys`, low: 3980, high: 4950 },
    hotel: { value: 4360, unit: 'C$/m² GFA', flag: 'unverified', source: `${ALTUS}: suite hotel (nearest to select-service)`, low: 3770, high: 4950 },
    residential: { value: 4575, unit: 'C$/m² GFA', flag: 'unverified', source: `${ALTUS}: condominium, 60+ storeys`, low: 3980, high: 5170 },
    civic: { value: 5270, unit: 'C$/m² GFA', flag: 'unverified', source: `${ALTUS}: municipal office incl. fit-up (nearest line)`, low: 4840, high: 5700 },
    amenity: null,
    mechanical: null,
  },
  premiumResidential: { value: 0.007, unit: 'per floor', flag: 'unverified', source: PVV_C('roomvu 2019'), low: 0.001, high: 0.015 },
  premiumOffice: { value: 0.002, unit: 'per floor', flag: 'team_assumption', source: PVV_C('assumption'), low: 0, high: 0.005 },
  premiumHotel: { value: 0, unit: 'per floor', flag: 'team_assumption', source: PVV_C('assumption, select-service hotel'), low: 0, high: 0.003 },
  officeLeasing: { value: 0.15, unit: 'share of office value', flag: 'team_assumption', source: PVV_C('assumption: incentives, free rent, commissions'), low: 0.1, high: 0.2 },
  sellingCost: { value: 0.05, unit: 'share of strata value', flag: 'team_assumption', source: PVV_C('assumption') },
  tenantAllowance: { value: 860, unit: 'C$/m² office GFA', flag: 'team_assumption', source: PVV_C('assumption; Altus fit-out add-on is the alternative') },
  ffePerKey: { value: 100000, unit: 'C$ per key', flag: 'team_assumption', source: PVV_C('assumption; excluded from Altus'), low: 60000, high: 150000 },
  tallPremium: { value: 0.15, unit: 'of base hard cost, towers > 250 m', flag: 'team_assumption', source: PVV_C('placeholder: replace with a cost consultant\'s figure'), low: 0.1, high: 0.25 },
  softShare: { value: 0.25, unit: 'of hard cost', flag: 'team_assumption', source: PVV_C('design, permits, insurance, legal, marketing'), low: 0.2, high: 0.3 },
  financeRate: { value: 0.065, unit: 'per year', flag: 'team_assumption', source: PVV_C('assumption'), low: 0.06, high: 0.075 },
  buildYears: { value: 6, unit: 'years', flag: 'team_assumption', source: PVV_C('assumption'), low: 4, high: 8 },
  drawFactor: { value: 0.5, unit: 'average share drawn', flag: 'team_assumption', source: PVV_C('assumption') },
  profitOnCost: { value: 0.15, unit: 'of total cost', flag: 'verified', source: 'Coriolis for the City of Vancouver (staff report R4, App. G): 15% on cost viable; PVV pack grade A', low: 0.12, high: 0.2 },
  dcl: { value: 214.89, unit: 'C$/m²', flag: 'verified', source: 'City-wide DCL after the 20% reduction, apartments > 1.5 FSR and commercial (Council report R4 schedule, 14 Jul 2026, research P08-S25; enacted by-law text not opened)' },
  udclResidential: { value: 134.65, unit: 'C$/m²', flag: 'verified', source: 'Utilities DCL, apartments > 1.5 FSR (Council schedule 2025; P08-S25)' },
  udclCommercial: { value: 67.33, unit: 'C$/m²', flag: 'verified', source: 'Utilities DCL, commercial and other (Council schedule 2025; P08-S25)' },
  accResidential1: { value: 53.82, unit: 'C$/m²', flag: 'verified', source: 'ACC apartments > 1.5 FSR, from 30 Sep 2026 (City ACC bulletin 2026; PVV grade A)' },
  accResidential2: { value: 110.87, unit: 'C$/m²', flag: 'verified', source: 'ACC apartments > 1.5 FSR, from 30 Sep 2027 (City ACC bulletin 2026; PVV grade A)' },
  accCommercial: { value: 32.29, unit: 'C$/m²', flag: 'verified', source: 'ACC commercial and other (office, retail, institutional, hotel), from 30 Sep 2026 (City ACC bulletin 2026)' },
  chargeEscalation: { value: 0.03, unit: 'per year to 2029', flag: 'verified', source: 'City rates rise 3% each 30 Sep 2027-2029 (P08-S25); applying it per permit year is the PVV author\'s reading (grade C)' },
  metroNonRes: { value: 13.94 * SF, unit: 'C$/m² non-residential', flag: 'verified', source: 'Metro Vancouver DCCs from 1 Jan 2027: sewer $5.83 + water $7.51 + parkland $0.60 = $13.94/ft² (Metro Vancouver pages, research P08-S30, S45; not in the PVV pack)' },
  metroPerHome: { value: 17323, unit: 'C$ per apartment', flag: 'verified', source: 'Metro Vancouver DCCs from 1 Jan 2027: sewer + water + parkland (research P08-S30, S45)' },
  translinkOffice: { value: 1.16 * SF, unit: 'C$/m² office, hotel, amenity', flag: 'verified', source: 'TransLink regional DCC from 1 Jan 2026 (Hemson table in R4; research P08-S46); hotel and amenity at the office rate is a team reading' },
  translinkRetail: { value: 1.44 * SF, unit: 'C$/m² retail', flag: 'verified', source: 'TransLink regional DCC (research P08-S46)' },
  translinkInstitutional: { value: 0.56 * SF, unit: 'C$/m² civic', flag: 'verified', source: 'TransLink regional DCC, institutional (research P08-S46)' },
  translinkPerHome: { value: 1774, unit: 'C$ per apartment', flag: 'verified', source: 'TransLink regional DCC (research P08-S46)' },
  cacShare: { value: 0.75, unit: 'of land lift', flag: 'unverified', source: `${PVV} (grade B, Lincoln Institute 2018); none for a 100% employment rezoning (City, 14 Jul 2026)`, low: 0, high: 0.8 },
  currentZoningFsr: { value: 11, unit: 'FSR', flag: 'unverified', source: `${PVV} (grade B, DODP 2026)`, low: 9, high: 11 },
  landRate: { value: 3230, unit: 'C$/buildable m²', flag: 'unverified', source: PVV_C('Colliers land 2025'), low: 1610, high: 6620 },
  purchasePremium: { value: 0, unit: 'over current-zoning value', flag: 'team_assumption', source: PVV_C('assumption'), low: 0, high: 0.25 },
  research: { cost: COST_LEDGER, charges: CHARGE_LEDGER },
}

/** Net-to-gross by height band (PVV pack, grade C) and the efficiency each value row was derived with. */
const EFF_BANDS: [number, number, number][] = [[20, 0.8, 0.84], [45, 0.76, 0.82], [Infinity, 0.72, 0.78]]
const DERIVED_EFF = { office: 0.78, residential: 0.82 }
/** Retail value by level (PVV pack, grade C): street level full, level 2 at 40%, higher retail earns nothing. */
const RETAIL_LEVEL = (level: number) => (level <= 1 ? 1 : level === 2 ? 0.4 : 0)

export interface EconInputs {
  /** Building-permit year: charge rates step each 30 Sep. */
  permitYear: number
  /** Land price (C$); null = estimate from current zoning when the site area is known. */
  landPrice: number | null
  /** Site area (m²) for the land estimate; null when unknown (Real Vancouver). */
  siteArea: number | null
  includeRegional: boolean
  homeM2: number
  hotelM2PerKey: number
  /** Hard-cost basis: research P08-M03 (39-storey anchor + height elasticity, default) or the PVV pack's Altus 2026 lines. */
  costBasis?: 'research' | 'pvv'
  /** Residential base for the research basis: Coriolis 2026 (default) or the Altus 2025 band top. */
  residentialBase?: 'coriolis' | 'altus'
  /** Contingency (share of hard cost). The P10/P90 range shows only when it is above 0 (P08-M03). */
  contingency?: number
  /** Civic and public-amenity floors designated as Cultural Facility or similar: $10 per permit (P08-M04). */
  civicReduced?: boolean
  /** ACC on a rezoning with a negotiated CAC (P08-M04): payable by default. */
  accTreatment?: AccTreatment
}

export interface Construction {
  basis: 'research' | 'pvv'
  residentialBase: 'coriolis' | 'altus'
  towers: { id: string; name: string; premium: Premium }[]
  /** Share of GFA with a sourced base hard-cost line (the rest is priced at the average and flagged). */
  sourcedShare: number
  contingencyRate: number
  contingency: number
  /** Hard cost including the premium and contingency: the P50 of the AACE range. */
  estimate: number
  range: { p10: number; p50: number; p90: number; multiplier: number } | null
  /** Total cost excluding land and profit per gross ft², beside the Coriolis 2026 cases. */
  tdcPerSf: number
}

export interface FloorEcon { tower: string; level: number; use: UseId; gfa: number; value: number; cost: number; residual: number }

export type Verdict = 'works' | 'marginal' | 'fails' | 'land-needed' | 'incomplete'

export interface EconResult {
  floors: FloorEcon[]
  gfa: number
  value: number
  hard: number
  soft: number
  cityCharges: number
  regionalCharges: number
  finance: number
  cost: number
  profit: number
  rlvBefore: number
  landCurrent: number | null
  land: number | null
  cac: number
  employmentOnly: boolean
  rlvAfter: number
  verdict: Verdict
  /** Floors with no hard-cost line, priced at the project average (flagged). */
  averaged: number
  /** Residual per m² GFA, for comparisons. */
  rlvPerM2: number
  byUse: Record<UseId, { gfa: number; value: number; cost: number }>
  construction: Construction
  charges: { lines: ChargeLine[]; total: number; complete: boolean; deferral: { atPermit: number; deferred: number; fee: number } | null; perM2: number }
}

const ZERO = (): Record<UseId, { gfa: number; value: number; cost: number }> => ({ retail: { gfa: 0, value: 0, cost: 0 }, office: { gfa: 0, value: 0, cost: 0 }, hotel: { gfa: 0, value: 0, cost: 0 }, residential: { gfa: 0, value: 0, cost: 0 }, civic: { gfa: 0, value: 0, cost: 0 }, amenity: { gfa: 0, value: 0, cost: 0 }, mechanical: { gfa: 0, value: 0, cost: 0 } })

/** City charge rates (C$/m²) at the permit year: +3% each 30 Sep from 2027; residential ACC steps up on 30 Sep 2027. */
export function chargeRates(p: EconPresets, permitYear: number) {
  const steps = Math.max(0, Math.min(3, Math.round(permitYear) - 2026))
  const k = Math.pow(1 + p.chargeEscalation.value, steps)
  const accRes = steps === 0 ? p.accResidential1.value : p.accResidential2.value * Math.pow(1 + p.chargeEscalation.value, steps - 1)
  const parts = { accRes, accCom: p.accCommercial.value * k, dcl: p.dcl.value * k, udclRes: p.udclResidential.value * k, udclCom: p.udclCommercial.value * k }
  return {
    ...parts,
    residential: parts.dcl + parts.udclRes + parts.accRes,
    commercial: parts.dcl + parts.udclCom + parts.accCom,
    // Civic and amenity floors pay commercial rates unless designated (Cultural Facility and similar: $10 per permit).
    civic: parts.dcl + parts.udclCom + parts.accCom,
  }
}

export function economics(towers: Tower[], inp: EconInputs, p: EconPresets = DEFAULT_ECON): EconResult {
  const rates = chargeRates(p, inp.permitYear)
  const basis = inp.costBasis ?? 'research'
  const resBaseId = inp.residentialBase ?? 'coriolis'
  const c = Math.max(0, inp.contingency ?? 0)
  const accTreatment = inp.accTreatment ?? 'payable'
  const L = COST_LEDGER
  const line = (u: UseId): CRow | null => basis === 'pvv' ? p.hardCost[u] : u === 'residential' ? (resBaseId === 'altus' ? L.altusResidential : L.base.residential) : L.base[u]
  const floors: FloorEcon[] = []
  const byUse = ZERO()
  const sums = { commercial: NO_CHARGES(), residential: NO_CHARGES(), reduced: 0 }
  const add = (a: ChargeParts, b: ChargeParts) => { a.acc += b.acc; a.dcl += b.dcl; a.udcl += b.udcl; a.metro += b.metro; a.translink += b.translink }
  let gfa = 0, value = 0, hard = 0, contingency = 0, cityCharges = 0, regionalCharges = 0, averaged = 0, sourced = 0, homes = 0, resArea = 0, comArea = 0
  // First pass: priced hard cost per m² for the project average used by floors without a line.
  let pricedArea = 0, pricedCost = 0
  for (const t of towers) for (const f of towerFloors(t)) { const r = line(f.use); if (r) { pricedArea += f.area; pricedCost += f.area * r.value } }
  const avgHard = pricedArea ? pricedCost / pricedArea : (line('office') ?? p.hardCost.office!).value
  const construction: Construction['towers'] = []
  for (const t of towers) {
    const ntg = netToGross(t)
    const all = towerFloors(t)
    const tGfa = all.reduce((a, f) => a + f.area, 0)
    const prem = heightPremium(all.length, tGfa ? all.filter((f) => f.use === 'residential').reduce((a, f) => a + f.area, 0) / tGfa : 0, L)
    construction.push({ id: t.id, name: t.name, premium: prem })
    // Research basis: the premium applies once to the building above the anchor; PVV basis: its > 250 m placeholder.
    const tall = basis === 'research' ? prem.factor * (1 + L.escalation.value) : t.height > 250 ? 1 + p.tallPremium.value : 1
    let above = 0
    for (const f of all) {
      if (!f.podium) above++
      const band = EFF_BANDS.find((b) => f.level <= b[0])!
      let v = 0
      const base = p.valuePerGfa[f.use].value
      if (f.use === 'office') v = f.area * (band[1] / DERIVED_EFF.office) * base * (1 + p.premiumOffice.value * above) * (1 - p.officeLeasing.value)
      else if (f.use === 'residential') v = f.area * (band[2] / DERIVED_EFF.residential) * base * (1 + p.premiumResidential.value * above) * (1 - p.sellingCost.value)
      else if (f.use === 'hotel') v = f.area * base * (1 + p.premiumHotel.value * above)
      else if (f.use === 'retail') v = f.area * base * RETAIL_LEVEL(f.level)
      else v = f.area * base
      const ln = line(f.use)
      if (!ln) averaged++; else sourced += f.area
      let h = f.area * (ln ? ln.value : avgHard) * tall
      if (f.use === 'office') h += f.area * p.tenantAllowance.value
      // Keys and homes come from the interior layout when the tower has one (engine/interior.ts), else the area proxy.
      const counts = floorCounts(t, f)
      if (f.use === 'hotel') h += (counts?.keys ?? (f.area * ntg) / Math.max(1, inp.hotelM2PerKey)) * p.ffePerKey.value
      const cont = h * c
      // Statutory charges by component (P08-M04): plant floors pay nothing; designated public uses pay $10 per permit.
      const res = f.use === 'residential'
      const parts = NO_CHARGES()
      const reduced = !!inp.civicReduced && (f.use === 'civic' || f.use === 'amenity')
      if (f.use !== 'mechanical' && !reduced) {
        parts.acc = accTreatment === 'not-payable' ? 0 : f.area * (res ? rates.accRes : rates.accCom)
        parts.dcl = f.area * rates.dcl
        parts.udcl = f.area * (res ? rates.udclRes : rates.udclCom)
      }
      if (reduced) sums.reduced = 3 * CHARGE_LEDGER.reducedPerPermit.value // one permit, three schedules
      const fHomes = res ? (counts?.homes ?? (f.area * ntg) / Math.max(1, inp.homeM2)) : 0
      if (inp.includeRegional && f.use !== 'mechanical') {
        if (res) { parts.metro = fHomes * p.metroPerHome.value; parts.translink = fHomes * p.translinkPerHome.value }
        else { parts.metro = f.area * p.metroNonRes.value; parts.translink = f.area * (f.use === 'retail' ? p.translinkRetail.value : f.use === 'civic' ? p.translinkInstitutional.value : p.translinkOffice.value) }
      }
      add(res ? sums.residential : sums.commercial, parts)
      if (f.use !== 'mechanical') { if (res) { resArea += f.area; homes += fHomes } else comArea += f.area }
      const city = parts.acc + parts.dcl + parts.udcl
      const regional = parts.metro + parts.translink
      // Floor share of soft cost, finance and profit, so a floor's residual reads like the PVV floor chart.
      const soft = h * p.softShare.value
      const fin = p.financeRate.value * p.buildYears.value * p.drawFactor.value * (h + cont + soft)
      const cost = (h + cont + soft + city + regional + fin) * (1 + p.profitOnCost.value)
      floors.push({ tower: t.id, level: f.level, use: f.use, gfa: f.area, value: v, cost, residual: v - cost })
      byUse[f.use].gfa += f.area; byUse[f.use].value += v; byUse[f.use].cost += cost
      gfa += f.area; value += v; hard += h; contingency += cont; cityCharges += city; regionalCharges += regional
    }
  }
  cityCharges += sums.reduced
  const soft = hard * p.softShare.value
  const finance = p.financeRate.value * p.buildYears.value * p.drawFactor.value * (hard + contingency + soft)
  const cost = hard + contingency + soft + cityCharges + regionalCharges + finance
  const profit = cost * p.profitOnCost.value
  const rlvBefore = value - cost - profit
  const landCurrent = inp.siteArea ? p.currentZoningFsr.value * p.landRate.value * inp.siteArea : null
  const land = inp.landPrice ?? (landCurrent != null ? landCurrent * (1 + p.purchasePremium.value) : null)
  const employmentOnly = byUse.residential.gfa < 1
  const accTotal = sums.commercial.acc + sums.residential.acc
  let cac = employmentOnly ? 0 : Math.max(0, p.cacShare.value * (rlvBefore - (landCurrent ?? land ?? 0)))
  if (accTreatment === 'netted') cac = Math.max(0, cac - accTotal)
  const rlvAfter = rlvBefore - cac
  let verdict: Verdict
  if (gfa < 1 || value <= 0) verdict = 'incomplete'
  else if (land == null) verdict = rlvAfter > 0 ? 'land-needed' : 'fails'
  else if (rlvAfter >= land) verdict = 'works'
  else if (rlvAfter >= 0.9 * land) verdict = 'marginal'
  else verdict = 'fails'
  const schedule = chargeSchedule({
    sums, rates, areas: { commercial: comArea, residential: resArea, homes }, permitYear: inp.permitYear, includeRegional: inp.includeRegional, accTreatment,
    sources: { acc: `${p.accCommercial.source}; ${p.accResidential2.source}`, dcl: p.dcl.source, udcl: p.udclCommercial.source, metro: p.metroNonRes.source, translink: p.translinkOffice.source },
  })
  const anyAbove = basis === 'research' && construction.some((x) => x.premium.above > 0)
  return {
    floors, gfa, value, hard, soft, cityCharges, regionalCharges, finance, cost, profit, rlvBefore, landCurrent, land, cac, employmentOnly, rlvAfter, verdict, averaged, rlvPerM2: gfa ? rlvAfter / gfa : 0, byUse,
    construction: {
      basis, residentialBase: resBaseId, towers: construction, sourcedShare: gfa ? sourced / gfa : 0, contingencyRate: c, contingency, estimate: hard + contingency,
      range: costRange(hard + contingency, c, anyAbove, L), tdcPerSf: gfa ? cost / (gfa * SQFT) : 0,
    },
    charges: { ...schedule, perM2: gfa ? (cityCharges + regionalCharges) / gfa : 0 },
  }
}

/**
 * The outcome in words (overnight brief, 8 Nov: "A preliminary negative residual estimate should describe the outcome
 * under its assumptions"; no blanket "Doesn't work"). Each names what was compared; the numbers and the evidence flag are
 * shown beside it, unchanged. The calculation and the verdict states are the same as before.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  works: 'Estimated residual at or above the assumed land price',
  marginal: 'Estimated residual within 10% below the assumed land price',
  fails: 'Estimated residual below the assumed land price',
  'land-needed': 'Residual estimated; no land price to compare it with',
  incomplete: 'Not computed: the model has no floor area or value yet',
}
/** The outcome for a result: with no land price, a negative residual says so rather than naming a comparison. */
export function verdictText(r: Pick<EconResult, 'verdict' | 'land' | 'rlvAfter'>): string {
  if (r.verdict === 'fails' && r.land == null) return 'Estimated residual is negative (no land price entered)'
  return VERDICT_LABEL[r.verdict]
}

/** Compact money: C$1.2 B, C$340 M, C$12 k. */
export function money(v: number): string {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  if (a >= 1e9) return `${s}C$${(a / 1e9).toFixed(2)} B`
  if (a >= 1e6) return `${s}C$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)} M`
  if (a >= 1e3) return `${s}C$${Math.round(a / 1e3)} k`
  return `${s}C$${Math.round(a)}`
}
