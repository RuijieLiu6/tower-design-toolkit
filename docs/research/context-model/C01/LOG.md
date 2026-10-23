# context-model / C01: research log

## research: draft saved as `research_C01.json`
  - Retry: read all 8 pages of the Public Views Guidelines PDF directly through an in-browser PDF parse; it contains no elevations, coordinates, eye height or figures.
  - Added: City ArcGIS 'ViewCone' layer with filled origin elevations and empty reference fields; polygon apex shown to be the origin.
  - Added: 2004 City formula verified on its worked rows; 12 City geodetic values fitted by a constant slope per cone.
  - Corrected: lower boundary is a rising sight line, not a flat plane.
  - Added: Council 2025-2026 numeric lower-boundary definitions (Clinton Park, Trout Lake, H, J2; 3.2.4 equals 3.2.3).
  - Added: aviation findings: YVR zoning excludes downtown; NAV CANADA case-by-case constraint in July 2026.
  - Removed: search-snippet figures (134.7 m, 166 m, 332 ft) not found in any opened document.

## critic-r1: City of Vancouver urban designer administering the Public Views Guidelines (independent reviewer, round 1 of packet C01)
- Gate pass: **False**
  - condition: Switch the default to an axial/planar lower boundary (or the most conservative of the two models) and show the radial versus axial difference per cone.
  - condition: Remove 9.2 and every pre-2024 or pre-amendment value from the 'calibrated' and 'verified' lists. Version all test cases by geometry date.
  - condition: Do not render numeric limits for uncalibrated cones (3.2.1, 3.2.2, 9.1, 9.2, B2, D, J1 in the CBD) until City assessments are obtained. Show the wedge with 'City assessment required'.
  - condition: Add uncertainty bands for cones whose k comes from short-baseline Council references (28, J2, H, 27.x).
  - condition: Handle non-triangular polygons (28) and EXPIRATION_DATE. Detect changes by geometry hash, not EFFECTIVE_DATE.
  - condition: Replace 'authoritative' wording with the City's own disclaimer, and label every output an estimate subject to the City View Cone Assessment.
  - condition: Provide policy-scenario surfaces for the Higher Buildings Policy and Exceptional Downtown Sites.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: All 12 City sheet points lie within 4 degrees of cone axes, so radial and axial distance cannot be separated. → Axial (planar) distance fits City values to about 0.02 m; radial leaves 0.04-0.07 m. Adopt axial as the default and confirm with near-edge City points.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The cone layer is 24 triangles; the polygons are already 3 vertices. → There are 23 triangles plus one pentagon. Normalise by merging collinear vertices and identify the apex explicitly.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: EFFECTIVE_DATE in the City layer records cone versions (used for change detection and 'effective date' storage). → Detect changes from geometry and attribute hashes plus dataLastEditDate. Take amendment dates from PVG Table 1 and Council minutes.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 9.2 is calibrated (k 0.04883) with a verified residual of 0.04 m. → Treat 9.2 as uncalibrated for current geometry until a post-Feb-2026 City assessment is obtained.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 20 published City points currently fit within 0.07 m. → 12 Robson points fit in-sample; the 8 Barclay values are pre-2024 geometry and are unexplained.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The City ViewCone layer and Council reports are authoritative (spec flag 'PVG PDF holds current definitions' correction). → Council resolutions define the views. GIS layers are convenience copies, and the City View Cone Assessment governs individual sites.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 9.2 'roof of 485 W 8th Ave' test gave an implausible reference (roof about 7 m above the origin is implausible for a mid-rise). → Test roof alignment on cone A (roof of 1008 Cambie, LiDAR 2022) where k is known, then decide.
- Findings: {'BLOCKER': 3, 'MAJOR': 7, 'MINOR': 8}
- Verdict: Not ready for Vancouver designers to rely on. The source reading is careful and mostly accurate: Table 1, the clauses, the service fields and the Council definitions all check out. The core height engine does not. The City's own sheet values fit a planar, axial lower boundary better than the radial cone used by default, and the radial cone can falsely report CLEAR. Within the CBD only cones A and 3.2.3 have a k that matches current geometry. 9.2's calibration uses values from before the origin moved. The 'verified' residuals are in-sample fits mixed with superseded 2004-2019 geometry. Short-baseline Council references can be off by several metres to about 15 m. Fix the distance model, version the tests, add uncertainty and policy scenarios, and obtain City assessments before showing any numeric limit.

