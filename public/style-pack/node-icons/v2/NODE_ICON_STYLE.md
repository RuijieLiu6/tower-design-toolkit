# Node icon style, version 2

How a design-node icon in Tower Design Toolkit looks, how it sits in the interface, how to ask for one, and how the platform checks one. It applies to our own assistant and to any outside AI agent or person. Every number here comes from the app itself: the 31 drawings in `src/components/icons/nodeArt.tsx`, the design tokens in `src/lib/design/tokens.ts` and the theme in `src/index.css`, read and measured by `tools/build_icon_pack.mjs`.

Published at https://ruijieliu6.github.io/tower-design-toolkit/style-pack/node-icons/v2/ (download everything as `node-icon-style-pack-v2.zip`). Version 1 stays at `../v1/`, unchanged.

| File | What it is |
|---|---|
| `NODE_ICON_STYLE.md` | These rules |
| `icon-tokens.json` | The artwork's exact values: projection, plate, material and phase tones, strokes, tile and its states, export spec, checks, measurements |
| `ui-tokens.json` | The interface tokens: UI, PHASE_COLOR, STATUS, MODEL, DATA, RADIUS, SPACE, MOTION, and the CSS variable names |
| `COMPONENTS.md` | The shared components an agent must reuse, with their states |
| `icon-brief.schema.json` | What a request for an icon must contain |
| `references/` | Eight approved icons, as original SVG drawings and 512 px transparent PNGs |
| `previews/` | The family on its tiles; the references at 52, 40 and 30 px; the tile's states (normal, hover, selected, keyboard focus, error status, soft, off) |
| `example-node/` | A node package with its icon attached, both ways (a brief, or an image) |
| `manifest.json` | Every file with its size and sha256 |

What the design system asks this package to hold, and where it is:

| Required | Where |
|---|---|
| Approved tokens and component names | `ui-tokens.json`, `icon-tokens.json`, `COMPONENTS.md` |
| Icon reference images and construction rules | `references/`, sections 2 to 5 and 11 |
| Asset dimensions, safe area and background | Sections 6 and 9 |
| Normal, selected, focused and error states | Section 7, `previews/states.png`, `COMPONENTS.md` |
| Artwork colours kept apart from interface-state colours | Section 4 |

## 1. What an icon shows

- **What the node does.** A small architectural object or a clear spatial diagram of the node's task: a view plane passing over a tower, a core rising through floor plates, shopfronts along a street.
- **One main idea, at most one supporting cue.** The cue is optional: the sun, a lightning bolt, a shield, a drop of rain.
- **Nothing the node cannot do.** No check mark on a node that only shows a value. No robot for a log. No wind tunnel for a rule-of-thumb screen. No map for a node that reads no map. If the node says *Check* and never *Fail*, the icon shows what is measured, not a verdict.
- **Not a symbol font.** Do not use generic outline symbols (Lucide, Material, Feather style) as the main artwork.

A few older drawings use a flat symbol as their main idea (the speech bubbles of `built.culture-claims`, the map pin of `built.vista`, the arrow of `built.model`). They are kept, but new icons should not follow them. Follow the references.

## 2. Camera and grid

- **Canvas:** a 48 × 48 unit drawing (`viewBox="0 0 48 48"`), exported at 512 × 512 px (1 unit = 10.67 px).
- **Projection:** isometric, 30°. A point in plan (x, y) at height z is drawn at

  `iso(x, y, z) = [24 + (x - y) × 1.38, 19.5 + (x + y) × 0.8 - z × 1.62]`

  The plan axes run 30.1° below the horizontal; one plan unit is 1.595 drawing units long and one unit of height is 1.62, so all three axes read at the same scale. +x runs to the lower right, +y to the lower left, z straight up. The camera looks down from the front: the plate's near corner points at the viewer.
