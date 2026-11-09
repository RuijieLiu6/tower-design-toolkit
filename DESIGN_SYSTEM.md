# Tower Design Toolkit: design system

*Version 1.0, 7 Nov 2026, from Ruijie's brief "a consistent visual and interaction system across the entire website". It supersedes the colour, type, corner and glass rules of [DESIGN_HANDOFF.md](DESIGN_HANDOFF.md) (22 Oct). That file's layout logic still holds. Agents making icons or interface code start from the published style pack: [public/style-pack/node-icons/v2/](public/style-pack/node-icons/v2/) (`COMPONENTS.md`, `ui-tokens.json`, `NODE_ICON_STYLE.md`).*

The platform should feel **intelligent, vibrant, clean, precise and credible**. Every visual decision below serves one of those qualities. Use this table in design reviews: a proposed effect that supports none of them goes.

| Goal | What users see | Where it lives |
|---|---|---|
| Intelligent | Relationships and consequences are visible. Selecting a node, object or result highlights what it relates to, and suggestions say what they will change. | AI proposal scope line (`WorkflowAssistant.tsx`), selected-wire tips (`Intro.tsx`), 3D selection with property panel |
| Advanced | Complex functions stay organised. Processing, completion, missing inputs and outdated results look the same everywhere. | Status family (§3.3), results states, run states in Customize |
| Clean | The current task and next action are found at once. | Stable layouts, opaque surfaces, one primary action per context, short labels, help behind "?" |
| Vibrant | The colourful architectural character stays. | Node artwork, phase markers, category bars, selected actions, data displays |
| Precise | Numbers, units, states and directions compare easily. | Tabular numerals, units beside values (`lib/units.ts`), arrowed connections, one selection style |
| Credible | Known, proposed, calculated and missing are told apart. | Evidence flags, AI suggestion tag, "Needs model" never a pass or a zero, sources on demand |

## 1. Where the system lives

| Layer | File | What it holds |
|---|---|---|
| CSS tokens | `src/index.css` `@theme` | Colours, type scale, corners, shadows, easing. Tailwind turns them into classes (`bg-panel`, `text-muted`, `text-success`, `bg-site-surface`, `rounded-lg` …) |
| JS tokens | `src/lib/design/tokens.ts` | The same values for code that draws (3D, SVG wires, charts): `UI`, `PHASE_COLOR`, `STATUS`, `MODEL`, `DATA`, `RADIUS`, `SPACE`, `MOTION` |
| Guard | `src/lib/design/tokens.test.ts` | Fails if CSS and JS drift, or if a core colour pair drops below WCAG AA |
| Legacy names | `--color-glass-*`, `--color-chrome`, `--color-paper`, Tailwind's red/emerald/amber/slate/blue | Kept as aliases of the roles below, so older components follow the tokens without editing each one |

A change to an approved token changes every component that uses it. Components never hard-code a colour that has a role.

## 2. Foundations

### 2.1 Type: Inter Variable throughout

| Role | Token | Size / line | Weight |
|---|---|---|---|
| Landing heading | `text-display` (`text-display-sm` narrow) | 42/48 (32/38) | 600, −0.02em: the only tightened text |
| Workspace page heading | `text-page` | 24/32 | 600 |
| Panel or section heading | `text-section` | 18/26 | 600 |
| Body, AI input | `text-body` | 16/24 | 400 |
| Controls, node names | `text-control`, `text-node` | 14/20 | 500 |
| Secondary metadata | `text-meta` | 12/16 | 400–500 |

Nothing is set under 12 px. Essential instructions and results stay at body or control size. Comparable values use tabular numerals: `td`, `th`, number inputs and `[data-num]` get them by default. Units sit right next to their value, and `lib/units.ts` converts m / ft / mm.

### 2.2 Spacing, surfaces, corners, shadows, motion

