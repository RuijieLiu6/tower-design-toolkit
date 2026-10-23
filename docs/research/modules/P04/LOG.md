# modules / P04: research log

## research: draft saved as `research_P04.json`
  - Initial P04 packet: eight modules (limits, massing indicators, shoebox model, electrical peak, PV, district energy, embodied carbon, whole-life carbon).
  - Replaced the 2018-20 limit table in the cited case study with 2021 table values plus the Jan 2025 GHGI changes; kept the superseded 6/8 GHGI values visible as FALSE ASSUMPTION.
  - Flagged ICE (educational-only from June 2026; non-educational use not permitted after 30 Sep 2026) and recommended EC3 with attribution and rate limits.
  - Marked every City by-law, guideline and policy PDF that returned HTTP 403 as opened=false; numbers drawn from them rest on secondary sources.
  - Web search budget was exhausted mid-task; remaining gaps listed in unresolved_relationships and flags can be closed with follow-up searches.

## critic-r1: Building energy modeller with Vancouver rezoning experience (Energy and Emissions Design Reports, VBBL Part 10, Embodied Carbon Design Reports)
- Gate pass: **False**
  - condition: Open the VBBL 2025 Part 10 wording (effective 15 Sep 2025) and re-key every limit cell with clause and date; downgrade all limits to 'unverified' until done
  - condition: Open the Higher Buildings Policy, the Green Buildings Policy for Rezonings and the Sustainable Large Developments policy; add their energy/carbon requirements or document that none apply
  - condition: Implement the Group A/B/F GHGI rule (85% below fossil-only reference from Jan 2025) and occupancy-group mapping
  - condition: Correct the combined TEDI sub-check and use MFA as the denominator
  - condition: Fix the M07 regime logic (remove the universal 800 fail; separate 2023 and 2025 regimes) and set 360/320 to 'unverified (approved in principle)'
  - condition: Add emission-factor defaults, GHGI-R refrigerant inputs and DHW to M03 before any GHGI pass/fail is shown
  - condition: Relabel the M02 TEDI proxy pass/fail as team assumption until calibrated
  - condition: Default Table C (LCES) relief to off unless the user attests City recognition
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Current energy rule for cultural/civic ('all other') space is unknown, so the 2018-20 rule (TEUI 35% better than baseline, TEDI and GHGI equal to baseline) is used → For Group A, B, F major occupancies the GHGI limit is 50% below a fossil-fuel-only reference building from July 2023 and 85% below from January 2025. The 2018-20 rule is superseded for GHGI.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: In a mixed-use building only the residential portion must separately meet its own TEDI limit → All portions of the building that have a table TEDI target must together meet their combined (area-weighted) TEDI target, in addition to the whole-building limits.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Embodied carbon above 800 kgCO2e/m2 fails in any case → For 2025-regime permits a design passes if it is <= 360 or at least 10% below its functionally equivalent baseline (plus one responsible-materials category), whatever its absolute value.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 2025 absolute embodied-carbon limits (360/320) and the 2021-table TEUI/TEDI values are 'verified' → Status must be 'unverified' until the VBBL 2025 Part 10 wording and the current Embodied Carbon Guidelines are opened.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The City halved the TEDI/TEUI credit for corridor pressurization (complete description of the 2023 change) → TEDI and TEUI corridor-pressurization credit reduced 50%; GHGI credit removed entirely (EMG v2.0, 2023).
- Findings: {'BLOCKER': 3, 'MAJOR': 12, 'MINOR': 9}
- Verdict: The packet does not pass. The structure is sound and the authors were honest about their gaps. But the core modules M01 and M07 show 'verified' limits that rest on a 2021 consultant page and 'approved in principle' slides, while VBBL 2025 has been in force for 13 months. Sources the authors already opened contradict three claims: the assembly-occupancy GHGI rule (85% below a fossil-only reference), the combined TEDI sub-check, and the universal 800 embodied-carbon fail. The rezoning instruments that govern a VTC tower are unopened: the Higher Buildings Policy sustainability clause, the Green Buildings Policy for Rezonings and the Sustainable Large Developments policy. GHGI also cannot yet be computed reliably: there are no emission factors, refrigerant inputs, DHW or thermal-bridging inputs. My web searches ran out during this review, so these gaps still need a browser pass.
