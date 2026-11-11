# Connected design tools: `tower-studio-design-tool@1`

*11 Nov 2026 · Tower Design Toolkit · code in `src/lib/designTools/` · brief: `04 Tool Plan/connected-tools/BRIEF.md` §13 (developer handoff). First adapter: Form Studio. Companion for AI agents: `skills/tower-studio-node-builder/references/design-tool-contract.md`.*

A **connected design tool** is a web page someone else wrote (Form Studio, a terrace generator, a façade tool) that joins the Toolkit as an ordinary workflow node. The person picks one tower, agrees to what is sent, works in the tool inside the Toolkit's central workspace, and the tool **proposes** a change. The Toolkit checks the proposal, shows it as a ghost next to the current tower, and only **Apply** changes the model: one coherent change, one Undo step, provenance kept. The tool never touches the model, the store or the page.

**Walkthrough (53 s):** [docs/media/add-my-tool.mp4](media/add-my-tool.mp4), recorded by `e2e/record/add-my-tool.record.ts` (Edge, the served copy of Form Studio with its bridge, the real competition context) and converted by `tools/record_to_mp4.mjs`. Twelve captions: Import › Add my tool, the preview, My tools (Connected), the Form phase, the tower to send, the permission statement, the tool in the centre, the change made there, Send, the Proposal tab with the ghost, Apply, Ctrl+Z.

Three records, kept apart (`src/lib/designTools/contract.ts`):

| Record | Format | Lives | Holds |
|---|---|---|---|
| **Tool definition** | `tower-studio-design-tool@1` | My tools, this browser (`localStorage` `tower-studio.design-tools`) | What the tool is, how it connects, what it reads and may change |
| **Tool instance** | one per tool per project; node id = tool id | same store | Targets picked, the tool's last parameters, run history, Toolkit id → tool key mappings |
| **Proposal** | `tdt-design-tool@1` message | this visit only, until Apply or Discard | The operations the tool wants, with the ids that tie it to one run |

The evaluation-node format `tower-studio-node@1` (`src/lib/nodePackages.ts`, the node-builder skill) is untouched: it reads numbers and returns numbers. A design tool is a different format with its own validator, store and apply path.

## 1. The tool definition

A definition is one JSON file, checked by `checkDefinition()` in `src/lib/designTools/validate.ts`. It goes in through the transfer centre (purpose **Add my tool**), is validated, previewed (name, version, author, what it sends, to whom, operations, phases) and added with **Add to My tools**. Nothing in a definition executes: it is data. Field by field:

| Field | Required | Meaning | Rule (`validate.ts`) |
|---|---|---|---|
| `format` | yes | `"tower-studio-design-tool@1"` | exact |
| `id` | yes | `tool.<handle>`: the node id in workflows and the instance key. Stable across versions. | `tool.` + lower-case letters, digits, hyphens (2–41 chars) |
| `version` | yes | The tool's version. A proposal from another version is accepted with a warning. | non-empty |
| `name` | yes | Library name | non-empty |
| `purpose` | yes | One sentence: what it changes and why | non-empty |
| `author` | yes | `{ name, url? }` | `author.name` non-empty |
| `licence` | yes | The tool's licence, in words | non-empty |
| `icon` | no | An icon brief or image, exactly as node packages carry it (`lib/nodeIcons/fromPackage.ts`); kept apart from behaviour | not checked here |
| `phases` | yes | Where it may be placed: `site`, `form`, `program`, `schematic`, `present` | ≥ 1, from that list |
| `connection` | yes | `{ method: "web", url, origin, protocol: "tdt-design-tool@1" }`. The page opened in the iframe and the one origin the host will talk to. | `method` is `web` (only method in this version); `url` is http(s); `origin` equals `new URL(url).origin`; never `"*"`; http is a warning unless localhost |
| `runtime` | yes | `{ browser: true, network: [origins] }`: the tool runs in the browser; the origins it talks to | shape |
| `inputs` | yes | What it needs: `tower.selected` and/or `site.outline` | from that list |
| `outputs` | yes | What it gives back: `geometry.storeys` and/or `parameters` | from that list |
| `operations` | yes | The proposal operations it may use: `replace-geometry`, `set-parameter` | ≥ 1, from that list; deletion is never allowed |
| `units` | yes | `{ length: "m", frame: "tower-local", up: "z" }` | exact |
| `destination` | yes | The permission statement's material: `sends` (plain words of what goes), `to` (whom), `stores` (where the tool keeps it) | all present |
| `limits` | yes | Sentences on what it cannot do (may be empty) | a list |
| `editability` | yes | `externally-generated` (the Toolkit keeps the geometry as it came) or `native-parameters` (the tool only sets tower fields) | one of the two |

