"""Build src/data/solarSpaces.json: Table-1 protected spaces of the Downtown Peninsula Solar Access Guidelines
(City of Vancouver, July 2026, pp. 5-8) with property-line polygons from the City's "Parks polygon representation"
open data (Open Government Licence - Vancouver), in the app's Real Vancouver frame (EPSG:26910 minus CITY_ORIGIN).

Run with the context-data venv:  python -I tools/build_solar_spaces.py <parks.geojson> <out.json>

The Table-1 class always comes from the guideline, never from the Park Board classification (research P02-M02).
Projection: EPSG:4617 -> EPSG:3157 (pure UTM 10N), which gives the City's own EPSG:26910 numbers; EPSG:4617 ->
EPSG:26910 would add a 1.28 m datum shift (see the context-data pipeline notes).
"""
import hashlib
import json
import sys
from datetime import date

from pyproj import Transformer

CITY_ORIGIN = (491300.0, 5458600.0)

# Table 1 (pp. 5-8): name, class, section-4 note, name in the parks dataset (None = no polygon there).
TABLE_1 = [
    ("300 Helmcken Plaza", "Urban Plaza", None, None),
    ("Alexandra Park", "Local", None, "Alexandra Park"),
    ("Andy Livingstone Park", "Community", None, "Andy Livingstone Park"),
    ("Art Phillips Park", "Urban Plaza", None, "Art Phillips Park"),
    ("Barclay Heritage Square", "Neighbourhood", None, "Barclay Heritage Square"),
    ("Bill Curtis Square", "Urban Plaza", None, None),
    ("Blood Alley Square", "Urban Plaza", None, None),
    ("Broughton St. at Nelson St. Minipark", "West End Minipark", None, "West End minipark - BROUGHTON ST @ NELSON ST"),
    ("Bute St. at Haro St. Minipark", "West End Minipark", None, "West End minipark - BUTE ST @ HARO ST"),
    ("Bute-Robson Plaza", "Urban Plaza", None, None),
    ("Cardero Park", "Local", None, "Cardero Park"),
    ("Cardero St. at Burnaby St. Minipark", "West End Minipark", None, "West End minipark - CARDERO ST @ BURNABY ST"),
    ("Cardero St. at Comox St. Minipark", "West End Minipark", None, "West End minipark - CARDERO ST @ COMOX ST"),
    ("Cathedral Square", "Urban Plaza", None, "Cathedral Square"),
    ("Chilco St. at Comox St. Minipark", "West End Minipark", None, "West End minipark - CHILCO ST @ COMOX ST"),
    ("Chinatown Memorial Square", "Urban Plaza", None, None),
    ("Coal Harbour Park", "Neighbourhood", None, "Coal Harbour Park"),
    ("Coopers' Park", "Community", None, "Coopers' Park"),
    ("CRAB Park at Portside", "Community", None, "CRAB Park at Portside"),
    ("Creekside Park", "Neighbourhood", None, "Creekside Park"),
    ("David Lam Park", "Community", None, "David Lam Park"),
    ("Devonian Harbour Park", "Neighbourhood", None, "Devonian Harbour Park"),
    ("Dilawri Square North", "Urban Plaza", None, None),
    ("Dilawri Square South", "Urban Plaza", "4.2", None),
    ("Downtown Skateboard Plaza", "Urban Plaza", None, "Downtown Skateboard Plaza"),
    ("Dr. Sun Yat-Sen Classical Chinese Gardens and Dr. Sun Yat-Sen Park", "Local", "4.1", "Sun Yat-sen Gardens Park"),
    ("Elsie Roy Elementary", "School Site", None, None),
    ("Emery Barnes Park", "Neighbourhood", None, "Emery Barnes Park"),
    ("English Bay Beach Park", "Community", None, "English Bay Beach Park"),
    ("George Wainborn Park", "Neighbourhood", None, "George Wainborn Park"),
    ("Gilford St. at Haro St. Minipark", "West End Minipark", None, "West End minipark - GILFORD ST @ HARO ST"),
    ("Harbour Green Park", "Community", None, "Harbour Green Park"),
    ("Helmcken Park", "Urban Plaza", None, "Helmcken Park"),
    ("Jack Poole Plaza", "Urban Plaza", "4.2", None),
    ("Jervis St. at Burnaby St. Minipark", "West End Minipark", None, "West End minipark - JERVIS ST @ BURNABY ST"),
    ("Jervis St. Park Site at Pacific St.", "Local", None, "Park Site on Jervis St. @ Pacific St"),
    ("Jim Deva Plaza", "Urban Plaza", None, None),
    ("King George Secondary", "School Site", None, None),
    ("Lord Roberts Annex", "School Site", None, None),
    ("Lord Roberts Elementary", "School Site", None, None),
    ("Lot 19 (Hornby St. at Hastings St. Plaza)", "Urban Plaza", None, None),
    ("Marina Square", "Neighbourhood", None, "Marina Square"),
    ("May & Lorne Brown Park", "Local", None, "May & Lorne Brown Park"),
    ("Morton Park", "Local", None, "Morton Park"),
    ("Nelson Park", "Community", None, "Nelson Park"),
    ("Nicola St. at Pendrell St. Minipark", "West End Minipark", None, "West End minipark - NICOLA ST @ PENDRELL ST"),
    ("Pioneer Place (Pigeon Park)", "Urban Plaza", None, "Pioneer Place (Pigeon Park)"),
    ("Portal Park", "Urban Plaza", None, "Portal Park"),
    ("Robson Square", "Urban Plaza", "4.2", None),
    ("Roundhouse Turntable Park", "Neighbourhood", None, "Roundhouse Turntable Plaza"),
    ("Sunset Beach Park", "Community", None, "Sunset Beach Park"),
    ("šxʷƛ̓ənəq Xwtl'e7énḵ (formerly Vancouver Art Gallery North Plaza)", "Urban Plaza", None, None),
    ("šxʷƛ̓exən Xwtl'a7shn (formerly Queen Elizabeth Theatre Plaza)", "Urban Plaza", None, None),
    ("sθəqəlxenəm ts'exwts'áxwi7 (Rainbow Park)", "Neighbourhood", None, "Rainbow Park"),
    ("Thornton Park", "Neighbourhood", None, "Thornton Park"),
    ("Victory Square", "Urban Plaza", "4.3", "Victory Square"),
    ("Wendy Poole Park", "Local", None, "Wendy Poole Park"),
    ("Yaletown Park", "Urban Plaza", None, "Yaletown Park"),
]


