// Node registry: the built nodes of v0.1 plus every module researched so far.
// Each node declares a category (required for community uploads), a phase and jury tags.
import research from './research_registry.json'

export type Category = 'SITE' | 'PROG' | 'CLIM' | 'ENER' | 'ECOL' | 'PUBL' | 'CULT' | 'MOBI' | 'STRC' | 'SYST' | 'SPAC' | 'PRES' | 'DATA'

export const CATEGORIES: Record<Category, { label: string; color: string }> = {
  SITE: { label: 'Site, context & policy', color: '#1f5f8b' },
  PROG: { label: 'Program, density & economics', color: '#b5651d' },
  CLIM: { label: 'Sun, shadow, daylight & wind', color: '#d9a400' },
  ENER: { label: 'Energy, carbon & resources', color: '#c0392b' },
  ECOL: { label: 'Ecology & City in Nature', color: '#3c8d5a' },
  PUBL: { label: 'Public realm & human scale', color: '#2a9d8f' },
  CULT: { label: 'Culture, reconciliation & ethics', color: '#8e5ba8' },
  MOBI: { label: 'Mobility, transit & servicing', color: '#5d6d7e' },
  STRC: { label: 'Structure', color: '#6d4c41' },
  SYST: { label: 'MEP, vertical transport & code', color: '#7f8c8d' },
  SPAC: { label: 'Interior, facade & materials', color: '#a0522d' },
  PRES: { label: 'Presentation', color: '#34495e' },
  DATA: { label: 'Data & platform', color: '#4a5568' },
}

export type NodeStatus = 'built' | 'preview' | 'researched'
export type Priority = 'core' | 'v1' | 'roadmap'

export interface ResearchMetric { name: string; unit: string; good: string; bad: string; status: string }
export interface NodeDef {
  id: string
  name: string
  category: Category
  phase: string
  priority: Priority
  status: NodeStatus
  question: string
  jury: string[]
  method?: string
  human?: string
  limits?: string
  metrics?: ResearchMetric[]
  viz?: string[]
  libs?: string[]
  packet?: string
  research?: { stage: string; rounds: number[]; gate_pass: boolean | null; false_assumptions_in_packet: number; log: string }
  /** Which projects the node can run in. */
  projects?: ('vtc' | 'city')[]
  /** Built but off until the user switches it on (e.g. heavier runs or a map that covers the ground). */
  defaultOff?: boolean
}

