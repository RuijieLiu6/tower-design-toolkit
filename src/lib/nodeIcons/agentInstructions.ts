// "Copy instructions for my AI agent" (Ruijie, 7 Nov: "External agents should receive the versioned design instructions
// and a structured brief before generating icons"). The task itself is Ruijie's own prompt ("Create an icon for my custom
// Tower Design Toolkit node…", 7 Nov), followed by what an agent needs to carry it out here: the pack's files, the brief
// words, the two package shapes, what to return and what never to claim.
import { CURRENT_STYLE, CUES, OBJECTS, STYLE_PACK_URL } from './brief'

/** The files an agent must read first; if one can't be fetched, it names it instead of guessing the rules. */
export const PACK_FILES = ['NODE_ICON_STYLE.md', 'icon-tokens.json', 'icon-brief.schema.json', 'references/', 'previews/size-check.png', 'example-node/'] as const

export function agentInstructions(node?: { name: string; question?: string; category?: string }): string {
  const about = node ? `\nThe node: "${node.name}"${node.category ? ` (category ${node.category})` : ''}${node.question ? `. It answers: ${node.question}` : ''}\n` : ''
  return `# Create an icon for my custom Tower Design Toolkit node (style pack version ${CURRENT_STYLE})
${about}
First, read the supplied NODE_ICON_STYLE.md, icon-tokens.json and approved reference images. Use style pack version ${CURRENT_STYLE}:
${PACK_FILES.map((f) => `- ${STYLE_PACK_URL}${f}`).join('\n')}
(everything in one file: ${STYLE_PACK_URL}node-icon-style-pack-v${CURRENT_STYLE}.zip)
If the reference pack is unavailable, tell me which of these files you could not get, rather than inventing the toolkit's visual rules.

Use the node's name, purpose and category to find one clear visual metaphor. Match the references in perspective, materials, lighting, scale and level of detail.

Create only the artwork. The platform adds the surrounding tile, connection points, selection states, category markers and status indicators. No text, letters, numbers, frame or background.

For toolkit-style artwork, use simple architectural forms, the approved accent palette and a transparent background. Keep it recognisable at the toolkit's real node sizes: 52, 40 and 30 px.

The icon must show what the node actually does, never more: no tick for a node that does not check a rule, no lightning bolt for a node that does not compute energy. It changes only how the node looks, never its function, connections or results.

If I provide my own image, keep it as it is unless I explicitly choose to restyle it. Save any restyled result as a separate file.

## Which route
Prefer the toolkit's icon-generation service when it is available. Otherwise use an available image-generation tool with the supplied references. If neither is available, return a structured icon brief: the toolkit then shows its approved fallback illustration until the icon is drawn. Do not claim to have created an image when no image file exists.

### Route A, the toolkit's generation service: write a brief
The toolkit draws a brief itself, with the same parts as its own icons, so the result always fits. Add this to the node package (tower-studio-node@1), next to "metrics":
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
Pick the object for what the node looks at and the cue for what it says about it. The generator draws only the object and the cue; "notes" are kept but not drawn. If the meaning needs something these words can't show (for example a width dimension), use route B.

### Route B, an image tool with the references
- Follow NODE_ICON_STYLE.md exactly: its camera, palette, padding, materials and light. Drawing it as SVG code from icon-tokens.json, then exporting it, is the most reliable way.
- One PNG, 512 x 512 px (or 256 x 256 to keep the package small), on a transparent background. The ground plate spans 85% of the width, centred, with its near corner 8% above the bottom edge. Nothing comes within 20 px of an edge (on the 512 px master).
- PNG, JPEG or WebP only (no SVG), up to 5 MB.
- Add it to the package as:
"icon": { "kind": "image", "dataUrl": "data:image/png;base64,<the file in base64>", "source": "agent", "styleVersion": "${CURRENT_STYLE}" }
- The toolkit checks the file itself: format, size, dimensions, framing, clipping, background, legibility at 30 px and palette. Saying it follows the style is not enough; the checks decide.

## What to return
1. The icon asset: the image file, or the brief if no image was made.
2. A short description of its intended meaning.
3. Its source: the toolkit's generator (brief), the image tool you used, or my own image (original, or restyled as a separate file).
4. The style pack version: ${CURRENT_STYLE}.
5. How it looks in a standard node preview: on its tile at 52, 40 and 30 px next to previews/size-check.png, or after importing the package into the toolkit, where Import and the node builder's Icons tab show it on its tile with every check in words. It is not complete before that check.

A missing or broken icon never blocks the node: it shows the toolkit's standard illustration, and I can change the icon later in the node builder's Icons tab.
`
}
