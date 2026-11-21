// Structure screening (research P10-M01 system shortlist, P10-M03 seismic route, P10-M05 continuity and regularity).
// Screening only: no member sizing, no design values. Packet P10 had two critique rounds and no final gate, so code
// readings the research corrected are "unverified" here.
import { towerFloors } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { CREEP_PHI, DEFAULT_WEIGHT_PRESETS, gravityEccentricity, HARD_DECK, levelName, PLANTED_BUILDUP, SNOW_W, soilKpa, storeyWeights, worstWeightStep, type GravityReading, type WeightPresets, type WeightResult } from './storeyWeight'
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
  /** Seismic weight of every floor and the roof, with weight centres (research R5 §3). */
  weights: WeightResult
  /** Weight-centre offsets from the core, the net offset and the sustained sway (research R5 §2). */
  gravity: GravityReading
}

export function structureCheck(t: Tower, wp: WindProcedure, wpr: WeightPresets = DEFAULT_WEIGHT_PRESETS): StructureResult {
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

  // Weight irregularity (Type 2) by storey weight (gap G6, research R5 §3); the floor-area ratio stays in the note.
  const floors = towerFloors(t)
  let worst = { ratio: 1, level: 0 }
  for (let i = 1; i < floors.length; i++) {
    const a = floors[i - 1].area, b = floors[i].area
    const r = Math.max(a, b) / Math.max(1e-9, Math.min(a, b))
    if (r > worst.ratio) worst = { ratio: r, level: floors[i].level }
  }
  const weights = storeyWeights(t, wpr)
  const step = worstWeightStep(weights.levels)
  const stepped = !!step && step.ratio >= 1.005
  const byArea = worst.ratio > 1 ? `${Math.round(worst.ratio * 100)}% between L${worst.level - 1} and L${worst.level}` : 'uniform'
  const gardenLevels = weights.levels.filter((l) => l.garden)
  const kg = (q: number) => q.toFixed(1)
  add('weight', 'Weight irregularity (Type 2)', stepped ? `${Math.round(step.ratio * 100)}% by weight between ${levelName(step.lower)} and ${levelName(step.upper)}` : 'uniform by weight',
    'storey weight ≤ 150% of the adjacent storey (a roof lighter than the floor below is exempt)', stepped && step.ratio > 1.5 ? 'warn' : 'pass', 'verified', { ...NBC, page: 'Table 4.1.8.6 Type 2; W per 4.1.8.2' },
    `By floor area alone: ${byArea}. Weight of each floor = plate × (slab + superimposed dead load by use + 0.5 kPa partitions) + the open deck at that floor over the storey below (hard ${HARD_DECK} kPa, or planted: ${wpr.soilMm} mm of soil, ${kg(soilKpa(wpr.soilMm))} kPa, + ${PLANTED_BUILDUP} kPa build-up; 25% of snow, ${SNOW_W} kPa) + facade ${wpr.facadeKpa} kPa + core walls ${wpr.coreWall} m thick; the floor on grade is the base. Slabs, SDL, decks, facade and core walls are team presets (research R5 §3.3).`
    + (gardenLevels.length ? ` Open garden storey${gardenLevels.length > 1 ? 's' : ''} ${gardenLevels.map((l) => `L${l.level} (${Math.round(l.deck).toLocaleString('en-CA')} m² ${l.deckKind} deck)`).join(', ')}: the garden's deck is carried by that storey.` : '')
    + ' The podium-to-tower step usually triggers it: an irregular structure needs Vd ≥ 1.0 V.')

  // Off-centre gravity load and accidental torsion (gap G5, research R5 §2): weight centre of each tower level vs the core.
  const grav = gravityEccentricity(weights, H)
  const g = grav.worst, big = grav.largest
  const m = (v: number) => v.toFixed(1)
  add('gravity-offset', 'Off-centre storey weight (e / D)', g ? (g.e < 0.05 ? 'weight centred on the core at every tower storey' : `largest e/D ${g.ratio.toFixed(3)} at ${levelName(g)} (${m(g.across)} m across a ${g.D.toFixed(0)} m plate)`) : 'no tower storeys',
    'e/D ≤ 0.05; 0.05–0.10 declare it; over 0.10 the inherent offset exceeds the code’s accidental arm of 0.10·D', !g ? 'unknown' : g.ratio > 0.05 ? 'warn' : 'pass', 'verified', { ...NBC, page: '4.1.8.11(11)(a); research R5 §2' },
    `Weight centre of every tower floor and the roof (plate, open deck, facade and core walls, as in the weight line) against the core centre: ${weights.core.how}.`
    + (big && big.e >= 0.05 ? ` Largest offset ${m(big.e)} m at ${levelName(big)} (x ${m(big.ex)}, y ${m(big.ey)} m in the tower's own axes).` : '')
    + (g && g.ratio > 0.1 ? ' Beyond the code’s accidental arm: the torsion the code assumes is smaller than this design’s own.' : g && g.ratio > 0.05 ? ' Within the code’s accidental arm: declare it for the structural reviewer.' : '')
    + ' The code applies torsion F·(e ± 0.10·D) at every level. The core centre stands in for the stiffness centre (exact for a doubly symmetric closed core) and the 0.05 band is a team value; podium storeys and the podium roof are left out, as their stiffness is not the core’s alone.')
  const mm = (v: number) => Math.round(v * 1000)
  const lt = grav.sway.lt
  add('gravity-net', 'Net gravity eccentricity and sustained sway', g ? `E = ${grav.net.e.toFixed(2)} m (e/D ${grav.net.ratio.toFixed(3)}); top sway ≈ ${mm(grav.sway.el)} mm elastic, ≈ ${mm(lt)} mm long term` : 'no tower storeys',
    'long-term top sway ≤ 25 mm; 25–100 mm declare a pre-set (camber); over 100 mm a tie-down or outrigger strategy, as at Vancouver House', !g ? 'unknown' : lt > 0.025 ? 'warn' : 'pass', 'team_assumption',
    { label: 'Research R5 §2.3–2.5 (cantilever core, EI from f1 = 46/H); case: Vancouver House, floors cambered against about 254 mm of sway (G. Poh, STRUCTURE magazine)', url: 'https://www.structuremag.org/article/vancouver-house/' },
    `Net offset of the tower's weight from the core, E = ΣW·e / ΣW = (x ${grav.net.ex.toFixed(2)}, y ${grav.net.ey.toFixed(2)}) m; gravity-induced overturning about the core Q_G = |ΣW·e| ≈ ${(grav.QG / 1000).toFixed(0)} MN·m (Type 9's ratio α needs a base shear, not computed).`
    + (lt > 0.1 ? ' Over 100 mm: plan a tie-down or outrigger strategy (Vancouver House: post-tensioned rods and a torsion box, each floor cambered).' : lt > 0.025 ? ' Declare a pre-set (camber) of the floors for the structural reviewer.' : '')
    + ` Sway of a cantilever core with EI from the empirical f1 = 46/H (±50%), creep φ = ${CREEP_PHI} (ACI 209, unverified): an upper bound, since floors cast plumb on the frame below hide earlier sway, which a designed pre-set exploits. Bands are team values.`)

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
  return { tower: t, Ta, seismicCategory: 'SC4', outriggers, rules, systems, weights, gravity: grav }
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
