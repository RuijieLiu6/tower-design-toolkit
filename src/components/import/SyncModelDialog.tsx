// Sync model (Ruijie, 17 Nov: "put a Live model or Sync model option in the Untitled project drop-down, where you can
// again connect the modelling software you want to this tool"). One place for the live links the Import tool also
// offers (RhinoImportPanel.tsx, reused here, never a second copy): the state of the link now (off, watching, reading,
// a problem; what it is linked to and when it last synced; Disconnect), the platforms as rows with whether the link
// has been run inside that app (lib/interchange/platforms.ts `tested`: Rhino in Rhino 8 on the team laptop, the
// others written to the app's documented API and not yet run there, so unverified), and the chosen platform's own
// link card with its steps. Two-way as far as each link supports: Rhino and SketchUp serve the model from a script
// inside the app; Revit, Archicad and AutoCAD rewrite one file the Toolkit re-reads (Chrome and Edge).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plug, Unplug, X } from '../icons'
import { create } from 'zustand'
import { stopLink, useLiveLink } from '../../lib/interchange/live'
import { PLATFORMS, platformById, type PlatformId } from '../../lib/interchange/platforms'
import { useStore } from '../../store'
import { isVisible, useUiItems, useUiVisibility } from '../../lib/ui/registry'
import Help from '../Help'
import { FlagChip } from '../ui'
import { FileLive, RhinoLive, ServerLive } from './RhinoImportPanel'
import SoftwareBadge from './SoftwareBadge'

interface SyncDialogState { open: boolean; platform: PlatformId; opener: HTMLElement | null }
export const useSyncDialog = create<SyncDialogState>(() => ({ open: false, platform: 'rhino', opener: null }))
export const openSyncDialog = (opener: HTMLElement | null = null) => useSyncDialog.setState({ open: true, opener })
const closeSyncDialog = () => useSyncDialog.setState((s) => { requestAnimationFrame(() => s.opener?.focus()); return { open: false, opener: null } })

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function SyncModelDialog() {
  const open = useSyncDialog((s) => s.open)
  if (!open) return null
  return <Body />
}

function Body() {
  const platform = useSyncDialog((s) => s.platform)
  const live = useLiveLink()
  const present = useStore((s) => s.phase === 'present')
  const box = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState<string | null>(null)
  const p = platformById(platform)
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const platforms = PLATFORMS.filter((x) => !x.link || isVisible(`addons.sync.${x.id}`, hiddenUi, uiItems))
  useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-sync-platform][aria-checked="true"]')?.focus()) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeSyncDialog() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [])
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return
    const f = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')].filter((x) => x.offsetParent !== null)
    if (!f.length) return
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
  }
  const linked = live.status !== 'off'
  const state = !linked ? { dot: 'bg-slate-300', word: 'Not connected' } : live.status === 'error' ? { dot: 'bg-amber-500', word: 'Link problem' } : live.status === 'reading' ? { dot: 'bg-accent', word: 'Reading' } : { dot: 'bg-green-600', word: 'Watching' }
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = PLATFORMS.findIndex((x) => x.id === platform)
    const j = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? PLATFORMS.length - 1 : null
    if (j === null) return
    e.preventDefault()
    const next = PLATFORMS[(j + PLATFORMS.length) % PLATFORMS.length].id
    useSyncDialog.setState({ platform: next })
    box.current?.querySelector<HTMLElement>(`[data-sync-platform="${next}"]`)?.focus()
  }
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) closeSyncDialog() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="sync-title" data-testid="sync-dialog" onKeyDown={trap}
        className="flex max-h-[90vh] w-[min(880px,100%)] flex-col overflow-hidden rounded-2xl bg-panel text-ink shadow-float">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <Plug size={16} aria-hidden className="text-accent" />
          <h2 id="sync-title" className="text-section font-semibold">Sync model</h2>
          <Help label="About syncing a model">
            A small script inside your modelling app sends the open model to this page, on your own computer only, so the model here follows the one there; nothing is uploaded. Rhino and SketchUp serve it live (a second or two behind each change); Revit, Archicad and AutoCAD write one file that the Toolkit re-reads whenever it changes (Chrome and Edge). Where a link sends changes back depends on the app's own API; the Toolkit's Export › Geometry is the way back for the others. The Import tool on the Site step offers the same links.
          </Help>
          <button type="button" onClick={closeSyncDialog} aria-label="Close" data-testid="sync-close" className="ml-auto rounded-lg p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={15} aria-hidden /></button>
        </div>
        {/* The link now */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-4 py-2 text-control" role="status" data-testid="sync-status" data-state={live.status}>
          <i aria-hidden className={`h-2.5 w-2.5 rounded-full ${state.dot}`} />
          <b className="text-ink">{state.word}</b>
          {linked && <span className="text-muted">{live.name}{live.lastSync ? ` · last sync ${time(live.lastSync)}` : ''}</span>}
          {linked && live.message && <span className="basis-full text-meta text-muted">{live.message}</span>}
          {!linked && <span className="text-muted">Pick the app below and follow its steps.</span>}
          {linked && <button type="button" onClick={() => { stopLink(); setNote('Disconnected here. Stop the script in the app too when you are done.') }} data-testid="sync-disconnect" className="ml-auto flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-meta text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><Unplug size={12} aria-hidden />Disconnect</button>}
          {note && <span className="basis-full text-meta text-amber-900">{note}</span>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 md:flex-row" style={{ scrollbarWidth: 'thin' }}>
          {/* The platforms, honestly: which link has been run inside its app */}
          <div role="radiogroup" aria-label="Modelling app" className="grid shrink-0 content-start gap-1 md:w-64">
            {platforms.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={x.id === platform} tabIndex={x.id === platform ? 0 : -1} onClick={() => useSyncDialog.setState({ platform: x.id })} onKeyDown={onKey}
                data-sync-platform={x.id} data-tested={x.tested.ok ? 'ok' : 'no'} title={`${x.name} ${x.versions} · ${x.tested.text}`}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${x.id === platform ? 'border-accent bg-selected' : 'border-line bg-panel hover:border-boundary'}`}>
                <SoftwareBadge p={x} size={22} />
                <span className="min-w-0 flex-1 truncate text-ink">{x.name}</span>
                {x.link ? (x.tested.ok ? <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-meta text-emerald-800">Tested</span> : <FlagChip flag="unverified" />) : <span className="shrink-0 text-meta text-muted">upload only</span>}
              </button>
            ))}
            <p className="px-1 pt-1 text-meta text-muted">Tested: run inside that app on the team laptop. Unverified: written to the app's documented API, not yet run inside it.</p>
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-line bg-canvas p-3" data-testid="sync-body">
            <h3 className="flex items-center gap-2 text-control font-semibold text-ink"><SoftwareBadge p={p} size={20} />{p.name}<span className="font-normal text-muted">{p.versions}</span></h3>
            <p className="mt-0.5 text-meta text-muted">{p.tested.text}</p>
            <div className="mt-2 text-xs">
              {p.id === 'rhino' ? <RhinoLive disabled={present} /> : p.link?.kind === 'server' ? <ServerLive p={p} disabled={present} /> : p.link?.kind === 'file' ? <FileLive p={p} disabled={present} />
                : <p className="text-control text-ink">No live link for other files: bring the model in through the project menu's Import… › 3D model, and again after each change.</p>}
            </div>
            {present && <p className="mt-2 text-meta text-muted">The model is locked in Presentation: a link connects, but changes apply when you return to Model.</p>}
          </div>
        </div>
      </div>
    </div>, document.body)
}
