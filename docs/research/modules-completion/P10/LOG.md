# modules-completion / P10: research log

## critic-r1: Tall-building structural engineer (seismic and wind, Canadian NBC/BCBC practice)
- Gate pass: **False**
  - condition: Add NBC 4.1.8.10(4) wall-continuity and Type 4/5 checks to M01 and M05 as hard red rules.
  - condition: Replace the top-drift H/500 with q50 screen with a per-storey hs/500 check under service wind that includes Iw, Ce, Cg and Cp.
  - condition: Apply the RdRo/IE multiplier to seismic drift, and add the Vd >= 0.8V/1.0V scaling and the 4.1.8.23(4) flag.
  - condition: Correct the false claims on outrigger period, Strouhal number, seismic weight and Type 9, and the EMTC height-measurement and firewall rules.
  - condition: Redefine the independent-review states to include the EGBC baseline.
  - condition: Default M02 to tunnel-required for supertall towers and forbid empirical Ta as an f1 input.
  - condition: Re-scope the 13 Nov working core to fit the schedule and record the cut in the change log.
  - condition: Fix the dangling source ID P10-S39 and the wrong library URLs, and cite the 2025 amended NBC printing.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: NBC wind serviceability limit is top drift <= H/500 under q50 = 0.45 kPa (P10-M01, P10-M08). → Check total drift per storey <= hs/500 under service wind (Iw = 0.75) using the 4.1.7.8 Dynamic Procedure pressures. Keep H/250-H/1000 only as Commentary I guidance.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Stiff transfer floors acting as outriggers lengthen the real period versus the empirical formulas (P10-M01, P10-M05). → Transfers or outrigger floors can shorten the period below empirical Ta; flag the case for dynamic analysis.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Strouhal number is about 1/5 for buildings (P10-M02, P10-M04). → Use S = 1/7 for rectangular plans. For non-circular sections wind-tunnel tests are recommended.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Higher live load raises seismic weight W (P10-M08). → W = dead load (partitions capped at 0.5 kPa) + 25% snow + 60% storage load + tank contents.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Commentary I worked example speeds (23.9 m/s) confirm the Vancouver Table C-2 column mapping (q10 = 0.34 kPa). → q10 = 0.34 and q50 = 0.45 kPa are correct, but the verification is that they appear directly in the NBC 2020 Table C-2 Vancouver (City Hall) row, not that they match the example.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Mass-timber EMTC height is measured from the first-storey floor to the roof, and 'fire-separated parts' can be checked as separate buildings (P10-M06). → Measure to the uppermost floor level and require firewall separation before treating a part as its own building.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Type 9 irregularity requires nonlinear dynamic analysis (P10-M01, P10-M03). → Apply 4.1.8.10(7)-(9) with Type 9 limits of 0.1 (self-centering) and 0.03 (other systems).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Independent structural review is needed only when NLDA or an unlisted SFRS is used (P10-M03). → Make baseline independent review always required, and add the special-study and alternative-solution panels on top.
- Findings: {'BLOCKER': 1, 'MAJOR': 11, 'MINOR': 11}
- Verdict: This round fails the gate. Most of the code citations are accurate, and I checked them against the 2025 printing of NBC 2020 and its Commentary. But several rules the tool would apply are wrong or missing. Wind drift is checked at the top under bare q50, when NBC limits drift per storey under service wind. Seismic drifts are compared without the RdRo/IE multiplier. The Strouhal number and seismic weight are wrong, and the outrigger/period claim is inverted. The rule requiring core walls to run continuous to the foundation, which bans core transfers at the podium, is missing. Mass-timber height is measured wrongly, and firewall separation is not required. Independent review in BC and the station seismic joint are left out. The 13 Nov scope does not fit. Fix the BLOCKER and the MAJOR items before entrants rely on this.

