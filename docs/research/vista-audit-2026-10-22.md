# Vista audit and integration into Tower Studio (Real Vancouver)

22 Oct 2026 · vista-integration session · single pass, not peer-reviewed: anything not checked against a file or a test is marked **unverified**.

Flags: ✅ verified (opened file or passing test) · 🟧 team assumption · ⬜ unverified · 🟨 unresolved · <span style="color:#b8137a">**✖ FALSE ASSUMPTION**</span> (kept visible, with its correction).

## 1. What was received and how it was handled

- `map/Vista-Portable-Handoff-2026-10-22.zip` (97.3 MB, 259 files, 347 MB unpacked) was unpacked into a new folder, `context-data/vista-handoff-2026-10-22/Vista/`. It is outside `tower-studio/` and is never served or published.
- It was treated as untrusted data. Vista was **read, not run**: no server, no self-tests and no Python from the package were executed. The only Python that touched it is our own `tower-studio/tools/build_vista_compare.py`, run with `python -I` and file paths as arguments. ✅
- Vista is v10.1 (local, unpublished). It adds sloping-plane ceiling studies (v10) and confirm-before-placing (v10.1) to the public v09.16. Its source is `webapp/static/explorer/` (vanilla JS and a custom WebGL2 renderer; about 227 KB `explorer.js`). There is also a Python `src/view_context/` package and a static bundle `publication/site/`. ✅ (`docs/VISTA_INTEGRATION_HANDOFF.md`)

## 2. What Vista does, and what happened to each part

| Vista capability | Vista's version | In Tower Studio now | Why |
|---|---|---|---|
| Plan overlap with the 24 view cones | Polygon clip in its own frame; states overlap / touch / none | **Ported** as the exact clip (`engine/vista.ts` `exactCones`), on the City EPSG:26910 polygons, beside the View-cone check's sampled result | The View-cone check samples 2 m along edges and 5 m inside. The clip is exact and also finds slivers the samples miss. One cone system: same `CONES`, same `CONE_PARAMS`. ✅ tests |
| Sloping-plane ceiling studies (v10) | User planes (origin, elevation, bearing, slope) evaluated exactly over clipped footprints; partial / unknown when planes are missing | **Ported** as *What-if study planes* (`whatIfCeiling`, panel section, 3D patch + limiting-point marker in `VistaRig`) | The planes run through the City origin, and heights are CGVD28, so Vista's datum offset is 0. Every card says "your what-if, never a City limit" 🟧. The planes never feed the View-cone check. All 16 Vista ceiling tests are ported 1:1 ✅ |
| Flat "study ceiling" | A user height above the base, compared with the proposal box | **Covered** by a what-if plane with slope 0 | Kept as one concept, not two |
| View from a protected-view origin | Eye 1.6 m above SRTM ground at the polygon apex; heading on the cone axis; cone-fit field (report.js) | **Ported** into View from here: new viewpoint kind `cone`. The eye is the City's Lv (fixed). Vista's hfov and pitch rules are kept. Far plane 60 km and no fog while looking | Same camera rig (`ViewFromRig`), not a second one. The mountains are the real MRDEM-30 terrain ✅ (see §5) |
| Rooftop views, nearby-roof suggestions, "face the proposal" (v08) | Roofs of the studio model (heights from OSM floor counts, re-grounded on SRTM) | **Ported** as *Rooftop views of the tower*: nearest City LiDAR 2022 roofs in each direction, how much of the tower each sees over nearer roofs and terrain, and *Stand here* facing the tower | Vista's roof heights are no reference: C04 found re-grounding shifts of −12.2 to +21.6 m. Only one LiDAR tile is processed, so there are few roofs, and the result is optimistic ⬜ |
| Corner location map while observing | North-up plan inset with observer, wedge and proposal | **Ported** as `VistaInset` (DOM + SVG, shown while looking): cones, view wedge, towers, scale bar | No drei `<Html>` (React 19 rule) |
| PDF report | Dependency-free writer; cover sentence, key plan, viewpoint pages, sections | **Ported**: `lib/pdf/miniPdf.ts` (writer, typed) and `lib/vistaReport.ts`. It has a cover, a key plan, one page per view and a sources page. Each view page has the render from the City origin, a section along the cone axis, both Tower Studio and Vista numbers, and evidence chips (glyph + word; false assumptions in magenta) | Renders come from the real scene (`requestCaptures` → `VistaRig`, sprites and map sheets hidden) ✅ checked in the browser |
| Study sentence (v09) | One sentence on the PDF cover and in Output | **Ported** (`studySentence`), on the exact overlap | |
| Study files and URL state (`vancouver-site-study/1`) | Hash keys site, parts, rot, obs, cp… | **Ported reader** (`parseVistaHash`, `parseVistaStudy`): a study adds a tower, Vista's planes (moved to the City origin) and the observer | Only the site, blocks, observer and planes are read. Building ids, removals and imported models are ignored ✅ tests |
| Three real-tower examples (Shangri-La, Vancouver House, Butterfly) | One block of the published height each | **Ported** as *Add* buttons | Converted corner by corner. Tower Studio keeps the typed size, because Vista's frame made the 29 × 43 m block cover 1,255.6 m² of real ground |
| Address search (BC Address Geocoder, City addresses) | Network service | **Dropped for now** | It sends queries to outside services. Tower Studio places towers by clicking the terrain. Could come back as a node with a privacy note |
| 2022 aerial imagery (ArcGIS tiles) | Network service | **Dropped** | Same reason; LiDAR roofs replace the photo context |
| Site boundary drawing, replacing existing buildings | Studio-model footprints | **Dropped** | Tower Studio has tower placement and imported massing. Removing City buildings under a design is a backlog item for the context layer |
| Context model (studio model + OSM, SRTM 60 m terrain, SRTM 300 m backdrop) | 38.7 MB of custom `.bin` packs | **Replaced** by Tower Studio's City footprints, LiDAR 2022 roofs and NRCan MRDEM-30 to 25 km (CGVD28) | Studio-model data can't be redistributed (§6). The user asked for the real mountains |
| Custom WebGL2 renderer, Day/Night styles, opening animation | | **Not ported** | Tower Studio has three.js / R3F and its own stage looks |
| Synthetic checker, Python server, iteration tool | | **Not ported** | Development scaffolding; Tower Studio has vitest and eval |