### The Form Studio definition (the example)

Form Studio (`RuijieLiu6/form-studio`, public at `https://ruijieliu6.github.io/form-studio/`) builds a tapered, twisted plate profile with a podium retreat. Its bridge (`toolkit-bridge.js`) is on a local branch of that repository, not yet pushed or deployed, so this milestone registers the copy served from this computer on port 5577 (a **demonstration** of the real code; once the bridge is on GitHub Pages the url and origin become `https://ruijieliu6.github.io/form-studio/` and `https://ruijieliu6.github.io`). Its definition (`public/tools/form-studio.tool.json`):

```json
{
  "format": "tower-studio-design-tool@1",
  "id": "tool.form-studio",
  "version": "0.1.0",
  "name": "Form Studio",
  "purpose": "Reshapes the selected tower's plates: taper, twist, proportion and podium retreat, floor by floor.",
  "author": { "name": "Ruijie Liu", "url": "https://github.com/RuijieLiu6/form-studio" },
  "licence": "No LICENSE file in the repository yet: add one before sharing the tool",
  "phases": ["form"],
  "connection": {
    "method": "web",
    "url": "http://localhost:5577/index.html",
    "origin": "http://localhost:5577",
    "protocol": "tdt-design-tool@1"
  },
  "runtime": { "browser": true, "network": ["http://localhost:5577"] },
  "inputs": ["tower.selected"],
  "outputs": ["geometry.storeys", "parameters"],
  "operations": ["replace-geometry"],
  "units": { "length": "m", "frame": "tower-local", "up": "z" },
  "destination": {
    "sends": ["the tower's name, plan size, height, storey count, floor-to-floor, podium size and footprint", "your last Form Studio settings"],
    "to": "Form Studio, served from this computer (localhost:5577), inside this window",
    "stores": "its own settings in that page's localStorage; nothing is sent to a server"
  },
  "limits": [
    "Position and rotation stay in the Toolkit: Form Studio works in the tower's own frame.",
    "Terraces, structure and the Vancouver map mode are not part of the exchange.",
    "The returned plates are externally generated: the Massing sliders do not reshape them."
  ],
  "editability": "externally-generated"
}
```

`version` is the bridge's version, not a Form Studio release (the repository has no tags). The file is served by the Toolkit at `public/tools/form-studio.tool.json` once the bridge is deployed; until the public copy of Form Studio carries `toolkit-bridge.js`, a locally served copy is a **demonstration** of the protocol against the real code, and the definition's `url`/`origin` point at that local server (`http://localhost:<port>`).

## 2. The input snapshot (`tdt:inputs`)

What the host sends the tool, built by `makeSnapshot()` in `src/lib/designTools/snapshot.ts`. **Scope rule (brief §6):** only the targets the person chose (one tower in this milestone), the frame, and the tool's own last parameters. Never the other towers, the site, the city or any result, unless the definition lists `site.outline` in `inputs`.

