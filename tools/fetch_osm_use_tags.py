"""Fetch the OpenStreetMap tags that name a building's use, for the Real Vancouver building types (Plain style).

    python -I tools/fetch_osm_use_tags.py <new empty raw dir>

Two Overpass queries over Vista's model extent (the same box as Vista's street_network.json query), each sent once:
  building_way_tags.json  the tags of every building way (building, building:use, shop, amenity, office, tourism, ...)
  use_pois.json           points of interest with a use (shop, amenity, office, tourism, railway / public_transport stations)
Overpass fair use: a generic client name, no retry loop; one back-off and a single second try on 429 / 504, then stop.
Data (c) OpenStreetMap contributors, ODbL. Log each file in 04 Tool Plan/overnight/DOWNLOADS.md.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1]
ENDPOINT = "https://overpass-api.de/api/interpreter"
AGENT = "TowerDesignToolkit/0.1 (study tool)"
BBOX = "49.2367299,-123.1652987,49.3183317,-123.0425611"  # Vista's street_network.json query box (south, west, north, east)
QUERIES = {
    "building_way_tags.json": f'[out:json][timeout:180];way["building"]({BBOX});out tags;',
    "use_pois.json": (f'[out:json][timeout:180];(node["shop"]({BBOX});node["amenity"]({BBOX});node["office"]({BBOX});'
                      f'node["tourism"]({BBOX});node["railway"="station"]({BBOX});node["public_transport"="station"]({BBOX}););out;'),
}

os.makedirs(OUT, exist_ok=True)
assert not os.listdir(OUT) or all(f in QUERIES or f == "requests.json" for f in os.listdir(OUT)), "use a new empty directory"
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
