# Design tool contract: `tower-studio-design-tool@1`

A **design tool** is different from a node. A node (`tower-studio-node@1`, [node-package-contract.md](node-package-contract.md)) reads numbers and returns numbers. A design tool is a web page of its own that Tower Design Toolkit opens inside its workspace; it receives one selected tower, and **proposes** a change to its geometry or parameters. The Toolkit validates the proposal, shows it as a ghost next to the current tower, and only the designer's **Apply** changes the model: one change, one Undo step, provenance kept. The tool never changes anything itself.

Use this reference when a designer brings a web tool that **makes or reshapes massing** (a generator, a terrace or taper tool, a façade-driven plate tool) and wants it to change their tower in the Toolkit. A node cannot do that ([tool-to-node.md](tool-to-node.md), kind C); a design tool can. Full developer handoff: `docs/DESIGN_TOOLS.md` in the Toolkit repository.

Two files make a design tool: a **definition** (JSON, added under My tools) and a **bridge** (one small script in the tool's page). Both are below.

## Why a proposal, never a mutation

The tool runs in an iframe with its own origin. It gets a snapshot of one tower and sends back a proposal over `postMessage`. It has no handle on the Toolkit's store, page, files or other towers. The Toolkit checks every field of the proposal and says every problem in a sentence; nothing is repaired silently and nothing is applied while a problem or a stale model stands. A definition file is data: nothing in it executes when it is added.

## The definition

One JSON object. The Toolkit checks it with `checkDefinition()` (`src/lib/designTools/validate.ts`) at registration: Library → My tools → Add tool, through the transfer centre (purpose *Add my tool*), previewed, then **Add to My tools**.

| Field | Required | What to write |
|---|---|---|
| `format` | yes | `"tower-studio-design-tool@1"` |
| `id` | yes | `tool.<handle>`: lower-case letters, digits and hyphens, e.g. `tool.form-studio`. It is the node id in workflows; keep it across versions. |
| `version` | yes | The tool's (bridge's) version, e.g. `"0.1.0"`. A proposal from another version is accepted with a warning. |
| `name` | yes | Library name. |
| `purpose` | yes | One sentence: what it changes and why. |
| `author` | yes | `{ "name": "…", "url": "optional" }` |
| `licence` | yes | The tool's licence in words. Say honestly when there is none yet. |
| `icon` | no | An icon brief or image, exactly as a node package carries it ([node-icons.md](node-icons.md)). |
| `phases` | yes | Where it may be placed: any of `site`, `form`, `program`, `schematic`, `present`. |
| `connection` | yes | `{ "method": "web", "url": "https://…/", "origin": "https://…", "protocol": "tdt-design-tool@1" }`. `method` is `web` only. `origin` must equal the url's origin and is never `"*"`. http is only accepted with a warning, and only for localhost. |
| `runtime` | yes | `{ "browser": true, "network": ["<origins the page talks to>"] }` |
| `inputs` | yes | What it needs: `"tower.selected"` and/or `"site.outline"`. |
| `outputs` | yes | What it returns: `"geometry.storeys"` and/or `"parameters"`. |
| `operations` | yes | What it may propose: `"replace-geometry"` and/or `"set-parameter"`. Deletion is never allowed. |
| `units` | yes | Exactly `{ "length": "m", "frame": "tower-local", "up": "z" }`. |
| `destination` | yes | The permission statement the designer reads before the first send: `sends` (list of plain words: what goes), `to` (whom, where the page lives), `stores` (where the tool keeps it). |
| `limits` | yes | Sentences on what the tool cannot do (may be an empty list). |
| `editability` | yes | `"externally-generated"` (returned plates are kept as they came; the Toolkit's Massing sliders do not reshape them) or `"native-parameters"` (the tool only sets tower fields). |

No other connection methods, auth fields or callbacks exist in this version.

### Example: Form Studio

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
  "connection": { "method": "web", "url": "http://localhost:5577/index.html", "origin": "http://localhost:5577", "protocol": "tdt-design-tool@1" },
  "runtime": { "browser": true, "network": ["http://localhost:5577"] },
  "inputs": ["tower.selected"],
  "outputs": ["geometry.storeys", "parameters"],
  "operations": ["replace-geometry"],
  "units": { "length": "m", "frame": "tower-local", "up": "z" },
  "destination": {
    "sends": ["the tower's name, plan size, height, storey count, floor-to-floor, podium size and footprint", "your last Form Studio settings"],
    "to": "Form Studio, a page on ruijieliu6.github.io, inside this window",
    "stores": "its own settings in that page's localStorage; nothing is sent to a server"
  },
  "limits": ["Position and rotation stay in the Toolkit.", "The returned plates are externally generated: the Massing sliders do not reshape them."],
  "editability": "externally-generated"
}
```

## What the tool receives: the input snapshot (`tdt:inputs`)

Only the chosen tower (one in this version), the frame, and the tool's own last parameters. Never the other towers, the site, the city or any result, unless `inputs` lists `site.outline`.

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:inputs",
  "sessionId": "…", "runId": "…", "projectId": "vtc:untitled", "toolId": "tool.form-studio", "baseRevision": "9a1f3c2e",
  "units": { "length": "m", "frame": "tower-local", "up": "z" }, "frame": { "northDeg": 45.3, "groundElevation": 0 },
  "targets": [ { "id": "t1", "name": "Tower 1", "width": 36, "depth": 30, "height": 80, "storeys": 20, "f2f": 4, "rotation": 0,
                 "podium": { "height": 0, "width": 0, "depth": 0 }, "footprint": [[-18,-15],[18,-15],[18,15],[-18,15]] } ],
  "parameters": null }
```

