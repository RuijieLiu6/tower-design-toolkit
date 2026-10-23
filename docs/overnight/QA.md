# Integration QA for the mid review (backlog item 24, 22 Oct 02:30–02:45)

Landing-page session. Checked in the built-in browser on the shared dev server (localhost:5173) after a full reload, with a console-error recorder in the page. Tests: 44 files, 392 passing; tsc clean; build OK.

## Checked

| Area | What | Result |
|---|---|---|
| Landing | Both choices, "skip next time", Build status link, **Take the tour**, **Open the demo project** | ✅ no console errors |
| Guided · Competition site | "Everything built" preset, then Massing, Schematic, Present; every built node selected (its Inspector rendered): 14 Massing rows, 9 Schematic rows | ✅ no console errors |
| Guided · Real Vancouver | Same pass on the city project | ✅ no console errors |
| Customize | New → "Everything built": 26 nodes, 21 built cards | ✅ no errors · ⚠ 8 cards have no live line (below) |
| Customize · Community | Browse → detail → install → runs (item 17) | ✅ |
| Tour | 8 steps: landing → Massing → evidence → Schematic → Present → Real Vancouver → Customize → Build status; right route, project and stage, ring on the target, Esc / ← / → keys | ✅ (after a full reload: see dev quirk 1) |
| Build status (`#/status`) | Totals, milestones, dates, category × stage table, per-category lists | ✅ |
| Demo project | Opens through the project reader as one undo step; 2 towers, public sky room, all built nodes on | ✅ |

Not checked tonight: board export and drawings in Present (item 22 in progress), rooftop views (item 21 in progress), code and life safety (item 23 in progress), widths below 1024 px, a full screen-reader pass (the a11y work has its own folder).

## Fixed

1. **three.js in the main bundle (mine):** `SolarResults.tsx` imported its colour ramps from `SolarOverlay.tsx`, which pulls three, drei and R3F. Ramps moved to `components/solarRamps.ts`.
2. **Ajv validator in the main bundle:** `TraceExport.tsx` imported only `APP_LABEL` from `lib/project/projectFile.ts`. `APP_LABEL` now lives in `lib/project/appLabel.ts`; `projectFile.ts` re-exports it.
3. **Unused data in the bundle:** the research registry carried `viz` (53 kB) that nothing displays. Dropped from `src/data/research_registry.json` and from `tools/build_registry.py` (it stays in the research packets).
4. **Chunk groups** in `vite.config.ts`: three, R3F/drei, research registry, React, xyflow and icons each get their own chunk.
5. **Guided app loads on demand** (`Root.tsx`: `lazy(() => import('./App'))`), like Customize, Status and the tour card. The landing page no longer downloads the guided app.
6. **Lost edit restored** (02:23): the import session's live lines in `Customize.tsx` (economics, parking, facade, claims guard, provenance).
7. **Demo test made robust:** the shipped demo file must still open and keep its towers; a new design field elsewhere no longer breaks the test (regenerate with `UPDATE_DEMO=1`).
8. **Lost design changes between pages (item 26):** the autosave was restored only when the guided app's Project menu mounted. Opening Customize or Options first, then the guided app, replaced the change just made there ("Run in guided app", "Open in the guided app") with the old autosave; and a change made less than 0.8 s before leaving a page was never saved. Customize and Options now restore and autosave too, wait for the restore before changing the design (`session.ts`: `whenRestored`), and a pending autosave is written when a page closes.
9. **The first screen still loaded three.js (item 30; my mistake in item 24):** the `index` chunk was 26 kB, but it imported the `r3f` chunk, which had captured zustand and React's JSX runtime (both are R3F dependencies), and `r3f` imports `three`. So the landing page preloaded three.js (822 kB) and R3F (208 kB) after all. `vite.config.ts` now gives zustand its own group and puts the React group above the 3D groups; `dist/index.html` no longer preloads `three` or `r3f` (checked 03:20). The "first screen" row below was wrong until then.
10. **Offline copy missed every script (item 30, found by the offline check):** Vite (dev and preview) sends `Vary: Origin`; module scripts are requested with an Origin header and the precache was not, so `caches.match` skipped them and the page stayed blank offline. The worker's lookups now ignore Vary; `sw.test.ts` covers it and `npm run test:offline` checks the real thing.

## Bundle sizes (minified; gzip in brackets)

| Chunk | Before (02:26) | After (02:38) | Loads when |
|---|---|---|---|
| index (entry) | 1,775.8 kB (505.7) | 25.8 kB | first screen |
| App (guided stages) | in index | 416.0 kB (124.6) | opening the guided process |
| store / research | store 642.3 kB (211.0), incl. the research registry | research 492.5 kB (155.9) + store 109.2 kB (40.4) | first screen (the landing counts nodes) |
| three.js core | in index | 785.4 kB (200.5) | the 3D view |
| R3F + drei | in index | 222.2 kB (69.4) | the 3D view |
| Viewport | 107.1 kB → | inside App / 3D chunks | the 3D view |
| web-ifc-api | 3,539.5 kB (391.6) | unchanged | importing an IFC file only |

**Still over 500 kB, and why:** `three` (785 kB) is the three.js library itself, one module that cannot be split further; it loads with the 3D view, not the landing page. `web-ifc-api` (3.5 MB) is the IFC reader, loaded only when someone imports an IFC file. The `.wasm` files (rhino3dm 2.7 MB, web-ifc 1.6 MB) are binary assets fetched only by those importers.

