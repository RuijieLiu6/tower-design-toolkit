// The view fits the site once it is chosen (16 Nov, Sinnie: "after selecting the site, it should automatically zoom
// into the site to fit the page"). Whatever chose it (an address, a lot on the map, combined lots, a boundary file, the
// default block), when Real Vancouver's site outline changes the view flies to frame the lot with a small margin, inside
// the part of the screen the panels leave free, the chosen north up (VistaLook flyToFit). Restoring a saved session does
// not fly: only a site chosen while working.
import { useStore } from '../store'

const sig = (ring: readonly (readonly [number, number])[] | undefined) => (ring?.length ? ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(';') : '')

/** Frames the current Real Vancouver site. */
export function fitSite() {
  const st = useStore.getState(), ring = st.citySite?.ring
  if (st.project !== 'city' || !ring?.length) return
  const g = st.groundElevation, xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1])
  const m = Math.max(8, 0.12 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
  const pts: [number, number, number][] = [[Math.min(...xs) - m, Math.min(...ys) - m, g], [Math.max(...xs) + m, Math.max(...ys) + m, g]]
  void import('../components/VistaLook').then((v) => v.flyToFit(pts, 60))
}

/** Watches the site outline once the saved session is back. Returns the unsubscribe. */
export function startSiteFit(): () => void {
  let stop = () => {}, live = true, timer: ReturnType<typeof setTimeout> | undefined
  void import('./project/session').then(({ whenRestored }) => whenRestored()).then(() => {
    if (!live) return
    let last = sig(useStore.getState().citySite?.ring)
    stop = useStore.subscribe((s) => {
      const now = sig(s.citySite?.ring)
      if (now === last) return
      last = now
      // After the chooser's own zoom (an address or a lot), so the fit is what the view ends on.
      if (now) { clearTimeout(timer); timer = setTimeout(fitSite, 250) }
    })
  })
  return () => { live = false; clearTimeout(timer); stop() }
}
