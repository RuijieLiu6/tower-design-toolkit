import { lazy, Suspense, useEffect } from 'react'
import Anatomy from './components/Anatomy'
import Filmstrip from './components/Filmstrip'
import ImportHost from './components/ImportHost'
import { NodeBuilderHost } from './components/NodeBuilder'
import NodeLibrary from './components/NodeLibrary'
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

  useEffect(() => { document.title = `${stageDef(phase).label} · Tower Design Toolkit` }, [phase])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const s = useStore.getState()
      if (e.key === 'Escape') set({ placing: false, showOnboarding: false })
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
        {/* Left: the library in Massing, anatomy + library in Schematic, the shot strip in Present. */}
        <aside aria-label={present ? 'Captured shots' : 'Node library'}
          className={`panel-slide stage-fade flex shrink-0 flex-col overflow-hidden border-r border-line ${present ? 'w-32 bg-chrome' : 'w-72 bg-panel'}`}>
          {phase === 'advanced' && <Anatomy />}
          {present ? <Filmstrip /> : <NodeLibrary />}
        </aside>
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
        <RightPanel />
      </div>
      <StatusBar />
      <div aria-live="polite" className="sr-only">{announce}</div>
      <Onboarding />
      <NodeBuilderHost />
      <ImportHost />
    </div>
  )
}
