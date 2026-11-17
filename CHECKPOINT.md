# CHECKPOINT: the review of the chain, fixed branch by branch (17 Nov 2026)

An independent read of the whole chain (tool-rail → model-presentation → board-fonts → phase-dots → import-sync →
ui-drawer → sinnie-modelling) listed fifteen findings and eight of Ruijie's intents. Each fix went on the branch where
its bug began, then forward through the chain with plain merges (no rebase, no force-push); every branch is pushed.
Decisions mine (approved in advance). Not merged to main, not deployed; `sinnie-modelling` still waits for Sinnie's OK.
- **tool-rail** `e035cd0`: the user guide said H hides the overlays; it is O, and H is the rail.
- **model-presentation** `8e5b6b9`: the guide's "Present" stage is Presentation (three places).
- **board-fonts** `ec957e6`: a font file whose family is one of the built-in faces is refused by the check (two entries
  of one name clashed in the list and in React keys), and stored ones are left out (`fontFile.ts`, `fontStore.ts`).
  Right after a reload the export found the font cache empty and drew the fallback without a word: loading now reads
  "Your fonts" first, every face is checked with the FontFace API, and the export line names the faces actually drawn,
  with an amber note when one fell back to Inter (`boardRender.ts`, `SubmissionPanel.tsx`, `ExportRecord.missingFonts`).
- **phase-dots** `932e7cb`: the guide's "phase list under Workflow" is the line's segments and arrows.
- **import-sync**: nothing of its own (the sync dialog's finding began with the drawer); the merge only.
- **ui-drawer** `aca988a`: hiding a tool reopened Generate on an empty Form step (`toolPick.ts afterHiding`: nothing
  open stays closed); the phases line is locked, being the only phase navigation inside Model; the Sync model dialog's
  arrow keys walk the platforms on show; what a hidden context layer was before is kept in this browser
  (`ts.ui.layersWere`), so a reload still brings it back as it was.
- **sinnie-modelling** (this commit), high: the drawn mass's mesh is keyed by a hash of its shape
  (`lib/draw/drawnMesh.ts`), so every shape keeps its own mesh and Undo finds the old one; the view and the .3dm / OBJ
  export rebuild it from the outline when the store has none, so nothing depends on the stored copy (this also ends the
  Real Vancouver copy overwriting it). Push / pull on a wall moves on the plane of the wall's hit height (no jump on the
  first move). The drawing keys count only on the canvas, the body and the rail's tiles (`lib/draw/keys.ts`): Enter on
  a dialog's button presses it, Esc closes the drawer, 1 / 2 / 3 work again. Medium: a tool ends when the step or the
  stage changes; Rotate turns holes, core and every part about one centroid, Offset refuses to cross a courtyard; the
  tower tools (Place, Align to lot, the gizmo, the toolbar's x, y and angle) move a drawn mass's outline and its parts
  through `moveDrawn`; a copy, a split part or a cut piece takes its settings from its source mass (basement, interior
  and form cleared); the parts of one building are not a separation pair (`publicRealm.ts`) and share one core (the part
  with a placed core, else the largest: `oneCorePerBuilding`); a mass drawn on a roof starts at its base (no empty
  storeys up from the ground). Ruijie's intents: From scratch starts the Rectangle tool (the Toolkit's starting tower is
  a link under the tiles, keeping `place-tower`); the drawing keys work before any tower exists; Face and Mass leave
  the rail while a drawn mass is selected; the right panel's tab row fits five tabs (narrower, truncating, titled);
  Erase and Del take only the clicked part; Subtract and Intersect measure their change and cut nothing under 4 m²
  (`lib/draw/boolean.ts`; the second mass used to be deleted anyway); a typology slider drag is one undo step.
- **Top bar overflow (browser check, later on 17 Nov):** with the switch, Presentation ran to 1,615 px at 1,440 and Model to
  1,395 px at 1,280 (a horizontal scrollbar; Edit workflow cut off). Fixed on `model-presentation` (`d4eebd0`): under 1,500 px
  Model locked, Capture, Auto-run checks and Edit workflow keep their icons and titles and drop their words (accessible
  names kept); on `ui-drawer` the Interface button does the same. `e2e/no-overflow.e2e.ts` measures no horizontal
  overflow in both modes, on both projects, at 1,440 × 900 and 1,280 × 800 (PASS on model-presentation, ui-drawer and
  this tip, with layout, model-presentation, ui-drawer and drawing-tools).
- **Case studies checked (later on 17 Nov):** the eight named towers' height and storeys were read on the CTBUH Skyscraper
  Center (architectural height, floors above ground; URL and date on each row, `lib/draw/caseStudies.ts`) and are now
  verified; corrected: Shangri-La 201 → 200.9 m, 62 → 59 storeys, 2008 → 2009; Trump 188 → 187.8 m; 30 St Mary Axe 180 →
  179.8 m, 41 → 40; Vancouver House 150 → 155.6 m, 59 → 52; One Wall Centre 150 → 149.8 m; 432 Park 426 → 425.7 m; Aqua
  262 → 261.8 m, 82 → 86; Leadenhall 225 → 224.5 m. The point tower is a type with no source and stays unverified; plates
  and podiums stay approximate and unverified. `caseStudies.test.ts` holds every row to a source or the unverified flag.