- **Spacing:** 4, 8, 12, 16, 24, 32, 48 px (Tailwind 1, 2, 3, 4, 6, 8, 12).
- **Surfaces:** the page is the cool canvas `#F7F8FA` with a faint, still light. Everything that holds text or controls is an opaque white panel (`bg-panel`), separated by a `#D9DEE7` hairline and spacing, not by shadow. Quiet groups use `bg-subtle` `#F0F2F5`.
- **Corners:** 8 px controls (any button, input, tab, radio or switch, whatever class it was written with), 12 px panels and node tiles, 16 px floating dialogs. `rounded-full` stays round: dots, badges, switch knobs.
- **Shadows:** only for what floats. `shadow-tile` for raised node and tool tiles; `shadow-float` for menus, popovers, tooltips and dialogs. Panels over the 3D view (`.glass`) get a faint lift.
- **Focus:** one 2 px blue ring with a 2 px gap on every focusable element.
- **Motion:** 120–300 ms with `ease-standard`. It explains a change: a node landing, a wire drawing in, a panel opening, a suggestion applied. Nothing moves under reduced motion. The cover's 10-second "run" dots were asked for (7 Nov) and stop under reduced motion.

## 3. Colour by meaning

Four roles that share one character and never stand in for each other.

### 3.1 Interface

| Role | Value | Token / class |
|---|---|---|
| Canvas | `#F7F8FA` | `bg-canvas` |
| Panel | `#FFFFFF` | `bg-panel` |
| Subtle surface | `#F0F2F5` | `bg-subtle` |
| Primary text | `#202630` | `text-ink` |
| Secondary text | `#5F6875` | `text-muted` (5.6:1 on white) |
| Primary action | `#2563EB` / hover `#1D4ED8` | `bg-accent` button: solid blue, white text |
| Selected surface | `#EAF1FF` | `bg-ink` button, `bg-selected`: pale fill, blue text, blue keyline |
| Decorative divider | `#D9DEE7` | `border-line` |
| Control boundary | `#778294` | inputs, selects, textareas; ordinary buttons on hover (3:1+) |
| Default workflow edge | `#66758A` | `UI.edge` |
| Selected edge, focus | `#2563EB` | `UI.accent`, the focus ring |
| AI suggestion | `#0E7490` on `#ECFAFD`, line `#9BDCEA` | `text-ai`, `bg-ai-surface`, `border-ai-line` |

**Blue means interaction and selection, nothing else.** A selected item and an action button differ in fill and shape. Anything that marks its state with `aria-selected`, `aria-checked` or `aria-pressed` but was written with the action fill gets the selected look automatically.

### 3.2 Workflow phases

| Phase | Accent | Surface | Dark text | Artwork tones (top, left, right) |
|---|---|---|---|---|
| Site | `#00A9D6` | `#E7F7FC` | `#006B85` | `#73D0E8` `#00A9D6` `#0084A7` |
| Form | `#FF6B4A` | `#FFF0EB` | `#A93920` | `#FFAE9B` `#FF6B4A` `#C7533A` |
| Program | `#F4C430` | `#FFF8DD` | `#785A00` | `#F9DF8D` `#F4C430` `#BE9925` |
| Schematic | `#8B5CF6` | `#F3EEFF` | `#5B21B6` | `#BFA5FA` `#8B5CF6` `#6C48C0` |
| Present | `#E145C2` | `#FDECF8` | `#9B227C` | `#EE99DD` `#E145C2` `#B03697` |

Bright accents go on artwork and bounded highlights. The dark companion is for small coloured text. A node keeps its phase colour wherever it moves in a workflow: position and category are separate properties. Phase colours never become building-use colours.

### 3.3 Status

| Kind | Colour | Surface | Used for |
|---|---|---|---|
| Success | `#147D50` | `#E7F4ED` | Pass; Complete |
| Warning / attention | `#946200` | `#FDF4DD` | Check; needs attention |
| Error | `#C9363E` | `#FDECEC` | Fail; could not run |
| Pending / missing input | `#5F6875` | `#F0F2F5` | Waiting for input; Needs model; not run |

Status always comes with a symbol and a short word, never colour alone.

**Execution status is not an assessment.** "Complete" means a process finished; "Pass" means a check met stated criteria. When no building model exists, a check says **Needs model** (or **Waiting for input**). It never shows a pass, and it never shows a zero.

Evidence flags (Verified, Team assumption, Unverified, Unresolved, False assumption) are a fifth, credibility-only set, always icon + word.

### 3.4 Landing atmosphere (`landing.atmosphere`)

The landing page's mood is warm, coloured light: one static, responsive gradient of large soft fields.
- **Ivory and cream** fill the middle, where people read.
- **Peach and coral** sit at the lower left and along the bottom.
- **Rose** runs through the lower centre.
- **Lavender and soft blue** sit on the right.
- **A little pale sky** runs along the top.

