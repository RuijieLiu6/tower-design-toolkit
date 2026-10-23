import { lazy, Suspense, type ReactNode } from 'react'
import { useRoute } from './lib/route'
import { useTour } from './lib/tour'
import { startOffline } from './lib/pwa/install'
import Landing from './pages/Landing'

// Each page loads only when someone opens it (the guided app, the builder with its canvas code, the status page)
// and so does the tour card: the landing page stays small.
const App = lazy(() => import('./App'))
const Customize = lazy(() => import('./pages/Customize'))
const Status = lazy(() => import('./pages/Status'))
const Options = lazy(() => import('./pages/Options'))
const Sources = lazy(() => import('./pages/Sources'))
const Guide = lazy(() => import('./pages/Guide'))
const TourOverlay = lazy(() => import('./components/TourOverlay'))

// Offline app: the service worker of a production build, and the browser's install offer (lib/pwa/install.ts).
startOffline()

const loading = (what: string) => <div className="flex h-full items-center justify-center bg-paper text-xs text-muted">Loading {what}…</div>

function Page(): ReactNode {
  const route = useRoute()
  if (route === 'guided') return <Suspense fallback={loading('the design stages')}><App /></Suspense>
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
