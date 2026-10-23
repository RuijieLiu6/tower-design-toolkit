# modules-completion / P04: research log

## revise-r1: draft saved as `revise-r1_P04.json`
  - Initial P04 packet: eight modules (limits, massing indicators, shoebox model, electrical peak, PV, district energy, embodied carbon, whole-life carbon).
  - Replaced the 2018-20 limit table in the cited case study with 2021 table values plus the Jan 2025 GHGI changes; kept the superseded 6/8 GHGI values visible as FALSE ASSUMPTION.
  - Flagged ICE (educational-only from June 2026; non-educational use not permitted after 30 Sep 2026) and recommended EC3 with attribution and rate limits.
  - Marked every City by-law, guideline and policy PDF that returned HTTP 403 as opened=false; numbers drawn from them rest on secondary sources.
  - Web search budget was exhausted mid-task; remaining gaps listed in unresolved_relationships and flags can be closed with follow-up searches.
  - r1: Opened VBBL Part 10 wordings (15 Sep 2025, 1 Mar 2025, 1 Jul 2023, 1 Jan 2022) and Council's VBBL 2025 text; re-keyed Tables A, B, C into a versioned registry; limit metrics now verified against primary text.
  - r1: Dated the GHGI step (residential 3.0, hotel 4.0) to the 1 Mar 2025 wording, not Jan 2025; Table C GHGI verified (3.0/4.0); Table B confirmed Group C only (100/15, GHGI waived).
  - r1: Replaced the 2018-20 all-other rule: Groups A, B, F take GHGI <= 50% of a fossil-only reference (Table A, EMG s5.3). The 85% figure (City 2022 deck, critique) is not in the adopted text.
  - r1: Replaced the residential-only TEDI sub-limit with combined TEDI and combined GHGI sub-checks (EMG s5.1(e)); added MFA as weighting denominator with parkade effects stated.
  - r1: Moved GHGI-R to reported-only (EMG v3.0 defines it separately); added refrigerant, DHW, elevator, parkade, pool-heating, airtightness and weather-file inputs to M03 with EMG v3.0 values.
  - r1: Split M03 into EMG mode (NRC GW1.0, NECB 2020 schedules, target-leakage infiltration; only mode compared with limits) and Physics mode (no pass/fail).
  - r1: M02 now uses the EMG VFAR definition (0.65 line, adjustment formula), adds thermal-bridging and airtightness parameters, and relabels the TEDI proxy as a team_assumption band with a greyed badge.

