# Rhino import audit: what a Rhino user can bring in today, and what is lost or manual

*3 Nov 2026 · Tower Design Toolkit v0.1 (`tower-studio/`, last commit `fde3c3a` plus local work) · single-pass review of the code, not critiqued (research policy of 22 Oct).*

**Method.** I read the import path end to end (`src/lib/import/{load,rhino,types,pipeline,store}.ts`, `src/components/ImportDialog.tsx`, `ImportHost.tsx`, `src/engine/{importGeom,imported,meshHealth}.ts`), the project format (`src/lib/project/*`) and the export path (`src/lib/export/*`). Behaviour of the Rhino reader was checked against **rhino3dm 8.35.0** in Node on 3 Nov 2026 with small probe files written by rhino3dm itself: Brep faces, trims and edges, block definitions and instances, object attributes and layer tables. No competition model was used.

Evidence flags as in the app: 🟩 verified (code read or probe run), 🟧 team assumption, ⬜ unverified.

---

## 1. Summary

Today a Rhino user can bring in **one closed mass per import**: meshes, extrusions, and polysurfaces that were saved with render meshes. Units and the Earth-anchor north are read from the file, and the person confirms the datum. The mass is sliced into storeys, and every node runs on it.

Everything that makes a Rhino model a *model* is dropped on the way in:
- layers are a checkbox filter only;
- names, user strings and object ids are not kept;
- curves, blocks and context are skipped or merged into the tower;
- several towers become one tower.

One finding is a **bug**, not just a limitation: the geometry *inside* a block definition is imported as ordinary objects at the definition's base point.

| # | Rhino content | Today | Lost or manual | Flag |
|---|---|---|---|---|
| 1 | Layers | Full layer path read; used as an on/off filter in "What to import". Layers whose name matches `context\|site\|surround\|existing\|tree\|furniture\|annot\|dimension\|text\|grid\|camera\|light` start unticked | Layer meaning is lost after import: the tower record keeps only the file name. A massing layer named e.g. "Opposite site tower" starts excluded because it contains "site" | 🟩 |
| 2 | Layer colours | Not read | Lost. Export writes its own layer colours | 🟩 |
| 3 | Object names | Read (or `object N`), shown only in the "skipped" list | Not carried to the tower, storeys or export | 🟩 |
| 4 | User strings / attributes (object and layer) | Not read | Lost. Our own `.3dm` export writes `use`, `level`, `source`, `evidence` user strings, but the importer never reads them back, so program does not survive a round trip | 🟩 |
| 5 | Object ids (GUIDs) | Not read | No stable link from a storey or tower back to the Rhino object it came from | 🟩 |
| 6 | Block instances | Skipped: "explode blocks in Rhino before importing" | Manual explode in Rhino | 🟩 |
| 7 | **Block definition geometry** | **Imported as ordinary objects at the definition base point** (the object table lists definition members with `isInstanceDefinitionObject = true`; the reader does not check it) | **Bug:** a file with blocks gains phantom masses near the origin and loses the placed instances | 🟩 probe |
| 8 | Curves: site boundary, setbacks, street lines | Skipped: "Not a surface or solid" | Site boundary, setbacks and street lines must be redrawn in the app, or are absent (Real Vancouver has no site outline at all) | 🟩 |
| 9 | Polysurfaces / surfaces (Brep) | Read only through the render meshes saved in the file | Files saved with *Save small*, or never shaded, import nothing for those objects. Most massing polysurfaces are planar, and rhino3dm exposes face loops, trims and edges, so planar faces can be meshed from their edges without a render mesh (not done today) | 🟩 probe |
| 10 | Extrusions | Saved render mesh, else an exact prism from the profile | Good | 🟩 |
| 11 | Meshes | Read in double precision (UTM-sized coordinates survive) | Good | 🟩 |
| 12 | SubD | Skipped with a fix ("ToNURBS or Mesh") | Manual convert | 🟩 |
| 13 | Multiple towers | All ticked layers are merged into **one** mass and one tower | Two towers become one "tower" with combined plates: total floor area is right, but height, lifts, egress, slenderness and view cones are per tower and come out wrong. The workaround is manual: import twice, ticking a different layer each time | 🟩 |
| 14 | Podium | Found by a heuristic (the plate shrinks by 30% or more and stays smaller for 10 m) | A podium layer is not used; the podium top can be typed in | 🟩 / 🟧 heuristic |
| 15 | Program by floor or zone | Storeys take the selected tower's program bands by share | Program volumes or layers in Rhino are ignored; the user re-tags storeys one by one in the app | 🟩 |
| 16 | Core | Not read; the core is sized to the lifts (auto) or set as a share | A drawn core is lost | 🟩 |
| 17 | Context buildings | Excluded by layer name, otherwise **sliced into the tower** | Context never reaches the solar, shadow or view checks. A context layer with an unexpected name inflates the tower's plates | 🟩 |
| 18 | Rhino units | mm, cm, m, in, ft read; dm and km scaled to metres; anything else ("None", yards, microns, …) is treated as unset, and the user must confirm a guess | Good, with a confirm step | 🟩 |
| 19 | North | Earth anchor `modelNorth` when a location is set; otherwise **unresolved**. Options: base model, true, street grid, magnetic, custom | Good; the choice is not remembered per file | 🟩 |
| 20 | Datum | File z = 0, lowest point, geodetic (subtract the project ground) or custom | Good; not remembered per file | 🟩 |
| 21 | Mixed units inside one file | Not detected. One unit applies to the whole file | A block or layer pasted from a file in other units (1000× too small or too large) is sliced as is | 🟩 |
| 22 | Very large files | Whole file read on the **main thread** (`file.arrayBuffer()`, then rhino3dm in the page); one "Reading…" spinner, no progress; the page freezes while Breps are converted | A 100 MB+ file can freeze the tab for many seconds; no size warning | 🟩 |
| 23 | Privacy | Read in the browser only; the drop zone says "the file stays on this computer" | Good; the landing page does not offer upload at all | 🟩 |
| 24 | Entry points | Design panel "Import" button; drop anywhere in the guided app; "Re-import" on an imported tower | Not on the landing page and not in the Project menu | 🟩 |
| 25 | Saved projects | The tower keeps file name, format, unit/north/datum sources, storeys and hull. Meshes are kept in the browser (IndexedDB) and in exported `.json` files | No record of which layer or object a storey came from; the layer choice is gone after import | 🟩 |
| 26 | Export back | `.3dm` (layers per use, user strings per storey, document notes, Earth anchor north), OBJ, glTF | An imported tower is exported as **one** mesh on "Imported massing" without its storey uses; site and context are not exported; the importer cannot read the roles back | 🟩 |

