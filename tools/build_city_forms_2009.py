"""Fill the Real Vancouver ring outside the City LiDAR 2022 core with the City's 2009 building heights.
Run with the context-data venv:
    python -I tools/build_city_forms_2009.py <building-footprints-2009.geojson> <retrieved> <request URL>
        [<2009 ring.geojson> <2015 ring.geojson> <ring request URLs>] ...   (one triple per ring area)

The optional ring outside the downtown footprint box (Ruijie, 27 Oct): the area of the 24 City view cones ("covers
everything that is covered by the view cone"), then the gaps between them up to the convex hull of the cones and the box
("think about the continuity of the buildings"). It has no app base outlines, so its 2015 outlines travel in this layer
(`outlines`): the same rules apply, and an outline with no 2009 element stays "height unknown" (a placeholder when nothing
of 2009 covers it). All ring areas are matched in one pass, so a building across the seam between two areas pairs up.

Source: City of Vancouver "Building footprints 2009" (generated from 2009 LiDAR; top and base elevations, geodetic; "approximate,
not updated"). Rules (Ruijie, 27 Oct):
  - only 2015 footprints with no 2022 LiDAR height and not fully inside the 2022 mosaic are candidates;
  - a 2009 element is kept when at least half of it lies on candidate 2015 footprints (so buildings gone by 2015 drop out)
    and it does not overlap the 2022 roof forms; it is drawn from its base elevation (ground) to base + average height
    (roof, display) with its top elevation as the maximum (cone and view tests);
  - a 2015 footprint at least half covered by kept 2009 elements is replaced by them;
  - a 2015 footprint with (almost) no 2009 element is listed as a display-only placeholder: no height exists for it, so the
    app draws a hatched block of PLACEHOLDER_M, labelled, and leaves it out of every calculation.
Writes public/data/building_forms_2009.json and its layers.json entry. Nothing is invented: heights are the City's 2009 values.
"""
from pathlib import Path
import hashlib, json, struct, sys
import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import Polygon, box, shape
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'public/data'
ORIGIN = (491300, 5458600)
PLACEHOLDER_M = 3.0  # Ruijie, 27 Oct: most placeholders are garages and laneway houses (was 6 m)
to_utm = Transformer.from_crs('EPSG:4617', 'EPSG:3157', always_xy=True)  # pure projection (City's EPSG:26910 numbers)


def footprints():
    """The 2015 footprints in app order, local metres (same decoder as build_city_forms.py)."""
    b = (OUT / 'footprints_downtown.bin').read_bytes()
    magic, n, ox, oy, q, _ = struct.unpack_from('<4sIiifI', b); assert magic == b'TSF1'
    pos = 24

    def var():
        nonlocal pos
        value = shift = 0
        while True:
            v = b[pos]; pos += 1; value |= (v & 127) << shift; shift += 7
            if not v & 128: return value

    def zz():
        v = var(); return (v >> 1) ^ -(v & 1)
    rows = []; fx = fy = 0
    for _ in range(n):
        zz(); head = var(); sizes = [head >> 1]
        if head & 1: sizes += [var() for _ in range(var())]
        rings = []; x, y = fx, fy
        for ri, size in enumerate(sizes):
            ring = []
            for k in range(size):
                x += zz(); y += zz()
                if ri == 0 and k == 0: fx, fy = x, y
                ring.append((x * q + ox - ORIGIN[0], y * q + oy - ORIGIN[1]))
            rings.append(ring)
        rows.append(shapely.make_valid(Polygon(rings[0], rings[1:])))
    assert pos == len(b)
    return rows


def local_poly(geom):
    g = shape(geom)
    for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
        tr = lambda ring: [(lambda x, y: (x - ORIGIN[0], y - ORIGIN[1]))(*to_utm.transform(*c[:2])) for c in ring.coords]
        yield orient(Polygon(tr(p.exterior), [tr(h) for h in p.interiors]).simplify(0.2, preserve_topology=True), 1.0)


def ring(r): return [[round(x, 2), round(y, 2)] for x, y in list(r.coords)[:-1]]


def element(f):
    """(polygon parts, base, display roof, top) of a 2009 element, or None without a usable height."""
    p = f['properties']
    base, top, avg = p.get('baseelev_m'), p.get('topelev_m'), p.get('avght_m')
    if base is None or top is None or top - base < 2:
        return None
    roof = base + (avg if avg is not None and 0 < avg <= top - base else top - base)
    return [e for e in local_poly(f['geometry']) if e.area >= 4 and e.is_valid], base, max(roof, base + 2), top


