// Project menu in the top bar: undo / redo, New, Open, Save as, Export, Import, and the autosave status.
// Projects live in this browser (IndexedDB); Export writes a deterministic .json to keep or share.
import { Box, ChevronDown, FileDown, FilePlus, FileUp, FolderOpen, HardDrive, Redo2, Save, Trash, Undo2 } from './icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { saveFile } from '../lib/download'
import { useImportStore } from '../lib/import/store'
import { redo, startHistory, undo, useHistory } from '../lib/project/history'
import { currentText, exportName, newProject, openStored, openText, refreshList, removeStored, saveAs, startPersistence, useProjectMeta } from '../lib/project/session'
import { useStore } from '../store'
import { TraceRecorder } from './TracePanel'

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}
const time = (iso: string) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ProjectMenu() {
  const present = useStore((s) => s.phase === 'present')
  const { canUndo, canRedo } = useHistory()
  const meta = useProjectMeta()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<'none' | 'open' | 'save'>('none')
  const [name, setName] = useState('')
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Undo history and autosave run while the design view is open.
  useEffect(() => {
    const stopHistory = startHistory()
    const stopSaving = startPersistence()
    return () => { stopHistory(); stopSaving() }
  }, [])

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Ctrl/Cmd+S save as. Text fields keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); openMenu('save'); return }
      if ((k !== 'z' && k !== 'y') || isTyping(e.target)) return
      e.preventDefault()
      if (useStore.getState().phase === 'present') { useStore.setState({ announce: 'The model is locked in Present' }); return }
      if (k === 'y' || e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  function openMenu(p: 'none' | 'open' | 'save' = 'none') {
    setOpen(true)
    setPanel(p)
    setConfirmKey(null)
    if (p === 'save') setName(useProjectMeta.getState().name ?? '')
    if (p === 'open') void refreshList()
  }

  const readFile = async (f: File) => {
    const ok = await openText(await f.text(), f.name.replace(/\.json$/i, ''))
    if (ok) setPanel('none')
  }

  const locked = present ? 'The model is locked in Present' : undefined
  const btn = `rounded p-1.5 disabled:opacity-30 ${present ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
  const status = meta.storage === 'unavailable' ? 'This browser blocks storage: Export to keep your work'
    : meta.autosavedAt ? `Autosaved in this browser · ${time(meta.autosavedAt)}` : 'Autosaves in this browser after each change'

  return (
    <div className="flex items-center gap-0.5">
      <TraceRecorder />
      <button className={btn} onClick={() => undo()} disabled={!canUndo || present} title={locked ?? 'Undo (Ctrl+Z)'} aria-label="Undo"><Undo2 size={16} /></button>
      <button className={btn} onClick={() => redo()} disabled={!canRedo || present} title={locked ?? 'Redo (Ctrl+Shift+Z)'} aria-label="Redo"><Redo2 size={16} /></button>
      <div ref={box} className="relative">
        <button onClick={() => (open ? setOpen(false) : openMenu())} aria-haspopup="menu" aria-expanded={open} aria-label={`Project file: ${meta.name ?? 'Untitled project'}`} title="Project file: new, open, save, export, import"
          className={`ml-0.5 flex h-8 max-w-[12rem] items-center gap-1.5 rounded-lg border px-2 text-control font-medium ${present ? 'border-white/30 hover:bg-white/10' : 'border-line hover:border-accent hover:text-accent'}`}>
          <FolderOpen size={14} aria-hidden />
          <span className="truncate">{meta.name ?? 'Untitled project'}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
        {open && (
          <div role="menu" aria-label="Project file" className="glass absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-panel p-1.5 text-ink shadow-xl">
            <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-meta text-muted"><HardDrive size={12} aria-hidden />{status}</div>
            {meta.message && (
              <div className={`mx-1 mb-1.5 rounded-md px-2 py-1.5 text-meta ${meta.message.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : meta.message.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-900'}`} role="status">
                {meta.message.text}
                {meta.message.details && <ul className="mt-1 list-disc pl-4">{meta.message.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
              </div>
            )}
            <Item icon={<FilePlus size={14} />} onClick={() => { newProject(); setPanel('none') }} disabled={present} hint={locked}>New project</Item>
            <Item icon={<FolderOpen size={14} />} onClick={() => (panel === 'open' ? setPanel('none') : openMenu('open'))} disabled={present} hint={locked} expanded={panel === 'open'}>Open…</Item>
            {panel === 'open' && (
              <div className="mx-1 mb-1 max-h-56 overflow-y-auto rounded-md border border-line">
                {meta.saved.length === 0 && <p className="px-2 py-2 text-meta text-muted">No saved projects in this browser yet. Use Save as…, or Import a .json.</p>}
                {meta.saved.map((p) => (
                  <div key={p.key} className="flex items-center gap-1 border-b border-line/60 px-2 py-1 last:border-0">
                    <button onClick={() => { void openStored(p.key); setPanel('none') }} className="min-w-0 flex-1 text-left hover:text-accent">
                      <div className="truncate text-xs font-medium">{p.name}</div>
                      <div className="text-meta text-muted">{time(p.savedAt)}</div>
                    </button>
                    <button onClick={() => (confirmKey === p.key ? void removeStored(p.key) : setConfirmKey(p.key))} title="Remove from this browser"
                      className={`rounded px-1.5 py-1 text-meta ${confirmKey === p.key ? 'bg-red-50 text-red-800' : 'text-muted hover:text-red-800'}`}>
                      {confirmKey === p.key ? 'Remove?' : <Trash size={12} aria-label="Remove" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Item icon={<Save size={14} />} onClick={() => (panel === 'save' ? setPanel('none') : openMenu('save'))} expanded={panel === 'save'}>Save as…</Item>
            {panel === 'save' && (
              <form className="mx-1 mb-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); void saveAs(name).then(() => setPanel('none')) }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" maxLength={80} aria-label="Project name"
                  className="min-w-0 flex-1 rounded border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent" />
                <button type="submit" className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">Save</button>
              </form>
            )}
            <Item icon={<Box size={14} />} onClick={() => { setOpen(false); useImportStore.getState().openDialog() }} disabled={present} hint={locked ?? 'Rhino .3dm, OBJ, glTF or IFC: map its layers, check units and north; read in this browser only'}>Upload a Rhino model…</Item>
            <Item icon={<FileDown size={14} />} onClick={async () => { saveFile(exportName(), await currentText()); useStore.setState({ announce: 'Project exported' }) }}>Export .json</Item>
            <Item icon={<FileUp size={14} />} onClick={() => fileInput.current?.click()} disabled={present} hint={locked}>Import .json…</Item>
            <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = '' }} />
            <p className="px-2 pb-1 pt-1.5 text-meta leading-snug text-muted">Projects stay in this browser. Export a .json to keep a copy or share it; the same design always exports the same file. Ctrl+Z / Ctrl+Shift+Z undo and redo design changes.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Item({ icon, children, onClick, disabled, hint, expanded }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; hint?: string; expanded?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} disabled={disabled} title={hint} aria-expanded={expanded}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40">
      <span className="text-muted">{icon}</span>{children}
    </button>
  )
}
