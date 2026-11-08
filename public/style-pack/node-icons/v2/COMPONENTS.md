# Shared components (style pack v2)

The interface pieces an agent must reuse when it builds anything around a node in Tower Design Toolkit: name them, don't redraw them. Each entry gives its file, what it is for and its states, taken from the components and from `src/index.css`. Colours and sizes are tokens from `ui-tokens.json`; the CSS names are the `--color-*`, `--radius-*` and `--shadow-*` variables listed there (Tailwind classes such as `bg-accent`, `text-muted` and `rounded-panel` read them).

States: **default**, **hover**, **focus** (keyboard), **selected**, **disabled**, **loading**, **empty**, **error**. A dash means the state doesn't apply.

Three rules hold everywhere:

- **Blue (`--color-accent`, `--color-focus`, `#2563eb`) is only for interaction, selection and focus.** Never decoration, never artwork.
- **Status always comes as a symbol and a word**, in the status colours (`--color-success`, `--color-warning`, `--color-error`, `--color-pending` and their `-surface`). Never colour alone.
- **Keyboard focus is one blue ring everywhere:** `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px }`, or the component's own `focus-visible:ring-2 ring-accent`.

## Node tile: `NodeTile` + `NodeArtwork`

`src/components/NodeTile.tsx`, `src/components/nodeIcons/NodeArtwork.tsx`; CSS `.node-tile`, `.node-hit` in `src/index.css`. The white tile every node icon sits on, one size per place (52, 40 or 30 px). `NodeArtwork` picks the artwork: a built node's drawing, a user node's icon (generated from its brief, or its checked image), else the standard fallback drawing. The tile, its padding and its states never come from the image. The clickable element around the tile carries the class `node-hit`.

| State | How it looks |
|---|---|
| Default | `background: #fff`, `border-radius: var(--radius-panel)` (12 px), `box-shadow: var(--shadow-tile)`; artwork at 90% of the tile |
| Hover | `.node-hit:hover .node-tile`: `translateY(-1px)`, shadow `0 2px 4px rgb(24 40 34 / 0.14), 0 10px 20px -8px rgb(24 40 34 / 0.34)` |
| Focus | `.node-hit:focus-visible .node-tile`: `0 0 0 2px #fff, 0 0 0 4px var(--color-focus), var(--shadow-tile)` (white gap, blue ring) |
| Selected | `.node-hit[data-selected] .node-tile`: `0 0 0 2px var(--color-accent), 0 6px 14px -6px rgb(24 40 34 / 0.3)` |
| Disabled | The clickable wrapper's `disabled:opacity-40` and `cursor-not-allowed` |
| Soft / off | `data-state="soft"`: tile at 86% white, artwork `saturate(0.7)`. `data-state="off"`: tile at 60% white, artwork `saturate(0.12)`, opacity 0.7 |
| Loading / empty | The standard fallback drawing for the node's phase until its own icon exists |
| Error | A broken or refused icon shows the fallback drawing; a node's run or result status shows as a badge beside the tile (symbol + word in the status colours), never inside the artwork |

All of these are in `previews/states.png`. Motion: 160 ms, none under `prefers-reduced-motion`.

## Tool tiles: `IconTile` and `GlassIcon`

`src/components/IconTile.tsx`, `src/components/GlassIcon.tsx`; CSS `.gicon`. Design tools and the actions inside a tool: an icon with one or two key words under it; the full name and what it does appear on hover or keyboard focus. `GlassIcon` is the tile itself (`ICON.feature` 52 px, `ICON.tool` 40 px): white, 12 px corners, `--shadow-tile`, the glyph in its own hue. Tool tiles are not node tiles: they never show node artwork.

| State | How it looks |
|---|---|
| Default | `GlassIcon level="soft"`; the word in `text-meta text-muted` |
| Hover | The word turns `text-ink`; in a `.group` the tile lifts 2 px; the hover panel opens after 250 ms (`role="tooltip"`, 248 px, the name in bold, the hint in `text-muted`) |
| Focus | `focus-visible:ring-2 ring-accent`; the hover panel opens at once |
| Selected | `active` (the open tool) or `primary` (the way on): `level="on"`, the word bold `text-ink`. Inline layout: `bg-accent text-white` |
| Disabled | `disabled:opacity-40` (tile), `disabled:opacity-50` (inline) |
| Off | `level="off"`: background `--color-subtle`, glyph greyed |
| Loading / empty / error | - |

## Status line: `StatusRow`

`src/components/StatusRow.tsx`. One result: a symbol (✓ pass, ✕ fail, ! check, ? unknown), a short bold title and the number that decides it; the long text behind a `Help` "?"; a fix, when there is one, on the next line with a wrench; an evidence flag (`FlagChip`) on a row that isn't a pass when the flag is unverified, unresolved or false. Screen readers hear the state word first.

| State | How it looks |
|---|---|
| Default | The row with its symbol in the state's colour |
| Hover / focus | On its "?" only (see `Help`) |
| Error | `state="fail"`: ✕ in the error colour, the fix line under it |
| Selected / disabled / loading / empty | - |

## Chips: `FlagChip` and `StateChip`

