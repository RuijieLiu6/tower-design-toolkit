# modules / P13: research log

## research: draft saved as `research_P13.json`
  - R1: First specification of P13: 8 modules (M01 tracker, M02 drawing extraction, M03 camera presets, M04 conditioning capture, M05 AI render pipeline, M06 board layout and export, M07 jury rubric, M08 writing support and AI ledger).
  - R1: Added Buildner Terms rules not in the scope text: JPEG-only panels, 10 MB cap, portal upload only, no previous publication of visuals, no AI rule; flagged PDF-as-submission as a false assumption.
  - R1: Added deadline conversion (23:59 London = 15:59 Vancouver) and 40 days remaining from 21 Oct 2026.
  - R1: Found current OpenAI image models (gpt-image-2.5-sunburst, -flare, gpt-image-2) and token pricing; flagged names and C2PA statements as unverified.
  - R1: Added anonymity risks (EXIF/XMP, C2PA signer identity) and a re-scan step after metadata stripping.
  - R1: Research limits: the shared web-search budget ran out mid-task, so some searches were not repeated; City of Vancouver sites (vancouver.ca, guidelines.vancouver.ca, syc.vancouver.ca), the OpenAI Help Center and COPE returned 403 or 404 and are marked unopened or omitted.

## critic-r1: Architect and international ideas-competition juror reviewing the P13 Presentation and Submission spec (round 1)
- Gate pass: **False**
  - condition: Obtain and cite the brief PDF; reclassify every S01-only 'verified' rule until it has been read
  - condition: Correct the Vancouver deadline to 16:59 (UTC-7) and store the deadline as a UTC instant
  - condition: Add the registration, verification and upload-lock checks to M01
  - condition: Fix the M01 language rule so Indigenous names are allowed
  - condition: Add section_scale and the corrected M02 sources, and specify the hidden-line method
  - condition: Add the rights register and break the dependency cycles
  - condition: Re-plan the core scope so the disqualification-protection modules ship first
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Closing at 23:59 London time on 30 Nov 2026 equals 15:59 Vancouver (PST); the spec flags 'end of day Vancouver' as FALSE ASSUMPTION with this correction. → 23:59 GMT on 30 Nov 2026 = 16:59 Vancouver (UTC-7). Store the deadline as 2026-11-30T23:59Z (Terms 4.7 say 24:00 London time, so use the earlier of the two) and do not rely on the browser's tzdata being current.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The exact QE Park view-cone origin/azimuth cannot be obtained because City hosts return 403. → Derive the QE Park cone origins and azimuths (3.2.1-3.2.4) from the open dataset. Only the ceiling heights remain unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Number of panels (4), number of ground-level perspectives (>=4) and the landscape A2 rule are 'verified'. → Set the status to unverified (team-supplied) until the brief PDF is read, and record whether the panel count is exact or a maximum.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Rhino Make2D supplies the hidden-line layers (cited as P13-S30). → Cite P13-S27 for Make2D, and specify a separate method for hidden lines or remove the class from the core scope.
- Findings: {'BLOCKER': 1, 'MAJOR': 10, 'MINOR': 8}
- Verdict: The spec is well researched and honest about its limits, but it is not yet safe for entrants to rely on. The hard rules marked 'verified' rest on a brief that was never opened, and the panel count is set by that brief. The spec's own deadline correction is wrong: BC moved to permanent UTC-7 in 2026, so the close is 16:59 Vancouver time, not 15:59. Registration (closes in 8 days), identity verification and the first-upload lock are missing. A literal English-only check would penalise Indigenous names. A 300 m section cannot fit A2 at 1:500. There is no rights register, although the Buildner terms can demand licences. The module dependencies form cycles. These are fixable; fix them, then pass.

