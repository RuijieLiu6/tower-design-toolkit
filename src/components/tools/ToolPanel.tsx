// Left panel of the guided app (Massing and Schematic): the design tools for the stage, as an accordion.
// Tools come from the registry (registry.ts); which ones are open is remembered per browser.
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { Component, Suspense, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../../store'
import { HidePanelButton } from '../PanelToggle'
import { DESIGN_TOOLS, toolsFor, type DesignTool } from './registry'
import { PROCESS } from '../../data/stages'
import { splitForStep, useStep } from '../../lib/step'

const KEY = 'ts.tools.open'
/** "More tools" (the stage's tools that don't lead the current step) open or folded; open unless folded here before. */
const MORE_KEY = 'ts.tools.more'
function readMore(): boolean { try { return localStorage.getItem(MORE_KEY) !== '0' } catch { return true } }
function writeMore(v: boolean) { try { localStorage.setItem(MORE_KEY, v ? '1' : '0') } catch { /* storage blocked */ } }
function readOpen(): Record<string, boolean> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function writeOpen(v: Record<string, boolean>) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage blocked: the panel still works */ } }

/** One tool failing (e.g. an add-on tool) must not take the rest of the panel with it. */
class ToolBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex items-start gap-2 px-4 py-3 text-[11px] text-red-800">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>{this.props.label} could not open: {this.state.error.message}</span>
      </div>
    )
  }
}

function ToolSection({ tool, open, onToggle }: { tool: DesignTool; open: boolean; onToggle: () => void }) {
  const { icon: Icon, component: Body } = tool
  const head = `tool-${tool.id}-head`, body = `tool-${tool.id}-body`
  return (
    <div className="border-b border-line" data-tool={tool.id}>
      <h3>
        <button id={head} type="button" onClick={onToggle} aria-expanded={open} aria-controls={body}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left outline-none hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${open ? 'bg-black/[0.02]' : ''}`}>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${open ? 'bg-accent text-white' : 'bg-accent/10 text-accent'}`}><Icon size={15} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink">{tool.label}</span>
            {tool.hint && <span className="block truncate text-[11px] text-muted">{tool.hint}</span>}
          </span>
          {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
        </button>
      </h3>
      {open && (
        <div id={body} role="region" aria-labelledby={head} className="pb-1">
          <ToolBoundary label={tool.label}>
            <Suspense fallback={<p className="px-4 py-3 text-[11px] text-muted">Loading {tool.label}…</p>}><Body /></Suspense>
          </ToolBoundary>
        </div>
      )}
    </div>
  )
}

export default function ToolPanel() {
  const phase = useStore((s) => s.phase)
  const project = useStore((s) => s.project)
  const step = useStep((s) => s.step)
  // `when` conditions read the store; the list follows the stage and the project.
  const tools = useMemo(() => toolsFor(DESIGN_TOOLS, phase, useStore.getState()), [phase, project])
  // Massing has three steps (Site, Volume, Program): the step's own tools lead, the others follow under "More tools".
  const { main, more } = useMemo(() => (phase === 'basic' ? splitForStep(tools, step) : { main: tools, more: [] as DesignTool[] }), [tools, phase, step])
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)
  const [moreOpen, setMoreOpenState] = useState(readMore)
  const setMoreOpen = (v: boolean) => { setMoreOpenState(v); writeMore(v) }
  const moreIds = new Set(more.map((t) => t.id))
  // A tool under "More tools" starts folded (its default is for the step it leads); a tool the user opened stays open.
  const isOpen = (t: DesignTool) => open[t.id] ?? (!moreIds.has(t.id) && !!t.defaultOpen)
  const toggle = (t: DesignTool) => setOpen((o) => { const next = { ...o, [t.id]: !isOpen(t) }; writeOpen(next); return next })
  const shown = moreOpen ? [...main, ...more] : main
  const allOpen = shown.length > 0 && shown.every(isOpen)
  const setAll = (v: boolean) => setOpen((o) => { const next = { ...o, ...Object.fromEntries(shown.map((t) => [t.id, v])) }; writeOpen(next); return next })
  const stepLabel = phase === 'basic' ? PROCESS.find((p) => p.id === step)?.label : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Design tools</h2>
          {stepLabel && <span className="truncate text-[11px] text-muted" data-testid="tools-step">· {stepLabel} step</span>}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setAll(!allOpen)} className="rounded px-1 text-[11px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">{allOpen ? 'Collapse all' : 'Expand all'}</button>
          <HidePanelButton side="left" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {main.map((t) => <ToolSection key={t.id} tool={t} open={isOpen(t)} onToggle={() => toggle(t)} />)}
        {!main.length && !!more.length && <p className="px-4 py-3 text-[11px] text-muted">No tool leads this step here; the stage's tools are under More tools.</p>}
        {more.length > 0 && (
          <>
            <h3 className="border-b border-line bg-black/[0.03]">
              <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-controls="tools-more"
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                {moreOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}More tools <span className="font-normal normal-case tracking-normal">· {more.length} for the other steps</span>
              </button>
            </h3>
            {moreOpen && <div id="tools-more">{more.map((t) => <ToolSection key={t.id} tool={t} open={isOpen(t)} onToggle={() => toggle(t)} />)}</div>}
          </>
        )}
        {!tools.length && <p className="p-4 text-xs text-muted">No design tools in this stage.</p>}
      </div>
    </div>
  )
}