- **Judged not a bug:** FSR already reads the parts of one building as one (their floor areas add, they do not
  overlap). The Boolean union's parts keeping their own heights is Sinnie's rule, kept.
- **Tests:** `tsc -b` PASS on every branch touched · `vitest run` 1,282 pass, 3 skipped (+19 new: `lib/draw/keys.test.ts` where a key counts; `lib/draw/boolean.test.ts` cut pieces and the 4 m² rule; `lib/draw/drawStore.test.ts` the tool ends with the step and the stage, the key map; `lib/draw/mass.test.ts` a mesh per shape found again by Undo, a copy from its source, rotate with holes and core, offset into a courtyard refused, one core per building and a move through the tower tools, a stacked mass starting at its base; `engine/publicRealm.test.ts` parts are no pair; `components/tools/toolPick.test.ts` an empty step stays closed; `lib/ui/registry.test.ts` the phases line locked, a layer's state kept; `lib/fonts/fontFile.test.ts` a built-in name refused; the same 2 CRLF data-file checks fail in this worktree only) · Edge e2e on the `sinnie-modelling` tip: `drawing-tools` (+ From scratch starts Rectangle; a wall taken near its top and let go after a pixel stays put) PASS · `tool-rail` PASS · `massing-edit` PASS · `model-presentation` PASS · `import-sync` PASS · `ui-drawer` PASS · `board-fonts` PASS · `journeys` PASS; `board-fonts` also on its own branch, `ui-drawer` and `import-sync` on the ui-drawer branch. Screenshots refreshed: `docs/evaluation/2026-11-17-drawing-tools/01-start-massing.png` (the tiles with the starting-tower link) and `02-drawing.png`.

# CHECKPOINT: Sinnie Choi's modelling tools in the Toolkit (17 Nov 2026)

Ruijie, 17 Nov: port Sinnie Choi's "Start your massing" and her drawing tools from her Toolkit build and
github.com/xubynii/towerdesigntool into the main tool. Branch `sinnie-modelling` from the `ui-drawer` tip. Decisions
mine (approved in advance). Not merged, not deployed. **This branch stays unmerged until Sinnie gives her written OK**
(the ask is drafted in `04 Tool Plan/permissions/DRAFT_MESSAGES.md` §1d); she is credited in every ported file's header,
in the Drawing tab's note and on the Sources page (Credits).
- **Start your massing** (`components/draw/StartMassing.tsx`, in the Form step's Massing tool while the project has no
  tower): four icon tiles. *From scratch* places the Toolkit's own starting tower and starts placing it (the step the
  twenty existing journeys take; its `place-tower` test id is kept). *Import* opens the model import in place. *Case
  study* lists nine towers (`lib/draw/caseStudies.ts`: Shangri-La, Trump, 30 St Mary Axe, Vancouver House, One Wall
  Centre, …) with Sinnie's published numbers, unverified; a click places the starting tower with that height, storey
  count, floor-to-floor and footprint. *Typology* (`components/draw/TowerForms.tsx`): none, taper, twist, tiered,
  stacked, each with its sliders, applied as the tower's blocks; the tower remembers its `form` so the sliders read back.
- **Drawn masses are towers** (`lib/draw/mass.ts`, `engine/types.ts` `Tower.drawn`): the outline, base, storeys,
  floor-to-floor, holes, part and core live in `drawn`; from them the tower carries an imported-style storey stack,
  made by extruding the outline into a closed mesh and running the same slicer as an uploaded model, so every engine
  (VTC rules, FSR, cones, lifts, egress, energy, boards) reads it unchanged and the 3D view draws it as an import.
  Six storeys at 3.6 m to start, named "Mass n". `part` groups the masses of one building (a union of different
  heights, a Split): they move together and keep their own heights. A placed core sets the core share by hand.
- **The tools** (`components/draw/DrawTools3D.tsx` in the scene's z-up group, state in `lib/draw/drawStore.ts`,
  geometry in `lib/draw/geometry.ts`): Select; Line (freeform corners, or an offset band of a set width, centre /
  internal / external); Rectangle; Circle; Erase; Move; Copy / array (drag, then a typed count lays the row); Rotate in
  5° steps; Offset (drag or typed metres); Push / pull (a roof changes storeys, a wall moves; click-move-click or drag;
  typed value); Split (a chord with corner, middle and edge snaps; in a side view, at a floor); Boolean (union,
  subtract, intersect, Sinnie's rules: each part keeps its height); Edit length (click a wall, type); Core (drag inside
  a mass; click a core to remove it); Tape. A live dimension tag follows the pointer; typed digits commit on Enter,
  Backspace edits, Esc clears, then Esc ends the tool; every edit is one undo step; no confirm dialogs; short toasts
  (`DrawToast.tsx`). The Drawing tab (`DrawPanel.tsx`) shows the tool, its modes, what to do next, the typed value,
  Done and the snapping panel: Grid and its size (0.25–5 m), and for Line and Split endpoints, midpoints, on edges, in
  line with corners, parallel / perpendicular and the angle step; kept per browser as `ts.draw.snap`. Alt suspends
  snapping while held, Shift locks 90°.