## 2. What this means for the user

A Rhino user who models the way practices do (separate layers for tower, podium, core, program volumes, a site curve, context blocks, everything in millimetres, no Earth anchor) gets this today:

1. They untick or rename layers by hand, because context and site are excluded by name and anything else is merged.
2. They import each tower separately.
3. They re-tag every storey's program in the app.
4. They redraw nothing, because curves have nowhere to go: the site outline simply does not exist in the tool.
5. Their context blocks either vanish (blocks) or, worse, appear as phantom masses at the origin (block definitions).
6. Solar and view checks run without their context.
7. On export, program is lost on the imported tower, and re-importing the export does not give back what they had.

## 3. What the new flow must fix (feeds the build)

| Need | Fix in the new upload flow | Rows |
|---|---|---|
| Keep the meaning of layers | A **role mapping** step: each layer (or object name, or user-string value) gets a role: tower massing, podium, site boundary, context buildings, program (with a use), core, or ignore. Live preview; the mapping is remembered per file | 1, 13–17 |
| Keep where each thing came from | Per element: file, layer, object id, object name, user strings, how the mesh was made, and an evidence flag | 3–5, 25 |
| Read what is skipped today | Closed curves on a site layer become the site boundary; block instances are placed with their transforms (nested, up to 8 levels); definition geometry is no longer imported on its own; planar polysurfaces without render meshes are meshed from their edges | 6–9 |
| Several towers | Tower and program objects are grouped into towers by plan overlap (or by a `tower` user string); the podium and core attach to the tower they overlap most | 13, 14, 16 |
| Program from Rhino | Program volumes tag the storeys they contain (use from the layer name or a `use` user string) | 15 |
| Context in the checks | Context objects become extruded footprints that cast shadows in the solar check | 17 |
| Plain-language checks | One list: units, north, datum, health, mixed-scale layers, and what is ignored and why | 18–22 |
| Large files | Read in a Web Worker with progress; size note | 22 |
| A round trip | Export writes roles, uses, levels, storey schedule and provenance as user strings; import reads them back | 4, 26 |

## 4. Limits that stay (honest list)

- **Curved Breps without render meshes** still cannot be meshed in the browser (openNURBS has no mesher; ⬜ rhino3dm may add one). The message says how to save render meshes.
- **SubD** stays skipped with its fix.
- **Setbacks and street lines** are read as curves but have no tool that uses them yet; they are listed as "kept for reference" or ignored with a reason.
- **Context as extruded footprints** is a team assumption: sloped roofs and overhangs are simplified.
- **IFC and glTF** keep their current readers on the main thread; only `.3dm` and OBJ move to the worker.

## 5. Sources

- Code: files listed under *Method* (read 3 Nov 2026).
- rhino3dm 8.35.0 (McNeel, MIT), probed in Node 24.20.0 on 3 Nov 2026: `File3dmObjectTable` lists definition members with `attributes().isInstanceDefinitionObject === true`; `InstanceReference` exposes `parentIdefId` and `xform`; `BrepFace` exposes `isPlanar()`, `outerLoop()`, `loops`, trims with `edgeIndex` and `isReversed`; `Brep.edges()` gives curves with `pointAtStart` / `pointAtEnd`; `ObjectAttributes` exposes `id`, `getUserStrings()`; `Layer` exposes `color`, `fullPath`, `getUserStrings()`.
- Research P14-M02 (import routes), P14-M03 (units, north, datum), P14-M04 (storey slicing), P14-M05 (geometry health), cited in the code.

## 6. Status after the build (3 Nov 2026, evening)

| Row | Status |
|---|---|
| 1-5, 8, 13-17, 25, 26 | Fixed by the role mapping and the Layer 0 interchange (`INTERCHANGE.md`) |
| 6, 7 | Fixed: blocks placed (nested, mirrored, rotated and scaled), definitions never read alone, cycles and missing members listed (Vista v34 browser-rhino.js as reference) |
| 9 | Fixed for planar faces: exact rebuild from the BRep with an area check and a closed-shell check (Vista v34 rhino-planar.js); curved faces are counted as "curved face not imported", never faked |
| 18-21 | Plain-language checks, mixed-scale warning; mapping remembered per file |
| 22 | Fixed: Web Worker with progress and Cancel |
| 24 | Fixed: landing page, Project menu, drop anywhere |
| New | Align to the map: anchor point and turn, or the file's Earth anchor; preview on the City footprints with demolished buildings and a keep checkbox (Vista v34 georeference.js) |
| Still open | Curved Breps without render meshes; the 3D view does not draw the uploaded site line and context yet (Viewport.tsx is another work stream) |
