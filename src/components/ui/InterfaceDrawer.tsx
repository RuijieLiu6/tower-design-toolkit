// Interface: the drawer in the top bar (Ruijie, 17 Nov: "another button whose drop-down is about personalising the
// interface … a drawer holding everything that helps model, understand the model and add information … click an item
// and it shows or hides on the interface … like a library: almost all the information on the site shown as a table of
// contents"). The tree is drawn from lib/ui/registry.ts, the one list every hideable part registers in; nothing is
// listed here by hand. An ARIA tree with tri-state checkboxes for groups, a hidden count per group, a search box,
// Show all, Reset, and Save / Load layout (a small JSON for a team). Every change applies at once and is reversible by
// re-checking; hiding is view-only (checks keep running). Locked items (the switch, the project menu, this drawer,
// Undo, the More menu) show a lock. Keys: Up / Down move, Left / Right close and open a group, Space toggles, Home /
// End, and typing in the search box filters.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Download, Lock, Minus, PanelsTopLeft, RotateCcw, Search, Upload, X } from '../icons'
import { currentMode, MODE_NAME, type Mode } from '../../lib/mode'
import { useStep } from '../../lib/step'
import { saveFile } from '../../lib/download'
import { childrenOf, groupState, hiddenCount, isVisible, loadUiLayout, resetUi, setUiVisible, showAllUi, uiLayoutText, useUiItems, useUiVisibility, type UiItem } from '../../lib/ui/registry'
import { startUiAddons } from '../../lib/ui/addons'
import { useStore } from '../../store'
import WorkspaceMenu from './WorkspaceMenu'
import { useActiveWorkspace } from '../../lib/ui/workspaces'

export const DRAWER_NAME = 'Interface'
const btn = 'flex h-7 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-meta text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

export default function InterfaceDrawer() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const present = useStore((s) => s.phase === 'present')
  const ws = useActiveWorkspace().workspace
  useEffect(() => startUiAddons(), [])
  useEffect(() => {
    if (!open) return
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', key, true); window.addEventListener('pointerdown', away, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', away, true) }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" data-testid="interface-button" aria-label={DRAWER_NAME}
        title={`Interface: workspace (${ws.name}) and what the app shows: panels, tabs and their sections, design tools, viewport layers, add-ons`}
        className={`ml-0.5 flex h-8 items-center gap-1.5 rounded-lg border px-2 text-control font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${present ? 'border-white/30 hover:bg-white/10' : 'border-line hover:border-accent hover:text-accent'}`}>
        <PanelsTopLeft size={14} aria-hidden /><span className="hidden whitespace-nowrap min-[1500px]:inline">{DRAWER_NAME}</span><ChevronDown size={12} aria-hidden />
      </button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </div>
  )
}

