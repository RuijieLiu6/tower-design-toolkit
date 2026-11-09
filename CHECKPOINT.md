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
