// The analysis view: a second viewport beside the model that draws one check's result in more detail (Sinnie, 13 Nov:
// "under each tool, there should be an expandable window … it will open up a viewport and make it a split viewport …
// they can compare the main viewport with the tool viewport … make changes in the main to see changes reflected on the
// second"). Both views read the same store, so an edit in the model redraws the analysis at once.
import { createContext } from 'react'
import { create } from 'zustand'
import type { AnalysisLayerId } from './displayMode'
import { useStore } from '../store'

/** How the analysis view draws a check. */
export type AnalysisKind =
  | { kind: 'shadows' } // hour-by-hour shadows of the design for the day, with the date and hour beside it
  | { kind: 'layer'; layer: AnalysisLayerId } // one of the analytical colour layers, forced on in this view only
  | { kind: 'cones' } // the parts of the towers above the view-cone limits
  | { kind: 'uses' } // the towers' floors coloured by use (program, floor area, value)

const VIEWS: Record<string, AnalysisKind & { plan: boolean; about: string }> = {
  'built.sun': { kind: 'shadows', plan: true, about: 'Shadows of the design hour by hour for the chosen day; the hour shown is drawn dark.' },
  'built.solar-access': { kind: 'layer', layer: 'solar', plan: true, about: 'Hours of direct sun on the ground and the tested public spaces.' },
  'built.wind-screen': { kind: 'layer', layer: 'wind', plan: true, about: 'Indicative pedestrian wind risk zones (screening, not CFD).' },
  'built.wind-study': { kind: 'layer', layer: 'wind', plan: true, about: 'Indicative pedestrian wind risk zones (screening, not CFD).' },
  'built.energy-carbon': { kind: 'layer', layer: 'surface-sun', plan: false, about: 'Modelled annual sun on roofs and facades, kWh/m²·yr.' },
  'built.viewcones': { kind: 'cones', plan: false, about: 'Parts of the towers above the protected view-cone limits.' },
}
const USES = { kind: 'uses' as const, plan: false, about: 'The towers floor by floor, coloured by use.' }
/** The drawing for a check: its own where it has one, otherwise the towers by use. */
export const analysisFor = (node: string) => VIEWS[node] ?? USES
/** Checks that take no analysis view (Sinnie, 13 Nov: "view cone doesnt need an expandable screen"): the main view
 * already draws the cones and the parts above them. */
const NO_VIEW = new Set(['built.viewcones'])
export const canExpand = (node: string) => !NO_VIEW.has(node)
/** Checks with a drawing of their own (the rest show the towers by use). */
export const hasOwnAnalysis = (node: string) => node in VIEWS

interface AnalysisViewState { node: string | null; plan: boolean }
export const useAnalysisView = create<AnalysisViewState>(() => ({ node: null, plan: true }))

/** Opens a check's analysis beside the model (the node view gives way to the model, which is what it compares with). */
export function openAnalysis(node: string) {
  if (!canExpand(node)) return
  const s = useStore.getState()
  if (s.view === 'canvas') s.set({ view: '3d' })
  useAnalysisView.setState({ node, plan: analysisFor(node).plan })
}
export const closeAnalysis = () => useAnalysisView.setState({ node: null })
export function toggleAnalysis(node: string) {
  if (useAnalysisView.getState().node === node) closeAnalysis()
  else openAnalysis(node)
}

/**
 * Inside the analysis view, the analytical layer it shows, whatever the main view's display mode
 * (lib/displayModeHooks.ts useAnalysisLayer reads it); undefined everywhere else.
 */
export const ForcedLayer = createContext<AnalysisLayerId | null | undefined>(undefined)
