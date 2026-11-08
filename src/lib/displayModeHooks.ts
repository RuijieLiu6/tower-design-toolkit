// React hooks over the display mode (lib/displayMode.ts) for the 3D scene and the chrome over it.
import { useStore } from '../store'
import { nodeOn } from './analysis'
import { activeLayer, modeColours, shownMode, useDisplayMode, type AnalysisLayerId, type DisplayMode, type ModeColours } from './displayMode'

/** The mode the open project shows (Materials falls back to Massing where the model has no materials). */
export function useShownMode(): DisplayMode {
  const mode = useDisplayMode((s) => s.mode)
  const project = useStore((s) => s.project)
  return shownMode(mode, project)
}

/** What the shown mode colours (tower, context, analytical layers). */
export const useModeColours = (): ModeColours => modeColours(useShownMode())

/** The analytical layer on the model: only in Analysis, only while its check runs. */
export function useAnalysisLayer(): AnalysisLayerId | null {
  const analysis = useModeColours().analysis
  const preferred = useDisplayMode((s) => s.layer)
  return useStore((s) => (analysis ? activeLayer(preferred, (node) => nodeOn(s, node)) : null))
}
