// Rule cards (research P16-M02, flags per P16-M03): each clause a built check relies on, with its clause and page, a
// summary in plain words (no quotation, so nothing is misquoted or reproduced), deontic type, strength and flag.
// The cards were drafted with AI from the research packets; a card counts as reviewed only after a person reads the
// source blind and agrees (lib/trace/review.ts; reviews travel in the project trace). Deontic types follow LegalRuleML
// (obligation, prohibition, permission); "recommendation" marks guidance documents that bind no one. Strength: strict,
// or defeasible when the text admits exceptions or departures.
import type { Flag, Source } from '../engine/types'
import { SRC as WIND_COMFORT_SRC } from '../engine/windComfortInput'
import { SRC as DAYLIGHT_SW_SRC } from '../engine/daylightSWInput'
import { SRC as VENTILATION_SW_SRC } from '../engine/ventilationSWInput'
import { SRC as ENERGY_SW_SRC } from '../engine/energySWInput'

export type Deontic = 'obligation' | 'prohibition' | 'permission' | 'recommendation'
export type Strength = 'strict' | 'defeasible'
export interface RuleCard {
  id: string
  title: string
  source: Source
  /** What the clause says, in the team's words (never a quotation). */
  summary: string
  /** What the check compares, in Layer 0 terms. */
  parameter: string
  rule: string
  deontic: Deontic
  strength: Strength
  flag: Flag
  /** Built nodes that apply the card. */
  usedBy: string[]
  /** Results it backs, as "group:rule-id prefix" (group = the key in the live results, e.g. lifts, rules, egress). */
  results: string[]
  note?: string
}

const BRIEF = 'Vancouver Tall Challenge brief (Buildner 2026)'
const VBBL19 = { label: 'Vancouver Building By-law 2019 (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/681033337' }
const VBBL19_EXITS = { label: 'Vancouver Building By-law 2019, Part 3, Section 3.4 Exits (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/463712062' }
const VBBL19_32 = { label: 'Vancouver Building By-law 2019, Part 3, Section 3.2 Building Fire Safety (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/59509560' }
const VBBL19_38 = { label: 'Vancouver Building By-law 2019, Part 3, Section 3.8 Accessibility (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/369101801' }
const NBC = { label: 'National Building Code of Canada 2020 (2nd printing, 2025)', url: 'https://nrc-publications.canada.ca/eng/view/ft/?id=515340b5-f4e0-4798-be69-692e4ec423e8&dp=2&dsl=en' }

/** Who drafted the cards (shown on every card; never cleared by a review). */
export const CARDS_DRAFTED_BY = 'AI (Claude) from the research packets, 22 Oct 2026'

