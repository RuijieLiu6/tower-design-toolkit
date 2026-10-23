// Construction cost and tall-building premium (research P08-M03) and statutory charges (P08-M04) for the economics
// node (backlog item 39). Spec: 04 Tool Plan/research/modules-completion/P08/revise-r2_P08.json. Every rate carries its
// source and effective date; where the research has no rate the line stays blank (unresolved), never invented.
import type { Flag, UseId } from './types'

/** One ledger number (same shape as economics.ts Row, kept here to avoid an import cycle). */
export interface CRow { value: number; unit: string; flag: Flag; source: string; note?: string; low?: number; high?: number; label?: string }

export const SF = 10.7639 // ft² per m²

const CORIOLIS = 'Coriolis Consulting for the City of Vancouver, Financing Growth Update (in Council report R4, 14 Jul 2026; research P08-S56)'
const R4 = 'Council report R4, 14 Jul 2026, staff schedules (research P08-S25; enacted by-law text not opened)'

/** P08-M03 ledger: base hard cost per use (anchored at 39 storeys), height elasticities and the AACE range. */
export const COST_LEDGER = {
  /** Base hard cost per use at the 39-storey anchor. null = no sourced row (hotel, retail, civic, amenity, plant). */
  base: {
    residential: { label: 'Residential base hard cost at 39 storeys (Coriolis 2026)', value: 605 * SF, unit: 'C$/m² GFA', flag: 'verified', source: `${CORIOLIS}: downtown high-rise strata hard cost $580-630/ft² gross (midpoint)`, low: 580 * SF, high: 630 * SF, note: 'Mid and high-rise cases, not supertall; scope differs from Altus' },
    office: { label: 'Office base hard cost at 39 storeys (Coriolis 2026)', value: 585 * SF, unit: 'C$/m² GFA', flag: 'verified', source: `${CORIOLIS}: office hard cost $580-590/ft² (midpoint)`, low: 580 * SF, high: 590 * SF },
    retail: null, hotel: null, civic: null, amenity: null, mechanical: null,
  } as Record<UseId, CRow | null>,
  /** Alternative residential base: the top of the Altus 2025 13-39 storey concrete band. */
  altusResidential: { label: 'Residential base hard cost, Altus 2025 band top', value: 455 * SF, unit: 'C$/m² GFA', flag: 'unverified', source: 'Altus Group Canadian Cost Guide 2025, Vancouver concrete residential 13-39 storeys, $360-455/ft² (band top), as reported by STOREYS (research P08-S13; secondary report)', low: 360 * SF, high: 455 * SF } as CRow,
  anchorStoreys: { label: 'Tall-building premium anchor', value: 39, unit: 'storeys', flag: 'team_assumption', source: 'Top of the Altus 13-39 storey band (P08-S13); anchoring there keeps the sourced band intact (P08-M03, team assumption)' } as CRow,
  epsCommercial: { label: 'Height cost elasticity, commercial', value: 0.26, unit: 'cost elasticity', flag: 'verified', source: 'Ahlfeldt and Barr 2022, The economics of skyscrapers (research P08-S16): commercial above nine floors; a lower bound at 55-100 storeys' } as CRow,
  epsResidential: { label: 'Height cost elasticity, residential', value: 0.56, unit: 'cost elasticity', flag: 'verified', source: 'Ahlfeldt and Barr 2022 (research P08-S16): residential above nine floors; a lower bound at 55-100 storeys' } as CRow,
  perFloor: { label: '2% per floor rule (comparison)', value: 0.02, unit: 'per floor (comparison only)', flag: 'unverified', source: 'UK 1971 rule of thumb, 2% per floor (research P08-S16/S40); shown linear and compound, not applied' } as CRow,
  aaceLow: { label: 'AACE Class 5 low side', value: 0.3, unit: 'below the estimate (P10)', flag: 'verified', source: 'AACE RP 56R-08 Table 1, Class 5: -20% to -30% (research P08-S21); the wide end is used' } as CRow,
  aaceHigh: { label: 'AACE Class 5 high side', value: 0.5, unit: 'above the estimate (P90)', flag: 'verified', source: 'AACE RP 56R-08 Table 1, Class 5: +30% to +50% (research P08-S21); the wide end is used' } as CRow,
  highSide: { label: 'High-side multiplier above the band', value: 2, unit: '× high side above the band', flag: 'team_assumption', source: 'AACE RP 56R-08 text: the high side may be 2-3× for risky projects (P08-S21); 2× above 39 storeys is the team default (editable to 3×)' } as CRow,
  escalation: { label: 'Cost escalation to valuation date', value: 0, unit: 'from cost vintage to valuation', flag: 'unresolved', source: 'Statistics Canada Vancouver building construction price index (research P08-S62) not read: 0 until it is' } as CRow,
}

