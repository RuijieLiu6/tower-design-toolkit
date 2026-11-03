# Layer 0 interchange: `tower-studio-interchange@1`

*3 Nov 2026 · Tower Design Toolkit v0.1 · code in `tower-studio/src/lib/interchange/` · audit that motivated it: `research/rhino-interchange/AUDIT.md`.*

One uploaded model (a Rhino `.3dm`, or OBJ, glTF, IFC) becomes **one interchange model** in the project file. Every tool on the site reads it through a converter, so a tower, a lot line or a context building means the same thing in the evaluation nodes, the view-cone check, the solar check, the drawings and boards, the Customize canvas and the export. Every element keeps where it came from: file, layer, Rhino object id, user strings, and an evidence flag.

```
.3dm / OBJ / glTF / IFC
   │  reader (Web Worker for .3dm and OBJ; nothing leaves the browser)
   ▼
RawImport: volumes, curves, layers + colours, object ids, user strings, what could not be read
   │  role mapping (one screen, live preview; remembered per file)
   ▼
buildModel(): units → north → placement → zero level; towers grouped, sliced, tagged; site, context
   │
   ├─▶ InterchangeModel  (project file: `models.vtc` / `models.city`)
   └─▶ Tower records     (project file: `towers`, each `imported.source` points back at the model)
           │
           ▼  converters (src/lib/interchange/converters.ts)
   nodes · view cones · solar · public realm · lifts/egress/interior · drawings/boards · Customize · export
```

## 1. Where it lives, and versions

- **Project file** `tower-studio-project@1` gains one optional top-level key, `models: { vtc?, city? }`. Files saved before 3 Nov 2026 have no `models` and open exactly as before (`toDesign` fills `{ vtc: null, city: null }`). The JSON Schema (`src/lib/project/project.schema.json`, `$defs/interchangeModel`, `$defs/modelElement`, `$defs/role`) validates it on the way in.
- **Version**: every model carries `version: "tower-studio-interchange@1"`. Inside a model, unknown properties are allowed, so a later minor version can add fields without breaking older readers. A breaking change gets `@2`.
- **Undo and autosave**: `models` is a design key (`design.ts`, `history.ts`), so an upload is one undo step together with the towers it adds.
- **Meshes** stay out of the model, as before: the import store keeps them in this browser (IndexedDB `tower-studio-imports`), and *Export .json* writes them under `importedMeshes`. Without them a tower draws as stacked plates and every check still runs.

## 2. Roles

| Role | Meaning | Read from | Used by |
|---|---|---|---|
| `tower` | Closed volumes of a tower | Meshes, extrusions, polysurfaces, blocks | Sliced into storeys |
| `podium` | The podium of a tower | Same | Its top is the podium top; its `use` tags the podium storeys |
| `program` | Program by floor or zone | Same | Counts as massing **and** tags the storeys whose mid-height it spans with its use |
| `core` | The core | Same | Core area ÷ plate area per storey → the tower's core share (median) |
| `site` | Lot line | Closed curves; or the outline of a flat surface | Site area, edges, setbacks |
| `context` | Existing buildings | Volumes | Extruded footprints that cast shadows |
| `ignore` | Left out | Anything | Listed as ignored, with the reason |

**Mapping** is by layer (default), by object name, or by the value of a user string (e.g. `role`). The guess comes from names and user strings (team assumption, 3 Nov 2026):
- an object's `role` user string decides when 80% or more of the objects carry one (that is how an export reads back);
- otherwise layer names, in this order: annotation, dimensions, text, grids, trees, setbacks, streets → ignore; `core`, `lift`, `stair` → core; `podium`, `plinth`, `base` → podium; `context`, `existing`, `neighbour`, `surround` → context; `site`, `boundary`, `lot`, `parcel` → site; a use word (`office`, `residential`, `hotel`, `retail`, `civic`, `amenity`, `plant`) → program; `tower`, `mass`, `volume`, `building` → tower; anything else with volumes → tower;
- an object's own `use` user string beats its row's use.

The person checks every row in the mapping screen. Rows they move past count as **their decision**: provenance flag `team_assumption`; a model built from guesses alone (tests, evaluation) carries `unverified`.

## 3. The model

