# Tower Design Toolkit: UI design handoff

*Version 0.1, 22 Oct 2026. For designers and AI agents changing the interface. Every value below is taken from the code. When you change a value in code, change it here too. Project context: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md); the UI rules here are its design half.*

---

## 1. Design logic

The interface asks a designer to do two things at once: **shape a tower** and **trust (or doubt) the numbers about it**. Eight ideas follow from that.

1. **Three stages are three rooms.** The design process is mapped as **Massing → Schematic → Present**, and moving between them should *feel* like changing rooms, not just tabs. Each stage changes five things together:

   | | Massing | Schematic | Present |
   |---|---|---|---|
   | **Metaphor** | Tracing paper | Drafting table | Review wall |
   | **Palette** | Warm paper, white panels | Cool blue-grey | Grey wall, dark chrome |
   | **3D look** | Clay massing, program colours | X-ray: shell ghosted to 18%, plates, core, hatched plant floors | Clay or X-ray (the designer picks) |
   | **Camera** | Perspective, 38° | Dolly zoom into a near-parallel isometric (6° lens), snapped to the nearest corner | Perspective, plus an axonometric preset |
   | **Left panel** | Design tools (towers & site, massing, program, ground, sun) | Design tools (core & floors, anatomy, plan, section, then the Massing tools) | Shot strip (filmstrip) |
   | **Purpose** | Find a defensible volume and program mix fast | Test that it can be built: plates, core, plant | Compose evidence-labelled shots for the boards |

   The stage shift and its motion came from the team's UX research (`docs/research/ux-modes`, U1/U2), which studied Rhino, Grasshopper and Revit. One finding: LOD is tagged **per element**, not per stage. That corrected an earlier false assumption.
2. **Evaluate is a lens, not a stage.** Results are one tab away on every stage ("Evaluate on every step" in the process rail).
3. **A process rail is the mental map:** Site → Volume → Program → Plates, core, plant → Frame and capture. The steps of the current stage are lit, and clicking a step jumps to its stage.
4. **Evidence comes first.** Every number carries an evidence flag shown as **icon + word**, never colour alone. False assumptions stay visible in **magenta**, together with their correction. Estimates say "estimate"; screenings say "screening, not CFD"; AI images say "AI-generated".
5. **The visual language is architectural.** Paper tones, thin lines, and drawing conventions: hatch for plant, poché at the section cut, a title block in Schematic, crop marks around the A2 board.
6. **Disclose progressively.** Runnable checks come first. Researched (not yet runnable) nodes are folded into a "Roadmap" group with a flask icon, and Massing checks carried into Schematic are folded too. The library never shows more noise than the stage needs.
7. **Two doors, same engines.** The landing page offers the **Guided process** (the three stages) or **Customize** (a Grasshopper-like canvas where the designer builds their own workflow). Both run the same deterministic engines.

8. **Design left, results right, switches below (3 Nov).** The left panel holds the **design tools** of the stage, an accordion fed by a registry (`src/components/tools/registry.ts`; any `*.tool.tsx` file under `src/` adds a tool). The right panel holds the **results** (Results & evidence with a "Show results for" picker, Trace; Present adds Present and Render). The node on/off switches are an **icon-only bar** above the status bar (`NodeBar.tsx`): every node has its own icon (`NODE_ICONS` in `data/icons.ts`, checked by `icons.test.ts`), the name shows on hover and keyboard focus, switching a node on shows its results, and **Library** at the bar's left end holds search, workflow presets, My nodes and the roadmap.

**Accessibility rules:**
- WCAG AA contrast;
- every icon button has a label;
- keyboard shortcuts: `1`/`2`/`3` switch stages, `P` places the tower, `M` / `R` toggle Move / Rotate for the selected tower (arrow keys and `[` `]` nudge it one snap step, `Shift` for fine), `Esc` cancels (a drag, then the selection), `H` hides or shows the viewport overlays;
- a reduced-motion toggle in the top bar, plus `prefers-reduced-motion`;
- an `aria-live` announcement on every stage change;
- axe checks pass on 13 screens (`npm run test:a11y`).

---

## 2. Layout

```
┌ Top bar (chrome) ─────────────────────────────────────────────────────────────┐
│ logo · project tabs (Competition site / Real Vancouver) · stage tabs (icon,    │
│ label, subtitle, key) · view buttons (3D / split / canvas) · motion · help     │
├ Process rail (paper) ──────────────────────────────────────────────────────────┤
│ Site › Volume › Program › Plates, core, plant › Frame and capture  [Evaluate]  │
├──────────────┬─────────────────────────────────────────┬───────────────────────┤
│ Left panel   │ Viewport (3D) / node canvas / split     │ Right panel           │
│ design tools │                        ┌ Viewport dock ┐│ Results & evidence ·  │
│ (accordion)  │                        │ Layers & ctx  ││ Trace (Present: also  │
│ · filmstrip  │                        │ ▸ sections    ││ Present · Render)     │
│              │ (N) compass   [title   └───────────────┘│                       │
│              │                block]                   │                       │
│              │ (in Present: grey wall + A2 board frame,│                       │
│              │  crop marks; the capture is this frame) │                       │
├──────────────┴─────────────────────────────────────────┴───────────────────────┤
│ Node bar: Library · one icon switch per node (name on hover / focus) · n on    │
├────────────────────────────────────────────────────────────────────────────────┤
│ Status bar: evidence legend (5 flags) · data credits · "Study tool, not a      │
│ compliance determination"                                                     │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Pages** (hash routes):

| Route | Page |
|---|---|
| `#/start` | Landing: two doors, elevation drawing, demo tour |
| `#/guided` | The three-stage app |
| `#/customize` | Workflow builder |
| `#/options` | Design options compare |
| `#/sources` | Sources & assumptions |
| `#/status` | Built vs to-build, evaluation cases |
| `#/guide` | User guide |