/** Lines outside the elasticity: blank register rows that widen the high side once a person fills them (P08-M03). */
export const RISK_REGISTER = ['Seismic performance-based design and peer review', 'Wind tunnel testing and damping', 'Deep foundations and dewatering', 'Sky-lobby floors and vertical transport'] as const

/** Coriolis 2026 total cost excluding land (C$/ft² gross), shown beside the result to expose scale, never to judge. */
export const CORIOLIS_TDC = { office: [900, 910], strata: [870, 965], source: CORIOLIS }

export interface Premium {
  storeys: number
  /** Storeys above the anchor: extrapolated, flagged (not a fail). */
  above: number
  resShare: number
  eps: number
  /** Applied once to the building: (N / anchor)^eps, 1 at or below the anchor. */
  factor: number
  /** Comparison lines, all lower bounds at these heights. */
  lines: { commercial: number; residential: number; linear: number; compound: number }
}

/** Building-level tall-building premium (P08-M03): (N/39)^eps, eps blended by the residential GFA share. */
export function heightPremium(storeys: number, resShare: number, L = COST_LEDGER): Premium {
  const a = L.anchorStoreys.value
  const eps = L.epsCommercial.value * (1 - resShare) + L.epsResidential.value * resShare
  const r = storeys > a ? storeys / a : 1
  const above = Math.max(0, storeys - a)
  return {
    storeys, above, resShare, eps, factor: Math.pow(r, eps),
    lines: { commercial: Math.pow(r, L.epsCommercial.value), residential: Math.pow(r, L.epsResidential.value), linear: 1 + L.perFloor.value * above, compound: Math.pow(1 + L.perFloor.value, above) },
  }
}

/** AACE Class 5 P10/P90 around an estimate that includes contingency; none while contingency is 0 (P08-M03). */
export function costRange(estimate: number, contingency: number, extrapolated: boolean, L = COST_LEDGER) {
  if (!(contingency > 0)) return null
  const m = extrapolated ? L.highSide.value : 1
  return { p10: estimate * (1 - L.aaceLow.value), p50: estimate, p90: estimate * (1 + L.aaceHigh.value * m), multiplier: m }
}

// --- Statutory charges (P08-M04) ---------------------------------------------------------------------------------

export type ChargeStatus = 'in force' | 'approved' | 'blank' | 'none' | 'false assumption'
export interface ChargeLine { id: string; item: string; basis: string; rate: string; total: number | null; effective: string; status: ChargeStatus; flag: Flag; source: string }

