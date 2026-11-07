// City in Nature evidence ledger (research P05-M01, packet P05 round 2). Not a score: each indicator shows its value,
// threshold, force (how binding the rule is), evidence flag and source. Only by-law and rezoning-policy requirements can
// fail; targets, guidelines, aspirations and comparators are reference lines that say "Check" at worst. Most values are
// entered by the designer until the modules that compute them (P05-M02..M08) are built.
import type { Flag, RuleResult, RuleState, Source } from './types'

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
/** Layer 0 context for the rows that compute from the design: towers (storeys) and the facade node's faces. */
/** Top of the 4th storey across the towers (Vancouver's bird zone; podium storeys count), or null with no towers. */
export function fourthStoreyTop(floorsPerTower: { z1: number }[][]): number | null {
  const tops = floorsPerTower.filter((f) => f.length).map((f) => f[Math.min(3, f.length - 1)].z1)
  return tops.length ? Math.max(...tops) : null
}
export interface NatureContext {
  fourthStoreyTop?: number | null; faces?: { z0: number; z1: number; length: number; wwr: number }[] | null
  /** The Facade node's treated share of glass in the bird zone (0–1), used when the ledger's own is not entered. */
  facadeTreated?: number | null
  /** Real Vancouver: whether the towers rise into a Queen Elizabeth Park cone (3.2.x), from the view-cone check; null when uncertain. */
  qeFromCones?: boolean | null
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
 * @param siteArea site area in m² (null when the project has no site polygon, e.g. Real Vancouver)
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

  const [canopyLo] = CANOPY[input.siteType]
  const canopy = share(input.canopyM2)
  rows.push({
    id: 'canopy', name: 'Tree canopy at maturity, share of site', half: 'space', direction: '4.2',
    value: canopy === null ? (siteArea ? 'not entered' : 'needs a site area') : pct(canopy), entered: input.canopyM2 === null ? null : true,
    threshold: `≥ ${canopyLo}% (R019 Type ${input.siteType} band ${CANOPY[input.siteType].join('–')}%)`, state: judge(canopy === null ? null : canopy >= canopyLo, 'rezoning_target'),
    force: 'rezoning_target', flag: 'verified', source: { ...S.r019, page: 'canopy bands by site type' },
    note: `Site type ${input.siteType} is a team assumption: R019 Type C is a single parcel over an excavated parkade; several towers under separate permits suggest Type B. A City planner decides.${input.siteType === 'A' ? ' R019 also states a 22% minimum for Type A; show both.' : ''}`,
  })

  const coverLine = COVER[input.siteType]
  const cover = share(input.vegetatedM2)
  rows.push({
    id: 'cover', name: 'Vegetative cover at maturity, share of site', half: 'space', direction: '4.2',
    value: cover === null ? (siteArea ? 'not entered' : 'needs a site area') : pct(cover), entered: input.vegetatedM2 === null ? null : true,
    threshold: coverLine ? `reference ${coverLine}% (R019 Type ${input.siteType})` : 'no R019 reference line for Type C',
    state: coverLine && cover !== null ? judge(cover >= coverLine, 'team_assumption') : 'unknown',
    force: 'team_assumption', flag: coverLine ? 'team_assumption' : 'unresolved', source: { ...S.r019, page: 'cover A 30%, B 40%' },
    note: 'Using R019 cover figures as a pass line is the team’s reading.',
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

  const depth = input.retainedM3 === null || !siteArea ? null : (input.retainedM3 / siteArea) * 1000
  rows.push({
    id: 'retention', name: 'Rainfall retained (Rain City 48 mm, reference only)', half: 'space', direction: '4.1',
    value: depth === null ? (siteArea ? 'not entered' : 'needs a site area') : `${Math.round(depth)} mm`, entered: input.retainedM3 === null ? null : true,
    threshold: '≥ 48 mm a day (earlier standard 24 mm)', state: judge(depth === null ? null : depth >= 48, 'city_aspiration'),
    force: 'city_aspiration', flag: 'verified', source: { ...S.rainCity, page: '48 mm design standard' },
    note: 'The City’s GRI summary says Building By-law requirements supersede the private-property targets; kept as a stretch target.',
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
  const zoneGlass = zoneTop !== null && ctx.faces ? glazingBelow(ctx.faces, zoneTop) : null
  const untreated = zoneGlass !== null && input.birdTreatedPct !== null ? zoneGlass * (1 - input.birdTreatedPct / 100) : null
  rows.push({
    id: 'bird-zone', name: 'Glazing in Vancouver’s bird-collision zone', half: 'space', direction: '4.3',
    value: zoneTop === null ? 'needs the storeys from the design' : `zone to ${zoneTop.toFixed(1)} m (top of the 4th storey; mature trees not entered)${zoneGlass !== null ? `: about ${Math.round(zoneGlass).toLocaleString()} m² of glazing${untreated !== null ? `, ${Math.round(untreated).toLocaleString()} m² untreated` : ''}` : '; switch on the facade node for the glazing'}`,
    entered: input.birdTreatedPct === null ? null : true,
    threshold: 'treat glazing up to the mature tree height or the 4th floor, whichever is higher (3.3(a)(i)); no percentage set', state: untreated === null ? 'unknown' : untreated <= 0.5 ? 'pass' : 'warn',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.bird, page: '3.3(a)(i)' },
    note: 'The explanatory note gives about 12 m as a typical 4th floor; Toronto and UBC use 16 m (the facade node’s zone). Interior planting near glass joins the zone at any height (3.3(c)(ii)).',
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
    value: cones === null ? 'not modelled on the competition site' : conesAbove ? 'enters at least one cone' : cones.some((s) => s === 'limit_unknown' || s === 'within_uncertainty') ? 'some cones have no estimate' : 'clear of the modelled cones',
    entered: cones === null ? null : false,
    threshold: 'no part of a building enters a cone (3.1.1), minor elements aside', state: cones === null ? 'unknown' : conesAbove ? 'warn' : cones.some((s) => s === 'limit_unknown' || s === 'within_uncertainty') ? 'unknown' : 'pass',
    force: 'voluntary_guideline', flag: 'verified', source: { ...S.pvg, page: 'cl. 3.1.1' },
    note: cones === null ? 'The competition site is hypothetical; test views in the Real Vancouver project.' : 'From the view-cone node (estimates; the City assessment governs).',
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
  const rules: RuleResult[] = rows.map((r) => ({ id: r.id, label: r.name, value: r.value, threshold: r.threshold, state: r.state, flag: r.flag, source: r.source, note: `${FORCE_LABEL[r.force]}${r.note ? `. ${r.note}` : ''}` }))
  return {
    rows,
    binding: { passed: binding.filter((r) => r.state === 'pass').length, failed: binding.filter((r) => r.state === 'fail').length, open: binding.filter((r) => r.state === 'unknown').length, total: binding.length },
    coverage,
    falseAssumptions,
    rules,
  }
}
