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
  /**
   * How far the method can be trusted (node contract, 21 Nov): A = a deterministic code or geometry check with a read
   * source; B = a sourced empirical rule of thumb (analogue or industry); C = an early-stage proxy that degrades on
   * complex geometry.
   */
  confidence?: NodeConfidence
  /** One plain sentence: when the method stops being reliable (e.g. twisted or porous forms, a non-Canadian code basis). */
  boundary?: string
}

export type NodeConfidence = 'A' | 'B' | 'C'
export const CONFIDENCE_LABEL: Record<NodeConfidence, string> = {
  A: 'A · code or geometry check with a read source',
  B: 'B · sourced rule of thumb (analogue or industry)',
  C: 'C · early-stage proxy; weaker on complex geometry',
}

/** Every built node, the parts of merged tools included (see MERGES below). */
export const ALL_BUILT_NODES: NodeDef[] = [
  { id: 'built.vtc-rules', name: 'VTC hard rules', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc'],
    question: 'Does the massing meet the competition rules: height band, 9.0 non-residential FSR, block, transit link?', jury: ['urban_integration_10'],
    human: 'Interpreting the brief where it is ambiguous (height measure, which uses count toward 9.0 FSR). Ask Buildner before 3 Nov.', packet: 'P01' },
  { id: 'built.fsr', name: 'Program & FSR accounting', category: 'PROG', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How much floor area does each use get, and what FSR results?', jury: ['design_excellence_20'],
    human: 'The program mix itself is a design decision.', packet: 'P01' },
  { id: 'built.viewcones', name: 'View-cone height check', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How high may a tower rise at this location under each protected public view, and does the design exceed the estimate?', jury: ['cultural_context_30', 'design_excellence_20'],
    human: 'Higher Buildings and Exceptional Downtown Site relaxations, minor elements, hardship (PVG 3.1.2–3.1.5, 3.4) and the final word: the City View Cone Assessment.', packet: 'C01' },
  { id: 'built.separation', name: 'Tower separation', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Are the parts of the tower above 21.4 m (70 ft) at least 24.4 m (80 ft) from other towers, proposed and existing?', jury: ['urban_integration_10', 'human_scale_40'],
    human: 'Whether a closer tower is acceptable on this site (privacy, overlook, light) and which neighbour counts as a tower: the City decides at rezoning.',
    limits: 'Downtown South Guidelines 4.2.4 (residential towers), read 17 Nov 2026 and used elsewhere as a benchmark; plan distance between parts above 21.4 m; existing buildings from the context model, any over 21.4 m counted as a tower.' },
  { id: 'built.floorplate', name: 'Tower floor plate', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Is the residential floor plate above 21.4 m at most 604 m² (6,500 sq ft) gross, and the tower at most 27.4 m (90 ft) wide or deep?', jury: ['urban_integration_10', 'design_excellence_20'],
    human: 'A larger plate for a better massing response (the guideline allows it) and the limits on a specific site: the City decides; its June 2025 Residential Tower Floor Plates bulletin sets context-specific benchmarks.',
    limits: 'Downtown South Guidelines 4.1.3 (residential towers), read 17 Nov 2026; office floors are reported, not capped; the 2025 bulletin was not opened.' },
  { id: 'built.relax-aviation', name: 'Relaxations & aviation', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    // Book node #1 "HBP area" (21 Nov): the Higher Buildings area and ceiling joined this node as a fix (NODE_LIST §3 row 1).
    confidence: 'A',
    boundary: 'The policy area outline and the Figure 1 ceilings are read from low-resolution figures, so a footprint within a few metres of the area edge or a top near a ceiling needs the City’s map, as does any aviation surface beyond the published CAR heights.',
    question: 'Does the tower stand inside a Higher Buildings area and under its ceiling, where could the Higher Buildings Policy or an Exceptional Downtown Site let it enter a protected view, which views still bind, and which federal aviation obligations does a 244–305 m tower trigger?', jury: ['urban_integration_10', 'cultural_context_30'],
    human: 'Whether a site qualifies for a relaxation and how a rezoning argues it (above every ceiling, the 2.1(a) skyline case): the City decides. Which Figure 1 ceiling applies to each part: a person checks it with Figure 1 open. Aviation: contact Transport Canada and NAV CANADA for any real site; they set what a tower may do.',
    limits: 'Screening, not a determination. Higher Buildings area: the footprint against the City’s May 2026 exhibit map of the policy area, digitized (10–40 m bands), not yet checked against the policy’s Figure 1: unverified; membership is not approval. Ceilings 600 / 550 / 500 ft and the identified sites come from a visual read of Figure 1’s low-resolution legend (HBP p.5) with a provisional part mapping: unverified; the rule text (2.1(b)–(d)) is verified. The competition site is an assumed site with no real policy area (read as a CBD site). The route enters QE View 3 only inside the CBD outline. Relaxation masks are per cone and switched on by you, never automatic; other approved corridors are not digitised. Aerodrome positions are secondary transcriptions; VFR routes and NAV CANADA surfaces are not available, so those items stay unresolved (research C01-M06 r2).',
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
    // Node contract (21 Nov): the loads and widths are table lookups (A); the second-storey 3.7 is a B value (an NBC
    // 2010 analogue) and the smoke-path separation a code-consultant reading, both marked on their lines.
    confidence: 'A',
    boundary: 'Holds for rectangular plates with a central core under the Canadian code tables; travel and exit separation are straight-line or core-perimeter proxies that stop holding on free-form, twisted or imported plates, and the smoke-path separation is a code-consultant reading.',
    limits: 'VBBL 2019 Part 3 values (equal to VBBL 2007); VBBL 2025 unread. Amenity, lounge, civic and tenant sky-lobby floors at the lounge row of BCBC 2024 Table 3.1.17.1, 1.85 m² per person (p.3-105; P1 #12, was 4.6); a second storey of shops on a walkway or the concourse at 3.7 when declared (Allen & Iano p.305, an NBC 2010 reading, unverified). Travel distance is a straight-line proxy, not a path on the plan; exit separation is read twice: straight between stair centres, and along the smoke path round the fire-separated core, door to door the shorter way (BCBC 2024 3.4.2.3(3) and Note A-3.4.2.3.(1), pp.3-233, 3-381; P1 #11), a code-consultant reading flagged unverified, with the doors on opposite core faces unless stairDoorFaces says otherwise. Stair geometry and placement are team assumptions; evacuation time is roadmap (P11-M08).',
    packet: 'P11' },
  { id: 'built.life-safety', name: 'Code & life safety', category: 'SYST', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which high-building and life-safety requirements does this tower trigger, can people reach every floor step-free, how much services space does each use need (services space by use), how far is every floor from plant, and how big an emergency generator does it need?', jury: ['design_excellence_20', 'human_scale_40'],
    human: 'Occupancy classification, clause interpretation and any alternative solution: the code consultant, fire engineer and Chief Building Official. Where plant sits against public floors and the skyline, louvre expression, and generator and pressure-zone sizing: with the MEP and electrical engineers. Universal design beyond code and lived-experience review of the routes.',
    limits: 'An early checklist, not code certification. Clauses read in VBBL 2019 (Part 3 to 1 Jul 2024; Section 3.8 to 7 Mar 2023); VBBL 2025 unread, so every clause is unverified. Occupancy is mapped from the program bands. Services space by use (P1 node #14, built.services-space): shafts 4% of an all-air office floor and 2% otherwise, pipe shafts for homes, electrical and telecom rooms, fan-room reach (pass to 13 storeys, check to 25) and the core share (20–25%) are Allen & Iano rules of thumb (pp.50, 185, 192–194) on an NBC 2010 / IBC 2009 base: unverified analogues. Washrooms, risers, hydronic breaks and generator loads stay team presets; washroom counts, base plant and louvres are not computed; smoke movement and recall times are not computed (P11-M08, P11-M02).',
    packet: 'P11',
    confidence: 'B',
    boundary: 'Its services space, plant reach and core share are US rules of thumb on an NBC 2010 / IBC 2009 base for the typical floors of a regular tower, so they stop being reliable for imported or free-form storeys and for all-water, in-suite, mixed-mode or district systems, and the clause checklist reads VBBL 2019 with VBBL 2025 unread.' },
  { id: 'built.sky-room', name: 'Public sky room', category: 'PUBL', phase: 'advanced', priority: 'v1', status: 'built', projects: ['vtc', 'city'],
    question: 'Does the tower give a free public room at height that people can reach step-free, without crowding tenant lifts or the exit stairs, and which Higher Buildings Policy 2.1(g) community benefit does the team declare?', jury: ['human_scale_40', 'cultural_context_30', 'urban_integration_10'],
    human: 'What the room is for and who runs it, free versus ticketed, opening hours, programming with community partners, and whether visitors and tenants share a lobby; which community benefit to offer and whether the City accepts it at rezoning.',
    // P1 #2 (21 Nov, built.hbp-benefit): re-sourced from the 1997 platform text to the 2026 policy, 2.1(f) and 2.1(g).
    confidence: 'A',
    boundary: 'Records the team\'s declarations against the 2026 policy text; it cannot judge whether a benefit is significant enough or accepted, which the City settles at rezoning, and it has no heritage register to check a declaration against.',
    limits: 'The 2026 Higher Buildings Policy (pp.3–4) has no deck clause: a public room counts as a 2.1(g) community benefit (cultural or social facility, heritage retention, low-cost housing or a density transfer), declared by the team, and 2.1(f) bars demolishing a Class A heritage building (declared). The visible public give-back rests on public engagement (Dobson p.91, unverified). Area, hours, visitor and lift criteria are team presets. Terrace wind comfort is roadmap (P03-M08).',
    packet: 'P06' },
  { id: 'built.economics', name: 'Program value & land residual', category: 'PROG', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'What is each floor worth, what does it cost to build and to pay the City and region, and what is left for land after profit and the CAC?', jury: ['design_excellence_20', 'urban_integration_10'],
    human: 'Which market evidence, cap rates, tenure and finance terms to defend; the land benchmark; whether a floor that loses money is a justified public benefit.',
    limits: 'Indicative early-design estimate (the Program Value Visualizer method, its Vancouver 2026 pack), not a feasibility study, appraisal or compliance check. Values are per m² of gross area from dated market sources, most grade C; costs are Altus midpoints; no lease-up, S-curve finance, presale depth or sensitivity yet (P08-M01 v1, P08-M08). Beside the residual and never in it (developer lens, 21 Nov): the office stack against KPF’s plausible office tower on a Vancouver lot, about 198 m and 76,600 m² (KPF pp.6–8; Dobson pp.66, 72), and KPF’s cost band against height relative to 300 ft (800 ft 1.7–2.1×, 900 ft 2.1–3.0×, 1,000 ft and over 1.5–4.1×; pp.27–28, a correlation KPF calls poor), both reported lines, unverified.',
    // Node contract (21 Nov, developer lens): sourced market and cost rules of thumb (B).
    confidence: 'B',
    boundary: 'An indicative residual from dated Vancouver market values and cost guides for typical office, residential, hotel and retail floors: unusual structure or forms, heights past the cost guides’ storey bands and KPF’s test fits (1,000 ft), and any real purchase need a cost consultant and an appraisal.',
    packet: 'P08' },
  { id: 'built.culture-claims', name: 'Engagement & claims guard', category: 'CULT', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'What can this entry truthfully say about engagement with each Nation, whom must the team not contact, and is the team eligible?', jury: ['cultural_context_30'],
    human: 'Whether and how to contact anyone, whether a declared status is true, eligibility, and checking the Terms, jury page and dates in a browser. Only people can engage the Nations; the tool never does.',
    limits: 'Stage A: claim-restricting rules and fixed text only, with no cultural content, no AI verdict and no culture score. The ladder, phrase list and counterpart list are team designs awaiting paid Indigenous review; N3 and N4 are self-declared. The contact guard shows only the generic rule until a person verifies names, clauses and dates. Since 21 Nov the lint also reads "Salish" (against all three Nations), no longer counts "United Nations", and checks motif wording (inspired by, evokes, echoes, draws on, homage) in every sentence about a Nation, a language, a cultural practice or form and ornament: it needs N4 for each Nation it touches and a person’s read (Placemaking pp.87–89, 110–111, read as a warning).',
    confidence: 'A',
    boundary: 'A phrase check on English wording only: it cannot tell whether a form borrows a motif, so borrowed motifs, paraphrases and images still need a person’s read, and Nation-language names wait for the stage B registry.',
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
  { id: 'built.sw-shadow', name: 'Shadow study', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How much ground and plaza gets new shadow from the towers on the study day or season, and how long is the open site in the sun?', jury: ['human_scale_40', 'urban_integration_10'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Ground on a 2 m grid; context buildings as prisms; trees not counted.' },
  { id: 'built.sw-sun-faces', name: 'Sun on the faces', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How much sun does each face of the tower get over the year, and where is the sun at the hour studied?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Perez all-weather sky on each block face; beam shaded by the towers\' own blocks, neighbours not counted.' },
  { id: 'built.sw-pv', name: 'Photovoltaics', category: 'ENER', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How much electricity could PV on the roof and on the PV spandrels of the façade make in a year, and what share of the building\'s use is that?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Annual yield from the hourly irradiance per face and roof with module efficiency and performance ratio; no shading by neighbours.' },
  { id: 'built.sw-wind-comfort', name: 'Pedestrian wind comfort', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'Is the ground around the towers calm enough to sit, stand and walk (Lawson), and how much do the towers change it?', jury: ['human_scale_40', 'urban_integration_10'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Lattice-Boltzmann flow on a 4 m grid per wind sector, weighted by the airport record; screening, not a wind tunnel test.' },
  { id: 'built.sw-wind-height', name: 'Wind on terraces and roofs', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How windy are the terraces and roofs at their height, in Lawson bands, and where does wind come down the face to the street?', jury: ['human_scale_40', 'urban_integration_10'],
    limits: 'Every roof, setback terrace and open storey read from the storey outlines (research R5 §1). CWEC 2020 Vancouver Intl hourly wind carried to each deck by the NBC 2020 exposure factor by sector; local factors by deck type and edge facing, screens and neighbours are team screening values; classes per season by City of London 2019 (5% exceedance) or Toronto 2022. A deck within one class of its target needs a wind tunnel or CFD study. Downwash and the wind-with-height chart: Sun & Wind Studio (Sinnie Choi).' },
  { id: 'built.sw-rain-faces', name: 'Wind-driven rain on the faces', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'Which faces are most exposed to wind-driven rain (ISO 15927-3), and from which direction does the rain come?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Airfield index from the hourly rain and wind, wall factor by height; neighbours\' shelter not applied.' },
  { id: 'built.sw-rain-water', name: 'Rainwater and shelter', category: 'ECOL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How much rain can the roofs and terraces collect in a year, and how much ground do the towers keep dry in a design storm?', jury: ['human_scale_40', 'urban_integration_10'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Run-off efficiency 80% by default; storm from the 95th-percentile rain wind.' },
  { id: 'built.sw-form', name: 'Form efficiency', category: 'ENER', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How compact is the form: envelope per floor area and heat lost by the form against a square shaft of the same height and volume?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Geometry only: setbacks, steps and terraces count as envelope.' },
  { id: 'built.sw-glazing', name: 'Façade glazing', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'What is the window-to-wall ratio, how much solar heat comes through the glass of each façade zone, and how many hours of low-sun glare does each get?', jury: ['design_excellence_20', 'human_scale_40'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Solar heat with each zone\'s SHGC and device; glare where the sun is low in front of the face and passes the device.' },
  { id: 'built.sw-daylight', name: 'Daylight: sDA and ASE (LEED)', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'What share of each floor reaches 300 lux from daylight for half the occupied hours (sDA, LEED v4.1), and how much gets too much direct sun (ASE)?', jury: ['design_excellence_20', 'human_scale_40'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Sixteen sight lines per sensor to the glass, Perez sky per face, split-flux reflections, LM-83 occupied hours; plates without partitions.' },
  { id: 'built.sw-light-hour', name: 'Light at this hour', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How much light falls on the floor at the hour chosen, from sky, sun patch and reflections, and do the blinds come down?', jury: ['design_excellence_20', 'human_scale_40'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. One hour of the typical year; sun patch through each zone\'s opening and device.' },
  { id: 'built.sw-natvent', name: 'Natural ventilation', category: 'SYST', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'Do the openable windows meet ASHRAE 62.1 (4% of floor, everyone within 8 m), and for how many hours can opening them keep the floor comfortable?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Openings from each zone\'s operable setting; comfort band fixed or ASHRAE 55 adaptive; wind at floor height by power law.' },
  { id: 'built.sw-airflow', name: 'Air flow inside', category: 'SYST', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'Where does air move across the floor when the windows are open, and which parts stay still?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Pressure network on a 1 m grid with wind pressure coefficients on each face; no partitions.' },
  { id: 'built.sw-energy', name: 'Energy use intensity', category: 'ENER', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'What are the TEUI, TEDI and GHGI of the tower against the Vancouver rezoning targets, and where is the heat lost?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. ISO 13790 5R1C hourly model per use with the façade zones\' glazing; screening, not an energy model for compliance.' },
  { id: 'built.sw-indoor-temp', name: 'Indoor temperature', category: 'ENER', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'How warm does each part of the floor get hour by hour, and how many hours does it overheat?', jury: ['design_excellence_20'],
    limits: 'Ported from Sun & Wind Studio (Sinnie Choi), CWEC 2020 Vancouver Intl hourly year. Five-metre perimeter zones per face and an interior zone, each a 5R1C model, with the chosen system.' },
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
  // P1 #8 (21 Nov, book notes): no check read a spec's storey height; A, B and C ran 4.0 m in places.
  { id: 'built.f2f-use', name: 'Storey height by use', category: 'PROG', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How tall is each use’s storey against a typical one, how much tower height does the difference spend, and what daylight depth does that height buy?', jury: ['design_excellence_20'],
    human: 'Whether a tall storey is worth its height: ceiling height, daylight, services, the sales story and the height cap are traded by the team, not by a threshold.',
    limits: 'Typical storeys: residential about 3.05 m (KPF test fits read second-hand in the City’s Vertical Studio deck, p.73); hotel 3.3 m and office 3.9 m (the Toolkit generator’s presets, corroborated by Allen & Iano’s floor sandwich, pp.206, 208): unverified. Pass within typical + 0.4 m (team). The daylight depth beside it is the daylight rule’s 2.5 × (head − 0.76 m) (Allen & Iano p.151) with the team head drop. Podium storeys, sky lobbies and other uses are not read.',
    confidence: 'B', boundary: 'Typical downtown residential, hotel and office storeys: double-height, plant, amenity or civic storeys and non-Vancouver typologies sit outside the typical values.' },
  // Book node #18 (21 Nov, Ecocity in the Sky note §6): vertical-public passed on any one public level; spacing went unread.
  { id: 'built.sky-villages', name: 'Green and shared levels up the tower', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How far apart, in storeys, are the tower’s planted levels and its shared levels from grade to the roof, and how many homes share each shared level?', jury: ['human_scale_40', 'cultural_context_30'],
    human: 'Whether a stretch with no garden or shared room matters: who lives there, how the lifts group them, what the shared rooms hold and who looks after the planting are the team’s and the community’s call, not a spacing number.',
    limits: 'Planted levels: decks declared planted (deck use), open garden storeys of an imported tower, winter gardens (a part of a storey in use none), declared planters and greenwall bands; grade starts the count. Shared levels: the podium, civic and amenity floors, sky lobbies with the interior’s shared rooms, the public sky room and its public stops. Gaps are level differences, with metres. Precedent band about 10 storeys typical and about 25 at most (Park, Designing the Ecocity-in-the-Sky, pp.49, 70–71, 151, 157: student schemes); VC-PE about 30 m and SkyVille about 80 homes per village (Al-Kodmany, Placemaking with Tall Buildings, pp.139, 219): unverified. Pass up to 25 storeys, Check above (team reading of the precedent). Planting the model does not declare is not seen.',
    confidence: 'B', boundary: 'Towers up to about 100 storeys read storey by storey, against precedents that are unbuilt student schemes and a few Asian towers, not a code or a measured social outcome; planting or shared rooms the model does not declare are not seen.' },
  { id: 'built.daylight-depth', name: 'Daylight screen (plate depth)', category: 'SPAC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which parts of each use’s typical floor lie beyond practical daylight reach of the facade, given the window head height, before any simulation is run?', jury: ['design_excellence_20', 'human_scale_40'],
    human: 'Where to put cores, services and non-daylit programme; acceptable depth for offices versus bedrooms; light wells, atria or double-height floors; occupant wellbeing beyond the metric.',
    limits: 'Geometric proxy (research P02-M06): rectangular plate, central core, glass on all four sides. Ignores glazing, neighbours, blinds and climate. One sourced daylight rule (P1 #7, book notes 21 Nov) in place of the 1 × / 2 × head, 6 m and 3 × head rules: primary daylit zone within 6 m (Environmental performance pp.199, 229–230), about 1.5 × the clear height under overcast skies (p.204), full daylight depth 2.5 × (head − 0.76 m) (Allen & Iano p.151); the bands run from the strictest of the three to the most generous. The window head stands in for the ceiling (team). Garden or loggia decks count as an inner facade where the deck use says so, but the box plate does not draw them. Over-lit daylight (over 1,500 lux, EP p.198) is listed, not computed. The share tiers and the limiting-depth formula stay team or recalled.',
    confidence: 'C', boundary: 'A rectangular box plate with a central core and glass on four sides: twisted, tapered, drawn or imported plates need a daylight specialist or a simulation.',
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
  { id: 'built.pr-streetwall', name: 'Streetwall & tower form', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Do the podium height, tower step-back, floorplate and separation give each street a room of comfortable proportion and keep sky at the sidewalk?', jury: ['human_scale_40', 'design_excellence_20'],
    human: 'Perceived enclosure and scale, rhythm and proportion of the base, the response to neighbours, and any justified departure from the guideline bands (the jury may reward one).',
    confidence: 'A', boundary: 'Box massing read against the draft CDDG: articulated, free-form or imported towers, and Real Vancouver sites without typed streets, need an urban designer’s reading.',
    limits: 'Draft City-wide Design and Development Guidelines (final text not yet posted); the guidelines are discretionary. Slenderness reads the CDDG tip with KPF’s bands (P1 #9, unverified). Box massing shows no articulation; sky view and eye-level views are not computed yet. Real Vancouver: the tower rules only (floorplate, plan dimension, slenderness, separation between your towers, variation); the street rules need the study site’s street types and widths, not yet in the Toolkit.',
    packet: 'P06' },
  { id: 'built.pr-frontage', name: 'Active frontage', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How much of each street frontage is active, fine-grained and sheltered, and does servicing stay off the main streets?', jury: ['human_scale_40', 'urban_integration_10'],
    human: 'Whether a use is genuinely active (tenant, hours, display), edge character and materials at touch distance, lighting at night, and whether a civic anchor with a long frontage is a justified breach.',
    limits: 'Layer 0 has no openings, so active share, entrances, canopies and driveways are entered per street; activity is inferred from inputs, not occupancy. Glazing, active depth and night-time activation are not checked yet. Real Vancouver: the ground storey height only; the street lines need the site’s street types, not yet in the Toolkit.',
    packet: 'P06' },
  { id: 'built.pr-ground', name: 'Open space & links', category: 'PUBL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Is there enough contiguous public open space, a transit plaza, and a direct public route through the block to the station?', jury: ['human_scale_40', 'urban_integration_10'],
    human: 'Programming and stewardship, who the space feels welcome to, place-making with Musqueam, Squamish and Tsleil-Waututh, and negotiation with TransLink and the neighbouring site for the station entrance.',
    // P1 #3 (21 Nov, built.square-sun): the sun line reads the protected and base-map spaces; the design's own square has its own line.
    confidence: 'B',
    boundary: 'Open space is read on a raster of the site and the square as its largest clear rectangle; sun on the square is shadow screening on flat ground with the modelled context only, so reflected light, trees, canopies and buildings beyond the model are not counted.',
    limits: 'Open space is the unbuilt site at a public share you set; shadow on the protected and base-map open spaces comes from Solar access & sun hours, and so does the sun on this design\'s own square (its largest clear rectangle: the share with 2 h or more of sun on 22 Sep 10–16 and 21 Dec 11–14, described, not judged; Placemaking critique p.49, a team reading); wind from the pedestrian wind screen, when those are on. Route directness and block-length presets have no source. Real Vancouver: open space and POPS over the study site; the link, perimeter, transit plaza and station lines need the site’s streets and station, not yet in the Toolkit.',
    packet: 'P06' },
  { id: 'built.city-in-nature', name: 'Green claims check', category: 'ECOL', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which City in Nature claims rest on binding rules, and which on targets, guidelines, comparators or team assumptions: canopy, cover, habitat, rainwater, bird-safe glass and protected views?', jury: ['cultural_context_30', 'urban_integration_10'],
    human: 'Whether the scheme achieves City in Nature is a cultural and design judgment: reconciliation, Stanley Park, water and mountains, whether entering the QE Park view improves the skyline, and whether a justified breach deserves reward. The ledger never turns this into a score.',
    limits: 'An evidence ledger, not a score. Canopy, cover, retention, glazing and habitat values are entered by you until modules P05-M02 to M08 compute them. Site type (R019) and some lines are team assumptions; Toronto and UBC figures are comparators. Views come from the view-cone node in Real Vancouver only. The panel and the Sources hub read one input set (engine/cityInNature.ts natureArgs: the Facade node’s faces and treated share, the view cones, the deck soil, the model trees and planting at grade); where the hub is not given one of them, its line says so. Vegetated area ÷ site and ÷ GFA add planted decks, greenwall facade zones (face length × storey height × (1 − WWR)), declared planters (width × length on each storey) and planting at grade; planted area above grade is read against the footprint (Ecocity in the Sky pp.84–85) and per resident beside the book’s city-scale figures (Vancouver 23.46 m² per person, p.146; Seoul 6.0 and 16.0, p.100: context only). Ecocity in the Sky gives no green plot ratio, so these lines carry no threshold: any target is a team or precedent value (Placemaking pp.151–161 only as tropical analogues).',
    confidence: 'C',
    boundary: 'Typed figures and modelled areas from declared planted decks, greenwall zones, declared planters and typed grade planting, with no threshold for the green ratio; it undercounts planting that is not declared, and on twisted or free-form towers the planted-wall area needs a specialist.',
    packet: 'P05' },
  { id: 'built.solar-access', name: 'Solar access & sun hours', category: 'CLIM', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'], defaultOff: true,
    question: 'Does the design cast new shadow on protected public spaces between 10 am and 4 pm PT on 22 September (Downtown Peninsula Solar Access Guidelines), and how many hours of sun does the ground around it keep?', jury: ['human_scale_40', 'urban_integration_10'],
    human: 'How each space is classed when it is not in Table 1, whether to seek an exception (3.1.2: public benefit, rationale statement, Detailed study) or argue a justified breach, and the City\'s confirmation of the cenotaph clock and of any tolerance.',
    limits: 'Guideline read by an AI agent on 22 Oct 2026 (July 2026 text); not yet checked by a team member. Flat ground, no topography; trees excluded as s.5 asks. The VTC block is hypothetical, so Table-1 spaces cannot be placed; Real Vancouver has no context buildings or park polygons yet. Victory Square cenotaph rule (11 Nov) and the solar envelope are not run.',
    packet: 'P02' },
  { id: 'built.wind-procedure', name: 'Wind procedure (slenderness)', category: 'STRC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'How slender is each tower, and which NBC 2020 wind procedure does that force: Dynamic, or the mandatory Wind Tunnel Procedure?', jury: ['design_excellence_20'],
    human: 'Whether neighbouring towers cause buffeting, whether top storeys count as occupied, and the final wind procedure, which the wind engineer and the tunnel test set.',
    limits: 'Classification and screens: no loads or drifts; the across-wind acceleration at 46/H (both ends of its band) and at the modelled core alone (P1 #10, unverified). Rectangular plates; effective width is height-weighted (podium included), minimum over directions. Research packet P10 had two critique rounds and no final gate. The 180 m tunnel default is a team assumption. The slenderness band (P1 #9) is KPF’s, on the base width (pp.10–11, 29–34; Dobson pp.69, 72), with the seismic RC examples (≤ 6.0, RC seismic pp.291, 416) and Allen & Iano p.51 beside it: unverified.',
    confidence: 'B', boundary: 'Prismatic rectangular towers up to about 305 m: tapered, twisted, porous or stepped forms, and heights or slenderness beyond the KPF test fits and seismic RC examples, need the wind and structural engineers and a tunnel test.',
    packet: 'P10' },
  { id: 'built.structure', name: 'Structure: system & seismic', category: 'STRC', phase: 'advanced', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Which lateral systems survive this height at Vancouver’s Seismic Category SC4, does the core run unbroken to the foundation, is the stack regular, how far do the floors reach from the core and what slab does that take, and where do outrigger floors go?', jury: ['design_excellence_20'],
    human: 'Choosing and defending the structural system is an engineering and design judgment with the engineer of record: intent, constructability, risk and the alternative-solution strategy. The tool filters and flags; it never picks one best.',
    limits: 'Screening only: no member sizing or design values. Downtown hazard at site class X450 (assumed), normal importance. Storey weights from plate, slab, deck, facade and core walls (team presets). Floor reach (P1 #13): slab from each storey’s core-to-facade reach by rules of thumb (Ching p.8 flat plate to 9.1 m; Allen & Iano pp.118–119 post-tensioned L/40–45 to 14 m; read once, unverified); podium slabs keep the use presets. Core stiffness (P1 #10): core walls in bands (0.95 / 0.85 / 0.75 m by thirds after the book’s 151.5 m wall tower, an analog), f′c 70 MPa and a cracked factor 0.6 (team); the core alone as a square-tube cantilever (E from RC2 p.381, Rayleigh on the storey weights) against 46/H, with P-Δ (Ching p.3), read once, unverified. Outrigger effectiveness, shortening and construction sequence are not modelled. Research packet P10 had two critique rounds and no final gate.',
    confidence: 'B',
    boundary: 'The floor-reach rules of thumb hold for regular plates on a square central core, and the core-alone frequency is a grade-C tube proxy that ignores outriggers, frames and coupling (a lower bound); a plate turning on a straight core, a reach past about 14 m, a stepped or twisted core, or a tower past the book’s 300 m RC examples needs a specialist.',
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
  // vtc-entry R10 juries (21 Nov): "the rule does not reach the skyline"; no reading covered form at city scale.
  { id: 'built.silhouette', name: 'Skyline silhouette', category: 'SITE', phase: 'basic', priority: 'core', status: 'built', projects: ['vtc', 'city'],
    question: 'Does the tower’s outline change enough to read on the skyline: how far each step, slide, taper or twist moves the outline from 8 views, how large that looks from 500 m, 2 km and 5 km, how the widest outline turns with height, and whether sky shows through its open storeys?', jury: ['design_excellence_20', 'urban_integration_10', 'cultural_context_30'],
    human: 'Whether the silhouette is the right one: identity, the city’s skyline and the views that matter are judged by people (the jury, the Urban Design Panel), never by a size threshold.',
    limits: 'A design reading, never a fail. Outline from the storey masses (blocks, drawn masses or imported storey outlines) above the podium, seen straight on from 8 compass views; not yet from the view-cone origins or the board cameras. Legibility threshold 10′: Shang & Bishop (2000) recognition threshold (about 100 min² at 13% contrast, read in Garnero & Fabrizio 2015) taken as a square, a team derivation; no urban-design source with a skyline threshold was found. Sky contrast, haze and the towers in front are not modelled. Sky through the tower (G23): lines of sight across each open band (plates at most 80% of the storeys framing it), blocked by plates, glass and the core, openings read against the same 100 min² as an area (team step); glass transmittance, screens and trees are not modelled, and what stands behind is checked only against the design’s other towers.' },
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

/**
 * Merged tools (13 Nov 2026, "combine any repeating uses"): each lead node absorbs the nodes that answered the same
 * question. The parts keep their ids, engines and results; they leave every list a person sees, switch on and off with
 * their lead, and show as tabs in the lead's results. Old ids in saved workflows and presets map to the lead.
 */
export interface Merge { name: string; question: string; parts: { id: string; tab: string }[]; tab: string }
export const MERGES: Record<string, Merge> = {
  'built.sw-shadow': { name: 'Sun and shadow', tab: 'Shadow on the ground', question: 'Where and for how long does the tower shade the ground, how much sun reaches each face, and what does the sun do at a chosen hour?',
    // 17 Nov (Sinnie: "fix these overlaps"): the City's protected-spaces test is a tab of the shadow study.
    parts: [{ id: 'built.sw-sun-faces', tab: 'Sun on the faces' }, { id: 'built.sun', tab: 'Sun at an hour' }, { id: 'built.solar-access', tab: 'Protected spaces' }] },
  'built.sw-wind-comfort': { name: 'Pedestrian wind', tab: 'Comfort on the ground', question: 'Is it too windy for people around the tower and on its terraces and roofs, and does the massing call for a wind study?',
    parts: [{ id: 'built.sw-wind-height', tab: 'Terraces and roofs' }, { id: 'built.wind-screen', tab: 'Massing screen' }, { id: 'built.wind-study', tab: 'Study trigger' }] },
  'built.sw-daylight': { name: 'Daylight: sDA and ASE (LEED)', tab: 'sDA and ASE', question: 'How much of each floor gets useful daylight (sDA 300/50%) without too much direct sun (ASE 1000/250), against LEED EQ Daylight, and how deep can the plates be?',
    // 17 Nov: Light at this hour is a view of the same floor, not a check: a tab here.
    parts: [{ id: 'built.daylight-depth', tab: 'Plate depth' }, { id: 'built.sw-light-hour', tab: 'Light at this hour' }] },
  'built.sw-energy': { name: 'Energy and carbon', tab: 'Energy use', question: 'What are the TEUI, TEDI and GHGI against the Higher Buildings Policy and VBBL Part 10, how much embodied carbon does the structure carry, and where is PV worth placing?',
    parts: [{ id: 'built.energy-carbon', tab: 'Limits and carbon' }, { id: 'built.sw-pv', tab: 'Photovoltaics' }] },
  'built.sw-glazing': { name: 'Façade: glazing and bird safety', tab: 'Glazing by zone', question: 'How much glass does each façade zone carry, how does it shade, and is the glazing bird-safe?',
    parts: [{ id: 'built.facade', tab: 'Bird safety' }] },
  'built.sw-natvent': { name: 'Natural ventilation', tab: 'Ventilation', question: 'Can the floors be ventilated through opening windows, and how does the air move across the plan?',
    parts: [{ id: 'built.sw-airflow', tab: 'Air flow inside' }] },
  'built.sw-rain-water': { name: 'Rain', tab: 'Rainwater and shelter', question: 'How much rain can the roofs collect, where is the ground sheltered, and how hard does wind-driven rain hit each face?',
    parts: [{ id: 'built.sw-rain-faces', tab: 'Driving rain on the faces' }] },
  'built.pr-streetwall': { name: 'Public realm', tab: 'Streetwall', question: 'Does the base meet the street with the right streetwall and tower form, active frontage and open space and links?',
    parts: [{ id: 'built.pr-frontage', tab: 'Active frontage' }, { id: 'built.pr-ground', tab: 'Open space and links' }] },
  'built.core-lifts': { name: 'Core, lifts and stairs', tab: 'Core and lifts', question: 'Is the core big enough for the lifts and the exit stairs this tower needs?',
    parts: [{ id: 'built.egress', tab: 'Egress and stairs' }] },
  'built.structure': { name: 'Structure', tab: 'System and seismic', question: 'Which structural system suits this height and slenderness, and what do seismic and wind procedures ask of it?',
    parts: [{ id: 'built.wind-procedure', tab: 'Wind procedure' }] },
  'built.mobility': { name: 'Mobility', tab: 'Parking, loading and bikes', question: 'How do people and vehicles arrive: parking, loading, bikes, trips and the station entrance?',
    parts: [{ id: 'built.trips', tab: 'Trips and station' }] },
  'built.view-from': { name: 'Views', tab: 'View from here', question: 'What is seen from a point on the tower, and how does the tower sit in the protected vista views?',
    parts: [{ id: 'built.vista', tab: 'Vista studies' }] },
  // 17 Nov (Sinnie): tower separation and floor plate join the height limits as one Site limits tool.
  'built.viewcones': { name: 'Site limits', tab: 'View cones', question: 'What caps the tower on this site: the view cones and height references, where a relaxation could apply and what aviation asks, the separation from other towers, and the floor plate size?',
    parts: [{ id: 'built.heights', tab: 'Height references' }, { id: 'built.relax-aviation', tab: 'Relaxations & aviation' }, { id: 'built.separation', tab: 'Tower separation' }, { id: 'built.floorplate', tab: 'Floor plate' }] },
}
export const PART_OF: Record<string, string> = Object.fromEntries(Object.entries(MERGES).flatMap(([lead, m]) => m.parts.map((p) => [p.id, lead])))
/** A part's lead (a merged tool), or the id itself. */
export const canonicalNode = (id: string) => PART_OF[id] ?? id
export const partsOf = (id: string) => MERGES[id]?.parts.map((p) => p.id) ?? []
/** Ids as a person sees them: parts replaced by their lead, each once, in order. */
export const canonicalNodes = (ids: string[]) => [...new Set(ids.map(canonicalNode))]
/** Ids with each lead's parts after it (what switches on together). */
export const withParts = (ids: string[]) => [...new Set(canonicalNodes(ids).flatMap((id) => [id, ...partsOf(id)]))]
for (const n of ALL_BUILT_NODES) { const m = MERGES[n.id]; if (m) { n.name = m.name; n.question = m.question } }

/** The built nodes a person sees and picks: merged tools once, under their lead's id. */
/**
 * Obligations of the entry rather than checks of the design (17 Nov, Sinnie): they leave the workflow and the tool
 * library and sit in the Submission checklist on the Present step (components/workflow/SubmissionChecklist.tsx).
 */
export const SUBMISSION_NODES = ['built.culture-claims', 'built.provenance', 'built.model'] as const
const SUBMISSION = new Set<string>(SUBMISSION_NODES)
export const BUILT_NODES: NodeDef[] = ALL_BUILT_NODES.filter((n) => !PART_OF[n.id] && !SUBMISSION.has(n.id))

// On at first: the leads that are on by default with their parts; the sun preview also stays on by itself (it is the
// 3D view's sun as well as a part of Sun and shadow).
export const DEFAULT_ON = [...withParts(BUILT_NODES.filter((n) => !n.defaultOff).map((n) => n.id)), 'built.sun', ...SUBMISSION_NODES]

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

export const ALL_NODES: NodeDef[] = [...ALL_BUILT_NODES, ...researched]
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
// Merged tools appear once, under their lead.
for (const w of WORKFLOWS) w.nodes = canonicalNodes(w.nodes)