`src/components/ui.tsx`. `FlagChip`: an evidence flag as icon + word (Verified, Team assumption, Unverified, Unresolved, False assumption) in the `--color-flag-*` colours, its meaning on hover (`title`); Unverified is a hatched chip. `StateChip`: Pass, Fail, Check or Unknown as a word in a bordered chip (green, red, amber, grey). Neither is clickable: no hover, focus, selected or disabled state. Use the word, never only the colour.

## Help "?" panel: `Help`

`src/components/Help.tsx`. A 16 px round "?" beside a title holds a description (never results, warnings, flags, sources or consent notices, which stay on the page).

| State | How it looks |
|---|---|
| Default | `border-line bg-white text-muted` |
| Hover | `border-accent text-accent`; the panel opens after 60 ms |
| Focus | `focus-visible:ring-2 ring-accent`; the panel opens |
| Selected (open / pinned) | `border-accent bg-accent text-white`; a click pins it (touch), Esc or a click away closes it |
| Panel | `role="tooltip"`, 288 px, white, `border-line`, rounded, float shadow, drawn in a portal so it is never clipped |
| Disabled / loading / empty / error | - |

## Folded text: `Fold`

`src/components/Fold.tsx`. A long text behind a summary that carries its point on its own (a privacy point or a caveat must be in the summary). Native `details` / `summary`.

| State | How it looks |
|---|---|
| Default (closed) | Chevron and summary in `text-meta text-muted` |
| Hover | Summary `text-ink` |
| Focus | `focus-visible:ring-2 ring-accent` |
| Selected (open) | Chevron turned 90°, the text below in `text-muted` |
| Disabled / loading / empty / error | - |

## Buttons

CSS in `src/index.css` (unlayered, so it wins over utilities). Corners: 8 px (`--radius-control`) on every control.

| Kind | Class | Default | Hover | Selected |
|---|---|---|---|---|
| Main action (one per context) | `bg-accent` | `--color-accent` `#2563eb`, white text, `0 1px 2px` shadow | `--color-accent-hover` `#1d4ed8` | - |
| Chosen option | `bg-ink` | Renders as the selected surface `--color-selected` `#eaf1ff`, text `#1d4ed8`, inset 1 px `rgb(37 99 235 / 0.45)`: "selected" never looks like "press me" | - | This is the selected state |
| Ordinary | `bg-panel` or `bg-white` | White, inset 1 px `--color-line` | Inset 1 px `--color-boundary` (`UI.control`, `#778294`) | - |

- **Focus:** the global blue ring, or `focus-visible:ring-2 ring-accent`.
- **Disabled:** the `disabled` attribute; hover rules are written `:not(:disabled)`; most buttons add `disabled:opacity-40` or `-50`.
- **Loading:** the button stays, disabled, with a spinning `Loader2` and a word ("Exporting…"); it never empties.
- **Error:** reported next to the action in words, with the status colours, not by recolouring the button.

## Dialogs, menus and tooltips

A modal dialog is `role="dialog" aria-modal="true" aria-labelledby=…` on `bg-panel`: opaque, 16 px corners (`--radius-float`), `--shadow-float`, over a `bg-ink/30` scrim. It focuses its first control (`data-autofocus`), keeps Tab inside, closes on Esc and on a click on the scrim, and gives focus back to the button that opened it. Menus (`role="menu"`), lists (`role="listbox"`) and tooltips (`role="tooltip"`) get the float shadow too. Panels that don't float use a 1 px `--color-line` border and no shadow, and a box that holds nothing to click has no frame at all.

| State | How it looks |
|---|---|
| Default | As above |
| Loading | The action button's loading state (above); the dialog stays |
| Empty | A short sentence saying what's missing and the one action that fills it |
| Error | Problems listed in words in the dialog, each with what to do ("Problems to fix" in the node import) |

## Inputs

Text fields, selects and text areas show their boundary in `--color-boundary` (`UI.control`, `#778294`; 3:1 against white); on keyboard focus the border turns `--color-focus`. Numbers use `NumberField`, switches `Toggle` (`role="switch"`), both in `src/components/ui.tsx`.

## Colours by role

| Role | Tokens | Use |
|---|---|---|
| Interface | `UI` / `--color-canvas`, `panel`, `subtle`, `ink`, `muted`, `line`, `boundary` (`UI.control`) | Surfaces, text, dividers, control boundaries |
| Interaction | `UI.accent`, `accentHover`, `selected`, `focus` | Main action, selection, focus. Nothing else |
| Phase | `PHASE_COLOR[phase]`: `tones` for artwork; `accent`, `surface`, `ink` for markers and labels | One phase per node, kept wherever the node moves |
| Status | `STATUS[kind]`: `fg`, `surface` | Badges and result rows, with a symbol and a word |
| Model and data | `MODEL`, `DATA` | The 3D model; charts (sequential, diverging, categorical, missing) |
| AI | `UI.ai`, `aiSurface`, `aiLine` | Suggestion containers, never applied work |

Type: Inter Variable, one size per role (`--text-display`, `section`, `body`, `control`, `node`, `meta`); nothing under 12 px for reading text. Spacing: 4, 8, 12, 16, 24, 32, 48 px (`SPACE`). Motion: 120, 200, 300 ms, `cubic-bezier(0.2, 0, 0, 1)` (`MOTION`), none under reduced motion.