export const BUILT_NODES: NodeDef[] = [
  { id: 'built.vtc-rules', name: 'VTC hard rules', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc'],
    question: 'Does the massing meet the competition rules: height band, 9.0 non-residential FSR, block, transit link?', jury: ['urban_integration_10'],
    human: 'Interpreting the brief where it is ambiguous (height measure, which uses count toward 9.0 FSR). Ask Buildner before 3 Nov.', packet: 'P01' },
  { id: 'built.fsr', name: 'Program & FSR accounting', category: 'PROG', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How much floor area does each use get, and what FSR results?', jury: ['design_excellence_20'],
    human: 'The program mix itself is a design decision.', packet: 'P01' },
  { id: 'built.viewcones', name: 'View-cone height check', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['city'],
    question: 'How high may a tower rise at this location under each protected public view, and does the design exceed the estimate?', jury: ['cultural_context_30', 'design_excellence_20'],
    human: 'Higher Buildings and Exceptional Downtown Site relaxations, minor elements, hardship (PVG 3.1.2–3.1.5, 3.4) and the final word: the City View Cone Assessment.', packet: 'C01' },
  { id: 'built.relax-aviation', name: 'Relaxations & aviation', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Where could the Higher Buildings Policy or an Exceptional Downtown Site let a tower enter a protected view, which views still bind, and which federal aviation obligations does a 244–305 m tower trigger?', jury: ['urban_integration_10', 'cultural_context_30'],
    human: 'Whether a site qualifies for a relaxation and how a rezoning argues it: the City decides. Aviation: contact Transport Canada and NAV CANADA for any real site; they set what a tower may do.',
    limits: 'Screening, not a determination. Relaxation masks are per cone and switched on by you, never automatic; Higher Buildings Policy areas (Figure 1) and other approved corridors are not digitised. Aerodrome positions are secondary transcriptions; VFR routes and NAV CANADA surfaces are not available, so those items stay unresolved (research C01-M06 r2).',
    packet: 'C01' },
  { id: 'built.sun', name: 'Sun & shadow preview', category: 'CLIM', phase: 'basic', priority: 'core', status: 'preview', projects: ['vtc', 'city'],
    question: 'Where do the towers cast shadow at a chosen date and time (with true north corrected)?', jury: ['human_scale_40'],
    human: 'This is a visual preview at one moment, not the City Downtown Peninsula Solar Access test (22 Sep, 10:00–16:00 PT): switch on "Solar access & sun hours" for that.', packet: 'P02' },
  { id: 'built.core-lifts', name: 'Core & lift check', category: 'SYST', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How many lifts, in how many rises, does this stacking need at the morning peak, and does the modelled core hold them with a workable net-to-gross?', jury: ['human_scale_40', 'design_excellence_20', 'urban_integration_10'],
    human: 'Tenant density and utilisation, acceptable waiting for each use, transfer floors and sky lobbies, and the final lift selection and simulation by a vertical-transportation consultant.',
    limits: 'Up-peak calculation only (two-way, lunch and down-peak, and simulated waiting times are roadmap). Thresholds are UK and Australian guidance, not Canadian code. Car sizes, speeds, door times and core allowances are team presets. Early estimate, not certification.',
    packet: 'P11' },
  { id: 'built.egress', name: 'Egress & stairs', category: 'SYST', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How many people are on each storey, how wide must the exit stairs be, and do exit separation and travel distance work with this core?', jury: ['human_scale_40', 'design_excellence_20'],
    human: 'Stair strategy (scissor or separate), discharge locations against active frontage, phased evacuation, waiting areas for people who cannot use stairs, and fire engineer approval.',
    limits: 'VBBL 2019 Part 3 values (equal to VBBL 2007); VBBL 2025 unread. Travel distance is a straight-line proxy, not a path on the plan; stair geometry and placement are team assumptions; evacuation time is roadmap (P11-M08).',
    packet: 'P11' },
  { id: 'built.life-safety', name: 'Code & life safety', category: 'SYST', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which high-building and life-safety requirements does this tower trigger, can people reach every floor step-free, and how many plant floors, how much riser space and how big an emergency generator does it need?', jury: ['design_excellence_20', 'human_scale_40'],
    human: 'Occupancy classification, clause interpretation and any alternative solution: the code consultant, fire engineer and Chief Building Official. Where plant sits against public floors and the skyline, louvre expression, and generator and pressure-zone sizing: with the MEP and electrical engineers. Universal design beyond code and lived-experience review of the routes.',
    limits: 'An early checklist, not code certification. Clauses read in VBBL 2019 (Part 3 to 1 Jul 2024; Section 3.8 to 7 Mar 2023); VBBL 2025 unread, so every clause is unverified. Occupancy is mapped from the program bands; plant, riser and generator figures come from team presets with no sourced values; smoke movement and recall times are not computed (P11-M08, P11-M02).',
    packet: 'P11' },
  { id: 'built.sky-room', name: 'Public sky room', category: 'PUBL', phase: 'advanced', priority: 'v1', status: 'built', projects: ['vtc', 'city'],
    question: 'Does the tower give a free public room at height that people can reach step-free, without crowding tenant lifts or the exit stairs?', jury: ['human_scale_40', 'cultural_context_30', 'urban_integration_10'],
    human: 'What the room is for and who runs it, free versus ticketed, opening hours, programming with community partners, and whether visitors and tenants share a lobby.',
    limits: 'The 1997 Higher Buildings Policy asks for a public deck or amenity where possible but sets no size; area, hours, visitor and lift criteria are team presets. Terrace wind comfort is roadmap (P03-M08).',
    packet: 'P06' },
  { id: 'built.economics', name: 'Program value & land residual', category: 'PROG', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'What is each floor worth, what does it cost to build and to pay the City and region, and what is left for land after profit and the CAC?', jury: ['design_excellence_20', 'urban_integration_10'],
    human: 'Which market evidence, cap rates, tenure and finance terms to defend; the land benchmark; whether a floor that loses money is a justified public benefit.',
    limits: 'Indicative early-design estimate (the Program Value Visualizer method, its Vancouver 2026 pack), not a feasibility study, appraisal or compliance check. Values are per m² of gross area from dated market sources, most grade C; costs are Altus midpoints; no lease-up, S-curve finance, presale depth or sensitivity yet (P08-M01 v1, P08-M08).',
    packet: 'P08' },
  { id: 'built.culture-claims', name: 'Engagement & claims guard', category: 'CULT', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'What can this entry truthfully say about engagement with each Nation, whom must the team not contact, and is the team eligible?', jury: ['cultural_context_30'],
    human: 'Whether and how to contact anyone, whether a declared status is true, eligibility, and checking the Terms, jury page and dates in a browser. Only people can engage the Nations; the tool never does.',
    limits: 'Stage A: claim-restricting rules and fixed text only, with no cultural content, no AI verdict and no culture score. The ladder, phrase list and counterpart list are team designs awaiting paid Indigenous review; N3 and N4 are self-declared. The contact guard shows only the generic rule until a person verifies names, clauses and dates.',
    packet: 'P07' },
  { id: 'built.model', name: 'Your model: upload & provenance', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'What did your uploaded Rhino model bring in (towers, storeys, program, core, site, context), where did each piece come from, and what was left out?', jury: ['design_excellence_20'],
    human: 'Mapping layers to roles, and confirming units, north and the zero level: the tool guesses from names and user strings, people decide.',
    limits: 'Curved Breps need render meshes saved with the file; context buildings are extruded footprints (flat roofs); the competition rules keep the site given in the brief, so an uploaded lot line is compared, not substituted.',
    packet: 'P14' },
  { id: 'built.provenance', name: 'AI use & provenance log', category: 'CULT', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'For every board element: who or what made it, what a person decided, which sources it rests on, and how is AI use labelled?', jury: ['design_excellence_20'],
    human: 'Whether AI use is appropriate for each element, what each person contributed, accountability for every statement and the authorship claim.',
    limits: 'Declared, not detected: the log records what the team enters. IPTC terms per level are the team mapping. Stripping identity from exported PDFs and images is the board export check (backlog item 5); private-mode hosting is roadmap.',
    packet: 'P07' },
  { id: 'built.mobility', name: 'Parking, loading & bikes', category: 'MOBI', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Does the scheme stay within the downtown parking maximum and provide the accessible, loading, passenger and bicycle spaces the Parking By-law asks for, with servicing off the retail street?', jury: ['urban_integration_10', 'human_scale_40'],
    human: 'How much parking to supply when none is required, whether to argue a relaxation, reading ambiguous clauses, and trading dock and ramp area against active frontage.',
    limits: 'The Parking By-law sections could not be opened (HTTP 403 to automated reading, not bypassed): rates are search extracts (unverified), ranges where secondary sources disagree, or unresolved, and no by-law row can show a pass until two people have checked its section. Truck arrivals and dwell have no sourced Vancouver rate. CD-1 or district rules can override; the brief calls its documents non-legal.',
    packet: 'P09' },
  { id: 'built.facade', name: 'Facade: glazing & bird safety', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How much of each facade is glass, facing which way from true north, and is the glass near the ground safe for birds, with view and solar-gain lines in reach?', jury: ['design_excellence_20', 'human_scale_40'],
    human: 'The facade system and its expression, where to trade daylight and views against solar gain and embodied carbon, the bird-safety tier to aim for, and night lighting.',
    limits: 'Geometry only: energy (TEUI, TEDI, GHGI) is the energy node. WWR, VLT and SHGC lines are US or legacy VBBL 2019 reference values shown without a badge; VBBL 2025, the City bird guidelines and CSA A460 were not opened, so the UBC tiers stand in as a proxy. System presets are team assumptions. Wind, drift, fire containment, condensation, rainscreen and access are listed, not computed.',
    packet: 'P12' },
  { id: 'built.interior', name: 'Interior & activity programme', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How many homes (by bedroom count) and hotel keys fit a typical floor, how deep are the office floors from facade to core, and what activities, capacity and hours do the public floors hold? The counts then drive lifts, egress and economics.', jury: ['human_scale_40', 'design_excellence_20'],
    human: 'The unit mix and sizes, hotel brand standards, the workplace strategy, and how public and amenity floors are actually used across the day and year.',
    limits: 'Rectangular plates with a central core; units and keys are laid in four bands between a corridor ring and the facade. Presets are team assumptions; design densities (PNNL) are US prototype values, kept away from lift and egress sizing. The housing mix rule is recalled, not opened.',
    packet: 'P12' },
  { id: 'built.daylight-depth', name: 'Daylight screen (plate depth)', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which parts of each use’s typical floor lie beyond practical daylight reach of the facade, given the window head height, before any simulation is run?', jury: ['design_excellence_20', 'human_scale_40'],
    human: 'Where to put cores, services and non-daylit programme; acceptable depth for offices versus bedrooms; light wells, atria or double-height floors; occupant wellbeing beyond the metric.',
    limits: 'Geometric proxy (research P02-M06): rectangular plate, central core, glass on all four sides. Ignores glazing, neighbours, blinds and climate. The reach factor (2 × head) and the share tiers are team assumptions; the 1 × / 2 × zones and the limiting-depth formula are recalled, not opened. No use-specific depth rule in the research (unresolved).',
    packet: 'P02' },
  { id: 'built.view-from', name: 'View from here', category: 'SITE', phase: 'basic', priority: 'v1', status: 'built', projects: ['city'],
    question: 'What does a person see from this roof, street corner or floor of the design: do the North Shore mountains clear the skyline, and which protected views does the sightline cross?', jury: ['cultural_context_30', 'human_scale_40'],
    human: 'Which viewpoints matter to whom (neighbours, the public, the residents of the tower itself), and how much loss of a mountain view is acceptable.',
    limits: 'Buildings come from the model shown. By default that is Vista’s OpenStreetMap model (61,402 buildings), each at its best height: City LiDAR 2022 or 2009 where they cover it (40% of parts), else OpenStreetMap tags, floor counts or estimates per building type (unverified; Vista’s own heights are within 10% of LiDAR for only 273 of 510 parts over 60 m), so a sightline can be blocked or cleared wrongly where no survey covers a building. The City model (LiDAR 2022 in the core, 2009 heights around it) is one switch away for comparison; there, buildings without a measured height can neither host a viewpoint nor block a view, so visibility is optimistic. Trees and bridges are not modelled. Eye height 1.6 m and the 200 m mountain line are presets; curvature with refraction k = 0.13 (research C02). The 360° strip is eight 45° frames, not a cylindrical panorama.',
    packet: 'C04' },
  { id: 'built.vista', name: 'Vista view studies', category: 'SITE', phase: 'basic', priority: 'v1', status: 'built', projects: ['city'],
    question: 'Where is the site and how does the design sit in each protected view (Ruijie Liu\'s Vista tool, rebuilt on Real Vancouver): find an address, type a coordinate, draw the site or take it from buildings, parcels or GeoJSON, the parcels and area under it, exact plan overlap and an exact triangle check against each estimated cone surface, the view from each City origin against the real North Shore mountains, which nearby roofs see the tower, the team\'s own what-if lower boundaries, and a PDF view study?', jury: ['cultural_context_30', 'design_excellence_20'],
    human: 'Whether entering a view is acceptable or even an improvement to the skyline, which views and roofs matter, what numbers to try as what-if planes, and what to show the jury. The City View Cone Assessment governs.',
    limits: 'Same estimates as the View-cone height check (8 of 24 views have a slope); exact clipping only sharpens the plan overlap and the governing corner. What-if planes are the team\'s own and never a City limit. Renders and roof sightlines are optimistic where buildings have no LiDAR height. Vista coordinates are converted from its legacy frame (0.58% short north–south, a false assumption corrected). Address search is online only and sends typed text to the BC Address Geocoder. Parcels are a dated City snapshot, joined only along exactly shared lot lines; a study site is not a legal boundary.',
    packet: 'C04' },
  { id: 'built.heights', name: 'Height references & suggestion', category: 'SITE', phase: 'basic', priority: 'v1', status: 'built', projects: ['city'],
    question: 'How tall can the tower be here (Ruijie Liu\'s Vista height model, rebuilt on Real Vancouver): the basic zoning height of every district the site overlaps, every view cone over each block (City-sourced estimates for 8 cones, Vista study surfaces for the other 16), and the lowest of them as a suggestion that names what controls it, with Vista\'s stacked-block Adjust; and Imagine Vancouver: every Vista building under Existing, Height references and With view cones?', jury: ['cultural_context_30', 'urban_integration_10'],
    human: 'Whether to stay under the suggestion, argue for a discretionary height, or take the CD-1 rezoning route; which view-cone study surfaces the team accepts as a working assumption; what a DD or CD-1 site may really reach. The City\'s by-laws and View Cone Assessment govern.',
    limits: 'Zoning numbers are Vista\'s transcriptions of 28 basic district-schedule heights (by-law cited, not opened by the team: unverified); DD, CD-1 and 57 other districts have no number, so most downtown towers get a partial, cones-only answer. Use, grade, setbacks, sloping envelopes, floor area, heritage and discretionary rules are not resolved. The 16 study surfaces are Vista\'s Imagine default (eye on the terrain at the origin + 1.6 m to 120 m at a fixed downtown reference): a team assumption, not a City ceiling; the modelled eye is 4.8 m under the City\'s viewpoint at Queen Elizabeth Park and 12.7 m under the Cambie Bridge deck. Zoning and parcels are a 2026-10-27 snapshot, not surveyed boundaries.',
    packet: 'C04' },
  { id: 'built.pr-streetwall', name: 'Streetwall & tower form', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc'],
    question: 'Do the podium height, tower step-back, floorplate and separation give each street a room of comfortable proportion and keep sky at the sidewalk?', jury: ['human_scale_40', 'design_excellence_20'],
    human: 'Perceived enclosure and scale, rhythm and proportion of the base, the response to neighbours, and any justified departure from the guideline bands (the jury may reward one).',
    limits: 'Draft City-wide Design and Development Guidelines (final text not yet posted); the guidelines are discretionary. Box massing shows no articulation; sky view and eye-level views are not computed yet.',
    packet: 'P06' },
  { id: 'built.pr-frontage', name: 'Active frontage', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc'],
    question: 'How much of each street frontage is active, fine-grained and sheltered, and does servicing stay off the main streets?', jury: ['human_scale_40', 'urban_integration_10'],
    human: 'Whether a use is genuinely active (tenant, hours, display), edge character and materials at touch distance, lighting at night, and whether a civic anchor with a long frontage is a justified breach.',
    limits: 'Layer 0 has no openings, so active share, entrances, canopies and driveways are entered per street; activity is inferred from inputs, not occupancy. Glazing, active depth and night-time activation are not checked yet.',
    packet: 'P06' },
  { id: 'built.pr-ground', name: 'Open space & links', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc'],
    question: 'Is there enough contiguous public open space, a transit plaza, and a direct public route through the block to the station?', jury: ['human_scale_40', 'urban_integration_10'],
    human: 'Programming and stewardship, who the space feels welcome to, place-making with Musqueam, Squamish and Tsleil-Waututh, and negotiation with TransLink and the neighbouring site for the station entrance.',
    limits: 'Open space is the unbuilt site at a public share you set; sun on the space, shadow on protected parks and wind are not assessed here (solar access and CLIM nodes). Route directness and block-length presets have no source.',
    packet: 'P06' },
  { id: 'built.city-in-nature', name: 'City in Nature ledger', category: 'ECOL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which City in Nature claims rest on binding rules, and which on targets, guidelines, comparators or team assumptions: canopy, cover, habitat, rainwater, bird-safe glass and protected views?', jury: ['cultural_context_30', 'urban_integration_10'],
    human: 'Whether the scheme achieves City in Nature is a cultural and design judgment: reconciliation, Stanley Park, water and mountains, whether entering the QE Park view improves the skyline, and whether a justified breach deserves reward. The ledger never turns this into a score.',
    limits: 'An evidence ledger, not a score. Canopy, cover, retention, glazing and habitat values are entered by you until modules P05-M02 to M08 compute them. Site type (R019) and some lines are team assumptions; Toronto and UBC figures are comparators. Views come from the view-cone node in Real Vancouver only.',
    packet: 'P05' },
  { id: 'built.solar-access', name: 'Solar access & sun hours', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'Does the design cast new shadow on protected public spaces between 10 am and 4 pm PT on 22 September (Downtown Peninsula Solar Access Guidelines), and how many hours of sun does the ground around it keep?', jury: ['human_scale_40', 'urban_integration_10'],
    human: 'How each space is classed when it is not in Table 1, whether to seek an exception (3.1.2: public benefit, rationale statement, Detailed study) or argue a justified breach, and the City\'s confirmation of the cenotaph clock and of any tolerance.',
    limits: 'Guideline read by an AI agent on 22 Oct 2026 (July 2026 text); not yet checked by a team member. Flat ground, no topography; trees excluded as s.5 asks. The VTC block is hypothetical, so Table-1 spaces cannot be placed; Real Vancouver has no context buildings or park polygons yet. Victory Square cenotaph rule (11 Nov) and the solar envelope are not run.',
    packet: 'P02' },
  { id: 'built.wind-procedure', name: 'Wind procedure (slenderness)', category: 'STRC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How slender is each tower, and which NBC 2020 wind procedure does that force: Dynamic, or the mandatory Wind Tunnel Procedure?', jury: ['design_excellence_20'],
    human: 'Whether neighbouring towers cause buffeting, whether top storeys count as occupied, and the final wind procedure, which the wind engineer and the tunnel test set.',
    limits: 'Classification only: no loads, drifts or accelerations. Rectangular plates; effective width is height-weighted (podium included), minimum over directions. Research packet P10 had two critique rounds and no final gate. The 180 m tunnel default is a team assumption.',
    packet: 'P10' },
  { id: 'built.structure', name: 'Structure: system & seismic', category: 'STRC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which lateral systems survive this height at Vancouver’s Seismic Category SC4, does the core run unbroken to the foundation, is the stack regular, and where do outrigger floors go?', jury: ['design_excellence_20'],
    human: 'Choosing and defending the structural system is an engineering and design judgment with the engineer of record: intent, constructability, risk and the alternative-solution strategy. The tool filters and flags; it never picks one best.',
    limits: 'Screening only: no member sizing or design values. Downtown hazard at site class X450 (assumed), normal importance. Floor area stands in for storey weight. Outrigger effectiveness, shortening and construction sequence are not modelled. Research packet P10 had two critique rounds and no final gate.',
    packet: 'P10' },
  { id: 'built.wind-study', name: 'Pedestrian wind: study trigger', category: 'CLIM', phase: 'basic', priority: 'core', status: 'preview', projects: ['vtc', 'city'],
    question: 'Will this massing need a formal pedestrian wind study, judged by the rules of cities that publish one (Toronto, Hamilton, City of London), and what can be said before any simulation?', jury: ['human_scale_40'],
    human: 'Whether a wind study is needed in Vancouver, which criteria to use, and how to shape the tower and podium in response: with a wind engineer. Comfort at the street is a human-scale judgment.',
    limits: 'No comfort or safety map: no credible wind engine runs in a browser yet, and massing-stage CFD cannot reliably predict gusts. Triggers are other cities’ rules (analog, team assumption); no City of Vancouver numeric criteria were found.',
    packet: 'P03' },
  { id: 'built.wind-screen', name: 'Pedestrian wind: massing screen', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Where is this massing likely to bring strong winds down to the street or round its corners, from which directions, and does it need a wind-tunnel study?', jury: ['human_scale_40', 'design_excellence_20', 'urban_integration_10'],
    human: 'How much residual wind risk the scheme accepts against daylight, program, structure and placemaking, and how to reshape tower, podium and canopies: with a wind engineer and a wind-tunnel test.',
    limits: 'Screening, not CFD: rules rank risk and predict no speeds or comfort classes. Directions from the airport record (ECCC Vancouver Intl A 2016–2025, no exposure transfer, 10 of the 30 years the analog guides ask for). Cut-offs and zone sizes are team assumptions; triggers and criteria are other cities’ rules (no City of Vancouver numeric criteria found).',
    packet: 'P03' },
  { id: 'built.trips', name: 'Trips & station entrance', category: 'MOBI', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How many people arrive and leave in the morning peak hour, by train, car and other modes, and can the below-grade link to the station carry them with the station’s own riders?', jury: ['urban_integration_10', 'human_scale_40'],
    human: 'The station owner’s entrance share and design, travel-demand measures, and the egress design of the link: with TransLink, the City and the code consultant.',
    limits: 'Peak-hour shares and trip rates are unsourced presets; the mode split for trips into the tower is the 2008 Trip Diary row for trips ending downtown (residents only, coarse, dated) and the residents’ split is an unsourced scenario. The station check is tier 0: comfort only, unverified walkway scale, no egress (NFPA 130 unread); the neighbouring station is hypothetical, so a real station is a proxy.',
    packet: 'P09' },
  { id: 'built.energy-carbon', name: 'Energy & carbon', category: 'ENER', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which TEUI, TEDI and GHGI limits does this program mix face under the Higher Buildings Policy and VBBL Part 10, does the heating strategy fit them, how much embodied carbon does the structure carry against the VBBL limit, and where is PV worth placing?', jury: ['design_excellence_20'],
    human: 'Passive House or targets plus a Low Carbon Energy System; which system the City recognises as an LCES; the structural material strategy; whether PV is worth its own embodied carbon on BC’s low-carbon grid; confirming all of it with an energy modeller and an LCA practitioner.',
    limits: 'Screening, not compliance. Limits are as read in research P04 r2 (two critique rounds, no final gate). The energy estimate uses team end-use presets, not an EMG v3.0 model; embodied carbon uses team bands from a 30-storey archetype; PV uses a clear-sky model with approximate sunshine (no weather file) scaled to Canadian averages.',
    packet: 'P04' },
]

