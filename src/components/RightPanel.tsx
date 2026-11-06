// Right panel of the guided app: Your site, the analysis results (Results & evidence) and the Trace. Present adds its own
// tabs (Present, and Render once components/RenderTab.tsx exists). The design tools are in the left panel (tools/ToolPanel).
// Your site (Ruijie, 5 Nov: "move the property and information tab on the right side … keep the left side only things")
// opens by itself in the Site step.
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ALL_NODES, BUILT_NODES, CATEGORIES } from '../data/registry'
import { useCommunityNodeDefs } from '../lib/communityStore'
import { useStep } from '../lib/step'
import { useTowerAdds, watchTowerAdds } from '../lib/towerAdds'
import { useStore } from '../store'
import Inspector from './Inspector'
import { HidePanelButton } from './PanelToggle'
import PresentPanel from './PresentPanel'
import TracePanel from './TracePanel'

// The main session builds components/RenderTab.tsx (default export, no props). The glob finds it when it exists;
// until then Present has no Render tab and nothing breaks.
const renderModules = import.meta.glob<{ default: ComponentType }>('./RenderTab.tsx')
const RenderTab = renderModules['./RenderTab.tsx'] ? lazy(renderModules['./RenderTab.tsx']) : null
const SiteInfo = lazy(() => import('./site/SiteInfo'))

type Tab = 'site' | 'results' | 'present' | 'render' | 'trace'

/** Picks which node's results to read, without switching anything on or off (the bottom bar does that). */
function ResultsPicker() {
  const { enabled, selectedNode, selectNode } = useStore(useShallow((s) => ({ enabled: s.enabled, selectedNode: s.selectedNode, selectNode: s.selectNode })))
  const community = useCommunityNodeDefs()
  const on = [...BUILT_NODES, ...community].filter((n) => enabled[n.id])
  const current = selectedNode && !on.some((n) => n.id === selectedNode) ? [...ALL_NODES, ...community].find((n) => n.id === selectedNode) : undefined
  const options = current ? [current, ...on] : on
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-2">
      <label htmlFor="results-for" className="shrink-0 text-[11px] text-muted">Show results for</label>
      <select id="results-for" value={selectedNode ?? ''} onChange={(e) => selectNode(e.target.value || null)}
        className="min-w-0 flex-1 rounded border border-line bg-panel px-1.5 py-1 text-xs">
        {!selectedNode && <option value="">Choose a check…</option>}
        {/* Grouped by category (UI review round 2, 4 Nov: a flat list of 30 checks was hard to scan; run-through F4). */}
        {[...new Set(options.map((n) => n.category))].map((c) => (
          <optgroup key={c} label={CATEGORIES[c]?.label ?? c}>
            {options.filter((n) => n.category === c).map((n) => <option key={n.id} value={n.id}>{n.name}{enabled[n.id] ? '' : ' (off)'}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

export default function RightPanel() {
  const phase = useStore((s) => s.phase)
  const step = useStep((s) => s.step)
  const present = phase === 'present'
  const siteStep = phase === 'basic' && step === 'site'
  const [tab, setTab] = useState<Tab>(present ? 'present' : siteStep ? 'site' : 'results')
  useEffect(() => { setTab(phase === 'present' ? 'present' : phase === 'basic' && useStep.getState().step === 'site' ? 'site' : 'results') }, [phase])
  // Entering the Site step shows the site; the other steps keep the tab the user chose.
  useEffect(() => { if (siteStep) setTab('site') }, [siteStep])
  // Picking a node (selectNode: the bottom bar, the library, the canvas, a role) shows its results; switching stage alone
  // does not, nor does opening Real Vancouver or restoring a project, which set the node directly (Your site stays in view).
  // A tower added in Massing (Volume step, an upload, a Rhino link): Your site opens and marks it New (lib/towerAdds.ts).
  useEffect(() => watchTowerAdds(), [])
  const addSeq = useTowerAdds((s) => s.seq)
  const unseen = useTowerAdds((s) => Object.keys(s.added).length > 0)
  const seenAdd = useRef(addSeq)
  useEffect(() => {
    if (addSeq === seenAdd.current) return
    seenAdd.current = addSeq
    if (useStore.getState().phase === 'basic') setTab('site')
  }, [addSeq])
  // Compared with the last count seen, not a first-run flag: React runs mount effects twice in development.
  const resultsSeq = useStore((s) => s.resultsSeq)
  const seen = useRef(resultsSeq)
  useEffect(() => {
    if (resultsSeq === seen.current) return
    seen.current = resultsSeq
    if (useStore.getState().selectedNode) setTab('results')
  }, [resultsSeq])
  const tabs: { id: Tab; label: string }[] = present
    ? [{ id: 'present', label: 'Present' }, ...(RenderTab ? [{ id: 'render' as Tab, label: 'Render' }] : []), { id: 'results', label: 'Results & evidence' }, { id: 'trace', label: 'Trace' }]
    : [{ id: 'site', label: 'Your site' }, { id: 'results', label: 'Results & evidence' }, { id: 'trace', label: 'Trace' }]
  const shown = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  return (
    <aside className="flex h-full w-[22rem] shrink-0 flex-col border-l border-line bg-panel" aria-label={present ? 'Present and results' : 'Results and evidence'}>
      <div className="flex border-b border-line">
      <div role="tablist" aria-label={present ? 'Present and results' : 'Results'} className="flex min-w-0 flex-1">
        {tabs.map((t) => (
          <button key={t.id} id={`rp-tab-${t.id}`} role="tab" aria-selected={shown === t.id} aria-controls="rp-panel" tabIndex={shown === t.id ? 0 : -1} onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              const i = tabs.findIndex((x) => x.id === shown), next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
              setTab(next.id); document.getElementById(`rp-tab-${next.id}`)?.focus()
            }}
            className={`flex-1 px-3 py-2.5 text-xs font-medium ${shown === t.id ? 'border-b-2 border-accent text-ink' : 'text-muted hover:text-ink'}`}>{t.label}{t.id === 'site' && unseen && shown !== 'site' && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" aria-label="new tower" />}</button>
        ))}
      </div>
        <div className="flex items-center px-1"><HidePanelButton side="right" /></div>
      </div>
      <div id="rp-panel" role="tabpanel" aria-labelledby={`rp-tab-${shown}`} className="flex-1 overflow-y-auto">
        {shown === 'site' && <Suspense fallback={<p className="p-4 text-xs text-muted">Loading your site…</p>}><SiteInfo /></Suspense>}
        {shown === 'results' && <><ResultsPicker /><Inspector /></>}
        {shown === 'present' && <PresentPanel />}
        {shown === 'render' && RenderTab && <Suspense fallback={<p className="p-4 text-xs text-muted">Loading Render…</p>}><RenderTab /></Suspense>}
        {shown === 'trace' && <TracePanel />}
      </div>
    </aside>
  )
}
