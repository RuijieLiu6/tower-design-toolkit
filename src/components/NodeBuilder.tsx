// Library entries for community nodes: "My nodes", the "can't find it?" prompt when a search finds nothing, and the
// permanent "Build your own node" entry that opens the node builder dialog.
import { FileUp, PackagePlus, SearchX } from './icons'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { CATEGORY_ICONS } from '../data/icons'
import { CATEGORIES } from '../data/registry'
import { useCommunityResults, type CommunityRun } from '../hooks/useCommunityResults'
import { useCommunityStore } from '../lib/communityStore'
import { STAGE_LABEL, summarize, type NodePackage } from '../lib/nodePackages'
import { useStore } from '../store'
import { Toggle } from './ui'
import { useShallow } from 'zustand/react/shallow'

// If the dialog's code can't load (offline, or a stale dev server), say so instead of blanking the whole app.
const NodeBuilderDialog = lazy(() => import('./NodeBuilderDialog').catch(() => ({ default: DialogLoadError })))

function DialogLoadError() {
  const close = useCommunityStore((s) => s.closeDialog)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="alertdialog" aria-labelledby="nb-load-error">
      <div className="max-w-sm rounded-xl bg-panel p-5 text-sm shadow-xl">
        <h2 id="nb-load-error" className="font-semibold">The node builder didn't load</h2>
        <p className="mt-1 text-xs text-muted">Check your connection and reload the page. Your design and My nodes are kept.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className="rounded-md border border-line px-3 py-1.5 text-xs">Close</button>
          <button onClick={() => window.location.reload()} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white">Reload</button>
        </div>
      </div>
    </div>
  )
}

const matches = (p: NodePackage, q: string) => !q || `${p.name} ${p.question} ${p.id}`.toLowerCase().includes(q)

/** How many imported nodes match the library search (q is already trimmed and lower-cased). */
export function useMyNodeMatches(q: string) {
  return useCommunityStore((s) => s.packages.filter((p) => matches(p, q)).length)
}

const TONE: Record<string, string> = { ok: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', muted: 'text-muted' }

function MyNodeRow({ p, run }: { p: NodePackage; run?: CommunityRun }) {
  const { enabled, toggleNode, selectNode, selectedNode } = useStore(useShallow((s) => ({ enabled: s.enabled, toggleNode: s.toggleNode, selectNode: s.selectNode, selectedNode: s.selectedNode })))
  const Icon = CATEGORY_ICONS[p.category]
  const status = run?.error ? { text: 'could not run', tone: 'bad' }
    : run && !run.applies ? { text: 'other project', tone: 'warn' }
    : !enabled[p.id] ? { text: 'off', tone: 'muted' }
    : summarize(run?.results ?? [])
  return (
    <div onClick={() => selectNode(p.id)} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/5 ${selectedNode === p.id ? 'bg-accent/10' : ''}`}>
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: CATEGORIES[p.category].color }}>
        <Icon size={14} />
        <span className="absolute -bottom-1 -right-1 rounded-sm bg-panel px-[2px] text-[7px] font-bold leading-[9px] text-ink ring-1 ring-line" aria-hidden>C</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-ink" title={p.name}>{p.name}</div>
        <div className="truncate text-[10px] text-muted">Community · {STAGE_LABEL[p.stage]} · <span className={TONE[status.tone]}>{status.text}</span></div>
      </div>
      <div onClick={(e) => e.stopPropagation()}><Toggle checked={!!enabled[p.id]} onChange={() => toggleNode(p.id)} label={`Use ${p.name}`} /></div>
    </div>
  )
}

/** "My nodes": imported community nodes, with an Import action. Hidden while a search matches none of them. */
export function MyNodes({ q }: { q: string }) {
  const packages = useCommunityStore((s) => s.packages)
  const openDialog = useCommunityStore((s) => s.openDialog)
  const runs = useCommunityResults()
  const list = packages.filter((p) => matches(p, q))
  if (q && !list.length) return null
  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="flex items-center justify-between px-2 pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">My nodes{packages.length ? ` · ${packages.length}` : ''}</h3>
        <button onClick={() => openDialog('import')} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/10"><FileUp size={12} />Import node</button>
      </div>
      {list.map((p) => <MyNodeRow key={p.id} p={p} run={runs.get(p.id)} />)}
      {!packages.length && <p className="px-2 pb-1 text-[11px] text-muted">Nodes you build with your AI and import appear here. They stay in this browser.</p>}
    </div>
  )
}

/** Shown when a library search finds nothing at all. */
export function NoMatch({ query }: { query: string }) {
  const openDialog = useCommunityStore((s) => s.openDialog)
  return (
    <div className="mx-1 mb-2 rounded-lg border border-dashed border-accent/40 bg-accent/[0.04] p-3" role="status">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><SearchX size={14} className="text-muted" />No node matches “{query.trim()}”</div>
      <p className="mt-1 text-[11px] leading-snug text-slate-700"><b>Can't find the tool you need?</b> Copy the node builder skill to your AI, describe what you want to check, and import the node it helps you make.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => openDialog('build', query)} className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"><PackagePlus size={13} />Build your own node</button>
        <button onClick={() => openDialog('import')} className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink hover:border-accent hover:text-accent"><FileUp size={13} />Import node</button>
      </div>
    </div>
  )
}

/** Permanent last entry of the library. */
export function BuildYourOwn() {
  const openDialog = useCommunityStore((s) => s.openDialog)
  return (
    <button onClick={() => openDialog('build')} className="group mt-3 flex w-full items-start gap-2.5 rounded-lg border border-dashed border-line p-2.5 text-left hover:border-accent hover:bg-accent/[0.04]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white"><PackagePlus size={15} /></span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink">Build your own node</span>
        <span className="block text-[10px] leading-snug text-muted">Can't find the tool you need? Copy the skill to your AI and develop your own node to add here.</span>
      </span>
    </button>
  )
}

/** The node builder dialog, mounted once in App. Open it from anywhere with useCommunityStore.getState().openDialog('build' | 'import'). */
export function NodeBuilderHost() {
  const dialog = useCommunityStore((s) => s.dialog)
  return dialog ? <Suspense fallback={null}><NodeBuilderDialog /></Suspense> : null
}

/** Adapter for views that hold their own open/close state: opens the dialog on the build tab, reports when it closes. */
export function NodeBuilderSlot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useCommunityStore((s) => s.dialog)
  const openDialog = useCommunityStore((s) => s.openDialog)
  const closeDialog = useCommunityStore((s) => s.closeDialog)
  const ours = useRef(false)
  useEffect(() => {
    if (open && !ours.current) { ours.current = true; openDialog('build') }
    if (!open && ours.current) { ours.current = false; closeDialog() }
  }, [open, openDialog, closeDialog])
  useEffect(() => { if (ours.current && dialog === null) { ours.current = false; onClose() } }, [dialog, onClose])
  return null
}
