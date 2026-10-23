# Morning report: Thu 22 Oct 2026, 05:05

Checked by the main session against the code, not only the session reports.

## A. Overnight

**Shared code now:** tsc clean · **534/534 tests** (59 files) · production build OK (one >500 kB chunk warning remains) · `npm run eval` **21/21** (04:00 run).

| Session | Built overnight (backlog items) | State |
|---|---|---|
| Core and lift | 2 public realm, 5 boards, 14 energy & carbon, 18 AI render workflow, 22 drawings, 25 interior programme, 27 solar rest of city (partial), 32 export model, 33 lift comparator, 35 pedestrian wind screen, 40 trips & station | idle |
| Node builder | 3 save/load/undo, 6 decision trace, 8 City in Nature, 11 wind procedure, 13 structure, 20 rule cards, 23 code & life safety, 29 sources hub, 31 sandboxed code nodes, 37 relaxations & aviation, 38 rainwater & bird glass | idle |
| Import | 1 massing import (.3dm/OBJ/glTF/IFC), 7 economics, 9 culture, 15 parking/loading/bikes, 16 evidence lint + accessibility, 19 facade, 21 view from here, 28 evaluation harness, 34 mid-review kit, 39 cost & city charges | idle |
| Landing page | 4 solar access, 17 community registry UI, 24 QA + status page + demo tour, 26 design options, 30 offline app + guide + README, 36 daylight screen, 41 final stabilization | idle |
| Real Vancouver context | 10 height-limit surface; 12 context layers (partial: packer built, layers not in the app yet); LiDAR heights for 1 of 4 tiles | **waiting for Ruijie** |

41 backlog items: 39 done, 2 partial. Feature work stopped at 04:07 after the final checks passed. Usage limit pause: about 00:45 to 01:51.

## B. Downloads and disk

| Time | File or package | Type | Source | Size | Where |
|---|---|---|---|---|---|
| 23:42 | LiDAR tile 490000_5459000.zip | data | City of Vancouver open data | 1.01 GB | context-data\raw\lidar-2022 |
| 23:16 | ajv 8.17.1 + 3 deps | npm package | registry.npmjs.org | 2.3 MB | tower-studio\node_modules |
| 23:56 | rhino3dm 8.35.0 | npm package | registry.npmjs.org | 6.7 MB | node_modules |
| 23:56 | web-ifc 0.0.78 | npm package | registry.npmjs.org | 24.8 MB | node_modules |
| 00:19 | Solar Access Guidelines, Downtown Peninsula | PDF | guidelines.vancouver.ca | 0.54 MB | not saved; read in the built-in browser (see note 2) |
| 00:39 | Parks polygons (254 parks) | data | City open data | 1.2 MB | context-data\raw\parks-polygon-2026 |
| 02:00 | Playwright 1.63.0 (test + core) | npm package | registry.npmjs.org | 33 MB | node_modules |
| 02:00 | axe-core 4.13.0 + @axe-core/playwright | npm package | registry.npmjs.org | 3.2 MB | node_modules |
| 02:01 | **Chrome Headless Shell 153 + ffmpeg + winldd** | **software (browser binary)** | cdn.playwright.dev (pinned by Playwright) | 275 MB | tools-cache\ms-playwright |
| 02:57 | Schools, BIAs, Davie/Robson streets, right-of-way widths, 4 school parcels | data | City open data | 0.38 MB | context-data\raw\solar-extra-2026 |
| 03:24 | ECCC hourly weather, YVR 2016–2025 (120 CSVs) | data | Environment Canada | 16.3 MB | context-data\raw\eccc-wind-2026 |
| — | Parking By-law Sec04.pdf | blocked (403), not bypassed | bylaws.vancouver.ca | 0 | — |

**Logged total ≈ 1.37 GB.**

**Not logged:** a duplicate `490000_5459000.zip` (0.96 GB) in `ARCH540 AI Studio\map\`, arrived at 23:43. No session says it saved it.

**Disk, baseline 21 Oct 23:37 → now:**
- **C:** 399.77 GB used / 15.86 free → 390.02 / 25.62. That is 9.75 GB freed, by Windows, not by us. Our share on C: is the npm cache, +0.06 GB (0.54 → 0.60).
- **F:** 278.03 used / 259.08 free → 283.48 / 253.63 (+5.45 GB). Of that:
  - project downloads and builds ≈ 2.53 GB:
    - context-data +0.96 (0.22 → 1.18);
    - node_modules +0.30 (0.30 → 0.60: 0.07 packages, 0.27 dev and test caches);
    - tools-cache +0.27;
    - map\ duplicate +0.94;
    - 04 Tool Plan +0.05 (snapshots, mid-review screenshots, evaluation);
    - dist +0.01;
  - Windows Update cache `F:\DeliveryOptimization` +0.92;
  - about 2.0 GB of other F: activity outside the project folders.

## C. Against the original proposal

### Done (where in the app)
- **Three stages**, Massing / Schematic / Present, with process rail and icons: top bar, keys 1–3.
- **Landing page** (Guided or Customize): `#/start`.
- **Customize workflow builder**: Grasshopper-style icon nodes, connect, logic nodes, save, run in guided: `#/customize`.
- **Node library:** 28 built nodes across 12 of the 13 categories (DATA is platform) + the researched roadmap; left panel.
- **Evidence everywhere:**
  - flags as icon + word;
  - Sources & assumptions hub (P16-M01) at `#/sources`;
  - rule cards (P16-M02);
  - decision trace (P16-M04), Trace tab;
  - the test that fails on any unsourced threshold.
