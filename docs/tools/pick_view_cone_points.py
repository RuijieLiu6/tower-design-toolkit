"""Pick 5 land points per downtown view cone (2 on-axis >=1 km apart, 1 hold-out, 2 off-axis at different distances)."""
import json, math, sys, time, urllib.request, urllib.parse
from pyproj import Transformer

DATA, OUT = sys.argv[1], sys.argv[2]
to_ll = Transformer.from_crs(26910, 4326, always_xy=True)
cones = {str(f["attributes"]["VIEW_NUMBER"]): f for f in json.load(open(DATA))["features"]}
TARGET = ["3.2.1", "3.2.2", "9.1", "9.2", "B2", "D", "J1"]
BOX = (-123.145, 49.268, -123.095, 49.2995)
cache = {}

def addr_at(lon, lat):
    key = (round(lon, 5), round(lat, 5))
    if key in cache: return cache[key]
    q = urllib.parse.urlencode({"point": f"{lon:.6f},{lat:.6f}", "outputSRS": 4326, "maxDistance": 35})
    req = urllib.request.Request(f"https://geocoder.api.gov.bc.ca/sites/nearest.json?{q}", headers={"User-Agent": "UBC-ARCH540-student-research"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            p = json.load(r)["properties"]; a = p.get("fullAddress")
            a = a.split(" -- ")[-1] if a else None   # drop unit prefix
    except Exception:
        a = None
    time.sleep(0.35); cache[key] = a; return a

def pt(O, a, d):
    x, y = O[0] + d * math.cos(a), O[1] + d * math.sin(a)
    lon, lat = to_ll.transform(x, y)
    return x, y, lon, lat

out = {}
for vid in TARGET:
    ring = cones[vid]["geometry"]["rings"][0]; O = ring[0]
    rays = [(p[0] - O[0], p[1] - O[1]) for p in ring[1:-1]]
    angs = [math.atan2(dy, dx) for dx, dy in rays]
    axis = (min(angs) + max(angs)) / 2; half = (max(angs) - min(angs)) / 2
    Rmax = min(math.hypot(*r) for r in rays)
    ds = [d for d in range(100, int(Rmax), 40) if BOX[0] <= pt(O, axis, d)[2] <= BOX[2] and BOX[1] <= pt(O, axis, d)[3] <= BOX[3]]
    def first_land(seq, off):
        for d in seq:
            x, y, lon, lat = pt(O, axis + off * half, d)
            if not (BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]): continue
            a = addr_at(lon, lat)
            if a: return dict(d_m=d, off=off, x=round(x, 1), y=round(y, 1), lat=round(lat, 6), lon=round(lon, 6), address=a)
        return None
    near = first_land(ds, 0.0)
    far = first_land(list(reversed(ds)), 0.0)
    picks = []
    if near: picks.append(dict(near, role="A on-axis, nearest land"))
    if far: picks.append(dict(far, role="B on-axis, farthest land"))
    if near and far:
        span = far["d_m"] - near["d_m"]
        mid_d = near["d_m"] + span // 2
        mid = first_land([d for d in ds if d >= mid_d], 0.0)
        if mid: picks.append(dict(mid, role="E hold-out, on-axis middle (do not use for fitting)"))
        used = {p["address"] for p in picks}
        for frac, off, tag in ((0.3, -0.8, "C off-axis, one side (80% of half-width)"), (0.7, 0.8, "D off-axis, other side (80% of half-width)")):
            target = near["d_m"] + int(span * frac)
            seq = sorted(ds, key=lambda d: abs(d - target))
            for d in seq:
                c = first_land([d], off)
                if c and c["address"] not in used:
                    picks.append(dict(c, role=tag)); used.add(c["address"]); break
    out[vid] = {"name": cones[vid]["attributes"]["VIEW_CONE_NAME"], "subject": cones[vid]["attributes"]["VIEW_SUBJECT"],
                "origin_utm10n": [round(O[0], 2), round(O[1], 2)], "Lv_m": cones[vid]["attributes"]["VIEWPOINT_ELEVATION_M"],
                "spread_deg": round(math.degrees(2 * half), 2), "points": sorted(picks, key=lambda p: p["role"])}
json.dump(out, open(OUT, "w"), indent=1)
for vid, r in out.items():
    print(f"\n{vid} {r['name']} -> {r['subject']}  Lv={r['Lv_m']} m  spread={r['spread_deg']} deg")
    for p in r["points"]:
        print(f"  {p['role']:<52} d={p['d_m']:>5} m  ({p['lat']:.6f}, {p['lon']:.6f})  {p['address']}")
