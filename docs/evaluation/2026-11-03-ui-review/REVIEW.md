# UI review: Real Vancouver viewport and side panels (3 Nov 2026)

Method:
- **Taste:** the app-screen rules (`references/app-screens.md`), and its source lint (`lint.mjs --app`) run on VistaLook, DesignPanel, RightPanel, Inspector, TowerToolbar, ui.tsx and index.css.
- **UI/UX Pro Max:**
  - design-system query: "urban design analysis tool 3D map professional", density 8. It returned Flat Design: no gradients or shadows, contrast at least 4.5:1, visible focus, reduced motion.
  - its priority table: accessibility, then interaction, then layout, then type and colour.
- **Screenshots:** production build, real GPU, 1440×900 and 1280×720, in `before/`. No console errors.

We keep Vista's palette and type: Ruijie chose that look, so the design-system colours were not applied.

## Measurements
- **Map width:** at 1440 the map is about 735 of 1440 px wide (51%); at 1280 it is about 575 px (45%). The two side panels take the rest.
- **Legend:** 3 lines, about 70 px tall at 1440, covering about 10% of the map's height.
- **Bottom tool strip:** 19 tiles in saturated category colours, nearly all of the screen's non-map colour.
- **Lint, 11 FAIL:**
  - 10 gradients: 8 are the A2 crop marks and the evidence hatch, which are data and print marks and stay; 1 is the half-filled "mixed" dot.
  - 1 emoji used as an icon: the ✕ close button.
- **Lint, 10 WARN:** shadows on resting cards (7), backdrop blur (1), monospace (1) and zero-padding (1).
- **Text under 11 px:** in the panels on this screen it appears in Inspector (27 places), SitePanel (14), DesignPanel (13), VistaPanel (13) and NodeBar.

## Top 10 fixes, biggest effect for least risk
1. **Give the map room.** Hide/show buttons for the left and right panels, with keys `[` and `]`, remembered in the browser. The map takes about half the window today.
2. **Compact legend.**
   - Two labelled groups, "Buildings by use" and "On the map", the second listing only layers that are on.
   - The type-source note moves into a tooltip, and a chevron collapses the legend to one line.
   - The legend stays colourful, as Ruijie asked.
3. **One tower label.** Merge "Study tower · 120 m", the pale "3.2.3: 26.4 m above estimated limit (±0.5 m)" tag and the "+0.5 m" chip into one label, with the over-limit line in red. Today they overlap and the pale tag can't be read.
4. **Labels stay inside the map.** Clamp the cone-origin label and the place labels at the canvas edge. Today "en Elizabeth Park · City-sourced estimate", "North Vanc" and "Lower" are cut off.
5. **Quieter tool strip.** Taste's first rule is colour on data, not on chrome. The tiles become neutral, with a thin bar in their category colour, and on, off and selected are told apart by fill and outline rather than by hue. Each tile keeps its own icon and its name on hover.
6. **One primary action.** The filled "Upload a Rhino model" bar is the loudest thing in the left panel on every screen, so it becomes an outline button.
7. **Readable fine print.** Text under 11 px goes to 11 px in the panels of this screen, with muted ink at contrast 4.5:1 or more.
8. **Framing that respects the overlays.**
   - Inspect fits the tower into the free area between the mode bar and the legend; today the base sits under the legend.
   - Observer marks the proposed tower with the same ring Plan uses; today it is a speck in the haze.
9. **Flat chrome.**
   - The ✕ becomes a lucide X icon with its label.
   - No shadows on resting cards or the tower toolbar, and no backdrop blur.
   - The "mixed" dot is drawn as two halves instead of a gradient.
   - The evidence hatch and the crop marks stay.
10. **The right panel leads with the answer.**
    - The node's long description becomes a one-line "About this check" disclosure under its title, so the result comes first.
    - Numbers stay on one line with their units; today "(32.8 / m)" and "93.5 / m" break across lines.

## Checks after the build
tsc, vitest, the build, the e2e tests (heights, vista-site, vista-tabs, align-lot), the accessibility suite, Taste's lint again, and screenshots in `after/` at the same views.

## Built (3 Nov, main session); screenshots in `after/`
1. **Panels hide and show.**
   - Each panel has a hide button in its header, and the keys are `[` and `]`.
   - A hidden panel folds to a thin rail with a button that brings it back. The choice is remembered (`lib/panels.ts`, `components/PanelToggle.tsx`).
   - With both hidden, the map is the full width (1440 px instead of about 735).
2. **Legend.**
   - Two labelled rows, BUILDINGS (8 types) and MAP. The cone entries show only while cones are on.
   - The type-source note moved into a tooltip, and a chevron folds the legend to one line (remembered).
3. **Tower label.**
   - "Study tower · 120 m", with a red line under it: "26.4 m over view 3.2.3 (±0.5 m)", the worst overshoot.
   - The old tag at the cone limit now shows only within 1.5 km.
   - Scene labels no longer fade in the haze (`fog={false}`).
4. **Labels stay whole.**
   - A place label the view's edge would cut is hidden.
   - The cone-origin label slides along so it stays inside the view (`Label keepInView`).
   - Place labels keep clear of the tower's labels.
5. **Tool strip.** On is a white tile with a 3 px bar in its category colour; off has no tile and no bar; selected has an ink ring. Each tile keeps its own icon and its name on hover.
6. **Rhino upload.** Now an outline button.
7. **Text under 11 px.** 96 places raised to 11 px:
   - Inspector, DesignPanel, SitePanel, VistaPanel, HeightsPanel, ViewportDock, ContextLayers, HeightSurface and TowerToolbar;
   - the plan and section tools, ToolPanel, NodeBar and RhinoImport.
8. **Framing.**
   - Inspect fits the tower into the band between the mode tabs and the legend, measured from the page.
   - The proposed tower is drawn without fog, so it stands out in Observer's haze.
9. **Flat chrome.**
   - The ✕ is now a lucide X with a label, and the "some cones" lamp is two halves instead of a gradient.
   - The segmented controls use a 1 px ring instead of a shadow, and the tower toolbar has no blur.
   - Taste lint: **0 FAIL** (11 before). The 9 WARNs left are fair uses: a clock's zero-padding, the word "shadow" in help text, a switch thumb, a file path in monospace, and overlay shadows.
10. **Results lead.**
    - The node's question keeps its first sentence; the rest folds under "More".
    - Numbers and their units never break apart (`keepUnits` in `<U>`).
11. **Zoom limit (Ruijie's extra request).**
    - In Real Vancouver the orbit view can't zoom out or pan past the bounding box of the buildings (`lib/viewLimit.ts`, applied in CameraClamp, 5 tests).
    - It is exact from straight above. Oblique views are judged at the target, so their far side can still show the backdrop and the mountains.
    - Eye-level views (Observer, View from here) are not limited.

Checks:
- tsc clean; vitest 871/871 (5 new); the build passes.
- Before the build, e2e passed 5/5: vista-tabs, heights, vista-site ×2 and align-lot. The rerun after the build, with a11y, is listed below when done.
- After the build: e2e + a11y **18/18 pass** (13 axe screens with no violations; vista-tabs, heights, vista-site ×2, align-lot). Then the tower labels were lifted above the tower, so they never cover it in Observer and place labels keep clear of them; vitest 871/871 and the build pass. Screenshots retaken in `after/`.
