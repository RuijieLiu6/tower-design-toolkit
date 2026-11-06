"""Vista's unified city model (RuijieLiu6/vancouver-tall-view-tool, generated/unified_*buildings*) -> Real Vancouver buildings.

    python -I tools/build_vista_buildings.py <raw_dir> <out_dir> <commit> <retrieved YYYY-MM-DD> [<osm use-tag dir>]

<raw_dir> holds Vista's unified_manifest.json, unified_buildings.bin/_index.json and unified_ext_buildings.bin/_index.json
(downloaded read-only from Ruijie's repo; logged in 04 Tool Plan/overnight/DOWNLOADS.md). Writes to <out_dir>:
  vista_buildings.bin   TSF1 footprints (same layout as footprints_downtown.bin, tools/build_city_footprints.py), one per
                        footprint part, id = the OSM way number.
  vista_buildings.json  per-part attributes in the same order (asset, Vista height and its source, OSM type, clearance)
                        plus the measured heights each part matches: LiDAR 2022 (footprint_heights.bin over
                        footprints_downtown.bin) and City 2009 (building_forms_2009.json). The OSM id is the footprint id
                        ("w" + id); Vista's own base Z (SRTM, EGM96) stays in the raw files, never used here.
and the layers.json entry 'vista_buildings'.

Frame: Vista's model X/Y are an equirectangular frame about 49.2827 N, -123.1207 with the equator's degree lengths (a
false assumption: research/vista-audit-2026-10-22.md, engine/vista.ts). Every vertex is taken back to latitude/longitude
with Vista's own formula and projected with EPSG:4617 -> EPSG:3157 (the City's EPSG:26910 numbers are this pure
projection; EPSG:26910 in pyproj adds a 1.3 m datum shift). The footprint of each object is the union of its triangles
in plan: the objects are extrusions (OSM footprints raised to a height), so nothing is lost except roof shape.

Heights: Vista's height_m is the building's height above its own base (OSM height tag, 3.2 m per level + 1 m, or an
estimate per building type). Vista's Z (SRTM, EGM96, unknown datum) is kept for reference only; the app seats every
building on its own ground (CGVD28). Elevated parts (bridges, overhangs) keep their clearance: height_m minus the mesh's
own height span.
"""
import hashlib, json, math, os, re, struct, sys
import numpy as np
import shapely
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient
from shapely.strtree import STRtree
from pyproj import Transformer

def _flag(name):
    """Takes `--name value` out of sys.argv, so the positional arguments keep their places."""
    if name not in sys.argv:
        return None
    i = sys.argv.index(name)
    value = sys.argv[i + 1]
    del sys.argv[i:i + 2]
    return value


# Optional fill (Ruijie, 4 Nov 2026: "for the part where the building footprints are missing make sure to find the data and
# fill in the box"): --fill <dir from tools/fetch_osm_buildings.py> adds current OSM buildings over the rest of the model
# base; --city2009 <the City's whole 2009 footprints export> gives every part without one a City 2009 measured height.
FILL = _flag("--fill")
CITY2009_ALL = _flag("--city2009")
RAW, OUT, COMMIT, RETRIEVED = sys.argv[1:5]  # optional 6th: the OSM use-tag dir from tools/fetch_osm_use_tags.py
ORIGIN = (491300, 5458600)
Q = 0.1
# Vista's frame (engine/vista.ts VISTA_FRAME): equator degree lengths, a false assumption corrected here.
LAT0, LON0, M_LAT, M_LON_EQ = 49.2827, -123.1207, 110574.0, 111320.0
M_LON = M_LON_EQ * math.cos(math.radians(LAT0))
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)
ASSETS = ["buildings", "ext_buildings"]
SOURCES = ["OSM height tag", "OSM floor count (3.2 m per level, +1 m from 2 levels)", "estimate per building type"]
MATCH_IOU = 0.6


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def to_local(xy):
    lat = LAT0 + xy[:, 1] / M_LAT
    lon = LON0 + xy[:, 0] / M_LON
    e, n = to_utm.transform(lon, lat)
    return np.column_stack([np.asarray(e) - ORIGIN[0], np.asarray(n) - ORIGIN[1]])


def plan_union(local, tri):
    t = local[tri]
    area = 0.5 * np.abs((t[:, 1, 0] - t[:, 0, 0]) * (t[:, 2, 1] - t[:, 0, 1]) - (t[:, 2, 0] - t[:, 0, 0]) * (t[:, 1, 1] - t[:, 0, 1]))
    t = t[area > 1e-4]  # walls are lines in plan
    if not len(t):
        return []
    g = shapely.union_all(shapely.make_valid(shapely.polygons(np.concatenate([t, t[:, :1]], axis=1))), grid_size=0.01)
    return [p for p in (g.geoms if hasattr(g, "geoms") else [g]) if p.geom_type == "Polygon" and p.area >= 1.0]


