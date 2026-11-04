# Tower Design Toolkit: project overview (for teammates and AI agents)

*Status as of **Thu 22 Oct 2026**. UBC SALA, ARCH 540 Assignment 2, "From a Real Workflow to a Working Tool". Pair project by **Ruijie Liu** and **Sinnie Choi**; instructor **Xun Liu**. The mid review is **Fri 23 Oct 2026**.*

> **Name:** the tool was renamed from *Tower Studio* to **Tower Design Toolkit** on 22 Oct 2026. The folder (`tower-studio/`), the data format ids (`tower-studio-project@1`, `tower-studio-node@1`), the skill folder and the browser storage keys keep the old name, so saved projects and node packages still load.

> **In one paragraph.** Tower Design Toolkit is an open-source, web-first design and evaluation tool for architects working on a 244–305 m tower in downtown Vancouver, starting with entrants to the Vancouver Tall Challenge (VTC). The designer models or imports a tower, then switches on categorized **evaluation nodes**: VTC rules, FSR, protected view cones, solar access, public realm, lifts, egress, structure, energy, parking and more. Every result points to its source and carries an evidence flag. The work moves through three stages (**Massing → Schematic → Present**), or the designer builds their own workflow on a Grasshopper-like canvas (**Customize**). Heights, shadows and areas come from deterministic code, never from an AI model. AI is used to read policy into cited parameters, to write the code, and (optionally) to render the designer's own viewport.

**Where things are:** this repository holds the app at the root and the team's planning and research documents in `docs/`, a generated copy of the local `04 Tool Plan` folder.

This file follows the structure of the assignment brief (Background, Problem, Opportunities, Proposal, Methodology, Possible outcome, plus the diagrams, first attempt, evaluation cases and the user and build logs). Read §0 first if you're an AI agent.

---

## 0. Rules for agents working on this project

*Changing the interface? Read [DESIGN_HANDOFF.md](DESIGN_HANDOFF.md) first (design logic, colour tokens, icon, motion).*

1. **Never invent a threshold, rate or source.** Every number shown to a user needs a source, or it is labelled with an evidence flag:
   - 🟩 **verified**: an opened source, cited to clause or page;
   - 🟧 **team assumption**: an editable preset;
   - ⬜ **unverified**: a source not opened or not confirmed;
   - 🟨 **unresolved**: the relationship isn't known;
   - <span style="color:#d4148c">■ **false assumption**</span>: shown in magenta and kept visible together with its correction.

   A test fails if a built node shows a threshold without a source (`src/lib/evidenceLint.ts`).
2. **Code computes; people decide.** Engines in `src/engine/` are deterministic. The tool never claims compliance: it says "estimate" or "screening", and it stops ("no estimate", "limit unknown") when data are missing. The City's own assessments govern.
3. **Some data must stay private:**
   - the VTC competition base model (Buildner) lives only in `public/local/`, which git ignores;
   - the studio context model (owner unrecorded) and anything derived from it are never copied into the app;
   - raw LiDAR stays in `../context-data/`.
4. **Culture and reconciliation:** prompts, ledgers and guardrails only. Never an AI-generated "culture score", and nothing speaks for a Nation.
5. **AI images are always labelled "AI-generated"** (boards and the filmstrip enforce this).
6. **Check your work:** run `npx tsc -p . --noEmit`, `npm test`, `npm run build` (which also type-checks) and `npm run eval` after changes. Keep them green.
7. **Session protocol the team uses:** end each piece of work with *Done / Needed / ask whether to refine or build next / a suggested next prompt*.

---

## 1. Background: the practice and the workflow

- Vancouver is revising how it permits very tall buildings (the Higher Buildings Policy). The **Vancouver Tall Challenge** (Buildner with the City and UBC SALA; submissions close **30 Nov 2026**) asks for towers of **244–305 m** on a downtown block.
- The jury weighs **human scale 40%, cultural context 30%, design 20%, urban integration 10%** (VTC brief pp. 14, 19, 33).
- Designing such a tower means checking it against protected public view cones, solar access to parks and plazas, streetwall and public realm guidance, FSR and program rules, lifts and egress, structure and energy, then presenting it on four A2 boards.
- **Users we're designing for:** VTC entrants and architecture students first; later any designer of a tall building in Vancouver.

## 2. Problem: what is slow, error-prone or impossible today

