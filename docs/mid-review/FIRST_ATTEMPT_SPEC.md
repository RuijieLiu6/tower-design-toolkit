# First attempt (mid review, Fri 23 Oct): view-cone height check on real City data

**Status (22 Oct, 03:20):** built and automated. The check runs in Tower Studio as the *View-cone height check* node on the Real Vancouver project, with a *Height limit surface* layer over downtown. Cases 1–7 below run with `npm run eval`, together with 14 cases for other nodes: **21 of 21 pass** (`evaluation-2026-10-22/report.md`, also shown on the app's Status page). Two differences from this spec are listed under *Build steps*.
**Course requirement:** *"the smallest version of the most important part of your tool: the one step that, if it works, shows the idea is possible … run on one real input, and say what it showed."* (Assignment 2 brief, p.3)

## The one step

> Given a tower massing at a real downtown location, estimate how high each protected public view allows it to go. Report the cone, clause and overage, or **stop and say "no estimate"** when the City data is missing.

Vista (Assignment 1) could only show *plan* overlap, because the City's open data has no cone heights. This step adds the **height**, which is the new idea in the Context Model.

## Inputs (all real, all already on disk or public)

| Input | Source | Status |
|---|---|---|
| 24 view cones: polygons, origin (first vertex), origin elevation `Lv` | City `ViewCone` FeatureServer layer 0, fetched 21 Oct 2026 (EPSG:26910) | ✅ in the app (`tower-studio/src/data/viewcones.json`) |
| Lower-boundary slopes `k` for 8 cones | C01 research: Council reports and City site sheets | ✅ in the engine with tier, flag, ±U95 and source each (`src/engine/viewCones.ts`) |
| A real massing | Vista presets (Shangri-La, The Butterfly, Vancouver House), or a block typed in, or a `.3dm` | ✅ the study tower typed in, or an imported .3dm, OBJ, glTF or IFC (Design → Towers → Import). Vista presets not ported |
| 3D context for the view | Vista's existing context packs | ✅ replaced by City data: 6,721 building footprints, 30 m terrain, LiDAR roof heights for 427 buildings (1 of 4 tiles; 3 still need Ruijie) |

## Method (from research packet C01; passed its round-3 gate)

- **Cone membership:** point-in-polygon on the City wedge, with a 1.5 m edge band.
- **Height limit:** a rising sight line, not a flat plane. **Z = Lv + k × D**, where D is the distance along the wedge bisector (planar form; the research found it fits City values better than radial distance).
- **Governing limit:** the minimum Z over all covering cones that have a slope.
- **Status per cone:**
  - INTERSECTS when the overage is above 0.1 m
  - BOUNDARY when it's within 0.1 m
  - CLEAR when it's below the limit
  - **IN CONE: NO ESTIMATE** when the cone's slope is unknown

  CLEAR is allowed **only** when every covering cone has an estimate.
- **Every result shows** clause 3.1.1 of the Public Views Guidelines (Feb 2026 version, p.6) and the banner "Estimate only; the City View Cone Assessment governs."

**Cones with slopes today (planar k):**
- A: 0.05889
- 3.2.3 and 3.2.4: 0.000404
- 28: 0.05007
- H: 0.05354
- J2: 0.07572
- 27.1: 0.04549
- 27.2: 0.04115

<span style="color:#d4148c">**FALSE ASSUMPTION corrected:**</span> 9.2's old slope (0.0488) belongs to its *previous* origin and isn't used. All the other downtown cones show NO ESTIMATE until the City replies (see `city-requests/`).

## Evaluation cases (course: typical / boundary / out-of-scope / repeated)

| # | Type | Input | Expected | Source |
|---|---|---|---|---|
| 1 | Typical (regression) | Cone A, 4 City sheet points at Robson and Cambie | 104.02, 104.04, 105.69, 105.71 m geodetic; fit within **0.1 m** | City sheet 3 Oct 2024 (C01-S11) |
| 2 | Typical (regression) | Cone 3.2.3, 5 sheet points at the same site | 126.18–126.20 m; within **0.1 m** | C01-S11 |
| 3 | Out of scope: must stop | Point 49.2800, -123.1200 (inside 3.2.2 only) | **IN CONE: NO ESTIMATE** at any height, cone ID and clause shown | Recomputed 21 Oct ✅ |
| 4 | Out of scope: must stop | Point 49.27471, -123.1216 (3.2.1 and D) | **NO ESTIMATE** for both cones | Recomputed 21 Oct ✅ |
| 5 | Boundary or conflicting | Point 49.2815, -123.1150 (3.2.3 only) | Estimate **126.37 m** geodetic; a tower at limit ±0.05 m reads BOUNDARY | Recomputed 21 Oct ✅ |
| 6 | Definition anchor | Cone 28, 1 km on axis | 106.1 m (planar), from reference 65.7 m at Dr 197.7 m | Council report Feb 2026 (C01-S06) |
| 7 | Repeated run | Case 5 run 5 times | Identical output (deterministic code, no model in the loop) | — |

## What it already showed (for the "what it showed" paragraph; your words)

- **The City's own layer has empty height fields.** `REFERENCE_LOCATION`, `REFERENCE_ELEVATION_M` and `REFERENCE_DISTANCE_M` are blank for all 24 cones (checked 21 Oct).
- **Most of the CBD can't be estimated yet.** About 80% of CBD test cells fall in at least one cone without a slope, so the tool has to say *"no estimate"* rather than guess. City Request 0 is drafted.
- <span style="color:#d4148c">**FALSE ASSUMPTION caught:**</span> the competition base model's saved north is +Y, but its drawn north arrow is **45°** off, and its saved location is Richmond rather than downtown. A sun or shadow study trusting the file would be rotated 45°.
- **Still unknown:** whether `Lv` includes eye height, which vertical datum is used (CGVD28 or CGVD2013), and whether the first vertex is the surveyed origin. All three are in Request 0.

## Delegation (for the tool-logic diagram)

| Step | Who or what |
|---|---|
| Cone membership, Z, status | **Deterministic code**: no AI, repeatable |
| Slope harvesting from Council PDFs | AI-assisted research, **checked by people**, every number cited |
| Relaxations (Higher Buildings, Exceptional Sites 3.4), minor-element and hardship clauses | **Person decides.** The tool only shows the clause text |
| Final word | **City View Cone Assessment** |

## Build steps (status 22 Oct)

1. ✅ Web-first: built into Tower Studio, not as a separate static page. Cones and slopes ship with the app.
2. ✅ Height and status engine (a pure function), with cases 1–7 in `src/eval/cases.ts`. `npm run eval` also runs cases 3, 5 and 7 through the UI and writes a dated report with screenshots.
3. ✅ Cone wedges coloured by status, plus the *Height limit surface* (lowest limit of all covering cones, hatched where any covering cone has no estimate). The section of the tower against the sight line is not drawn yet.
4. ✅ Result panel: cone, clause, limit and overage in metres, flag, source, rule card, banner.
5. ⬜ A 60-second backup video is not recorded. `screens/` holds a still backup in demo order.

**Differences from this spec:**
- BOUNDARY appears as *Within uncertainty*, using each cone's ±U95 band: 0.5 m for the City-sheet fits and 1.0–1.5 m for the others, instead of a fixed 0.1 m. The regression cases still use 0.1 m.
- Case 6 passes at 1 km (106.07 m). At the Council reference point it reads 65.90 m against 65.7 m. The gap is reported in the evaluation, not tuned away.
