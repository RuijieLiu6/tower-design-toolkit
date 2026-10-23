"""Derive per-footprint ground and roof heights from City of Vancouver LiDAR 2022 tiles.

Usage (pipeline venv, isolated mode; one zip per tile, downloaded by hand from the City portal):
    python -I tools/build_lidar_heights.py <out_dir> <zip_dir> <extract_root> <retrieved YYYY-MM-DD> [--keep-las]

Reads <out_dir>/footprints_downtown.bin (same order as the app), extracts each <zip_dir>/<E>_<N>.zip into its own new
folder under <extract_root>, processes it, and deletes the extracted LAS unless --keep-las. Writes
<out_dir>/footprint_heights.bin ("TSH1") and its layers.json entry. Footprints not fully inside processed tiles, or
with too few points, stay unknown: the app draws them as "height unknown" outlines. No height is ever defaulted.

Method (research packet C02-M03, simplified, team starting values):
    id raster at 0.25 m per tile; each point goes to the footprint it falls in, or to the nearest one within 0.5 m
    (ring-by-ring growth, so a podium does not take an adjacent tower's wall returns)
    roof_p90  P90 of building-class points (class 6) inside the footprint shrunk 0.5 m     -> display
    roof_max  highest z with >= 5 non-noise points within 1 m below it (spike filter), in the 0.5 m partition -> cone tests;
              edge-band points (partition minus the shrunk core) more than 3 m above the building-class max are
              listed, not counted (a neighbour's wall or roof)
    ground    P10 of ground-class points (class 2) in a 0.5-5 m ring outside the footprint
Heights are as delivered: CGVD28 (the City's CGVD28GVRD realisation, HTMVBC00 geoid), metres.
"""
import hashlib
import json
import os
import shutil
import struct
import sys
import zipfile

import laspy
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import Polygon

OUT_DIR, ZIP_DIR, EXTRACT_ROOT, RETRIEVED = sys.argv[1:5]
KEEP_LAS = "--keep-las" in sys.argv[5:]
PX = 0.25                       # id raster pixel (m)
GROW_PX = 2                     # 0.5 m partition growth
SHRINK_PX = 2                   # 0.5 m shrink for the roof sample
GROUND_PX = 20                  # 5 m ground ring
MIN_ROOF_PTS, MIN_GROUND_PTS = 20, 10
NOISE = {7, 18}
UNKNOWN = -32768


# ---------- footprints, decoded exactly as src/lib/cityLayers.ts does ----------
def decode_tsf1(buf):
    magic, count, ox, oy, q, _ = struct.unpack_from("<4sIiifI", buf, 0)
    assert magic == b"TSF1", magic
    p = 24

    def varint():
        nonlocal p
        v, shift = 0, 0
        while True:
            b = buf[p]
            p += 1
            v |= (b & 0x7F) << shift
            shift += 7
            if not b & 0x80:
                return v

    def zz():
        v = varint()
        return (v >> 1) ^ -(v & 1)

    out, oid, fx, fy = [], 0, 0, 0
    for _ in range(count):
        oid += zz()
        head = varint()
        sizes = [head >> 1]
        if head & 1:
            sizes += [varint() for _ in range(varint())]
        rings, x, y = [], fx, fy
        for r, n in enumerate(sizes):
            ring = []
            for k in range(n):
                x += zz()
                y += zz()
                if r == 0 and k == 0:
                    fx, fy = x, y
                ring.append((x * q + ox, y * q + oy))
            rings.append(ring)
        out.append((oid, rings))
    assert p == len(buf), "trailing bytes"
    return out, (ox, oy)


fp_path = os.path.join(OUT_DIR, "footprints_downtown.bin")
footprints, ORIGIN = decode_tsf1(open(fp_path, "rb").read())
polys = [Polygon(r[0], r[1:]) for _, r in footprints]
bounds = np.array([p.bounds for p in polys])
N = len(polys)


# ---------- raster helpers (numpy only) ----------
def shifts(a, d):
    """8-neighbour views of a padded array at offset d (for growth and erosion)."""
    p = np.pad(a, d)
    h, w = a.shape
    for dy in (-d, 0, d):
        for dx in (-d, 0, d):
            if dx or dy:
                yield p[d + dy:d + dy + h, d + dx:d + dx + w]


def grow(ids, steps):
    """Assign empty pixels to a neighbouring id, one ring at a time (nearest ring wins)."""
    g = ids.copy()
    for _ in range(steps):
        empty = g == 0
        if not empty.any():
            break
        for nb in shifts(g, 1):
            take = empty & (nb > 0) & (g == 0)
            g[take] = nb[take]
    return g


def shrink(ids, steps):
    s = ids.copy()
    for _ in range(steps):
        keep = s > 0
        for nb in shifts(s, 1):
            keep &= nb == s
        s = np.where(keep, s, 0)
    return s