## critic-r1: City of Vancouver urban designer administering the Public Views Guidelines (view cone assessments, Higher Buildings and Exceptional Downtown Sites review)
- Gate pass: **False**
  - condition: Re-tag every City value by cone version, and move pre-amendment values (Barclay 2019, 9.2 Oct 2024, 27.2 at 54.3 m, 2004 rows) out of the gating test suite.
  - condition: Switch the default to a planar (axial) lower boundary, or the lower of planar and radial, and recompute k for all reference-defined cones (28, 27.1, H, J2) with axial distance.
  - condition: Model Higher Buildings and Exceptional Downtown Sites as user-enabled per-cone relaxations, not as caps.
  - condition: Add the CAR 601.23 aviation trigger warning for towers above 90 m (or 150 m) above ground.
  - condition: Restate the metrics: fit residuals are not validation; '20 points within 0.07 m' must be corrected.
  - condition: Show a banner on every result: estimate only, PVG Table 1 cones only, and the City View Cone Assessment governs.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City sheet points all lie within 4 degrees of the cone axes, so radial and axial distance cannot be separated. → The data favour a planar (axial) lower boundary. Use it, or the lower of the two models, as the default.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 9.2 is calibrated (k 0.0488) for the current cone. → The 9.2 value is historical. Recalibrate after the move.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 20 published points currently fit within 0.07 m. → 12 in-sample points on 3 cones, one of them stale.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Higher Buildings Policy supplies height caps to include in the minimum surface. → Treat it as a per-cone relaxation mask (QE 3; B1, B2, D, 12.2 for Exceptional Downtown Sites).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Trout Lake 27.1 and 27.2 have published lower-boundary parameters (59.8 m and 54.3 m at 495340.12, 5456431.39). → 27.2's reference location is unresolved; 27.1's reference XY is assumed.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The far edge of each cone is a clip near Burrard Inlet, and all 24 cones are triangles. → Store rings, and treat K's far edge as the subject boundary.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: No aviation rule applies downtown; it is case-by-case only. → Warn automatically above 90 m above ground within 6 km of an aerodrome, and above 150 m anywhere.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: EFFECTIVE_DATE identifies the cone version. → Version by geometry hash, edit date and Council report.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 9.2 'roof of 485 W 8th Ave' test shows that roof alignments cannot give Lr. → Derive roof elevations from LiDAR 2022 and validate them against City sheets.
- Findings: {'BLOCKER': 1, 'MAJOR': 10, 'MINOR': 8}
- Verdict: Not ready for designers. The registry is solid: the apex is the origin, Lv is filled, the CBD set reproduces and the Table 1 transcription is right. The height model is not. It calibrates and tests against superseded geometry. 9.x moved in Feb 2026 and the Barclay values predate the 2024 QE rewrite. The Trout Lake inputs are misread 'Current' values. The default radial distance is the less conservative choice, and the City's own sheet favours a planar boundary. It treats the Higher Buildings Policy as a cap when it permits entry into cones. It also misses the CAR 601.23 aviation trigger that every competition tower meets. Fit residuals are presented as verified accuracy. Fix the versioning, the geometry default, relaxation handling and labelling before release.

## revise-r1: draft saved as `revise-r1_C01.json`
  - r1: Re-tagged every City value by cone version; 9.2 (Oct 2024 sheet), Barclay, 2004 rows, 1133 W Georgia and superseded values moved to a non-gating historical suite; gating set is A (4) and 3.2.3 (5).
  - r1: Default surface is now min(radial, planar). Refit reproduced the critique: A 0.012 vs 0.037 m, 9.2 0.008 vs 0.024 m. Corrected its claim that radial is always higher: it depends on reference bearing.
  - r1: Higher Buildings and Exceptional Downtown Sites became user-enabled per-cone relaxation masks, not caps; guidance heights are reference lines only.
  - r1: M06 now holds rule-based aviation warnings: CAR 601.23/601.24, AC 601-007 notification surfaces (60 m AGL; heliport 4% to 1,500 m), CYHC and CBC7 positions (about 2 km from the CBD).
  - r1: Trout Lake corrected beyond the critique: printed coordinates are the 2670 Victoria Dr corner (Proposed column); amendments were referred back (RTS 19750); 54.3 and 59.8 m remain in force; k 0.03685 and 0.04533.
  - r1: Roof route restored: Lr from LiDAR 2022 roofs. Earlier 'implausible' verdict reversed (485 W 8th ground about 16 m; implied roof 43 m ASL). Cones classified S1-S4; 8 of 24 now parameterised.
  - r1: Versioning by geometry hash and layer edit dates; EFFECTIVE_DATE informational. Landmark-bearing audit added: H, J2, 28, 9.1 match Council text within 0.05 degrees; Trout Lake service wedges are pre-2026.
  - r1: Metrics restated: fit residuals separate from leave-one-out (A 0.017 planar, 0.050 radial; 3.2.3 0.004); 0 of 24 cones have a held-out point; free-intercept check shows Lv, not Lv+1.6 m.
  - r1: Eye height: Lv probably already eye level (1.4-3.5 m over 2002 contours); camera default adds 0 m. Curvature switch added; QE 3.2.3 fits either a line or a level sightline with curvature.
  - r1: Rings stored (cone 28 has five vertices; K far edge is its subject). Downtown and CBD boxes stated explicitly and labelled test boxes; City boundary polygons to be digitised.
  - r1: Frames and datum: NAD83 original versus CSRS about 0.1 m (Esri Canada); HTMVBC00 equals renamed HTGVRDBC00; LiDAR tiles 1 km, 16.45 MB to 2.74 GB; edge band 1.5 m.
  - r1: Added not-modelled table and standing banner; 12.2 status updated from RTS 16338 Rec D; 3.2.x geometry shown unamended in 2024, so the 'QE rewrite' claim is unverified.

