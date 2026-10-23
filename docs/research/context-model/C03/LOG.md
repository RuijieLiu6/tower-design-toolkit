# context-model / C03: research log

## research: draft saved as `research_C03.json`
  - Replaced assumed height-range tree field with measured height_m class structure (84 values, ten classes 95.6%).
  - Added empirical finding that Pages gzip breaks range reads for octet-stream and JSON; added probe gate and whole-file default.
  - Excluded release assets and LFS from browser delivery after CORS and Pages tests.
  - Replaced BC Assessment with City property tax report plus verified parcel join at 1030 W Georgia.
  - Added vertical-datum registry module after finding CGVD28GVRD, CGVD2013, EGM96 and ellipsoid layers.
  - Marked TransLink permission-based and Overture/OSM ODbL; added separation rule.
  - Added verified City metadata, counts and dates for 14 portal datasets and Metro Vancouver, NRCan, BC and YVR records.

## critic-r1: Geospatial data engineer (cloud-native formats, Canadian datums, open-data licensing), independent reviewer of packet C03 round 1
- Gate pass: **False**
  - condition: Ingest VanMap cone attributes (viewpoint elevation, effective date) with datum and licence marked unconfirmed, and add guideline_version and a reconciliation check across the Guidelines, portal and VanMap
  - condition: Fix the horizontal CRS handling (null NAD83(CSRS) transform) and add the B1 vertex CI test
  - condition: Replace the curl gzip probe with real-browser range probes and record results per browser
  - condition: Add absolute ground_z and roof_z with z_ref to the LOD1 schema; use a grid-based vertical transform instead of the +0.15 m scalar
  - condition: Reclassify all Vista-derived geometry as ODbL with unknown studio rights and keep it out of the core OGL bundle
  - condition: Re-scope airspace: current YVR surfaces only within their legal extent, the 2026 proposal as a 'proposed' layer, airspace raised to v1
  - condition: Aggregate the parcel and tax join by land_coordinate and tax_coord to avoid double-counting
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Browser Range requests to GitHub Pages return gzip-stream bytes, so PMTiles/Parquet range reads on Pages are unsafe → Run the range probe in real browsers. Pages range reads are probably usable; keep whole-file GET as a per-browser fallback.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City data contain no cone height information; heights must come from guideline analysis → Ingest the VanMap viewpoint elevations and effective dates. Mark the datum and licence unconfirmed. Lower-boundary reference fields exist but are null, so ask the City for them.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Portal geometry is WGS84 (EPSG:4326) and should be transformed to EPSG:3157 for metric work → Treat portal lon/lat as NAD83(CSRS) and use a null transform to 3157.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The City has no canopy polygons or traffic volumes → List VanMap Permanent Vehicle Counts (AADT), 2018-2024 counts and Urban Forest Canopy Coverage as candidates with licence unconfirmed.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: NRCan HRDEM is in UTM and its Vancouver/North Shore coverage is unconfirmed → Use BC-Lower_Mainland_2016-1m (CGVD2013, EPSG:3979, public COG with CORS) and fill beyond it from MRDEM-30.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The YVR outer surface (~47 m) is an applicable height ceiling, and airspace is a roadmap item → Apply the current surfaces only within their legal extent. Model the 2026 proposal as a 'proposed' layer and raise it to v1.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: CGVD2013 minus CGVD28 is +0.15 m at Vancouver (single offset) → Use a grid pipeline (about +0.10 to +0.18 m), and note that HTMVBC00 is not applied.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Only Vista's OSM extension is ODbL; the supplied model is separate → Treat all Vista building geometry as ODbL with unknown studio rights.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Heritage properties without coordinates are omitted from the dataset → 2,359 of 2,495 records are mapped; 136 have null geom.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: .pmtiles behaviour on Pages is untested → Pages serves .pmtiles as application/octet-stream, gzip-encoded for gzip clients and raw for identity clients.
- Findings: {'BLOCKER': 1, 'MAJOR': 8, 'MINOR': 7}
- Verdict: Not ready. The store design is careful about licences and limits, but it misses the City's own cone elevations: VanMap publishes VIEWPOINT_ELEVATION_M for all 24 cones. It also treats NAD83 portal coordinates as WGS84, which puts footprints about 1.3 m off the LiDAR. The Pages gzip conclusion comes from a curl test that browsers do not reproduce. The LOD1 schema has no absolute heights. Vista's 'supplied' model is itself OSM-derived (ODbL). Airspace is under-scoped: a pending Transport Canada proposal covers much of Vancouver. Fix those six things, then reconcile the cone set across the Guidelines versions, portal and VanMap before any height warning cites a clause.