## revise-r1: draft saved as `revise-r1_P13.json`
  - R1: First specification of P13: 8 modules (M01 tracker, M02 drawing extraction, M03 camera presets, M04 conditioning capture, M05 AI render pipeline, M06 board layout and export, M07 jury rubric, M08 writing support and AI ledger).
  - R1: Added Buildner Terms rules not in the scope text: JPEG-only panels, 10 MB cap, portal upload only, no previous publication of visuals, no AI rule; flagged PDF-as-submission as a false assumption.
  - R1: Added deadline conversion (23:59 London = 15:59 Vancouver) and 40 days remaining from 21 Oct 2026.
  - R1: Found current OpenAI image models (gpt-image-2.5-sunburst, -flare, gpt-image-2) and token pricing; flagged names and C2PA statements as unverified.
  - R1: Added anonymity risks (EXIF/XMP, C2PA signer identity) and a re-scan step after metadata stripping.
  - R1: Research limits: the shared web-search budget ran out mid-task, so some searches were not repeated; City of Vancouver sites (vancouver.ca, guidelines.vancouver.ca, syc.vancouver.ca), the OpenAI Help Center and COPE returned 403 or 404 and are marked unopened or omitted.
  - r1: Corrected the Vancouver closing time from 15:59 PST to 16:59 (UTC-7) after reading tzdb 2026b and the BC time page; deadline stored as UTC instant 2026-11-30T23:59:00Z (earlier of page 23:59 and Terms 4.7 '24.00'); added a runtime Intl offset check and a UNRESOLVED flag for the 23:59 vs 24.00 wording; old 15:59 flag kept with an r1 note.
  - r1: Re-labelled panel count, A2 landscape and >= 4 ground-level views as unverified (team-supplied) with status false_assumption_corrected; M01 now reads a brief_register (PDF hash, page refs, two-person check, exact vs max panel rule, default exact 4) and keeps the Terms 4.8 upper bound of four as the only verified count.
  - r1: Added to M01 the upload prerequisites (UIC, identity verification, registration close warning at 8 days), an upload-once gate (Terms 4.7 lock) and a Q&A changelog; removed the 'export early lowers risk' wording and said that a live-entry test upload is unsafe.
  - r1: Changed the language rule to 'explanatory text in English' with a reviewed Nation-name allow-list plus a font glyph-coverage check (Charis SIL candidate) and NFC normalisation; flagged the interpretation for Q&A.
  - r1: M02: added section_scale (a 305 m tower section is 650 mm at 1:500, 325 mm at 1:1000, so full sections need 1:1000 or partial cuts) with a fit check at preset selection; corrected hidden-line sources from S30 to S27/S25, added a 'line classes by route' metric (false_assumption_corrected), made the Make2D import the v0 core route and noted Rhino.Compute needs Windows Server core-hour billing; reconciliation moved to slab-edge loops with the GFA definition marked unresolved.
  - r1: M03: replaced the Wikipedia park point with the apex of the City's view-cones polygons (cones 3.2.1-3.2.4: 49.24216 N, 123.11244 W, bearings 341.5-19.5 degrees, 5.5-6.2 km, about 186 m from the park point); added site-polygon intersection, a local-origin rule (float32 gives 0.5 m steps at UTM northings), a context-tower check; cone ceilings stay unverified.

## critic-r2: Architectural visualization lead (competition boards, drawing production, AI-assisted rendering), round-2 reviewer of P13
- Gate pass: **False**
  - condition: Brief PDF (and the City policy/guideline PDFs) supplied by the team, hashed and transcribed twice into brief_register before the 6 Nov validator ships; S01-based statuses updated
  - condition: Q&A question pack submitted by 31 Oct and a dated human-task list added (registration warning removed from 6 Nov scope)
  - condition: M03 cone-ceiling metric reframed as a neutral encroachment report tied to the breach register
  - condition: Core nodes made independent of v1 nodes (text frames and language attestation in M06a; M07/M08b as optional ports)
  - condition: Core scope cut to a validator-first plan that fits 34 person-days or fewer after the 11 Nov holiday, with part-time load stated
  - condition: Status model split into evidence status and correction history so M01 and M06 agree on each rule
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The brief PDF 'could not be opened here', so board count, A2 landscape, weights and the 20 items must stay unverified. → The team supplies the PDF to the repo, hashes it and transcribes it twice; the statuses are then updated before the 6 Nov validator ships.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A tower top above the QE Park view-cone ceiling is 'bad' (M03 metric). → Report encroachment neutrally and require a breach-register rationale; do not score it bad.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 21 Oct to 13 Nov offers 18 working days (36 person-days), enough for the 29-34 person-day core. → Re-plan to a validator-first core of about 3 person-days by 6 Nov, and move the composer to v1.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Hidden lines can be obtained as 'all projected edges minus visible' with a clipper2-js difference. → Clip projected edges against the occluding face polygons, or use per-edge interval subtraction.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Vancouver offset check compares the Intl longOffset output with '-07:00'. → Parse the offset into minutes before comparing.
- Findings: {'BLOCKER': 1, 'MAJOR': 4, 'MINOR': 11}
- Verdict: Round 2 is a large improvement. The deadline, view-cone origin, section-scale, hidden-line source, rights-register and dependency-cycle fixes are mostly addressed. The gate still fails. The brief PDF, which the team already holds, is not in the register, so the validator would certify rules nobody has read. The registration warning ships after registration closes, and the open Q&A questions have no owner. The QE Park ceiling metric marks as 'bad' the very encroachment the competition is asking about. Core nodes depend on v1 nodes. The schedule is still saturated once the 11 Nov holiday is counted. A validator-first core plus a Q&A pack due 31 Oct would make the plan workable. Several sources could not be re-checked because of tool limits.

