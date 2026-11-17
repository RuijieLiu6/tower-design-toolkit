// The interface as a table of contents (Ruijie, 17 Nov: "a drawer holding everything that helps model, understand the
// model and add information … almost all the information on the site shown as a table of contents … a clear hierarchy,
// from a few big categories down to the modules and their small components"). One registry: every part of the app
// that can be shown or hidden says its id, label, parent and default here (the static tree) or registers itself when
// it exists (a right-panel section, a dock layer, an imported tool, an uploaded font: `registerUiItems`). Components
// read `useUiVisible(id)`; the drawer (components/ui/InterfaceDrawer.tsx) draws the tree from the same list, never a
// second hand-made one. Hiding is view-only: checks keep running, a hidden Results section switches no node off.
// Remembered per browser as `ts.ui.visibility` (the hidden ids), never in the project file; a layout can be saved and
// loaded as a small JSON so a team shares one.
import { createContext, useContext, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { LucideIcon } from '../../components/icons'

export type UiMode = 'model' | 'presentation' | 'both'
export interface UiItem {
  id: string
  label: string
  parent: string | null
  icon?: LucideIcon
  /** One line on hover. */
  hint?: string
  /** Shown as locked: it cannot be hidden (the switch, the project menu, the drawer, Undo, anything that would strand the user). */
  locked?: boolean
  /** Visible by default (true unless said). */
  defaultVisible?: boolean
  /** The mode the item belongs to; 'both' when absent. The tree lists the current mode's items under its heading. */
  mode?: UiMode
  /** Sort key among siblings (registration order otherwise). */
  order?: number
  /** Called when the item's effective visibility changes (a viewport layer turns off with its entry, and back on). */
  apply?: (visible: boolean) => void
}

// ---------------------------------------------------------------- the static tree
const S = (id: string, label: string, parent: string | null, extra: Partial<UiItem> = {}): UiItem => ({ id, label, parent, ...extra })
export const STATIC_ITEMS: UiItem[] = [
  S('topbar', 'Top bar', null, { order: 10, hint: 'The project bar: project, file menu, the switch, the view, checks, the editor' }),
  S('topbar.project-tabs', 'Project (Competition site / Real Vancouver)', 'topbar', { locked: true }),
  S('topbar.undo', 'Undo / Redo', 'topbar', { locked: true }),
  S('topbar.project-menu', 'Project menu', 'topbar', { locked: true }),
  S('topbar.interface', 'Interface (this drawer)', 'topbar', { locked: true }),
  S('topbar.mode-switch', 'Model / Presentation switch', 'topbar', { locked: true }),
  S('topbar.view-buttons', 'View buttons (3D, model + data graph, data graph)', 'topbar'),
  S('topbar.autorun', 'Auto-run checks', 'topbar'),
  S('topbar.edit-workflow', 'Edit workflow', 'topbar'),
  S('topbar.more', 'More menu (library, role, units, help)', 'topbar', { locked: true }),
  S('topbar.capture', 'Model locked · Capture (Presentation)', 'topbar', { mode: 'presentation' }),

  S('left', 'Left panel', null, { order: 20, hint: 'The phase panel: its workflow, its tools, the open tool' }),
  S('left.workflow', 'Workflow block', 'left', { hint: 'The Workflow header with Edit, the phases line and Add tool' }),
  S('left.workflow.line', 'Phases line (the dots)', 'left.workflow'),
  S('left.workflow.rows', 'Tools of the phase, in working order', 'left.workflow'),
  S('left.workflow.add', 'Add tool', 'left.workflow'),
  S('left.tool', 'The open tool’s controls', 'left'),
  S('left.tool.row', 'The design tools row (icons)', 'left.tool', { mode: 'model' }),

  S('tools', 'Design tools', null, { order: 30, hint: 'Each design tool, in the tool rail and the panel; drawing tools join here when they exist' }),
  S('tools.rail', 'Tool rail beside the model', 'tools'),
  S('tools.modes', 'Edit modes in the rail', 'tools', { mode: 'model' }),
  S('tools.modes.place', 'Place', 'tools.modes', { mode: 'model' }),
  S('tools.modes.move', 'Move', 'tools.modes', { mode: 'model' }),
  S('tools.modes.rotate', 'Rotate', 'tools.modes', { mode: 'model' }),
  S('tools.modes.face', 'Face', 'tools.modes', { mode: 'model' }),
  S('tools.modes.mass', 'Mass', 'tools.modes', { mode: 'model' }),

  S('viewport', 'Viewport', null, { order: 40, hint: 'What is drawn over the model' }),
  S('viewport.working-view', 'Working view label and pinned context', 'viewport', { mode: 'model' }),
  S('viewport.strip', 'View strip (Geometry · Building use · Analysis · Materials, Legend)', 'viewport', { mode: 'model' }),
  S('viewport.north', 'North chip', 'viewport'),
  S('viewport.tower-toolbar', 'Selected tower toolbar', 'viewport', { mode: 'model' }),
  S('viewport.edit-readout', 'Edit readout (Face / Mass)', 'viewport', { mode: 'model' }),
  S('viewport.look', 'Competition look bar', 'viewport', { mode: 'model' }),
  S('viewport.context-card', 'Competition context card', 'viewport', { mode: 'model' }),
  S('viewport.city-legend', 'Real Vancouver legend', 'viewport', { mode: 'model' }),
  S('viewport.vista-inset', 'Real Vancouver inset map', 'viewport', { mode: 'model' }),
  S('viewport.dock', 'Layers dock', 'viewport', { mode: 'model', hint: 'The dock on the right of the model; its sections register as they exist' }),
  S('viewport.layers', 'Real Vancouver context layers', 'viewport', { mode: 'model', hint: 'Hiding a layer here also turns it off in the view; showing it again brings it back as it was' }),

  S('right', 'Right panel', null, { order: 50, hint: 'Properties, Your site, Results, Trace; in Presentation, Present and Render' }),
  S('right.tab.properties', 'Properties tab', 'right', { mode: 'model' }),
  S('right.tab.site', 'Your site tab', 'right', { mode: 'model' }),
  S('right.tab.results', 'Results tab', 'right'),
  S('right.tab.trace', 'Trace tab', 'right'),
  S('right.tab.draw', 'Drawing tab (while a drawing tool is on)', 'right', { mode: 'model' }),
  S('right.tab.present', 'Present tab', 'right', { mode: 'presentation' }),
  S('right.tab.render', 'Render tab', 'right', { mode: 'presentation' }),

  S('present', 'Presentation', null, { order: 60, mode: 'presentation', hint: 'The boards composer, the shot strip, drawings, render' }),
  S('present.filmstrip', 'Shot strip (in the panel)', 'present', { mode: 'presentation' }),
  S('present.composer.library', 'Board composer: image library', 'present', { mode: 'presentation' }),
  S('present.composer.inspector', 'Board composer: frame and export panel', 'present', { mode: 'presentation' }),

  S('addons', 'Add-ons', null, { order: 70, hint: 'What you bring in: your tools, sync links, your fonts; they appear here on their own' }),
  S('addons.tools', 'My tools (imported or community)', 'addons'),
  S('addons.sync', 'Sync links', 'addons'),
  S('addons.fonts', 'Your fonts', 'addons', { mode: 'presentation' }),
]

// ---------------------------------------------------------------- the live list (static + registered)
let dynamic = new Map<string, UiItem[]>()
let listeners = new Set<() => void>()
let cached: UiItem[] | null = null
const notify = () => { cached = null; listeners.forEach((l) => l()) }
/** Register the parts a module creates as they exist (keyed by source so a re-render replaces, not duplicates). */
export function registerUiItems(source: string, items: UiItem[]) {
  const prev = dynamic.get(source)
  if (prev && prev.length === items.length && prev.every((p, i) => p.id === items[i].id && p.label === items[i].label && p.parent === items[i].parent)) return
  dynamic.set(source, items)
  notify()
}
export function unregisterUiItems(source: string) { if (dynamic.delete(source)) notify() }
/** One part registering itself as it is first seen (a panel section): kept once seen, so the tree lists it even when its tab is closed. */
const parts = new Map<string, UiItem>()
export function registerUiPart(item: UiItem) {
  const prev = parts.get(item.id)
  if (prev && prev.label === item.label && prev.parent === item.parent && prev.mode === item.mode) return
  parts.set(item.id, item)
  notify()
}
export function allUiItems(): UiItem[] {
  if (!cached) cached = [...STATIC_ITEMS, ...[...dynamic.values()].flat(), ...parts.values()]
  return cached
}
export function useUiItems(): UiItem[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, allUiItems, allUiItems)
}
/** Test seam: forget every registration. */
export function resetUiRegistry() { dynamic = new Map(); parts.clear(); listeners = new Set(); cached = null }

