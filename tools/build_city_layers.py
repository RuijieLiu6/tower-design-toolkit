"""Pack the Real Vancouver context layers v1 (street trees, parcels + land value, zoning, heritage, traffic count
locations) from City of Vancouver open data exports into compact files in <out_dir> and their layers.json entries.

Usage (pipeline venv, isolated mode, on downloaded files):
    python -I tools/build_city_layers.py trees    <out_dir> <retrieved> <request_url> <public-trees.geojson>
    python -I tools/build_city_layers.py parcels  <out_dir> <retrieved> <request_url> <parcels.geojson> <tax-report.csv>
    python -I tools/build_city_layers.py zoning   <out_dir> <retrieved> <request_url> <zoning.geojson>
    python -I tools/build_city_layers.py heritage <out_dir> <retrieved> <request_url> <heritage.geojson>
    python -I tools/build_city_layers.py traffic  <out_dir> <retrieved> <request_url> <movement-counts.geojson> <directional-locations.geojson>
    python -I tools/build_city_layers.py shoreline <out_dir> <retrieved> <request_url> <shoreline-2002.geojson>
    python -I tools/build_city_layers.py parks    <out_dir> <retrieved> <request_url> <parks-polygon-representation.geojson>

Frame: City lon/lat projected with GRS80 UTM 10N, no datum shift (the City's own EPSG:26910 numbers; see
build_city_footprints.py), stored in decimetres from CITY_ORIGIN. Nothing is invented: a tree without a height
keeps height code 0 ("height unknown"); a parcel without a tax row has no land value.

Formats (all little endian; decoders in src/lib/contextLayers.ts):
    trees.bin     "TST1", u32 count, then per tree (Hilbert order): varint zigzag dx, dy (dm, from the previous tree),
                  u8 height code (bit 7: the value is one of the City's height classes; bits 0-6: height in whole feet,
                  0 = unknown; the classes are 15, 25, ... 105 ft, so they stay exact), varint common-name index into trees.json "names"
    parcels.bin   "TSF1" polygons (same layout as footprints_downtown.bin; the id is the row index in parcels.json)
    parcels.json  {"streets", "zoning", "breaks", "rows": [[civic, street, land_k, improvement_k, zoning, folios, m2]]}
    zoning.json   {"districts", "polys": [[district, [x, y, ...] dm ring]]}
    heritage.json {"rows": [[x, y, name, address, category, evaluation group, designations]]}
    traffic.json  {"intersections": [[x, y, name, url]], "segments": [[name, [x, y, ...] dm]]}
    shoreline.json {"lines": [[x, y, ...] dm]}
    parks.json    {"names", "polys": [[name, [x, y, ...] dm ring]]}
"""
import csv
import hashlib
import json
import os
import struct
import sys

from pyproj import Transformer
from shapely.geometry import Polygon, shape
from shapely.geometry.polygon import orient

ORIGIN = (491300, 5458600)
Q = 0.1
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)  # pure projection (City's EPSG:26910 numbers)
LICENCE = {"name": "Open Government Licence - Vancouver", "url": "https://opendata.vancouver.ca/pages/licence/"}
# The City's tree height classes, as published in height_m: 15, 25, ..., 105 ft (class midpoints) in metres.
HEIGHT_CLASSES_M = [round(ft * 0.3048, 1) for ft in range(15, 106, 10)]


# ---------- helpers ----------
def local_dm(lon, lat):
    x, y = to_utm.transform(lon, lat)
    return round((x - ORIGIN[0]) / Q), round((y - ORIGIN[1]) / Q)


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


def hkey(xdm, ydm):
    return hilbert(int((xdm + 40000) / 2.5) & 0xFFFF, int((ydm + 40000) / 2.5) & 0xFFFF)


def features(path):
    with open(path, encoding="utf-8") as fh:
        fc = json.load(fh)
    return [f for f in fc["features"] if f.get("geometry")]


