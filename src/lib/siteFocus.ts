// Sinnie, 12 Nov: "after selecting the site, the properties should be the site information until something else is
// selected". Setting a study site (address, map pick, combine, default block, import) puts the site in focus: the right
// panel's Properties shows Your site (SiteInfo) instead of the open tool. Picking a tower or a tool takes it away.
import { create } from 'zustand'
import { useStore } from '../store'
import { usePhaseTools } from './workflow/phaseTools'
import { useTowerPosition } from './towerPosition'
import { useSiteStep } from './siteActions'
import { useSiteStore } from './siteStore'

export const useSiteFocus = create<{ on: boolean; seq: number }>(() => ({ on: false, seq: 0 }))

let wired = false
/** Starts following the site, tower and tool selections (once). */
export function watchSiteFocus() {
  if (wired) return
  wired = true
  useStore.subscribe((s, p) => {
    // A new site (another outline, 12 Nov): the lot that was clicked, the box, the picks and Select site are cleared.
    if (s.citySite && s.citySite.ring !== p.citySite?.ring) {
      useSiteStep.setState({ menu: null, box: false, boxDraft: null, multi: false, reselect: false })
      if (useSiteStore.getState().tool) useSiteStore.getState().set({ tool: null, picked: [], draft: [] })
    }
    if (s.citySite && s.citySite !== p.citySite) useSiteFocus.setState((f) => ({ on: true, seq: f.seq + 1 }))
    else if (s.selectedTower && s.selectedTower !== p.selectedTower) useSiteFocus.setState({ on: false })
    else if (!s.citySite && p.citySite) useSiteFocus.setState({ on: false })
  })
  useTowerPosition.subscribe((s, p) => { if (s.on && !p.on) useSiteFocus.setState({ on: false }) })
  usePhaseTools.subscribe((s, p) => { if (s.active !== p.active) useSiteFocus.setState({ on: false }) })
}
