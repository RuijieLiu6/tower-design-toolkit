# context-model / C04: research log

## research: draft saved as `research_C04.json`
  - Round 1 (2026-10-21): first C04 packet.
  - Read Vista v09.16 files and the three sibling repos; sizes and function counts taken from the files.
  - Compared live open-data polygons with Vista's snapshot: 24 of 24 identical.
  - Recomputed six City 2004 formula rows: all match.
  - Measured an exact cone-clip benchmark: 0.56 s per 1 M triangles on one desktop.
  - Found published site limits (123.201 m, 105.71 m) only through search summaries; marked unverified.
  - No City PDF opened (HTTP 403); recorded in flags.

## critic-r1: Senior front-end engineer (WebGL modular plug-ins), independent reviewer of packet C04 round 1
- Gate pass: **False**
  - condition: Add City LiDAR 2022 (CGVD28GVRD) as the primary ground, grade and roof source and record its datum on every derived tile
  - condition: Raise the far plane to at least 40 km and add curvature and refraction to renders and skyline rays
  - condition: Add NO_LIMIT_DATA and NEAR_EDGE states; never show metres for an uncalibrated cone
  - condition: Treat the horizontal-versus-sloped lower boundary as unresolved, carry both models, and stop using the 2004 9.1 parameters as current
  - condition: Replace the tilted-camera preset with a level camera and shifted projection
  - condition: Correct the GPT-6 Astra citation to the official OpenAI page and its modalities
  - condition: Remove studio-derived geometry from the public build until rights are confirmed; add LICENSE files
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vancouver coverage of open 1-2 m LiDAR terrain is not confirmed; the best available terrain is SRTM 60 m, HRDEM or LidarBC, and building roofs come from OSM or 2009 LiDAR. → Use City LiDAR 2022 (CGVD28GVRD, 0.081 m at 95% vertical, 49 pts/m2, 181 tiles) for ground, grade, deck and roof elevations within the city. Use SRTM only for the distant backdrop.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A far plane of 8 km is adequate for views from protected origins. → Far plane at least 40 km, with reversed-Z or log depth.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: GPT-6 Astra facts come from an OpenAI announcement, and its image/PDF input is not stated. → Cite developers.openai.com/docs/models/gpt-6-astra: 1.05M context (922K max input), 128K output, cutoff 2026-04-30, text and image input, 2x input pricing above 272K tokens; PDF input unconfirmed.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Cone A sector is 43.4-47.14 deg and 828 Cambie lies at 47.14 deg from apex A. → Recompute all bearings geodesically. The site is still on the edge, but the stated numbers are about 0.2 deg off.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vista meshes cost 982 B per building. → Report 427 B overall (515 B with indexes); the saving against PVV's 50 B is about 9-10x.
- Findings: {'BLOCKER': 2, 'MAJOR': 7, 'MINOR': 8}
- Verdict: The audit of Vista is accurate. The node contract, the keep/refactor/replace split, the AI boundaries and the wording guards are sound. The spec does not pass yet. It misses the City's own LiDAR 2022, which is in CGVD28 with 8 cm accuracy and is the obvious source for ground, grade and roof heights; it also largely settles the datum question. The 8 km far plane would cut off the protected mountains, and nothing accounts for earth curvature or refraction. The warning has no 'limit unknown' state, even though only two unverified site limits exist. The sloped lower boundary conflicts with the current 'horizontal' wording. The tilted-camera preset breaks photomontage practice. The Astra source is a forum post, not OpenAI. Fix these and resubmit.

