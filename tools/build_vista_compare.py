"""Vista's eye elevation at each protected-view origin, for comparison with the City's Lv (Tower Design Toolkit).

Vista (Ruijie Liu's earlier view-cone tool, handoff 22 Oct 2026) stood its protected-view camera 1.6 m above its
modelled ground at the apex of the open-data cone polygon. That ground is a ~60 m SRTM grid (NASA SRTMGL1, public
domain, heights above the EGM96 geoid) in Vista's external_data/extension_terrain/srtm_grid.json. Tower Design Toolkit
instead puts the eye at the City's VIEWPOINT_ELEVATION_M (Lv, research C04 r3). This script reconstructs Vista's eye
(bilinear SRTM at the apex + 1.6 m; Vista's coastline/water mask is not reproduced) so the panel can show both numbers.

Run (paths as arguments; the Vista folder is untrusted data and nothing in it is executed):
  context-data/venv/Scripts/python.exe -I tower-studio/tools/build_vista_compare.py \
      <Vista>/external_data/extension_terrain/srtm_grid.json tower-studio/src/data/viewcones.json \
      tower-studio/src/data/vistaOrigins.json
"""
import hashlib
import json
import sys

from pyproj import Transformer


def bilinear(grid, lat, lon):
    fy = (lat - grid["lat0"]) / grid["dlat"]
    fx = (lon - grid["lon0"]) / grid["dlon"]
    iy, ix = int(fy), int(fx)
    if not (0 <= iy < grid["ny"] - 1 and 0 <= ix < grid["nx"] - 1):
        return None
    ty, tx = fy - iy, fx - ix
    z = grid["elevation_m"]
    return (z[iy][ix] * (1 - tx) * (1 - ty) + z[iy][ix + 1] * tx * (1 - ty)
            + z[iy + 1][ix] * (1 - tx) * ty + z[iy + 1][ix + 1] * tx * ty)


def main(srtm_path, cones_path, out_path):
    raw = open(srtm_path, "rb").read()
    grid = json.loads(raw)
    cones = json.load(open(cones_path, encoding="utf-8"))
    # City EPSG:26910 numbers are the pure projection of NAD83(CSRS) lon/lat (memory: use EPSG:3157, not 26910 via 4617).
    to_ll = Transformer.from_crs("EPSG:3157", "EPSG:4617", always_xy=True)
    out = {}
    for c in cones["cones"]:
        e, n = c["ring"][0]
        lon, lat = to_ll.transform(e, n)
        g = bilinear(grid, lat, lon)
        out[c["id"]] = {"lat": round(lat, 7), "lon": round(lon, 7),
                        "vistaGround": None if g is None else round(g, 1),
                        "vistaEye": None if g is None else round(g + 1.6, 1)}
    doc = {
        "about": "Vista's protected-view eye, reconstructed: bilinear SRTM ground at the open-data apex + 1.6 m. "
                 "Vista's coastline and inland-water masking is not reproduced, so seawall and pier origins may differ.",
        "source": "Vista external_data/extension_terrain/srtm_grid.json (NASA SRTMGL1 via Open Topo Data, accessed "
                  "2026-09-24 by Vista; public domain); heights above the EGM96 geoid",
        "srtm_sha256": hashlib.sha256(raw).hexdigest(),
        "flag": "unverified",
        "eyeHeight": 1.6,
        "cones": out,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1)
    print(f"wrote {out_path}: {len(out)} origins")


if __name__ == "__main__":
    main(*sys.argv[1:4])