- `sessionId`, `runId`, `projectId`, `baseRevision`, `toolId`: echo them back unchanged. `runId` is new for every send.
- **Tower-local frame:** origin at the tower's plan centre, x along its width, y along its depth, z = 0 at grade, metres, counter-clockwise outlines. The Toolkit keeps position and rotation; the tool never needs them.
- `parameters` is the tool's own state from its last applied run (opaque to the Toolkit): seed the tool from it, so the designer finds the tool where they left it.

## What the tool returns: the Design Change Proposal (`tdt:proposal`)

```json
{ "protocol": "tdt-design-tool@1", "type": "tdt:proposal", "toolId": "tool.form-studio", "toolVersion": "0.1.0",
  "sessionId": "…", "runId": "…", "projectId": "vtc:untitled", "baseRevision": "9a1f3c2e",
  "units": { "length": "m", "frame": "tower-local", "up": "z" },
  "operations": [ { "op": "replace-geometry", "target": "t1", "keep": ["name", "bands"],
                    "storeys": [ { "z0": 0, "z1": 4, "loops": [[[-18,-15],[18,-15],[18,15],[-18,15]]], "podium": false, "use": "office" },
                                 { "z0": 4, "z1": 8, "loops": [[[-17.5,-14.5],[17.5,-14.5],[17.5,14.5],[-17.5,14.5]]] } ] } ],
  "parameters": { "schema": "mountain-studio/1", "taper": 0.6, "twist": 12 },
  "assumptions": ["Plates are centred on the tower axis."], "warnings": [] }
```

### Operations

| `op` | Fields | What Apply does |
|---|---|---|
| `replace-geometry` | `target` (a tower id from the snapshot), `storeys` (list, rising, ≤ 200), `keep` (optional: any of `name`, `bands`, `skyLobbies`, `interior`) | The tower becomes a mass of those storeys with a prism mesh; its id, name, bands and design inputs are carried over. |
| `set-parameter` | `target`, `field` (one of `width`, `depth`, `height`, `f2f`, `rotation`, `podiumHeight`, `podiumWidth`, `podiumDepth`), `value` (0–600) | That field is set on the tower. |

A storey: `z0`, `z1` metres from grade (`z1 > z0`, storeys rising in order, top ≤ 600 m); `loops`: first loop the outer plate, later loops holes, each 3–512 points `[x, y]` in metres (any orientation; the Toolkit normalises); `podium: true` for podium storeys; `use` one of `retail`, `office`, `hotel`, `residential`, `civic`, `amenity`, `mechanical` (else the tower's first band's use). Plates must be ≤ 12 000 m²; a plate under 25 m² counts as a void (warning). The whole message must be under 8 MB.

**Not allowed:** deleting anything, adding a second tower, changing program bands, attaching files, any state path, callback or code. An unknown `op` is rejected with `operation N: "<op>" is not an allowed operation (replace-geometry, set-parameter).`

### What the Toolkit checks (every problem is a sentence; one problem blocks Apply)

- Protocol and type; `toolId` equals the registered id; `toolVersion` differs → warning only.
- `sessionId`, `runId`, `projectId` equal the run the Toolkit is waiting for, and that run is still open (not cancelled, discarded, replaced by a new send or already answered). A `runId` applied before is refused for ever: `This proposal was already applied.`
- `units` exactly metres / tower-local / z up: `Units must be metres in the tower-local frame, z up (got …).`
- Every operation: allowed, registered in the definition's `operations`, target among the snapshot's targets, fields and numbers finite and within limits; a point more than 1 km from the tower is called out as a units or frame mistake.
- **Stale:** `baseRevision` must equal the model's revision when the proposal arrives *and* when Apply is pressed. Otherwise the proposal is shown as **based on an older model**, Apply is blocked, and *Update preview* starts a new run. Nothing is ever applied silently over a changed model.

