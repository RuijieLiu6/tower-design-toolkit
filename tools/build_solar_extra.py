"""Build src/data/solarSpacesExtra.json: protected spaces the parks data does not cover, for the solar-access check
(Solar Access Guidelines for the Downtown Peninsula, July 2026, as transcribed in 04 Tool Plan/research/sources).

  * Table-1 school sites (3.1.1): the City parcel polygons under each school point (City "schools" + "property
    parcel polygons" open data, Open Government Licence - Vancouver). The parcel stands in for the property line.
  * Davie Village and Robson Village north sidewalks (3.3.1): bands on the north side of the City street centrelines
    ("public streets"), from the property line (half the right-of-way width, "right-of-way widths") 3.7 m toward the
    curb. The guideline's Maps 2 and 3 are drawn, not given as coordinates, so the extents are stand-ins: Davie
    1000-1200 blocks (Burrard to Jervis, team reading) and the Robson blocks inside the Robson St. BIA polygon.
  * Victory Square cenotaph circle (4.3.1): a 9 m circle at the centre of the Victory Square park polygon
    (position and size are team assumptions; the rule's clock is unresolved).

Run with the context-data venv:  python -I tools/build_solar_extra.py <raw folder> <solarSpaces.json> <out.json>
Projection: EPSG:4617 -> EPSG:3157 (pure UTM 10N), as in tools/build_solar_spaces.py.
"""
import glob
import hashlib
import json
import math
import os
import sys
from datetime import date

from pyproj import Transformer

CITY_ORIGIN = (491300.0, 5458600.0)
SIDEWALK_M = 3.7          # property line to curb (team assumption; "curb to existing building faces")
DEFAULT_ROW_M = 20.1      # 66 ft, used where no right-of-way width point is near a block
FT = 0.3048               # the right-of-way widths dataset is in feet (66 = a 20.1 m street)
DAVIE_BLOCKS = {"1000 DAVIE ST", "1100 DAVIE ST", "1200 DAVIE ST"}
SCHOOLS = {
    "Elsie Roy Elementary": "elsie-roy-elementary",
    "King George Secondary": "king-george-secondary",
    "Lord Roberts Annex": "lord-roberts-annex",
    "Lord Roberts Elementary": "lord-roberts-elementary",
}

tf = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)


def local(lon, lat):
    x, y = tf.transform(lon, lat)
    return [round(x - CITY_ORIGIN[0], 2), round(y - CITY_ORIGIN[1], 2)]


