# CHECKPOINT: Sun & Wind Studio merge, engine 3 of 4: natural-ventilation potential (17 Nov 2026)

Same brief as engines 1 and 2 (below). Branch `sun-wind-ventilation`, cut from `sun-wind-daylight` bdf5628, worktree
`tower-studio-sw`. Pushed for review, **not merged, not deployed**; her written OK (§1c, status line added) still pending.

## What was built
- **Her engine, in TypeScript** (`src/engine/ventilationSW.ts`): study.js `ventStudy` (hour by hour over the period: windows
  open when the room air, outdoor + ΔT, is in her fixed band or the ASHRAE 55 adaptive band 0.31 Tpma + 17.8 ± 3.5 °C, the
  gust 1.8 × the station wind carried to the floor height (`siteWind`, ASHRAE boundary layers) is under her limit, ×1.6 for
  a double skin, and it is not raining over 1 mm/h), `ventFlow` (wind pressure by face angle, `cpFace`, and stack pressure
  through each operable opening, balanced by 32-step bisection; cross, single-sided with BS 5925 turbulence, or a stack
  shaft three storeys up), `ventOpenings`, and the ASHRAE 62.1 quick check `ventFloorQuick` / `ventTowerQuick` (free area
  over the floor, every cell within 8 m of an operable opening). The shared physics (`daylightSW.ts` `prep`) now also
  carries her hourly wind, direction, rain, daily means and the prevailing mean outdoor temperature.
- **Data**: `src/data/sunWindHourly.json` gains `ws`, `wd`, `rain`, monthly `temp` and `months` (200 KB, worker and lazy eval only).
- **Fixtures from her own code**: `tools/sunwind-ventilation-fixtures.cjs` at **c24addb**, six cases: her default facade
  with cross flow (30 floors); single-sided with the adaptive band in summer; a 70-floor stack case with an operable
  double skin to L25, sealed above, 6 m/s gust limit; a 40 × 28 m plate turned 30° with only north and south operable,
  15% opening, ΔT 2 K, April–September; an L plate with one operable face across the year end; a sealed facade; plus
  her prevailing-mean temperature, Cp and site-wind values, and `ventFlow` in all three modes on one floor.
  `src/engine/ventilation.fixtures.json` (40 KB). **Bit for bit (tolerance 0)**: monthly rows, per-floor shares, median
  ACH, the hourly grid, the limit floor, 62.1 per floor (`ventilationSW.test.ts`, 8 tests). The daylight fixtures still
  match after the shared `prep` change (13/13).
- **Mapping** (`src/engine/ventilationSWInput.ts`): the daylight port's plates (occupied floors, true north, core);
  glazing from the facade node when on, else her default zones; which faces open and her settings (mode, band, gust
  limit, opening share, ΔT, period, north) as node presets. Her model reads no context buildings.
- **Node `built.ventilation-sw`** "Natural ventilation potential (Sun & Wind Studio)", CLIM, Schematic, both projects, off
  by default: worker `src/workers/ventilationWorker.ts`, hook + store `src/hooks/useVentilationSW.ts` (`ts.ventilationSW`),
  card `VentilationSWResults.tsx` (openable area, within 8 m and hours tiles; by month against comfortable hours; by
  floor; her week × hour carpet; lines; presets), canvas status, trace digest group `ventilationSW`, rule cards
  `ashrae621.natvent.sunwind` and `ashrae55.adaptive.sunwind` (unverified), FIXES `sw-vt-*`, evidence lint, eval cases
  VT-T / VT-O, Sources hub, every list, and a new `WindowAir` icon (line + filled drawing).
- **Evidence lines** (all unverified, sourced): openable area ≥ 4% (fail below or with no operable face), within 8 m
  (≥ 95% pass, else warn, as her app), hours the windows do the work, highest floor that can open, open hours meeting
  her 0.35 L/s·m² outdoor air, glazing and openings used (team assumption), method.

## Choices made (recommended options)
- Plates turned to true north as daylight (her wind direction and face pressures depend on it); preset for her frame.
- Operable faces default to all four (her default facade opens all four); the facade node has no operable field.
- Highest floor reported with the Toolkit level number.

## Tests run
| | |
|---|---|
| `tsc -b` | PASS |
| `vitest run` | 1,273 pass; only the 2 CRLF data-file checks fail, in worktrees only |
| `ventilationSW.test.ts` (her fixtures) | 8/8, tolerance 0 |
| `ventilationSWInput.test.ts` | 2/2 |
| `e2e/ventilation-sw.e2e.ts` (Edge, competition site, 67 floors) | 1/1: on in Schematic, runs in seconds, tiles, bars, carpet, flagged lines, no "Verified", single-sided adaptive rerun changes the readings |
| `e2e/daylight-sw.e2e.ts`, `e2e/wind-comfort.e2e.ts` reruns | 2/2 |
| Real Vancouver, her app side by side | NOT RUN |

Screenshots: `test-results/ventilation-sw.png`, `test-results/ventilation-sw-card.png` (worktree, not committed).

## Next
Engine 4: the monthly energy model (`energy.js`, ISO 13790 5R1C, TEUI / TEDI / GHGI) on `sun-wind-energy` from this branch.

---

# CHECKPOINT: Sun & Wind Studio merge, engine 2 of 4: daylight sDA / ASE (17 Nov 2026)