# ---------- TSF1 encoding (tools/build_city_footprints.py) ----------
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
    out = []
    for x, y in list(ring.coords)[:-1]:
        p = (round(x / Q), round(y / Q))
        if not out or p != out[-1]:
            out.append(p)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def decode_tsf1(buf):
    _, count, ox, oy, q, _ = struct.unpack_from("<4sIiifI", buf, 0)
    p = 24

    def vi():
        nonlocal p
        v, s = 0, 0
        while True:
            b = buf[p]
            p += 1
            v |= (b & 0x7F) << s
            s += 7
            if not b & 0x80:
                return v

    def zz():
        v = vi()
        return (v >> 1) ^ -(v & 1)
    out, oid, fx, fy = [], 0, 0, 0
    for _ in range(count):
        oid += zz()
        head = vi()
        sizes = [head >> 1] + ([vi() for _ in range(vi())] if head & 1 else [])
        rings, x, y = [], fx, fy
        for r, n in enumerate(sizes):
            ring = []
            for k in range(n):
                x += zz()
                y += zz()
                if r == 0 and k == 0:
                    fx, fy = x, y
                ring.append((x * q, y * q))
            rings.append(ring)
        out.append(rings)
    return out


# ---------- read Vista ----------
man = json.load(open(os.path.join(RAW, "unified_manifest.json"), encoding="utf-8"))
parts, objects = [], 0
src_counts = {a: [0, 0, 0] for a in ASSETS}
for a, asset in enumerate(ASSETS):
    fm = man["files"][asset]
    idx = json.load(open(os.path.join(RAW, f"unified_{asset}_index.json"), encoding="utf-8"))["columns"]
    buf = open(os.path.join(RAW, fm["file"]), "rb").read()
    assert len(buf) == fm["byte_length"], f"{fm['file']}: size differs from Vista's manifest"
    pos = np.frombuffer(buf, np.float32, fm["positions"]["count"] * 3, fm["positions"]["byte_offset"]).reshape(-1, 3).astype(np.float64)
    ind = np.frombuffer(buf, np.uint32, fm["indices"]["count"], fm["indices"]["byte_offset"])
    local = to_local(pos[:, :2])
    for i, oid in enumerate(idx["osm_id"]):
        o, c = idx["index_offset"][i], idx["index_count"][i]
        tri = ind[o:o + c].reshape(-1, 3)
        z = pos[tri.ravel(), 2]
        h, s = float(idx["height_m"][i]), int(idx["height_source"][i])
        assert oid.startswith("w") and h > 0 and s in (0, 1, 2), (asset, oid, h, s)
        polys = plan_union(local, tri)
        if not polys:
            continue
        objects += 1
        src_counts[asset][s] += 1
        clearance = max(0.0, round(h - float(z.max() - z.min()), 2))
        for p in polys:
            parts.append(dict(osm=oid, asset=a, h=h, src=s, typ=idx["osm_type"][i], clear=clearance, base=round(float(z.min()), 2),
                              poly=orient(p.simplify(0.05, preserve_topology=True), 1.0)))
print(f"{objects} Vista objects -> {len(parts)} footprint parts", src_counts)
vista_objects = objects