- **Import** .3dm / OBJ / glTF / IFC with units, north, datum, storey slicing, tags and health check (P14-M02–M05): Import dialog.
- **Export** .3dm / OBJ / glTF; IFC export is roadmap.
- **Save / load / undo / JSON export** (P14-M01): Project menu.
- **Community:**
  - node-builder skill + "Build your own node";
  - My nodes;
  - sandboxed code nodes (P15-M04);
  - registry browser + PR helper (P15-M05, UI).
- **Decision visuals:** Options compare + jury-criterion chart at `#/options`.
- **Done / to-build tracking:** Status page with evaluation cases at `#/status`.
- **Run locally:** offline install (PWA), user guide at `#/guide`, README quick start, Pages build config.
- **Evaluation harness:** 21 cases via `npm run eval`, reports in `04 Tool Plan/evaluation/`.
- **Context Model (Real Vancouver):**
  - cone registry and design-vs-cone check;
  - view from a protected viewpoint;
  - height-limit surface (C01-M03);
  - relaxations & aviation (C01-M06);
  - 6,721 footprints;
  - North Shore terrain;
  - layers panel with sources;
  - "View from here" (roofs and street).
- **Evaluation nodes by category:**
  - **SITE:** VTC rules, FSR, view cones, relaxations & aviation.
  - **PROG:** economics (PVV port + construction cost + ACC/DCL/DCC).
  - **CLIM:** solar access & sun hours (VTC + 41 city spaces + schools, sidewalks, envelope), sun preview, pedestrian wind trigger + massing screen (screening only), daylight depth.
  - **ENER:** energy & carbon.
  - **ECOL:** City in Nature ledger incl. rainwater and bird glazing.
  - **PUBL:** streetwall, active frontage, open space & links.
  - **CULT:** engagement & claims guard, AI-use provenance.
  - **MOBI:** parking/loading/bikes, trips & station entrance.
  - **STRC:** structure & seismic, wind procedure.
  - **SYST:** core & lifts (+ sky lobbies, comparator), egress & stairs, code & life safety, public sky room.
  - **SPAC:** facade glazing & bird safety, interior & activity programme.
  - **PRES:** boards (composer, JPEG and anonymity checks, deliverables), drawings, AI render workflow, camera presets, capture.

### Left to build

**13 Nov working core**
- LiDAR heights for the other 3 CBD tiles (C02-M03): **partial**, 427 of 6,721 buildings have heights. Needs your download.
- Context layers in the app: trees, zoning/heritage, traffic, land value (C03): **partial**, packer built, not shown.
- Cone calibration and validation against City height sheets (C01-M02, C01-M07): **partial**, 2 regression cases. Waits on City Request 0.
- Run modes run-all / step-in with DAG provenance (P15-M02): not built.
- Existing tools as nodes: Form Studio, Sinnie's and Willem's tools. Not built; needs permissions.
- Browser geometry kernel / booleans, manifold-3d (P14-M07): not built.

**10 Dec v1**
- Shared registry repository + live comments (P15-M05/M06 back end): UI only.
- Viewport conditioning capture (depth, line, segmentation) for AI renders (P13-M04): not built.
- Solar: 13 urban plazas (no official outline), Victory Square cenotaph rule: **partial / unresolved**.
- Writing support and rights register (P13-M08): **partial** (provenance log only).
- Entry flows and street comfort (P09-M04): not built.
- Envelope performance (P12-M06b): **partial** (bird safety only).
- Mass timber limits (P10-M06): not built as its own check.
- Skyline identity prompts (P07-M06): not built.
- Hosting on GitHub Pages: build config ready, not deployed (your decision).

**Roadmap**
- CFD wind (P03): no credible browser engine; screening only.
- Smoke control / stack effect (P11-M08).
- IFC export.
- Desktop app (Tauri) or Rhino panel.
- Render post-processing (N8AO/SMAA); command palette.

**Not code:** user study (6 Nov), City Request 0, permissions, VTC Q&A before 3 Nov, 150-word proposal and pitch.

## D. Mid review: Friday 23 Oct

**Demo-ready:** landing → three stages on both projects → Customize → Options → Sources → Status with evaluation 21/21. A demo project and tour exist.

**`04 Tool Plan/mid-review/`:**
- 33 screenshots;
- the evaluation report;
- the new 5-minute DEMO_SCRIPT;
- WHATS_NEW_2026-10-22.

The pitch and the 150-word proposal are yours.
