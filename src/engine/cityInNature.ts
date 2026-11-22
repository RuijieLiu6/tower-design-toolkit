// City in Nature evidence ledger (research P05-M01, packet P05 round 2). Not a score: each indicator shows its value,
// threshold, force (how binding the rule is), evidence flag and source. Only by-law and rezoning-policy requirements can
// fail; targets, guidelines, aspirations and comparators are reference lines that say "Check" at worst. Most values are
// entered by the designer until the modules that compute them (P05-M02..M08) are built.
import { DEFAULT_WEIGHT_PRESETS } from './storeyWeight'
import { deckUseOf, towerDecks } from './sw/decks'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'

export type SiteType = 'A' | 'B' | 'C'
export type Direction = '4.1' | '4.2' | '4.3' | '4.4'
export type Force = 'bylaw_requirement' | 'rezoning_policy_requirement' | 'rezoning_target' | 'voluntary_guideline' | 'city_aspiration' | 'comparator_other_jurisdiction' | 'team_assumption'

export interface NatureInput {
  /** R019 site type; decides the canopy band (team assumption until a City planner confirms). */
  siteType: SiteType
  canopyM2: number | null
  vegetatedM2: number | null
  retainedM3: number | null
  engineeredRainwater: boolean | null
  habitatAssessment: boolean | null
  birdTreatedPct: number | null
  entersQEView: boolean | null
  /** PVG 3.4 criteria the team has answered in writing (only the extracted ones). */
  pvg34: { lions: boolean; openSpaceCanopy: boolean; undrip: boolean }
  /** Human judgment per ODP Ecology direction (never computed). */
  notes: Partial<Record<Direction, string>>
  /**
   * Planting at grade, typed (m²): joins the planted decks in the modelled vegetated cover (gap G12). Lives here so the
   * panel and the evidence hub read the same value (node built.nature-inputs, 21 Nov). Absent: none.
   */
  groundPlantedM2?: number | null
  /**
   * Trees and porous screens on the ground (engine/sw/wind.ts PorousObstacle, project frame): the trees' crowns give the
   * modelled canopy (gap G12). Filled from a design file or the harness; no app tool draws them yet. Absent: none.
   */
  groundPorous?: readonly ModelTree[] | null
}

export const DEFAULT_NATURE: NatureInput = {
  siteType: 'C', canopyM2: null, vegetatedM2: null, retainedM3: null, engineeredRainwater: null, habitatAssessment: null,
  birdTreatedPct: null, entersQEView: null, pvg34: { lions: false, openSpaceCanopy: false, undrip: false }, notes: {},
}

export const DIRECTIONS: Record<Direction, string> = {
  '4.1': 'Embed nature in the city',
  '4.2': 'Make space for nature',
  '4.3': 'Protect and restore',
  '4.4': 'Access to nature',
}
export const FORCE_LABEL: Record<Force, string> = {
  bylaw_requirement: 'By-law requirement',
  rezoning_policy_requirement: 'Rezoning requirement',
  rezoning_target: 'Rezoning target',
  voluntary_guideline: 'Guideline',
  city_aspiration: 'City aspiration',
  comparator_other_jurisdiction: 'Comparator (other city)',
  team_assumption: 'Team assumption',
}
export const isBinding = (f: Force) => f === 'bylaw_requirement' || f === 'rezoning_policy_requirement'

const S = {
  odp: { label: 'Vancouver Official Development Plan (adopted 31 Mar 2026), Part 5 s.4 Ecology', url: 'https://vancouver.ca/files/cov/odp-vancouver-plain-text-version.pdf' },
  rpsld: { label: 'Rezoning Policy for Sustainable Large Developments (amended 31 Mar 2026)', url: 'https://guidelines.vancouver.ca/policy-rezoning-sustainable-large-developments.pdf' },
  r019: { label: 'Sustainable Large Developments Admin Bulletin R019 (12 Jul 2024)', url: 'https://guidelines.vancouver.ca/bulletins/R019.pdf' },
  vbbl: { label: 'Vancouver Building By-law 2025, Art. 2.4.2.5 Rainwater Management', url: 'https://vancouver.ca/files/cov/2025-vbbl-book-II-insert-pages.pdf' },
  rainCity: { label: 'Rain City Strategy (City of Vancouver)', url: 'https://vancouver.ca/files/cov/rain-city-strategy.pdf' },
  tgs: { label: 'Toronto Green Standard v4, Ecology and Biodiversity (EC 5.1)', url: 'https://www.toronto.ca/city-government/planning-development/official-plan-guidelines/toronto-green-standard/toronto-green-standard-version-4/mid-to-high-rise-residential-non-residential-version-4/ecology-biodiversity/' },
  pvg: { label: 'Public Views Guidelines (amended 4 Feb 2026)', url: 'https://guidelines.vancouver.ca/guidelines-public-views.pdf' },
  hbpr: { label: 'Higher Buildings Policy Review, public engagement exhibit', url: 'https://syc.vancouver.ca/projects/higher-buildings/higher-buildings-policy-review.pdf' },
  edm: { label: 'City of Vancouver Engineering Design Manual, Section 5.2 amendment (11 Feb 2025)', url: 'https://vancouver.ca/files/cov/amendment-to-section-5.2-engineering-design-manual.pdf' },
  rwForm: { label: 'Rainwater Management Project Summary form (permits opened in 2026)', url: 'https://vancouver.ca/files/cov/rainwater-management-form-2026.pdf' },
  gri: { label: 'GRI Pathways Study, summary sheet (City of Vancouver 2024)', url: 'https://vancouver.ca/files/cov/gri-pathways-study-summary-sheet.pdf' },
  bird: { label: 'City of Vancouver Bird Friendly Design Guidelines (2015, amended 16 May 2017)', url: 'https://guidelines.vancouver.ca/guidelines-bird-friendly-design.pdf' },
  birdNote: { label: 'Bird Friendly Design Guidelines: Explanatory Note (Jan 2015)', url: 'https://guidelines.vancouver.ca/guidelines-bird-friendly-design-explanatory-note.pdf' },
} satisfies Record<string, Source>