/** P08-M04 ledger rows that economics.ts doesn't already hold. */
export const CHARGE_LEDGER = {
  reducedPerPermit: { label: 'Reduced-rate public uses', value: 10, unit: 'C$ per permit, per schedule', flag: 'verified', source: `${R4}: Cultural Facility, Library, Community Centre, Social Service Centre and Public Authority Use pay $10 per permit in the DCL, Utilities DCL and ACC schedules` } as CRow,
  deferralThreshold: { label: 'DCL deferral threshold', value: 500000, unit: 'C$ of DCL', flag: 'verified', source: `${R4}; McCarthy Tetrault on the approved measures (research P08-S27)` } as CRow,
  deferralAtPermit: { label: 'DCL and ACC paid at permit when deferred', value: 0.25, unit: 'of DCL and ACC at permit', flag: 'verified', source: `${R4}: 25% at building permit, the rest secured and due before occupancy or within four years` } as CRow,
  deferralFee: { label: 'Deferral fee', value: 1000, unit: 'C$ per deferral', flag: 'verified', source: `${R4} (P08-S27)` } as CRow,
}

export interface ChargeParts { acc: number; dcl: number; udcl: number; metro: number; translink: number }
export const NO_CHARGES = (): ChargeParts => ({ acc: 0, dcl: 0, udcl: 0, metro: 0, translink: 0 })

export type AccTreatment = 'payable' | 'netted' | 'not-payable'
export const ACC_TREATMENT_LABEL: Record<AccTreatment, string> = {
  payable: 'ACC payable, no credit (default)',
  netted: 'Netted in the CAC negotiation (R4 reading)',
  'not-payable': 'Not payable on a CAC rezoning (Coriolis reading)',
}

const fmt = (v: number) => `$${v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2)}`

/**
 * The dated schedule (P08-M04 ChargesSchedule) from the per-use sums the economics engine computed, plus the lines no
 * rate covers yet. `rates` are the C$/m² in force at the permit year.
 */
