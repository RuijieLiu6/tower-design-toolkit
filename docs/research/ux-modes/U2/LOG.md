# ux-modes / U2: research log

## research: draft saved as `research_U2.json`
  - Read Tower Studio v0.1 source (store, TopBar, NodeLibrary, RightPanel, Viewport, registry, index.css). Finding: phase is read only by NodeLibrary and RightPanel; Viewport ignores it, so the toggle changes only the node list.
  - Recomputed library counts with the repo's stageOf rule: Basic 60 modules (4 built), Advanced 58 (0 built), Present 9, 53 hidden as platform. The imbalance is real and mostly built versus planned, plus a category override and 28 data modules hidden.
  - Opened BIMForum LOD Spec 2025 Part I (official PDF, text extracted locally). Key facts: LOD is per element, cumulative, not tied to phases, no single-LOD model; LOD 100 includes space-reservation volumes. Paraphrased only; the spec is CC BY-NC-ND.
  - Opened Rhino, Revit, SketchUp, Fusion, Blender and Grasshopper documentation. Corrected the premise: representation (display mode, visual style, detail level) and chrome (workspaces, tab sets) are separate in these tools; Tower Studio would couple them on purpose.
  - Opened NN/g (duration, purpose, modes, progressive disclosure, icons, five users), Apple HIG motion and icons via its data endpoint, Material tokens and transition defaults from GitHub, MDN, WCAG 2.2 and Tailwind pages. Script-rendered pages were read through raw sources.
  - Read Heer and Robertson 2007 (PDF text) and the Bederson and Boltman abstract. Chevalier et al. 2016 and Perlin and Fox 1993 could not be read and carry no claim; Wiedenbeck 1999 is secondary only and flagged.
  - Rendered 30 team glyphs in the browser pane through a temporary read-only local server (stopped afterwards). They are bold filled single-ink pictograms on coloured tiles, readable at 16 px, and unlike Lucide's outline strokes. That drove the two-tier icon rule.
  - Checked Lucide names against installed lucide-react 1.61.0 (ISC, 24 px). Missing in this version: elevator, stairs, chart-no-axes-column-stacked. Every icon named in the spec exists; createLucideIcon is exported.
  - Cost key: S under half a day, M one to three days, L over three days for one developer. These are my estimates, not measured.
  - Mapped the earlier rail (Massing, Program, Evaluate, Design, Present) onto three stages plus a persistent Evaluate lens, from the summary only. Added a Guide level axis so stage and expertise are separate.
  - No project or repo files were created, edited or deleted. Two temporary text extractions of PDFs sit in the system temp folder, outside both repos.

## critic-r1: Professor of architectural representation (drawing, diagram, visualization). Read the v0.1 source, the registry and the team glyph repo, and re-opened the NN/g animation-duration and BIMForum LOD pages.
- Gate pass: **False**
  - condition: Define and cost a minimum Advanced slice whose every drawn element traces to a parameter or module and carries a flag (core box, plates, mechanical floors); no lift banks or facade grid until their modules exist.
  - condition: Remove LOD numbers from stage names and stage_model; development tags appear only on elements.
  - condition: Redefine Present as framing any representation preset, with a neutral-material default render and per-shot representation and development stamps.
  - condition: Add a true orthographic camera for axonometric and exploded axonometric; specify line-weight hierarchy and poché; stop using dashed lines for development level.
  - condition: Fix icon collisions (Box, CircleHelp) and the band-to-glyph semantics; use one colour per program across viewport, tile and legend.
  - condition: Bring the stage transition to 500 ms or less by default, with a group-based stagger that fits its window; reorder the process map by dependency and show feedback loops.
  - condition: Rewrite the 15-minute test around built features, a v0.1 baseline and same-model and trust comprehension.
  - condition: Settle glyph licence and provenance before porting.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Narrowing fov from 38 to 24 turns the perspective model into an axonometric drawing, and the Explode view is an exploded axonometric. → Any perspective fov is still a perspective. Axonometric means parallel projection and needs an orthographic camera.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Basic is development 100 and Advanced is 200-300 (stage_model and phase titles). → BIMForum sets no levels per phase or per model; the packet's own Reject pattern says so.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Present boards are lit renders. → Competition boards are mostly sections, axonometrics, plans and diagrams. Present must frame any representation, and the spec's own process map lists Section under Present.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Team glyphs SE1, WK1, ST2, LV1, GP6, LE2 and AM5 stand for the generic bands and for lifts. → They are market-tier and specific programmes. AM5 is a sky lobby / transfer floor, not lifts.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Each glyph tile takes its hue from the band colour, so tile and volume match. → tileColour forces saturation to 0.72 or more and lightness to about 0.6, and turns near-greys into a beige, so tiles differ from the viewport colours.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Every Lucide icon named in the spec is free to take on its new meaning. → Box and CircleHelp are already used in the same top bar for other meanings, and CircleHelp exists only as an alias in 1.61.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The 800 ms timeline fits: interior reveal from 350 to 800 ms with a 10 ms per-floor stagger. → About 68 floors x 10 ms = 680 ms, which overruns the 450 ms window to about 1030 ms. The total also exceeds NN/g's range.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: A ground-up core rise 'follows load path'. → Gravity load paths run from the top down to the foundations. Only construction sequence supports a ground-up rise.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Dashed hairlines are a readable code for 'generic, approximate L200'. → In architectural drawing convention, dashed means hidden, overhead or beyond; this overloads that meaning for Rhino and Revit users.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: ADVANCED_CATS pushes 12 basic-phase modules into Advanced, and core share belongs to Advanced. → 11 basic-phase and 1 cross-cutting module are pushed. The registry tags P10-M05 (core share) as phase 'basic'.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The team icons have clear provenance and can be reused. → The provenance record contradicts itself and the licence is undecided.
