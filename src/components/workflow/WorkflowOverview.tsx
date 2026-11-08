// The whole-project workflow, along the bottom of the workspace (Ruijie, 8 Nov: "you should still have the overview
// workflow underneath with option to expand and rearrange the node order, which will be reflected on the corresponding
// workflow panels on the left"). One strip, three states:
//   Compact   one slim row: every tool in order with its phase dot, the open tool in blue, the current phase's tools
//             underlined in its colour, ↻ on a tool that returns to an earlier one.
//   Expanded  opens upward (the model stays in view): the main line, branches on a second row, return paths arcing
//             above; Fit to see it all. It edits directly (Ruijie, 8 Nov: "when you click on Expand … you can drag and
//             click and add new nodes"): drag a tool to a gap to reorder it; the row under it lists every tool not
//             in the workflow, to drag into a gap or click; every add asks first (AddConfirm.tsx), reordering doesn't.
//   Edit      insertion points to drag a tool to, connection handles, Add node, Move before / after, Connect to…,
//             Remove, Reconnect, the assistant's proposals, Undo / Redo, Save as preset, Done.
// It is the same project workflow as the phase panels on the left (PhasePanel.tsx) and the start page
// (lib/workflow/projectWorkflow.ts): a tool moved here moves there at once, and the other way round. Each keeps its own
// layout (this one: lib/workflow/dockLayout.ts). Outside Edit a tool opens in its phase (a design node its tools, a
// check its settings and results); nothing is switched on or off and nothing runs. Nothing here touches the model.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Expand, Link2, PencilLine, Play, Plus, Redo2, Save, Search, Sparkles, Trash2, Undo2, Workflow, X } from '../icons'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import Help from '../Help'
import { BUILT_NODES, type Category } from '../../data/registry'
import { nodeWord } from '../../data/nodeWords'
import { useCommunityStore } from '../../lib/communityStore'
import { PHASE_COLOR, UI } from '../../lib/design/tokens'
import { phaseOfNode, type PhaseId } from '../../lib/phases'
import { goToStep, useStep } from '../../lib/step'
import { useIntro } from '../../lib/intro'
import { useStore } from '../../store'
import { edgeKey, insertAfter, linear, type Board } from '../../lib/workflowGraph'
import { DESIGN_NODES, designForStep, designNode } from '../../lib/workflow/designNodes'
import { homePhase, PHASE_IDS, PHASE_NAME, PHASE_STEP, STEP_PHASE, usePhaseTools } from '../../lib/workflow/phaseTools'
import { AddConfirm } from './AddConfirm'
import { dockLayout } from '../../lib/workflow/dockLayout'
import { addNode, connect, disconnect, edgeDiff, moveNode, removeNode, runOrder, useProjectWorkflow, wouldLoop } from '../../lib/workflow/projectWorkflow'
import { saveMyPreset } from '../../lib/workflow/myPresets'
import { interpret } from '../../lib/agent/workflowAssistant'

const COL = 96, ROW = 74, TILE = 40, SMALL = 30
const BUILT = new Map(BUILT_NODES.map((n) => [n.id, n]))
const CAT_PHASE: Partial<Record<Category, PhaseId>> = { SITE: 'site', DATA: 'site', CLIM: 'form', ECOL: 'form', PROG: 'program', PUBL: 'program', MOBI: 'program', STRC: 'schematic', SYST: 'schematic', SPAC: 'schematic', ENER: 'schematic', CULT: 'present', PRES: 'present' }

