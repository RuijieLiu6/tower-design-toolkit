"""Build the North Shore terrain backdrop (rings R1 and R2) from an MRDEM-30 DTM window.

Usage (pipeline venv, isolated mode):
    python -I tools/build_city_terrain.py <mrdem_window.tif> <proj_grid_dir> <out_dir> <retrieved YYYY-MM-DD> [viewcones.json]

With viewcones.json (src/data/viewcones.json), R1 is checked against the City's viewpoint elevations (VIEWPOINT_ELEVATION_M
is eye level, so it should sit 1-3 m above the ground at ground-level origins).

Input: the window written by fetch_mrdem_window.py (EPSG:3979, CGVD2013 = EPSG:6647 per the MRDEM spec ed. 1.2 s6.2).
Output: <out_dir>/terrain_r1.bin, terrain_r2.bin (+ entries in layers.json).
Add --mountain-detail to build only terrain_r2_detail.bin at native 30 m, loaded after the base scene.
This preserves source detail; it does not improve the source survey accuracy.

Rings (node grids in EPSG:26910 numbers, centred on CITY_ORIGIN; rows south -> north, columns west -> east):
    R1  +/- 6 km,  30 m nodes (MRDEM native), centimetre steps
    R2  +/- 25 km, 60 m nodes (source pre-smoothed 1-2-1), decimetre steps
Each node is uint16: height = offset + q * scale, 65535 = no data.

Vertical datum: CGVD2013(CGG2013) -> CGVD28 with the NRCan geoid models (GPS-H chain): h = H2013 + N(CGG2013),
H28 = h - N(HT2_2010v70), both at NAD83(CSRS) epoch 2010. PROJ runs EPSG:9246 (inverse) + EPSG:9123 from the local grid
files, with the network off; a ballpark (no-op) operation is refused. Never a typed offset.
"""
import hashlib
import json
import os
import sys

import numpy as np
import pyproj
import rasterio
from pyproj import Transformer, network
from pyproj.transformer import TransformerGroup

SRC, GRIDS, OUT_DIR, RETRIEVED = sys.argv[1:5]
CONES = next((a for a in sys.argv[5:] if not a.startswith('--')), None)
DETAIL = '--mountain-detail' in sys.argv[5:]
ORIGIN = (491300, 5458600)
RINGS = [
    {"id": "terrain_r1", "half": 6000, "step": 30, "scale": 0.01, "smooth": False, "title": "Terrain R1 (to 6 km)"},
    {"id": "terrain_r2", "half": 25020, "step": 60, "scale": 0.1, "smooth": True, "title": "Terrain R2 (to 25 km)"},
]
if DETAIL:
    RINGS = [{"id": "terrain_r2_detail", "half": 25020, "step": 30, "scale": 0.1,
              "smooth": False, "title": "Mountains at native 30 m resolution (to 25 km)"}]
NODATA = 65535

network.set_network_enabled(False)
pyproj.datadir.append_data_dir(GRIDS)

# --- vertical datum operation: must be the NRCan grid chain, never a ballpark ---
group = TransformerGroup("EPSG:4617+6647", "EPSG:4617+5713", always_xy=True)
vt = group.transformers[0]
desc = vt.description
assert "CGVD2013(CGG2013) height" in desc and "CGVD28 height" in desc and "ballpark vertical" not in desc.lower(), desc


def geoid_nodes(name, lon, lat):
    """Exact node values (no interpolation) and node positions nearest to lon/lat."""
    with rasterio.open(os.path.join(GRIDS, name)) as g:
        rc = [g.index(x, y) for x, y in zip(lon, lat)]
        pos = np.array([g.xy(r, c) for r, c in rc])
        band = g.read(1)
        return np.array([band[r, c] for r, c in rc], dtype=float) * g.scales[0], pos


# Cross-check PROJ against the raw grids at the grid nodes nearest downtown and Grouse (exact nodes, no interpolation).
n_cgg, pos = geoid_nodes("ca_nrc_CGG2013n83.tif", [-123.1207, -123.0814], [49.2827, 49.3806])
n_ht2, pos2 = geoid_nodes("ca_nrc_HT2_2010v70.tif", pos[:, 0], pos[:, 1])
assert np.allclose(pos, pos2, atol=1e-9), "geoid grids do not share nodes"
chk_lon, chk_lat = pos[:, 0], pos[:, 1]
manual = n_cgg - n_ht2
via_proj = vt.transform(chk_lon, chk_lat, np.zeros(2))[2]
assert np.allclose(manual, via_proj, atol=0.002), (manual, via_proj)

utm_to_ll = Transformer.from_crs("EPSG:3157", "EPSG:4617", always_xy=True)   # pure projection (see build_city_footprints.py)
utm_to_lcc = Transformer.from_crs("EPSG:3157", "EPSG:3979", always_xy=True)  # both NAD83(CSRS): pure projection

