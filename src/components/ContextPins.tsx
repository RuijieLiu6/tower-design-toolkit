// The open tool's working view, and anything else still on the model, named (overnight brief, 8 Nov: "Deliberately
// retained unrelated overlays must be visibly identified as pinned context"). Over the top left of the model: the tool
// the view works for, then one chip per layer it doesn't own: an analysis quantity kept by a pinned View, Real
// Vancouver's protected view cones (always drawn as context), the height-limit surface. Each chip can be hidden in one
// click; hiding never switches a check off or changes a result. Inside the 3D view's chunk (it reads the 3D stores).
import { Pin, X } from './icons'
import { useStep } from '../lib/step'
import { useStore, type ProjectKind } from '../store'
import { useAnalysisLayer } from '../lib/displayModeHooks'
import { ANALYSIS_LAYERS, useDisplayMode } from '../lib/displayMode'
import { CONES } from '../engine/viewCones'
import { showAllCones, useConeVisibility } from '../lib/coneVisibility'
import { useHeightSurface } from './HeightSurface'
import { BUILT_NODES } from '../data/registry'
import { designNode } from '../lib/workflow/designNodes'
import { designOf, STEP_PHASE, usePhaseTools } from '../lib/workflow/phaseTools'
import { applyToolView, CONE_TOOLS, LAYER_TOOLS, TOOL_VIEW } from '../lib/workflow/toolView'

const nameOf = (id: string) => designNode(id)?.name ?? BUILT_NODES.find((n) => n.id === id)?.name ?? id

export default function ContextPins({ project, top }: { project: ProjectKind; top: string }) {
  const phase = STEP_PHASE[useStep((s) => s.step)]
  const active = usePhaseTools((s) => s.active[phase]) ?? designOf(phase).id
  const layer = useAnalysisLayer()
  const pinned = useDisplayMode((s) => s.pinned)
  const conesShown = useConeVisibility((s) => CONES.some((c) => !s.hidden[c.id]))
  const surfaceOn = useHeightSurface((s) => s.on)
  const analysis = useStore((s) => s.analysis)
  const items: { key: string; label: string; why: string; hide: () => void }[] = []
  if (layer && !LAYER_TOOLS[layer].includes(active)) {
    const l = ANALYSIS_LAYERS.find((x) => x.id === layer)!
    items.push({ key: 'layer', label: l.word, why: `from ${nameOf(l.node)}, kept by the pinned View`, hide: () => { useDisplayMode.getState().setPinned(false); if (!applyToolView(active)) useDisplayMode.getState().setMode('massing') } })
  }
  if (project === 'city' && conesShown && !CONE_TOOLS.includes(active)) items.push({ key: 'cones', label: 'View cones', why: 'the City’s protected views, drawn as context', hide: () => showAllCones(false) })
  if (project === 'city' && surfaceOn && !CONE_TOOLS.includes(active)) items.push({ key: 'surface', label: 'Height-limit surface', why: 'a context layer you switched on', hide: () => useHeightSurface.setState({ on: false }) })
  const view = TOOL_VIEW[active]
  return (
    <div className={`pointer-events-none absolute left-3 ${top} z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1`} data-testid="context-pins" data-active={active}>
      <span className="pointer-events-auto rounded-lg border border-line bg-panel/95 px-2 py-0.5 text-meta text-ink" title={view ? 'The view this tool works in; Pin view keeps a View while you switch tools' : 'This tool has no view of its own'}>
        Working view: <b className="font-semibold">{nameOf(active)}</b>{!analysis && <span className="text-warning"> · checks paused</span>}
      </span>
      {items.map((i) => (
        <span key={i.key} data-pin={i.key} className="pointer-events-auto flex items-center gap-1 rounded-full border border-boundary bg-panel/95 py-0.5 pl-2 pr-0.5 text-meta text-ink" title={`Pinned context: ${i.label}, ${i.why}. Not part of ${nameOf(active)}.`}>
          <Pin size={12} aria-hidden className="text-muted" />Pinned context: {i.label}
          <button type="button" onClick={i.hide} aria-label={`Hide ${i.label} (pinned context)`} className="flex h-6 w-6 items-center justify-center rounded-full text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={12} aria-hidden /></button>
        </span>
      ))}
      {pinned && !items.some((i) => i.key === 'layer') && <span className="pointer-events-auto rounded-full border border-accent/40 bg-selected px-2 py-0.5 text-meta text-accent-hover">View pinned</span>}
    </div>
  )
}