```ts
interface InputSnapshot {
  protocol: 'tdt-design-tool@1'
  type: 'tdt:inputs'
  sessionId: string          // this visit of the Toolkit (store.sessionId)
  runId: string              // new UUID per send; the proposal must echo it
  projectId: string          // '<vtc|city>:<project name or untitled>'
  toolId: string             // the definition's id
  baseRevision: string       // modelRevision(towers): FNV-1a of the towers' JSON (lib/workflow/phasePackage.ts)
  units: { length: 'm', frame: 'tower-local', up: 'z' }
  frame: { northDeg: number, groundElevation: number }   // for information; the tool works in the tower-local frame
  targets: SnapshotTarget[]  // one per chosen tower
  parameters: Record<string, unknown> | null             // the tool's own state from its last run, opaque to the host
}
interface SnapshotTarget {
  id: string; name: string
  width: number; depth: number; height: number           // m; height = top of the stacked blocks, else the tower height
  storeys: number                                        // imported: storeys with a floor; parametric: tower + podium floors
  f2f: number; rotation: number                          // m; degrees (rotation stays host-side)
  podium: { height: number; width: number; depth: number }
  footprint: [number, number][]                          // tower-local, m, counter-clockwise; imported towers send their hull,
}                                                        // parametric ones the larger of plate and podium as a rectangle
```

Tower-local frame: origin at the tower's plan centre, x along its width, y along its depth, z = 0 at site grade, metres. The Toolkit keeps `x`, `y` and `rotation`; the tool never needs them.

## 3. The Design Change Proposal (`tdt:proposal`)

What the tool sends back. The tool proposes; it never mutates. Every field is required unless marked.

```ts
interface Proposal {
  protocol: 'tdt-design-tool@1'
  type: 'tdt:proposal'
  toolId: string; toolVersion: string
  sessionId: string; runId: string; projectId: string; baseRevision: string   // echoed from the snapshot
  units: { length: 'm', frame: 'tower-local', up: 'z' }
  operations: Operation[]
  parameters: Record<string, unknown> | null   // the tool's state that made this; kept with the tower for regeneration
  assumptions: string[]                         // sentences shown to the person
  warnings: string[]                            // sentences shown as "Tool: …" warnings
}
```

Operations allowed now (two; `src/lib/designTools/contract.ts`):

| `op` | Fields | Effect on Apply |
|---|---|---|
| `replace-geometry` | `target` (tower id from the snapshot), `storeys: [{ z0, z1, loops, podium?, use? }]`, `keep?: ['name','bands','skyLobbies','interior']` | The tower becomes an imported mass of those storeys with a prism mesh (`geometry.ts massFromStoreys`); id, name, bands and design inputs are carried over (`lib/interchange/apply.ts updateTower`); the core is re-sized (`withAutoCore`) |
| `set-parameter` | `target`, `field` ∈ `width, depth, height, f2f, rotation, podiumHeight, podiumWidth, podiumDepth`, `value` (0–600) | That field is set on the tower |

A storey: `z0`/`z1` in metres from grade, `loops` as plate outlines in the tower-local frame (first loop the outer ring, later loops holes; orientation is normalised by the host), `podium: true` for podium storeys, `use` one of `retail, office, hotel, residential, civic, amenity, mechanical` (else the tower's first band's use, or the podium use for podium storeys).

**Excluded:** deletion (no operation removes a tower; brief §7 needs separate permission), `add-geometry`, `update-program` and `attach-artifact` (reserved; rejected as "not an allowed operation"). No state paths, callbacks, code or store references of any kind.

### Validation (`checkProposal()`, no silent repair)

Every problem is a sentence; one problem blocks Apply; warnings do not. Context the host passes: the definition, the waiting run (`store.run`), the current `modelRevision(towers)`, and the run ids already applied in this project.

