# context-model / C02: research log

## research: draft saved as `research_C02.json`
  - Round 1: first version of packet C02; no earlier version exists.
  - Corrected scope assumptions: Google Open Buildings has no Canada coverage; only the 2009 City footprints have heights; EPSG:26910 is not NAD83(CSRS); City publishes no 2018/2022 DEM rasters.
  - Added M01 datum registry after finding City LiDAR is CGVD28GVRD, HRDEM and MRDEM are CGVD2013, SRTM is EGM96, GLO-30 is EGM2008.
  - Added hand-checkable validation cases, including computed UTM tile corners and Vista-frame offsets.

## critic-r1: LiDAR and GIS specialist (city-scale 3D models, vertical datums, DEM fusion), external reviewer of packet C02 round 1
- Gate pass: **False**
  - condition: Add an MVP scope that fits before 13 Nov 2026 and re-estimate effort.
  - condition: Replace the R2 mountain source with footprint-verified HRDEM items (VI_Sunshine_Coast_2018 or the 2_3 mosaic) and add the seam/offset step.
  - condition: Add the per-layer horizontal realisation rule (portal lon/lat as EPSG:4617) with a round-trip test.
  - condition: Keep appurtenances: an unfiltered appurtenance_max separate from filtered LOD1 heights.
  - condition: Remove or restate the Thurlow/Haro validation case.
  - condition: State that compliance runs in EPSG:3157 plus CGVD28 (HTMVBC00 realisation), separate from the ENU render frame, and calibrate against GeoNetBC monuments.
  - condition: Name a building source for North Vancouver and other foreground municipalities.
  - condition: Correct the Vista frame-error figures and the OGL-Vancouver licence statements.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: HRDEM BC-Lower_Mainland_2016-1m covers the North Shore front ranges (its bbox reaches 49.5125 N), so it can serve ring R2. → Those peaks fall in BC-Vancouver_Island_Sunshine_Coast_2018-1m and in the 2_3-mosaic-1m/2m and MRDEM. Pick sources by footprint and handle the 2016/2018 seam.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vista's local frame differs from UTM by about 5 m at 2.5 km (up to 34 m at extent corners). → About 13.5 m at 2.5 km north and about 170 m at 30 km north, which affects the SRTM backdrop mountains. Vista's 0.1 m footprint check is circular.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The OGL-Vancouver full text is not readable and may be 'viral'; combining it with other data needs a legal opinion first. → Required statement: 'Contains information licensed under the Open Government Licence – Vancouver'. There is a non-endorsement clause. Share-alike comes only from ODbL (OSM) layers.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 3D BAG practice is six roof percentiles '50, 75, 90, 95, 99 and max'. → 3D BAG uses 25/50/75/90/95/99 for roofs and ground 0-50 in a 0.5 m buffer. Max is a team addition.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: View 3.2.1 values at Barclay (123.201 m) and Thurlow/Haro (361 ft) together imply City DTM ground of about 13 m at Thurlow/Haro. → Treat both as unverified geodetic cone heights. Do not derive ground from them; get a City property view assessment.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Metro Vancouver (and City LiDAR) use HTGVRDBC00; HT2_2010v70 via PROJ is an adequate CGVD28 bridge. → Canonical realisation: CGVD28 via HTMVBC00 (the extended HTGVRDBC00), epoch 1997.0. Quantify the HT2_2010 difference locally.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City portal lon/lat exports can simply be reprojected to EPSG:3157. → Read City portal coordinates as EPSG:4617 (NAD83(CSRS)) and transform true WGS84 sources (OSM, Overture, Microsoft) separately.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: pydelatin wheels for Python 3.13 on Windows are unconfirmed; meshoptimizer licence unverified. → Mark both as available and MIT.
- Findings: {'BLOCKER': 1, 'MAJOR': 8, 'MINOR': 8}
- Verdict: C02 is well researched: the datum and source matrix, the LiDAR-first height method and the storage targets are sound. It is not ready to build on. Four errors would carry straight into the product: (1) the mountain ring R2 points at an HRDEM project that does not cover the North Shore peaks; (2) treating the portal's lon/lat as WGS84 would shift City geometry by 1 to 1.5 m; (3) the spike filter deletes the appurtenances that clause 3.1.1 counts; (4) one validation case subtracts two different sites' cone heights. The frame used for compliance tests is unstated, buildings outside City limits have no source, and about 37 person-days against 23 days to the deadline needs an MVP. Fix these, and quantify the HTMVBC00 datum realisation, before round 2.