- **Plan grid:** units 0 to 16. The ground plate is the box x 0.6, y 0.6, z 0, 14.8 × 14.8 × 0.9 (tone `p`). It spans 3.58 to 44.42 across (85.1% of the canvas) and its near corner sits at 44.14 down (8% above the bottom edge). The plate is the same in every icon: never scale, move or recolour it.
- **Standing and lying:** objects stand on the plate top, z = 0.9. Things lying flat on the ground (shadows, paving, a park) sit at z 0.95 to 0.97, so they draw over the plate.
- **Object scale:** a tower is 3 to 6 units square and 9 to 16 units tall; a podium 8 to 12 units across and 3 to 6 tall. Keep the subject on the plate.
- **The supporting cue** is drawn flat (not projected) in the upper right: x 30 to 46, y 3 to 22 of the 48 grid, about 7 to 12 units across, centred near (38.5, 10).
- **Draw order:** back to front. A box's faces go left face, right face, top.

## 3. Light, materials and colour

Light comes from the upper left. Every box has three tones: **top lightest, left face middle, right face darkest**. The left face is the one toward the lower left (+y side); the right face is toward the lower right (+x side).

| Material | Use | Top | Left face | Right face |
|---|---|---|---|---|
| `n` | Massing: neutral building forms | `#fbfbfa` | `#e2e5ea` | `#c3c9d2` |
| `p` | Ground plate | `#eef1f3` | `#d9dee4` | `#c7cdd5` |
| `g` | Planting | `#b7dd8f` | `#86c06a` | `#5f9a4f` |
| `w` | Water and sky glass | `#bfe1f6` | `#8cc4e8` | `#5d9fcf` |
| `k` | Dark detail (trunks, furniture, wheels) | `#6c7686` | `#4f5868` | `#3a4250` |
| `a` | The node's task, in its phase's three tones | see below | | |

The accent `a` is the node's phase colour, the design system's fixed phase tones (`PHASE_COLOR[phase].tones` in `ui-tokens.json`). Its left-face tone is the phase's interface accent.

<!-- phases:start (written by tools/build_icon_pack.mjs from lib/design/tokens.ts) -->
| Phase | Top | Left face | Right face |
|---|---|---|---|
| Site | `#73d0e8` | `#00a9d6` | `#0084a7` |
| Form | `#ffae9b` | `#ff6b4a` | `#c7533a` |
| Program | `#f9df8d` | `#f4c430` | `#be9925` |
| Schematic | `#bfa5fa` | `#8b5cf6` | `#6c48c0` |
| Present | `#ee99dd` | `#e145c2` | `#b03697` |
<!-- phases:end -->

- Massing stays neutral (`n`). The accent goes only on the part that is the node's task.
- One phase per icon: the node's own.
- Use the accent plus at most one other material (`g`, `w` or `k`). Most drawings use one or two.
- Other colours in the family: a flat ground shadow `rgb(58 66 80 / 0.28)`; white `#fff` for glazing bars and marks on accent shapes; ink `#3a4250`; warm daylight `#fff0b3`, `#fbf4da`, `#f2c14e` (sun and daylight drawings only).
- Flat fills only. Depth comes from the three tones, nothing else.

## 4. Artwork colours vs interface colours

The artwork and the interface around it never share colours by meaning. That way a drawing can't be mistaken for a state, and a state can't be lost inside a drawing.

**Artwork uses only:** the five materials above, the node's phase tones, white for marks, the ground shadow, and the warm daylight colours in sun and daylight drawings. That is the whole palette in `icon-tokens.json` → `validation.warn` → `palette`.

**Never in artwork:**