## critic-r1: Senior front-end engineer refactoring WebGL apps into modular plug-ins (independent reviewer, round 1 of C04)
- Gate pass: **False**
  - condition: Replace SRTM with City LiDAR 2022 for origin ground z, grade and roofs, and re-derive the U budget
  - condition: Move kernels to a projected or geodesic CRS and regenerate the Barclay and 828 Cambie expectations geodesically
  - condition: Raise the far plane (reversed-Z or log depth) so every Table 1 view subject renders
  - condition: Verify clause numbers and the 'horizontal lower boundary' wording in a hand-downloaded Guidelines PDF; fix citation labels
  - condition: Treat slope as a per-cone fitted parameter (s = 0 allowed); drop the 9.1-derived generalisation
  - condition: Add a near-edge plan state and a governing minimum across cones; zero silent clears in tests
  - condition: Calibrate only with post-2024 or City-confirmed limits from several sites per cone, with covariance
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The real lower boundary slopes, so a flat ceiling drifts about 36 m per km (stated as fact for all cones). → Whether the boundary is sloped or flat is unresolved per cone. Fit s per cone with s = 0 allowed, and confirm with the City.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 828 Cambie lies at bearing 47.14 deg on the cone A edge (sector 43.4-47.14 deg); Barclay lies at 4.56 km, bearing 347.3, sector 341.3-351.8. → Geodesic values: cone A sector 43.20-46.94 deg, and 828 Cambie at 1,702 m, 46.95 deg, about 0.2 m outside the edge. QE 3.2.1 sector 341.45-351.80 deg, and Barclay at 4,585 m, 347.42 deg.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 0.56 s per 1 M triangle check was measured on a desktop; the laptop value is not measured. → It was measured on a high-end laptop. Thin-and-light student laptops are still unmeasured.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: All six City 2004 sheet rows were recomputed exactly (the sheet has 6 rows). → Recompute all rows (spot checks of X 8th Ave = 44.60 ft and Robson & Cambie = 282.02 ft match). Treat the 485/495 split as evidence of sub-cones.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: No local high-resolution terrain is confirmed; origin elevations must come from SRTM, HRDEM or LidarBC. → Use lidar-2022 for origins, grade and roofs, and keep SRTM only as backdrop.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Footprints-2009 elevations have no stated datum. → Geodetic, most likely CGVD28 (unconfirmed). It is still 2009-era and approximate.
- Findings: {'BLOCKER': 3, 'MAJOR': 5, 'MINOR': 9}
- Verdict: This is a careful, honest packet with good keep/refactor/replace triage and sound estimate wording, but I would not pass it. Three blockers: it leaves out the City's own LiDAR 2022 (CGVD28, whole City) and leans on SRTM; the 8 km far plane would cut off the protected mountain subjects; and it keeps Vista's anisotropic equirectangular kernels, which make distances 0.2-0.6% short, skew bearings about 0.2 deg and distort its own validation numbers. Major issues: it states a sloped lower boundary as fact although the current text says 'horizontal'; it generalises one historical 9.1 sheet to all cones; site calibration is ill-conditioned and possibly pre-2024; there is no plan-edge uncertainty or governing minimum across cones; and clause citations are still unverified from the PDF.

## revise-r1: draft saved as `revise-r1_C04.json`
  - Round 1 (2026-10-21): first C04 packet.
  - Read Vista v09.16 files and the three sibling repos; sizes and function counts taken from the files.
  - Compared live open-data polygons with Vista's snapshot: 24 of 24 identical.
  - Recomputed six City 2004 formula rows: all match.
  - Measured an exact cone-clip benchmark: 0.56 s per 1 M triangles on one desktop.
  - Found published site limits (123.201 m, 105.71 m) only through search summaries; marked unverified.
  - No City PDF opened (HTTP 403); recorded in flags.
  - r1: added City LiDAR 2022 (CGVD28GVRD, 0.081 m at 95%, 181 tiles) as primary ground, grade, deck and roof source; added LiDAR 2018/2013, 1 m DEM, footprints 2015 and contours entries; demoted SRTM, HRDEM, LidarBC to backdrop roles.
  - r1: far plane raised from 8 km to at least 45 km (reversed-Z or two passes); added a named-subject visibility test per view.
  - r1: added curvature and refraction (k 0.13) and UTM 10N NAD83(CSRS) with local ENU; computed 0.059 deg bias at 15 km, 0.098 deg at 25 km; east-west scale error 0.56% at 49.56 N.
  - r1: M04 gained NO_LIMIT_DATA and NEAR_EDGE states, tier T3, Monte Carlo U with P(inside), point-in-polygon membership and a view 28 case; metres are never shown without T1-T3 data.
  - r1: lower boundary recorded as UNRESOLVED (s.2 'horizontal' versus 2004 slope); both models carried; 2004 rows kept as unit tests only.