# ---------- fill: current OpenStreetMap buildings over the rest of the model base ----------
# Vista's model stops at its own rectangle; the model base (lib/plinth.ts CITY_PLINTH) runs to the Fraser, UBC, Boundary
# Road and the North Shore. Same rules as Vista's extension (extension_manifest.json height_rules: the OSM height tag,
# else 3.2 m per level + 1 m from 2 levels, else Vista's own table by building type), same licence (ODbL). One building,
# one representation: a fill outline that covers half of a Vista part, or half of itself is covered, is the same
# building and is left out; a smaller overlap is cut away.
PLINTH = (-8640.0, -9000.0, 7140.0, 6000.0)
BASE_BOX = shapely.box(PLINTH[0] + 0.5, PLINTH[1] + 0.5, PLINTH[2] - 0.5, PLINTH[3] - 0.5)
fill_stats = None
if FILL:
    ASSETS.append("osm_fill")
    FILL_INDEX = len(ASSETS) - 1
    src_counts["osm_fill"] = [0, 0, 0]
    rules = json.load(open(os.path.join(RAW, "extension_manifest.json"), encoding="utf-8"))["height_rules"]
    TYPE_H, TYPE_DEFAULT = rules["type_table"], float(rules["default_type_height_m"])
    elems, files = {}, []
    for f in sorted(os.listdir(FILL)):
        if f.startswith("buildings_") and f.endswith(".json"):
            files.append(f)
            for e in json.load(open(os.path.join(FILL, f), encoding="utf-8"))["elements"]:
                elems[(e["type"], e["id"])] = e  # a way in two tiles counts once
    have = {p["osm"] for p in parts}
    vgeoms = [p["poly"] for p in parts]
    vtree = STRtree(vgeoms)

    def metres(v):
        """A length tag in metres ('12', '12 m', '12.5m'; feet when it says so), or None."""
        m = re.match(r"\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?\s*$", str(v or ""))
        if not m:
            return None
        x = float(m.group(1))
        return x * 0.3048 if m.group(2) in ("ft", "feet", "'") else x

    def fill_height(t):
        """(height, source index in SOURCES) by Vista's extension rules."""
        h = metres(t.get("height"))
        if h and h > 0:
            return round(h, 2), 0
        try:
            levels = float(t.get("building:levels"))
        except (TypeError, ValueError):
            levels = 0.0
        if levels > 0:
            return round(3.2 * levels + (1.0 if levels >= 2 else 0.0), 2), 1
        return float(TYPE_H.get(t.get("building", "yes"), TYPE_DEFAULT)), 2

    def local_line(geom):
        ll = np.array([[g["lon"], g["lat"]] for g in geom if g])
        e, n = to_utm.transform(ll[:, 0], ll[:, 1])
        return np.column_stack([np.asarray(e) - ORIGIN[0], np.asarray(n) - ORIGIN[1]])

    def fill_shape(e):
        """The plan shape of a closed way or a multipolygon relation (outer rings less inner rings), or None."""
        if e["type"] == "way":
            g = e.get("geometry") or []
            if len(g) < 4 or e["nodes"][0] != e["nodes"][-1]:
                return None
            return shapely.make_valid(Polygon(local_line(g)))
        lines = {r: [shapely.LineString(local_line(m["geometry"])) for m in e.get("members", [])
                     if m["type"] == "way" and m.get("role") == r and len(m.get("geometry") or []) >= 2] for r in ("outer", "inner")}
        if not lines["outer"]:
            return None
        outer = shapely.union_all(shapely.get_parts(shapely.polygonize(lines["outer"])))
        inner = shapely.union_all(shapely.get_parts(shapely.polygonize(lines["inner"]))) if lines["inner"] else None
        return shapely.make_valid(outer.difference(inner) if inner is not None else outer)

    def polygons(g):
        return [p for p in shapely.get_parts(g) if p.geom_type == "Polygon" and p.area >= 1.0] if g is not None and not g.is_empty else []

    fill_stats = {"fetched": len(elems), "added": 0, "parts": 0, "relations": 0, "clipped": 0,
                  "skipped": {"already in Vista's model (same OSM id)": 0, "open way or no area": 0, "outside the model base": 0,
                              "same building as a Vista part (overlap >= 50%)": 0}}
    for (kind, eid), e in sorted(elems.items()):
        key = ("w" if kind == "way" else "r") + str(eid)
        if key in have:
            fill_stats["skipped"]["already in Vista's model (same OSM id)"] += 1
            continue
        polys = polygons(fill_shape(e))
        if not polys:
            fill_stats["skipped"]["open way or no area"] += 1
            continue
        c = shapely.union_all(polys).representative_point()
        if not (PLINTH[0] <= c.x <= PLINTH[2] and PLINTH[1] <= c.y <= PLINTH[3]):
            fill_stats["skipped"]["outside the model base"] += 1
            continue
        # Cut at the base's edge, as a physical model is (0.5 m inside, so no wall stands on the edge line).
        polys = [q for p in polys for q in polygons(shapely.make_valid(p.intersection(BASE_BOX)))]
        kept, same = [], False
        for p in polys:
            cut = []
            for b in vtree.query(p, predicate="intersects"):
                a = p.intersection(vgeoms[b]).area
                if a >= 0.5 * min(p.area, vgeoms[b].area):
                    same = True
                    break
                if a > 0:
                    cut.append(vgeoms[b])
            if same:
                break
            if cut:
                fill_stats["clipped"] += 1
                kept += polygons(shapely.make_valid(p.difference(shapely.union_all(cut))))
            else:
                kept.append(p)
        if same:
            fill_stats["skipped"]["same building as a Vista part (overlap >= 50%)"] += 1
            continue
        if not kept:
            fill_stats["skipped"]["open way or no area"] += 1
            continue
        t = e.get("tags", {})
        h, s = fill_height(t)
        try:
            clear = metres(t.get("min_height")) or 3.2 * float(t.get("building:min_level") or 0)
        except ValueError:
            clear = 0.0
        objects += 1
        src_counts["osm_fill"][s] += 1
        fill_stats["added"] += 1
        fill_stats["relations"] += kind == "relation"
        for p in kept:
            parts.append(dict(osm=key, asset=FILL_INDEX, h=max(h, clear + 1.0), src=s, typ=t.get("building", "yes"), clear=round(min(clear, h), 2),
                              base=0.0, poly=orient(p.simplify(0.05, preserve_topology=True), 1.0), tags=t))
            fill_stats["parts"] += 1
    fill_stats["files"] = {f: sha(os.path.join(FILL, f)) for f in files}
    print("fill", json.dumps(fill_stats["skipped"]), f"added {fill_stats['added']} buildings, {fill_stats['parts']} parts, clipped {fill_stats['clipped']}", src_counts["osm_fill"])