// --- Rainwater detention (P05-M04): VBBL 2.4.2.5(5) Modified Rational Method, 10-year 2100 IDF (EDM 5.2) ----------
export const IDF_2100_10YR = { A: 26.651, B: -0.482 }
/** Runoff coefficients (EDM Tables 5-1, 5-2): CBD default, roofs and paving, and the shallowest flat green-roof band. */
export const RUNOFF = { cbd: 0.95, hard: 0.95, greenRoofShallow: 0.5 }
/** Required detention volume (m³): the largest V over storm durations D, with Qp = C·i·A, release Qo = 25 L/s/ha, tc 5 min. */
export function detentionVolume(areaM2: number, C: number, tcMin = 5): { V: number; D: number; QoLs: number } {
  const QoLs = 25 * (areaM2 / 10000), Qo = QoLs / 1000
  let best = { V: 0, D: 5 }
  for (let D = 5; D <= 1440; D++) {
    const i = IDF_2100_10YR.A * (D / 60) ** IDF_2100_10YR.B
    const V = ((C * i * areaM2) / 3.6e6) * D * 60 - (Qo * (D + tcMin) * 60) / 2
    if (V > best.V) best = { V, D }
  }
  return { ...best, QoLs }
}
/** Glazing below a height on a set of facade faces (m²), from the facade node's faces. */
export function glazingBelow(faces: { z0: number; z1: number; length: number; wwr: number }[], top: number): number {
  return faces.reduce((s, f) => s + Math.max(0, Math.min(f.z1, top) - f.z0) * f.length * f.wwr, 0)
}
// --- Rain held in deck soil (gap G41, City in Nature review R4-9) ------------------------------------------------------
/**
 * Water a planted deck's growing medium holds in one rain event, per mm of medium (mm of water per mm of soil). TEAM
 * ASSUMPTION, TO CONFIRM: no source checked. The figure to confirm is the medium's tested water-holding capacity (green-roof
 * substrate standards such as the FLL guidelines test it; unverified here) less what the soil still holds from the last rain.
 */
export const SOIL_RETAIN = {
  value: 0.2, low: 0.1, high: 0.35, unit: 'mm of water per mm of growing medium', flag: 'team_assumption' as Flag,
  source: 'Team assumption, to confirm: no source checked; replace with the growing-medium supplier’s water-holding test (e.g. to the FLL green-roof guidelines, unverified) less the moisture left from the last rain',
}
/** One planted deck the deck-use input declares (`Tower.deckUses`), with the soil on it. */
export interface SoilDeck { tower: string; level: number; area: number; soilMm: number; /** The soil depth was typed on the deck use (false: the weight presets' depth). */ given: boolean }
/**
 * The planted decks the deck-use input declares, for the rain-retention line (gap G41): only decks whose entry says
 * `planted`, with its `soilMm`, else the storey-weight presets' soil depth (as the structure line reads them).
 */
export function plantedSoil(towers: Tower[], north = 0, presetSoilMm = DEFAULT_WEIGHT_PRESETS.soilMm): SoilDeck[] {
  const out: SoilDeck[] = []
  for (const t of towers) {
    if (!t.deckUses?.some((u) => u?.use === 'planted')) continue
    for (const d of towerDecks(t, north)) {
      const u = deckUseOf(t, d)
      if (u?.use !== 'planted') continue
      const given = u.soilMm != null && Number.isFinite(u.soilMm) && u.soilMm > 0
      out.push({ tower: t.name, level: d.level, area: d.area, soilMm: given ? u.soilMm! : presetSoilMm, given })
    }
  }
  return out
}
/** Rain the declared deck soil holds in one event (m³), at the team coefficient (and its low and high). */
export function soilRetained(decks: SoilDeck[]): { m3: number; low: number; high: number } {
  const v = decks.reduce((s, d) => s + (d.area * d.soilMm) / 1000, 0)
  return { m3: v * SOIL_RETAIN.value, low: v * SOIL_RETAIN.low, high: v * SOIL_RETAIN.high }
}

// --- Canopy and cover read from the model (gap G12, City in Nature reviews R3-13, R4-9) --------------------------------
/** An obstacle the ground wind study holds (engine/sw/wind.ts PorousObstacle); only `kind: 'tree'` counts, with its crown. */
export interface ModelTree { kind: string; /** Crown centre, project frame (m). */ at?: readonly number[]; /** Crown diameter (m), taken as the mature crown. */ crown?: number }
export interface CanopyReading {
  /** Crown area with overlapping crowns counted once (m²). */
  m2: number
  /** Every crown's π r² added up, overlaps counted twice (m²). */
  summed: number
  /** Trees with a crown. */
  trees: number
  /** Trees with no crown diameter, left out. */
  noCrown: number
}
/**
 * Canopy at maturity from the model's trees: each crown π r² (r half the crown diameter, the crown as modelled taken as the
 * mature crown). SIMPLIFICATION, labelled in the line: overlaps are counted once by sampling each crown on a grid of at most
 * 0.25 m and dropping the samples an earlier crown already covers (the kept share × the exact π r²); a tree without a
 * position is added whole. Every tree counts, whether or not it stands inside the site line. Null when the model holds no tree.
 */
export function modelCanopy(obstacles: readonly ModelTree[] | null | undefined, step = 0.25): CanopyReading | null {
  const trees = (obstacles ?? []).filter((o) => o?.kind === 'tree')
  if (!trees.length) return null
  const ok = trees.filter((t) => t.crown != null && Number.isFinite(t.crown) && t.crown > 0)
  const area = (d: number) => Math.PI * (d / 2) ** 2
  const placed = ok.filter((t) => Array.isArray(t.at) && Number.isFinite(t.at[0]) && Number.isFinite(t.at[1]))
  const summed = ok.reduce((s, t) => s + area(t.crown!), 0)
  let m2 = ok.filter((t) => !placed.includes(t)).reduce((s, t) => s + area(t.crown!), 0)
  placed.forEach((t, i) => {
    const r = t.crown! / 2, cx = t.at![0], cy = t.at![1]
    const near = placed.slice(0, i).filter((o) => Math.hypot(o.at![0] - cx, o.at![1] - cy) < r + o.crown! / 2)
    if (!near.length) { m2 += area(t.crown!); return }
    const h = Math.min(step, r / 20)
    let kept = 0, all = 0
    for (let x = cx - r + h / 2; x < cx + r; x += h) for (let y = cy - r + h / 2; y < cy + r; y += h) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      all++
      if (!near.some((o) => (x - o.at![0]) ** 2 + (y - o.at![1]) ** 2 <= (o.crown! / 2) ** 2)) kept++
    }
    m2 += all ? (area(t.crown!) * kept) / all : 0
  })
  return { m2, summed, trees: ok.length, noCrown: trees.length - ok.length }
}
/** Typed and modelled differ when the gap is more than this share of the modelled value (the line then says Check). */
export const MODEL_TOLERANCE = 0.1