## revise-r1: draft saved as `revise-r1_C04.json`
  - r1: Added City LiDAR 2022 (CGVD28GVRD, 0.081 m at 95%, 11 origin tiles confirmed) as primary source for origin z, grade and roofs; SRTM demoted to backdrop (USGS 16 m at 90%).
  - r1: Raised the far plane from 8 km to at least 60 km (reversed-Z or log depth); subjects lie 12.5-24.6 km away; the Vista observer far plane is 45,000 m.
  - r1: Replaced the Vista equirectangular frame with EPSG:3157 or per-cone ENU via GeographicLib (frame error 0.20% and 0.58%, 0.118 deg); regenerated Barclay and 828 Cambie values geodesically.
  - r1: Replaced the sloped-boundary assumption with H0 flat default and H1 historical, citing Guidelines s.2 p.3 and RTS 16338 Table 2 (reference roofs); deleted the 36 m per km figure.
  - r1: Hint for flat limits: a 2.05 deg slope adds 164 m over 4.59 km, yet the 2020 Barclay limit is 123.2 m geodetic (unverified); fit with s = 0 allowed.
  - r1: Added tier T1b (LiDAR roof of the named reference building) with a hypothesis test on 1008 Cambie (102.68 m facet in 2009 against 105.71 m published).
  - r1: T1a calibration now needs 2 or more sites spanning 30% of cone length, dated after 2024-07-10 or cones absent from Table 2; added OLS prediction variance with covariance.
  - r1: Re-derived the uncertainty budget with LiDAR sigmas; added plan buffer and near-edge state; zero silent clears and zero plan-edge misses become tests.
  - r1: Added governing minimum over cones and a ZoningLimit port; the open zoning data has no height field.
  - r1: Read Guidelines Jul 2024 and Jun 2025 copies from the scratchpad: clauses 3.1.1-3.1.5 print under heading 3.2; citation format fixed; 2026 text and provenance still unverified.
  - r1: RTS 16338 shows QE views 3.1 and 3.2.4a deleted and 3.2.1-3.2.4 not reshaped in 2024, resolving the QE lower-portion reports.
  - r1: Trout Lake status confirmed from RTS 19750 (existing cone, updates under review); found a 27.1/27.2 subject mismatch and 12.2 dropped from Table 1 in June 2025.

## critic-r2: UX designer of professional 3D design tools (view analysis, warning UX, geospatial viewers)
- Gate pass: **False**
  - condition: Fix the frame rule: one projected frame for containment, orthometric z for exceedance, grid and geodesic never mixed; correct the UTM agreement claim and metric
  - condition: Add 'limit unknown' and 'datum unknown' states, and use U95 with explicit thresholds
  - condition: Specify hypothetical-site mode and headroom map for Tall Challenge entrants
  - condition: Publish a 13 Nov MVP cut list
  - condition: Make the hand-checked 2026 Guidelines PDF (SHA-256, signer) a hard release gate; rename ViolationReport
  - condition: Fix observer fog so the subject-visibility test checks contrast, not only depth
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A UTM 10 projection agrees with the Vincenty GRS80 inverse within 0.1 m and 0.01 deg on QE to Barclay, so EPSG:3157 kernels meet <= 0.05 m and <= 0.001 deg. → Grid 4,637.11 m at 346.986 deg against geodesic 4,638.97 m at 346.900 deg, a difference of -1.85 m and +0.085 deg. Either correct for scale and convergence, or keep each test entirely within one frame.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: LiDAR-2022 accuracy is 0.081 m at 95% on open ground. → Write '0.081 m at 95% (standard and land cover not stated)'. Roof and edge accuracy will be worse and should be measured.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Buildner answer on AI-generated images is unread and unknown. → AI images are not banned. The FAQ advises checking the AI tool's terms and does not recommend treating AI images as sole work or IP without explicit permission.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The first users' designs sit on real downtown sites, where the cone test applies directly. → Cone checks for entrants are what-if location studies. The node needs a hypothetical-site mode and a headroom map.
- Findings: {'MAJOR': 7, 'MINOR': 7}
- Verdict: Round 2 fixes most of round 1: LiDAR-2022 is now primary, the far plane is 60 km, H0/H1 are competing hypotheses, calibration carries covariance, and there is a governing minimum. Some correctness gaps remain. Raw UTM grid is 1.85 m and 0.085 deg off geodesic, which contradicts the spec's own cross-check claim, and mixing grid with geodesic azimuths can flip the near-edge cases. A true ENU up axis would add up to 2.8 m of error. There are no states for 'limit unknown' or 'datum unknown', and U has no coverage factor. For UX, the spec ignores that entrants design 244-305 m towers on a hypothetical site, and it has no MVP for 13 Nov. Fog still hides the peaks. Do not pass until these are fixed.

