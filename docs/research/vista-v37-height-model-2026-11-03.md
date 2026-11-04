# Vista v37 height model in Tower Design Toolkit (3 Nov 2026)

Source: Ruijie Liu's Vista, github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e (README "release v37", 3 Nov 16:41), read only with `gh api`. Session: Integrate Vista (local_dd7a83d6). Ruijie's choice (3 Nov): heights **combined by source**.

## What was ported, and where

| Vista file | Toolkit | Notes |
|---|---|---|
| `generated/height_policy.json` | `public/data/vista/height_policy.json` | Copied unchanged. SHA-256 `85f7ddf7…d7fa` equals Vista's `release-manifest.json`; checked again in the browser before use. 1,621 zones, 964 rules, 28 with a basic height. City zoning districts + property parcels, OGL-Vancouver, retrieved 2026-10-27. |
| `explorer/height-policy.js` (`zoning`, `atPoint`) | `engine/heightPolicy.ts` | Faithful port for points and segments (touching counts; exact slab sweep with Vista's 3,000,000 work budget). Polygons use Vista's **parcel** rule from `metadata.intersectionTolerance` instead: a district counts above max(0.25 m², 0.01% of the lot), and so does an uncovered remainder (see finding 2). |
| `explorer/viewcone-ui.js` `planeInput` (city mode) + `imagine-city.js` defaults | `engine/heightModel.ts` `studySurface` | Imagine default: plane from the modelled eye (terrain at the cone origin + 1.6 m) to 120 m at the downtown reference, Vista's model (0, 0) = 49.2827 N, 123.1207 W; distant-edge fallback within 1 m; flat 120 m when the ground is unknown. Rebuilt on the Real Vancouver terrain (MRDEM-30, CGVD28); 120 m read as CGVD28. Used only for the 16 cones without CONE_PARAMS. |
| `explorer/imagine-city-engine.js` clearance | `STUDY.clearanceM = 0.1` | Applied to every cone surface in the suggestion. |
| `explorer/view-height-suggestion.js` `buildRecommendation` | `engine/heightModel.ts` `stackSuggestion`; tool `components/heights/HeightTool.tsx` | Uniform scale of every block so each block top clears the lowest surface over its own footprint (exact: plane minimum at clipped vertices); 1 m minimum block; imported models are never scaled. Adjust / Dismiss / Undo; Adjust is one undo step (`breakStep` around a single `updateTower`). Also bounded by the zoning number when there is one. |
| `explorer/imagine-city-engine.js` `calculate`, `imagine-city.js` | `engine/imagine.ts`, `components/heights/{ImagineSection,ImagineLayer}.tsx`, `lib/imagineStore.ts` | Existing / Height references / With view cones on the swapped Vista buildings (join by OSM way number). Zoning and assemblies from Vista's `imagine_city.json` (SHA-256 b4216604…53a6 = release manifest), slimmed by `tools/build_vista_imagine.py` to `public/data/vista/imagine_zoning.json` (1.36 MB; Vista's corridor cells dropped, the cones are recomputed on our surfaces). Connected parts scale about their common base; 0.1 m clearance; the 213.36 m fallback is off. Caps on the model, click for the calculation (existing-height source said), CSV of all three scenarios. Prepared in chunks (about 6 s for 62,372 parts). |

Not ported: Vista's 213.36 m "missing height" scenario fallback (Ruijie: never a guessed height); `building_view_heights.json` (the older level-plane study at the raw observer elevation with a 20 m illustrative ground; Imagine's sloping default replaced it); Vista's own rescaling of the building meshes (the app draws caps at the scenario roof instead, so the City buildings layer stays the model session's).

## Frames
Vista's model frame (equirectangular about 49.2827 N, 123.1207 W, equatorial degree lengths) is converted vertex by vertex through latitude/longitude to EPSG:26910 (`vistaToCity`, the C04 rule), then to the local frame. Check against the City's own `zoning.json` (same dataset, same day, simplified 0.5 m, decimetres): 8,413 Vista vertices in the downtown box, median 3.4 cm, max 0.52 m from the same district's edges (the max is the 0.5 m simplification).

## Findings
1. **Most downtown towers get no zoning number.** Shangri-La (1128 W Georgia, CD-1 (426)), Vancouver House (1480 Howe, CD-1 (580)) and The Butterfly (969 Burrard, CD-1 (445)) are all CD-1; most of the rest of downtown is DD. The suggestion there is partial (cones only), said in words and drawn pale on the map.
2. **Vista's exact rule misreads lots.** With "touching counts", a lot that only shares a lot line with the next district takes that district's number (1650 Burrard St, M-2, read R1-1 11.5 m from a 0.24 m² sliver). Vista's own parcel precomputation uses an area tolerance; the port uses it for every polygon. 1650 Burrard St is genuinely split (8,488 m² M-2, 7,674 m² C-2A) and now reads 23 m (C-2A, the lower).
3. **Vista's eye stands on the terrain.** At Queen Elizabeth Park the 30 m terrain gives 118.2 m, so the modelled eye is 4.8 m under the City's Lv (124.6 m); at the Cambie Bridge (E) the eye is 12.7 m under the deck (decks and piers are not modelled). Said on each study surface.
4. QE Park on real terrain: at the case 5 site (inside 3.2.3) the City-sourced 3.2.3 estimate controls, 93.8 m above ground; at the case 3 site (3.2.2 only) the 3.2.2 study surface controls, 93.6 m (team assumption).
5. **Vista's study surfaces can run downhill.** One fixed downtown reference for every cone means a view looking away from downtown gets a plane that falls from the eye: K (Drake Street) drops from 4.4 m to −102 m across its wedge; under With view cones 110 buildings go to zero height (K 34, 21 61, G2 13). Said wherever such a surface controls.
6. Imagine counts (browser, detailed ground): 61,402 buildings on the model (Vista's table lists 61,407; 5 under 1 m² have no footprint); With view cones 44,853 changes (1,573 lower, 43,280 higher, most of them small houses rising to their basic zoning height); 19,022 under a cone; cut by a City-sourced estimate 293, by a study surface 550; 17,000 keep their height (no zoning number).

## Evidence flags
Zoning numbers ⬜ unverified (Vista's transcriptions; the City by-law site refuses scripted downloads (403), not routed around). No number 🟥 unresolved. Study surfaces 🟧 team assumption, "not a City ceiling". City-sourced estimates keep their CONE_PARAMS flag and ±U95.

## Tests
`engine/heightPolicy.test.ts` (7), `engine/heightModel.test.ts` (7), `engine/imagine.test.ts` (5), eval HGT-I (Imagine on all parts), HGT-T (known parcels), HGT-DD (DD, no number), HGT-QE (controlling source at QE Park cone points), HGT-F (frame), HGT-S (stacked rule), Playwright `e2e/heights.e2e.ts` (screenshots in `tower-studio/test-results/heights/`).
