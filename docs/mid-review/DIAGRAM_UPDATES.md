# Updates to the three mid-review diagrams

The diagrams already exist in your repo `vancouver-tower-toolbench/diagrams/` and use the Session 4 notation (people / AI / harness / tools, pain-point letters a–g, gates G1–G7). They need **updates, not redraws**. Nothing in your repo has been edited. Below is what to change.

## 01 · As-is workflow (`01-as-is-workflow.svg`): small changes

| Where | Change | Why |
|---|---|---|
| Step 2 "Establish site truth", the "Units, CRS, datum, date? CANNOT DETERMINE" check | Add a note: *"Supplied VTC model: drawn north arrow 45° from saved north; saved location 49.16 N (Richmond)"* | A concrete instance of pain point (f) false certainty, found by inspection |
| Step 3a "View-cone screen" | Add: *"City open data: plan polygons only; height fields empty for all 24 cones"* | Shows why step 3a stops today |
| Step 7 "City enquiry" | Add: *"View Cone Assessment via Van311 (free); turnaround about 0.5–3 business days (from past replies; not a published standard)"* | Real hand-off, real delay |

## 02 · Case study (`02-case-study.svg`): add one row and update two

| Row | Change |
|---|---|
| **New: Vancouver Context Model (this project)** | Covers 1 Brief (partial), 2 Site, 3a Views (**heights**, where the City has published parameters). It **stops at 3b**. Stop reason: *"No estimate where the City has no published cone parameters; the City View Cone Assessment governs."* |
| Vista (Ruijie) | Keep "Approximate, study-only views", and add *"plan overlap only; no cone heights"* |
| Autodesk Forma | Keep the [UNVERIFIED] tag until the case-study research packet (P17) completes its critique rounds (it has 1 of 3 today) |
| Tower Studio hub v0.5 | Rename to the platform's working name; stop reason *"Web-first core; node canvas and community from v1"* |

## 03 · Tool logic (`03-tool-logic.svg`): main update

Keep the structure: architect intent, then parse, then guard, then fixed chain and router, then tools, then metric engine, then guards, then explanation, then people decide. Then:

1. **Add the Context Model as the first tool adapter**, before Vista, DMT and PVV: *"Context Model: City cones + slopes (cited) → Z = Lv + k·D → status."* Mark it **Deterministic metric engine** (no model in the loop).
2. **Add a new output state beside "CANNOT DETERMINE / limit": "IN CONE: NO ESTIMATE"**, routed to *"Request City assessment (person submits)"*.
3. **Add the flag legend** used across the platform:
   - verified source (green)
   - team assumption (amber)
   - unverified (grey hatched)
   - unresolved (yellow)
   - <span style="color:#d4148c">**FALSE ASSUMPTION (magenta)**</span>
4. **Add a research lane** (above the AI column): *"Research subagents (Sonnet) → expert critique (Opus, ≥3 rounds) → cited parameters → people review."* This is where parameters such as `k` come from. It runs **before** the tool, not during a design session.
5. **Add the render path** in Present mode: *"Viewport capture → Codex/gpt-image-2 (ChatGPT plan) → labelled AI render → person selects."*
6. Keep the closing sentence. It's still true: *"The AI is not an open agent."*

**Gates:** G3–G7 stay with people. Add **G2b, "accept or reject cited parameters before they enter the engine"**, owned by the team.

## Suggested updates (22 Oct, after the overnight build)

These are suggestions only. The diagrams are yours to change.

- **02 Case study, Tower Studio row:** it now covers 1 Brief (VTC hard rules), 2 Site (competition block and real downtown), 3a Views (heights, a height-limit surface, views from roofs and floors), plus public realm, solar access, core and lifts, egress, structure, energy, parking and boards. Its stop reasons are per node: "no estimate" where cone parameters are missing, "unverified" where a by-law page could not be opened (Parking By-law, HTTP 403), and "the City View Cone Assessment governs".
- **03 Tool logic:**
  - Add an **import adapter** (.3dm / OBJ / glTF / IFC → storeys and program tags) before the metric engines.
  - Add the **evaluation harness** (21 cases, `npm run eval`, 21 of 21 pass on 22 Oct) and the **evidence lint** (a threshold without a source fails the tests) as harness guards after the engines.
  - The **Sources & assumptions hub** belongs beside "explanation".
  - The **options compare**, with the team's criterion weights flagged as a team assumption, belongs before "people decide".
- **03 render path:** built (capture + prompt file → Codex → labelled AI render → four review ticks), but Codex has not been run yet. Draw it dashed until the first real run.
- **01 As-is**, at whichever step checks by-law rates (if the diagram has one): a candidate note: *"Parking By-law sections return HTTP 403 to automated reading; a person must open and transcribe them."* This is another real hand-off.
