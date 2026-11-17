// The left panel, one per phase (Ruijie, 8 Nov: "The left panel should show the selected phase's local tool workflow and,
// below it, the active tool's parameters, controls and results"). Three parts:
//   the phase header: its name and Hide (Import… and Export… are the project menu's, Result B, 9 Nov);
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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Expand, PackagePlus, PencilLine, Plus, Search, Upload, X } from '../icons'
import { canExpand, toggleAnalysis, useAnalysisView } from '../../lib/analysisView'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import Help from '../Help'
import Filmstrip from '../Filmstrip'
import { HidePanelButton } from '../PanelToggle'
import ToolPanel from '../tools/ToolPanel'
import { MassingStart } from '../tools/NoTower'
import { BUILT_NODES } from '../../data/registry'
import { useCommunityStore } from '../../lib/communityStore'
import { PHASE_COLOR, UI } from '../../lib/design/tokens'
import { PHASES, type PhaseId } from '../../lib/phases'
import { MODE_NAME, modeOfPhase, phasesOf, type Mode } from '../../lib/mode'
import { usePhaseCounts, type PhaseCounts } from '../../lib/workflow/phaseCounts'
import { useNodeSummaries } from '../../hooks/useNodeSummaries'
import { isVisible, useUiGroupVisible, useUiItems, useUiVisibility, useUiVisible } from '../../lib/ui/registry'
import UiShow from '../ui/UiShow'
import type { NodePackage } from '../../lib/nodePackages'
import { togglePanel, usePanels } from '../../lib/panels'
import { goToStep, useStep } from '../../lib/step'
import { useStore } from '../../store'
import { edgeKey, insertByPhase, returnEdges, type Board } from '../../lib/workflowGraph'
import { designNode, isDesignNode } from '../../lib/workflow/designNodes'
import { NODE_CONTROLS, PHASE_IDS, PHASE_NAME, PHASE_STEP, STEP_PHASE, designOf, homePhase, phasePortion, usePhaseTools } from '../../lib/workflow/phaseTools'
import { addNode, openBuilder, openOverview, runOrder, useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import { useInfo, type Info } from './WorkflowOverview'
import { applyToolView, leaveToolView } from '../../lib/workflow/toolView'
import { AddConfirm } from './AddConfirm'
import WorkflowPreview from './WorkflowPreview'

export type Portion = ReturnType<typeof phasePortion>
const TILE = 24
const BUILT = BUILT_NODES.map((n) => n.id)

/**
 * Where the open design tool's tools go (16 Nov, Sinnie: the starting choices "should stay on the left, i might the
 * tools to edit the mass after (position, height, etc.)"): once there is a mass, a design tool past the Site step edits
 * it from the right panel's Design tab; before that (Massing's start choices) and on the Site step, it stays here.
 */
export function useDesignOnRight(): boolean {
  const { active, phase } = usePhaseActive()
  const hasMass = useStore((s) => s.towers[s.project].length > 0)
  const present = useStore((s) => s.phase === 'present')
  return !present && phase !== 'site' && hasMass && isDesignNode(active)
}

/** The phase, its tools in order and the open one: shared by the left panel and the right panel's Properties tab. */
export function usePhaseActive() {
  const step = useStep((s) => s.step)
  const phase = STEP_PHASE[step]
  const wf = useProjectWorkflow((s) => s.wf)
  const info = useInfo()
  const placed = usePhaseTools((s) => s.placed)
  const packages = useCommunityStore((s) => s.packages)
  const home = useMemo(() => {
    const cat = new Map(packages.map((p) => [p.id, p.category]))
    return (id: string): PhaseId => placed[id] ?? homePhase(id, (x) => cat.get(x))
  }, [placed, packages])
  const portion = useMemo(() => phasePortion(wf, phase, home), [wf, phase, home])
  const design = designOf(phase).id
  // Model or Presentation (lib/mode.ts), and the fail / check counts per phase for the phase list.
  const mode = modeOfPhase(phase)
  const counts = usePhaseCounts(home)
  const inFlow = portion.nodes.includes(design)
  // The phase's own design tool always leads the list, in the workflow or not yet (it joins at the first edit).
  // A custom tool hidden in the Interface drawer leaves the lists (it stays installed and in the workflow).
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const rows = useMemo(() => (inFlow ? portion.nodes : [design, ...portion.nodes]).filter((id) => !id.startsWith('community.') || isVisible(`addons.tools.${id}`, hiddenUi, uiItems)), [inFlow, portion.nodes, design, hiddenUi, uiItems])
  const showWorkflow = useUiGroupVisible('left.workflow'), showTool = useUiVisible('left.tool')
  const picked = usePhaseTools((s) => s.active[phase])
  const active = picked && rows.includes(picked) ? picked : design
  return { phase, wf, info, home, design, rows, active, mode, counts, showWorkflow, showTool }
}

export default function PhasePanel() {
  const { phase, info, home, design, rows, active, mode, counts, showWorkflow, showTool } = usePhaseActive()
  const collapsed = usePhaseTools((s) => s.collapsed)
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
    if (lastTool.current !== null && lastTool.current !== key) {
      const cut = lastTool.current.indexOf(':')
      const prev = lastTool.current.slice(cut + 1), newStep = lastTool.current.slice(0, cut) !== phase
      void leaveToolView(prev, active, newStep).then(() => applyToolView(active))
    }
    lastTool.current = key
    if (!isDesignNode(active) && useStore.getState().selectedNode !== active) useStore.getState().selectNode(active)
  }, [active, phase])
  const head = 'flex h-8 items-center gap-1 rounded-lg bg-panel px-2 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <div className="panel-slide flex w-[var(--left-w)] min-h-0 shrink-0 flex-col gap-2" data-testid="left-column">
    {/* 17 Nov (Sinnie, merging Ruijie's main: "keep Ruijie's workflow panel style, but function should still be mine"):
        his phase header and Workflow fold with the phase line replace the workflow card; the rows, Add tool and the open
        tool's controls (Start your massing on Form, the analysis expand buttons) are this panel's own. */}
    <aside aria-label="Design tools" data-testid="phase-panel" data-phase={phase} className="glass-edge flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-panel">
      {/* The phase's name and Hide. */}
      <div className="border-b border-line px-3 pb-1.5 pt-1.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[phase].accent }} />
          <h2 className="min-w-0 flex-1 truncate text-section font-semibold text-ink">{PHASE_NAME[phase]}</h2>
          <PhaseTotals counts={counts} mode={mode} />
          <HidePanelButton side="left" />
        </div>
      </div>
      {showWorkflow && <PhaseWorkflow phase={phase} mode={mode} counts={counts} rows={rows} design={design} active={active} open={open} info={info} home={home} />}
      {showTool && <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }} data-testid="phase-controls">
        <ActiveTool key={active} id={active} phase={phase} info={info} />
      </div>}
    </aside>
    </div>
  )
}

