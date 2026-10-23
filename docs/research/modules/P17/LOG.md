# modules / P17: research log

## research: draft saved as `research_P17.json`
  - Round 1 (21 Oct 2026): initial packet. WebSearch budget for the turn was already exhausted, so no searches were run; all evidence comes from direct fetches of vendor pages, GitHub repos and the course repo.
  - Autodesk Forma official pages, the Higher Buildings Policy PDF and its review PDF returned HTTP 403, so Forma statements are flagged UNVERIFIED and the two policy documents were not used.
  - Archistar re-characterised as AI PreCheck (plan review) and cove.tool flagged UNRESOLVED after opened pages contradicted the scope's implied descriptions.
  - Course demo repo GenEnv/Arch540_2026 was reachable and read (README, PROMPTS, rules, brief, check.py, lot area from notes, notes on reviewer and hook).
  - No modules defined for this packet (modules may be empty); as-is workflow built as a 10-step table with derived numbers labelled.

## critic-r1: Practising architect at a tall-building design firm. I reviewed P17 (tool case studies and the current, as-is competition workflow) against the live vendor, course-repo and competition pages on 21 Oct 2026.
- Gate pass: **False**
  - condition: Correct the seven false assumptions (cove.tool status, Speckle academic, Giraffe education, demo attribution, Ladybug AGPL, TestFit mixed-use, Infrared tier label) and cite the new sources.
  - condition: Add the as-is steps for protected views and skyline, cultural and reconciliation research, sustainability and carbon, plans and sections, and the policy reflection.
  - condition: Map each case study and step to taxonomy codes, jury tags and as-is step ids.
  - condition: Add access for a VTC student team before 30 Nov to every case study.
  - condition: Remove the unsourced Forma analysis list from verified fields, or have a person open the Autodesk pages and record what they show.
  - condition: Record the AGPL consequence for a web-hosted tool and hand the decision to the DATA packet.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The cove.tool SaaS is not described anywhere on the cove.inc pages, and its availability cannot be confirmed. → analysis.tool is still live for existing clients. Educational licences stopped on 1 Oct 2025 and academic access ended on 31 Dec 2025, so it is not available to student VTC teams.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Speckle's free plan caps at 3 users, so a 4-person VTC team would exceed it (implying it must pay). → For a UBC team, apply to the academia programme (academia@speckle.systems). Explore plan limits are 1 project, 3 users including external collaborators, 100 versions and 30-day history.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Giraffe has no education pricing, and its free-plan and education terms are unconfirmed. → Giraffe is free for education (vendor statement). Coverage of Vancouver data remains unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: In B_testfit, hand estimates were wrong (255 vs 223 homes measured), and the guard was bypassed by a counter import. → Attribute each claim to demo D and demo C respectively. B_testfit's own evidence is the three runs of 16,272, 13,968 and 15,552 m2 and the gate.py block (R2 gap 12.0 m, needs 26.9 m).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Ladybug licence is unresolved, and the AGPL/GPL difference does not matter ('copyleft either way'). → Treat ladybug, ladybug-grasshopper and honeybee-radiance as AGPL-3.0. Server-side use in the web tool triggers source-offer obligations.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: TestFit does not show tall mixed-use buildings (it is only parking, multi-family and similar). → Mixed-use is claimed for Site Solver (from USD 15,000/yr). Office and high-rise or tower are not listed; tower capability is unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Infrared.city's free tier is aimed at students and small studies (S31 extract). → Free: 900 one-time tokens that expire 42 days after sign-up. Starter: EUR 240/yr, described as for students and small studies.
- Findings: {'MAJOR': 11, 'MINOR': 6}
- Verdict: The packet is careful and honestly flagged, and its prices check out. It still fails round 1. Seven claims are contradicted by evidence the authors could have opened: cove.tool's academic access ended in December 2025; Speckle and Giraffe are free for education; the demo evidence is attributed to the wrong demos; Ladybug is AGPL, which matters for a web tool; TestFit claims mixed-use; and the Infrared tier is mislabelled. The as-is workflow leaves out protected views and the skyline, cultural and reconciliation research (30% of the jury weight), sustainability, and plans and sections. Its time shares are unmeasured. Nothing is mapped to the module taxonomy or jury tags, and there is no field for what a student team can access before 30 Nov. My web-search budget was exhausted, so Forma and the policy PDFs remain unverified.

## revise-r1: draft saved as `revise-r1_P17.json`
  - Round 1 (21 Oct 2026): initial packet. WebSearch budget for the turn was already exhausted, so no searches were run; all evidence comes from direct fetches of vendor pages, GitHub repos and the course repo.
  - Autodesk Forma official pages, the Higher Buildings Policy PDF and its review PDF returned HTTP 403, so Forma statements are flagged UNVERIFIED and the two policy documents were not used.
  - Archistar re-characterised as AI PreCheck (plan review) and cove.tool flagged UNRESOLVED after opened pages contradicted the scope's implied descriptions.
  - Course demo repo GenEnv/Arch540_2026 was reachable and read (README, PROMPTS, rules, brief, check.py, lot area from notes, notes on reviewer and hook).
  - No modules defined for this packet (modules may be empty); as-is workflow built as a 10-step table with derived numbers labelled.
  - r1: web search was again unavailable (budget exhausted), so all r1 research is direct page fetches; negative results on education offers are recorded as 'not found on the pages opened'.
  - r1: cove.tool resolved: product persists as analysis.tool for existing clients only; educational licences stopped 1 Oct 2025 and access ended 31 Dec 2025 (new sources S47, S48); FALSE_ASSUMPTION flag added; marked not usable by VTC student teams.
  - r1: Speckle corrected: free for students and educators, free academic workspace by email application (S49), Explore plan also has a 100-version cap and 30-day history; 'a 4-person team must pay' removed from stops_at and notes; academic terms flagged UNVERIFIED.
  - r1: Giraffe corrected: free licences for students and universities, no trial expiry (S50); Vancouver data still UNVERIFIED; Core plan lists 3D modelling (S34), studio framework includes massing.
  - r1: Arch540 demo case study split into B_testfit, C_design_space and D_team with correct attribution: 255 vs 223 homes belongs to D step 3, the counter-bypass import to C step 3, B keeps its three runs, reviewer and gate.py evidence. Added demo C (winter-sun trade-off front on an 80 x 60 m Vancouver lot) and demo D (constraints helper catching a 250-vs-239 homes FSR contradiction) as templates for CLIM and PROG modules (S09, S56, S57).
  - r1: Ladybug licence resolved from LICENSE files (AGPL v3, S61, S21, S22; Butterfly GPL-3.0+); consequence under AGPL section 13 stated precisely (applies to modified versions offered over a network; unmodified use is a legal question) and the platform-licence decision handed to the DATA packet; 'dominant stack' relabelled as team assumption; Butterfly 2017 and unknown maintenance noted.
  - r1: TestFit corrected: mixed-use claimed for Site Solver (FAQ), office and tower not listed, universities page exists (S51) with no stated terms.