export function chargeSchedule(o: {
  sums: { commercial: ChargeParts; residential: ChargeParts; reduced: number }
  rates: { accCom: number; accRes: number; dcl: number; udclCom: number; udclRes: number }
  areas: { commercial: number; residential: number; homes: number }
  permitYear: number
  includeRegional: boolean
  accTreatment: AccTreatment
  sources: { acc: string; dcl: string; udcl: string; metro: string; translink: string }
}): { lines: ChargeLine[]; total: number; complete: boolean; deferral: { atPermit: number; deferred: number; fee: number } | null } {
  const { sums: s, rates: r, areas: a } = o
  const after = `30 Sep 2026; +3% each 30 Sep 2027-29 (permit ${o.permitYear})`
  const acc = o.accTreatment === 'not-payable'
  const lines: ChargeLine[] = [
    { id: 'acc-com', item: 'ACC, commercial and other', basis: `${Math.round(a.commercial).toLocaleString()} m² non-residential`, rate: acc ? 'not payable (scenario)' : `${fmt(r.accCom)}/m²`, total: s.commercial.acc, effective: after, status: 'approved', flag: 'verified', source: o.sources.acc },
    { id: 'acc-res', item: 'ACC, apartments above 1.5 FSR', basis: `${Math.round(a.residential).toLocaleString()} m² residential`, rate: acc ? 'not payable (scenario)' : `${fmt(r.accRes)}/m²`, total: s.residential.acc, effective: '$53.82 from 30 Sep 2026, $110.87 from 30 Sep 2027; +3% each 30 Sep 2028-29', status: 'approved', flag: 'verified', source: o.sources.acc },
    { id: 'dcl', item: 'City-wide DCL (20% reduction already in the rate)', basis: 'all chargeable floor area', rate: `${fmt(r.dcl)}/m²`, total: s.commercial.dcl + s.residential.dcl, effective: after, status: 'approved', flag: 'verified', source: o.sources.dcl },
    { id: 'udcl', item: 'Utilities DCL (payable by rental too)', basis: 'commercial / residential area', rate: `${fmt(r.udclCom)} / ${fmt(r.udclRes)} per m²`, total: s.commercial.udcl + s.residential.udcl, effective: after, status: 'approved', flag: 'verified', source: o.sources.udcl },
    { id: 'reduced', item: 'Reduced-rate public uses (Cultural Facility and similar)', basis: s.reduced ? 'civic and public-amenity floors, as designated' : 'not claimed: civic and amenity floors pay commercial rates', rate: '$10 per permit in each of 3 schedules', total: s.reduced, effective: '30 Sep 2026', status: 'approved', flag: 'verified', source: CHARGE_LEDGER.reducedPerPermit.source },
  ]
  if (o.includeRegional) lines.push(
    { id: 'metro', item: 'Metro Vancouver DCCs (sewer, water, parkland)', basis: `${Math.round(a.commercial).toLocaleString()} m² non-residential + ${Math.round(a.homes).toLocaleString()} homes`, rate: '$13.94/ft² non-res; $17,323 per apartment', total: s.commercial.metro + s.residential.metro, effective: 'in force 24 Jul 2026; these rates from 1 Jan 2027, fixed at building permit', status: 'in force', flag: 'verified', source: o.sources.metro },
    { id: 'translink', item: 'TransLink regional transportation DCC', basis: 'area by use + homes', rate: '$1.16-1.44/ft²; $1,774 per apartment', total: s.commercial.translink + s.residential.translink, effective: '1 Jan 2026', status: 'in force', flag: 'verified', source: o.sources.translink },
  )
  lines.push(
    { id: 'ssac', item: 'School Site Acquisition Charge', basis: 'applicability unknown', rate: 'blank', total: null, effective: '—', status: 'blank', flag: 'unresolved', source: 'No rate in the research (P08-M04 limits)' },
    { id: 'permit-fees', item: 'Building permit fees', basis: '—', rate: 'blank', total: null, effective: '—', status: 'blank', flag: 'unresolved', source: 'No rate in the research (P08-M04 limits)' },
    { id: 'large-sites', item: 'Sustainable Large Developments and green-building costs', basis: 'applies to sites over 8,000 m² or projects over 45,000 m²', rate: 'blank', total: null, effective: '—', status: 'blank', flag: 'unresolved', source: `${R4}: policy in scope; no cost in the research` },
    { id: 'art', item: 'Public art contribution', basis: 'rezonings submitted after 30 Sep 2026', rate: 'none: funded through the ACC (on-site art can be offered in kind)', total: 0, effective: '30 Sep 2026', status: 'none', flag: 'verified', source: `${R4}; City ACC page (research P08-S57)` },
    { id: 'rental', item: 'Rental relief (Class A 100%, Class B 86.24% of DCL and ACC)', basis: 'needs a wholly rental building: no strata, CMHC-based rents, 60-year agreement (draft s.6.1); Utilities DCL still payable', rate: 'not applied: this scheme is valued as strata', total: 0, effective: '30 Sep 2026', status: 'none', flag: 'verified', source: `${R4}; research P08-S27 (the 8,000 m² bar is an example, not a condition)` },
    { id: 'legacy-cac', item: 'Legacy per-ft² CAC targets', basis: 'removed for applications after 30 Sep 2026; negotiated CACs stay for large rezonings', rate: 'not applied', total: null, effective: 'ended 30 Sep 2026', status: 'false assumption', flag: 'false_assumption', source: `${R4} p.22; City ACC page (research P08-S57, S58)` },
  )
  const total = lines.reduce((t, l) => t + (l.total ?? 0), 0)
  const dclTotal = s.commercial.dcl + s.residential.dcl + s.commercial.udcl + s.residential.udcl
  const accTotal = s.commercial.acc + s.residential.acc
  const deferral = dclTotal >= CHARGE_LEDGER.deferralThreshold.value
    ? { atPermit: CHARGE_LEDGER.deferralAtPermit.value * (dclTotal + accTotal), deferred: (1 - CHARGE_LEDGER.deferralAtPermit.value) * (dclTotal + accTotal), fee: CHARGE_LEDGER.deferralFee.value }
    : null
  // Required rows still blank (SSAC, permit fees, large-site costs): the total is shown as incomplete.
  return { lines, total, complete: !lines.some((l) => l.status === 'blank'), deferral }
}