## critic-r2: GIS and survey specialist (geodesy, vertical datums, view-shed analysis), independent reviewer of packet C01 round 2
- Gate pass: **False**
  - condition: Add an IN CONE - NO ESTIMATE status, and never return CLEAR inside a wedge whose cone has no calibrated parameters; add a test that proves it.
  - condition: Reconcile view H's lower boundary (2011 40.64 m at 982.77 m vs Dec 2025 58 m) before classing it S1.
  - condition: Reclassify view 20 as terrain-referenced, and implement curvature and refraction as chord-sag or eye-angle per cone, defaulting to the lower value.
  - condition: Define the roof-alignment rule as maximum elevation angle (penthouses excluded unless named), and validate it on A before applying it to other cones.
  - condition: Record the June 2025 PVG version (12.2 removed) and pin clause citations to PDF versions.
  - condition: Fix the AC 601-007 category logic for CYHC and CBC7, and add CAR 601.23(1)(a) and (c).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: View 20's lower-boundary reference is a building in West Vancouver, so it is roof-aligned (S3). → Treat it as terrain-referenced. Take Lr from a North Shore DEM (CGVD2013 converted to CGVD28), add the chord-sag curvature correction, and carry a wide uncertainty band.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Whether view 12.2 was dropped or the Table 1 row was simply omitted cannot be told; the change shows only in the Feb 2026 PDF. → 12.2 was removed from Table 1 by the 4 June 2025 amendment. Record this PDF version, cite the June 2025 Council decision, and treat 3.4.2's mention as vestigial unless the City says otherwise.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The water aerodrome AC 601-007 notification surface is 60 m AGL, so a CBD tower triggers notification above 60 m AGL. → Classify CYHC (channels, certification) from the CWAS and CBC7 (IAP) from the CFS, then apply s.4.5.1, 4.5.2, 4.5.4 or 4.7 as appropriate.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The service's 2026-04-15 'data edit' shows the cone geometry was edited. → Use geometry hashes as the only edit evidence.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The lower boundary for a roof-aligned cone passes through the highest roof point. → Lr, XY = argmax of (z - Lv)/D over the named roof's returns, excluding penthouses unless named.
- Findings: {'BLOCKER': 1, 'MAJOR': 5, 'MINOR': 7}
- Verdict: Round 2 fixed every round-1 blocker and major (versioning, planar/radial minimum, relaxation masks, aviation, Trout Lake, metrics, banner), but it is not yet safe for designers. In the CBD, 7 of the 9 crossing cones have no parameters, and the checker has no 'unknown' state, so it can report CLEAR inside D, B2, 3.2.1 or 9.x. View H's 'in-force' 58 m conflicts with the 2011 reference data and with Table 1. View 20's reference is a hillside about 11 km away, not a roof, and the default without curvature then overstates the limit by about 2 m. The roof rule should use maximum elevation angle. The June 2025 PVG version, which removed 12.2, and the AC 601-007 categories also need correcting.