| Rule | Message |
|---|---|
| protocol/type | `Not a tdt-design-tool@1 proposal.` |
| toolId equals the definition's | `It comes from <id>, not <def.id>.` |
| toolVersion equals the registered one | warning `Made by version <v>; <registered> is registered.` |
| a run is waiting | `No run is waiting for a proposal (it was cancelled, or it arrived twice).` |
| sessionId | `It belongs to another session.` |
| runId equals the active run | `It answers another run (cancelled or already finished).` |
| projectId | `It was made for another project.` |
| runId not applied before | `This proposal was already applied.` |
| units | `Units must be metres in the tower-local frame, z up (got <units>).` |
| at least one operation | `No operations.` |
| op name | `operation N: "<op>" is not an allowed operation (replace-geometry, set-parameter).` |
| op in the definition's `operations` | `operation N: the tool is not registered for <op>.` |
| target present and in the snapshot | `operation N: no target.` / `operation N: target <id> was not among the objects sent to the tool.` |
| set-parameter field | `operation N: "<field>" is not a settable field (width, depth, …).` |
| set-parameter value | `operation N: value must be a finite number between 0 and 600.` |
| storeys present, ≤ 200 | `operation N: replace-geometry needs storeys.` / `… more than 200 storeys.` |
| z0, z1 finite, z1 > z0, rising in order, ≤ 600 m | `operation N, storey K: z0 and z1 must be finite numbers.` / `… z1 must be above z0.` / `… storeys must rise in order (this one starts below the one before).` / `… higher than 600 m.` |
| loops present; each ≥ 3 points, ≤ 512 points, finite pairs, within 1 km | `… no loops.` / `…, loop J: a loop needs at least 3 points.` / `… more than 512 points in one loop.` / `… a point is not two finite numbers.` / `… a point lies more than 1 km from the tower (units or frame wrong?).` |
| outer plate ≤ 12 000 m² (a podium may cover the whole competition block, 11 468 m²) | `operation N, storey K: plate of <a> m² is larger than 12000 m².` |
| outer plate ≥ 25 m² | warning `<n> storeys under 25 m² will count as voids, not floor area.` |
| `use` is a string | `operation N, storey K: use must be a use id.` |
| assumptions/warnings are lists | `<key> must be a list of sentences.` |
| size ≤ 8 MB | `The proposal is <x> MB, more than 8 MB.` |
| **stale** (separate flag, not a problem) | `baseRevision` differs from the run's, or the model changed since the send: the proposal shows **based on an older model** and Apply is blocked (`applyPending` refuses with `The model changed since the inputs were sent. Run the tool again.`) |

Limits (`LIMITS`): height 600 m, plate 12 000 m², 200 storeys, 512 points per loop, 8 MB, floor area 25 m².

## 4. Connection lifecycle

```
Library → My tools → Add tool (definition checked, previewed, added)          state: Connected
Workflow card → Open tool
  host: iframe src = connection.url + ?host=<location.origin>&session=<sessionId>
  tool: parent.postMessage({ protocol, type:'tdt:ready', toolId, toolVersion }, hostOrigin)
  host: (source + origin checked) → waits for consent + a target
  person: "I understand, send"  (permission statement: what, to whom, why)
  host: store.startRun(snapshot); iframe.contentWindow.postMessage(snapshot, connection.origin)      run: sent
  tool: seeds its state from targets[0] and parameters; shows "Send to Toolkit"
  tool: parent.postMessage(proposal, hostOrigin)
  host: checkProposal → store.setPending({ proposal, check, receivedAt }); endRun('returned' | 'rejected')
        right panel tab "Proposal": summary · changes · validation · impacts · Apply / Discard
        viewport: ghost group 'tool-proposal-ghost' (translucent, never in captures)
  person: Apply   → applyPending(): one store write, one Undo step, provenance, run 'applied'
          Discard → discardPending(): nothing changes, run 'discarded'
          Update preview → a fresh snapshot = a new runId (the old run can no longer answer)
          close the workspace → the proposal stays pending; the viewport underneath was never unmounted
```

- **Run ids.** `runId` is a new UUID per send (`newId()`), kept in `store.run` while the host waits. A proposal with another `runId`, or arriving after Apply, Discard, cancel or a new send, is rejected ("answers another run" / "no run is waiting"). A run id that was applied is refused for ever in this project (`appliedRuns`).
- **Cancel.** The tool may post `{ protocol, type:'tdt:cancel', runId }`; the host ends the run as `cancelled` and a later proposal for it is dropped. The person's Discard, or a new send, cancels from the host side.
- **Stale.** `baseRevision` must equal the current `modelRevision(towers)` when the proposal arrives *and* when Apply is pressed. Otherwise the proposal shows **based on an older model**; the person can Update preview (new snapshot) or Discard. Nothing is ever applied silently over a changed model.
- **Repeat runs.** A rerun on the same target replaces that tower's geometry again (same tower id, `mappings[targetId] = targetId`); it never adds a second tower. Each run is in `instance.runs` (last 20) with its status: `sent | returned | applied | discarded | cancelled | stale | rejected`.
- **Keeping context.** The instance keeps `targets` and `parameters` between visits (persisted); the workspace is an overlay inside `<main>`, so the phase panel, the right panel, the model and the camera stay as they were.

