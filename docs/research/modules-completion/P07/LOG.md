# modules-completion / P07: research log

## critic-r2: Researcher in AI ethics and authorship in architecture. Independent round-2 review of P07 (cultural context, reconciliation and ethics), focused on competition-rule compliance, authorship and provenance, and whether sources are current.
- Gate pass: **False**
  - condition: Extend the contact guard to all seven jurors and their firms (including UBC SALA / Matthew Soules), the Commissioning Party and Buildner cultural advisors; add a Terms 3.3.5 eligibility check
  - condition: Add a competition-project privacy mode so no entry asset, handle or fork is public before 26 Jan 2027
  - condition: Gate any module that renders Nation-language strings or cultural prompts (including M06) on Indigenous review, regardless of category; state plainly which modules entrants get before 30 Nov
  - condition: Correct the view-cone flag (Public Views Guidelines 2024, 24 retained views) and the Higher Buildings Policy title and status
  - condition: Add DRIPA current status to M02; update the EU Art. 50 and C2PA versions
  - condition: Revise the Q&A plan to Terms 10.10 (1 Nov vs 3 Nov, one free question, top-5 vote) with N0 as the standing default
  - condition: Open the VTC brief as a registered entrant and confirm weights, the anonymity clause and site location before 13 Nov
  - condition: Add human_contribution and decided_by authorship fields and the IPTC mapping in M07
  - condition: Fix the Sen̓áḵw services-agreement and plaza-naming flags
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The City view-cone dataset may be partial because view numbers 1-2, 4-8, 11-19, 23-26 and letters C, F, I are absent (r1 FALSE_ASSUMPTION flag and M06 metric basis). → The 24-record dataset is consistent with the current set under the Public Views Guidelines (2024). Zero intersections is still not clearance, because heights and origin points are not in the data.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The governing document is the 'Higher Buildings Policy for Rezonings (1997)', and whether it has been amended is unverified (S36, UNVERIFIED flag). → Cite 'Higher Buildings Policy (adopted 1997, amended to July 2018), under review 2026-27'.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: No source describes a services agreement between Sen̓áḵw and the City (UNVERIFIED flag; M04 field marked unverified). → Record the agreement as fact. Tenure: reserve land, no City land-use approvals required, City services by agreement.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The downtown plaza naming precedent could not be found, and the critic's Vancouver Art Gallery example is unverified. → Add the precedent with the process as reported ('chosen by a committee', not 'gifted'). Ownership is still unverified.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: EU AI Act Article 50 applies from 2 Aug 2026 (S42 extract). → Art. 50(2) is reportedly from 2 Dec 2026, to be checked in the Official Journal. It remains a benchmark only.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Q&A route closes 3 Nov 2026 and can settle whether a Nation-contact channel exists (UNRESOLVED flag, M01 method). → Show both dates. An answer is not assured, so N0 is the standing default.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Contacting the one Coast Salish juror and her firm is the juror-contact risk (M01 contact_guard). → The guard must cover all seven jurors and their firms, the commissioning party and Buildner's cultural advisors.
- Findings: {'BLOCKER': 2, 'MAJOR': 9, 'MINOR': 8}
- Verdict: Not ready, but much improved. The r1 revision fixed the referral checklist, the per-Nation ladder, the charter claim, Unicode handling and export-time anonymity. Two compliance gaps could still get entrants disqualified. First, the contact guard names one juror but omits UBC SALA's Matthew Soules, the other jurors and the 'Commissioning Party'. Second, a forkable, public platform can publish or de-anonymise entries before results. The release gate is keyed to module category, so M06 can show Nation names without review. Several flags are now contradicted by evidence: the gaps in the view-cone data are explained by the 2024 Public Views Guidelines, the Higher Buildings Policy was amended in 2018, and the Sen̓áḵw services agreement and the 2018 plaza names are on record. DRIPA status, AI-authorship fields and the brief itself are still missing.

## revise-r2: draft saved as `revise-r2_P07.json`
  - Round 1: first draft of 8 modules (M01-M08) for packet P07 with 46 sources, of which 6 are opened=false.
  - Round 1: scope correction recorded: Sen̓áḵw is Squamish-led, not MST-led; MST precedents are Jericho Lands and Heather Lands.
  - Round 1: no Canadian Indigenous design charter found; M03 built as source-locked prompt cards instead of a scored rubric.
  - Round 1: web-search budget exhausted mid-task; all City of Vancouver domains returned HTTP 403; verification of City documents deferred to a human in a browser.
  - Round 1: design decision: no module outputs a numeric 'culture score'; numeric outputs are limited to geometry and completeness counts.
  - r1: M01 rebuilt: one N0-N4 ladder per Nation with a counterpart type; duty-sense 'consulted' banned; 'approved' or 'endorsed by' needs an authorized-decision reference; E2 renamed to a logged organizer question.
  - r1: M01 referral checklist moved out of the entrant flow to reference-only for real projects; metric set to false_assumption_corrected; M01 contact guard added (juror contact, Terms cl. 5.2, 8.3).
  - r1: Release gate added (M08 review_state): paid Indigenous reviewer sign-off before any CULT module reaches entrants; M01 stage A and M07 may ship as unreviewed beta; M02, M03, M05, M08 to v1; M04 to roadmap.
  - r1: M03 rebuilt on the charter's ten protocols (names and one-line paraphrases, linked); expression-channel lock unless N4; Nation-published card status only on a Nation's own request.
  - r1: FALSE_ASSUMPTION flags added: charter principles retrievable; charter contributors; referral metric; personal-data metric; Local Contexts Notice names; view-cone set completeness.
  - r1: Affected metrics set to false_assumption_corrected: M01 referral-pack completeness, M06 view cones touched, M07 identity-bearing fields in export.
  - r1: M02 tags every item applies-to and locks FPIC items as not claimable; separate urban Indigenous card set added. M04 gained downtown precedents and source-conflict chips. M05 gained form-level appropriation phrases, reference-image gate, NFC registry.

