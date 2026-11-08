// "Copy instructions for my AI agent" (Ruijie, 7 Nov: "External agents should receive the versioned design instructions
// and a structured brief before generating icons"). One text, versioned with the style pack, that tells any agent how to
// give a node its icon: route A writes a brief that the toolkit draws itself (preferred: it always matches); route B
// makes an image to the style pack, which the toolkit then checks like any upload.
import { CURRENT_STYLE, CUES, OBJECTS, STYLE_PACK_URL } from './brief'

export function agentInstructions(node?: { name: string; question?: string; category?: string }): string {
  const about = node ? `\nThe node: "${node.name}"${node.category ? ` (category ${node.category})` : ''}${node.question ? `. It answers: ${node.question}` : ''}\n` : ''
  return `# Node icon for Tower Design Toolkit (Node Icon Style, version ${CURRENT_STYLE})

You are helping me give a Tower Design Toolkit node its icon. Read the style pack first:
${STYLE_PACK_URL}NODE_ICON_STYLE.md
(tokens: ${STYLE_PACK_URL}icon-tokens.json, brief schema: ${STYLE_PACK_URL}icon-brief.schema.json, reference icons: ${STYLE_PACK_URL}references/)
${about}
## What an icon is
- Artwork only. The toolkit draws the tile, its corners and shadow, the connection points, hover / focus / selected states, the category marker and the node's name. Do not draw any of these, and no text, letters, numbers or logos.
- One architectural object, seen from the toolkit's isometric camera on a small ground plate, plus at most one small supporting cue.
- It must show what the node actually does, never more: no tick for a node that does not check a rule, no lightning bolt for a node that does not compute energy.
- The icon changes only how the node looks. It never changes the node's function, connections or results.

## Route A (preferred): write a brief, the toolkit draws it
Add this to the node package (tower-studio-node@1), next to "metrics":
"icon": {
  "kind": "brief",
  "brief": {
    "styleVersion": "${CURRENT_STYLE}",
    "name": "<the node's name>",
    "function": "<one sentence: what the node actually does>",
    "category": "<the node's category, e.g. CLIM>",
    "metaphor": { "object": "<one object>", "cue": "<one cue or none>" }
  }
}
Objects: ${OBJECTS.join(', ')}.
Cues: ${CUES.join(', ')}.
Pick the object for what the node looks at, the cue for what it says about it. Ask me if two objects seem equally right.

## Route B: make an image (only if you can make images)
- Follow NODE_ICON_STYLE.md exactly: its camera, palette, padding, materials and light.
- One PNG, 512 x 512 px (or 256 x 256 to keep the package small), transparent background: the ground plate 85% of the width, centred, its near corner 8% above the bottom edge, nothing within 20 px of an edge (512 px master).
- PNG, JPEG or WebP only (no SVG), up to 5 MB.
- Add it to the package as:
"icon": { "kind": "image", "dataUrl": "data:image/png;base64,<the file in base64>", "source": "agent", "styleVersion": "${CURRENT_STYLE}" }
- The toolkit checks the file itself (format, size, dimensions, framing, clipping, background, legibility at small sizes, palette). Saying it follows the style is not enough; the checks decide what it shows.

## If anything is unclear
Use route A. A missing or broken icon never blocks the node: it shows the toolkit's standard illustration, and I can give it an icon later in the node builder's Icons tab.
`
}
