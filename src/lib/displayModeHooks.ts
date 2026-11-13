// React hooks over the display mode (lib/displayMode.ts) for the 3D scene and the chrome over it.
import { useContext } from 'react'
import { useStore } from '../store'
import { ForcedLayer } from './analysisView'
import { nodeOn } from './analysis'
import { activeLayer, modeColours, shownMode, useDisplayMode, type AnalysisLayerId, type DisplayMode, type ModeColours } from './displayMode'

/** The mode the open project shows (Materials falls back to Massing where the model has no materials). */
export function useShownMode(): DisplayMode {
  const mode = useDisplayMode((s) => s.mode)
  const project = useStore((s) => s.project)
  // Analysis colours live in the analysis view only (Sinnie, 13 Nov): the main view shows Analysis as Geometry.
  const m = shownMode(mode, project)
  return m === 'analysis' ? 'massing' : m
}

/** What the shown mode colours (tower, context, analytical layers). */
export const useModeColours = (): ModeColours => modeColours(useShownMode())

/** The analytical layer on the model: only in Analysis, only while its check runs. */
export function useAnalysisLayer(): AnalysisLayerId | null {
  const analysis = useModeColours().analysis
  const preferred = useDisplayMode((s) => s.layer)
  const main = useStore((s) => (analysis ? activeLayer(preferred, (node) => nodeOn(s, node)) : null))
  // The analysis view (components/AnalysisViewport.tsx) draws its own check's layer, in any display mode.
  const forced = useContext(ForcedLayer)
  const forcedRuns = useStore((s) => (forced ? activeLayer(forced, (node) => nodeOn(s, node)) : null))
  // The main view never draws an analytical layer (Sinnie, 13 Nov: "analysis stuff only shows up in the analysis view").
  void main
  return forced === undefined ? null : forcedRuns
}

/** Inside the analysis view (components/AnalysisViewport.tsx). */
export const useInAnalysisView = () => useContext(ForcedLayer) !== undefined
