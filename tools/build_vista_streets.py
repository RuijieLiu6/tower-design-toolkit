"""Vista's street network (generated/street_network.json, OpenStreetMap via Overpass, ODbL) -> the Context style's roads.

    python -I tools/build_vista_streets.py <raw_dir> <out_dir> <commit> <retrieved> [--fill <osm streets dir>]

Writes <out_dir>/vista_streets.json and its layers.json entry. Keeps vehicular ways (Vista's traffic-network.js list),
drops tunnels, and records per segment: both ends in local metres (EPSG:26910 numbers from the local origin, through
latitude/longitude with Vista's own frame formula, a false assumption corrected as in build_vista_buildings.py), the
carriageway width (Vista's rule: OSM width, else lanes x 3.1 m + 1 m, else 2 lanes; 3-30 m; estimated, not surveyed),
sidewalk sides (OSM sidewalk tags, else Vista's defaults) and whether it is a deck (bridge or non-zero layer).

--fill (Ruijie, 5 Nov 2026: the zoomed-out map showed "this clear distinction" where Vista's streets end): adds the
vehicular ways tools/fetch_osm_streets.py fetched over the rest of the model base, with the same rules, leaving out any
way Vista's own query returned (by OSM id) and any segment whose middle is inside Vista's rectangle or off the base.
"""
import hashlib, json, math, os, sys
import numpy as np
from pyproj import Transformer

FILL = sys.argv[sys.argv.index("--fill") + 1] if "--fill" in sys.argv else None
RAW, OUT, COMMIT, RETRIEVED = [a for a in sys.argv[1:] if not a.startswith("--") and a != FILL][:4]
VISTA_RECT = (49.2367299, -123.1652987, 49.3183317, -123.0425611)  # Vista's street query (south, west, north, east)
PLINTH = (-8640 + 0.5, -9000 + 0.5, 7140 - 0.5, 6000 - 0.5)  # the model base in local metres (lib/plinth.ts), inset 0.5 m
ORIGIN = (491300, 5458600)
LAT0, LON0, M_LAT, M_LON = 49.2827, -123.1207, 110574.0, 111320.0 * math.cos(math.radians(49.2827))
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)
VEHICULAR = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary",
             "tertiary_link", "residential", "living_street", "unclassified", "service", "road"}
MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary"}
BRIDGE, TUNNEL, LAYER = 1, 2, 16


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def side(value, direction, highway):
    if value:
        return value not in ("no", "none", "separate") and value != ("right" if direction == "left" else "left")
    return highway not in ("service", "motorway", "motorway_link", "trunk", "trunk_link")


def attrs(hw, t):
    """Vista's carriageway width (3-30 m) and sidewalk sides for a way's tags."""
    try:
        lanes = float(t.get("lanes"))
    except (TypeError, ValueError):
        lanes = float("nan")
    try:
        explicit = float(str(t.get("width", "")).replace("m", "").strip())
    except ValueError:
        explicit = float("nan")
    fallback = 1 if hw == "service" else 3 if ("motorway" in hw or "trunk" in hw) else 2
    width = min(30, max(3, explicit if explicit > 0 else (lanes if lanes > 0 else fallback) * 3.1 + 1))
    general = t.get("sidewalk:both") or t.get("sidewalk")
    return width, side(t.get("sidewalk:left") or general, "left", hw), side(t.get("sidewalk:right") or general, "right", hw)


src = os.path.join(RAW, "street_network.json")
net = json.load(open(src, encoding="utf-8"))
pos = np.array(net["positions"], dtype=np.float64).reshape(-1, 3)
lat = LAT0 + pos[:, 1] / M_LAT
lon = LON0 + pos[:, 0] / M_LON
e, n = to_utm.transform(lon, lat)
xy = np.column_stack([np.asarray(e) - ORIGIN[0], np.asarray(n) - ORIGIN[1]])
flags = net["segment_flags"]
rows, total, ways = [], 0.0, []
for w in net["ways"]:
    hw = w.get("highway")
    if hw not in VEHICULAR:
        continue
    t = w.get("tags") or {}
    width, left, right = attrs(hw, t)
    for s in range(w["start"], w["start"] + w["count"]):
        if flags[s] & TUNNEL:
            continue
        a, b = xy[2 * s], xy[2 * s + 1]
        length = float(np.hypot(*(b - a)))
        if length < 0.1:
            continue
        deck = bool(flags[s] & (BRIDGE | LAYER))
        bits = (1 if deck else 0) | (2 if left else 0) | (4 if right else 0) | (8 if hw in MAJOR else 0)
        rows.append([round(a[0] * 10), round(a[1] * 10), round(b[0] * 10), round(b[1] * 10), round(width * 10), bits, len(ways)])
        total += length
    ways.append(w["id"])
print(f"{len(rows)} segments on {len(ways)} ways, {total / 1000:.0f} km; decks {sum(1 for r in rows if r[5] & 1)}")

