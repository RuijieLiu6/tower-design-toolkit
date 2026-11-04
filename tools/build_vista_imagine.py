"""Slim per-building zoning table for Imagine Vancouver in Tower Design Toolkit (after Vista v37, Ruijie Liu).

Vista's generated/imagine_city.json (github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e, 12.9 MB) holds, for each
of its 61,407 buildings, the whole-footprint zoning reference Vista computed from its height_policy.json, the rules
behind it, and the connected assemblies that must scale together. Tower Design Toolkit keeps only those columns, keyed by
OSM way number (the join key of public/data/vista_buildings); Vista's clipped corridor cells are not kept because the app
recomputes every cone on its own surfaces (8 City-sourced estimates, 16 Vista study surfaces) in EPSG:26910.

    python -I tools/build_vista_imagine.py <imagine_city.json> <out.json>

Output (columns aligned by row): osm (way numbers), zoningDm (basic height in decimetres, -1 none), status (0 ready,
1 no number, 2 partial, 3 invalid geometry), ruleSet (index into ruleSets), assembly (-1 or Vista's assembly id).
Buildings are OpenStreetMap-derived: (c) OpenStreetMap contributors, ODbL. Zoning: City of Vancouver, OGL-Vancouver.
"""
import hashlib
import json
import sys

STATUS = ["ready", "no number", "partial", "invalid geometry"]


def main(src, out):
    raw = open(src, "rb").read()
    sha = hashlib.sha256(raw).hexdigest()
    d = json.loads(raw.decode("utf-8"))
    if d.get("schema") != "vista-imagine-city/1":
        raise SystemExit("not a Vista imagine_city.json")
    osm, zoning_dm, status, rule_set, assembly = [], [], [], [], []
    sets, set_index = [], {}
    for asset in ("buildings", "ext_buildings"):
        a = d["assets"][asset]
        n = a["count"]
        ids = a["assemblyIds"] if a.get("assemblyIds") else [-1] * n
        for i in range(n):
            oid, h, s, rules = a["osmIds"][i], a["zoningHeights"][i], a["zoningStatus"][i], a["ruleIds"][i]
            if not oid.startswith("w") or not oid[1:].isdigit():
                raise SystemExit(f"unexpected OSM id {oid}")
            if (s == 0) != (h is not None):
                raise SystemExit(f"{oid}: status {s} with height {h}")
            key = json.dumps(rules)
            if key not in set_index:
                set_index[key] = len(sets)
                sets.append(rules)
            osm.append(int(oid[1:]))
            zoning_dm.append(-1 if h is None else round(h * 10))
            status.append(s)
            rule_set.append(set_index[key])
            assembly.append(ids[i])
    if len(set(osm)) != len(osm):
        raise SystemExit("duplicate OSM ids")
    m = d["metadata"]
    result = {
        "version": 1,
        "schema": "tower-design-toolkit-imagine-zoning/1",
        "source": {"repo": "https://github.com/RuijieLiu6/vancouver-tall-view-tool", "commit": "917b28e", "file": "generated/imagine_city.json",
                   "sha256": sha, "bytes": len(raw), "generatedDate": m.get("generatedDate"), "algorithm": m.get("algorithm"),
                   "heightPolicySha256": m.get("heightPolicySha256")},
        "attribution": "Buildings (c) OpenStreetMap contributors (ODbL), via Vista (Ruijie Liu); zoning: City of Vancouver (OGL-Vancouver), via Vista height_policy.json",
        "statusCodes": STATUS,
        "assemblyMethod": d["assemblies"].get("method"),
        "ruleSets": sets,
        "osm": osm, "zoningDm": zoning_dm, "status": status, "ruleSet": rule_set, "assembly": assembly,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"))
    ready = sum(1 for s in status if s == 0)
    print(f"{len(osm)} buildings, {ready} with a zoning number, {sum(1 for a in assembly if a >= 0)} in {len(set(a for a in assembly if a >= 0))} assemblies, {len(sets)} rule sets; source sha256 {sha}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