## critic-r1: LiDAR and GIS specialist (city-scale 3D context models, vertical datums, DEM fusion)
- Gate pass: **False**
  - condition: Replace the HRDEM North Shore claim with measured coverage, and restate mountain accuracy as MRDEM GLO-30-derived (about 5 m RMSE forested) wherever LiDAR is absent.
  - condition: Correct the geoid entry to HTMVBC00 and record epochs. Add the same-source 2013 datum bridge and a sign-convention unit test for vgridshift.
  - condition: Document Vista's 0.58% north-south scale error and require all comparisons in EPSG:3157.
  - condition: Replace parcel-polygon IoU with one-sided coverage plus height-break segmentation, and test it on tile 490000_5459000.
  - condition: Make absolute geodetic elevation the primary output, label above-ground values as non-bylaw estimates, and keep compliance wording blocked until the City confirms the cone datum.
  - condition: Publish a reduced core plan that fits 13 Nov 2026.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: HRDEM BC-Lower_Mainland_2016-1m (bbox to 49.5125 N) provides 1 m terrain and skyline for the North Shore front ranges (M05 R2; dataset row 'use'). → The North Shore peaks are not covered by any HRDEM project item returned for the area. Use MRDEM-30 (GLO-30-derived with forest removal) until other LiDAR coverage is confirmed.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City LiDAR 2022 heights use the HTGVRDBC00 hybrid geoid (M01 limits; dataset table). → City LiDAR 2022: CGVD28GVRD, geoid HTMVBC00 (HTMVBC00_Abbbyn.zip). GeoBC calls HTMVBC00 equivalent to HTGVRDBC00 but extended east to Abbotsford. Record HTMVBC00.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vista's frame differs from UTM by about 5 m at 2.5 km, which is fine for visuals; the difference is a generic projection effect. → Errors reach about 21 m at the north edge of the supplied downtown model and 27 to 34 m at the extension's southern corners. Treat Vista geometry as a distorted legacy frame.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: OGL-Vancouver may be 'viral' (share-alike), so City layers cannot be combined (M08 limits). → City layers need attribution only. The share-alike constraint comes from ODbL (OSM, Overture), so keeping OSM-derived layers separate is still right. Confirm the City's exact attribution string on the portal licence page, which my fetch could not render.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: 13 City LiDAR 2022 tiles lie within 2 km of downtown. → State the rule and list the tiles: 489000-493000 E by 5456000-5460000 N (20 tiles intersect).
- Findings: {'BLOCKER': 1, 'MAJOR': 7, 'MINOR': 6}
- Verdict: Not ready. The direction is sound: City LiDAR 2022 for downtown, a datum registry, LiDAR percentile heights and compact tiles. The tile corner, curvature and pixel-error figures check out. But the main terrain claim fails: no HRDEM project covers Grouse, Seymour, Crown, Cypress or the Lions, so the mountain profiles rest on GLO-30-derived MRDEM (about 5 m RMSE). Smaller problems: the geoid is mis-named (HTMVBC00), Vista's distortion is understated (it comes from a 0.58% north-south constant error, up to about 21 m inside the downtown model), parcel-polygon IoU breaks on contiguous podiums, and height above bare earth would be read as a zoning height. The effort (37 person-days) cannot fit before 13 Nov.

