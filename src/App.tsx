import { lazy, Suspense, useEffect } from 'react'
import { togglePanel, usePanels } from './lib/panels'
import { PanelRail } from './components/PanelToggle'
import ImportHost from './components/ImportHost'
import { NodeBuilderHost } from './components/NodeBuilder'
import PhasePanel from './components/workflow/PhasePanel'
import WorkflowDock from './components/workflow/WorkflowOverview'
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
    <div data-stage={phase} data-reduced={reduced} className="stage-fade flex h-full flex-col gap-1.5 bg-paper p-1.5 text-ink">
      <TopBar />
      <ProcessRail />
      <div className="flex min-h-0 flex-1 gap-1.5">
        {/* Left: the phase panel (Ruijie, 8 Nov): the phase's own workflow, then the open tool's controls. */}
        {panels.left ? <PhasePanel /> : <PanelRail side="left" label="Phase tools" />}
        <main className="flex min-w-0 flex-1 gap-1.5">
          {(view === '3d' || view === 'split') && (
            <div className={`overflow-hidden rounded-2xl border border-white/70 shadow-[0_12px_32px_-16px_rgb(28_58_48/0.3)] ${view === 'split' ? 'w-1/2' : 'w-full'}`}>
              <Suspense fallback={<Loading what="3D view" />}><Viewport /></Suspense>
            </div>
          )}
          {(view === 'canvas' || view === 'split') && (
            <div className={`overflow-hidden rounded-2xl border border-white/70 bg-panel ${view === 'split' ? 'w-1/2' : 'w-full'}`}>
              <Suspense fallback={<Loading what="node canvas" />}><NodeCanvas /></Suspense>
            </div>
          )}
        </main>
        {/* Right: the analysis results (and Present's own tabs). */}
        {panels.right ? <RightPanel /> : <PanelRail side="right" label={present ? 'Present and results' : 'Results'} />}
      </div>
      {/* The whole-project workflow along the bottom (8 Nov): compact, expandable, editable; the phase panels follow it. */}
      <WorkflowDock />
      <StatusBar />
      <div aria-live="polite" className="sr-only">{announce}</div>
      <Onboarding />
      <NodeBuilderHost />
      <ImportHost />
    </div>
  )
}