## revise-r2: draft saved as `revise-r2_P13.json`
  - R1: First specification of P13: 8 modules (M01 tracker, M02 drawing extraction, M03 camera presets, M04 conditioning capture, M05 AI render pipeline, M06 board layout and export, M07 jury rubric, M08 writing support and AI ledger).
  - R1: Added Buildner Terms rules not in the scope text: JPEG-only panels, 10 MB cap, portal upload only, no previous publication of visuals, no AI rule; flagged PDF-as-submission as a false assumption.
  - R1: Added deadline conversion (23:59 London = 15:59 Vancouver) and 40 days remaining from 21 Oct 2026.
  - R1: Found current OpenAI image models (gpt-image-2.5-sunburst, -flare, gpt-image-2) and token pricing; flagged names and C2PA statements as unverified.
  - R1: Added anonymity risks (EXIF/XMP, C2PA signer identity) and a re-scan step after metadata stripping.
  - R1: Research limits: the shared web-search budget ran out mid-task, so some searches were not repeated; City of Vancouver sites (vancouver.ca, guidelines.vancouver.ca, syc.vancouver.ca), the OpenAI Help Center and COPE returned 403 or 404 and are marked unopened or omitted.
  - r1: Corrected the Vancouver closing time from 15:59 PST to 16:59 (UTC-7) after reading tzdb 2026b and the BC time page; deadline stored as UTC instant 2026-11-30T23:59:00Z (earlier of page 23:59 and Terms 4.7 '24.00'); added a runtime Intl offset check and a UNRESOLVED flag for the 23:59 vs 24.00 wording; old 15:59 flag kept with an r1 note.
  - r1: Re-labelled panel count, A2 landscape and >= 4 ground-level views as unverified (team-supplied) with status false_assumption_corrected; M01 now reads a brief_register (PDF hash, page refs, two-person check, exact vs max panel rule, default exact 4) and keeps the Terms 4.8 upper bound of four as the only verified count.
  - r1: Added to M01 the upload prerequisites (UIC, identity verification, registration close warning at 8 days), an upload-once gate (Terms 4.7 lock) and a Q&A changelog; removed the 'export early lowers risk' wording and said that a live-entry test upload is unsafe.
  - r1: Changed the language rule to 'explanatory text in English' with a reviewed Nation-name allow-list plus a font glyph-coverage check (Charis SIL candidate) and NFC normalisation; flagged the interpretation for Q&A.
  - r1: M02: added section_scale (a 305 m tower section is 650 mm at 1:500, 325 mm at 1:1000, so full sections need 1:1000 or partial cuts) with a fit check at preset selection; corrected hidden-line sources from S30 to S27/S25, added a 'line classes by route' metric (false_assumption_corrected), made the Make2D import the v0 core route and noted Rhino.Compute needs Windows Server core-hour billing; reconciliation moved to slab-edge loops with the GFA definition marked unresolved.
  - r1: M03: replaced the Wikipedia park point with the apex of the City's view-cones polygons (cones 3.2.1-3.2.4: 49.24216 N, 123.11244 W, bearings 341.5-19.5 degrees, 5.5-6.2 km, about 186 m from the park point); added site-polygon intersection, a local-origin rule (float32 gives 0.5 m steps at UTM northings), a context-tower check; cone ceilings stay unverified.