## revise-r1: draft saved as `revise-r1_C02.json`
  - Round 1: first version of packet C02; no earlier version exists.
  - Corrected scope assumptions: Google Open Buildings has no Canada coverage; only the 2009 City footprints have heights; EPSG:26910 is not NAD83(CSRS); City publishes no 2018/2022 DEM rasters.
  - Added M01 datum registry after finding City LiDAR is CGVD28GVRD, HRDEM and MRDEM are CGVD2013, SRTM is EGM96, GLO-30 is EGM2008.
  - Added hand-checkable validation cases, including computed UTM tile corners and Vista-frame offsets.
  - r1: BLOCKER fixed. Rewrote M05 around measured coverage: NRCan extent polygons, HRDEM mosaic WMS point queries and the LidarBC tile index show no open 1 m LiDAR at Grouse, Seymour or Lions samples; ridges are MRDEM-30 (GLO-30-derived). Metric 'Mountain DTM accuracy by source' set to false_assumption_corrected.
  - r1: Corrected the geoid to HTMVBC00 (City portal) with epoch 1997; added the three PROJ epoch variants (EPSG:10617/10618/10619), a same-source 2013 datum bridge, a vgridshift sign test, and a not-ballpark transform assertion. Noted MRDEM and LidarBC cite CGG2013.
  - r1: Documented Vista's frame error as a wrong latitude constant (0.58% short, 0.19% east-west): offsets reproduced (+21.3 m N at (0,3940), 34 m at the SE corner); added Vista-to-UTM transform tests and Vista's SRTM re-seating of buildings (median +0.48 m, -12.2 to +21.6 m) to M07.
  - r1: Replaced parcel-polygon IoU in M02 with one-sided coverage ratios plus roof-height-break splitting; made LiDAR outlines the default for roofs 30 m and higher (orthophoto relief displacement); QA now on DSM hillshade.
  - r1: M04 now publishes absolute cone elevation as the primary output, labels above-ground values 'not the bylaw base surface', adds sigma, an existing-tower regression and a view-origin eye-height parameter (1.68 m, unverified).
  - r1: Fixed tile rule (13 tiles within 1.5 km, 20 within 2 km), listed the tiles, recorded 403 for default clients, measured sizes (City tile 1.007 GB; LidarBC 2025 tile 239 MB; 2016 tile 62.9 MB; DEM sheet 236 MB) and set a browser-download plus checksum procedure.
  - r1: Added reduced 13 Nov core (about 14 person-days: M01 1.5, M02 2, M03 3, M04 2, M05 2, M06 1.5, M07 1, M08 1) against a full plan of about 39; M07 and M08 moved to v1 with core slices; LoD1.3 parts, CI suite and cross-checks deferred.
  - r1: M03 percentile operator clarified (percentiles from the point population, or labelled 'P90 of cell maxima').

## critic-r2: 3D city modelling researcher (CityGML LOD1/LOD2, LiDAR building extraction, vertical datums and accuracy assessment)
- Gate pass: **True**
  - condition: Build the CGVD2013-to-CGVD28GVRD transform from HTMVBC00 (BYN via GDAL), and tighten the bridge tolerance to 0.03 m or less with a negative test.
  - condition: State that cone tests compare geodetic H directly, add the curvature unit test, and ask the City about its curvature convention.
  - condition: Delete the Thurlow/Haro ground inference and flag the conflict between the Barclay range and the 'horizontal' wording.
  - condition: Replace the 3D BAG RMSE as the height-accuracy basis, and add max_all for the regression.
  - condition: Cut the 13 Nov core to about 7 person-days on the fixture and R0 tiles.
  - condition: Keep every height-limit figure labelled 'estimate' until views@vancouver.ca confirms the datum.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Validation case: if view 3.2.1 is 123.201 m (Barclay), 361 ft at Thurlow/Haro implies City DTM there is about 13 m ±1 m. → Remove the inference. Treat 361 ft as an unverified figure of unknown definition, and compare only same-site, same-edition values.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 3D BAG median RMSE (0.31 m flat, 1.06 m non-flat) is a benchmark for tower height error versus published heights. → Use it only as a block-fit metric. Derive height accuracy from the LiDAR, ground and roof-definition error budget, checked against independent references.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The local difference between HTMVBC00 and national HTv2.0 is unquantifiable because HTMVBC00 is not in PROJ. → Convert the BYN to GeoTIFF, use it directly in the CGVD2013-to-CGVD28GVRD chain, and map its difference from HT2_1997.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A City-DTM-minus-converted-HRDEM median of 0.15 m or less demonstrates correct datum handling. → Require 0.03 m or less on hard surfaces, and add a negative test on the unconverted data.
