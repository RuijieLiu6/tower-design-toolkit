"""Fetch OpenStreetMap green space and trails over Real Vancouver's model base.

    python -I tools/fetch_osm_green.py <new empty raw dir>

Ruijie (5 Nov 2026), circling the empty ground south-west of West Point Grey: "finish the missing context here ... do a
check to make sure the whole maps have context". The coverage check (500 m cells) found it is Pacific Spirit Regional
Park: forest and trails, no buildings and almost no roads (OpenStreetMap: 2 buildings, 7 roads, 28 paths in 1.5 km
square). The map's park tint came only from the City's parks layer, which leaves out regional parks, golf courses,
forests and the University lands, so the park read as a hole. This fetches, in 3 x 3 tiles over the model base:
  green_ij.json   leisure park / nature_reserve / golf_course / garden / recreation_ground, landuse forest / grass /
                  meadow / cemetery / recreation_ground / village_green, natural wood / scrub / grassland / heath
                  (ways and multipolygon relations, with geometry)
  trails_ij.json  highway path / track / bridleway (ways with geometry)
  green_wetland.json  natural=wetland over the whole base (one request)
tools/build_osm_green.py turns them into public/data/green.json and trails.json.

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
N = 3
LEISURE = "^(park|nature_reserve|golf_course|garden|recreation_ground)$"
LANDUSE = "^(forest|grass|meadow|cemetery|recreation_ground|village_green)$"
NATURAL = "^(wood|scrub|grassland|heath)$"
TRAILS = "^(path|track|bridleway)$"


def queries(tile):
    green = (f'[out:json][timeout:300];('
             f'way["leisure"~"{LEISURE}"]({tile});relation["leisure"~"{LEISURE}"]["type"="multipolygon"]({tile});'
             f'way["landuse"~"{LANDUSE}"]({tile});relation["landuse"~"{LANDUSE}"]["type"="multipolygon"]({tile});'
             f'way["natural"~"{NATURAL}"]({tile});relation["natural"~"{NATURAL}"]["type"="multipolygon"]({tile});'
             f');out geom;')
    trails = f'[out:json][timeout:300];way["highway"~"{TRAILS}"]({tile});out geom;'
    return {"green": green, "trails": trails}


os.makedirs(OUT, exist_ok=True)
assert not os.listdir(OUT) or all(f.startswith(("green_", "trails_")) or f == "requests.json" for f in os.listdir(OUT)), "use a new empty directory"
LOG = os.path.join(OUT, "requests.json")
log = json.load(open(LOG)) if os.path.exists(LOG) else []  # a second run fetches only the files still missing
s, w, n, e = BASE
# Wetland (the Fraser foreshore, 5 Nov coverage check), one request over the whole base: drawn as green with the rest.
EXTRA = {"green_wetland.json": f'[out:json][timeout:300];(way["natural"="wetland"]({s},{w},{n},{e});relation["natural"="wetland"]["type"="multipolygon"]({s},{w},{n},{e}););out geom;'}

for i in range(N + 1):
    for j in range(N if i < N else 1):
        tile = f"{s + (n - s) * i / N:.6f},{w + (e - w) * j / N:.6f},{s + (n - s) * (i + 1) / N:.6f},{w + (e - w) * (j + 1) / N:.6f}"
        todo = [(f"{kind}_{i}{j}.json", q) for kind, q in queries(tile).items()] if i < N else list(EXTRA.items())
        for name, query in todo:
            if os.path.exists(os.path.join(OUT, name)):
                continue
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