export const DEFAULT_ON = BUILT_NODES.filter((n) => !n.defaultOff).map((n) => n.id)

const researched: NodeDef[] = (research as unknown as NodeDef[] & { id: string }[]).map((m: any) => ({
  id: m.id,
  name: m.name,
  category: (Object.keys(CATEGORIES).includes(m.category) ? m.category : 'DATA') as Category,
  phase: m.phase,
  priority: m.priority,
  status: 'researched' as NodeStatus,
  question: m.question,
  jury: m.jury ?? [],
  method: m.method,
  human: m.human,
  limits: m.limits,
  metrics: m.metrics,
  viz: m.viz,
  libs: m.libs,
  packet: m.packet,
  research: m.research,
}))

export const ALL_NODES: NodeDef[] = [...BUILT_NODES, ...researched]
export const nodeById = (id: string | null) => ALL_NODES.find((n) => n.id === id) ?? null

export const JURY_LABEL: Record<string, string> = {
  human_scale_40: 'Human scale 40%',
  cultural_context_30: 'Cultural context 30%',
  design_excellence_20: 'Design excellence 20%',
  urban_integration_10: 'Urban integration 10%',
}

export const WORKFLOWS: { id: string; name: string; nodes: string[] }[] = [
  { id: 'wf.vtc', name: 'VTC rules check', nodes: ['built.vtc-rules', 'built.fsr', 'built.sun'] },
  { id: 'wf.views', name: 'View-cone study', nodes: ['built.viewcones', 'built.fsr'] },
  { id: 'wf.public', name: 'Public realm (40%)', nodes: ['built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', 'built.vtc-rules'] },
  { id: 'wf.all', name: 'Everything built', nodes: BUILT_NODES.map((n) => n.id) },
]