| Interface colour | Value | Belongs to |
|---|---|---|
| Accent / focus blue | `#2563eb` (`--color-accent`, `--color-focus`), hover `#1d4ed8` | Interaction, selection and keyboard focus only: the main button, a selected tile's ring, the focus ring |
| Selected surface | `#eaf1ff` (`--color-selected`) | Selected rows and options |
| Status | success `#147d50`, warning `#946200`, error `#c9363e`, pending `#5f6875`, each with a pale surface (`--color-success` …) | The platform's badges and result rows, always with a symbol and a word |
| Evidence flags | `--color-flag-*` | Flag chips |
| AI suggestion | `#0e7490`, `#ecfafd`, `#9bdcea` (`--color-ai*`) | Suggestion containers |
| A phase's surface and ink | e.g. Site `#e7f7fc` / `#006b85` | Phase markers, library groups and small text |

- **Blue is reserved.** No blue glow, ring, outline or highlight in a drawing. A selected or focused node gets its blue ring from the platform (section 7), never from its image. Sky glass and water use the material `w`, and the Site phase uses its own cyan tones.
- **Status is not drawn.** No red cross for a failing node, no green tick for a passing one, no amber warning triangle. Results change; the icon doesn't. The platform shows status in a badge beside the tile (`previews/states.png`). The brief's `check` and `warning` cues are drawn in the node's phase tones, not in status colours, and only for a node that really checks a rule.
- The palette check measures most of this, but not all of it: the error red sits close to the Form phase's darkest tone. A person still looks at every image icon in the preview.

## 5. Lines

- No outlines around forms. Ever.
- Thin lines only as detail on or inside a form: mullions, lift shafts, a dimension, wind lines, a dashed reach. Widths 0.5 to 1.3 units (5 to 14 px at 512).
- A symbol stroke (an arrow, a wind path, a check on an accent disc) may reach 1.5 to 2.2 units (16 to 23 px).
- Round caps and joins. Dashes about 1.5 to 2 units.

## 6. Framing (checked against our icons)

A 512 × 512 transparent PNG master was proposed with the artwork filling about 75% of the canvas's longest side. Measured on all 31 drawings:

<!-- measured:start (written by tools/build_icon_pack.mjs) -->
| Measure (31 drawings at 512 px; definitions in icon-tokens.json, measured.method) | Min | Median | Max |
|---|---|---|---|
| Longest side of the artwork | 85.2% | 85.2% | 88.3% |
| Width | 85.2% | 85.2% | 88.3% |
| Height | 52.3% | 79.5% | 85.7% |
| Centre offset, x (+ right) | -1.6% | 0.0% | 0.0% |
| Centre offset, y (+ down) | -0.9% | 2.2% | 15.8% |
| Margin left / right | 4.3% / 6.6% | 7.4% / 7.4% | 7.4% / 7.4% |
| Margin top / bottom | 6.3% / 8.0% | 12.5% / 8.0% | 39.6% / 8.0% |
| Canvas covered by artwork | 23.7% | 31.4% | 43.5% |
| Outer 2 px ring that is solid (clipping) | 0.0% | 0.0% | 0.0% |
| Solid pixels near the family palette | 98.7% | 100.0% | 100.0% |
| At 30 px: solid pixels dark enough to show on white | 11.2% | 30.4% | 63.2% |
| At 30 px: solid pixels on a hard tonal edge (busy) | 0.0% | 0.4% | 14.5% |