- **Boolean geometry:** `polygon-clipping` 0.15.7 (MIT) vendored as ES modules in `src/vendor/polygon-clipping/` with
  `splaytree` (MIT) and `robust-predicates` (public domain), licences beside them; no new npm dependency.
- **The rail** (`ToolRail.tsx`): the drawing tools sit on the Form step in Model as filled-glyph groups (draw, change,
  cut, measure). The rail's Move and Rotate are one tool each: M and R act on whatever is selected, a drawn mass through
  the drawing tool, a parametric tower through its gizmo (`TowerGizmo.tsx`). Each drawing tool lists itself in the
  Interface drawer under Design tools › Drawing tools.
- **Keys** (clashes resolved in the Toolkit's favour: V, L, R, O, F, P, H, 1/2/3 stay): Select S · Line N · Rectangle B ·
  Circle I · Erase E · Move M · Copy C · Rotate R · Offset G · Push / pull U · Split X · Boolean J · Tape T · Edit length
  and Core from the rail only · Esc ends · Del deletes · Ctrl+Z undoes. Listed in the user guide and the onboarding.
- **Found on the way:** the Tower position tool's placement click fired on an Erase click and wrote a second undo step,
  so Ctrl+Z seemed to do nothing; it stands down while a drawing tool is on (`TowerPosition3D.tsx`). Switching to Real
  Vancouver brings the competition design along (`lib/defaultSite.ts`) but moved only x, y and rotation: a drawn mass
  kept its outline in competition coordinates. The outline, holes and core now go the same way and the storeys are
  sliced again (`defaultSite.test.ts`); the core stays axis-aligned, its centre moved, its size kept.
- **Not done / limits:** the case-study numbers are Sinnie's and unverified; Sinnie's own `R` (Rectangle) and `L`
  (Line) became B and N; a drawn mass has no gizmo of its own (the drawing tools are its handles); Rotate turns the
  outline in plan only.
- **Tests:** `tsc -b` PASS · `vitest run` 1,263 pass, 3 skipped (+10 `lib/draw/geometry.test.ts`: area and winding, offset, path band, clip union / difference, split, push wall, set wall length, array copies, prism mesh; +3 `lib/draw/mass.test.ts`: tower-from-drawn, add and update as one undo step, update-many; +1 `lib/defaultSite.test.ts`: a drawn mass brought along; the same 2 CRLF data-file checks fail in this worktree only) · Edge e2e: `e2e/drawing-tools.e2e.ts` (new: the four start tiles; a rectangle drawn on the ground; Push / pull typed to 36 m and the VTC height band reading Mass 1; Offset typed; Copy ×3 typed; Split; Boolean union; Erase; Ctrl+Z; Real Vancouver: Vancouver House placed from the case list, a mass drawn on the city) PASS · `tool-rail` PASS (its order check now allows the drawing groups) · `massing-edit` PASS · `model-presentation` PASS · `journeys` PASS. Screenshots: `docs/evaluation/2026-11-17-drawing-tools/01-start-massing.png` (the tiles and the case list) and `02-drawing.png` (Mass 1 pulled to 36 m, the toast, the rail's drawing tools).

# CHECKPOINT: the Interface drawer, what the app shows as a table of contents (17 Nov 2026)

Ruijie, 17 Nov: "another button whose drop-down is about personalising the interface … a drawer holding everything that
helps model, understand the model and add information … like a library: almost all the information on the site shown
as a table of contents … a clear hierarchy, from a few big categories down to the modules and their small components."
Branch `ui-drawer` from the `import-sync` tip. Decisions mine (approved in advance). Not merged, not deployed.
- **The button:** "Interface" (a drawer icon and the word), in the top bar right after the project menu
  (`components/ui/InterfaceDrawer.tsx`). It opens a panel with a search box, Show all, Reset, a one-line note that
  hiding is view-only, the tree, and Save / Load layout. An ARIA tree: tri-state boxes (on / mixed / off) for groups,
  "N hidden" per group, locked parts with a lock; Up / Down move, Left / Right close and open a group, Home / End,
  Space or Enter toggles, typing in the search box filters (ancestors of a match stay so the path reads). Every change
  applies at once and is reversed by re-checking; Ctrl+Z is the design's undo and does not cover view choices (stated
  in the panel's note). Reset is the default layout (everything shown), so Show all and Reset coincide today; both
  stay for the day a part is hidden by default.
- **One registry** (`lib/ui/registry.ts`): the static tree (Top bar, Left panel, Design tools, Viewport, Right panel,
  Presentation, Add-ons) plus parts that register as they exist: every design tool (`tools/toolPick.ts`, so a tool
  added later, drawing tools included, lists itself with no extra work), each dock section as the dock shows it
  (`ViewportDock.tsx`), each right-panel section as its tab is seen (`ui.tsx` `Section` inside a `UiScopeContext` per
  tab, ids like `right.tab.results.what-stays-with-people`), and the add-ons (`lib/ui/addons.ts`: My tools from the
  community store, Your fonts, the sync links, Real Vancouver's context layers). Components read `useUiVisible(id)` /
  `useUiGroupVisible(id)` or wrap in `<UiShow id>`; the drawer draws the tree from the same list.
- **Rules:** hiding is view-only (checks keep running; a hidden Results section switches no node off). Locked: the
  project tabs, Undo / Redo, the project menu, the drawer, the Model / Presentation switch, the More menu (it holds
  the help). A context layer's entry turns the layer off in the view when hidden and back on as it was when shown.
  Hiding every child hides the container (a tab with all sections hidden leaves the bar; a dock with every section
  hidden goes). Visibility inherits down; showing a part shows its ancestors. Kept per browser as `ts.ui.visibility`
  (the hidden ids), never in the project file; Save / Load layout writes and reads `tower-studio-ui@1` JSON (locked
  ids in a file are ignored).
- **Modes and projects:** the tree lists the current mode's parts under "in Model" / "in Presentation" (an item says
  its mode); the hooks are the same in both projects.
- **Found on the way:** a key pressed on a nested tree row also reached the parent group's row (one Space toggled the
  Trace tab and the whole Right panel); the row handler stops propagation now.
- **Tests:** `tsc -b` PASS · `vitest run` 1,249 pass, 3 skipped (+6 `lib/ui/registry.test.ts`: inheritance, tri-state
  and counts, show clearing descendants and ancestors, locked parts, persistence and layout files, the apply hook;
  the same 2 CRLF data-file checks fail in this worktree only) · Edge e2e: `e2e/ui-drawer.e2e.ts` (new: the tree and
  its locked parts; the Trace tab, the Sun tool, a Results section and the dock's Site section hidden and gone, group
  counts, search and keyboard toggling, a reload keeping four hidden ids, Reset, a My-tool package appearing under
  Add-ons and leaving the Add tool list when hidden) PASS · `tool-rail` PASS · `model-presentation` PASS ·
  `import-sync` PASS · `journeys` PASS. Screenshots: `docs/evaluation/2026-11-17-ui-drawer/01-drawer-open.png` and
  `02-items-hidden.png`.

# CHECKPOINT: the Import window simplified; Sync model in the project menu (17 Nov 2026)

Ruijie, 17 Nov: "Simplify the text further, and develop an icon for each of the five options. Bring in a 3D model is
really the same as the Import in Massing … Put a Live model or Sync model option in the Untitled project drop-down."
Branch `import-sync` from the `phase-dots` tip. Decisions mine (approved in advance). Not merged, not deployed.
- **Import side** (`porting/TransferDialog.tsx`, `lib/porting/capabilities.ts` `short`): the five purposes are
  `IconTile`s with one or two words (3D model, Project, Workflow, Site boundary, My tool) and a filled glyph each
  (Cuboid, FolderOpen, Workflow, MapPin, Package); the full name and what it does show on hover or focus; a purpose
  the project cannot use is dimmed with its reason on hover. Each pane is its title, one line and the action; the
  "Checked route: lib/…" line is a Fold, as is the tool pane's install note. The Export side has the same treatment
  (Geometry, Backup, Workflow, Results, My tool). The `purpose-*` test ids are unchanged, so the existing e2e pass.
- **3D model = the Massing import** (`ModelPane`): the six platform tiles are the Massing tool's own
  (`import/RhinoImportPanel.tsx` now exports `PlatformPicker`, sharing the picked platform in `ts.importPlatform`),
  with that platform's upload note and file types from `lib/interchange/platforms.ts`; the action runs the one model
  import (`lib/import/store.ts openDialog`), the same pipeline as the tool's Upload button. The Massing tool keeps its
  entry. The live links are not repeated in the Import window: a fold points to Sync model.
- **Sync model…** (`ProjectMenu.tsx`, new `import/SyncModelDialog.tsx`): a dialog, not a second copy of the link UI:
  it reuses the Import tool's `RhinoLive`, `ServerLive` and `FileLive` cards (now exported). Top: the link's state from
  `lib/interchange/live.ts` (Not connected / Watching / Reading / Link problem, what it is linked to, last sync time,
  the message) and Disconnect (`stopLink`). Left: the six platforms as rows with their honesty flags straight from
  `platforms.ts` `tested`: Rhino "Tested" (run in Rhino 8 on the team laptop), Revit, Archicad, AutoCAD and SketchUp
  "Unverified" (written to the app's documented API, not yet run inside it), Other file "upload only". Right: the
  chosen platform's steps and Connect / Link file. Esc closes and focus returns to the menu's button. Two-way sync
  is as each link supports; the help says so.
- **Tests:** `tsc -b` PASS · `vitest run` 1,243 pass (the same 2 CRLF data-file checks fail in this worktree only) ·
  Edge e2e: `e2e/import-sync.e2e.ts` (new: five tiles with glyphs and the short words, the hover name, Site boundary
  disabled on the competition site, 3D model's six platform tiles and per-platform notes, a Rhino fixture through the
  window to the results, the Export tiles, Sync model's rows with Rhino tested and the others unverified, the state
  line, Rhino's Connect, SketchUp's steps, Esc and focus) PASS · `rhino-import` (2) PASS · `transfer-centre` PASS ·
  `model-presentation` PASS · `journeys` PASS. Screenshots: `docs/evaluation/2026-11-17-import-sync/01-import-window.png`
  and `02-sync-model.png`.

# CHECKPOINT: the top bar's Import and Export buttons go into the project menu (17 Nov 2026)

Ruijie, 17 Nov: "These two buttons can also be removed, because their functions are already incorporated into the
Untitled project drop-down menu." Second commit on `phase-dots`. Not merged, not deployed.
- `TopBar.tsx` loses the two buttons; `ProjectMenu.tsx` gets two items with their icons, Import… and Export…, each opening
  the transfer centre on its side through the same `useTransfer().open(side, opener)`; the opener is the menu's own
  button, so Cancel and Esc give focus back to it. The items carry the old `transfer-import` / `transfer-export` test
  ids; `e2e/helpers.ts` `openTransfer(p, side)` opens the menu and clicks one, and every e2e that clicked the bar's
  buttons goes through it (journeys, phase-panel, rhino-import, sun-wind-link, transfer-centre; workspace-gate's
  type check reads the menu button). A file dropped anywhere on the app still opens the centre on Import (unchanged).
- Texts: the menu hint and its empty-list line ("Import… › Open a saved project"), the transfer centre's backup
  "Reopens" line, the user guide's project-menu sentence (it still named "Export .json" and "Import .json…") and the
  comments in `TopBar.tsx`, `ProjectMenu.tsx` and `PhasePanel.tsx`. The onboarding card, the status line, the Rhino
  import tutorial and the VTC base-model panel never named the bar's buttons (checked by grep), so they are unchanged.
- **Tests:** `tsc -b` PASS · `vitest run` 1,243 pass (the same 2 CRLF data-file checks fail in this worktree only) ·
  Edge e2e: `rhino-import` (2) PASS · `transfer-centre` PASS · `phase-panel` PASS · `journeys` PASS ·
  `model-presentation` PASS · `sun-wind-link` skips itself here (it needs the sun-wind-studio checkout beside the
  repo, which this worktree does not have). Screenshot: `docs/evaluation/2026-11-17-project-menu/01-project-menu.png`.

# CHECKPOINT: the phase rows go; the line's segments and the arrows are the phase navigation (17 Nov 2026)

Ruijie, 17 Nov: "remove all the Site / Form / Program / Schematic text … the left and right arrows can be the buttons
for changing which phase you are in." Branch `phase-dots` from the `board-fonts` tip. Not merged, not deployed.
- `PhasePanel.tsx` `PhaseLine` replaces `PhaseList` + `PhaseMap`: one coloured segment per phase of the mode (as wide as
  its share of tools, at least one share, the current one tinted), each a 24 px button carrying the `data-phase` /
  `data-step` / `aria-current="step"` hooks and the name with its counts as its accessible name ("Form: 3 tools, 2 fail,
  1 check"), the arrow keys moving along it; the tools as dots inside the segment (hover: phase / tool · its pass /
  check / fail words from the live digest; a click on a dot is a click on the phase), the open tool ringed, loop arcs
  above; a screen-reader list of each phase's tools beside it. The `nav[aria-label="Design process"]` landmark stays,
  so every e2e helper works unchanged. The ‹ › arrows ("Previous phase: Form", "Next phase: Program") step the design
  phases only, disabled at Site and Schematic, never wrapping; Presentation stays on the top bar's switch. The panel
  header keeps the phase name and its totals; Edit and Add tool stay.
- **Tests:** `tsc -b` PASS · `vitest run` 1,243 pass (the same 2 CRLF data-file checks fail in this worktree only) ·
  Edge e2e: `model-presentation` (extended: no phase-name text in the landmark, the arrows' names and their disabled
  ends) PASS · `phase-panel` PASS · `journeys` PASS · `tool-rail` PASS. Screenshot:
  `docs/evaluation/2026-11-17-model-presentation/01-model.png`.

# CHECKPOINT: board fonts in Presentation (17 Nov 2026)

Brief (Ruijie, 17 Nov): "On the presentation layout, I'd like an option to change the font, and users can also download
and upload the font type they want for their own needs." Decisions mine (approved in advance). Branch `board-fonts`
from the `model-presentation` tip, same worktree. Not merged, not deployed.
- **Font choice** (`BoardComposer.tsx` `FontPanel`, `FontPick`): a board-wide pair, Headings (the title band) and Text
  (frames, captions, evidence lines), and a per-frame override on any text frame ("Board default" or a face). The
  picker draws every name in its own face and the current one on its button; the board preview, the thumbnails and
  the fit measurement redraw with the real face as soon as it loads. The pair lives with the boards
  (`lib/boardStore.ts` `fonts`, persisted as `ts.boards` by family name; a change clears the board's export record, as
  other edits do); the per-frame face is `font?` on the text content (`engine/boards.ts`). Board edits have no undo
  stack today (Ctrl+Z is the design's), so the font choice behaves like every other board edit: it persists and the
  picker reverts it.
- **Built in, offline** (`lib/fonts/catalog.ts`, `public/fonts/<id>/`): Inter (the app's own, loaded by `index.css`),
  IBM Plex Sans, Lora (serif), IBM Plex Mono and Barlow Condensed (for one-line board titles), the Latin 400 and 700
  WOFF2 files from the Fontsource packages (one `npm pack` into a scratch folder; nothing added to node_modules), each
  with its `LICENSE.txt` beside it, all SIL OFL 1.1; listed with their licences at the foot of the Sources page
  (`pages/Sources.tsx` `FontLicences`). The faces are registered with the FontFace API when the composer opens, never
  fetched from a font server. Four others rather than five: Space Grotesk was dropped from the set so a copy of it can
  be the e2e's upload fixture without colliding with a built-in name.
- **Find fonts**: a Fold with Google Fonts, Fontsource and the League of Moveable Type as plain links (`target=_blank`,
  the app sends nothing).
- **Upload your own** (`lib/fonts/fontFile.ts`, `lib/fonts/fontStore.ts`): .ttf, .otf, .woff and .woff2 by file
  picker or drop; judged by magic bytes, not the name; up to 8 MB; the family read from the file's own `name` table
  (TrueType, OpenType and WOFF, inflating a packed table with DecompressionStream; a WOFF2 is Brotli-packed, so its
  file name stands in: "SpaceGrotesk-Regular.woff2" → "Space Grotesk"); a load probe through `FontFace.load()`; plain
  words for every refusal ("not a font file", "is 9.2 MB; a font here can be up to 8.0 MB", "does not start like a
  font", "could not be loaded"). Kept in this browser's IndexedDB (`tower-studio-fonts`), never uploaded, listed under
  "Your fonts" with Remove; one licence line at the point of upload.
- **Export and fallback** (`lib/boardRender.ts`): `drawBoard` takes the board's faces and a resolver; `exportBoardJpeg`
  registers every family the board names and awaits `document.fonts.ready` before drawing, and the export record
  says which faces it drew with (shown on the export line, `data-export-fonts`). A family not in this browser (a font
  added elsewhere) is drawn as Inter and named in a "Not in this browser" line in the Type panel. No board export
  writes SVG (the plan SVG is an image placed on a board), so there is nothing to embed. The fit check ("Text fits its
  frame") measures with the real face; the "Smallest type" rule keeps the type height the user set, which is the same
  measure in every face.
- **Found and fixed on the way:** `useLoadedImages` restarted its load on every render (a fresh `[board]` array and a
  new Map each time), so the composer re-rendered hundreds of times a second; it is keyed on the image ids now and
  keeps the Map when nothing changed. The inspector's `1fr` columns let the deliverable select's longest option widen
  the panel past 320 px; the columns are `minmax(0, 1fr)` and inputs `w-full` now.
- **Tests:** `tsc -b` PASS · `vitest run` 1,243 pass, 3 skipped (+9: `lib/fonts/fontFile.test.ts` formats by bytes, the
  name table in TrueType and WOFF, file-name fallback, the refusals and a good file; `lib/fonts/catalog.test.ts` the
  shipped set and licences, the stack, fallback and missing names, `familiesUsed`; the same 2 CRLF data-file checks
  fail in this worktree only) · Edge e2e: `e2e/board-fonts.e2e.ts` (new: Presentation → the composer, Lora picked
  for headings with the picker drawing names in their faces and the choice persisted, a text file refused, the Space
  Grotesk WOFF fixture added and named from its name table, picked for headings, IBM Plex Mono for one frame, a
  JPEG exported with those faces loaded and named on the export line, a reload keeping the font and the choice,
  Remove leaving a "Not in this browser" note) PASS · `layout` (Massing, Schematic and Present) PASS ·
  `model-presentation` PASS · `tool-rail` PASS. Screenshots: `docs/evaluation/2026-11-17-board-fonts/01-board-fonts.png`
  and `02-board-fonts-exported.png`.

# CHECKPOINT: Model | Presentation, the phase row folded into the left panel (17 Nov 2026)

Brief (Ruijie, 17 Nov, with the reference build's screenshot): "At the very top of the page there is a Model /
Presentation switch; one click takes you from design to layout … keep the phase colours and their categories, but make
it simpler and save more space … the clickable Site / Form / Program / Schematic / Present row at the top should
probably go … can all the presentation-related nodes be removed, or put entirely inside Presentation?" Decision
(approved): nothing is deleted; the presentation tools are the competition deliverables and move entirely into
Presentation. Branch `model-presentation` from the `tool-rail` tip, same worktree. Not merged, not deployed.
- **The switch** (`TopBar.tsx` `ModeSwitch`, `lib/mode.ts`): a segmented Model | Presentation radiogroup in the centre
  of the top bar. Model is Site, Form, Program and Schematic as one continuous run; Presentation is the Present stage
  (model locked, A2 frame, boards, drawings, render, shot strip). Presentation goes to the Frame step; Model returns to
  the design step last used (`lib/step.ts` `lastModel`, kept for the session beside `lastBasic`). It changes the view,
  never the design (nothing to undo). **Key: V** toggles it (free of P, M, R, H, O, F, L, Esc, [ ]); the old 1 / 2 / 3
  keys stay as jumps to Massing, Schematic and Presentation (3 now lands in Presentation mode), so no test or hint
  that used them broke.
- **The phase row under the top bar is gone** (`ProcessRail.tsx` deleted; its step follow and first-open start moved to
  `App.tsx`): its 44 px and gap go to the model region. The phases are a compact list in the left panel's Workflow
  block (`PhasePanel.tsx` `PhaseList`): one 28 px row per phase of the mode, with its colour dot, its name and its fail
  / check counts (`lib/workflow/phaseCounts.ts`, summed from the trace's live digest per home phase, the same source as
  the builder's card summaries); the one you are in lit; a click or the arrow keys (Up / Down / Left / Right, Home, End)
  go there. The list keeps the `nav[aria-label="Design process"]` landmark and the `data-step` / `data-phase` /
  `aria-current="step"` buttons, so every existing e2e helper and test that drove the old row works unchanged. Back and
  Next (`PhaseNav`, beside the "You are in Form: 2 of 14 tools" line) walk the phases; Next from Schematic is
  Presentation and Back from Presentation is Schematic. The panel header keeps the phase name (h2) and adds the mode's
  fail / check totals. The Schematic x-ray lens still follows the Schematic phase through the step → stage follow.
- **Presentation's tools only in Presentation:** the dots line (`PhaseMap`), Add tool's "other phases" list and the
  tool rail show only the mode's phases; in Presentation the phase list is that one phase and the rail shows the five
  presentation tools (camera, capture, drawings, boards, AI render: `ToolRail.tsx` `PRESENT_TOOLS`, opening the Present
  or Render tab on the right through the new `lib/rightTab.ts`, or capturing). The present phase stays in every saved
  workflow and project file (nothing changed in the formats); the landing page and the workflow editor keep their
  present lane, now labelled **Presentation** (`PHASE_NAME`, `PHASES`, `STAGES`, the stage announcements).
- **Updated references:** the onboarding card (phase list, the switch, keys V / 1 2 3 / H / O), the user guide's stages
  section, `lib/step.ts` and `WorkflowOverview.tsx` comments; `e2e/tool-rail.e2e.ts` (Presentation via the switch),
  `e2e/workspace-gate.e2e.ts` (Model's four phases), `lib/workflow/builderModel.test.ts` (the Presentation label).
- **Both projects:** the new e2e drives the switch and the list on the competition site and on Real Vancouver.
- **Tests:** `tsc -b` PASS · `vitest run` 1,234 pass, 3 skipped (+5: `lib/mode.test.ts`, `lib/workflow/phaseCounts.test.ts`;
  the same 2 CRLF data-file checks fail in this worktree only) · Edge e2e: `e2e/model-presentation.e2e.ts` (new: the
  switch in the top bar, no phase row and the model region right under the top bar, four phases listed in Model and
  only Presentation in Presentation, present nodes absent from the dots line, the rail and Add tool in Model and
  present in Presentation, a phase dot navigates, Back / Next and the arrow keys, Next from Schematic lands in
  Presentation, Render from the rail opens the Render tab, Model returns to the last design step, V and 1 / 3 keys,
  Real Vancouver) PASS · `tool-rail` PASS · `phase-panel` PASS · `massing-edit` PASS · `journeys` PASS · `layout`
  (Massing, Schematic and Present at 1440 × 900, the boards / present check) PASS. Screenshots:
  `docs/evaluation/2026-11-17-model-presentation/01-model.png` and `02-presentation.png`.

# CHECKPOINT: the tool rail moves to either side of the model (17 Nov 2026)

Brief (Ruijie, 17 Nov, with a screenshot circling the rail): "I want to be able to control where it is placed with the
mouse, and snap it, maybe to the right side as well." Same branch `tool-rail`, same worktree. Not merged, not deployed.
- **The grip** at the top of the rail (`ToolRail.tsx`; a six-dot `GripVertical` in `icons/index.tsx`, "Move the tool
  rail" on hover/focus) drags the rail with mouse or touch (pointer events, pointer capture): the rail dims in place and
  a ghost of it follows the pointer over the model; the two edges of the model region show as dashed drop zones with
  the nearer one lit in the interaction colour; release snaps to the nearer edge with a 160 ms slide of the ghost (none
  under reduced motion); Esc during a drag puts it back. The rail keeps one place in the tree and moves by flex order
  (`order-first` / `order-last`), so a drag never remounts it. With the grip focused, Left / Right (or Enter) move it,
  announced in the live region ("Tool rail on the right").
- **Remembered** as `ts.toolRail.side` beside `ts.toolRail.hidden` (`lib/toolRail.ts`, `setToolRailSide`); hidden, the
  Show button sits on the remembered side, its chevron pointing into the model. Hover panels open toward the model
  (`IconTile` `tipSide="left"` when the rail is on the right).
- **No overlay shifting was needed:** the rail is a flex column of its own beside the model region on either side, never
  over it, so the tower toolbar, the View / Legend strip, the north chip and the Layers tab keep their places and are
  never under it (checked in the screenshots). On the right it sits between the model and the Inspector.
- **Key hints fixed:** the onboarding card now says H hide tool rail · O hide overlays (`Onboarding.tsx`);
  `DESIGN_HANDOFF.md` says O for the overlays and H for the rail.
- **Tests:** `tsc -b` PASS · `vitest run` 1,231 pass, 3 skipped (+3 in `lib/toolRail.test.ts`: default, remembered
  side and hidden, bad value; the same 2 CRLF data-file checks fail in this worktree only) · Edge e2e:
  `e2e/tool-rail.e2e.ts` extended (drag the grip to the right with the mouse while the right drop zone lights, the rail's
  box at the model region's right edge, hover panel opens to the left, the Show button on the right, a reload keeps the
  side, Esc cancels a drag, Left on the grip brings it back and is announced) PASS · `e2e/phase-panel.e2e.ts` PASS ·
  `e2e/massing-edit.e2e.ts` PASS. Screenshots: `docs/evaluation/2026-11-16-tool-rail/03-tool-rail-dragging.png`
  (the ghost and the lit zone) and `04-tool-rail-right.png`.

# CHECKPOINT: the tool rail beside the model (16 Nov 2026)

Brief (Ruijie, 16 Nov): Sinnie Choi's build of the Toolkit put the design tools in one vertical column of icons beside
the view; bring that layout into the main tool. Branch `tool-rail` from `main`, in its own worktree. Not merged, not deployed.
- **What it is:** a 48 px column on the model's left edge, between the left panel and the 3D view
  (`src/components/ToolRail.tsx`), in Massing and Schematic on the guided route (`App.tsx`). Icon tiles only
  (`IconTile.tsx` gains `layout="icon"` and a `tipSide="right"` hover panel): the full name and what the tool does show
  on hover or focus, nothing is written beside the icons. On top, the ways of editing on the model: Place (`store.placing`,
  P), Move and Rotate (`lib/towerEdit.ts`, M and R; the selected tower is picked first) and, while the Massing tool is on
  the Form step, Face and Mass (`lib/blockEdit.ts`, F; `MassingEditPanel.tsx` exports `EDIT_MODES`); a hairline; then the
  step's design tools. The open tool and a mode that is on wear a ring in the interaction colour. A `role="toolbar"`
  named "Design tools", vertical, with a roving tabindex: the arrow keys walk it, Enter or Space acts.
- **One source for the panel and the rail:** the step's tools and the open one moved out of `tools/ToolPanel.tsx` into
  `tools/toolPick.ts` (`resolveTools`, pure, and `useToolChoice`; the pick is still `ts.tools.active`), so a click in the
  rail opens the tool in the panel and the two never list different tools. A rail click also puts the phase panel on
  its design node when a check's settings were open (`usePhaseTools.setActive`). The left panel is unchanged otherwise.
- **H hides and shows the rail** (`lib/toolRail.ts`, remembered as `ts.toolRail.hidden`); hidden, a 20 px Show button
  stays at the model's edge; the rail's own Hide button is the pointer's way. H used to hide the viewport overlays
  (`ViewportDock.tsx`): that moved to **O** (its two buttons and `e2e/rhino-import.e2e.ts` say so).
- **Tests:** `tsc -b` PASS · `vitest run` 1,228 pass, 3 skipped (+3 in `tools/toolPick.test.ts`; the same 2 CRLF
  data-file checks, heightPolicy and registry, fail in this worktree only) · Edge e2e: `e2e/tool-rail.e2e.ts` (new:
  rail geometry, tiles = the panel's tools, modes first then a divider, Massing from the rail opens in the panel and
  back, Mass / Face / Move from the rail, hover name, arrow keys and one tab stop, H and the Show button with a reload,
  no rail in Present) PASS · `e2e/phase-panel.e2e.ts` PASS · `e2e/massing-edit.e2e.ts` PASS. Screenshots:
  `docs/evaluation/2026-11-16-tool-rail/01-tool-rail.png` and `02-tool-rail-hidden.png`.

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
