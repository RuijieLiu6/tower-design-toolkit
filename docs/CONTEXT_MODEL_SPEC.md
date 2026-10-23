# Vancouver Context Model: build spec v0.1

*First tool of the platform (decided 20 Oct). This spec is the Opus synthesis of research packets C01–C05, **all five of which passed their round-3 expert gate** (Sonnet research, fresh Opus critics; 72 false assumptions caught and corrected). Round logs: `research/context-model/`. Each gate's open conditions are listed in §11.*

**Flags:** 🟩 verified · 🟧 team assumption · ⬜ unverified · 🟨 unresolved · <span style="color:#d4148c">**■ FALSE ASSUMPTION**</span>

## 1. What it does (user view)

1. **Real context:** City footprints with LiDAR-derived heights as simple massing (LOD1), and real terrain out to the North Shore mountains.
2. **View-cone height estimate:** for any location, the estimated maximum geodetic height under each Public Views Guidelines cone, with tier, uncertainty and source.
3. **Design check:** an imported or modelled tower is tested against every covering cone. The result is *clear*, *within uncertainty*, *above estimated limit*, *limit unknown*, or *outside*, with the clause cited. It **never** says "violation".
4. **Views:** see the design from each protected viewpoint (origin, eye level, cone field of view), and later from surrounding rooftops.
5. **Layered base for later tools:** trees, traffic counts, land value, zoning, heritage, transit and airspace as separate, subscribable layers.

## 2. Height-limit model (C01, C04)

- **A cone** has two vertical boundaries plus a lower boundary that sets the maximum geodetic height (PVG s.2, p.3).
- <span style="color:#d4148c">**■ FALSE ASSUMPTION corrected:**</span> the lower boundary is **not** a flat plane. It's a rising sight line, **Z = Lv + k·D**. The default is the planar form (D along the wedge bisector), which fits the City's own site values better than radial distance (residual 0.012 m vs 0.037 m on cone A).
- **Origins:** the first vertex of each City polygon (16 distinct origins for 24 cones). **Lv** is `VIEWPOINT_ELEVATION_M`; the evidence says it is already eye level (1.4–1.9 m above ground at 12 of 17 origins), so nothing is added (editable).
- **Tiers:**
  - **T0** what-if
  - **T1a** slope fitted from 2+ published City site values
  - **T1b** slope from a Council-stated or LiDAR roof reference
  - **T2** City-confirmed
- **Uncertainty:** U95 = 2·u_c (GUM).
- **States:** outside · near edge · limit unknown · datum unknown · clear (e < -U95) · within uncertainty (|e| ≤ U95) · above (e > U95).
- **Overall CLEAR** needs every covering cone to be determinate. Silent clears must be **0**.
- **Slopes available now (planar k):**
  - A: 0.05889 🟩 (T1a)
  - 3.2.3: 0.000404 🟩 (T1a)
  - 3.2.4: equals 3.2.3 (endorsed Dec 2025; value unconfirmed 🟧)
  - 28: 0.05007 🟩
  - H: 0.05354 (endorsed Dec 2025 🟧)
  - J2: 0.07572 (endorsed Dec 2025 🟧)
  - 27.1: 0.04549 🟩
  - 27.2: 0.04115 🟩
- **Everything else is "limit unknown"** until the City replies, about 80% of CBD cells.
- **Relaxations are user-switched masks, never automatic:**
  - Higher Buildings Policy (31 Mar 2026): may enter QE view 3; heights about 550–700 ft in the CBD are guidance only.
  - Exceptional Downtown Sites (PVG 3.4, ≥ 8,000 m²; the VTC site is 11,468 m²): may enter B1, B2 and D; the Lions must stay visible.
- **Aviation:** towers above 150 m AGL are obstacles under **CAR 601.23(1)(d)** → show a NAV CANADA notice and marking warning. 🟩 YVR zoning covers Richmond only (<span style="color:#d4148c">■ the "YVR caps downtown" assumption was false</span>).

## 3. Frames and datums (C02, C03, C05)

| Item | Decision |
|---|---|
| Master positions | lon/lat as the City serves them (NAD83(CSRS) values) |
| Working frame | `vtm-local-1`: transverse Mercator, lat₀ 49.2827, lon₀ -123.1207, GRS80 |
| Exchange frame | EPSG:3157 (not used for FSR areas: 0.08% small) |
| Vertical (canonical) | **CGVD28**, as in City LiDAR 2022 (HTMVBC00 geoid). Cone heights are *assumed* CGVD28 🟧 (Request 0 asks) |
| CGVD2013 sources (HRDEM, MRDEM, LidarBC) | Convert via the NRCan GPS-H chain with an epoch step; **never a typed offset** |
| Every z column | Declares datum, EPSG, epoch and offset in the manifest |

