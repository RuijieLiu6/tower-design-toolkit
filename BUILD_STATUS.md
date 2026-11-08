# Build status by phase (8 Nov 2026, branch `workspace-ui-correction`)

Each phase is described on four separate measures. A screen opening is not the same as a working function, and a working function is not a validated method.

- **Interface:** the phase's panel, tools and views pass the interface gate (`e2e/workspace-gate.e2e.ts`, 1440 × 900 and 1280 × 800).
- **Usable functions:** what a user can do in the phase today.
- **Method validation:** whether a calculation has been checked against its sources or evaluation cases. Nothing was re-validated tonight; earlier status is quoted with its date.
- **Tested handoffs:** journeys run end to end in a browser tonight, with what they actually covered.

"NOT RUN tonight" means the check exists but was not executed in this session, so no result is claimed.

## Site

| Measure | Status |
|---|---|
| Interface | Shared panel, phase row and Overview pass the gate. No Site-specific interface check was run tonight. |
| Usable functions | Competition block or Real Vancouver; address search (with the privacy note) and city parcels, plus a drawn boundary (Real Vancouver); model import (.3dm, OBJ, glTF, IFC) with units, placement, north and datum confirmed by the user; VTC hard rules; view-cone height check; height-limit surface; Vista view studies; view from here. |
| Unfinished | A Site journey test (site choice → import → units and orientation → into Form). |
| Validation limits | Only 8 of 24 view cones have a City height estimate; the rest are "no estimate". LiDAR roof heights cover 1 of 4 downtown tiles. The vertical datum is CGVD28, assumed. The 27 evaluation cases (`npm run eval`) were last run 22 Oct and are **NOT RUN tonight**. |
| Import / export | Phase package (site, ground mode, ground elevation, transit link); project file; model import; site GeoJSON (Vista panel). |
| Next deliverable | Rerun `site-step` and `vista-site`, and write a Site journey test that ends in Form with the site and the model kept. |

## Form

| Measure | Status |
|---|---|
| Interface | **PASS** (gate): tool context (Wind and Solar open their analysis layer, Sun & shadow and Massing open Geometry), pinned context, bounded workflow. |
| Usable functions | Massing: height, rotation, floor-to-floor, blocks, Face / Mass editing on the model, tower position, height suggestion, Generate. Sun & shadow preview; solar access and sun hours (in a worker, with a freshness line); wind screen; wind-study trigger; City in Nature ledger. |
| Tested handoffs | **`e2e/phase-panel.e2e.ts`:** Massing → Sun & shadow → Wind screen ↻ Massing; edit, three ways to reorder, Undo, Overview (drag, add with confirmation, Edit, select, Open in workspace, Return to design restores the tool), phase switch, reload, export, Merge, Replace. **`e2e/journeys.e2e.ts` F01–F03:** a real height change updates the affected results and Undo restores them; selecting or reordering tools changes no result; each result names the model revision it evaluated, and sun hours show as evaluating or out of date until recomputed; paused checks say "not evaluated"; a return path starts no repeated run (results and the solar worker stay idle); the workflow, open tool, parameters, model and camera survive a phase switch. |
| Validation limits | The sun preview shows one moment. The Solar Access Guidelines transcription has had one reader (**unverified**). Wind is a screening, not CFD, using airport wind data. |
| Import / export | Phase package (towers, sun, wind presets, with the model revision); project file; model to .3dm, OBJ and glTF. |
| Next deliverable | Have a second reader check the solar guideline, then compare the solar-access engine with the guideline's worked instants. |

## Program

| Measure | Status |
|---|---|
| Interface | **PASS** (gate). Value opens in Building use, and its result shows the outcome under its assumptions ("Estimated residual below the assumed land price", or "… is negative (no land price entered)"), the number, Unverified, Preliminary estimate and the model revision. "Doesn't work" is gone. |
| Usable functions | Use bands (use, share, order); FSR with the tiers; Value (land residual, waterfall, which floors pay, cost and charges ledger); public realm (streetwall, frontage, open space); public sky room; trips and station entrance; parking, loading and bikes. |
| Tested handoffs | **`e2e/journeys.e2e.ts` F05:** a use-only band edit (office → residential) keeps the FSR line unchanged, moves the value, and one Undo restores both. **Unit test `engine/useOnlyEdit.test.ts`:** for every use, changing band 1 keeps every floor, the total GFA and the total FSR; the tiers follow the use; only a floor-height input changes the floor count. |
| Validation limits | Value is preliminary: the Program Value Visualizer method, grade-C market values and cost midpoints that were not re-opened. On Real Vancouver, FSR is indicative. Public-realm thresholds come from the **draft** Central Downtown Design Guidelines. |
| Import / export | Phase package (towers with bands, FSR tier, public-realm inputs, City in Nature inputs). |
| Next deliverable | A public-realm journey (streetwall and frontage inputs → results → overlay), and an entered land price that changes the outcome wording. |

## Schematic

| Measure | Status |
|---|---|
| Interface | The phase panel and its tools open (`layout.e2e.ts`: Core & floors); no Schematic-specific gate check. A journey was **NOT RUN tonight**. |
| Usable functions | Core and lifts (rises, sky lobbies, comparator), egress and stairs, code and life safety, structure and seismic, wind procedure, interior and activity, daylight depth, facade and glazing, energy and carbon; plan, section and anatomy. |
| Unfinished | Double-deck lift capacity and destination control are **not computed** (placeholders, labelled as such). |
| Validation limits | Clauses are from VBBL 2019, unverified against VBBL 2025. The lift round-trip is the team's derivation. Structure lists systems; it is not a design. |
| Import / export | Phase package (lift, egress and systems presets, anatomy view). |
| Next deliverable | A Schematic journey: change the core share and the sky lobby, then check the lift and egress results and their freshness, recording each placeholder. |

## Present

| Measure | Status |
|---|---|
| Interface | The phase panel holds the shots (Frame and capture); Present's contrast is fixed (project tabs and view icons on the dark bar). A journey was **NOT RUN tonight**. |
| Usable functions | Capture (PNG, print size); board composer with submission checks; drawings (plan, section, elevations as SVG); AI render preparation (Codex itself never run); claims guard; AI-use log. |
| Unfinished | Captured analytical views don't carry their legend, units or evidence context. |
| Validation limits | The board JPEG checks are unit-tested; the full competition submission path has not been run. |
| Import / export | Phase package (representation, board view, plan level and grid); PNG and SVG exports; board JPEGs. |
| Next deliverable | Capture and export with the applicable analytical legend, units and evidence status. |

## Shared foundations

- **One project workflow** for the landing page, the phase panels and Overview (stable ids, phase placement, return links). It survives a reload (tested in F04).
- **Phase packages:** preview, Merge and Replace. Uninstalled custom tools are named and skipped. Links to tools not in the project, and imported model files missing from this browser, are named. Replacing one phase keeps the other phases' workflow and settings (tested in F04).
- **Custom tools:** My tools lists inputs, outputs, parameters and version; the builder and import dialog work; adding a tool asks first (`node-icons.e2e.ts` covers a custom tool's icon from import to the workflow row).
- **Missing inputs and execution state:** the freshness line distinguishes not evaluated (paused, off, no model), evaluating, out of date, failed and current.
- **Not done:** automatic iteration over a return path. It needs a bounded run with a stop condition and cancellation, and is deliberately absent.