The colours are strongest at the edges and soften behind the heading, workflow and assistant. A very fine grain at 3.5% stops banding.

| Field | Value |
|---|---|
| ivory, cream | `#FFFAF2`, `#FDF0E1` |
| peach, coral | `#FFC4A0`, `#FF9473` |
| rose | `#F3A3C4` |
| lavender, soft blue | `#C8B6F3`, `#A6BDF6` |
| pale sky | `#CDE6FB` |
| ivory reading surface | `#FFFDF9` |

These are CSS `--atmo-*` and JS `LANDING.atmosphere`, used by `.landing-atmosphere`. They are **mood only**. They never mark:
- a phase;
- an action or a selection;
- a status;
- a model material or a data scale.

A test fails if one of them equals a functional colour.

Functional content on the landing page stays on stable white or ivory surfaces, with charcoal text and blue actions:
- the workflow card;
- the assistant;
- menus and inputs.

Gradients are a landing-page brand treatment. An AI suggestion keeps its own tag and container (§5). A welcome or empty-state screen may use a lighter version. The workspace, analysis panels and results stay calm on the neutral canvas.

### 3.5 Building model and data

See §6 (3D) and `DATA` in `tokens.ts`:
- **sequential** (`#FFF8E1` → `#8F3D0B`, warm, so the blue selection outline stays visible) for increasing quantities;
- **diverging** (rust ↔ neutral ↔ blue) for above and below a reference;
- **categorical** (eight distinct hues) for uses and types;
- **missing** `#9AA3AF`, shown as a hatch, never as zero.

## 4. Components and their states

States: default, hover, keyboard focus, selected, disabled, loading, empty, error, where they apply. Reuse these; don't restyle them locally.

| Component | File | States and rules |
|---|---|---|
| Primary / ordinary / selected button | `bg-accent` / `bg-panel` / `bg-ink` classes | Hover darkens (primary) or shows the boundary (ordinary); focus ring; disabled at 40% opacity |
| Node tile | `components/NodeTile.tsx` + `.node-tile` / `.node-hit` CSS | One white tile per size (52 / 40 / 30 px), `shadow-tile`. Hover lifts 1 px; focus: white gap + blue ring; selected (`data-selected`): blue ring; soft (available) and off (not used) desaturate the artwork, never the tile |
| Node artwork | `components/icons/nodeArt.tsx`, `components/nodeIcons/NodeArtwork.tsx` | Built art, else the user's icon (generated or uploaded), else the approved fallback. Artwork only: the platform owns frame, padding, rings, badges and handles |
| Tool tile | `components/GlassIcon.tsx`, `IconTile.tsx` | Opaque white tile, coloured glyph, no glow; soft and off desaturate |
| Status row / chips | `components/StatusRow.tsx`, `ui.tsx` (`StateChip`, `FlagChip`) | Status family + symbol + word |
| Help "?" | `components/Help.tsx` | Opens on hover, focus or tap; stays while the pointer moves into it; Escape closes |
| Fold | `components/Fold.tsx` | A self-sufficient summary; details on demand |
| Dialog | `role="dialog" aria-modal` + `bg-panel` | Opaque, 16 px corners, `shadow-float`, focus trapped, Escape closes |
| Menu / listbox / popover | `role` + `bg-panel` | `shadow-float`; options show the selected surface |
| Workflow assistant | `components/landing/WorkflowAssistant.tsx` | Idle, loading model, ready, keywords-only; proposal (AI tag, scope, why?), applied (Undo), clarify, explain |

## 5. Patterns

- **Minimal text, help on demand.** Visible:
  - the current task or view;
  - the selected preset or workflow;
  - important names;
  - key values with units;
  - the current status;
  - the main action.

  Everything else (explanations, secondary actions, instructions) appears on hover, keyboard focus or touch, through `Help`, `Fold` or contextual tips that stay readable while the pointer moves over them.
- **AI suggestions.** A small **AI suggestion** tag on a pale cyan container, with:
  - its scope ("Adds 2 nodes, changes 1 connection.");
  - the affected nodes previewed on the canvas (cyan outlines);
  - why it was suggested, behind "?";
  - Apply, Discard, then Undo.

  Suggestions never look like applied work or calculated results. Activity indicators show only real activity, and no confidence number is shown, because there is no meaningful basis for one.