From the team's as-is workflow study (diagram `01-as-is-workflow.svg` in the team's `vancouver-tower-toolbench` repo):
- **Spread and gaps:** about **10 steps across 5+ tools**, and no tool covers the City enquiry or the final decision.
- **Pain points (letters as in the diagram):**
  - (a) authority and dates;
  - (b) iteration lost between tools;
  - (c) options narrowed too early;
  - (d) meaning lost when files move between tools;
  - (e) divergent versions;
  - (f) **false certainty**: results lose their sources;
  - (g) unclear responsibility.
- **Concrete examples found by the first attempt:**
  - the City's open View Cone layer has **empty height fields for all 24 cones**;
  - about **80% of central-business-district cells lack cone parameters**;
  - the supplied competition model's north is **45° off**, and its saved location is Richmond;
  - a legacy frame used an equatorial degree, so north–south distances were **0.58% short** (a false assumption, now corrected).

## 3. Existing tools (case study) and where each one stops

Diagram `02-case-study.svg`:

| Tool | What it does well | Where it stops |
|---|---|---|
| Autodesk Forma, TestFit, Rhino / Grasshopper / Ladybug | Fast massing, environmental analysis, feasibility | Don't know Vancouver's rules (view cones, solar guidelines, by-laws); ⬜ details unverified (case-study packet P17 is still in review) |
| **Vista** (Ruijie, Assignment 1) | View cones in plan, rooftop views, PDF report | Plan overlap only, **no cone heights**; context derived from the studio model. **Now ported into Tower Design Toolkit** as the *Vista view studies* node, on City data and real terrain (audit: `docs/research/vista-audit-2026-10-22.md`) |
| **Program Value Visualizer** (Ruijie) | Program economics | **Ported** as the *Program value & land residual* node |
| **Form Studio** (Ruijie) | Massing → .3dm | Not yet a node |
| **Downtown Massing Tool** (Sinnie Choi) | Downtown massing | Not yet a node; needs written consent |
| **Solar Shading Explorer** (classmate Willem Girard) | Solar shading | Not yet a node; needs permission |

## 4. Opportunities AI can bring, and what it does not do

**AI does:**
- reads policy PDFs, Council reports and by-laws into **cited parameters**. One research packet caught 19 false assumptions this way;
- runs research → critique loops before parameters enter the engines. Expert critique rounds were paused by the team on 22 Oct; research is now single-pass, with unreviewed facts marked unverified;
- writes the code: this whole app was built with Claude Code;
- renders the designer's **own viewport** (Codex CLI with gpt-image-2), always labelled.

**AI does not:**
- compute heights, shadows, areas or lift capacity (deterministic code does);
- decide compliance;
- score culture or speak for Nations.

## 5. Proposal: the tool

**One platform, web-first.** It can be installed as an offline app; a desktop or Rhino panel may follow from the same code.

- **Landing page:** choose the *Guided process* or *Customize*.
- **Guided process**, three stages:
  - **Massing** (clay, perspective): volume, podium, program bands, site, and the first checks.
  - **Schematic** (x-ray, near-parallel isometric):
    - floor plates, core sized to the lifts, plant floors, sky lobbies;
    - section cut and exploded zones;
    - lifts, egress, structure, energy, facade, interior.
  - **Present:**
    - model locked, A2 board frame, captures;
    - board composer with submission checks;
    - drawings (plan, section, elevation);
    - AI render workflow.
- **Customize:** a Grasshopper-like canvas. Icon nodes grouped by 13 categories, typed ports, logic nodes (all pass, any fail, weighted score, compare), saved workflows, and a "run in guided app" button.
- **Node categories:** `SITE`, `PROG`, `CLIM`, `ENER`, `ECOL`, `PUBL`, `CULT`, `MOBI`, `STRC`, `SYST`, `SPAC`, `PRES`, `DATA`.
- **Community:**
  - a **node-builder skill** any AI model can follow to design a node with the user;
  - local import ("My nodes");
  - sandboxed code nodes;
  - a registry browser with a PR helper. The shared registry and live comments are not online yet.