```ts
interface InterchangeModel {
  version: 'tower-studio-interchange@1'
  id: string                 // 'm' + FNV-1a of file name, size and content fingerprint: stable for the same file
  project: 'vtc' | 'city'
  source: { fileName, format, fileSize, fingerprint, unitNote, northNote }
  frame: {
    units: 'm', fileUnit, unitSource: 'file' | 'confirmed' | 'chosen', scale, upAxis: 'z' | 'y',
    north:  { fileNorthDeg: number | null, rotation, label, flag },   // null = unresolved
    datum:  { shift, label, flag },                                    // metres subtracted so z = 0 is the entrance floor
    placement: { mode, fileCentre: [x, y], x, y },                     // file centre (scaled) → project frame
  }
  mapping: { by: 'layer' | 'name' | 'userString', key, rules: { [row]: { role, use? } }, confirmed?: string[] }
  elements: ModelElement[]
  towers: { id, name, elementIds, schedule: { f2f, podiumTop, podiumF2F, podiumSource }, coreShare | null, taggedStoreys }[]
  ignored: { name, layer, kind, reason, objectId? }[]
  checks: { id, severity: 'info' | 'warn' | 'block', text, flag? }[]   // the plain-language validation, kept with the model
}

interface ModelElement {
  id: string                 // `element_id` user string if present (round trip), else `${role}-${first 8 of the Rhino GUID}`
  role: Role
  name: string               // Rhino object name
  tags: { use?, level?, towerId? }
  geometry:
    | { kind: 'mesh', bbox, footprint, triangles, meshId? }   // tower, podium, program, core (project frame; mesh in the import store)
    | { kind: 'polygon', rings, z }                           // site
    | { kind: 'prism', rings, z0, z1 }                        // context
  provenance: { file, format, layer, objectId, objectName, objectType, userStrings?, geometrySource, block?, mappedBy, evidence }
}
```

