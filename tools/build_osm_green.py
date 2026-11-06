"""OpenStreetMap green space and trails (tools/fetch_osm_green.py) -> the map's green tint and trail lines.

    python -I tools/build_osm_green.py <raw dir> <out_dir>

Writes <out_dir>/green.json and trails.json and their layers.json entries. Green: ways and multipolygon relations
(outer rings minus inner rings), clipped to the model base, 1.5 m simplified (display only), parts under 150 m² left out;
drawn with the City's parks into the same ground tint (components/CityContext.tsx parkTexture). Trails: path, track and
bridleway ways as segments, drawn as faint dashed lines. Local decimetres east/north of CITY_ORIGIN through EPSG:4617 ->
EPSG:3157 (the pure projection, as the other OpenStreetMap layers). Display only: nothing is computed from them.
"""
import glob, hashlib, json, os, sys

from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.ops import polygonize, unary_union

RAW, OUT = sys.argv[1:3]
ORIGIN = (491300, 5458600)
PLINTH = box(-8640, -9000, 7140, 6000)
MIN_AREA = 150.0
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def local(geom):
    lon = [p["lon"] for p in geom]; lat = [p["lat"] for p in geom]
    e, n = to_utm.transform(lon, lat)
    return [(x - ORIGIN[0], y - ORIGIN[1]) for x, y in zip(e, n)]


def kind_of(tags):
    for k in ("leisure", "landuse", "natural"):
        if k in tags:
            return f"{k}={tags[k]}"
    return "green"


def shape_of(el):
    if el["type"] == "way":
        pts = local(el.get("geometry") or [])
        if len(pts) < 4 or pts[0] != pts[-1]:
            return None
        p = Polygon(pts)
        return p if p.is_valid else p.buffer(0)
    outer = [LineString(local(m["geometry"])) for m in el.get("members", []) if m.get("type") == "way" and m.get("role") in ("outer", "") and m.get("geometry")]
    inner = [LineString(local(m["geometry"])) for m in el.get("members", []) if m.get("type") == "way" and m.get("role") == "inner" and m.get("geometry")]
    o = unary_union(list(polygonize(unary_union(outer)))) if outer else None
    if o is None or o.is_empty:
        return None
    if inner:
        i = unary_union(list(polygonize(unary_union(inner))))
        o = o.difference(i)
    return o


def flat(ring):
    out = []
    for x, y in list(ring.coords)[:-1]:
        out += [round(x * 10), round(y * 10)]
    return out


seen, names, kinds, polys, counts = set(), [], [], [], {}
for path in sorted(glob.glob(os.path.join(RAW, "green_*.json"))):
    for el in json.load(open(path, encoding="utf-8"))["elements"]:
        key = (el["type"], el["id"])
        if key in seen or el["type"] not in ("way", "relation"):
            continue
        seen.add(key)
        tags = el.get("tags") or {}
        g = shape_of(el)
        if g is None or g.is_empty:
            continue
        g = g.intersection(PLINTH).simplify(1.5, preserve_topology=True)
        parts = [g] if isinstance(g, Polygon) else [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]
        kind = kind_of(tags)
        name = tags.get("name", "")
        for p in parts:
            if p.is_empty or p.area < MIN_AREA:
                continue
            if name not in names:
                names.append(name)
            if kind not in kinds:
                kinds.append(kind)
            polys.append([names.index(name), kinds.index(kind), [flat(p.exterior)] + [flat(r) for r in p.interiors]])
            counts[kind] = counts.get(kind, 0) + 1

segs, ways, km = [], [], 0.0
seen_w = set()
for path in sorted(glob.glob(os.path.join(RAW, "trails_*.json"))):
    for el in json.load(open(path, encoding="utf-8"))["elements"]:
        if el["type"] != "way" or el["id"] in seen_w:
            continue
        seen_w.add(el["id"])
        if (el.get("tags") or {}).get("tunnel", "no") != "no":
            continue
        pts = local(el.get("geometry") or [])
        k0 = len(segs)
        for a, b in zip(pts, pts[1:]):
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            if not (-8640 <= mx <= 7140 and -9000 <= my <= 6000):
                continue
            segs.append([round(a[0] * 10), round(a[1] * 10), round(b[0] * 10), round(b[1] * 10), len(ways)])
            km += ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 / 1000
        if len(segs) > k0:
            ways.append(el["id"])

