import { lazy, Suspense, useEffect, type ComponentType, type CSSProperties } from 'react'
import SwRunner from './components/sw/SwRunner'
import { startPresentSync } from './lib/presentPage'
import { startSiteView } from './lib/siteView'
import { startMassingClear } from './lib/massingClear'
import { startSiteFit } from './lib/siteFit'
import { startAutoAlign } from './lib/autoAlign'
const BoardComposer = lazy(() => import('./components/boards/BoardComposer'))
import { togglePanel, usePanels, usePanelWidths } from './lib/panels'
import { PanelRail, PanelResizer } from './components/PanelToggle'
import ImportHost from './components/ImportHost'
import { NodeBuilderHost } from './components/NodeBuilder'
import PhasePanel from './components/workflow/PhasePanel'
import WorkflowOverview from './components/workflow/WorkflowOverview'
import WorkflowBuilder from './components/builder/WorkflowBuilder'
import { useRoute } from './lib/route'
import { openBuilder, useProjectWorkflow } from './lib/workflow/projectWorkflow'
import Onboarding from './components/Onboarding'
import RightPanel from './components/RightPanel'
import TowerRail from './components/TowerRail'
import StatusBar from './components/StatusBar'
import TopBar from './components/TopBar'
import { toggleToolRail, useToolRail } from './lib/toolRail'
import { useBoardStore } from './lib/boardStore'
import { stageDef } from './data/stages'
import { useStore } from './store'
import { goToStep, startOnSite, startStepFollow } from './lib/step'
import { whenRestored } from './lib/project/session'
import { useAnalysisView } from './lib/analysisView'

// The 3D view: fetched as soon as this module loads (the start page warms both), and rendered directly once it is here.
let LoadedViewport: ComponentType | null = null
const viewportReady = import('./components/Viewport').then((m) => { LoadedViewport = m.default; return m })
const Viewport = lazy(() => viewportReady)
const NodeCanvas = lazy(() => import('./components/NodeCanvas'))
const AnalysisViewport = lazy(() => import('./components/AnalysisViewport'))