/**
 * The phase's part of the workflow (Ruijie, 9 Nov: "Turn the left side upper corner of the workflow section into a button
 * which you could click in to add, drag and iterate the workflow … under the workflow, … a very overview of … the orders of
 * the workflow. And it will show the user which phases they're on"). The Workflow header opens the editor in the centre
 * view; under it, the whole workflow at a glance (PhaseMap) and this phase's tools, which open on a click. Add tool stays
 * here for a quick addition (it asks first); arranging, connecting and loops happen in the editor.
 */
function PhaseWorkflow({ phase, mode, counts, rows, design, active, open, info, home }: {
  phase: PhaseId; mode: Mode; counts: PhaseCounts; rows: string[]; design: string; active: string; open: (id: string) => void
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
    w.commit(addNode(b, id, after), `${info(id).name} added to ${PHASE_NAME[phase]}${isDesignNode(id) ? '' : '; its check is on'}`)
    setAdding(false)
    open(id)
  }
  const returnsFrom = (id: string) => board.edges.filter((e) => e.a === id && back.has(edgeKey(e)))
  const loops = board.edges.filter((e) => back.has(edgeKey(e)) && (rows.includes(e.a) || rows.includes(e.b))).length
  const summary = rows.map((id) => info(id).word).join(' › ')
  // Back and Next (12 Nov, back again 17 Nov after the merge: "bring back the next and back buttons"): every tool of the
  // workflow in working order, into the next phase when a phase's tools end.
  const tools = useMemo(() => runOrder(board), [board])
  const phaseOf = (id: string): PhaseId => designNode(id)?.phase ?? home(id)
  const ti = tools.indexOf(active)
  const pi = PHASE_IDS.indexOf(phase)
  const next = ti >= 0 ? tools[ti + 1] : tools.find((t) => PHASE_IDS.indexOf(phaseOf(t)) > pi)
  const prev = ti >= 0 ? tools[ti - 1] : [...tools].reverse().find((t) => PHASE_IDS.indexOf(phaseOf(t)) < pi)
  const goTool = (id: string) => {
    const ph = phaseOf(id)
    usePhaseTools.getState().setActive(ph, id)
    if (!isDesignNode(id)) useStore.getState().selectNode(id)
    if (ph !== phase) goToStep(PHASE_STEP[ph])
  }
  const navBtn = 'flex h-8 items-center rounded-lg border border-line bg-panel px-2.5 text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

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
          The line is your whole workflow in working order, one coloured segment per phase; the tinted one is {PHASE_NAME[phase]}, where you are. Click a segment or use the arrows under the line to change phase; hover a dot for its tool and its results; an arc is a loop back to an earlier tool. Under them are the {PHASE_NAME[phase]} tools: click one to open its controls below (a check's results open on the right). Workflow (or Edit) opens the editor in the centre view, where you add tools from the shelf, drag them, connect them and make loops, then Confirm to come back here. A loop is a route for revisiting work: it never reruns anything on its own.
        </Help>
      </div>
      <UiShow id="left.workflow.line"><PhaseLine board={board} phase={phase} mode={mode} active={active} info={info} home={home} counts={counts} /></UiShow>

      {collapsed
        ? <button type="button" onClick={() => usePhaseTools.getState().setCollapsed(false)} className="mx-3 mt-1 block max-w-[calc(100%-1.5rem)] truncate rounded px-1 text-left text-meta text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent" title="Show the tools">{summary}{loops ? ' ↻' : ''}</button>
        : (
          <>
            <div className="mt-1 max-h-[13.5rem] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin' }} data-testid="phase-workflow-region">
              <UiShow id="left.workflow.rows"><ol aria-label={`${PHASE_NAME[phase]} tools, in working order`} data-testid="phase-rows" className="px-2">
                {rows.map((id) => {
                  const n = info(id), isActive = active === id, inBoard = board.nodes.includes(id)
                  const kind = isDesignNode(id) ? 'Design tool' : id.startsWith('community.') ? 'Custom tool' : 'Check'
                  const rets = returnsFrom(id)
                  return (
                    <li key={id} data-phase-node={id} className="group relative">
                      <button type="button" data-node={id} aria-current={isActive ? 'true' : undefined}
                        aria-label={`${n.name}${isDesignNode(id) ? ': open its tools' : ': open its settings and results'}${isActive ? ' (open)' : ''}${rets.length ? `; returns to ${rets.map((e) => info(e.b).name).join(', ')}` : ''}`}
                        onClick={() => open(id)} title={`${n.name} · ${kind}${!inBoard ? ' · joins the workflow when you add a tool here' : ''}`}
                        className={`node-hit flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg py-1 pl-1.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'bg-selected' : 'hover:bg-subtle'}`}>
                        <NodeTile id={id} size={TILE} art={<NodeArtwork id={id} size={Math.round(TILE * 0.9)} category={n.category} />} />
                        <span className={`min-w-0 flex-1 truncate text-node ${isActive ? 'font-semibold text-accent-hover' : 'text-ink'}`}>{n.word.length > 3 && n.name.length > 26 ? n.word : n.name}<span className="sr-only">, {kind}</span></span>
                        {rets.map((e) => <span key={edgeKey(e)} aria-hidden data-return={edgeKey(e)} title={`Loops back to ${info(e.b).name}`} className="shrink-0 text-meta text-muted">↻</span>)}
                      </button>
                      {!isDesignNode(id) && canExpand(id) && <ExpandAnalysis id={id} name={n.name} />}
                    </li>
                  )
                })}
              </ol></UiShow>
              <UiShow id="left.workflow.add"><div className="flex items-center gap-1.5 px-3 pt-1.5">
                <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} data-testid="phase-add"
                  className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-line px-2.5 text-control text-ink outline-none hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"><Plus size={14} aria-hidden />Add tool</button>
                <span className="ml-auto flex items-center gap-1.5">
                  <button type="button" onClick={() => prev && goTool(prev)} disabled={!prev} data-testid="workflow-back"
                    aria-label={prev ? `Back to ${info(prev).name}` : 'Back: this is the first tool'} title={prev ? `Back to ${info(prev).name} (${PHASE_NAME[phaseOf(prev)]})` : 'This is the first tool'} className={navBtn}>‹ Back</button>
                  <button type="button" onClick={() => next && goTool(next)} disabled={!next} data-testid="workflow-next"
                    aria-label={next ? `Next: ${info(next).name}` : 'Next: this is the last tool'} title={next ? `Next: ${info(next).name} (${PHASE_NAME[phaseOf(next)]})` : 'This is the last tool'} className={navBtn}>Next ›</button>
                </span>
              </div></UiShow>
              {adding && <AddTool phase={phase} board={board} info={info} home={home} after={info(rows[rows.length - 1]).name} onAdd={add} onClose={() => setAdding(false)} />}
            </div>
          </>
        )}
    </section>
  )
}

