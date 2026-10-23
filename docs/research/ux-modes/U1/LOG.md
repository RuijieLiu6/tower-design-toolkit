# ux-modes / U1: research log

## research: draft saved as `research_U1.json`
  - Opened and read about 45 pages; every pattern's evidence field names the page actually read, and claims known only from search snippets are marked unopened or UNVERIFIED.
  - Dropped a Revit 'cyan border on temporary isolate' claim: it appeared in a search summary but was not found in the handout text I extracted.
  - Dropped GH preview-baking and per-component hex colour claims: no opened McNeel source supports them.
  - Used Material Android docs in place of the M3 web page, and Apple HIG via its data endpoint; both noted in flags.
  - Extracted text from three downloaded PDFs into the session scratchpad only (temporary copies); no project or repo files were created, edited or deleted.
  - Added design_spec with a short stage model and transitions as interpretation, so the patterns read as one proposal.

## critic-r1: Senior computational designer and Rhino/Grasshopper instructor. I re-opened the main McNeel and Autodesk sources and read the Tower Studio source and the team's icon files.
- Gate pass: **False**
  - condition: Diagnose the Basic/Advanced split from NodeLibrary.tsx:14-19 and the registry counts, and specify the superset fix and its vitest test.
  - condition: Re-cost every 'felt shift' item against existing code: only 4 of 176 nodes are built, there is no core or structure geometry, and Viewport ignores phase.
  - condition: Collapse to two axes (Stage, Detail) or justify each extra axis; drop the expertise tier as a peer of stages.
  - condition: Correct the Revit Detail Level, Rhino Technical and Rutten date/claim errors, and relabel interpretation-level patterns.
  - condition: Rewrite the icon plan against lucide-react in tower-studio, with a band-to-glyph mapping and a 16 px legibility check.
  - condition: Remove camera auto-moves and the canvas-drawer-equals-Advanced idea, or reconcile them with the existing ViewMode.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Basic lists more nodes than Advanced probably because a filter is inverted or keyed to the wrong tier. → Basic and Advanced are deliberately separate lists split by category. A hard-coded ADVANCED_CATS list overrides each node's declared phase, so the two lists never overlap and 11 'basic' nodes are moved to Advanced.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Revit Detail Level 'Auto' can follow camera distance. → Detail Level is set from the view scale when a view is created, and can then be overridden in view properties. It does not respond to zoom.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Professional tools differentiate users with additive Basic/Advanced tiers, citing Grasshopper exposure ranks. → GH_Exposure only places components in ribbon sections, plus an 'obscure' flag that drops items first when the ribbon resizes. Grasshopper, Rhino and Revit have no expertise mode.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Rhino Technical mode shows dotted hidden edges. → The page lists silhouettes, intersections, creases and borders, and says objects behind others are hidden.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Rutten's zoom thresholds (80/60/41%) come from an undated reply. → The reply is dated 14 March 2014, so these are Grasshopper 1 values from 12 years ago.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Grasshopper's developer finds components easier to locate by name than by icon. → His 2009 post concerns audiences following projected demos and says he has no firm preference between names and icons.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Tower Studio's UI icon family is Phosphor (ui_icons.js). → Tower Studio depends on lucide-react. ui_icons.js belongs to the separate program-value-visualizer repo.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Medium/Fine detail (core, structure grid, facade modules) is an M-cost viewport feature. → No such geometry exists. The massing engine produces floors only, and the viewport ignores phase.
- Findings: {'BLOCKER': 2, 'MAJOR': 8, 'MINOR': 5}
- Verdict: The source reading is solid and the stage rail is sensible, but the packet fails the gate. It never opened Tower Studio's code. Basic and Advanced are separate lists split by category (NodeLibrary.tsx:14-19), not an inverted filter. Advanced is almost entirely unbuilt: only 4 of 176 nodes run, the viewport ignores phase, and there is no core or structure geometry. Its 'felt shift' would wrap inert nodes in motion and colour. It piles on overlapping axes (tier, detail, LOD, look) that none of the cited tools has. It misreads Revit Detail Level as distance-driven, and aims icons at the wrong repo and family. Fix the diagnosis, cut to Stage plus Detail, and scope to geometry that exists.

