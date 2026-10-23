# modules / P07: research log

## research: draft saved as `research_P07.json`
  - Round 1: first draft of 8 modules (M01-M08) for packet P07 with 46 sources, of which 6 are opened=false.
  - Round 1: scope correction recorded: Sen̓áḵw is Squamish-led, not MST-led; MST precedents are Jericho Lands and Heather Lands.
  - Round 1: no Canadian Indigenous design charter found; M03 built as source-locked prompt cards instead of a scored rubric.
  - Round 1: web-search budget exhausted mid-task; all City of Vancouver domains returned HTTP 403; verification of City documents deferred to a human in a normal browser.
  - Round 1: design decision: no module outputs a numeric 'culture score'; numeric outputs are limited to geometry and completeness counts.

## critic-r1: Architect who has worked with Musqueam, Squamish and Tsleil-Waututh Nations on public projects in BC. Reviewed P07 round 1 for cultural safety, protocol and evidence.
- Gate pass: **False**
  - condition: Remove the Musqueam referral checklist from the entrant flow; default to E0 and route all contact questions to Buildner only
  - condition: Rebuild the engagement ladder per Nation with counterpart type; ban 'consulted' and 'endorsed' for competition entries
  - condition: Add juror-contact warning (K̓ESU+CO)
  - condition: Paid Indigenous reviewer sign-off before any CULT module is released; otherwise ship M07 plus the E0 statement only
  - condition: Correct the ICoD charter claim, cite its 10 protocols, and lock form/naming/art channels at E0/E1
  - condition: Close anonymity leaks in M07 (handles, fork authors, C2PA signer)
  - condition: Add georeference and treat view-cone results as partial and not clearance
  - condition: Fix status labels: referral metric and personal-data metric are not 'verified'
  - condition: A human must open the City documents (UNDRIP Strategy, Action Plan, Higher Buildings Policy and Review) in a browser before citing them
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The International Indigenous Design Charter's principle list could not be retrieved, so M03 links rather than paraphrases (UNVERIFIED flag; M03 method and limits). → The protocols are: Indigenous led; Self-determined; Community specific; Deep listening; Indigenous knowledge; Shared knowledge; Shared benefits; Impact of design; Legal and moral; Charter implementation. The book is (c) 2018 Deakin University and bars reproduction without consent, so name them, link them and paraphrase briefly. Its appendix names Australian, Greenlandic Inuit and Sami contributors and no First Nations from Canada.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The ICoD charter was built 'with input from Sami, Inuit, North American, Maori and Australian practitioners' (S29 extract). → Describe the charter as Australian-led with Inuit and Sami workshop input. Its relevance to Coast Salish protocol is unestablished.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Referral-pack completeness against the Musqueam list is a 'verified' metric for this entry (M01). → Status: unverified/not applicable for competition entries. Default is no contact; questions go through Buildner.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Personal-data fields at export = 0 is a 'verified' threshold based on S34/S35 (M07). → Status: team_assumption, pending a human reading of the brief's anonymity clause.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Local Contexts Notices are 'Open to Collaborate, Attribution Incomplete, TK, BC, Collections Care' (S27). → Update the names and pull them from the Hub at run time. Review the Hub Terms before displaying anything.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The view-cone dataset gives the set of protected public views ('24 polygons of protected public views'). → Treat the dataset as partial until it is checked against the View Protection Guidelines. Zero intersections is not clearance.
- Findings: {'BLOCKER': 3, 'MAJOR': 10, 'MINOR': 6}
- Verdict: Not ready. The packet is careful about numbers. It refuses culture scores and labels its assumptions. But it gets protocol wrong in ways that would harm the Nations and entrants. It points hundreds of students to Musqueam's referral process for a hypothetical entry. Its engagement ladder lets 'consulted' and 'endorsed' rest on self-declared agreement, without separating the three Nations or the authority of whoever was engaged. It does not warn about the Coast Salish juror. It wrongly says the Indigenous Design Charter cannot be retrieved, and it misses form-level appropriation. Anonymity leaks through handles and C2PA. Nothing should be released until an Indigenous reviewer signs off. Search budget ran out during this review and City domains still returned 403, so some checks remain manual.

## revise-r1: draft saved as `revise-r1_P07.json`
  - Round 1: first draft of 8 modules (M01-M08) for packet P07 with 46 sources, of which 6 are opened=false.
  - Round 1: scope correction recorded: Sen̓áḵw is Squamish-led, not MST-led; MST precedents are Jericho Lands and Heather Lands.
  - Round 1: no Canadian Indigenous design charter found; M03 built as source-locked prompt cards instead of a scored rubric.
  - Round 1: web-search budget exhausted mid-task; all City of Vancouver domains returned HTTP 403; verification of City documents deferred to a human in a normal browser.
  - Round 1: design decision: no module outputs a numeric 'culture score'; numeric outputs are limited to geometry and completeness counts.
  - r1: M01 rebuilt. The single E0-E3 ladder is replaced by one N0-N4 ladder per Nation with a counterpart type; 'consulted' (duty sense) is banned for all entries; 'approved' or 'endorsed by' needs an authorized-decision reference; rung E2 renamed to a logged organizer question, not engagement.
  - r1: M01 referral checklist removed from the entrant flow and kept as reference-only for real projects; metric status changed from verified to false_assumption_corrected; contact questions go through the portal's Ask the Jury channel before the 3 Nov 2026 Q&A deadline.
  - r1: M01 contact guard added: no approaching jurors or their firms (terms cl. 5.2, 8.3; juror from K̓ESU+CO), with an editable portal question about Nation engagement.
  - r1: Release gate added (M08 review_state, referenced by all CULT modules): paid Indigenous reviewer sign-off required before any CULT module is visible to entrants; M01 stage A (N0 statement, contact guard, ban-list lint) and M07 may ship as unreviewed beta; priorities cut accordingly (M02, M03, M05, M08 to v1; M04 to roadmap).
  - r1: M03 rebuilt on the charter's ten protocols (names and one-line paraphrases, linked; book bars reproduction); expression-channel lock (form, naming, pattern, commissioned art locked unless N4 for that use); Nation-published card status only on a Nation's own request, forks inherit team-authored.
  - r1: FALSE_ASSUMPTION flags added for: charter principles not retrievable; charter contributor claim (corrected after reading the appendix: workshops in Australia, Denmark, Greenland, Sweden; launch panel names Canadian and US Indigenous panelists; no Coast Salish contributor); referral metric 'verified'; personal-data metric 'verified'; Local Contexts Notice names; view-cone set completeness.
  - r1: Affected metrics set to false_assumption_corrected: M01 referral-pack completeness, M06 view cones touched, M07 identity-bearing fields in export.