export const RULE_CARDS: RuleCard[] = [
  // Competition brief
  {
    id: 'vtc.height-band', title: 'Tower height band', source: { label: BRIEF, page: 'p.19' },
    summary: 'Every proposed tower must fall within the stated height range, given in both metres (244–305 m) and feet (800–1000 ft).',
    parameter: 'tower.height (architectural top)', rule: '244 m ≤ height ≤ 305 m', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.vtc-rules'], results: ['rules:height-'],
    note: 'The two units differ at the edges (800–1000 ft = 243.84–304.80 m): the check passes only inside both readings. Height measure (CTBUH architectural top) is a team assumption.',
  },
  {
    id: 'vtc.fsr-nonres', title: 'Non-residential FSR minimum', source: { label: BRIEF, page: 'p.16 and p.19' },
    summary: 'The scheme must provide at least 9.0 FSR of non-residential, high-employment floor area on the site.',
    parameter: 'non-residential gross floor area ÷ site area', rule: 'FSR ≥ 9.0', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.vtc-rules', 'built.fsr'], results: ['rules:fsr-nonres'],
    note: 'Which uses count as non-residential, high-employment is unresolved: the FSR tier switch shows all three readings. Ask Buildner before 3 Nov.',
  },
  {
    id: 'vtc.site', title: 'Massing inside the block', source: { label: BRIEF, page: 'p.15 (site), p.32 (departures)' },
    summary: 'The brief gives the consolidated block at about 79.2 × 144.8 m; the jury may accept justified departures.',
    parameter: 'tower and podium corners', rule: 'inside the 79.2 × 144.8 m block', deontic: 'obligation', strength: 'defeasible', flag: 'team_assumption',
    usedBy: ['built.vtc-rules'], results: ['rules:containment'],
    note: 'Reading the site size as a limit on massing is the team’s; air-space encroachment can be argued as a departure.',
  },
  {
    id: 'vtc.transit', title: 'Below-grade transit entrance', source: { label: BRIEF, page: 'p.19' },
    summary: 'The scheme must include a secondary transit entrance below grade, linking directly to the station on the neighbouring site.',
    parameter: 'transit link declared', rule: 'link provided', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.vtc-rules'], results: ['rules:transit'],
    note: 'The tool takes the designer’s declaration; it does not check the route.',
  },
  {
    id: 'vtc.vertical-public', title: 'Public uses extend vertically', source: { label: BRIEF, page: 'p.19' },
    summary: 'Entrants are encouraged to explore public-facing uses and spaces higher up the tower; it is not a requirement.',
    parameter: 'a public sky room, or civic or amenity levels above the podium where a public lift route stops (G42)', rule: 'encouraged, not required', deontic: 'permission', strength: 'defeasible', flag: 'verified',
    usedBy: ['built.vtc-rules'], results: ['rules:vertical-public'],
    note: 'The check says Check, never Fail.',
  },
  // City guidelines
  {
    id: 'pvg.3.1.1', title: 'Protected public views', source: { label: 'City of Vancouver, Public Views Guidelines (Feb 2026)', page: 'cl. 3.1.1; relaxations 3.1.2–3.1.5 and 3.4', url: 'https://guidelines.vancouver.ca/guidelines-public-views.pdf' },
    summary: 'Buildings should stay out of the protected view cones; the guidelines then list limited relaxations and an Exceptional Downtown Site pathway.',
    parameter: 'top of tower (geodetic) vs the estimated cone limit Z = Lv + k·D', rule: 'height ≤ estimated limit under every covering cone', deontic: 'prohibition', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.viewcones', 'built.city-in-nature'], results: ['cones:overall', 'nature:views'],
    note: 'Check the wording against the Feb 2026 PDF. The City View Cone Assessment governs.',
  },
  // Vertical transportation
  {
    id: 'lifts.floors-per-rise', title: 'Floors served by one lift group', source: { label: 'CIBSE Guide D as cited by Peters, Lift Planning for High-Rise Buildings (2017)', url: 'https://liftescalatorlibrary.org/paper_indexing/papers/00000157.pdf' },
    summary: 'Design guidance keeps a single-deck lift group to about fifteen served floors, so round trips and waiting stay reasonable.',
    parameter: 'served floors per rise', rule: '≤ 15 (amber 16)', deontic: 'recommendation', strength: 'defeasible', flag: 'verified',
    usedBy: ['built.core-lifts'], results: ['lifts:rise-floors-'],
  },
  {
    id: 'lifts.net-to-gross', title: 'Net-to-gross of a typical tower floor', source: { label: 'Stopes, 22 Bishopsgate vertical transportation strategy', url: 'https://liftescalatorlibrary.org/paper_indexing/papers/00000193.pdf' },
    summary: 'A London precedent paper treats about 75% net-to-gross as the efficiency a lettable office floor should reach.',
    parameter: '1 − core needed ÷ plate', rule: '≥ 75% (amber 70–75%)', deontic: 'recommendation', strength: 'defeasible', flag: 'verified',
    usedBy: ['built.core-lifts'], results: ['lifts:ntg-'],
    note: 'A UK precedent, not Canadian code.',
  },
  {
    id: 'lifts.firefighter', title: 'Firefighter lift reaches the top', source: { label: 'Vancouver Building By-law 2019 (VBBL 2025 unread)', page: '3.2.6.5 (same in VBBL 2007)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/59509560' },
    summary: 'A firefighters’ elevator must reach the top storey quickly, with a limit on run time and on changes of lift.',
    parameter: 'run time to the top floor and lift changes', rule: '≤ 60 s, at most one change', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.core-lifts', 'built.life-safety'], results: ['lifts:firefighter-', 'lifeSafety:ff-elevator'],
    note: 'VBBL 2025 edition check pending.',
  },
  {
    id: 'lifts.stretcher', title: 'Stretcher-capable car', source: { ...VBBL19, page: '3.5.4.1' },
    summary: 'At least one elevator serving each storey must take an ambulance stretcher lying flat.',
    parameter: 'one car per storey', rule: 'takes a 2010 × 610 mm stretcher', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.core-lifts', 'built.life-safety'], results: ['lifts:stretcher-', 'lifeSafety:stretcher'],
    note: 'Car size is not yet checked against the clause.',
  },
  // Egress
  {
    id: 'egress.exits', title: 'Two exits per floor', source: { ...VBBL19_EXITS, page: '3.4.2.1' },
    summary: 'Every floor area above a small size needs at least two separate exits.',
    parameter: 'exit stairs per floor', rule: 'at least 2', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.egress', 'built.life-safety'], results: ['egress:exits-', 'lifeSafety:exits'],
  },
  {
    id: 'egress.stair-width', title: 'Exit stair width', source: { ...VBBL19_EXITS, page: '3.4.3.2 and Table 3.4.3.2.-A' },
    summary: 'Exit width grows with the occupant load the stair serves, at a rate per person, with a minimum width for a stair.',
    parameter: 'stair width storey by storey', rule: '≥ 1100 mm and ≥ the per-person rate ÷ stairs', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.egress', 'built.life-safety'], results: ['egress:stair-width-', 'lifeSafety:stair-width'],
  },
  {
    id: 'egress.separation', title: 'Exit separation', source: { ...VBBL19_EXITS, page: '3.4.2.3' },
    summary: 'Two exits must be far enough apart that one fire is unlikely to block both: half the floor’s diagonal, with a shorter distance allowed where a public corridor serves the floor.',
    parameter: 'distance between the stairs', rule: '≥ half the plate diagonal (9 m with public corridors)', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.egress', 'built.life-safety'], results: ['egress:separation-', 'lifeSafety:separation'],
  },
  {
    id: 'egress.travel', title: 'Travel distance to an exit', source: { ...VBBL19_EXITS, page: '3.4.2.5' },
    summary: 'The walk from any point to the nearest exit is capped, with a longer cap in sprinklered buildings.',
    parameter: 'longest walk on a floor', rule: 'within the sprinklered limit', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.egress', 'built.life-safety'], results: ['egress:travel-', 'lifeSafety:travel'],
  },
  // Structure and wind
  {
    id: 'nbc.wind-procedure', title: 'Wind procedure for tall, slender buildings', source: { ...NBC, page: 'Div B 4.1.7.2' },
    summary: 'Buildings taller than 60 m are dynamically sensitive; very slender or low-frequency ones must be designed from a wind-tunnel test.',
    parameter: 'height, H ÷ effective width, model frequency', rule: 'H/w over 6 or f1 ≤ 0.25 Hz: tunnel', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.wind-procedure'], results: ['wind:height-60', 'wind:aspect', 'wind:f1'],
  },
  {
    id: 'lawson.sunwind', title: 'Lawson pedestrian comfort bands (as applied in Sun & Wind Studio)', source: WIND_COMFORT_SRC.lawson,
    summary: 'At pedestrian level a mean wind speed up to 2.5 m/s suits sitting, up to 4 m/s standing, up to 6 m/s strolling and up to 8 m/s walking; above that the ground is uncomfortable for any use.',
    parameter: 'mean pedestrian-level wind speed', rule: 'band by mean speed', deontic: 'recommendation', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.wind-comfort'], results: ['windComfort:calm-ground', 'windComfort:plaza-peak', 'windComfort:uncomfortable'],
    note: 'No Lawson edition is cited in her code (study.js): the thresholds are taken as her app applies them, so the card stays unverified until a person reads the criteria she used.',
  },
  {
    id: 'leed.daylight.sunwind', title: 'LEED v4.1 EQ Daylight, option 1 (as applied in Sun & Wind Studio)', source: DAYLIGHT_SW_SRC.leed,
    summary: 'Spatial daylight autonomy: the share of regularly occupied floor that reaches 300 lux from daylight for at least half the occupied hours earns 1 point at 40%, 2 at 55% and 3 at 75%. Annual sunlight exposure: the floor in direct sun over 1,000 lux for more than 250 hours should stay at or under 10%, or glare control be shown.',
    parameter: 'sDA300/50% and ASE1000/250h of the analysed floors', rule: 'sDA ≥ 40 / 55 / 75%; ASE ≤ 10%', deontic: 'recommendation', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.daylight-sw'], results: ['daylightSW:sw-dl-sda', 'daylightSW:sw-dl-ase'],
    note: 'Her code (study.js keyItems, leedCard) names LEED v4.1 EQ Daylight option 1 and these thresholds; the USGBC reference guide was not opened here, so the card stays unverified until a person checks it. A LEED credit is a voluntary rating, not a by-law.',
  },
  {
    id: 'en17037.df.sunwind', title: 'Mean daylight factor (EN 17037 as labelled in Sun & Wind Studio)', source: DAYLIGHT_SW_SRC.df,
    summary: 'Under an overcast sky a room with a mean daylight factor of 2% reads as well daylit; under 1% it needs electric light most of the day.',
    parameter: 'mean daylight factor of the analysed floors', rule: '≥ 2% good, ≥ 1% fair', deontic: 'recommendation', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.daylight-sw'], results: ['daylightSW:sw-dl-df'],
    note: 'Her app labels this reading EN 17037 without an edition or clause, and EN 17037 itself sets targets as illuminance over half the daylight hours, not a mean DF: the card stays unverified until a person reads the standard she meant.',
  },
  {
    id: 'ashrae621.natvent.sunwind', title: 'ASHRAE 62.1 natural ventilation: openable area and reach (as applied in Sun & Wind Studio)', source: VENTILATION_SW_SRC.ashrae621,
    summary: 'A naturally ventilated space needs operable openings whose free area is at least 4% of the floor they serve, and every point of that floor within 8 m of one.',
    parameter: 'free opening area over the floor served; floor within 8 m of an operable opening', rule: '≥ 4%; every point within 8 m', deontic: 'obligation', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.ventilation-sw'], results: ['ventilationSW:sw-vt-openable', 'ventilationSW:sw-vt-within8'],
    note: 'Her code (study.js keyItems, leedCard) states these two conditions and names ASHRAE 62.1 without an edition; the standard was not opened here, so the card stays unverified until a person checks the edition the project uses.',
  },
  {
    id: 'ashrae55.adaptive.sunwind', title: 'ASHRAE 55 adaptive comfort band (as applied in Sun & Wind Studio)', source: VENTILATION_SW_SRC.ashrae55,
    summary: 'In a naturally ventilated space the comfortable operative temperature follows the prevailing mean outdoor temperature: 0.31 times it plus 17.8 °C, give or take 3.5 K, while that mean lies between 10 and 33.5 °C.',
    parameter: 'room air (outdoor + ΔT) against the band', rule: 'within 0.31 Tpma + 17.8 ± 3.5 °C', deontic: 'recommendation', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.ventilation-sw'], results: ['ventilationSW:sw-vt-hours'],
    note: 'Her code (study.js ventStudy) applies the adaptive band with the 3.5 K width and the 10–33.5 °C range, without naming an edition or the acceptability level; the standard was not opened here, so the card stays unverified.',
  },
  {
    id: 'cov.rezoning-targets.sunwind', title: 'City of Vancouver rezoning energy targets by program (as stated in Sun & Wind Studio)', source: ENERGY_SW_SRC.targets,
    summary: 'A rezoned building should keep its total energy use, its heating demand and its greenhouse gas emissions per square metre under limits that depend on its use (homes, offices, hotels, retail and others), here weighted by each use\u2019s floor area.',
    parameter: 'TEUI, TEDI and GHGI of the modelled tower', rule: 'each ≤ the program-weighted target', deontic: 'obligation', strength: 'defeasible', flag: 'unverified',
    usedBy: ['built.energy-sw'], results: ['energySW:sw-en-teui', 'energySW:sw-en-tedi', 'energySW:sw-en-ghgi'],
    note: 'Her code (energy.js TARGETS) calls these "indicative City of Vancouver rezoning targets (Zero Emissions Building Plan, approximate)" and cites no document; the Energy & carbon node carries the limits research P04 read. Unverified until a person checks the City\u2019s current rezoning policy.',
  },
  {
    id: 'nbc.wall-continuity', title: 'Seismic walls continuous to the foundation', source: { ...NBC, page: 'Div B 4.1.8.10(4), Table 4.1.8.6 Types 4–5' },
    summary: 'For long-period buildings in high-hazard areas, the walls that resist earthquakes must run unbroken down to the foundation: no transfers or offsets.',
    parameter: 'the core walls (SFRS)', rule: 'continuous top to foundation', deontic: 'prohibition', strength: 'strict', flag: 'verified',
    usedBy: ['built.structure'], results: ['structure:continuity'],
  },
  // Code and life safety (research P11 r2; VBBL 2019 read, VBBL 2025 unread, so all unverified)
  {
    id: 'vbbl.high-building', title: 'High-building measures apply over 18 m', source: { ...VBBL19_32, page: '3.2.6.1.(1)(a)' },
    summary: 'When the floor of the top storey is more than 18 m above grade, the building must meet the high-building measures of Subsection 3.2.6.',
    parameter: 'floor level of the top storey above grade', rule: 'over 18 m: Subsection 3.2.6 applies', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:high-building'],
    note: 'The NBC uses 36 m for some groups; Vancouver’s by-law uses 18 m for every group (read in VBBL 2007 and 2019).',
  },
  {
    id: 'vbbl.sprinklers', title: 'Sprinklers in every new building', source: { ...VBBL19_32, page: '3.2.2.18.(3)' },
    summary: 'Every new building in Vancouver must be sprinklered.',
    parameter: 'sprinkler status', rule: 'sprinklered throughout', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:sprinklers'],
  },
  {
    id: 'vbbl.stair-vent', title: 'Vent at the bottom of exit stairs', source: { ...VBBL19_32, page: '3.2.6.2.(3)' },
    summary: 'In a high building, exit stairs above the lowest exit level need a vent at the bottom, sized by the number of stair doors with a minimum area.',
    parameter: 'vent area per stair', rule: '0.05 m² per stair door, at least 1.8 m²', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:stair-vent'],
  },
  {
    id: 'vbbl.emergency-power', title: 'Emergency generator for 2 hours', source: { ...VBBL19_32, page: '3.2.7.9' },
    summary: 'An emergency generator must be able to run the listed life-safety loads, including elevators, power-dependent firefighting water and stair and venting fans, at full load for at least two hours.',
    parameter: 'generator runtime and the loads it carries', rule: '≥ 2 h at full load, every listed load', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:emergency-power'],
  },
  {
    id: 'vbbl.hotel-rooms', title: 'Accessible and visual-alarm hotel rooms', source: { ...VBBL19_38, page: '3.8.2.12.(2)–(3)' },
    summary: 'A hotel must make a share of its rooms accessible, and a further share must have visual alarms for guests who are deaf or hard of hearing.',
    parameter: 'rooms by type', rule: '1 per 40 accessible; 1 per 20 more with visual alarms', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:bf-hotel'],
  },
  {
    id: 'vbbl.adaptable', title: 'Adaptable dwelling units', source: { ...VBBL19_38, page: '3.8.5.1' },
    summary: 'Dwelling units in a residential building must be designed to the adaptable-unit requirements of Subsection 3.8.5.',
    parameter: 'homes designed to 3.8.5', rule: 'all of them (Vancouver)', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:bf-adaptable'],
    note: 'BC’s provincial 100% rule for large buildings does not apply in Vancouver.',
  },
  {
    id: 'vpbl.prv', title: 'Water pressure limited at fixtures', source: { label: 'Vancouver Building By-law 2019, Book II Plumbing (VBBL 2025 unread)', page: '2.6.3.3', url: 'https://free.bcpublications.ca/civix/document/id/public/vpbl2019/238839733' },
    summary: 'Where static water pressure at a fixture could exceed 550 kPa, a pressure-reducing valve must bring it down to 550 kPa.',
    parameter: 'static pressure at the lowest fixture of each zone', rule: '≤ 550 kPa', deontic: 'obligation', strength: 'strict', flag: 'unverified',
    usedBy: ['built.life-safety'], results: ['lifeSafety:water-zones'],
    note: 'The minimum pressure at the top fixture (140 kPa) is a trade-article preset, not a Vancouver clause.',
  },
  // City in Nature
  {
    id: 'vbbl.rainwater', title: 'Engineered rainwater detention', source: { label: 'Vancouver Building By-law 2025, Art. 2.4.2.5', url: 'https://vancouver.ca/files/cov/2025-vbbl-book-II-insert-pages.pdf' },
    summary: 'Larger or denser sites must detain rainwater through an engineered design that limits the release rate.',
    parameter: 'engineered pathway planned', rule: 'required over 1,000 m² or FSR 1.0', deontic: 'obligation', strength: 'strict', flag: 'verified',
    usedBy: ['built.city-in-nature'], results: ['nature:rain-pathway'],
  },
  {
    id: 'rpsld.habitat', title: 'Habitat assessment and tree strategy', source: { label: 'Rezoning Policy for Sustainable Large Developments (Mar 2026)', page: 'A.3.4–A.3.5, A.4.1', url: 'https://guidelines.vancouver.ca/policy-rezoning-sustainable-large-developments.pdf' },
    summary: 'Large rezonings must assess existing habitat and trees on and next to the site and set out how they are retained or replaced.',
    parameter: 'assessment planned', rule: 'filed with the rezoning', deontic: 'obligation', strength: 'defeasible', flag: 'verified',
    usedBy: ['built.city-in-nature'], results: ['nature:habitat'],
  },
]