## revise-r2: draft saved as `revise-r2_C04.json`
  - r1: Added City LiDAR 2022 (CGVD28GVRD, 0.081 m at 95%, 11 origin tiles confirmed) as primary source for origin z, grade and roofs; SRTM demoted to backdrop (USGS 16 m at 90%).
  - r1: Raised the far plane from 8 km to at least 60 km (reversed-Z or log depth); subjects lie 12.5-24.6 km away; the Vista observer far plane is 45,000 m.
  - r1: Replaced the Vista equirectangular frame with EPSG:3157 or per-cone ENU via GeographicLib (frame error 0.20% and 0.58%, 0.118 deg); regenerated Barclay and 828 Cambie values geodesically.
  - r1: Replaced the sloped-boundary assumption with H0 flat default and H1 historical, citing Guidelines s.2 p.3 and RTS 16338 Table 2 (reference roofs); deleted the 36 m per km figure.
  - r1: Hint for flat limits: a 2.05 deg slope adds 164 m over 4.59 km, yet the 2020 Barclay limit is 123.2 m geodetic (unverified); fit with s = 0 allowed.
  - r1: Added tier T1b (LiDAR roof of the named reference building) with a hypothesis test on 1008 Cambie (102.68 m facet in 2009 against 105.71 m published).
  - r1: T1a calibration now needs 2 or more sites spanning 30% of cone length, dated after 2024-07-10 or cones absent from Table 2; added OLS prediction variance with covariance.
  - r1: Re-derived the uncertainty budget with LiDAR sigmas; added plan buffer and near-edge state; zero silent clears and zero plan-edge misses become tests.
  - r1: Added governing minimum over cones and a ZoningLimit port; the open zoning data has no height field.
  - r1: Read Guidelines Jul 2024 and Jun 2025 copies from the scratchpad: clauses 3.1.1-3.1.5 print under heading 3.2; citation format fixed; 2026 text and provenance still unverified.
  - r1: RTS 16338 shows QE views 3.1 and 3.2.4a deleted and 3.2.1-3.2.4 not reshaped in 2024, resolving the QE lower-portion reports.
  - r1: Trout Lake status confirmed from RTS 19750 (existing cone, updates under review); found a 27.1/27.2 subject mismatch and 12.2 dropped from Table 1 in June 2025.