## critic-r2: Embodied and whole-life carbon LCA researcher (wbLCA to EN 15978 / NRC National wbLCA Practitioner's Guide, Vancouver ECDR practice)
- Gate pass: **False**
  - condition: Add the HBP s2.2 targets and LCES requirement to M01/M06 as the default VTC target set; flag the HBP height guidance to SITE/PROG
  - condition: Remove the SLD energy-study deliverable; replace it with the actual SLD requirements, routed to the other packets
  - condition: Implement the LCES Policy Type 3/4 criteria in M06 and close the related UNRESOLVED flags
  - condition: Mark EMG v3.0 final as opened: PV deducts in GHGI, purchased-renewable path, no overheating hour limit
  - condition: M07: add the expected-at-BP regime selector; show the baseline path as non-binding at f = 2; show output ranges with greyed badges for preset-only results; re-anchor presets to MH 2023 and add a labelled height premium
  - condition: M05/M08: add PV embodied carbon and a separate B6 grid scenario; either convert M08 denominators and state its scope (no MEP or fit-out) or add placeholders
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Sustainable Large Developments policy requires a low-carbon energy supply feasibility study, which M06 should feed as a rezoning deliverable → SLD (amended 31 Mar 2026) applies to sites of at least 8,000 m2 or 45,000 m2 of new floor area. It requires sustainable site design, food assets, green mobility, potable water reductions, a groundwater study, zero waste and affordable housing, but no energy study.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Higher Buildings Policy's sustainability expectations are unknown, and VBBL Table A (or Table C with LCES) sets the energy targets for a VTC tower → Higher buildings must achieve Passive House certification, or meet TEUI/TEDI/GHGI targets (residential 100/15/3, hotel 120/15/4, retail 100/15/1.5, office 100/15/1.5) AND connect to an LCES under the LCES Policy, with no aggregation of another LCES's reductions. The GBPR also applies.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Whether on-site PV lowers GHGI under EMG v3.0 is unresolved → GHGI = sum over fuels of (site energy use - site renewable generation) x factor / MFA. PV therefore lowers GHGI at the electricity factor (0.011), which is small but nonzero.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Whether an all-electric heat-pump plant counts as an on-site LCES is unresolved → Type 3 qualifies if a qualified engineer verifies seasonal average COP > 2, modelled GHGI < (GHGI limit - 33%) and appropriately sized gas peaking, and the owner holds a 2-year optimisation contract and a 5-year maintenance contract.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: BC electricity at 0.011 kgCO2e/kWh means operational carbon is small and embodied carbon dominates whole-life carbon (M08) → Use 0.011 for compliance only. For whole-life B6, the BC Integrated Grid factor is 22.8 tCO2e/GWh for 2025 (9.9 for 2024), so operational carbon is about twice what the EMG factor implies. Embodied carbon likely still dominates, but by less.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The City's 2030 embodied-carbon aspiration equals 240 kgCO2e/m2 (0.6 x 400) → 2030 proposal: baseline path -40%, absolute path TBD. 240 is team arithmetic and should not be presented as a City line.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A massing-stage design passing the baseline path (<= 2 x baseline) is a meaningful compliance signal → At f = 2 the baseline path is effectively non-binding at massing stage. Report the ratio, and test against the intensity path and the expected-at-BP limits.
- Findings: {'BLOCKER': 1, 'MAJOR': 10, 'MINOR': 10}
- Verdict: Not passed. Round 2 fixed most r1 items: the VBBL tables, the 50% all-other rule, MFA, EMG mode and the f = 2 embodied-carbon regime are now confirmed against primary text. But the rezoning instruments, now readable, change the packet. The HBP requires Passive House, or much stricter targets plus an LCES connection. The SLD has no energy study. The LCES Policy and the final EMG settle questions the spec still marks unresolved. On embodied and whole-life carbon, M07 ignores the GBPR 'expected at first BP' test. Its baseline-path pass cannot fail at massing stage, and its presets rest on a 2019 study unscaled for 244-305 m. M08 omits PV embodied carbon, MEP and fit-out, and treats the EMG compliance factor as a B6 forecast.

## revise-r2: draft saved as `revise-r2_P04.json`
  - Initial P04 packet: eight modules (limits, massing indicators, shoebox model, electrical peak, PV, district energy, embodied carbon, whole-life carbon).
  - Replaced the 2018-20 limit table in the cited case study with 2021 table values plus the Jan 2025 GHGI changes; kept the superseded 6/8 GHGI values visible as FALSE ASSUMPTION.
  - Flagged ICE (educational-only from June 2026; non-educational use not permitted after 30 Sep 2026) and recommended EC3 with attribution and rate limits.
  - Marked every City by-law, guideline and policy PDF that returned HTTP 403 as opened=false; numbers drawn from them rest on secondary sources.
  - Web search budget was exhausted mid-task; remaining gaps listed in unresolved_relationships and flags can be closed with follow-up searches.
  - r1: Opened VBBL Part 10 wordings (15 Sep 2025, 1 Mar 2025, 1 Jul 2023, 1 Jan 2022) and Council's VBBL 2025 text; re-keyed Tables A, B, C into a versioned registry; limit metrics now verified against primary text.
  - r1: Dated the GHGI step (residential 3.0, hotel 4.0) to the 1 Mar 2025 wording, not Jan 2025; Table C GHGI verified (3.0/4.0); Table B confirmed Group C only (100/15, GHGI waived).
  - r1: Replaced the 2018-20 all-other rule: Groups A, B, F take GHGI <= 50% of a fossil-only reference (Table A, EMG s5.3). The 85% figure (City 2022 deck, critique) is not in the adopted text.
  - r1: Replaced the residential-only TEDI sub-limit with combined TEDI and combined GHGI sub-checks (EMG s5.1(e)); added MFA as weighting denominator with parkade effects stated.
  - r1: Moved GHGI-R to reported-only (EMG v3.0 defines it separately); added refrigerant, DHW, elevator, parkade, pool-heating, airtightness and weather-file inputs to M03 with EMG v3.0 values.
  - r1: Split M03 into EMG mode (NRC GW1.0, NECB 2020 schedules, target-leakage infiltration; only mode compared with limits) and Physics mode (no pass/fail).
  - r1: M02 now uses the EMG VFAR definition (0.65 line, adjustment formula), adds thermal-bridging and airtightness parameters, and relabels the TEDI proxy as a team_assumption band with a greyed badge.