Same brief as engine 1 (below): Ruijie, 16 Nov, "start merging Sinnie's tool into the platform", in her order wind comfort →
**daylight** → ventilation → energy. Branch `sun-wind-daylight`, cut from `sun-wind-port` b40e26a, worktree `tower-studio-sw`.
Pushed for review, **not merged, not deployed**: her written OK (`04 Tool Plan/permissions/DRAFT_MESSAGES.md` §1c, status
line added for engine 2) is still pending. Ruijie was away overnight and approved the recommended option on every decision;
the decisions taken are listed under "Choices made".

## What was built
- **Her engine, in TypeScript** (`src/engine/daylightSW.ts`): physics.js (NOAA sun for every hour of the CWEC year, Perez
  1990 sky on each vertical face, Perez luminous efficacy, LM-83 occupied hours 8:00–18:00 clock time with her monthly
  clock offsets) and the daylight half of study.js: per 1 m mask cell, sixteen sight lines to the glass under the CIE
  overcast sky with the BRE externally reflected component (obstruction angle per cardinal face from the context
  buildings 15–160 m away) and the BRE split-flux internally reflected component → daylight factor; each face's Perez sky
  hour by hour → DA300, sDA300/50%, UDI 100–3000 lux, monthly daylight share; ASE1000/250h by 2° azimuth bins through the
  window band after her shading devices (all twelve strategies of her catalogue); her floor signature memo
  (`floorSig`, which groups floors whose obstruction rounds alike); her tower run at 2 m cells and every second day.
- **Her data**: `src/data/sunWindHourly.json` (110 KB), the hourly CWEC2020 year (temperature, GHI, DNI, DHI) and the
  monthly clock offsets exactly as her page holds them after climate.js applies weather.json (elevation falls back to
  her 4 m, as on her page). Loaded only by the worker and, lazily, by the eval cases.
- **Fixtures from her own code**: `tools/sunwind-daylight-fixtures.cjs` runs her climate.js (fetch stubbed), physics.js
  and the daylight functions of study.js + core.js headless at **c24addb** (her main on 16 and 17 Nov), on nine cases:
  plain tower, her site with future towers and her default facade zones, her site without future towers with WWR 0.35 /
  VT 0.45 and every shading strategy by level, a deep 72 × 56 m plate, a shallow 30 × 17.5 m plate at 500 lux, a plate
  turned 30° in context, turned 120° without, an L-shaped plate with the core off centre, and a winter ASE period; plus
  her physics (sun, Perez state, six faces). `src/engine/daylight.fixtures.json` (159 KB). **The port reproduces every
  number bit for bit (tolerance 0)**: tower sDA / ASE / DF / DA / UDI, every floor row and monthly share, obstruction
  angles, facade edges, sampled cell fields, ASE hours per cell, and her full-resolution run (`daylightSW.test.ts`, 13 tests, ~2 s).
- **The Toolkit's model into her frame** (`src/engine/daylightSWInput.ts`): the selected tower's floors (`towerFloors`;
  plant floors left out), each floor's plate (`floorRing`: the block at mid-height, or the imported hull) turned along
  its longest edge and rasterised into her 1 m mask, its core (`coreSide`) at the tower centre; context as in the wind
  port (competition derived context + future towers, or the City buildings with heights; other design towers as roofs),
  reduced by her `buildSiteRaster` to each building's centre and roof; glazing from the facade node when it is on
  (system → her strategy, WWR by facing, VLT), otherwise her default zones and VT 0.60.
- **Node `built.daylight-sw`** "Daylight sDA / ASE (Sun & Wind Studio)", CLIM, Schematic phase (`advanced`), both projects,
  off by default: worker (`src/workers/daylightWorker.ts`), hook + store (`src/hooks/useDaylightSW.ts`, `ts.daylightSW`),
  results card (`DaylightSWResults.tsx`: sDA / ASE / mean DF tiles, her per-floor sDA and ASE bars, a plan of any floor
  in her DA / DF / direct-sun ramps with core and north arrow, the evidence lines, presets with Reset), canvas status,
  trace digest group `daylightSW`, rule cards `leed.daylight.sunwind` and `en17037.df.sunwind` (both unverified), FIXES for
  every line (`sw-dl-*`), evidence lint, eval cases DL-T / DL-O, Sources hub, every list (registry, icons + a filled
  `SunMedium` drawing, art, words, needs, phases, roles, missing-input, assistant keywords and checks).
- **Evidence lines** (all unverified, each with its source): sDA with LEED points (pass ≥ 40%, as her app marks it), ASE ≤
  10% (warn above, her "address glare"), mean DF 2% / 1% (her "EN 17037" label, no edition), weakest floor, UDI, glazing
  used (team assumption), method. Without context the three judged lines stay "unknown" (as wind).

## How it relates to "Daylight screen (plate depth)"
Kept as it is. That node is the geometric first pass (plate depth against 2 × window head, no glass, sky or neighbours,
SPAC). This one is the climate-based check after it: same plates and cores, plus the glass, the neighbours and the
Vancouver sky hour by hour. The new node's limits, method line and Rules section say so.

## Choices made (recommended options, Ruijie away)
- Fixtures pinned to c24addb (her current main; unchanged since engine 1).
- **True north**: plates turned so +y is true north (45° on the competition site), because sun and sky depend on it; a
  preset reads the model grid as north to compare with her app (which reads a sent tower as is). Wind kept her frame.
- Plant (mechanical) floors left out of sDA / ASE; podium floors kept (occupied).
- "Facade node exists" = the facade node is on; then its glazing, else her defaults.
- No 3-D overlay: the "floor overlay" is the plan in the card (cheap, and each floor differs).

