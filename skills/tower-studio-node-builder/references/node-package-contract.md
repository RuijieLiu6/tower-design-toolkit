# Node package contract: `tower-studio-node@1`

A node package is one JSON object. Tower Design Toolkit checks it against [node-package.schema.json](node-package.schema.json) (JSON Schema 2020-12, validated with Ajv), then checks the formulas, thresholds, evidence rules and the package's own tests. [example-node.json](example-node.json) shows every part in use.

## Why declarative

Format v1 is **declarative**: formulas over a fixed summary of the design, read by Tower Design Toolkit's own small formula parser. Formulas are never run as JavaScript, so a formula node can't touch the browser, the network or the design. It also means anyone can review a node by reading one file: every number, formula, threshold and source is in plain sight. A package may also carry a small piece of JavaScript for metrics a formula can't express (see Code nodes below). That code never runs in the page: only in a sandboxed frame with no network, storage or page access, with a time limit, and only after the user reads it and allows that node.

## Fields

| Field | Required | What to write |
|---|---|---|
| `format` | yes | `"tower-studio-node@1"` |
| `id` | yes | `community.<your-handle>.<node-name>`: lowercase letters, numbers and hyphens, e.g. `community.rliu.daylight-depth`. Keep it when you publish new versions. |
| `version` | yes | `"0.1.0"` to start; raise it when anything changes. |
| `licence` | yes | `MIT` (matches Tower Design Toolkit's code), `Apache-2.0`, `BSD-3-Clause`, `CC-BY-4.0` or `CC0-1.0`. |
| `name` | yes | Short library name, 3–60 characters. |
| `author` | yes | `{ "name": "…", "contact": "optional" }` |
| `category` | yes | One of `SITE`, `PROG`, `CLIM`, `ENER`, `ECOL`, `PUBL`, `CULT`, `MOBI`, `STRC`, `SYST`, `SPAC`, `PRES`, `DATA`. |
| `stage` | yes | `massing`, `schematic` or `present`. |
| `question` | yes | The design question, in one sentence. |
| `jury` | no | Any of `human_scale_40`, `cultural_context_30`, `design_excellence_20`, `urban_integration_10` (the Vancouver Tall Challenge jury weights). |
| `projects` | no | `["vtc"]` (competition site), `["city"]` (Real Vancouver), or both. Leave out for both. |
| `inputs` | yes | Every Layer 0 name the formulas read (the ports in). Tower Design Toolkit warns about names that are read but not listed, or listed but not read. |
| `method` | yes | How it works, in plain words, with its simplifications. |
| `human` | yes | What stays a human judgment. |
| `limits` | yes | What the node can't tell you. |
| `parameters` | no | Up to 10 editable values (see below). |
| `metrics` | yes | 1–20 metrics (see below). Their results are the ports out. |
| `falseAssumptions` | no | Wrong beliefs kept visible, each with `claim`, `correction` and `source`. Tower Design Toolkit shows them in magenta. |
| `tests` | no, but ask for them | Expected results on the sample fixtures (see below). |
| `createdWith` | no | Which assistant and skill version helped. |

No other fields are allowed. Names are case-sensitive.

### Metric

```json
{
  "id": "plan_dimension",
  "label": "Widest tower plan dimension",
  "unit": "m",
  "per": "tower",
  "expression": "tower.maxSide",
  "decimals": 1,
  "threshold": { "direction": "lower_is_better", "good": 29.0, "flag": "verified",
                 "source": { "label": "Draft CDDG (City of Vancouver)", "page": "S2.3.2", "url": "https://…" } },
  "note": "optional"
}
```

- `id`: lowercase letters, numbers and underscores, starting with a letter.
- `unit`: shown after the value: `m`, `m²`, `%`, `deg`, `count`, `ratio`… (`ratio`, `count`, `0/1` and `state` show no unit).
- `per`: `tower` gives one result per tower and may read `tower.*`; `project` gives one result for the design and may not.
- `decimals`: 0–6; optional.

### Threshold

| `direction` | `good` | `bad` (optional) | Result |
|---|---|---|---|
| `higher_is_better` | number | number ≤ good | **Pass** at or above good; **Fail** below bad; otherwise **Check** |
| `lower_is_better` | number | number ≥ good | **Pass** at or below good; **Fail** above bad; otherwise **Check** |
| `range` | `[low, high]` | `[low, high]` around good | **Pass** inside good; **Fail** outside bad; otherwise **Check** |
| `info` | none | none | The value is shown with **Info**, on purpose, with no judgment (e.g. a core side length shown for context). The flag then describes the formula's assumption. |

- Without a `bad` value the node can say **Check** but never **Fail**. A fail needs a sourced limit.
- `flag` is `verified`, `team_assumption`, `unverified` or `unresolved` (see [evidence-flags.md](evidence-flags.md)). A false assumption is never a threshold: put it in `falseAssumptions`.
- `unresolved` means a threshold is wanted but no sourced number exists yet: give no `good` or `bad`. The node shows the value with **Unknown**.
- `info` is for a value that should never be judged. Don't use it to dodge a threshold the designer actually wants: that is `unresolved`.
- `source` is always required: `label` (document and publisher, or `Team assumption: who, date, why`), plus `page` (page, clause, table or quoted sentence) and `url` when you have them. `verified` needs a `page` or a `url`.
- `text` (optional) replaces the automatic wording, e.g. `"at most 29.0 m, or clear volumetric articulation"`.
- If a formula can't be computed (an input this project doesn't have, or a division by zero), the result is **not available** with **Unknown**. It is never guessed.

