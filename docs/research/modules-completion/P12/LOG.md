# modules-completion / P12: research log

## revise-r1: draft saved as `revise-r1_P12.json`
  - Round 1 (21 Oct 2026): first specification of packet P12 with 8 modules (M01 isovist/VGA, M02 view access, M03 depth from glazing, M04 occupancy and schedules, M05 adjacency and stacking, M06 facade and envelope, M07 materials, colour and embodied carbon, M08 comfort).
  - Corrected the packet scope's 'embodied carbon via EC3/ICE': ICE Educational V5.0 is educational-only and non-educational use ends 30 Sept 2026, so EC3/openEPD and CLF data are the tool defaults (FALSE_ASSUMPTION recorded).
  - Corrected view-protection assumptions: the old view-cone policy was replaced by Public Views Guidelines on 10 July 2024 (FALSE_ASSUMPTION recorded, from a secondary source).
  - Split 'depth from glazing' (P12-M03) from 'view access' (P12-M02) because they use different thresholds and priorities.
  - Placed adjacency and stacking in its own module (P12-M05) so subjective ratings are recorded separately from objective occupancy counts (P12-M04).
  - Replaced remembered numbers with team_assumption or unverified labels wherever the source could not be opened (occupant load, ASHRAE WWR cap, acoustic limits, daylight k factor).
  - Added derived figures from the DOE/PNNL scorecard and the brief's site arithmetic (79.2 m x 144.8 m is about 11,468 m2; 9.0 FSR is about 103,200 m2).
  - r1: Replaced every BCBC 2024 and BC Energy Step Code reference with the Vancouver Building By-law 2025 (in force 15 Sep 2025 per City guide snippets; text unread) and the City's TEUI/TEDI/GHGI metrics, all unverified; recorded a corrected FALSE_ASSUMPTION and added sources P12-S49, S50, S51, S55, S66.
  - r1: M04: tagged every density with its area basis and limited net-to-gross to net-basis densities; added a fourth basis, vertical transportation (lift-planning density and five-minute target, secondary P12-S62); egress now uses the VBBL table and 2 persons per sleeping area; DOE densities no longer feed lifts.
  - r1: M04: FSR test now counts office and retail/commercial only by default (strict), shows an inclusive range with hotel and cultural/civic toggles, excludes mechanical, core and below-grade, and lists the floor-area definition as unresolved; added the VTC brief as source P12-S48.
  - r1: M04: added an activity-setting table and utilisation scenario that change design and energy bases only; egress stays at attendance 1.0.
  - r1: Status handling: replaced blanket 'verified' with evidence-based statuses (verified only when current official text was opened); verified_secondary, proxy and legacy_version carried in status_detail and in a bracket tag in basis because the status enum has no such values; no pass/fail badge for non-verified metrics.

## critic-r2: Facade engineer (independent reviewer, round 2, packet P12)
- Gate pass: **True**
  - condition: Load the VBBL 2019 (Feb 2025 consolidation) TEUI/TEDI/GHGI values as legacy_version, occupancy-weighted reference lines, and verify them against VBBL 2025 before any badge
  - condition: Replace glazing-only U/SHGC with whole-assembly values, a facade-system parameter and a spandrel class
  - condition: Remove the dependency cycles M02-M06, M06-M07 and M03-M07, or mark them as explicit user-triggered iterations
  - condition: Add an exterior solar-reflection check and facade embodied-carbon factors before v1 (10 Dec)
  - condition: Fix the bird-zone overhang formula and cite all four UBC tiers
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: VBBL energy and emissions limits (TEUI, TEDI, GHGI) by occupancy for Part 3 towers could not be read, so no numbers can be given and ENER results show without a limit line. → Show the Table 10.2.2.5.A1 values as legacy_version reference lines (TEUI/TEDI/GHGI: Group C over 6 storeys 120/30/3.0; hotel and motel 140/20/4.0; office 100/20/3.0; Group D/E except office 120/20/3.0). Weight them by occupancy area, citing CoV Energy Modelling Guidelines s.5 (unread), and verify against VBBL 2025 before any badge.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: UBC bird-friendly policy has Tiers 1-3, with 55% treated glazing (Tier 3) as the lowest level. → Cite four tiers, and add an upper-tower and migratory-path risk flag for a Pacific Flyway site.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The LEEDuser v5 EQc2 page is internally inconsistent on Option 5 points. → Update the UNVERIFIED flag text, and keep v5 as verified_secondary until the USGBC credit text is opened.
- Findings: {'MAJOR': 5, 'MINOR': 10}
- Verdict: Round 2 fixed every round 1 BLOCKER. Code jurisdiction, occupancy bases, evidence statuses (with the X01 gate), the embodied-carbon scope, FSR counting, the VGA model and the bird checks are now handled honestly. From a facade standpoint, the packet still treats glazing as centre-of-glass numbers with no system type or spandrel. It claims the City's TEUI/TEDI/GHGI limits are unreadable, although the open VBBL 2019 consolidation tabulates them. It also has dependency cycles a DAG canvas cannot run, and it ignores exterior solar reflection and facade embodied carbon. None of these blocks the 13 Nov core cut if M06 takes manual assembly inputs, so the packet passes with conditions.

