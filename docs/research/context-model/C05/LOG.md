# context-model / C05: research log

## research: draft saved as `research_C05.json`
  - Round 1: first pass on C05. Read all four local repos; read public pages of two classmate repos and the class toolkit; queried City APIs and GitHub Pages headers live; recomputed frame constants against WGS 84; drafted Layer 0, port map, duplicate list, pack budget, licence matrix and permission plan.

## critic-r1: Plug-in platform architect (schema, CRS/datum and licensing review), independent of the authors
- Gate pass: **False**
  - condition: Resolve the floors/tower_id contradiction with PVV's importer and add a multi-tower fixture before freezing Layer 0 v1
  - condition: Make vertical_datum required on ceilings, massing and context layers, with the CGVD28 Metro Vancouver realization in the enum
  - condition: Replace or qualify the EPSG:3157 area claim (geodesic or local TM areas; area method field)
  - condition: Add the legacy-dtmass-1 converter and record DT Mass's verified cone copy
  - condition: Add guideline instrument and version fields; have a human obtain the PDF and verify the clauses
  - condition: Rescope the plan to 13 Nov and add a CI workflow
  - condition: Add licence files with co-author consent; hold or rebuild the Vista packs derived from the supplied model
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: At least four distinct rhino3dm builds ship (Vista, Form Studio with version unrecorded, Solar, DT Mass's own copy). → Three versions: 8.35.0 (Vista), 8.17.0 (Form Studio and DT Mass), 8.4.0 (Solar).
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: DT Mass works in local metres from the parcel south-west corner, and the shared frame is used identically across tools. → DT Mass meta: origin [-123.118, 49.283], scale [72616.63, 110574]. It needs its own legacy converter.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: DT Mass loads its own view-cone copy (unverified). → Verified third copy: 17 cones {id, n, d, u, p} in DT Mass model metres.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Toolbench outputs links and an emailed feedback form; no data. → Inventory the vtt-draft key, the Google Form endpoint and the window.claude db/user use.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Adopting EPSG:3157 fixes the area bias to the 0.05% target. → Use geodesic areas or a low-distortion local TM, and label the area method.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The view-cone by-law is authoritative (dataset entry; Vista origin_derivation). → Cite the guideline (version date, clause) and model it as discretionary unless a by-law or ODP clause is cited.
- Findings: {'BLOCKER': 2, 'MAJOR': 9, 'MINOR': 5}
- Verdict: Do not freeze Layer 0 v1 yet. The arithmetic checks out: the frame constants, the 0.58% north-south error and the area bias all recompute correctly. But two core contracts break. First, PVV's importer drops tower_id and other unknown fields and rejects repeated levels, so multi-tower floors cannot round-trip. Second, a view ceiling has no vertical datum, although the guideline defines cones by geodetic height and the City's survey heights are CGVD28 on the Metro Vancouver geoid. The proposed EPSG:3157 frame also misses the spec's own 0.05% area target (grid areas run about 0.08% low). DT Mass uses a different frame, the City's LiDAR height data are left out, and the guideline PDF is still unverified (403). Licences and consents remain open.

## critic-r1: Software architect for plug-in and node-based design platforms (schemas, typed ports, shared services, geodetic frames, licensing of open data)
- Gate pass: **False**
  - condition: Layer 0 v1 fixes the vertical datum (CGVD28 default) and requires datum and grade_z on Massing, ViewStudy and ContextRef
  - condition: floors[] is keyed by (tower_id, level), and the PVV adapter's behaviour on multiple towers and extra fields is specified and tested
  - condition: City 2009 LiDAR footprints and 2022 LiDAR are added as primary context sources, and the pack keeps parts per bldgid
  - condition: DT Mass frame recorded and converter planned; EPSG:3157 scale factor handled (local TM k=1 or geodesic areas)
  - condition: The checks schema carries guideline edition, page, element kind and tolerance
  - condition: 13 Nov scope cut to fit 2 people x 23 days
  - condition: The public Vista derived packs are either cleared for redistribution or excluded from shared packs
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Four or more distinct rhino3dm builds ship across Vista, Form Studio, Solar and DT Mass. → There are three distinct builds: Vista 8.35.0, Form Studio and DT Mass (shared, version unrecorded), and Solar 8.4.0.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: DT Mass works in local metres from the parcel south-west corner, and its view-cone copy is only suspected. → DT Mass's frame has origin (-123.118, 49.283) and scale [72616.63, 110574.0]. Its city-data.js holds 17 view cones, 6,319 City 2009 footprints with heights, 272 zoning polygons and 4,348 parcels.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Only view 10's object_id changed (3 in Vista, 1 live). → object_id changed for 19 of 24 cones. All 24 polygons are vertex-identical to Vista's snapshot.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Context building heights must come from OSM tags or estimates (PVV subset 24% measured), with terrain from 60 m SRTM. → Use building-footprints-2009 (124,181 LiDAR parts, topelev_m and baseelev_m geodetic, bldgid groups) and lidar-2022 (0.081 m vertical accuracy at 95%, NAD83(CSRS) UTM10, CGVD28 Metro Vancouver geoid), plus the 1 m DEM from 2013, as primary sources. Keep OSM for buildings built after 2009.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Switching to EPSG:3157 brings distance and area error within the 0.05% target. → Grid distances come out 0.040% short and grid areas 0.080% small, so the area target fails. Use a local TM with k=1 at the frame origin, or compute geodesic areas.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Orthophotos_2022 licence is not shown and its terms are unverified. → orthophoto-imagery-2022 is published under OGL-Vancouver, in EPSG:26910 at 7.5 cm. Only the separate ArcGIS tile endpoint's terms remain unconfirmed.
- Findings: {'BLOCKER': 1, 'MAJOR': 8, 'MINOR': 6}
- Verdict: Not ready. The audit is mostly accurate: PVV's 118 test() calls, the absence of licences, the legacy-frame arithmetic, the UTM values and the npm versions all reproduce. The schema, though, cannot yet support the platform's purpose. Height ports carry no vertical datum, while the guideline sets cones by geodetic height and City data is in CGVD28. PVV's importer drops tower_id and rejects repeated levels. The spec misses the City's LiDAR footprints with measured geodetic roof heights. DT Mass uses a fourth frame. EPSG:3157 still fails the spec's own 0.05% area target. Fix the datum, floor keying and data sources, and cut the 13 Nov scope (32 to 36 person-days estimated), before freezing Layer 0 v1.

## revise-r1: draft saved as `revise-r1_C05.json`
  - Round 1: first pass on C05. Read all four local repos; read public pages of two classmate repos and the class toolkit; queried City APIs and GitHub Pages headers live; recomputed frame constants against WGS 84; drafted Layer 0, port map, duplicate list, pack budget, licence matrix and permission plan.
  - r1: BLOCKER fixed: PVV's importer drops unknown fields and rejects repeated levels (app.js 52 to 78). Floors now nest per tower (massing.towers[].floors), the host passes a projection and merges patches, a semantic validator and a two-tower fixture were added, and the round-trip metric was redefined.
  - r1: BLOCKER fixed: ceiling is {elevation_m, vertical_datum required, source_doc, clause, page, verified_on, status}; the vertical enum adds CGVD28_HTMVBC00 and geodetic_unspecified; datum and grade_z_m are required on massing parts and context layers; height above base is barred from cone checks.
  - r1: MAJOR fixed: working frame is now vtm-local-1 (transverse Mercator, k0=1); EPSG:3157 kept for exchange only; area method field added; recomputed grid, ellipsoidal and legacy areas for Library Square and view 10 (grid is 0.080% low).
  - r1: MAJOR fixed: per-layer horizontal datum; EPSG default NAD83(CSRS) to WGS 84 accuracy 1.0 m recorded; found that view 10's shape_length and shapre_area equal UTM 10 grid values to 8 digits, so portal lon/lat need no shift; validation case renamed.
  - r1: MAJOR fixed: added legacy-dtmass-1 (origin, scale, per-site rotation) with a validation case; DT Mass's 17-cone copy verified (not suspected); DT Mass origin is 196.06 m east and 33.17 m north of Vista's anchor.
  - r1: MAJOR fixed: added datasets City LiDAR 2022 and 2018, building-footprints-2009, DEM 2013, LidarBC and HTMVBC00; pack height_source codes 4 to 6, top_dm and a datum code; City heights kept in a separate OGL file from ODbL footprints.
  - r1: MAJOR fixed: checks[].instrument added and cone intersections map to review; guideline, portal 'bylaws' and ODP Map 4 conflict flagged; clause-number and 'obstructed' quote issues recorded (PDF still 403, a person must read it).
  - r1: MAJOR fixed: currency: Trout Lake changes were referred back on 4 Feb 2026 and a 14 Jul 2026 report concerns 2611 Victoria Dr, not an amendment; views.currency and a stale check added; Vista Table 1 conflict flagged.
  - r1: MAJOR fixed: validation tooling: Ajv2020 class, standalone ES-module validators built in CI, GitHub Actions workflow on Node LTS added to the 13 Nov scope (Node and Actions pages read).
  - r1: MAJOR fixed: schedule rescoped to schema, frame, PVV and Form Studio adapters, licence files and CI (about 14 person-days); M05, M06, Vista import, shell and classmate nodes moved after 13 Nov; dated plan and float metric added.
  - r1: MAJOR fixed: licences: API shows license null for DT Mass, Solar and the toolkit; hold-or-rebuild decision on Vista's generated packs and co-author consent recorded; OGL-Vancouver text read as a 2017 secondary copy.

## revise-r1: draft saved as `revise-r1_C05.json`
  - Round 1: first pass on C05. Read all four local repos; read public pages of two classmate repos and the class toolkit; queried City APIs and GitHub Pages headers live; recomputed frame constants against WGS 84; drafted Layer 0, port map, duplicate list, pack budget, licence matrix and permission plan.
  - r1: Added vertical{datum, grade_z_m, grade_source} to Frame and to every Massing, ViewStudy, ContextRef and ceiling; CGVD28 default for City layers flagged inferred; comparisons return unknown on datum mismatch (M02, M03).
  - r1: floors[] keyed on (tower_id, level); PVV adapter filters or aggregates and logs it; extra fields via host or ext.pvv; two-tower fixture and custom validator added; false claims about unchanged PVV import corrected (M02, M04).
  - r1: Added City building-footprints-2009, lidar-2022, LiDAR 2013 and 2018 with the 1 m DEM, and footprints-2015 to datasets; pack keeps parts per bldgid, adds height_source 4; OSM only for buildings after 2009 (M06).
  - r1: Added legacy-dtmass-1 frame with converter and validation case; DT Mass copy of cones verified (17 of 24, within 0.06 m) and its 6,319 footprints recorded (heights above grade only).
  - r1: Replaced EPSG:3157 as working frame by local TM with k=1; EPSG:3157 kept for exchange (areas 0.080% small); Library Square values for all three frames added.
  - r1: Defined Layer 0 lon/lat as NAD83(CSRS) as served (portal parcel corner within 0.11 m of council UTM); noted NRCan 2 m ITRF offset and NATRF2022 timeline (M03).
  - r1: Extended checks[] with guideline_version, heading, page, element_kind, statistic and tolerance_m; recorded the 3.1.x numbering under heading 3.2, Table 1 against dataset (view 28 added, 12.2 stale).
  - r1: Added Placement port for IFC, OBJ and .3dm georeferencing (M02, M04).
  - r1: Cut 13 Nov scope to Layer 0 v1, frame, PVV and Form Studio export adapters, cone pack and CI (about 14 to 16 person-days); dated cut list and deferred list in M08.
  - r1: Vista's public packs marked non-redistributable and excluded from ContextRefs; Vista example z checked against City LiDAR (about 9.5 m off).
  - r1: rhino3dm builds corrected to 3; Form Studio and DT Mass identified as npm 8.17.0 by hash; unresolved item on Form Studio's version closed.

## critic-r2: Computational design lead (geospatial and interoperability review), round 2 of packet C05
- Gate pass: **False**
  - condition: Layer 0 v1 represents cone ceilings as a location-dependent surface (plane with reference points, or a height_limit_surface ref), and checks evaluate per point before the 23 Oct freeze
  - condition: The building pack plan detects post-2009 change against LiDAR 2022, or the pack is labelled a 2009 snapshot in the UI
  - condition: The vertical block separates datum from realisation or geoid model; checks carry a Vista relation field and use 'conflict' instead of 'block'
  - condition: The horizontal realisation is marked unconfirmed until validated against independent control or confirmed by the City
  - condition: A cross-packet capacity table shows the 13 Nov cut fits within 34 person-days, including the ceiling-surface work
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A single ceiling value (views.ceiling.height_m; Vista boundary 80 m) is the cone limit for a site. → Store a plane or surface with reference points, or a height_limit_surface ContextRef. Evaluate the ceiling at each footprint and roof sample point.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Buildings built after 2009 can be found by non-overlap with the 2009 parts and the 2015 footprints. → Detect change by comparing 2009 topelev_m with the LiDAR 2022 surface per part (for example |dz| > 2 m), and take current tops from LiDAR 2022.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A parcel corner matching council UTM values within 0.11 m shows that portal lon/lat are NAD83(CSRS). → Treat the realisation as unconfirmed. Validate against an independent geodetic control monument and confirm with City GIS in writing.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The February 2026 edition of the Public Views Guidelines is unavailable, so only the June 2025 edition could be read. → Cite and hash the local copy (amended 2026-02-04, accessed 2026-09-22) for clause and page fields.
- Findings: {'MAJOR': 2, 'MINOR': 9}
- Verdict: Round 2 fixed most of round 1: vertical datum blocks, floors keyed by tower, the local TM frame, the DT Mass frame, richer checks, and the 13 Nov cut. Local hashes and code lines check out. Two problems block the 23 Oct Layer 0 freeze. First, a cone ceiling is stored as one number, but the City defines it by an eye-point plane, so the limit varies across a site, sometimes by more than the 2 m tolerance. Second, the 2009 City footprints are treated as current roofs, and the test for newer buildings misses rebuilds and anything after 2015. Minor fixes: the horizontal-datum evidence is circular, the datum enum mixes datum and geoid model, IFC2x3 georeferencing is missing, the team already holds the Feb 2026 Guidelines, and a capacity table is needed across packets. Gate fails until the ceiling becomes a surface.

## revise-r2: draft saved as `revise-r2_C05.json`
  - Round 1: first pass on C05. Read all four local repos; read public pages of two classmate repos and the class toolkit; queried City APIs and GitHub Pages headers live; recomputed frame constants against WGS 84; drafted Layer 0, port map, duplicate list, pack budget, licence matrix and permission plan.
  - r1: Added vertical{datum, grade_z_m, grade_source} to Frame and to every Massing, ViewStudy, ContextRef and ceiling; CGVD28 default for City layers flagged inferred; comparisons return unknown on datum mismatch (M02, M03).
  - r1: floors[] keyed on (tower_id, level); PVV adapter filters or aggregates and logs it; extra fields via host or ext.pvv; two-tower fixture and custom validator added; false claims about unchanged PVV import corrected (M02, M04).
  - r1: Added City building-footprints-2009, lidar-2022, LiDAR 2013 and 2018 with the 1 m DEM, and footprints-2015 to datasets; pack keeps parts per bldgid, adds height_source 4; OSM only for buildings after 2009 (M06).
  - r1: Added legacy-dtmass-1 frame with converter and validation case; DT Mass copy of cones verified (17 of 24, within 0.06 m) and its 6,319 footprints recorded (heights above grade only).
  - r1: Replaced EPSG:3157 as working frame by local TM with k=1; EPSG:3157 kept for exchange (areas 0.080% small); Library Square values for all three frames added.
  - r1: Defined Layer 0 lon/lat as NAD83(CSRS) as served (portal parcel corner within 0.11 m of council UTM); noted NRCan 2 m ITRF offset and NATRF2022 timeline (M03).
  - r1: Extended checks[] with guideline_version, heading, page, element_kind, statistic and tolerance_m; recorded the 3.1.x numbering under heading 3.2, Table 1 against dataset (view 28 added, 12.2 stale).
  - r1: Added Placement port for IFC, OBJ and .3dm georeferencing (M02, M04).
  - r1: Cut 13 Nov scope to Layer 0 v1, frame, PVV and Form Studio export adapters, cone pack and CI (about 14 to 16 person-days); dated cut list and deferred list in M08.
  - r1: Vista's public packs marked non-redistributable and excluded from ContextRefs; Vista example z checked against City LiDAR (about 9.5 m off).
  - r1: rhino3dm builds corrected to 3; Form Studio and DT Mass identified as npm 8.17.0 by hash; unresolved item on Form Studio's version closed.

## critic-r3: Gatekeeper for geospatial data, provenance and licensing. I checked the C05 round-3 spec against the four local repos, the live City/npm/GitHub APIs and the published Pages files.
- Gate pass: **True**
  - condition: Before the 23 Oct freeze: hashes and sizes recomputed from committed or served bytes, .gitattributes added, polygon-hash canonical form defined
  - condition: Before the 23 Oct freeze: ceiling evaluation uses exact polygon clipping for prisms, returns none, unknown or value, and passes F1 to F5
  - condition: PVV basemap and Vista packs both marked non-redistributable, and removed from Pages or covered by written permission, before any Layer 0 ContextRef points to them
  - condition: Checks on views 27.1, 27.2, 9.1, 9.2 and 28 return unknown until the City confirms the dataset geometry
  - condition: Floors reference a massing part's grade; tolerance_m does not drive status
  - condition: Cross-packet capacity table published by the freeze, with the cut order applied if C05 exceeds 17 person-days
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vista data/guideline.json has SHA-256 5c214a50 (12,337 B); viewcones.json is 37,707 B; example-study.json is 25,508 B; vancouver-sites.js is 296,947 B. → guideline.json: 12,062 B, SHA-256 51ba7ee75633522f…, matching the Pages copy and Vista's release-manifest.json. viewcones.json: 36,357 B. example-study.json: 24,624 B. vancouver-sites.js: 296,943 B.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The PVV downtown basemap is an ODbL derived OSM database and can serve as the clean template for Layer 0 building packs. → Treat it like Vista's packs: provenance is the supplied model with OSM ids and SRTM, and terms are unknown. Keep the format, rebuild the data from City 2009 parts and OSM, or obtain permission.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The Solar tool's weather data size is unknown and lives in src/data/hourly.js. → weather/weatherfile-fsstat-typical-year-gw1.0-1108395.epw (1,588,114 B) and gw2.0 (1,587,269 B). Licence still unverified.
- Findings: {'MAJOR': 3, 'MINOR': 10}
- Verdict: Round 3 fixes the previous round's two MAJOR items and gate conditions 1 to 4. I re-checked the clause extract, footprint fields, LiDAR metadata, the 1 MB import caps (1,000,000 B in Form Studio, 1,048,576 B in Vista) and the frame arithmetic, and they hold. Three new MAJOR problems remain. First, every text-file hash and size was taken from a CRLF Windows checkout; the guideline.json value is wrong, and Layer 0's hash-based keys would not reproduce. Second, the PVV basemap, offered as the pack template, comes from the unlicensed studio model. Third, ceilingAt checks only footprint vertices and so misses partial overlaps. Conditional pass: the team can build frame.js and the PVV adapter now, provided the hashing rule, the ceiling clipping and both data packs' licence status are fixed by the 23 Oct freeze.

## revise-r3: draft saved as `revise-r3_C05.json`
  - Round 1: first pass on C05. Read all four local repos; read public pages of two classmate repos and the class toolkit; queried City APIs and GitHub Pages headers live; recomputed frame constants against WGS 84; drafted Layer 0, port map, duplicate list, pack budget, licence matrix and permission plan.
  - r1: Added vertical{datum, grade_z_m, grade_source} to Frame and to every Massing, ViewStudy, ContextRef and ceiling; CGVD28 default for City layers flagged inferred; comparisons return unknown on datum mismatch (M02, M03).
  - r1: floors[] keyed on (tower_id, level); PVV adapter filters or aggregates and logs it; extra fields via host or ext.pvv; two-tower fixture and custom validator added; false claims about unchanged PVV import corrected (M02, M04).
  - r1: Added City building-footprints-2009, lidar-2022, LiDAR 2013 and 2018 with the 1 m DEM, and footprints-2015 to datasets; pack keeps parts per bldgid, adds height_source 4; OSM only for buildings after 2009 (M06).
  - r1: Added legacy-dtmass-1 frame with converter and validation case; DT Mass copy of cones verified (17 of 24, within 0.06 m) and its 6,319 footprints recorded (heights above grade only).
  - r1: Replaced EPSG:3157 as working frame by local TM with k=1; EPSG:3157 kept for exchange (areas 0.080% small); Library Square values for all three frames added.
  - r1: Defined Layer 0 lon/lat as NAD83(CSRS) as served (portal parcel corner within 0.11 m of council UTM); noted NRCan 2 m ITRF offset and NATRF2022 timeline (M03).
  - r1: Extended checks[] with guideline_version, heading, page, element_kind, statistic and tolerance_m; recorded the 3.1.x numbering under heading 3.2, Table 1 against dataset (view 28 added, 12.2 stale).
  - r1: Added Placement port for IFC, OBJ and .3dm georeferencing (M02, M04).
  - r1: Cut 13 Nov scope to Layer 0 v1, frame, PVV and Form Studio export adapters, cone pack and CI (about 14 to 16 person-days); dated cut list and deferred list in M08.
  - r1: Vista's public packs marked non-redistributable and excluded from ContextRefs; Vista example z checked against City LiDAR (about 9.5 m off).
  - r1: rhino3dm builds corrected to 3; Form Studio and DT Mass identified as npm 8.17.0 by hash; unresolved item on Form Studio's version closed.
