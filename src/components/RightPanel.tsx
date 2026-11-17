// Right panel of the guided app: Your site, the analysis results (Results & evidence) and the Trace. Present adds its own
// tabs (Present, and Render once components/RenderTab.tsx exists). The design tools are in the left panel (tools/ToolPanel).
// Your site (Ruijie, 5 Nov: "move the property and information tab on the right side … keep the left side only things")
// opens by itself in the Site step.
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import ClimateDrawings from './ClimateDrawings'
import SwResults from './sw/SwResults'
import { groupVisible, UiScopeContext, useUiItems, useUiVisibility } from '../lib/ui/registry'
import { useShallow } from 'zustand/react/shallow'
import { ALL_NODES, BUILT_NODES, CATEGORIES, MERGES, canonicalNode } from '../data/registry'
import { useCommunityNodeDefs } from '../lib/communityStore'
import { useStep } from '../lib/step'
import { useTowerAdds, watchTowerAdds } from '../lib/towerAdds'
import { useTowerPosition } from '../lib/towerPosition'
const TowerProperties = lazy(() => import('./TowerProperties'))
import { useStore } from '../store'
import { useDraw } from '../lib/drawTools'
import { useSiteFocus, watchSiteFocus } from '../lib/siteFocus'
import DrawToolPanel from './draw/ToolPanel'
import { togglePanel, usePanels } from '../lib/panels'
import { NEEDS_MODEL, NEEDS_MODEL_WORD, NEXT_MODEL } from '../lib/missingInput'
import { CircleDashed } from './icons'
import Inspector from './Inspector'
import ResultFreshness from './ResultFreshness'
import { HidePanelButton } from './PanelToggle'
import PresentPanel from './PresentPanel'
import TracePanel from './TracePanel'

// The main session builds components/RenderTab.tsx (default export, no props). The glob finds it when it exists;
// until then Present has no Render tab and nothing breaks.
const renderModules = import.meta.glob<{ default: ComponentType }>('./RenderTab.tsx')
const RenderTab = renderModules['./RenderTab.tsx'] ? lazy(renderModules['./RenderTab.tsx']) : null
const SiteInfo = lazy(() => import('./site/SiteInfo'))

/** Results with Auto-run checks off (project bar): nothing recomputes; one click turns it back on. */
function AnalysisOff() {
  const setAnalysis = useStore((s) => s.setAnalysis)
  return (
    <div data-testid="analysis-off" className="m-3 rounded-lg border border-warning/40 bg-warning-surface p-3">
      <p className="text-control font-semibold text-warning">Checks are paused</p>
      <p className="mt-1 text-body text-ink">Auto-run checks is off, so no result is computed while you design. The checks you picked are kept.</p>
      <button type="button" onClick={() => setAnalysis(true)} className="mt-2 h-8 rounded-lg bg-accent px-3 text-control font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Turn on auto-run</button>
    </div>
  )
}

/**
 * Results before any tower: most checks read the towers, so say what to do first. Shown above checks that run without
 * a model (and with none picked); a check that needs one shows its own "Needs model" state (ResultState.tsx).
 */
function NothingToAnalyse() {
  return (
    <p data-testid="nothing-to-analyse" className="mx-3 mt-3 flex items-start gap-1.5 rounded-md bg-pending-surface px-3 py-2 text-meta text-pending">
      <CircleDashed size={14} className="mt-px shrink-0" aria-hidden />
      <span><b>{NEEDS_MODEL_WORD}</b>: most checks read the tower. {NEXT_MODEL}</span>
    </p>
  )
}

type Tab = 'design' | 'properties' | 'site' | 'results' | 'present' | 'render' | 'trace'