## critic-r3: Gatekeeper reviewer for geodesy, City of Vancouver view-protection data and browser 3D tooling (round 3, packet C04)
- Gate pass: **True**
  - condition: Replace the 828 Cambie 'near edge' site claim with an address-point fixture plus a parcel fixture (inside cone A by about 40 m); the Site port tests polygons only
  - condition: Change the HeadroomMap to clear-below = min(L - U95) and surely-above = min(L + U95), with the band hatched as within uncertainty
  - condition: Add MVP shares for LiDAR gridding (M07) and block placement (M06), or cut the grade field; restate the total
  - condition: State the expected MVP limit coverage and send the views@vancouver.ca request now
  - condition: Hash and sign the team's existing 2026-02-04 Guidelines copy (accessed 2026-09-22) in guidelines.lock.json before release
  - condition: Read the team's Brief for view-cone, height and AI rules before the 3 Nov Q and A
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 828 Cambie lies 0.19 m outside cone A; state: near edge. → The parcel overlaps cone A by about 40 m, so the state depends on height (published vertex F 105.71 m, unverified). Keep the 0.19 m point only as a frame fixture.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 2026-02-04 Public Views Guidelines text is unread by the team. → Recover the team's copy, hash it and sign the lock. Only the reviewers' fetch failed (HTTP 403 again on 2026-10-21).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Tall Challenge Brief was not read (email sign-up needed). → Read the team's copy for view-cone and AI rules before 3 Nov. The competition page also shows a 'Queen Elizabeth View Tower Heights' reference image.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 13 Nov MVP fits in 11.5 person-days. → About 14-15 person-days, or cut the 5 m grade field.
- Findings: {'MAJOR': 6, 'MINOR': 9}
- Verdict: Round 3 fixes every BLOCKER and MAJOR item from the previous critique except delivery scope, which is only partly fixed. The geodesy reproduces exactly. The frame rule, the seven states, U95, the release gate and the hypothetical-site mode are sound. Four problems remain. The 828 Cambie 'near edge' case tests an address point, but the parcel overlaps cone A by about 40 m. The HeadroomMap's L + U95 governing rule can show clears that the per-cone card contradicts. The MVP budget leaves out LiDAR gridding and block placement. Two 'unread' claims are false: the team already holds the 2026 Guidelines (accessed 2026-09-22) and the Brief. The team can start building now if the named conditions are met before the MVP release.

## revise-r3: draft saved as `revise-r3_C04.json`
  - r1: Added City LiDAR 2022 (CGVD28GVRD, 0.081 m at 95%, 11 origin tiles confirmed) as primary source for origin z, grade and roofs; SRTM demoted to backdrop (USGS 16 m at 90%).
  - r1: Raised the far plane from 8 km to at least 60 km (reversed-Z or log depth); subjects lie 12.5-24.6 km away; the Vista observer far plane is 45,000 m.
  - r1: Replaced the Vista equirectangular frame with EPSG:3157 or per-cone ENU via GeographicLib (frame error 0.20% and 0.58%, 0.118 deg); regenerated Barclay and 828 Cambie values geodesically.
  - r1: Replaced the sloped-boundary assumption with H0 flat default and H1 historical, citing Guidelines s.2 p.3 and RTS 16338 Table 2 (reference roofs); deleted the 36 m per km figure.
  - r1: Hint for flat limits: a 2.05 deg slope adds 164 m over 4.59 km, yet the 2020 Barclay limit is 123.2 m geodetic (unverified); fit with s = 0 allowed.
  - r1: Added tier T1b (LiDAR roof of the named reference building) with a hypothesis test on 1008 Cambie (102.68 m facet in 2009 against 105.71 m published).
  - r1: T1a calibration now needs 2 or more sites spanning 30% of cone length, dated after 2024-07-10 or cones absent from Table 2; added OLS prediction variance with covariance.
  - r1: Re-derived the uncertainty budget with LiDAR sigmas; added plan buffer and near-edge state; zero silent clears and zero plan-edge misses become tests.
  - r1: Added governing minimum over cones and a ZoningLimit port; the open zoning data has no height field.
  - r1: Read Guidelines Jul 2024 and Jun 2025 copies from the scratchpad: clauses 3.1.1-3.1.5 print under heading 3.2; citation format fixed; 2026 text and provenance still unverified.
  - r1: RTS 16338 shows QE views 3.1 and 3.2.4a deleted and 3.2.1-3.2.4 not reshaped in 2024, resolving the QE lower-portion reports.
  - r1: Trout Lake status confirmed from RTS 19750 (existing cone, updates under review); found a 27.1/27.2 subject mismatch and 12.2 dropped from Table 1 in June 2025.
