"""City of Vancouver local areas (22) for the Site step's "Start from a neighbourhood" list.

Input: the City open-data export local-area-boundary.geojson (OGL-Vancouver), downloaded once and logged in
04 Tool Plan/overnight/DOWNLOADS.md. Output: public/data/local_areas.json with each area's name, label point (the
City's geo_point_2d when given, else the ring's centroid), plan bounds and outline in the app's local frame (metres from
CITY_ORIGIN, EPSG:26910 numbers), outlines simplified to 2 m (display only).

Projection: EPSG:4617 -> EPSG:3157 (pure GRS80 UTM 10N, no datum step), the same as build_city_footprints.py, which
reproduces the City's own EPSG:26910 numbers.

Run (from anywhere, isolated): context-data/venv/Scripts/python.exe -I tools/build_local_areas.py <in.geojson> <out.json>
"""
import hashlib
import json
import sys

from pyproj import Transformer

ORIGIN = (491300, 5458600)  # CITY_ORIGIN in src/store.ts
TOL = 2.0                   # simplification tolerance (m), display only
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)


def local(lon, lat):
    x, y = to_utm.transform(lon, lat)
    return (round(x - ORIGIN[0], 1), round(y - ORIGIN[1], 1))


def perp(p, a, b):
    (x, y), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    n = (dx * dx + dy * dy) ** 0.5
    if n == 0:
        return ((x - ax) ** 2 + (y - ay) ** 2) ** 0.5
    return abs(dy * x - dx * y + bx * ay - by * ax) / n


def simplify(pts, tol):
    """Douglas-Peucker on an open polyline."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, k = 0.0, -1
        for m in range(i + 1, j):
            d = perp(pts[m], pts[i], pts[j])
            if d > best:
                best, k = d, m
        if best > tol and k > 0:
            keep[k] = True
            stack += [(i, k), (k, j)]
    return [p for p, f in zip(pts, keep) if f]


def ring_area_centroid(r):
    a = cx = cy = 0.0
    for i in range(len(r)):
        (x0, y0), (x1, y1) = r[i], r[(i + 1) % len(r)]
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    a /= 2
    return abs(a), (round(cx / (6 * a), 1), round(cy / (6 * a), 1))


def main(src, out):
    raw = open(src, "rb").read()
    fc = json.loads(raw)
    areas = []
    for f in fc["features"]:
        props = f.get("properties") or {}
        name = str(props.get("name") or "").strip()
        g = f.get("geometry") or {}
        polys = g["coordinates"] if g.get("type") == "MultiPolygon" else [g["coordinates"]] if g.get("type") == "Polygon" else []
        if not name or not polys:
            continue
        rings = []
        for poly in polys:
            outer = [local(lon, lat) for lon, lat in poly[0]]
            if outer[0] == outer[-1]:
                outer = outer[:-1]
            s = simplify(outer + [outer[0]], TOL)[:-1]
            rings.append(s)
        biggest = max(rings, key=lambda r: ring_area_centroid(r)[0])
        area_m2, centroid = ring_area_centroid(biggest)
        gp = props.get("geo_point_2d") or {}
        label = local(gp["lon"], gp["lat"]) if isinstance(gp, dict) and "lon" in gp and "lat" in gp else centroid
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        areas.append({
            "name": name,
            "at": list(label),
            "bounds": [min(xs), min(ys), max(xs), max(ys)],
            "areaM2": round(sum(ring_area_centroid(r)[0] for r in rings)),
            "rings": [[list(p) for p in r] for r in rings],
        })
    areas.sort(key=lambda a: a["name"])
    doc = {
        "version": 1,
        "origin": list(ORIGIN),
        "count": len(areas),
        "source": "City of Vancouver, Local area boundary (opendata.vancouver.ca dataset local-area-boundary), retrieved 2026-11-03",
        "licence": {"name": "Open Government Licence - Vancouver", "url": "https://opendata.vancouver.ca/pages/licence/"},
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "crs": "EPSG:4617 -> EPSG:3157 (the City's EPSG:26910 numbers), metres from the origin; outlines simplified to 2 m (display only)",
        "areas": areas,
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"{len(areas)} areas -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
