"""Vista's place labels (neighbourhoods, water bodies, landmarks) for the Real Vancouver City overview.

    python -I tools/build_vista_labels.py <raw_dir> <out_dir> <commit> <retrieved YYYY-MM-DD>

<raw_dir> holds Vista's generated/labels.json and generated/extension_labels.json, fetched read only:
    gh api repos/RuijieLiu6/vancouver-tall-view-tool/contents/generated/<file>?ref=<commit>
Each label's x, y (Vista's model frame) go through latitude/longitude with Vista's own formula into EPSG:3157 (UTM 10N
on NAD83(CSRS)), then the Toolkit's local frame (minus CITY_ORIGIN 491300 E, 5458600 N), as in build_vista_buildings.py.
Vista's label z (on its SRTM surface) is kept for display: labels float 40 m above the higher of it and the Toolkit ground.
Writes <out_dir>/vista_labels.json and its entry in <out_dir>/layers.json.
"""
import hashlib, json, math, os, sys

from pyproj import Transformer

RAW, OUT, COMMIT, RETRIEVED = sys.argv[1:5]
LAT0, LON0, M_LAT, M_LON_EQ = 49.2827, -123.1207, 110574.0, 111320.0
M_LON = M_LON_EQ * math.cos(math.radians(LAT0))
ORIGIN = (491300.0, 5458600.0)
to_utm = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)
FILES = {"labels.json": False, "extension_labels.json": True}  # file -> outside Vista's core model (drawn lighter, as Vista does)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


labels = []
for name, ext in FILES.items():
    for e in json.load(open(os.path.join(RAW, name), encoding="utf-8")):
        text = str(e["text"]).strip()
        assert text and len(text) < 60, text
        x, y = float(e["x"]), float(e["y"])
        east, north = to_utm.transform(LON0 + x / M_LON, LAT0 + y / M_LAT)
        # z: Vista's anchor height (on its SRTM surface, which includes the downtown roofs); the app floats labels 40 m
        # above the higher of it and the Toolkit ground, as Vista floats them 40 m above it.
        labels.append({"text": text, "x": round(east - ORIGIN[0], 1), "y": round(north - ORIGIN[1], 1), "z": round(float(e["z"]), 1), "ext": ext})
assert len({l["text"] for l in labels}) == len(labels), "duplicate label"

out = {"version": 1, "origin": list(ORIGIN), "count": len(labels), "labels": labels}
path = os.path.join(OUT, "vista_labels.json")
data = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
open(path, "wb").write(data)

layer = {
    "id": "vista_labels",
    "title": "Place labels for the City overview: Vista's neighbourhood and landmark names",
    "file": "vista_labels.json",
    "format": "JSON, local metres east/north from CITY_ORIGIN",
    "bytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
    "count": len(labels),
    "source": {
        "name": "Vista place labels: generated/labels.json + generated/extension_labels.json",
        "publisher": "Ruijie Liu, Vista (vancouver-tall-view-tool)",
        "url": f"https://github.com/RuijieLiu6/vancouver-tall-view-tool/tree/{COMMIT}/generated",
        "retrieved": RETRIEVED,
        "commit": COMMIT,
        "request": f"gh api repos/RuijieLiu6/vancouver-tall-view-tool/contents/generated/<file>?ref={COMMIT} (read only)",
        "inputs_sha256": {name: sha(os.path.join(RAW, name)) for name in FILES},
        "note": "Vista records no source for these anchors; treated as Vista's (Ruijie Liu's) own work. Positions are label anchors, not boundaries.",
    },
    "licence": {"name": "Ruijie Liu's own work (Vista), used with Ruijie's permission in this course project", "url": f"https://github.com/RuijieLiu6/vancouver-tall-view-tool/tree/{COMMIT}"},
    "attribution": "Place labels: Vista (Ruijie Liu).",
    "crs": {"horizontal": "EPSG:26910", "note": "Vista's model X/Y -> latitude/longitude with Vista's own formula -> EPSG:4617 -> EPSG:3157 (pure projection)"},
    "datum": {"vertical": None, "note": "z is Vista's anchor height on its SRTM surface (display only, not a survey height); the app floats each label 40 m above the higher of z and the Toolkit ground, as Vista does."},
    "processing": {"build": "python -I tools/build_vista_labels.py <raw_dir> public/data <commit> <retrieved>", "outside_core_model": sum(l["ext"] for l in labels)},
    "flag": "unverified",
    "lazy": True,
}
mpath = os.path.join(OUT, "layers.json")
manifest = json.load(open(mpath, encoding="utf-8"))
manifest["layers"] = [l for l in manifest["layers"] if l["id"] != layer["id"]] + [layer]
open(mpath, "w", encoding="utf-8").write(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
print("wrote", path, len(data), "B,", len(labels), "labels; layers.json updated")