## critic-r1: Geospatial data engineer, cloud-native formats (independent reviewer, packet C03 round 1)
- Gate pass: **False**
  - condition: Replace the curl-gzip range probe with a browser fetch probe (Chromium, Firefox, WebKit) and correct the false-assumption flag
  - condition: Add z_ground_m, z_top_m, height_basis, vintage and datum to the LOD1 schema; add a footprint/LiDAR change-detection step
  - condition: Declare and test the horizontal datum of portal coordinates; use OGC:CRS84 or NAD83(CSRS) PROJJSON, not bare EPSG:4326
  - condition: Use content-addressed data paths so the 10-minute Pages cache cannot cause hash mismatches
  - condition: Downgrade the YVR layer to 'unconfirmed' until Plan BC 1280 and the proposed-limit maps are obtained; no compliance warnings from it
  - condition: Run the ODbL validator over inherited Vista terrain and water assets
  - condition: Obtain and hash the Public Views Guidelines PDF and verify clause numbers before any clause-citing warning ships
  - condition: Fix the parcel-tax aggregation (by land_coordinate, dissolve by tax_coord) before any land-value layer
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: On GitHub Pages a browser Range request returns gzip-stream bytes, so range reads of octet-stream/JSON are broken → Pages range reads work in Chromium. Probe Firefox and WebKit with fetch; whole-file GETs still benefit from gzip.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: NRCan HRDEM is in UTM NAD83(CSRS) and Vancouver coverage is not confirmed → HRDEM is EPSG:3979 COG in CGVD2013, covering downtown (VILLE_VANCOUVER 2013, BC Lower Mainland 2016) and the North Shore point (Sunshine Coast 2018 project). It is on public S3 with CORS * and range support.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: EPSG:6647 is the code for current CGVD2013 heights → Register both codes and record the geoid realisation (CGG2013 vs CGG2013a) per layer.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: SOR/80-902 parameters (45 m above a 2 m ARP, i.e. about 47 m; 1:50; 1:7) are enough to generate the YVR height ceiling over the study area → Obtain the official plans and the proposed-limit map. Treat the layer as unconfirmed and keep it out of compliance warnings.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 10 builds/hour soft limit constrains the deploy design → Remove it from the constraints. The relevant limits are the 1 GB site, the 10-minute deploy timeout and 100 GB/month bandwidth.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Rapid transit stations layer = 22 stations → Count deduplicated stations and add the planned stations separately.
- Findings: {'MAJOR': 9, 'MINOR': 9}
- Verdict: The research is strong: I reproduced the portal counts, licences, fields, LiDAR datum, Vista byte figures, release-asset lack of CORS and GitHub limits. But one core decision rests on a wrong premise: browsers send identity encoding with Range requests, so Pages range reads worked in Chromium. LOD1 storage holds only relative heights, built on 2015 footprints, so it cannot support absolute-height cone or viewpoint work. The horizontal datum and cache consistency are also unaddressed. The YVR generator misses the plan-defined extent and the 2026 proposed Vancouver limits. Vista's terrain carries OSM lineage. Clause citations still cannot be checked because the Guidelines PDF returns 403. All of this is fixable, but the packet should not pass yet.

