# Import fixtures

Synthetic files written by `node tools/make_import_fixtures.mjs`. Never derived from the competition base model.

- `podium-tower-mm-yup.obj`: podium, tower and tapered crown in millimetres, y-up (SketchUp-style OBJ)
- `broken-tower-utm.obj`: a missing roof face and one flipped wall, at UTM 10N coordinates
- `podium-extrusion-mm.3dm`: mesh podium, extrusion tower without a render mesh, context layer, Earth anchor
- `mass-ifc4-mm.ifc`: IFC4 mass in millimetres with TrueNorth
- `typical-two-towers-mm.3dm` (32 KB): Typical: millimetres, Earth anchor north, two towers on a podium, program volumes, core, lot line, context blocks
- `mixed-units-no-north.3dm` (9 KB): Boundary: millimetres, no Earth anchor, one context object 1000× too small
- `no-usable-geometry.3dm` (8 KB): Out of scope: a text dot, three points and an open curve; nothing to slice
- `no-render-mesh-mm.3dm` (61 KB): Polysurfaces saved without render meshes: an L-shaped tower and an atrium tower (rebuilt exactly from their planar faces) and a cylinder (curved faces, reported as not imported)
- `nested-blocks-m.3dm` (11 KB): Blocks: a nested Tower block placed plainly, rotated 30 degrees and scaled 1.5 in plan, mirrored, and once on a hidden layer
