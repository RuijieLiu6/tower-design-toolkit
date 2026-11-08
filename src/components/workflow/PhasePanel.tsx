// The left panel, one per phase (Ruijie, 8 Nov: "The left panel should show the selected phase's local tool workflow and,
// below it, the active tool's parameters, controls and results"). Three parts:
//   the phase header: its name, Import and Export (phase package, model snapshot, external formats) and Hide;
//   the phase workflow: the phase's own part of the project workflow, top to bottom in working order, with its
//     connections, return paths (arcs in the left margin) and links to other phases ("Return to Form / Massing"). Edit
//     adds drag handles, Move up / down, Connect / loop…, Remove, Undo and Redo; Add tool and My tools are always there;
//   the active tool: a design node opens its design tools (tools/ToolPanel.tsx), a check its settings here and its
//     results in the right panel, so the model stays in view.
// Navigation, working order and execution stay apart: opening a tool never runs anything; editing the workflow only
// changes the order of work (a loop is a route back, never a re-run); checks run with the model while Analysis is on.
// The workflow is the project's, the same as the landing page's and Overview's (lib/workflow/projectWorkflow.ts).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, FileDown, FileUp, Link2, PackagePlus, PencilLine, Plus, Redo2, Search, Trash2, Undo2, Upload, X } from '../icons'
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
import { edgeKey, insertByPhase, returnEdges, type Board, type Edge } from '../../lib/workflowGraph'
import { designNode, isDesignNode } from '../../lib/workflow/designNodes'
import { NODE_CONTROLS, PHASE_NAME, PHASE_STEP, STEP_PHASE, designOf, homePhase, phasePortion, usePhaseTools } from '../../lib/workflow/phaseTools'
import { addNode, connect, disconnect, moveNode, removeNode, runOrder, useProjectWorkflow, wouldLoop } from '../../lib/workflow/projectWorkflow'
import { useInfo, type Info } from './WorkflowOverview'
import { ExportDrawer, ImportDrawer } from './PhasePorting'
import { AddConfirm } from './AddConfirm'

export type Portion = ReturnType<typeof phasePortion>
const TILE = 28
/** The return arcs' margin: 12 px, and 8 px more for each nested loop. */
const G0 = 12, LEVEL = 8
const BUILT = BUILT_NODES.map((n) => n.id)

export default function PhasePanel() {
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
  const inFlow = portion.nodes.includes(design)
  // The phase's own design tool always leads the list, in the workflow or not yet (it joins at the first edit).
  const rows = useMemo(() => (inFlow ? portion.nodes : [design, ...portion.nodes]), [inFlow, portion.nodes, design])
  const picked = usePhaseTools((s) => s.active[phase])
  const active = picked && rows.includes(picked) ? picked : design
  const open = (id: string) => {
    usePhaseTools.getState().setActive(phase, id)
    if (!isDesignNode(id)) useStore.getState().selectNode(id)
  }
  const [drawer, setDrawer] = useState<'import' | 'export' | null>(null)
  useEffect(() => setDrawer(null), [phase])
  const head = 'flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <aside aria-label="Design tools" data-testid="phase-panel" data-phase={phase} className="glass-edge panel-slide flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-2xl bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[phase].accent }} />
        <h2 className="text-section font-semibold text-ink">{PHASE_NAME[phase]}</h2>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setDrawer(drawer === 'import' ? null : 'import')} aria-expanded={drawer === 'import'} data-testid="phase-import" title={`Bring a ${PHASE_NAME[phase]} package, a project file or a model in`} className={head}><FileUp size={13} aria-hidden />Import</button>
          <button type="button" onClick={() => setDrawer(drawer === 'export' ? null : 'export')} aria-expanded={drawer === 'export'} data-testid="phase-export" title={`Save the ${PHASE_NAME[phase]} tools and settings, the project, or the model for other software`} className={head}><FileDown size={13} aria-hidden />Export</button>
          <HidePanelButton side="left" />
        </span>
      </div>
      {drawer === 'export' && <ExportDrawer phase={phase} portion={portion} onClose={() => setDrawer(null)} />}
      {drawer === 'import' && <ImportDrawer phase={phase} home={home} onClose={() => setDrawer(null)} />}
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <PhaseWorkflow phase={phase} rows={rows} design={design} portion={portion} active={active} open={open} info={info} home={home} />
        <ActiveTool key={active} id={active} phase={phase} info={info} />
      </div>
    </aside>
  )
}