export interface Info { id: string; name: string; word: string; phase: PhaseId; design: boolean; category?: Category }
export function useInfo() {
  const packages = useCommunityStore((s) => s.packages)
  return useMemo(() => {
    const pk = new Map(packages.map((p) => [p.id, p]))
    return (id: string): Info => {
      const d = designNode(id)
      if (d) return { id, name: d.name, word: d.word, phase: d.phase, design: true }
      const n = BUILT.get(id)
      if (n) return { id, name: n.name, word: nodeWord(n), phase: phaseOfNode(id)?.id ?? 'site', design: false, category: n.category }
      const p = pk.get(id)
      if (p) return { id, name: p.name, word: p.name.split(/[\s:&,(]+/)[0] ?? p.name, phase: CAT_PHASE[p.category] ?? 'site', design: false, category: p.category }
      return { id, name: id, word: id, phase: 'site', design: false }
    }
  }, [packages])
}

export default function WorkflowDock() {
  const w = useProjectWorkflow()
  const { selectedNode, selectNode } = useStore(useShallow((s) => ({ selectedNode: s.selectedNode, selectNode: s.selectNode })))
  const step = useStep((s) => s.step)
  const phase = STEP_PHASE[step]
  const activeHere = usePhaseTools((s) => s.active[phase])
  usePhaseTools((s) => s.placed) // a tool moved to another phase re-renders the strip
  const info = useInfo()
  const [fit, setFit] = useState(false)

  // The workflow is the landing page's too: read it when the workspace opens and whenever the landing page closes.
  useEffect(() => {
    w.load()
    return useIntro.subscribe((s, p) => { if (p.show && !s.show) useProjectWorkflow.getState().load() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const board: Board = w.proposal ?? w.wf
  const order = useMemo(() => runOrder(board), [board])
  // The current tool: the one open in the phase panel, else the phase's design node, else the check shown on the right.
  const current = useMemo(() => {
    if (activeHere && board.nodes.includes(activeHere)) return activeHere
    const d = designForStep(step)?.id
    if (d && board.nodes.includes(d)) return d
    if (selectedNode && board.nodes.includes(selectedNode)) return selectedNode
    return null
  }, [activeHere, step, selectedNode, board])

  // Outside Edit, a tool opens where it lives: its phase, then its tools (a design node) or its results (a check).
  const open = (id: string) => {
    const d = designNode(id)
    const ph = d?.phase ?? homeOf(id)
    goToStep(PHASE_STEP[ph])
    usePhaseTools.getState().setActive(ph, id)
    if (!d) selectNode(id)
  }
  const expanded = w.mode !== 'compact'
  const btn = 'flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <section aria-label="Whole workflow" data-testid="workflow-dock" data-mode={w.mode}
      className="glass-edge relative flex shrink-0 flex-col rounded-xl bg-panel" onKeyDown={(e) => { if (e.key === 'Escape' && expanded) { e.stopPropagation(); w.setMode(w.mode === 'edit' ? 'overview' : 'compact') } }}>
      {expanded && <Expanded info={info} order={order} board={board} current={current} open={open} fit={fit} setFit={setFit} />}
      <div className="flex h-14 items-center gap-2 px-2">
        <span className="flex shrink-0 items-center gap-1 text-meta text-muted" title="Every phase's tools, in the order you work through them">
          <Workflow size={14} aria-hidden /><span className="hidden xl:inline">Whole workflow</span>
        </span>
        {expanded ? <span className="min-w-0 flex-1" /> : <CompactRow info={info} order={order} board={board} current={current} phase={phase} editing={w.editing} onPick={open}
          onMark={(k) => { w.setMode('overview'); w.setEdge(k) }} />}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!expanded
            ? <button type="button" onClick={() => w.setMode('overview')} aria-expanded={false} data-testid="dock-overview" title="Expand: the whole workflow" className={btn}><ChevronUp size={15} aria-hidden />Expand</button>
            : <button type="button" onClick={() => w.setMode('compact')} aria-expanded data-testid="dock-collapse" title="Collapse to one row (Esc)" className={btn}><ChevronDown size={15} aria-hidden />Collapse</button>}
          {w.mode !== 'edit'
            ? <button type="button" onClick={() => w.setMode('edit')} data-testid="dock-edit" title="Rearrange the tools, change connections and return paths" className={btn}><PencilLine size={15} aria-hidden />Edit</button>
            : <button type="button" onClick={() => w.setMode('overview')} data-testid="dock-done"
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={15} aria-hidden />Done</button>}
        </div>
      </div>
    </section>
  )
}

/** The compact row: every tool small with its short word; the open tool in blue; the current phase underlined. */
function CompactRow({ info, order, board, current, phase, editing, onPick, onMark }: {
  info: (id: string) => Info; order: string[]; board: Board; current: string | null; phase: PhaseId; editing: string | null
  onPick: (id: string) => void; onMark: (edgeKey: string) => void
}) {
  const row = useRef<HTMLOListElement>(null)
  const layout = useMemo(() => dockLayout(board), [board])
  useEffect(() => {
    if (!current) return
    row.current?.querySelector<HTMLElement>(`[data-dock-id="${CSS.escape(current)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])
  if (!order.length) return <p className="min-w-0 flex-1 text-meta text-muted">No workflow yet: add tools in a phase panel (Add tool), open Edit here, or choose one on the start page.</p>
  return (
    <ol ref={row} aria-label="Workflow steps, in order" className="flex min-w-0 flex-1 items-center overflow-x-auto py-1" style={{ scrollbarWidth: 'thin' }} data-testid="dock-row">
      {order.map((id, i) => {
        const n = info(id), ph = designNode(id)?.phase ?? homeOf(id), here = ph === phase
        const returns = layout.edges.filter((e) => e.kind === 'return' && e.a === id), branch = layout.at.get(id)?.row === 1
        const cur = current === id
        return (
          <li key={id} className="flex shrink-0 items-center" data-phase={ph}>
            {i > 0 && <span aria-hidden className="mx-0.5 flex items-center text-muted"><span className="block h-px w-2.5 bg-current" /><ArrowRight size={11} /></span>}
            <span className="relative flex flex-col items-center">
              <button type="button" onClick={() => onPick(id)} data-node={id} data-dock-id={id} data-selected={cur ? '' : undefined} data-current={cur ? '' : undefined}
                aria-current={cur ? 'step' : undefined} aria-label={`${n.name}, ${PHASE_NAME[ph]}${n.design ? ': open its tools' : ': open its settings and results'}${cur ? ' (open)' : ''}`}
                title={`${PHASE_NAME[ph]} / ${n.name}`}
                className={`node-hit flex w-[5.5rem] flex-col items-center gap-0.5 rounded-lg px-0.5 py-0.5 outline-none ${cur ? 'bg-selected' : 'hover:bg-subtle'} ${editing === id ? 'outline-2 outline-dashed outline-ink' : ''}`}>
                <NodeTile id={id} size={SMALL - 4} art={<NodeArtwork id={id} size={Math.round((SMALL - 4) * 0.9)} category={n.category} />} />
                <span className={`flex max-w-full items-center gap-1 truncate text-meta leading-tight ${cur ? 'font-semibold text-accent-hover' : 'text-ink'}`}>
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[ph].accent }} />{n.word}
                </span>
              </button>
              {here && <span aria-hidden className="absolute inset-x-2 -bottom-1 h-[3px] rounded-full" style={{ background: PHASE_COLOR[ph].accent }} />}
              {returns.length > 0 && (
                <button type="button" onClick={() => onMark(returns[0].key)} data-loop-mark={returns[0].key}
                  aria-label={`Return path from ${n.name} to ${info(returns[0].b).name}: show it`} title={`Returns to ${info(returns[0].b).name}`}
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-line bg-panel px-0.5 text-meta leading-none text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">↻{returns.length > 1 ? returns.length : ''}</button>
              )}
              {branch && <span aria-label="On a branch" title="On a branch: expand to see it" className="absolute -left-1 -top-1 rounded-full border border-line bg-panel px-1 text-meta leading-none text-muted">⑂</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** A node's phase in the workspace: where it was put, else its home. */
export function homeOf(id: string): PhaseId {
  const placed = usePhaseTools.getState().placed[id]
  if (placed) return placed
  const cat = useCommunityStore.getState().packages.find((p) => p.id === id)?.category
  return homePhase(id, () => cat)
}

/** Overview and Edit: the whole workflow, laid out on its own aligned grid. */
function Expanded({ info, order, board, current, open, fit, setFit }: {
  info: (id: string) => Info; order: string[]; board: Board; current: string | null; open: (id: string) => void; fit: boolean; setFit: (v: boolean) => void
}) {
  const w = useProjectWorkflow()
  const edit = w.mode === 'edit'
  const layout = useMemo(() => dockLayout(board), [board])
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(1200)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el); setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const top = 18 + layout.levels * 16
  const W = layout.cols * COL, H = top + layout.rows * ROW + 6
  // Fit: the whole workflow in the panel width, never smaller than labels can be read at; then it scrolls.
  const scale = fit ? Math.max(0.62, Math.min(1, avail / W)) : 1
  const pos = (id: string) => { const p = layout.at.get(id); return p ? { x: p.col * COL + COL / 2, y: top + p.row * ROW + TILE / 2 + 4 } : null }

  // ---- edit interactions: drag to an insertion point, draw a connection from a handle, reconnect a selected one
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; gap: number | null } | null>(null)
  const [link, setLink] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null)
  const [reconnect, setReconnect] = useState<string | null>(null)
  const press = useRef<{ id: string; x: number; y: number } | null>(null)
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: (e.clientX - r.left + box.current!.scrollLeft) / scale, y: (e.clientY - r.top + box.current!.scrollTop) / scale } }
  const gapAt = (x: number) => Math.max(1, Math.min(layout.cols - 1, Math.round(x / COL)))
  const nodeAt = (e: { clientX: number; clientY: number }) => (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-dock-node]')?.dataset.dockNode ?? null
  const before = (gap: number) => [...layout.at.entries()].find(([, p]) => p.col === gap)?.[0] ?? 'enter'

  // ---- adding from the tray: drag a tool into a gap, or click it; either way it waits for a confirmation
  const [pending, setPending] = useState<{ id: string; after: string } | null>(null)
  const [newDrag, setNewDrag] = useState<{ id: string; x: number; y: number; gap: number | null } | null>(null)
  const prevOf = (gap: number) => [...layout.at.entries()].find(([, p]) => p.col === gap - 1)?.[0] ?? 'start'
  const inBox = (e: { clientX: number; clientY: number }) => { const r = box.current?.getBoundingClientRect(); return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }
  const fallbackAfter = () => { const ed0 = w.editing && board.nodes.includes(w.editing) ? w.editing : null; return ed0 ?? (current && board.nodes.includes(current) ? current : order[order.length - 1] ?? 'start') }
  const startNew = (id: string, e: RPointerEvent) => {
    if (e.button !== 0) return
    const sx = e.clientX, sy = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      moved = true
      setNewDrag({ id, x: ev.clientX, y: ev.clientY, gap: inBox(ev) ? gapAt(local(ev).x) : null })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setNewDrag(null)
      if (!moved) setPending({ id, after: fallbackAfter() }) // a click
      else if (inBox(ev)) setPending({ id, after: prevOf(gapAt(local(ev).x)) })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const confirmAdd = () => {
    if (!pending) return
    const { id, after } = pending, b = w.wf
    const next = after === 'start' ? insertAfter({ nodes: b.nodes, edges: b.edges.length ? b.edges : linear([]) }, id, 'start') : addNode(b, id, after)
    // it shows in the phase panel of the tool it follows (its own phase when it goes first)
    usePhaseTools.getState().place(id, after === 'start' ? homeOf(id) : designNode(after)?.phase ?? homeOf(after))
    w.commit(next, `${info(id).name} added after ${after === 'start' ? 'the start' : info(after).name}${designNode(id) ? '' : '; its check is on'}`)
    setPending(null)
  }
  const pendingGap = pending ? (pending.after === 'start' ? 1 : (layout.at.get(pending.after)?.col ?? layout.cols - 2) + 1) : null
  const showGap = drag?.gap ?? newDrag?.gap ?? null

  const onNodeDown = (id: string, e: RPointerEvent) => { if (!link) { press.current = { id, ...local(e) }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) } }
  const onMove = (e: RPointerEvent) => {
    const p = local(e)
    if (link) { setLink({ ...link, x: p.x, y: p.y, over: nodeAt(e) }); return }
    const s = press.current
    if (s && (drag || Math.hypot(p.x - s.x, p.y - s.y) > 6)) setDrag({ id: s.id, x: p.x, y: p.y, gap: gapAt(p.x) })
  }
  const onUp = (e: RPointerEvent) => {
    // a connection being dragged from a handle ends here; one started from "Connect to…" waits for a click
    if (link && link.x > 0) {
      const to = nodeAt(e)
      if (to && to !== link.from && to !== 'start') w.commit(connect(board, link.from, to), wouldLoop(board, link.from, to) ? `Loop created: ${info(link.from).name} returns to ${info(to).name}` : `Connected ${info(link.from).name} to ${to === 'enter' ? 'the end' : info(to).name}`)
      setLink(null); return
    }
    const s = press.current; press.current = null
    if (drag && s) {
      const t = drag.gap != null ? before(drag.gap) : null
      if (t && t !== s.id) {
        const next = t === 'enter' ? moveNode(board, s.id, order[order.length - 1] === s.id ? order[order.length - 2] : order[order.length - 1], 'after') : moveNode(board, s.id, t, 'before')
        w.commit(next, `${info(s.id).name} moved ${t === 'enter' ? 'to the end' : `before ${info(t).name}`}`)
      }
      setDrag(null); return
    }
    if (s) pick(s.id)
  }
  const pick = (id: string) => {
    if (!edit) { open(id); return }
    if (link) {
      if (id !== link.from && id !== 'start') w.commit(connect(board, link.from, id), wouldLoop(board, link.from, id) ? `Loop created: ${info(link.from).name} returns to ${info(id).name}` : `Connected ${info(link.from).name} to ${id === 'enter' ? 'the end' : info(id).name}`)
      setLink(null); return
    }
    if (reconnect) {
      const e = board.edges.find((x) => edgeKey(x) === reconnect)
      if (e && id !== e.a) w.commit(connect(disconnect(board, reconnect), e.a, id), `Reconnected: ${info(e.a).name} now goes to ${info(id).name}`)
      setReconnect(null); return
    }
    w.setEditing(id) // a second click keeps it picked; Escape or a click on empty space lets go
  }
  // what the drop would make: the wire into the dragged node and the one out of it
  const dropPreview = drag && drag.gap != null ? (() => { const t = before(drag.gap), prev = [...layout.at.entries()].find(([, p]) => p.col === drag.gap! - 1)?.[0] ?? 'start'; return { prev: prev === drag.id ? null : prev, next: t === drag.id ? null : t } })() : null

  const sel = w.edge ? layout.edges.find((e) => e.key === w.edge) ?? null : null
  const ed = w.editing && board.nodes.includes(w.editing) ? w.editing : null
  const idx = ed ? order.indexOf(ed) : -1
  const changed = w.proposal ? edgeDiff(w.wf.edges, w.proposal.edges) : null
  const addedNodes = w.proposal ? w.proposal.nodes.filter((x) => !w.wf.nodes.includes(x)) : []

  return (
    <div className="border-b border-line" data-testid="dock-expanded">
      {/* the bar: what is selected and what can be done with it */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-control">
        <h2 className="text-control font-semibold text-ink">{edit ? 'Edit workflow' : 'Whole workflow'}</h2>
        <Help label="About the workflow">The order you work in, the same workflow as on the start page and in the phase panels on the left: a change here shows there at once. Click a tool to open it; drag it to a gap to move it. To add a tool, drag it from the row under the workflow into a gap, or click it: you confirm before it is added, and you can change where it goes. Edit adds more: Move before / after, connect tools (back to an earlier one makes a return path), remove one, Undo and Redo, the assistant, Save as preset. A return path is a route for revisiting work: it never reruns anything on its own. Taking a tool off never deletes your model or its results.</Help>
        {!edit && !ed && !sel && <span className="text-meta text-muted" data-testid="dock-hint">Drag a tool to move it · drag one up from the row below, or click it, to add it</span>}
        {sel && (
          <span className="flex items-center gap-1.5 rounded-lg bg-selected px-2 py-0.5 text-meta text-accent-hover" data-testid="dock-edge">
            {sel.kind === 'return' ? <><span aria-hidden>↻</span>Return to {info(sel.b).name}<span className="text-muted"> · from {info(sel.a).name}</span></> : <>{sel.a === 'start' ? 'Start' : info(sel.a).name} → {sel.b === 'enter' ? 'End' : info(sel.b).name}</>}
            {edit && <button type="button" onClick={() => { setReconnect(sel.key) }} className="rounded px-1 font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">Reconnect</button>}
            {edit && <button type="button" onClick={() => { w.commit(disconnect(board, sel.key), sel.kind === 'return' ? `Loop removed: ${info(sel.a).name} no longer returns to ${info(sel.b).name}` : 'Connection removed'); w.setEdge(null) }} data-testid="dock-edge-remove" className="flex items-center gap-0.5 rounded px-1 font-semibold text-error outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={12} aria-hidden />Remove connection</button>}
            <button type="button" onClick={() => w.setEdge(null)} aria-label="Clear the selected connection" className="rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={12} aria-hidden /></button>
          </span>
        )}
        {reconnect && <span className="text-meta text-accent-hover" role="status">Choose the node it should go to.</span>}
        {edit && ed && (
          <span className="flex flex-wrap items-center gap-1 rounded-lg bg-subtle px-2 py-0.5 text-meta" data-testid="dock-node-actions">
            <span className="font-semibold text-ink">{info(ed).name}</span>
            <button type="button" disabled={idx <= 0} onClick={() => w.commit(moveNode(board, ed, order[idx - 1], 'before'), `${info(ed).name} moved before ${info(order[idx - 1]).name}`)} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><ArrowLeft size={12} aria-hidden />Move before</button>
            <button type="button" disabled={idx < 0 || idx >= order.length - 1} onClick={() => w.commit(moveNode(board, ed, order[idx + 1], 'after'), `${info(ed).name} moved after ${info(order[idx + 1]).name}`)} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">Move after<ArrowRight size={12} aria-hidden /></button>
            <button type="button" onClick={() => setLink({ from: ed, x: 0, y: 0, over: null })} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent"><Link2 size={12} aria-hidden />Connect to…</button>
            <button type="button" onClick={() => { w.commit(removeNode(board, ed), `${info(ed).name} taken off the workflow (its results and your model stay)`); w.setEditing(null) }} data-testid="dock-remove" className="flex items-center gap-0.5 rounded px-1 text-error outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={12} aria-hidden />Remove from workflow</button>
          </span>
        )}
        {link && !link.x && <span className="text-meta text-accent-hover" role="status">Choose a node to connect to; an earlier one creates a loop.</span>}
        <div className="ml-auto flex items-center gap-1">
          {<button type="button" onClick={w.undo} disabled={!w.past.length} aria-label="Undo the last workflow change" title="Undo" className="rounded-lg bg-panel p-1.5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Undo2 size={15} aria-hidden /></button>}
          {<button type="button" onClick={w.redo} disabled={!w.future.length} aria-label="Redo" title="Redo" className="rounded-lg bg-panel p-1.5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Redo2 size={15} aria-hidden /></button>}
          {edit && <SaveAsPreset board={board} />}
          <button type="button" onClick={() => setFit(!fit)} aria-pressed={fit} title="Fit the whole workflow in view" className={`flex items-center gap-1 rounded-lg px-2 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${fit ? 'bg-ink' : 'bg-panel text-ink'}`}><Expand size={13} aria-hidden />Fit</button>
        </div>
      </div>
      {edit && <AskAssistant board={w.wf} focus={ed ?? current} />}
      {w.proposal && changed && (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-ai-line bg-ai-surface px-3 py-1.5 text-meta" data-testid="dock-proposal">
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-semibold text-ai ring-1 ring-ai-line"><Sparkles size={12} aria-hidden />AI suggestion</span>
          <span className="text-ink">{[addedNodes.length ? `adds ${addedNodes.length} node${addedNodes.length > 1 ? 's' : ''}` : '', w.wf.nodes.filter((x) => !w.proposal!.nodes.includes(x)).length ? `takes off ${w.wf.nodes.filter((x) => !w.proposal!.nodes.includes(x)).length}` : '', changed.added.length + changed.removed.length ? `changes ${changed.added.length + changed.removed.length} connection${changed.added.length + changed.removed.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') || 'no change'}; shown below in cyan.</span>
          <button type="button" onClick={() => w.applyProposal('Assistant’s change applied')} data-testid="dock-apply" className="ml-auto flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={13} aria-hidden />Apply</button>
          <button type="button" onClick={() => w.preview(null)} data-testid="dock-discard" className="flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden />Discard</button>
        </div>
      )}
      {pending && (
        <AddConfirm info={info(pending.id)} onConfirm={confirmAdd} onCancel={() => setPending(null)} className="mx-3 mt-2"
          placement={<>
            <label htmlFor="add-after" className="mr-1">Goes after</label>
            <select id="add-after" value={pending.after} onChange={(e) => setPending({ ...pending, after: e.target.value })} data-testid="add-after"
              className="rounded border border-line bg-panel px-1 py-0.5 text-meta text-ink">
              <option value="start">the start</option>
              {order.map((x) => <option key={x} value={x}>{PHASE_NAME[designNode(x)?.phase ?? homeOf(x)]} / {info(x).name}</option>)}
            </select>
            <span className="ml-1 text-muted">· shows in the {PHASE_NAME[pending.after === 'start' ? homeOf(pending.id) : designNode(pending.after)?.phase ?? homeOf(pending.after)]} panel</span>
          </>} />
      )}
      {/* the workflow itself; the tools to add are in the row under it */}
      <div ref={box} className="relative mx-2 mb-1 mt-1 max-h-[min(16rem,30vh)] overflow-auto" style={{ scrollbarWidth: 'thin' }}
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (drag) setDrag(null) }} data-testid="dock-canvas"
        onClick={(e) => { if (edit && e.target === e.currentTarget) { w.setEditing(null); setLink(null); setReconnect(null) } }}>
        <div className="relative origin-top-left" style={{ width: W * scale, height: H * scale }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            <svg width={W} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
              <defs>
                {[['edge', UI.edge], ['active', UI.accent], ['ai', UI.ai]].map(([k, c]) => <marker key={k} id={`dock-arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>)}
              </defs>
              {layout.edges.map((e) => {
                const A = pos(e.a), B = pos(e.b)
                if (!A || !B) return null
                const active = w.edge === e.key, ai = !!changed?.added.some((x) => edgeKey(x) === e.key)
                const col = active ? UI.accent : ai ? UI.ai : UI.edge
                const mk = active ? 'active' : ai ? 'ai' : 'edge'
                let d: string
                if (e.kind === 'return') { const h = 10 + e.level * 16, y0 = A.y - TILE / 2 - 3; d = `M${A.x},${y0} C${A.x},${y0 - h} ${B.x},${y0 - h} ${B.x},${B.y - TILE / 2 - 3}` }
                else if (A.y === B.y) d = `M${A.x + TILE / 2 + 4},${A.y} L${B.x - TILE / 2 - 5},${B.y}`
                else { const mx = A.x + COL / 2; d = `M${A.x + TILE / 2 + 4},${A.y} L${mx},${A.y} L${mx},${B.y} L${B.x - TILE / 2 - 5},${B.y}` }
                return (
                  <g key={e.key}>
                    <path d={d} fill="none" stroke={col} strokeWidth={active ? 2.2 : 1.3} strokeDasharray={e.kind === 'return' ? '5 4' : undefined} markerEnd={`url(#dock-arrow-${mk})`} />
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} data-dock-edge={e.key}
                      onClick={() => w.setEdge(active ? null : e.key)} />
                  </g>
                )
              })}
              {dropPreview && <g>{dropPreview.prev && (() => { const A = pos(dropPreview.prev!), x = drag!.gap! * COL; return A ? <path d={`M${A.x + TILE / 2},${A.y} L${x},${top + TILE / 2 + 4}`} stroke={UI.accent} strokeDasharray="4 3" fill="none" /> : null })()}
                {dropPreview.next && (() => { const B = pos(dropPreview.next!), x = drag!.gap! * COL; return B ? <path d={`M${x},${top + TILE / 2 + 4} L${B.x - TILE / 2},${B.y}`} stroke={UI.accent} strokeDasharray="4 3" fill="none" markerEnd="url(#dock-arrow-active)" /> : null })()}</g>}
              {link && link.x > 0 && (() => { const A = pos(link.from); return A ? <path d={`M${A.x},${A.y} L${link.x},${link.y}`} stroke={UI.accent} strokeWidth={1.5} strokeDasharray="6 5" fill="none" /> : null })()}
            </svg>
            {/* insertion points while dragging */}
            {(drag || newDrag) && Array.from({ length: layout.cols - 1 }, (_, k) => k + 1).map((g) => (
              <span key={g} aria-hidden data-gap={g} className={`absolute w-1 rounded-full ${showGap === g ? 'bg-accent' : 'bg-accent/20'}`} style={{ left: g * COL - 2, top: top - 2, height: TILE + 10 }} />
            ))}
            {pendingGap != null && !newDrag && <span aria-hidden data-pending-gap={pendingGap} className="absolute w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" style={{ left: pendingGap * COL - 3, top: top - 4, height: TILE + 14 }} />}
            {/* the two ends */}
            {(['start', 'enter'] as const).map((id) => { const p = pos(id)!; return (
              <span key={id} data-dock-node={id} className="absolute flex flex-col items-center gap-0.5" style={{ left: p.x - TILE / 2, top: p.y - TILE / 2 }}>
                <span className="flex items-center justify-center rounded-full border border-line bg-white text-muted" style={{ width: TILE, height: TILE }}>{id === 'start' ? <Play size={15} aria-hidden /> : <ArrowRight size={15} aria-hidden />}</span>
                <span className="text-meta text-muted">{id === 'start' ? 'Start' : 'End'}</span>
              </span>) })}
            {/* the nodes */}
            {[...layout.at.keys()].filter((id) => id !== 'start' && id !== 'enter').map((id) => {
              const p = pos(id)!, n = info(id), cur = current === id, ending = sel && (sel.a === id || sel.b === id), ai = addedNodes.includes(id)
              const target = link && link.over === id && link.from !== id
              return (
                <span key={id} className="group absolute" style={{ left: p.x - COL / 2 + 6, top: p.y - TILE / 2 - 2, width: COL - 12 }}>
                  <button type="button" data-dock-node={id} data-node={id} data-current={cur ? '' : undefined} data-selected={cur || ending ? '' : undefined}
                    aria-current={cur ? 'step' : undefined} aria-label={`${n.name}${edit ? ', edit' : n.design ? ': open its tool' : ': show its results'}${cur ? ' (current step)' : ''}`}
                    onPointerDown={(e) => onNodeDown(id, e)} onClick={(e) => { if (e.detail === 0) pick(id) }}
                    className={`node-hit flex w-full touch-none flex-col items-center gap-0.5 rounded-lg py-0.5 outline-none ${cur ? 'bg-selected' : ''} ${w.editing === id ? 'outline-2 outline-dashed outline-ink' : ''} ${ai ? 'outline-2 outline-ai' : ''} ${drag?.id === id ? 'opacity-40' : ''} cursor-grab`}>
                    <NodeTile id={id} size={TILE} art={<NodeArtwork id={id} size={Math.round(TILE * 0.9)} category={n.category} />} />
                    <span className={`flex max-w-full items-center gap-1 truncate text-meta leading-tight ${cur ? 'font-semibold text-accent-hover' : 'text-ink'}`}>
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[n.phase].accent }} />{n.word}
                    </span>
                  </button>
                  {/* the connection handle: on hover, focus or selection, in Edit */}
                  {edit && (
                    <span role="button" tabIndex={0} aria-label={`Connect ${n.name} to another node`} title="Connect nodes. Connect back to create a loop."
                      onPointerDown={(e) => { e.stopPropagation(); const q = local(e); setLink({ from: id, x: q.x, y: q.y, over: null }) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLink({ from: id, x: 0, y: 0, over: null }) } }}
                      className={`absolute right-1 top-3 h-3.5 w-3.5 cursor-crosshair rounded-full border-2 border-white bg-accent shadow outline-none focus-visible:ring-2 focus-visible:ring-accent ${w.editing === id ? 'block' : 'hidden group-hover:block group-focus-within:block'}`} />
                  )}
                  {target && <span role="status" className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 text-meta text-white">{wouldLoop(board, link!.from, id) ? '↻ Create loop' : 'Connect'}</span>}
                  {link && !link.x && link.from !== id && (
                    <button type="button" onClick={() => { w.commit(connect(board, link.from, id), wouldLoop(board, link.from, id) ? `Loop created: ${info(link.from).name} returns to ${n.name}` : `Connected ${info(link.from).name} to ${n.name}`); setLink(null) }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-accent px-1.5 text-meta text-white outline-none focus-visible:ring-2 focus-visible:ring-accent">{wouldLoop(board, link.from, id) ? '↻ Create loop' : 'Connect'}</button>
                  )}
                </span>
              )
            })}
            {layout.unwired.length > 0 && <span className="absolute text-meta text-muted" style={{ left: (layout.at.get(layout.unwired[0])!.col) * COL + 6, top: top + ROW + TILE + 24 }}>Not connected yet</span>}
          </div>
        </div>
      </div>
      <AddTray info={info} board={board} onStart={startNew} onKey={(id) => setPending({ id, after: fallbackAfter() })} dragging={newDrag?.id ?? null} />
      {newDrag && (
        <span aria-hidden className="pointer-events-none fixed z-[70] flex items-center gap-1.5 rounded-lg border border-accent/50 bg-panel px-2 py-1 text-meta text-ink shadow-float" style={{ left: newDrag.x + 10, top: newDrag.y + 10 }}>
          <NodeTile id={newDrag.id} size={22} art={<NodeArtwork id={newDrag.id} size={20} category={info(newDrag.id).category} />} />{info(newDrag.id).name}
        </span>
      )}
      {w.note && <p role="status" className="px-3 pb-1.5 text-meta text-muted">{w.note}{w.past.length > 0 ? ' · Undo is above' : ''}</p>}
    </div>
  )
}

/**
 * The tools not in the workflow, in one slim row under it (so the model keeps its room): a phase's tools at a time, the
 * current phase first; a search looks through every phase. Drag one up into a gap of the workflow, or click it (or press
 * Enter): either way a confirmation follows.
 */
function AddTray({ info, board, onStart, onKey, dragging }: {
  info: (id: string) => Info; board: Board; onStart: (id: string, e: RPointerEvent) => void; onKey: (id: string) => void; dragging: string | null
}) {
  const packages = useCommunityStore((s) => s.packages)
  const phase = STEP_PHASE[useStep((s) => s.step)]
  const [q, setQ] = useState('')
  const [shown, setShown] = useState<PhaseId>(phase)
  useEffect(() => setShown(phase), [phase])
  const free = useMemo(() => [...DESIGN_NODES.map((d) => d.id), ...BUILT_NODES.map((n) => n.id), ...packages.map((p) => p.id)].filter((id) => !board.nodes.includes(id)), [board.nodes, packages])
  const phaseOfId = (id: string) => designNode(id)?.phase ?? homeOf(id)
  const query = q.trim().toLowerCase()
  const list = query ? free.filter((id) => { const n = info(id); return `${n.name} ${n.word}`.toLowerCase().includes(query) }) : free.filter((id) => phaseOfId(id) === shown)
  const count = (p: PhaseId) => free.filter((id) => phaseOfId(id) === p).length
  return (
    <section aria-label="Tools to add" data-testid="dock-tray" className="mx-2 mb-1 rounded-lg border border-line bg-canvas px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-meta font-semibold text-ink">Add tools</h3>
        <span className="text-meta text-muted">Drag one up into the workflow, or click it</span>
        <div role="tablist" aria-label="Tools of which phase" className="flex flex-wrap gap-0.5">
          {[phase, ...PHASE_IDS.filter((p) => p !== phase)].map((p) => (
            <button key={p} type="button" role="tab" aria-selected={!query && shown === p} onClick={() => { setShown(p); setQ('') }} data-tray-phase={p}
              className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${!query && shown === p ? 'bg-ink' : 'text-muted hover:text-ink'}`}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_COLOR[p].accent }} />{PHASE_NAME[p]}<span className="tabular-nums">{count(p)}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex w-48 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-0.5"><Search size={13} className="text-muted" aria-hidden /><span className="sr-only">Search every tool to add</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every tool" className="min-w-0 flex-1 bg-transparent text-meta outline-none" data-testid="dock-tray-search" /></label>
      </div>
      <ul className="mt-1 flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'thin' }} aria-label={query ? 'Matching tools' : `${PHASE_NAME[shown]} tools not in the workflow`}>
        {list.map((id) => { const n = info(id); return (
          <li key={id} className="shrink-0"><button type="button" data-tray={id} title={`${PHASE_NAME[phaseOfId(id)]} / ${n.name}: drag into the workflow, or click to add`}
            onPointerDown={(e) => onStart(id, e)} onClick={(e) => { if (e.detail === 0) onKey(id) }}
            className={`flex max-w-[13rem] cursor-grab touch-none items-center gap-1.5 rounded-lg border border-line bg-panel px-1.5 py-1 text-left text-meta text-ink outline-none hover:border-boundary focus-visible:ring-2 focus-visible:ring-accent ${dragging === id ? 'opacity-40' : ''}`}>
            <NodeTile id={id} size={22} art={<NodeArtwork id={id} size={20} category={n.category} />} />
            <span className="min-w-0 truncate">{n.name}</span>
            <Plus size={12} className="shrink-0 text-muted" aria-hidden />
          </button></li>) })}
        {!list.length && <li className="px-1 py-1 text-meta text-muted">{query ? 'No tool with that name.' : `Every ${PHASE_NAME[shown]} tool is in the workflow.`}</li>}
      </ul>
    </section>
  )
}

/** Save as preset: a named copy for reuse; the library preset it started from is never changed. */
export function SaveAsPreset({ board }: { board: Board }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [done, setDone] = useState<string | null>(null)
  if (!open) return <button type="button" onClick={() => { setOpen(true); setDone(null) }} className="flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent" title="Keep a copy of this workflow to start from again; the library preset stays as it is"><Save size={14} aria-hidden />{done ? 'Saved' : 'Save as preset'}</button>
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const p = saveMyPreset(name, board.nodes, board.edges); setDone(p.name); setOpen(false); setName(''); useStore.setState({ announce: `Saved as preset: ${p.name}` }) }}>
      <label className="sr-only" htmlFor="dock-preset-name">Preset name</label>
      <input id="dock-preset-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" className="w-36 rounded-lg border border-line bg-white px-2 py-1 text-control outline-none" />
      <button type="submit" className="rounded-lg bg-accent px-2.5 py-1 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Save</button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="rounded p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button>
    </form>
  )
}

/** The workflow assistant inside the editor: its proposal is previewed in the dock, then applied or discarded. */
export function AskAssistant({ board, focus }: { board: Board; focus: string | null }) {
  const w = useProjectWorkflow()
  const [text, setText] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const ask = () => {
    const s = text.trim()
    if (!s) return
    const r = interpret(s, board, null, focus)
    if (r.kind === 'proposal') { w.preview(r.board); setReply(null) }
    else if (r.kind === 'clarify') { w.preview(null); setReply(r.question) }
    else { w.preview(null); setReply(`${r.name}: ${r.question}`) }
  }
  return (
    <form className="mx-3 mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask() }} data-testid="dock-ask">
      <Sparkles size={14} className="text-ai" aria-hidden />
      <label htmlFor="dock-ask-input" className="sr-only">Ask the workflow assistant to change this workflow</label>
      <input id="dock-ask-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask the assistant, e.g. add a sunlight study after massing, with a loop back to massing"
        className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 py-1 text-control outline-none" />
      <button type="submit" disabled={!text.trim()} className="rounded-lg bg-panel px-2.5 py-1 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">Suggest</button>
      {reply && <p className="basis-full text-meta text-muted">{reply}</p>}
    </form>
  )
}