# ---------- per tile ----------
def safe_extract(zpath, dest):
    os.makedirs(dest, exist_ok=False)                    # always a new, empty folder
    with zipfile.ZipFile(zpath) as z:
        names = []
        for m in z.infolist():
            target = os.path.realpath(os.path.join(dest, m.filename))
            if not target.startswith(os.path.realpath(dest) + os.sep):
                raise ValueError(f"unsafe path in zip: {m.filename}")
            if m.is_dir():
                continue
            z.extract(m, dest)
            names.append(target)
    return [n for n in names if n.lower().endswith((".las", ".laz"))]


def process_tile(las_paths, e0, n0, collect, meta):
    w = h = int(round(1000 / PX))
    tr = from_origin(e0, n0 + 1000, PX, PX)
    near = [i for i in range(N) if bounds[i, 2] > e0 - 6 and bounds[i, 0] < e0 + 1006 and bounds[i, 3] > n0 - 6 and bounds[i, 1] < n0 + 1006]
    ids = rasterize(((polys[i], i + 1) for i in near), out_shape=(h, w), transform=tr, fill=0, dtype="int32") if near else np.zeros((h, w), "int32")
    part = grow(ids, GROW_PX)
    core = shrink(ids, SHRINK_PX)
    band = np.where(core > 0, 0, part)
    ring = grow(part, GROUND_PX - GROW_PX)
    ring[part > 0] = 0
    for path in las_paths:
        with laspy.open(path) as f:
            hdr = f.header
            meta.setdefault("headers", []).append({
                "file": os.path.basename(path), "points": int(hdr.point_count), "format": int(hdr.point_format.id),
                "version": str(hdr.version), "crs": (hdr.parse_crs().to_wkt()[:400] if hdr.parse_crs() else None),
            })
            for pts in f.chunk_iterator(5_000_000):
                x, y, z = np.asarray(pts.x), np.asarray(pts.y), np.asarray(pts.z)
                cls = np.asarray(pts.classification)
                meta["classes"] = meta.get("classes", {})
                for c, n in zip(*np.unique(cls, return_counts=True)):
                    meta["classes"][int(c)] = meta["classes"].get(int(c), 0) + int(n)
                col = np.floor((x - e0) / PX).astype(np.int64)
                row = np.floor((n0 + 1000 - y) / PX).astype(np.int64)
                ok = (col >= 0) & (col < w) & (row >= 0) & (row < h)
                col, row, z, cls = col[ok], row[ok], z[ok], cls[ok]
                good = ~np.isin(cls, list(NOISE))
                for key, raster, mask in (("roof", core, cls == 6), ("core", core, good), ("band", band, good), ("ground", ring, cls == 2)):
                    pid = raster[row[mask], col[mask]]
                    sel = pid > 0
                    collect[key].append(((pid[sel] - 1).astype(np.int32), z[mask][sel].astype(np.float32)))


def group(pairs):
    """{footprint index: heights (float64)} from per-chunk (ids, z) arrays."""
    if not pairs:
        return {}
    ids = np.concatenate([p[0] for p in pairs])
    z = np.concatenate([p[1] for p in pairs])
    order = np.argsort(ids, kind="stable")
    ids, z = ids[order], z[order].astype(np.float64)
    keys, starts = np.unique(ids, return_index=True)
    return dict(zip(keys.tolist(), np.split(z, starts[1:])))


def spike_filtered_max(z):
    s = np.sort(z)[::-1]
    for i in range(len(s) - 4):
        if s[i] - s[i + 4] <= 1.0:
            return float(s[i])
    return None


zips = sorted(f for f in os.listdir(ZIP_DIR) if f.lower().endswith(".zip"))
if not zips:
    sys.exit(f"no LiDAR zips in {ZIP_DIR}")
collect = {"roof": [], "core": [], "band": [], "ground": []}
tiles, covered = [], []
for zname in zips:
    tile = zname[:-4]
    e0, n0 = (int(v) for v in tile.split("_"))
    zpath = os.path.join(ZIP_DIR, zname)
    meta = {"tile": tile, "zip_bytes": os.path.getsize(zpath), "zip_sha256": hashlib.sha256(open(zpath, "rb").read()).hexdigest()}
    dest = os.path.join(EXTRACT_ROOT, tile)
    las = safe_extract(zpath, dest)
    if not las:
        raise SystemExit(f"{zname}: no .las/.laz inside")
    process_tile(las, e0, n0, collect, meta)
    if not KEEP_LAS:
        shutil.rmtree(dest)
    tiles.append(meta)
    covered.append((e0, n0))
    print(json.dumps({k: meta[k] for k in ("tile", "zip_bytes", "classes")}), flush=True)