The phase-panel controls (`data-testid="tool-controls"`, `data-state` = `idle | consent | waiting | returned | stale | applied | error`): `tool-targets` (select a tower), `tool-consent` ("I understand, send"), `tool-open` (Open tool), `tool-send` (Update preview), `tool-apply`, `tool-discard`, `tool-status` (live region, always a word). Library state chip `tool-state-<id>`: **Connected** · **Connection required** · **Missing runtime** · **Unsupported version** · **External reference**.

## 5. Security rules

1. **Pinned origins both ways, never `'*'`.** The host posts only to `definition.connection.origin`. The tool posts only to the `host` query parameter, and only if that origin is in its allowlist (`localhost` / `127.0.0.1` on any port, `https://ruijieliu6.github.io`); otherwise the bridge does nothing at all.
2. **Source check.** The host accepts a message only if `e.source === iframe.contentWindow && e.origin === definition.connection.origin` and `msg.protocol === 'tdt-design-tool@1'`; then `checkProposal` checks session, run, project, revision and payload. The tool accepts only `e.origin === hostOrigin` (and, best practice, `e.source === window.parent`, `sessionId === session` from the query).
3. **Sandboxed iframe.** `<iframe sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer">`: scripts run, the tool keeps its own origin (so origin checks work and `'null'` never appears), no top-navigation, no forms to other sites, no popups. The tool's embedding restrictions are respected: a page that refuses framing shows **Connection required**.
4. **Nothing executes from a dropped package.** Registration parses and validates a definition; no field is code, no URL is fetched at registration. The only network use is the iframe the person opens on purpose, after reading the permission statement.
5. **Isolated from the store.** The tool gets a snapshot and returns a proposal; it has no handle on the Zustand store, the DOM, files, results or other towers. The code-node sandbox (`lib/sandbox`) is a different thing and is untouched.
6. **Consent is explicit and per tool** (`store.consented[toolId]`, this browser): no data is sent on selecting a card, opening the library or placing the node; only the consent button and then **Update preview** send.
7. **Two undo stacks.** Toolkit **Undo** takes back an Apply (one step, `Ctrl+Z`). It does not reach into the tool: what the person changed inside the tool stays changed there (the tool keeps its own state and its own undo). Uninstalling a tool never deletes an accepted tower or its mesh.

## 6. Worked example: 36 × 30 m, 20 storeys, 4 m floor-to-floor

The test harness (`public/tools/test-tool.html`, titled a demonstration harness, served by the Toolkit itself at `/tools/test-tool.html`, definition `public/tools/test-tool.tool.json`, id `tool.test-tool`) answers every snapshot with one fixed, hand-checkable change: **widen by 4 m and taper 3 %**. Podium storeys (round(podium.height / 4.5) of them, use retail) keep the podium footprint; the tower storeys are rectangles (width + 4) × depth, scaled linearly from 1 at the first tower storey to 0.97 at the last, use residential, floor-to-floor from the target.

**Snapshot the host sends** (ids shortened):

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:inputs",
  "sessionId": "s-…", "runId": "r-…", "projectId": "vtc:untitled", "toolId": "tool.test-tool", "baseRevision": "9a1f3c2e",
  "units": { "length": "m", "frame": "tower-local", "up": "z" }, "frame": { "northDeg": 45, "groundElevation": 0 },
  "targets": [ { "id": "t1", "name": "Tower 1", "width": 36, "depth": 30, "height": 80, "storeys": 20, "f2f": 4, "rotation": 0,
                 "podium": { "height": 0, "width": 0, "depth": 0 },
                 "footprint": [[-18,-15],[18,-15],[18,15],[-18,15]] } ],
  "parameters": null }
