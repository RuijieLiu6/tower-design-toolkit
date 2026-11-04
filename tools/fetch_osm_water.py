"""Fetch the OpenStreetMap coastline and water bodies over Real Vancouver's model base, to clean up the water in the view.

    python -I tools/fetch_osm_water.py <new empty raw dir>

Two Overpass queries over the plinth (CITY_PLINTH, lib/plinth.ts, through EPSG:3157 to latitude/longitude), each sent once:
  coastline.json  natural=coastline ways with geometry (OSM convention: land on the left, sea on the right)
  water.json      natural=water ways and relations, landuse=reservoir ways, with geometry
Overpass fair use: a generic client name, no retry loop; one back-off and a single second try on 429 / 504, then stop.
Data (c) OpenStreetMap contributors, ODbL. Log each file in 04 Tool Plan/overnight/DOWNLOADS.md.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

from pyproj import Transformer

OUT = sys.argv[1]
ENDPOINT = "https://overpass-api.de/api/interpreter"
AGENT = "TowerDesignToolkit/0.1 (study tool)"
ORIGIN = (491300.0, 5458600.0)
PLINTH = {"x0": -8640, "y0": -9000, "x1": 7140, "y1": 6000}  # lib/plinth.ts CITY_PLINTH, local metres
to_ll = Transformer.from_crs("EPSG:3157", "EPSG:4617", always_xy=True)
corners = [to_ll.transform(ORIGIN[0] + x, ORIGIN[1] + y) for x in (PLINTH["x0"], PLINTH["x1"]) for y in (PLINTH["y0"], PLINTH["y1"])]
pad = 0.003  # about 300 m, so coastline ways that cross the edge come whole
S, W = min(c[1] for c in corners) - pad, min(c[0] for c in corners) - pad
N, E = max(c[1] for c in corners) + pad, max(c[0] for c in corners) + pad
BBOX = f"{S:.6f},{W:.6f},{N:.6f},{E:.6f}"
QUERIES = {
    "coastline.json": f'[out:json][timeout:180];way["natural"="coastline"]({BBOX});out geom;',
    "water.json": f'[out:json][timeout:180];(way["natural"="water"]({BBOX});relation["natural"="water"]({BBOX});way["landuse"="reservoir"]({BBOX}););out geom;',
}

os.makedirs(OUT, exist_ok=True)
assert not os.listdir(OUT), "use a new empty directory"
log = []
for name, query in QUERIES.items():
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in (1, 2):
        req = urllib.request.Request(ENDPOINT, data=body, headers={"User-Agent": AGENT})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 504) and attempt == 1:
                wait = int(e.headers.get("Retry-After") or 60)
                print(f"{name}: HTTP {e.code}, backing off {wait} s, one more try")
                time.sleep(min(wait, 180))
                continue
            raise
    json.loads(data)  # must be JSON
    open(os.path.join(OUT, name), "wb").write(data)
    log.append({"file": name, "endpoint": ENDPOINT, "query": query, "bytes": len(data), "user_agent": AGENT,
                "retrieved": datetime.now(timezone.utc).isoformat(timespec="seconds"), "licence": "ODbL 1.0, (c) OpenStreetMap contributors"})
    print(name, len(data), "bytes")
    time.sleep(5)  # spacing between the two requests
json.dump(log, open(os.path.join(OUT, "requests.json"), "w"), indent=1)
print("bbox", BBOX)
