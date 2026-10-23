"""Tests for build_city_layers.py on small synthetic City-style exports (no downloaded data needed).

    python -I tools/test_city_layers.py                       # run the tests
    python -I tools/test_city_layers.py --emit <fixture dir>  # also write packed fixtures + expected.json for src/lib/contextLayers.test.ts
"""
import hashlib
import json
import os
import runpy
import struct
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
L = runpy.run_path(os.path.join(HERE, "build_city_layers.py"), run_name="build_city_layers")

# The City LiDAR 2022 tile index puts tile 481000_5456000's SW corner here: local (-10300 m, -2600 m) from CITY_ORIGIN.
CORNER = (-123.26111023690703, 49.256472053669775)
DT = (-123.1207, 49.2827)  # near Granville and Georgia


def fc(features):
    return {"type": "FeatureCollection", "features": features}


def point(lon, lat, **props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


def square(lon, lat, d, **props):
    ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d * 0.66], [lon, lat + d * 0.66], [lon, lat]]
    return {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": props}


def make_inputs(d):
    files = {}

    def dump(name, obj):
        files[name] = os.path.join(d, name)
        with open(files[name], "w", encoding="utf-8") as fh:
            json.dump(obj, fh)

    dump("trees.geojson", fc([
        point(*CORNER, common_name="RED MAPLE", genus_name="ACER", height_m=4.6),
        point(DT[0], DT[1], common_name="red maple", genus_name="ACER", height_m=7.6),
        point(DT[0] + 0.0005, DT[1], common_name="KATSURA", genus_name="CERCIDIPHYLLUM", height_m=3.0),
        point(DT[0] + 0.001, DT[1], common_name="", genus_name="PRUNUS", height_m=0.0),
        point(DT[0] + 0.0015, DT[1], common_name="ELM", genus_name="ULMUS", height_m=None),
    ]))
    dump("parcels.geojson", fc([
        square(DT[0], DT[1], 0.0004, tax_coord="11111111", civic_number="900", streetname="W GEORGIA ST"),
        square(DT[0] + 0.001, DT[1], 0.0004, tax_coord="22222222", civic_number="1000", streetname="W GEORGIA ST"),
        square(DT[0] + 0.002, DT[1], 0.0004, tax_coord="33333333", civic_number="1100", streetname="HORNBY ST"),
    ]))
    files["tax.csv"] = os.path.join(d, "tax.csv")
    with open(files["tax.csv"], "w", encoding="utf-8", newline="") as fh:
        fh.write("land_coordinate;current_land_value;current_improvement_value;tax_assessment_year;zoning_district;report_year\n")
        fh.write("11111111;1000000;500000;2026;DD;2026\n11111111;2000000;700000;2026;DD;2026\n22222222;4000000;0;2026;CD-1 (366);2026\n")
    dump("zoning.geojson", fc([square(DT[0], DT[1], 0.003, zoning_district="DD"), square(DT[0] + 0.004, DT[1], 0.002, zoning_district="CD-1 (366)")]))
    dump("heritage.geojson", fc([point(DT[0], DT[1], buildingnamespecifics="Hotel Vancouver", streetnumber="900", streetname="W GEORGIA ST",
                                       category="Building", evaluationgroup="A", municipaldesignationm="Y")]))
    dump("movement.geojson", fc([point(DT[0], DT[1], intersection="BURRARD ST AND W GEORGIA ST", url="https://app.vancouver.ca/vanmapmtc_net/#000001")]))
    dump("directional.geojson", fc([{"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[DT[0], DT[1]], [DT[0] + 0.001, DT[1] + 0.001]]},
                                     "properties": {"location": "900 W GEORGIA ST"}}]))
    return files


def decode_trees(buf):
    magic, n = struct.unpack_from("<4sI", buf, 0)
    assert magic == b"TST1"
    p, out, x, y = 8, [], 0, 0

    def varint():
        nonlocal p
        v, s = 0, 0
        while True:
            b = buf[p]; p += 1; v |= (b & 0x7F) << s; s += 7
            if not b & 0x80:
                return v

    for _ in range(n):
        x += (lambda v: (v >> 1) ^ -(v & 1))(varint())
        y += (lambda v: (v >> 1) ^ -(v & 1))(varint())
        hc = buf[p]; p += 1
        out.append({"x": x / 10, "y": y / 10, "feet": (hc & 0x7F) or None, "isClass": bool(hc & 0x80), "name": varint()})
    assert p == len(buf)
    return out


class PackerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.inp = make_inputs(cls.tmp.name)
        cls.out = os.path.join(cls.tmp.name, "out")
        args = ("2026-10-22", "https://opendata.vancouver.ca/(synthetic test)")
        L["pack_trees"](cls.out, *args, cls.inp["trees.geojson"])
        L["pack_parcels"](cls.out, *args, cls.inp["parcels.geojson"], cls.inp["tax.csv"])
        L["pack_zoning"](cls.out, *args, cls.inp["zoning.geojson"])
        L["pack_heritage"](cls.out, *args, cls.inp["heritage.geojson"])
        L["pack_traffic"](cls.out, *args, cls.inp["movement.geojson"], cls.inp["directional.geojson"])
        with open(os.path.join(cls.out, "layers.json"), encoding="utf-8") as fh:
            cls.man = {l["id"]: l for l in json.load(fh)["layers"]}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def read(self, name):
        with open(os.path.join(self.out, name), "rb") as fh:
            return fh.read()

    def test_projection_matches_city_grid(self):
        trees = decode_trees(self.read("trees.bin"))
        corner = min(trees, key=lambda t: t["x"])
        self.assertAlmostEqual(corner["x"], -10300.0, delta=0.1)
        self.assertAlmostEqual(corner["y"], -2600.0, delta=0.1)

    def test_tree_heights_are_never_invented(self):
        trees = decode_trees(self.read("trees.bin"))
        names = json.loads(self.read("trees.json"))["names"]
        by = {names[t["name"]]: t for t in trees}
        self.assertEqual(len(trees), 5)
        self.assertEqual((by["Katsura"]["feet"], by["Katsura"]["isClass"]), (10, False))  # 3.0 m recorded, kept to the foot
        self.assertEqual((by["Elm"]["feet"], by["Elm"]["isClass"]), (None, False))
        self.assertEqual((by["Prunus"]["feet"], by["Prunus"]["isClass"]), (None, False))  # 0.0 m means no height
        maples = [t for t in trees if names[t["name"]] == "Red Maple"]
        self.assertEqual(sorted(t["feet"] for t in maples), [15, 25])  # City classes stay exact in whole feet
        self.assertTrue(all(t["isClass"] for t in maples))
        self.assertEqual(self.man["trees"]["processing"]["height_unknown"], 2)

    def test_land_value_sums_folios_and_leaves_gaps_empty(self):
        attrs = json.loads(self.read("parcels.json"))
        rows = {r[0]: r for r in attrs["rows"]}
        self.assertEqual(rows["900"][2:4], [3000, 1200])   # two strata folios summed, in thousands of dollars
        self.assertEqual(rows["900"][5], 2)
        self.assertEqual(attrs["zoning"][rows["900"][4]], "DD")
        self.assertEqual(rows["1100"][2], None)            # no tax row: no land value
        self.assertEqual(len(attrs["breaks"]), 4)
        self.assertEqual(attrs["breaks"], sorted(attrs["breaks"]))
        self.assertEqual(struct.unpack_from("<4sI", self.read("parcels.bin"), 0), (b"TSF1", 3))

    def test_manifest_cites_and_checks_every_file(self):
        for lid in ("trees", "parcels", "zoning", "heritage", "traffic"):
            e = self.man[lid]
            self.assertTrue(e["lazy"])
            self.assertEqual(e["licence"]["name"], "Open Government Licence - Vancouver")
            self.assertEqual(e["crs"]["horizontal"], "EPSG:26910")
            self.assertTrue(e["source"]["url"].startswith("https://opendata.vancouver.ca/"))
            self.assertRegex(e["source"]["retrieved"], r"^\d{4}-\d{2}-\d{2}$")
            for f in e["files"]:
                self.assertEqual(hashlib.sha256(self.read(f["file"])).hexdigest(), f["sha256"])
        self.assertIn("false_assumptions", self.man["traffic"])

    def test_traffic_and_heritage_keep_links_and_designations(self):
        t = json.loads(self.read("traffic.json"))
        self.assertEqual(t["intersections"][0][3], "https://app.vancouver.ca/vanmapmtc_net/#000001")
        self.assertEqual(len(t["segments"][0][1]), 4)
        h = json.loads(self.read("heritage.json"))["rows"][0]
        self.assertEqual((h[2], h[5], h[6]), ("Hotel Vancouver", "A", ["municipaldesignationm"]))


def emit(dest):
    """Pack the synthetic inputs into dest and write expected.json, decoded independently here."""
    with tempfile.TemporaryDirectory() as d:
        inp = make_inputs(d)
        args = ("2026-10-22", "https://opendata.vancouver.ca/(synthetic test fixture)")
        os.makedirs(dest, exist_ok=True)
        L["pack_trees"](dest, *args, inp["trees.geojson"])
        L["pack_parcels"](dest, *args, inp["parcels.geojson"], inp["tax.csv"])
        with open(os.path.join(dest, "trees.bin"), "rb") as fh:
            trees = decode_trees(fh.read())
        expected = {"trees": trees, "parcel_count": 3}
        with open(os.path.join(dest, "expected.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(expected, fh, indent=1)
        os.remove(os.path.join(dest, "layers.json"))
    print("fixtures written to", dest)


if __name__ == "__main__":
    if "--emit" in sys.argv:
        emit(sys.argv[sys.argv.index("--emit") + 1])
        sys.argv = sys.argv[:1]
    unittest.main(argv=sys.argv[:1], verbosity=2)
