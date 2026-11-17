// The Workspace menu at the top of the Interface drawer (Ruijie, 17 Nov: "like Adobe Illustrator's workspace presets:
// Getting Started, Essentials, Classic and Manage Workspaces"). The built-in workspaces, your own, Reset (back to the
// active one as saved), New workspace (the current arrangement under a name) and Manage workspaces (rename, update
// with the current arrangement, delete). Switching applies at once; the arrangement is lib/ui/workspaces.ts.
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LayoutGrid, Pencil, Plus, RotateCcw, Save, Trash2, X } from '../icons'
import {
  BUILT_IN, deleteWorkspace, nameProblem, newWorkspace, renameWorkspace, resetWorkspace, switchWorkspace, updateWorkspace, useActiveWorkspace, useWorkspaces, type Workspace,
} from '../../lib/ui/workspaces'

const item = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-control text-ink outline-none hover:bg-subtle focus-visible:bg-subtle disabled:opacity-40'
const small = 'flex h-7 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-meta text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
const field = 'min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

export default function WorkspaceMenu({ onNote }: { onNote: (s: string) => void }) {
  const { workspace, changed } = useActiveWorkspace()
  const mine = useWorkspaces((s) => s.mine)
  const [view, setView] = useState<'closed' | 'menu' | 'new' | 'manage'>('closed')
  const box = useRef<HTMLDivElement>(null)
  // Esc and a click elsewhere close the menu only (the drawer stays open).
  useEffect(() => {
    if (view === 'closed') return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setView('closed') } }
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setView('closed') }
    window.addEventListener('keydown', key, true); window.addEventListener('pointerdown', away, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', away, true) }
  }, [view])
  useEffect(() => { if (view === 'menu') box.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus() }, [view])
  const pick = (w: Workspace) => { switchWorkspace(w.id); setView('closed'); onNote(`Workspace: ${w.name}.`) }
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault(); e.stopPropagation()
    const list = [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus()
  }
  const radio = (w: Workspace) => (
    <button key={w.id} type="button" role="menuitemradio" aria-checked={workspace.id === w.id} onClick={() => pick(w)} title={w.hint} data-workspace={w.id} className={item}>
      <span className="flex w-4 shrink-0 justify-center text-accent">{workspace.id === w.id && <Check size={13} aria-hidden />}</span>
      <span className="min-w-0 flex-1 truncate">{w.name}</span>
    </button>
  )
  return (
    <div ref={box} className="relative border-b border-line px-3 py-2" data-testid="workspace">
      <div className="flex items-center gap-2">
        <span className="text-meta font-semibold text-muted">Workspace</span>
        <button type="button" onClick={() => setView(view === 'closed' ? 'menu' : 'closed')} aria-haspopup="menu" aria-expanded={view !== 'closed'} data-testid="workspace-button"
          title={workspace.hint ?? 'Your workspace'} className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-control font-medium text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
          <LayoutGrid size={14} aria-hidden className="shrink-0 text-accent" />
          <span className="min-w-0 truncate" data-testid="workspace-name">{workspace.name}</span>
          {changed && <span className="shrink-0 text-meta font-normal text-muted" data-testid="workspace-changed">· changed</span>}
          <ChevronDown size={12} aria-hidden className="ml-auto shrink-0" />
        </button>
        <button type="button" onClick={() => { resetWorkspace(); onNote(`${workspace.name} reset.`) }} disabled={!changed} data-testid="workspace-reset" className={small} title={`Put ${workspace.name} back as it was saved`}>
          <RotateCcw size={12} aria-hidden />Reset
        </button>
      </div>
      {view === 'menu' && (
        <div role="menu" aria-label="Workspaces" onKeyDown={onMenuKey} data-testid="workspace-menu" className="absolute left-3 right-3 top-full z-10 mt-1 rounded-xl border border-line bg-panel p-1 shadow-float">
          {BUILT_IN.map(radio)}
          {mine.length > 0 && <><div role="separator" className="my-1 border-t border-line" />{mine.map(radio)}</>}
          <div role="separator" className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={() => { resetWorkspace(); setView('closed'); onNote(`${workspace.name} reset.`) }} disabled={!changed} className={item}>
            <RotateCcw size={13} aria-hidden className="ml-0.5 mr-0.5 shrink-0 text-muted" />Reset {workspace.name}</button>
          <button type="button" role="menuitem" onClick={() => setView('new')} data-testid="workspace-new" className={item}>
            <Plus size={13} aria-hidden className="ml-0.5 mr-0.5 shrink-0 text-muted" />New workspace…</button>
          <button type="button" role="menuitem" onClick={() => setView('manage')} data-testid="workspace-manage" className={item}>
            <Pencil size={13} aria-hidden className="ml-0.5 mr-0.5 shrink-0 text-muted" />Manage workspaces…</button>
        </div>
      )}
      {view === 'new' && <NewWorkspace onDone={(w) => { setView('closed'); if (w) onNote(`Saved "${w.name}": the current arrangement, now your workspace.`) }} />}
      {view === 'manage' && <Manage onClose={() => setView('closed')} onNote={onNote} />}
    </div>
  )
}

