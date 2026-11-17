"""Convert the Vancouver Tall Challenge base model (.3dm) into a compact JSON context for Tower Design Toolkit.

The competition model belongs to Buildner, so the output goes to public/local/ (git-ignored) and is never published.

Usage:
    python tools/build_vtc_context.py "<path to Vancouver Tall Base Model.3dm>" public/local/vtc_context.json

Output frame: metres, origin at the centre of the competition site block, +Y = model +Y (drawn grid "up").
Ground-level uses: the hatches of "Ground Level Use Plan::Ground Level Use::<use>" (drawn over the same coordinates as the
3D model), each converted to a planar Brep to read its outline (rhino3dm has no hatch loops). The app gives each building
the use covering most of its footprint (src/lib/vtcUses.ts). src/lib/vtcContextBuild.ts is the same reader in the browser.
True north is read from the drawn north arrow (45 deg clockwise from +Y); the file's own north setting (+Y) is wrong.
"""
import json
import math
import sys

import rhino3dm as r

SRC, OUT = sys.argv[1], sys.argv[2]
SITE_CENTRE = (439.7, 143.3)      # centre of the 144.8 x 79.2 m site block (measured from the model)
USE_PREFIX = "Ground Level Use Plan::Ground Level Use::"
R = lambda v: round(v, 2)         # 1 cm precision keeps the file small


def local(x, y):
    return [R(x - SITE_CENTRE[0]), R(y - SITE_CENTRE[1])]


def polyline_points(curve):
    """Return the vertices of a polyline-like curve, or sample other curves."""
    if isinstance(curve, r.PolylineCurve):
        return [curve.Point(i) for i in range(curve.PointCount)]
    pl = curve.TryGetPolyline() if hasattr(curve, "TryGetPolyline") else None
    if isinstance(pl, tuple):  # some rhino3dm builds return (ok, polyline)
        pl = pl[1] if pl[0] else None
    if pl is not None and getattr(pl, "Count", 0) > 1:
        return [pl[i] for i in range(pl.Count)]
    dom = curve.Domain
    return [curve.PointAt(dom.T0 + (dom.T1 - dom.T0) * i / 32) for i in range(33)]


model = r.File3dm.Read(SRC)
layers = {i: L.FullPath for i, L in enumerate(model.Layers)}
out = {
    "meta": {
        "source": "Derived from the Vancouver Tall Challenge base model (Buildner): outlines, heights and simplified meshes, not the model file.",
        "units": "m",
        "origin_note": "Origin = centre of the competition site block; axes follow the model grid.",
        "true_north_deg_clockwise_from_plus_y": 45.0,
        "north_note": "Read from the drawn north arrow. FALSE ASSUMPTION in the file: its saved north is +Y and its saved location is 49.16 N, -123.07 W (Richmond).",
    },
    "site": None, "blocks": [], "curbs": [], "plazas": [], "midblock": [],
    "buildings": [], "heritage": [], "future_towers": [], "labels": [], "ground_uses": [],
}

future_outlines = []
future_rails = []

for obj in model.Objects:
    layer = layers[obj.Attributes.LayerIndex]
    if layer.startswith(USE_PREFIX):
        brep = r.Brep.TryConvertBrep(obj.Geometry) if isinstance(obj.Geometry, r.Hatch) else None
        if brep is not None:
            rings = [[local(p.X, p.Y) for p in polyline_points(brep.Edges[i])] for i in range(len(brep.Edges))]
            rings = [ring for ring in rings if len(ring) >= 4]
            if rings:
                out["ground_uses"].append({"use": layer[len(USE_PREFIX):], "rings": rings})
        continue
    if not layer.startswith("3D Model"):
        continue
    g = obj.Geometry
    name = layer.split("::")[-1]

    if isinstance(g, r.Extrusion):
        prof = g.Profile3d(0, 0)
        pts = polyline_points(prof)
        bb = g.GetBoundingBox()
        item = {"footprint": [local(p.X, p.Y) for p in pts[:-1]], "z0": R(bb.Min.Z), "z1": R(bb.Max.Z)}
        (out["heritage"] if name == "Heritage" else out["buildings"]).append(item)

    elif isinstance(g, r.Brep):
        pos, idx = [], []
        for fi in range(len(g.Faces)):
            mesh = g.Faces[fi].GetMesh(r.MeshType.Any)
            if mesh is None:
                continue
            base = len(pos) // 3
            for vi in range(len(mesh.Vertices)):
                v = mesh.Vertices[vi]
                lx, ly = local(v.X, v.Y)
                pos += [lx, ly, R(v.Z)]
            for f in range(len(mesh.Faces)):
                a, b, c, d = mesh.Faces[f]
                idx += [base + a, base + b, base + c]
                if c != d:
                    idx += [base + a, base + c, base + d]
        if not idx:
            continue
        item = {"positions": pos, "indices": idx}
        if name == "Heritage":
            out["heritage"].append(item)
        elif name == "Plaza":
            out["plazas"].append(item)
        elif name == "Mid-block Connection":
            out["midblock"].append(item)
        elif name == "Existing Buildings":
            out["buildings"].append(item)

    elif name in ("Block", "Curb") and isinstance(g, (r.PolylineCurve, r.PolyCurve)):
        pts = [local(p.X, p.Y) for p in polyline_points(g)]
        bb = g.GetBoundingBox()
        if name == "Block":
            w, d = bb.Max.X - bb.Min.X, bb.Max.Y - bb.Min.Y
            cx, cy = (bb.Min.X + bb.Max.X) / 2, (bb.Min.Y + bb.Max.Y) / 2
            if abs(w - 144.8) < 0.5 and abs(d - 79.2) < 0.5 and abs(cx - SITE_CENTRE[0]) < 1 and abs(cy - SITE_CENTRE[1]) < 1:
                out["site"] = {"outline": pts, "width_m": R(w), "depth_m": R(d), "area_m2": R(w * d)}
            else:
                out["blocks"].append(pts)
        else:
            out["curbs"].append(pts)

    elif name == "Future Towers" and isinstance(g, r.PolylineCurve):
        bb = g.GetBoundingBox()
        if bb.Max.X - bb.Min.X > 1 and bb.Max.Y - bb.Min.Y > 1:
            future_outlines.append((R(bb.Min.Z), [local(p.X, p.Y) for p in polyline_points(g)]))
        else:
            future_rails.append((local(bb.Min.X, bb.Min.Y), R(bb.Min.Z), R(bb.Max.Z)))

    elif name == "Text" and isinstance(g, r.Text):
        o = g.Plane.Origin
        out["labels"].append({"text": g.PlainText.replace("\r\n", " "), "at": local(o.X, o.Y)})

# Future towers: pair each footprint outline with the tallest rail standing on it.
for z0, ring in future_outlines:
    if z0 > 20:  # top outline of a pair, skip
        continue
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    tops = [z1 for (pt, rz0, z1) in future_rails if min(xs) - 1 <= pt[0] <= max(xs) + 1 and min(ys) - 1 <= pt[1] <= max(ys) + 1]
    out["future_towers"].append({"footprint": ring[:-1], "z0": z0, "z1": max(tops) if tops else None})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))

print(f"site: {out['site'] and out['site']['area_m2']} m2 | buildings {len(out['buildings'])} | heritage {len(out['heritage'])} | "
      f"future towers {[(t['z1']) for t in out['future_towers']]} | labels {len(out['labels'])} | ground uses {len(out['ground_uses'])}")
