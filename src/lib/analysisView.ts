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
  | { kind: 'section' } // the program checks: a live building section, rooms coloured by use (components/ProgramSection.tsx)
  | { kind: 'facade' } // the towers with their façade as built (components/FacadeSkin.tsx): the Façade tool's expanded window
  | { kind: 'sw' } // a Sun & Wind Studio tool (components/sw/SwAnalysis.tsx: ground map, faces, façade zones or floor plan)

const VIEWS: Record<string, AnalysisKind & { plan: boolean; about: string }> = {
  'built.sun': { kind: 'shadows', plan: true, about: 'Shadows of the design hour by hour for the chosen day; the hour shown is drawn dark.' },
  'built.solar-access': { kind: 'layer', layer: 'solar', plan: true, about: 'Hours of direct sun on the ground and the tested public spaces.' },
  'built.wind-screen': { kind: 'layer', layer: 'wind', plan: true, about: 'Indicative pedestrian wind risk zones (screening, not CFD).' },
  'built.wind-study': { kind: 'layer', layer: 'wind', plan: true, about: 'Indicative pedestrian wind risk zones (screening, not CFD).' },
  'built.energy-carbon': { kind: 'layer', layer: 'surface-sun', plan: false, about: 'Modelled annual sun on roofs and facades, kWh/m²·yr.' },
  'built.viewcones': { kind: 'cones', plan: false, about: 'Parts of the towers above the protected view-cone limits.' },
  // the Façade tool (20 Nov, Sinnie: the expanded window shows "this version with the facade modelled in")
  'built.facade': { kind: 'facade', plan: false, about: 'The towers as built outside: each zone\u2019s glass, spandrels, mullions and shading devices (illustrative materials).' },
  // the program checks (17 Nov, Sinnie: "the expandable window should be a perfect section view … like the one in the sun wind studio")
  'built.fsr': { kind: 'section', plan: false, about: 'A section through the tower, every storey coloured by use; pick floors to change their use.' },
  'built.economics': { kind: 'section', plan: false, about: 'A section through the tower, every storey coloured by use; pick floors to change their use.' },
  // Sun & Wind Studio tools (13 Nov)
  'built.sw-shadow': { kind: 'sw', plan: true, about: 'Hours of new shadow on the ground for the study day or season.' },
  'built.sw-wind-comfort': { kind: 'sw', plan: true, about: 'Mean pedestrian wind in Lawson comfort bands, with the towers.' },
  'built.sw-rain-water': { kind: 'sw', plan: true, about: 'Ground the towers keep dry: share of the year\'s rain each spot is sheltered from.' },
  'built.sw-sun-faces': { kind: 'sw', plan: false, about: 'Annual sun on every face of the towers.' },
  'built.sw-rain-faces': { kind: 'sw', plan: false, about: 'Wind-driven rain on every face of the towers.' },
  'built.sw-glazing': { kind: 'facade', plan: false, about: 'The towers as built outside: each zone\u2019s glass, spandrels, mullions and shading devices (illustrative materials).' },
  'built.sw-pv': { kind: 'sw', plan: false, about: 'The façade zones on the tower, PV spandrels among them.' },
  'built.sw-energy': { kind: 'sw', plan: false, about: 'The façade zones that set the envelope of the energy model.' },
  'built.sw-form': { kind: 'sw', plan: false, about: 'The tower\'s form and its façade zones.' },
  'built.sw-daylight': { kind: 'sw', plan: true, about: 'Daylight autonomy on the floor plan of the level studied.' },
  'built.sw-light-hour': { kind: 'sw', plan: true, about: 'Light on the floor at the hour chosen.' },
  'built.sw-natvent': { kind: 'sw', plan: true, about: 'Reach of the openable windows on the level studied.' },
  'built.sw-airflow': { kind: 'sw', plan: true, about: 'Air moving across the level studied with the windows open.' },
  'built.sw-indoor-temp': { kind: 'sw', plan: true, about: 'Temperature of each zone of the level studied at the hour chosen.' },
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

/** Opens a check's analysis full screen (17 Nov, Sinnie: "full screen instead of split screen"); the top bar's split
 *  button puts it beside the model, Back to model (or the 3D button) closes it. */
export function openAnalysis(node: string) {
  if (!canExpand(node)) return
  const s = useStore.getState()
  if (s.view !== '3d') s.set({ view: '3d' })
  useAnalysisView.setState({ node, plan: analysisFor(node).plan })
  // The results follow the analysis open (Sinnie, 13 Nov): the right panel shows this check's results and drawings.
  s.selectNode(node)
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

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __tdtAv: unknown }).__tdtAv = { openAnalysis, useAnalysisView }