## revise-r1: draft saved as `revise-r1_U1.json`
  - r1: Read Tower Studio source (library, store, App, TopBar, RightPanel, Onboarding, NodeCanvas, Viewport, PresentPanel, Inspector, registry, index.css) and ran a script over research_registry.json. All counts and line numbers in patterns come from that.
  - r1: Replaced the 'inverted filter' diagnosis: Basic 60 and Advanced 58 are disjoint lists from ADVANCED_CATS. Found a second override (DATA rule, 28 nodes). Corrected the critique's cross-cutting split (8 Basic, 11 Platform, 1 Advanced) and 4-of-180 figure.
  - r1: Replaced the five-stage plus expertise-tier design with two axes: Stage (three stages now, five later) and Detail (explicit chip). Moved LOD badges, scenes, options, semantic zoom, frames, wires and clusters to v1 or later.
  - r1: Corrected Revit Detail Level (scale-defaulted, overridable, no camera link), dropped distance-driven Auto, and re-costed: Medium is M with an editable core preset, Fine is L and later.
  - r1: Re-read McNeel and Autodesk pages. Technical mode has no dotted lines; Rutten replies dated 14 Mar 2014 and 11 Nov 2009 now paraphrased accurately; GH_Exposure relabelled interpretation; Rhino panel named Sidebar; Rhino has eleven display modes.
  - r1: Rewrote the icon plan against lucide-react 1.61.0 (every proposed icon name exists in the installed package). Added a band-to-glyph mapping and a 1x-raster 16/20 px check. Found CLIM, flag-team and flag-unresolved colours below 3:1 on white.
  - r1: Removed automatic camera moves and the canvas drawer. Stage changes never write cameraRequest, and the user's view choice persists.
  - r1: New evidence opened: McNeel icon redesign (30 Oct 2025), Rhino 8 popup-toolbar and icon-size threads, SketchUp Getting Started versus Large Tool Set, GH RibbonShowObscure API, Autodesk Detail Level pages.
  - r1: New evidence opened: NN/g animation duration, within-subjects order effects, five-user limits, SEQ, disable-not-hide and button states; Apple reduced-motion criteria; WCAG 2.5.8; Tailwind v4 theme docs.
  - r1: Revised the user test: alternating build order, 7-point felt-change rating, SEQ per task, timed massing-to-structure round trip, formative only with no pass threshold.
  - r1: Dropped Auto detail, the 600 ms camera ease, 44 px targets, 'both themes' and the Clay speed rationale. Stage motion is now 150-300 ms. Cost scale (my estimate): S about a day or less, M two to four days, L over a week.
  - r1: Amended wording of five earlier flags (thresholds date, Revit environment, Apple motion, Phosphor, Basic-more-nodes); none deleted. Added 20 new flags, 14 of them FALSE_ASSUMPTION.

## critic-r2: BIM manager running Revit standards in a tall-building practice (round 2 reviewer of packet U1)
- Gate pass: **True**
  - condition: Specify how the core becomes visible at Medium detail (translucent envelope or cut plane) before calling it the Advanced signature moment.
  - condition: Replace the unsourced core preset with a cited, band-weighted core-to-GFA default, and add a net-area and efficiency schedule to Advanced.
  - condition: Route keys 1-3 through the stage-record path and move the right-panel tab into the store.
  - condition: State the cross-cutting placement and the DATA-rule decision behind the 72/118 counts, and test them in vitest.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Core size has no source, so the core footprint must be a pure team-assumption preset. → Peer-reviewed tall-building studies drawn from the CTBUH database give core-to-GFA averages of about 24-30% (range 11-38%) and use-specific figures (office about 26%, residential about 19%, hotel about 16%). A sourced, editable default is possible.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: Adding a core box gives Advanced visible new geometry (the 'signature moment'). → Band blocks are opaque, so an interior core box would be hidden unless the envelope is made translucent or cut.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: setPhase (store.ts:78) is the single entry point for stage changes, while keys 1-3 stay as they are (App.tsx:25-27). → The keyboard handler calls set({ phase }) directly, bypassing setPhase, so a stage record applied in setPhase would not run from the keyboard.
- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: The counts become Basic 72, Advanced-only 46 and Advanced view 118 once declared phase wins. → These figures assume the DATA rule is kept and the 20 cross-cutting nodes are split 9 to Basic and 11 to Platform. Declared phase alone gives Basic 91 plus 20 unplaced cross-cutting nodes. The packet leaves the DATA rule open.
- Findings: {'MAJOR': 3, 'MINOR': 7}
- Verdict: Round 2 fixes both round-1 blockers in substance. The packet reads the code, counts the nodes correctly, makes Advanced a superset of Basic, and stops automatic camera moves and the canvas drawer. Detail is now an explicit chip and the icons use lucide. Three new MAJOR issues remain. The core box would be hidden inside opaque band blocks. 'No source for core size' ignores published tall-building core-to-GFA ratios, and the core never feeds any number. Keys 1-3 call set({ phase }) directly, so they bypass the proposed setPhase stage record. Status labels still blur source verification with design judgement. It passes, provided Advanced gets a visible, cited core and a net-area schedule, so the shift is real rather than cosmetic.