/**
 * The phases and the whole workflow on one line (Ruijie, 17 Nov: "remove all the Site / Form / Program / Schematic text
 * … the left and right arrows can be the buttons for changing which phase you are in"). One coloured segment per phase
 * of the mode, as wide as its share of tools (at least one share, so an empty phase still shows its colour), the one
 * you are in on a tint; a click or the arrow keys on a segment go there (it is the phase navigation: the
 * "Design process" landmark with each phase's hooks). Inside each segment, its tools as dots in working order, the
 * open one ringed; hovering a dot names its phase and tool with the tool's pass / check / fail words (hooks/
 * useNodeSummaries.ts), and a click on a dot goes to its phase. Loops are arcs over the line. Under it, where you are,
 * and the arrows to the previous and the next phase of the mode (never wrapping; Presentation is the top bar's switch).
 */
function PhaseLine({ board, phase, mode, active, info, home, counts }: { board: Board; phase: PhaseId; mode: Mode; active: string; info: (id: string) => Info; home: (id: string) => PhaseId; counts: PhaseCounts }) {
  const phases = phasesOf(mode)
  const phaseOf = (id: string): PhaseId => designNode(id)?.phase ?? home(id)
  // Only this mode's phases: Presentation's tools stay out of the Model line, and the other way round.
  const order = useMemo(() => runOrder(board).filter((id) => phases.includes(designNode(id)?.phase ?? home(id))), [board, phases, home])
  const back = useMemo(() => returnEdges(board.edges), [board.edges])
  const summaries = useNodeSummaries()
  const segs = phases.map((p) => ({ p, nodes: order.filter((id) => phaseOf(id) === p) }))
  const total = segs.reduce((acc, g) => acc + Math.max(1, g.nodes.length), 0)
  // A node's place along the line, in per cent: its segment's start plus its share of the segment.
  const x = (id: string) => {
    let off = 0
    for (const g of segs) { const w = Math.max(1, g.nodes.length), j = g.nodes.indexOf(id); if (j >= 0) return ((off + ((j + 0.5) / g.nodes.length) * w) / total) * 100; off += w }
    return 0
  }
  const loops = board.edges.filter((e) => back.has(edgeKey(e)) && order.includes(e.a) && order.includes(e.b))
  const n = order.length, here = order.filter((id) => phaseOf(id) === phase).length
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = phases.indexOf(phase)
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? phases.length - 1 : null
    if (j === null) return
    e.preventDefault()
    const next = phases[(j + phases.length) % phases.length]
    goToStep(PHASE_STEP[next])
    document.querySelector<HTMLElement>(`nav[aria-label="Design process"] [data-phase="${next}"]`)?.focus()
  }
  const words = (p: PhaseId) => { const c = counts[p]; return c && (c.fail || c.warn) ? `, ${[c.fail ? `${c.fail} fail` : '', c.warn ? `${c.warn} check` : ''].filter(Boolean).join(', ')}` : '' }
  return (
    <nav aria-label="Design process" data-testid="phase-line" className="mx-3 mt-0.5">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="block h-2.5 w-full overflow-visible" aria-hidden>
        {loops.map((e) => <path key={edgeKey(e)} data-map-loop={edgeKey(e)} d={`M${x(e.a)},10 C${x(e.a)},0 ${x(e.b)},0 ${x(e.b)},10`} fill="none" stroke={UI.edge} strokeWidth={1.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <ol role="list" aria-label="The phases, each with its tools in working order" data-testid="phase-map" className="flex gap-px">
        {segs.map(({ p, nodes }) => {
          const lit = p === phase, about = PHASES.find((ph) => ph.id === p)?.about
          return (
            <li key={p} className="relative min-w-0" style={{ flex: `${Math.max(1, nodes.length)} 1 0%` }}>
              {/* The phase itself: its hook, name and counts for the keyboard and screen readers; the tint when you are in it.
                  Its colour line and its dots sit inside the button, so a click on a dot is a click on the phase. */}
              <button type="button" onClick={() => goToStep(PHASE_STEP[p])} onKeyDown={onKey} aria-current={lit ? 'step' : undefined} tabIndex={lit ? 0 : -1} data-step={PHASE_STEP[p]} data-phase={p}
                aria-label={`${PHASE_NAME[p]}: ${nodes.length} tool${nodes.length === 1 ? '' : 's'}${words(p)}`} title={`${PHASE_NAME[p]}${about ? ` · ${about}` : ''}`}
                className={`relative block h-6 w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent ${lit ? '' : 'hover:bg-subtle'}`} style={{ background: lit ? PHASE_COLOR[p].surface : undefined }}>
                {/* Its colour, always, so the categories read without words. */}
                <span aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2 rounded-full" style={{ background: PHASE_COLOR[p].accent, opacity: lit ? 1 : 0.6 }} />
                <span aria-hidden className="absolute inset-0 flex">
                  {nodes.map((id) => {
                    const open = id === active, sum = summaries[id]
                    return (
                      <span key={id} data-map-node={id} data-here={lit ? '' : undefined} title={`${PHASE_NAME[p]} / ${info(id).name}${sum ? ` · ${sum}` : ''}`} className="flex min-w-0 flex-1 items-center justify-center">
                        <span className="block rounded-full" style={{ width: open ? 10 : 7, height: open ? 10 : 7, background: PHASE_COLOR[p].accent, boxShadow: open ? `0 0 0 2px #fff, 0 0 0 3.5px ${PHASE_COLOR[p].ink}` : '0 0 0 1.5px #fff' }} />
                      </span>
                    )
                  })}
                </span>
              </button>
              {/* The tools of the phase for screen readers (the dots are drawn, not read). */}
              {nodes.length > 0 && (
                <ul className="sr-only">
                  {nodes.map((id) => { const sum = summaries[id]; return <li key={id}>{order.indexOf(id) + 1} of {n}: {PHASE_NAME[p]} / {info(id).name}{sum ? `, ${sum}` : ''}{id === active ? ' (open)' : ''}</li> })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      <div className="mt-0.5 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-meta text-muted">
          {n ? <>You are in <span className="font-semibold" style={{ color: PHASE_COLOR[phase].ink }}>{PHASE_NAME[phase]}</span>: {here} of {n} tools{loops.length ? ` · ${loops.length} loop${loops.length > 1 ? 's' : ''}` : ''}</>
            : <>You are in <span className="font-semibold" style={{ color: PHASE_COLOR[phase].ink }}>{PHASE_NAME[phase]}</span> · no tools in the workflow yet: Edit adds some</>}
        </p>
        <PhaseNav phase={phase} mode={mode} />
      </div>
    </nav>
  )
}

/** Fail and check totals across the mode's phases, in the panel header (none when all is clear). */
function PhaseTotals({ counts, mode }: { counts: PhaseCounts; mode: Mode }) {
  let fail = 0, warn = 0
  for (const p of phasesOf(mode)) { const c = counts[p]; if (c) { fail += c.fail; warn += c.warn } }
  if (!fail && !warn) return null
  return <span className="flex shrink-0 items-center gap-2 text-meta tabular-nums text-muted" title={`${fail} fail, ${warn} check across ${MODE_NAME[mode]}`} data-testid="phase-totals"><Counts c={{ fail, warn }} /></span>
}
/** A fail count in red and a check count in amber, each with its word for screen readers. */
function Counts({ c }: { c: { fail: number; warn: number } }) {
  return (
    <>
      {c.fail > 0 && <span className="flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />{c.fail}<span className="sr-only"> fail</span></span>}
      {c.warn > 0 && <span className="flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />{c.warn}<span className="sr-only"> check</span></span>}
    </>
  )
}

/** The previous and the next phase of the mode (Ruijie, 17 Nov): disabled at the ends, never wrapping; Presentation is the top bar's switch. */
function PhaseNav({ phase, mode }: { phase: PhaseId; mode: Mode }) {
  const phases = phasesOf(mode), i = phases.indexOf(phase), prev = phases[i - 1], next = phases[i + 1]
  const btn = 'flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" disabled={!prev} onClick={() => prev && goToStep(PHASE_STEP[prev])} data-testid="phase-back" aria-label={prev ? `Previous phase: ${PHASE_NAME[prev]}` : 'Previous phase: none, this is the first'} title={prev ? `Previous phase: ${PHASE_NAME[prev]}` : undefined} className={btn}><ChevronLeft size={14} aria-hidden /></button>
      <button type="button" disabled={!next} onClick={() => next && goToStep(PHASE_STEP[next])} data-testid="phase-next" aria-label={next ? `Next phase: ${PHASE_NAME[next]}` : 'Next phase: none, this is the last'} title={next ? `Next phase: ${PHASE_NAME[next]}` : undefined} className={btn}><ChevronRight size={14} aria-hidden /></button>
    </span>
  )
}

/** Add tool: this phase's tools first, the other phases' on request, and My tools (custom tools with what they declare). */
function AddTool({ phase, board, info, home, after, onAdd, onClose }: {
  phase: PhaseId; board: Board; info: (id: string) => Info; home: (id: string) => PhaseId; after: string; onAdd: (id: string) => void; onClose: () => void
}) {
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const packages = useCommunityStore((s) => s.packages).filter((p) => isVisible(`addons.tools.${p.id}`, hiddenUi, uiItems))
  const openDialog = useCommunityStore((s) => s.openDialog)
  const [tab, setTab] = useState<'tools' | 'mine'>('tools')
  const [q, setQ] = useState('')
  const [more, setMore] = useState(false)
  // nothing is added until the user confirms (8 Nov)
  const [ask, setAsk] = useState<string | null>(null)
  const match = (id: string) => { const n = info(id); return !q.trim() || `${n.name} ${n.word}`.toLowerCase().includes(q.trim().toLowerCase()) }
  const free = BUILT.filter((id) => !board.nodes.includes(id) && match(id))
  // Other phases of the same mode only (17 Nov): Presentation's tools are added in Presentation, the design tools in Model.
  const here = free.filter((id) => home(id) === phase), elsewhere = free.filter((id) => home(id) !== phase && modeOfPhase(home(id)) === modeOfPhase(phase))
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
          {(['tools', 'mine'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-2 py-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${tab === t ? 'bg-ink' : 'text-muted hover:text-ink'}`}>{t === 'tools' ? 'Tools' : `My tools (${packages.length})`}</button>)}
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
            {!packages.length && <li className="px-1.5 py-1 text-meta text-muted">No custom tools yet. Build one with your AI, or import a tool file.</li>}
          </ul>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <button type="button" onClick={() => openDialog('build')} className="flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><PackagePlus size={13} aria-hidden />Build your own tool</button>
            <button type="button" onClick={() => openDialog('import')} className="flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><Upload size={13} aria-hidden />Import a tool file</button>
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
export function ActiveTool({ id, phase, info }: { id: string; phase: PhaseId; info: (id: string) => Info }) {
  const n = info(id), d = designNode(id)
  const on = useStore((s) => !!s.enabled[id])
  const analysis = useStore((s) => s.analysis)
  const right = usePanels((s) => s.right)
  const pkg = useCommunityStore((s) => s.packages.find((p) => p.id === id))
  const controls = NODE_CONTROLS[id]
  const showResults = () => { useStore.getState().selectNode(id); if (!right) togglePanel('right') }
  const state = d ? d.about : !on ? 'Switched off: add it to the workflow or switch it on in More › Check library' : analysis ? 'Runs with the model; its results are on the right' : 'Auto-run checks is off: its results wait until you turn it on in the project bar'
  return (
    <div role="region" aria-label={`${n.name}: controls`} data-testid="phase-active" data-active={id}>
      <div className="flex items-center gap-2 px-3 py-2">
        <NodeTile id={id} size={24} art={<NodeArtwork id={id} size={21} category={n.category} />} />
        <span className="min-w-0 flex-1">
          <h3 className="truncate text-control font-semibold text-ink" data-testid="phase-active-name">{n.name}</h3>
          <span className="block truncate text-meta text-muted" title={state}>{state}</span>
        </span>
        {!d && canExpand(id) && <ExpandAnalysis id={id} name={n.name} className="h-8 w-8 shrink-0" />}
        {!d && <button type="button" onClick={showResults} data-testid="phase-results" className="flex h-8 shrink-0 items-center rounded-lg bg-panel px-2.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Results</button>}
      </div>
      {/* With a mass, a design node's editing tools are in the right panel's Design tab (useDesignOnRight). */}
      {/* Massing keeps its four ways to start here at all times (16 Nov, Sinnie: "on the left, i should always see the 4
          massing options"), also once there is a mass and its editing tools are on the right. */}
      {d ? (phase === 'present' ? <UiShow id="present.filmstrip"><Filmstrip tone="light" /></UiShow> : phase === 'form' && id === designOf('form').id ? <MassingStart /> : <ToolPanel embedded />)
        : controls ? <ToolPanel embedded only={controls} />
          : pkg ? <div className="px-3 pb-3"><ToolFacts pkg={pkg} /></div>
            : <p className="px-3 pb-3 text-meta text-muted">This check has no settings of its own here: it reads the model and the site. Its results and evidence are in the right panel.</p>}
    </div>
  )
}

/** Opens (or closes) the check's analysis view beside the model (lib/analysisView.ts). */
export function ExpandAnalysis({ id, name, className = 'absolute right-1 top-1/2 -translate-y-1/2' }: { id: string; name: string; className?: string }) {
  const open = useAnalysisView((s) => s.node === id)
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); toggleAnalysis(id) }} data-expand={id} aria-pressed={open}
      aria-label={open ? `Close the analysis view of ${name}` : `Open the analysis view of ${name} beside the model`}
      title={open ? 'Close the analysis view' : 'Open the analysis view beside the model'}
      className={`${className} flex h-7 w-7 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent ${open ? 'bg-accent text-white' : 'text-muted hover:bg-panel hover:text-ink'}`}>
      <Expand size={14} aria-hidden />
    </button>
  )
}
