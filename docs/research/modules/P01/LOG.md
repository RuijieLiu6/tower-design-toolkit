# modules / P01: research log

## research: draft saved as `research_P01.json`
  - R1 (21 Oct 2026): Created packet P01 with 8 modules (M01 VTC checker, M02 policy register, M03 zoning/ODP sheet, M04 view cones, M05 airspace, M06 tower separation, M07 FSR accounting, M08 public benefits).
  - R1: Replaced 'View Protection Guidelines' with 'Public Views Guidelines (10 Jul 2024)' and recorded it as a corrected false assumption.
  - R1: Added Transport Canada's July 2026 consultation on extended YVR zoning and the NAV CANADA land-use process; recorded that downtown applicability is unconfirmed.
  - R1: Added the Bay Parkade rezoning (27 Jul 2026) as a live precedent for height beyond policy, aviation risk and benefits.
  - R1: Recorded the 2026 review timeline (draft policies fall 2026-winter 2027; hearing spring 2027) and that protected views are outside the review.
  - R1: All City of Vancouver sources returned HTTP 403 and are marked opened=false; no threshold from them is marked verified. WebSearch quota ran out before tower-separation, CAC policy and large-site policy searches.

## critic-r1: Senior City of Vancouver rezoning planner (downtown tall-building rezonings)
- Gate pass: **False**
  - condition: Open the brief (register before 29 Oct 2026 if the team has not), cite page and clause for every M01/M07 rule, and only then keep 'verified'.
  - condition: Add the georeference/datum node and make M04 and M05 test the highest physical point in the correct datum.
  - condition: Remove the M02<->M04 dependency cycle (split M02 into register and departure log).
  - condition: Make the Higher Buildings height threshold site-specific and unverified, not a universal verified 600 ft.
  - condition: Revise the 9.0 FSR classification (hotel tier, residential amenity excluded, core shared out) and send the wording question to Buildner before 3 Nov 2026.
  - condition: Correct the M05 statuses (YVR applicability unknown; heliport as an operator-impact flag) and add the TC aeronautical assessment and marking/lighting.
  - condition: Add register rows for the CBD land-use policy, large-developments policy, green buildings and public art, all marked unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M02: 'Sites inside the policy area, buildings up to 600 ft may be considered' is a verified, general threshold. → The threshold is site-specific per the policy's Figure 1. 600 ft is verified only for the sites near Bay Parkade; elsewhere it is unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M05: The YVR zoning surface penetration metric is 'verified' for this tower. → Formula verified, applicability to downtown unknown (probably outside current zoning). The July 2026 proposal is undefined for downtown.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M04: Pre-2024 cone data overstates restriction for the QEP tests. → For the retained QEP cones, pre-2024 geometry may be unchanged. Confirm cone by cone; do not assume it overstates restriction.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M05: The precedent screening flag is 288 m above grade. → Use it as a display marker with 'measure unstated', not as a screening threshold.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M05: NAV CANADA replies take 12-18 months near airports. → Quote the conditional wording, and add the Transport Canada aeronautical assessment as a separate checklist item.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M01/M07: The brief rules are 'verified'. → Open the brief and cite page and clause, or downgrade to unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M08: Mapping benefits to 'cash CAC' is a verified Vancouver Charter statutory mapping (ss. 565.1, 565.13). → List the policy-based CAC separately from density bonus, DCL and ACC, with status 'policy, unverified'.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: P01-M08: Bay Parkade is a usable benchmark for a VTC employment-led tower. → Use it only as a precedent for height beyond policy, aviation risk and benefit scale, not for program or the 9.0 non-residential test.
- Findings: {'BLOCKER': 3, 'MAJOR': 13, 'MINOR': 8}
- Verdict: The packet is careful with its sources and honest about gaps, but it is not safe to release. Rules from the unopened brief are marked 'verified', against the packet's own convention. Height is measured differently in M01, M04 and M05, with no shared datum or highest-point node. M02 and M04 depend on each other, so the canvas cannot run them. The Higher Buildings 600 ft threshold is applied to every site, though the source gives it only for sites near Bay Parkade. The YVR and heliport metrics treat formulas as rules that apply downtown. The 9.0 FSR classification leaves out hotel and never shares core space out to uses. Several policies that very likely apply (CBD jobs policy, large-developments policy, TC marking and lighting) are missing. All of these can be fixed in one round.

## revise-r1: draft saved as `revise-r1_P01.json`
  - r1: Split the dependency cycle. Old M02 became a static register (P01-M02, no upstream) and its departure log moved into P01-M08 (downstream of M01, M02, M04, M05, M06, M07). M04 now depends on M02 and M09 only. Graph is acyclic; add a CI cycle check over depends_on.
  - r1: Added P01-M09 Site georeference, datum and height measures (assumed block, ground elevation, vertical datum, grid rotation, CTBUH vs AGL vs AMSL vs highest physical point). M01, M04, M05, M06 consume it; M04 and M05 test the highest physical point in the cone or surface datum.
  - r1: Merged P01-M03 (zoning and ODP sheet) into P01-M02 to stay at 8 modules; the M03 id is retired, not reused. Zoning comparisons moved to the departure log in P01-M08.
  - r1: Downgraded brief-derived statuses (height band, 9.0 FSR, site, transit entrance) from verified because S02 is unopened; two core metrics marked false_assumption_corrected; site containment set to team_assumption; transit test reframed around a user-placed station portal point with off-site length flagged.
  - r1: Replaced the two-way strict/broad FSR classification with three tiers (office; plus retail and service incl. hotel; plus cultural/civic, public, non-residential amenity), residential amenity never counted, core and mechanical shared out by switch; M01 reads one named ledger (default gross, zoning shown beside it) using the same tags as M07.
  - r1: Replaced the universal 600 ft threshold with a site-specific lookup (600 ft stored only for the sites across from Bay Parkade); added FALSE_ASSUMPTION flag.
  - r1: M05 reworked: CAR 601.23-601.24 and Standard 621 added (every VTC tower is an obstacle above 150 m AGL; daytime marking always required; Transport Canada notice 90 days before construction, separate from NAV CANADA); YVR zoning split into verified formula and unknown applicability; heliport surfaces relabelled as operator-impact flag; NAV CANADA timing corrected to the conditional wording; 288 m precedent made display-only; 2024 Gazette versus July 2026 proposal relationship explained.
  - r1: M04 reworked: per-cone retained, updated or eliminated status from Storeys; City open data (24 polygons, 2D, no elevations, modified 19 Oct 2026) added; hypothetical-cone mode and brief-package check added; jury tags cut to cultural_context_30 and design_excellence_20; false_assumption_corrected on the vintage metric.
  - r1: M06 thresholds made use-specific (residential candidates only; office and hotel unknown); added street-wall and podium height, setbacks and cross-street separation.
  - r1: M02 register extended with CBD land-use/job-space row, large-sites, green-buildings, public-art, bird-friendly, Vancouver ODP (31 Mar 2026), transit-oriented areas (800 m, residential parking), Downtown ODP sub-areas (29 polygons), and pointer rows for shadow, wind, energy; all unverified rows kept visibly unverified.
  - r1: M08 now holds the departure log and the benefit ledger; benefit categories split into in-kind conditions, payment in lieu, DCL, ACC and policy CAC; Bay Parkade benchmark given a precedent-fit note; storey conflict (63 vs 68 vs 79) recorded.
  - r1: M01 gained the submission-format checklist (4 A2 boards, 10 MB, English, anonymous, 30 Nov 2026 23:59 London) as a pointer to PRES.
