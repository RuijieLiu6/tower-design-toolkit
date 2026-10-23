# Mid-review screenshots (22 Oct 2026)

33 images at 1600 × 1000, all on the demo project (landing page → **Open the demo project**), captured by `tower-studio/e2e/screens.e2e.ts` in headless Chrome. To capture them again (about 5 minutes), run this from `tower-studio/`:
`node node_modules/playwright/cli.js test e2e/screens.e2e.ts`

The 3D view is rendered in software (SwiftShader), so edges are softer than in a normal browser.

| File | Shows |
|---|---|
| 01-landing | Start page: guided process or Customize, tour and demo buttons, the flag legend |
| 02-massing-vtc | Massing on the competition site: two towers, *VTC hard rules* results (passes and one fail) |
| 03a-schematic-xray-section | Schematic x-ray with the section cut at 150 m (core, lifts, stairs, sky room) |
| 03b-schematic-xray-explode | Schematic x-ray with exploded use zones |
| 04-present-board | Present: A2 board frame, camera presets, capture, drawings and AI render panel |
| 05-real-vancouver-cones-height-surface | Real Vancouver: 24 cones, the height-limit surface (hatched where there's no estimate), context card, *View-cone height check* results |
| 06-customize-workflow | Customize: the node canvas |
| 07-options-compare | Options: demo vs a 300 m, more-office version, by jury criterion (flagged "not the jury's score") |
| 08-sources-hub | Sources & assumptions hub |
| 09-status | Status page: built vs researched by category and milestone |
| 09b-status-evaluation-cases | Status page, scrolled: the 21 evaluation cases with the last run (21 of 21 pass, 22 Oct 03:40) |
| 10-node-01 … 19 | One panel per key node (program, public realm ×3, solar, City in Nature, economics, claims guard, provenance, core & lift, egress, life safety, sky room, structure, wind, interior, facade, parking, energy) |
| 10-node-20-view-from-here | View from here (Real Vancouver): the viewpoint picker |
| 10-node-20b-view-from-tower-roof | Eye-level view from the study tower's roof (eye 136.6 m): the North Shore mountains clear the skyline |
| 10-node-21-import-massing-dialog | Import massing dialog with the supported formats |
