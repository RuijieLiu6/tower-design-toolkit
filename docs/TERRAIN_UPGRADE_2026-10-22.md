# Vancouver terrain update — 22 October 2026

The terrain-model task is in **`04 Tool Plan/CONTEXT_MODEL_SPEC.md`, sections 1, 4 and 5**. The working implementation is **Tower Studio → Real Vancouver**, primarily `tower-studio/src/components/CityContext.tsx`, the terrain scripts in `tower-studio/tools/`, and `tower-studio/public/data/layers.json`.

## What changed

| Part | Before | Updated model |
|---|---|---|
| Ground in the available West End / Coal Harbour tile | 30 m MRDEM | 1 m ground grid derived from City LiDAR 2022 |
| Mountain backdrop | MRDEM resampled and smoothed to 60 m | Native 30 m MRDEM samples, with adaptive mesh rendering |
| Missing fine terrain | Regional terrain only | Explicit fallback to regional data; no claim of complete LiDAR coverage |
| Source information | General MRDEM labels | Actual source(s) under the selected footprint, plus coverage and loading status |
| Initial context download | 2.03 MB | 2.03 MB, followed automatically by 7.57 MB of detailed terrain |

Ground tiles are sampled consistently by the ground card, street cameras, skyline calculation, draped context layers and solar receiver elevations. The displayed 1 m patch has a 30 m perimeter transition to join the coarse mesh. **Analysis samples the unblended grid**, falling back only where data are absent. No vertical exaggeration was introduced. Ground elevation is still applied to a design tower only through the existing user controls.

## Why these sources

**Downtown ground:** the [City of Vancouver LiDAR 2022 dataset](https://opendata.vancouver.ca/explore/dataset/lidar-2022/) supplies classified returns from September 7 and 9, 2022. The City publishes approximately 49 points/m² and vertical accuracy of 0.081 m at 95% confidence. Its LAS coordinates are UTM zone 10 with the City’s NAD83(CSRS) realization; heights use CGVD28GVRD / HTMVBC00. That published accuracy describes the survey, not this derived 1 m grid. The actual LAS header labels the horizontal frame EPSG:26910; coordinates were retained to match the existing model, and the metadata discrepancy is recorded.

The City also publishes [Terrain_DEM_2022, approximately 0.5 m](https://www.arcgis.com/home/item.html?id=184d536aa9f4477eae2f424704c57d02). The exposed service is a cached MIXED image map, not a numeric elevation raster. Image colors were not treated as heights.

**Mountains:** the [NRCan MRDEM-30 dataset](https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da) already downloaded for the project provides continuous regional coverage. The new layer preserves its native 30 m detail and retains the existing grid-based CGVD2013 → CGVD28 conversion. This improves detail relative to the old display without implying higher source-survey accuracy.

For potentially better mountain data, I inspected [LidarBC](https://lidar.gov.bc.ca/) and [NRCan’s HRDEM service](https://datacube.services.geo.ca/en/viewer/elevation/index.html). At a test location near Grouse Mountain (-123.08, 49.38), both the federal DTM sample and the provincial 2016 1 m tile returned no-data. Newer provincial tiles exist elsewhere in the queried North Shore region, but their index did not cover this test point. A tile boundary on a catalogue map is therefore not proof of valid elevation coverage. MRDEM remains the regional fallback; complete high-resolution mountain coverage is still a future data-acquisition task.

**Older City layers:** [2 m contours](https://opendata.vancouver.ca/explore/dataset/elevation-contour-lines-2-metre-contours/) derive from 1999 imagery and are explicitly approximate. [Shoreline 2002](https://opendata.vancouver.ca/explore/dataset/shoreline-2002/) is also approximate and not updated. Neither was used to supersede newer elevation measurements. The existing [2015 footprints](https://opendata.vancouver.ca/explore/dataset/building-footprints-2015/) remain historical outlines; they cannot represent all later construction.

## What is actually covered

Only one City LiDAR archive is currently available locally: **490000_5459000.zip**, approximately one square kilometre. It is not the entire downtown peninsula, and it does not include the default study tower at 491636 E, 5458756 N.

The new grid contains:

- 621,358 cells with measured class-2 ground returns.
- 205,016 cells interpolated within a 3 m search distance.
- 173,626 no-data cells, retained as missing (17.36%).

Large gaps under buildings and over water are not filled with invented measurements. The original ZIP remains intact. The existing 427 buildings with processed roof heights are unchanged; 6,294 footprints still have unknown heights. Roof heights, roof shapes and the full skyline require additional City LiDAR tiles and review of the old footprint outlines.

A same-source point-to-grid comparison on 56,839 ground samples gave median absolute residuals of 0.392 m for the old terrain and 0.007 m for the new grid; 95th-percentile residuals were 1.503 m and 0.045 m. **These are in-sample consistency checks, not independent survey validation or an accuracy certification.**

The displayed sea remains a 0 m reference plane. It is not a measured present-day shoreline, tidal model or bathymetric surface. Differences between the City’s local vertical-datum realization and the regional transformation remain unmeasured.

## Next City downloads

The official tile index has 23 tiles intersecting the existing downtown footprint-download bounding box. Start with these three to extend central-downtown coverage:

1. [491000_5458000.zip — includes the default study-tower location](https://webtransfer.vancouver.ca/opendata/2022LiDAR/491000_5458000.zip)
2. [491000_5459000.zip — central downtown / waterfront](https://webtransfer.vancouver.ca/opendata/2022LiDAR/491000_5459000.zip)
3. [490000_5458000.zip — extend south of the current tile](https://webtransfer.vancouver.ca/opendata/2022LiDAR/490000_5458000.zip)

The direct scripted download probe returned HTTP 403. Use the City’s portal in a browser for those downloads. The complete tile list and verified metadata are saved in `context-data/raw/terrain-source-audit-2026-10-22/`. Do not treat the three priority tiles as complete downtown coverage.

The ground builder accepts a tile archive and adds its own manifest entry. The current rendered patch was validated with the single available tile; adjacent-tile seam behavior should be reviewed when expanding coverage. The existing roof-height builder is a separate step and must be run with all intended archives to preserve complete results.

## Files and verification

- `tower-studio/tools/build_city_ground.py`: reproducible 1 m ground pipeline, streaming the archive without extraction or deletion.
- `tower-studio/tools/build_city_terrain.py --mountain-detail`: native 30 m regional detail.
- `tower-studio/src/lib/terrainDetails.ts`: deferred loading, source selection and display joins.
- `tower-studio/public/data/terrain_ground_490000_5459000.bin`: ground grid.
- `tower-studio/public/data/terrain_r2_detail.bin`: mountain grid.
- `context-data/work/terrain-upgrade-2026-10-22/`: source-derived GeoTIFF, quality mask, numerical checks and browser captures.
- `context-data/work/terrain-upgrade-2026-10-22/backup/`: original copies of the modified files.

Targeted regression checks: **41 passed**, covering provenance, checksums, first-load budget, ground coverage, missing-value fallback, display joins, mountain extent, views and solar calculations. TypeScript and the production build passed. The build retains its existing large-bundle and Rhino module compatibility warnings.

Browser verification passed with **no page errors**. It confirmed the 30 m mountain detail, the City LiDAR source label in covered terrain, and a functioning 60 m fallback with a visible message when the detailed mountain file was deliberately blocked. Captures and `browser-check.json` are in the work folder listed above. The changed UI files also passed the Impeccable detector with no findings.
