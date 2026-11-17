// Left panel of the guided app (Massing and Schematic): the design tools of the step as a row of icons, each with one
// or two key words under it (Ruijie, 6 Nov: "only leave the icon shown and one or two key words … once the user hover
// their mouse over the icon, then reveal the functions in whole"). Hovering or focusing an icon shows the tool's full
// name and what it does; clicking it opens its controls below the row (one tool at a time, remembered per step).
// Tools come from the registry (registry.ts); the open one is kept in toolPick.ts, shared with the tool rail beside the
// model (ToolRail.tsx). Massing shows only the current step's tools (Site = site and Rhino
// import; past Site they leave the panel). A project with no tower leads Volume with "Place your tower"
// (tools/NoTower.tsx), keeping only the tools that make towers (Generate) beside it, and points Program and Schematic
// there.
import { TriangleAlert } from '../icons'
import { Component, Suspense, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '../../store'
import { HidePanelButton } from '../PanelToggle'
import IconTile from '../IconTile'
import type { DesignTool } from './registry'
import { PROCESS } from '../../data/stages'
import { useToolChoice } from './toolPick'
import { NoTowerYet, PlaceFirstTower } from './NoTower'

/** The key words under a tool's icon. */
export const shortName = (t: Pick<DesignTool, 'short' | 'label'>) => t.short ?? t.label

/** One tool failing (e.g. an add-on tool) must not take the rest of the panel with it. */
class ToolBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex items-start gap-2 px-4 py-3 text-meta text-red-800">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>{this.props.label} could not open: {this.state.error.message}</span>
      </div>
    )
  }
}

/** One tool: its icon and key words; the full name and what it does on hover or focus (components/IconTile.tsx). */
function ToolTile({ tool, active, tabStop, panelOpen, onPick, onKey }: { tool: DesignTool; active: boolean; tabStop: boolean; panelOpen: boolean; onPick: () => void; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void }) {
  const hint = useStore((s) => (typeof tool.hint === 'function' ? tool.hint(s) : tool.hint))
  return (
    <IconTile icon={tool.icon} word={shortName(tool)} label={tool.label} hint={hint} active={active}
      role="tab" id={`tool-${tool.id}-head`} data-tool={tool.id} aria-selected={active} aria-controls={panelOpen ? 'tool-panel' : undefined} tabIndex={tabStop ? 0 : -1}
      onClick={onPick} onKeyDown={onKey} />
  )
}

/**
 * `embedded`: inside the phase panel (components/workflow/PhasePanel.tsx), which has its own header. `only`: the design
 * controls an analysis tool opens with (lib/workflow/phaseTools.ts NODE_CONTROLS), whatever their step.
 */
export default function ToolPanel({ embedded = false, only }: { embedded?: boolean; only?: string[] } = {}) {
  // The step's tools and the open one, shared with the tool rail beside the model (toolPick.ts, ToolRail.tsx).
  const { phase, step, shown, empty, activeId, pick } = useToolChoice(only)
  const active = shown.find((t) => t.id === activeId)
  const stepLabel = phase === 'basic' ? PROCESS.find((p) => p.id === step)?.label : null
  // Arrow keys, Home and End move along the icons (tabs pattern); the icon reached opens.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = shown.findIndex((t) => t.id === activeId)
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : null
    if (j === null || !shown.length) return
    e.preventDefault()
    const next = shown[(j + shown.length) % shown.length]
    pick(next.id)
    document.getElementById(`tool-${next.id}-head`)?.focus()
  }
  const Body = active?.component

  return (
    <div className={embedded ? 'flex flex-col' : 'flex min-h-0 flex-1 flex-col'}>
      {!embedded && (
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <h2 className="text-meta font-semibold text-muted">Design tools</h2>
            {stepLabel && <span className="truncate text-meta text-muted" data-testid="tools-step">· {stepLabel} step</span>}
          </span>
          <HidePanelButton side="left" />
        </div>
      )}
      {/* a check that opens with one control set shows it directly (its name is in the phase panel's header) */}
      {shown.length > 0 && !(only && shown.length === 1) && (
        <div role="tablist" aria-label="Design tools" className="flex flex-wrap gap-0.5 border-b border-line px-2 py-1.5">
          {shown.map((t, i) => <ToolTile key={t.id} tool={t} active={t.id === activeId} tabStop={activeId ? t.id === activeId : i === 0} panelOpen={!!activeId} onPick={() => pick(t.id)} onKey={onKey} />)}
        </div>
      )}
      <div className={embedded ? '' : 'flex-1 overflow-y-auto'}>
        {empty === 'place' && <PlaceFirstTower onGenerate={shown.some((t) => t.id === 'generate') && activeId !== 'generate' ? () => pick('generate') : undefined} />}
        {empty === 'none' && <NoTowerYet />}
        {active && Body && (
          <div id="tool-panel" role="tabpanel" aria-labelledby={`tool-${active.id}-head`} data-tool-body={active.id} className="pb-1">
            <ToolBoundary key={active.id} label={active.label}>
              <Suspense fallback={<p className="px-4 py-3 text-meta text-muted">Loading {active.label}…</p>}><Body /></Suspense>
            </ToolBoundary>
          </div>
        )}
        {!empty && !shown.length && <p className="p-4 text-xs text-muted">No design tools in this step.</p>}
      </div>
    </div>
  )
}
