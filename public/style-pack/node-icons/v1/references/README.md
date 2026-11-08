# Reference artwork (style pack v1)

The approved masters. Each is the original drawing from the icon family (`src/components/icons/nodeArt.tsx`), exported two ways: `<id>.svg` (the drawing itself, 48-unit viewBox, transparent) and `<id>.png` (512 × 512, transparent). Give an image model the PNGs; give a code-drawing agent the SVGs.

| Node | Phase colour | What it shows | Longest side |
|---|---|---|---|
| `built.viewcones` | Site (hue 206) | A sloping view plane passing over a tower: a spatial diagram on an object. | 0.852 |
| `built.sun` | Form (hue 14) | A tower, its shadow on the ground, and the sun as the one supporting cue (upper right). | 0.852 |
| `built.wind-screen` | Form (hue 14) | Wind brought down a tower face to the street, and the risk zone it makes there. | 0.852 |
| `built.pr-frontage` | Program (hue 48) | A podium with shopfronts and accent canopies along the street. | 0.852 |
| `built.core-lifts` | Schematic (hue 268) | Floor plates around an accent core that rises through them, lift shafts as thin lines. | 0.852 |
| `built.energy-carbon` | Schematic (hue 268) | Solar panels on a roof, and a flat lightning bolt as the one cue. | 0.852 |
| `built.daylight-depth` | Schematic (hue 268) | A window wall and the daylit floor beside it: the most detailed the family gets. | 0.852 |
| `built.provenance` | Present (hue 300) | A record sheet with its entries and an accent stamp: a log, not a robot. | 0.852 |

Longest side = the artwork's box as a fraction of the canvas (family median 0.852). The previews in `../previews/` show all 31 drawings on their tiles and these references at 52, 40 and 30 px.