/** Name the current arrangement as a workspace of your own. */
function NewWorkspace({ onDone }: { onDone: (w: Workspace | null) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const save = () => { const p = nameProblem(name); if (p) { setError(p); return } onDone(newWorkspace(name)) }
  return (
    <div role="dialog" aria-label="New workspace" className="mt-2 rounded-xl border border-line bg-canvas p-2" data-testid="workspace-new-form">
      <p className="text-meta text-muted">Saves what shows now, the panels and their widths, the tool rail and the view, under a name.</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError('') }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone(null) }}
          placeholder="Workspace name" aria-label="Workspace name" maxLength={40} data-testid="workspace-name-input" className={field} />
        <button type="button" onClick={save} data-testid="workspace-save" className={small}><Save size={12} aria-hidden />Save</button>
        <button type="button" onClick={() => onDone(null)} className={small}>Cancel</button>
      </div>
      {error && <p role="alert" className="mt-1 text-meta text-error">{error}</p>}
    </div>
  )
}

/** Your workspaces: rename, update with the current arrangement, delete (asks once). The built-in ones stay as they are. */
function Manage({ onClose, onNote }: { onClose: () => void; onNote: (s: string) => void }) {
  const mine = useWorkspaces((s) => s.mine)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const keep = (id: string) => { const p = nameProblem(name, id); if (p) { setError(p); return } renameWorkspace(id, name); setEditing(null); setError('') }
  return (
    <div role="dialog" aria-label="Manage workspaces" className="mt-2 rounded-xl border border-line bg-canvas p-2" data-testid="workspace-manage-panel">
      <div className="flex items-center gap-2"><span className="text-control font-semibold">Your workspaces</span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button></div>
      {!mine.length && <p className="mt-1 text-meta text-muted">None yet. Arrange the app, then New workspace… saves it. Getting Started, Essentials and Classic are built in and stay as they are.</p>}
      <ul className="mt-1 grid gap-1">
        {mine.map((w) => (
          <li key={w.id} className="flex items-center gap-1.5" data-my-workspace={w.name}>
            {editing === w.id
              ? <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError('') }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') keep(w.id); if (e.key === 'Escape') setEditing(null) }}
                  aria-label={`New name for ${w.name}`} maxLength={40} className={field} />
              : <span className="min-w-0 flex-1 truncate text-control">{w.name}</span>}
            {editing === w.id
              ? <button type="button" onClick={() => keep(w.id)} className={small}>Rename</button>
              : <button type="button" onClick={() => { setEditing(w.id); setName(w.name); setError('') }} aria-label={`Rename ${w.name}`} className={small}><Pencil size={12} aria-hidden /></button>}
            <button type="button" onClick={() => { updateWorkspace(w.id); onNote(`"${w.name}" now holds the current arrangement.`) }} aria-label={`Update ${w.name} with the current arrangement`} title="Save the current arrangement into this workspace" className={small}><Save size={12} aria-hidden /></button>
            {deleting === w.id
              ? <button type="button" onClick={() => { deleteWorkspace(w.id); setDeleting(null); onNote(`"${w.name}" deleted.`) }} className={`${small} border-error text-error`}>Delete?</button>
              : <button type="button" onClick={() => setDeleting(w.id)} aria-label={`Delete ${w.name}`} className={small}><Trash2 size={12} aria-hidden /></button>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 text-meta text-error">{error}</p>}
    </div>
  )
}