- Findings: {'MAJOR': 7, 'MINOR': 7}
- Verdict: Round 2 fixes the earlier BLOCKER (North Shore coverage) and most MAJOR items, and its numbers check out. Gate passes with conditions; no new BLOCKER. Four problems remain. First, the datum chain uses the national HT2 grid even though the City's own HTMVBC00 grid is downloadable and readable by GDAL. Second, the datum test tolerance (0.15 m) is looser than the 0.12 m shift it should detect. Third, cone tests have no stated frame, which risks 1.7 to 2 m curvature errors at 5 km. Fourth, the Thurlow/Haro validation case compares two different sites and predicts 13 m ground where HRDEM reads about 40 m. The 3D BAG RMSE is misused as a height-accuracy benchmark, and the core plan still exceeds capacity.

## revise-r2: draft saved as `revise-r2_C02.json`
  - Round 1: first version of packet C02; no earlier version exists.
  - Corrected scope assumptions: Google Open Buildings has no Canada coverage; only the 2009 City footprints have heights; EPSG:26910 is not NAD83(CSRS); City publishes no 2018/2022 DEM rasters.
  - Added M01 datum registry after finding City LiDAR is CGVD28GVRD, HRDEM and MRDEM are CGVD2013, SRTM is EGM96, GLO-30 is EGM2008.
  - Added hand-checkable validation cases, including computed UTM tile corners and Vista-frame offsets.
  - r1: BLOCKER fixed. Rewrote M05 around measured coverage: NRCan extent polygons, HRDEM mosaic WMS point queries and the LidarBC tile index show no open 1 m LiDAR at Grouse, Seymour or Lions samples; ridges are MRDEM-30 (GLO-30-derived). Metric 'Mountain DTM accuracy by source' set to false_assumption_corrected.
  - r1: Corrected the geoid to HTMVBC00 (City portal) with epoch 1997; added the three PROJ epoch variants (EPSG:10617/10618/10619), a same-source 2013 datum bridge, a vgridshift sign test, and a not-ballpark transform assertion. Noted MRDEM and LidarBC cite CGG2013.
  - r1: Documented Vista's frame error as a wrong latitude constant (0.58% short, 0.19% east-west); added Vista-to-UTM transform tests and Vista's SRTM re-seating of buildings (median +0.48 m, -12.2 to +21.6 m) to M07.
  - r1: Replaced parcel-polygon IoU in M02 with one-sided coverage ratios plus roof-height-break splitting; made LiDAR outlines the default for roofs 30 m and higher; QA now on DSM hillshade.
  - r1: M04 now publishes absolute cone elevation as the primary output, labels above-ground values 'not the bylaw base surface', adds sigma, an existing-tower regression and a view-origin eye-height parameter.
  - r1: Fixed tile rule (13 tiles within 1.5 km, 20 within 2 km), recorded 403 for default clients, measured sizes and set a browser-download plus checksum procedure.
  - r1: Added reduced 13 Nov core (about 14 person-days) against a full plan of about 39; M07 and M08 moved to v1 with core slices.
  - r1: M03 percentile operator clarified; new dataset LidarBC Provincial LiDAR 2025 for post-2022 tower detection; licences, Vista per-building cost with index files, peak check relaxed to 15 m.

## critic-r3: Gatekeeper reviewer for geodesy, open elevation and building data, and licensing (round 3, packet C02)
- Gate pass: **True**
  - condition: Add the NAD83v70VG epoch-propagation step (layer epoch to 1997.0) to the HTMVBC00 chain and report its magnitude before any 0.03 m test is applied.
  - condition: Accept the datum chain against GeoNetBC geodetic control monuments; use the HRDEM 2013 bridge only as a diagnostic, with both predicted residual grids (HTMVBC00 and HT2) computed.
  - condition: Change max_all to nearest-footprint point assignment with Noise excluded and a point-cluster rule, before the existing-tower regression is run.
  - condition: Add the core footprint-offset check (building-point share and centroid offset) for towers taller than 30 m that are not hand-traced.
  - condition: The team opens the Public Views Guidelines PDF in a browser, records its edition and sha256, extracts any datum or curvature text, and diffs the 2026-10-19 view-cone update now.
  - condition: Redefine core M04 as Z_ground plus an interface tested on synthetic cones; label every real height-limit figure 'estimate'.
  - condition: Correct the City attribution string to OGL-Vancouver and the 3.2.1 amendment flag.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: HTMVBC00 and CGG2013a can be combined as H28 = H2013 + N_CGG2013a - N_HTMVBC00 through one ellipsoidal height, with epoch mixing only a residual note. → Add an NAD83(CSRS) velocity-grid step (ca_nrc_NAD83v70VG) from the layer epoch to 1997.0 before applying N_HTMVBC00, and report its magnitude.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City DTM minus converted HRDEM within 0.03 m demonstrates that the team's HTMVBC00 chain is correct. → Treat the bridge as a diagnostic that shows which model NRCan used. Accept the chain against geodetic control monuments.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: View 3.2.1 was amended in 2024, so the Barclay edition and datum may differ. → 3.2.1 is unchanged since 1989. 12.1.1 is absent from the 2024 Table 1, so the Barclay document uses the pre-2024 view set.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Default attribution for City layers should be 'Contains information licensed under the Open Government Licence - British Columbia.' → Use 'Contains information licensed under the Open Government Licence – Vancouver' for City layers.
