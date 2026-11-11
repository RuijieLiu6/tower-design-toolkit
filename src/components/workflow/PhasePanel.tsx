// The left panel, one per phase (Ruijie, 8 Nov: "The left panel should show the selected phase's local tool workflow and,
// below it, the active tool's parameters, controls and results"). Three parts:
//   the phase header: its name and Hide (Import and Export are the project bar's, Result B, 9 Nov);
//   the phase workflow (9 Nov): the Workflow header opens the editor in the centre view (WorkflowOverview.tsx); under it a
//     map of the whole workflow (every tool as a dot in working order, the current phase tinted, loops as arcs) and this
//     phase's tools, which open on a click; Add tool (asks first);
//   the active tool: a design node opens its design tools (tools/ToolPanel.tsx), a check its settings here and its
//     results in the right panel, so the model stays in view.
// Space (overnight brief, 8 Nov): the panel is about 288 px wide (adjustable); the workflow sits in a bounded region
// (about 216 px, more while editing) that scrolls on its own, so a long workflow never pushes the open tool's controls
// out of reach; the controls have the rest of the panel and their own scroll.
// Navigation, working order and execution stay apart: opening a tool never runs anything; editing the workflow only
// changes the order of work (a loop is a route back, never a re-run); checks run with the model while Analysis is on.
// The workflow is the project's, the same as the landing page's and Overview's (lib/workflow/projectWorkflow.ts).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, PackagePlus, PencilLine, Plus, Search, Upload, X } from '../icons'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import Help from '../Help'
import Filmstrip from '../Filmstrip'
import { HidePanelButton } from '../PanelToggle'
import ToolPanel from '../tools/ToolPanel'
import { BUILT_NODES } from '../../data/registry'
import { useCommunityStore } from '../../lib/communityStore'
import { PHASE_COLOR, UI } from '../../lib/design/tokens'
import type { PhaseId } from '../../lib/phases'
import type { NodePackage } from '../../lib/nodePackages'
import { togglePanel, usePanels } from '../../lib/panels'
import { goToStep, useStep } from '../../lib/step'
import { useStore } from '../../store'
import { edgeKey, insertByPhase, returnEdges, type Board } from '../../lib/workflowGraph'
import { designNode, isDesignNode } from '../../lib/workflow/designNodes'
import { NODE_CONTROLS, PHASE_NAME, PHASE_STEP, STEP_PHASE, designOf, homePhase, phasePortion, usePhaseTools } from '../../lib/workflow/phaseTools'
import { addNode, openOverview, runOrder, useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import { useInfo, type Info } from './WorkflowOverview'
import { applyToolView } from '../../lib/workflow/toolView'
import { AddConfirm } from './AddConfirm'
import DesignToolControls from '../designTools/DesignToolControls'
import { TOOL_PREFIX, type ToolDefinition } from '../../lib/designTools/contract'
import { useDesignTools } from '../../lib/designTools/store'
import { PHASE_CATEGORY, toolState } from '../../lib/workflow/builderModel'
import { useTransfer } from '../../lib/porting/transfer'

export type Portion = ReturnType<typeof phasePortion>
const TILE = 24
const BUILT = BUILT_NODES.map((n) => n.id)
const isTool = (id: string) => id.startsWith(TOOL_PREFIX)
const kindOf = (id: string) => (isDesignNode(id) ? 'Design tool' : isTool(id) ? 'Connected design tool' : id.startsWith('community.') ? 'Custom tool' : 'Check')

/** The workflow's names (WorkflowOverview.useInfo) with the installed design tools' own names and phases over their ids. */
function useToolInfo(): (id: string) => Info {
  const base = useInfo()
  const defs = useDesignTools((s) => s.definitions)
  return useMemo(() => (id: string): Info => {
    const def = isTool(id) ? defs[id] : undefined
    if (!def) return base(id)
    const phase = def.phases[0] ?? 'form'
    return { id, name: def.name, word: def.name.split(/[\s:&,(]+/)[0] || def.name, phase, design: false, category: PHASE_CATEGORY[phase] }
  }, [base, defs])
}

export default function PhasePanel() {
  const step = useStep((s) => s.step)
  const phase = STEP_PHASE[step]
  const wf = useProjectWorkflow((s) => s.wf)
  const info = useToolInfo()
  const placed = usePhaseTools((s) => s.placed)
  const packages = useCommunityStore((s) => s.packages)
  const tools = useDesignTools((s) => s.definitions) // a design tool's home is its definition's first phase
  const home = useMemo(() => {
    const cat = new Map(packages.map((p) => [p.id, p.category]))
    return (id: string): PhaseId => placed[id] ?? homePhase(id, (x) => cat.get(x))
  }, [placed, packages, tools]) // eslint-disable-line react-hooks/exhaustive-deps
  const portion = useMemo(() => phasePortion(wf, phase, home), [wf, phase, home])
  const design = designOf(phase).id
  const inFlow = portion.nodes.includes(design)
  // The phase's own design tool always leads the list, in the workflow or not yet (it joins at the first edit).
  const rows = useMemo(() => (inFlow ? portion.nodes : [design, ...portion.nodes]), [inFlow, portion.nodes, design])
  const picked = usePhaseTools((s) => s.active[phase])
  const active = picked && rows.includes(picked) ? picked : design
  const open = (id: string) => {
    usePhaseTools.getState().setActive(phase, id)
    if (!isDesignNode(id)) useStore.getState().selectNode(id)
  }
  // The open tool sets the View it works in (unless the View is pinned), and a check's results show on the right: on
  // opening it, and on coming back to the phase (so the panel and the results never show two different tools).
  // Not on the first render: a reload keeps the View the user last chose (it is remembered in this browser).
  const lastTool = useRef<string | null>(null)
  useEffect(() => {
    const key = `${phase}:${active}`
    if (lastTool.current !== null && lastTool.current !== key) applyToolView(active)
    lastTool.current = key
    if (!isDesignNode(active) && useStore.getState().selectedNode !== active) useStore.getState().selectNode(active)
  }, [active, phase])
  const head = 'flex h-8 items-center gap-1 rounded-lg bg-panel px-2 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <aside aria-label="Design tools" data-testid="phase-panel" data-phase={phase} className="glass-edge panel-slide flex w-[var(--left-w)] shrink-0 flex-col overflow-hidden rounded-2xl bg-panel">
      {/* The phase's name and Hide. */}
      <div className="border-b border-line px-3 pb-2 pt-1.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[phase].accent }} />
          <h2 className="min-w-0 flex-1 truncate text-section font-semibold text-ink">{PHASE_NAME[phase]}</h2>
          <HidePanelButton side="left" />
        </div>
      </div>
      <PhaseWorkflow phase={phase} rows={rows} design={design} active={active} open={open} info={info} home={home} />
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }} data-testid="phase-controls">
        <ActiveTool key={active} id={active} phase={phase} info={info} />
      </div>
    </aside>
  )
}