def inside(pt, ring):
    x, y, c = pt[0], pt[1], False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main(raw, parks_json, out):
    files = {}
    spaces = []
    # School sites: every parcel under the school's point.
    schools = json.load(open(os.path.join(raw, "schools.geojson"), encoding="utf-8"))
    files["schools.geojson"] = sha(os.path.join(raw, "schools.geojson"))
    pts = {f["properties"]["school_name"]: f for f in schools["features"]}
    for name, slug in SCHOOLS.items():
        p = os.path.join(raw, f"parcels_{slug}.geojson")
        files[os.path.basename(p)] = sha(p)
        parcels = json.load(open(p, encoding="utf-8"))["features"]
        rings = []
        for f in parcels:
            polys = f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]]
            for poly in polys:
                ring = [local(lon, lat) for lon, lat in poly[0]]
                if ring[0] == ring[-1]:
                    ring = ring[:-1]
                rings.append(ring)
        addr = pts[name]["properties"]["address"] if name in pts else ""
        spaces.append({"id": f"school-{slug}", "name": name, "cls": "School Site", "rings": rings,
                       "source": f"City parcel polygon(s) under the school point ({addr}); parcel stands in for the property line",
                       "flag": "verified"})

    # Right-of-way widths near each block (median of points within 15 m of the centreline).
    rowf = os.path.join(raw, "right-of-way-widths_downtown.geojson")
    files[os.path.basename(rowf)] = sha(rowf)
    row_pts = []
    for f in json.load(open(rowf, encoding="utf-8"))["features"]:
        try:
            w = float(f["properties"]["width"]) * FT
        except (TypeError, ValueError, KeyError):
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        row_pts.append((local(lon, lat), w))

    bia = json.load(open(os.path.join(raw, "business-improvement-areas-bia.geojson"), encoding="utf-8"))
    files["business-improvement-areas-bia.geojson"] = sha(os.path.join(raw, "business-improvement-areas-bia.geojson"))
    robson_bia = [local(lon, lat) for lon, lat in next(f for f in bia["features"] if f["properties"]["name"] == "Robson St. BIA")["geometry"]["coordinates"][0]]

    streets_f = os.path.join(raw, "public-streets_davie-robson.geojson")
    files[os.path.basename(streets_f)] = sha(streets_f)
    streets = json.load(open(streets_f, encoding="utf-8"))["features"]

    def band(line, w):
        """Polygon on the north side of a centreline segment: from w/2 - SIDEWALK_M to w/2."""
        rings = []
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            L = math.hypot(dx, dy)
            if L < 1:
                continue
            nx, ny = -dy / L, dx / L
            if ny < 0:  # the north side: the normal with a northward component
                nx, ny = -nx, -ny
            a0, a1 = w / 2 - SIDEWALK_M, w / 2
            rings.append([[round(ax + nx * a0, 2), round(ay + ny * a0, 2)], [round(bx + nx * a0, 2), round(by + ny * a0, 2)],
                          [round(bx + nx * a1, 2), round(by + ny * a1, 2)], [round(ax + nx * a1, 2), round(ay + ny * a1, 2)]])
        return rings

    for village, rule, pick in (
        ("Davie Village north sidewalk", "davie", lambda hb, mid: hb in DAVIE_BLOCKS),
        ("Robson Village north sidewalk", "robson", lambda hb, mid: hb.endswith("ROBSON ST") and inside(mid, robson_bia)),
    ):
        rings, blocks, widths = [], [], []
        for f in streets:
            hb = f["properties"]["hblock"]
            geom = f["geometry"]
            lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
            for ln in lines:
                line = [local(lon, lat) for lon, lat in ln]
                mid = [(line[0][0] + line[-1][0]) / 2, (line[0][1] + line[-1][1]) / 2]
                if not pick(hb, mid):
                    continue
                # Width points on the middle of this block only (not the cross streets at its ends).
                (ax, ay), (bx, by) = line[0], line[-1]
                L2 = (bx - ax) ** 2 + (by - ay) ** 2 or 1
                def mid_block(p):
                    t = ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / L2
                    d = abs((p[0] - ax) * (by - ay) - (p[1] - ay) * (bx - ax)) / math.sqrt(L2)
                    return 0.2 < t < 0.8 and d < 12
                near = sorted(w for (p, w) in row_pts if mid_block(p))
                w = near[len(near) // 2] if near else DEFAULT_ROW_M
                widths.append(w)
                blocks.append(hb)
                rings += band(line, w)
        spaces.append({"id": f"sidewalk-{rule}", "name": village, "cls": None, "rule": rule, "rings": rings,
                       "source": f"North side of City street centrelines {', '.join(sorted(set(blocks)))}; band {SIDEWALK_M} m from the property line (right-of-way {min(widths):.1f}-{max(widths):.1f} m)",
                       "flag": "unverified"})

    # Victory Square cenotaph circle: centre of the park polygon, 9 m radius (team assumption).
    parks = json.load(open(parks_json, encoding="utf-8"))
    vs = next(s for s in parks["spaces"] if s["name"] == "Victory Square")
    pts_vs = [p for r in vs["rings"] for p in r]
    cx, cy = sum(p[0] for p in pts_vs) / len(pts_vs), sum(p[1] for p in pts_vs) / len(pts_vs)
    circle = [[round(cx + 9 * math.cos(k * math.pi / 12), 2), round(cy + 9 * math.sin(k * math.pi / 12), 2)] for k in range(24)]
    spaces.append({"id": "cenotaph-victory-square", "name": "Victory Square Cenotaph circle", "cls": None, "rule": "cenotaph", "rings": [circle],
                   "source": "9 m circle at the centre of the Victory Square park polygon (position and size: team assumption)", "flag": "unverified"})

    doc = {
        "source": "City of Vancouver open data: schools, property parcel polygons, public streets, right-of-way widths, business improvement areas",
        "url": "https://opendata.vancouver.ca/",
        "licence": "Open Government Licence - Vancouver",
        "retrieved": date.today().isoformat(),
        "files": files,
        "crs": "EPSG:26910 metres minus CITY_ORIGIN (491300, 5458600); projected EPSG:4617 -> EPSG:3157",
        "note": "Extents of Davie and Robson Village (Maps 2, 3) and the cenotaph circle are stand-ins, flagged unverified.",
        "spaces": spaces,
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(spaces)} spaces; wrote {out}")
    for s in spaces:
        print(" ", s["id"], len(s["rings"]), "rings")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