## critic-r3: Graphic designer specialising in competition boards; gatekeeper auditing cited sources and VTC rules (round 3, packet P13)
- Gate pass: **False**
  - condition: G-00 eligibility gate added, and a written organiser answer on Terms 3.3.5 (UBC SALA students vs juror affiliation) logged before the registration fee is paid
  - condition: Q&A pack re-routed to the organiser contact (Ask the Jury only if the portal shows it), sent by 30 Oct, with answers logged by 3 Nov
  - condition: brief_register populated (English PDF SHA-256, page numbers, second check, language version) by 24 Oct, before any validator release; S01 statuses updated
  - condition: M03 encroachment report extended to all 24 view cones and tied to a declared site_georeference
  - condition: OpenAI ZDR statement corrected for the 2.5 models
  - condition: Structured evidence_status field used by all typed nodes; rule-id registry complete
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Ask the Jury gives one free question per registration for VTC, so the brief question (Nation names) uses that slot (qa_question_budget; Q&A pack Q1). → Send all questions, Q1 included, to the organiser contact by 30 Oct, before the 3 Nov Q&A close. Use Ask the Jury only if the portal shows it after registration.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The gpt-image-2.5 models are not on OpenAI's zero-data-retention list (P13-M05 data_retention, S54, OpenAI UNVERIFIED flag). → The 2.5 models are ZDR-eligible with limitations: 30-day abuse-monitoring retention by default, and CSAM-flagged inputs are retained even under ZDR. Log whether ZDR is actually enabled.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Only the Queen Elizabeth Park cones 3.2.1-3.2.4 matter for a CBD tower's protected-view check. → Intersect the site and the tower with all 24 cones and report each one neutrally.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Entrant eligibility needs no check beyond identity verification and team size (G-01, G-02). → Add an eligibility gate and get a written answer from the organiser before paying the fee.
- Findings: {'BLOCKER': 1, 'MAJOR': 4, 'MINOR': 5}
- Verdict: Round 3 fixes most round-2 items in the spec text: the register gate, the neutral encroachment report, optional ports, the validator-first plan and the longOffset parsing. The gate still fails. A juror is listed with UBC SALA and Terms 3.3.5 exclude associates of the Jury, yet the spec has no eligibility gate and its first users are SALA students paying on 27 Oct. Q1 depends on an Ask the Jury channel that the VTC page does not offer. M03 checks 4 of 24 protected cones, on a hypothetical site whose placement is never declared. The brief register is still empty, and the statement on OpenAI ZDR for the 2.5 models is wrong. The web-search budget was exhausted; all checks used direct fetches.

## revise-r3: draft saved as `revise-r3_P13.json`
  - R1: First specification of P13: 8 modules (M01 tracker, M02 drawing extraction, M03 camera presets, M04 conditioning capture, M05 AI render pipeline, M06 board layout and export, M07 jury rubric, M08 writing support and AI ledger).
  - R1: Added Buildner Terms rules not in the scope text: JPEG-only panels, 10 MB cap, portal upload only, no previous publication of visuals, no AI rule; flagged PDF-as-submission as a false assumption.
  - R1: Added deadline conversion (23:59 London = 15:59 Vancouver) and 40 days remaining from 21 Oct 2026.
  - R1: Found current OpenAI image models (gpt-image-2.5-sunburst, -flare, gpt-image-2) and token pricing; flagged names and C2PA statements as unverified.
  - R1: Added anonymity risks (EXIF/XMP, C2PA signer identity) and a re-scan step after metadata stripping.
  - R1: Research limits: the shared web-search budget ran out mid-task, so some searches were not repeated; City of Vancouver sites (vancouver.ca, guidelines.vancouver.ca, syc.vancouver.ca), the OpenAI Help Center and COPE returned 403 or 404 and are marked unopened or omitted.
  - r1: Corrected the Vancouver closing time from 15:59 PST to 16:59 (UTC-7) after reading tzdb 2026b and the BC time page; deadline stored as UTC instant 2026-11-30T23:59:00Z (earlier of page 23:59 and Terms 4.7 '24.00'); added a runtime Intl offset check and a UNRESOLVED flag for the 23:59 vs 24.00 wording; old 15:59 flag kept with an r1 note.
  - r1: Re-labelled panel count, A2 landscape and >= 4 ground-level views as unverified (team-supplied) with status false_assumption_corrected; M01 now reads a brief_register (PDF hash, page refs, two-person check, exact vs max panel rule, default exact 4) and keeps the Terms 4.8 upper bound of four as the only verified count.
  - r1: Added to M01 the upload prerequisites (UIC, identity verification, registration close warning at 8 days), an upload-once gate (Terms 4.7 lock) and a Q&A changelog; removed the 'export early lowers risk' wording and said that a live-entry test upload is unsafe.
  - r1: Changed the language rule to 'explanatory text in English' with a reviewed Nation-name allow-list plus a font glyph-coverage check (Charis SIL candidate) and NFC normalisation; flagged the interpretation for Q&A.
  - r1: M02: added section_scale (a 305 m tower section is 650 mm at 1:500, 325 mm at 1:1000, so full sections need 1:1000 or partial cuts) with a fit check at preset selection; corrected hidden-line sources from S30 to S27/S25, added a 'line classes by route' metric (false_assumption_corrected), made the Make2D import the v0 core route and noted Rhino.Compute needs Windows Server core-hour billing; reconciliation moved to slab-edge loops with the GFA definition marked unresolved.
  - r1: M03: replaced the Wikipedia park point with the apex of the City's view-cones polygons (cones 3.2.1-3.2.4: 49.24216 N, 123.11244 W, bearings 341.5-19.5 degrees, 5.5-6.2 km, about 186 m from the park point); added site-polygon intersection, a local-origin rule (float32 gives 0.5 m steps at UTM northings), a context-tower check; cone ceilings stay unverified.