# ---------- alignment and measured heights (City 2015 + LiDAR 2022, City 2009) ----------
geoms = [p["poly"] for p in parts]
city = decode_tsf1(open(os.path.join(OUT, "footprints_downtown.bin"), "rb").read())
cpolys = [shapely.make_valid(Polygon(r[0], r[1:])) for r in city]
hb = open(os.path.join(OUT, "footprint_heights.bin"), "rb").read()
H = np.frombuffer(hb, np.dtype([("g", "<i2"), ("r", "<i2"), ("m", "<i2"), ("p", "<u2")]), struct.unpack_from("<I", hb, 4)[0], 8)
f09 = json.load(open(os.path.join(OUT, "building_forms_2009.json"), encoding="utf-8"))["forms"]
p09 = [shapely.make_valid(Polygon(f["outer"], f["holes"])) for f in f09]


def best_match(targets):
    tree, best = STRtree(targets), {}
    for a, b in zip(*tree.query(geoms, predicate="intersects")):
        inter = geoms[a].intersection(targets[b]).area
        iou = inter / (geoms[a].area + targets[b].area - inter)
        if iou > best.get(a, (0.0, -1))[0]:
            best[a] = (iou, b)
    return {a: b for a, (iou, b) in best.items() if iou >= MATCH_IOU}


m15, m09 = best_match(cpolys), best_match(p09)


def offsets(matches, targets):
    d = np.array([[targets[b].centroid.x - geoms[a].centroid.x, targets[b].centroid.y - geoms[a].centroid.y] for a, b in matches.items()])
    mag = np.hypot(d[:, 0], d[:, 1])
    return {"matches": len(d), "mean_shift_m": [round(float(d[:, 0].mean()), 2), round(float(d[:, 1].mean()), 2)],
            "median_offset_m": round(float(np.median(mag)), 2), "p95_offset_m": round(float(np.percentile(mag, 95)), 2), "max_offset_m": round(float(mag.max()), 2)}


alignment = {"city_2015_footprints": offsets(m15, cpolys), "city_2009_footprints": offsets(m09, p09),
             "match": f"same building = intersection over union >= {MATCH_IOU}; offset = distance between footprint centroids"}
print("alignment", json.dumps(alignment))

# Measured heights for each Vista part. First the City's measured parts that cover it (LiDAR 2022 stepped roof forms,
# City 2009 parts): where they cover at least half of the footprint, the height is the area-weighted P90 of theirs, the
# same "whole-footprint P90" as footprint_heights.bin. Else the matched whole City footprint (IoU >= MATCH_IOU).
MIN_COVER = 0.5


def covering(targets, height, top):
    by = {}
    tree = STRtree(targets)
    for a, b in zip(*tree.query(geoms, predicate="intersects")):
        area = geoms[a].intersection(targets[b]).area
        if area > 0:
            by.setdefault(a, []).append((height(b), top(b), area))
    out = [None] * len(parts)
    for a, items in by.items():
        covered = sum(i[2] for i in items)
        if covered < MIN_COVER * geoms[a].area:
            continue
        acc, p90 = 0.0, None
        for h, _, area in sorted(items, key=lambda i: -i[0]):
            acc += area
            if acc >= 0.1 * covered:
                p90 = h
                break
        out[a] = [round(p90, 1), round(max(i[1] for i in items), 1)]
    return out


lforms = json.load(open(os.path.join(OUT, "building_forms.json"), encoding="utf-8"))["forms"]
lpolys = [shapely.make_valid(Polygon(f["outer"], f["holes"])) for f in lforms]
lidar = covering(lpolys, lambda b: lforms[b]["roof"] - lforms[b]["ground"], lambda b: lforms[b]["max"] - lforms[b]["ground"])
lidar_by = {"roof forms": sum(1 for v in lidar if v), "whole footprint": 0}
for a, b in m15.items():
    if lidar[a] is None and H["g"][b] != -32768 and H["r"][b] != -32768:
        lidar[a] = [round((H["r"][b] - H["g"][b]) / 10, 1), round((H["m"][b] - H["g"][b]) / 10, 1)]
        lidar_by["whole footprint"] += 1