function Loading({ what }: { what: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted">Loading {what}…</div>
}

export default function App() {
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const reduced = useStore((s) => s.reducedMotion)
  const announce = useStore((s) => s.announce)
  const set = useStore((s) => s.set)
  const setPhase = useStore((s) => s.setPhase)
  const present = phase === 'present'
  // A check's analysis view (lib/analysisView.ts) takes the second half of the centre, beside the model.
  const analysisNode = useAnalysisView((s) => s.node)
  const analysisOpen = !!analysisNode && !present && (view === '3d' || view === 'split')
  // Full screen when the 3D screen is chosen; side by side with the model when the top bar's split is.
  const analysisFull = analysisOpen && view === '3d'
  const half = view === 'split' || analysisOpen
  const railHidden = useToolRail((s) => s.hidden)
  const panels = usePanels()
  const widths = usePanelWidths()
  // #/workflow: the guided app with the workflow builder open (Result A, 9 Nov); it closes to the design as usual.
  const route = useRoute()
  useEffect(() => { if (route === 'workflow' && useProjectWorkflow.getState().mode !== 'builder') openBuilder() }, [route])

  // Step following and the first step, which the phase row used to start (the row is gone; the Workflow card has the phases).
  useEffect(() => { const stop = startStepFollow(); startOnSite(whenRestored()); const stop2 = startPresentSync(); const stop3 = startSiteView(); const stop4 = startMassingClear(); const stop5 = startSiteFit(); const stop6 = startAutoAlign(); return () => { stop(); stop2(); stop3(); stop4(); stop5(); stop6() } }, [])
  useEffect(() => { document.title = `${stageDef(phase).label} · Tower Design Toolkit` }, [phase])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const s = useStore.getState()
      // The builder covers the workspace: its own keys apply there, not the workspace's (the phase keys would move the step under it).
      if (useProjectWorkflow.getState().mode === 'builder') return
      if (e.key === 'Escape') set({ placing: false, showOnboarding: false })
      if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey) { togglePanel(e.key === '[' ? 'left' : 'right'); return }
      // P is Push / pull now (the design tools, components/draw/DrawTools.tsx); Place a tower is A.
      void s
      // H hides and shows the design tool rail beside the model (TowerRail.tsx; Ruijie's key, 17 Nov).
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && route === 'guided') { toggleToolRail(); return }
      // V: Model / Presentation, the top bar's page switch (PageToggle.tsx; Ruijie's key, 17 Nov).
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) { const b = useBoardStore.getState(); b.setOpen(!b.open); return }
      // 1-5 move along the phase row (Site, Form, Program, Schematic, Present), like clicking it.
      const k = ['1', '2', '3', '4', '5'].indexOf(e.key)
      if (k >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) goToStep((['site', 'volume', 'program', 'plates', 'frame'] as const)[k])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set, setPhase, route])

  return (
    // One hierarchy in every phase (overnight brief, 8 Nov; DESIGN_SYSTEM.md §5.1): the project bar, the one phase row,
    // then the phase panel (its local workflow and the open tool), the shared model, and the results and evidence.
    // The whole workflow is not a permanent strip: Edit workflow (project bar) or the Workflow list's Edit opens it on demand.
    <div data-stage={phase} data-reduced={reduced} className="workspace-shell stage-fade relative flex h-full flex-col gap-2 p-2 text-ink"
      style={{ ...(widths.left ? { '--left-w': `${widths.left}px` } : {}), ...(widths.right ? { '--right-w': `${widths.right}px` } : {}) } as CSSProperties}>
      <TopBar />
      <SwRunner />
      {/* The phase row and the three columns together: the workflow builder (Result A, 9 Nov) covers both, so only the
          project bar stays in reach while it is open (the phase row would move the step under it). */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
      {/* The phase row is gone: the phases are in the Workflow card (phase dots, Next). Keys 1-5 still move between them. */}
      <div className="relative flex min-h-0 flex-1 gap-2" data-workspace>
        {/* Present is one page: the sheets, with the 3D view and the old Present panel inside it (BoardComposer). */}
        {present ? (
          <Suspense fallback={<div aria-busy="true" aria-label="Loading the presentation" className="h-full w-full" />}>
            <BoardComposer viewport={LoadedViewport ? <LoadedViewport /> : <Suspense fallback={null}><Viewport /></Suspense>} tools={<RightPanel />} />
          </Suspense>
        ) : (<>
        {/* Left: the phase panel (8 Nov): the phase's own workflow, then the open tool's controls. */}
        {panels.left ? <><PhasePanel /><PanelResizer side="left" /></> : <PanelRail side="left" label="Phase tools" />}
        <main className="relative flex min-w-0 flex-1 gap-2">
          {(view === '3d' || view === 'split') && (
            <div className={`overflow-hidden rounded-2xl border border-line bg-panel ${analysisFull ? 'hidden' : half ? 'w-1/2' : 'w-full'}`} data-model-region>
              {LoadedViewport ? <LoadedViewport /> : <Suspense fallback={<div aria-busy="true" aria-label="Loading the 3D view" className="h-full w-full" />}><Viewport /></Suspense>}
            </div>
          )}
          {analysisOpen && (
            <div className={`${analysisFull ? 'w-full' : 'w-1/2'} overflow-hidden rounded-2xl border border-line bg-panel`} data-analysis-region data-analysis-layout={analysisFull ? 'full' : 'split'}>
              <Suspense fallback={<Loading what="analysis view" />}><AnalysisViewport /></Suspense>
            </div>
          )}
          {(view === 'canvas' || view === 'split') && !analysisOpen && (
            <div className={`overflow-hidden rounded-2xl border border-line bg-panel ${view === 'split' ? 'w-1/2' : 'w-full'}`}>
              <Suspense fallback={<Loading what="node canvas" />}><NodeCanvas /></Suspense>
            </div>
          )}
          {/* The workflow editor takes the centre view when asked for (Ruijie, 9 Nov: "the central viewport will turn into
              the workflow edit"); the phase panel and the results stay beside it and follow every change. Confirm returns. */}
          <WorkflowOverview />
        </main>
        {/* Right: the analysis results (and Present's own tabs). */}
        {/* The design tool rail stands on its own beside the right panel (13 Nov, Sinnie: "should be on the side"). */}
        {!present && (view === '3d' || view === 'split') && !railHidden && !analysisFull && <TowerRail />}
        {panels.right ? <><PanelResizer side="right" /><RightPanel /></> : <PanelRail side="right" label={present ? 'Present and results' : 'Results'} />}
        </>)}
      </div>
      <WorkflowBuilder />
      </div>
      <StatusBar />
      <div aria-live="polite" className="sr-only">{announce}</div>
      <Onboarding />
      <NodeBuilderHost />
      <ImportHost />
    </div>
  )
}