/** Layer 0 context for the rows that compute from the design: towers (storeys) and the facade node's faces. */
/** Top of the 4th storey across the towers (Vancouver's bird zone; podium storeys count), or null with no towers. */
export function fourthStoreyTop(floorsPerTower: { z1: number }[][]): number | null {
  const tops = floorsPerTower.filter((f) => f.length).map((f) => f[Math.min(3, f.length - 1)].z1)
  return tops.length ? Math.max(...tops) : null
}
export interface NatureContext {
  fourthStoreyTop?: number | null; faces?: { z0: number; z1: number; length: number; wwr: number }[] | null
  /** The facade node's glass beside planted decks (gap G34, facade.ts plantedDeckFaces): counts at any height. */
  deckFaces?: { z0: number; z1: number; length: number; wwr: number; deckZ: number }[] | null
  /** The Facade node's treated share of glass in the bird zone (0–1), used when the ledger's own is not entered. */
  facadeTreated?: number | null
  /** Real Vancouver: whether the towers rise into a Queen Elizabeth Park cone (3.2.x), from the view-cone check; null when uncertain. */
  qeFromCones?: boolean | null
  /** Planted decks the deck-use input declares, with their soil (plantedSoil): their soil storage joins the retention line, shown apart from the typed volume (gap G41). */
  plantedSoil?: SoilDeck[] | null
  /** The ground wind study's trees and porous screens (engine/sw/wind.ts PorousObstacle): its trees' crowns give the modelled canopy (gap G12). */
  groundPorous?: readonly ModelTree[] | null
  /** Planting at grade, typed (m²): joins the planted decks in the modelled vegetated cover (gap G12). */
  groundPlantedM2?: number | null
  /** Which project the rows are for: on Real Vancouver without cone results, the views line says they were not read. */
  project?: 'vtc' | 'city'
  /** Where the facade faces came from: the Facade node's own settings, or its defaults (said in the bird-zone line). */
  facadeFrom?: 'settings' | 'defaults'
  /** The soil depth (mm) given to planted decks without their own (storey-weight presets); said when it is not the default. */
  soilPresetMm?: number
  /** Planted-spandrel (greenwall) facade zones and their wall area (engine/natureSources.ts greenwallArea; node built.green-ratio). */
  greenwalls?: GreenWalls | null
  /** Modelled gross floor area of the towers (m²; every storey, as energyCarbon areas().mfa), for vegetated area ÷ GFA. */
  gfa?: number | null
  /**
   * Node contract (21 Nov): why the planted-wall reading lies outside the method's boundary (a tower with greenwall zones
   * is twisted or free-form), shown as a Needs specialist marker on the vegetated-area lines. Absent: inside it.
   */
  greenSpecialist?: string
  /** Declared planters (`Tower.planters`; engine/natureSources.ts planterArea): width × length on each storey. */
  planters?: Planters | null
  /** Ground footprint of the towers (m²): each tower's lowest storey, for planted area above grade ÷ footprint. */
  footprint?: number | null
  /** Homes in the towers and persons per home (the lift presets'), for planted area per resident. */
  residents?: { homes: number; perHome: number } | null
}

/** One greenwall zone's planted wall: face length × band height (the storey) × (1 − WWR), summed over its storeys. */
export interface GreenWallPart { tower: string; face: string; from: number; to: number; m2: number }
export interface GreenWalls { m2: number; parts: GreenWallPart[] }
/** One declared planter: width × length on each of its storeys, summed. */
export interface PlanterPart { tower: string; label?: string; from: number; to: number; storeys: number; m2: number }
export interface Planters { m2: number; parts: PlanterPart[] }

// --- One input set for the panel and the evidence hub (node built.nature-inputs, 21 Nov) --------------------------------
// The City in Nature panel and the evidence hub used to build their inputs apart: the panel lacked the model trees, the
// planting at grade and the preset soil depth; the hub lacked the Facade node's treated share and the QE Park answer from
// the view cones. Both now call natureArgs with the same sources, so the same design gives the same lines.

/** A view-cone result as the view-cone node gives it: the worst state per tower and each cone's state. */
export type ConeResult = { overall: string; checks?: { cone: { id: string }; state: string }[] }
/** Whether the towers rise into a Queen Elizabeth Park cone (3.2.x): true above, false clear or below, null when uncertain. */
export function qeFromCones(cones: ConeResult[] | null): boolean | null | undefined {
  if (!cones || !cones.some((c) => c.checks)) return undefined
  const qe = cones.flatMap((c) => (c.checks ?? []).filter((k) => k.cone.id.startsWith('3.2.')))
  if (qe.some((k) => k.state === 'above')) return true
  if (qe.some((k) => k.state === 'within_uncertainty')) return null
  return false
}

export interface NatureRow {
  id: string
  name: string
  half: 'space' | 'views'
  direction: Direction
  value: string
  /** True when the designer entered the value, false when Layer 0 computed it, null when nothing is known yet. */
  entered: boolean | null
  threshold: string
  state: RuleState
  force: Force
  flag: Flag
  source: Source
  note?: string
  /** Node contract: the design lies outside the method's boundary, and why (a Needs specialist marker, never the state). */
  specialist?: string
}

export interface NatureFalseAssumption { claim: string; correction: string; source: Source }
export interface NatureResult {
  rows: NatureRow[]
  binding: { passed: number; failed: number; open: number; total: number }
  coverage: Record<Direction, boolean>
  falseAssumptions: NatureFalseAssumption[]
  rules: RuleResult[]
}

const pct = (v: number) => `${Math.round(v * 10) / 10}%`
const CANOPY: Record<SiteType, [number, number]> = { A: [20, 25], B: [15, 20], C: [10, 15] }
const COVER: Partial<Record<SiteType, number>> = { A: 30, B: 40 }

/** Reference lines never fail: below the line is "Check". Binding rows fail when not met. */
const judge = (ok: boolean | null, force: Force): RuleState => (ok === null ? 'unknown' : ok ? 'pass' : isBinding(force) ? 'fail' : 'warn')

/**
 * @param siteArea site area in m² (lib/siteArea.ts: the competition block, or the Real Vancouver study site; null before one is chosen)
 * @param coneOverall worst view-cone state per tower in Real Vancouver (null on the competition site, where cones aren't modelled)
 */