req = os.path.join(RAW, "requests.json")
reqs = json.load(open(req))
note = {"requests_sha256": sha(req), "retrieved": min(r["retrieved"] for r in reqs)[:10], "files": len(reqs)}
green = {"version": 1, "origin": list(ORIGIN), "count": len(polys), "names": names, "kinds": kinds,
         "columns": ["name index", "kind index", "rings: outer then holes, flat local decimetres"], "polys": polys}
trails = {"version": 1, "origin": list(ORIGIN), "count": len(segs), "columns": ["ax dm", "ay dm", "bx dm", "by dm", "way index"], "segments": segs, "ways": ways}
for fname, obj in (("green.json", green), ("trails.json", trails)):
    with open(os.path.join(OUT, fname), "w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"))
print(f"green: {len(polys)} polygons ({', '.join(f'{k} {v}' for k, v in sorted(counts.items(), key=lambda kv: -kv[1])[:8])}); trails: {len(segs)} segments, {km:.0f} km on {len(ways)} ways")

lj_path = os.path.join(OUT, "layers.json")
lj = json.load(open(lj_path, encoding="utf-8"))
common = {"licence": {"name": "Open Database License (ODbL) 1.0", "url": "https://opendatacommons.org/licenses/odbl/1-0/"},
          "attribution": "(c) OpenStreetMap contributors (ODbL)",
          "crs": {"horizontal": "EPSG:26910", "note": "EPSG:4617 -> EPSG:3157 (pure projection), local decimetres from CITY_ORIGIN"},
          "datum": {"vertical": None, "note": "Draped on the City ground in the app (display only)."}, "flag": "unverified", "lazy": True}
entries = [
    {"id": "osm_green", "title": "Green space: OpenStreetMap parks, nature reserves, golf courses, forest and grass", "file": "green.json",
     "format": "JSON, rings in local decimetres east/north from CITY_ORIGIN; columns listed in the file",
     "bytes": os.path.getsize(os.path.join(OUT, "green.json")), "sha256": sha(os.path.join(OUT, "green.json")), "count": len(polys),
     "source": {"name": "OpenStreetMap leisure / landuse / natural green areas (Overpass API)", "publisher": "OpenStreetMap contributors",
                "url": "https://overpass-api.de/api/interpreter", "retrieved": note["retrieved"], "request": "tools/fetch_osm_green.py (3 x 3 tiles over the model base)",
                "inputs_sha256": {"requests.json": note["requests_sha256"]},
                "note": "Adds the green space the City's parks layer leaves out (regional parks such as Pacific Spirit, golf courses, forest, the University lands) to the ground tint. Display only."},
     "processing": {"build": "python -I tools/build_osm_green.py <raw dir> public/data", "min_area_m2": MIN_AREA, "simplify_m": 1.5, "kinds": counts}},
    {"id": "trails", "title": "Trails: OpenStreetMap paths, tracks and bridleways", "file": "trails.json",
     "format": "JSON, local decimetres east/north from CITY_ORIGIN; columns listed in the file",
     "bytes": os.path.getsize(os.path.join(OUT, "trails.json")), "sha256": sha(os.path.join(OUT, "trails.json")), "count": len(segs),
     "source": {"name": "OpenStreetMap highway=path / track / bridleway (Overpass API)", "publisher": "OpenStreetMap contributors",
                "url": "https://overpass-api.de/api/interpreter", "retrieved": note["retrieved"], "request": "tools/fetch_osm_green.py (3 x 3 tiles over the model base)",
                "inputs_sha256": {"requests.json": note["requests_sha256"]},
                "note": "Drawn as faint dashed lines, so park and forest land shows its trail network. Tunnels left out. Display only."},
     "processing": {"build": "python -I tools/build_osm_green.py <raw dir> public/data", "length_km": round(km, 1)}},
]
for e in entries:
    e.update(common)
lj["layers"] = [l for l in lj["layers"] if l.get("id") not in ("osm_green", "trails")] + entries
with open(lj_path, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(lj, ensure_ascii=False, indent=1) + "\n")
print("layers.json updated")
