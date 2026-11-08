# Example node package with its icon (style pack v2)

The worked example from the node-builder skill (*Tower width & proportion (CDDG)*, `community.example.tower-width`), with an icon attached in each of the two ways a package can carry one. Everything except `icon` (and the `createdWith` note) is the skill's `references/example-node.json`.

| File | Icon | When to use it |
|---|---|---|
| `example-node.json` | `"icon": { "kind": "brief", "brief": { … "styleVersion": "2" … } }` | **Preferred.** You describe the icon; the platform's generator draws it in the family's own code, so it always matches. The brief follows `../icon-brief.schema.json`. |
| `example-node-with-image.json` | `"icon": { "kind": "image", "dataUrl": "data:image/png;base64,…", "source": "agent", "styleVersion": "2" }` | You (or your AI) drew the icon. It travels inside the package as a 256 × 256 PNG data URL (8 KB here). The platform checks it (`../NODE_ICON_STYLE.md`, section 12) and previews it on its tile before it is used. |
| `icon.png` | | The same icon as a 512 × 512 transparent master, for people to look at. |
| `icon.svg` | | How it was drawn: from `../icon-tokens.json` alone, the way section 11 of the style guide describes. |

The icon shows a plain tower on the ground plate with its base width dimensioned: what the node measures. It has no check mark or warning sign, because the node compares with guidance and says *Check*, never *Fail*, on the tips; and no blue or status colour, because those belong to the interface (section 4). The accent is the Form phase's three tones.
