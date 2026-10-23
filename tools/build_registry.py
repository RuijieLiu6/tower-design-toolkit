"""Build the app's data files from the research logs and the City view-cone layer.

Usage:
    python tools/build_registry.py <research_dir> <cones_26910.json> <out_dir>

Writes:
    <out_dir>/research_registry.json  one entry per researched module (latest revision of each packet)
    <out_dir>/viewcones.json          24 City cones (EPSG:26910) with attribution
"""
import glob
import json
import os
import re
import sys

RESEARCH, CONES, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ORDER = ["revise-r4", "revise-r3", "revise-r2", "revise-r1", "research"]


def latest(packet_dirs, pk):
    for name in ORDER:
        for d in packet_dirs:
            f = os.path.join(d, pk, f"{name}_{pk}.json")
            if os.path.exists(f):
                return f, name
    return None, None


def rounds(packet_dirs, pk):
    found = {}
    for d in packet_dirs:
        for f in glob.glob(os.path.join(d, pk, "critic-r*_*.json")):
            r = int(re.search(r"critic-r(\d)", f).group(1))
            found[r] = json.load(open(f, encoding="utf-8"))
    return found


def short(s, n=320):
    s = (s or "").replace("\n", " ").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


entries = []
groups = [
    ("modules", [os.path.join(RESEARCH, "modules-completion"), os.path.join(RESEARCH, "modules")], [f"P{i:02d}" for i in range(1, 17)]),
    ("context-model", [os.path.join(RESEARCH, "context-model")], ["C01", "C02", "C03", "C04", "C05"]),
]
for run, dirs, packets in groups:
    for pk in packets:
        f, stage = latest(dirs, pk)
        if not f:
            continue
        spec = json.load(open(f, encoding="utf-8"))
        crit = rounds(dirs, pk)
        last = crit[max(crit)] if crit else {}
        fa = [fl for fl in spec.get("flags", []) if fl.get("type") == "FALSE_ASSUMPTION"]
        for m in spec.get("modules", []):
            entries.append({
                "id": m.get("module_id"),
                "packet": pk,
                "name": m.get("name"),
                # Context-model packets carry no category: C01/C04 are site tools, C02/C03/C05 are data plumbing.
                "category": (m.get("category") or ("SITE" if pk in ("C01", "C04") else "DATA")).split()[0].upper()[:4],
                "phase": m.get("phase") or "basic",
                "priority": m.get("priority") or "roadmap",
                "nature": m.get("nature") or "",
                "jury": [j.split(":")[0].strip() for j in (m.get("jury_criteria") or []) if "_" in j][:4],
                "question": short(m.get("design_question"), 260),
                "method": short(m.get("method"), 600),
                "human": short(m.get("human_judgment"), 260),
                "limits": short(m.get("limits"), 260),
                "metrics": [{"name": short(x.get("name"), 90), "unit": x.get("unit", ""), "good": short(x.get("good"), 140),
                             "bad": short(x.get("bad"), 140), "status": x.get("status", "unverified")}
                            for x in (m.get("metrics") or [])[:6]],
                # "viz" (visualization notes) is left out: the app never shows it and it kept the main bundle over 500 kB.
                "libs": [l.get("name") for l in (m.get("libraries") or [])[:5]],
                "research": {"stage": stage, "rounds": sorted(crit), "gate_pass": (last.get("gate") or {}).get("pass"),
                             "false_assumptions_in_packet": len(fa), "log": f"04 Tool Plan/research/{run}/{pk}/"},
            })

os.makedirs(OUT, exist_ok=True)
json.dump(entries, open(os.path.join(OUT, "research_registry.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

cones = json.load(open(CONES, encoding="utf-8"))
out = {"attribution": "Contains information licensed under the Open Government Licence - Vancouver (City of Vancouver ViewCone layer, retrieved 2026-10-21).",
       "crs": "EPSG:26910", "cones": []}
for f in cones["features"]:
    a = f["attributes"]
    out["cones"].append({"id": str(a["VIEW_NUMBER"]), "name": a["VIEW_CONE_NAME"], "subject": a["VIEW_SUBJECT"],
                         "Lv": a["VIEWPOINT_ELEVATION_M"], "url": a["URL"],
                         "ring": [[round(x, 2), round(y, 2)] for x, y in f["geometry"]["rings"][0]]})
json.dump(out, open(os.path.join(OUT, "viewcones.json"), "w", encoding="utf-8"), separators=(",", ":"))
print(f"registry: {len(entries)} modules; cones: {len(out['cones'])}")