/** The phase's part of the workflow, top to bottom, with its editing. */
function PhaseWorkflow({ phase, rows, design, portion, active, open, info, home }: {
  phase: PhaseId; rows: string[]; design: string; portion: Portion; active: string; open: (id: string) => void
  info: (id: string) => Info; home: (id: string) => PhaseId
}) {
  const w = useProjectWorkflow()
  const board = w.wf
  const collapsed = usePhaseTools((s) => s.collapsed)
  const [edit, setEdit] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [adding, setAdding] = useState(false)
  useEffect(() => { setSel(null); setConnecting(false); setAdding(false) }, [phase])
  useEffect(() => { if (!edit) { setSel(null); setConnecting(false) } }, [edit])

  const back = useMemo(() => returnEdges(board.edges), [board.edges])
  const isRet = (e: Edge) => back.has(edgeKey(e))
  const at = (id: string) => rows.indexOf(id)
  // The phase's design node joins the workflow the first time the phase's own workflow is edited.
  const ensure = (b: Board): Board => (b.nodes.includes(design) ? b : insertByPhase(b, design))
  const commit = (next: Board, note: string) => w.commit(next, note)
  const name = (id: string) => (id === 'enter' ? 'the end' : info(id).name)
  const where = (id: string) => { const p = home(id); return p === phase ? info(id).name : `${PHASE_NAME[p]} / ${info(id).name}` }

  // Loops inside the phase, nested by span: each takes the first free level of the margin.
  const loops = useMemo(() => {
    const ls = portion.internal.filter((e) => back.has(edgeKey(e))).map((e) => ({ e, a: rows.indexOf(e.a), b: rows.indexOf(e.b) })).filter((l) => l.a >= 0 && l.b >= 0)
      .sort((x, y) => Math.abs(x.a - x.b) - Math.abs(y.a - y.b))
    const taken: { lo: number; hi: number; level: number }[] = []
    return ls.map((l) => {
      const lo = Math.min(l.a, l.b), hi = Math.max(l.a, l.b)
      let level = 0
      while (taken.some((t) => t.level === level && !(t.hi < lo || t.lo > hi))) level++
      taken.push({ lo, hi, level })
      return { ...l, level }
    })
  }, [portion, rows, back])
  const levels = loops.reduce((m, l) => Math.max(m, l.level + 1), 0)
  const G = G0 + levels * LEVEL
  const tileX = G + 26 // the margin, the 16 px handle slot, the 4 px gap and the row's 6 px padding

  // Each row's top and height (rows grow when they show links or the edit actions), for the lines and the drop point.
  const list = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Record<string, { top: number; h: number }>>({})
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const g: Record<string, { top: number; h: number }> = {}
    el.querySelectorAll<HTMLElement>('[data-phase-node]').forEach((li) => { g[li.dataset.phaseNode!] = { top: li.offsetTop, h: li.offsetHeight } })
    setGeo((old) => (JSON.stringify(old) === JSON.stringify(g) ? old : g))
  })

  const moveTo = (id: string, t: number) => {
    const i = at(id)
    if (i < 0 || t === i || t === i + 1 || t < 0 || t > rows.length) return
    const b = ensure(board)
    const target = t < rows.length ? rows[t] : rows[rows.length - 1]
    commit(t < rows.length ? moveNode(b, id, target, 'before') : moveNode(b, id, target, 'after'),
      t < rows.length ? `${info(id).name} moved before ${info(target).name}` : `${info(id).name} moved to the end of ${PHASE_NAME[phase]}`)
  }
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null)
  const dropAt = (clientY: number) => {
    const el = list.current!
    const y = clientY - el.getBoundingClientRect().top
    const t = rows.findIndex((id) => { const g = geo[id]; return g ? y < g.top + g.h / 2 : false })
    return t < 0 ? rows.length : t
  }
  const gripKey = (id: string, e: RKeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(id, at(id) - 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(id, at(id) + 2) }
  }

  const add = (id: string) => {
    const b = ensure(board)
    const after = sel && b.nodes.includes(sel) ? sel : [...rows].reverse().find((x) => b.nodes.includes(x)) ?? design
    usePhaseTools.getState().place(id, phase)
    commit(addNode(b, id, after), `${info(id).name} added to ${PHASE_NAME[phase]}${isDesignNode(id) ? '' : '; its check is on'}`)
    setAdding(false)
    open(id)
  }

  // Links to other phases: the way in and out at the ends of the list, return paths on their rows.
  const cross = portion.crossing.map((c) => ({ ...c, ret: isRet(c.edge) }))
  const ins = cross.filter((c) => !c.out && !c.ret), outs = cross.filter((c) => c.out && !c.ret)
  const goTo = (id: string) => {
    const p = home(id)
    goToStep(PHASE_STEP[p])
    usePhaseTools.getState().setActive(p, id)
    if (!isDesignNode(id)) useStore.getState().selectNode(id)
  }
  const unlink = (e: Edge, note: string) => commit(disconnect(board, edgeKey(e)), note)

  const chip = 'inline-flex max-w-full items-center gap-1 truncate rounded-full border border-line bg-panel px-2 py-0.5 text-meta text-ink outline-none hover:border-boundary focus-visible:ring-2 focus-visible:ring-accent'
  const xBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-full p-0.5 text-muted outline-none hover:text-error focus-visible:ring-2 focus-visible:ring-accent"><X size={11} aria-hidden /></button>
  )
  const summary = rows.map((id) => info(id).word).join(' › ')

  return (
    <section aria-label={`${PHASE_NAME[phase]} workflow`} data-testid="phase-workflow" data-editing={edit ? '' : undefined} className="pb-2">
      <div className="flex items-center gap-1 px-3 pt-2">
        <button type="button" onClick={() => usePhaseTools.getState().setCollapsed(!collapsed)} aria-expanded={!collapsed} data-testid="phase-collapse"
          className="flex items-center gap-1 rounded text-meta font-semibold text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
          {collapsed ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}Workflow
        </button>
        {(() => { const words = `${rows.length} tool${rows.length === 1 ? '' : 's'}${loops.length ? `, ${loops.length} return path${loops.length > 1 ? 's' : ''}` : ''}`; return (
          <span className="truncate whitespace-nowrap text-meta text-muted" title={words} data-testid="phase-count"><span aria-hidden>· {rows.length}{loops.length ? ` · ↻ ${loops.length}` : ''}</span><span className="sr-only">{words}</span></span>
        ) })()}
        <Help label={`About the ${PHASE_NAME[phase]} workflow`}>
          The {PHASE_NAME[phase]} tools in the order you work through them: click one to open its controls below (a check's results open on the right). Edit to change the order (drag the handle, or use Move up / down or the arrow keys on the handle), connect tools, make a return path to an earlier tool, or remove one; Undo takes any change back. A return path is a route for revisiting work: it never reruns anything on its own. Tools from other phases show as links, like "Return to Form / Massing". The same workflow is on the start page and in Overview.
        </Help>
        <span className="ml-auto flex items-center gap-1">
          {edit && <button type="button" onClick={w.undo} disabled={!w.past.length} aria-label="Undo the last workflow change" title="Undo" data-testid="phase-undo" className="rounded-lg bg-panel p-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Undo2 size={14} aria-hidden /></button>}
          {edit && <button type="button" onClick={w.redo} disabled={!w.future.length} aria-label="Redo" title="Redo" className="rounded-lg bg-panel p-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Redo2 size={14} aria-hidden /></button>}
          {edit
            ? <button type="button" onClick={() => setEdit(false)} data-testid="phase-done" className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-meta text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={13} aria-hidden />Done</button>
            : <button type="button" onClick={() => { setEdit(true); usePhaseTools.getState().setCollapsed(false) }} data-testid="phase-edit" title="Change the order, connections and return paths"
                className="flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><PencilLine size={13} aria-hidden />Edit</button>}
        </span>
      </div>

      {collapsed
        ? <button type="button" onClick={() => usePhaseTools.getState().setCollapsed(false)} className="mx-3 mt-1 block max-w-[calc(100%-1.5rem)] truncate rounded px-1 text-left text-meta text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent" title="Show the workflow">{summary}{loops.length ? ' ↻' : ''}</button>
        : (
          <>
            {ins.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 px-3 pt-1.5" style={{ paddingLeft: tileX - 2 }} data-testid="phase-from">
                {ins.map((c) => (
                  <span key={edgeKey(c.edge)} className="inline-flex items-center">
                    <button type="button" onClick={() => goTo(c.other)} className={chip} title={`Comes from ${where(c.other)}: open it`}><ArrowDown size={11} aria-hidden />From {c.other === 'start' ? 'the start' : where(c.other)}</button>
                    {edit && xBtn(`Remove the connection from ${where(c.other)}`, () => unlink(c.edge, 'Connection removed'))}
                  </span>
                ))}
              </div>
            )}
            <div ref={list} className="relative mt-1">
            <ol aria-label={`${PHASE_NAME[phase]} tools, in working order`} data-testid="phase-rows">
              {rows.map((id, i) => {
                const n = info(id), isActive = active === id, picked = edit && sel === id
                const inBoard = board.nodes.includes(id)
                const mine = board.edges.filter((e) => e.a === id)
                const branches = mine.filter((e) => !isRet(e) && rows.includes(e.b) && e.b !== rows[i + 1])
                const loopsOut = mine.filter((e) => isRet(e) && rows.includes(e.b))
                const retOut = cross.filter((c) => c.ret && c.out && c.inside === id)
                const retIn = cross.filter((c) => c.ret && !c.out && c.inside === id)
                const kind = isDesignNode(id) ? 'Design tool' : id.startsWith('community.') ? 'Custom tool' : 'Check'
                return (
                  <li key={id} data-phase-node={id} className="relative">
                    <div className="flex items-start gap-1 pr-2" style={{ paddingLeft: G }}>
                      <span className="mt-[13px] flex w-4 shrink-0 justify-center">
                        {edit && (
                          <button type="button" aria-label={`Move ${n.name}: drag, or press the up and down arrow keys`} title="Drag to reorder (or use the arrow keys)" data-grip={id}
                            onKeyDown={(e) => gripKey(id, e)}
                            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); setDrag({ id, to: i }) }}
                            onPointerMove={(e) => { if (drag?.id === id) setDrag({ id, to: dropAt(e.clientY) }) }}
                            onPointerUp={() => { if (drag) { const d = drag; setDrag(null); moveTo(d.id, d.to) } }}
                            onPointerCancel={() => setDrag(null)}
                            className="flex h-5 w-4 cursor-grab touch-none items-center justify-center rounded text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing">
                            <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden fill="currentColor">{[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.3" />, <circle key={`b${y}`} cx="6" cy={y} r="1.3" />])}</svg>
                          </button>
                        )}
                      </span>
                      <button type="button" data-node={id} aria-current={isActive ? 'true' : undefined}
                        aria-label={`${n.name}${edit ? ': choose to edit' : isDesignNode(id) ? ': open its tools' : ': open its settings and results'}${isActive ? ' (open)' : ''}`}
                        onClick={() => { if (edit) { setSel(picked ? null : id); setConnecting(false) } else open(id) }}
                        className={`node-hit flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'bg-selected' : 'hover:bg-subtle'} ${picked ? 'outline-2 outline-dashed outline-ink' : ''} ${drag?.id === id ? 'opacity-50' : ''}`}>
                        <NodeTile id={id} size={TILE} art={<NodeArtwork id={id} size={Math.round(TILE * 0.9)} category={n.category} />} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-control leading-tight ${isActive ? 'font-semibold text-accent-hover' : 'font-medium text-ink'}`}>{n.name}</span>
                          <span className="block truncate text-meta text-muted">{kind}{!inBoard ? ' · joins the workflow when you edit it' : ''}</span>
                        </span>
                      </button>
                    </div>
                    {(branches.length + loopsOut.length + retOut.length + retIn.length) > 0 && (
                      <div className="flex flex-wrap gap-1 pb-1 pr-2" style={{ paddingLeft: tileX + TILE + 8 }}>
                        {branches.map((e) => <span key={edgeKey(e)} className="inline-flex items-center"><button type="button" onClick={() => open(e.b)} className={chip} title="A branch: this tool also leads to another">⑂ Also to {info(e.b).name}</button>{edit && xBtn(`Remove the connection to ${info(e.b).name}`, () => unlink(e, 'Connection removed'))}</span>)}
                        {loopsOut.map((e) => <span key={edgeKey(e)} className="inline-flex items-center" data-return={edgeKey(e)}><button type="button" onClick={() => open(e.b)} className={chip} title="A return path: after this tool, go back and revise">↻ Return to {info(e.b).name}</button>{edit && xBtn(`Remove the return path to ${info(e.b).name}`, () => unlink(e, `Return path removed: ${n.name} no longer returns to ${info(e.b).name}`))}</span>)}
                        {retOut.map((c) => <span key={edgeKey(c.edge)} className="inline-flex items-center" data-return={edgeKey(c.edge)}><button type="button" onClick={() => goTo(c.other)} className={chip} title={`A return path to ${PHASE_NAME[home(c.other)]}: open it`}>↻ Return to {where(c.other)}</button>{edit && xBtn(`Remove the return path to ${where(c.other)}`, () => unlink(c.edge, 'Return path removed'))}</span>)}
                        {retIn.map((c) => <span key={edgeKey(c.edge)} className="inline-flex items-center" data-return={edgeKey(c.edge)}><button type="button" onClick={() => goTo(c.other)} className={chip} title={`${where(c.other)} returns here for revision`}>↻ Back here from {where(c.other)}</button>{edit && xBtn(`Remove the return path from ${where(c.other)}`, () => unlink(c.edge, 'Return path removed'))}</span>)}
                      </div>
                    )}
                    {picked && (
                      <div role="group" aria-label={`Edit ${n.name}`} data-testid="phase-node-actions" className="mb-1 mr-2 flex flex-wrap items-center gap-1 rounded-lg bg-subtle px-2 py-1 text-meta" style={{ marginLeft: tileX - 4 }}>
                        <button type="button" disabled={i === 0} onClick={() => moveTo(id, i - 1)} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><ArrowUp size={12} aria-hidden />Move up</button>
                        <button type="button" disabled={i === rows.length - 1} onClick={() => moveTo(id, i + 2)} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><ArrowDown size={12} aria-hidden />Move down</button>
                        <button type="button" onClick={() => setConnecting((v) => !v)} aria-expanded={connecting} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent"><Link2 size={12} aria-hidden />Connect / loop…</button>
                        {inBoard && <button type="button" onClick={() => { commit(removeNode(board, id), `${n.name} taken off the workflow (its results and your model stay)`); setSel(null) }} data-testid="phase-remove" className="flex items-center gap-0.5 rounded px-1 text-error outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={12} aria-hidden />Remove</button>}
                        {connecting && <ConnectList from={id} board={ensure(board)} rows={rows} phase={phase} info={info} home={home}
                          onPick={(to) => { const b = ensure(board); commit(connect(b, id, to), wouldLoop(b, id, to) ? `Return path created: ${n.name} returns to ${name(to)}` : `Connected ${n.name} to ${name(to)}`); setConnecting(false) }} />}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
              <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible" aria-hidden>
                <defs><marker id="phase-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={UI.edge} /></marker></defs>
                {rows.slice(0, -1).map((id, i) => {
                  const a = geo[id], b = geo[rows[i + 1]]
                  if (!a || !b || !board.edges.some((e) => e.a === id && e.b === rows[i + 1] && !isRet(e))) return null
                  const x = tileX + TILE / 2
                  return <path key={id} d={`M${x},${a.top + 6 + TILE + 2} L${x},${b.top + 6 - 2}`} stroke={UI.edge} strokeWidth={1.3} fill="none" markerEnd="url(#phase-arrow)" data-wire={`${id}>${rows[i + 1]}`} />
                })}
                {loops.map((l) => {
                  const a = geo[l.e.a], b = geo[l.e.b]
                  if (!a || !b) return null
                  const y1 = a.top + 6 + TILE / 2, y2 = b.top + 6 + TILE / 2, x0 = tileX - 2, xl = G - 8 - l.level * LEVEL, hot = edit && (sel === l.e.a || sel === l.e.b)
                  return <path key={edgeKey(l.e)} data-loop={edgeKey(l.e)} d={`M${x0},${y1} H${xl + 4} Q${xl},${y1} ${xl},${y1 - 4} V${y2 + 4} Q${xl},${y2} ${xl + 4},${y2} H${x0}`}
                    stroke={hot ? UI.accent : UI.edge} strokeWidth={hot ? 2 : 1.3} strokeDasharray="4 3" fill="none" markerEnd="url(#phase-arrow)" />
                })}
              </svg>
              {drag && (() => {
                const t = drag.to, g = t < rows.length ? geo[rows[t]] : geo[rows[rows.length - 1]]
                const y = g ? (t < rows.length ? g.top : g.top + g.h) : 0
                return <span aria-hidden className="absolute right-2 z-[2] h-0.5 rounded-full bg-accent" style={{ left: tileX - 4, top: y - 1 }} />
              })()}
            </div>
            {outs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 px-3 pt-1" style={{ paddingLeft: tileX - 2 }} data-testid="phase-to">
                {outs.map((c) => (
                  <span key={edgeKey(c.edge)} className="inline-flex items-center">
                    <button type="button" onClick={() => goTo(c.other)} className={chip} title={`Then ${where(c.other)}: open it`}><ArrowDown size={11} aria-hidden />Then {where(c.other)}</button>
                    {edit && xBtn(`Remove the connection to ${where(c.other)}`, () => unlink(c.edge, 'Connection removed'))}
                  </span>
                ))}
              </div>
            )}
            <div className="px-3 pt-1.5" style={{ paddingLeft: tileX - 2 }}>
              <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} data-testid="phase-add"
                className="flex items-center gap-1 rounded-lg border border-dashed border-line px-2 py-1 text-meta text-ink outline-none hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"><Plus size={13} aria-hidden />Add tool</button>
            </div>
            {adding && <AddTool phase={phase} board={board} info={info} home={home} after={sel && rows.includes(sel) ? info(sel).name : info(rows[rows.length - 1]).name} onAdd={add} onClose={() => setAdding(false)} />}
            {edit && w.note && <p role="status" className="px-3 pt-1.5 text-meta text-muted" data-testid="phase-note">{w.note}{w.past.length ? ' · Undo is above' : ''}</p>}
          </>
        )}
    </section>
  )
}

/** Connect / loop…: every other tool in the workflow (this phase first) and the end; an earlier one makes a return path. */
function ConnectList({ from, board, rows, phase, info, home, onPick }: {
  from: string; board: Board; rows: string[]; phase: PhaseId; info: (id: string) => Info; home: (id: string) => PhaseId; onPick: (to: string) => void
}) {
  const others = runOrder(board).filter((id) => id !== from && !rows.includes(id))
  const here = rows.filter((id) => id !== from)
  const has = (to: string) => board.edges.some((e) => e.a === from && e.b === to)
  const item = (to: string, label: string) => {
    const loop = wouldLoop(board, from, to)
    return (
      <li key={to}><button type="button" data-connect={to} disabled={has(to)} onClick={() => onPick(to)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-meta text-ink outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {has(to) ? <span className="text-muted">connected</span> : loop ? <span className="text-accent-hover">↻ return path</span> : null}
      </button></li>
    )
  }
  return (
    <div className="basis-full" data-testid="phase-connect-list">
      <p className="px-1.5 pt-1 text-meta text-muted">Connect {info(from).name} to (an earlier tool makes a return path):</p>
      <ul className="max-h-48 overflow-y-auto">
        {here.map((id) => item(id, info(id).name))}
        {others.map((id) => item(id, `${PHASE_NAME[home(id)]} / ${info(id).name}`))}
        {item('enter', 'The end of the workflow')}
      </ul>
      <span className="sr-only">{PHASE_NAME[phase]}</span>
    </div>
  )
}

/** Add tool: this phase's tools first, the other phases' on request, and My tools (custom tools with what they declare). */
function AddTool({ phase, board, info, home, after, onAdd, onClose }: {
  phase: PhaseId; board: Board; info: (id: string) => Info; home: (id: string) => PhaseId; after: string; onAdd: (id: string) => void; onClose: () => void
}) {
  const packages = useCommunityStore((s) => s.packages)
  const openDialog = useCommunityStore((s) => s.openDialog)
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
function ActiveTool({ id, phase, info }: { id: string; phase: PhaseId; info: (id: string) => Info }) {
  const n = info(id), d = designNode(id)
  const on = useStore((s) => !!s.enabled[id])
  const analysis = useStore((s) => s.analysis)
  const right = usePanels((s) => s.right)
  const pkg = useCommunityStore((s) => s.packages.find((p) => p.id === id))
  const controls = NODE_CONTROLS[id]
  const showResults = () => { useStore.getState().selectNode(id); if (!right) togglePanel('right') }
  const state = d ? d.about : !on ? 'Switched off: add it to the workflow or switch it on in the Library' : analysis ? 'Runs with the model; its results are on the right' : 'Analysis is off: its results wait until you switch it on'
  return (
    <section aria-label={`${n.name}: controls`} data-testid="phase-active" data-active={id} className="border-t border-line">
      <div className="flex items-center gap-2 px-3 py-2">
        <NodeTile id={id} size={24} art={<NodeArtwork id={id} size={21} category={n.category} />} />
        <span className="min-w-0 flex-1">
          <h3 className="truncate text-control font-semibold text-ink">{n.name}</h3>
          <span className="block truncate text-meta text-muted" title={state}>{state}</span>
        </span>
        {!d && <button type="button" onClick={showResults} data-testid="phase-results" className="shrink-0 rounded-lg bg-panel px-2 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Results</button>}
      </div>
      {d ? (phase === 'present' ? <Filmstrip tone="light" /> : <ToolPanel embedded />)
        : controls ? <ToolPanel embedded only={controls} />
          : pkg ? <div className="px-3 pb-3"><ToolFacts pkg={pkg} /></div>
            : <p className="px-3 pb-3 text-meta text-muted">This check has no settings of its own here: it reads the model and the site. Its results and evidence are in the right panel.</p>}
    </section>
  )
}