def write(out_dir, name, data):
    os.makedirs(out_dir, exist_ok=True)
    raw = data if isinstance(data, (bytes, bytearray)) else json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, name), "wb") as fh:
        fh.write(raw)
    return {"file": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def src_sha(*paths):
    h = hashlib.sha256()
    for p in paths:
        with open(p, "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()


def manifest_entry(out_dir, entry):
    path = os.path.join(out_dir, "layers.json")
    man = {"version": 1, "layers": []}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            man = json.load(fh)
    man["layers"] = sorted([l for l in man["layers"] if l["id"] != entry["id"]] + [entry], key=lambda l: l["id"])
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(man, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


def base_entry(layer_id, title, files, dataset, retrieved, request, inputs, count, note, extra=None):
    e = {
        "id": layer_id, "title": title, **files[0], "lazy": True, "count": count,
        "files": files,
        "format": f"see tools/build_city_layers.py ({layer_id})",
        "source": {"name": dataset[1], "publisher": "City of Vancouver", "url": f"https://opendata.vancouver.ca/explore/dataset/{dataset[0]}/",
                   "request": request, "retrieved": retrieved, "sha256": src_sha(*inputs), "note": note},
        "licence": LICENCE,
        "attribution": f"Contains information licensed under the Open Government Licence - Vancouver ({dataset[1]}).",
        "crs": {"horizontal": "EPSG:26910", "origin": list(ORIGIN), "quantum_m": Q,
                "note": "City lon/lat projected with GRS80 UTM 10N, no datum shift (the City's EPSG:26910 numbers)."},
        "datum": {"vertical": None, "note": "2D layer; drawn on the terrain in the app."},
        "processing": {"script": "tools/build_city_layers.py"},
        "flag": "unverified",
    }
    if extra:
        e.update(extra)
    return e


# ---------- trees ----------
def height_code(h):
    if h is None or not (h > 0):
        return 0  # unknown: never a default height
    code = min(127, max(1, round(h / 0.3048)))
    return code | (0x80 if round(h, 1) in HEIGHT_CLASSES_M else 0)


def pack_trees(out_dir, retrieved, request, path):
    rows, names = [], {}
    for f in features(path):
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"][:2]
        x, y = local_dm(lon, lat)
        name = (p.get("common_name") or p.get("genus_name") or "unknown").strip().title()
        rows.append((hkey(x, y), x, y, height_code(p.get("height_m")), names.setdefault(name, len(names))))
    rows.sort()
    buf = bytearray(struct.pack("<4sI", b"TST1", len(rows)))
    px = py = 0
    for _, x, y, hc, ni in rows:
        varint(zigzag(x - px), buf)
        varint(zigzag(y - py), buf)
        buf.append(hc)
        varint(ni, buf)
        px, py = x, y
    files = [write(out_dir, "trees.bin", buf), write(out_dir, "trees.json", {"names": list(names)})]
    known = sum(1 for r in rows if r[3] & 0x7F)
    classed = sum(1 for r in rows if r[3] & 0x80)
    entry = base_entry("trees", "Street trees", files, ("public-trees", "Public trees"), retrieved, request, [path], len(rows),
                       "City street trees with a height class (15-105 ft midpoints, in metres) or a recorded height; trees without one stay 'height unknown'.",
                       {"processing": {"script": "tools/build_city_layers.py", "with_height": known, "height_classes": classed,
                                       "height_unknown": len(rows) - known, "class_values_m": HEIGHT_CLASSES_M}})
    manifest_entry(out_dir, entry)
    return entry


# ---------- parcels + land value ----------
def quantise_ring(ring):
    out = []
    for x, y in list(ring.coords)[:-1]:
        p = (round((x - ORIGIN[0]) / Q), round((y - ORIGIN[1]) / Q))
        if not out or p != out[-1]:
            out.append(p)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def tsf1(parts):
    """parts: list of (id, outer, holes) in final order (same layout as build_city_footprints.py)."""
    buf = bytearray(struct.pack("<4sIiifI", b"TSF1", len(parts), ORIGIN[0], ORIGIN[1], Q, 0))
    prev_id, prev_first = 0, (0, 0)
    for pid, outer, holes in parts:
        varint(zigzag(pid - prev_id), buf)
        prev_id = pid
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
    return buf


def utm_polygon(geom):
    g = shape(geom)
    for poly in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
        yield Polygon([to_utm.transform(*c[:2]) for c in poly.exterior.coords], [[to_utm.transform(*c[:2]) for c in h.coords] for h in poly.interiors])


def read_tax(path):
    """Sum land and improvement values per land coordinate (strata lots share one parcel)."""
    sums = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        reader = csv.DictReader(fh, delimiter=";" if sample.count(";") > sample.count(",") else ",")
        for r in reader:
            key = (r.get("land_coordinate") or "").strip()
            if not key:
                continue
            s = sums.setdefault(key, {"land": 0, "impr": 0, "folios": 0, "zoning": {}, "year": r.get("tax_assessment_year") or r.get("report_year")})
            s["land"] += int(float(r.get("current_land_value") or 0))
            s["impr"] += int(float(r.get("current_improvement_value") or 0))
            s["folios"] += 1
            z = (r.get("zoning_district") or "").strip()
            if z:
                s["zoning"][z] = s["zoning"].get(z, 0) + 1
    return sums


def quintile_breaks(values):
    v = sorted(values)
    if not v:
        return []
    return [round(v[min(len(v) - 1, int(len(v) * q))]) for q in (0.2, 0.4, 0.6, 0.8)]


def pack_parcels(out_dir, retrieved, request, parcels_path, tax_path):
    tax = read_tax(tax_path)
    items = []
    for f in features(parcels_path):
        p = f["properties"]
        for poly in utm_polygon(f["geometry"]):
            poly = orient(poly.simplify(0.1, preserve_topology=True), 1.0)
            outer = quantise_ring(poly.exterior)
            if len(outer) < 3 or poly.area < 1:
                continue
            holes = [h for h in (quantise_ring(i) for i in poly.interiors) if len(h) >= 3]
            c = poly.centroid
            items.append((hkey((c.x - ORIGIN[0]) / Q, (c.y - ORIGIN[1]) / Q), outer, holes, p, poly.area))
    items.sort(key=lambda t: t[0])
    streets, zones, rows, per_m2 = {}, {}, [], []
    for _, outer, holes, p, area in items:
        t = tax.get((p.get("tax_coord") or "").strip())
        street = streets.setdefault((p.get("streetname") or "").strip().title(), len(streets))
        if t:
            z = max(t["zoning"], key=t["zoning"].get) if t["zoning"] else ""
            zi = zones.setdefault(z, len(zones)) if z else -1
            rows.append([(p.get("civic_number") or "").strip(), street, round(t["land"] / 1000), round(t["impr"] / 1000), zi, t["folios"], round(area)])
            per_m2.append(t["land"] / area)
        else:
            rows.append([(p.get("civic_number") or "").strip(), street, None, None, -1, 0, round(area)])
    buf = tsf1([(i, outer, holes) for i, (_, outer, holes, _, _) in enumerate(items)])
    breaks = quintile_breaks(per_m2)
    attrs = {"streets": list(streets), "zoning": list(zones), "breaks": breaks, "rows": rows,
             "fields": ["civic", "street", "land_k", "improvement_k", "zoning", "folios", "m2"], "year": next((t["year"] for t in tax.values()), None)}
    files = [write(out_dir, "parcels.bin", buf), write(out_dir, "parcels.json", attrs)]
    valued = sum(1 for r in rows if r[2] is not None)
    entry = base_entry("parcels", "Parcels and land value", files, ("property-parcel-polygons", "Property parcel polygons"), retrieved, request,
                       [parcels_path, tax_path], len(rows),
                       "Parcel polygons joined to the Property tax report (tax_coord = land_coordinate); land and improvement values summed over all folios of a parcel.",
                       {"processing": {"script": "tools/build_city_layers.py", "with_value": valued, "without_value": len(rows) - valued,
                                       "value_breaks_per_m2": breaks, "assessment_year": attrs["year"]},
                        "second_source": {"name": "Property tax report", "publisher": "City of Vancouver",
                                          "url": "https://opendata.vancouver.ca/explore/dataset/property-tax-report/",
                                          "note": "Assessed values from BC Assessment as published by the City (co-ownership with BC Assessment unverified)."}})
    manifest_entry(out_dir, entry)
    return entry


# ---------- zoning, heritage, traffic ----------
def ring_dm(ring):
    q = quantise_ring(ring)
    return [v for p in q for v in p]


def pack_zoning(out_dir, retrieved, request, path):
    districts, polys = {}, []
    for f in features(path):
        p = f["properties"]
        d = districts.setdefault((p.get("zoning_district") or "?").strip(), len(districts))
        for poly in utm_polygon(f["geometry"]):
            poly = orient(poly.simplify(0.5, preserve_topology=True), 1.0)
            r = ring_dm(poly.exterior)
            if len(r) >= 6:
                polys.append([d, r])
    files = [write(out_dir, "zoning.json", {"districts": list(districts), "polys": polys})]
    entry = base_entry("zoning", "Zoning districts", files, ("zoning-districts-and-labels", "Zoning districts and labels"), retrieved, request, [path],
                       len(polys), "District outlines and codes; the Zoning and Development By-law governs.")
    manifest_entry(out_dir, entry)
    return entry


def pack_heritage(out_dir, retrieved, request, path):
    rows = []
    for f in features(path):
        p = f["properties"]
        g = shape(f["geometry"]).representative_point()
        x, y = local_dm(g.x, g.y)
        desig = [k for k, label in (("municipaldesignationm", "M"), ("provincialdesignationp", "P"), ("federaldesignationf", "F"),
                                    ("heritagerevitalizationagreementh", "H"), ("interiordesignationi", "I"), ("landscapedesignationl", "L"),
                                    ("heritageconservationareaca", "CA"), ("heritageconservationcovenanthc", "HC")) if (p.get(k) or "").strip()]
        rows.append([x, y, (p.get("buildingnamespecifics") or "").strip(), f"{(p.get('streetnumber') or '').strip()} {(p.get('streetname') or '').strip().title()}".strip(),
                     (p.get("category") or "").strip(), (p.get("evaluationgroup") or "").strip(), desig])
    files = [write(out_dir, "heritage.json", {"rows": rows, "fields": ["x", "y", "name", "address", "category", "group", "designations"]})]
    entry = base_entry("heritage", "Heritage sites", files, ("heritage-sites", "Heritage sites"), retrieved, request, [path], len(rows),
                       "Vancouver Heritage Register sites (evaluation group A/B/C, designations). The City register governs.")
    manifest_entry(out_dir, entry)
    return entry


def pack_traffic(out_dir, retrieved, request, movement_path, directional_path):
    inter = []
    for f in features(movement_path):
        p = f["properties"]
        g = shape(f["geometry"]).representative_point()
        x, y = local_dm(g.x, g.y)
        inter.append([x, y, (p.get("intersection") or "").strip().title(), (p.get("url") or "").strip()])
    segs = []
    for f in features(directional_path):
        g = shape(f["geometry"])
        lines = g.geoms if g.geom_type == "MultiLineString" else [g]
        for ln in lines:
            pts = [v for c in ln.coords for v in local_dm(*c[:2])]
            if len(pts) >= 4:
                segs.append([(f["properties"].get("location") or "").strip().title(), pts])
    files = [write(out_dir, "traffic.json", {"intersections": inter, "segments": segs})]
    entry = base_entry("traffic", "Traffic count locations", files, ("intersection-traffic-movement-counts", "Intersection traffic movement counts"),
                       retrieved, request, [movement_path, directional_path], len(inter) + len(segs),
                       "Locations only: the open data gives where the City counted (intersection movements, directional counts) and a link to each count sheet, not the volumes.",
                       {"false_assumptions": [{"claim": "The City's open data holds traffic count volumes",
                                               "correction": "Both traffic datasets hold count locations only, with a link to the City's VanMap count sheet; volumes are not in the open data."}],
                        "second_source": {"name": "Directional traffic count locations", "publisher": "City of Vancouver",
                                          "url": "https://opendata.vancouver.ca/explore/dataset/directional-traffic-count-locations/"}})
    manifest_entry(out_dir, entry)
    return entry


# ---------- visual finish: shoreline and parks (loaded with the detailed context, drawn under everything else) ----------
def line_dm(coords, tol):
    from shapely.geometry import LineString
    ln = LineString([to_utm.transform(*c[:2]) for c in coords]).simplify(tol)
    out = []
    for x, y in ln.coords:
        p = (round((x - ORIGIN[0]) / Q), round((y - ORIGIN[1]) / Q))
        if not out or p != out[-1]:
            out.append(p)
    return [v for p in out for v in p]


def pack_shoreline(out_dir, retrieved, request, path):
    lines = []
    for f in features(path):
        g = f["geometry"]
        for coords in (g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]):
            flat = line_dm(coords, 0.5)
            if len(flat) >= 4:
                lines.append(flat)
    files = [write(out_dir, "shoreline.json", {"lines": lines})]
    entry = base_entry("shoreline", "Shoreline 2002 (approximate)", files, ("shoreline-2002", "Shoreline 2002"), retrieved, request, [path],
                       sum(len(l) // 2 for l in lines),
                       "The City's approximate shoreline, digitised from 2002 orthophotos and not updated (City metadata). Later waterfront changes are not in it. Drawn as a line over the 0 m sea plane; not a surveyed shoreline.",
                       {"processing": {"script": "tools/build_city_layers.py", "simplify_m": 0.5, "lines": len(lines)},
                        "datum": {"vertical": None, "note": "2D line; drawn on the terrain or the 0 m sea plane, whichever is higher."}})
    manifest_entry(out_dir, entry)
    return entry


def pack_parks(out_dir, retrieved, request, path):
    names, polys = {}, []
    for f in features(path):
        p = f["properties"]
        n = names.setdefault((p.get("park_name") or "Park").strip(), len(names))
        for poly in utm_polygon(f["geometry"]):
            poly = orient(poly.simplify(1.0, preserve_topology=True), 1.0)
            r = ring_dm(poly.exterior)
            if len(r) >= 6:
                polys.append([n, r])
    files = [write(out_dir, "parks.json", {"names": list(names), "polys": polys})]
    entry = base_entry("parks", "Parks (ground tint)", files, ("parks-polygon-representation", "Parks polygon representation"), retrieved, request, [path],
                       len(polys), "City park outlines (outer rings), used only to tint the ground; the Park Board's records govern.",
                       {"processing": {"script": "tools/build_city_layers.py", "simplify_m": 1.0, "parks": len(names)}})
    manifest_entry(out_dir, entry)
    return entry


PACKERS = {"trees": (pack_trees, 1), "parcels": (pack_parcels, 2), "zoning": (pack_zoning, 1), "heritage": (pack_heritage, 1), "traffic": (pack_traffic, 2),
           "shoreline": (pack_shoreline, 1), "parks": (pack_parks, 1)}

if __name__ == "__main__":
    layer, out_dir, retrieved, request, *inputs = sys.argv[1:]
    fn, n = PACKERS[layer]
    assert len(inputs) == n, f"{layer} needs {n} input file(s)"
    e = fn(out_dir, retrieved, request, *inputs)
    print(json.dumps({k: e[k] for k in ("id", "count", "bytes")} | {"files": [f["file"] for f in e["files"]]}, indent=1))