c09 = [v[0] if v else None for v in covering(p09, lambda b: f09[b]["roof"] - f09[b]["ground"], lambda b: f09[b]["roof"] - f09[b]["ground"])]
c09_by = {"covering parts": sum(1 for v in c09 if v is not None), "whole footprint": 0}
for a, b in m09.items():
    if c09[a] is None:
        c09[a] = round(f09[b]["roof"] - f09[b]["ground"], 1)
        c09_by["whole footprint"] += 1
# The rest of the city: every part still without a 2009 height reads the City's whole 2009 export the same way (base +
# average height, at least 2 m, as tools/build_city_forms_2009.py), covering parts first, then the matched footprint.
if CITY2009_ALL:
    a09, h09 = [], []
    for f in json.load(open(CITY2009_ALL, encoding="utf-8"))["features"]:
        p, g = f["properties"], f.get("geometry")
        base, top, avg = p.get("baseelev_m"), p.get("topelev_m"), p.get("avght_m")
        if not g or base is None or top is None or top <= base:
            continue
        roof = max(base + (avg if avg is not None and 0 < avg <= top - base else top - base), base + 2)
        rings = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for poly in rings:
            loc = []
            for r in poly:
                r = np.asarray(r, dtype=float)[:, :2]
                e, n = to_utm.transform(r[:, 0], r[:, 1])
                loc.append(np.column_stack([np.asarray(e) - ORIGIN[0], np.asarray(n) - ORIGIN[1]]))
            q = shapely.make_valid(Polygon(loc[0], loc[1:]))
            for part in shapely.get_parts(q):
                if part.geom_type == "Polygon" and part.area >= 4:
                    a09.append(part)
                    h09.append(round(roof - base, 1))
    all09 = covering(a09, lambda b: h09[b], lambda b: h09[b])
    c09_by["whole city (covering parts)"] = c09_by["whole city (matched footprint)"] = 0
    for k, v in enumerate(all09):
        if c09[k] is None and v is not None:
            c09[k] = v[0]
            c09_by["whole city (covering parts)"] += 1
    for a, b in best_match(a09).items():
        if c09[a] is None:
            c09[a] = h09[b]
            c09_by["whole city (matched footprint)"] += 1
    c09_by["whole city export sha256"] = sha(CITY2009_ALL)
print("measured matches", json.dumps({"lidar_2022": lidar_by, "city_2009": c09_by}))

# ---------- building use (Plain style types) ----------
# The building's own OpenStreetMap tags first (a specific building=* value, building:use, then shop / office / tourism /
# amenity / railway / public_transport on the building), else the points of interest inside its footprint (majority;
# a tie goes to the non-retail use, so ground-floor shops do not decide an office tower), else "other". Never a guess.
USES = ["residential", "retail", "office", "hotel", "cultural", "institutional", "transit", "other"]
USE_BASES = ["no use in OpenStreetMap", "OpenStreetMap tag on the building", "point of interest inside the building"]
BY_BUILDING = {}
for use, tags in {
    "residential": "apartments residential house detached terrace semidetached_house townhouse dormitory bungalow cabin houseboat static_caravan",
    "retail": "retail commercial kiosk supermarket shop restaurant bank",
    "office": "office",
    "hotel": "hotel",
    "cultural": "church chapel cathedral temple synagogue mosque shrine religious theatre museum community_centre community_hall library",
    "institutional": "school university college kindergarten hospital clinic nursing_home civic government public fire_station police courthouse military barracks",
    "transit": "train_station transportation station",
}.items():
    for t in tags.split():
        BY_BUILDING[t] = use
AMENITY = {}
for use, tags in {
    "retail": "restaurant cafe fast_food bar pub food_court ice_cream bank pharmacy marketplace nightclub bureau_de_change car_rental biergarten",
    "cultural": "theatre arts_centre cinema community_centre library place_of_worship music_venue events_venue exhibition_centre social_centre planetarium",
    "institutional": "school college university kindergarten childcare hospital clinic doctors dentist police fire_station townhall courthouse post_office social_facility prison research_institute",
    "transit": "bus_station ferry_terminal",
}.items():
    for t in tags.split():
        AMENITY[t] = use