def covered(polys, tree):
    """Share of each polygon covered by the geometries in tree."""
    return [sum(F.intersection(tree.geometries[k]).area for k in tree.query(F, predicate='intersects')) / max(F.area, 1e-9) for F in polys]


def cone_ring(srcs09, srcs15):
    """2009 elements standing on 2015 outlines in the view-cone ring, plus the ring outlines left without a height."""
    outlines, ids = [], []
    for f in [f for s in srcs15 for f in json.loads(Path(s).read_text(encoding='utf-8'))['features']]:
        for F in local_poly(f['geometry']):
            if F.is_valid and F.area >= 4:
                outlines.append(F); ids.append(int(f['properties'].get('object_id') or 0))
    tree15 = shapely.STRtree(outlines)
    kept, dropped = [], 0
    for f in [f for s in srcs09 for f in json.loads(Path(s).read_text(encoding='utf-8'))['features']]:
        el = element(f)
        if not el: continue
        parts, base, roof, top = el
        for e in parts:
            if sum(e.intersection(tree15.geometries[k]).area for k in tree15.query(e, predicate='intersects')) >= 0.5 * e.area:
                kept.append((e, base, roof, top))
            else:
                dropped += 1
    cover = covered(outlines, shapely.STRtree([k[0] for k in kept]))
    left = [(F, ids[i], c < 0.05) for i, (F, c) in enumerate(zip(outlines, cover)) if c < 0.5]
    return kept, left, {'ring_2009_elements_kept': len(kept), 'ring_2009_elements_not_on_a_2015_outline': dropped, 'ring_2015_outlines': len(outlines),
                        'ring_outlines_replaced': len(outlines) - len(left), 'ring_outlines_left_unknown': len(left),
                        'ring_placeholders': sum(1 for _, _, p in left if p)}


MIN_PART_M2 = 4.0


