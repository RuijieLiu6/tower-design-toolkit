// Real Vancouver in one click (moved here from TopBar.tsx so the Site step's "Default site" action can share it).
import { useStore } from '../store'

/**
 * Real Vancouver in one click (Ruijie, 6 Nov): with no site there yet, the default site (lib/defaultSite.ts) and the
 * competition design on it, then the view frames it. Loaded on demand, so the first screen stays light.
 */
export function openCity(frameDelays = [1500, 3500]) {
  void import('./defaultSite').then(({ openInRealVancouver }) => {
    const r = openInRealVancouver()
    if (!r.site && !r.towers) return
    // The city view opens on its overview first; frame the site once it has (and again, in case it was still loading).
    void Promise.all([import('../components/VistaLook'), import('./towerPosition')]).then(([{ flyToFit }, { useTowerPosition }]) => {
      const frame = () => {
        const st = useStore.getState(), ring = st.citySite?.ring ?? [], g = st.groundElevation
        if (st.project !== 'city' || !ring.length) return
        if (useTowerPosition.getState().on) { useTowerPosition.setState((p) => ({ frame: p.frame + 1, locked: true })); return }
        const top = Math.max(0, ...st.towers.city.map((t) => t.height))
        flyToFit([...ring.map(([x, y]) => [x, y, g] as [number, number, number]), [ring[0][0], ring[0][1], g + top]], 300)
      }
      for (const ms of frameDelays) setTimeout(frame, ms)
    })
  })
}