def tag_use(t):
    """The use a set of OSM tags names, or None."""
    if t.get("railway") == "station" or t.get("public_transport") == "station":
        return "transit"
    if t.get("tourism") in ("hotel", "hostel", "motel", "guest_house", "apartment"):
        return "hotel"
    if t.get("tourism") in ("museum", "gallery"):
        return "cultural"
    if "office" in t:
        return "office"
    if "shop" in t:
        return "retail"
    return AMENITY.get(t.get("amenity", ""))


def building_use(t):
    b = BY_BUILDING.get(t.get("building", ""))
    if b:
        return b
    b = BY_BUILDING.get(t.get("building:use", ""))
    return b or tag_use(t)


use, basis = ["other"] * len(parts), [0] * len(parts)
if len(sys.argv) > 5:
    from shapely.geometry import Point
    OSM = sys.argv[5]
    way_tags = {f"w{e['id']}": e.get("tags", {}) for e in json.load(open(os.path.join(OSM, "building_way_tags.json"), encoding="utf-8"))["elements"]}
    for k, p in enumerate(parts):
        u = building_use(way_tags.get(p["osm"]) or p.get("tags") or {"building": p["typ"]})  # fill parts carry their own tags
        if u:
            use[k], basis[k] = u, 1
    pois = [e for e in json.load(open(os.path.join(OSM, "use_pois.json"), encoding="utf-8"))["elements"] if e.get("type") == "node" and tag_use(e.get("tags", {}))]
    pe, pn = to_utm.transform([e["lon"] for e in pois], [e["lat"] for e in pois])
    pts = [Point(x - ORIGIN[0], y - ORIGIN[1]) for x, y in zip(pe, pn)]
    tree = STRtree(geoms)
    inside = {}
    for i, k in zip(*tree.query(pts, predicate="within")):
        inside.setdefault(int(k), []).append(tag_use(pois[i]["tags"]))
    poi_used = 0
    for k, found in inside.items():
        if basis[k]:
            continue
        counts = {u: found.count(u) for u in set(found)}
        top = max(counts.values())
        best = [u for u in USES if counts.get(u) == top]
        pick = next((u for u in best if u != "retail"), best[0])
        use[k], basis[k] = pick, 2
        poi_used += 1
    print("use", {u: use.count(u) for u in USES}, "basis", {USE_BASES[b]: basis.count(b) for b in range(3)}, "pois", len(pois), "parts with a POI", len(inside))


def agreement(ref):
    out = {}
    for s, name in enumerate(SOURCES):
        e = np.array([parts[k]["h"] - (ref[k][0] if isinstance(ref[k], list) else ref[k]) for k in range(len(parts)) if ref[k] is not None and parts[k]["src"] == s])
        if len(e):
            out[name] = {"n": int(len(e)), "median_m": round(float(np.median(e)), 1), "median_abs_m": round(float(np.median(np.abs(e))), 1),
                         "p90_abs_m": round(float(np.percentile(np.abs(e), 90)), 1)}
    return out


towers = [(parts[k]["h"], lidar[k][0]) for k in range(len(parts)) if lidar[k] and lidar[k][0] > 60]
heights_check = {"vs_lidar_2022_p90_roof": agreement(lidar), "vs_city_2009": agreement(c09),
                 "towers_over_60m_by_lidar": len(towers), "towers_within_10pct": sum(1 for h, l in towers if abs(h - l) <= 0.1 * l)}
print("heights", json.dumps(heights_check))

# ---------- write ----------
order = sorted(range(len(parts)), key=lambda k: hilbert(int((parts[k]["poly"].centroid.x + 16000) / 0.5), int((parts[k]["poly"].centroid.y + 16000) / 0.5)))
buf = bytearray(struct.pack("<4sIiifI", b"TSF1", len(order), ORIGIN[0], ORIGIN[1], Q, 0))
prev_oid, prev_first = 0, (0, 0)
for k in order:
    p = parts[k]["poly"]
    outer = quantise(p.exterior)
    holes = [h for h in (quantise(i) for i in p.interiors) if len(h) >= 3]
    oid = int(parts[k]["osm"][1:]) * (-1 if parts[k]["osm"][0] == "r" else 1)  # a multipolygon relation (fill) as a negative id
    varint(zigzag(oid - prev_oid), buf)
    prev_oid = oid
    varint(len(outer) * 2 + (1 if holes else 0), buf)
    if holes:
        varint(len(holes), buf)
        for h in holes:
            varint(len(h), buf)
    x, y = prev_first
    for r, ring in enumerate([outer] + holes):
        for i, (px, py) in enumerate(ring):
            varint(zigzag(px - x), buf)
            varint(zigzag(py - y), buf)
            x, y = px, py
            if r == 0 and i == 0:
                prev_first = (px, py)