def rings_of(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [poly[0] for poly in polys]  # outer rings only; parks here have no inner courts of note


def main(src, out):
    raw = open(src, "rb").read()
    data = json.loads(raw)
    by_name = {f["properties"]["park_name"]: f for f in data["features"]}
    tf = Transformer.from_crs("EPSG:4617", "EPSG:3157", always_xy=True)
    spaces, missing = [], []
    for name, cls, note, ds in TABLE_1:
        f = by_name.get(ds) if ds else None
        if not f:
            missing.append({"name": name, "cls": cls, **({"note": note} if note else {})})
            continue
        rings = []
        for ring in rings_of(f["geometry"]):
            pts = [tf.transform(lon, lat) for lon, lat in ring]
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            rings.append([[round(x - CITY_ORIGIN[0], 2), round(y - CITY_ORIGIN[1], 2)] for x, y in pts])
        spaces.append({
            "name": name, "cls": cls, **({"note": note} if note else {}),
            "parkName": ds, "parkClass": f["properties"].get("classification"), "rings": rings,
        })
    doc = {
        "source": "City of Vancouver open data, Parks polygon representation (GeoJSON export)",
        "url": "https://opendata.vancouver.ca/explore/dataset/parks-polygon-representation/",
        "licence": "Open Government Licence - Vancouver",
        "retrieved": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "crs": "EPSG:26910 metres minus CITY_ORIGIN (491300, 5458600); projected EPSG:4617 -> EPSG:3157",
        "table1": "Solar Access Guidelines for the Downtown Peninsula, Table 1, pp. 5-8 (July 2026)",
        "note": "Park polygons stand in for property lines (3.1.1 tests inside property lines). Table-1 class comes from the guideline, not the Park Board class.",
        "spaces": spaces,
        "missing": missing,
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(spaces)} spaces with polygons, {len(missing)} without; wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