## Tests run
| | |
|---|---|
| `tsc -b` | PASS |
| `vitest run` | 1,261 pass; only the 2 CRLF data-file checks fail, in worktrees only (heightPolicy, registry) |
| `daylightSW.test.ts` (her fixtures) | 13/13, tolerance 0 |
| `daylightSWInput.test.ts` | 5/5 |
| `e2e/daylight-sw.e2e.ts` (Edge, competition site, 87 floors) | 1/1: on from the library in Schematic, runs in seconds, tiles + bars + plan + flagged lines, no "Verified", winter ASE rerun |
| `e2e/wind-comfort.e2e.ts` rerun | 1/1 |
| Regression e2e (phase-panel, journeys, node-icons) | 3/3 (Edge) |
| With the competition base model loaded, Real Vancouver, her app side by side | NOT RUN (e2e has no base model, so the judged lines read "unknown") |

Screenshot: `test-results/daylight-sw.png` and `test-results/daylight-sw-card.png` (worktree, not committed).

## Known limits
- Her OK pending; branch unmerged. Her model: four cardinal faces per floor, context as mean roofs within 160 m, no
  partitions, direct sun left to blinds for sDA. Proxies for early design, as her own leedCard note says.
- LEED v4.1 / EN 17037 / LM-83 read as her code states them; none of those documents was opened.
- One tower at a time (the selected one).

## Next
Engine 3, natural-ventilation potential (`planStudy` / `ventStudy` / `ventFlow` in study.js; needs the hourly wind, so
`sunWindHourly.json` gains ws / wd), on `sun-wind-ventilation` from this branch; then the ISO 13790 energy model.

---

# CHECKPOINT: Sun & Wind Studio merge, engine 1 of 4: pedestrian wind comfort (16 Nov 2026)

Ruijie, 16 Nov: "start merging Sinnie's tool into the platform." Order agreed in the mid-review notes (P1, comment 3):
wind comfort → daylight → ventilation → energy, each a Toolkit node checked against her app's numbers. Branch
`sun-wind-port` from main 50cadfa, worktree `tower-studio-sw`. Pushed for review, **not merged**: her written OK on reusing
`study.js` (`04 Tool Plan/permissions/DRAFT_MESSAGES.md` §1c, status note added there) is still pending; only the dtmass
generator reuse (6 Nov) is on file.

## What was built
- **Her engine, in TypeScript** (`src/engine/windComfort.ts`): the 2-D D2Q9 lattice-Boltzmann pedestrian flow on 4 m
  cells over her 680 × 440 m domain (tau 0.58, free-stream target 0.05, round(max(nx, ny) × 3.2) = 544 steps, periodic
  edges, bounce-back), ratios to the free wind beyond 24 m of any building, Lawson bands on the mean speed (2.5 / 4 / 6 /
  8 m/s), the downwash allowance 1 + 0.45 log2(H / h̄neighbours within 120 m) capped at 2.1 over 0.22 H upwind, podium
  (dilation + 0.8 min(1, h/30) relief), canopy (0.35 min(1, d/6)), rounded 0.78 / chamfered 0.85 corners within 14 m,
  plaza shelter 1 − 0.4 s, the annual blend of her eight sectors (frequency-weighted mean speed map, gusty cells where
  1.8 × mean > 6 m/s in > 5% of hours), `roseFor` / `periodInfo` over her monthly roses, `windProfile` (z/10)^0.25.
- **Her data**: `src/data/sunWindRose.json`, the monthly 8-sector rose she distilled from the CWEC2020 typical year
  (Vancouver Intl AP), credited to her and to climate.onebuilding.org.
- **Fixtures from her own code**: `tools/sunwind-fixtures.cjs` slices her functions out of `study.js` / `core.js` at
  commit c24addb (her main, 16 Nov), runs them headless on her `site.json` + `weather.json`, and records seven cases
  (five one-case runs including podium + canopy + rounded corners + plaza shelter, two annual: whole year and winter) into
  `src/engine/windComfort.fixtures.json`. **The port reproduces every band area exactly and the ratio fields to four
  decimals** (`windComfort.test.ts`, 9 tests, ~55 s).
- **The Toolkit's model into her frame** (`src/engine/windComfortInput.ts`): competition site = her site.json layers from
  our own derived context (buildings, heritage, plazas, mid-block links, the three future towers when shown); Real
  Vancouver = the City buildings whose outline touches the domain around the selected tower at roof − project ground,
  footprints without a height counted and left out (never guessed); the other design towers as roofs; the tower as its
  turned plan outline; the Toolkit podium → her uniform podium reach = the smaller overhang (team mapping); canopy,
  corners, plaza shelter and the future-towers switch as node presets.
- **Node `built.wind-comfort`** "Pedestrian wind comfort (Sun & Wind Studio)", CLIM, form phase, both projects, defaults
  off (a run takes seconds): worker (`src/workers/windWorker.ts`), hook + store (`src/hooks/useWindComfort.ts`,
  `ts.windComfort`), results card (`WindComfortResults.tsx`: Lawson bars with / without the tower, key lines, downwash
  sentence, sectors table, overlay switch, presets with Reset), ground overlay as the Analysis layer `wind-comfort`
  (`WindComfortOverlay.tsx`, her band colours, with / without / change) with its legend, canvas status, trace digest
  group `windComfort`, rule card `lawson.sunwind` (unverified: no Lawson edition cited in her code), FIXES for every
  warn/fail, evidence lint, two eval cases (WC-T, WC-O), Sources hub, lists (icons, art, words, needs, phases, roles,
  missing-input, assistant keywords).
- **Evidence lines**: calm ground ≥ 80% good / ≥ 60% fair (her thresholds), plaza peak ≤ 4 / ≤ 6 m/s, uncomfortable
  ground ≤ 1%, worse/better area, gusty share (annual), downwash allowance, strategies vs the bare tower, method. All
  flagged **unverified** (her 2-D flow is indicative, not CFD, as her own note says), sources named per line.