export function cityInNature(input0: NatureInput, siteArea: number | null, coneOverall: string[] | null, ctx: NatureContext = {}): NatureResult {
  // One treated share for both nodes (node audit, 7 Nov): the Facade node's, when the ledger's own is not entered.
  const fromFacade = input0.birdTreatedPct === null && ctx.facadeTreated != null
  // The QE Park answer from the view-cone check on Real Vancouver, when the ledger's own is not answered.
  const fromCones = input0.entersQEView === null && ctx.qeFromCones != null
  const input = { ...input0, ...(fromFacade ? { birdTreatedPct: ctx.facadeTreated! * 100 } : {}), ...(fromCones ? { entersQEView: ctx.qeFromCones! } : {}) }
  const rows: NatureRow[] = []
  const share = (m2: number | null) => (m2 === null || !siteArea ? null : (m2 / siteArea) * 100)

  // Typed beside modelled (gap G12): the typed value judges as before; absent, the modelled one does and says so; both
  // present and more than MODEL_TOLERANCE apart (of the modelled value), the line says Check with the difference.
  const m2s = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`
  const reading = (typed: number | null, modelled: number | null) => {
    if (modelled === null) return null
    const gap = typed === null ? 0 : typed - modelled
    const differs = typed !== null && Math.abs(gap) > MODEL_TOLERANCE * modelled
    const diff = differs ? `; typed is ${m2s(Math.abs(gap))} ${gap > 0 ? 'above' : 'below'} the model (${gap > 0 ? '+' : '−'}${Math.round((Math.abs(gap) / modelled) * 100)}%), Check` : ''
    return { used: typed ?? modelled, differs, tail: `modelled ${m2s(modelled)} (${typed === null ? 'typed not entered: the modelled value is used' : `typed ${m2s(typed)}`})${diff}` }
  }
  const lead = (v: number | null) => (v === null ? 'needs a site area' : pct(v))

  const [canopyLo] = CANOPY[input.siteType]
  const crowns = modelCanopy(ctx.groundPorous)
  const canopyRead = reading(input.canopyM2, crowns && crowns.trees > 0 ? crowns.m2 : null)
  const canopy = share(canopyRead ? canopyRead.used : input.canopyM2)
  const crownNote = !canopyRead || !crowns ? '' : ` Modelled canopy: the ${crowns.trees} trees of the ground wind study, each crown as modelled taken as the mature crown, π r²; simplification: overlapping crowns counted once by sampling on a 0.25 m grid${crowns.summed - crowns.m2 > 0.5 ? ` (added up whole they give ${m2s(crowns.summed)})` : ''}, and trees outside the site line count too.${crowns.noCrown ? ` ${crowns.noCrown} tree${crowns.noCrown > 1 ? 's' : ''} without a crown diameter left out.` : ''}`
  rows.push({
    id: 'canopy', name: 'Tree canopy at maturity, share of site', half: 'space', direction: '4.2',
    value: canopyRead ? `${lead(canopy)}: ${canopyRead.tail}` : canopy === null ? (siteArea ? 'not entered' : 'needs a site area') : pct(canopy),
    entered: input.canopyM2 !== null ? true : canopyRead ? false : null,
    threshold: `≥ ${canopyLo}% (R019 Type ${input.siteType} band ${CANOPY[input.siteType].join('–')}%)`, state: canopyRead?.differs ? 'warn' : judge(canopy === null ? null : canopy >= canopyLo, 'rezoning_target'),
    force: 'rezoning_target', flag: 'verified', source: { ...S.r019, page: 'canopy bands by site type' },
    note: `Site type ${input.siteType} is a team assumption: R019 Type C is a single parcel over an excavated parkade; several towers under separate permits suggest Type B. A City planner decides.${input.siteType === 'A' ? ' R019 also states a 22% minimum for Type A; show both.' : ''}${crownNote}`,
  })

  const coverLine = COVER[input.siteType]
  const plantedDecks = ctx.plantedSoil ?? []
  const deckPlanted = plantedDecks.reduce((s, d) => s + d.area, 0)
  const groundPlanted = ctx.groundPlantedM2 != null && Number.isFinite(ctx.groundPlantedM2) && ctx.groundPlantedM2 > 0 ? ctx.groundPlantedM2 : 0
  // Planted walls (greenwall facade zones, node built.green-ratio) join the modelled cover beside decks and grade.
  const wallPlanted = ctx.greenwalls?.m2 ?? 0
  // Declared planters (Tower.planters, node built.green-ratio): width × length on each storey.
  const planterPlanted = ctx.planters?.m2 ?? 0
  const modelledVeg = deckPlanted + groundPlanted + wallPlanted + planterPlanted
  const coverRead = reading(input.vegetatedM2, modelledVeg > 0 ? modelledVeg : null)
  const cover = share(coverRead ? coverRead.used : input.vegetatedM2)
  const coverNote = !coverRead ? '' : ` Modelled cover: ${plantedDecks.length ? `the planted decks of the deck-use input, ${plantedDecks.map((d) => `${d.tower} L${d.level} ${m2s(d.area)}`).join(', ')} (whole deck area taken as planted)` : 'no planted deck declared'}${groundPlanted ? ` + ${m2s(groundPlanted)} of planting at grade, typed` : ''}${wallPlanted ? ` + ${m2s(wallPlanted)} of planted wall (greenwall facade zones: face length × storey height × (1 − WWR)); counting wall area in a share of site is the team’s reading, R019 may mean plan area only (unverified)` : ''}${planterPlanted ? ` + ${m2s(planterPlanted)} of declared planters (width × length on each storey)` : ''}.`
  rows.push({
    id: 'cover', name: 'Vegetative cover at maturity, share of site', half: 'space', direction: '4.2',
    value: coverRead ? `${lead(cover)}: ${coverRead.tail}` : cover === null ? (siteArea ? 'not entered' : 'needs a site area') : pct(cover),
    entered: input.vegetatedM2 !== null ? true : coverRead ? false : null,
    threshold: coverLine ? `reference ${coverLine}% (R019 Type ${input.siteType})` : 'no R019 reference line for Type C',
    state: coverRead?.differs ? 'warn' : coverLine && cover !== null ? judge(cover >= coverLine, 'team_assumption') : 'unknown',
    force: 'team_assumption', flag: coverLine ? 'team_assumption' : 'unresolved', source: { ...S.r019, page: 'cover A 30%, B 40%' },
    note: `Using R019 cover figures as a pass line is the team’s reading.${coverNote}`,
  })

  // Vegetated area against site and floor area (node built.green-ratio, NODE_LIST #5): decks, walls, grade and declared
  // planters added up, with the split. No threshold: Ecocity in the Sky (read 21 Nov) gives no green plot ratio, so any
  // target is a team or precedent value; Placemaking's tropical precedents (Al-Kodmany pp.151–161) stay analogues only.
  // Always unknown, flagged team assumption.
  const vegTotal = modelledVeg
  const split = vegTotal > 0 ? `decks ${Math.round((deckPlanted / vegTotal) * 100)}%, walls ${Math.round((wallPlanted / vegTotal) * 100)}%, grade ${Math.round((groundPlanted / vegTotal) * 100)}%${planterPlanted ? `, planters ${Math.round((planterPlanted / vegTotal) * 100)}%` : ''}` : ''
  const ratio = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2))
  const wallsNote = ctx.greenwalls?.parts.length ? ` Planted walls: ${ctx.greenwalls.parts.map((w) => `${w.tower} ${w.face} L${w.from}–${w.to >= 999 ? 'top' : w.to} ${m2s(w.m2)}`).join(', ')}.` : ''
  const plantersNote = ctx.planters?.parts.length ? ` Planters: ${ctx.planters.parts.map((p) => `${p.tower}${p.label ? ` ${p.label}` : ''} L${p.from}${p.to !== p.from ? `–${p.to}` : ''} ${m2s(p.m2)}`).join(', ')}.` : ''
  const vegHow = `Vegetated area = planted decks (deck-use input, whole deck) ${m2s(deckPlanted)} + planted walls (greenwall facade zones: face length × storey height × (1 − WWR)) ${m2s(wallPlanted)} + planting at grade (typed) ${m2s(groundPlanted)}${planterPlanted ? ` + declared planters (width × length on each storey) ${m2s(planterPlanted)}` : ''}.${wallsNote}${plantersNote} The typed vegetated area is not used here.`
  const vegEmpty = 'no vegetated area modelled: declare planted decks, greenwall facade zones, planters or planting at grade'
  const NO_RATIO = 'no threshold: Ecocity in the Sky gives no green plot ratio, so a target is a team or precedent value; Placemaking pp.151–161 tropical precedents as analogues only (more than 2× site, p.156; green plot ratio 1,100%, p.161)'
  const PM = { label: 'Al-Kodmany, Placemaking with Tall Buildings (Routledge 2026), Ch.7, analogues only', page: 'pp.151–161' }
  rows.push({
    id: 'green-site', name: 'Vegetated area ÷ site (decks, walls, grade)', half: 'space', direction: '4.2',
    value: vegTotal <= 0 ? vegEmpty : !siteArea ? `${m2s(vegTotal)} (${split}); needs a site area` : `${ratio(vegTotal / siteArea)} × site, ${m2s(vegTotal)} (${split})`,
    entered: vegTotal > 0 ? false : null, threshold: NO_RATIO, state: 'unknown',
    force: 'team_assumption', flag: 'team_assumption', source: PM,
    ...(ctx.greenSpecialist && wallPlanted > 0 ? { specialist: ctx.greenSpecialist } : {}),
    note: `${vegHow} A reading, not a rule: no Vancouver rule sets this ratio, and the precedents are tropical towers.`,
  })
  const gfa = ctx.gfa ?? null
  rows.push({
    id: 'green-gfa', name: 'Vegetated area ÷ GFA (decks, walls, grade)', half: 'space', direction: '4.2',
    value: vegTotal <= 0 ? vegEmpty : !gfa ? `${m2s(vegTotal)} (${split}); needs the storeys from the design` : `${ratio(vegTotal / gfa)} × GFA, ${m2s(vegTotal)} of ${m2s(gfa)} (${split})`,
    entered: vegTotal > 0 ? false : null, threshold: NO_RATIO, state: 'unknown',
    force: 'team_assumption', flag: 'team_assumption', source: PM,
    ...(ctx.greenSpecialist && wallPlanted > 0 ? { specialist: ctx.greenSpecialist } : {}),
    note: `${vegHow} GFA is the modelled floor area of every storey (as the energy node counts it).`,
  })

  // Book node #5 upgrade (Ecocity in the Sky note §6, 21 Nov): the green line raised with the building line (Park
  // pp.84–85) read as planted area above grade ÷ the ground footprint; vegetated area per resident beside the book's
  // city-scale figures (context only, never a pass line); and the declared planters (pp.90, 159). No book target.
  const ECO: Source = { label: 'Park, Designing the Ecocity-in-the-Sky: The Seoul Workshop (Images Publishing)' }
  const above = deckPlanted + wallPlanted + planterPlanted
  const fp = ctx.footprint != null && ctx.footprint > 0 ? ctx.footprint : null
  const aboveSplit = above > 0 ? ` (decks ${m2s(deckPlanted)}, walls ${m2s(wallPlanted)}${planterPlanted ? `, planters ${m2s(planterPlanted)}` : ''})` : ''
  rows.push({
    id: 'green-above', name: 'Planted area above grade ÷ footprint', half: 'space', direction: '4.2',
    value: !fp ? (above > 0 ? `${m2s(above)} above grade; needs the storeys from the design` : 'needs the storeys from the design')
      : above <= 0 ? `0% of the footprint (${m2s(fp)}): no planted deck, greenwall zone or planter declared above grade`
      : `${pct((above / fp) * 100)} of the footprint: ${m2s(above)} above grade on ${m2s(fp)}${aboveSplit}`,
    entered: fp ? false : null,
    threshold: 'no threshold: the book asks the green line to rise with the building line (pp.84–85) but gives no figure; a target is the team’s',
    state: 'unknown', force: 'team_assumption', flag: 'team_assumption', source: { ...ECO, page: 'pp.84–85' },
    ...(ctx.greenSpecialist && wallPlanted > 0 ? { specialist: ctx.greenSpecialist } : {}),
    note: `Planted area above grade = planted decks (deck-use input, whole deck) + planted walls (greenwall zones) + declared planters; planting at grade is left out. Footprint = each tower’s lowest storey. Over 100% means more planting up the tower than the ground it covers.${plantersNote}`,
  })
  const res = ctx.residents && ctx.residents.homes > 0 ? ctx.residents : null
  const people = res ? res.homes * res.perHome : 0
  const n0 = (v: number) => Math.round(v).toLocaleString('en-CA')
  rows.push({
    id: 'green-resident', name: 'Vegetated area per resident', half: 'space', direction: '4.4',
    value: !res ? 'no homes in the design' : `${(vegTotal / people).toFixed(1)} m² per resident: ${m2s(vegTotal)} for about ${n0(people)} residents (${n0(res.homes)} homes × ${res.perHome})${input.vegetatedM2 != null && input.vegetatedM2 > 0 ? `; typed vegetated area ${m2s(input.vegetatedM2)}: ${(input.vegetatedM2 / people).toFixed(1)} m² per resident` : ''}`,
    entered: res ? false : null,
    threshold: 'context only, never a pass line: Vancouver neighbourhood green 23.46 m² per person (p.146); Seoul legal minimum 6.0 and ideal 16.0 (p.100); city-scale figures with no source or year',
    state: 'unknown', force: 'comparator_other_jurisdiction', flag: 'unverified', source: { ...ECO, page: 'pp.100, 146' },
    note: 'The modelled vegetated area (decks, walls, grade, planters) over the residents: homes as the lift check counts them (the interior layout, else floor area ÷ home size) × persons per home (lift presets). The book’s figures are city and neighbourhood green per person, a different scale from one tower’s planting: shown for context, read once (unverified).',
  })
  const pl = ctx.planters?.parts ?? []
  rows.push({
    id: 'green-planters', name: 'Declared planters', half: 'space', direction: '4.2',
    value: pl.length ? `${pl.length} planter${pl.length > 1 ? 's' : ''}, ${m2s(ctx.planters!.m2)} counted (width × length on each storey)` : 'none declared',
    entered: pl.length ? true : null,
    threshold: 'counted in the vegetated area; the book’s device is a continuous planter ringing the tower to its top floor (pp.90, 159), with no figure',
    state: pl.length ? 'pass' : 'unknown', force: 'team_assumption', flag: 'team_assumption', source: { ...ECO, page: 'pp.90, 159' },
    note: `Planters are declared on the tower (planters: level, to, length, width), from a design file or the harness; no drawing tool places them yet.${plantersNote}`,
  })

  rows.push({
    id: 'habitat', name: 'Habitat assessment and tree strategy (site and adjacent)', half: 'space', direction: '4.3',
    value: input.habitatAssessment === null ? 'not answered' : input.habitatAssessment ? 'planned' : 'not planned', entered: input.habitatAssessment === null ? null : true,
    threshold: 'filed with the rezoning', state: judge(input.habitatAssessment, 'rezoning_policy_requirement'),
    force: 'rezoning_policy_requirement', flag: 'verified', source: { ...S.rpsld, page: 'A.3.4–A.3.5, A.4.1' },
  })

  const engineeredNeeded = siteArea !== null && siteArea > 1000
  rows.push({
    id: 'rain-pathway', name: 'Rainwater: engineered detention pathway', half: 'space', direction: '4.1',
    value: input.engineeredRainwater === null ? (engineeredNeeded ? 'required here (site over 1,000 m²); not answered' : 'not answered') : input.engineeredRainwater ? 'planned' : 'not planned',
    entered: input.engineeredRainwater === null ? null : true,
    threshold: 'required for sites over 1,000 m² or FSR over 1.0', state: judge(input.engineeredRainwater, 'bylaw_requirement'),
    force: 'bylaw_requirement', flag: 'verified', source: { ...S.vbbl, page: 'Art. 2.4.2.5' },
    note: 'Detention volume and release rates (5 then 25 L/s/ha) need the drainage design; not computed yet (P05-M04).',
  })

  // The typed volume, and apart from it the rain held in the soil of the planted decks the deck-use input declares (G41).
  const typedMm = input.retainedM3 === null || !siteArea ? null : (input.retainedM3 / siteArea) * 1000
  const soilDecks = ctx.plantedSoil ?? []
  const soil = soilRetained(soilDecks)
  const soilMm = soil.m3 > 0 && siteArea ? (soil.m3 / siteArea) * 1000 : null
  const depth = typedMm === null && soilMm === null ? null : (typedMm ?? 0) + (soilMm ?? 0)
  const mm1 = (v: number) => (v < 9.95 ? v.toFixed(1) : String(Math.round(v)))
  const soilNote = soilMm === null ? '' : ` Deck soil (deck-use input): ${soilDecks.map((d) => `${d.tower} L${d.level} ${Math.round(d.area).toLocaleString()} m² × ${Math.round(d.soilMm)} mm${d.given ? '' : ' (weight presets’ depth)'}`).join(', ')}; at ${SOIL_RETAIN.value} ${SOIL_RETAIN.unit} (team assumption, to confirm; ${SOIL_RETAIN.low}–${SOIL_RETAIN.high}) it holds about ${Math.round(soil.m3).toLocaleString()} m³ (${Math.round(soil.low).toLocaleString()}–${Math.round(soil.high).toLocaleString()}) over the site. If the typed volume already counts this soil, leave it out of the typed figure.${ctx.soilPresetMm != null && ctx.soilPresetMm !== DEFAULT_WEIGHT_PRESETS.soilMm && soilDecks.some((d) => !d.given) ? ` Decks without their own depth take ${Math.round(ctx.soilPresetMm)} mm from the storey-weight presets given to the evidence hub; the panel has no setting for it and uses ${DEFAULT_WEIGHT_PRESETS.soilMm} mm, so type the depth on each deck to make both agree.` : ''}`
  rows.push({
    id: 'retention', name: 'Rainfall retained (Rain City 48 mm, reference only)', half: 'space', direction: '4.1',
    value: depth === null ? (siteArea ? 'not entered' : 'needs a site area')
      : soilMm === null ? `${Math.round(depth)} mm`
      : `${Math.round(depth)} mm: ${typedMm === null ? 'typed volume not entered' : `${Math.round(typedMm)} mm typed`} + ${mm1(soilMm)} mm held in deck soil`,
    entered: input.retainedM3 !== null ? true : soilMm !== null ? false : null,
    threshold: '≥ 48 mm a day (earlier standard 24 mm)', state: judge(depth === null ? null : depth >= 48, 'city_aspiration'),
    force: 'city_aspiration', flag: 'verified', source: { ...S.rainCity, page: '48 mm design standard' },
    note: `The City’s GRI summary says Building By-law requirements supersede the private-property targets; kept as a stretch target.${soilNote}`,
  })

  // Detention, first stage and outdoor water (P05-M04): computed from the site area and the vegetated area entered above.
  const veg = Math.min(input.vegetatedM2 ?? 0, siteArea ?? 0)
  const C = siteArea ? (RUNOFF.hard * (siteArea - veg) + RUNOFF.greenRoofShallow * veg) / siteArea : null
  const det = siteArea && C !== null ? detentionVolume(siteArea, C) : null
  rows.push({
    id: 'rain-detention', name: 'Rainwater detention volume (engineered pathway)', half: 'space', direction: '4.1',
    value: det ? `about ${Math.round(det.V).toLocaleString()} m³ (C ${C!.toFixed(2)}, release ${det.QoLs.toFixed(1)} L/s, peak at a ${det.D} min storm)` : 'needs a site area', entered: null,
    threshold: 'active storage at least the Modified Rational Method volume (10-year 2100 IDF, 25 L/s/ha, tc 5 min)', state: 'unknown',
    force: 'bylaw_requirement', flag: 'verified', source: { ...S.vbbl, page: 'Art. 2.4.2.5(5); EDM 5.2 Tables 5-1, 5-2' },
    note: `Indicative only: a registered professional sizes tanks and orifices. C is ${RUNOFF.cbd} (CBD default) with the vegetated area at ${RUNOFF.greenRoofShallow} (shallowest green-roof band, team assumption until depths are tagged). Reuse storage needs an operating permit and two-monthly reporting; groundwater can't be harvested.`,
  })
  rows.push({
    id: 'rain-first-stage', name: 'First-stage detention and release', half: 'space', direction: '4.1',
    value: siteArea ? `about ${Math.round(0.015 * Math.max(0, siteArea - veg)).toLocaleString()} m³ (15 mm over ${Math.round(siteArea - veg).toLocaleString()} m² without landscaping)` : 'needs a site area', entered: null,
    threshold: 'release no more than 5 L/s/ha for the first stage, then 25 L/s/ha; no orifice under 25 mm', state: 'unknown',
    force: 'bylaw_requirement', flag: 'verified', source: { ...S.rwForm, page: 'lines 4–5; VBBL 2.4.2.5(6)' },
  })
  rows.push({
    id: 'rain-outdoor-water', name: 'Outdoor potable water: 50% below the July baseline', half: 'space', direction: '4.1',
    value: input.vegetatedM2 ? `baseline about ${Math.round(120 * input.vegetatedM2).toLocaleString()} L/month (120 mm × ${Math.round(input.vegetatedM2).toLocaleString()} m² landscaped); proposed use not entered` : 'needs the landscaped area', entered: null,
    threshold: 'at least 50% below the baseline, with Water Wise landscaping', state: 'unknown',
    force: 'rezoning_policy_requirement', flag: 'verified', source: { ...S.r019, page: '4.1.1.2, Table 2 (July ETo 120 mm); RPSLD D.3.3' },
  })
  rows.push({
    id: 'rain-indoor-water', name: 'Indoor potable water: 20% below baseline', half: 'space', direction: '4.1',
    value: 'needs a signed water balance (same occupants and fixtures in baseline and proposed)', entered: null,
    threshold: 'at least 20% below baseline', state: 'unknown', force: 'rezoning_policy_requirement', flag: 'verified', source: { ...S.rpsld, page: 'D.3.2; R019 4.1.1.1' },
  })

  rows.push({
    id: 'bird', name: 'Bird-friendly glazing treated in the risk zone', half: 'space', direction: '4.3',
    value: input.birdTreatedPct === null ? 'not entered' : pct(input.birdTreatedPct), entered: input.birdTreatedPct === null ? null : true,
    threshold: '≥ 85% (Toronto EC 5.1); 90% UBC Tier 1 as a stretch', state: judge(input.birdTreatedPct === null ? null : input.birdTreatedPct >= 85, 'comparator_other_jurisdiction'),
    force: 'comparator_other_jurisdiction', flag: 'verified', source: { ...S.tgs, page: 'EC 5.1' },
    note: `${fromFacade ? 'From the Facade node’s treated share. ' : ''}Vancouver’s Bird Friendly Design Guidelines (2015, amended 2017) encourage treatment but set no percentage; the line comes from Toronto.`,
  })

  // Bird-friendly glazing zone and lighting (P05-M05): Vancouver's zone from the storeys, glazing from the facade node.
  const zoneTop = ctx.fourthStoreyTop ?? null
  const lowGlass = zoneTop !== null && ctx.faces ? glazingBelow(ctx.faces, zoneTop) : null
  // Glass beside planted decks joins the zone at any height (3.3(c)(ii), as cited by the team; gap G34), reported apart.
  const decks = zoneTop !== null && ctx.deckFaces ? ctx.deckFaces.filter((f) => f.z1 > zoneTop) : []
  const deckGlass = zoneTop !== null ? decks.reduce((s, f) => s + Math.max(0, f.z1 - Math.max(f.z0, zoneTop)) * f.length * f.wwr, 0) : 0
  const deckAt = [...new Set(decks.map((f) => Math.round(f.deckZ)))].sort((a, b) => a - b).map((z) => `+${z} m`).join(', ')
  const zoneGlass = lowGlass !== null ? lowGlass + deckGlass : null
  const untreated = zoneGlass !== null && input.birdTreatedPct !== null ? zoneGlass * (1 - input.birdTreatedPct / 100) : null
  rows.push({
    id: 'bird-zone', name: 'Glazing in Vancouver’s bird-collision zone', half: 'space', direction: '4.3',
    value: zoneTop === null ? 'needs the storeys from the design' : `zone to ${zoneTop.toFixed(1)} m (top of the 4th storey; mature trees not entered)${zoneGlass !== null ? `: about ${Math.round(zoneGlass).toLocaleString()} m² of glazing${deckGlass > 0.5 ? ` (${Math.round(deckGlass).toLocaleString()} m² of it beside planted decks at ${deckAt}, any height)` : ''}${untreated !== null ? `, ${Math.round(untreated).toLocaleString()} m² untreated` : ''}` : '; switch on the facade node for the glazing'}`,
    entered: input.birdTreatedPct === null ? null : true,
    threshold: 'treat glazing up to the mature tree height or the 4th floor, whichever is higher (3.3(a)(i)); no percentage set', state: untreated === null ? 'unknown' : untreated <= 0.5 ? 'pass' : 'warn',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.bird, page: '3.3(a)(i)' },
    note: 'The explanatory note gives about 12 m as a typical 4th floor; Toronto and UBC use 16 m (the facade node’s zone). Planting next to glass joins the zone at any height (3.3(c)(ii), as cited by the team, to confirm): the walls rising from each deck marked planted, over its storey and the one above, are added and reported apart.' + (ctx.facadeFrom === 'defaults' ? ' Glazing here is from the Facade node’s defaults (its own settings were not passed), so it can differ from the panel, which reads them.' : ''),
  })
  rows.push({
    id: 'bird-markers', name: 'Exterior markers and corners', half: 'space', direction: '4.3',
    value: 'not modelled: record the pattern and spacing', entered: null,
    threshold: 'markers on the exterior surface, gaps no more than 5 cm vertically OR 10 cm horizontally (3.3(a)(ii)); reduce clear passage at corners and railings (3.3(a)(v))', state: 'unknown',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.bird, page: '3.3(a)(ii), (v)' },
  })
  rows.push({
    id: 'bird-lighting', name: 'Night lighting', half: 'space', direction: '4.3',
    value: 'not modelled: lighting design intent', entered: null,
    threshold: 'shielded, downward lighting and no floodlighting of the crown or facade', state: 'unknown',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.bird, page: 'lighting section' },
    note: 'Light spill attracts and disorients migrating birds. A management guide and monitoring (2.3(d)–(e)) stay with people.',
  })

  // Views and connections (half b).
  const cones = coneOverall
  const conesAbove = cones ? cones.some((s) => s === 'above') : null
  rows.push({
    id: 'views', name: 'Protected public views kept clear', half: 'views', direction: '4.4',
    value: cones === null ? (ctx.project === 'city' ? 'view-cone results not read here: see the View-cone height check' : 'not modelled on the competition site') : conesAbove ? 'enters at least one cone' : cones.some((s) => s === 'limit_unknown' || s === 'within_uncertainty') ? 'some cones have no estimate' : 'clear of the modelled cones',
    entered: cones === null ? null : false,
    threshold: 'no part of a building enters a cone (3.1.1), minor elements aside', state: cones === null ? 'unknown' : conesAbove ? 'warn' : cones.some((s) => s === 'limit_unknown' || s === 'within_uncertainty') ? 'unknown' : 'pass',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.pvg, page: 'cl. 3.1.1' },
    note: cones === null ? (ctx.project === 'city' ? 'The view-cone results were not passed to this reading (the panel reads them once the View-cone height check has run).' : 'The competition site is hypothetical; test views in the Real Vancouver project.') : 'From the view-cone node (estimates; the City assessment governs).',
  })

  rows.push({
    id: 'qe-view', name: 'Queen Elizabeth Park view (view 3)', half: 'views', direction: '4.4',
    value: input.entersQEView === null ? 'not answered' : input.entersQEView ? 'enters, via the Higher Buildings pathway' : 'stays clear', entered: input.entersQEView === null ? null : true,
    threshold: 'entry is a pathway with the PVG 3.4 checklist and a skyline case, not a failure', state: input.entersQEView === null ? 'unknown' : input.entersQEView ? 'warn' : 'pass',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.hbpr, page: 'p.9' },
    ...(fromCones ? { note: 'From the View-cone height check (QE Park cones 3.2.1–3.2.4, estimates; the City View Cone Assessment governs).' } : {}),
  })

  const eligible = siteArea === null ? null : siteArea >= 8000
  rows.push({
    id: 'eds-eligible', name: 'Exceptional Downtown Site: site of at least 8,000 m²', half: 'views', direction: '4.4',
    value: siteArea === null ? 'needs a site area' : `${Math.round(siteArea).toLocaleString('en-CA')} m²`, entered: siteArea === null ? null : false,
    threshold: '≥ 8,000 m² (PVG 3.4.1)', state: judge(eligible, 'voluntary_guideline'),
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.pvg, page: '3.4.1' },
  })

  const answered = Object.values(input.pvg34).filter(Boolean).length
  rows.push({
    id: 'eds-criteria', name: 'Exceptional Downtown Site criteria answered in writing', half: 'views', direction: '4.4',
    value: `${answered} of 3 extracted`, entered: true,
    threshold: '3.4.3 Lions views kept, 3.4.6 open space and canopy strategy, 3.4.8 UNDRIP strategy (3.4.4, 3.4.5, 3.4.7 not extracted yet)',
    state: input.entersQEView ? (answered === 3 ? 'pass' : 'warn') : 'unknown',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.pvg, page: '3.4.3, 3.4.6, 3.4.8' },
    note: input.entersQEView ? 'Needed because the design enters the QE Park view.' : 'Needed only if the design enters a listed view.',
  })

  const binding = rows.filter((r) => isBinding(r.force))
  const coverage = Object.fromEntries((Object.keys(DIRECTIONS) as Direction[]).map((d) => [d, rows.some((r) => r.direction === d && r.entered !== null) || !!input.notes[d]?.trim()])) as Record<Direction, boolean>
  const falseAssumptions: NatureFalseAssumption[] = [{
    claim: 'Rain City’s 48 mm a day binds private sites.',
    correction: 'The number is valid, but the City’s GRI summary says the private-property targets are superseded by the Building By-law, whose binding rule is detention (2.4.2.5). 48 mm stays a stretch target.',
    source: { ...S.gri, page: 'summary sheet' },
  }, {
    claim: 'Bird markers must be at most 5 cm apart vertically AND 10 cm horizontally.',
    correction: 'The guideline reads OR: horizontal elements at most 5 cm apart vertically, or vertical elements at most 10 cm apart horizontally, on the exterior surface. A 5 cm horizontal-stripe frit passes.',
    source: { ...S.bird, page: '3.3(a)(ii)' },
  }, {
    claim: 'Vancouver advises planting 0–1 m from glass.',
    correction: 'It asks first to set landscaping back at an appropriate distance to reduce reflections; 0–1 m or visible glass is the fallback.',
    source: { ...S.bird, page: '3.3(c)(i)' },
  }, {
    claim: 'Entering the Queen Elizabeth Park view is a failure.',
    correction: 'The Higher Buildings Policy invited exceptional core projects to enter the QE view to enhance the view of the city in nature (HBPR p.9). PVG 3.4 sets the conditions; scored as a failure, every VTC tower would fail.',
    source: { ...S.hbpr, page: 'p.9; PVG 3.4' },
  }]
  const rules: RuleResult[] = rows.map((r) => ({ id: r.id, label: r.name, value: r.value, threshold: r.threshold, state: r.state, flag: r.flag, source: r.source, note: `${FORCE_LABEL[r.force]}${r.note ? `. ${r.note}` : ''}`, ...(r.specialist ? { specialist: r.specialist } : {}) }))
  return {
    rows,
    binding: { passed: binding.filter((r) => r.state === 'pass').length, failed: binding.filter((r) => r.state === 'fail').length, open: binding.filter((r) => r.state === 'unknown').length, total: binding.length },
    coverage,
    falseAssumptions,
    rules,
  }
}
