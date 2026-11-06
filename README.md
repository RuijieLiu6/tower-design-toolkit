# Tower Design Toolkit (v0.1, study tool)

An open-source, **web-first** platform for designing a tall building in Vancouver: shape a tower, switch on evaluation **nodes**, and read every result with the **evidence** behind it. Built for Vancouver Tall Challenge entrants and students, as part of ARCH 540 (UBC SALA, fall 2026) by Ruijie Liu and Sinnie Choi. Instructor: Xun Liu.

> **Name:** the tool was renamed from *Tower Studio* to **Tower Design Toolkit** on 22 Oct 2026. The folder (`tower-studio/`), the data format ids (`tower-studio-project@1`, `tower-studio-node@1`), the skill folder and the browser storage keys keep the old name, so saved projects and node packages still load.

> Study tool for early design. It does **not** determine compliance. View-cone heights are **estimates**; the City of Vancouver View Cone Assessment governs.

**New here, or an AI agent picking up the work?** Start with [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md): the project in the assignment brief's structure, what is built, what is left, and the rules for working on it. Planning, research and evaluation documents are in [docs/](docs/). The UI design logic, icon and colour scheme are in [DESIGN_HANDOFF.md](DESIGN_HANDOFF.md).

## Quick start (Windows or Mac)

You need about 600 MB of disk space and 10 minutes. No account and no server: everything runs on your computer.