Coordinates are metres in the project frame (competition model grid, or EPSG:26910 minus the Real Vancouver origin), z up, z = 0 at the entrance floor, rounded to the millimetre. Tower records keep their own frame (centre + rotation), as before; `Tower.imported.source = { modelId, towerKey, elementIds }` and `ImportedStorey.src` (the element that set a storey's use) link them back.

## 4. Building rules (team assumptions, all stated in the upload's plain-language checks)

1. **Units**: the file's unit (mm, cm, m, in, ft; dm and km scaled) or a confirmed guess; the upload cannot go on until an unknown unit is confirmed.
2. **North**: the file's Earth anchor, or base model, true, street grid (45.3°), magnetic (15.4° E, WMM2025, unverified), custom, or **unresolved** (then sun and wind results say so).
3. **Towers**: tower and program volumes that overlap in plan, or share a `tower` user string, are one tower.
4. **Podium**: a podium volume belongs to the tower it overlaps most (or the one with its `tower` user string); its top is the podium top. A tower standing inside another tower's podium keeps no floor below that podium's top: the area is counted once, in the podium.
5. **Program**: a program (or podium) volume with a use tags every storey whose mid-height it spans and whose plate it overlaps in plan; other storeys follow the program bands.
6. **Core**: median over the tower storeys of core area ÷ plate area, clamped to 5–60%; the lift check then reads it instead of sizing the core.
7. **Context**: an extruded footprint cut 1 m above its base (convex hull if it cannot be cut), from its lowest to its highest point (flat roofs).
8. **Site**: closed curves, or the boundary edges of a flat surface. Open curves are ignored with a reason ("close it in Rhino"). The competition rules keep the site given in the brief; an uploaded lot line is compared, not substituted.
9. **Mixed scale**: a mapping row whose extent is under 1/200 or over 200 times the massing's is flagged "was it pasted from a file in other units?" and used as it is.
10. **Stops** (the upload cannot be used): no closed volume at all (out of scope: "Nothing in X can be used…" with what the file holds), nothing mapped to tower/podium/program, a height over 2 km or under 1 m, a blocking geometry-health problem, or no storey of 25 m² or more.

## 5. Converters

| # | Converter | Tool | Reads | Gives | Wired | Test |
|---|---|---|---|---|---|---|
| 1 | `buildModel` → `towerFromMass`, `toNodeTowers` | Evaluation nodes | Model + mesh | Tower records (storeys, uses, core) + per-tower floors, area by use, core source | Upload applies the towers; every node reads them as before | `build.test.ts`, `converters.test.ts` §1 |
| 2 | `toViewConeInputs` | View cones, height surface | Model towers | Footprint (whole mass) and top (+ base, CGVD28, in Real Vancouver) | Same inputs `useResults` passes to `checkFootprint` | §2 |
| 3 | `toShadowCasters`, `contextOccluders` | Solar access, sun hours | Towers + context prisms | Proposal storey prisms; context prisms | `useSolarAccess` → `SolarJobInput.modelContext` joins the baseline | §3, `solarJob.test.ts` |
| 4 | `toPublicRealm` | Public realm | Site polygon + storey outlines | Edges, facing (from true north), podium and tower setbacks, coverage | Model panel (the competition checks keep the brief's site) | §4 |
| 5 | `toFloorAreas` | Lifts, egress, interior | Towers + storey sources | Floors by use, each with where its use came from | Model panel; the engines read the same floors | §5 |
| 6 | `toPresent` | Drawings, boards, captures | Model + towers | Caption, evidence lines, plan overlays | Model panel (caption to copy onto a board) | §6 |
| 7 | `toCustomize` | Customize canvas | Model + towers | A node output (one line per tower, site, context, north, datum, left out) | Node "Your model: upload & provenance" on the canvas and in the library; the Massing source card names the file | §7 |
| 8 | `toExportScene` | Export .3dm / OBJ / glTF | Towers + model | Role-tagged solids and the site curve | Export menu | §8 + round trips |
| 9 | `placedTriangles` | Exact cone check (Vista view-envelope, Integrate Vista session) | One tower + its mesh | World triangles: EPSG:26910 + CGVD28 in Real Vancouver; storey prisms when the mesh is not in this browser | Offered to that session | `placedTriangles` block |

## 6. Export: the round-trip contract

Every exported object carries user strings (`.3dm`), node extras (glTF) or its name (OBJ):

| Key | Value |
|---|---|
| `role` | `tower`, `podium`, `program`, `core`, `site`, `context`, `ignore` |
| `use`, `level`, `z0_m`, `z1_m`, `gross_area_m2` | Per storey |
| `tower`, `tower_id` | The tower's name and id |
| `f2f_m`, `podium_top_m`, `podium_f2f_m` | The storey schedule, so a re-upload slices at the same heights |
| `element_id` | Stable id: re-uploading keeps it |
| `source_file`, `source_layer`, `source_object_id`, `evidence` | Provenance of the element it came from |

Each storey is one closed solid (outer ring and holes, caps by ear clipping); the crown above the last storey is a `tower` solid; the uploaded mesh rides along on `Reference::Uploaded mesh (not read back)` with `role=ignore`. Re-uploading the export gives the same towers, storeys, podium storeys and uses, every storey area within 1% and levels within 1 cm, and the site and context with the same element ids (`converters.test.ts`, evaluation case RHINO-R). OBJ has no user strings, so its uses come back only from names; areas still match within 1%.

## 7. Privacy and large files

- The file is read **in this browser**: `.3dm` and OBJ in a Web Worker (`src/workers/readerWorker.ts`, the bytes are transferred, not copied), with progress per 25 objects; glTF and IFC on the page. Nothing is uploaded to a server; the dialog, the landing page and the drop overlay say so.
- A file over 50 MB gets a note that it may take a minute.
- The mapping is remembered per file in `localStorage` `ts.rhinoMapping.v1` (by content fingerprint, else by name; last 30 files; try/catch, private mode just forgets).

## 8. Reading Rhino the way Vista does (items 9-11, approved 3 Nov 2026)

Reference: Ruijie Liu's Vista v34 (github.com/RuijieLiu6/vancouver-tall-view-tool, `explorer/rhino-planar.js`, `browser-rhino.js`, `georeference.js`, `georeference-ui.js`), read 3 Nov 2026 and credited in the code.

**9. Files saved without render meshes** (`brepMesh`, `planarFace` in `src/lib/import/rhino.ts`). A face with a saved render mesh uses it. Otherwise a **planar** face is rebuilt exactly from its BRep topology:
- loops from the trims' edges in trim order (reversed trims turned round), every edge a straight line or a polyline (`tryGetPolyline`);
- exactly one outer loop; every point on the face's plane; no crossing or touching boundaries; holes inside the outer loop and not inside each other;
- ear clipping, then an **area check**: the triangles must cover the face to 1e-9 of its area, and every triangle's centroid must lie inside it;
- after the faces, a **closed-shell check**: vertices welded at the file's absolute tolerance, then open and non-manifold edges counted (a note when a solid does not close).

A curved face, or a planar face bounded by a curved edge, is **never sampled and never replaced by a box**: it is counted as "curved face not imported" (per object, in the reader's skipped list or notes, and in the plain-language checks as "Faces not imported: N curved … on M objects"). This replaces the earlier fallback that sampled curved edges, and settles the P14 correction in `src/data/evidence_index.json` (loops from the face edges, area check, manifold test) with our own topology check instead of manifold-3d.

**10. Blocks** (`visit` in `rhino.ts`): nested instance transforms compose outer × inner, so the innermost applies first; a mirrored block's triangles are turned back so normals face out; the geometry inside block definitions is never read on its own; a block that contains itself, a missing definition or a missing member is listed with its reason; objects and layers hidden in Rhino (a layer is off when it or a parent is off) are left out and listed. The read runs in a Web Worker with progress, and **Cancel** ends the worker at once (`readModelFile(file, onProgress, signal)`).

**11. Align to the map** (`AnchorOptions` in `src/lib/import/pipeline.ts`; `components/import/Align.tsx`). Two placements join the existing ones:
- **Anchor**: a point of the model (massing centre or a corner, a lot-line corner, or typed) lands on a point of the map (typed as UTM 10N or latitude and longitude, or picked on the preview), plus a turn on top of the north rotation;
- **Earth anchor**: the file's own latitude and longitude put its base point on the map (EPSG:26910 by the Krüger series; NAD83 and WGS84 taken as equal, about 1 m, so **unverified**). In Real Vancouver this is the default when the file has one.

The check screen shows a **preview on the City footprints** (north up, 50 m scale bar): your towers, lot line and context, and every City footprint under the towers hatched red as **demolished**, with a **"Keep the N existing buildings"** checkbox. On *Use this model* the City buildings under it are hidden from views, shadows and roofs unless kept (`lib/cityRemoval.ts` and the existing "Existing buildings under the design" switch; a hypothetical removal, team assumption). After that, the towers are ordinary towers, so the move and rotate gizmo works on them.

## 9. Limits

- Curved faces saved without render meshes cannot be meshed in the browser; they are counted, never faked. SubD is skipped with its fix.
- Setbacks and street lines are read as curves but no tool uses them yet.
- Context roofs are flat; overhangs are not modelled.
- The 3D view does not yet draw the uploaded site line and context (Viewport.tsx belongs to another work stream; the solar check already counts the context).

## 10. Fixtures, tests and evaluation

- `node tools/make_import_fixtures.mjs` writes `tools/import-fixtures/` (synthetic; `.3dm` files are git-ignored with every other `.3dm`, so run the script after cloning): `typical-two-towers-mm.3dm`, `mixed-units-no-north.3dm`, `no-usable-geometry.3dm`, `no-render-mesh-mm.3dm` (L-shaped and atrium polysurfaces, a cylinder), `nested-blocks-m.3dm` (nested, rotated and scaled, mirrored, hidden), from `src/lib/interchange/fixtures.ts`, which the tests and evaluation cases build in memory too.
- Tests: `src/lib/import/readers.test.ts` (blocks, planar Breps, curves, ids, user strings), `src/lib/interchange/build.test.ts`, `converters.test.ts` (one block per converter, both round trips, the schema), `src/engine/solarJob.test.ts`.
- Evaluation (`npm run eval`): RHINO-T typical, RHINO-B boundary (mixed units, no north), RHINO-O out of scope (stop and explain), RHINO-R repeated (round trip), RHINO-N boundary (no render meshes), RHINO-K typical (blocks), RHINO-A typical (align: anchor and Earth anchor, checked against Vista's sixth-order Krüger series to 1 mm); RHINO-T also runs through the dialog in the browser.

## 11. Interface (for DESIGN_HANDOFF.md once that file is free)

- **Role colours** (`ROLES` in `src/lib/interchange/model.ts`): tower `#1f5f8b` (accent), podium `#7f9fb8`, program `#b5651d` (the PROG category colour; program volumes in the preview take their use colour), core `#2b3f55` (the Schematic core), site `#2a9d8f` (dashed outline), context `#9a958b`, ignore `#c9ccd1` (dashed, faint).
- **Upload dialog** (`ImportDialog.tsx`, max width 72 rem): step chips "1 Map layers to roles · 2 Check and use"; step 1 is `components/import/RoleMapper.tsx` (table: layer with its Rhino colour swatch and `›` path separators, contents, role select with a 4 px role-colour edge, use select; live plan and elevation SVG; per-role counts); step 2 keeps the units, placement, north and storey blocks and adds "In plain words" (icon per severity + flag chip), tower tabs, storey preview and health. Footer: lock icon + "Read in this browser; nothing is uploaded to a server."
- **Landing page**: a dashed "Bring your Rhino model" strip under the two doors; dropping a model anywhere on the page opens the guided app with the dialog.
- **Project menu**: "Upload a Rhino model…" (`Box` icon).
- **Your model node** (`components/import/ModelPanel.tsx`): file line, role chips, units/north/zero level with flags, "What each tool reads from it", floor area by use, elements with provenance (collapsed).
- **Align to the map** (Real Vancouver): a block under *Placement* (model point select, map point as UTM or lat/lon, "Pick on the preview" crosshair toggle, turn slider) and, on the right, the preview: footprints `#d9d5cc` on `#f1efea`, demolished ones hatched red (`#c0392b` lines on `#fde2e0`, dashed outline), towers in the tower role colour, the lot line dashed teal, north arrow and 50 m bar, then the keep checkbox with the team-assumption chip and the removal caveat.
- **Reading a file**: a progress bar per 25 objects and a Cancel button under it.
