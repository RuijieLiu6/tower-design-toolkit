# modules / P11: research log

## research: draft saved as `research_P11.json`
  - Round 1: created packet P11 with 8 modules (M01 lift sizing, M02 lift strategy comparator, M03 plant floors and risers, M04 low-carbon systems, M05 high-building code checklist, M06 egress sizing, M07 accessibility, M08 smoke control and evacuation screening).
  - Round 1: corrected the refuge-floor assumption (no refuge-floor item in the 3.2.6 lists of the 2024 BC Part 3 checklists); flagged FALSE_ASSUMPTION with residual verification gap.
  - Round 1: replaced CIBSE Guide D 2015 as the reference with the 2020 edition (2015 archived as superseded).
  - Round 1: set governing code as BCBC 2024 (confirmed) and VBBL 2025 (unverified, City pages returned HTTP 403); VBBL 2019 treated as superseded.
  - Round 1: marked unsourced thresholds as team_assumption or unverified (hotel lift criteria, plant-floor share, 550 kPa pressure limit, occupant-load and travel-distance values, Part 3 GHGI limits, firefighter-elevator numerics).
  - Round 1: web-search budget exhausted mid-run; later gaps (plant frequency, Canadian refuge-floor text) were not searched further.

## critic-r1: Vertical transportation consultant for supertall towers, reviewing code and MEP interfaces
- Gate pass: **False**
  - condition: Re-base all code and energy content on VBBL 2025 and Vancouver policy; downgrade provincial-only thresholds from 'verified' to reference/unverified
  - condition: Correct the 3.2.6.2 stair smoke-control split (1%/2 h for below-lowest-exit-level stairs as a code requirement; vent for stairs above) in M05 and M08
  - condition: Fix the M01 RTT engine (general analysis with express jump, defined P) and test it against the Peters and Arup worked examples before any gauge shows pass/fail
  - condition: Include firefighter, stretcher, goods and service lifts in core-area outputs
  - condition: Resolve the M05/M06 circular dependency and complete depends_on lists
  - condition: Add an applicability field so that UK/Australian targets are not shown as verified Vancouver criteria; check BCO currency
  - condition: Rewrite the M03 plant-floor causal chain (PRV vs hydronic pressure breaks)
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: BCBC 2024 (with its adaptable-unit rule from 10 March 2025 and the provincial Zero Carbon and Energy Step Codes) is the confirmed governing code for the Vancouver site, and these thresholds are 'verified'. → Make VBBL 2025 (based on BCBC 2024, amendments unread) the governing code. Mark provincial-only rules as reference with applicability unverified. Get Vancouver's own energy/GHG limits, adaptable-unit rules and rezoning green-building policy.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 1% contaminated air over 2 h stair target is only a design target from BCAB 1844's facts, not a code limit, and (M08) it applies to the tower's exit stairs. → Code performance requirement (2018 wording; re-check in VBBL 2025) for below-grade stairs, including the transit-connection levels. Above-grade stairs: vent of 0.05 m2 per door, minimum 1.8 m2. Re-scope M08 accordingly.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: RTT = 2H*tv + (S+1)*ts + 2P*tp is the general-analysis form used in P11-S23. → Cite the formula to CIBSE Guide D 2020 / Peters's general-analysis reference. Add the express-zone term and unequal floor heights and populations. Test against the published worked examples.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: No refuge-type provision exists, so any refuge or waiting area is purely a design choice. → Keep 'no mandatory refuge floor'. Add 3.3.1.7 protected zones as a checklist item (often met by sprinklering, to be confirmed in text).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The maximum travel distance for each occupancy is set in 3.4.2.4. → Cite 3.4.2.5 for the limit values, 3.4.2.4 for measurement and 3.3.1.6 for travel within suites; keep the values unverified until read.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: One person per 8 m2 NIA is one of the sourced design densities on an equal footing. → Present 1:8 as a conservative London speculative buffer, and default to a stated team-assumption density.
- Findings: {'BLOCKER': 3, 'MAJOR': 13, 'MINOR': 6}
- Verdict: Fail. The research behind P11 is honest and it labels its own gaps well, but three problems would mislead entrants. (1) It treats BCBC 2024 and the provincial Step Codes as governing, yet the Province says BC Codes do not apply in Vancouver. (2) It misreads BCBC 2018 Sentence 3.2.6.2.(2): the 1% stair-smoke limit over 2 h is a code requirement for stairs below the lowest exit level, not a case target for tower stairs. (3) The lift engine leaves out the express-zone travel time, credits its formula to a source that does not print it, and counts passenger shafts only. Several UK/Australian targets are labelled 'verified' without any check that they apply in Vancouver. Web search was exhausted in this run, so BCO currency, plumbing-pressure and travel-distance values rest on checklist evidence and expert knowledge and need confirming.
