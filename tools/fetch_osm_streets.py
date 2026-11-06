"""Fetch OpenStreetMap streets over Real Vancouver's model base outside Vista's rectangle, so the map's street lines
reach as far as the buildings.

    python -I tools/fetch_osm_streets.py <new empty raw dir>

Ruijie (5 Nov 2026), on the zoomed-out map: "you can see this clear distinction". Vista's street network (its
generated/street_network.json, one Overpass query over its model rectangle) stops at that rectangle, while the buildings
now fill the whole base (tools/fetch_osm_buildings.py, 4 Nov). This fetches the vehicular highway ways (the list
tools/build_vista_streets.py keeps, from Vista's traffic-network.js) in the base minus Vista's rectangle, in 3 x 3
tiles; build_vista_streets.py --fill drops the duplicates (by OSM id, and any way Vista already has).

Overpass fair use: a generic client name, one request at a time with a pause between, one back-off and a single second
try on 429 / 502 / 503 / 504, then stop. Data (c) OpenStreetMap contributors, ODbL 1.0. Log each file in
04 Tool Plan/overnight/DOWNLOADS.md.
"""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1]
ENDPOINT = "https://overpass-api.de/api/interpreter"
AGENT = "TowerDesignToolkit/0.1 (study tool)"
BASE = (49.195952, -123.241671, 49.337123, -123.018414)  # the model base (south, west, north, east), as fetch_osm_buildings.py
VISTA = "49.2367299,-123.1652987,49.3183317,-123.0425611"  # Vista's street query rectangle (its street_network.json query)
HIGHWAY = ("^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|"
           "residential|living_street|unclassified|service|road)$")
N = 3

os.makedirs(OUT, exist_ok=True)
assert not os.listdir(OUT) or all(f.startswith("streets_") or f == "requests.json" for f in os.listdir(OUT)), "use a new empty directory"
LOG = os.path.join(OUT, "requests.json")
log = json.load(open(LOG)) if os.path.exists(LOG) else []  # a second run fetches only the tiles still missing
s, w, n, e = BASE
for i in range(N):
    for j in range(N):
        name = f"streets_{i}{j}.json"
        if os.path.exists(os.path.join(OUT, name)):
            continue
        tile = f"{s + (n - s) * i / N:.6f},{w + (e - w) * j / N:.6f},{s + (n - s) * (i + 1) / N:.6f},{w + (e - w) * (j + 1) / N:.6f}"
        query = f'[out:json][timeout:300];(way["highway"~"{HIGHWAY}"]({tile}); - way["highway"~"{HIGHWAY}"]({VISTA}););out geom;'
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