<span style="color:#d4148c">**■ FALSE ASSUMPTION in your existing tools:**</span> the shared legacy frame in Vista, Form Studio and PVV uses **110,574 m per degree of latitude**, which is the equatorial value. At 49.28° N it should be 111,215 m. **North–south distances are 0.58% short and areas 0.77% small.** Vista's vertical z also isn't CGVD28 (Shangri-La site z 40.52 m vs 30.7–31 m). Named converters keep old studies readable.

## 4. Data layers

| Layer | Source (licence) | Size | Priority |
|---|---|---|---|
| View cones | City `ViewCone` service + open data (OGL-Vancouver) | ~6 KB | **core** ✅ fetched |
| Cone parameters `cone_params.json` | Council reports, City sheets, City replies | ~2 KB | **core** |
| Footprints | City Building footprints 2015, 154,124 polygons (OGL-Vancouver) | target ≤ 40 B/building | **core** (downtown) |
| Building heights | City LiDAR 2022, CGVD28 (OGL-Vancouver) | tiles 16 MB–2.7 GB; **13 tiles within 1.5 km ≈ 10–25 GB raw** | **core** (process tile by tile, keep only results) |
| Downtown ground | City LiDAR 2022 ground class → 1 m DTM | per tile | **core** |
| Mountains / backdrop | NRCan MRDEM-30 (OGL-Canada), CGVD2013 | window reads | **core** (rings: R0 0–1.5 km 1 m; R1 to 6 km; R2 to 25 km 10–30 m; R3 to 50 km 30 m) |
| Parcels, addresses, zoning, heritage | City open data (OGL-Vancouver) | 1–12 MB | v1 |
| Street trees | City Public trees, 184,268 (OGL-Vancouver); 95.6% have height *classes* (15–105 ft) | ~0.9 MB packed | v1 |
| Land value | Property tax report, 228,935 folios in 2026 (OGL-Vancouver; BC Assessment co-owned ⬜) | — | roadmap |
| Traffic | Intersection movement counts (659) + directional counts (OGL-Vancouver) | < 1 MB | roadmap |
| Transit stations, parks, schools | City open data | small | v1 |

**Download note:** the City portal blocks scripted LAS downloads (HTTP 403, Cloudflare), so **LiDAR tiles have to be downloaded in a browser**. That needs your approval, and probably your clicks.

## 5. Pipeline and storage (C02, C03)

- **Offline Python 3.13 jobs**, run outside the repo:
  - reproject footprints;
  - nearest-footprint partition of LiDAR points, so podiums don't pick up a tower's wall returns;
  - roof **max_all** (for cone tests; clause 3.1.1 counts appurtenances) and **P90** (for display);
  - ground from P10 of ground points;
  - hand-trace the 15 tallest towers.
  Raw LAS files are deleted after each tile.
- **Formats:**
  - tables and points: GeoParquet (zstd, Hilbert sort);
  - display polygons: PMTiles;
  - LOD1: footprints + elevation columns, triangulated in the browser (no baked meshes);
  - terrain: quantised height tiles (uint16, cm downtown and dm regionally);
  - meshes: glTF + meshopt;
  - cones: analytic parameters only.
- **Hosting:**
  - **store of record** is a GitHub Release per layer version (sha256);
  - CI assembles the GitHub Pages site;
  - budgets: published site ≤ **400 MB** (hard limit 1 GB), first load ≤ **5 MB**, single file ≤ 20 MB, Pages soft limit 100 GB/month;
  - `layers.json` manifest per layer: source, retrieval date, licence, attribution, CRS and datum, checksum.

## 6. Viewing (C04)

- **Protected viewpoint camera:** at the origin, eye height = Lv, aimed along the bisector, field of view from the two boundary bearings plus a margin. Boundaries are drawn; the lower-boundary line is overlaid; earth curvature (k = 0.13) is applied by a single function.
- **Rooftop views:** roadmap (after 30 Nov), using LiDAR roofs instead of Vista's OSM roofs.
- **Skyline comparison:** v1 (existing vs proposed, with a wipe slider) and a PDF report with an exceedance table and a provenance page.
- **Performance targets:** 5 MB to first interaction, 30 fps on integrated graphics, cone check of 1M triangles ≤ 1 s (high-end laptop) / ≤ 3 s (thin laptop). Vista's current pack is 38.7 MB.

## 7. Reusing Vista and the other tools (C04, C05)

