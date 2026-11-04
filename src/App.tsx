import { lazy, Suspense, useEffect } from 'react'
import Filmstrip from './components/Filmstrip'
import { togglePanel, usePanels } from './lib/panels'
import { PanelRail } from './components/PanelToggle'
import ImportHost from './components/ImportHost'
import { NodeBuilderHost } from './components/NodeBuilder'
import NodeBar from './components/NodeBar'
import Onboarding from './components/Onboarding'
import ProcessRail from './components/ProcessRail'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import TopBar from './components/TopBar'
import ToolPanel from './components/tools/ToolPanel'
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
    <div data-stage={phase} data-reduced={reduced} className="stage-fade flex h-full flex-col bg-paper text-ink">
      <TopBar />
      <ProcessRail />
      <div className="flex min-h-0 flex-1">
        {/* Left: the design tools in Massing and Schematic (tools/registry.ts), the shot strip in Present. */}
        {panels.left
          ? <aside aria-label={present ? 'Captured shots' : 'Design tools'}
              className={`panel-slide stage-fade flex shrink-0 flex-col overflow-hidden border-r border-line ${present ? 'w-32 bg-chrome' : 'w-[22rem] bg-panel'}`}>
              {present ? <Filmstrip /> : <ToolPanel />}
            </aside>
          : <PanelRail side="left" label={present ? 'Shots' : 'Design tools'} />}
        <main className="flex min-w-0 flex-1">
          {(view === '3d' || view === 'split') && (
            <div className={view === 'split' ? 'w-1/2 border-r border-line' : 'w-full'}>
              <Suspense fallback={<Loading what="3D view" />}><Viewport /></Suspense>
            </div>
          )}
          {(view === 'canvas' || view === 'split') && (
            <div className={view === 'split' ? 'w-1/2' : 'w-full'}>
              <Suspense fallback={<Loading what="node canvas" />}><NodeCanvas /></Suspense>
            </div>
          )}
        </main>
        {/* Right: the analysis results (and Present's own tabs). */}
        {panels.right ? <RightPanel /> : <PanelRail side="right" label={present ? 'Present and results' : 'Results'} />}
      </div>
      {/* Bottom: every evaluation node as an icon switch; the library popover holds search, presets and the roadmap. */}
      <NodeBar />
      <StatusBar />
      <div aria-live="polite" className="sr-only">{announce}</div>
      <Onboarding />
      <NodeBuilderHost />
      <ImportHost />
    </div>
  )
}