function Drawer({ onClose }: { onClose: () => void }) {
  const items = useUiItems()
  const hidden = useUiVisibility((s) => s.hidden)
  const step = useStep((s) => s.step)
  const mode: Mode = step === 'frame' ? 'presentation' : currentMode()
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [focusId, setFocusId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const tree = useRef<HTMLUListElement>(null)
  const text = q.trim().toLowerCase()
  // The current mode's parts (and the parts of both modes), under the mode's heading.
  const inMode = (i: UiItem) => !i.mode || i.mode === 'both' || i.mode === mode
  const matches = useMemo(() => {
    if (!text) return null
    const hit = new Set<string>()
    for (const i of items) if (inMode(i) && i.label.toLowerCase().includes(text)) { hit.add(i.id); let p = i.parent; while (p) { hit.add(p); p = items.find((x) => x.id === p)?.parent ?? null } }
    return hit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, items, mode])
  const kids = (parent: string | null) => childrenOf(parent, items).filter((i) => inMode(i) && (!matches || matches.has(i.id)))
  const isOpen = (id: string) => (matches ? true : !closed[id])
  // The rows in reading order, for the arrow keys.
  const rows: string[] = []
  const collect = (parent: string | null, depth: number) => { for (const i of kids(parent)) { rows.push(i.id); if (kids(i.id).length && isOpen(i.id)) collect(i.id, depth + 1) } }
  collect(null, 0)
  const total = items.filter((i) => inMode(i) && !items.some((c) => c.parent === i.id)).length
  const hiddenTotal = items.filter((i) => inMode(i) && !items.some((c) => c.parent === i.id) && !isVisible(i.id, hidden, items)).length
  const focusRow = (id: string) => { setFocusId(id); tree.current?.querySelector<HTMLElement>(`[data-ui-id="${CSS.escape(id)}"]`)?.focus() }
  const onKey = (e: KeyboardEvent<HTMLElement>, id: string) => {
    const i = rows.indexOf(id), it = items.find((x) => x.id === id)
    const group = !!kids(id).length
    // A key handled here is this row's alone: the parent rows' handlers must not see it (nested tree items).
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft', ' ', 'Enter'].includes(e.key)) e.stopPropagation()
    if (e.key === 'ArrowDown' && i < rows.length - 1) { e.preventDefault(); focusRow(rows[i + 1]) }
    else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focusRow(rows[i - 1]) }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(rows[0]) }
    else if (e.key === 'End') { e.preventDefault(); focusRow(rows[rows.length - 1]) }
    else if (e.key === 'ArrowRight' && group) { e.preventDefault(); if (!isOpen(id)) setClosed((c) => ({ ...c, [id]: false })); else if (kids(id)[0]) focusRow(kids(id)[0].id) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (group && isOpen(id)) setClosed((c) => ({ ...c, [id]: true })); else if (it?.parent) focusRow(it.parent) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (it && !it.locked) setUiVisible(id, !(groupState(id, hidden, items) === 'on')) }
  }
  const load = async (f: File) => { const r = loadUiLayout(await f.text()); setNote(r.ok ? `Layout loaded: ${r.n} part${r.n === 1 ? '' : 's'} hidden.` : r.error) }
  const renderRows = (parent: string | null, depth: number) => kids(parent).map((it) => {
    const group = kids(it.id).length > 0
    const state = groupState(it.id, hidden, items)
    const n = group ? hiddenCount(it.id, hidden, items) : 0
    const Icon = it.icon
    const tab = focusId ? focusId === it.id : rows[0] === it.id
    return (
      <li key={it.id} role="treeitem" aria-expanded={group ? isOpen(it.id) : undefined} aria-checked={it.locked ? undefined : state === 'mixed' ? 'mixed' : state === 'on'} aria-level={depth + 1} aria-label={`${it.label}${it.locked ? ', always shown' : state === 'on' ? ', shown' : state === 'off' ? ', hidden' : `, ${n} hidden`}`}
        data-ui-id={it.id} data-ui-state={it.locked ? 'locked' : state} tabIndex={tab ? 0 : -1} onKeyDown={(e) => onKey(e, it.id)} onFocus={() => setFocusId(it.id)}
        className="outline-none focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-accent">
        <div className="flex h-7 items-center gap-1 rounded-lg pr-1 hover:bg-subtle" style={{ paddingLeft: 4 + depth * 14 }} title={it.hint}>
          {group ? (
            <button type="button" tabIndex={-1} onClick={() => setClosed((c) => ({ ...c, [it.id]: isOpen(it.id) }))} aria-label={isOpen(it.id) ? `Close ${it.label}` : `Open ${it.label}`}
              className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-ink">{isOpen(it.id) ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}</button>
          ) : <span className="w-5 shrink-0" />}
          {/* The tri-state box: a click toggles the part (a group: all of it) */}
          <button type="button" tabIndex={-1} disabled={it.locked} onClick={() => setUiVisible(it.id, state !== 'on')} data-ui-toggle={it.id} aria-label={`${state === 'on' ? 'Hide' : 'Show'} ${it.label}`}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${it.locked ? 'border-line bg-subtle text-muted' : state === 'on' ? 'border-accent bg-accent text-white' : state === 'mixed' ? 'border-accent bg-selected text-accent-hover' : 'border-boundary bg-panel'}`}>
            {it.locked ? <Lock size={10} aria-hidden /> : state === 'on' ? <Check size={11} aria-hidden /> : state === 'mixed' ? <Minus size={11} aria-hidden /> : null}
          </button>
          {Icon && <Icon size={13} aria-hidden className="shrink-0 text-muted" />}
          <span className={`min-w-0 flex-1 truncate text-control ${state === 'off' && !it.locked ? 'text-muted' : 'text-ink'}`}>{it.label}</span>
          {group && n > 0 && <span className="shrink-0 rounded-full bg-subtle px-1.5 text-meta text-muted" data-ui-hidden-count={n}>{n} hidden</span>}
        </div>
        {group && isOpen(it.id) && <ul role="group">{renderRows(it.id, depth + 1)}</ul>}
      </li>
    )
  })
  return (
    <div role="dialog" aria-label="Interface: what the app shows" data-testid="interface-drawer" className="absolute left-0 top-full z-50 mt-2 flex max-h-[min(44rem,78vh)] w-[26rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-line bg-panel text-ink shadow-float">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <PanelsTopLeft size={14} aria-hidden className="text-accent" />
        <h2 className="text-control font-semibold">What the app shows</h2>
        <span className="text-meta text-muted">in {MODE_NAME[mode]}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={14} aria-hidden /></button>
      </div>
      {/* Workspaces (Ruijie, 17 Nov): Illustrator-style presets of the whole arrangement. */}
      <WorkspaceMenu onNote={setNote} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line px-2 py-1"><Search size={13} className="shrink-0 text-muted" aria-hidden /><span className="sr-only">Search the parts</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" data-testid="interface-search" className="min-w-0 flex-1 bg-transparent text-control outline-none" /></label>
        <button type="button" onClick={showAllUi} data-testid="interface-show-all" className={btn} disabled={!hiddenTotal}>Show all</button>
        <button type="button" onClick={resetUi} data-testid="interface-reset" className={btn} title="Back to the default: everything shown"><RotateCcw size={12} aria-hidden />Reset</button>
      </div>
      <p className="border-b border-line px-3 py-1.5 text-meta text-muted">Hiding is view-only: checks keep running, and a hidden Results section switches no node off. {hiddenTotal ? `${hiddenTotal} of ${total} parts hidden.` : 'Everything is shown.'}</p>
      <ul ref={tree} role="tree" aria-label={`Parts of the app in ${MODE_NAME[mode]}`} className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ scrollbarWidth: 'thin' }}>
        {renderRows(null, 0)}
        {!rows.length && <li className="px-2 py-1 text-meta text-muted">Nothing matches "{q}".</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
        <button type="button" onClick={() => saveFile('tower-studio-interface.json', uiLayoutText())} data-testid="interface-save" className={btn} title="Save this layout as a small file, to share with your team"><Download size={12} aria-hidden />Save layout</button>
        <button type="button" onClick={() => fileRef.current?.click()} data-testid="interface-load" className={btn} title="Load a saved layout file"><Upload size={12} aria-hidden />Load layout</button>
        <input ref={fileRef} type="file" accept=".json,application/json" data-testid="interface-file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await load(f); e.target.value = '' }} />
        <span className="ml-auto text-meta text-muted">Kept in this browser, not in the project file.</span>
        {note && <span role="status" className="basis-full text-meta text-ink">{note}</span>}
      </div>
    </div>
  )
}