bin_path = os.path.join(OUT, "vista_buildings.bin")
open(bin_path, "wb").write(bytes(buf))

types = sorted({parts[k]["typ"] for k in order})
# Measured heights in decimetres, -1 where the part matches none (keeps the file small).
dm = lambda v: -1 if v is None else int(round(v * 10))
cols = {
    "asset": [parts[k]["asset"] for k in order],
    "heightM": [parts[k]["h"] for k in order],
    "heightSource": [parts[k]["src"] for k in order],
    "type": [types.index(parts[k]["typ"]) for k in order],
    "clearanceM": [parts[k]["clear"] for k in order],
    "lidar2022P90Dm": [dm(lidar[k][0] if lidar[k] else None) for k in order],
    "lidar2022MaxDm": [dm(lidar[k][1] if lidar[k] else None) for k in order],
    "city2009Dm": [dm(c09[k]) for k in order],
    "use": [USES.index(use[k]) for k in order],
    "useBasis": [basis[k] for k in order],
}
attrs = {
    "version": 1, "origin": list(ORIGIN), "count": len(order), "binSha256": sha(bin_path),
    "assets": ASSETS, "heightSources": SOURCES, "types": types, "uses": USES, "useBases": USE_BASES, "columns": cols,
    "notes": {
        "heightM": "Vista's building height above its own base (unverified); the app seats it on the Toolkit ground",
        "clearanceM": "elevated parts: height above the ground of the part's underside (Vista height minus mesh height span)",
        "osmId": "the footprint id in vista_buildings.bin is the OSM way number: osmId = 'w' + id (Vista's join key); a negative id is a multipolygon relation of the fill: osmId = 'r' + (-id)",
        "asset": "0 Vista's central model, 1 Vista's extension, 2 osm_fill: current OpenStreetMap buildings over the rest of the model base (tools/fetch_osm_buildings.py), added by the Toolkit with Vista's height rules",
        "lidar2022P90Dm": f"P90 roof height above ground (dm): area-weighted over the City LiDAR 2022 roof forms covering >= {MIN_COVER:.0%} of the footprint, else of the matched City 2015 footprint (IoU >= {MATCH_IOU}); -1 = none",
        "lidar2022MaxDm": "highest roof return above ground (dm) of the same LiDAR match; -1 = none",
        "city2009Dm": f"height (dm): area-weighted P90 over the City 2009 parts covering >= {MIN_COVER:.0%} of the footprint, else of the matched 2009 part (IoU >= {MATCH_IOU}); -1 = none",
    },
}
json_path = os.path.join(OUT, "vista_buildings.json")
json.dump(attrs, open(json_path, "w", encoding="utf-8"), separators=(",", ":"))
print(f"wrote {bin_path} ({os.path.getsize(bin_path):,} B), {json_path} ({os.path.getsize(json_path):,} B)")