## revise-r1: draft saved as `revise-r1_P10.json`
  - R1: Replaced the assumed 12-storey BC mass-timber cap with 18 storeys / 76 m (VBBL RTS 16367 Table 3.2.2.91, BCBC 2024 Rev. 1) and kept NBC 2020's 12 storeys as the national baseline (flagged FALSE_ASSUMPTION).
  - R1: Replaced NBC 2015 / VBBL 2019 Vancouver Sa(0.2) = 0.85 g with NBC 2020 X450 values (Table J-2: 1.1, 0.77, 0.44, 0.27, 0.075, 0.033 g; PGA 0.46 g) and recorded that new VBBL seismic rules apply from 15 Sep 2026.
  - R1: Took wind-sensitivity thresholds directly from NBC 2020 4.1.7.1-4.1.7.2 (60 m, H/w 4 and 6, 1 Hz and 0.25 Hz, CFD prohibited) instead of generic slenderness rules of thumb.
  - R1: Took acceleration criteria from NBC Commentary I (1.5-2.5% g 10-year; ISO 10137 1-year curves; damping 0.01 / 0.015 / 0.02) and added its worked example as a unit test.
  - R1: Added SC4 SFRS height restrictions, static-method limits, Ta formulas, irregularity thresholds (130%, 150%, 1.7) and the SFRS equivalence route from NBC 2020 Vol. 1 and Commentary J.
  - R1: Flagged OpenSees / OpenSeesPy licence terms as incompatible with a hosted open-source service; kept PyNite and sectionproperties (MIT) as the default libraries.
  - R1: Marked system-height envelopes, core ratio, net-to-gross, super-slender band and quantity benchmarks as team assumptions because no accessible primary source existed.
  - R1: Corrected organisation naming: CTBUH is now the Council on Vertical Urbanism (verticalurbanism.org).
  - r1: BLOCKER fixed: added NBC 4.1.8.10(4) hard rule (SFRS walls continuous to foundation when Ta >= 1 s and IE*S(1.0) > 0.25; no Type 4/5). Core transfers at the podium are red, not 'needs NLDA'. M05 detects Types 4/5, M01 shows red storeys, M05 gives 'wrap podium around the core' advice. Flagged FALSE_ASSUMPTION.
  - r1: Wind drift corrected in M01 and M08: per-storey hs/500 under service wind (Iw SLS 0.75) with p = Iw q Ce Ct Cg Cp from a 4.1.7.8 wind engine in M04; H/500 demoted to a secondary Commentary I guide. Cg inputs (B, s, F, K, zeta) confirmed on amended page 4-44. Flagged FALSE_ASSUMPTION.
  - r1: Corrected the outrigger/transfer period claim in M01, M03, M05: such floors can shorten the real period below empirical Ta, so Ta-based forces may be unconservative; flag for dynamic analysis. Flagged FALSE_ASSUMPTION.
  - r1: M03 seismic drift now elastic drift x RdRo/IE (x 1.2 for Type 9), cites 4.1.8.13(2)-(3); added Vd >= 0.8 V (regular) / 1.0 V (irregular) from 4.1.8.12(8)-(9) to the screening outputs. Flagged FALSE_ASSUMPTION.

## critic-r2: Earthquake engineering academic, British Columbia (tall concrete wall buildings, NBC 2020 seismic and wind provisions)
- Gate pass: **False**
  - condition: Rewrite the M05/M01 continuity test: downward-only, walls may end going up, check in-plane length and thickness reductions and offsets (Types 4/5); remove the lift-bank/continuity sentence.
  - condition: Change the M03 default site designation to X_C with an X_D sensitivity; X_V only with measured Vs30; compute Mv/J from the selected designation.
  - condition: Say clearly that M01, M04, M07 and M08 arrive after the 30 Nov VTC deadline, or ship a static M01 route card and M07 checklist by 13 Nov.
  - condition: Add a 'reviewer-read' badge state and downgrade 4.1.8.23(4) to unverified until the clause is read in the 2nd printing.
  - condition: Remove the session-housekeeping text from the notes.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The core steps in plan as lift banks drop out, which can trip the continuity rule; any SFRS wall that 'ends' is red (P10-M05, P10-M01). → Apply the continuity test downward only. A wall may end going up. It must not be cut, shortened, offset or reduced in stiffness in any storey below it (Types 4 and 5).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Overlap of an SFRS wall polygon with any wall polygon in the storey below shows continuity (M05 metric 'good'). → Compare in-plane length, thickness and position of each wall line storey by storey down to the foundation, with a small fixed tolerance.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: X450 at downtown coordinates is a suitable default site designation (P10-M03 limits, inputs). → Default to X_C, show X_D as a sensitivity, and use X_V only with a measured Vs30.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Timber SFRS are capped at 20 m at SC4 (P10-M01 materials parameter, P10-M06). → State the SC4 height cap per timber SFRS row from the full table. The supertall conclusion is unchanged.
- Findings: {'MAJOR': 3, 'MINOR': 9}
- Verdict: Round 2 fixes almost every r1 item. The hazard values, the EMTC table and the NBC wind classification clauses all check out against primary sources. The gate fails on three points. First, the M05/M01 wall-continuity test, the key 13 Nov rule, is wrong in both directions: tapering cores come out red, and walls that are shortened below still pass. Second, the default X450 site designation understates long-period demand by about 15-17% compared with X_C, which entrants without a measured Vs30 must use. Third, M01 and M07 arrive after the 30 Nov submission deadline for the competition the tool serves, and the spec does not say so. Smaller items: the status badges overstate verification, the timber and steel table rows are incomplete, and some session housekeeping text is left in the notes.
