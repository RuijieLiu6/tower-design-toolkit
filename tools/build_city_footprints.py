"""Build the compact downtown footprint layer for the Real Vancouver project from City of Vancouver Building footprints 2015.

Usage (pipeline venv, isolated mode, on the downloaded file):
    python -I tools/build_city_footprints.py <footprints.geojson> <out_dir> <retrieved YYYY-MM-DD> <source_url>

Writes <out_dir>/footprints_downtown.bin and its entry in <out_dir>/layers.json.

Frame: the City serves lon/lat as NAD83(CSRS) values. They are projected to UTM zone 10N on GRS80 with no datum shift,
which reproduces the City's own EPSG:26910 numbers (checked on a LiDAR tile corner). Positions are stored in decimetres from the app's
CITY_ORIGIN (491300 E, 5458600 N). Footprints carry no height: heights come only from LiDAR (build_lidar_heights.py).

Binary layout (little endian), "TSF1":
    header  magic 'TSF1', u32 count, i32 originX m, i32 originY m, f32 quantum m, u32 reserved   (24 bytes)
    per part (Hilbert order of centroids):
        varint zigzag(object_id - previous object_id)
        varint (outer vertex count << 1) | has_holes
        [varint hole count, then varint vertex count per hole]                 if has_holes
        first vertex: varint zigzag dx, dy from the previous part's first vertex (dm)
        every other vertex, across outer ring then holes: zigzag dx, dy from the previous vertex (dm)
Rings are open (no repeated first vertex); outer rings counter-clockwise, holes clockwise.
"""
import hashlib
import json
import math
import os
import struct
import sys

from pyproj import Transformer
from shapely.geometry import Polygon, shape
from shapely.geometry.polygon import orient

SRC, OUT_DIR, RETRIEVED, SOURCE_URL = sys.argv[1:5]
ORIGIN = (491300, 5458600)        # CITY_ORIGIN in src/store.ts
Q = 0.1                           # quantum (m)
SIMPLIFY = 0.2                    # Douglas-Peucker tolerance (m); below the 2015 orthophoto outline accuracy
OUT_NAME = "footprints_downtown.bin"

# Pure projection (EPSG:4617 -> EPSG:3157 is UTM 10N on GRS80 with no datum step). pyproj's EPSG:4617 -> EPSG:26910
# route inserts a NAD83(CSRS) -> NAD83 shift of about 1.3 m here, which does NOT match the City's own EPSG:26910 numbers.
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)

# Frame check: the City LiDAR 2022 tile index puts tile 481000_5456000's SW corner at this lon/lat (open data record).
cx, cy = to_utm.transform(-123.26111023690703, 49.256472053669775)
assert abs(cx - 481000) < 0.01 and abs(cy - 5456000) < 0.01, f"frame check failed: {cx:.3f}, {cy:.3f}"
sx, sy = Transformer.from_crs("EPSG:4617", "EPSG:26910", always_xy=True).transform(-123.26111023690703, 49.256472053669775)
DEFAULT_SHIFT_M = round(math.hypot(sx - cx, sy - cy), 2)


def zigzag(v):
    return (v << 1) ^ (v >> 63)


def varint(v, buf):
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            buf.append(b | 0x80)
        else:
            buf.append(b)
            return


def hilbert(x, y, n=1 << 16):
    d, s = 0, n >> 1
    while s:
        rx = 1 if x & s else 0
        ry = 1 if y & s else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x, y = n - 1 - x, n - 1 - y
            x, y = y, x
        s >>= 1
    return d


def quantise(ring):
    """Open ring in decimetres from ORIGIN, without consecutive duplicates."""
    out = []
    for x, y in list(ring.coords)[:-1]:
        p = (round((x - ORIGIN[0]) / Q), round((y - ORIGIN[1]) / Q))
        if not out or p != out[-1]:
            out.append(p)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


fc = json.load(open(SRC, encoding="utf-8"))
parts, stats = [], {"features": len(fc["features"]), "parts_in": 0, "dropped": 0, "v_in": 0, "v_out": 0, "max_shift_m": 0.0}
for f in fc["features"]:
    oid = int(f["properties"]["object_id"])
    g = shape(f["geometry"])
    for poly in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
        stats["parts_in"] += 1
        stats["v_in"] += len(poly.exterior.coords) - 1
        utm = Polygon([to_utm.transform(*c[:2]) for c in poly.exterior.coords],
                      [[to_utm.transform(*c[:2]) for c in h.coords] for h in poly.interiors])
        simp = orient(utm.simplify(SIMPLIFY, preserve_topology=True), 1.0)
        outer = quantise(simp.exterior)
        holes = [h for h in (quantise(i) for i in simp.interiors) if len(h) >= 3]
        if len(outer) < 3 or simp.area < 1.0:
            stats["dropped"] += 1
            continue
        stats["max_shift_m"] = max(stats["max_shift_m"], utm.hausdorff_distance(simp))
        stats["v_out"] += len(outer) + sum(len(h) for h in holes)
        c = simp.centroid
        key = hilbert(int((c.x - ORIGIN[0] + 4000) / 0.25), int((c.y - ORIGIN[1] + 4000) / 0.25))
        parts.append((key, oid, outer, holes))

