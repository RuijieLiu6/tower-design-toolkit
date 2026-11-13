import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { useRoute } from './lib/route'
import { useTour } from './lib/tour'
import { startOffline } from './lib/pwa/install'
import Landing from './pages/Landing'

// Each page loads only when someone opens it (the guided app, the builder with its canvas code, the status page)
// and so does the tour card: the landing page stays small.
// The guided app: once its code has arrived (fetched in the background from the start page), it renders at once instead
// of going through a loading screen for a moment (12 Nov: "a slight glitch of a second screen before it loads").
let LoadedApp: ComponentType | null = null
const loadApp = () => import('./App').then((m) => { LoadedApp = m.default; return m })
const App = lazy(loadApp)
const Customize = lazy(() => import('./pages/Customize'))
const Status = lazy(() => import('./pages/Status'))
const Options = lazy(() => import('./pages/Options'))
const Sources = lazy(() => import('./pages/Sources'))
const Guide = lazy(() => import('./pages/Guide'))
const TourOverlay = lazy(() => import('./components/TourOverlay'))

// Offline app: the service worker of a production build, and the browser's install offer (lib/pwa/install.ts).
startOffline()

// Fetch the workspace and its 3D view in the background while the start page is open, so Enter goes straight in
// instead of showing a loading message for the workspace and then a second one for the 3D view (12 Nov).
const warm = () => { void loadApp(); void import('./components/Viewport') }
if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback
  if (idle) idle(warm); else setTimeout(warm, 1200)
}

const loading = (what: string) => <div className="flex h-full items-center justify-center bg-paper text-xs text-muted">Loading {what}…</div>

function Page(): ReactNode {
  const route = useRoute()
  if (route === 'guided' || route === 'workflow') return LoadedApp ? <LoadedApp /> : <Suspense fallback={<div aria-busy="true" aria-label="Loading the design stages" className="h-full bg-paper" />}><App /></Suspense>
  if (route === 'status') return <Suspense fallback={loading('the build status')}><Status /></Suspense>
  if (route === 'options') return <Suspense fallback={loading('the design options')}><Options /></Suspense>
  if (route === 'sources') return <Suspense fallback={loading('sources and assumptions')}><Sources /></Suspense>
  if (route === 'guide') return <Suspense fallback={loading('the user guide')}><Guide /></Suspense>
  if (route === 'customize') return <Suspense fallback={loading('the workflow builder')}><Customize /></Suspense>
  return <Landing />
}

export default function Root() {
  const tour = useTour((s) => s.active)
  return (
    <>
      <Page />
      {tour && <Suspense fallback={null}><TourOverlay /></Suspense>}
    </>
  )
}
