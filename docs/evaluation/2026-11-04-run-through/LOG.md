# Competition run-through (Phase 1 #8), 4 Nov 2026

A VTC entrant on the competition site, end to end:
- production preview (:4173), Edge with its GPU, 1440 × 900;
- screenshots in `shots/`, scripts in the main session's scratchpad (`run-through.cjs`, `run-through-2.cjs`);
- no console errors.

This is the team's own run-through. It does not replace the user study, which still needs real VTC entrants.

## Flow, step by step
| Step | What happened | Finding |
|---|---|---|
| Landing → Guided | The landing page offers Guided or Customize | ok |
| First screen | The new **Site step** (Integrate Vista session, 4 Nov): Real Vancouver or Competition site, address, neighbourhood chips | ok. **F1:** the onboarding dialog opens over the Site step and still describes the old flow ("Massing: shape your tower… Place on map"); its five steps no longer match Site → Volume → Program |
| Competition site | Fixed block with a Verified note and "Next: Volume" | ok. **F2:** the Layers dock opens over the view by default in the competition site. **F3:** the street and district labels in the competition model are pale grey on grey and overlap buildings |
| Volume / Program | Steps move on with "Next" | ok, 280 m entered through the step's tools |
| Results | 30 checks in the picker; VTC hard rules: height band Pass, FSR Check (10.35 under Tier 2), massing inside the block Pass | ok. **F4:** a 30-item flat dropdown is hard to scan; it needs grouping by category or stage |
| Schematic | X-ray, core 21.5% sized to the lifts, 34 cars, title block | ok |
| Present | The X-ray carried over from Schematic as the board's representation; camera presets; capture; drawings; boards (0/4, 0/16 suggested items placed, 26 days to close) | **F5:** Present opens in X-ray, not Clay, after Schematic, so the first capture is the ghosted shell. **F6:** the top-bar icons lose contrast on Present's dark chrome |
| Drawings | Plans for office L22, hotel L44, amenity L50, residential L59, ground floor (podium) L1 and top L67; **one** section (A–A); SE and SW elevations; SVG to scale, PNG, Add to board | see the deliverables below |
| Board composer | Reached from Present → Boards and from Drawings | ok (the composer is a big screen; the screenshot timed out under GPU load, so look again next round) |

## The brief's 16 suggested deliverables (p.30, "a suggestion only") against the tool
| Deliverable | Min | Can the tool make it? | Gap |
|---|---|---|---|
| Programme organization | 1 | Partly: a Clay capture with programme colours | **G1:** no labelled programme stacking diagram (bands, levels, areas, a key) |
| Structural strategy | 1 | Partly: the Schematic X-ray shows core and outriggers | **G2:** no labelled structure diagram (core, outrigger levels, lateral system) |
| Building form and massing | 1 | Yes: captures and the axonometric preset | |
| Wind studies | 1 | Yes: the massing screen's ground zones, captured | Screening only, as labelled |
| Solar / shadow studies | 1 | Yes: the solar map | |
| Sustainability and environmental performance | 1 | Yes: Energy & carbon evidence frames | |
| Site plan | 1 | **No** drawing | **G3:** a to-scale site plan: block, streets to width, tower footprint, podium, open space, POPS, plaza, mid-block link, north, scale |
| Ground floor plan | 1 | Partly: the podium L1 plate with its core | **G4:** the ground floor has no entrances, active frontage, lobby, retail or public-realm edge |
| Typical lower / mid / upper-level plan | 1 each | Yes, by use (office, hotel, residential) | **G5:** label them "lower / mid / upper" for the deliverable tags |
| Primary cross sections | **2** | **One** (A–A through the core) | **G6:** a second section (B–B, at right angles) |
| Skyline view from the QE Park viewpoint | 1 | Partly: the "Skyline from the south (toward QE Park)" preset on the competition model | **G7:** the competition model doesn't reach QE Park; the real view needs Real Vancouver's QE Park viewpoint with the competition tower placed there |
| Mid-city view | 1 | Partly: Aerial | **G8:** add a "Mid-city view" preset |
| Street view | 1 | Yes: "Street: retail high street" | |
| Policy | 1 | Yes: evidence frames with sources | |

## Priorities for the rounds
1. **Round 1, correctness and content:**
   - G6 (a second section), G3 (the site plan drawing), G4 (the ground floor's public edge), G5 (deliverable labels);
   - F5 (Present opens in Clay), F1 (onboarding matches the new steps).
2. **Round 2, design:**
   - F4 (group the results picker), F2 and F3 (the competition site's dock and labels), F6 (contrast in Present);
   - G1 and G2 (programme and structure diagrams).
3. **Round 3, speed and accessibility:**
   - frame time with the cone volumes; G7 and G8;
   - a keyboard-only pass of the Site step and the board composer.
