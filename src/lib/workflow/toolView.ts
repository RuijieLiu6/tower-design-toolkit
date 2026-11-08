// The working view of each tool (overnight brief, 8 Nov: "Selecting a tool must coordinate its controls and relevant
// results. The viewport should show the appropriate working view. Deliberately retained unrelated overlays must be
// visibly identified as pinned context"). Opening a tool in the phase panel (or from Overview) sets the View it works in:
// Geometry for massing and the sun preview, Building use for program, area and value, and the tool's own quantity in
// Analysis for the solar, wind and surface-sun studies. A View the user pinned stays as it is. Opening a tool never
// switches a check on or runs one (lib/displayMode.ts: showing a layer is separate from computing it).
import { useDisplayMode, type AnalysisLayerId, type DisplayMode } from '../displayMode'

export interface ToolView { mode: DisplayMode; layer?: AnalysisLayerId }
export const TOOL_VIEW: Record<string, ToolView> = {
  'design.site': { mode: 'massing' }, 'built.vtc-rules': { mode: 'massing' },
  'built.viewcones': { mode: 'massing' }, 'built.heights': { mode: 'massing' }, 'built.vista': { mode: 'massing' }, 'built.relax-aviation': { mode: 'massing' },
  'design.massing': { mode: 'massing' }, 'built.sun': { mode: 'massing' },
  'built.solar-access': { mode: 'analysis', layer: 'solar' },
  'built.wind-screen': { mode: 'analysis', layer: 'wind' }, 'built.wind-study': { mode: 'analysis', layer: 'wind' },
  'built.energy-carbon': { mode: 'analysis', layer: 'surface-sun' },
  'design.program': { mode: 'program' }, 'built.fsr': { mode: 'program' }, 'built.economics': { mode: 'program' }, 'built.interior': { mode: 'program' },
  'built.pr-streetwall': { mode: 'massing' }, 'built.pr-frontage': { mode: 'massing' }, 'built.pr-ground': { mode: 'massing' }, 'built.sky-room': { mode: 'program' },
}

/** The tool that owns each analysis layer, and the tools that work with the protected view cones on screen. */
export const LAYER_TOOLS: Record<AnalysisLayerId, string[]> = { solar: ['built.solar-access'], wind: ['built.wind-screen', 'built.wind-study'], 'surface-sun': ['built.energy-carbon'] }
export const CONE_TOOLS = ['design.site', 'built.viewcones', 'built.heights', 'built.vista', 'built.relax-aviation']

/** Set the open tool's working view, unless the user pinned the View. Returns whether anything changed. */
export function applyToolView(id: string): boolean {
  const v = TOOL_VIEW[id]
  const d = useDisplayMode.getState()
  if (!v || d.pinned) return false
  if (v.layer) { if (d.mode === 'analysis' && d.layer === v.layer) return false; d.showLayer(v.layer); return true }
  if (d.mode === v.mode) return false
  d.setMode(v.mode)
  return true
}