## Open issues for their owners

| # | Issue | Where | Suggested fix |
|---|---|---|---|
| 1 | "Everything built" (and the other presets) switch **off** installed My nodes, because `setEnabled` replaces the map | NodeLibrary presets / `store.setEnabled` | keep `community.*` ids when applying a preset |
| 2 | 8 built nodes show "Built: open it in the guided app" on the Customize canvas: Streetwall & tower form, Active frontage, Open space & links, City in Nature ledger, Wind procedure, Structure, Pedestrian wind trigger, Energy & carbon | `lib/extraLive.ts` (import session's adapter) or `lib/workflowLive.ts` | one case per node, like economics |
| 3 | `lib/layer0Summary.ts` SUN_VARS notes still say "approximate formula (±0.5°), unverified"; `engine/sun.ts` now uses the NOAA equations | node-builder's file | update the two notes |
| 4 | Status page shows Presentation 0 built: boards, captures and drawings are stage features, not registry nodes (stated on the page) | registry | optional: register them as nodes |
| 5 | 9 built nodes are not in the decision trace digest, so the Options page shows "not in the decision trace yet" and they don't count toward the jury-criterion chart: Sun & shadow, Program value, Engagement & claims guard, AI use & provenance, Parking, Facade, Interior, Solar access, Energy & carbon | `lib/trace/digest.ts` + `TraceRecorder` (`components/TracePanel.tsx`) | add each node's rules to the digest; then map its group in `lib/options.ts` `GROUP_NODE` |

## Dev-only quirks (not in the built app)

1. Long-lived dev pages: hot updates of shared modules can create a second copy of a store, so state looks reset or two parts of the page disagree (seen once with the tour). Reload the page before judging a state bug.
2. Editing `vite.config.ts` restarts every dev server in the folder and serves "504 Outdated Optimize Dep" until each page reloads.
3. `src/lib/terrainMesh.test.ts` ("has no cracks", R2 mesh) took 7.7 s and failed once in a full run while several sessions were building; it passes alone in 3.2 s. Likely the 5 s default test timeout under load: its owner may want a longer timeout for that case.
4. Clocks: on this machine Node and the in-app browser report Pacific Standard Time (UTC−8, no daylight time) while the shell shows PDT (UTC−7), one hour later. On 22 Oct Vancouver is on PDT, so the shell time is right; times shown in the in-app browser (e.g. an option's "saved at") read an hour early there.

## Late walkthrough (item 41, 03:48–03:52 PDT, dev server, 1440 × 900, both projects)

Checked with a page error collector (window errors, rejected promises, console.error): **no errors** on any step.

| Item | What was checked | Result |
|---|---|---|
| 30 Offline app | start page links (User guide, Install app), #/guide, offline e2e (see gates) | OK |
| 31 Sandboxed code nodes | Community drawer in Customize | **Fixed (mine, item 17 text):** the drawer and registry still called the code sandbox "roadmap"; now: code nodes run in the sandbox once allowed, this sample has no bundle yet (`public/registry/index.json`, `lib/registry.ts`, `CommunityDrawer.tsx`) |
| 32 Export model | top-bar menu: .3dm, OBJ + MTL, glTF, IFC (roadmap); "nothing is uploaded" | OK (menu only; no file written) |
| 33 Lift strategy comparator | Schematic > Core & lift check: single-deck vs sky lobby vs double-deck vs destination control, unresolved rows flagged | OK |
| 35 Pedestrian wind screen | node panel on both projects: screening caveat, analog-city study trigger with sources, wind rose, risk table by direction | OK |
| 36 Daylight screen | Schematic: VTC office / homes / hotel cards, Real Vancouver office card; Present board plan carries the bands | OK |
| 37 Relaxations & aviation | VTC: hypothetical-site note + aviation checklist (CAR 601.23 cited); Real Vancouver: HBP / EDS routes, masks on the map | OK (masks switched back off) |
| Pages | #/status, #/sources, #/options, #/guide | load, no errors |

Notes: at about 1024 px wide the top bar still clips its right-hand buttons (Customize, Options, help); fine at 1440 (item 34 fixed 1440–1600). A hot update from another session's edit reloaded the page once mid-walkthrough (dev only).

## Final gates (item 41, after items 38–40 landed; 04:05 PDT)

| Gate | Result |
|---|---|
| `tsc -p .` | clean (03:59) |
| `npm test` (vitest) | **533 of 533** in 59 files |
| `npm run build` | OK; `dist/index.html` preloads no three.js or R3F chunk |
| `npm run eval` | **21 of 21 cases pass** (engine 22 of 22, UI 11 of 11; run 04:00). The run before it (03:59) failed case C3: Playwright's freshly started dev server optimized new dependencies (items 38–40 had just added imports) and reloaded the page after the test switched to Real Vancouver. The rerun on a warm server passed. The 03:52 trial lost C7 the same way while item 39 was mid-edit, and `run_eval.mjs` still printed "21 of 21" then: a UI test that dies before recording counts as no UI result, not a fail (owner of item 28: consider counting it as a fail) |
| `npm run test:a11y` (axe, WCAG 2.1 A/AA) | **13 of 13 screens, 0 serious or critical** (04:05) |
| `npm run test:offline` | passes: opens offline after the first visit, nothing private cached |

Not covered by the axe scan: `#/options`, `#/guide`, `#/sources` (pages added tonight; `e2e/a11y.e2e.ts` lists its screens). Follow-up for its owner.
