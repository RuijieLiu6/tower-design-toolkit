# modules / P12: research log

## research: draft saved as `research_P12.json`
  - Round 1 (21 Oct 2026): first specification of packet P12 with 8 modules (M01 isovist/VGA, M02 view access, M03 depth from glazing, M04 occupancy and schedules, M05 adjacency and stacking, M06 facade and envelope, M07 materials, colour and embodied carbon, M08 comfort).
  - Corrected the packet scope's 'embodied carbon via EC3/ICE': ICE Educational V5.0 is educational-only and non-educational use ends 30 Sept 2026, so EC3/openEPD and CLF data are the tool defaults (FALSE_ASSUMPTION recorded).
  - Corrected view-protection assumptions: the old view-cone policy was replaced by Public Views Guidelines on 10 July 2024 (FALSE_ASSUMPTION recorded, from a secondary source).
  - Split 'depth from glazing' (P12-M03) from 'view access' (P12-M02) because they use different thresholds (LEED 3 x head height and sDA versus EN 17037 view out) and different priorities.
  - Placed adjacency and stacking in its own module (P12-M05) so subjective ratings are recorded separately from objective occupancy counts (P12-M04).
  - Replaced remembered numbers with team_assumption or unverified labels wherever the source could not be opened (BCBC occupant load, ASHRAE WWR cap, acoustic limits, daylight k factor).
  - Added derived figures from the DOE/PNNL scorecard (1.5 persons per hotel room, 2.5 per apartment) and the brief's site arithmetic (79.2 m x 144.8 m is about 11,468 m2; 9.0 FSR is about 103,200 m2).

## critic-r1: Interior architect and workplace strategist (independent reviewer, round 1, packet P12)
- Gate pass: **False**
  - condition: Replace the BCBC 2024 and Step Code references with the Vancouver Building By-law and City energy requirements, keeping them unverified until read
  - condition: Correct the M04 area bases and add a separate vertical-transportation population basis; stop feeding energy densities to egress and lifts
  - condition: Make every metric status consistent with its evidence and flags; add verified_secondary, proxy and legacy statuses, and show no pass/fail badge unless the metric is verified
  - condition: Remove the embodied-carbon pass badge until the scope and current City guideline are confirmed
  - condition: Fix the 9.0 FSR counting rule (office and commercial by default; hotel and cultural as recorded judgements)
  - condition: Correct the six false assumptions listed (code jurisdiction, bird/view conflict, LEED currency, Turner R2, EN 17037 area aggregation, concrete comparison)
  - condition: Recheck items left unverified because the web-search budget was exhausted in this review (Vancouver embodied-carbon 2025 amendments, LEED v5 credit text, VBBL edition)
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: BC Building Code 2024 (occupant loads, separations, acoustics) and the BC Energy Step Code govern a tower in downtown Vancouver. → Use the Vancouver Building By-law (edition in force, to be verified) and the City's energy and emissions requirements (VBBL / Green Buildings Policy for Rezonings). Keep the values unverified until read.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: No source resolves how bird-friendly patterned glass and LEED view glazing can both be satisfied (UNRESOLVED flag). → Cite the addenda alignment, open the current credit wording, and keep only the residual VLT and clarity trade-off as a judgement.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: LEED v4/v4.1 credit thresholds (EQc7 sDA/ASE, EQc8 views) are the current LEED benchmark. → Label v4 and v4.1 values as legacy, and open the v5 BD+C EQ credits before showing badges.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Turner et al. (2001) report only qualitative correspondence between visibility-graph measures and use. → State that observed room occupancy had an exponential correlation (R2 = 0.63) with mean shortest path length. This is still relative to one building and gives no threshold.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: EN 17037 view-out levels are an area-share criterion ('% of area by EN 17037 level'). → Report per-point levels and label the area aggregation as a ClimateStudio-style convention.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: BC 25 MPa concrete ranges from 220 to 90 kgCO2e/m3 (like-for-like), and CLF BC guide values can be used as open data. → Compare at equal curing age (for example Butler 109 at 28 days against 220). Reference the guide by link, not by bundling its values.
- Findings: {'BLOCKER': 3, 'MAJOR': 13, 'MINOR': 8}
- Verdict: The packet is careful and honest about gaps, but it is not ready for entrants. It cites the wrong code: BCBC and the Step Code do not apply in the City of Vancouver. The core occupancy module mixes area bases and sends energy-model densities to egress and lift sizing. Several metrics are labelled 'verified' although the spec's own flags call them unverified or the source is superseded (LEED v5 has been out since 2025), so entrants would see misleading pass badges. The embodied-carbon check compares A1-A3 totals with a cap of unknown scope. The bird-friendly check is incomplete for a 300 m tower, and the M01 transparency model cannot work. Most fixes are relabelling and adding parameters. A focused round 2 should pass.