def inside_tiles(b):
    """Footprint bbox fully inside the union of processed tiles (checked at its four corners and centre)."""
    pts = [(b[0], b[1]), (b[0], b[3]), (b[2], b[1]), (b[2], b[3]), ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)]
    return all(any(e <= x < e + 1000 and n <= y < n + 1000 for e, n in covered) for x, y in pts)


roof, core_all, band_all, gnd = (group(collect[k]) for k in ("roof", "core", "band", "ground"))
rows, stats = [], {"covered": 0, "with_roof": 0, "with_ground": 0, "complete": 0, "band_points_listed_not_counted": 0}
for i in range(N):
    g = r = m = None
    pts = 0
    if inside_tiles(bounds[i]):
        stats["covered"] += 1
        zr, zg = roof.get(i), gnd.get(i)
        if zr is not None and len(zr) >= MIN_ROOF_PTS:
            r, pts = float(np.percentile(zr, 90)), len(zr)
            stats["with_roof"] += 1
            max_bldg = spike_filtered_max(zr)
            zb = band_all.get(i, np.empty(0))
            out = zb > (max_bldg if max_bldg is not None else r) + 3.0
            stats["band_points_listed_not_counted"] += int(out.sum())
            zm = np.concatenate([core_all.get(i, np.empty(0)), zb[~out]])
            m = spike_filtered_max(zm) if len(zm) >= 5 else None
        if zg is not None and len(zg) >= MIN_GROUND_PTS:
            g = float(np.percentile(zg, 10))
            stats["with_ground"] += 1
    if r is not None and g is not None and r > g:
        stats["complete"] += 1
    else:
        r = m = None                                    # a roof without its ground is not drawn
    dm = lambda v: UNKNOWN if v is None else int(round(v * 10))
    rows.append(struct.pack("<hhhH", dm(g), dm(r), dm(m), min(pts, 65535)))

buf = struct.pack("<4sI", b"TSH1", N) + b"".join(rows)
name = "footprint_heights.bin"
with open(os.path.join(OUT_DIR, name), "wb") as fh:
    fh.write(buf)

entry = {
    "id": "footprint_heights",
    "title": "Building heights (LiDAR 2022)",
    "file": name,
    "format": "TSH1: u32 count, then per footprint (footprints order) int16 ground, roof P90, roof max in dm (-32768 = unknown), uint16 roof points",
    "bytes": len(buf),
    "sha256": hashlib.sha256(buf).hexdigest(),
    "count": stats["complete"],
    "source": {
        "name": "LiDAR 2022",
        "publisher": "City of Vancouver",
        "url": "https://opendata.vancouver.ca/explore/dataset/lidar-2022/",
        "retrieved": RETRIEVED,
        "note": "Tiles downloaded by hand in a browser (the portal blocks scripted downloads). Raw LAS deleted after processing.",
        "tiles": [{k: t[k] for k in ("tile", "zip_bytes", "zip_sha256", "classes", "headers") if k in t} for t in tiles],
    },
    "licence": {"name": "Open Government Licence - Vancouver", "url": "https://opendata.vancouver.ca/pages/licence/"},
    "attribution": "Contains information licensed under the Open Government Licence - Vancouver (LiDAR 2022).",
    "crs": {"horizontal": "EPSG:26910", "note": "City tiles in EPSG:26910 numbers (NAD83(CSRS) 4.0.0.BC.1.GVRD per City metadata); joined to footprints in the same frame."},
    "datum": {
        "vertical": "CGVD28 (City CGVD28GVRD, HTMVBC00 geoid)",
        "note": "As delivered; no conversion. Terrain layers use CGVD28 via HT2_2010v70 instead.",
        "unverified": ["Difference between the HTMVBC00 and HT2_2010v70 realisations of CGVD28 is not measured (expected centimetres)."],
    },
    "processing": {
        "script": "tools/build_lidar_heights.py",
        "method": "0.25 m id raster; 0.5 m nearest-footprint partition; roof P90 of class 6 inside the footprint shrunk 0.5 m; roof max = highest z with 5 points within 1 m (noise classes 7 and 18 excluded; edge-band points over 3 m above the building-class max listed, not counted); ground P10 of class 2 in a 0.5-5 m ring",
        "min_points": {"roof": MIN_ROOF_PTS, "ground": MIN_GROUND_PTS},
        "footprints": N,
        **stats,
        "unknown": N - stats["complete"],
    },
    "flag": "unverified",
}
man_path = os.path.join(OUT_DIR, "layers.json")
man = json.load(open(man_path, encoding="utf-8"))
man["layers"] = sorted([l for l in man["layers"] if l["id"] != entry["id"]] + [entry], key=lambda l: l["id"])
with open(man_path, "w", encoding="utf-8") as fh:
    json.dump(man, fh, indent=1, ensure_ascii=False)
    fh.write("\n")
print(json.dumps({"tiles": [t["tile"] for t in tiles], **entry["processing"]}, indent=1))
