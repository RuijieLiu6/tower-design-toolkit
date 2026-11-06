"""Fetch OpenStreetMap buildings over Real Vancouver's model base outside Vista's model, to fill the base with buildings.

    python -I tools/fetch_osm_buildings.py <new empty raw dir>

Ruijie (4 Nov 2026): "for the part where the building footprints are missing make sure to find the data and fill in the
box". Vista's model (OpenStreetMap, 2022 core + current extension) stops at its own rectangle; the model base (the plinth,
the same box as tools/fetch_osm_water.py) runs to the Fraser, UBC, Boundary Road and the North Shore. This fetches the
building ways and multipolygon relations in that box minus Vista's rectangle, in 3 x 3 tiles (Overpass bbox semantics:
a way is in a tile when one of its nodes is; tools/build_vista_buildings.py removes the duplicates by OSM id).

Overpass fair use: a generic client name, one request at a time with a pause between, one back-off and a single second
try on 429 / 502 / 503 / 504, then stop. Data (c) OpenStreetMap contributors, ODbL 1.0. Log each file in
04 Tool Plan/overnight/DOWNLOADS.md.
"""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1]
ENDPOINT = "https://overpass-api.de/api/interpreter"
AGENT = "TowerDesignToolkit/0.1 (study tool)"
BASE = (49.195952, -123.241671, 49.337123, -123.018414)  # the model base (south, west, north, east), as fetch_osm_water.py
VISTA = "49.2367299,-123.1652987,49.3183317,-123.0425611"  # Vista's model rectangle, as fetch_osm_use_tags.py
N = 3

os.makedirs(OUT, exist_ok=True)
assert not os.listdir(OUT) or all(f.startswith("buildings_") or f == "requests.json" for f in os.listdir(OUT)), "use a new empty directory"
LOG = os.path.join(OUT, "requests.json")
log = json.load(open(LOG)) if os.path.exists(LOG) else []  # a second run fetches only the tiles still missing
s, w, n, e = BASE
for i in range(N):
    for j in range(N):
        name = f"buildings_{i}{j}.json"
        if os.path.exists(os.path.join(OUT, name)):
            continue
        tile = f"{s + (n - s) * i / N:.6f},{w + (e - w) * j / N:.6f},{s + (n - s) * (i + 1) / N:.6f},{w + (e - w) * (j + 1) / N:.6f}"
        query = (f'[out:json][timeout:300];(way["building"]({tile}); - way["building"]({VISTA}););out geom;'
                 f'relation["building"]["type"="multipolygon"]({tile});out geom;')
        body = urllib.parse.urlencode({"data": query}).encode()
        for attempt in (1, 2):
            req = urllib.request.Request(ENDPOINT, data=body, headers={"User-Agent": AGENT})
            try:
                with urllib.request.urlopen(req, timeout=360) as r:
                    data = r.read()
                break
            except urllib.error.HTTPError as err:
                if err.code in (429, 502, 503, 504) and attempt == 1:
                    wait = int(err.headers.get("Retry-After") or 60)
                    print(f"{name}: HTTP {err.code}, backing off {wait} s, one more try", flush=True)
                    time.sleep(min(wait, 180))
                    continue
                raise
        d = json.loads(data)  # must be JSON
        assert "remark" not in d or "error" not in d["remark"].lower(), d.get("remark")
        open(os.path.join(OUT, name), "wb").write(data)
        log.append({"file": name, "endpoint": ENDPOINT, "query": query, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                    "elements": len(d["elements"]), "user_agent": AGENT,
                    "retrieved": datetime.now(timezone.utc).isoformat(timespec="seconds"), "licence": "ODbL 1.0, (c) OpenStreetMap contributors"})
        print(name, len(data), "bytes", len(d["elements"]), "elements", flush=True)
        json.dump(log, open(LOG, "w"), indent=1)
        time.sleep(8)  # spacing between requests