**Viewport dock** (`ViewportDock.tsx`, 28 Oct): everything that floats over the 3D view sits in **one panel snapped to the right edge** of the viewport, never scattered over the model.
- **Sections** collapse (button headers with `aria-expanded`; a closed section still shows its state on the right of its header). Real Vancouver: Data sources & context layers · Ground & tower base · Existing buildings under the design · Height-limit surface & cone parameters · More layers. Competition site: Site, north & datum · Competition context model. Each section keeps its evidence flags and source lines.
- **Hints** (e.g. the 24-cones note) are dismissible cards at the top of the dock and stay dismissed.
- **Collapsed**, the dock is a slim tab on the right edge: `Layers` icon + the word "Layers".
- **Translucent**: white at 80% with `backdrop-blur-md`, so the city shows through. Over the darkest likely backdrop (#e5e6e7) ink text is 12.6:1; small `slate-500` and `muted` text inside the dock is drawn as `slate-600` (≥ 6:1). While the camera is dragged the dock fades to 35% (200 ms `chrome` token; instant with reduced motion) and comes back on release.
- **Hide overlays** (`H`, or the dock header button) hides the dock, compass, title block, hint pill and inset map for a clean view; a small "Show overlays · H" pill is the way back. Captures read the WebGL canvas only, so no overlay is ever in a shot or a board.
- Remembered per viewer in `localStorage` (`ts.viewportDock.v1`: open, open sections, dismissed hints; read and written in try/catch). The hidden state is not remembered.
- **Compass**: a small translucent pill at bottom left (arrow + "N"); on the competition site it adds "45° · corrected" in magenta, and the full false-assumption note is in the dock's Site section.
- **Schematic title block**: translucent (`bg-panel/75` + blur), bottom right, kept clear of the dock (`right-[21.5rem]` when the dock is open).

**Real Vancouver viewport in Vista's layout** (3 Nov; Ruijie: "Make the model viewport page looks exactly like this as the one shown in vista", the City overview, `style=collage`; `components/VistaLook.tsx`, `lib/vistaLook.ts`). Outside Present, Real Vancouver's view carries Vista's chrome instead of the floating dock tab and the bottom-left compass. Sizes, colours and fonts are the computed styles of Vista's live page (3 Nov) and `explorer.css` @ 917b28e.

```
┌ Viewport ──────────────────────────────────────────────────────────────────┐
│ [City|Observer|Inspect|Plan|Viewcone]                              ( N ) │
│ [Study scene]                                                      ( → ) │
│ [tower toolbar, when a tower is picked]                       [Focus site] │
│                 Kitsilano   West End   (place labels)                [+] │
│                                                                      [−] │
│                                                               [▸ Layers] │
│                                                    ┌ dock, opened from ┐ │
│                                                    │ Layers, under it  │ │
│ [inspected building card, Inspect only]            └───────────────────┘ │
│ [City · drag to orbit · right-drag to pan · scroll to zoom.]             │
│ [▫ Residential ▫ Retail … ▫ Other / unknown · type: OSM tag · POI inside │
│  · else unknown ▫ Terrain ▫ Park ▫ Water ▫ Proposal ▫ Observer · ray …]  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Boxes**: `rgba(250,248,241,.93)` with a 1 px `#aab8ad` border, 2 px corners, shadow `0 2px 8px rgba(43,60,48,.125)`, ink `#2d4035`, Inter with 0.15 px tracking. Mode tabs 11.5 px, 30 px tall, 3 px padding around the group and 2 px between tabs; the active tab is `#426b61` with `#fffdf7` text (6.0:1). "Study scene" 11 px. Focus site and + / − 12.5 px, 30 px tall (+ / − 34 px wide). Layers 12 px, 500 weight, ▶ / ▼. Caption 13 px. Legend 12 px with 9 × 9 swatches; the type swatches keep the dock's dark `#3d434b` border so they read on the paper box. Focus rings 2 px `#426b61`.
- **Compass**: a 40 × 48 pill (20 px corners) at top right, "N" over an arrow that turns with the view (where north is on screen, recomputed each frame the view draws).
- **Tabs** (reworked 3 Nov evening; Ruijie: "make sure that it changes the view accordingly"):
  - **City**: every press flies back to the large Vancouver context (Vista's overview camera), about 0.9 s ease in-out, at once under reduced motion; grabbing the view stops the move.
  - **Observer**: puts the eye at a protected viewpoint, looking along the cone's axis, as in Vista's Observer. The eye is the City's viewpoint elevation Lv (all 24 cones have one). A picker under the tabs lists the 24 views by number and name; it defaults to the cone that controls the selected tower (the lowest City-sourced limit among the cones over it, else the first cone over it, else the nearest). "Or stand on a street or roof (View from here)" stays one button away.
  - **Inspect** (Ruijie: "bring the viewport to the tower in axonometric view close fit to screen"): every press flies to a near-parallel axonometric of the proposed tower, using Present's isometric direction and a 6° lens, framed to its height with a little air. Clicking a building still gives its card: OSM id, type and type source, height, roof and base (CGVD28), height source, and an "▼ inspected" marker over the roof.
  - **Plan**: north up from straight above the proposed tower, **3 km across** the view whatever its shape (`PLAN_WIDTH_M`, 20° lens). At Ruijie's general scale of about 6 km a 30 m tower is 5 px; at 3 km it is about 11 px, with its blocks and streets readable. A glowing ring 12 px clear of the footprint marks the tower at any zoom, drawn over everything, and its name sits just south of it. Zooming stays free and left-drag pans.
  - **Context** (4 Nov; Ruijie: "when they click on the context it will render the context. unclick it will bring back to normal"): a toggle next to Viewcone in the same lamp, word and `aria-pressed` style. On, it switches to Vista's textured Context style; off, it returns to Plain. It uses the same store as Present's Plain / Context picker and the Layers dock (`lib/sceneStyle.ts`), and it doesn't move the camera. In Context the study site is drawn as a lot surface, Vista's paving tinted `#f2dfc4` and draped on the ground, from the Site step's `citySite.ring`. Buildings it replaces leave the drawing (a hypothetical removal), and the site outline shows in both styles.
  - **Viewcone** (Ruijie: "a single tab could turn on all and turn off all"): one toggle, no panel. All on means pressed; pressing hides every cone; pressing again shows them all. If some are hidden in the Layers dock, the state is "mixed" and a press shows them all. A lamp and the word on / some / off show the state; the store is shared with the dock's "View cone layers" section (`lib/coneVisibility.ts`).
  - Esc leaves Inspect and Plan; at eye level View from here keeps its own Esc. The caption changes with the mode. + / − use Vista's step: distance × e^±0.35, or at eye level the field of view, 20–110°.
- **View cones as Vista's volumes** (3 Nov night; Ruijie: "most of them are shown as lines"; `components/VistaCones.tsx`, `lib/coneVolume.ts`, ported from Vista's `viewcone-geometry.js` prepareSurface and `explorer.js` drawViewconeOverlay @ 917b28e):
  - Every cone shown is a volume: its ceiling over the corridor, plus curtains standing on the ceiling along every side up to a display cut. The cut is Vista's min(600, max(320, tallest tower top + 60)) m, a scene cut and never a policy cap. Glowing edges outline both.
  - Colours are Vista's Viewcone blues: surface `#0575f0`, walls `#0587ff`, glow `#0887ff`, edge line `#1fb0ff`.
  - The featured cone (picked in Observer, else the one controlling the selected tower) has Vista's single-cone edges: glow ribbons 9/5/2 px at 3.5/7/22% and the edge line at 95%. Its fills are lighter than Vista's 22% surface and 6.5% walls: 15% and 4.5%. Vista shows one cone at a time; here all 24 show and downtown sits inside several, so at Vista's fills the city under them washed blue (checked on screenshots, 4 Nov). It also carries Vista's trace: the footprints of the buildings under it and the design towers, projected onto its ceiling (`#1470ed` at 45%). Its marks are an apex line to the cut, the origin marker and a blue label.
  - Lighter to draw (4 Nov; Ruijie: "can the cones be lighter so the view runs faster"):
    - Glow and curtains are kept only where the design meets a cone: the featured cone, and the other City-estimate cones over the site (surface 6%, curtains 1.6%, glow 4/1.5 px, edge 60%).
    - Every other cone is its ceiling plus a one-pixel GL edge. City-estimate cones: surface 4.5%, solid edge at 45%. The 16 Vista study surfaces: surface 2.5%, dashed edge at 30%, labelled assumptions. A study surface over the site stays a dashed study cone.
    - A cone with no surface would show its plan outline only.
    - On the Intel UHD the cones went from 5.3 to 1.4 ms (overview) and from 6.3 to 2.9 ms (close).
    - The sun's 4096 × 4096 shadow map is now re-rendered only when the light or a shadow caster changes (`lib/shadowCache.ts`, `ShadowCache` in Viewport.tsx). Orbiting, zooming and panning reuse it; that saved 8–11 ms a frame.
  - All volumes are one merged mesh, plus one fat-line set per strength.
  - Intrusion: where a design tower rises above a City-sourced estimate, that part is Vista's opaque red `#f5141c`. X-ray keeps the see-through red. No intrusion is drawn against a study surface.
  - In Plan, as in Vista, the volumes are left out and the draped plan outlines show (dashed for study surfaces); the featured cone's outline is the blue edge colour. At eye level cones are not drawn unless "Keep map overlays" is on.
  - The outlines are the City ViewCone polygons Vista also uses; they agree to 0.01 m (`evaluation/2026-11-03-vista-tabs/cone_outline_comparison.json`).
  - Frame time on the Intel UHD at 1070 × 799, cones on: Plain 29 ms (overview) / 34 ms (close); Context 36 / 45–52 ms. Before the lighter cones and the shadow cache: Plain 49 / 54 ms, Context 61 / 75 ms.
- **Layers** opens the viewport dock under the right-hand column (`ViewportDock anchored`); it starts closed, as in Vista, and is not remembered. Everything the dock held stays there (sources, ground, removal, height surface, style & building types, place labels).
- **Place labels**: Vista's 34 neighbourhood and landmark names (`public/data/vista_labels.json`), DOM boxes 11 px (`#314239` on `rgba(250,248,241,.91)`, 1 px `#acb9ae`, 3 px corners); names outside Vista's core model 10.5 px and lighter (`#4f6158`). Each floats 40 m above its anchor and, as in Vista, a label that would overlap one already placed is hidden. Hidden at eye level and by Layers → "Place labels".
- **At eye level** (Observer looking, Viewcone) the location map sits bottom right and the legend steps aside, as in Vista.
- The tower toolbar moves under "Study scene"; the competition site keeps the earlier layout. Present shows none of this chrome; the A2 board frame is unchanged.

**Panel widths:**
- viewport dock: 20 rem (`w-80`), height fits its content up to the viewport;
- left panel (design tools): 22 rem (`w-[22rem]`, since 3 Nov; was 18 rem), shrinking to 8 rem (`w-32`) in Present;
- right panel: 22 rem;
- node bar: 44 px (`h-11`), switches 32 px;
- top bar: 56 px;
- process rail: 36 px;
- status bar: 32 px.

---

## 3. Colour scheme

### 3.1 Interface tokens (`src/index.css`, Tailwind 4 `@theme`)

| Token | Massing (default) | Schematic `[data-stage="advanced"]` | Present `[data-stage="present"]` | Use |
|---|---|---|---|---|
| `--color-ink` | `#1f2328` | — | — | Main text |
| `--color-paper` | `#f6f5f2` | `#e9eef3` | `#b8b8b8` | App background, process rail, Present wall |
| `--color-panel` | `#ffffff` | `#f4f7fa` | — | Side panels, cards, inputs |
| `--color-line` | `#e3e1dc` | `#c6d2de` | — | Borders, dividers |
| `--color-muted` | `#62666d` | `#566270` | `#43474d` | Secondary text (≥ 4.5:1 on its background) |
| `--color-accent` | `#1f5f8b` | `#1d5fa8` | — | Selection, primary buttons, focus, site outline |
| `--color-chrome` | `#ffffff` | `#f4f7fa` | `#2b2e33` | Top bar and Present side strip |
| `--color-chrome-ink` | `#1f2328` | — | `#e8eaed` | Text on the chrome |

"—" means the Massing value carries over.

### 3.2 Evidence flags (always icon + word)

| Flag | Colour | Icon (lucide) | Chip style |
|---|---|---|---|
| Verified | `#1f6b42` | `BadgeCheck` | White text on green |
| Team assumption | `#8a5a00` | `Users` | White text on amber-brown |
| Unverified | `#6b6f76` | `ShieldQuestionMark` | Ink text on a grey hatched chip (`.hatch`) |
| Unresolved | `#6e5800` | `CircleDashed` | Ink text on olive |
| **False assumption** | **`#b8137a` (magenta)** | `OctagonX` | White text on magenta; never hidden |

### 3.3 Result states

| State | Chip (Tailwind) |
|---|---|
| Pass | `bg-emerald-50 text-emerald-800 border-emerald-200` |
| Fail | `bg-red-50 text-red-800 border-red-200` |
| Check (warn) | `bg-amber-50 text-amber-800 border-amber-200` |
| Unknown | `bg-slate-50 text-slate-700 border-slate-200` |

**View-cone states** (3D sheet colour and chip):

| State | Colour |
|---|---|
| above | `#d0453a` |
| within uncertainty | `#d98b1c` |
| near edge | `#4a90c2` |
| clear | `#2e8b57` |
| limit unknown | `#8a8f98` (dashed outline) |
| outside | `#c9ccd1` |

Cones with a parameter estimate but no hit show as `#4f7fae`; cones without an estimate as `#7d838c`.

**View-cone solids** (3D, Real Vancouver, 3 Nov; **replaced the same evening by Vista's cone drawing**, see "View cones as Vista draws them" in §2; the solid geometry stays in `engine/coneSection.ts`, and the two readings below remain in `ConeVolumes.tsx`):
- A cone **with an estimate** is a solid that reads as a view cone: every face meets at the **apex, the viewpoint at the City's eye level (Lv)**. Lower face: the estimate Z = Lv + k·D clipped to the wedge. Upper face: the sight line from the eye to the North Shore skyline in MRDEM-30 (curvature with refraction as View from here), sampled every 1° of bearing; where no skyline rises above the estimate, a fixed 1° cap (`SKYLINE_CAP_DEG`). The upper face is a **visual construction (team assumption)**: the City publishes only the lower boundary. Side faces run along the wedge edges, and a far face closes it where the wedge ends.
- All solids are **one merged mesh and one merged edge set** (per-vertex colour and alpha): fill at 10% in the state colour when the selected tower is in the cone, 3.5% in `#4f7fae` otherwise; edges at 95% / 45%; `depthWrite` off.
- A cone **without an estimate** gets no solid (nothing implies a height): dashed outline draped on the ground, and its label reads "· limit unknown" when the tower is in it.
- **Existing City buildings** that rise above a cone's estimate inside its wedge (computed once per data load): their part inside the view tinted the neutral cone blue `#4f7fae` at 50% (35% in x-ray), their section by the estimate a 3 px `#24496b` line. The dock's "View-cone solids" section counts them per cone, worded neutrally (many predate the protected views or were approved under them).
- **A design tower in an estimated cone**: the part above the limit and inside the wedge tinted `#d0453a` (the "above" state colour) at 62% (50% in x-ray), cut exactly by clipping planes; the section of the mass by the limit, clipped to the wedge, a **4 px `#7f1d16` line** (`CONE_SECTION_LINE`); a label on the limit at the check's governing point with the check's own number: "3.2.3: 26.4 m above estimated limit (±0.5 m)".
- The wording stays "estimate"; the City View Cone Assessment governs.

**Cone coverage** (view-cone node, Real Vancouver): a bar split `#4f7fae` (cones with an estimate) and the `.hatch` pattern (no estimate), then two rows of cone-id chips: solid `#4f7fae` border for estimates, dashed slate border for "no estimate", matching the dashed outlines in 3D. The Massing overlay states the same counts.

### 3.4 Node categories (badge colour + icon)

| Code | Label | Colour | Icon |
|---|---|---|---|
| SITE | Site, context & policy | `#1f5f8b` | `MapPin` |
| PROG | Program, density & economics | `#b5651d` | `Layers` |
| CLIM | Sun, shadow, daylight & wind | `#d9a400` | `Sun` |
| ENER | Energy, carbon & resources | `#c0392b` | `Zap` |
| ECOL | Ecology & City in Nature | `#3c8d5a` | `Leaf` |
| PUBL | Public realm & human scale | `#2a9d8f` | `PersonStanding` |
| CULT | Culture, reconciliation & ethics | `#8e5ba8` | `BookOpen` |
| MOBI | Mobility, transit & servicing | `#5d6d7e` | `TrainFront` |
| STRC | Structure | `#6d4c41` | `Building2` |
| SYST | MEP, vertical transport & code | `#7f8c8d` | `Cable` |
| SPAC | Interior, facade & materials | `#a0522d` | `PanelsTopLeft` |
| PRES | Presentation | `#34495e` | `Presentation` |
| DATA | Data & platform | `#4a5568` | `Database` |

### 3.5 Program uses (massing bands, plans, charts)

| Use | Colour | Icon |
|---|---|---|
| Retail / commercial | `#e3a07a` | `ShoppingBag` |
| Office | `#6b8fb5` | `Briefcase` |
| Hotel | `#e8b84a` | `BedDouble` |
| Residential | `#9bbf85` | `House` |
| Civic / cultural | `#b48ac4` | `Landmark` |
| Public amenity | `#6cc0b8` | `Trees` |
| Mechanical (plant) | `#a3a3a3` | `Fan` |

### 3.6 3D looks (`src/data/stages.ts`; three.js can't read CSS variables)

| Look | Background | Ground | Site | Context | Heritage | Edges | Hemisphere light |
|---|---|---|---|---|---|---|---|
| Clay (Massing) | `#eef0f2` | `#e7e6e1` | `#f7f3ea` | `#f1efea` | `#e9dfcd` | `#b9b6ae` | 0.9 |
| X-ray (Schematic) | `#e9eef3` | `#dfe6ed` | `#eef3f8` | `#f4f7fa` (context ghosted to 45%) | `#eef1f4` | `#9fb0c2` | 1.25 |

**Real Vancouver water and parks** (added 27 Oct; same `Look` objects):

| Look | Water (0 m sea plane, terrain at or below 0 m) | Shoreline line (City 2002) | Park tint (multiplied into the ground; white = none) |
|---|---|---|---|
| Clay | `#c4d4e1` | `#6f8ba1` | `#e1efd6` |
| X-ray | `#bccee0` | `#7393b2` | `#e3efe6` |

**Proposed tower** (Real Vancouver, 3 Nov; Ruijie: "use a stronger high contrast or glowing colour and in the legend, label the proposed tower"; `lib/vistaLook.ts` `PROPOSED`):
- In Massing and in Present Clay, the design tower(s), imported masses included, are drawn in one strong colour: electric ultramarine `#1a3cff`. The material is not tone mapped and has its own glow. Two edge lines in screen pixels, so they read at any zoom: a 5 px glow `#7f97ff` at 55% and a 1.5 px core `#0a1c80`.
- Contrast: at least 3.5:1 against every light type tint, 4.8:1 against the terrain, 3.9:1 against the water and 6.5:1 against Vista's white. Its hue is apart from the red overshoot, the blue existing-building tint and the purple cones. The part above a cone limit keeps the red overshoot tint, so it reads magenta.
- Schematic, x-ray (Present X-ray included) and the programme panels keep the programme colours. In Present Clay the programme colours sank among the type tints (checked on a board, 3 Nov), so the board keeps the strong colour.
- Legend: "Proposed tower", in bold, with that swatch and a glow ring; outside those views the swatch shows the tower's programme colours.

**Water** (Ruijie: "Clean up the specks on the water"): in the Plain look the terrain inside OpenStreetMap water is drawn in the water colour and ripple, so the elevation model's cells just above 0 m over Burrard Inlet and near the North Shore no longer show as beige specks. The water is `public/data/water.json`: the OSM coastline polygonized with land on the left, plus natural=water and reservoirs. It comes from Overpass on 3 Nov, is ODbL and is built by `tools/build_water_mask.py`. Display only: the elevations, eye levels and CGVD28 chain the checks use are unchanged.

**Real Vancouver styles** (3 Nov; `lib/sceneStyle.ts`, Layers dock "Style & building types", Present → Representation):

*Plain* (default) is **Vista's Plain look** (3 Nov, `lib/vistaLook.ts`): paper background `#f3f2ec`, terrain `#dedbce`, parks `#8c9c83`, water `#b7c9c9`, buildings `#fafbf8`, street lines `#aaa899`, shoreline `#8a9f9d`, Vista's fog `rgb(.96,.96,.93)` (quadratic, 38% at most, reach 3 × the orbit distance). Shading is Vista's, rewritten for three.js materials: light from `(-0.45, -0.35, 0.82)`, walls `base × (0.79 + 0.15 × shade)`, roofs at full colour, terrain `base × (0.94 + 0.06 × shade)` with a paper grain, parks a watercolour wash with stipple and faint 10 m contours, water a light ripple; colours are Vista's numbers (not tone mapped). Cast shadows from the Sun & shadow preview still show (darkened to 80%). Streets are Vista's OpenStreetMap network as thin lines (so `vista_streets.json`, 2.4 MB, now loads with Plain too). **Colour buildings by type** (Layers, on by default; Ruijie: "keep it colourful with legend while keep the colour light not too strong"): each existing building takes a light tint of the design tower's programme colour for its type (`lib/buildingUse.ts`: the programme colour mixed with 45% white), so an office reads as office everywhere; the design tower keeps its full colours and outline and stays the most saturated thing in view. A building whose height is a type estimate is 7% darker. The type comes from OpenStreetMap (`tools/build_vista_buildings.py`, Overpass extract of 3 Nov): the building's own tags first (a specific `building` value, `building:use`, or `shop` / `office` / `tourism` / `amenity` / station tags on the building), else the points of interest inside its footprint (the majority; a tie goes to the non-retail use, so a ground-floor shop does not decide an office tower), else *other*, never guessed from height or shape. By part: 20,251 from a tag on the building, 1,434 from points of interest inside, 40,687 *other*. The legend gives these counts per source, and a picked building's caption names its type and source like its height source ("OSM building w123 (office, OSM tag)").

| Type | Programme colour | Building tint | Swatch vs its `#3d434b` border | Tint vs the clay background `#eef0f2` |
|---|---|---|---|---|
| Residential | `#9bbf85` | `#c8dcbc` | 6.9:1 | 1.27:1 |
| Retail / commercial | `#e3a07a` | `#f0cbb6` | 6.6:1 | 1.32:1 |
| Office | `#6b8fb5` | `#aec1d6` | 5.4:1 | 1.61:1 |
| Hotel | `#e8b84a` | `#f2d89b` | 7.2:1 | 1.22:1 |
| Cultural & religious | `#b48ac4` | `#d6bfdf` | 5.9:1 | 1.49:1 |
| Institutional (schools, health, civic) | `#6cc0b8` | `#aedcd8` | 6.7:1 | 1.31:1 |
| Transit station | `#c8707a` | `#e1b0b6` | 5.3:1 | 1.66:1 |
| Other / type unknown | `#a9a69f` | `#d0ceca` | 6.4:1 | 1.38:1 |

Accessibility: light tints cannot reach 3:1 against a light ground, so colour is never the only carrier. The legend names every type and gives each swatch a dark border (all at least 5.3:1, WCAG 1.4.11), the buildings are shaded by the sun, and picking a building names its source. Checked on screenshots of Massing and of the Present board (3 Nov): at 35% white the office tint came too close to the design tower's blue, so the tint is 45%.

*Context*: Vista's Context look (`components/ContextStyle.tsx`, `VistaStreets.tsx`; Vista @ 917b28e). Facades by family (office grid, residential ribbon, buff stone, brick, white brick, concrete) with illustrative windows, floor bands and sills from Vista's shader; Poly Haven brick, white brick and concrete albedos (CC0). Land is pale concrete paving and streets are asphalt (Ruijie Liu's own images) with white centre dashes on major roads (3 m every 18 m) and paving sidewalks within 1.2 km of the selected tower. Parks use the grass watercolour; water is a turquoise wash with ProcTexture's CC0 ocean normal map; bridges and viaducts get illustrative decks with `#bdbab2` slab edges. Everything is illustrative, never surveyed. Textures live in `public/textures/vista/` with `sources.json` (licence and checksums); the grass and paving were resized to about 1k as JPEG (3.6 MB to 0.28 MB, 1.7 MB to 0.09 MB).

**Buildings by source** (Real Vancouver): in Vista's model (the default), each building takes its best height (City LiDAR 2022 or 2009 where they cover it, else an OSM height tag or floor count, else an estimate per building type); measured and OSM-tagged heights use the look's `context` colour and type estimates use `older`; the Layers dock credits "© OpenStreetMap contributors (ODbL), via Vista". In the City model (comparison), LiDAR 2022 parts use the look's `context` colour; parts with the City's 2009 heights use `older` (clay `#ddd6ca`, x-ray `#e2e8ee`), a shade off so the older survey reads as such; outlines with no height in any source are hatched translucent placeholders (`#c3c6cb` with a 4 m diagonal hatch, 45% opacity, 22% in x-ray), not pickable and casting no shadow.

The coast is where the terrain crosses 0 m, so it is drawn from data, not from the line. The legend in Context layers says that neither the plane nor the 2002 line is a surveyed shoreline.

**Site-model base (plinth)** (3 Nov; `lib/plinth.ts`, `components/Plinth.tsx`): both projects sit on a finite base, like a physical model, so the ground never reads as an endless plane.

| Look | Skirt walls and underside (`plinth`) | Top edge line (`plinthEdge`, 1 px) |
|---|---|---|
| Clay | `#cfccc3` | `#7f7b72` |
| X-ray | `#c6d0db` | `#6f849c` |

- **Real Vancouver:** 15.8 × 15 km (x −8,640…7,140 m, y −9,000…6,000 m from the origin): every building and every draped City layer, on node lines shared by the terrain grids. Top = terrain (LiDAR 1 m patches in MRDEM 30 m) and the flat sea; walls 160 m deep. The North Shore past the north edge is a **fogged backdrop**: MRDEM terrain fading toward the background over 8 km (up to 55%), with its own wall where it reaches past the plinth. Nothing is drawn to the south, east or west. The 2002 shoreline is clipped to the plinth.
- **Competition site:** the context model's extent (blocks, curbs, buildings, street labels) plus 20 m, rounded to 10 m; flat street level on top, 16 m deep (about 3 cm at 1:500).
- Walls are lit like the rest of the model (no outline). The edge line sits just outside the top edge, so it never fights the ground for depth. Both looks keep the ground opaque, x-ray included.
- **No undersides:** city building bases go 1 m below the lowest ground at their corners. Where the ground falls away under a design tower, a footing in the plinth colour fills it up to the tower's base (display only).

**Camera** (3 Nov; `lib/cameraClamp.ts`, `components/CameraClamp.tsx`): the orbit never goes below the ground.
- The eye stays at least 1.2 m above the drawn ground under it, read from the scene's height grids (no raycast). This covers orbit, pan, zoom, the Schematic lens, presets and viewpoint views.
- The orbit target stays over the plinth, between the ground and 2,000 m, so a pan stops at the edge without turning the view.
- A preset target inside a hill slides back along the line of sight, so the eye and the view stay as asked.
- The polar limit is 89.1°. A preset that starts below its target (the VTC street view, 1.6 m, looking up at the tower) keeps its angle, and the limit eases back as the user orbits up.
- The near plane shrinks close to the ground (at most half the eye's height), so the ground is never cut open.
- View from here and the gizmo drag own the camera while they hold the controls, so the clamp leaves them alone.

**Schematic drawing colours:**

| Element | Colour |
|---|---|
| Core | `#2b3f55` (88% opaque; 32% when lift shafts show) |
| Floor-plate lines | `#4a6a8c` at 50% |
| Shell edges | `#3d5a78` at 60% |
| Plant-floor hatch | `#dde1e6` ground with `#4b5663` strokes |
| Section cut | `#1d5fa8` outline, white plate, core poché `#2b3f55` |
| Title block | `#2b3f55` text and border |

Other fixed colours:
- **Selected tower** (Massing): emissive `#1f5f8b` at 8%.
- **Picked tower** (clicked in 3D, Massing and Schematic): the whole tower outlined in the stage accent (`#1f5f8b` / `#1d5fa8`), 2.5 px, plus a 35% copy drawn through everything. **Gizmo** (3 Nov, `TowerGizmo.tsx`): x arrow `#c8372d`, y arrow `#23824a`, plane handle and turn arc `#1f5f8b`, hover `#eda100`; 120 px on screen at any zoom, drawn on top. **Ghost** of a move waiting for Confirm: the stage accent at 16% (volume), 35% (footprint), dashed 2 px outline; lines it snapped to in `#eda100`, 4 px. Outline, gizmo and ghost are editor-only: never in a capture, a print-size capture or a board.
- **Present:** wall `#b8b8b8`, crop marks `#2c2c2a`, board shadow `0 12px 40px rgba(0,0,0,.28)`.
- **Customize canvas:** dot grid `#cfccc4`, connection line `#2a9d8f`, unknown node `#8a8f98`.

---

## 4. The icon

**Meaning:** a tower on its podium, with a **sky-room band** (the public room high in the tower), on the toolkit's accent blue. The same idea appears in the elevation drawing on the landing page: a tower inside the 244–305 m band, with the North Shore line behind.

**App icon** (`public/icons/icon.svg`; PNGs are generated by `node tools/make_icons.mjs`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#1f5f8b"/>              <!-- accent blue, rounded square -->
  <rect x="27" y="72" width="46" height="10" fill="rgb(201,216,228)"/> <!-- podium  #c9d8e4 -->
  <rect x="40" y="14" width="20" height="58" fill="rgb(246,245,242)"/> <!-- tower   #f6f5f2 (paper) -->
  <rect x="40" y="41" width="20" height="4"  fill="rgb(237,161,0)"/>   <!-- sky room #eda100 -->
</svg>
```

| Icon colour | Hex |
|---|---|
| Accent (field) | `#1f5f8b` |
| Tower | `#f6f5f2` |
| Podium | `#c9d8e4` |
| Sky-room band | `#eda100` |

**Files:**

| File | Size | Notes |
|---|---|---|
| `icon.svg` | any | |
| `icon-192.png` | 192 px | |
| `icon-512.png` | 512 px | |
| `icon-maskable-512.png` | 512 px | Drawing inset to the maskable safe zone |
| `apple-touch-icon.png` | | |

The web manifest uses theme colour `#1f5f8b`, background `#f6f5f2`, and the short name "Tower Toolkit".

**In-app mark** (top bar and landing; uses `currentColor`, so it follows the chrome ink):

```svg
<svg width="20" height="20" viewBox="0 0 20 20">
  <rect x="7" y="2"  width="6"  height="16" rx="1" fill="currentColor"/>
  <rect x="3" y="11" width="14" height="7"  rx="1" fill="currentColor" opacity=".35"/>
</svg>
```

**Rules:**
- Keep the plain rectangles. No gradients and no outline version.
- Minimum size 16 px.
- On dark chrome, the mark turns light by itself through `currentColor`.

---

## 5. Iconography

**Library:** `lucide-react` 1.61. Icons are always shown **with a visible label** or an `aria-label`, and are `aria-hidden` otherwise.

**Stage icons:**

| Stage | Icon | Subtitle | Key |
|---|---|---|---|
| Massing | `Cuboid` | "Basic model" | `1` |
| Schematic | `PencilRuler` | "Advanced model" | `2` |
| Present | `Presentation` | "Frame and compose" | `3` |

Evaluate is shown as `Gauge`.

**Process rail:** Site `MapPin`, Volume `Cuboid`, Program `Layers`, Plates `PencilRuler`, Frame `Presentation`.

**Other fixed icons:**

| Icon | Meaning |
|---|---|
| `FlaskConical` | Researched, not runnable |
| `LockKeyhole` | Model locked (Present) |
| `Aperture` | Capture |
| `Waves` | Reduced motion |
| `Scissors` | Section cut |
| `Expand` | Explode zones |
| `Ghost` | Shell |
| `Layers2` | Plates |
| `Fan` | Plant floors |
| `Eye` / `EyeOff` | Show / hide |

**Workflow node glyphs** (`src/components/workflow/nodeIcons.ts`):
- Each node gets its own glyph, matched from its name (e.g. view cone → `Eye`, wind → `Wind`, lifts → `ArrowUpDown`, egress → `Footprints`, parking → `Truck`, aviation → `Plane`, carbon → `Factory`).
- The category icon is the fallback.
- **The category colour always frames the glyph.** That is how nodes read as Grasshopper-style tabs.

---

## 6. Typography

- **Font stack:** Inter, Segoe UI, system-ui, -apple-system, sans-serif.
- **Section headers:** 11 px, semibold, UPPERCASE, `tracking-wider`, muted colour.
- **Sizes:**

  | Text | Size |
  |---|---|
  | Body and controls | 12 px (`text-xs`) |
  | Metadata | 9–11 px |
  | Brand | 14 px semibold |
  | Dialog titles | 18 px |

- **Numbers:** `tabular-nums` wherever they line up in columns.
- **Monospace:** the Schematic title block, codes, file names and node ids.
- **3D labels** are sprites with a constant on-screen size: 22 px at 2× resolution, on white at 88% or dark at 88%. They compensate for the field of view so they don't grow 6.5× in Schematic (`src/components/Label.tsx`).

---

## 7. Motion

Tokens in `src/data/stages.ts`. Easing for chrome: `cubic-bezier(0.2, 0, 0, 1)`. **Exits run shorter than entries.**

| Token | ms | Used for |
|---|---|---|
| `feedback` | 100 | Button and toggle feedback |
| `chrome` | 200 | Palette cross-fade between stages (`.stage-fade`) |
| `stageIn` / `stageOut` | 480 / 320 | Shell ghosting, core rising, explode (exponential approach, τ = 120 ms) |
| `lensIn` / `lensOut` | 750 / 500 | Dolly zoom into and out of the Schematic isometric (ease in-out cubic) |
| (CSS) | 250 / 300 | Left panel width (`.panel-slide`), board frame padding (`.board-frame`) |

**Rules:**
- Every move is **interruptible**: grabbing the model stops the lens.
- **Reduced motion makes every move instant** (top-bar toggle, `data-reduced="true"`, or the OS setting).
- Motion explains a change of state. It never decorates.

---

## 8. Components and patterns

| Pattern | What it is | Where |
|---|---|---|
| `FlagChip` | Evidence flag: icon + word, tooltip with its meaning | `src/components/ui.tsx` |
| `StateChip` | Pass / Fail / Check / Unknown | `ui.tsx` |
| `Section` | Panel section with an uppercase header and an optional right-side action | `ui.tsx` |
| `NumberField` | Label + optional slider + number box with unit | `ui.tsx` |
| `Toggle` | Switch with `role="switch"` and a label | `ui.tsx` |
| Category badge | 24 px rounded square in the category colour, white icon | `NodeLibrary.tsx` |
| Program icon | 20 px square in the use colour, white icon | `DesignPanel.tsx` |
| Title block | Schematic drawing label: view, shell, core, plant, LOD | `Viewport.tsx` |
| Board frame | A2 landscape (1.414:1) on the grey wall, crop marks; the capture equals the frame | `Viewport.tsx`, `index.css` |
| Viewport dock | One translucent, collapsible panel on the right edge of the viewport with collapsible sections, dismissible hints, a "Layers" tab when collapsed and "Hide overlays" (`H`) | `ViewportDock.tsx` (used by `CityContext.tsx` CityLegend and `Viewport.tsx` VtcDock) |
| Hatch | Diagonal hatch: unverified chips (CSS) and plant floors (3D texture) | `index.css`, `Viewport.tsx` |
| Anatomy row | Element, LOD 100 chip, show/hide eye; roadmap rows greyed with a flask | `Anatomy.tsx` |
| Ground card | Real Vancouver tower base: value, source ("from the terrain" with an Unverified chip, or "set by hand" with a Team assumption chip), the terrain range under the footprint, one button to switch | `CityContext.tsx` |
| Filmstrip | Captured shots, labelled with representation and time; downloadable | `Filmstrip.tsx` |
| Tower gizmo | Click a tower to select it as one object (outline); a toolbar top left of the viewport (clear of the dock) gives its name and height, **Move** (`M`) and **Rotate** (`R`) toggles as icon + word, typed x / y / rotation, and Snap (site boundary and parcel edges first, then 1 m / 5 m and 5° / 15°; `Shift` while dragging = free). Moves stay in plan (z locked), turns are about the tower's own vertical axis. **Confirm before placing** (Vista v10.1, 3 Nov): a gizmo drag or a "Place on map" click leaves a ghost, and the toolbar shows what the spot would mean (site fit from the existing containment rule or the site boundary, land or water, view cones from the cone check, the base there; each line with its state, word and evidence flag, and the current result beside it when it differs), with Confirm (`Enter`) and Cancel (`Esc`). Nothing is written until Confirm, which is one undo step. **Align to lot lines** (3 Nov): a placement turns the tower parallel to the lot under the click (the study site or competition block first, else the City parcel; read from the lot's minimum-area rectangle) and keeps it inside when it fits, never resized; a street click turns it to the nearest lot lines within 30 m; `Shift` places freely. The card says what it lined up with in an amber line with the `LandPlot` icon ("Aligned to the lot lines (lot at …)", "spans more than one lot (… on …)"), and the lot lines used are amber in 3D. **Align to lot** (`LandPlot` + word + `L`) does the same for a placed tower, through the same Confirm. Present: the toolbar only says the model is locked. Click empty ground or `Esc` to deselect | `TowerGizmo.tsx`, `TowerToolbar.tsx`, `lib/towerEdit.ts`, `lib/proposalCheck.ts`, `lib/edgeSnap.ts`, `lib/lotAlign.ts`, `lib/siteGeometry.ts` |

---

## 9. Do and don't

**Do:**
- Change a colour in `index.css` / `stages.ts` / `registry.ts` / `types.ts`, then update this file.
- Give every new number an evidence flag.
- Pair every icon with a word.
- Check contrast (≥ 4.5:1 for small text) and run `npm run test:a11y`.
- Keep the stage shift felt: palette, look, camera, panels and purpose change together.

**Don't:**
- Use colour alone for meaning.
- Hide a false assumption.
- Show an AI image without its label.
- Add decorative motion, or motion that ignores reduced-motion.
- Show the competition model's data outside `public/local/`.

## 10. File map

| Concern | File |
|---|---|
| Theme tokens, stage palettes, motion CSS, hatch, crop marks | `src/index.css` |
| Stages, process rail, 3D looks, motion tokens | `src/data/stages.ts` |
| Category, program and flag icons | `src/data/icons.ts` |
| Category colours | `src/data/registry.ts` (`CATEGORIES`) |
| Program colours | `src/engine/types.ts` (`USES`) |
| Flag chips, state chips, cone colours | `src/components/ui.tsx` |
| Top bar, process rail, panels | `TopBar.tsx`, `ProcessRail.tsx`, `NodeLibrary.tsx`, `Anatomy.tsx`, `Filmstrip.tsx`, `RightPanel.tsx` |
| 3D: looks, x-ray, lens, board frame, title block | `src/components/Viewport.tsx` |
| Workflow canvas styling and node glyphs | `src/pages/Customize.tsx`, `src/components/workflow/nodeIcons.ts` |
| App icon and manifest | `public/icons/`, `tools/make_icons.mjs`, `public/manifest.webmanifest` |