```

(`storeys` = round((80 − 0) / 4) + round(0 / 4.5) = 20; `footprint` = half-extents of max(width, podiumWidth) × max(depth, podiumDepth).)

**Proposal the harness returns** (storey k = 0…19: scale s = 1 − 0.03·k/19; plate (40·s) × (30·s); `z0 = 4k`, `z1 = 4(k+1)`):

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:proposal", "toolId": "tool.test-tool", "toolVersion": "0.1.0",
  "sessionId": "s-…", "runId": "r-…", "projectId": "vtc:untitled", "baseRevision": "9a1f3c2e",
  "units": { "length": "m", "frame": "tower-local", "up": "z" },
  "operations": [ { "op": "replace-geometry", "target": "t1", "keep": ["name", "bands"], "storeys": [
    { "z0": 0,  "z1": 4,  "loops": [[[-20,-15],[20,-15],[20,15],[-20,15]]], "podium": false, "use": "residential" },
    "… storey k: a (40·s) × (30·s) rectangle centred on the axis, z 4k … 4(k+1) …",
    { "z0": 76, "z1": 80, "loops": [[[-19.4,-14.55],[19.4,-14.55],[19.4,14.55],[-19.4,14.55]]], "podium": false, "use": "residential" } ] } ],
  "parameters": { "schema": "test-tool/1", "widen": 4, "taper": 0.03 },
  "assumptions": ["Plates are centred on the tower axis; the Toolkit keeps the tower's position and rotation."], "warnings": [] }
```

**What the host computes** (`massFromStoreys`, `proposedTowers`):

| Quantity | Before (parametric) | Proposed | How |
|---|---|---|---|
| Storeys | 20 | 20 | one per entry, levels 1–20 |
| Plate, storey 1 | 1 080 m² | 1 200 m² | 40 × 30 |
| Plate, storey 20 | 1 080 m² | 1129.1 m² | 38.8 × 29.1 (s = 0.97) |
| Gross floor area | 21 600 m² | **23,287 m²** | 1 200 · Σ s² |
| Volume | 86 400 m³ | **93,150 m³** | GFA × 4 |
| Top | 80 m | 80 m | max z1 |
| f2f | 4 m | 4 m | (80 − 0) / 20 tower storeys |
| Podium top / f2f | 0 / — | 0 / 4.5 (default, no podium storeys) | |
| Hull | — | `[[-20,-15],[20,-15],[20,15],[-20,15]]` | convex hull of all corners (the widest storey) |
| Mesh | — | 160 vertices, 240 triangles | per storey 8 vertices; 2 caps × 2 triangles + 4 walls × 2 |
| Use | from the bands | residential on every storey | the harness sets `use` |
| Validation | | ok, not stale, no warnings | every plate ≥ 25 m², ≤ 12 000 m², rising z, ≤ 600 m |

After Apply: `towers[0]` keeps `id t1`, `name Tower 1`, `x`, `y`, `rotation` and its bands; gains `imported` with `format 'design-tool'`, `fileName 'Test tool (connected tool)'`, the 20 storeys, and `imported.tool = { toolId: 'tool.test-tool', version: '0.1.0', runId, at, parameters }`. The other towers are the same objects as before.

## 7. Error and cancellation examples

Each shows what the tool sent and the exact words the Toolkit shows (validation lines are StatusRow-like: a symbol and a word, then the sentence).

**1 · Wrong units (acceptance step 17).** The tool answered in millimetres in the world frame:

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:proposal", "toolId": "tool.form-studio", "toolVersion": "0.1.0",
  "sessionId": "s-…", "runId": "r-…", "projectId": "vtc:untitled", "baseRevision": "9a1f3c2e",
  "units": { "length": "mm", "frame": "world", "up": "z" },
  "operations": [ { "op": "replace-geometry", "target": "t1", "storeys": [ { "z0": 0, "z1": 4000, "loops": [[[-18000,-15000],[18000,-15000],[18000,15000],[-18000,15000]]] } ] } ],
  "parameters": null, "assumptions": [], "warnings": [] }