## The lifecycle

1. The Toolkit opens `connection.url` in a sandboxed iframe with `?host=<Toolkit origin>&session=<sessionId>` appended.
2. The tool, when ready, posts `{ protocol, type: "tdt:ready", toolId, toolVersion }` to the `host` origin, **only if** that origin is in its allowlist (`localhost` / `127.0.0.1` any port, `https://ruijieliu6.github.io`). Otherwise it does nothing.
3. The designer reads the permission statement (from `destination`) and presses **I understand, send**; then the Toolkit posts the snapshot (`tdt:inputs`) to `connection.origin`. Selecting a card or opening the library never sends anything.
4. The tool seeds its state from `targets[0]` and `parameters`, shows a **Send to Toolkit** control, and on press posts the proposal. It may post `{ protocol, type: "tdt:cancel", runId }` instead.
5. The Toolkit checks the proposal, opens the **Proposal** tab (summary, changes, validation, impacts) and draws the ghost. **Apply** = one Undo step with provenance (`imported.tool = { toolId, version, runId, at, parameters }`); **Discard** changes nothing; **Update preview** sends a fresh snapshot with a new `runId`.
6. A rerun on the same tower replaces its geometry again; it never duplicates the tower.

## Security rules the bridge must follow

- Post only to the `host` query parameter's origin, and only when it is allowlisted. Never `'*'`.
- Act only on messages with `e.origin === host` and `e.source === window.parent`, protocol `tdt-design-tool@1`, and a `sessionId` equal to the `session` query parameter.
- Keep the tool's state in the tool's own storage only, and say where in `destination.stores`.
- Never read or reach into the parent window; the Toolkit's Undo takes back an Apply, the tool's own undo takes back the tool's edits, and the two never mix.

## The bridge (copy and adapt)

Add this to the tool's page as a module; replace `seed`, `storeys` and `state` with the tool's own functions, and wire a visible control `#send-to-toolkit` to `send()`.

```js
const PROTOCOL = 'tdt-design-tool@1'
const TOOL = { id: 'tool.my-tool', version: '0.1.0' }           // must match the definition file
const ALLOWED = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || o === 'https://ruijieliu6.github.io'
const q = new URLSearchParams(location.search)
const host = q.get('host'), session = q.get('session')
let inputs = null

if (window.parent !== window && host && ALLOWED(host)) {
  window.addEventListener('message', (e) => {
    if (e.origin !== host || e.source !== window.parent) return
    const m = e.data
    if (!m || m.protocol !== PROTOCOL || m.type !== 'tdt:inputs' || m.sessionId !== session) return
    inputs = m
    seed(m.targets[0], m.parameters)                                // your tool: load the tower and the last state
    document.getElementById('send-to-toolkit').hidden = false
  })
  window.parent.postMessage({ protocol: PROTOCOL, type: 'tdt:ready', toolId: TOOL.id, toolVersion: TOOL.version }, host)
}

export function send() {
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

export function cancel() {
  if (!inputs) return
  window.parent.postMessage({ protocol: PROTOCOL, type: 'tdt:cancel', runId: inputs.runId }, host)
  inputs = null
}
```

`storeys()` must return `[{ z0, z1, loops: [[[x, y], …]], podium?, use? }]` in metres, tower-local, z up, rising. For a tool that only sets numbers, use `{ op: 'set-parameter', target: target.id, field: 'height', value: 96 }`, declare `operations: ["set-parameter"]` and `editability: "native-parameters"`.

## Hand-check before handing over

For a 36 × 30 m tower of 20 storeys at 4 m (the snapshot above), a proposal that keeps storeys 1–10 at 36 × 30 and steps storeys 11–20 in to 24 × 20 gives: 20 storeys, z 0–80 m, plates 1 080 m² and 480 m², gross floor area 15 600 m² (was 21 600), volume 62 400 m³, f2f 4 m, hull the 36 × 30 rectangle, no validation problems and no warnings. Compute the same numbers for the designer's tool on one tower and show them before the first real run.

## Not in this version

Desktop connectors (Rhino, Revit), remote APIs, file exchange as a connection, a registry or marketplace, more than one target per run, deleting or adding towers, program or artifact operations. A tool that needs any of these is a port request, not a design tool, until the contract grows.
