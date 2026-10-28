"""Tests for the "one building, one representation" rule in build_city_forms_2009.py (settle), on synthetic squares, and a
check of the published layers: no drawn building overlaps another by half of the smaller footprint.

    python -I tools/test_city_forms_2009.py
"""
import json
import os
import runpy
import struct
import unittest

import numpy as np
import shapely
from shapely.geometry import Polygon, box

HERE = os.path.dirname(os.path.abspath(__file__))
M = runpy.run_path(os.path.join(HERE, "build_city_forms_2009.py"), run_name="build_city_forms_2009")
settle = M["settle"]
DATA = os.path.join(HERE, "..", "public", "data")


def sq(x, y, s):
    return box(x, y, x + s, y + s)


class SettleRule(unittest.TestCase):
    def test_dropped_when_half_of_the_smaller_footprint_is_covered(self):
        above = [sq(0, 0, 10)]                       # a measured 10 x 10 m building
        out = settle([sq(5, 0, 10)], above)          # overlaps 50 m2 = half of the smaller (100 m2)
        self.assertEqual(out, [None])

    def test_small_overlap_is_cut_away_not_drawn_twice(self):
        above = [sq(0, 0, 10)]
        out = settle([sq(8, 0, 10)], above)          # overlaps 20 m2 (20% of the smaller): kept, overlap removed
        self.assertIsNotNone(out[0])
        self.assertAlmostEqual(sum(p.area for p in out[0]), 80.0, places=6)
        self.assertLess(sum(p.intersection(above[0]).area for p in out[0]), 1e-9)

    def test_a_small_item_inside_a_large_one_is_dropped_even_if_little_of_the_large_one_is_covered(self):
        out = settle([sq(2, 2, 3)], [sq(0, 0, 20)])  # 9 m2 garage-sized item fully inside: 100% of the smaller
        self.assertEqual(out, [None])

    def test_same_rank_larger_first(self):
        big, small = sq(0, 0, 20), sq(19, 0, 5)      # 5 m2 overlap: < half of the smaller (25 m2)
        out = settle([small, big], [])
        self.assertAlmostEqual(sum(p.area for p in out[1]), 400.0, places=6)   # the larger one stays whole
        self.assertAlmostEqual(sum(p.area for p in out[0]), 20.0, places=6)    # the smaller one loses the overlap

    def test_slivers_under_four_square_metres_go(self):
        out = settle([sq(9.7, 0, 10)], [sq(0, 0, 10)])  # 3 m2 overlap; 97 m2 left
        self.assertTrue(all(p.area >= 4 for p in out[0]))
        out = settle([box(9, 0, 12, 1)], [sq(0, 0, 10)])  # 3 m2 item, 1 m2 under the building: 2 m2 left -> dropped
        self.assertEqual(out, [None])


def tsf1(path):
    b = open(path, "rb").read()
    magic, n, ox, oy, q, _ = struct.unpack_from("<4sIiifI", b)
    pos = 24

    def var():
        nonlocal pos
        v = s = 0
        while True:
            c = b[pos]; pos += 1; v |= (c & 127) << s; s += 7
            if not c & 128:
                return v

    def zz():
        v = var(); return (v >> 1) ^ -(v & 1)
    out, fx, fy = [], 0, 0
    for _ in range(n):
        zz(); head = var(); sizes = [head >> 1]
        if head & 1:
            sizes += [var() for _ in range(var())]
        rings, x, y = [], fx, fy
        for ri, size in enumerate(sizes):
            ring = []
            for k in range(size):
                x += zz(); y += zz()
                if ri == 0 and k == 0:
                    fx, fy = x, y
                ring.append((x * q + ox - 491300, y * q + oy - 5458600))
            rings.append(ring)
        out.append(shapely.make_valid(Polygon(rings[0], rings[1:])))
    return out


@unittest.skipUnless(os.path.exists(os.path.join(DATA, "building_forms_2009.json")), "published layers not built")
class PublishedLayers(unittest.TestCase):
    def test_no_building_is_drawn_twice(self):
        """Mirror of the app's merge (cityGeometry.applyBuildingForms): every drawn footprint, measured or not."""
        poly = lambda f: shapely.make_valid(Polygon(f["outer"], f["holes"]))
        f22 = json.load(open(os.path.join(DATA, "building_forms.json"), encoding="utf-8"))
        f09 = json.load(open(os.path.join(DATA, "building_forms_2009.json"), encoding="utf-8"))
        base = tsf1(os.path.join(DATA, "footprints_downtown.bin"))
        replaced = set(f22["replace"]) | set(f09["replace"])
        repairs = {r["index"]: r["parts"] for r in f22.get("repairs", []) + f09.get("repairs", [])}
        drawn = [poly(f) for f in f22["forms"] + f09["forms"]] + [poly(o) for o in f09.get("outlines", [])]
        for i, p in enumerate(base):
            if i not in replaced:
                drawn += [poly(q) for q in repairs[i]] if i in repairs else [p]
        tree = shapely.STRtree(drawn)
        a, b = tree.query(drawn, predicate="intersects")
        half, area = 0, 0.0
        for i, j in zip(a, b):
            if i < j:
                o = drawn[i].intersection(drawn[j]).area
                area += o
                half += o >= 0.5 * min(drawn[i].area, drawn[j].area) and o > 1
        self.assertEqual(half, 0)
        self.assertLess(area, 50.0)  # numerical slivers only (published rings are rounded to 1 cm)


if __name__ == "__main__":
    unittest.main(verbosity=2)