### Parameter

```json
{ "id": "frontage", "label": "Site frontage the tower faces", "unit": "m", "default": 144.8, "min": 10, "max": 500, "step": 0.1,
  "flag": "verified", "source": { "label": "VTC brief (Buildner 2026)", "page": "p.15" }, "note": "optional" }
```

Formulas read it as `params.frontage`. Designers can change it in Tower Design Toolkit's Results panel. The default needs a source and a flag like any threshold.

### Test

```json
{ "fixture": "vtc-default", "tower": 0, "metric": "plan_dimension", "value": 46, "state": "warn", "tolerance": 0.01 }
```

- `fixture`: `vtc-default`, `city-study` or `vtc-two-towers` (from [fixtures.json](fixtures.json)).
- `tower`: for per-tower metrics, numbered from 0 (default 0).
- `value` (or `null` for "not available") and/or `state` (`pass`, `warn` for Check, `fail`, `unknown`).
- `tolerance`: default 1% of the value or 0.005, whichever is larger.
- Tests run with the parameters' default values.

## Layer 0 summary: the names formulas can read

Values are numbers. Where a project doesn't have an input, it is *not available* (`null` in the fixtures).

### Per tower (`tower.*`, only in `per: "tower"` metrics)

| Name | Unit | Meaning |
|---|---|---|
| `tower.height` | m | Architectural top above grade |
| `tower.width` | m | Tower plate width (before rotation) |
| `tower.depth` | m | Tower plate depth (before rotation) |
| `tower.rotation` | deg | Footprint rotation, counter-clockwise |
| `tower.f2f` | m | Typical tower floor-to-floor |
| `tower.floors` | count | All floors, podium included |
| `tower.towerFloors` | count | Floors above the podium |
| `tower.podiumFloors` | count | Podium floors (0 if none) |
| `tower.podiumHeight` | m | Podium height (0 if none) |
| `tower.podiumWidth` | m | Podium width (0 if none) |
| `tower.podiumDepth` | m | Podium depth (0 if none) |
| `tower.podiumArea` | m² | Podium footprint area (0 if none) |
| `tower.plateArea` | m² | Gross tower floor plate = width × depth |
| `tower.perimeter` | m | Tower plate perimeter = 2 × (width + depth) |
| `tower.minSide` | m | Shorter plan side |
| `tower.maxSide` | m | Longer plan side |
| `tower.slenderness` | ratio | height ÷ shorter plan side |
| `tower.coreShare` | ratio | Core area as a share of the plate, 0–1 (sized to the lifts or set by hand: team assumption) |
| `tower.coreArea` | m² | Core area on a typical floor |
| `tower.netToGross` | ratio | 1 − core share (core only; columns, walls and shafts outside the core are not deducted: team assumption) |
| `tower.plantFloors` | count | Mechanical (plant) floors |
| `tower.skyLobbies` | count | Sky lobby floors |
| `tower.gfa` | m² | Gross floor area, all floors |
| `tower.gfa_retail` | m² | Gross floor area: retail / commercial |
| `tower.gfa_office` | m² | Gross floor area: office |
| `tower.gfa_hotel` | m² | Gross floor area: hotel |
| `tower.gfa_residential` | m² | Gross floor area: residential |
| `tower.gfa_civic` | m² | Gross floor area: civic / cultural |
| `tower.gfa_amenity` | m² | Gross floor area: public amenity (sky lobbies count here) |
| `tower.gfa_mechanical` | m² | Gross floor area: mechanical |