- **Keep from Vista:**
  - polygon-clip kernels
  - result precedence and no-compliance wording guards
  - fixtures F1–F3
  - hash state
  - PDF writer
  - cone-fit camera rule
- **Refactor:** split the 218 KB `explorer.js` into modules; typed functions replace global state.
- **Layer 0 schema:** site, placement, massing parts, floors (PVV's record + tower_id), program, checks, view study, ceiling. Every height carries its datum.
- **Node contract:** `vtm-node.json` (id, version, licence, ports typed by JSON Schema, validated with Ajv), plus `read(layer0)` / `write()` patch functions.
- **By 13 Nov:** PVV adapter (2–3 person-days) and Form Studio export adapter (2–3 person-days).
- **Later:** Vista (3–5) and the shell (2).

## 8. Evaluation cases

See `mid-review/FIRST_ATTEMPT_SPEC.md` (cases 1–7, three re-verified 21 Oct). The research adds 21 more hand-checkable cases, among them:
- Clinton Park 28
- H and J2 (Dec 2025)
- Trout Lake 27.1 / 27.2
- the 1008 Cambie roof test
- CAR aviation trigger
- Exceptional Downtown Site eligibility
- curvature arithmetic
- version detection

All are in `research/context-model/C01/revise-r2_C01.json → validation_cases`.

## 9. MVP for 13 Nov (C01 gate condition 1) and capacity

**Core:**
1. Cone registry (M01).
2. Height surface for the 8 parameterised cones plus the "limit unknown" mask (M03).
3. Design checker with NO ESTIMATE (M05).
4. Validation harness, with the regression and structural tests (M07).
5. CBD ground and footprint tiles (M04 / C02 core).
6. PVV + Form Studio adapters.
7. Licence files.

**Capacity:** 2 people × 17 working days (21 Oct–13 Nov; 11 Nov is a holiday) = **34 person-days**, shared across the context work.

**Cut order if over:**
1. CityJSON exporter
2. reference-path planes
3. DT Mass converter
4. .3dm user-string embedding

**Deferred:** Vista field-level import, viewer unification, full LiDAR pack, classmate nodes.

## 10. False assumptions caught (selection)

| <span style="color:#d4148c">■ Claim</span> | Correction |
|---|---|
| Cone lower boundary is a flat height | Rising line Z = Lv + k·D |
| Cone heights are published nowhere | Not as a surface, but Council reports and City site sheets give parameters for several cones |
| Origins can only be estimated (Vista README) | The polygon apex *is* the City origin; sibling cones share it exactly |
| `EFFECTIVE_DATE` identifies the version | Only view 28 shows 2026; H, J2, 3.2.4, 9.x changed but still read 2024. Use geometry and PDF hashes plus Council minutes |
| 9.2's slope is current | It belongs to the old origin (before Feb 2026): historical |
| YVR or harbour surfaces cap downtown | YVR zoning covers Richmond only; the federal CAR 601.23 notice applies above 150 m |
| Higher Buildings Policy adds caps | It is a **relaxation** (entry into QE view 3) |
| Legacy tool frame is accurate | N–S 0.58% short (equatorial degree used) |
| Base model saved north is correct | Drawn arrow is 45° off; saved location is Richmond |

## 11. Open gate conditions (must hold before release)

- Send **Request 0** (the reference fields, datum, eye height) before relying on per-site assessments. *(drafted)*
- Label H, J2 and 3.2.4 values "endorsed, value unconfirmed".
- Keep roof-aligned cones (E, G1, G2, J1, 9.x, 22) at **limit unknown** until the 1008 Cambie roof test passes within 2–3 m.
- Show a NAV CANADA warning on every tower over 90 m.
- Hash and pin the PVG PDF version (Feb 2026) used for every citation.
- **Licences:** add LICENSE + REUSE.toml to the repos. **Your Vista packs and the PVV basemap derive from the supplied studio model (owner unrecorded) and are served publicly today.** Treat them as non-redistributable until Xun confirms, and keep OSM-derived (ODbL) data in a separate layer.
- Get written consent from Sinnie (dtmass) and Willem before their tools become nodes. Their repos have no licence, so we can link and credit but not copy.

## 12. Needed from you

1. Go-ahead to build the first attempt and the MVP.
2. Approval for downloads, with browser clicks for City LiDAR tiles. Start with the 2–4 tiles around the CBD, not all 13.
3. Ask Xun about the supplied studio model's terms. This affects Vista and PVV, which are public now.
4. Submit Request 0.
5. Send the permission notes to Sinnie and Willem (I can draft them).