- **Two projects:**
  - **Competition site:** the VTC block, with the private base model.
  - **Real Vancouver:** City view cones, Vista's unified building model by default (61,402 OpenStreetMap buildings at their best height: City LiDAR 2022 or 2009 where measured, else OSM, unverified; the City LiDAR 2022 + 2009 model for comparison), North Shore terrain, the height-limit surface, and views from roofs and streets. Since 27 Oct also: street trees, parcels with land value, zoning, heritage and traffic count locations (loaded when switched on); water, the City's 2002 shoreline and park tint; a tower base that follows the terrain by default (flagged unverified, one click to set by hand); a cone-coverage list (8 of 24 with an estimate); buildings across all 24 view cones and the gaps between them, about 36,700 parts (LiDAR 2022 in the 2 × 2 km core, the City's 2009 heights elsewhere, hatched 3 m display-only placeholders where no height exists).

## 6. Tool logic (agent-workflow notation, as built)

Diagram `03-tool-logic.svg`. The suggested updates are in `docs/mid-review/DIAGRAM_UPDATES.md`.

| # | Step | Done by | Data in → out | Check / stop / review |
|---|---|---|---|---|
| R | Research lane (before any design session) | AI research agents → team review | Policy PDFs, Council reports, by-laws → cited parameters with flags (`docs/research/`) | **G2b**: the team accepts or rejects parameters before they enter an engine |
| 1 | Architect intent | Person | Project kind, tower parameters or an imported model | — |
| 2 | Upload and role mapping (since 3 Nov) | Script + person | .3dm / OBJ / glTF / IFC → layers mapped to roles (tower, podium, program, core, site, context, ignore) → Layer 0 interchange model (`tower-studio-interchange@1`, `docs/INTERCHANGE.md`) with provenance per element | The person confirms the mapping, units, north and datum; geometry health check; plain-language checks; stops when nothing can be used |
| 3 | Layer 0 assembly | Code | Towers, floors, uses → project JSON (`tower-studio-project@1`) | Schema validation (Ajv) |
| 4 | Metric engines (the nodes) | Deterministic code | Layer 0 + context data → results with state and flag | Stops: "no estimate", "limit unknown", "unresolved" |
| 5 | Harness guards | Code checks | Results → tests | Evidence lint (no source = fail), evaluation cases (`npm run eval`), accessibility checks |
| 6 | Explanation | Code + UI | Results → rule cards, Sources & assumptions hub, decision trace | — |
| 7 | Options compare | Code | 2–4 saved options → deltas, jury-criterion chart (weights flagged as a team assumption) | — |
| 8 | Render path (optional) | Codex / gpt-image-2, run by the person | Capture + prompt → AI image, labelled | The person selects; four review ticks |
| 9 | Decide and submit | **Person** | Boards, City enquiries | **G3–G7** stay with people; the City View Cone Assessment governs |

The AI is not an open agent inside the tool. It works before the tool (research, code) and at one optional, labelled step (render).

## 7. Methodology

- **Stack:**
  - Vite 8, React 19, TypeScript, three.js with react-three-fiber and drei;
  - @xyflow/react 12, Zustand 5, Tailwind 4, lucide icons;
  - rhino3dm and web-ifc for import and export;
  - Vitest, plus Playwright and axe for end-to-end and accessibility tests;
  - Python 3.13 scripts for the data pipeline (`tools/`).
- **Data:**
  - City of Vancouver open data (OGL-Vancouver): view cones, 2015 footprints, LiDAR 2022 (the 4 central tiles processed 27 Oct: 1,358 footprints with heights, 5,363 still unknown outside the core), streets, parks, schools; since 27 Oct public trees, parcel polygons, the 2026 property tax report, zoning, heritage sites, traffic count locations and Shoreline 2002;
  - NRCan MRDEM-30 terrain (OGL-Canada), converted to CGVD28 with NRCan geoid grids;
  - Vista's unified building model (Ruijie Liu, vancouver-tall-view-tool @ 917b28e): OpenStreetMap footprints and heights, © OpenStreetMap contributors, ODbL;
  - Environment Canada weather at YVR, 2016–2025;
  - VTC brief, Public Views Guidelines, Solar Access Guidelines for the Downtown Peninsula, VBBL / NBC clauses, cited per rule.
- **Research:**
  - 17 module packets (P01–P17) and 5 Context Model packets (C01–C05), with sources, critique rounds and false assumptions logged;
  - specs in `docs/research/`; the module registry is `src/data/research_registry.json`.
- **Checking:**
  - unit tests (586 passing on 22 Oct);
  - evaluation cases (§9);
  - evidence lint;
  - accessibility checks;
  - user sessions from November (§11).

## 8. First attempt (mid review)

**The step:** given a tower at a real downtown location, estimate how high each protected public view allows it to go, or **stop and say "no estimate"**.

**How:** the height limit is a rising sight line, `Z = Lv + k × D` (planar, along the wedge bisector). Lower-boundary slopes `k` exist for 8 cones (A, 3.2.3, 3.2.4, 28, H, J2, 27.1, 27.2); every other cone reads "limit unknown".

**What it showed:**
- the City data has no published cone heights;
- most of the business district lacks parameters;
- the base model's north is wrong.

**Next step:** City Request 0, drafted in `docs/city-requests/` for the team to submit.

Spec: `docs/mid-review/FIRST_ATTEMPT_SPEC.md`.

## 9. Evaluation cases (`npm run eval`)

**27 cases, 27 pass on 22 Oct.** The brief's four types are all covered:
- **typical:** regression against City sheet points, cones A and 3.2.3;
- **boundary or conflicting:** e.g. case 5 near the cone 3.2.3 limit;
- **out of scope, must stop:** cases 3 and 4 return **NO ESTIMATE**;
- **repeated run:** case 7, five runs with identical output, because there is no model in the loop.

There is also one typical and one out-of-scope case for each major node, plus Vista reference cases. Every case records input → expected → observed → pass/fail with a screenshot and the flag shown.

- Reports: `docs/evaluation/<date>/report.md`; the last run is also shown on the app's **Status** page.
- Finding kept visible: cone 28 at the Council reference distance reads **65.90 m vs the report's 65.7 m**. That points to the open eye-height and datum questions in City Request 0.

## 10. What is built (22 Oct 2026)

**Built nodes (30; *Your model: upload & provenance* added 3 Nov):**

| Node | Category | Stage | Projects |
|---|---|---|---|
| VTC hard rules | SITE | Massing | VTC |
| Program & FSR accounting | PROG | Massing | both |
| View-cone height check | SITE | Massing | Real Vancouver |
| Vista view studies | SITE | Massing | Real Vancouver |
| Your model: upload & provenance | SITE | Massing | both |
| View from here (roofs, floors, street) | SITE | Massing | Real Vancouver |
| Relaxations & aviation | SITE | Massing | both |
| Sun & shadow preview | CLIM | Massing | both |
| Solar access & sun hours (City guideline test) | CLIM | Massing | both |
| Pedestrian wind: study trigger | CLIM | Massing | both |
| Pedestrian wind: massing screen (screening, not CFD) | CLIM | Massing | both |
| Streetwall & tower form | PUBL | Massing | VTC |
| Active frontage | PUBL | Massing | VTC |
| Open space & links | PUBL | Massing | VTC |
| City in Nature ledger (incl. rainwater, bird glazing) | ECOL | Massing | both |
| Program value & land residual (+ construction cost, ACC / DCL / DCC) | PROG | Massing | both |
| Engagement & claims guard | CULT | Massing | both |
| AI use & provenance log | CULT | Massing | both |
| Core & lift check (sky lobbies, strategy comparator) | SYST | Schematic | both |
| Egress & stairs | SYST | Schematic | both |
| Code & life safety | SYST | Schematic | both |
| Public sky room | PUBL | Schematic | both |
| Structure: system & seismic | STRC | Schematic | both |
| Wind procedure (slenderness) | STRC | Schematic | both |
| Energy & carbon | ENER | Schematic | both |
| Parking, loading & bikes | MOBI | Schematic | both |
| Trips & station entrance | MOBI | Schematic | both |
| Facade: glazing & bird safety | SPAC | Schematic | both |
| Interior & activity programme | SPAC | Schematic | both |
| Daylight screen (plate depth) | SPAC | Schematic | both |

**Pages and features:**

| Feature | Where in the app |
|---|---|
| Landing | `#/start` |
| User guide | `#/guide` |
| Customize | `#/customize` |
| Design options compare | `#/options` |
| Sources & assumptions | `#/sources` |
| Status: done / to-build, evaluation | `#/status` |
| Upload a Rhino model (map layers to roles; read in the browser only) | Landing page, Project menu, drop anywhere; *Your model* node |
| Import, export, save/load/undo | Project and Export menus |
| Boards, drawings, AI render workflow | Present stage |
| Decision trace and rule cards | Trace tab |
| Offline installable app | PWA |
| Demo project + guided tour | Landing page |

## 11. Left to build, user track and logs

**Left to build** (full list: `docs/overnight/MORNING_REPORT_2026-10-22.md` §C):
- **By 13 Nov (working core):**
  - ~~LiDAR heights for the remaining 3 downtown tiles~~ done 27 Oct (4 tiles mosaicked). 5,363 footprints outside the 2 × 2 km core stay "height unknown"; more tiles (browser download, ~1 GB each) would extend it;
  - ~~context layers in the app~~ done 27 Oct (trees, parcels and land value, zoning, heritage, traffic locations);
  - cone calibration against City sheets (waits on City Request 0);
  - workflow run modes (run-all / step-in);
  - Form Studio, Sinnie's and Willem's tools as nodes (permissions);
  - a geometry kernel for booleans.
- **By 10 Dec (v1):**
  - shared node registry and live comments;
  - depth and line conditioning for renders;
  - 13 solar plazas without an official outline;
  - envelope performance, street comfort, mass-timber limits;
  - hosting.
- **Roadmap:**
  - CFD wind (no credible browser engine), smoke control, IFC export;
  - desktop app or Rhino panel.

**User track (brief p.4):**
- No user is matched yet. At least one confirmed user is due **by Fri 6 Nov**.
- Three sessions follow: before peer review 1, by 27 Nov, and by 3 Dec.
- Record each in a user-study log (date, who or role, what they tried, what worked, what confused them, what they asked for, what changed, with a link to the commit). *The log file is still to be created.*

**Build log (brief p.5):** each person keeps their own running record of working with AI: what was asked, what came back, what was kept, changed or rejected, and why. Research logs and overnight build records are in `docs/research/` and `docs/overnight/`.

**Who did what** (the brief requires this in the README for pairs): *to be filled in by Ruijie and Sinnie.*

## 12. Milestones (from the brief)

| Date | Milestone |
|---|---|
| Fri 23 Oct | Mid review (LRS 309): diagrams, pitch, 150-word proposal (written by the team), first attempt |
| Fri 6 Nov | User matched |
| Fri 13 Nov / Tue 17 Nov | Peer review 1: working core, end to end on a real input, first evaluation cases |
| Fri 27 Nov | Peer review 2: a classmate installs and runs it from the README alone |
| Thu 10 Dec | Final review (LRS 211): live tool, repository + README, diagrams, evaluation cases, user-study log, build logs |

## 13. Repository and data policy

- **Code:** MIT (`LICENSE`, "Tower Design Toolkit contributors"). Vista and PVV code ported from Ruijie's own repositories; ⬜ Ruijie to confirm the MIT relicensing (those repositories have no licence file).
- **Public data:** City of Vancouver (OGL-Vancouver) and NRCan / Environment Canada (OGL-Canada), with attribution in `public/data/layers.json` and the README.
- **Not public:**
  - the VTC competition model (`public/local/`, ignored);
  - the studio context model and everything derived from it;
  - raw LiDAR and other raw downloads (`../context-data/`);
  - course PDFs and the competition brief;
  - draft messages to people.

  The brief says to keep the repository public where the data allow, and to provide a shareable substitute where they don't. The Real Vancouver project is that substitute.

## 14. Repository map

```
tower-studio/
  src/
    engine/      deterministic engines (one file per node family) + tests
    components/  UI (Viewport, NodeLibrary, Inspector, Present, ...)
    pages/       Landing, Guide, Customize, Options, Sources, Status
    data/        registry.ts (built nodes), research_registry.json, ruleCards.ts, stages.ts, icons.ts
    lib/         import / export, interchange (Layer 0 model + converters), project file, evidence lint, PWA, sandbox, registry
    eval/        evaluation cases (cases.ts)
    store.ts     Zustand state
  public/data/   compact City and NRCan layers (with layers.json provenance)
  public/local/  PRIVATE competition model (git-ignored)
  skills/        tower-studio-node-builder skill (for any AI model)
  tools/         Python and Node data pipeline, eval runner, render script
  e2e/           Playwright end-to-end and accessibility tests
docs/          copy of the team's ../04 Tool Plan: PLAN.md (tracker), CONTEXT_MODEL_SPEC.md, research/, evaluation/, mid-review/, overnight/ (tools/sync_docs.py)
```

## 15. Run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run eval       # evaluation cases → report in ../04 Tool Plan/evaluation/<date>/ (copied into docs/ by tools/sync_docs.py)
npm run build      # production build (installable, works offline)
```

The competition model is optional and private: `npm run context:vtc` (see `tools/build_vtc_context.py` for the input path) writes `public/local/vtc_context.json`. Without it, use the **Real Vancouver** project.

## 16. Glossary

- **Layer 0:** the project's base data. Towers, storeys, program by floor, core, north and datum; everything the nodes read. An uploaded model adds the **interchange model** (`models` in the project file): its elements by role, with provenance (`docs/INTERCHANGE.md`).
- **Node:** one evaluation or tool, with a category, stage, sources and flags.
- **Lv, k:** a view cone's origin elevation and lower-boundary slope, in `Z = Lv + k·D`.
- **CGVD28:** the vertical datum used throughout.
- **VTC:** Vancouver Tall Challenge.
- **HBP:** Higher Buildings Policy.
- **VBBL:** Vancouver Building By-law.
- **ACC / DCL / DCC:** Amenity Cost Charge, Development Cost Levy, Development Cost Charge.
- **G2b–G7:** human decision gates in the tool-logic diagram.
