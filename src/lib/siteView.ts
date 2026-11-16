// The quiet Site view (13 Nov, Sinnie: "on default of entering the site, turn off view cone and any other context layers,
// it should always be in geometry mode"). Each time the Site step opens (and when the app or Real Vancouver opens on it),
// the view cones, names, height-limit surface, sun and the extra City layers (trees, parcels, zoning, heritage, traffic)
// go off and the View is Geometry. Each can be switched back on while there (Layers dock, Viewcone, the tools); nothing
// here is remembered as the user's choice, and no check is switched or run.
import { withoutHistory } from './project/history'
import { useStore } from '../store'
import { showAllCones } from './coneVisibility'
import { useDisplayMode } from './displayMode'
import { useStep } from './step'
import { useVistaLook } from './vistaLook'

/** Context layers off, Geometry on. */
export async function quietSiteView() {
  showAllCones(false)
  useVistaLook.setState({ labels: false })
  const d = useDisplayMode.getState()
  d.setPinned(false)
  // Geometry, or its No render version, as chosen.
  if (d.mode !== 'massing' && d.mode !== 'plain') d.setMode('massing')
  // A view setting, not a design change: not an Undo step (Undo stays on what the user did).
  if (useStore.getState().enabled['built.sun']) withoutHistory(() => useStore.getState().toggleNode('built.sun'))
  // Loaded on demand (three.js scene modules): only when they are already in use.
  const [{ useContextLayers }, { useHeightSurface }] = await Promise.all([import('../components/ContextLayers'), import('../components/HeightSurface')])
  useContextLayers.setState({ on: {}, hover: null })
  useHeightSurface.setState({ on: false })
}

/**
 * Applies the quiet view on entering the Site step (after the step's own tool views, so it is what the step opens on),
 * on opening Real Vancouver at the Site step, and once at start when the app opens there. Returns the unsubscribe.
 */
export function startSiteView(): () => void {
  const later = () => setTimeout(() => { if (useStep.getState().step === 'site') void quietSiteView() }, 60)
  if (useStep.getState().step === 'site') later()
  const a = useStep.subscribe((s, p) => { if (s.step === 'site' && p.step !== 'site') later() })
  const b = useStore.subscribe((s, p) => { if (s.project !== p.project) later() })
  return () => { a(); b() }
}