```

Shown: **✕ Fail** `Units must be metres in the tower-local frame, z up (got {"length":"mm","frame":"world","up":"z"}).` and **✕ Fail** `operation 1, storey 1, loop 1: a point lies more than 1 km from the tower (units or frame wrong?).` Run status **Rejected**; Apply is not offered.

**2 · A forbidden operation.** The tool tried to delete the tower:

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:proposal", "toolId": "tool.form-studio", "toolVersion": "0.1.0",
  "sessionId": "s-…", "runId": "r-…", "projectId": "vtc:untitled", "baseRevision": "9a1f3c2e",
  "units": { "length": "m", "frame": "tower-local", "up": "z" },
  "operations": [ { "op": "delete-geometry", "target": "t1" } ],
  "parameters": null, "assumptions": [], "warnings": [] }
```

Shown: **✕ Fail** `operation 1: "delete-geometry" is not an allowed operation (replace-geometry, set-parameter).` Run status **Rejected**.

**3 · Cancelled, then a late answer (acceptance step 15).** The tool cancels:

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:cancel", "runId": "r-…" }
```

Shown in `tool-status`: the word **Cancelled**, with a sentence that nothing changed. The run is recorded `cancelled` (`endRun('cancelled')`), `store.run` is cleared. If the same tool then posts a proposal for that `runId`, it is dropped with **✕ Fail** `No run is waiting for a proposal (it was cancelled, or it arrived twice).` and the model stays as it was.

**Also seen:** a proposal after the person edited the tower (acceptance step 16) passes every check but is marked **! Stale** `based on an older model`: Apply is blocked, Update preview starts a new run. A tool page that never posts `tdt:ready` (blocked origin, offline, refused framing; step 18) leaves the workspace at **Waiting** and the library chip at **Connection required**; nothing is sent.

## 8. Honest editability

A tower that came back from a tool is **externally generated** (`definition.editability`, `imported.format = 'design-tool'`). The Toolkit shows it as it came: the Massing sliders change the tower's numbers (`width`, `height`…) but do **not** reshape the returned plates, exactly as for an uploaded Rhino mass. To change the shape, reopen the tool: it is seeded with the kept parameters (`imported.tool.parameters`, also `instance.parameters`) and regenerates. The Toolkit makes no claim that the tool's parametrics are preserved inside the Toolkit; it keeps the tool id, version, run id, time and parameters so that the tool can.

The four classes, for the record: native parameters (Toolkit towers, blocks) · externally generated (this) · imported with local edits (an uploaded mass whose storey uses were tagged by hand: the tags are kept on replace, `keep`) · reference only (a definition in My tools whose tool is not reachable: **External reference**).

## 9. What an exported project discloses

- **Project file** (Export .json / Save as): for each applied tower, `imported.tool = { toolId, version, runId, at, parameters }` and `imported.fileName = '<tool name> (connected tool)'`, `format 'design-tool'`; the mesh under `importedMeshes` (autosave omits meshes, as for uploads). Anyone opening the file sees which tool and version made the geometry and the tool's parameters, including whatever the tool put in `parameters`.
- **Not in the file (this milestone):** the definition itself (its URL and origin), the run history and the consent record stay in this browser's `localStorage` `tower-studio.design-tools`. A project opened elsewhere keeps the geometry and provenance but has no connection until the tool is added there.
- **No secrets exist to leak:** the protocol has no tokens or accounts. The `host` and `session` query parameters are visible to the tool's server in its access log (a static host sees the Toolkit's origin and a random session id, nothing else).
- The trace records `Applied <tool> <version> (run <id>) to <towers>` as a checkpoint.

## 10. Building a bridge for another web tool (copy this)

For a developer or an AI agent. Any static web page can become a design tool with one script and a definition file.

1. Add `toolkit-bridge.js` (below) to the page and load it as a module after the tool's own state exists. Replace `seed`, `storeys` and `state` with the tool's own functions: `seed(target, parameters)` loads the incoming tower size and the tool's last state; `storeys()` returns `[{ z0, z1, loops: [[[x,y],…]], podium?, use? }]` in metres, tower-local, z up, rising; `state()` returns the tool's serialisable state.
2. Add a visible control with id `send-to-toolkit` (hidden until inputs arrive) that calls `send()`; optionally one that calls `cancel()`.
3. Write the definition (section 1) with the page's URL and origin, and give both to the person to add under My tools. Test with the Toolkit served on `localhost`: the allowlist already includes it.
4. Never post to `'*'`, never act on a message whose origin is not the `host` parameter, never read `window.parent` state, never store what was sent anywhere but the page's own storage, and say so in `destination.stores`.

```js
// toolkit-bridge.js — makes this page a Tower Design Toolkit design tool (tdt-design-tool@1).
const PROTOCOL = 'tdt-design-tool@1'
const TOOL = { id: 'tool.my-tool', version: '0.1.0' }           // must match the definition file
const ALLOWED = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || o === 'https://ruijieliu6.github.io'
const q = new URLSearchParams(location.search)
const host = q.get('host'), session = q.get('session')
let inputs = null                                                   // the snapshot being answered