### Whole project (`project.*`)

| Name | Unit | Meaning |
|---|---|---|
| `project.towerCount` | count | Towers in the design |
| `project.siteArea` | m² | Site area: competition site only (brief p.15, 79.2 × 144.8 m); not available in Real Vancouver |
| `project.gfa` | m² | Gross floor area, all towers |
| `project.gfa_retail` | m² | … retail / commercial |
| `project.gfa_office` | m² | … office |
| `project.gfa_hotel` | m² | … hotel |
| `project.gfa_residential` | m² | … residential |
| `project.gfa_civic` | m² | … civic / cultural |
| `project.gfa_amenity` | m² | … public amenity |
| `project.gfa_mechanical` | m² | … mechanical |
| `project.fsr` | ratio | Gross floor area ÷ site area (gross, no exclusions); not available in Real Vancouver |
| `project.maxHeight` | m | Tallest tower |
| `project.groundElevation` | m | Ground elevation, geodetic: Real Vancouver only (assumed, editable); not available on the competition site |
| `project.isVtc` | 0/1 | 1 on the competition site |
| `project.isCity` | 0/1 | 1 in Real Vancouver |

### Sun setting (`sun.*`)

| Name | Unit | Meaning |
|---|---|---|
| `sun.month` | month | Month chosen in the sun preview (1–12) |
| `sun.day` | day | Day chosen |
| `sun.hour` | h | Local hour chosen (decimal) |
| `sun.altitude` | deg | Sun altitude (approximate formula, ±0.5°: unverified) |
| `sun.azimuth` | deg | Sun azimuth, clockwise from true north (approximate, unverified) |

Plus `params.<id>` for the node's own parameters and the constant `PI`.

## Formula language

| | |
|---|---|
| Numbers | `12`, `0.6`, `1.5e3` |
| Arithmetic | `+ - * / %`, power `^` (`-2^2` is −4; `2^3^2` is 512) |
| Comparison | `< <= > >= == !=` give 1 (true) or 0 (false) |
| Logic | `&&`, `||`, `!` give 1 or 0 |
| Conditional | `condition ? a : b`, or `if(condition, a, b)` |
| Constants | `PI`; `NA` = not available on purpose (the result shows *not available*, never a guess) |
| Functions | `min(…)`, `max(…)`, `abs`, `sqrt`, `pow(x, y)`, `round(x)` or `round(x, digits)`, `floor`, `ceil`, `clamp(x, low, high)`, `log` (natural), `log10`, `exp`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2(y, x)` (radians), `rad(deg)`, `deg(rad)`, `finite(x)` (1 if x is available) |

At most 500 characters per formula. There are no strings, loops, assignments or property access: `tower["height"]` or `alert()` are rejected.

Examples:

- Height-to-width: `tower.height / tower.maxSide`
- Non-residential share: `(tower.gfa - tower.gfa_residential) / tower.gfa`
- Distance from the core to the facade (square core, centred): `(tower.minSide - sqrt(tower.coreArea)) / 2`
- A yes/no result (unit `0/1`): `tower.height > 150 ? 1 : 0`
- Only towers with office space (others show *not available*): `tower.gfa_office > 0 ? (tower.minSide - sqrt(tower.coreArea)) / 2 : NA`
- Office FSR, which is *not available* in Real Vancouver because the site area isn't known there: `project.gfa_office / project.siteArea`

## How it maps onto Tower Design Toolkit

| Package | In Tower Design Toolkit |
|---|---|
| `category`, `stage`, `question`, `method`, `human`, `limits`, `jury`, `projects` | The library entry (`NodeDef` in `src/data/registry.ts`) |
| each metric × tower | A result card (`RuleResult` in `src/engine/types.ts`): label, value, threshold text, state, flag, source, note |
| `inputs` / metric results | Ports in / ports out (the planned `vtm-node.json` contract in `04 Tool Plan/CONTEXT_MODEL_SPEC.md` §7) |
| `write()` patches | Not in v1: declarative nodes only read the design |

Imported nodes are always marked **Community · Unverified until reviewed**, and a threshold the author marks `verified` is shown as unverified (with "author: verified") until a reviewer confirms it.

## Code nodes (optional)

A package may add `"code": { "language": "javascript", "source": "…" }` and set a metric's `expression` to `"code"`. That metric's value then comes from the code's `run(input)`, not a formula. Everything else (label, unit, threshold, flag, source) stays declarative and is checked as usual. Rules, the input and output shapes and the sandbox: [code-nodes.md](code-nodes.md).