- Findings: {'BLOCKER': 3, 'MAJOR': 11, 'MINOR': 5}
- Verdict: The architecture is right: one stage state drives what is drawn, what the screen offers and how it looks, and expertise is separated from stage. But the spec fails its own standards. Advanced shows geometry that no module produces. Stage names bring back LOD numbers the spec rejects. Present throws away the drawings that boards are made of. 'Axonometric' is still a perspective. Dashed lines take over the hidden-line convention. Program colour disappears just when it matters. The glyphs carry market-tier meanings (Market condo, Class AAA). Icons collide with existing buttons. The motion timeline overruns its own budget. Fix the three blockers and the representation conventions, then test against v0.1 with built features only.

## revise-r1: draft saved as `revise-r1_U2.json`
  - Read Tower Studio v0.1 source (store, TopBar, NodeLibrary, RightPanel, Viewport) and registry. Finding: phase is read only by NodeLibrary and RightPanel; Viewport ignores it, so the toggle changes only the node list.
  - Recomputed library counts with the repo's stageOf rule: Basic 60 modules (4 built), Advanced 58 (0 built), Present 9, 53 hidden as platform. The imbalance is real and mostly built versus planned, plus a category override and 28 data modules hidden.
  - Opened BIMForum LOD Spec 2025 Part I (official PDF, text extracted locally). Key facts: LOD is per element, cumulative, not tied to phases, no single-LOD model; LOD 100 includes space-reservation volumes. Paraphrased only; the spec is CC BY-NC-ND.
  - Opened Rhino, Revit, SketchUp, Fusion, Blender and Grasshopper documentation. Corrected the premise: representation (display mode, visual style, detail level) and chrome (workspaces, tab sets) are separate in these tools; Tower Studio would couple them on purpose.
  - Opened NN/g (duration, purpose, modes, progressive disclosure, icons, five users), Apple HIG motion and icons via its data endpoint, Material tokens and transition defaults, MDN, WCAG 2.2 and Tailwind pages. Script-rendered pages were read through raw sources.
  - Read Heer and Robertson 2007 (PDF text) and the Bederson and Boltman abstract. Chevalier et al. 2016 and Perlin and Fox 1993 could not be read and carry no claim; Wiedenbeck 1999 is secondary only and flagged.
  - Rendered 30 team glyphs in the browser pane through a temporary read-only local server (stopped afterwards). They are bold filled single-ink pictograms on coloured tiles, readable at 16 px, and unlike Lucide's outline strokes. That drove the two-tier icon rule.
  - Checked Lucide names against installed lucide-react 1.61.0 (ISC, 24 px). Missing in this version: elevator, stairs, chart-no-axes-column-stacked. createLucideIcon is exported.
  - Cost key: S under half a day, M one to three days, L over three days for one developer. These are my estimates, not measured.
  - Mapped the earlier rail (Massing, Program, Evaluate, Design, Present) onto three stages plus a persistent Evaluate lens, from the summary only. Added a Guide level axis so stage and expertise are separate.
  - No project or repo files were created, edited or deleted. Two temporary text extractions of PDFs sit in the system temp folder, outside both repos.
  - r1: BLOCKER 1 accepted and refined. towerFloors already yields plates (67 floors on the default tower) but default bands omit mechanical, so the critique's mechanical-band fix needs an Add plant floors action. Minimum slice: plates, plant floors, core box, each with source, flag and LOD tag.