/** Picks which node's results to read, without switching anything on or off (the bottom bar does that). */
function ResultsPicker() {
  const { enabled, selectedNode, selectNode } = useStore(useShallow((s) => ({ enabled: s.enabled, selectedNode: s.selectedNode, selectNode: s.selectNode })))
  const community = useCommunityNodeDefs()
  const on = [...BUILT_NODES, ...community].filter((n) => enabled[n.id])
  // A merged tool's part is read under its lead (data/registry.ts MERGES); the strip below picks the part.
  const lead = selectedNode ? canonicalNode(selectedNode) : null
  const current = lead && !on.some((n) => n.id === lead) ? [...ALL_NODES, ...community].find((n) => n.id === lead) : undefined
  const options = current ? [current, ...on] : on
  const merge = lead ? MERGES[lead] : undefined
  return (
    <div className="border-b border-line px-4 py-2">
    <div className="flex items-center gap-2">
      <label htmlFor="results-for" className="shrink-0 text-meta text-muted">Show results for</label>
      <select id="results-for" value={lead ?? ''} onChange={(e) => selectNode(e.target.value || null)}
        className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel px-1.5 text-control">
        {!selectedNode && <option value="">Choose a check…</option>}
        {/* Grouped by category (UI review round 2, 4 Nov: a flat list of 30 checks was hard to scan; run-through F4). */}
        {[...new Set(options.map((n) => n.category))].map((c) => (
          <optgroup key={c} label={CATEGORIES[c]?.label ?? c}>
            {options.filter((n) => n.category === c).map((n) => <option key={n.id} value={n.id}>{n.name}{enabled[n.id] ? '' : ' (off)'}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
    {merge && lead && (
      <div role="tablist" aria-label={`${merge.name}: parts`} data-testid="merge-parts" className="mt-2 flex flex-wrap gap-1">
        {[{ id: lead, tab: merge.tab }, ...merge.parts].map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={selectedNode === p.id} data-part={p.id} onClick={() => selectNode(p.id)}
            className={`rounded-full px-2.5 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${selectedNode === p.id ? 'bg-selected font-semibold text-accent-hover' : 'bg-subtle text-muted hover:text-ink'}`}>{p.tab}</button>
        ))}
      </div>
    )}
    </div>
  )
}

export default function RightPanel() {
  const phase = useStore((s) => s.phase)
  const step = useStep((s) => s.step)
  const present = phase === 'present'
  const siteStep = phase === 'basic' && step === 'site'
  // The open design tool's tools (Site, Massing, Program…) live here, in the Design tab (16 Nov, Sinnie: "move these to
  // the right"): the phase panel on the left keeps the steps and the tool's name; its tool row and controls are here.
  // 16 Nov (Sinnie, on the Design tab's tool row: "remove these tools"): no design tools in this panel; Massing's
  // options, Basement included, are in the left panel. `designOpen` stays false so the tab logic below is unchanged.
  const active = ''
  const designOpen = false as boolean
  const [tab, setTab] = useState<Tab>(present ? 'present' : designOpen ? 'design' : siteStep ? 'site' : 'results')
  useEffect(() => { setTab(phase === 'present' ? 'present' : designOpen ? 'design' : phase === 'basic' && useStep.getState().step === 'site' ? 'site' : 'results') }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  // Entering the Site step shows its tools (or the site); the other steps keep the tab the user chose.
  useEffect(() => { if (siteStep) setTab(designOpen ? 'design' : 'site') }, [siteStep]) // eslint-disable-line react-hooks/exhaustive-deps
  // Opening a design tool (or a step whose tool it is) shows its tools, opening the right panel if it was hidden.
  useEffect(() => {
    if (!designOpen) return
    setTab('design')
    if (!usePanels.getState().right) togglePanel('right')
  }, [designOpen, active])
  // Picking a node (selectNode: the bottom bar, the library, the canvas, a role) shows its results; switching stage alone
  // does not, nor does opening Real Vancouver or restoring a project, which set the node directly (Your site stays in view).
  // A tower added in Massing (Form step, an upload, a Rhino link): Your site opens and marks it New (lib/towerAdds.ts).
  useEffect(() => watchTowerAdds(), [])
  const addSeq = useTowerAdds((s) => s.seq)
  const unseen = useTowerAdds((s) => Object.keys(s.added).length > 0)
  const seenAdd = useRef(addSeq)
  useEffect(() => {
    if (addSeq === seenAdd.current) return
    seenAdd.current = addSeq
    if (useStore.getState().phase === 'basic' && !designOpen) setTab('site')
  }, [addSeq]) // eslint-disable-line react-hooks/exhaustive-deps
  // Compared with the last count seen, not a first-run flag: React runs mount effects twice in development.
  const resultsSeq = useStore((s) => s.resultsSeq)
  const seen = useRef(resultsSeq)
  useEffect(() => {
    if (resultsSeq === seen.current) return
    seen.current = resultsSeq
    if (useStore.getState().selectedNode) setTab('results')
  }, [resultsSeq])
  // Tower position open (Form step): its Properties tab comes first and opens; closing the tool goes back to the results.
  // 13 Nov: the original panel again (Sinnie: "also revert the right panel"), plus two things added since: a design tool
  // that is on (the rail beside this panel) shows its options in Properties, and a newly set site opens Your site.
  const drawing = useDraw((s) => s.tool !== 'select') && !present
  const positioning = (useTowerPosition((s) => s.on) || drawing) && !present
  // A drawing tool's options always come forward; Tower position's Properties only when no design tool's tab is open.
  useEffect(() => { setTab((cur) => ((drawing || (positioning && !designOpen)) ? 'properties' : cur === 'properties' ? (designOpen ? 'design' : 'results') : cur)) }, [positioning, drawing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => watchSiteFocus(), [])
  const siteSeq = useSiteFocus((s) => s.seq)
  useEffect(() => { if (siteSeq && !drawing) setTab('site') }, [siteSeq]) // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const tabsAll: { id: Tab; label: string }[] = present
    ? [{ id: 'present', label: 'Present' }, ...(RenderTab ? [{ id: 'render' as Tab, label: 'Render' }] : []), { id: 'results', label: 'Results' }, { id: 'trace', label: 'Trace' }]
    : [...(designOpen ? [{ id: 'design' as Tab, label: 'Design' }] : []), ...(positioning ? [{ id: 'properties' as Tab, label: 'Properties' }] : []), { id: 'site', label: 'Your site' }, { id: 'results', label: 'Results' }, { id: 'trace', label: 'Trace' }]
  // A tab hidden in the Interface drawer (Ruijie, 17 Nov), or one whose every section is hidden, leaves the bar (lib/ui/registry.ts).
  const tabs = tabsAll.filter((t) => groupVisible(`right.tab.${t.id}`, hiddenUi, uiItems))
  const analysis = useStore((s) => s.analysis)
  // No tower: the banner, unless the picked check already says it needs a model (no message twice).
  // Not over Site limits either: it reads the site, and its tabs say themselves what waits for a tower (17 Nov).
  const noTower = useStore((s) => s.towers[s.project].length === 0 && !(s.selectedNode && (canonicalNode(s.selectedNode) === 'built.viewcones' || (s.enabled[s.selectedNode] && NEEDS_MODEL.has(s.selectedNode)))))
  const shown = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? tab
  return (
    <aside data-panel="right" className="glass-edge flex h-full w-[var(--right-w)] shrink-0 flex-col overflow-hidden rounded-2xl bg-panel" aria-label={present ? 'Present and results' : 'Results and evidence'}>
      <div className="flex border-b border-line">
      <div role="tablist" aria-label={present ? 'Present and results' : 'Results'} className="flex min-w-0 flex-1">
        {tabs.map((t) => (
          <button key={t.id} id={`rp-tab-${t.id}`} role="tab" aria-selected={shown === t.id} aria-controls="rp-panel" tabIndex={shown === t.id ? 0 : -1} onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              const i = tabs.findIndex((x) => x.id === shown), next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
              setTab(next.id); document.getElementById(`rp-tab-${next.id}`)?.focus()
            }}
            title={t.label} className={`min-w-0 flex-1 truncate px-1.5 py-2.5 text-control font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${shown === t.id ? 'border-b-2 border-accent text-ink' : 'text-muted hover:text-ink'}`}>{t.label}{t.id === 'site' && unseen && shown !== 'site' && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" aria-label="new tower" />}</button>
        ))}
      </div>
        <div className="flex items-center px-1"><HidePanelButton side="right" /></div>
      </div>
      <div id="rp-panel" role="tabpanel" aria-labelledby={`rp-tab-${shown}`} className="flex-1 overflow-y-auto">
        <UiScopeContext.Provider value={`right.tab.${shown}`}>
        {shown === 'properties' && (drawing ? <DrawToolPanel /> : <Suspense fallback={<p className="p-4 text-xs text-muted">Loading Properties…</p>}><TowerProperties /></Suspense>)}
        {shown === 'site' && <Suspense fallback={<p className="p-4 text-xs text-muted">Loading your site…</p>}><SiteInfo /></Suspense>}
        {shown === 'results' && (analysis ? <>{noTower && <NothingToAnalyse />}<ResultsPicker /><ResultFreshness /><SwResults /><ClimateDrawings /><Inspector /></> : <><AnalysisOff /><ResultFreshness /></>)}
        {shown === 'present' && <PresentPanel />}
        {shown === 'render' && RenderTab && <Suspense fallback={<p className="p-4 text-xs text-muted">Loading Render…</p>}><RenderTab /></Suspense>}
        {shown === 'trace' && <TracePanel />}
        </UiScopeContext.Provider>
      </div>
    </aside>
  )
}