## Tests run
| | |
|---|---|
| `tsc -b` | PASS |
| `vitest run` | 1,240 pass; the 2 CRLF data-file checks fail in worktrees only (heightPolicy, registry); evidenceLint now has a 60 s budget for its flow solve |
| `windComfort.test.ts` (her fixtures) | 9/9 |
| `windComfortInput.test.ts` | 5/5 |
| `e2e/wind-comfort.e2e.ts` (Edge, competition site) | 1/1: switch the node on, one case solves, bands + lines + "Sun & Wind Studio" credit, no "Verified"; seasonal rose runs eight sectors with progress, Gusty ground + sectors table |
| Regression e2e (phase-panel, journeys, node-icons) | 3/3 (Edge) |
| Real Vancouver run, the deployed site, her app side by side in a browser | NOT RUN |

## Known limits
- Her OK pending: the branch is not merged and the Pages site is unchanged.
- North: her domain takes +y as north; on the competition site the Toolkit's true north is 45° from +y (open question
  3 to Sinnie, 6 Nov). The port follows her frame exactly so the fixtures match; a sector named "W" is her "W".
- Real Vancouver: no plaza layer yet (plaza lines unknown); heights relative to the project ground; no terrain.
- The competition context must be loaded for a judged result (on main the entrant adds the base model; the
  `competition-context-included` branch ships it); without it the calm-ground line is "unknown" and says so.
- One worker, one tower at a time (the selected tower); an annual run is 16–24 flow solves (about 20–40 s).

## Next
Daylight (sDA / ASE / UDI per floor, `study.js` + `physics.js`) the same way: fixture recorder on her code, TS port,
node. Then ventilation, then the ISO 13790 energy model. And the tool rail beside the viewport from Sinnie's artifact
(separate session, waiting for the repository trust button).

---

# CHECKPOINT: Result B step 1, the transfer centre's entry and registry (9 Nov 2026)

Brief: Block 3 (Import/Export Centre), `04 Tool Plan/workflow-builder/BLOCK3-import-export.md`. Same branch as Result A
(`designer-workflow-builder`), after Ruijie approved Result A and asked for Result B step 1. Not merged, not deployed.
- **What it is:** one Import and one Export button in the project bar (`TopBar.tsx`), both opening the same dialog on
  the matching tab (`components/porting/TransferDialog.tsx`, state in `lib/porting/transfer.ts`). The dialog starts with
  the person's purpose, enabled by a capability registry (`lib/porting/capabilities.ts`: each purpose names its reader
  or writer and whether a person has verified it; "Package my tool" is listed disabled because no writer exists; "Add a
  site boundary" is Real Vancouver only). Choosing a purpose shows what it needs and what it will do; only the footer's
  named action does it (Continue to the model import · Open project · Preview the changes · Export file · Save backup ·
  Export package · Export PROV). Esc and Cancel change nothing and give focus back to the opener.
- **Routes reused, nothing new:** the model import dialog (`ImportDialog.tsx`), `readProject` + `openText`, the phase
  package reader and its preview (`PhasePorting.tsx` `PackagePreview`, now exported, and `phasePackageOf`), the node
  builder's Import tab, `exportModel` (its scene build is now `exportScene`, so the dialog shows the solid and layer
  counts before writing), `currentText`, `traceToProv`, Sun & Wind Studio (`SunWindSend` inside Export › results).
  The old "Export model" menu is gone (`ExportMenu.tsx` keeps only the writers' entry point).
- **Step 2 (same day):** the phase panel's Import/Export drawers and the Project menu's Upload / Export .json / Import
  .json items are deleted; the menu keeps New, Open, Save as, autosave and one "Import or export a file…" that opens the
  centre. A file dropped anywhere opens the centre on Import with the purpose read from its contents
  (`lib/porting/sniff.ts`: models by extension; .json by its `format` field or GeoJSON shape; else the centre opens with
  no purpose). The site boundary is read and previewed in the centre (`lib/siteImport.ts`, shared with the Site panel)
  and set only on "Set as the study site"; a chosen tool package goes to the node builder's Import as its draft (checked
  there, never run). A package import closes the centre once the preview applies it. Tests updated: `phase-panel`,
  `journeys`, `rhino-import`, `workspace-gate`; `transfer-centre` adds the drop. All five pass in Edge; unit 1,225.
- **Not yet:** alignment is still the model import dialog's own screen; export scope (phases, objects) and
  representation presets are not offered because no converter supports them (that would be Result C).
- **Tests run:** `npx tsc -b` PASS · `npx vitest run` 1,224 pass (+1 registry test; the same 2 CRLF data-file checks fail
  in this worktree only) · `e2e/transfer-centre.e2e.ts` in Edge PASS (opens without download, Cancel/Esc clean with
  focus returned, glTF export is a real `massing-vtc-<date>.glb` after a counts preview, the tower list unchanged, works
  over the workflow builder) · `e2e/sun-wind-link.e2e.ts` FAIL on this branch and the same way on main (the receiver
  page in `../sun-wind-studio` never reports "Imported"; an environment problem, not this change; its entry point is
  updated to Export › Export results). Reopening the exported .glb in an independent reader: NOT RUN.
- **Evidence:** `04 Tool Plan/workflow-builder/after/after-<size>-transfer-import.png` and `-transfer-export-geometry.png`.
- **Next small increment (step 3):** the model import's alignment step inside the centre (units, up axis, north, origin,
  placement, layer roles as one screen) and "Frame imported content" after it.