In every drawing the longest side is the width, set by the ground plate (14.8 plan units → 85.2% of the canvas); only drawings with something beside the plate reach wider (max 88.3%, `built.view-from`'s mountains).

Adopted export target: longest side **85.0% ± 4.0%** of the canvas (accept 81.0%–89.0%); centred left to right within 3.0%; the plate's lowest point 8.0% above the bottom edge (accept 6.0%–10.0%); safe area: nothing closer than 20 px (4.0%) to any edge. On the tile that is 76.7% of the tile side. The worked example's agent-drawn icon measures 85.2% wide, centre offset 0.0% / 1.2%, bottom margin 8.0%.
<!-- measured:end -->

**75% is not what our icons do.** It is close to what the tile shows, because the tile draws the artwork at 90% of its size. A master drawn at 75% would sit about 12% smaller than its neighbours. So the export spec is the measured one:

- 512 × 512 px, transparent PNG, sRGB.
- The ground plate spans **85% of the width** (accept 81 to 89%), centred left to right.
- The artwork is not centred top to bottom: the plate's near corner sits **8% above the bottom edge** (41 px) and the subject rises from it. Low subjects sit low; that is correct.
- **Safe area:** nothing closer than **20 px (4%)** to any edge.

## 7. Size check and the tile's states

The platform draws every icon on the same white tile (`NodeTile`, see `COMPONENTS.md`): background `#fff`, 12 px corners (`--radius-panel`), shadow `--shadow-tile` (`0 1px 2px rgb(32 38 48 / 0.12), 0 4px 10px -4px rgb(32 38 48 / 0.2)`), the artwork at 90% of the tile.

| Tile | Where | Artwork | One grid unit |
|---|---|---|---|
| 52 px | Workflow board | 47 px | about 1 px |
| 40 px | Ribbon and tools | 36 px | 0.75 px |
| 30 px | Lane shelves | 27 px | 0.56 px |

At 30 px anything under about 1.5 units disappears. The silhouette and the accent must carry the icon. Look at yours next to `previews/size-check.png`.

The states belong to the tile and the clickable element around it (`.node-hit`), never to the artwork. `previews/states.png` shows each one, drawn with the app's own CSS:

| State | What the platform does |
|---|---|
| Normal | The tile and its shadow |
| Hover | Lifts the tile 1 px and deepens its shadow |
| Selected | A 2 px blue ring (`--color-accent`) round the tile |
| Keyboard focus | A 2 px white gap, then a 2 px blue ring (`--color-focus`) |
| Error status | A badge beside the tile: a symbol and a word in the error colours (`--color-error` on `--color-error-surface`). The artwork is unchanged |
| Soft (available) | Tile at 86% white, artwork at 70% saturation |
| Off (not used) | Tile at 60% white, artwork at 12% saturation and 70% opacity |

An icon must still read when nearly grey (off), so it can't rely on hue alone: keep the light, middle and dark faces.

## 8. Avoid

- Text, numbers or letters in the artwork.
- A background, a vignette, a frame or a tile drawn into the image. The platform draws the tile.
- Interface colours in the artwork: blue, status colours, flag colours (section 4).
- A drawn state: a ring, a glow, a highlight, a badge, a tick or a cross that says "selected", "passing" or "failing".
- Excessive detail. `built.daylight-depth` is the most detailed the family gets.
- Outlines, heavy strokes, gloss, gradients, reflections, glows, drop shadows, textures.
- Any other camera: perspective, front elevation, top-down plan, another isometric angle.
- Faces, robots, mascots, logos, flags.
- More than one supporting cue; more than one phase's tones; colours outside the palette.
- Anything the node does not do.

## 9. Asset dimensions, safe area and background

| | Master (make this) | In a node package (recommended) | Accepted by the platform |
|---|---|---|---|
| Format | PNG | PNG or WebP, as a `data:` URL | PNG, JPEG or WebP (no SVG in v2) |
| Size | 512 × 512 | 256 × 256 | 64 to 4096 px a side; a non-square image is fitted into the square |
| Bytes | | under 60 KB | at most 5 MB |
| Safe area | Nothing within 20 px (4%) of an edge | Nothing within 10 px | Clipping is warned |
| Background | Transparent | Transparent | Transparent (a JPEG is accepted with a warning) |

Transparent means the artwork alone: no white square, no tile, no shadow under the tile, no colour behind the plate. The family leaves 56 to 76% of the square clear.

## 10. How to request an icon (preferred)

Send a **brief**, not a picture. The platform's generator draws the icon in the family's own code, so it always fits. A brief follows `icon-brief.schema.json`:

| Field | Required | What to write |
|---|---|---|
| `styleVersion` | yes | `"2"` |
| `name` | yes | The node's name (never drawn into the icon) |
| `function` | yes | What the node actually does, at most 300 characters: what it reads, what it compares or shows |
| `category` | yes | One of `SITE PROG CLIM ENER ECOL PUBL CULT MOBI STRC SYST SPAC PRES DATA` |
| `metaphor.object` | yes | The one main object, a word from the list below |
| `metaphor.cue` | no | At most one supporting cue, a word from the list below (`none` if the object says it alone) |
| `phase` | no | `site`, `form`, `program`, `schematic` or `present`: the accent colour |
| `notes` | no | What the icon must not imply, or what to show that the words don't cover |

The object and the cue are words, not descriptions, because the platform draws them from the family's own parts:

<!-- vocabulary:start (written by tools/build_icon_pack.mjs from the brief schema) -->
| `metaphor.object` | Shows |
|---|---|
| `tower` | A tower |
| `podium` | A podium with its tower |
| `floor` | A floor plate with rooms |
| `core` | Floors around a core |
| `stairs` | A flight of stairs |
| `facade` | A glazed facade |
| `park` | A park with a tree |
| `street` | A street front |
| `water` | Water |
| `train` | A train |
| `car` | A car on its bay |
| `document` | A record sheet |
| `chart` | A bar chart |
| `coins` | A stack of coins by a tower |
| `sun` | The sun and a shadow |
| `wind` | Wind round a tower |
| `mountain` | A view to the mountains |
| `people` | People |
| `solar` | Solar panels on a roof |
| `sound` | Sound from a tower |
| `heat` | Heat from a tower |

| `metaphor.cue` | Shows |
|---|---|
| `none` | No cue |
| `check` | A check |
| `sun` | The sun |
| `drop` | A water drop |
| `wind` | Wind |
| `bolt` | Energy |
| `pin` | A place |
| `clock` | Time |
| `warning` | A warning |
| `leaf` | A leaf |
| `person` | A person |
| `sound` | Sound |
| `eye` | A view |
| `plus` | Safety |

Without `phase`, the accent follows the category: SITE site, DATA site, CLIM form, ECOL form, PROG program, PUBL program, MOBI program, STRC schematic, SYST schematic, SPAC schematic, ENER schematic, CULT present, PRES present.
<!-- vocabulary:end -->

```json
{
  "styleVersion": "2",
  "name": "Tower width & proportion (CDDG)",
  "function": "Compares each tower's widest plan side with the CDDG 29 m guideline, its height-to-width ratio with the 6:1 tip and its width with the site frontage; shows plate area for information. Says Check, never Fail, on tips.",
  "category": "PUBL",
  "phase": "form",
  "metaphor": { "object": "tower", "cue": "none" },
  "notes": "Show the tower's width, e.g. a dimension along its base. No check mark or warning sign: the node compares with guidance and says Check, never Fail, on tips."
}
```

In a node package it goes in `"icon": { "kind": "brief", "brief": { … } }`. See `example-node/example-node.json`.

Writing a good brief: start `function` from the node's own question and method, not its ambitions. Pick the object for what the node looks at and the cue for what it says about it. Ask whether the cue adds anything the object does not already say; `check` and `warning` only for a node that really checks a rule. If no word fits, choose the nearest, say what you meant in `notes`, or draw an image (section 11).

## 11. If you draw it yourself

An outside agent that makes the image with its own tools must work from the same material our assistant uses: this file, `icon-tokens.json` and the references. Read all three before drawing.

**Best: draw it as SVG code, then export a PNG.** Use the projection in section 2 and the tones in section 3. Start from the plate:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="512" height="512">
  <polygon points="3.58,32.30 24.00,44.14 24.00,42.68 3.58,30.84" fill="#d9dee4"/>
  <polygon points="44.42,32.30 24.00,44.14 24.00,42.68 44.42,30.84" fill="#c7cdd5"/>
  <polygon points="24.00,19.00 44.42,30.84 24.00,42.68 3.58,30.84" fill="#eef1f3"/>
  <!-- your subject: boxes, back to front -->
</svg>
```

A box at plan (x, y), height z, size w × d × h is three polygons, each corner passed through `iso()`:

1. left face, tone 1: (x, y+d, z) (x+w, y+d, z) (x+w, y+d, z+h) (x, y+d, z+h)
2. right face, tone 2: (x+w, y, z) (x+w, y+d, z) (x+w, y+d, z+h) (x+w, y, z+h)
3. top, tone 0: (x, y, z+h) (x+w, y, z+h) (x+w, y+d, z+h) (x, y+d, z+h)

The references' SVGs are the original drawings; read them for real examples. `example-node/icon.svg` was drawn this way from the tokens alone.

**With an image model:** attach the reference PNGs as style references and give it the same rules, for example:

> Isometric icon at a 30° axonometric angle, seen from the front and above, the near corner of a square pale grey ground plate pointing at the viewer. On the plate: [object]. [Cue, upper right, flat.] Flat fills only, three tones per material, light from the upper left: top lightest, left face middle, right face darkest. Massing #fbfbfa / #e2e5ea / #c3c9d2; plate #eef1f3 / #d9dee4 / #c7cdd5; the task in [the phase's three tones from section 3]. No blue highlights, no red or green status marks, no outlines, text, gradients, gloss or background; transparent background. The plate spans 85% of the width, centred, its near corner 8% above the bottom edge. Match the attached references.

Image models often add a background, a gradient or a different angle. Measure the result against section 6 before you send it. If the tool cannot make a transparent background, draw it as SVG instead.

Then attach it: `"icon": { "kind": "image", "dataUrl": "data:image/png;base64,…", "source": "agent", "styleVersion": "2" }`. A 256 × 256 copy (the size the platform shows) under 60 KB keeps the package small. See `example-node/example-node-with-image.json`.

## 12. How the platform checks an icon

Saying an icon follows this pack is not proof. The platform reads the file itself and measures it the way the family was measured. Exact thresholds and definitions: `icon-tokens.json` → `validation` and `measured.method`.

**Refused** (the node keeps its standard drawing; a missing or broken icon never blocks the node):

- Format: PNG, JPEG or WebP, read from the file's first bytes, not its name. SVG is refused in v2.
- Size: not empty, at most 5 MB.
- Renders: the browser can decode it and draw it.
- Dimensions: 64 to 4096 px a side. A non-square image is fitted into the square tile; square is better.

**Shown with a warning**, each in plain words:

- Framing: longest side 81 to 89% of the square; centred left to right within 3%; lowest point 6 to 10% above the bottom edge.
- Clipping: the drawing touches the outer edge (more than 4% of a 2 px ring is solid).
- Background: not transparent around the drawing (more than 49% of the square covered). A JPEG always has a background.
- Legibility at 30 px: too pale to show on the white tile (under 9% of the drawing dark enough), or too busy to read.
- Palette: under 85% of its solid colours near the family palette (section 4).

**Preview:** before an icon is used, the person sees it on its tile at 52, 40 and 30 px with every check in words, and keeps it or drops it. The original file is kept; the tile shows a 256 px copy.

## 13. Versions

- This is version 2. `../latest.json` names the current version.
- **What changed from v1:** the phase accents are the design system's fixed phase tones instead of tones mixed from a hue; this package adds the interface tokens, the shared components and their states, and section 4. The camera, plate, materials, framing and check thresholds are the same as v1 (the family still passes all of v1's thresholds with the new tones; `icon-tokens.json` → `validation.thresholdBasis`).
- Every brief and every image icon names its `styleVersion`. A brief saved under `"1"` is still drawn in v1's colours, so old icons never change. v1 stays at `../v1/`, byte for byte as published.
- Regenerate this pack with `node tools/build_icon_pack.mjs` after any change to the drawings, tones, tokens or tile. Do not edit `icon-tokens.json`, `ui-tokens.json`, the references, the previews or the generated tables by hand.
