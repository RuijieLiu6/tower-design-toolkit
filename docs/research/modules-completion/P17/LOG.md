# modules-completion / P17: research log

## critic-r2: AEC technology analyst who evaluates design software. I reviewed P17 round 2 (revise-r1) against live vendor, City of Vancouver, competition and course-repo pages on 21 Oct 2026, this time with web search available.
- Gate pass: **False**
  - condition: Correct Forma access and analyses with the Autodesk blog source; mark the eligibility details for a person to confirm.
  - condition: Correct Snaptrude to its free Student Plan and SimScale to include its academic and competition sponsorship routes, with the public-project anonymity warning.
  - condition: Replace 'View Protection Guidelines' with the 2024 Public Views Guidelines everywhere, and cite the Council decision and the Higher Buildings Policy Review page.
  - condition: Close the Infrared UNRESOLVED flag in the reviser's favour.
  - condition: Add sourced inputs (the UNDRIP Strategy and the Nations' own material) to step 0b.
  - condition: Split automatable_or_judgment into code / AI / people fields.
  - condition: Log the round-2 search pass and the negative results (Finch, TestFit).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Autodesk Forma access for a VTC student team is UNKNOWN, and its analyses (sun, wind, noise, carbon) can only be stated as uncitable general knowledge. → Forma is free for students and educators (vendor statement; a team member should confirm eligibility while logged in). Sun, noise, wind and embodied-carbon analyses are vendor-stated. Daylight and supertall validity remain unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Snaptrude has no student or education offer; a 4-person team needs four free single-user accounts or a paid plan. → Snaptrude is free for enrolled architecture, design and engineering students and educators, with team collaboration. Whether 'educational use only' covers a prize competition is unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vancouver's View Protection Guidelines (with the Higher Buildings Policy) govern the protected-view envelope for the VTC tower (step 1b, step 0, UNVERIFIED flag). → Use the Public Views Guidelines (2024) and the City's 24-record view-cone dataset as the current basis. Heights still need a person to open the PDF.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: SimScale has no academic or student plan (S58 case study). → Possible routes: Community (public projects, 10 quantitative simulations, no PWC) or the Academic Sponsorship Plan by application (terms unknown). The Free Academic Plan targets thesis students and excludes PWC.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: (r1 critique, logged UNRESOLVED) Infrared.city's 'Students & small studies' label belongs to the Starter tier, not the Free tier. → Free tier: 'Students & small studies', 900 one-time tokens, 42-day expiry. Close the flag and keep the reviser's extract.
- Findings: {'MAJOR': 6, 'MINOR': 8}
- Verdict: Round 2 is a large and honest improvement. Most r1 items are fixed, the derived numbers check out (11,468 m2, 103,200 m2, 40 days, 15:59 Pacific), and the reviser was right to reject the r1 critic's Infrared claim. It still fails the gate on facts an entrant would act on. Autodesk Forma is free for students and educators and has vendor-stated sun, wind and noise analyses, yet the packet calls its access unknown. Snaptrude has a free Student Plan. SimScale offers competition sponsorship. Step 1b cites the View Protection Guidelines, which the 2024 Public Views Guidelines replaced. The cultural step has no sources, the code/AI/people split is missing, and time shares are still unmeasured. All of these can be fixed in one short revision.

## revise-r2: draft saved as `revise-r2_P17.json`
  - Round 1 (21 Oct 2026): initial packet. WebSearch budget for the turn was already exhausted, so no searches were run; all evidence comes from direct fetches of vendor pages, GitHub repos and the course repo.
  - Autodesk Forma official pages, the Higher Buildings Policy PDF and its review PDF returned HTTP 403, so Forma statements are flagged UNVERIFIED and the two policy documents were not used.
  - Archistar re-characterised as AI PreCheck (plan review) and cove.tool flagged UNRESOLVED after opened pages contradicted the scope's implied descriptions.
  - Course demo repo GenEnv/Arch540_2026 was reachable and read (README, PROMPTS, rules, brief, check.py, lot area from notes, notes on reviewer and hook).
  - No modules defined for this packet (modules may be empty); as-is workflow built as a 10-step table with derived numbers labelled.
  - r1: web search was again unavailable (budget exhausted), so all r1 research is direct page fetches; negative results on education offers are recorded as 'not found on the pages opened'.
  - r1: cove.tool resolved: product persists as analysis.tool for existing clients only; educational licences stopped 1 Oct 2025 and access ended 31 Dec 2025; FALSE_ASSUMPTION flag added; marked not usable by VTC student teams.
  - r1: Speckle corrected: free for students and educators, free academic workspace by email application, Explore plan also has a 100-version cap and 30-day history; 'a 4-person team must pay' removed; academic terms flagged UNVERIFIED.
  - r1: Giraffe corrected: free licences for students and universities, no trial expiry; Vancouver data still UNVERIFIED; Core plan lists 3D modelling, studio framework includes massing.
  - r1: Arch540 demo case study split into B_testfit, C_design_space and D_team with correct attribution (255 vs 223 homes belongs to D step 3, the counter-bypass import to C step 3); demos C and D added as templates for CLIM and PROG modules.
  - r1: Ladybug licence resolved from LICENSE files (AGPL v3; Butterfly GPL-3.0+); AGPL section 13 consequence stated and the platform-licence decision handed to the DATA packet; 'dominant stack' relabelled team assumption.
  - r1: TestFit corrected: mixed-use claimed for Site Solver (FAQ), office and tower not listed, universities page exists with no stated terms.

## critic-r3: Studio reviewer and source gatekeeper (round 3, packet P17: case study of existing tools and the as-is workflow)
- Gate pass: **False**
  - condition: Open the VTC brief and site files (registered member, before 29 Oct). Add them as a source and re-cite every brief-derived claim, including 4 x A2 and 10 MB, or label it unverified.
  - condition: Fix the step 8 and 9 citations so that S01 is used only for what it states.
  - condition: Correct SimScale: LBM and PWC are excluded from Community and the Free Academic Plan; wind needs the Sponsorship Plan.
  - condition: Georeference the site and run the S54 cone intersection; record which cones apply.
  - condition: Publish an owner, deadline and source-ID table for every 'a person must' action, including the Q&A questions due 3 Nov.
  - condition: Add a competition-use UNVERIFIED flag covering all education and academic licences, not only Snaptrude.
  - condition: Retitle the as-is workflow as a hypothesis until at least two interviews are recorded, and remove ranking language.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Board count, size and the 10 MB file limit used in the step 8 and 9 pre-flight checks come from the competition page (S01) → Cite 4 x A2 and 10 MB to the brief once a registered member opens it. Until then, label them 'project description, unverified'.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: SimScale Community or the Free Academic Plan is a usable CFD route for the wind study ('a real CFD route if a surrogate is not trusted'; 'usable before 30 Nov: yes for basic CFD on Community') → Urban and pedestrian wind on SimScale needs the Academic Sponsorship Plan (terms unknown) or a paid plan. Community and Free Academic give at most limited steady incompressible CFD.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Demo D's round counts (4 of 12 failed, 12 of 12 passed) are inferred totals with no run count stated → State as given: across three runs, 4 of 12 failed in round 1 (3 play-area sun, 1 park shadow) and 12 of 12 passed in round 2. Mark the 255 vs 223 comparison as n=1.
- Findings: {'BLOCKER': 1, 'MAJOR': 6, 'MINOR': 7}
- Verdict: Round 3 fixed every BLOCKER and MAJOR from round 2 except the interviews, and the vendor facts I re-read mostly hold. The packet is still not reliable for entrants. After three rounds the VTC brief has never been opened, yet steps 8 and 9 cite the 4 x A2 and 10 MB limits to S01, which does not state them. Other brief content carries no source at all. SimScale is presented as a wind route although LBM and PWC are excluded from both free plans. The site is not georeferenced, so the view-cone check, which could run today, has not. Every 'a person must' action lacks an owner and deadline, and registration closes on 29 Oct. The as-is workflow is still interview n=0. The gate fails until the brief is opened and the action owners are assigned.

## revise-r3: draft saved as `revise-r3_P17.json`
  - Round 1 (21 Oct 2026): initial packet. WebSearch budget for the turn was already exhausted, so no searches were run; all evidence comes from direct fetches of vendor pages, GitHub repos and the course repo.
  - Autodesk Forma official pages, the Higher Buildings Policy PDF and its review PDF returned HTTP 403, so Forma statements are flagged UNVERIFIED and the two policy documents were not used.
  - Archistar re-characterised as AI PreCheck (plan review) and cove.tool flagged UNRESOLVED after opened pages contradicted the scope's implied descriptions.
  - Course demo repo GenEnv/Arch540_2026 was reachable and read (README, PROMPTS, rules, brief, check.py, lot area from notes, notes on reviewer and hook).
  - No modules defined for this packet (modules may be empty); as-is workflow built as a 10-step table with derived numbers labelled.
  - r1: web search was again unavailable (budget exhausted), so all r1 research is direct page fetches; negative results on education offers are recorded as 'not found on the pages opened'.
  - r1: cove.tool resolved: product persists as analysis.tool for existing clients only; educational licences stopped 1 Oct 2025 and access ended 31 Dec 2025; FALSE_ASSUMPTION flag added; marked not usable by VTC student teams.
  - r1: Speckle corrected: free for students and educators, free academic workspace by email application, Explore plan also has a 100-version cap and 30-day history; 'a 4-person team must pay' removed; academic terms flagged UNVERIFIED.
  - r1: Giraffe corrected: free licences for students and universities, no trial expiry; Vancouver data still UNVERIFIED; Core plan lists 3D modelling, studio framework includes massing.
  - r1: Arch540 demo case study split into B_testfit, C_design_space and D_team with correct attribution (255 vs 223 homes belongs to D step 3, the counter-bypass import to C step 3); demos C and D added as templates for CLIM and PROG modules.
  - r1: Ladybug licence resolved from LICENSE files (AGPL v3; Butterfly GPL-3.0+); AGPL section 13 consequence stated and the platform-licence decision handed to the DATA packet; 'dominant stack' relabelled team assumption.
  - r1: TestFit corrected: mixed-use claimed for Site Solver (FAQ), office and tower not listed, universities page exists with no stated terms.

## critic-r4: Studio reviewer and gatekeeper. I audit the cited sources in the P17 case study (existing tools and as-is workflow) for VTC entrants, checking whether the workflow stands on its own terms, whether delegation is clear and whether every claim has a source.
- Gate pass: **False**
  - condition: A1 done: brief and site files opened by a registered member before 29 Oct, added as an opened source with page numbers; every S78 figure confirmed or corrected; block coordinates and true north recorded
  - condition: A4 done: view-cone intersection run for the real block corners and centre, with cone numbers recorded
  - condition: At least two interviews recorded per step_id, or the packet states explicitly that no step ranking may be used downstream (owners and recruits named by 24 Oct)
  - condition: Step 1 and S54 corrected to cite City LiDAR 2022 and the DEM
  - condition: S75 extract and the S15 STL/FBX claim corrected or sourced
  - condition: Action owners confirmed by the team and the actions table stored as structured data
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City of Vancouver open data has no 3D massing or topography dataset (S54 title search; step 1 input 'no 3D massing dataset appeared') → Context massing and topography can be derived from City LiDAR 2022 and the DEM. Cite them in step 1 and note the 2022 capture date.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Higher Buildings Policy Review FAQ (S75) does not address protected views → S75 mentions public-view protection as a consideration. It does not define protected views or say whether competition entries are binding.
- Findings: {'BLOCKER': 1, 'MAJOR': 2, 'MINOR': 8}
- Verdict: Not passed. Round 4 fixed the r3 citation errors honestly. SimScale, S01 scoping, competition-use flags, demo attributions and an action table are all correct, and the 11 sources I spot-checked mostly match. An entrant still cannot rely on it. The brief has never been opened, so heights, FSR, jury weights, board limits and site location rest on an unverified team text. The block is not located, so the view-cone check cannot run. The as-is workflow, the packet's core, has no interviews behind it. One new factual error: City LiDAR 2022 and DEM data exist, but the spec says no 3D or topography data was found. The S75 'protected views not addressed' line is also wrong. The gate passes once A1 and A4 are done before 29 Oct and interviews are recorded.