export const itemById = (id: string, items: UiItem[] = allUiItems()) => items.find((i) => i.id === id)
export const childrenOf = (id: string | null, items: UiItem[] = allUiItems()) => items.filter((i) => i.parent === id).sort((a, b) => (a.order ?? 500) - (b.order ?? 500))
export function descendantsOf(id: string, items: UiItem[] = allUiItems()): UiItem[] {
  const out: UiItem[] = []
  const walk = (p: string) => { for (const c of items.filter((i) => i.parent === p)) { out.push(c); walk(c.id) } }
  walk(id)
  return out
}
export function ancestorsOf(id: string, items: UiItem[] = allUiItems()): string[] {
  const out: string[] = []
  let cur = itemById(id, items)?.parent ?? null
  while (cur) { out.push(cur); cur = itemById(cur, items)?.parent ?? null }
  return out
}

// ---------------------------------------------------------------- visibility (pure)
export type Hidden = Record<string, true>
/** Effectively visible: neither the item nor any ancestor is hidden. An id nobody registered is visible. */
export function isVisible(id: string, hidden: Hidden, items: UiItem[] = allUiItems()): boolean {
  if (hidden[id]) return false
  for (const a of ancestorsOf(id, items)) if (hidden[a]) return false
  return true
}
/** A group reads 'on' when every leaf under it shows, 'off' when none (or it is hidden itself), else 'mixed'. */
export function groupState(id: string, hidden: Hidden, items: UiItem[] = allUiItems()): 'on' | 'off' | 'mixed' {
  if (!isVisible(id, hidden, items)) return 'off'
  const leaves = descendantsOf(id, items).filter((d) => !items.some((i) => i.parent === d.id))
  if (!leaves.length) return 'on'
  const on = leaves.filter((l) => isVisible(l.id, hidden, items)).length
  return on === leaves.length ? 'on' : on === 0 ? 'off' : 'mixed'
}
/** How many leaves under a group are hidden. */
export function hiddenCount(id: string, hidden: Hidden, items: UiItem[] = allUiItems()): number {
  return descendantsOf(id, items).filter((d) => !items.some((i) => i.parent === d.id) && !isVisible(d.id, hidden, items)).length
}
/** A group's container shows while it, and at least one thing under it, shows (no children: itself). */
export function groupVisible(id: string, hidden: Hidden, items: UiItem[] = allUiItems()): boolean {
  if (!isVisible(id, hidden, items)) return false
  const kids = items.filter((i) => i.parent === id)
  return !kids.length || kids.some((k) => groupVisible(k.id, hidden, items))
}
/** The next hidden set: showing clears the item, its descendants and its ancestors; hiding marks the item (locked ones never). */
export function withVisible(hidden: Hidden, id: string, visible: boolean, items: UiItem[] = allUiItems()): Hidden {
  const it = itemById(id, items)
  if (it?.locked) return hidden
  const next: Hidden = { ...hidden }
  if (visible) {
    delete next[id]
    for (const d of descendantsOf(id, items)) delete next[d.id]
    for (const a of ancestorsOf(id, items)) delete next[a]
  } else next[id] = true
  return next
}
/** The defaults: everything shows except what says `defaultVisible: false`. */
export function defaultHidden(items: UiItem[] = allUiItems()): Hidden {
  const h: Hidden = {}
  for (const i of items) if (i.defaultVisible === false) h[i.id] = true
  return h
}