fill = None
if FILL:
    import glob
    have = {int(w["id"]) for w in net["ways"]}  # every way Vista's query returned, of any kind
    s_, w_, n_, e_ = VISTA_RECT
    seen, fill_rows, fill_km, req = set(), 0, 0.0, os.path.join(FILL, "requests.json")
    for path in sorted(glob.glob(os.path.join(FILL, "streets_*.json"))):
        for el in json.load(open(path, encoding="utf-8"))["elements"]:
            if el.get("type") != "way" or el["id"] in seen or el["id"] in have:
                continue
            seen.add(el["id"])
            t = el.get("tags") or {}
            hw = t.get("highway")
            if hw not in VEHICULAR or t.get("tunnel", "no") != "no":  # tunnels left out, as Vista does
                continue
            g = el.get("geometry") or []
            if len(g) < 2:
                continue
            lon = np.array([p["lon"] for p in g]); lat = np.array([p["lat"] for p in g])
            ex, ny = to_utm.transform(lon, lat)
            pts = np.column_stack([np.asarray(ex) - ORIGIN[0], np.asarray(ny) - ORIGIN[1]])
            width, left, right = attrs(hw, t)
            deck = t.get("bridge", "no") != "no" or t.get("layer", "0") not in ("0", "")
            bits = (1 if deck else 0) | (2 if left else 0) | (4 if right else 0) | (8 if hw in MAJOR else 0)
            k0 = len(rows)
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                mx, my = (a + b) / 2
                mlat, mlon = (lat[i] + lat[i + 1]) / 2, (lon[i] + lon[i + 1]) / 2
                if s_ <= mlat <= n_ and w_ <= mlon <= e_:
                    continue  # Vista's rectangle keeps Vista's own streets
                if not (PLINTH[0] <= mx <= PLINTH[2] and PLINTH[1] <= my <= PLINTH[3]):
                    continue  # off the model base
                length = float(np.hypot(*(b - a)))
                if length < 0.1:
                    continue
                rows.append([round(a[0] * 10), round(a[1] * 10), round(b[0] * 10), round(b[1] * 10), round(width * 10), bits, len(ways)])
                fill_km += length / 1000
            if len(rows) > k0:
                ways.append(el["id"]); fill_rows += len(rows) - k0
    fill = {"dir": os.path.basename(os.path.normpath(FILL)), "requests_sha256": sha(req), "ways": len(seen), "segments": fill_rows, "km": round(fill_km, 1),
            "requests": [{k: r[k] for k in ("file", "retrieved", "sha256", "elements")} for r in json.load(open(req))]}
    total += fill_km * 1000
    print(f"fill: {fill_rows} segments, {fill_km:.0f} km from {len(seen)} ways not in Vista's network")

out = {
    "version": 1, "origin": list(ORIGIN), "count": len(rows),
    "columns": ["ax dm", "ay dm", "bx dm", "by dm", "width dm", "bits: 1 deck (bridge or non-zero layer), 2 left sidewalk, 4 right sidewalk, 8 major road", "way index"],
    "segments": rows, "ways": ways,
    "notes": {"width": "estimated from OSM width or lane count (Vista traffic-network.js), not surveyed",
              "sidewalks": "OSM sidewalk tags where given, else Vista's defaults; positions and widths illustrative",
              "decks": "bridge and non-zero-layer segments; the app lifts them between their approach ends (illustrative, never a surveyed deck)"},
}
path = os.path.join(OUT, "vista_streets.json")
with open(path, "w", encoding="utf-8") as fh:
    json.dump(out, fh, separators=(",", ":"))
print(f"wrote {path} ({os.path.getsize(path):,} B)")

lj_path = os.path.join(OUT, "layers.json")
lj = json.load(open(lj_path, encoding="utf-8"))
entry = {
    "id": "vista_streets", "title": "Streets: Vista's OpenStreetMap network" + (", filled to the model base" if fill else ""), "file": "vista_streets.json",
    "format": "JSON, local decimetres east/north from CITY_ORIGIN; columns listed in the file",
    "bytes": os.path.getsize(path), "sha256": sha(path), "count": len(rows),
    "source": {"name": "Vista street network: generated/street_network.json", "publisher": "Ruijie Liu, Vista (vancouver-tall-view-tool), from OpenStreetMap",
               "url": f"https://github.com/RuijieLiu6/vancouver-tall-view-tool/tree/{COMMIT}/generated", "retrieved": RETRIEVED, "commit": COMMIT,
               "request": f"gh api repos/RuijieLiu6/vancouver-tall-view-tool/contents/generated/street_network.json?ref={COMMIT} (read only)",
               "inputs_sha256": {"street_network.json": sha(src)},
               "note": f"Overpass query of {net.get('accessed', '')} (OSM data {net.get('osm_timestamp', '')}); vehicular ways, tunnels left out. Drawn as street lines in the Plain look and as roads in the Context style."
                       + (f" Beyond Vista's rectangle: {fill['ways']:,} more ways from OpenStreetMap (tools/fetch_osm_streets.py, Overpass, {fill['requests'][0]['retrieved'][:10]}), same rules." if fill else ""),
               **({"fill": fill} if fill else {})},
    "licence": {"name": "Open Database License (ODbL) 1.0", "url": "https://opendatacommons.org/licenses/odbl/1-0/"},
    "attribution": "Streets (c) OpenStreetMap contributors (ODbL), via Vista (Ruijie Liu). A derivative database of OpenStreetMap, offered under ODbL 1.0.",
    "crs": {"horizontal": "EPSG:26910", "note": "Vista's model X/Y -> latitude/longitude with Vista's own formula -> EPSG:4617 -> EPSG:3157 (pure projection)"},
    "datum": {"vertical": None, "note": "Draped on the City ground in the app; deck heights interpolated between approach ends (illustrative)."},
    "processing": {"build": "python -I tools/build_vista_streets.py <raw_dir> public/data <commit> <retrieved>", "length_km": round(total / 1000, 1)},
    "flag": "unverified",
    "lazy": True,
}
lj["layers"] = [l for l in lj["layers"] if l.get("id") != "vista_streets"] + [entry]
with open(lj_path, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(lj, ensure_ascii=False, indent=1) + "\n")
print("layers.json updated")