def solid(g):
    """Polygon parts of a geometry, each at least MIN_PART_M2."""
    g = shapely.make_valid(g)
    ps = [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']
    return [orient(p, 1.0) for p in ps if p.area >= MIN_PART_M2]


def settle(items, above):
    """
    One building, one representation (Ruijie, 28 Oct): each item is checked against everything ranked above it
    (`above`, a list of polygons) and against the items of its own rank already settled (larger first). It is dropped
    when it overlaps one of them by at least half of the smaller footprint; otherwise the overlapping area is cut away
    and parts under MIN_PART_M2 go. Returns, per item in input order, None (dropped) or its list of polygon parts.
    """
    tree_above = shapely.STRtree(above) if above else None
    order = sorted(range(len(items)), key=lambda i: -items[i].area)
    tree_own = shapely.STRtree(items)
    rank = {i: k for k, i in enumerate(order)}
    out = [None] * len(items)
    for i in order:
        g = items[i]
        blockers = [above[k] for k in tree_above.query(g, predicate='intersects')] if tree_above else []
        blockers += [p for j in tree_own.query(g, predicate='intersects') if rank[int(j)] < rank[i] and out[int(j)] for p in out[int(j)]]
        if any(g.intersection(b).area >= 0.5 * min(g.area, b.area) for b in blockers):
            continue
        rest = g.difference(shapely.union_all(blockers)) if blockers else g
        parts = solid(rest)
        out[i] = parts or None
    return out


def main(src, retrieved, request, *areas):
    # areas: (2009 geojson, 2015 geojson, request) triples, matched in one pass so buildings across a seam pair up.
    ring09, ring15, ring_requests = list(areas[0::3]), list(areas[1::3]), list(areas[2::3])
    fps = footprints()
    f22 = json.loads((OUT / 'building_forms.json').read_text(encoding='utf-8'))
    old = np.frombuffer((OUT / 'footprint_heights.bin').read_bytes(), dtype=[('g', '<i2'), ('r', '<i2'), ('m', '<i2'), ('n', '<u2')], offset=8)
    measured = (old['g'] != -32768) & (old['r'] != -32768) & (old['r'] > old['g'])
    replaced22 = set(f22['replace'])
    x0, y0, x1, y1 = f22['stats']['coverage_local']
    core = box(x0, y0, x1, y1)
    cand = [i for i, p in enumerate(fps) if i not in replaced22 and not measured[i] and not core.contains(p)]
    cand_tree = shapely.STRtree([fps[i] for i in cand])

    feats = json.loads(Path(src).read_text(encoding='utf-8'))['features']
    kept, skipped = [], {'too_small': 0, 'not_on_a_2015_candidate': 0, 'no_height': 0}
    for f in feats:
        p = f['properties']
        base, top, avg = p.get('baseelev_m'), p.get('topelev_m'), p.get('avght_m')
        if base is None or top is None or top - base < 2:
            skipped['no_height' if base is None or top is None else 'too_small'] += 1; continue
        for e in local_poly(f['geometry']):
            if e.area < 4 or not e.is_valid: skipped['too_small'] += 1; continue
            on = sum(e.intersection(cand_tree.geometries[k]).area for k in cand_tree.query(e, predicate='intersects'))
            if on < 0.5 * e.area: skipped['not_on_a_2015_candidate'] += 1; continue
            roof = base + (avg if avg is not None and 0 < avg <= top - base else top - base)
            kept.append((e, base, max(roof, base + 2), top, p))
    kept_tree = shapely.STRtree([k[0] for k in kept])
    replace, placeholders, partial = [], [], 0
    for i in cand:
        F = fps[i]
        cover = sum(F.intersection(kept_tree.geometries[k]).area for k in kept_tree.query(F, predicate='intersects')) / max(F.area, 1e-9)
        if cover >= 0.5: replace.append(i)
        elif cover < 0.05: placeholders.append(i)
        else: partial += 1
    ring_kept, left, ring_stats = (cone_ring(ring09, ring15) if ring09 and len(ring09) == len(ring15) else ([], [], {}))

    # ---- one building, one representation (settle): LiDAR 2022 parts > 2015 blocks with 2022 heights > 2009 > outlines ----
    forms22_polys = [shapely.make_valid(Polygon(f['outer'], f['holes'])) for f in f22['forms']]
    lod1 = [i for i in range(len(fps)) if i not in replaced22 and measured[i]]
    lod1_out = settle([fps[i] for i in lod1], forms22_polys)
    above09 = forms22_polys + [p for ps in lod1_out if ps for p in ps]
    all09 = [(e, base, roof, top) for e, base, roof, top, _ in kept] + list(ring_kept)
    out09 = settle([k[0] for k in all09], above09)
    measured_all = above09 + [p for ps in out09 if ps for p in ps]
    base_unknown = [i for i in range(len(fps)) if i not in replaced22 and i not in set(replace) and not measured[i]]
    base_out = settle([fps[i] for i in base_unknown], measured_all)
    ring_out = settle([F for F, _, _ in left], measured_all)

    def changed(orig, parts): return parts is not None and abs(sum(p.area for p in parts) - orig.area) > 0.5
    placeholder_set = set(placeholders)
    dropped = [i for i, ps in zip(lod1, lod1_out) if ps is None] + [i for i, ps in zip(base_unknown, base_out) if ps is None]
    repairs = [{'index': i, 'parts': [{'outer': ring(q.exterior), 'holes': [ring(h) for h in q.interiors]} for q in ps]}
               for idx, out_ in ((lod1, lod1_out), (base_unknown, base_out)) for i, ps in zip(idx, out_) if changed(fps[i], ps)]
    replace = sorted(set(replace) | set(dropped))
    placeholders = [i for i, ps in zip(base_unknown, base_out) if ps is not None and i in placeholder_set]
    forms = []
    for (e, base, roof, top), ps in zip(all09, out09):
        for q in ps or []:
            # Ids from -1,000,001 down, so the app can tell a 2009 part from a 2022 LiDAR part (-1, -2, ...).
            forms.append(dict(id=-(1_000_000 + len(forms) + 1), outer=ring(q.exterior), holes=[ring(h) for h in q.interiors],
                              ground=round(base, 2), roof=round(roof, 2), max=round(top, 2), points=0))
    outlines, outline_placeholders = [], []
    for (F, oid, placeholder), ps in zip(left, ring_out):
        for q in ps or []:
            if placeholder: outline_placeholders.append(len(outlines))
            outlines.append({'id': oid, 'outer': ring(q.exterior), 'holes': [ring(h) for h in q.interiors]})
    settled = {'rule': 'One building, one representation: LiDAR 2022 parts > 2015 blocks with 2022 heights > City 2009 parts (larger first) > '
                       '2015 outlines and placeholders. An item overlapping a higher-ranked one by at least half of the smaller footprint is '
                       f'dropped; otherwise the overlap is cut away and parts under {MIN_PART_M2:g} m2 go.',
               'lod1_2015_dropped': sum(1 for ps in lod1_out if ps is None), 'lod1_2015_clipped': sum(1 for i, ps in zip(lod1, lod1_out) if changed(fps[i], ps)),
               'parts_2009_dropped': sum(1 for ps in out09 if ps is None), 'parts_2009_clipped': sum(1 for k, ps in zip(all09, out09) if changed(k[0], ps)),
               'outlines_dropped': sum(1 for ps in base_out if ps is None) + sum(1 for ps in ring_out if ps is None),
               'outlines_clipped': sum(1 for i, ps in zip(base_unknown, base_out) if changed(fps[i], ps)) + sum(1 for (F, _, _), ps in zip(left, ring_out) if changed(F, ps))}
    stats = {'source_elements': len(feats), 'forms': len(forms), 'skipped': skipped, 'candidate_2015_outlines': len(cand),
             'replaced_2015_outlines': len(replace), 'partly_covered_left_as_outlines': partial, 'placeholders': len(placeholders),
             'placeholder_height_m': PLACEHOLDER_M, **ring_stats, 'settled': settled,
             'core_check': {'note': 'In the 2022 core (scratchpad check, 27 Oct): 2009 base elevation minus 2022 ground 3 m outside, '
                            'median -0.56 m (n 3,189); 2009 top minus 2022 roof max for elements over 40 m, median -2.57 m (n 732). '
                            'No datum-sized offset; not an accuracy statement.'}}
    data = {'version': 1, 'origin': list(ORIGIN), 'vintage': 2009, 'baseCount': len(fps),
            'baseSha256': hashlib.sha256((OUT / 'footprints_downtown.bin').read_bytes()).hexdigest(),
            'tile': 'Building footprints 2009', 'replace': sorted(replace), 'repairs': repairs, 'forms': forms,
            'placeholders': sorted(placeholders), 'placeholderHeight': PLACEHOLDER_M,
            'outlines': outlines, 'outlinePlaceholders': outline_placeholders, 'stats': stats}
    payload = json.dumps(data, separators=(',', ':'), allow_nan=False).encode()
    (OUT / 'building_forms_2009.json').write_bytes(payload)
    src_sha = hashlib.sha256(b''.join(Path(f).read_bytes() for f in [src, *ring09, *ring15])).hexdigest()
    entry = {'id': 'building_forms_2009', 'title': 'City building heights 2009 (outside the 2022 LiDAR core, across the view cones)', 'file': 'building_forms_2009.json',
             'format': 'JSON, local metres east/north from CITY_ORIGIN (same layout as building_forms.json, plus placeholders and the view-cone ring outlines)',
             'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(), 'lazy': True, 'count': len(forms),
             'source': {'name': 'Building footprints 2009', 'publisher': 'City of Vancouver',
                        'url': 'https://opendata.vancouver.ca/explore/dataset/building-footprints-2009/',
                        'request': [request, *ring_requests],
                        'retrieved': retrieved, 'sha256': src_sha,
                        'note': "Generated by the City from 2009 LiDAR; 'approximate', 'not being updated' (City metadata). Used only outside the 2022 LiDAR core, where a 2015 footprint still stands on it: the downtown box and the area of the 24 view cones."},
             **({'second_source': {'name': 'Building footprints 2015 (view-cone ring outlines)', 'publisher': 'City of Vancouver',
                                   'url': 'https://opendata.vancouver.ca/explore/dataset/building-footprints-2015/', 'retrieved': retrieved,
                                   'note': 'Decides which 2009 buildings still stood in 2015; outlines with no 2009 height stay unknown.'}} if ring09 else {}),
             'licence': {'name': 'Open Government Licence - Vancouver', 'url': 'https://opendata.vancouver.ca/pages/licence/'},
             'attribution': 'Contains information licensed under the Open Government Licence - Vancouver (Building footprints 2009).',
             'crs': {'horizontal': 'EPSG:26910', 'origin': list(ORIGIN), 'note': "City lon/lat projected with GRS80 UTM 10N, no datum shift (the City's EPSG:26910 numbers)."},
             'datum': {'vertical': 'Geodetic, as published (assumed CGVD28)',
                       'unverified': ['The 2009 metadata says "geodetic" without naming the datum; the comparison with 2022 LiDAR in the core shows no datum-sized offset (median -0.56 m at the base).']},
             'processing': {'script': 'tools/build_city_forms_2009.py', **stats}, 'flag': 'unverified'}
    m = json.loads((OUT / 'layers.json').read_text(encoding='utf-8'))
    m['layers'] = sorted([l for l in m['layers'] if l['id'] != entry['id']] + [entry], key=lambda l: l['id'])
    with open(OUT / 'layers.json', 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(json.dumps(m, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({**stats, 'bytes': len(payload)}, indent=1))


if __name__ == '__main__':
    main(*sys.argv[1:])
