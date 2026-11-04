"""Water polygons for Real Vancouver's view: the sea from the OpenStreetMap coastline, plus inland water bodies.

    python -I tools/build_water_mask.py <osm water raw dir> <out_dir> <retrieved YYYY-MM-DD>

Display only. The view draws the terrain inside these polygons in the water colour, which cleans up the specks where the
elevation model reads a little above 0 m over the water (MRDEM in Burrard Inlet and near the North Shore). Elevations,
eye levels and the CGVD28 chain used by the checks are not changed.

Sea: the coastline ways (latitude/longitude, taken as NAD83(CSRS) -> EPSG:3157 as the other Toolkit layers) are clipped
to the plinth, polygonized together with the plinth edge, and each face is classified by the OSM convention (land on
the left of a coastline way, sea on the right) at its nearest coastline segment. Inland water: closed natural=water and
landuse=reservoir ways, and natural=water relations (outer rings less inner rings). Everything is clipped to the plinth
and simplified within 1 m. Writes <out_dir>/water.json (local decimetres from CITY_ORIGIN) and its layers.json entry.
"""
import hashlib, json, math, os, sys

from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import linemerge, polygonize, unary_union

RAW, OUT, RETRIEVED = sys.argv[1:4]
ORIGIN = (491300.0, 5458600.0)
PLINTH = (-8640.0, -9000.0, 7140.0, 6000.0)  # lib/plinth.ts CITY_PLINTH
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)
frame = box(*PLINTH)


def local(geom):
    xs, ys = to_utm.transform([p["lon"] for p in geom], [p["lat"] for p in geom])
    return [(x - ORIGIN[0], y - ORIGIN[1]) for x, y in zip(xs, ys)]


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


# ---------- sea ----------
coast = json.load(open(os.path.join(RAW, "coastline.json"), encoding="utf-8"))["elements"]
ways = [LineString(local(e["geometry"])) for e in coast if e.get("type") == "way" and len(e.get("geometry", [])) >= 2]
segments = []  # directed coastline segments inside (or near) the plinth
for w in ways:
    c = list(w.coords)
    for a, b in zip(c, c[1:]):
        if a != b:
            segments.append((a, b))
seg_lines = [LineString(s) for s in segments]
tree = STRtree(seg_lines)
clipped = [w.intersection(frame) for w in ways]
lines = [g for g in clipped if not g.is_empty]
faces = list(polygonize(unary_union(lines + [frame.exterior])))


def is_sea(face):
    p = face.representative_point()
    k = int(tree.nearest(p))
    (ax, ay), (bx, by) = segments[k]
    # OSM coastline: land on the left, sea on the right of the way's direction.
    cross = (bx - ax) * (p.y - ay) - (by - ay) * (p.x - ax)
    return cross < 0


sea = [f for f in faces if f.area > 1 and is_sea(f)]
sea_area = sum(f.area for f in sea)

# ---------- inland water ----------
water = json.load(open(os.path.join(RAW, "water.json"), encoding="utf-8"))["elements"]
inland = []
for e in water:
    if e.get("type") == "way":
        g = e.get("geometry", [])
        if len(g) >= 4 and g[0] == g[-1]:
            poly = Polygon(local(g))
            if poly.is_valid and poly.area > 1:
                inland.append(poly)
    elif e.get("type") == "relation":
        outer = [LineString(local(m["geometry"])) for m in e.get("members", []) if m.get("role") == "outer" and len(m.get("geometry", [])) >= 2]
        inner = [LineString(local(m["geometry"])) for m in e.get("members", []) if m.get("role") == "inner" and len(m.get("geometry", [])) >= 2]
        o = list(polygonize(linemerge(outer))) if outer else []
        i = list(polygonize(linemerge(inner))) if inner else []
        if o:
            poly = unary_union(o)
            if i:
                poly = poly.difference(unary_union(i))
            if not poly.is_empty:
                inland.append(poly)
inland = [g.buffer(0) for g in inland]
union = unary_union(sea + inland).intersection(frame).simplify(1.0, preserve_topology=True)
polys = list(union.geoms) if isinstance(union, MultiPolygon) else [union] if isinstance(union, Polygon) and not union.is_empty else []
polys = [p for p in polys if p.area >= 25]


def flat(ring):
    out = []
    for x, y in ring.coords[:-1]:
        out += [round(x * 10), round(y * 10)]
    return out


data = {"version": 1, "origin": list(ORIGIN), "count": len(polys),
        "polygons": [[flat(p.exterior)] + [flat(r) for r in p.interiors] for p in polys]}
path = os.path.join(OUT, "water.json")
blob = json.dumps(data, separators=(",", ":")).encode("utf-8")
open(path, "wb").write(blob)
area = sum(p.area for p in polys)
print(f"coastline ways {len(ways)}, faces {len(faces)}, sea faces {len(sea)} ({sea_area / 1e6:.2f} km2), inland water {len(inland)}; "
      f"wrote {len(polys)} polygons, {area / 1e6:.2f} km2, {len(blob):,} B")

req = json.load(open(os.path.join(RAW, "requests.json"), encoding="utf-8"))
layer = {
    "id": "water",
    "title": "Water in the view: OpenStreetMap coastline sea and inland water (display only)",
    "file": "water.json",
    "format": "JSON, local decimetres east/north from CITY_ORIGIN; polygons as [outer, holes...] flat x,y rings",
    "bytes": len(blob),
    "sha256": hashlib.sha256(blob).hexdigest(),
    "count": len(polys),
    "source": {
        "name": "OpenStreetMap natural=coastline, natural=water and landuse=reservoir (Overpass API)",
        "publisher": "OpenStreetMap contributors",
        "url": "https://www.openstreetmap.org/",
        "retrieved": RETRIEVED,
        "request": " ; ".join(f"{r['endpoint']} {r['query']}" for r in req),
        "inputs_sha256": {f: sha(os.path.join(RAW, f)) for f in ("coastline.json", "water.json")},
        "note": "Same approach as Vista's water (OSM coastline polygonized, land on the left; plus closed water ways), over the whole Toolkit plinth.",
    },
    "licence": {"name": "Open Database License (ODbL) 1.0", "url": "https://opendatacommons.org/licenses/odbl/1-0/"},
    "attribution": "Water (c) OpenStreetMap contributors (ODbL).",
    "crs": {"horizontal": "EPSG:26910", "note": "OSM latitude/longitude taken as EPSG:4617 -> EPSG:3157 (pure projection), as the other OSM layers"},
    "datum": {"vertical": None, "note": "Display only: the terrain inside these polygons is drawn in the water colour. No elevation is changed; the checks keep the City ground and MRDEM (CGVD28)."},
    "processing": {"build": "python -I tools/build_water_mask.py <raw_dir> public/data <retrieved>", "sea_km2": round(sea_area / 1e6, 2),
                   "inland_bodies": len(inland), "area_km2": round(area / 1e6, 2), "simplify_m": 1.0},
    "flag": "unverified",
    "lazy": True,
}
mpath = os.path.join(OUT, "layers.json")
manifest = json.load(open(mpath, encoding="utf-8"))
manifest["layers"] = [l for l in manifest["layers"] if l["id"] != layer["id"]] + [layer]
open(mpath, "w", encoding="utf-8").write(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
print("layers.json updated")
