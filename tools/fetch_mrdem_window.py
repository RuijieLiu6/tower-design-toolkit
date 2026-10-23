"""Read one window of NRCan MRDEM-30 (DTM) around downtown Vancouver with HTTP range requests and save it as a GeoTIFF.

Usage (pipeline venv, isolated mode):
    python -I tools/fetch_mrdem_window.py <out.tif> [half_size_m]

The full COG is about 84 GB; only the tiles that cover the window are read. The window is the UTM square of
+/- half_size_m (default 26000 m) around CITY_ORIGIN, expressed in the COG's own CRS (EPSG:3979). Values are written
unchanged: CGVD2013 (EPSG:6647) heights in metres, nodata -32767.
"""
import os
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

URL = "https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif"
ORIGIN = (491300, 5458600)
OUT = sys.argv[1]
HALF = float(sys.argv[2]) if len(sys.argv) > 2 else 26000.0

# EPSG:3157 -> EPSG:3979 share NAD83(CSRS), so this is a pure change of projection.
t = Transformer.from_crs("EPSG:3157", "EPSG:3979", always_xy=True)
edge = np.linspace(-HALF, HALF, 53)
xs = np.concatenate([edge, edge, np.full_like(edge, -HALF), np.full_like(edge, HALF)]) + ORIGIN[0]
ys = np.concatenate([np.full_like(edge, -HALF), np.full_like(edge, HALF), edge, edge]) + ORIGIN[1]
lx, ly = t.transform(xs, ys)
bounds = (lx.min() - 60, ly.min() - 60, lx.max() + 60, ly.max() + 60)

env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3")
with rasterio.Env(**env), rasterio.open(f"/vsicurl/{URL}") as src:
    print("source", src.crs, src.dtypes[0], src.res, src.nodata, src.width, "x", src.height)
    win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
    data = src.read(1, window=win)
    profile = src.profile.copy()
    profile.update(driver="GTiff", width=data.shape[1], height=data.shape[0], transform=src.window_transform(win),
                   compress="deflate", predictor=3 if data.dtype.kind == "f" else 2, tiled=True, blockxsize=256, blockysize=256)
    for k in ("copy_src_overviews", "interleave"):
        profile.pop(k, None)
    tags = src.tags()

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
with rasterio.open(OUT, "w", **profile) as dst:
    dst.write(data, 1)
    dst.update_tags(SOURCE_URL=URL, WINDOW_HALF_SIZE_M=str(HALF), VERTICAL_DATUM="CGVD2013 (EPSG:6647), per MRDEM spec ed. 1.2 s6.2", **{f"SRC_{k}": v for k, v in tags.items()})

valid = data[data != profile.get("nodata", -32767)]
print("window", data.shape, "bytes on disk", os.path.getsize(OUT), "min/max", float(valid.min()), float(valid.max()), "nodata px", int(data.size - valid.size))