## revise-r2: draft saved as `revise-r2_P12.json`
  - Round 1 (21 Oct 2026): first specification of packet P12 with 8 modules (M01 isovist/VGA, M02 view access, M03 depth from glazing, M04 occupancy and schedules, M05 adjacency and stacking, M06 facade and envelope, M07 materials, colour and embodied carbon, M08 comfort).
  - Corrected the packet scope's 'embodied carbon via EC3/ICE': ICE Educational V5.0 is educational-only and non-educational use ends 30 Sept 2026, so EC3/openEPD and CLF data are the tool defaults (FALSE_ASSUMPTION recorded).
  - Corrected view-protection assumptions: the old view-cone policy was replaced by Public Views Guidelines on 10 July 2024 (FALSE_ASSUMPTION recorded, from a secondary source).
  - Split 'depth from glazing' (P12-M03) from 'view access' (P12-M02) because they use different thresholds and priorities.
  - Placed adjacency and stacking in its own module (P12-M05) so subjective ratings are recorded separately from objective occupancy counts (P12-M04).
  - Replaced remembered numbers with team_assumption or unverified labels wherever the source could not be opened (occupant load, ASHRAE WWR cap, acoustic limits, daylight k factor).
  - Added derived figures from the DOE/PNNL scorecard and the brief's site arithmetic (79.2 m x 144.8 m is about 11,468 m2; 9.0 FSR is about 103,200 m2).
  - r1: Replaced every BCBC 2024 and BC Energy Step Code reference with the Vancouver Building By-law 2025 (in force 15 Sep 2025 per City guide snippets; text unread) and the City's TEUI/TEDI/GHGI metrics, all unverified; recorded a corrected FALSE_ASSUMPTION and added sources P12-S49, S50, S51, S55, S66.
  - r1: M04: tagged every density with its area basis and limited net-to-gross to net-basis densities; added a fourth basis, vertical transportation (lift-planning density and five-minute target, secondary P12-S62); egress now uses the VBBL table and 2 persons per sleeping area; DOE densities no longer feed lifts.
  - r1: M04: FSR test now counts office and retail/commercial only by default (strict), shows an inclusive range with hotel and cultural/civic toggles, excludes mechanical, core and below-grade, and lists the floor-area definition as unresolved; added the VTC brief as source P12-S48.
  - r1: M04: added an activity-setting table and utilisation scenario that change design and energy bases only; egress stays at attendance 1.0.
  - r1: Status handling: replaced blanket 'verified' with evidence-based statuses (verified only when current official text was opened); no pass/fail badge for non-verified metrics.

## critic-r3: Environmental psychology researcher on spatial experience, acting as gatekeeper source auditor (round 3, packet P12)
- Gate pass: **False**
  - condition: Correct the vestibule rule to 10.2.2.8(1)(b)/(c) (2.1 m or 4.87 m, 2% area branch, full exemption list) in M01 and M06b
  - condition: Load VBBL 2019 Part 3 Table 3.1.17.1 and the Part 3 sleeping-room wording into M04 as legacy_version, and mark the hotel basis UNRESOLVED
  - condition: Open the VTC brief PDF and cite page and clause for the FSR test, site and jury weights before the M04 core release
  - condition: Define the M01 integration formula with a true source and a depthmapXcli parity test
  - condition: Add at least placeholder metrics for human perception (crowding in lift and sky lobbies, vertical wayfinding, isovist experiential descriptors), labelled team_assumption
  - condition: Re-cut the core scope so P12 fits a stated share of the 34 person-days available before 13 Nov
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: VBBL Part 3 occupant-load factors cannot be read; the office factor of 9.3 m2/person is recalled and unverified; egress uses 2 persons per bedroom or sleeping area (Part 9 text). → Office 9.30, dining 1.20, non-fixed seats 0.75, standing space 0.40, mercantile first storey 3.70 and other storeys 5.60 m2/person. Part 3 wording is '2 persons per sleeping room in a dwelling unit'. Load these as legacy_version values. Hotel rooms use the designed-number clause (unresolved).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: VBBL 10.2.2.8 entrance vestibules need two door lines at least 2.1 m apart, area at most 4.65 m2 or 2%. → Make door separation conditional (2.1 m or 4.87 m), use the 2% area branch for large podium floors, and list all eight exemptions.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Visual integration and its normalisation come from Turner et al. (2001). → Cite the actual source of the integration formula (Hillier and Hanson 1984, or the depthmapX implementation), or report mean shortest path length ranks only.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 1.2 m seated is the grid height REHVA gives for EN 17037 view out. → Label the value as the authors' method. EN 17037 Annex C is unopened.
- Findings: {'MAJOR': 6, 'MINOR': 8}
- Verdict: Round 3 is honest and well caveated, and most round-2 items are fixed. The VBBL energy, UBC, LEED v5, CLF and Turner figures check out against the sources. The gate fails on five points. First, the vestibule rule leaves out the 4.87 m clause that probably governs a full-block podium. Second, the VBBL 2019 Part 3 occupant-load table is readable but still marked unverified. Third, the VTC brief behind the core FSR test is still unopened. Fourth, the headline M01 'integration' metric is attributed to a paper that never defines it. Fifth, the 40% human-scale criterion has no metric grounded in perception, although relevant isovist and wayfinding studies exist. The core scope also exceeds realistic capacity. All six conditions can be fixed within days.