---

# CHECKPOINT: Result A, the designer-friendly workflow builder (9 Nov 2026)

Brief: Ruijie's "START HERE: Tower Design Toolkit UI Implementation" + Block 2 (Workflow Builder Specification); Block 3
(Import/Export Centre) is Result B and waits for the review of this. Copies and the working notes: `04 Tool Plan/workflow-builder/`
(BLOCK2-workflow-builder.md, BLOCK3-import-export.md, DECISIONS-result-a.md, architecture-map-2026-11-09.md).
- **Branch:** `designer-workflow-builder`, from `origin/main` 880643d (the reviewed reference commit; main had not moved).
  Worktree `tower-studio-ui`. Not merged, not deployed, not pushed (the brief asks for permission first).
- **Commits:** 488367a (the builder), dce84c1 (the library fix and this write-up).
- **Evidence (local only):** `04 Tool Plan/workflow-builder/before|after/`: before = main's workspace, centre editor and
  Customize data graph at 1440 × 900 and 1280 × 800; after = the workspace, the builder, a selected card and a pending
  insertion at both sizes, plus the library after an Add.

## What it is
The project workflow as a readable sequence of illustrated tool cards, over the whole workspace (`components/builder/*`).
- **One workflow, no third store.** The builder reads and edits `lib/workflow/projectWorkflow.ts` (`useProjectWorkflow`)
  only, through its `commit` (Undo/Redo, save, `syncChecks`). New in the store: mode `'builder'`, `openBuilder` /
  `closeBuilder('apply' | 'discard')` (the same working-state record as the centre editor), `rename`, `replaceWith`
  (Start from preset, one undo step), and `addNode(b, id, 'start')` now means "first". The landing cover, the centre
  editor and the phase panel show the same applied process.
- **View model, pure and tested:** `lib/workflow/builderModel.ts`: library entries (available / my tools incl. missing
  references / research-only), the sequence (main cards in Start's order, branch cards under their column, return paths,
  unconnected cards; every wire shown once), state words kept apart (Design step · Ready · Needs model · Waiting for
  input · Paused · Missing tool · Competition project only), design summaries ("1 tower", "4 program bands"), previews of
  an add / move / remove ("connects …, removes …"), and plain Uses / You enter / Produces from `data/nodeNeeds.ts`.
- **Result summaries** (`hooks/useNodeSummaries.ts`): only from the decision trace's live digest, only for the design on
  screen (hash-matched), only for checks that are on: "2 pass · 1 check". Nothing is invented.
- **Layout:** header (name, project, Start from preset, one dismissible line, Undo/Redo, Apply/Discard or Continue
  designing, Advanced: data graph) · library 256 px · cards 208 px wide · inspector 280 px (collapsible). Under 1180 px
  the library and inspector become drawers. The row of cards scrolls on its own; the app never scrolls sideways.
- **Entry points:** project bar "Edit workflow"; More › "Workflow builder"; route `#/workflow`; the landing page's "Open
  the workflow builder". The legacy data graph stays at `#/customize` (More › "Advanced: data graph" and the header
  link); it is not translated into the process view and nothing of it is discarded.
- **Interactions (Block 2 §7):** click selects (nothing else); Add from the library (click, Enter, or drag onto a slot)
  shows the insertion as a card with its position changeable before Yes; a tool already present is shown, never added
  twice; move by handle drag, by Move before / after, or Alt+←/→ with a preview of the connections that change; Remove
  keeps results and the model and says Undo is there; Return to… lists the earlier steps and draws a dashed arc and a
  chip; Open tool closes the builder keeping its changes and opens that tool in its phase.