with rasterio.open(SRC) as src:
    dem = src.read(1).astype(np.float64)
    inv = ~src.transform
    src_nodata = src.nodata
    src_tags = src.tags()
valid_src = dem != src_nodata


def smooth121(a):
    k = np.array([1.0, 2.0, 1.0]) / 4
    p = np.pad(a, 1, mode="edge")
    a = k[0] * p[:-2, 1:-1] + k[1] * p[1:-1, 1:-1] + k[2] * p[2:, 1:-1]
    p = np.pad(a, 1, mode="edge")
    return k[0] * p[1:-1, :-2] + k[1] * p[1:-1, 1:-1] + k[2] * p[1:-1, 2:]


def bilinear(a, ok, col, row):
    """Sample array a at fractional pixel-centre coordinates; nan where any corner is missing."""
    c0, r0 = np.floor(col).astype(int), np.floor(row).astype(int)
    fc, fr = col - c0, row - r0
    inside = (c0 >= 0) & (r0 >= 0) & (c0 + 1 < a.shape[1]) & (r0 + 1 < a.shape[0])
    c0, r0 = np.where(inside, c0, 0), np.where(inside, r0, 0)
    v = (a[r0, c0] * (1 - fc) * (1 - fr) + a[r0, c0 + 1] * fc * (1 - fr) + a[r0 + 1, c0] * (1 - fc) * fr + a[r0 + 1, c0 + 1] * fc * fr)
    good = inside & ok[r0, c0] & ok[r0, c0 + 1] & ok[r0 + 1, c0] & ok[r0 + 1, c0 + 1]
    return np.where(good, v, np.nan)


man_path = os.path.join(OUT_DIR, "layers.json")
man = json.load(open(man_path, encoding="utf-8")) if os.path.exists(man_path) else {"version": 1, "layers": []}
src_sha = hashlib.sha256(open(SRC, "rb").read()).hexdigest()
report = {}