- **Connections and loops** (cover workflow):
  - Connection handles appear when a node is engaged, with "Connect nodes" and "Connect back to create a loop."
  - "Create loop" appears on a valid return target.
  - Return connections are neutral and dashed, with a return mark. On the cover the wires carry no arrowheads (Ruijie, 7 Nov): direction reads from Start to Enter, the run dots and the return mark. Every 10 s a run of dots travels Start → Enter at a normal pace and goes round each loop twice before moving on (`lib/coverRun.ts`). When it arrives, and about a second after each edit to the workflow, the Enter tile pops with one ring ripple, so people see where to click next. With reduced motion there are no dots and Enter shows a steady ring. Customize's data wires keep their arrows.
  - The selected wire turns blue and offers Remove, with Undo.
  - There is no global Loop action.
- **Two graphs, stated.**
  - The cover is the **workflow graph**: the order you work in, which may loop.
  - Customize is the **data graph** ("Data connections"): a wire means a node reads another node's output. Its wires are coloured by data type, and it cannot loop.
- **Continuity.** Returning to the start page restores the active workflow: nodes, connections, return connections, name and preset (`lib/coverWorkflow.ts`). A fresh default appears only after "New".
- **One welcome.** The cover is the welcome. Entering through it marks the workspace's first-visit dialog as seen. The guide and the tour stay in the top bar.

### 5.1 The workspace: one hierarchy in every phase (revised 8 Nov, overnight brief)

This section replaces the 8 Nov layout that kept a permanent whole-workflow strip at the bottom. The workspace audit found that strip duplicated navigation. The whole workflow now opens only on demand, through **Overview**.

| Area | Where | Holds |
|---|---|---|
| Project bar (52 px) | `components/TopBar.tsx` | The name, the project (Competition site / Real Vancouver), the project file with Undo / Redo, Export model. On the right: the view (model, model + data graph, data graph), **Auto-run checks**, **Edit workflow** (the workflow editor; it was "Assistant") and **More**. More holds the check library, role, units, reduce motion, Customize, Options, How it works, the tour, Build status and Sources. It is never another phase selector. |
| Phase row (44 px) | `components/ProcessRail.tsx` | Site, Form, Program, Schematic, Present, once each, with their colour dots; the arrow keys move between them. **Overview** sits at the right edge. There are no counts and no second "Next" control. |
| Left panel (about 288 px, adjustable 240–440 px) | `components/workflow/PhasePanel.tsx` | Header: the phase name, Import, Export, Hide. Then **Workflow** (the header is the button into the editor), a **map of the whole workflow** (every tool as a dot in working order, coloured by phase, the current phase tinted, loops as arcs; a dot opens its tool) and this phase's tools in a **bounded region** (about 216 px) that scrolls on its own. Then the open tool's controls, in their own scroll area. A long workflow never pushes the controls out of reach. |
| Centre | the 3D view | The shared model. Top left: the open tool's **working view** and any **pinned context** (`components/ContextPins.tsx`). In Real Vancouver the map bar has **Viewcone** (cones start hidden: a quiet Site view; a view tool shows them) and **Names** (neighbourhood names, remembered). The workflow editor takes this place while it is open. |
| Right panel (about 304 px, adjustable) | `components/RightPanel.tsx` | The open tool's results and evidence, Your site, Trace. |
| Status line | `components/StatusBar.tsx` | The data attribution (always visible) and an **Evidence key** button. The full key is disclosed on request. |

**Space.**
- At 1440 × 900 the model gets at least 55% of the width and 70% of the height; at 1280 × 800 the panels narrow to 264 / 280 px (`--left-w` / `--right-w`) before any type shrinks.
- Gaps are 8 px.
- Drag the edge between a panel and the model, or focus it and use the arrow keys (Home / End for the limits, double-click or Enter to reset). The width is remembered.