/** Does a card back this result? Result ids look like "group:tower:rule" or "group:rule". */
export function cardMatches(c: RuleCard, resultId: string): boolean {
  const parts = resultId.split(':')
  const group = parts[0], rule = parts[parts.length - 1]
  return c.results.some((p) => { const [g, r] = p.split(':'); return g === group && rule.startsWith(r) })
}
export const cardsFor = (resultId: string) => RULE_CARDS.filter((c) => cardMatches(c, resultId))

/** Which live-results group each built node writes (for "rules behind this node"). */
export const NODE_GROUPS: Record<string, string[]> = {
  'built.vtc-rules': ['rules'], 'built.core-lifts': ['lifts'], 'built.egress': ['egress'], 'built.sky-room': ['skyRooms'],
  'built.pr-streetwall': ['streetwall'], 'built.pr-frontage': ['frontage'], 'built.pr-ground': ['groundPlane'], 'built.viewcones': ['cones'],
  'built.city-in-nature': ['nature'], 'built.wind-procedure': ['wind'], 'built.structure': ['structure'], 'built.wind-study': ['windStudy'], 'built.life-safety': ['lifeSafety'], 'built.relax-aviation': ['relaxAviation'],
  'built.wind-comfort': ['windComfort'],
  'built.daylight-sw': ['daylightSW'],
  'built.ventilation-sw': ['ventilationSW'],
  'built.energy-sw': ['energySW'],
  'built.silhouette': ['silhouette'],
}
