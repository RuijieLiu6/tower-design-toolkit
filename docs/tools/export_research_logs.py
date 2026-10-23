"""Export workflow journals (one JSON result per agent) into readable research logs.

Usage: python export_research_logs.py <journal.jsonl> <run_name> <out_dir>
Writes <out_dir>/<run_name>/<packet>/<label>.json for every agent result,
plus a <packet>/LOG.md listing rounds, gate results and false assumptions.
"""
import json, os, sys, collections

journal, run, out = sys.argv[1], sys.argv[2], sys.argv[3]
labels, results, failed = {}, {}, set()
for line in open(journal, encoding="utf-8"):
    try:
        e = json.loads(line)
    except json.JSONDecodeError:
        continue
    if e.get("type") == "started":
        labels[e["key"]] = e.get("label", e["key"][:12])
    elif e.get("type") == "result":
        results[e["key"]] = e.get("result")
    elif e.get("type") == "failed":
        failed.add(e["key"])

by_packet = collections.defaultdict(list)
for key, res in results.items():
    label = labels.get(key, key[:12])
    packet = label.split(":")[-1] if ":" in label else "_run"
    by_packet[packet].append((label, res))

order = lambda l: (["research", "critic-r1", "revise-r1", "critic-r2", "revise-r2", "critic-r3", "revise-r3",
                    "critic-r4", "revise-r4", "gap1", "gap2"] + [l]).index(l.split(":")[0]) if l.split(":")[0] in \
                   ["research", "critic-r1", "revise-r1", "critic-r2", "revise-r2", "critic-r3", "revise-r3",
                    "critic-r4", "revise-r4", "gap1", "gap2"] else 99

for packet, items in by_packet.items():
    d = os.path.join(out, run, packet)
    os.makedirs(d, exist_ok=True)
    items.sort(key=lambda t: order(t[0]))
    md = [f"# {run} / {packet}: research log", ""]
    for label, res in items:
        name = label.replace(":", "_")
        with open(os.path.join(d, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
        kind = label.split(":")[0]
        if isinstance(res, dict) and "gate" in res:
            g = res.get("gate") or {}
            md.append(f"## {kind}: {res.get('expert_role', '')}")
            md.append(f"- Gate pass: **{g.get('pass')}**")
            for c in g.get("conditions", []):
                md.append(f"  - condition: {c}")
            for fa in res.get("false_assumptions", []):
                md.append(f"- <span style='color:#d4148c'>**FALSE ASSUMPTION**</span>: {fa.get('claim')} → {fa.get('correction')}")
            sev = collections.Counter(x.get("severity") for x in res.get("findings", []))
            md.append(f"- Findings: {dict(sev)}")
            md.append(f"- Verdict: {res.get('verdict', '')}")
        else:
            md.append(f"## {kind}: draft saved as `{name}.json`")
            if isinstance(res, dict):
                cl = res.get("change_log") or []
                for c in cl[:12]:
                    md.append(f"  - {c}")
        md.append("")
    with open(os.path.join(d, "LOG.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))

print(f"{run}: {len(results)} results, {len(failed)} failed attempts, packets: {sorted(by_packet)}")