**The workflow editor** (9 Nov, replacing the 8 Nov Overview over the whole workspace).
- It is closed on entry. It opens from the panel's **Workflow** header, the phase row's **Overview** and the bar's **Edit workflow** (formerly "Assistant"), and takes the **centre view only**: the phase panel and the results stay beside it and follow every change.
- It shows the same **five phase lanes** as the landing page, the phase you are in tinted ("You are here"): each tool in its phase's lane, in working order from left to right, return paths as dashed arcs.
- **Add**: drag a tool up from the shelf under the lanes. The **best place** lights up at once (after the last tool of its phase, or of an earlier one), and a drop anywhere in the lanes puts it there. A click on a shelf tool puts it in the best place.
- **Connect**: hover a tool for its **four connection points** (as on the landing page, with the "Connect nodes" tip). Drag from one to another tool; dragging back to an earlier one shows "Create loop". Click a point (or press Enter on it) to choose the target instead; select a wire to remove or reconnect it.
- **Arrange**: drag a tool to a gap; ← / → move a focused tool, Delete takes it off; click a tool for Open in workspace, Move before / after, Connect to…, Remove.
- Every change applies at once, with Undo / Redo. **Confirm workflow** (also Esc, or **Enter** at the end of the lanes) returns to the design and restores the phase, each phase's open tool and the results shown; **Discard changes** puts back the workflow the editor opened with. Inside the editor an add needs no separate confirmation: Confirm or Discard settles every change at the end. The panel's quick **Add tool** still asks first (`AddConfirm.tsx`).
- **Suggest** opens the word field: its proposal is previewed on the lanes (AI tag, cyan) and applied or discarded.

**One workflow.** The landing page, the phase panels and Overview all edit the same project workflow, with stable node ids, phase placement (`usePhaseTools.placed`) and links. Each view keeps its own layout.

**Tool context.**
- Opening a tool sets its **working view** (`lib/workflow/toolView.ts`):
  - Geometry for Site, Massing, the sun preview, the view-cone tools and the public-realm tools;
  - Building use for Program, FSR, Value and interior;
  - the tool's own quantity in Analysis for Solar access, Wind and Sun on surfaces.
- **Pin view** keeps the current View while you switch tools.
- Anything drawn that the open tool doesn't own is labelled **Pinned context: …**, with a one-click hide. This covers a pinned analysis layer, Real Vancouver's protected view cones and the height-limit surface.
- Opening a tool never switches a check on or runs one.

**View and calculation are separate.**
- The View control reads **View: Geometry / Building use / Analysis / Materials**; the stored ids stay massing / program / analysis / materials.
- In Analysis, the quantity radios only choose what is drawn.
- A quantity whose check is off or paused says "not computed", and offers its own labelled action ("Switch on Solar access", "Turn on auto-run"). Another quantity is never drawn in its place.
- **Auto-run checks** (the old "Analysis On/Off") says what it controls: checks recompute with the model, or pause.

**Results say what they mean.** A preliminary result shows these as distinct items:
- the calculated number;
- the outcome under its assumptions (Value: "Estimated residual below the assumed land price", never "Doesn't work");
- the method's status ("Preliminary estimate");
- the evidence flag;
- the model revision it was computed for.