## Acceptance checks (Block 2 §12), `e2e/workflow-builder.e2e.ts` in Edge
1 open an existing workflow · 2 add Sun & shadow · 3 reorder by dragging the handle to a slot · 4 reorder by the menu and
Alt+→ · 5 return path to Massing · 6 Undo / Redo · 7 Apply (the phase panel shows the tool and the return) · 8 Open tool
(the phase panel's active tool) · 9 a real design change (tower height +12 m in the Massing tool) · 10 back to the builder,
rename · 11 reload: process, return path and name kept · 12 a second session, Remove, Discard brings the card back ·
13 no tower: Program & FSR says "Needs model" (no zero) · 14 a saved workflow with `community.ghost` keeps it as a
"Missing tool" card and a library reference. Also: no model mutation (a snapshot of the towers is equal before and after
every builder session), no keyboard trap (Tab ×30 stays inside; Esc closes popovers, not the builder), 1280 × 800: the
primary actions are in the viewport and nothing scrolls sideways.

## Tests actually run
| | Result |
|---|---|
| `npx tsc -b` | PASS |
| `npx vitest run` (whole suite) | PASS: 1,223 tests, 2 fail that are byte-size checks of data files with CRLF checkout in this worktree (not this change; they pass in the main checkout) |
| New unit tests: builderModel (59), WorkflowSequence helpers (9), ToolLibrary helpers (3), useNodeSummaries (3) | PASS |
| `e2e/workflow-builder.e2e.ts` (5 tests, Edge, `playwright.edge.config.ts` on port 5399) | PASS (5 / 5) |
| Existing e2e suite | NOT RUN (the `site-step` test is already stale on main; nothing else touches the builder) |
| Independent code review pass | NOT RUN (started, stopped for the usage limit) |

## Known limitations
- A tool appears once in a workflow (the data model has no instances), so Add on a present tool shows its card.
- Branch groups and the "Not connected" group are drawn from the model and unit-tested, but no saved workflow in the
  presets has a branch, so they are not in the screenshots.
- The workflow is still saved in `localStorage` (`ts.coverWorkflow` + `ts.workflowRun`), not in the project file; that
  is the existing design, left as is (Block 2 §8 asks only for one canonical record).
- Choosing a preset for the other project replaces the workflow but does not switch the project (each option says its project).
- The "Advanced: data graph" link closes the builder keeping its changes, then opens `#/customize`.
- `aria-current` marks the selected card (an `article` cannot carry `aria-selected`).

## Recommended next small task
Result B's first step: the capability registry (which readers/writers exist and are verified) and the one Import /
Export entry in the project bar, before any dialog, so the duplicate phase-panel Import/Export can be routed through it.

---

# CHECKPOINT: workspace interface correction (overnight brief, 8 Nov 2026)

Brief: `Tower_Design_Workspace_Audit_and_Overnight_Brief.docx` (project folder), plus Ruijie's pasted task.
Branch: `workspace-ui-correction`, from `main` 757b9b3. Merged into `main` (fast-forward to 06673ed) and deployed to GitHub Pages on 8 Nov 2026 at Ruijie's request.
Budget: 8 h maximum, started about 01:20 local (8 Nov).
Evidence folder (local only, never committed: the competition context is Buildner's):
`04 Tool Plan/workspace-correction/before|after/`.

## Stage 0: baseline (done)

- **Commit:** 757b9b3 on main. The tree was clean before branching.
- **Route:** `#/start` → Enter (default preset) → `#/guided`.
- **Project state:** the Competition site on a fresh browser profile. The entry workflow is design.site, vtc-rules, design.massing, sun, wind-screen, design.program, fsr, the four public-realm checks, sky-room, design.frame, culture-claims and provenance.
- **Viewports:** 1440 × 900 and 1280 × 800 (headless Edge, dev server on port 5293).
- **Screenshots:** in `before/`: landing, entry, Form (Sun & shadow), Program/Value and Overview, at both sizes. The measurements are in `before/before-report.json`.

### Measured

| Measure | 1440 × 900 | 1280 × 800 |
|---|---|---|
| Top bar / phase row height | 56 / 44 px | 56 / 44 px |
| Left / right panel width | 352 / 352 px | 352 / 352 px |
| Model region, share of the viewport (w × h) | 0.49 × 0.75 | 0.43 × 0.72 |
| Model region with the expanded workflow open | 0.49 × 0.48 | 0.43 × 0.41 |
| Permanent bottom workflow strip | yes, 58 px | yes |
| Overview open on entry | no | no |
| Horizontal scroll | none | none |

- **Fonts:** `document.fonts.check('14px "Inter Variable"')` is true; one Inter Variable face is `loaded`, and the other subsets are unloaded because their characters are not used.
- **Type:**
  - Phase tabs 14/20, phase heading 18/26 and landing title 42/48 are correct.
  - Import, Export, Edit, Customize, Options, the project tabs, the display-mode radios, the results tabs and the results select are all **12/16**.
  - Tool row names are **14/17.5** (wrong line height).
  - 34 visible controls are under 14 px.
- **Value result:** reads "**Doesn't work**" (`engine/economics.ts`).

### Ranked defects (from the audit and the baseline)

1. The permanent bottom whole-workflow strip duplicates navigation. DESIGN_SYSTEM.md §5.1 prescribes it. (UI01)
2. The left panel scrolls as one region: with a long workflow, the active tool's controls are pushed out, and the Program/Value screen shows the workflow scrolled away. (UI04)
3. Both side panels are 352 px, so the model gets only 49% of the width at 1440 and 43% at 1280. (UI02)
4. Primary controls compute to 12/16 instead of 14/20. (UI03)
5. "Program" names both a phase and a display mode, and the display-mode control has no "View" label. (UI05/UI06)
6. Selecting a tool does not set the viewport's working view, and retained overlays are not marked as pinned context. The analysis legend's buttons both start a calculation and show a layer. (UI05)
7. "Analysis On" really means "checks run live", but its name doesn't say so. (UI05/UI08)
8. The Value verdict "Doesn't work" reads as an unconditional verdict. (UI08)
9. The status bar shows the full evidence key all the time. (audit)
10. Phase-row counts (checks on) and workflow counts (tools) measure different things. (audit)
11. The workspace shell is a cool grey, not the landing's warm ivory. Real Vancouver's controls use their own green and cream palette. (UI06)
12. Earlier browser suite on 757b9b3 (still running at baseline): cover ×4, node-icons and screens failed. phase-panel failed only because its updated test met an older server. To recheck after the interface change.

## Stage 1: interface change (done, 01:45; about 0:25 into the budget)

### Changes

- **Layout contract:** DESIGN_SYSTEM.md §5.1 rewritten. The permanent bottom strip is gone; Overview is on demand; there is a space budget, tool context, View/calculation separation and result wording.
- **App:** a warm shell (`.workspace-shell`, #fbf8f3 with faint peach and lavender at the edges) and 8 px gaps. The panels are adjustable: `--left-w` / `--right-w` are 288/304 px at ≥1400 px and 256/280 px below, and `PanelResizer` supports drag, arrow keys, Home/End and Enter/double-click to reset. Overview is mounted over the workspace.
- **Project bar (`TopBar`):**
  - 52 px tall, with 14 px controls.
  - **Auto-run checks** replaces Analysis On/Off and keeps the same `analysis` store flag.
  - An **Assistant** entry opens Overview in Edit with the assistant input.
  - The **More** menu holds the check library, role, units, reduce motion, Customize, Options, How it works, the tour, Build status and Sources.
- **Phase row (`ProcessRail`):** the five phases once each (arrow keys move between them), plus Overview. There are no counts, no "Next", and no Library or Analysis controls here any more.
- **Overview (`WorkflowOverview`):**
  - On demand; it shows the five phase lanes (with the labels in a fixed column), the drag, tray and confirmation, select then **Open in workspace**, Edit, and **Return to design**.
  - Closing restores the step, each phase's open tool and the selected results (`openOverview` in `projectWorkflow.ts`).
  - The camera never moves, because the model isn't resized.
- **Phase panel:**
  - The header has the name and Hide, then Import / Export on their own line.
  - The workflow sits in a bounded region (216 px, 55vh in Edit) with one-line rows, no counts, 14/20 node names and 24 px link targets.
  - The controls are in their own scroll area. Band rows are two lines with 24 px actions.
- **View:** Geometry / Building use / Analysis / Materials (ids kept), labelled "View", 14 px, with **Pin view**.
  - The Analysis radios only choose what is drawn; "not computed" comes with its own action, and another quantity is never drawn in its place (`activeLayer`).
  - The categorical keys fold by default; analysis scales stay visible.
- **Tool context:** `lib/workflow/toolView.ts` sets the working view when a tool opens, unless the view is pinned. `components/ContextPins.tsx` shows "Working view: <tool>" plus "Pinned context: <layer> ×".
- **Value wording:** `verdictText` / `VERDICT_LABEL`. The result card shows the number, land price, outcome, Unverified, Preliminary estimate, and "Computed for the current model (revision …)". The calculation is unchanged.
- **Status line:** the attribution stays visible; the full evidence key is behind an **Evidence key** button.
- **Real Vancouver:** `CHROME` uses the shared tokens; the green hovers, cream fields and 2 px corners are replaced.
- **Type:** primary controls, fields (scoped CSS for the controls and results), help text (16/24), tool-group titles, the results tabs ("Results") and the project file / Export buttons follow their roles.
- **Tests updated:** helpers (the library is now in More), the view names, the Results tab name, and layout/landing/site-step/cover/app.offline (phase panel).

### Checks actually run

- `npx tsc -p . --noEmit`: clean.
- `npx vitest run`: 146 files, 1142 tests pass.
- Headless captures (dev server on port 5293), `after/after3-*`: no page errors at 1440 × 900 or 1280 × 800.

| Measure | 1440 × 900 | 1280 × 800 |
|---|---|---|
| Model share (w × h) | 0.565 × 0.816 | 0.555 × 0.792 |
| Horizontal scroll | none | none |
| Overview open on entry | no | no |
| Bottom strip | none | none |

- **Type (1440):**
  - Phase tabs, Import, Edit, tool names, the project tabs, the View radios, the results tabs and the results select are all 14/20.
  - The phase heading is 18/26. Inter Variable is loaded.
  - Controls under 14 px went from 34 to 13. The ones left are the "?" glyph buttons, the 12 px cross-phase link chips (metadata), the north button and the Evidence key; the file and field controls have been fixed since.
- **Real Vancouver:** "Working view: Program value & land residual" and "Pinned context: View cones ×" both show. With no land price, the Value outcome reads "Estimated residual is negative (no land price entered)".

## Stages 2–4: interface gate, functional journeys, persistence and package (done, about 02:00; about 0:40 into the budget)

### Changes since stage 1

- **Phase switch:** the phase's open tool also drives the results panel, so the panel and the results never show two different tools. This was found by the gate.
- **Working view on reload:** it changes only when the tool changes, not on reload, so a reload keeps the View the user chose. `vtc-looks` caught the regression.
- **Freshness line (`components/ResultFreshness.tsx`):** "Evaluated for the current model (revision …)"; for sun hours, "Evaluating…" or "Out of date"; "Not evaluated" for paused, off or no model; and "Evaluation failed". The solar worker records `runRev` and `outRev`.
- **Design undo:** workflow-driven check switches are no longer design-undo steps (`withoutHistory` + `breakStep`). Found by F05: one design Undo after adding Value switched it off.
- **Phase-package preview:** uninstalled `community.*` tools are "not in this app: skipped" (before, an id alone counted as a tool). It also names links to tools missing from the project, and imported model files missing from this browser. Found by F04.
- **Cover:** a preset with its design steps no longer shows "(edited)" (pre-existing bug).
- **Assistant:** its clarifying chip offers per-phase loops, not "Loop the whole workflow" (the brief rules out a global loop).
- **Contrast:** Present's project tabs and view icons; the map gesture hints are hidden with `visibility` as well as opacity and no longer fade in; their `kbd` has no extra fade.
- **Missing inputs:** "Add your copy of the base model…" stays visible with the key folded.
- **Markup:** the open tool's wrapper is a `div role="region"`, so it doesn't nest a `<section>` inside its own sections.
- **Tests updated:** phase-panel (on-demand Overview, restore, Open in workspace), workspace-gate (new), journeys (new), cover ×4, landing, node-icons (custom tool reaches the workflow row; icon style is any version), vtc-looks (key on request), layout and a11y paths, `engine/useOnlyEdit.test.ts` (new).

### Checks actually run (current code unless noted)

| Check | Result | Evidence |
|---|---|---|
| `npx tsc -p . --noEmit` | PASS | Clean after every stage. |
| `npx vitest run` | PASS | Final code: 147 files, 1151 tests (including the new `engine/useOnlyEdit.test.ts`). |
| `npm run build` | PASS | Exit 0; the >500 kB chunk warning was already there. |
| `npm run test:offline` (production build) | NOT RUN | — |
| Final e2e run, 19 files on a fresh port-5199 server (`lead_e2e_final.txt`) | 40 passed, 2 failed | The failures were a11y "Guided: Schematic" (gesture-hint contrast while fading) and vista-site (nested-section locator). Both fixed; the rerun is recorded below. |
| `e2e/workspace-gate.e2e.ts` (UI01–UI08, 1440 and 1280) | PASS | Final run. |
| `e2e/journeys.e2e.ts` (F01–F05) | PASS | Final run. |
| phase-panel, layout, cover ×4, landing, designTools, node-icons, vtc-looks ×2, massing-edit, generate, heights, site-towers, place-model, align-lot, rhino-import, demo-open | PASS | Final run. |
| site-step, eval, screens, vista-tabs, city-streets, rhino-link, sun-wind-link, hide-under, view-fallbacks, app.offline | NOT RUN | Long Real Vancouver runs; not in the final set. |
| Rerun after the last two fixes: `a11y.e2e.ts` (all 16 screens) + `vista-site.e2e.ts` (2) | PASS | 18 passed (`lead_e2e_fix2.txt`): the Schematic contrast and the vista-site locator are fixed. |

### Interface gate

| Item | Result | Evidence |
|---|---|---|
| UI01 One phase row; Overview closed on entry and opened only on request; no bottom rail | PASS | workspace-gate; layout. |
| UI02 No overlap, clipping or horizontal scroll at 1440 and 1280; model prominent; Overview restores the working state | PASS | workspace-gate (clipping and overlap scan of the bars and the panel header; model 0.565 × 0.816 and 0.555 × 0.792); restore checked in workspace-gate and phase-panel. |
| UI03 Inter loads; controls and node names 14/20, sections 18/26, explanations 16/24 | PASS for controls, names and sections | Computed in workspace-gate. Help text is 16/24 by class but its computed size wasn't asserted. Canvas and SVG label sizes in the 3D view are textures, not screen type: NOT measured. |
| UI04 A long local workflow doesn't push the inputs out of reach | PASS | workspace-gate: 7+ tools, region ≤ 230 px, controls ≥ 180 px, first input on screen, no page scroll with 4 tools. |
| UI05 Value, Solar and Wind coordinate controls, results and the View; pinned context named | PASS | workspace-gate (Wind → Analysis + Wind risk; Solar → Sun hours; Value → Building use + Value results; pinned Wind named and hidden). Real Vancouver: "Pinned context: View cones" seen in `after3-city-program-value`. |
| UI06 Warm shell, phase accents, controls consistent with the landing; no green map-control theme; legends keep units | PASS | Shell `rgb(251, 248, 243)` asserted; `CHROME` uses the shared tokens; analysis scales stay visible. Judged by screenshot, not automated colour audit. |
| UI07 Keyboard, names, targets, disclosure; no hover-only essentials; non-drag reordering | PASS | workspace-gate (arrow keys on the phase row and on the reorder handle, Esc closes Overview, resizer keys, no target under 24 px in the bars and phase panel). a11y: see the rerun below. |
| UI08 Preliminary output is not an unconditional verdict | PASS | workspace-gate and journeys: outcome, Preliminary estimate, Unverified and revision shown; "Doesn't work" absent. |

### Functional gate

| Item | Result | Evidence (`e2e/journeys.e2e.ts`) |
|---|---|---|
| F01 | PASS | A height change (−30 m) moves the model and the results digest; selecting tools and reordering then Undo leave the digest identical; design Undo restores both. |
| F02 | PASS | Revision on Sun & shadow and Wind; Solar shows "Evaluating…" or "out of date" and never claims the old revision as current; paused checks say "not evaluated". |
| F03 | PASS | Reorder + Undo by keyboard; return path Wind → Massing; 4 samples over 3.2 s: identical digest and the solar worker not running; Program and back keep the rows, the open tool (Sun), the height and the camera position. |
| F04 | PASS | Reload keeps the workflow, the return path and the height. Export, then edited package (an uninstalled tool and a link to Value) → preview names both; Replace keeps the Form rows; Program's rows and FSR tier unchanged. |
| F05 | PASS | Office → residential: the FSR line is identical, the Value number changes, and one Undo restores the bands and the value. |

### Before / after evidence (local only: `04 Tool Plan/workspace-correction/`)

- Same script (`lead_evidence.mjs`), landing preset, competition site, placed tower, at 1440 × 900 and 1280 × 800:
  - `before-*` from 757b9b3 (temporary worktree on port 5294);
  - `after-*` from this branch;
  - views: `form-study` (Wind screen open), `program-value`, `overview-loop` (return path Wind → Massing).
- Also: `before-*`, `after2-*` and `after3-*` (entry, Form, Program/Value, Overview), and Real Vancouver `after3-city-*`.

### Remaining defects and limits

- At full scale, Overview scrolls sideways on long workflows (it opens centred on the open tool), so a return path can be partly off screen until you press Fit or scroll.
- The View bar with the key open still covers part of the model at 1280 (the key is folded by default).
- Deep design undo, past the point where a tool was added, can leave that tool in the workflow with its check off; the freshness line then says "this check is off".
- Help text is 16/24 by class; its computed size was not asserted. 3D labels are textures: not measured.
- Not tested tonight: Site, Schematic and Present journeys (see BUILD_STATUS.md).
- Merged into main (fast-forward, 06673ed) and deployed on 8 Nov at Ruijie's request; the Pages run succeeded and the live site serves this version.

## Next exact action

Merged and live. The next action is the Site journey test (BUILD_STATUS.md, Site): it is the first phase without a tested handoff, and it feeds Form.
