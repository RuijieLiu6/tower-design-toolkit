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

### 5.1 The workspace: five phases, two levels (8 Nov)

The workspace follows the start page's five phases. It has two levels, with the whole workflow along the bottom. Only the phase row selects a phase:

| Level | Where | Shows |
|---|---|---|
| Phase | The **phase row** under the top bar (`components/ProcessRail.tsx`) | Site, Form, Program, Schematic, Present, each with its colour dot and the number of its checks that are on; Next; **Library** (every check's switch); Analysis on/off |
| Phase workflow and tool | The **phase panel** on the left (`components/workflow/PhasePanel.tsx`) | The phase's own part of the project workflow, top to bottom in working order; below it, the open tool's controls |
| Whole workflow | The **workflow strip** along the bottom (`components/workflow/WorkflowOverview.tsx`) | Every phase's tools in one row (the current phase underlined in its colour, the open tool in blue); **Expand** and **Edit** |

- The stage tabs (Massing, Schematic, Present) are gone. The stage follows the phase; keys 1–3 still jump to a stage.
- **The phase panel.**
  - Header: the phase name, **Import**, **Export**, Hide.
  - Workflow: one row per tool (artwork, name, kind). Forward wires are short arrows between rows. Return paths are dashed arcs in the left margin, nested by span. Links to other phases are chips: "From Site / Site", "Then Program / FSR", "↻ Return to Form / Massing".
  - The phase's design node (Site, Massing, Program, Core & plates, Frame) always leads the list. If it is not in the workflow yet, it joins at the first edit.
  - **Add tool**: this phase's tools first, "Available in other phases" on request, and **My tools**. A custom tool shows what it declares: inputs, outputs (metrics), parameters, version and licence. Build your own tool and Import a tool file sit there too. A tool added to another phase is shown where it was put (`usePhaseTools.placed`).
  - **Edit**:
    - Drag handle, which also accepts the arrow keys. Move up / down. Connect / loop… (a list: this phase, other phases, the end; an earlier tool makes a return path). Remove.
    - × on any connection chip. Undo / Redo. Done.
  - The open tool:
    - A design node opens its design tools (`ToolPanel embedded`).
    - A check opens its own settings here (`NODE_CONTROLS`) and its results in the right panel.
    - A custom tool opens what it declares.
    - Present's Frame shows the captured shots.
- **The workflow strip** (`components/workflow/WorkflowOverview.tsx`, Ruijie 8 Nov: "still have the overview workflow underneath with option to expand and rearrange the node order"):
  - Compact: one row of every tool.
  - **Expand** opens it upward with the model still in view: the main line, branches, return paths arcing above, and Fit. It edits directly:
    - drag a tool to a gap to move it (the gaps light up; Undo takes it back);
    - the **Add tools** row under it lists every tool not in the workflow, one phase at a time (the current phase first; a search looks through all). Drag one up into a gap, or click it.
  - **Adding asks first** (Ruijie, 8 Nov). A card (`AddConfirm.tsx`) names the tool, where it goes (a "Goes after" list to change it, with the spot pulsing in the workflow) and which phase panel it will show in. It says its check switches on, then offers Add to workflow or Cancel. The phase panel's Add tool uses the same card. Moving, connecting and removing still apply at once, with Undo.
  - **Edit** adds Move before / after, Connect to…, Remove, Reconnect, the assistant's proposals, Redo and Save as preset.
  - A tool rearranged here moves in its phase panel at once, and the other way round.
  - Outside Edit, a click opens the tool in its phase.
- **One workflow.** The start page, the phase panel and Overview all read and edit the same project workflow (`lib/workflow/projectWorkflow.ts`), each in its own layout.
- **Navigation, working order and execution stay apart.**
  - Opening a tool runs nothing.
  - A loop is a route for revisiting work and never reruns anything.
  - Checks run with the model while Analysis is on.
  - Adding a check to the workflow switches it on. Taking it off switches it off, and its results, model and inputs stay.
- **Import / Export, per phase** (`components/workflow/PhasePorting.tsx`):
  - **Phase package** (`tower-studio-phase@1`, `lib/workflow/phasePackage.ts`) carries:
    - the phase's tools, connections and return paths, and its links to other phases;
    - its settings and geometry;
    - units, origin, north and datum;
    - the results with the model revision they belong to;
    - tool versions.

    Importing opens a preview first. It lists every tool as new, already here, taken off, or not in this app; the connections; the settings and model it would take; and whether its results belong to the same model. Then **Merge** (adds; settings and model only if ticked) or **Replace** (this phase only; settings and model ticked by default).
  - **Model snapshot**: the whole project file.
  - **External format**: .3dm, OBJ, glTF out; .3dm, OBJ, glTF, IFC in through the model import.

### 5.2 Loading and moving in the 3D view

- **Map loading:**
  - While the Real Vancouver map downloads, a bar below the map tabs shows how much has arrived and what is loading, in plain words. One load is one climb from 0 to 100%.
  - Bytes are counted against the manifest's file sizes (`lib/loadProgress.ts`).
  - The bar fades out when done, and says so if a part could not load.
- **Moving a tower:** the move card shrinks to one line: the name, the distance, any snap, and the checks as ✓ ! ✕ ? counts. The rows open on request after release, and the full results stay in the right panel.
- **A chosen view is kept:** a camera request or preset stops any camera flight still on its way. Data arriving later never re-frames the view you chose; only opening the Position tool, locking it, or Frame does.

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
| Workspace phases (8 Nov) | Form done, pattern in every phase | Phase row, phase panel, workflow strip, per-phase Import / Export (§5.1). Form's example (Massing, Sun & shadow, Wind screen, return to Massing) is tested end to end (`e2e/phase-panel.e2e.ts`); the other phases use the same panel, untested beyond layout |
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