## revise-r1: draft saved as `revise-r1_C03.json`
  - r1: Replaced the curl-gzip range probe with a browser fetch probe; Chromium 152 on the team's Pages site returned 206, raw size, no encoding. Firefox and WebKit remain untested; probe moves to Playwright.
  - r1: Added HEAD finding: browser HEAD returns gzip Content-Length (2,383,874 vs 9,722,568 raw) and hyparquet sizes files from HEAD; manifest bytes now passed as byteLength; suffix-range check added.
  - r1: Corrected the range flag and the Pages range validation case; tested .fgb on a GitHub Pages site (206, raw magic bytes); .parquet and .pmtiles still untested.
  - r1: LOD1 schema now stores absolute z_ground_m, z_roof_max_m, z_roof_p50_m, height_basis, vintage and flags (3DBAG pattern); height_m is derived for display only.
  - r1: Added footprint-versus-LiDAR change detection and gap proxies: 12,013 New Building permits 2017-2026 (4,635 since 1 Sep 2022) and 7,162 demolitions; LiDAR 2013 and 2018 added; vintage shown.
  - r1: Tested portal horizontal CRS: LiDAR tile corners project to round kilometres and a parcel vertex matches the City UTM corner within 0.113 m, so 'WGS84' lon/lat are NAD83(CSRS) values; crs rules updated.
  - r1: Content-addressed file paths (layers/<id>/<sha256[:12]>.<ext>) with the previous version kept one cycle; validator checks path-hash agreement; cache logic updated.
  - r1: YVR layer downgraded to unconfirmed: extent only on Plan BC 1280, Part II follows the North Arm boundary, 2026 proposed limits unmapped; heliport and water-aerodrome surfaces unresolved; no compliance warnings.
  - r1: ODbL audit of Vista: OSM coastline and water clip terrain; shoreline, water and extension buildings are OSM; the supplied model is noted as built from 2022 OSM data; validator checks all inherited assets.
  - r1: Read council reports RTS 16338, 18292, 18459, 19750, 16506 in-page: cone lower boundaries use reference roofs and, for 27.1, 27.2, 28, geodetic heights; source clause numbering is inconsistent; hashes recorded.
  - r1: Guidelines PDF still 403 to curl and WebFetch; browser navigation raised a save dialog and was not retried. Clause-citing warnings stay blocked until the adopted PDF is hashed and checked.
  - r1: Measured exact parcel-tax join: 93,406 tax coordinates, 93,763 parcel coordinates, 99.12% of polygons joined, 3,030 coordinates shared by several polygons; API count-distinct figures (94,111) are approximate; aggregation added.

## critic-r2: Open-data licensing specialist (with geodetic/datum review), round 2 critique of packet C03
- Gate pass: **False**
  - condition: Add code LICENSE and a data licence map (REUSE/SPDX) to the repos before any public VCM deploy
  - condition: Remove inherited Vista OSM-derived and supplied-model assets from the VCM base, or clear them in writing (supplier rights plus ODbL flag and credit)
  - condition: Ship the non-endorsement and unofficial-estimate disclaimer on every warning, height surface and export, checked by CI
  - condition: Add legal status to cone and solar parameter records; only in-force values from a hashed adopted PDF may drive warnings
  - condition: Hash the adopted Public Views and both Solar Access guideline PDFs before any clause-citing warning
  - condition: Correct the TransLink, ParcelMap BC (EPSG:3005) and LidarBC licence/CRS records; add licence version, URL and accessed date to the manifest
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: TransLink data requires permission and cannot be redistributed (redistribution: permission) → GTFS static data may be redistributed with the legend, but it is non-open, revocable and carries an indemnity. Keep it outside the open bundle as a separately licensed optional layer.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: ParcelMap BC Parcel Polygons (open) are NAD83(CSRS) → Register the dataset as EPSG:3005 (NAD83 original) and apply a declared transformation to NAD83(CSRS) before comparing it with City data.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: LidarBC is licensed OGL-BC (no qualification) → Record the licence as conflicting until GeoBC confirms it per tile.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Vista's central context is credited correctly, with OSM credit needed only for buildings outside the supplied model → Credit the central model and the derived terrain as ODbL, and clear the supplier's rights before reuse.
- Findings: {'MAJOR': 5, 'MINOR': 9}
- Verdict: Round 2 fixes most of the technical issues: range probing, absolute LOD1 elevations, CRS testing, content-addressed paths, the YVR downgrade and the parcel–tax join. The licensing side is not ready for designers to rely on. None of the four repos has a licence file. The supplied studio model is OSM-derived, its rights are undocumented, and its export is already public. Clause-citing warnings would conflict with OGL-Vancouver's non-endorsement term. Cone parameters have no legal status, so proposed or referred-back heights could be shown as in force. The adopted Public Views and Solar Access PDFs are still unhashed. TransLink, ParcelMap BC (EPSG:3005) and LidarBC ('Access Only') are mislabelled. Gate: fail until those conditions are met. The web-search budget ran out mid-round, and the OSMF guideline page was down (503).

