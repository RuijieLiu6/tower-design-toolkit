import { lazy, Suspense, useEffect, type CSSProperties } from 'react'
import { togglePanel, usePanels, usePanelWidths } from './lib/panels'
import { PanelRail, PanelResizer } from './components/PanelToggle'
import ImportHost from './components/ImportHost'
import { NodeBuilderHost } from './components/NodeBuilder'
import PhasePanel from './components/workflow/PhasePanel'
import WorkflowOverview from './components/workflow/WorkflowOverview'
import Onboarding from './components/Onboarding'
import ProcessRail from './components/ProcessRail'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import TopBar from './components/TopBar'
import { stageDef } from './data/stages'
import { useStore } from './store'

const Viewport = lazy(() => import('./components/Viewport'))
const NodeCanvas = lazy(() => import('./components/NodeCanvas'))

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
  const panels = usePanels()
  const widths = usePanelWidths()

  useEffect(() => { document.title = `${stageDef(phase).label} · Tower Design Toolkit` }, [phase])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const s = useStore.getState()
      if (e.key === 'Escape') set({ placing: false, showOnboarding: false })
      if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey) { togglePanel(e.key === '[' ? 'left' : 'right'); return }
      // Present locks the model, so placing is off there.
      if ((e.key === 'p' || e.key === 'P') && s.phase !== 'present') set({ placing: !s.placing })
      if (e.key === '1') setPhase('basic')
      if (e.key === '2') setPhase('advanced')
      if (e.key === '3') setPhase('present')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set, setPhase])

  return (
    // One hierarchy in every phase (overnight brief, 8 Nov; DESIGN_SYSTEM.md §5.1): the project bar, the one phase row,
    // then the phase panel (its local workflow and the open tool), the shared model, and the results and evidence.
    // The whole workflow is not a permanent strip: Overview (phase row) opens it on demand over the model.
    <div data-stage={phase} data-reduced={reduced} className="workspace-shell stage-fade relative flex h-full flex-col gap-2 p-2 text-ink"
      style={{ ...(widths.left ? { '--left-w': `${widths.left}px` } : {}), ...(widths.right ? { '--right-w': `${widths.right}px` } : {}) } as CSSProperties}>
      <TopBar />
      <ProcessRail />
      <div className="relative flex min-h-0 flex-1 gap-2" data-workspace>
        {/* Left: the phase panel (8 Nov): the phase's own workflow, then the open tool's controls. */}
        {panels.left ? <><PhasePanel /><PanelResizer side="left" /></> : <PanelRail side="left" label="Phase tools" />}
        <main className="relative flex min-w-0 flex-1 gap-2">
          {(view === '3d' || view === 'split') && (
            <div className={`overflow-hidden rounded-2xl border border-line bg-panel ${view === 'split' ? 'w-1/2' : 'w-full'}`} data-model-region>
              <Suspense fallback={<Loading what="3D view" />}><Viewport /></Suspense>
            </div>
          )}
          {(view === 'canvas' || view === 'split') && (
            <div className={`overflow-hidden rounded-2xl border border-line bg-panel ${view === 'split' ? 'w-1/2' : 'w-full'}`}>
              <Suspense fallback={<Loading what="node canvas" />}><NodeCanvas /></Suspense>
            </div>
          )}
          {/* The workflow editor takes the centre view when asked for (Ruijie, 9 Nov: "the central viewport will turn into
              the workflow edit"); the phase panel and the results stay beside it and follow every change. Confirm returns. */}
          <WorkflowOverview />
        </main>
        {/* Right: the analysis results (and Present's own tabs). */}
        {panels.right ? <><PanelResizer side="right" /><RightPanel /></> : <PanelRail side="right" label={present ? 'Present and results' : 'Results'} />}
      </div>
      <StatusBar />
      <div aria-live="polite" className="sr-only">{announce}</div>
      <Onboarding />
      <NodeBuilderHost />
      <ImportHost />
    </div>
  )
}
