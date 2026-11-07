# Research figures on the landing page

Copied on 6 Nov 2026 from the Tower Design Toolkit research site, by the same team (Ruijie Liu and Sinnie Choi):
https://github.com/RuijieLiu6/vancouver-tower-toolbench at commit 2efd613.

- `diagrams-tdt.js`, `diagrams-tdt.css`: the "How the toolkit runs" figures (design loop, why one platform, open-source
  loop, canvas), unchanged.
- `diagrams-base.css`: the `.v2-*` base styles and colour variables those figures use, taken from `tower-tools-hub.html`
  and scoped to `.tdt-research`.
- `picto/`: the pictograms the figures draw (drawn with GPT image generation for the research site, as it says).

Loaded only when the landing page's figure section comes into view (`src/components/landing/ResearchFigures.tsx`).
Change them in the research site's repository first, then copy them here.