## revise-r2: draft saved as `revise-r2_C03.json`
  - r1: Replaced the curl-gzip range probe with a browser fetch probe; Chromium 152 on the team's Pages site returned 206, raw size, no encoding. Firefox and WebKit remain untested; probe moves to Playwright.
  - r1: Added HEAD finding: browser HEAD returns gzip Content-Length (2,383,874 vs 9,722,568 raw) and hyparquet sizes files from HEAD; manifest bytes now passed as byteLength; suffix-range check added.
  - r1: Corrected the range flag and the Pages range validation case; tested .fgb on a GitHub Pages site (206, raw magic bytes); .parquet and .pmtiles still untested.
  - r1: LOD1 schema now stores absolute z_ground_m, z_roof_max_m, z_roof_p50_m, height_basis, vintage and flags (3DBAG pattern); height_m is derived for display only.
  - r1: Added footprint-versus-LiDAR change detection and gap proxies: 12,013 New Building permits 2017-2026 (4,635 since 1 Sep 2022) and 7,162 demolitions; LiDAR 2013 and 2018 added; vintage shown.
  - r1: Tested portal horizontal CRS: LiDAR tile corners project to round kilometres and a parcel vertex matches the City UTM corner within 0.113 m, so 'WGS84' lon/lat are NAD83(CSRS) values; crs rules updated.
  - r1: Content-addressed file paths (layers/<id>/<sha256[:12]>.<ext>) with the previous version kept one cycle; validator checks path-hash agreement; cache logic updated.
  - r1: YVR layer downgraded to unconfirmed: extent only on Plan BC 1280, Part II follows the North Arm boundary, 2026 proposed limits unmapped; heliport and water-aerodrome surfaces unresolved; no compliance warnings.
  - r1: ODbL audit of Vista: OSM coastline and water clip terrain; shoreline, water and extension buildings are OSM; the supplied model is noted as built from 2022 OSM data; validator checks all inherited assets.
  - r1: Read council reports RTS 16338, 18292, 18459, 19750, 16506 in-page: cone lower boundaries use reference roofs and, for 27.1, 27.2, 28, geodetic heights; source clause numbering is inconsistent; hashes recorded.
  - r1: Guidelines PDF still 403 to curl and WebFetch; browser navigation raised a save dialog and was not retried. Clause-citing warnings stay blocked until the adopted PDF is hashed and checked.
  - r1: Measured exact parcel-tax join: 93,406 tax coordinates, 93,763 parcel coordinates, 99.12% of polygons joined, 3,030 coordinates shared by several polygons; API count-distinct figures (94,111) are approximate; aggregation added.