- Findings: {'MAJOR': 6, 'MINOR': 7}
- Verdict: Round 3 fixes most of the round-2 MAJOR items: the HTMVBC00 chain, the 0.03 m bridge and its negative test, direct comparison of geodetic H, max_all, and the 7-day core. The datum work still has two holes. The chain ignores the 1997.0 epoch that LTSA 465C states for the Metro Vancouver hybrid model. And the 2013 bridge tests NRCan's undocumented conversion rather than the team's chain, so the acceptance test should use geodetic control monuments. max_all's 0.5 m buffer picks up neighbouring tower walls on parcel-split polygons and includes noise. The Guidelines PDF has still not been opened directly, and the cones changed on 19 Oct 2026. The flag on view 3.2.1 is wrong: it was approved in 1989 and not amended. The City attribution names the wrong licence. Pass, provided the listed conditions are met.

## revise-r3: draft saved as `revise-r3_C02.json`
  - Round 1: first version of packet C02; no earlier version exists.
  - Corrected scope assumptions: Google Open Buildings has no Canada coverage; only the 2009 City footprints have heights; EPSG:26910 is not NAD83(CSRS); City publishes no 2018/2022 DEM rasters.
  - Added M01 datum registry after finding City LiDAR is CGVD28GVRD, HRDEM and MRDEM are CGVD2013, SRTM is EGM96, GLO-30 is EGM2008.
  - Added hand-checkable validation cases, including computed UTM tile corners and Vista-frame offsets.
  - r1: BLOCKER fixed. Rewrote M05 around measured coverage: NRCan extent polygons, HRDEM mosaic WMS point queries and the LidarBC tile index show no open 1 m LiDAR at Grouse, Seymour or Lions samples; ridges are MRDEM-30 (GLO-30-derived). Metric 'Mountain DTM accuracy by source' set to false_assumption_corrected.
  - r1: Corrected the geoid to HTMVBC00 (City portal) with epoch 1997; added the three PROJ epoch variants (EPSG:10617/10618/10619), a same-source 2013 datum bridge, a vgridshift sign test, and a not-ballpark transform assertion. Noted MRDEM and LidarBC cite CGG2013.
  - r1: Documented Vista's frame error as a wrong latitude constant (0.58% short, 0.19% east-west); added Vista-to-UTM transform tests and Vista's SRTM re-seating of buildings (median +0.48 m, -12.2 to +21.6 m) to M07.
  - r1: Replaced parcel-polygon IoU in M02 with one-sided coverage ratios plus roof-height-break splitting; made LiDAR outlines the default for roofs 30 m and higher; QA now on DSM hillshade.
  - r1: M04 now publishes absolute cone elevation as the primary output, labels above-ground values 'not the bylaw base surface', adds sigma, an existing-tower regression and a view-origin eye-height parameter.
  - r1: Fixed tile rule (13 tiles within 1.5 km, 20 within 2 km), recorded 403 for default clients, measured sizes and set a browser-download plus checksum procedure.
  - r1: Added reduced 13 Nov core (about 14 person-days) against a full plan of about 39; M07 and M08 moved to v1 with core slices.
  - r1: M03 percentile operator clarified; new dataset LidarBC Provincial LiDAR 2025 for post-2022 tower detection; licences, Vista per-building cost with index files, peak check relaxed to 15 m.
