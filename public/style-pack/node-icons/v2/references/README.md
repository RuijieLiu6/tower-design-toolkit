# Reference artwork (style pack v2)

The approved masters. Each is the original drawing from the icon family (`src/components/icons/nodeArt.tsx`), exported two ways: `<id>.svg` (the drawing itself, 48-unit viewBox, transparent) and `<id>.png` (512 × 512, transparent). Give an image model the PNGs; give a code-drawing agent the SVGs.

| Node | Phase tones | What it shows | Longest side |
|---|---|---|---|
| `built.viewcones` | Site (#73d0e8, #00a9d6, #0084a7) | A sloping view plane passing over a tower: a spatial diagram on an object. | 0.852 |
| `built.sun` | Form (#ffae9b, #ff6b4a, #c7533a) | A tower, its shadow on the ground, and the sun as the one supporting cue (upper right). | 0.852 |
| `built.wind-screen` | Form (#ffae9b, #ff6b4a, #c7533a) | Wind brought down a tower face to the street, and the risk zone it makes there. | 0.852 |
| `built.pr-frontage` | Program (#f9df8d, #f4c430, #be9925) | A podium with shopfronts and accent canopies along the street. | 0.852 |
| `built.core-lifts` | Schematic (#bfa5fa, #8b5cf6, #6c48c0) | Floor plates around an accent core that rises through them, lift shafts as thin lines. | 0.852 |
| `built.energy-carbon` | Schematic (#bfa5fa, #8b5cf6, #6c48c0) | Solar panels on a roof, and a flat lightning bolt as the one cue. | 0.852 |
| `built.daylight-depth` | Schematic (#bfa5fa, #8b5cf6, #6c48c0) | A window wall and the daylit floor beside it: the most detailed the family gets. | 0.852 |
| `built.provenance` | Present (#ee99dd, #e145c2, #b03697) | A record sheet with its entries and an accent stamp: a log, not a robot. | 0.852 |

Longest side = the artwork's box as a fraction of the canvas (family median 0.852). The previews in `../previews/` show all 31 drawings on their tiles, these references at 52, 40 and 30 px, and the tile's interface states.