## 3. Data, formats, frame and datum

- **View cones:** City open data `view-cones` (OGL-Vancouver, accessed 23 Sep 2026, 24 records, plan polygons only). They are identical to Tower Studio's City ViewCone service polygons (C04: 24 of 24). The test "all Vista apexes match the City origins" converts seven of them within 0.05 m ✅.
- **Origins:** Vista used the polygon apex as the origin and 1.6 m above its ground as the eye. Tower Studio uses the City service apex and Lv (C04 r3) ✅.
- **Terrain:** SRTM 1″ via Open Topo Data, EGM96 heights, a 60 m grid (`extension_terrain/srtm_grid.json`) and a 300 m backdrop. Vista's own provenance says the "vertical datum is unknown, approximate" ✅.
- **Buildings:** the supplied studio model `sources/Vancouver DT context.3dm` (53.4 MB; owner unrecorded), plus OSM extension tiles (ODbL), plus OSM coastline and water ✅.
- **Formats:** `.bin` packs with JSON indexes; study JSON `vancouver-site-study/1` with `resume_hash`; a generated `.3dm` (116 MB) ✅.
- **Frame:** <span style="color:#b8137a">**✖ FALSE ASSUMPTION**</span>: "the model frame measures metres". Vista's `geo.py` is equirectangular about 49.2827 N, −123.1207, using the equator's degree lengths (110,574 m; 111,320 m × cos φ). At 49.28 N the GRS80 degree is 111,215 m (latitude) and 72,756.8 m (longitude). So Vista reads north–south **0.58% short** and east–west **0.19% short**. That is 25.9 m over QE Park to 1060 Barclay (C04), and 23.5 m from the QE apex to the default study tower ✅ (test `VISTA-F`).
  - **Correction:** every Vista coordinate goes Vista XY → lat/lon (Vista's own exact inverse) → EPSG:26910 (Krüger, no datum shift; the inverse is new in `engine/vista.ts`, round-trip < 1 mm). Nothing is computed in the legacy frame.
  - **Research correction:** C04 printed the east–west error as 0.198% (72,761 m). GRS80 gives 72,756.8 m, so it is 0.192%. C04 also put Shangri-La at "1,256 m²". That is true metres; the UTM grid (k = 0.9996) reads 1,255.6 m² ✅.
  - **Knock-on effects:** Vista's cone spreads were measured in the skewed frame: 3.2.3 is 11.81° in Vista and 11.76° in the grid, and 27.2 is 53.0° vs 52.8°. So Vista's hfov differs by 0.05–0.26°. Both are shown ✅.
- **Vertical:** Vista's z is model-relative (studio model re-grounded on SRTM/EGM96); its datum is "unverified" in its own files. Tower Studio is CGVD28 throughout, so no Vista height is reused.

## 4. Dependencies and licences

| Item | Licence | Status |
|---|---|---|
| Vista code (Ruijie Liu, with AI assistance) | **No LICENSE file** in the package (C04 also found none in the four repos) | 🟧 Ruijie asked for it to be incorporated. The ported kernels now sit in Tower Studio under its MIT licence. Ruijie should confirm (*Needed*). |
| rhino3dm 8.35 (vendored in Vista) | MIT | Not copied; Tower Studio already has rhino3dm 8.35.0 from npm |
| City view cones, LiDAR 2022, streets | OGL-Vancouver | ✅ already in Tower Studio |
| SRTM (NASA SRTMGL1) | Public domain | Only 24 sampled values in `src/data/vistaOrigins.json` (with source and SHA-256 of the grid) |
| OSM buildings, coastline, water | ODbL (share-alike) | **Not copied** |
| Studio model `Vancouver DT context.3dm` and everything derived from it (Vista `.bin` packs, `unified_*`, the generated `.3dm`, the PVV basemap) | Owner unrecorded | **Not copied**; see §6 |
| Public Views Guidelines PDF (`sources/guidelines-public-views.pdf`) | City document | Not copied. Its SHA-256 is **597f0da21f0bc7c791aa146c45640b90a3c63f8bf8b45162252d084d0ef5b0ca**, the same as C01's Feb 2026 copy. This closes C04's request to "recover the team copy, hash it, compare with 597f0da2" ✅ |
| pypdfium2 4.30.0 (test helper only, not an app dependency) | Apache-2.0 / BSD-3 | Installed into `context-data/venv` to look at the PDF pages; logged in `overnight/DOWNLOADS.md` |

## 5. Where Vista and Tower Studio disagree (both shown, with reasons)

| Number | Tower Studio | Vista | Why | Flag |
|---|---|---|---|---|
| Eye at each protected origin | City Lv (e.g. 3.2.x: 124.60 m) | SRTM ground + 1.6 m, reconstructed (3.2.x: 122.7 m) | SRTM is 60 m, EGM96 and smooths terrain; Lv is the City's eye elevation. Spread is −11.8 m (E, Cambie Bridge deck) to +6.7 m (9.1/9.2), with A +5.4 m and 20 +4.8 m | Lv ✅; Vista ⬜ |
| Distances and areas | EPSG:26910 grid | Legacy frame | §3 frame error | ✖ magenta (corrected) |
| Cone-fit field | Spread in the grid | Spread in its frame | Same rule, different frame | 🟧 rule |
| Limit at a footprint | Exact clipped-vertex minimum | Sampled 2 m / 5 m (Tower Studio's own check) | Sampling can only read equal or higher; the case-5 site agrees within 0.002 m | Per cone (✅ / 🟧) |
| Mountains in eye-level views | NRCan MRDEM-30 to 25 km, CGVD28, far plane 60 km, no fog | SRTM 300 m backdrop, fog from 42 km (C04: 4.9–18.9% haze at the peaks) | The user asked for the real mountains | ⬜ (terrain layer flag) |
| Roof eye on Vista's example rooftop | LiDAR 2022 roof P90 + 1.6 m where a LiDAR roof exists | Studio-model roof + 1.6 m | Studio roofs re-grounded; not used | ✖ (in the hub list) |

## 6. Licensing guard

- Nothing derived from the studio model was copied into `tower-studio/`. This covers Vista's building packs, roof heights, building ids and generated `.3dm`. The Vista folder stays in `context-data/` (never served). The panel says what is and isn't read from a study file.
- The examples and studies bring only a site point, block sizes, an observer point and study planes. These are the user's own inputs, and the examples use published tower heights.
- So no new file was needed under `tower-studio/public/local/`, which stays git-ignored for the VTC base model. If a later step wants Vista's studio-roof numbers for comparison, they belong there and must be loaded at run time, like `lib/vtcNeighbours.ts`.

## 7. Reference numbers turned into tests and evaluation cases

- **Vista's 16 ceiling tests** (`tests/test_cone_ceiling.cjs`) ported 1:1 to `src/engine/vista.test.ts`, with the same inputs and expected values ✅.
- **Eval cases** (`src/eval/cases.ts`, node `built.vista`):
  - `VISTA-T`: Shangri-La example in the grid. Only 3.2.1, about 1,256 m²; 9.1 at 1.2 m (near edge); D at 8.4 m (C04).
  - `VISTA-K`: Vista's own test, 97.00 m at (−3, 0).
  - `VISTA-F`: frame error 0.576% / 0.192%; the QE apex converts within 0.05 m.
  - `VISTA-H`: hfov 87.5° / 87.2° (27.2), 25.7° / 25.6° (3.2.3), 24° clamp (9.1).
  - `VISTA-B`: exact ≤ sampled within 0.002 m; overlap exactly 900 m².
  - `VISTA-O`: no plane gives "unknown", never unlimited.
- **Not reproducible:** Vista's illustrative v10 result (183.9 m elevation, 143.4 m height, 23.4 m clearance for a 120 m proposal). Its plane inputs were only in a screenshot that was not packaged. Vista itself called these test values, not City limits ⬜.

## 8. Open items

- Vista has no licence file. Ruijie should confirm the MIT relicensing of the ported kernels 🟧.
- A Vista study whose stacked blocks have different offsets is simplified to one tower over a centred podium; the panel says so.
- Rooftop suggestions are limited by LiDAR coverage: one of four tiles is processed.
- Vista's water mask is not reproduced in the reconstructed eyes, so seawall and pier origins are approximate ⬜.
- The lower-boundary form (sloped vs horizontal, per view) is still 🟨 unresolved (C04). What-if planes let the team test either.