## critic-r3: City cultural planner acting as gatekeeper and source auditor (round 3, gate round)
- Gate pass: **False**
  - condition: Platform packet confirms and tests private, no-fork, no-index competition projects before the VTC flag is offered; otherwise entrants are told to work local or offline (M07)
  - condition: Correct the ai_involvement-to-IPTC mapping (compositeSynthetic; generative edits to compositeWithTrainedAlgorithmicMedia)
  - condition: A person verifies the Terms clause numbers, Q&A dates and the seven juror and firm strings in a browser and records verified-by/date on the contact guard; name City staff in the no-contact list
  - condition: Open the VTC brief before 29 Oct registration closes; confirm the anonymity clause and add any rule to the M07 strip checklist
  - condition: M06 links touched cones to bylaw/ODP authority, quotes the dataset caveat and re-checks the 24-record set at each export
  - condition: Publish the core cut order and the entrant-facing scope panel with dates
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: ai_involvement 'composite' maps to compositeWithTrainedAlgorithmicMedia and 'assistive edit' maps to algorithmicallyEnhanced (M07 team mapping). → composite with AI elements -> compositeSynthetic. Generative edit -> compositeWithTrainedAlgorithmicMedia. algorithmicallyEnhanced only for non-generative enhancement.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Per-view height rules for the 24 cones sit in the Public Views Guidelines (2024), and the 24-record dataset is a fixed match to the July 2024 set (M06). → Link touched cones to the governing bylaw/ODP as well as the guidelines. Treat the 24-record match as a dated snapshot and re-check it at each export.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: FPIC is obtained only by States, so it is not claimable (M02 claimable_by_entrant basis). → FPIC is not claimable because a hypothetical entry has no real project and no engagement at N0-N3, not because only States can seek it.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: S48 is an undated CIRNAC page whose title was not captured. → Cite it as federal-official guidance from 2011. Note that it says third parties have no legal obligation to consult.
- Findings: {'BLOCKER': 1, 'MAJOR': 5, 'MINOR': 6}
- Verdict: Round 3 handles most of the round 2 critique honestly. The entrant scope is cut to M01 stage A, M06 geometry and M07, and the review gate, the contact guard and the authorship fields are in place. It still fails the gate. M07's privacy mode, which entrants depend on, rests on platform features that are not built and has no fallback. The IPTC mapping understates generative AI use. M06 sends entrants to guidelines when the dataset says bylaws are authoritative, and treats a dataset updated on 19 Oct as fixed. The Terms, the jury list and the brief have still not been read by a person; I could not open the Buildner pages this round either. Fix these six conditions before entrants rely on it.

## revise-r3: draft saved as `revise-r3_P07.json`
  - Round 1: first draft of 8 modules (M01-M08) for packet P07 with 46 sources, of which 6 are opened=false.
  - Round 1: scope correction recorded: Sen̓áḵw is Squamish-led, not MST-led; MST precedents are Jericho Lands and Heather Lands.
  - Round 1: no Canadian Indigenous design charter found; M03 built as source-locked prompt cards instead of a scored rubric.
  - Round 1: web-search budget exhausted mid-task; all City of Vancouver domains returned HTTP 403; verification of City documents deferred to a human in a browser.
  - Round 1: design decision: no module outputs a numeric 'culture score'; numeric outputs are limited to geometry and completeness counts.
  - r1: M01 rebuilt: one N0-N4 ladder per Nation with a counterpart type; duty-sense 'consulted' banned; 'approved' or 'endorsed by' needs an authorized-decision reference; E2 renamed to a logged organizer question.
  - r1: M01 referral checklist moved out of the entrant flow to reference-only for real projects; metric set to false_assumption_corrected; M01 contact guard added (juror contact, Terms cl. 5.2, 8.3).
  - r1: Release gate added (M08 review_state): paid Indigenous reviewer sign-off before any CULT module reaches entrants; M01 stage A and M07 may ship as unreviewed beta; M02, M03, M05, M08 to v1; M04 to roadmap.
  - r1: M03 rebuilt on the charter's ten protocols (names and one-line paraphrases, linked); expression-channel lock unless N4; Nation-published card status only on a Nation's own request.
  - r1: FALSE_ASSUMPTION flags added: charter principles retrievable; charter contributors; referral metric; personal-data metric; Local Contexts Notice names; view-cone set completeness.
  - r1: Affected metrics set to false_assumption_corrected: M01 referral-pack completeness, M06 view cones touched, M07 identity-bearing fields in export.
  - r1: M02 tags every item applies-to and locks FPIC items as not claimable; separate urban Indigenous card set added. M04 gained downtown precedents and source-conflict chips. M05 gained form-level appropriation phrases, reference-image gate, NFC registry.

