// Code and life safety (research P11 r2): occupancy per storey (P11-M09, the part the checks need), the high-building
// and life-safety checklist (P11-M05), barrier-free vertical access (P11-M07), and plant floors, risers and emergency
// power (P11-M03). Clauses were read in VBBL 2019 (Part 3 consolidated to 1 Jul 2024, Section 3.8 to 7 Mar 2023);
// VBBL 2025 is in force but unread (HTTP 403 in research), so every clause item is flagged unverified. Items the egress
// and lift nodes already check are linked from their results, never re-checked here. An early checklist, not code
// certification: the code consultant, fire engineer and Chief Building Official decide.
import type { EgressResult } from './egress'
import type { LiftPresets, LiftResult } from './lifts'
import { towerFloors } from './massing'
import type { Floor, Flag, RuleResult, RuleState, Source, Tower, UseId } from './types'

const PART3 = 'Vancouver Building By-law 2019, Part 3'
const VBBL_32: Source = { label: `${PART3}, Section 3.2 Building Fire Safety (consolidated 1 Jul 2024; VBBL 2025 unread)`, url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/59509560' }
const VBBL_33: Source = { label: `${PART3}, Section 3.3 Safety within Floor Areas (consolidated 1 Jul 2024; VBBL 2025 unread)`, url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/758782467' }
const VBBL_38: Source = { label: `${PART3}, Section 3.8 Accessibility (consolidated 7 Mar 2023; VBBL 2025 unread)`, url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/369101801' }
const VPBL_26: Source = { label: 'Vancouver Building By-law 2019, Book II Plumbing, Section 2.6 Potable Water Systems (consolidated 23 Jan 2024; VBBL 2025 Book II unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vpbl2019/238839733' }
const PHCP: Source = { label: 'PHCP Pros, High-rise water distribution (trade article)', url: 'https://www.phcppros.com/articles/1904-high-rise-water-distribution' }
const CIBSE_D: Source = { label: 'CIBSE Guide D, chapter 6 evacuation lifts (UK guidance; 2015 edition, superseded)', url: 'https://www.cibse.org/knowledge-research/knowledge-portal/transportation-systems-in-buildings-guide-d/' }
const BC_B24: Source = { label: 'BC Information Bulletin B24-05, 2024 BC Codes (provincial reference: BC Codes do not apply in Vancouver)', url: 'https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/construction-industry/building-codes-and-standards/bulletins/2024-code/b24-05_2024_edition_of_the_bc_codes.pdf' }
const TEAM: Source = { label: 'Team preset (no sourced value; research P11-M03)' }
export const MECH_FLOOR_SOURCE: Source = { label: 'Wikipedia, Mechanical floor (tertiary source, citations needed)', url: 'https://en.wikipedia.org/wiki/Mechanical_floor' }

/** Printed with every result of this node (P11-M05 method step 7). */
export const NOT_CERTIFICATION = 'Early checklist, not code certification. Clauses read in VBBL 2019; VBBL 2025 is in force and unread, so every clause is flagged unverified until someone reads it.'

// --- Presets (P11-M03): every one is a team assumption unless its comment says otherwise ------------------------------
export interface SystemsPresets {
  /** Minimum residual pressure at the top fixture (kPa). 140 ≈ 20 psi, which a trade article says codes often use (P11-S52). */
  pMinKpa: number
  /** Static pressure rating of chillers, exchangers and coils (kPa): above it, a heat-exchanger break (team, unsourced). */
  hydronicRatingKpa: number
  /** Floors one air-handling plant floor serves (team, unsourced). */
  airReachFloors: number
  /** Motor power of one high-rise passenger or firefighter lift (kW, team). */
  liftKw: number
  /** Firefighting water depends on a fire pump (team: city mains do not reach 250 m+). */
  firePump: boolean
  firePumpKw: number
  /** Stair pressurisation / air-quality fan per exit stair (kW, team). */
  stairFanKw: number
  /** Smoke venting and interconnected-space fans per tower (kW, team). */
  smokeFanKw: number
  /** Fire alarm, voice communication, emergency lighting and radio (kW, team). */
  lifeSafetyKw: number
  /** Generator runtime at full load (h). 3.2.7.9.(1) asks for at least 2. */
  runtimeH: number
  /** Generator room per kW of standby load (m², team). */
  genM2PerKw: number
  /** Riser areas per floor (m², team). */
  waterRiserM2: number
  hydronicRiserM2: number
  electricalRoomM2: number
  emergencyRiserM2: number
  commsRoomM2: number
  airShaftM2: number
  chuteM2: number
  /** Core washrooms and janitor room per floor (m², team). */
  washroomsM2: number
  /** Transformer vault and main switchroom at the base (m², team). */
  baseElectricalM2: number
  /** Central alarm and control facility (3.2.6.7) and radio equipment room (3.2.5.20), m² (team). */
  controlRoomM2: number
  radioRoomM2: number
}

export const DEFAULT_SYSTEMS_PRESETS: SystemsPresets = {
  pMinKpa: 140, hydronicRatingKpa: 1600, airReachFloors: 20, liftKw: 60, firePump: true, firePumpKw: 110, stairFanKw: 15, smokeFanKw: 40,
  lifeSafetyKw: 25, runtimeH: 2, genM2PerKw: 0.1, waterRiserM2: 2, hydronicRiserM2: 2.5, electricalRoomM2: 5, emergencyRiserM2: 1.5,
  commsRoomM2: 2, airShaftM2: 6, chuteM2: 1.5, washroomsM2: 20, baseElectricalM2: 120, controlRoomM2: 15, radioRoomM2: 10,
}

/** VBBL static pressure limit at any fixture (kPa), VPBL 2019 2.6.3.3. */
export const PRV_LIMIT_KPA = 550
const KPA_PER_M = 9.81

// --- Occupancy (P11-M09, the part the checks need) ---------------------------------------------------------------------
export const OCCUPANCY: Record<UseId, { group: string; label: string }> = {
  office: { group: 'D', label: 'Group D, business and personal services' },
  retail: { group: 'E', label: 'Group E, mercantile' },
  hotel: { group: 'C', label: 'Group C, residential (homes and hotel)' },
  residential: { group: 'C', label: 'Group C, residential (homes and hotel)' },
  civic: { group: 'A-2', label: 'Group A, Division 2, assembly (civic and amenity)' },
  amenity: { group: 'A-2', label: 'Group A, Division 2, assembly (civic and amenity)' },
  mechanical: { group: 'service', label: 'Service space (not a major occupancy)' },
}
export interface OccupancyRow { group: string; label: string; storeys: number; area: number }

export interface ChecklistItem extends RuleResult {
  clause: string
  /** Where the status comes from: this node's model, another node's result, or not assessed. */
  basis: 'model' | 'linked' | 'manual'
  /** Built node whose result this item shows. */
  linked?: string
}
export interface ZoneRow { zone: number; fromLevel: number; toLevel: number; topZ: number; headKpa: number }
export interface RiserRow { id: string; label: string; m2: number; note: string }
export interface LoadRow { id: string; label: string; kw: number; clause: string }
export interface PlantEstimate {
  hydronicBreaks: number
  airFloors: number
  min: number
  max: number
  modelled: number
  towerFloors: number
  /** A plant floor every N tower floors that gives the minimum count (null = none needed). */
  suggestEvery: number | null
  /** Outrigger floors and sky lobbies to snap plant to. */
  snapTo: number[]
}
export interface SystemsResult {
  water: ZoneRow[]
  hydronic: ZoneRow[]
  plant: PlantEstimate
  risers: RiserRow[]
  riserTotal: number
  /** Risers plus core washrooms per floor: what the Core & lift check's "risers, services, washrooms" preset stands for. */
  servicesNeeded: number
  emergency: LoadRow[]
  generatorKw: number
  generatorM2: number
  /** Area at the base: transformer vault and switchroom, generator, control facility, radio room (m²). */
  baseM2: number
}
export interface LifeSafetyResult {
  tower: Tower
  occupancy: OccupancyRow[]
  topStorey: number
  highBuilding: boolean
  checklist: ChecklistItem[]
  access: ChecklistItem[]
  systems: SystemsResult
  systemRules: RuleResult[]
  /** Every result, for the trace and the rule-card index. */
  rules: RuleResult[]
}

export interface LifeSafetyInput { transitLink: boolean; liftPresets: Pick<LiftPresets, 'homeM2' | 'hotelM2PerKey' | 'servicesM2'>; presets?: SystemsPresets }

const r1 = (v: number) => Math.round(v * 10) / 10
const fmt = (v: number) => Math.round(v).toLocaleString()

function occupancyOf(floors: Floor[]): OccupancyRow[] {
  const m = new Map<string, OccupancyRow>()
  for (const f of floors) {
    const o = OCCUPANCY[f.use]
    const row = m.get(o.group) ?? { group: o.group, label: o.label, storeys: 0, area: 0 }
    row.storeys++
    row.area += f.area
    m.set(o.group, row)
  }
  return [...m.values()].sort((a, b) => b.area - a.area)
}

/** Pressure zones of height h stacked from grade to H: [from level, to level, top z, static head at the bottom]. */
function zones(floors: Floor[], H: number, h: number): ZoneRow[] {
  const n = Math.max(1, Math.ceil(H / Math.max(1, h)))
  const out: ZoneRow[] = []
  for (let i = 0; i < n; i++) {
    const z0 = i * h, z1 = Math.min(H, (i + 1) * h)
    const inZone = floors.filter((f) => f.z0 >= z0 - 0.01 && f.z0 < z1 - 0.01)
    if (!inZone.length) continue
    out.push({ zone: out.length + 1, fromLevel: inZone[0].level, toLevel: inZone[inZone.length - 1].level, topZ: r1(z1), headKpa: Math.round((z1 - z0) * KPA_PER_M) })
  }
  return out
}

export function systemsEstimate(t: Tower, lifts: LiftResult, egress: EgressResult, input: LifeSafetyInput): SystemsResult {
  const p = input.presets ?? DEFAULT_SYSTEMS_PRESETS
  const floors = towerFloors(t)
  const H = floors.length ? floors[floors.length - 1].z1 : t.height
  const tower = floors.filter((f) => !f.podium)

  // Domestic water (VPBL 2.6.3.3): downfeed zones no taller than (550 − P_min) / 9.81 m; PRV stations sit in the risers.
  const waterH = Math.max(5, (PRV_LIMIT_KPA - p.pMinKpa) / KPA_PER_M)
  const water = zones(floors, H, waterH)
  // Hydronic: static head grows 9.81 kPa per m; a heat-exchanger break above each rating height.
  const hydH = Math.max(10, p.hydronicRatingKpa / KPA_PER_M)
  const hydronic = zones(floors, H, hydH)
  const hydronicBreaks = Math.max(0, hydronic.length - 1)
  // Air handling: roof plant serves the top zone; each further zone needs a plant floor in the tower.
  const airFloors = Math.max(0, Math.ceil(tower.length / Math.max(1, p.airReachFloors)) - 1)
  const min = Math.max(hydronicBreaks, airFloors), max = hydronicBreaks + airFloors
  const modelled = floors.filter((f) => f.use === 'mechanical').length
  const suggestEvery = min > 0 ? Math.max(1, Math.floor(tower.length / (min + 1))) : null
  const snapTo = [...new Set([...(t.outriggerFloors ?? []), ...lifts.skyLobbies.map((f) => f.level)])].sort((a, b) => a - b)

  const groupC = floors.some((f) => f.use === 'residential' || f.use === 'hotel')
  const risers: RiserRow[] = [
    { id: 'water', label: 'Domestic water (cold, hot, PRV stations)', m2: p.waterRiserM2, note: `${water.length} pressure zones` },
    { id: 'hydronic', label: 'Heating and chilled water', m2: p.hydronicRiserM2, note: `${hydronic.length} zones, ${hydronicBreaks} break${hydronicBreaks === 1 ? '' : 's'}` },
    { id: 'electrical', label: 'Electrical room (normal power)', m2: p.electricalRoomM2, note: 'per floor' },
    { id: 'emergency', label: 'Protected emergency risers (1 h; smoke management 2 h)', m2: p.emergencyRiserM2, note: '3.2.7.10' },
    { id: 'comms', label: 'Communications and radio riser', m2: p.commsRoomM2, note: '3.2.5.20 coverage' },
    { id: 'air', label: 'Outside air, exhaust and smoke shafts', m2: p.airShaftM2, note: 'grows if plant floors are fewer' },
    ...(groupC ? [{ id: 'chute', label: 'Garbage and recycling chute', m2: p.chuteM2, note: 'residential and hotel floors' }] : []),
  ]
  const riserTotal = risers.reduce((s, x) => s + x.m2, 0)

  // Emergency power, VBBL 2019 3.2.7.9.(1): elevators, power-dependent firefighting water, stair air-quality and venting
  // fans. The firefighter lift plus one more run at once; the others are recalled in turn (team reading, consultant to confirm).
  const emergency: LoadRow[] = [
    { id: 'ff-lift', label: 'Firefighter lift', kw: p.liftKw, clause: '3.2.7.9.(1), 3.2.6.5' },
    { id: 'lift', label: 'One more lift at a time (others recalled in turn)', kw: lifts.totalCars > 0 ? p.liftKw : 0, clause: '3.2.7.9.(1)' },
    ...(p.firePump ? [{ id: 'pump', label: 'Fire pump (firefighting water depends on power)', kw: p.firePumpKw, clause: '3.2.7.9.(1)' }] : []),
    { id: 'stair-fans', label: `Stair air-quality fans (${egress.stairs} stairs)`, kw: egress.stairs * p.stairFanKw, clause: '3.2.7.9.(1), 3.2.6.2' },
    { id: 'smoke-fans', label: 'Venting and smoke-control fans', kw: p.smokeFanKw, clause: '3.2.7.9.(1)' },
    { id: 'life-safety', label: 'Fire alarm, voice communication, emergency lighting, radio', kw: p.lifeSafetyKw, clause: '3.2.7.9, 3.2.6.8, 3.2.5.20' },
  ]
  const generatorKw = emergency.reduce((s, x) => s + x.kw, 0)
  const generatorM2 = Math.max(30, generatorKw * p.genM2PerKw)
  return {
    water, hydronic, plant: { hydronicBreaks, airFloors, min, max, modelled, towerFloors: tower.length, suggestEvery, snapTo },
    risers, riserTotal, servicesNeeded: riserTotal + p.washroomsM2, emergency, generatorKw, generatorM2,
    baseM2: p.baseElectricalM2 + generatorM2 + p.controlRoomM2 + p.radioRoomM2,
  }
}

const item = (clause: string, r: Omit<ChecklistItem, 'clause' | 'basis'>, basis: ChecklistItem['basis'] = 'model'): ChecklistItem => ({ ...r, clause, basis })
const U: Flag = 'unverified'

/** Show another node's result in the checklist (linked, never re-checked). */
function linkedItem(id: string, clause: string, from: RuleResult | undefined, node: string, label: string): ChecklistItem {
  if (!from) return item(clause, { id, label, value: 'switch on the linked node to see this', threshold: '—', state: 'unknown', flag: U, source: VBBL_32 }, 'manual')
  return { ...from, id, label, clause, basis: 'linked', linked: node, note: from.note }
}

export function lifeSafety(t: Tower, lifts: LiftResult, egress: EgressResult, input: LifeSafetyInput): LifeSafetyResult {
  const p = input.presets ?? DEFAULT_SYSTEMS_PRESETS
  const floors = towerFloors(t)
  const occupancy = occupancyOf(floors)
  const top = floors.length ? floors[floors.length - 1].z0 : 0
  const highBuilding = top > 18
  const has = (u: UseId) => floors.some((f) => f.use === u)
  const groupC = has('residential') || has('hotel')
  const link = input.transitLink
  const sys = systemsEstimate(t, lifts, egress, input)
  const liftRule = (prefix: string) => lifts.rules.find((x) => x.id === `${prefix}${t.id}`)
  const egressRule = (prefix: string) => egress.rules.find((x) => x.id === `${prefix}${t.id}`)
  const doors = Math.max(0, floors.filter((f) => f.z0 > 0.5).length)
  const vent = Math.max(1.8, 0.05 * doors)

  const checklist: ChecklistItem[] = [
    item('3.2.6.1.(1)', { id: 'high-building', label: 'High building: all of 3.2.6 applies', value: `top storey floor ${r1(top)} m above grade`, threshold: 'over 18 m to the floor of the top storey', state: highBuilding ? 'warn' : 'pass', flag: U, source: { ...VBBL_32, page: '3.2.6.1.(1)(a)' },
      note: 'Every 244–305 m tower is a high building. The NBC’s 36 m rule and BCBC 2024 clause (d) belong to other editions, not Vancouver’s.' }),
    item('3.2.2.18.(3)', { id: 'sprinklers', label: 'Sprinklered throughout', value: 'required in every new building; locked on', threshold: 'sprinklers throughout', state: 'pass', flag: U, source: { ...VBBL_32, page: '3.2.2.18.(3)' },
      note: 'There is no switch to omit them: that would be an alternative solution (an early research draft offered one; corrected).' }),
    item('3.2.5', { id: 'standpipes', label: 'Standpipes, hose and fire department connections', value: 'not assessed', threshold: 'Subsection 3.2.5', state: 'unknown', flag: U, source: { ...VBBL_32, page: '3.2.5' },
      note: 'Fire-protection engineer. A fire pump is assumed in the emergency power list.' }, 'manual'),
    item('3.2.5.20', { id: 'radio', label: 'Radio antenna system for firefighters', value: `equipment room about ${p.radioRoomM2} m² and a comms riser in the estimate`, threshold: 'coverage of at least 98% in the listed locations (ANSI/CAN/UL 2524)', state: 'unknown', flag: U, source: { ...VBBL_32, page: '3.2.5.20' } }, 'manual'),
    item('3.2.6.2.(3)', { id: 'stair-vent', label: 'Vent at the bottom of each exit stair', value: `${doors} stair doors per stair → at least ${r1(vent)} m² per stair`, threshold: '0.05 m² per stair door, at least 1.8 m²', state: 'warn', flag: U, source: { ...VBBL_32, page: '3.2.6.2.(3)' },
      note: 'Show it in the ground-floor plan. Read the same in BCBC 2018, VBBL 2007 and VBBL 2019.' }),
    item('3.2.6.2.(2)', { id: 'below-exit-stairs', label: 'Stairs below the lowest exit level stay smoke-free', value: link ? 'stairs reach the below-grade transit level' : 'nothing modelled below grade', threshold: 'at most 1% contaminated air over 2 h at the January 2.5% design temperature (−6 °C)', state: link ? 'unknown' : 'pass', flag: U, source: { ...VBBL_32, page: '3.2.6.2.(2)' },
      note: link ? 'Needs smoke-movement screening (research P11-M08, not built) or a fire engineer.' : undefined }),
    item('3.2.6.2.(4)', { id: 'shafts-below', label: 'Shafts through the lowest exit storey', value: link ? 'lift and service shafts continue below grade: record a vestibule, seal or vent for each' : 'nothing modelled below grade', threshold: 'smoke kept out of the upper storeys', state: link ? 'unknown' : 'pass', flag: U, source: { ...VBBL_32, page: '3.2.6.2.(4)' },
      note: 'The measures in Note A-3.2.6.2.(4) are explanatory, not mandatory.' }),
    item('3.2.6.2.(6)', { id: 'corridor-air', label: 'Group C corridors keep their make-up air on alarm', value: groupC ? 'residential or hotel floors present' : 'no Group C floors', threshold: 'make-up air keeps running when the alarm sounds', state: groupC ? 'warn' : 'pass', flag: U, source: { ...VBBL_32, page: '3.2.6.2.(6)' } }),
    item('3.2.6.3', { id: 'connected', label: 'Connected building: the transit link', value: link ? 'the declared link connects to the station: smoke measure at the link, 1 h separation, doors or travel limit, alarm treatment' : 'no link declared', threshold: '3.2.6.3, 3.2.3.20 and 3.2.4.2.(6)', state: link ? 'warn' : 'pass', flag: U, source: { ...VBBL_32, page: '3.2.6.3, 3.2.3.20, 3.2.4.2.(6)' },
      note: 'Whether the transit link triggers these is a code-consultant question; the 2024 provincial checklists leave 3.2.6.3 out without saying why.' }),
    item('3.2.6.4', { id: 'recall', label: 'Elevator recall', value: 'not assessed: detectors at lift lobbies, hoistways and machine rooms', threshold: 'recall on alarm', state: 'unknown', flag: U, source: { ...VBBL_32, page: '3.2.6.4' },
      note: 'Recall time per lift group is not computed yet (research P11-M02).' }, 'manual'),
    linkedItem('ff-elevator', '3.2.6.5.(2), (4)–(5)', liftRule('firefighter-'), 'built.core-lifts', 'Firefighter elevator reaches the top (from Core & lift check)'),
    item('3.2.6.5.(3)', { id: 'ff-closure', label: 'Firefighter elevator enclosure', value: 'not assessed: (a) 1 h shaft-opening closure, (b) 45 min vestibule, or (c) 1 h corridor', threshold: 'the rating of the chosen clause', state: 'unknown', flag: U, source: { ...VBBL_32, page: '3.2.6.5.(3)' },
      note: 'Whether (a) combines with (b) or (c) is interpretation: code consultant.' }, 'manual'),
    item('3.2.6.7', { id: 'central-alarm', label: 'Central alarm and control facility', value: `room by the fire-department entrance, about ${p.controlRoomM2} m² in the estimate`, threshold: 'provided', state: 'warn', flag: U, source: { ...VBBL_32, page: '3.2.6.7' } }),
    item('3.2.6.8', { id: 'voice', label: 'Voice communication system', value: 'required; not assessed', threshold: 'provided', state: 'unknown', flag: U, source: { ...VBBL_32, page: '3.2.6.8' } }, 'manual'),
    item('3.2.7.9', { id: 'emergency-power', label: 'Emergency generator', value: `${fmt(sys.generatorKw)} kW for ${p.runtimeH} h: ${sys.emergency.filter((x) => x.kw > 0).map((x) => x.label.split(' (')[0].toLowerCase()).join(', ')}`, threshold: 'at least 2 h at full load for every 3.2.7.9.(1) load', state: p.runtimeH >= 2 ? 'pass' : 'fail', flag: U, source: { ...VBBL_32, page: '3.2.7.9' },
      note: 'Every 3.2.7.9.(1) category is listed; the kW are team presets. The electrical engineer sizes the generator.' }),
    item('3.2.7.10', { id: 'conductors', label: 'Protected emergency conductors', value: `protected riser of about ${p.emergencyRiserM2} m² per floor in the estimate`, threshold: 'emergency, fire-pump and alarm conductors 1 h; smoke-management conductors 2 h', state: 'warn', flag: U, source: { ...VBBL_32, page: '3.2.7.10' } }),
    linkedItem('exits', '3.4.2.1', egressRule('exits-'), 'built.egress', 'Two exits per floor (from Egress & stairs)'),
    linkedItem('stair-width', '3.4.3.2', egressRule('stair-width-'), 'built.egress', 'Exit stair width (from Egress & stairs)'),
    linkedItem('separation', '3.4.2.3', egressRule('separation-'), 'built.egress', 'Exit separation (from Egress & stairs)'),
    linkedItem('travel', '3.4.2.5', egressRule('travel-'), 'built.egress', 'Travel distance (from Egress & stairs)'),
    linkedItem('stretcher', '3.5.4.1', liftRule('stretcher-'), 'built.core-lifts', 'Stretcher-capable car (from Core & lift check)'),
    item('3.3.1.7', { id: 'protected-zones', label: 'Protected zones', value: 'deleted in VBBL 2019 (and 2007)', threshold: 'not applicable in Vancouver', state: 'pass', flag: U, source: { ...VBBL_33, page: '3.3.1.7' },
      note: 'The provincial checklists still list it; confirm in VBBL 2025.' }),
    item('—', { id: 'evacuation-lifts', label: 'Evacuation lifts', value: 'no Canadian code or CSA B44 provision retrieved', threshold: 'UK guidance covers them', state: 'unknown', flag: 'unresolved', source: CIBSE_D }, 'manual'),
  ]

  // Barrier-free vertical access (P11-M07). The lift model starts at the grade lobby, so podium floors are not lift stops.
  const served = new Set<number>([...lifts.rises.flatMap((r) => r.floors.map((f) => f.level)), ...lifts.skyLobbies.map((f) => f.level)])
  const towerOccupied = floors.filter((f) => !f.podium && f.z0 > 0.5 && f.use !== 'mechanical')
  const unserved = towerOccupied.filter((f) => !served.has(f.level))
  const podiumAbove = floors.filter((f) => f.podium && f.z0 > 0.5)
  const singles = lifts.rises.filter((r) => r.kind === 'local' && r.cars < 2)
  const net = (u: UseId) => floors.filter((f) => f.use === u).reduce((s, f) => s + f.area * (f.podium ? 1 : 1 - Math.max(0, Math.min(0.6, t.coreShare))), 0)
  const keys = Math.round(net('hotel') / Math.max(1, input.liftPresets.hotelM2PerKey))
  const homes = Math.round(net('residential') / Math.max(1, input.liftPresets.homeM2))
  const routeState: RuleState = unserved.length ? 'fail' : podiumAbove.length ? 'warn' : 'pass'
  const access: ChecklistItem[] = [
    item('Section 3.8', { id: 'bf-route', label: 'Barrier-free route to every floor', value: `${towerOccupied.length - unserved.length} of ${towerOccupied.length} occupied tower floors reached by a passenger lift${podiumAbove.length ? `; ${podiumAbove.length} podium floor${podiumAbove.length > 1 ? 's' : ''} above grade need${podiumAbove.length > 1 ? '' : 's'} a lift stop` : ''}`,
      threshold: 'a continuous step-free route to every floor that needs one', state: routeState, flag: U, source: { ...VBBL_38, page: 'Section 3.8' },
      note: `${unserved.length ? `Not reached: L${unserved.slice(0, 6).map((f) => f.level).join(', L')}${unserved.length > 6 ? '…' : ''}. ` : ''}Plant floors are left out (service spaces; check the Section 3.8 exemptions). The lift model starts at the grade lobby, so podium floors need their own stop or lift.` }),
    item('3.8.2.2.(5)', { id: 'bf-transit', label: 'Step-free route from the transit link', value: link ? 'show a step-free route from the station link to the lifts' : 'no link declared', threshold: 'continuous, link included', state: link ? 'warn' : 'pass', flag: U, source: { ...VBBL_38, page: '3.8.2.2.(5)' },
      note: 'The walkway rule is applied to the link by analogy: code consultant to confirm.' }),
    item('team', { id: 'bf-redundancy', label: 'Two accessible lifts per group', value: singles.length ? `${singles.map((r) => r.label).join(', ')}: one car` : 'every local group has 2 or more cars', threshold: 'at least 2 per group, so one lift out of service leaves a route', state: singles.length ? 'warn' : 'pass', flag: 'team_assumption', source: { label: 'Team redundancy assumption (not a code value; research P11-M07)' } }),
    item('3.8.2.2.(1)', { id: 'bf-entrances', label: 'Barrier-free entrances', value: 'entrances are not in the model yet', threshold: 'the principal entrance and at least 50% of pedestrian entrances', state: 'warn', flag: U, source: { ...VBBL_38, page: '3.8.2.2.(1)' } }),
    item('3.8.2.7', { id: 'bf-power-doors', label: 'Power door operators', value: has('hotel') || has('retail') ? 'hotel or commercial entrances present' : 'no hotel or commercial entrances', threshold: 'every entrance serving a hotel or a qualifying commercial use', state: has('hotel') || has('retail') ? 'warn' : 'pass', flag: U, source: { ...VBBL_38, page: '3.8.2.7' },
      note: 'BCBC 2024 asks for operators at every entrance (provincial reference only).' }),
    item('3.8.2.8.(3)', { id: 'bf-washroom', label: 'Universal washroom on the entrance storey', value: 'not in the model: provide one', threshold: 'provided, sized to 3.8.3.12', state: 'warn', flag: U, source: { ...VBBL_38, page: '3.8.2.8.(3), 3.8.3.12' } }),
    item('3.8.2.10.(3)', { id: 'bf-tactile', label: 'Tactile walking-surface indicators', value: 'not in the model', threshold: 'at every 3.8.2.10.(3) location', state: 'warn', flag: U, source: { ...VBBL_38, page: '3.8.2.10.(3)' } }),
    ...(keys > 0 ? [item('3.8.2.12.(2)–(3)', { id: 'bf-hotel', label: 'Accessible hotel rooms', value: `about ${keys} keys → at least ${Math.ceil(keys / 40)} accessible rooms and ${Math.ceil(keys / 20)} more with visual alarms`, threshold: '1 per 40 rooms accessible; 1 per 20 more with visual alarms', state: 'warn' as RuleState, flag: U, source: { ...VBBL_38, page: '3.8.2.12.(2)–(3)' },
      note: `Keys estimated as net hotel area ÷ ${input.liftPresets.hotelM2PerKey} m² (the lift preset). BCBC 2024 raises the count (provincial reference, numbers not retrieved).` })] : []),
    ...(homes > 0 ? [item('3.8.5.1', { id: 'bf-adaptable', label: 'Adaptable dwelling units', value: `about ${homes} homes: every one designed to 3.8.5`, threshold: 'all dwelling units in a residential building (Vancouver)', state: 'warn' as RuleState, flag: U, source: { ...VBBL_38, page: '3.8.5.1' },
      note: `Homes estimated as net residential area ÷ ${input.liftPresets.homeM2} m² (the lift preset). BC’s 100% rule for large new buildings from 10 Mar 2025 is provincial and does not apply in Vancouver.` })] : []),
  ]

  const pl = sys.plant
  const systemRules: RuleResult[] = [
    { id: 'plant-floors', label: 'Plant floors in the tower', value: `${pl.min === pl.max ? pl.min : `${pl.min}–${pl.max}`} needed; ${pl.modelled} modelled`, threshold: 'range from hydronic breaks and air-handling reach (team presets)',
      state: pl.modelled >= pl.min ? 'pass' : 'warn', flag: 'team_assumption', source: TEAM,
      note: `${pl.hydronicBreaks} hydronic break${pl.hydronicBreaks === 1 ? '' : 's'} (equipment rated ${p.hydronicRatingKpa} kPa), ${pl.airFloors} air-handling floor${pl.airFloors === 1 ? '' : 's'} (one per ${p.airReachFloors} floors; roof plant serves the top). Roof and basement plant are extra.${pl.snapTo.length ? ` Snap plant to L${pl.snapTo.join(', L')} (outrigger or sky-lobby floors) where you can.` : ''}` },
    { id: 'water-zones', label: 'Domestic water pressure zones', value: `${sys.water.length} zones of up to ${r1((PRV_LIMIT_KPA - p.pMinKpa) / KPA_PER_M)} m, a PRV station in the risers at each`, threshold: `at most ${PRV_LIMIT_KPA} kPa at any fixture; at least ${p.pMinKpa} kPa at the top one`,
      state: 'pass', flag: 'unverified', source: { ...VPBL_26, page: '2.6.3.3' }, note: `The ${p.pMinKpa} kPa minimum is a trade-article preset (${PHCP.label}); no Vancouver minimum-pressure clause was found.` },
    { id: 'risers', label: 'Risers and core services per floor', value: `${r1(sys.riserTotal)} m² of risers + ${p.washroomsM2} m² washrooms = ${r1(sys.servicesNeeded)} m²`, threshold: `the Core & lift check assumes ${input.liftPresets.servicesM2} m²`,
      state: sys.servicesNeeded <= input.liftPresets.servicesM2 + 0.5 ? 'pass' : 'warn', flag: 'team_assumption', source: TEAM, note: 'Use this figure in the core to size it with these risers.' },
    { id: 'base-plant', label: 'Plant and electrical space at the base', value: `${fmt(sys.baseM2)} m²: transformer and switchroom ${p.baseElectricalM2}, generator ${fmt(sys.generatorM2)}, control facility ${p.controlRoomM2}, radio ${p.radioRoomM2}`, threshold: 'below grade or in the podium (team presets)',
      state: 'pass', flag: 'team_assumption', source: TEAM, note: 'Heavy plant at the top instead needs a goods lift that reaches it (22 Bishopsgate needed a special 7,400 kg operation).' },
  ]

  return { tower: t, occupancy, topStorey: r1(top), highBuilding, checklist, access, systems: sys, systemRules, rules: [...checklist, ...access, ...systemRules] }
}

export const LIFE_SAFETY_FALSE_ASSUMPTIONS: { claim: string; correction: string; source: Source }[] = [
  { claim: 'A tower this tall must have refuge floors.', correction: 'The Part 3 high-building list (VBBL 2007, VBBL 2019 and the 2024 checklists) has no refuge-floor clause; 3.3.3.6 “Areas of Refuge” is about treatment occupancies. A refuge or waiting floor can be part of an alternative solution.', source: { ...VBBL_33, page: '3.3.3.6; 3.2.6' } },
  { claim: 'Protected zones (3.3.1.7) must be shown as not assessed.', correction: 'VBBL 2019 reads “3.3.1.7. Deleted.” It stays in the edition map only, unless VBBL 2025 brings it back.', source: { ...VBBL_33, page: '3.3.1.7' } },
  { claim: 'Sprinklers can be switched off.', correction: 'VBBL 2019 3.2.2.18.(3) requires sprinklers in every new building; omitting them needs an alternative solution.', source: { ...VBBL_32, page: '3.2.2.18.(3)' } },
  { claim: 'BC’s 100% adaptable-unit rule is the reference in Vancouver.', correction: 'Vancouver’s own rule is VBBL 2019 3.8.5.1; the BC bulletin applies outside Vancouver and is shown only for comparison.', source: BC_B24 },
  { claim: 'A water zone may be 550 / 9.81 ≈ 56 m tall.', correction: 'That ignores the residual pressure the top fixture needs: zone height = (550 − P_min) / 9.81, about 42 m at 140 kPa.', source: { ...VPBL_26, page: '2.6.3.3' } },
]
