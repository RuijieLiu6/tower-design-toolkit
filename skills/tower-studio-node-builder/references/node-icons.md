# The node's icon

Every design node in Tower Design Toolkit wears a small illustrated icon from one family: the same isometric view, ground plate, light and colours. A node package may carry its own icon in the optional `icon` field. The rules are in the **node icon style pack, version 1**:

https://ruijieliu6.github.io/tower-design-toolkit/style-pack/node-icons/v1/ (all of it in one file: `node-icon-style-pack-v1.zip`)

| File in the pack | What it holds |
|---|---|
| `NODE_ICON_STYLE.md` | The rules: what an icon shows, camera, plate, light, tones, framing, what to avoid, how it is checked |
| `icon-tokens.json` | The exact numbers and colours |
| `icon-brief.schema.json` | What a brief must contain |
| `references/` | Eight approved icons, as SVG and 512 px PNG |
| `example-node/` | The worked example node with its icon attached both ways |

## Ask for a brief, not a picture (preferred)

Ask the designer one question near the end of the interview: **"What should the node's icon show?"** Offer two or three ideas drawn from what the node actually does: one object and, if it helps, one cue, each a word from these lists (the platform draws them from the family's own parts):

- `metaphor.object`: tower, podium, floor, core, stairs, facade, park, street, water, train, car, document, chart, coins, sun, wind, mountain, people, solar, sound, heat
- `metaphor.cue`: none, check, sun, drop, wind, bolt, pin, clock, warning, leaf, person, sound, eye, plus

Then write:

`"icon": { "kind": "brief", "brief": { "styleVersion": "1", "name": "…", "function": "…", "category": "…", "metaphor": { "object": "…", "cue": "…" } } }`

- `function`: what the node actually does, at most 300 characters. Take it from the node's question and method.
- `category`: the package's category code. Optional `phase` (`site`, `form`, `program`, `schematic`, `present`) picks the accent colour (left out, it follows the category); optional `notes` (≤ 500 characters) says what the icon must not imply, or what to show that the words don't cover.
- The icon must not suggest anything the node cannot do: `check` or `warning` only for a node that really checks a rule, `bolt` only if it computes energy, no `pin` for a node that reads no site.

Tower Design Toolkit draws the icon from the brief in the family's own code, so it always fits. A worked brief is in the pack's `example-node/example-node.json`.

## If the designer wants an image

Only if they ask, and only if you can make a transparent PNG or WebP:

1. Read `NODE_ICON_STYLE.md`, `icon-tokens.json` and the reference images first. They are the same instructions our own assistant follows.
2. Best: draw it as SVG code with the pack's projection and tones (section 10 of the style guide), then export it. An image model may be used with the reference PNGs attached; check its output, which often adds a background or the wrong angle.
3. Export a 512 × 512 master: plate 85% of the width, centred, its near corner 8% above the bottom edge, nothing within 20 px of an edge, transparent background, no text.
4. Attach it as `"icon": { "kind": "image", "dataUrl": "data:image/png;base64,…", "source": "agent", "styleVersion": "1" }`. PNG, JPEG or WebP, up to 5 MB and 64 to 4096 px a side; a 256 × 256 PNG or WebP under 60 KB is best (the size the platform shows, and the package stays small). SVG is not accepted yet.

## What happens on import

Tower Design Toolkit checks the icon itself: file type by its bytes, size, dimensions, that it decodes; then framing, clipping, background, legibility at 30 px and closeness to the family palette. It shows the icon on its tile at 52, 40 and 30 px with any warnings, and the designer keeps it or drops it. Never tell the designer an icon "passes" or "follows the style": say the platform will check it. The icon is optional: a package without one still imports.