# ---------- manifest ----------
lj_path = os.path.join(OUT, "layers.json")
lj = json.load(open(lj_path, encoding="utf-8"))
entry = {
    "id": "vista_buildings", "title": "Buildings: Vista unified model + OpenStreetMap fill" if FILL else "Buildings: Vista unified model (OpenStreetMap)", "file": "vista_buildings.bin",
    "format": "TSF1 footprints (layout in tools/build_city_footprints.py), id = OSM way number; per-part attributes in vista_buildings.json (same order)",
    "bytes": os.path.getsize(bin_path), "sha256": sha(bin_path), "count": len(order),
    "source": {
        "name": "Vista unified context model: generated/unified_buildings + unified_ext_buildings",
        "publisher": "Ruijie Liu, Vista (vancouver-tall-view-tool), from OpenStreetMap",
        "url": f"https://github.com/RuijieLiu6/vancouver-tall-view-tool/tree/{COMMIT}/generated",
        "retrieved": RETRIEVED, "commit": COMMIT,
        "request": f"gh api repos/RuijieLiu6/vancouver-tall-view-tool/contents/generated/<file>?ref={COMMIT} (read only)",
        "inputs_sha256": {f: sha(os.path.join(RAW, f)) for f in ["unified_buildings.bin", "unified_ext_buildings.bin", "unified_buildings_index.json", "unified_ext_buildings_index.json", "unified_manifest.json"]},
        "note": (f"{vista_objects:,} Vista buildings: the central model is a browser export of the studio Rhino "
                 "'Vancouver DT context.3dm', itself built from 2022 OpenStreetMap; the extension is current OpenStreetMap via Overpass "
                 "(accessed 2026-09-24). Published with Ruijie's permission (3 Nov 2026)."
                 + (f" Fill: {fill_stats['added']:,} more buildings from current OpenStreetMap over the rest of the model base (Overpass, 4 Nov 2026), "
                    f"{objects:,} buildings and {len(order):,} footprint parts in all." if fill_stats else f" {len(order):,} footprint parts.")),
        "fill": ({"source": "OpenStreetMap via the Overpass API (tools/fetch_osm_buildings.py): building ways and multipolygon relations in the model base minus Vista's rectangle",
                  "requests": [{k: r[k] for k in ("file", "endpoint", "query", "retrieved", "user_agent", "licence", "sha256")} for r in json.load(open(os.path.join(FILL, "requests.json"), encoding="utf-8"))],
                  "height_rules": "Vista's extension rules (extension_manifest.json height_rules): OSM height tag, else 3.2 m x levels + 1 m from 2 levels, else Vista's type table (default 9 m)",
                  "dedupe": "same OSM id as a Vista part, or overlapping a Vista part by >= 50% of the smaller: left out; a smaller overlap is cut away",
                  "base": "kept when a point inside the outline lies on the model base (lib/plinth.ts CITY_PLINTH)",
                  "stats": fill_stats} if fill_stats else None),
    },
    "licence": {"name": "Open Database License (ODbL) 1.0", "url": "https://opendatacommons.org/licenses/odbl/1-0/"},
    "attribution": "Building footprints and heights (c) OpenStreetMap contributors (ODbL), via Vista (Ruijie Liu). This layer is a derivative database of OpenStreetMap, offered under ODbL 1.0.",
    "crs": {"horizontal": "EPSG:26910",
            "note": "Vista's model X/Y taken back to latitude/longitude with Vista's own formula, then EPSG:4617 -> EPSG:3157 (pure projection, the City's EPSG:26910 numbers); metres from the local origin"},
    "datum": {"vertical": None,
              "note": "Heights are above each building's own base. The app seats each building on its ground at the footprint's bounding-box centre (City LiDAR 2022 1 m, else MRDEM; CGVD28). Vista's SRTM / EGM96 base Z is not used.",
              "unverified": ["building heights (OSM tags, floor counts and type estimates)", "Vista's terrain and its vertical datum"]},
    "processing": {
        "build": "python -I tools/build_vista_buildings.py <raw_dir> public/data <commit> <retrieved> <osm use-tag dir> [--fill <osm buildings dir>] [--city2009 <whole-city 2009 export>]",
        "footprint": "union of each object's triangles in plan (extrusions: only the roof shape is lost); parts under 1 m2 dropped; simplified within 5 cm",
        "height_sources": {a: dict(zip(SOURCES, src_counts[a])) for a in ASSETS},
        "height_check": heights_check,
        "measured_matches": {"lidar_2022": lidar_by, "city_2009": c09_by},
        "building_use": {"rule": "the building's own OSM tags, else the points of interest inside it (majority; a tie goes to the non-retail use), else other; never guessed",
                         "parts_by_use": {u: use.count(u) for u in USES}, "parts_by_basis": {USE_BASES[b]: basis.count(b) for b in range(3)},
                         "osm_files": ({f: sha(os.path.join(sys.argv[5], f)) for f in ("building_way_tags.json", "use_pois.json")} if len(sys.argv) > 5 else None),
                         # Overpass requests (tools/fetch_osm_use_tags.py): endpoint, query, retrieval time (UTC), client name, licence.
                         "osm_requests": ([{k: r[k] for k in ("file", "endpoint", "query", "retrieved", "user_agent", "licence")}
                                           for r in json.load(open(os.path.join(sys.argv[5], "requests.json"), encoding="utf-8"))] if len(sys.argv) > 5 else None)},
        "alignment": alignment,
    },
    "false_assumptions": [{
        "claim": "Vista's model X/Y are metres (equirectangular about 49.2827 N with the equator's degree lengths)",
        "correction": "Those degree lengths read north-south 0.58% short and east-west 0.19% short at 49.28 N; every vertex is taken back to latitude/longitude with Vista's formula and projected to UTM 10.",
    }],
    "flag": "unverified",
    "lazy": True,
    "files": [{"file": "vista_buildings.bin", "bytes": os.path.getsize(bin_path), "sha256": sha(bin_path)},
              {"file": "vista_buildings.json", "bytes": os.path.getsize(json_path), "sha256": sha(json_path)}],
}
# Vista's model is the default: the City 2015 footprints and their LiDAR heights only load for the comparison model.
for l in lj["layers"]:
    if l.get("id") in ("footprints", "footprint_heights"):
        l["lazy"] = True
lj["layers"] = [l for l in lj["layers"] if l.get("id") != "vista_buildings"] + [entry]
with open(lj_path, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(lj, ensure_ascii=False, indent=1) + "\n")
print("layers.json updated")