**Type and colour (this layout).**
- Primary controls, tool names and field values are 14/20; panel and phase headings 18/26; explanations 16/24; metadata 12/16.
- The shell is warm ivory (`--color-shell` #fbf8f3) with faint peach and lavender only at the perimeter (`.workspace-shell`).
- Panels, menus and the model frame stay opaque white. Real Vancouver's controls use the shared tokens (`CHROME` in `lib/vistaLook.ts`); the map's own palette stays.

### 5.2 Loading and moving in the 3D view

- **Map loading:**
  - While the Real Vancouver map downloads, a bar below the map tabs shows how much has arrived and what is loading, in plain words. One load is one climb from 0 to 100%.
  - Bytes are counted against the manifest's file sizes (`lib/loadProgress.ts`).
  - The bar fades out when done, and says so if a part could not load.
- **Moving a tower:** the move card shrinks to one line: the name, the distance, any snap, and the checks as ✓ ! ✕ ? counts. The rows open on request after release, and the full results stay in the right panel.
- **A chosen view is kept:** a camera request or preset stops any camera flight still on its way. Data arriving later never re-frames the view you chose; only opening the Position tool, locking it, or Frame does.

### 5.3 Navigating the model (Milestone 1, 9 Nov)

Camera, display and layers are three separate controls: **where you look** (the View menu, the map tabs City / Observer / Inspect / Plan, the compass), **how the model is drawn** (View: Geometry / Building use / Analysis / Materials) and **what is shown** (Show: Viewcone, Names; Layers).

- **The View button** (top right in both projects, under the compass in Real Vancouver) names what the view shows: City (Context on the competition site), Neighbourhood, Site, Tower, Close-up, Plan or Viewpoint, from the ground width at the orbit target and what is near it. Its menu repeats it in a sentence with the width ("Your site and its streets, about 290 m across").
- **Commands** (`lib/viewNav.ts`), each framing real geometry, keeping the current bearing and a tilt between 35° and 72°:

| Command | Key | Frames |
|---|---|---|
| Frame site | S | the study boundary and any tower on it; at least about 260 m across, so the streets show; works with no tower |
| Frame selection | . | the inspected building, the buildings picked on the map, the picked tower, or the address marker |
| Frame tower | T | the selected tower; unavailable with no tower, or with several and none selected (the reason shows under the item) |
| Neighbourhood | N | about 900 m around the site or the selection, at 45° |
| City overview | C | Vista's Vancouver overview (the competition site: its context overview) |
| Plan view / 3D view | 7 | north up, straight down over the selection or the site (at least 400 m across); and back to a 50° view of the same place |
| Home | Home | the view set as Home for this site (Set this view as Home), else the site from the south at 40° |

- **Fit:** the subject fills 70% of the part of the view the overlays leave free (about 15% of breathing room each side), with the overlays marked `data-nav-occlude` (map tabs and working-view chip at the top, the View and legend bar at the bottom, an open Layers dock on the right) taken out first.
- **Moves:** 0.7 s ease in-out (0.8–0.9 s for the overview and Home), instant under reduced motion. Grabbing, scrolling or a key on the view stops a move. The zoom buttons and + / − zoom about the orbit target.
- **Keyboard:** the model is a focus stop: arrows pan, Shift or Ctrl + arrows orbit, + / − zoom (the arrows stay the tower gizmo's while it moves or turns a tower). The command keys work while the focus is on the page or the model, never in a field, a menu or a dialog.
- **Off-screen site:** when the site is out of view, a small "Site" pointer on the view's edge points to it (never under the controls); a click frames it.
- **Kept views:** the view stays through phase changes; each project keeps its last view while you switch projects; a camera request is never replayed after a switch; the delayed framing when Real Vancouver opens never overrides a view you chose meanwhile. Esc leaves Plan (to the 3D view of the same place), Inspect and Observer.

## 6. 3D building and site

Starting values (`MODEL` in `tokens.ts`), checked under the scene's light:
- background `#F2F4F7`;
- proposed building `#E8ECF1` with readable `#66758A` edges;
- context `#C7CDD5`, at lower emphasis;
- ground `#E3E7EC`;
- selection: a blue outline with a white keyline that keeps analytical surface colours.

Modes are views of one model, always labelled, and they keep object identity and selection:
- **Massing**: geometry, height, proportion;
- **Program**: uses in a labelled categorical palette;
- **Analysis**: one quantity with its units, range and legend; missing data hatched;
- **Materials**: only where supported.

Neutral inspection lighting is separate from the analytical sun. When sun or shadow is shown, its date, time and settings sit next to the view.

Built on 7 Nov:
- **Display modes:**
  - `lib/displayMode.ts` and `components/DisplayModeSwitch.tsx` provide one switch for Massing, Program, Analysis and Materials. It replaces the old Plain/Program and Context controls.
  - Building uses come from `DATA.categorical`. Materials is disabled, with its reason, where the project has none.
  - Picking Solar access, Energy & carbon or Wind screen opens Analysis on that layer.
- **Selection:** a blue outline over a white keyline (`TowerGizmo`), with no recolouring.
- **Analysis:**
  - Sun hours and sun on surfaces use the sequential scale.
  - Hours lost use the losing half of the diverging scale, because a design can only remove sun.
  - Cells under buildings are hatched as "no data". Zero is drawn as zero.
  - Each legend gives the quantity, units, range and a fixed scale.
- **Lighting:** a neutral inspection light; with Sun & shadow on, a chip beside the switch shows the date, time and sun angle.
- **Labels:** every scene label has a compact backing plate.

Still to do:
- **Results-panel colours:** the wind level colours, which should use one ordered scale, and the solar loss legend's "0 h" start.
- **Overlays not yet audited:** the height surface, relaxation masks, view cones and public-realm overlays.
- **Vista:** its map tabs and caption keep the older warm style.
- **Imported towers:** no Vista shading for them in the city.
- **Proposed building contrast:** it should stand out more against the context when it is not selected. The starting value for the context could be darker; check it under the scene light.

## 7. Node artwork and custom nodes

Style pack v2 holds the rules for agents and people: [public/style-pack/node-icons/v2/](public/style-pack/node-icons/v2/).
- **Style:** one isometric family, light from the upper left, three tones per material, the phase accent on the node's task.
- **Size and framing:** a 512 px transparent master with the ground plate at 85% of the width.
- **Colour:** no interface blue and no status colours in artwork.

For user-created nodes, the node builder's **Icons** tab offers:
- **Generate** in the toolkit style (a brief drawn by `lib/nodeIcons/generate.tsx`);
- **Upload** an original (checked by content, size, dimensions and render, then by five visual checks; Fit by default, Crop on request);
- **Match toolkit style**, which saves a separate copy and keeps the original.

Style versions never change saved icons: style 1 icons keep drawing with style 1's colours.

## 8. Intentional differences and rollout status

| Where | Difference | Why |
|---|---|---|
| Present stage | Darker review wall around the A2 board | The board reads as a print on a wall; the board itself follows the system |
| Boards, drawings viewers | Dark full-screen viewers | Same reason; their content keeps the drawing conventions (hatch, poché, crop marks) |
| Cover | Larger type, phase lanes, the 10-second run dots | The welcome and the workflow builder; the dots were asked for and stop under reduced motion |
| Aerial and map imagery in Real Vancouver | Photographic colour under the model | Context data; overlays and the model follow §6 |

*Rollout status and remaining isolated values: see the inventory below (updated at each release).*

### Inventory, 7 Nov 2026

| Area | Status | Notes |
|---|---|---|
| Tokens, type, corners, shadows, focus | Done | `index.css`, `lib/design/tokens.ts`, contrast-tested |
| Buttons and selected states | Done site-wide | By CSS meaning (`bg-accent`, `bg-ink`, `bg-panel`, ARIA selected states); stage tabs, tool chips and segmented controls moved off the action fill |
| Older colour classes | Mapped | Tailwind red, emerald, amber, slate and blue now resolve to the roles. About 600 hex literals remain in 68 files, mostly drawings, 3D, boards and figures, where they are drawing conventions or data. Replace them as each file is next touched |
| Type floor 12 px | Done | Every `text-[<12px]` lifted to `text-meta` |
| Landing (cover) | Done | Atmosphere; ivory workflow card; phase dots instead of tinted lanes; heading; compact assistant with two examples; one-line presets; no arrowheads; phone strip under 640 px |
| Workflow assistant | Done | AI tag, cyan container, scope line, "why" on demand, Apply / Discard / Undo |
| Workflow editor (cover) | Done | Neutral wires, dashed returns, blue when selected, blue handles, AI-proposed nodes in cyan |
| Workspace phases (8 Nov, revised overnight) | Interface pass in progress | Phase row + Overview on demand, bounded phase panel, tool working view and pinned context, per-phase Import / Export (§5.1). Form's example (Massing, Sun & shadow, Wind screen, return to Massing) is tested end to end (`e2e/phase-panel.e2e.ts`); the other phases use the same panel, untested beyond layout |
| Data graph (Customize) | Done | "Data connections" with its purpose behind "?"; wires by data type; selected wire blue |
| Results and status | Done | `lib/status.ts`, `lib/missingInput.ts`, `ResultState.tsx`: symbol + word, Complete ≠ Pass, Needs model / Waiting for input (no-tower test), an error card and error boundary |
| Node library and custom icons | Done | Icons tab, style pack v2 (`COMPONENTS.md`, `ui-tokens.json`), own nodes show their icon in the bar, ribbon, library and inspector |
| 3D model | Mostly done | See §6 |
| Options page, City in Nature ledger rows, imported community nodes | To do | They don't yet show "Needs model" for a missing model |
| Boards, drawings, Sources, Guide | Partly | Covered by the palette remap; no dedicated pass yet |
| Exported analytical views | To do | Captures don't yet carry the legend and units |

Verification:
- `npx vitest run`: all unit tests, including the token, contrast, no-tower and display-mode tests.
- The Playwright browser suite, including the axe WCAG 2.1 A/AA checks and the node-icon editor.
- Headless screenshots of the five representative views at 1440, 768 and 390 px wide.
