// Structure screening (research P10-M01 system shortlist, P10-M03 seismic route, P10-M05 continuity and regularity).
// Screening only: no member sizing, no design values. Packet P10 had two critique rounds and no final gate, so code
// readings the research corrected are "unverified" here.
import { towerFloors } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { systemShortlist, type SystemFit, type WindProcedure } from './windStructure'

const NBC: Source = { label: 'National Building Code of Canada 2020, Div B 4.1.8 (2nd printing, 2025)', url: 'https://nrc-publications.canada.ca/eng/view/ft/?id=515340b5-f4e0-4798-be69-692e4ec423e8&dp=2&dsl=en' }
const TEAM: Source = { label: 'Team assumption (research P10 r1, editable)' }

/** Downtown Vancouver hazard, site class X450 (Vs30 450 m/s), 2% in 50 years, from the NRCan 2020 hazard API (research P10, 21 Oct 2026). */
export const DOWNTOWN_HAZARD = { site: 'X450', s02: 1.04, s10: 0.429 }

export interface StructureResult {
  tower: Tower
  /** Empirical period for walls, Ta = 0.05·hn^(3/4) (seismic forces only). */
  Ta: number
  seismicCategory: 'SC4'
  outriggers: number[]
  rules: RuleResult[]
  systems: SystemFit[]
}

export function structureCheck(t: Tower, wp: WindProcedure): StructureResult {
  const rules: RuleResult[] = []
  const add = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string) =>
    rules.push({ id, label, value, threshold, state, flag, source, note })
  const H = t.height
  const { s02, s10, site } = DOWNTOWN_HAZARD

  add('seismic-category', 'Seismic Category', `SC4: IE·S(0.2) = ${s02} g, S(1.0) = ${s10} g`, 'SC4 when IE·S(0.2) > 0.75 g', 'warn', 'verified', { ...NBC, page: 'Table 4.1.8.5-B' },
    `Downtown hazard for site class ${site} (assumed, not measured at the block), normal importance (IE = 1.0, team assumption).`)

  const Ta = 0.05 * H ** 0.75
  add('period', 'Empirical period Ta (walls)', `${Ta.toFixed(2)} s`, `forces may use up to 2·Ta = ${(2 * Ta).toFixed(2)} s; deflections cap at 4.0 s`, 'unknown', 'unverified', { ...NBC, page: '4.1.8.11(3)' },
    'For seismic forces only, never as the wind frequency f1. Stiff outrigger or transfer floors make the real period shorter than Ta, so Ta-based forces can be unconservative.')

  add('dynamic', 'Analysis route', 'dynamic analysis required', 'equivalent static only for SC1–SC2, or regular buildings under 60 m with Ta < 2 s', 'warn', 'verified', { ...NBC, page: '4.1.8.7(1), 4.1.8.12(8)–(9)' },
    'Dynamic base shear at least 0.8 V for a regular structure, 1.0 V if irregular.')

  const imported = !!t.imported
  add('continuity', 'Core walls continuous to the foundation', imported ? 'core not modelled for imported massing' : 'the modelled core runs from the foundation to the top',
    'required where Ta ≥ 1 s and IE·S(1.0) > 0.25: no wall that ends, steps or is transferred (Types 4 and 5)', imported ? 'unknown' : 'pass', 'verified', { ...NBC, page: '4.1.8.10(4), Table 4.1.8.6 Types 4–5' },
    'Keep it that way in design: open podium spaces wrap around the core; a wall transfer is not permitted, with no nonlinear-analysis route.')

  // Weight irregularity (Type 2) with floor area as the weight proxy (team assumption); the roof is exempt.
  const floors = towerFloors(t)
  let worst = { ratio: 1, level: 0 }
  for (let i = 1; i < floors.length; i++) {
    const a = floors[i - 1].area, b = floors[i].area
    const r = Math.max(a, b) / Math.max(1e-9, Math.min(a, b))
    if (r > worst.ratio) worst = { ratio: r, level: floors[i].level }
  }
  add('weight', 'Weight irregularity (Type 2)', worst.ratio > 1 ? `${Math.round(worst.ratio * 100)}% between L${worst.level - 1} and L${worst.level}` : 'uniform',
    'storey weight ≤ 150% of the adjacent storey', worst.ratio > 1.5 ? 'warn' : 'pass', 'verified', { ...NBC, page: 'Table 4.1.8.6 Type 2' },
    'Floor area stands in for weight (team assumption). The podium-to-tower step usually triggers it: an irregular structure needs Vd ≥ 1.0 V.')

  add('geometric', 'Vertical geometric irregularity (Type 3)', 'core constant over the height', 'SFRS dimension ≤ 130% of the adjacent storey', 'pass', 'verified', { ...NBC, page: 'Table 4.1.8.6 Type 3' },
    'The SFRS here is the core, which keeps its size; a wider podium only counts if its walls join the SFRS.')

  const cs = t.coreShare
  add('core-ratio', 'Core ratio (core ÷ gross plate)', `${Math.round(cs * 1000) / 10}%`, 'good ≤ 25%; above 35% check', cs > 0.35 ? 'warn' : cs > 0.25 ? 'warn' : 'pass', 'team_assumption', TEAM,
    'No accessible primary source: a starting preset to calibrate against precedent plans.')

  const levels = new Set(floors.filter((f) => !f.podium).map((f) => f.level))
  const outriggers = [...new Set(t.outriggerFloors ?? [])].filter((l) => levels.has(l)).sort((a, b) => a - b)
  if (outriggers.length) {
    add('outriggers', 'Outrigger floors', outriggers.map((l) => `L${l}`).join(', '), 'outriggers as capacity-protected elements beside the listed core-wall SFRS', 'warn', 'unverified', { ...NBC, page: '4.1.8.9(3), (5); Commentary J' },
      'Not a listed SFRS in NBC 2020: special study likely. Stiff outrigger floors shorten the real period below Ta: dynamic analysis.')
  }

  const systems = systemShortlist(t, wp).map((s) => (s.id === 'outriggers' && outriggers.length ? { ...s, fit: 'shortlist' as const, reason: `You placed outriggers at ${outriggers.map((l) => `L${l}`).join(', ')}. ${s.reason}` } : s))
  return { tower: t, Ta, seismicCategory: 'SC4', outriggers, rules, systems }
}

export const SEISMIC_FALSE_ASSUMPTIONS = [{
  claim: 'Downtown Vancouver design shaking is about Sa(0.2) = 0.85 g (the NBC 2015 / VBBL 2019 value).',
  correction: 'NBC 2020 hazard (NRCan 2020 values) for downtown, site class X450, is about 1.04 g at 0.2 s and 0.43 g at 1.0 s; the new VBBL seismic rules apply from 15 Sep 2026.',
  source: { label: 'NRCan 2020 seismic hazard values, as queried in research P10 (21 Oct 2026); NBC 2020 Commentary J Table J-2' },
}]

/** Suggested outrigger levels at about one half and two thirds of the tower height (precedent practice, team assumption). */
export function suggestOutriggers(t: Tower): number[] {
  const floors = towerFloors(t).filter((f) => !f.podium)
  if (floors.length < 30) return []
  const at = (share: number) => floors.reduce((best, f) => (Math.abs(f.z0 - share * t.height) < Math.abs(best.z0 - share * t.height) ? f : best)).level
  return [...new Set([at(0.5), at(0.67)])]
}