## critic-r3: Gatekeeper: open-geodata licensing, vertical datums and static web hosting (re-opened sources 21 Oct 2026)
- Gate pass: **True**
  - condition: Re-transcribe RTS 18292 27.2: 54.3 m current at NE corner of 1975 E 12th Ave; the coordinate X 495,340.12 Y 5,456,431.39 belongs to the proposed 2670 Victoria Dr reference
  - condition: Remove the 2 m cl. 3.1.5 tolerance framing; cone tests use 0 m tolerance for massing plus a declared uncertainty band and a three-state result
  - condition: Extend cov-public-views-params with origin xyz, eye height, lateral refs, sub-section and lower_plane_model (default unknown) before any height-limit surface ships
  - condition: Define a durable copy of built layers that CI restores from before the first Pages deploy of VCM data
  - condition: Commit LICENSE and REUSE.toml to the repos and fix the Vista central-model OSM credit before VCM is public
  - condition: Add tree height_mode and an outlier rule before any shade study uses tree heights
  - condition: Keep every cone height unconfirmed and every warning labelled an unofficial estimate (as specified)
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: RTS 18292 App A gives 27.2 Current 54.3 m with UTM X 495,340.12 Y 5,456,431.39 → Current 54.3 m: NE corner of 1975 E 12th Ave, no coordinates published. Proposed 68.9 m: NE corner of 2670 Victoria Dr, X 495,340.12 Y 5,456,431.39.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Cl. 3.1.5 sets a 2 m encroachment tolerance against which datum error is 'far below' → Tolerance for massing is 0 m. Datum and LiDAR errors (0.08-0.18 m, +0.15 m offset) must be carried as an uncertainty band on every cone test.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: ParcelMap BC's published median deviation (0.056 m) shows the NAD83 vs NAD83(CSRS) offset is small, so 0.5-1 m should not be assumed → Treat the offset as unknown and measure it at matched parcel corners before any cross-check.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: City tree heights are 10 ft class values with ±1.5 m uncertainty (all records) → Record height_mode per tree, flag heights above about 40 m, and apply ±1.5 m only to ft-class values.
- Findings: {'MAJOR': 4, 'MINOR': 9}
- Verdict: Pass with conditions. I re-opened the sources and they hold up: all four adopted PDF hashes, the GitHub Pages, LFS and release limits, REUSE 3.3, GeoParquet, PMTiles, OGL-Vancouver, TransLink, SOR/80-902 and the Pages range behaviour all match the spec. Of the previous round's issues, nine are fully fixed and four partly; the gaps are the still-missing LICENSE files and the unchanged Vista credit. Four new MAJOR errors: the 27.2 coordinate belongs to the proposed reference (2670 Victoria Dr), not the current one, 77 m off; clause 3.1.5's 2 m is misused as an error tolerance when massing allows 0 m; the cone record lacks origin and plane geometry; and no durable copy of built layers is defined. The store, formats and hosting can be built now; the cone-height work must wait for these fixes.

## revise-r3: draft saved as `revise-r3_C03.json`
  - r1: Replaced the curl-gzip range probe with a browser fetch probe; Chromium 152 on the team's Pages site returned 206, raw size, no encoding. Firefox and WebKit remain untested; probe moves to Playwright.
  - r1: Added HEAD finding: browser HEAD returns gzip Content-Length (2,383,874 vs 9,722,568 raw) and hyparquet sizes files from HEAD; manifest bytes now passed as byteLength; suffix-range check added.
  - r1: Corrected the range flag and the Pages range validation case; tested .fgb on a GitHub Pages site (206, raw magic bytes); .parquet and .pmtiles still untested.
  - r1: LOD1 schema now stores absolute z_ground_m, z_roof_max_m, z_roof_p50_m, height_basis, vintage and flags (3DBAG pattern); height_m is derived for display only.
  - r1: Added footprint-versus-LiDAR change detection and gap proxies: 12,013 New Building permits 2017-2026 (4,635 since 1 Sep 2022) and 7,162 demolitions; LiDAR 2013 and 2018 added; vintage shown.
  - r1: Tested portal horizontal CRS: LiDAR tile corners project to round kilometres and a parcel vertex matches the City UTM corner within 0.113 m, so 'WGS84' lon/lat are NAD83(CSRS) values; crs rules updated.
  - r1: Content-addressed file paths (layers/<id>/<sha256[:12]>.<ext>) with the previous version kept one cycle; validator checks path-hash agreement; cache logic updated.
  - r1: YVR layer downgraded to unconfirmed: extent only on Plan BC 1280, Part II follows the North Arm boundary, 2026 proposed limits unmapped; heliport and water-aerodrome surfaces unresolved; no compliance warnings.
  - r1: ODbL audit of Vista: OSM coastline and water clip terrain; shoreline, water and extension buildings are OSM; the supplied model is noted as built from 2022 OSM data; validator checks all inherited assets.
  - r1: Read council reports RTS 16338, 18292, 18459, 19750, 16506 in-page: cone lower boundaries use reference roofs and, for 27.1, 27.2, 28, geodetic heights; source clause numbering is inconsistent; hashes recorded.
  - r1: Guidelines PDF still 403 to curl and WebFetch; browser navigation raised a save dialog and was not retried. Clause-citing warnings stay blocked until the adopted PDF is hashed and checked.
  - r1: Measured exact parcel-tax join: 93,406 tax coordinates, 93,763 parcel coordinates, 99.12% of polygons joined, 3,030 coordinates shared by several polygons; API count-distinct figures (94,111) are approximate; aggregation added.
