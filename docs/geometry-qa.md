# Geometry QA: shifted, carved, multi-part imports

How far the analysis nodes can be trusted on an imported tower with shifted floorplates, civic voids, split volumes,
deep recesses and a podium passage. Checked in code and tests only, on a generated fixture
(`src/engine/geometryQa.fixture.ts`, tests in `src/engine/geometryQa.test.ts`). **No 3DM file was read in the app for
this note: nothing here says an imported Rhino model is read accurately.**

Files touched on this branch: this note, the fixture, its test, and `src/engine/publicRealm.ts` (one fix, below). No
threshold changed.

## How an import is stored

The import (`src/lib/import/pipeline.ts` stage C, `src/engine/imported.ts` `sliceStoreys`) cuts the mesh once per
storey, **at mid-height**, on an even floor-to-floor schedule (podium storeys share the podium height). Each storey keeps
its true loops (several parts, non-convex outlines, courtyard holes). Everything below reads those loops in one of
three ways:

| Reading | Function (file) | What it sees |
|---|---|---|
| True loops | `storeyOutline` (massing.ts), `storeySlabs` (sw/decks.ts), `skyStoreys` (silhouette.ts), `towerOccluders` (solarRules.ts), `podiumOutlines` / `towerOutlines` (egress.ts), `storeysOf` (facetPanels.ts), `floorPlate` (storeyWeight.ts) | the plate as modelled |
| Convex hull per storey run | `towerMasses`, `floorRing` (massing.ts, via `storeyHull`) | a void, recess or gap between parts in one storey is filled |
| Typical-storey proxy | `towerFootprint` (median tower storey's hull; podium: hull of all podium storeys), `t.width`/`t.depth`/`podiumWidth`/`podiumDepth` (equivalent rectangles, `towerPatch` in imported.ts), `imported.hull` (whole-mesh hull) | one storey, or one box, stands for all |

## Safe and not safe on a shifted, carved, multi-part design

**Safe** = reads true storey outlines, proven on the fixture or by an existing test. **Manual review** = show as
"not read / manual review" on the boards; the number is a proxy.

| Check | Reads | Verdict |
|---|---|---|
| Open ground, POPS rectangle, mid-block link (both sites) | `masses` → `planParts` (publicRealm.ts) | **Safe.** Void kept, overhang of a shifted tier counted as covered, split podium parts and courtyards kept (`geometryQa`, `publicRealmOutlines` tests) |
| Massing variation along the street | `streetwallStoreys` → `facadeRun` | **Safe.** The void breaks the face (28 m runs, not 80 m) |
| Streetwall height, setback, step-back | `onEdgeParts(partRings(...))` | **Safe.** Every storey read; step-back taken from the nearest (shifted) tier |
| Tower separation | `shafts` (publicRealm.ts) | **Safe after this branch.** Was the typical storey only: a tier shifted 12 m toward a neighbour read 27.0 m Pass where it is 15.0 m Fail |
| Sun access / shadows | `towerOccluders` | **Safe** for outer outlines; courtyard holes cast as solid (conservative); nothing above the last storey |
| Sky-through / silhouette openings | `skyStoreys` | **Safe**; split parts kept |
| Egress (podium and tower plates), facet panels, storey weights | true loops | **Likely safe**: they read the true loops, but were not run on this fixture |
| View cones, containment in the block, height above 21.4 m | `towerMasses` | **Safe but conservative**: the hull adds mass |
| Streetwall continuity, frontage length | `onEdgeParts` / `frontageLength` | **Manual review.** A part's whole extent counts, so a void or recess facing the street reads as wall (fixture: 80 m, true 56 m; continuity Warn where the true share Fails) |
| Facade area, energy, PV roofs, wind-comfort obstacles, export prisms | `towerMasses` | **Manual review.** Hull per run: void walls missing (fixture: 540 m² of facade), roofs overstated, carving lost on export |
| Daylight (SW input), opening field, diagrid rings, scene export | `floorRing` | **Manual review.** Hull per storey; the daylight-depth screen already says it reads a box plate |
| Floorplate size, plan dimension, frontage share, slenderness, wind screen, wind podium reach | `t.width`/`t.depth`, `towerFootprint` | **Manual review.** Median plate as an equivalent rectangle; a shifted tier is not seen |
| HBP area gate, aviation relaxation checklist, drawings, proposal check | `towerFootprint` | **Manual review.** Typical storey only: a shifted tier outside it is missed |
| Corner reading | `floorOutline` (corners.ts) | **Manual review.** Largest loop only: the other part of a split storey is dropped |
| Homes and keys per floor | `storeyPlate` (interior.ts) | **Manual review.** Each storey as an equivalent rectangle |

## Modelling limits no check can fix

- **Voids at mid-height only.** A recess or opening that does not cross a storey's mid-height plane is not seen.
- **A civic void modelled as a closed solid** (an enclosed atrium) slices as floor and counts as floor area. Only a void
  modelled as an open gap (nothing at mid-height) reads as "no floor" (tested).
- **Even storey heights.** A double-height civic room is sliced at the schedule's floor-to-floor; set the storey to
  "no floor" by hand where it is one.
- **Podium top is a heuristic** (`detectPodiumTop`: the plate shrinks under 70%); check it on import.

## Checks run (25 Nov)

`npm test` 250 files, 1,959 passed, 3 skipped (12 new). `npm run build` passes. `npm run eval`: engine 58 of 58 cases
pass; the UI part stops at "C3 · out of scope" (`place-first-tower` not detached within 30 s, 13 UI cases then not run).
The same C3 failure happens on `origin/main` (cf92512) without this branch's change, so it is not caused here.

## Still needs the real Rhino file

1. Import it in the app and confirm units, north, datum, podium top and the storey count.
2. Compare a few storeys' loops with the Rhino section at the same height (void, passage, split parts present).
3. Check the plate-sum against mesh volume (`plateSumCheck`) and the mesh health report.
4. Read the "manual review" rows above against the real outlines before any board uses them.
5. Rebuild this fixture's numbers from the real model if a reading differs.