/**
 * The phase's part of the workflow (Ruijie, 9 Nov: "Turn the left side upper corner of the workflow section into a button
 * which you could click in to add, drag and iterate the workflow … under the workflow, … a very overview of … the orders of
 * the workflow. And it will show the user which phases they're on"). The Workflow header opens the editor in the centre
 * view; under it, the whole workflow at a glance (PhaseMap) and this phase's tools, which open on a click. Add tool stays
 * here for a quick addition (it asks first); arranging, connecting and loops happen in the editor.
 */
function PhaseWorkflow({ phase, rows, design, active, open, info, home }: {
  phase: PhaseId; rows: string[]; design: string; active: string; open: (id: string) => void
  info: (id: string) => Info; home: (id: string) => PhaseId
}) {
  const w = useProjectWorkflow()
  const board = w.wf
  const collapsed = usePhaseTools((s) => s.collapsed)
  const [adding, setAdding] = useState(false)
  useEffect(() => setAdding(false), [phase])
  const back = useMemo(() => returnEdges(board.edges), [board.edges])
  // The phase's design node joins the workflow the first time a tool is added to the phase.
  const ensure = (b: Board): Board => (b.nodes.includes(design) ? b : insertByPhase(b, design))
  const add = (id: string) => {
    const b = ensure(board)
    const after = [...rows].reverse().find((x) => b.nodes.includes(x)) ?? design
    usePhaseTools.getState().place(id, phase)
    w.commit(addNode(b, id, after), `${info(id).name} added to ${PHASE_NAME[phase]}${isDesignNode(id) ? '' : isTool(id) ? '; nothing is sent until you open it' : '; its check is on'}`)
    setAdding(false)
    open(id)
  }
  const returnsFrom = (id: string) => board.edges.filter((e) => e.a === id && back.has(edgeKey(e)))
  const loops = board.edges.filter((e) => back.has(edgeKey(e)) && (rows.includes(e.a) || rows.includes(e.b))).length
  const summary = rows.map((id) => info(id).word).join(' › ')

  return (
    <section aria-label={`${PHASE_NAME[phase]} workflow`} data-testid="phase-workflow" className="flex shrink-0 flex-col border-b border-line pb-2">
      <div className="flex items-center gap-0.5 px-2 pt-2">
        <button type="button" onClick={() => usePhaseTools.getState().setCollapsed(!collapsed)} aria-expanded={!collapsed} data-testid="phase-collapse" aria-label={collapsed ? 'Show the workflow' : 'Hide the workflow'}
          className="flex h-8 w-6 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
          {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
        {/* The header is the way into the editor: the whole row is one button */}
        <button type="button" onClick={() => openOverview('edit')} data-testid="phase-edit" title="Edit the workflow in the centre view: add tools from the shelf, drag, connect and loop them, then Confirm"
          className="group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left text-control outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
          <span className="text-control font-semibold text-ink">Workflow</span>
          <span className="sr-only" data-testid="phase-count">{rows.length} tool{rows.length === 1 ? '' : 's'} in {PHASE_NAME[phase]}{loops ? `, ${loops} return path${loops > 1 ? 's' : ''}` : ''}</span>
          <span className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-0.5 text-control text-ink group-hover:border-accent group-hover:text-accent-hover"><PencilLine size={13} aria-hidden />Edit</span>
        </button>
        <Help label={`About the ${PHASE_NAME[phase]} workflow`}>
          The dots are your whole workflow in working order, coloured by phase; the tinted ones are {PHASE_NAME[phase]}, where you are, and an arc is a loop back to an earlier tool (hover a dot for its name). Under them are the {PHASE_NAME[phase]} tools: click one to open its controls below (a check's results open on the right). Workflow (or Edit) opens the editor in the centre view, where you add tools from the shelf, drag them, connect them and make loops, then Confirm to come back here. A loop is a route for revisiting work: it never reruns anything on its own.
        </Help>
      </div>

      {collapsed
        ? <button type="button" onClick={() => usePhaseTools.getState().setCollapsed(false)} className="mx-3 mt-1 block max-w-[calc(100%-1.5rem)] truncate rounded px-1 text-left text-meta text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent" title="Show the workflow">{summary}{loops ? ' ↻' : ''}</button>
        : (
          <>
            <PhaseMap board={board} phase={phase} active={active} info={info} home={home} />
            <div className="mt-1 max-h-[13.5rem] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin' }} data-testid="phase-workflow-region">
              <ol aria-label={`${PHASE_NAME[phase]} tools, in working order`} data-testid="phase-rows" className="px-2">
                {rows.map((id) => {
                  const n = info(id), isActive = active === id, inBoard = board.nodes.includes(id)
                  const kind = kindOf(id)
                  const rets = returnsFrom(id)
                  return (
                    <li key={id} data-phase-node={id}>
                      <button type="button" data-node={id} aria-current={isActive ? 'true' : undefined}
                        aria-label={`${n.name}${isDesignNode(id) ? ': open its tools' : isTool(id) ? ': open its controls (nothing is sent)' : ': open its settings and results'}${isActive ? ' (open)' : ''}${rets.length ? `; returns to ${rets.map((e) => info(e.b).name).join(', ')}` : ''}`}
                        onClick={() => open(id)} title={`${n.name} · ${kind}${!inBoard ? ' · joins the workflow when you add a tool here' : ''}`}
                        className={`node-hit flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'bg-selected' : 'hover:bg-subtle'}`}>
                        <NodeTile id={id} size={TILE} art={<NodeArtwork id={id} size={Math.round(TILE * 0.9)} category={n.category} />} />
                        <span className={`min-w-0 flex-1 truncate text-node ${isActive ? 'font-semibold text-accent-hover' : 'text-ink'}`}>{n.word.length > 3 && n.name.length > 26 ? n.word : n.name}<span className="sr-only">, {kind}</span></span>
                        {rets.map((e) => <span key={edgeKey(e)} aria-hidden data-return={edgeKey(e)} title={`Loops back to ${info(e.b).name}`} className="shrink-0 text-meta text-muted">↻</span>)}
                      </button>
                    </li>
                  )
                })}
              </ol>
              <div className="px-3 pt-1.5">
                <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} data-testid="phase-add"
                  className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-line px-2.5 text-control text-ink outline-none hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"><Plus size={14} aria-hidden />Add tool</button>
              </div>
              {adding && <AddTool phase={phase} board={board} info={info} home={home} after={info(rows[rows.length - 1]).name} onAdd={add} onClose={() => setAdding(false)} />}
            </div>
          </>
        )}
    </section>
  )
}

/**
 * The whole workflow at a glance: every tool as a dot in working order, coloured by its phase, on one line from start to
 * end; the dots of the phase you are in sit on a tint, the open tool is ringed, and each loop is an arc back over the
 * line. A picture, not a row of buttons: with many tools the dots are far smaller than a 24 px target (interface gate,
 * UI07), so tools open from the list under it and the editor; each dot names its tool on hover and to screen readers.
 */
function PhaseMap({ board, phase, active, info, home }: { board: Board; phase: PhaseId; active: string; info: (id: string) => Info; home: (id: string) => PhaseId }) {
  const order = useMemo(() => runOrder(board), [board])
  const back = useMemo(() => returnEdges(board.edges), [board.edges])
  const phaseOf = (id: string): PhaseId => designNode(id)?.phase ?? home(id)
  if (!order.length) return <p className="px-3 pt-1 text-meta text-muted" data-testid="phase-map">No tools in the workflow yet: Workflow opens the editor to add some.</p>
  const n = order.length, x = (id: string) => ((order.indexOf(id) + 0.5) / n) * 100
  const loops = board.edges.filter((e) => back.has(edgeKey(e)) && order.includes(e.a) && order.includes(e.b))
  const here = order.filter((id) => phaseOf(id) === phase).length
  return (
    <div className="mx-3 mt-0.5" data-testid="phase-map">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="block h-2.5 w-full overflow-visible" aria-hidden>
        {loops.map((e) => <path key={edgeKey(e)} data-map-loop={edgeKey(e)} d={`M${x(e.a)},10 C${x(e.a)},0 ${x(e.b)},0 ${x(e.b)},10`} fill="none" stroke={UI.edge} strokeWidth={1.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="relative">
        <span aria-hidden className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-boundary" />
        <ol className="relative flex" aria-label="The whole workflow, in working order">
          {order.map((id, i) => {
            const ph = phaseOf(id), on = ph === phase, open = id === active
            const prevOn = i > 0 && phaseOf(order[i - 1]) === phase, nextOn = i < n - 1 && phaseOf(order[i + 1]) === phase
            return (
              <li key={id} className="min-w-0 flex-1">
                <span data-map-node={id} data-here={on ? '' : undefined} title={`${i + 1}. ${PHASE_NAME[ph]} / ${info(id).name}`}
                  className={`flex h-6 w-full items-center justify-center ${on && !prevOn ? 'rounded-l-full' : ''} ${on && !nextOn ? 'rounded-r-full' : ''}`}
                  style={{ background: on ? PHASE_COLOR[ph].surface : undefined }}>
                  <span aria-hidden className="block rounded-full" style={{ width: open ? 10 : 7, height: open ? 10 : 7, background: PHASE_COLOR[ph].accent, boxShadow: open ? `0 0 0 2px #fff, 0 0 0 3.5px ${PHASE_COLOR[ph].ink}` : undefined }} />
                  <span className="sr-only">{i + 1} of {n}: {PHASE_NAME[ph]} / {info(id).name}{open ? ' (open)' : ''}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      <p className="mt-0.5 text-meta text-muted">You are in <span className="font-semibold" style={{ color: PHASE_COLOR[phase].ink }}>{PHASE_NAME[phase]}</span>: {here} of {n} tools{loops.length ? ` · ${loops.length} loop${loops.length > 1 ? 's' : ''}` : ''}</p>
    </div>
  )
}

/** Add tool: this phase's tools first, the other phases' on request, and My tools (custom tools with what they declare). */
function AddTool({ phase, board, info, home, after, onAdd, onClose }: {
  phase: PhaseId; board: Board; info: (id: string) => Info; home: (id: string) => PhaseId; after: string; onAdd: (id: string) => void; onClose: () => void
}) {
  const packages = useCommunityStore((s) => s.packages)
  const openDialog = useCommunityStore((s) => s.openDialog)
  const tools = useDesignTools((s) => s.definitions)
  const toolList = useMemo(() => Object.values(tools), [tools])
  const [tab, setTab] = useState<'tools' | 'mine'>('tools')
  const [q, setQ] = useState('')
  const [more, setMore] = useState(false)
  // nothing is added until the user confirms (8 Nov)
  const [ask, setAsk] = useState<string | null>(null)
  const match = (id: string) => { const n = info(id); return !q.trim() || `${n.name} ${n.word}`.toLowerCase().includes(q.trim().toLowerCase()) }
  const free = BUILT.filter((id) => !board.nodes.includes(id) && match(id))
  const here = free.filter((id) => home(id) === phase), elsewhere = free.filter((id) => home(id) !== phase)
  const row = (id: string, extra?: string) => (
    <li key={id}><button type="button" data-add={id} onClick={() => setAsk(id)}
      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-control outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
      <NodeTile id={id} size={24} art={<NodeArtwork id={id} size={21} category={info(id).category} />} />
      <span className="min-w-0 flex-1 truncate">{info(id).name}</span>
      {extra && <span className="shrink-0 text-meta text-muted">{extra}</span>}
    </button></li>
  )
  return (
    <div role="region" aria-label="Add a tool" data-testid="phase-add-list" className="mx-3 mt-1.5 rounded-xl border border-line bg-panel p-2">
      <div className="flex items-center gap-1">
        <div role="tablist" aria-label="Kind of tool" className="flex gap-0.5">
          {(['tools', 'mine'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-2 py-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${tab === t ? 'bg-ink' : 'text-muted hover:text-ink'}`}>{t === 'tools' ? 'Tools' : `My tools (${packages.length + toolList.length})`}</button>)}
        </div>
        <button type="button" onClick={onClose} aria-label="Close Add tool" className="ml-auto rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button>
      </div>
      {ask
        ? <AddConfirm info={info(ask)} className="mt-1.5" onConfirm={() => { const id = ask; setAsk(null); onAdd(id) }} onCancel={() => setAsk(null)}
            placement={<>Goes after {after} · shows in the {PHASE_NAME[phase]} panel</>} />
        : <p className="px-1 pt-1 text-meta text-muted">Goes after {after}. You confirm before it is added.</p>}
      {tab === 'tools' ? (
        <>
          <label className="mt-1 flex items-center gap-1.5 rounded-lg border border-line px-2 py-1"><Search size={13} className="text-muted" aria-hidden /><span className="sr-only">Search tools</span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools" className="min-w-0 flex-1 bg-transparent text-control outline-none" /></label>
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {here.map((id) => row(id))}
            {!here.length && <li className="px-1.5 py-1 text-meta text-muted">Every {PHASE_NAME[phase]} tool is in the workflow{q ? ' (or none has that name)' : ''}.</li>}
            {elsewhere.length > 0 && (more || q.trim()
              ? <><li className="px-1.5 pt-1.5 text-meta font-semibold text-muted">Available in other phases</li>{elsewhere.map((id) => row(id, PHASE_NAME[home(id)]))}</>
              : <li><button type="button" onClick={() => setMore(true)} className="px-1.5 py-1 text-meta text-accent-hover outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">Show tools from other phases ({elsewhere.length})</button></li>)}
          </ul>
        </>
      ) : (
        <>
          <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto">
            {packages.map((p) => <MyTool key={p.id} pkg={p} inFlow={board.nodes.includes(p.id)} onAdd={() => setAsk(p.id)} />)}
            {toolList.map((d) => <MyDesignTool key={d.id} def={d} inFlow={board.nodes.includes(d.id)} onAdd={() => setAsk(d.id)} />)}
            {!packages.length && !toolList.length && <li className="px-1.5 py-1 text-meta text-muted">No custom tools yet. Build one with your AI, or import a tool file.</li>}
          </ul>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <button type="button" onClick={() => openDialog('build')} className="flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><PackagePlus size={13} aria-hidden />Build your own tool</button>
            <button type="button" onClick={(e) => useTransfer.getState().open('import', e.currentTarget, { purpose: 'tool' })} title="A check package or a connected design tool's definition, through Import" className="flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><Upload size={13} aria-hidden />Import a tool file</button>
          </div>
        </>
      )}
    </div>
  )
}

/** A custom tool in My tools, with what it declares: inputs, outputs (its metrics), parameters and version. */
function MyTool({ pkg, inFlow, onAdd }: { pkg: NodePackage; inFlow: boolean; onAdd: () => void }) {
  return (
    <li className="rounded-lg border border-line p-1.5" data-my-tool={pkg.id}>
      <div className="flex items-center gap-2">
        <NodeTile id={pkg.id} size={24} art={<NodeArtwork id={pkg.id} size={21} category={pkg.category} />} />
        <span className="min-w-0 flex-1"><span className="block truncate text-control text-ink">{pkg.name}</span><span className="block text-meta text-muted">v{pkg.version} · {pkg.author.name}</span></span>
        {inFlow ? <span className="text-meta text-muted">In the workflow</span>
          : <button type="button" onClick={onAdd} data-add={pkg.id} className="rounded-lg bg-panel px-2 py-0.5 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Add</button>}
      </div>
      <ToolFacts pkg={pkg} />
    </li>
  )
}
/** A connected design tool in My tools: its state word (builderModel.toolState), what it reads and may change, and Add. */
function MyDesignTool({ def, inFlow, onAdd }: { def: ToolDefinition; inFlow: boolean; onAdd: () => void }) {
  const phase = def.phases[0] ?? 'form'
  const state = toolState(def)
  return (
    <li className="rounded-lg border border-line p-1.5" data-my-tool={def.id}>
      <div className="flex items-center gap-2">
        <NodeTile id={def.id} size={24} art={<NodeArtwork id={def.id} size={21} category={PHASE_CATEGORY[phase]} />} />
        <span className="min-w-0 flex-1"><span className="block truncate text-control text-ink">{def.name}</span><span className="block text-meta text-muted">v{def.version} · {def.author.name} · {state}</span></span>
        {inFlow ? <span className="text-meta text-muted">In the workflow</span>
          : <button type="button" onClick={onAdd} data-add={def.id} className="rounded-lg bg-panel px-2 py-0.5 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Add</button>}
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-meta">
        <dt className="text-muted">Reads</dt><dd className="truncate text-ink" title={def.destination.sends.join(', ')}>{def.destination.sends.join(', ')}</dd>
        <dt className="text-muted">May change</dt><dd className="truncate text-ink">{def.operations.map((op) => op.replace(/-/g, ' ')).join(', ')} (you apply)</dd>
        <dt className="text-muted">Phase</dt><dd className="text-ink">{PHASE_NAME[phase]}</dd>
      </dl>
    </li>
  )
}
function ToolFacts({ pkg }: { pkg: NodePackage }) {
  const outs = pkg.metrics.map((m) => m.label), params = (pkg.parameters ?? []).map((p) => `${p.label} (${p.default}${p.unit ? ` ${p.unit}` : ''})`)
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-meta">
      <dt className="text-muted">Inputs</dt><dd className="truncate text-ink" title={pkg.inputs.join(', ')}>{pkg.inputs.length ? pkg.inputs.join(', ') : 'none'}</dd>
      <dt className="text-muted">Outputs</dt><dd className="truncate text-ink" title={outs.join(', ')}>{outs.length ? outs.join(', ') : 'none'}</dd>
      <dt className="text-muted">Parameters</dt><dd className="truncate text-ink" title={params.join(', ')}>{params.length ? params.join(', ') : 'none'}</dd>
      <dt className="text-muted">Version</dt><dd className="text-ink">{pkg.version} · {pkg.licence}</dd>
    </dl>
  )
}

/** The open tool: a design node's tools, or a check's settings with its results on the right. */
function ActiveTool({ id, phase, info }: { id: string; phase: PhaseId; info: (id: string) => Info }) {
  const n = info(id), d = designNode(id)
  const on = useStore((s) => !!s.enabled[id])
  const analysis = useStore((s) => s.analysis)
  const right = usePanels((s) => s.right)
  const pkg = useCommunityStore((s) => s.packages.find((p) => p.id === id))
  const controls = NODE_CONTROLS[id]
  const showResults = () => { useStore.getState().selectNode(id); if (!right) togglePanel('right') }
  const tool = isTool(id)
  // a connected design tool never runs on its own: opening it sends nothing (brief §5); its words come from its controls
  const state = d ? d.about : tool ? 'Opens its workspace; proposes changes you apply' : !on ? 'Switched off: add it to the workflow or switch it on in the Library' : analysis ? 'Runs with the model; its results are on the right' : 'Analysis is off: its results wait until you switch it on'
  return (
    <div role="region" aria-label={`${n.name}: controls`} data-testid="phase-active" data-active={id}>
      <div className="flex items-center gap-2 px-3 py-2">
        <NodeTile id={id} size={24} art={<NodeArtwork id={id} size={21} category={n.category} />} />
        <span className="min-w-0 flex-1">
          <h3 className="truncate text-control font-semibold text-ink" data-testid="phase-active-name">{n.name}</h3>
          <span className="block truncate text-meta text-muted" title={state}>{state}</span>
        </span>
        {!d && !tool && <button type="button" onClick={showResults} data-testid="phase-results" className="flex h-8 shrink-0 items-center rounded-lg bg-panel px-2.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Results</button>}
      </div>
      {d ? (phase === 'present' ? <Filmstrip tone="light" /> : <ToolPanel embedded />)
        : tool ? <DesignToolControls id={id} />
        : controls ? <ToolPanel embedded only={controls} />
          : pkg ? <div className="px-3 pb-3"><ToolFacts pkg={pkg} /></div>
            : <p className="px-3 pb-3 text-meta text-muted">This check has no settings of its own here: it reads the model and the site. Its results and evidence are in the right panel.</p>}
    </div>
  )
}