// ---------------------------------------------------------------- the store, per browser
const KEY = 'ts.ui.visibility'
export const UI_LAYOUT_FORMAT = 'tower-studio-ui@1'
function read(): Hidden {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { hidden?: unknown } | null
    const list = Array.isArray(v?.hidden) ? (v!.hidden as unknown[]).filter((x): x is string => typeof x === 'string') : []
    return Object.fromEntries(list.map((id) => [id, true as const]))
  } catch { return {} }
}
export const useUiVisibility = create<{ hidden: Hidden }>(() => ({ hidden: typeof window !== 'undefined' ? read() : {} }))
useUiVisibility.subscribe((s) => { try { localStorage.setItem(KEY, JSON.stringify({ format: UI_LAYOUT_FORMAT, hidden: Object.keys(s.hidden) })) } catch { /* this visit only */ } })

/** Apply hooks: tell the items whose effective visibility changed (a layer turns off and back on). */
function applyChange(before: Hidden, after: Hidden) {
  const items = allUiItems()
  for (const it of items) {
    if (!it.apply) continue
    const was = isVisible(it.id, before, items), now = isVisible(it.id, after, items)
    if (was !== now) try { it.apply(now) } catch { /* a layer that is gone */ }
  }
}
function setHidden(next: Hidden) {
  const before = useUiVisibility.getState().hidden
  useUiVisibility.setState({ hidden: next })
  applyChange(before, next)
}
export const setUiVisible = (id: string, visible: boolean) => setHidden(withVisible(useUiVisibility.getState().hidden, id, visible))
export const showAllUi = () => setHidden({})
export const resetUi = () => setHidden(defaultHidden())
/** The layout as a small file a team can share; `loadUiLayout` reads one back (unknown ids are kept, for parts not open yet). */
export const uiLayoutText = () => JSON.stringify({ format: UI_LAYOUT_FORMAT, hidden: Object.keys(useUiVisibility.getState().hidden) }, null, 2)
export function loadUiLayout(text: string): { ok: true; n: number } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text) as { format?: unknown; hidden?: unknown }
    if (v?.format !== UI_LAYOUT_FORMAT || !Array.isArray(v.hidden)) return { ok: false, error: `Not an interface layout file (expected format ${UI_LAYOUT_FORMAT}).` }
    const ids = (v.hidden as unknown[]).filter((x): x is string => typeof x === 'string')
    const items = allUiItems()
    const hidden: Hidden = {}
    for (const id of ids) if (!itemById(id, items)?.locked) hidden[id] = true
    setHidden(hidden)
    return { ok: true, n: ids.length }
  } catch { return { ok: false, error: 'The file is not JSON.' } }
}

// ---------------------------------------------------------------- hooks for components
/** Whether a part shows (the item, with every ancestor). An id nobody registered is visible. */
export function useUiVisible(id: string): boolean {
  const hidden = useUiVisibility((s) => s.hidden)
  const items = useUiItems()
  return isVisible(id, hidden, items)
}
/** Whether a group's container shows: itself, and something under it. */
export function useUiGroupVisible(id: string): boolean {
  const hidden = useUiVisibility((s) => s.hidden)
  const items = useUiItems()
  return groupVisible(id, hidden, items)
}
/** Which parts of a scope show (a right-panel tab's sections register under it). */
export const UiScopeContext = createContext<string | null>(null)
export const useUiScope = () => useContext(UiScopeContext)
/** A stable id from a title: "Height references" → "height-references". */
export const uiSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