## critic-r4: Graphic designer specialising in competition boards; gatekeeper auditing cited sources and VTC rules (round 4, packet P13)
- Gate pass: **False**
  - condition: brief_register populated and double-checked (English PDF SHA-256, filename, page numbers, site plan and 3D-model hashes, site placement, skyline-viewpoint definition, any file-naming rule) before any entrant-facing release; S01 evidence statuses updated
  - condition: C8 extended to ask who the Organizer is under 3.3 (Buildner vs City and UBC) and whether UBC or City employees and SALA students are eligible; written answer logged, or an N-signed accepted-risk decision recorded, before identity verification or fees
  - condition: Identity verification moved after C8 is answered or risk is accepted (7.4.1)
  - condition: No-contact rule added: no City or juror contact about the competition; all questions through Buildner; views@vancouver.ca and 'confirmed by the City' removed from M03
  - condition: Gate-state semantics defined so that accepted-risk G-00 neither deadlocks M06c nor shows as pass
  - condition: G-04 extended to scan the public repo and community store; tool branding removed from templates and captions and added to the deny-list
  - condition: Core re-encode action in M06v or tested desktop export recipes available to entrants before 6 Nov
  - condition: evidence_status corrected for HR-06, G-01, G-03, G-05, D-01 and the M02 cut-height metric
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Cone ceilings can be 'confirmed by the City' and views@vancouver.ca is a usable contact for the encroachment report (P13-M03 method and human_judgment; S47). → Read only public City documents. Route ceiling and viewpoint questions to Buildner (new C11). Do not contact City staff about the entry before winners are announced.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Identity verification can start on Fri 23 Oct 'once C8 is sent' while G-00 'comes first' (P13-M01 registration_close and task_timeline). → Start verification only after C8 is answered, or after a logged, N-signed risk-accepted decision on 27 Oct; registration closes 29 Oct, worst case 28 Oct 17:00 Vancouver.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Eligibility risk under Terms 3.3.5 comes only through being an 'associate' of a juror (G-00, C8, F38, F39). → Ask Buildner who the Organizer is under 3.3, and add UBC and City employment to the per-member attestation.
- Findings: {'BLOCKER': 2, 'MAJOR': 5, 'MINOR': 6}
- Verdict: Gate fails. Round 3 fixes landed: Q&A routing, all 24 cones, site_georeference, ZDR and the rule registry. But entrants still cannot rely on P13. The brief register is empty, so every board rule remains a project-description transcription. Eligibility is only half-covered: the Terms never name the Organizer, while the page lists the City and UBC SALA as collaborators, and verification fees would be spent before C8 is answered. The method plans City contact, against the Buildner-only rule. Accepted-risk G-00 can deadlock release. The public repo is outside the previous-publication gate. Before 30 Nov entrants get a validator that cannot repair a failing JPEG. Web search budget was exhausted, so checks used direct fetches only.