if (window.parent !== window && host && ALLOWED(host)) {            // embedded by an allowed host, else do nothing
  window.addEventListener('message', (e) => {
    if (e.origin !== host || e.source !== window.parent) return     // pinned origin and sender
    const m = e.data
    if (!m || m.protocol !== PROTOCOL || m.type !== 'tdt:inputs' || m.sessionId !== session) return
    inputs = m
    seed(m.targets[0], m.parameters)                                // your tool: load the tower and the last state
    document.getElementById('send-to-toolkit').hidden = false
  })
  window.parent.postMessage({ protocol: PROTOCOL, type: 'tdt:ready', toolId: TOOL.id, toolVersion: TOOL.version }, host)
}

export function send() {                                            // "Send to Toolkit"
  if (!inputs) return
  const target = inputs.targets[0]
  window.parent.postMessage({
    protocol: PROTOCOL, type: 'tdt:proposal', toolId: TOOL.id, toolVersion: TOOL.version,
    sessionId: inputs.sessionId, runId: inputs.runId, projectId: inputs.projectId, baseRevision: inputs.baseRevision,
    units: { length: 'm', frame: 'tower-local', up: 'z' },
    operations: [{ op: 'replace-geometry', target: target.id, storeys: storeys(), keep: ['name', 'bands'] }],
    parameters: state(), assumptions: [], warnings: [],
  }, host)
}

export function cancel() {                                          // optional: the tool gives up this run
  if (!inputs) return
  window.parent.postMessage({ protocol: PROTOCOL, type: 'tdt:cancel', runId: inputs.runId }, host)
  inputs = null
}
```

A `set-parameter` tool replaces the operation with `{ op: 'set-parameter', target: target.id, field: 'height', value: 96 }` and declares `operations: ['set-parameter']`, `editability: 'native-parameters'`.

## 11. Not demonstrated in this milestone

- **Desktop connectors** (Rhino, Revit, SketchUp as design tools). The Rhino link `public/rhino/tdt_link.py` remains a one-way, whole-document mirror with no proposal step; it is not a `tower-studio-design-tool@1` connection.
- **Remote APIs** (a server that computes and returns): `connection.method` is `web` only; no `remote` method, no auth, no credentials.
- **File exchange** as a connection method (drop a file the tool wrote): Upload stays the way to bring a file in; it is not run-scoped.
- **A marketplace or registry** of design tools: definitions are files the person adds; no listing, signing, review tier or update channel.
- **Other operations:** add tool-owned geometry, update program assignments, attach an analysis artifact, delete.
- **More than one target per run**, `site.outline` as an input in a shipped tool, and non-rectangular snapshot footprints for parametric towers.
- The **deployed** Form Studio embed on GitHub Pages (needs the bridge committed and deployed, and the Pages response headers checked); until then the Form Studio run is a demonstration against a local copy.