## critic-r4: City cultural planner acting as gatekeeper and source auditor (round 4, gate round)
- Gate pass: **False**
  - condition: M07 strip rewrites PDFs (qpdf/pikepdf), strips embedded image and XMP history metadata, and scans raw bytes, tested on a fixture with a known author
  - condition: A person reads the Buildner Terms, jury page and brief in a browser and records dated snapshots before 29 Oct, or the pre-written fallback scope is published to entrants
  - condition: Private-mode test with defined cases passes and is dated; otherwise the VTC flag stays blocked and the local-only notice shows
  - condition: Strip/scan/label tool works offline on externally produced PDFs and images
  - condition: Authors declare entrant status; the 'associate' question goes to Buildner staff; the non-endorsement disclaimer is shipped
  - condition: Terms IP clause checked before any brief-derived data enters public platform data
  - condition: DRIPA badge re-checked after the 24 Oct election
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: ExifTool can strip author and GPS fields from competition exports (M07 library role and the identity-field metric). → Rewrite the PDF with qpdf --linearize (or a full pikepdf save) after editing. Strip embedded image metadata and XMP history. Scan raw bytes and earlier revisions.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The new BC government's DRIPA position is unknown (M02 badge_states, S70/S71 flag). → Badge reads: election 24 Oct; parties' stated positions differ; outcome pending; re-check 25 to 27 Oct.
- Findings: {'BLOCKER': 1, 'MAJOR': 5, 'MINOR': 7}
- Verdict: The r3 spec answers last round's critique well. The IPTC mapping, view-cone ids (24, matched today), the Musqueam wording, BC Laws currency and the Legislature dissolution all check out against the live sources. It still fails the gate. The core anonymity feature uses ExifTool on PDFs, and those edits are reversible, so the original author fields stay in the submitted files. Buildner was unreachable again today (502), 8 days before registration closes, with no fallback plan. The strip tool would not reach boards laid out outside the platform. The private-mode test has no defined cases. The authors' own status with SALA, and the IP of brief data in a public repository, are unaddressed. An entrant cannot yet rely on M07 for anonymity.

## revise-r4: draft saved as `revise-r4_P07.json`
  - Round 1: first draft of 8 modules (M01-M08) for packet P07 with 46 sources, of which 6 are opened=false.
  - Round 1: scope correction recorded: Sen̓áḵw is Squamish-led, not MST-led; MST precedents are Jericho Lands and Heather Lands.
  - Round 1: no Canadian Indigenous design charter found; M03 built as source-locked prompt cards instead of a scored rubric.
  - Round 1: web-search budget exhausted mid-task; all City of Vancouver domains returned HTTP 403; verification of City documents deferred to a human in a browser.
  - Round 1: design decision: no module outputs a numeric 'culture score'; numeric outputs are limited to geometry and completeness counts.
  - r1: M01 rebuilt: one N0-N4 ladder per Nation with a counterpart type; duty-sense 'consulted' banned; 'approved' or 'endorsed by' needs an authorized-decision reference; E2 renamed to a logged organizer question.
  - r1: M01 referral checklist moved out of the entrant flow to reference-only for real projects; metric set to false_assumption_corrected; M01 contact guard added (juror contact, Terms cl. 5.2, 8.3).
  - r1: Release gate added (M08 review_state): paid Indigenous reviewer sign-off before any CULT module reaches entrants; M01 stage A and M07 may ship as unreviewed beta; M02, M03, M05, M08 to v1; M04 to roadmap.
  - r1: M03 rebuilt on the charter's ten protocols (names and one-line paraphrases, linked); expression-channel lock unless N4; Nation-published card status only on a Nation's own request.
  - r1: FALSE_ASSUMPTION flags added: charter principles retrievable; charter contributors; referral metric; personal-data metric; Local Contexts Notice names; view-cone set completeness.
  - r1: Affected metrics set to false_assumption_corrected: M01 referral-pack completeness, M06 view cones touched, M07 identity-bearing fields in export.
  - r1: M02 tags every item applies-to and locks FPIC items as not claimable; separate urban Indigenous card set added. M04 gained downtown precedents and source-conflict chips. M05 gained form-level appropriation phrases, reference-image gate, NFC registry.