parts.sort()
buf = bytearray(struct.pack("<4sIiifI", b"TSF1", len(parts), ORIGIN[0], ORIGIN[1], Q, 0))
prev_oid, prev_first = 0, (0, 0)
for _, oid, outer, holes in parts:
    varint(zigzag(oid - prev_oid), buf)
    prev_oid = oid
    varint((len(outer) << 1) | (1 if holes else 0), buf)
    if holes:
        varint(len(holes), buf)
        for h in holes:
            varint(len(h), buf)
    last = prev_first
    for i, p in enumerate([q for ring in [outer, *holes] for q in ring]):
        varint(zigzag(p[0] - last[0]), buf)
        varint(zigzag(p[1] - last[1]), buf)
        if i == 0:
            prev_first = p
        last = p

os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, OUT_NAME), "wb") as fh:
    fh.write(buf)

sha = hashlib.sha256(buf).hexdigest()
src_sha = hashlib.sha256(open(SRC, "rb").read()).hexdigest()
entry = {
    "id": "footprints",
    "title": "Building footprints (downtown)",
    # Loaded only for the City comparison model since Vista's model became the default (3 Nov).
    "lazy": True,
    "file": OUT_NAME,
    "format": "TSF1 (varint deltas, decimetres; layout in tools/build_city_footprints.py)",
    "bytes": len(buf),
    "sha256": sha,
    "count": len(parts),
    "bytes_per_building": round(len(buf) / len(parts), 1),
    "source": {
        "name": "Building Footprints 2015",
        "publisher": "City of Vancouver",
        "url": "https://opendata.vancouver.ca/explore/dataset/building-footprints-2015/",
        "request": SOURCE_URL,
        "retrieved": RETRIEVED,
        "sha256": src_sha,
        "note": "2D outlines from the 2015 orthophotos; contiguous outlines split at parcel lines. The City says the data are approximate, reflect 2015 and are not updated.",
    },
    "licence": {"name": "Open Government Licence - Vancouver", "url": "https://opendata.vancouver.ca/pages/licence/"},
    "attribution": "Contains information licensed under the Open Government Licence - Vancouver (Building Footprints 2015).",
    "crs": {
        "horizontal": "EPSG:26910",
        "note": "City lon/lat (NAD83(CSRS) values) projected with GRS80 UTM 10N, no datum shift (pyproj EPSG:4617 -> EPSG:3157). Matches the City's own EPSG:26910 numbers: LiDAR tile corner 481000_5456000 reproduces within 1 cm.",
        "origin": list(ORIGIN),
        "quantum_m": Q,
    },
    "false_assumptions": [
        {
            "claim": "Reprojecting the City's lon/lat to EPSG:26910 with a default transformer gives the City's coordinates",
            "correction": f"pyproj's default EPSG:4617 -> EPSG:26910 route adds a NAD83(CSRS) -> NAD83 shift of {DEFAULT_SHIFT_M} m; the City's EPSG:26910 numbers are the pure projection (EPSG:3157 maths).",
        }
    ],
    "datum": {"vertical": None, "note": "2D only. Heights come from City LiDAR 2022 (layer footprint_heights) or stay 'height unknown'."},
    "processing": {
        "script": "tools/build_city_footprints.py",
        "subset": "Centroid inside 49.262-49.297 N, 123.085-123.150 W (downtown peninsula and the south False Creek shore)",
        "simplify_m": SIMPLIFY,
        "features_in": stats["features"],
        "parts_in": stats["parts_in"],
        "parts_dropped_under_1m2": stats["dropped"],
        "vertices_in": stats["v_in"],
        "vertices_out": stats["v_out"],
        "max_simplify_shift_m": round(stats["max_shift_m"], 3),
    },
    "flag": "unverified",
}

man_path = os.path.join(OUT_DIR, "layers.json")
man = json.load(open(man_path, encoding="utf-8")) if os.path.exists(man_path) else {"version": 1, "layers": []}
man["layers"] = [l for l in man["layers"] if l["id"] != entry["id"]] + [entry]
man["layers"].sort(key=lambda l: l["id"])
with open(man_path, "w", encoding="utf-8") as fh:
    json.dump(man, fh, indent=1, ensure_ascii=False)
    fh.write("\n")

print(json.dumps({k: entry[k] for k in ("count", "bytes", "bytes_per_building")} | entry["processing"], indent=1))
