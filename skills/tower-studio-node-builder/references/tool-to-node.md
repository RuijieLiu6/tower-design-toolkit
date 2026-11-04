# Turning an existing design tool into a node

For a designer who already has a tool (a GitHub repository, a Grasshopper definition, a spreadsheet, a script) and wants its check inside Tower Design Toolkit. Paste this file into an AI coding agent (Codex, Claude Code, Copilot) together with [../PROMPT.md](../PROMPT.md), or read it yourself. The agent reads the tool; the designer decides.

## The rules that never bend (in addition to PROMPT.md's)

1. **Read only.** Never change, fork or push to the tool's repository. Read it with the browser or a read-only clone.
2. **Licence first.** Open the repository's licence before anything else.
   - **No licence** means all rights reserved. Don't copy its code, data or text. You may describe its method in your own words only if its author agrees, in writing; record that agreement in the package's `method`.
   - **MIT, Apache-2.0 or BSD:** keep the copyright line, and credit the author in `method` and `createdWith`.
   - **GPL** code can't be pasted into a package. Re-derive the formula and credit the source.
   - **CC-BY** text: credit it. **ODbL** data: name OpenStreetMap contributors.
3. **The tool's numbers are not sources by being in a tool.**
   - A threshold in the tool counts only if the tool cites where it comes from, and you open that citation.
   - Otherwise the threshold is `unverified`: say "taken from <tool>, its source not opened".
   - Or it is `unresolved`. Never upgrade a flag because the tool looks authoritative.
4. **Same answers, or say why not.** Before handing over, run the original tool and the node on the same two or three cases and compare. Write the differences down.

## Step 1: What does the tool answer?

Read the README, then the code that produces each output. List every design question the tool answers, one line each: "How much is each floor worth?", "Which towers does the view cone cut?".

Ask the designer which one to bring over first. **One question per node.**

## Step 2: Can a node do it? Sort each question into one of four kinds

| Kind | What it needs | What to build |
|---|---|---|
| **A. Formula** | Only numbers in the Layer 0 summary: height, plate sides, floors, core, area by use, site area, sun | A normal node package, following PROMPT.md steps 1–6 |
| **B. A loop or a lookup table** | A calculation a formula can't express but that still uses only summary numbers, e.g. a stepwise tax table or an iteration | A **code node** (`references/code-nodes.md`): JavaScript `run(input)` in the sandbox. Say that it runs only after the user allows it, and is flagged as community code |
| **C. Geometry or city data** | The tower's mesh, floor-by-floor geometry, view cones, terrain, neighbours, parcels | **Not a node yet.** Write a one-page port request instead (step 6): the toolkit's maintainers bring such tools in as built nodes, as they did for Vista and the Program Value Visualizer |
| **D. Judgement** | Taste, culture, a jury's view | Not a node. A node may show facts for the judgement, never a score for it (PROMPT.md rule) |

Most tools are a mix. Bring over the A and B parts as nodes, and write a port request for the C part.

## Step 3: Map the inputs

- For each input the tool reads, find the Layer 0 name (see PROMPT.md, "Layer 0 names formulas can read").
- Write the mapping as a table: tool input, Layer 0 name, unit, and how they differ. For example, "tool uses GFA including the podium; `tower.gfa` includes it too".
- An input with no Layer 0 name is either a **parameter** the designer sets, with a default, a flag and a source, or a reason the question is kind C.

## Step 4: Bring the method across

- Write the formula from the tool's code, rewritten in the node's formula language: `+ − × ÷`, `min`, `max`, `sqrt`, `abs`, `round`, `NA`.
- In `method`, say which file and function of the tool it comes from, at which commit, and anything you simplified.
- For each threshold and constant, apply rule 3: open its citation or flag it honestly.
- Anything the tool does that the node can't goes in `limits`.

## Step 5: Test against the tool

- Write the package and check it with `scripts/check_node.mjs`, as PROMPT.md step 5 describes.
- Then pick two or three cases the original tool can run: one of the sample designs (`references/fixtures.json`) and one case of the designer's own.
- Run both and fill a table:

| Case | Tool's value | Node's value | Difference | Why |
|---|---|---|---|---|

- A difference you can't explain blocks the hand-over. Fix the formula, or write it into `limits` with the designer's agreement.
- Put the agreed cases into the package's `tests`.

## Step 6: Hand over, or write the port request

- **A node.** Import it in Tower Design Toolkit: Library, Build your own node, Import, or "Make it here" to adjust it with the form. Credit the original tool and its author in `method`.
- **A port request** (kind C). One page with:
  - the design question;
  - the tool, its licence, its commit and the files that matter;
  - the inputs it needs that Layer 0 lacks;
  - the outputs and how they should be shown;
  - the thresholds with their flags;
  - the comparison cases.
  The designer sends it to the toolkit's maintainers; nothing is sent by the agent.

## Worked examples (how the toolkit's own ports were sorted)

- **Program Value Visualizer** (Ruijie Liu, own repository, read only on 22 Oct 2026).
  - "What is each floor worth, and does the tower pay for its land?" needs per-floor value by use, cost and charges, and a 37-row assumption ledger: kind C, so it became the built economics node.
  - A single ratio from it, e.g. "value per m² of GFA against a target", would be kind A.
- **Vista view studies** (Ruijie Liu, own repository).
  - The exact plan overlap with view cones, rooftop views and the PDF report need cone polygons, terrain and the camera: kind C, so they became built nodes.
  - "Is the tower's height within a typed limit?" would be kind A: `tower.height` against a parameter. Its source is the City sheet that limit came from, never Vista itself.