1. **Install Node.js 22 or 24** (LTS) from [nodejs.org](https://nodejs.org/). The app needs at least 22.12 and below 25 (`engines` in `package.json`). Check in a terminal:
   ```bash
   node --version
   ```
   On a Mac with Homebrew, `brew install node@22` works too.
2. **Get the code**: download the repository as a ZIP and unzip it, or `git clone <repository URL>`. Open a terminal in the `tower-studio` folder (Windows: in File Explorer, type `cmd` in the address bar and press Enter; Mac: right-click the folder > New Terminal at Folder).
3. **Install the exact package versions** from `package-lock.json`:
   ```bash
   npm ci
   ```
   Windows PowerShell may refuse to run `npm` ("running scripts is disabled"): use Command Prompt (`cmd`) instead, or type `npm.cmd` wherever this guide says `npm`.
4. **Start it**:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173 in Chrome, Edge, Safari or Firefox. Stop it with Ctrl+C.
5. **Run the tests** (under a minute):
   ```bash
   npm test
   ```
   Also available: `npm run eval` (the 21 evaluation cases, with a report), `npm run test:a11y` (accessibility scan) and `npm run test:offline` (builds the app, opens it once, cuts the network and checks it still opens). The last two need a Playwright browser the first time: `npx playwright install chromium`.

The in-app **User guide** (start page > User guide, or `#/guide`) explains the stages, the evidence flags, Customize, files and design options.

### Add the competition model (optional, stays on your computer)

The VTC base model belongs to Buildner and is **never published**, so the website has no copy. If you are an entrant, open the Competition site and click **Add your copy of the base model (.3dm)** (or drop `Vancouver Tall Base Model.3dm` on the view). The app reads it in your browser and keeps it in that browser's own storage on your computer; nothing is uploaded, and other visitors never see it. Remove it any time from the view's dock (Competition context model).

For development you can instead convert it once (Python 3.11+ with `pip install rhino3dm`); the app uses this file first when it exists:

```bash
python tools/build_vtc_context.py "<path>/Vancouver Tall Base Model.3dm" public/local/vtc_context.json
```

Then reload the app: the Competition site shows the surrounding buildings. `public/local/` is git-ignored, never stored by the offline app, and removed from GitHub Pages builds. Without the file the app still runs, without the neighbours.

### Use it like a desktop program (offline, installable)

A built copy works without a network after its first visit and can be installed as an app with its own window:

```bash
npm run build
npm run preview
```

Open http://localhost:4173, then use **Install app** on the start page (or the install icon in Chrome's or Edge's address bar; Safari on macOS 14+: File > Add to Dock). The development server (`npm run dev`) never installs an offline copy, so it always shows your latest code. The offline copy updates the next time you open it after a new build. The competition model in `public/local/` is never stored in the offline copy, so with no server running the Competition site shows no neighbouring buildings.

Your projects, options and workflows are saved in that browser only. Use **Export .json** in the project menu to keep a copy or move to another computer.

### Live web version (GitHub Pages)

**Try it in the browser:** https://ruijieliu6.github.io/tower-design-toolkit/ (built and deployed by `.github/workflows/pages.yml` on every push to `main`; the private competition model is never part of it, so the Competition site shows the block without its neighbours).

To build the same thing locally:

```bash
npm run build:pages
```

builds `dist/` for `https://<user>.github.io/tower-design-toolkit/`: absolute paths under `/tower-design-toolkit/`, a `404.html` that sends any path back into the app's `#/` routes, `.nojekyll`, and **no** `local/` folder. For another repository name, set `PAGES_BASE` first (Mac: `PAGES_BASE=/my-repo/ npm run build:pages`; Windows PowerShell: `$env:PAGES_BASE="/my-repo/"; npm run build:pages`). Deployment happens only through the GitHub workflow above, never from a local `dist/`.

App icons are generated by `npm run icons` (`tools/make_icons.mjs`, no packages needed).

### Real Vancouver context data (already built into `public/data/`)

The Real Vancouver project loads compact layers from `public/data/`, listed with source, retrieval date, licence, attribution, CRS, datum and SHA-256 in `public/data/layers.json`. To rebuild them, use a Python 3.13 venv **outside** the app folder (numpy, pyproj, shapely, rasterio, laspy, lazrs). Put each download in its own new, empty folder and run the scripts in isolated mode (`-I`):

```bash
# 1. City footprints 2015 (OGL-Vancouver): GeoJSON export of the downtown box 49.262-49.297 N, 123.085-123.150 W
python -I tools/build_city_footprints.py <footprints.geojson> public/data <retrieved YYYY-MM-DD> <export URL>
# 2. NRCan MRDEM-30 DTM window (OGL-Canada), read with HTTP range requests, then rings R1 (6 km, 30 m) and R2 (25 km, 60 m)
python -I tools/fetch_mrdem_window.py <raw>/mrdem-30-dtm_vancouver_window.tif
python -I tools/build_city_terrain.py <raw>/mrdem-30-dtm_vancouver_window.tif <proj-grid dir> public/data <retrieved> src/data/viewcones.json
#    <proj-grid dir> holds ca_nrc_CGG2013n83.tif and ca_nrc_HT2_2010v70.tif from cdn.proj.org (NRCan, OGL-Canada)
# 3. City LiDAR 2022 heights (OGL-Vancouver): download tiles in a browser (the portal blocks scripts), then
python -I tools/build_lidar_heights.py public/data <zip dir> <new empty extract dir> <latest retrieved> [TILE=YYYY-MM-DD ...]
python -I tools/build_city_ground.py <zip dir>/<TILE>.zip public/data <work dir> <retrieved>    # once per tile
python -I tools/build_city_forms.py                                                           # mosaics every tile with a ground grid
python -I tools/build_city_forms_2009.py <footprints-2009 box.geojson> <retrieved> <URL> [<2009 ring.geojson> <2015 ring.geojson> <URLs>] ...   # one triple per ring area
python -I tools/test_city_forms_2009.py                                                          # the de-duplication rule and the published layers
# 4. Context layers v1 and the visual finish (City open data, OGL-Vancouver; exports clipped to the same downtown box)
python -I tools/build_city_layers.py trees     public/data <retrieved> <export URL> <public-trees.geojson>
python -I tools/build_city_layers.py parcels   public/data <retrieved> <export URLs> <property-parcel-polygons.geojson> <property-tax-report.csv>
python -I tools/build_city_layers.py zoning    public/data <retrieved> <export URL> <zoning-districts.geojson>
python -I tools/build_city_layers.py heritage  public/data <retrieved> <export URL> <heritage-sites.geojson>
python -I tools/build_city_layers.py traffic   public/data <retrieved> <export URLs> <movement-counts.geojson> <directional-locations.geojson>
python -I tools/build_city_layers.py shoreline public/data <retrieved> <export URL> <shoreline-2002.geojson>
python -I tools/build_city_layers.py parks     public/data <retrieved> <export URL> <parks-polygon-representation.geojson>
# 5. Buildings, Vista's unified model (OpenStreetMap, ODbL; the default model): fetch Vista's generated/unified_*buildings* files read only
#    (gh api repos/RuijieLiu6/vancouver-tall-view-tool/contents/generated/<file>?ref=<commit>) into <raw>, then (needs steps 1-3 for the comparison)
python -I tools/fetch_osm_use_tags.py <new empty raw dir>                         # building types: two Overpass queries, each sent once (ODbL)
python -I tools/build_vista_buildings.py <raw> public/data <commit> <retrieved> [<osm use-tag dir>]
python -I tools/build_vista_streets.py <raw> public/data <commit> <retrieved>     # Vista's streets: Context surfaces, Plain lines (street_network.json)
python -I tools/build_vista_labels.py <raw> public/data <commit> <retrieved>      # Vista's place labels for the City overview (labels.json, extension_labels.json)
python -I tools/fetch_osm_water.py <new empty raw dir>                            # OSM coastline + water bodies over the plinth: two Overpass queries (ODbL)
python -I tools/build_water_mask.py <osm water dir> public/data <retrieved>       # water.json: sea (coastline, land on the left) + inland water; display only
node tools/prepare_vista_textures.mjs <raw>/textures                                # Context style textures -> public/textures/vista/
```

The exact export URLs (with their `select` and `where` clauses) are recorded per layer in `layers.json` (`source.request`).

Heights are CGVD28. MRDEM is CGVD2013 (CGG2013) and is converted with the NRCan geoid models through PROJ (EPSG:9246 inverse + EPSG:9123), never with a typed offset. A building without a LiDAR height is drawn as a flat outline labelled "height unknown"; no height is ever defaulted.

### Terrain accuracy update (22 October 2026)

The Real Vancouver scene now loads detailed terrain automatically after its lightweight initial view:

- **City LiDAR ground at 1 m:** tile `490000_5459000`, covering part of the West End / Coal Harbour area. Ground is derived only from non-withheld class-2 returns. Small gaps are interpolated within 3 m; larger gaps retain no-data and use the regional fallback. Source survey accuracy and output grid spacing are different quantities.
- **Mountain terrain at 30 m:** the native MRDEM-30 source window, without the earlier 60 m smoothing. The original 60 m layer remains a loading/error fallback. This restores source detail; it does not turn the mountain model into a LiDAR survey.
- **Consistent heights:** the ground card, street cameras, skyline analysis, context overlays and solar receiver elevations sample the detailed ground first. Sources are reported under the selected footprint, including mixed coverage. The tower base remains a user choice.

Rebuild the new layers from the existing local downloads:

```powershell
& ..\context-data\venv\Scripts\python.exe -I tools/build_city_ground.py ..\context-data\raw\lidar-2022\490000_5459000.zip public/data ..\context-data\work\terrain-upgrade-2026-10-22 2026-10-22
& ..\context-data\venv\Scripts\python.exe -I tools/build_city_terrain.py ..\context-data\raw\mrdem-30\mrdem-30-dtm_vancouver_window.tif ..\context-data\raw\proj-grids public/data 2026-10-22 --mountain-detail
```

The ground builder streams the ZIP directly, retaining the source archive. It also writes a georeferenced Float32 GeoTIFF and a separate coverage-quality raster outside the published app. `layers.json` records source links, dates, coordinates, datum, processing, missing coverage and checksums. The two detail files add 7.57 MB after the initial 2.03 MB of context data; the offline build also includes them.

See [the terrain update report](../04%20Tool%20Plan/TERRAIN_UPGRADE_2026-10-22.md) for the source audit, remaining coverage gaps and prioritized City download links. Validation: terrain/data/view/solar regression tests, production build, and the reproducible local browser check in `tools/check_terrain_upgrade.mjs` (Vite on port 5202).

## What is in v0.1

| Area | Status |
|---|---|
| Two projects: **Competition site** (VTC block) and **Real Vancouver** (City view cones) | Built |
| Basic mode: parametric towers (height, footprint, rotation, podium, floor-to-floor), program by floor band, click to place | Built |
| Node library: 13 categories, 4 built nodes plus every researched module, with on/off switches and workflow presets | Built |
| **VTC hard rules**: height band (both units), ≥ 9.0 non-residential FSR (three readings), containment, transit link, vertical public uses; each rule cites its brief page | Built |
| **Program and FSR accounting** | Built |
| **View-cone height check**: Z = Lv + k·D for 8 cones with published or fitted slopes; "no estimate" for the rest; view from each protected viewpoint | Built |
| **Height limit surface** (Real Vancouver): lowest estimated cone limit across downtown, around the tower or over a drawn area; "limit unknown" hatched wherever a covering cone has no estimate; "max height here" readout; every cone's lower-boundary parameters with sources and flags | Built |
| **Sun and shadow preview**, with true north corrected (the VTC model's own north is wrong by 45°) | Preview |
| Node canvas (Layer 0 → nodes → evidence report) | Built (read-only graph) |
| Present mode: camera presets, PNG capture, Codex render command, VTC board checklist | Built |
| Evidence flags: verified, team assumption, unverified, unresolved, **false assumption** | Built |
| **Real Vancouver context**: 6,721 City footprints downtown (38 bytes each), MRDEM terrain to the North Shore mountains (25 km), the outer ring meshed adaptively (RTIN), with native 30 m mountain detail and a 1 m City ground tile loaded after the initial scene, draped cone outlines, layer list with sources | Built |
| **Tower base** (Real Vancouver, 27 Oct): follows the terrain under the selected tower by default (City LiDAR 1 m where covered, else MRDEM-30; flagged unverified; 32.8 m at the default site), with one click to set it by hand; saved in the project file (older files keep their saved base) | Built |
| **Context layers v1** (Real Vancouver, loaded only when switched on): 23,012 street trees with City height classes, 7,658 parcels with 2026 assessed land value, 408 zoning districts, 916 heritage sites, 1,274 traffic count locations (locations only: volumes are not in the open data) | Built (data retrieved 27 Oct) |
| **Surrounding context: City 2009 heights** (Real Vancouver, 27 Oct): outside the 2022 LiDAR core, the downtown box, the whole area of the 24 view cones (to Queen Elizabeth Park and Trout Lake) and the gaps between them (the convex hull of the cones and the box, so the city fabric is continuous) are filled with 29,399 building parts from the City's *Building footprints 2009* (heights from 2009 LiDAR, OGL-Vancouver), drawn a shade darker and counted in views and solar (flagged unverified). A 2009 part is kept only where a 2015 outline still stands on it. 8,471 outlines with nothing of 2009 on them (mostly garages and laneway houses under 60 m², or newer buildings) show as hatched 3 m placeholders and 354 as flat outlines: display only, never in a calculation. **One building, one representation:** LiDAR 2022 > 2015 blocks with 2022 heights > City 2009 (larger first) > 2015 outlines and placeholders; anything overlapping a higher-ranked building by at least half of the smaller footprint is left out, smaller overlaps are cut away (`settle` in `tools/build_city_forms_2009.py`, tested in `tools/test_city_forms_2009.py`: no drawn pair overlaps by half the smaller footprint). Adjacent LiDAR ground tiles are drawn as one mosaic, and each cone outline once, draped on the ground. Datum check in the core: 2009 base −0.56 m, tall tops −2.6 m (medians) vs 2022 LiDAR | Built |
| **Buildings: Vista's unified model** (Real Vancouver default, 3 Nov): 61,402 buildings (62,372 footprint parts) from Vista (github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e), all OpenStreetMap extrusions: the studio Rhino model's 2022 OSM export in the centre and current OSM around it. Footprints are taken from Vista's frame through latitude/longitude into EPSG:26910 (median 1.42 m from the City's 2015 footprints, 1.10 m from the 2009 ones). Each building stands on the Toolkit ground at its footprint's centre (CGVD28); Vista's SRTM terrain is not used. Each building takes its best height (Ruijie, 3 Nov): City LiDAR 2022 roof forms or City 2009 heights where they cover at least half its footprint (area-weighted P90; 40% of parts), else Vista's OpenStreetMap height tag or floor count, else Vista's estimate per building type (49% of parts, drawn a shade off and flagged). Vista's own heights alone are within 10% of LiDAR for only 273 of 510 parts over 60 m. The City model (LiDAR 2022 + 2009 only) stays one switch away in the Layers dock and every check (solar, View from here, Vista, cones, demolition) follows the model shown. Each part keeps Vista's `osmId`. Building types for the Plain style come from OpenStreetMap use tags (Overpass, 3 Nov, `tools/fetch_osm_use_tags.py`): the building's own tags, else points of interest inside it, else *other* (65% of parts), never guessed; `layers.json` records both requests. `tools/build_vista_buildings.py` | Built |
| **Place labels: Vista's neighbourhood and landmark names** (City overview, 3 Nov): 34 label anchors from Vista's generated/labels.json and extension_labels.json (@ 917b28e, read only; Vista records no source for them, treated as Ruijie Liu's own work), through latitude/longitude into EPSG:26910. Display only: each floats 40 m above its anchor and hides where it would overlap another, as in Vista. `tools/build_vista_labels.py` | Built |
| **Water in the view: OpenStreetMap coastline and water bodies** (Real Vancouver, 3 Nov): the coastline polygonized over the plinth (land on the left, sea on the right, as Vista does), plus natural=water and reservoirs; Overpass 3 Nov, ODbL. Display only: in the Plain look the terrain inside it is drawn in the water colour, which hides the elevation model's cells just above 0 m over the water. No elevation, eye level or check changes. `tools/fetch_osm_water.py`, `tools/build_water_mask.py` | Built |
| **Water and parks** (Real Vancouver): the 0 m sea plane drawn as water, so the coast follows the terrain; the City's approximate 2002 shoreline as a line; City parks tint the ground. Neither is a surveyed shoreline | Built |
| **Cone coverage**: the view-cone node lists the 8 of 24 cones with an estimate and the 16 that say "no estimate" until City Request 0 is answered | Built |
| LiDAR roof heights per footprint | 1,358 footprints and 7,254 stepped roof parts from four City tiles (490000/491000 × 5458000/5459000, the 2 × 2 km core, mosaicked so towers on tile edges are measured whole); 5,363 outlines outside the core stay "height unknown". Check against published heights (Wikipedia list, unverified): Living Shangri-La 201.8 m vs 200.9 m, One Burrard Place 167.8 vs 167.6, Hotel Georgia 157.9 vs 158.5, Shaw Tower 149.1 vs 149.0, MNP Tower 143.0 vs 143.1; several office towers read 4–8 m higher (rooftop plant is measured, published heights may exclude it); towers finished after the September 2022 survey show their construction state (The Butterfly 115.6 m vs 178.6 m) |
| **Program value & land residual** (economics node, research P08): the Program Value Visualizer method on every floor: value per m² by use (PVV Vancouver 2026 pack, mostly grade C) with height premiums and height-band efficiency, Altus 2026 hard cost with a supertall premium, soft cost, finance, City DCL / utilities DCL / ACC by permit date, Metro and TransLink DCCs, 15% profit on cost, the negotiated CAC, and a verdict against the land price (estimated for the VTC block). A floor chart shows which floors pay for the tower; every number sits in an editable ledger with its flag and source | Built (indicative, not a feasibility study) |
| **Engagement & claims guard** (research P07-M01, stage A): per-Nation engagement ladder N0-N4 for Musqueam, Squamish and Tsleil-Waututh (N0 default), a regex claims check of board text (duty-sense "consulted" and FPIC never; collaboration phrases need N4; "spoke with" needs N3; approval needs N4 with a reference; no AI verdict), status-matched statements, a generic no-contact rule (names and clauses only after a person verifies them), private eligibility checklist, export gate. Guardrails only: no cultural content and no culture score; unreviewed beta awaiting Indigenous review | Built (beta) |
| **AI use & provenance log** (research P07-M07): per board element, how it was made (IPTC digital source type), tool, what a person contributed, who decided, licence, a named reviewer for AI-drafted cultural text; a board appendix with AI use, sources and module licences and no people. Kept in this browser | Built |
| **Parking, loading & bikes** (Schematic node, research P09-M02/M05): no minimum parking (pass), the downtown non-residential maximum (1 per 115 m², s.4.2.5, unverified extract), accessible, visitor, EV, loading, passenger and Class B bicycle rows marked unresolved, Class A bicycles as a range between two secondary readings, the transit-link rule, a dock queue screen (Erlang C, with your truck arrivals and dwell) and a draggable site-access sketch on the VTC block (no access on the retail street; curb cuts can be passed to the active-frontage check). The by-law sections could not be opened (HTTP 403), so no by-law row shows a pass | Built (rates pending a person reading the by-law) |
| **Evidence lint and accessibility checks**: `src/lib/evidenceLint.test.ts` runs every built engine on both projects and fails if any result lacks a source, a stated threshold or a known flag, or calls itself verified with nothing to check (plan §4). `npm run test:a11y` (Playwright + axe-core, WCAG 2.1 A/AA) scans the landing page, the three stages, Customize, the import dialog and three node panels; serious or critical violations fail, and the report goes to `04 Tool Plan/overnight/a11y/axe-report.md`. The browser binary is kept in `../tools-cache/ms-playwright` | Built (all 10 screens: no violations, 22 Oct) |
| **Facade: glazing & bird safety** (Schematic node, research P12-M06a/b): facade faces from each tower's plan outline, facing measured from true north with a ±5° bin check, window-to-wall ratio by facing (system presets, editable), an unrolled elevation of vision glass and spandrel per storey, glass in the bird-collision zone against the UBC tiers (a proxy; City guideline unopened), VLT and SHGC lines and US / VBBL 2019 WWR lines shown without a badge, and a facade feasibility checklist. Energy is the energy node's job | Built |
| **View from here** (Real Vancouver; the Context Model's "views from cones and rooftops"): pick a building roof with a LiDAR height (unknown-height roofs are refused with the reason), a street point, or the top or a floor of a design tower; the camera stands at roof P90 / ground / floor + 1.6 m eye height (research C04), turns to any bearing, and captures a 360° strip (eight 45° frames) to the filmstrip. A ray-cast skyline profile round the circle shows where the North Shore terrain clears the skyline (curvature d²/2R × (1 − 0.13), research C02) and which protected view cones the sightline crosses. Optimistic until all LiDAR tiles are processed: buildings without a height don't block views | Built |
| **Evaluation cases** (course: typical / boundary / out of scope / repeated): `npm run eval` runs 21 cases (the 7 from the first-attempt spec, plus a typical and an out-of-scope case for lifts, public realm, solar, structure, energy, mobility and views) at engine level (`src/eval/cases.ts`, vitest) and through the UI (`e2e/eval.e2e.ts`: cases 3, 5, 7 and a panel screenshot with the flags shown for every case), and writes `04 Tool Plan/evaluation/<date>/report.md` with screenshots; a failing case stays in the report and the command exits with an error. The Status page lists the cases and the last run | Built (21 of 21 pass, 22 Oct) |
| **Import massing** (.3dm, OBJ, glTF/GLB, IFC; drop a file anywhere or Design > Import): units, north and zero level confirmed on import (never assumed; unresolved north stays visible), storeys sliced at your floor-to-floor with plate areas (overlaps counted once), program tagged per storey, a plain-language health check (holes, flipped faces, zero-area faces, unit slips, far from origin, overlaps). Imported towers run through the same checks as box towers. Try the synthetic files from `node tools/make_import_fixtures.mjs` | Built (Revit via IFC, SketchUp via OBJ; detailed IFC models and curved Breps without render meshes are not handled) |
| **Build your own node**: the node-builder skill (`skills/tower-studio-node-builder/`, copy or download from the library) teaches any AI assistant to design a node with you; import the `tower-studio-node@1` package into *My nodes* (validated, stays in your browser, marked unverified until reviewed) | Built |
| **Project file**: autosave in the browser, Save as / Open, undo and redo (Ctrl+Z), deterministic `.json` export and import (`tower-studio-project@1`, with north and datum) | Built |
| **Decision trace** (Trace tab): recorded iterations with every result and its evidence flag, what changed and what it did, restore, decisions with your own rationale; rule cards for the clauses the checks apply (unreviewed) | Built (review flow planned) |
| **City in Nature ledger**: canopy, cover, habitat, rainwater, bird-safe glass and protected views, each with how binding its rule is, its flag and source; an evidence ledger, not a score | Built (values entered) |
| **Wind procedure & structure** (NBC 2020 slenderness triggers, lateral-system shortlist at SC4) and **pedestrian wind study trigger** (analog cities' rules; no browser comfort map yet) | Built (screening) |
| Shared node registry, review and comments | Planned v1 |

## Structure

```
src/engine/   deterministic calculations (no AI): massing, VTC rules, view cones, sun
src/data/     City view cones (OGL-Vancouver), research registry (from ../04 Tool Plan/research)
src/components/  UI: TopBar, NodeLibrary, Viewport (three.js), CityContext (Real Vancouver layers), NodeCanvas (React Flow), panels
src/lib/      cityLayers.ts: decoders for the context layers; terrainMesh.ts: error-bounded terrain mesh (RTIN)
              import/: massing import (readers for 3dm, OBJ, glTF, IFC; pipeline; mesh store)
public/data/  Real Vancouver context layers + layers.json manifest
tools/        build_vtc_context.py (local only), build_registry.py, build_city_footprints.py, fetch_mrdem_window.py,
              build_city_terrain.py, build_lidar_heights.py, make_import_fixtures.mjs (synthetic test massings)
```

## Sources and licences

- **Code:** MIT (see `LICENSE`).
- **City of Vancouver view cones, Building Footprints 2015 and LiDAR 2022:** contains information licensed under the Open Government Licence – Vancouver.
- **Context style textures** (`public/textures/vista/`, from Vista): facade albedos by Poly Haven (CC0 1.0), water normal map by ProcTexture (CC0 1.0), asphalt and paving photos by Ruijie Liu, and a grass watercolour generated for Vista from Ruijie Liu's reference (no third-party licence). Details and checksums in `public/textures/vista/sources.json`. Context streets: © OpenStreetMap contributors (ODbL), via Vista.
- **Real Vancouver buildings (default):** © OpenStreetMap contributors, via Vista (Ruijie Liu). `public/data/vista_buildings.*` is a derivative database of OpenStreetMap and is offered under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The combined height table (OSM geometry with City LiDAR 2022 / 2009 heights per building) is a derivative database too and is ODbL as well (OGL-Vancouver allows this with attribution); the rest of the data keeps its own licence. Renders and boards that show these buildings credit OpenStreetMap.
- **Terrain:** contains information licensed under the Open Government Licence – Canada (Natural Resources Canada, MRDEM-30). Includes Copernicus DEM GLO-30 material, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.
- **Vertical datum grids:** NRCan CGG2013 and HT2_2010v70 geoid models (Open Government Licence – Canada), via the PROJ data CDN. Used offline only; not redistributed.
- **Cone slopes:** from Council reports and City site sheets, as documented in the team's research logs (packet C01).
- **VTC brief rules:** cited by page from the competition brief (Buildner 2026). The brief itself is not redistributed.
- **Libraries:** React, three.js, react-three-fiber, drei, React Flow, Zustand and Tailwind CSS, all under MIT. Massing import: rhino3dm (MIT, McNeel) and web-ifc (MPL-2.0, That Open Company), loaded only when a .3dm or .ifc file is opened.
- **Terrain meshing method:** right-triangulated irregular network (Evans, Kirkpatrick and Townsend, 2001), as in Mapbox Martini (ISC). Re-implemented in `src/lib/terrainMesh.ts`; no code copied.

## Credits

Ruijie Liu and Sinnie Choi. Built with Claude (Anthropic), with research critiqued by independent model reviewers. Classmate tools (Downtown Massing Tool, Solar Shading Explorer) are linked, not copied, until their authors give permission.


### Building forms and streets — 22 October 2026

The Real Vancouver view now loads `building_forms.json` and `city_streets.json` after its base scene. Open **Context layers → Inspect extracted buildings** to see the processed West End / Coal Harbour tile; the same panel controls road surfaces and main street names.

The original display raised an entire outermost 2015 footprint to one LiDAR P90 height. The new layer replaces 416 such parts with 1,573 separate roof masses from non-withheld City 2022 LAS class 6. Roofs use a 1 m P90 raster, a local median filter, 3 m elevation bands, a 16 m² minimum part and 1 m joint boundary simplification. Roof-level heights are medians of the underlying cell P90 values. This preserves major podium/tower setbacks but remains an approximate stepped model, with inferred vertical walls. Fifteen self-touching historical polygons are repaired without changing their height associations. The viewport, rooftop picking and solar worker share the replacement; courtyard holes remain open in solar calculations.

The street layer contains 2,735 in-service street/lane segments from the City's engineering StreetCentreline service. Native UTM geometry avoids a WGS84 round trip. Recorded `SURFACE_WIDTH` values define approximate centred road ribbons, dissolved at intersections and draped on terrain; 91 records without usable widths or labelled as bridges remain reference lines. City centre lines describe the approximate dedicated right-of-way centre, which may differ from the physical road centre. These ribbons do **not** locate surveyed curbs, sidewalks, medians or parking bays.

Rebuild using the existing context-data Python environment:

```powershell
& '..\context-data\venv\Scripts\python.exe' -I tools/build_city_forms.py
& '..\context-data\venv\Scripts\python.exe' -I tools/build_city_streets.py
# Add --download to the street command to refresh its official source query.
```

*Update 27 Oct:* building coverage is now four LiDAR tiles (`490000_5458000`, `490000_5459000`, `491000_5458000`, `491000_5459000`), mosaicked into one 2 × 2 km grid, so only buildings crossing the mosaic's outer edge are retained intact. The remaining downtown outlines are 2015 data, and unknown roof heights remain unknown. Source URLs, licences and checksums are in `public/data/layers.json`; the street service publishes a CC BY licence. Raw street responses and metadata are archived in `../context-data/raw/building-street-audit-2026-10-22/`. Processing reports, geometry audit, backups and browser checks are in `../context-data/work/building-street-upgrade-2026-10-22/`.
