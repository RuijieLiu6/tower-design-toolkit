# City of Vancouver: view cone assessment requests (DRAFTS, not sent)

**Status:** draft, prepared 21 Oct 2026. Nothing has been submitted. Ruijie submits each request personally (the form asks for your own contact details).

**Where to submit:** Van311 › *Request a property public view assessment*
<https://van311.ca/services/public-view-assessment> (linked from <https://vancouver.ca/home-property-development/protecting-public-views.aspx>).

**What the form asks for (checked 21 Oct 2026):**
1. **Location:** an address, intersection or block, or a pin on the map.
2. **View cone** (optional text).
3. **Provide details** (free text).
4. **File upload** (attach `view_cone_points.csv`).
5. **Your name, phone and email**, plus the privacy checkbox.

The City replies by email from Planning, Urban Design & Sustainability. The research found typical turnaround of 0.5 to 3 business days. That figure comes from past replies and is not a published service standard.

## Why we are asking

The City's published `ViewCone` layer gives each cone's origin and origin elevation (`VIEWPOINT_ELEVATION_M`). It also has `REFERENCE_LOCATION`, `REFERENCE_ELEVATION_M` and `REFERENCE_DISTANCE_M` fields, and **all three are empty for all 24 cones** (checked 21 Oct 2026). Without the reference point, the height of a cone's lower boundary can't be computed. Our research has calibrated or found published slopes for only some cones. Seven of the cones that cross the downtown core have none.

**Etiquette:** send **Request 0 first** and wait for the reply. If the City shares the reference values, Requests 1 to 7 become unnecessary. If it can't, send Requests 1 to 7 one at a time, starting with Request 1.

---

## Request 0: the reference values (send first)

- **Location:** 900 W Georgia St (inside cone 3.2.2; any downtown location will do)
- **View cone:** All Public Views Guidelines cones (Table 1)
- **Provide details:**

> Hello. I am a UBC Master of Architecture student (SALA, ARCH 540) building an open-source study tool that helps students and early-stage designers understand Vancouver's protected public views. It is clearly labelled as an estimate, never a substitute for your assessment.
>
> The City's ViewCone feature layer (ArcGIS FeatureServer "ViewCone", layer 0) includes the fields REFERENCE_LOCATION, REFERENCE_ELEVATION_M and REFERENCE_DISTANCE_M, but they are empty for all 24 cones. Would the City be able to share these reference values (the point each cone's lower boundary passes through, with its elevation and distance from the origin) for the cones in Public Views Guidelines Table 1?
>
> Three related questions, if you are able to answer:
> 1. Is VIEWPOINT_ELEVATION_M the surveyed eye-level elevation of the origin, or ground level, with eye height added separately?
> 2. Which vertical datum do the view cone elevations use (CGVD28 or CGVD2013)?
> 3. Is the first vertex of each cone polygon the surveyed origin point?
>
> If a published document already contains this, a link would be wonderful. Thank you very much for your time.

---

## Requests 1 to 7: one per downtown cone that has no known slope

For each request, use **point 1 as the Location** and list all five points in *Provide details*. Attach `view_cone_points.csv`. Use this wording, filling in the cone and points:

> Hello. I am a UBC Master of Architecture student (SALA, ARCH 540) building an open-source study tool on Vancouver's public views; all results are labelled as estimates. For view cone **{CONE}** ({NAME}), could you tell me the maximum permitted geodetic elevation (and datum) of the cone's lower boundary at the following five points? Coordinates are also in the attached CSV (WGS84 and UTM 10N, EPSG:26910).
> {POINT LIST}
> Thank you very much.

The points were chosen from the cone geometry. Two lie on the axis, as far apart as the downtown land allows. Two are off-axis on opposite sides. One middle point is held back by us to check our fit; that label is internal and not shown to the City. Addresses come from the BC Address Geocoder; every point is on land with a civic address within 35 m.

### 1. Cone 3.2.1, Queen Elizabeth Park to the North Shore Mountains (origin elevation 124.6 m)
1. 289 Drake St (49.273830, -123.123978)
2. 722 Smithe St (49.280331, -123.121948)
3. 1457 Nelson St (49.286578, -123.133929)
4. 1127 Barclay St (49.283980, -123.127679)
5. 450 Denman St (49.293429, -123.131127)

### 2. Cone 3.2.2, Queen Elizabeth Park to the North Shore Mountains (124.6 m)
1. 518 Moberly Rd (49.268077, -123.116952)
2. 1033 Marinaside Cres (49.273875, -123.116788)
3. 900 W Georgia St (49.283681, -123.121219)
4. 889 Homer St (49.278802, -123.118821)
5. 1169 W Cordova St (49.289169, -123.120630)

### 3. Cone 9.1, Cambie Street to the Lions (30.8 m)
1. 525 Wheelhouse Sq (49.268993, -123.117011)
2. 1057 Cambie St (49.275692, -123.119103)
3. 750 Burrard St (49.283320, -123.122387)
4. 900 Seymour St (49.279517, -123.120679)
5. 488 Jervis St (49.289690, -123.124227)

### 4. Cone 9.2, Cambie Street to Crown and Grouse (30.8 m)
1. 388 W 1st Ave (49.268046, -123.113538)
2. 772 Pacific Blvd (49.275002, -123.110478)
3. 399 W Georgia St (49.280673, -123.113712)
4. 765 Pacific Blvd (49.276619, -123.111955)
5. 389 Water St (49.285192, -123.110371)

### 5. Cone B2, Charleson Seawall to Crown and Grouse (4.48 m)
1. 1233 Pacific Blvd (49.273810, -123.123183)
2. 1022 Seymour St (49.278419, -123.121952)
3. 655 Burrard St (49.285242, -123.121082)
4. 777 Hornby St (49.282716, -123.121253)
5. 1095 W Waterfront Rd (49.289841, -123.119708)

### 6. Cone D, Heather Bay to the Lions (4.45 m)
1. 1288 Marinaside Cres (49.271718, -123.120626)
2. 1061 Richards St (49.277410, -123.121982)
3. 1128 Robson St (49.284967, -123.125803)
4. 933 Hornby St (49.281573, -123.123821)
5. 499 Broughton St (49.290725, -123.126789)

### 7. Cone J1, Creekside Park to the Lions (6.63 m)
1. 555 Carrall St (49.279829, -123.105049)
2. 20 W Hastings St (49.281257, -123.105408)
3. 306 Abbott St (49.282873, -123.106758)
4. 53 W Hastings St (49.282247, -123.106125)
5. 113 Water St (49.284320, -123.107047)

<span style="color:#d4148c">**FLAG: limited span.**</span> J1 crosses only about 520 m of downtown land (540 to 1,060 m from its origin), which is below the research rule of on-axis points at least 1 km apart. Its slope will be less certain than the others'.

---

## After replies arrive

- Record each reply in `replies/` (date, cone, point, value, datum, staff name if given).
- Fit each cone's slope from points 1, 2, 3 and 5, then compare the prediction at point 4 (held back). A good fit is within 0.1 m; more than 1 m is bad. These thresholds are from the C01 research.
- Credit the City as the source. Tool outputs still say "estimate; the City View Cone Assessment governs".

## Method record

- Cone geometry comes from the City `ViewCone` FeatureServer layer 0, retrieved 21 Oct 2026 in EPSG:26910 (24 features).
- The downtown test box is lon -123.145 to -123.095, lat 49.268 to 49.2995 (from research packet C01).
- Points were picked by `tools/pick_view_cone_points.py`. Addresses come from the BC Address Geocoder (`sites/nearest`, maximum distance 35 m) under the Open Government Licence – British Columbia.
