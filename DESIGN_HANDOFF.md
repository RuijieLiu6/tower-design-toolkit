# Tower Design Toolkit: UI design handoff

*Version 0.1, 22 Oct 2026. For designers and AI agents changing the interface. Every value below is taken from the code. When you change a value in code, change it here too. Project context: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md); the UI rules here are its design half.*

---

## 1. Design logic

The interface asks a designer to do two things at once: **shape a tower** and **trust (or doubt) the numbers about it**. Seven ideas follow from that.

1. **Three stages are three rooms.** The design process is mapped as **Massing → Schematic → Present**, and moving between them should *feel* like changing rooms, not just tabs. Each stage changes five things together:

   | | Massing | Schematic | Present |
   |---|---|---|---|
   | **Metaphor** | Tracing paper | Drafting table | Review wall |
   | **Palette** | Warm paper, white panels | Cool blue-grey | Grey wall, dark chrome |
   | **3D look** | Clay massing, program colours | X-ray: shell ghosted to 18%, plates, core, hatched plant floors | Clay or X-ray (the designer picks) |
   | **Camera** | Perspective, 38° | Dolly zoom into a near-parallel isometric (6° lens), snapped to the nearest corner | Perspective, plus an axonometric preset |
   | **Left panel** | Node library | Tower anatomy + library | Shot strip (filmstrip) |
   | **Purpose** | Find a defensible volume and program mix fast | Test that it can be built: plates, core, plant | Compose evidence-labelled shots for the boards |

   The stage shift and its motion came from the team's UX research (`docs/research/ux-modes`, U1/U2), which studied Rhino, Grasshopper and Revit. One finding: LOD is tagged **per element**, not per stage. That corrected an earlier false assumption.
2. **Evaluate is a lens, not a stage.** Results are one tab away on every stage ("Evaluate on every step" in the process rail).
3. **A process rail is the mental map:** Site → Volume → Program → Plates, core, plant → Frame and capture. The steps of the current stage are lit, and clicking a step jumps to its stage.
4. **Evidence comes first.** Every number carries an evidence flag shown as **icon + word**, never colour alone. False assumptions stay visible in **magenta**, together with their correction. Estimates say "estimate"; screenings say "screening, not CFD"; AI images say "AI-generated".
5. **The visual language is architectural.** Paper tones, thin lines, and drawing conventions: hatch for plant, poché at the section cut, a title block in Schematic, crop marks around the A2 board.
6. **Disclose progressively.** Runnable checks come first. Researched (not yet runnable) nodes are folded into a "Roadmap" group with a flask icon, and Massing checks carried into Schematic are folded too. The library never shows more noise than the stage needs.
7. **Two doors, same engines.** The landing page offers the **Guided process** (the three stages) or **Customize** (a Grasshopper-like canvas where the designer builds their own workflow). Both run the same deterministic engines.

**Accessibility rules:**
- WCAG AA contrast;
- every icon button has a label;
- keyboard shortcuts: `1`/`2`/`3` switch stages, `P` places the tower, `Esc` cancels;
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
│ library ·    │ (in Present: grey wall + A2 board frame,│ Design · Results &    │
│ anatomy ·    │  1.414:1, crop marks; the capture is    │ evidence · Present ·  │
│ filmstrip    │  exactly this frame)                    │ Trace                 │
├──────────────┴─────────────────────────────────────────┴───────────────────────┤
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

**Panel widths:**
- left panel: 18 rem (`w-72`), shrinking to 8 rem (`w-32`) in Present;
- right panel: 22 rem;
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
| Hatch | Diagonal hatch: unverified chips (CSS) and plant floors (3D texture) | `index.css`, `Viewport.tsx` |
| Anatomy row | Element, LOD 100 chip, show/hide eye; roadmap rows greyed with a flask | `Anatomy.tsx` |
| Filmstrip | Captured shots, labelled with representation and time; downloadable | `Filmstrip.tsx` |

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
