# Live demo script (about 5 minutes) + backup

Updated 22 Oct (overnight build). The order tells the story: **problem → evidence → stages → evaluation**. The *Say* column offers suggested lines only; put them in your own words. Screenshot names refer to `screens/`.

**Before the review**
- Start the app as in the README quick start, open it in Chrome at full screen (about 1600 × 1000 or larger), and close other tabs.
- On the landing page click **Open the demo project** once, so the Real Vancouver data is cached. The demo replaces the current design as one step (Ctrl+Z brings yours back).
- Run `npm run eval` that morning so the Status page shows today's run (it takes about 6 minutes).
- Backup: this folder's `screens/` (in the order below) and `evaluation-2026-10-22/report.md`.

| t | Action | Say (suggested) | Screen |
|---|---|---|---|
| **Problem** | | | |
| 0:00 | Landing page | "Designing a 244–305 m tower on the VTC block means answering to the brief, by-laws, City guidelines and 24 protected views. The answers sit in PDFs, and most tools give a confident number with no source." | 01 |
| 0:25 | **Open the demo project** → **Real Vancouver**; the context card's **Height limit surface** is on | "The City publishes the 24 view-cone outlines, but their height fields are empty. We estimate the limit, Z = Lv + k·D, only where research found the slope. Elsewhere the map is hatched." | 05 |
| 0:50 | Point at a hatched area: *Limit unknown*; then node **Relaxations & aviation** → **Show relaxation masks** | "Where a covering cone has no estimate, the tool stops and says so instead of guessing. Policy relaxations are a switch, off by default, and they only lift their own cones; a 300 m tower is an aviation obstacle either way." | 05 |
| **Evidence** | | | |
| 1:05 | Node **View-cone height check** → Results: 3.2.3, *Above estimated limit*, the *Verified* chip, the source line, the rule card | "Every result carries a value, a threshold, a flag and a source. Deterministic code computes it, not a model." | 05 |
| 1:30 | The flag legend in the footer; the magenta *true north 45°* note in the viewport (Competition site) | "Five flags, each an icon plus a word. A false assumption stays visible in magenta: the supplied model's saved north is 45° off its drawn arrow." | 02 |
| 1:50 | Top bar → book icon → **Sources & assumptions** | "One page lists every source the nodes cite, every team assumption, and every false assumption with its correction. It exports as a bibliography for the boards." | 08 |
| **Stages** | | | |
| 2:10 | **Competition site** → **Massing** (key 1) → *VTC hard rules*, then *Pedestrian wind: massing screen* | "Massing checks the brief: height band, non-residential FSR, the block, and fails where they occur. The wind screen ranks downwash and corner risk by the airport's strong-wind directions. It is screening, not CFD, and says a wind-tunnel study is needed." | 02 |
| 2:35 | **Schematic** (key 2) → Design → **Section cut**, **Explode zones**; then *Core & lift check* (lift strategies compared), *Daylight screen*, *Parking, loading & bikes* | "Schematic sizes the core, lifts, stairs, structure, energy, facade and parking, and screens daylight depth per use. The Parking By-law page returns 403 to automated reading, so those rows stay unverified and none turns green." | 03a, 03b, 10-node-09, 10-node-12 |
| 3:10 | **Present** (key 3): board frame, camera presets, *Plans, section and elevations*, *AI render* | "Present locks the model and composes the four A2 boards. Any AI render is labelled AI-generated and needs a person's review." | 04 |
| 3:20 | One line on the newest nodes: *Program value* (cost and charges), *City in Nature ledger* (rainwater, bird-friendly glass), *Trips & station entrance* | "Cost, charges, rainwater and trips follow the same rule: a sourced number, or the word unresolved." | — |
| 3:30 | Top bar → **Options**: two saved options compared by jury criterion | "Options compare designs node by node and by the jury's weights. Our weights are flagged as team assumptions, and the chart says it is not the jury's score." | 07 |
| 3:50 | Top bar → **Customize**; mention **Export model** and **Install app** | "The same nodes form an open canvas you can rewire, like Grasshopper. The model goes back to Rhino as .3dm, and the app installs and runs offline from the README." | 06 |
| **Evaluation** | | | |
| 4:05 | Top bar → **Build status** → *Evaluation cases* | "21 cases, typical, boundary, out of scope and repeated, run by the engine and through the UI: 21 of 21 pass." | 09, 09b |
| 4:25 | Open `evaluation-2026-10-22/report.md`: case 3 (stops), 5 (boundary), 7 (five runs, identical), 6 (a 0.2 m gap at the reference point, reported) | "When the tool is wrong or unsure, the report says so." | — |
| 4:45 | Close: next steps | "Next: City Request 0 for the missing cone parameters, three more LiDAR tiles, the Parking By-law tables, and the 13 Nov working core." | — |

**Shorter path:** the landing page's **Take the tour** (8 steps, about 2 minutes) covers Massing, evidence, Schematic, Present, Real Vancouver, Customize and Status on the same demo project.

**If the live demo fails:** show `screens/` in this order, then the evaluation report.
