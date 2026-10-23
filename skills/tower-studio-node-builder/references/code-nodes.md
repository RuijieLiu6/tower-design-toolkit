# Code nodes (`tower-studio-node@1` with `code`)

A code node is a normal node package with a small JavaScript function for metrics a formula can't express. Tower Design Toolkit runs that code only in a sandbox, and only after the user reads it and chooses **Allow this node to run code**. Declarative formula nodes stay the default: anyone can read them, and they run without asking.

## When to write one

Write a formula if you can. Use code only when the logic needs something the formula language lacks: a loop over towers, a lookup table, an iteration or a search. Code can read nothing beyond a formula's inputs. It sees the same Layer 0 summary, with no geometry, no files and no network.

Say so to the designer: "This needs a small piece of code. Tower Design Toolkit will ask you to allow it, and anyone reviewing it has to read the code."

## The contract

```json
"code": { "language": "javascript", "source": "function run(input) { … }" }
```

- Define `function run(input)` at the top level. It may be `async`.
- `input` is the Layer 0 summary plus parameters:
  - `input.project`: the project values (`towerCount`, `siteArea`, `gfa`, `fsr`, `maxHeight`, …; the names in node-package-contract.md without `project.`);
  - `input.sun`: the sun values (`month`, `day`, `hour`, `altitude`, `azimuth`);
  - `input.towers`: `[{ id, name, values }]`, with `values` holding the tower names without `tower.` (`height`, `minSide`, `coreArea`, `gfa_office`, …). A value is `null` where the project doesn't have it;
  - `input.params`: `{ id: number }` for the package's parameters.
- Return an object with one entry for every metric whose `expression` is `"code"`, and nothing else:
  - a **project** metric gets a number (or `null` for "can't compute");
  - a **tower** metric gets a list with one number (or `null`) per tower, in the order of `input.towers`.
- Return numbers only. Text, markup, objects or extra keys are rejected, and the user sees "Output rejected". Labels, units, thresholds, flags and sources come from the package, never from the code.
- Keep it under 20,000 characters and fast: the run stops after **1.5 s**, and the result may be at most 20,000 bytes.

## What the sandbox blocks

The code runs in a hidden, sandboxed frame (`sandbox="allow-scripts"` with no same-origin access) under a strict policy (`default-src 'none'`, `connect-src 'none'`), inside a worker:

- no network: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts` are refused, and any attempt is reported to the user;
- no `eval` or `new Function`;
- no storage (IndexedDB, caches, cookies), no access to Tower Design Toolkit's page, the model or the user's files;
- a time guard that removes the frame after 1.5 s, which stops an endless loop.

Results show the package's flags, with an author's "verified" shown as unverified, and a note that community code computed them. As with every community node, they stay unverified until reviewed.

## Allowing and revoking

- The user opens the node and reads the code, then ticks "I have read the code" and chooses **Allow this node to run code**.
- The permission is stored in that browser only. It covers this node id, this version and this exact code: a new version or any change to the code asks again.
- **Stop allowing this node** revokes it.

## Tests

Tests on code metrics can't run at import, because nothing runs before the user allows it. The import report says so. Add tests for the formula metrics as usual, and describe the expected code values in `limits` or `method` so a reviewer can check them by hand.

## Example

[example-code-node.json](example-code-node.json) measures the depth from the core to the facade on each tower's narrow side, plus the deepest value. It's a deliberately simple example: the same result could be a formula, which would be the better choice.