for ring in RINGS:
    n = int(round(2 * ring["half"] / ring["step"])) + 1
    axis = np.arange(n) * ring["step"] - ring["half"]
    gx, gy = np.meshgrid(axis + ORIGIN[0], axis + ORIGIN[1])            # rows south -> north
    lx, ly = utm_to_lcc.transform(gx.ravel(), gy.ravel())
    col, row = inv * (np.asarray(lx), np.asarray(ly))
    a = smooth121(dem) if ring["smooth"] else dem
    h2013 = bilinear(a, valid_src, np.asarray(col) - 0.5, np.asarray(row) - 0.5)
    lon, lat = utm_to_ll.transform(gx.ravel(), gy.ravel())
    h28 = vt.transform(np.asarray(lon), np.asarray(lat), np.nan_to_num(h2013))[2]
    h28 = np.where(np.isnan(h2013), np.nan, h28)
    shift = h28 - h2013
    ok = ~np.isnan(h28)
    checks = {}
    if CONES and ring["id"] == "terrain_r1":
        grid = h28.reshape(n, n)
        seen, diffs = set(), {}
        for c in json.load(open(CONES, encoding="utf-8"))["cones"]:
            x, y = c["ring"][0]
            if (x, y) in seen:
                continue
            seen.add((x, y))
            fc, fr = (x - ORIGIN[0] + ring["half"]) / ring["step"], (y - ORIGIN[1] + ring["half"]) / ring["step"]
            c0, r0 = int(fc), int(fr)
            if 0 <= c0 < n - 1 and 0 <= r0 < n - 1:
                fc, fr = fc - c0, fr - r0
                z = grid[r0, c0] * (1 - fc) * (1 - fr) + grid[r0, c0 + 1] * fc * (1 - fr) + grid[r0 + 1, c0] * (1 - fc) * fr + grid[r0 + 1, c0 + 1] * fc * fr
                diffs[f"{c['id']} {c['name']}"] = round(float(c["Lv"] - z), 2)
        ground = [v for k, v in diffs.items() if not k.startswith(("E ", "G2 "))]   # E is a bridge deck, G2 a pier
        checks = {"viewpoint_Lv_minus_terrain_m": diffs, "median_ground_level_origins_m": round(float(np.median(ground)), 2),
                  "note": "City VIEWPOINT_ELEVATION_M is eye level; a median of 1-3 m at ground-level origins supports the datum chain (a sign or offset error of metres would show). Excludes E (Cambie Bridge deck) and G2 (pier)."}
        report["viewpoint_check_median_m"] = checks["median_ground_level_origins_m"]
    lo = np.floor(np.nanmin(h28) / ring["scale"]) * ring["scale"]
    q = np.where(ok, np.round((h28 - lo) / ring["scale"]), NODATA)
    assert q[ok].max() < NODATA, f"{ring['id']}: range does not fit uint16 at {ring['scale']} m"
    data = q.astype("<u2").tobytes()
    name = f"{ring['id']}.bin"
    with open(os.path.join(OUT_DIR, name), "wb") as fh:
        fh.write(data)
    report[ring["id"]] = {"nodes": n * n, "bytes": len(data), "min": round(float(np.nanmin(h28)), 2), "max": round(float(np.nanmax(h28)), 2),
                          "nodata": int((~ok).sum()), "datum_shift_m": [round(float(np.nanmin(shift)), 3), round(float(np.nanmax(shift)), 3)]}
    entry = {
        "id": ring["id"],
        "title": ring["title"],
        "file": name,
        "format": "uint16 little endian, rows south -> north, columns west -> east; height = offset + q * scale; 65535 = no data",
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "grid": {"cols": n, "rows": n, "step_m": ring["step"], "x0": float(axis[0]), "y0": float(axis[0]),
                 "offset_m": round(float(lo), 3), "scale_m": ring["scale"], "nodata": NODATA,
                 "note": "x0/y0: south-west node, metres from the local origin (EPSG:26910 minus origin)."},
        "source": {
            "name": "MRDEM-30 DTM (CanElevation Medium Resolution Digital Elevation Model)",
            "publisher": "Natural Resources Canada",
            "url": "https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da",
            "request": src_tags.get("SOURCE_URL", ""),
            "retrieved": RETRIEVED,
            "sha256": src_sha,
            "note": "Bare-earth DTM at 30 m blended from the lidar HRDEM mosaic and Copernicus GLO-30 (spec ed. 1.2). Window read by range requests (tools/fetch_mrdem_window.py).",
        },
        "licence": {"name": "Open Government Licence - Canada", "url": "https://open.canada.ca/en/open-government-licence-canada"},
        "attribution": "Contains information licensed under the Open Government Licence - Canada (Natural Resources Canada, MRDEM-30). Includes Copernicus DEM GLO-30 material, (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA.",
        "crs": {"horizontal": "EPSG:26910", "origin": list(ORIGIN),
                "note": "Resampled bilinearly from EPSG:3979 (both NAD83(CSRS)); node positions use the City's EPSG:26910 numbers (pure GRS80 UTM 10N)."},
        "datum": {
            "vertical": "CGVD28 (EPSG:5713) via HT2_2010v70",
            "from": "CGVD2013(CGG2013) (EPSG:6647), as declared in the MRDEM spec ed. 1.2 s6.2",
            "conversion": f"PROJ: {desc}",
            "grids": ["ca_nrc_CGG2013n83.tif (EPSG:9246)", "ca_nrc_HT2_2010v70.tif (EPSG:9123)"],
            "grid_licence": "Open Government Licence - Canada (Natural Resources Canada), via cdn.proj.org",
            "epoch": "Both geoid models at NAD83(CSRS) epoch 2010, so the chain needs no epoch step. MRDEM's own epoch is not stated.",
            "shift_range_m": report[ring["id"]]["datum_shift_m"],
            "checks": f"PROJ result equals N(CGG2013) - N(HT2_2010v70) from the raw grids within 2 mm at two grid nodes ({', '.join(f'{v:.3f}' for v in manual)} m).",
            "unverified": [
                "City LiDAR 2022 heights are CGVD28 through the Metro Vancouver hybrid geoid HTMVBC00, not HT2_2010v70. The difference between the two CGVD28 realisations is not measured here (expected centimetres).",
                "MRDEM declares CGVD2013 (EPSG:6647, CGG2013); if a source tile was really on CGG2013a, the difference is millimetres to centimetres here.",
            ],
        },
        "processing": {"script": "tools/build_city_terrain.py", "resample": "bilinear" + (" after a 1-2-1 smoothing (anti-alias for 60 m)" if ring["smooth"] else ""),
                       "min_m": report[ring["id"]]["min"], "max_m": report[ring["id"]]["max"],
                       "water": "Water surfaces read about -2 m CGVD28 (a lidar-time water level, not mean sea level); the app draws the sea as its 0 m ground plane.",
                       **({"checks": checks} if checks else {})},
        "flag": "unverified",
        **({"lazy": True} if DETAIL else {}),
    }
    man["layers"] = [l for l in man["layers"] if l["id"] != entry["id"]] + [entry]

man["layers"].sort(key=lambda l: l["id"])
with open(man_path, "w", encoding="utf-8") as fh:
    json.dump(man, fh, indent=1, ensure_ascii=False)
    fh.write("\n")
print(json.dumps({"operation": desc, "check_m": manual.round(4).tolist(), **report}, indent=1))