## revise-r2: draft saved as `revise-r2_C01.json`
  - r1: Re-tagged every City value by cone version; 9.2 (Oct 2024 sheet), Barclay, 2004 rows, 1133 W Georgia and superseded values moved to a non-gating historical suite; gating set is A (4) and 3.2.3 (5).
  - r1: Default surface is now min(radial, planar). Refit reproduced the critique: A 0.012 vs 0.037 m, 9.2 0.008 vs 0.024 m. Corrected its claim that radial is always higher: it depends on reference bearing.
  - r1: Higher Buildings and Exceptional Downtown Sites became user-enabled per-cone relaxation masks, not caps; guidance heights are reference lines only.
  - r1: M06 now holds rule-based aviation warnings: CAR 601.23/601.24, AC 601-007 notification surfaces (60 m AGL; heliport 4% to 1,500 m), CYHC and CBC7 positions (about 2 km from the CBD).
  - r1: Trout Lake corrected beyond the critique: printed coordinates are the 2670 Victoria Dr corner (Proposed column); amendments were referred back (RTS 19750); 54.3 and 59.8 m remain in force; k 0.03685 and 0.04533.
  - r1: Roof route restored: Lr from LiDAR 2022 roofs. Earlier 'implausible' verdict reversed (485 W 8th ground about 16 m; implied roof 43 m ASL). Cones classified S1-S4; 8 of 24 now parameterised.
  - r1: Versioning by geometry hash and layer edit dates; EFFECTIVE_DATE informational. Landmark-bearing audit added: H, J2, 28, 9.1 match Council text within 0.05 degrees; Trout Lake service wedges are pre-2026.
  - r1: Metrics restated: fit residuals separate from leave-one-out (A 0.017 planar, 0.050 radial; 3.2.3 0.004); 0 of 24 cones have a held-out point; free-intercept check shows Lv, not Lv+1.6 m.
  - r1: Eye height: Lv probably already eye level (1.4-3.5 m over 2002 contours); camera default adds 0 m. Curvature switch added; QE 3.2.3 fits either a line or a level sightline with curvature.
  - r1: Rings stored (cone 28 has five vertices; K far edge is its subject). Downtown and CBD boxes stated explicitly and labelled test boxes; City boundary polygons to be digitised.
  - r1: Frames and datum: NAD83 original versus CSRS about 0.1 m (Esri Canada); HTMVBC00 equals renamed HTGVRDBC00; LiDAR tiles 1 km, 16.45 MB to 2.74 GB; edge band 1.5 m.
  - r1: Added not-modelled table and standing banner; 12.2 status updated from RTS 16338 Rec D; 3.2.x geometry shown unamended in 2024, so the 'QE rewrite' claim is unverified.

## critic-r3: Gatekeeper planner and geodesy reviewer: protected-view height surfaces, vertical datums and aviation obstacle rules for Vancouver tall buildings
- Gate pass: **True**
  - condition: Cut the scope to a 13 Nov minimum viable product (M01, M03 with the 8 cones and the INCOMPLETE mask, M05 with NO ESTIMATE, the M07 regression and structural tests, M04 CBD tiles) and list the deferred items.
  - condition: Send the consolidated City data request (REFERENCE_* for 24 cones, datum, eye height, distance rule, posted H, J2 and 3.2.4) before relying on per-site assessments.
  - condition: Label H, J2 and 3.2.4 as endorsed with the posted value unconfirmed (App K 'subject to change and refinement'); never show their limits without that label.
  - condition: Keep the S3 roof-aligned cones as NO ESTIMATE until the 1008 Cambie roof test passes within 2 m.
  - condition: Add the 2611 Victoria Dr held-out case and the 3.4.3 Lions condition on the B1 and D masks.
  - condition: Show a NAV CANADA procedure-surface warning on every tower over 90 m until the City layer is obtained.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: No aviation height surface is available downtown beyond AC 601-007; NAV CANADA outcomes can only be entered by users per project. → Request the layer and its coverage from the City. Until then, flag every tower over 90 m with a NAV CANADA procedure-surface warning and a crane-allowance note.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: View H 58 m and J2 43.5 m (Appendix K) are printed, in-force S1 parameters. → Class them as endorsed with the posted value unconfirmed. Confirm the posted lower lines from City reference sheets or by asking the City.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Guideline 3.1.5 sets a 2 m tolerance usable for model alignment. → Use a team target tied to LiDAR accuracy and the user's survey control.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The service yields exactly 16 distinct origins. → 16 holds only with a stated merge tolerance (for example 1 m).
- Findings: {'MAJOR': 3, 'MINOR': 11}
- Verdict: Pass, with conditions. I re-checked the main sources and they hold: the Feb 2026 PDF hash, Table 1, the clause pages, the service fields and apexes, Council vote 11268 on Rec K, the Appendix K values, the Trout Lake referral, the LiDAR datum and CAR 601.23. The no-estimate status removes false CLEAR results. Three gaps remain. Delivery: about 25 person-days of work against 23 days to 13 Nov. Parameters: 16 cones have none, and one consolidated City request for the empty REFERENCE_* fields would help more than 20 site assessments. Aviation: the City holds an unused NAV CANADA height layer. The H, J2 and 3.2.4 values are endorsed but may be refined, so label them as unconfirmed. Keep roof-aligned cones blank until the 1008 Cambie test passes, and add the 2611 Victoria Dr check.
