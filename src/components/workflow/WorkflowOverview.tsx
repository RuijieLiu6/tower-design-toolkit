// The workflow editor: the whole project workflow, on demand, in the centre view (Ruijie, 9 Nov: "when they click on
// edit … the central viewport will turn into the workflow edit, like how the landing page was … drawers and the workflow
// streams … once the user added and fixed it, they can click enter or confirm. And then exit out to … work on each part
// of the process"). It opens from the Workflow header in the phase panel, the phase row's Overview and the bar's Edit
// workflow, over the model only: the phase panel and the results stay beside it and follow every change. It shows the
// same five phase lanes as the landing page, every tool in working order from left to right, return paths as dashed arcs.
//   Add:      drag a tool up from the shelf under the lanes: the best place lights up (after the last tool of its phase),
//             a drop anywhere else puts it there; a click puts it in the best place.
//   Connect:  hover a tool for its four connection points (as on the landing page); drag from one to another tool, or back
//             to an earlier one ("Create loop"). Click a point to choose the tool instead; select a wire to remove or
//             reconnect it.
//   Arrange:  drag a tool to a gap; click it for Open in workspace, Move before / after, Connect to…, Remove.
// Every change applies at once (Undo / Redo). Confirm workflow, Esc or Enter (the end of the lanes) returns to the design
// where you were; Discard changes puts back the workflow you opened. It edits the same project workflow as the phase panel
// and the start page (lib/workflow/projectWorkflow.ts); nothing here runs a check or touches the model.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft, ArrowRight, Check, Expand, Link2, Play, Plus, Redo2, Save, Search, Sparkles, Trash2, Undo2, X } from '../icons'
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
import { dockLayout } from '../../lib/workflow/dockLayout'
import { addNode, changedSinceOpen, connect, disconnect, discardSinceOpen, edgeDiff, moveNode, openOverview, removeNode, runOrder, useProjectWorkflow, wouldLoop } from '../../lib/workflow/projectWorkflow'
import { saveMyPreset } from '../../lib/workflow/myPresets'
import { interpret } from '../../lib/agent/workflowAssistant'

const COL = 104, LANE = 78, TILE = 40, GUT = 8
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

export default function WorkflowOverview() {
  const w = useProjectWorkflow()
  const step = useStep((s) => s.step)
  const phase = STEP_PHASE[step]
  const activeHere = usePhaseTools((s) => s.active[phase])
  usePhaseTools((s) => s.placed) // a tool moved to another phase re-renders the lanes
  const selectedNode = useStore((s) => s.selectedNode)
  const info = useInfo()
  // Full scale by default, so tool names stay readable (14 px); Fit shrinks the whole workflow into view.
  const [fit, setFit] = useState(false)
  const box = useRef<HTMLElement>(null)

  // The workflow is the landing page's too: read it when the workspace opens and whenever the landing page closes.
  useEffect(() => {
    w.load()
    return useIntro.subscribe((s, p) => { if (p.show && !s.show) useProjectWorkflow.getState().load() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = w.mode !== 'compact' && w.mode !== 'builder'
  // focus moves into the editor when it opens, and back to what opened it when it closes
  useEffect(() => {
    if (shown) box.current?.querySelector<HTMLElement>('[data-testid="overview-close"]')?.focus()
    else if (document.activeElement === document.body) document.querySelector<HTMLElement>('[data-testid="phase-edit"]')?.focus()
  }, [shown])

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

  // Open in workspace: the editor closes (changes kept) and the tool opens in its phase.
  const openTool = (id: string) => {
    openOverview('close', { keep: true })
    const d = designNode(id)
    const ph = d?.phase ?? homeOf(id)
    goToStep(PHASE_STEP[ph])
    usePhaseTools.getState().setActive(ph, id)
    if (!d) useStore.getState().selectNode(id)
  }
  if (!shown) return null
  return (
    <section ref={box} role="dialog" aria-modal="true" aria-labelledby="overview-title" data-testid="workflow-overview" data-mode={w.mode}
      className="absolute inset-0 z-40 flex flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-float"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        openOverview('close') // Esc confirms, as the Confirm button: every change is already in (Discard is the way back)
      }}>
      <Expanded info={info} order={order} board={board} current={current} phase={phase} open={openTool} fit={fit} setFit={setFit} />
    </section>
  )
}

/** A node's phase in the workspace: where it was put, else its home. */
export function homeOf(id: string): PhaseId {
  const placed = usePhaseTools.getState().placed[id]
  if (placed) return placed
  const cat = useCommunityStore.getState().packages.find((p) => p.id === id)?.category
  return homePhase(id, () => cat)
}

const SIDES = ['n', 'e', 's', 'w'] as const
/** The four connection points around a 40 px tile (the tile sits 2 px down, centred in the 92 px node). */
const HANDLE_AT: Record<(typeof SIDES)[number], { left: number; top: number }> = { n: { left: 39, top: -5 }, e: { left: 59, top: 15 }, s: { left: 39, top: 35 }, w: { left: 19, top: 15 } }

/** The editor: the whole workflow in phase lanes, the tools to add under it, and Confirm / Discard. */
function Expanded({ info, order, board, current, phase, open, fit, setFit }: {
  info: (id: string) => Info; order: string[]; board: Board; current: string | null; phase: PhaseId; open: (id: string) => void; fit: boolean; setFit: (v: boolean) => void
}) {
  const w = useProjectWorkflow()
  const layout = useMemo(() => dockLayout(board), [board])
  const box = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState(0)
  const [avail, setAvail] = useState(1200)
  const [ai, setAi] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el); setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  // Opening: the open tool scrolled into view.
  useEffect(() => {
    if (current) box.current?.querySelector<HTMLElement>(`[data-dock-node="${CSS.escape(current)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const top = 26 + layout.levels * 12
  const W = GUT + layout.cols * COL, H = top + PHASE_IDS.length * LANE
  // Fit: the whole workflow in the view's width, never smaller than labels can be read at; then it scrolls.
  const scale = fit ? Math.max(0.62, Math.min(1, avail / W)) : 1
  const phaseOfId = (id: string): PhaseId => designNode(id)?.phase ?? homeOf(id)
  // Each tool in its phase's lane (where it was put, else its home); Start and Enter beside the first and last tool.
  const laneOf = (id: string): number => {
    if (id === 'start') return order.length ? laneOf(order[0]) : 0
    if (id === 'enter') return order.length ? laneOf(order[order.length - 1]) : PHASE_IDS.length - 1
    return PHASE_IDS.indexOf(phaseOfId(id))
  }
  const pos = (id: string) => { const p = layout.at.get(id); return p ? { x: GUT + p.col * COL + COL / 2, y: top + laneOf(id) * LANE + TILE / 2 + 6 } : null }

  // ---- pointer work: move a tool to a gap, draw a connection from one of its four points, reconnect a selected one
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; gap: number | null } | null>(null)
  const [link, setLink] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null)
  const linkFrom = useRef<{ x: number; y: number } | null>(null)
  const [reconnect, setReconnect] = useState<string | null>(null)
  const press = useRef<{ id: string; x: number; y: number } | null>(null)
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: (e.clientX - r.left + box.current!.scrollLeft) / scale, y: (e.clientY - r.top + box.current!.scrollTop) / scale } }
  const gapAt = (x: number) => Math.max(1, Math.min(layout.cols - 1, Math.round((x - GUT) / COL)))
  const laneAt = (y: number): PhaseId => PHASE_IDS[Math.max(0, Math.min(PHASE_IDS.length - 1, Math.floor((y - top + 6) / LANE)))]
  const nodeAt = (e: { clientX: number; clientY: number }) => (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-dock-node]')?.dataset.dockNode ?? null
  const before = (gap: number) => [...layout.at.entries()].find(([, p]) => p.col === gap)?.[0] ?? 'enter'
  const prevOf = (gap: number) => [...layout.at.entries()].find(([, p]) => p.col === gap - 1)?.[0] ?? 'start'
  const inBox = (e: { clientX: number; clientY: number }) => { const r = box.current?.getBoundingClientRect(); return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }
  const connectTo = (from: string, to: string) => {
    if (to === from || to === 'start') return
    w.commit(connect(board, from, to), wouldLoop(board, from, to) ? `Loop created: ${info(from).name} returns to ${info(to).name}` : `Connected ${info(from).name} to ${to === 'enter' ? 'the end' : info(to).name}`)
  }

  // ---- adding from the shelf (Ruijie, 9 Nov: "drag the nodes out from the bottom and then it will … indicate where is
  // the ideal place to put it"): the best place is right after the last tool of the tool's own phase (or of an earlier
  // phase), in its own lane. It lights up as soon as a drag starts; a drop anywhere in the lanes puts the tool there,
  // and a click puts it in the best place. The editor's Confirm (or Discard) settles every change at the end.
  const idealAfter = (id: string): string => {
    const p = PHASE_IDS.indexOf(phaseOfId(id))
    let after = 'start'
    for (const x of order) if (PHASE_IDS.indexOf(phaseOfId(x)) <= p) after = x
    return after
  }
  const gapAfter = (after: string) => (after === 'start' ? 1 : (layout.at.get(after)?.col ?? layout.cols - 2) + 1)
  const [newDrag, setNewDrag] = useState<{ id: string; x: number; y: number; gap: number | null; lane: PhaseId | null } | null>(null)
  const addAt = (id: string, after: string, ph: PhaseId) => {
    const b = w.wf
    const next = after === 'start' ? insertAfter({ nodes: b.nodes, edges: b.edges.length ? b.edges : linear([]) }, id, 'start') : addNode(b, id, after)
    usePhaseTools.getState().place(id, designNode(id)?.phase ?? ph)
    w.commit(next, `${info(id).name} added to ${PHASE_NAME[designNode(id)?.phase ?? ph]} after ${after === 'start' ? 'the start' : info(after).name}${designNode(id) ? '' : '; its check is on'}`)
    w.setEditing(id) // picked: its connection points show, ready to wire it elsewhere
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-dock-node="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }
  const startNew = (id: string, e: RPointerEvent) => {
    if (e.button !== 0) return
    const sx = e.clientX, sy = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      moved = true
      const inside = inBox(ev), q = local(ev)
      setNewDrag({ id, x: ev.clientX, y: ev.clientY, gap: inside ? gapAt(q.x) : null, lane: inside ? laneAt(q.y) : null })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setNewDrag(null)
      if (!moved) { addAt(id, idealAfter(id), phaseOfId(id)); return } // a click: the best place
      if (inBox(ev)) { const q = local(ev); addAt(id, prevOf(gapAt(q.x)), laneAt(q.y)) } // a drop: where it was put
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const dragging = newDrag?.id ?? null
  useEffect(() => { if (dragging) box.current?.querySelector<HTMLElement>('[data-ideal-slot]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [dragging])
  const showGap = drag?.gap ?? newDrag?.gap ?? null

  const onNodeDown = (id: string, e: RPointerEvent) => { if (!link) { press.current = { id, ...local(e) }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) } }
  const onMove = (e: RPointerEvent) => {
    const p = local(e)
    if (link && linkFrom.current) { setLink({ ...link, x: p.x, y: p.y, over: nodeAt(e) }); return }
    const s = press.current
    if (s && (drag || Math.hypot(p.x - s.x, p.y - s.y) > 6)) setDrag({ id: s.id, x: p.x, y: p.y, gap: gapAt(p.x) })
  }
  const onUp = (e: RPointerEvent) => {
    // a connection drawn from a connection point ends here; a click on the point (no drag) waits for a node to be chosen
    if (link && linkFrom.current) {
      const still = Math.hypot(e.clientX - linkFrom.current.x, e.clientY - linkFrom.current.y) < 5
      linkFrom.current = null
      const to = nodeAt(e)
      if (still) { setLink({ from: link.from, x: 0, y: 0, over: null }); return }
      if (to) connectTo(link.from, to)
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
    if (link) { connectTo(link.from, id); setLink(null); return }
    if (reconnect) {
      const e = board.edges.find((x) => edgeKey(x) === reconnect)
      if (e && id !== e.a) w.commit(connect(disconnect(board, reconnect), e.a, id), `Reconnected: ${info(e.a).name} now goes to ${info(id).name}`)
      setReconnect(null); return
    }
    w.setEditing(w.editing === id ? null : id)
  }
  const startLink = (id: string, e: RPointerEvent) => {
    e.stopPropagation(); e.preventDefault()
    linkFrom.current = { x: e.clientX, y: e.clientY }
    const q = local(e)
    setLink({ from: id, x: q.x, y: q.y, over: null })
  }
  // what the drop would make: the wire into the dragged node and the one out of it
  const dropPreview = drag && drag.gap != null ? (() => { const t = before(drag.gap), prev = prevOf(drag.gap); return { prev: prev === drag.id ? null : prev, next: t === drag.id ? null : t } })() : null

  const sel = w.edge ? layout.edges.find((e) => e.key === w.edge) ?? null : null
  const ed = w.editing && board.nodes.includes(w.editing) ? w.editing : null
  const idx = ed ? order.indexOf(ed) : -1
  const changed = w.proposal ? edgeDiff(w.wf.edges, w.proposal.edges) : null
  const addedNodes = w.proposal ? w.proposal.nodes.filter((x) => !w.wf.nodes.includes(x)) : []
  const dirty = changedSinceOpen()
  const btn = 'flex h-8 items-center gap-1 rounded-lg bg-panel px-2.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="dock-expanded">
      {/* the bar: the title, then Undo / Redo, Fit, presets, the AI suggestion, and the way out (Confirm or Discard) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-control">
        <h2 id="overview-title" className="text-section font-semibold text-ink">Edit the project workflow</h2>
        <Help label="About the workflow editor">The order you work in, the same workflow as on the start page and in the phase panel on the left: every change shows there at once. To add a tool, drag it up from the shelf under the lanes: the best place lights up (after the last tool of its phase), and you can drop it anywhere else. Clicking a shelf tool puts it in the best place. Hover a tool to see its four connection points: drag from one to another tool to connect them, or back to an earlier tool to create a loop (a route for revisiting work: it never reruns anything on its own). Drag a tool to a gap to move it; click it for Move, Open and Remove. Confirm workflow (or Esc, or Enter at the end of the lanes) takes you back to the design with the new workflow; Discard changes puts back the workflow you opened. Taking a tool off never deletes your model or its results.</Help>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button type="button" onClick={w.undo} disabled={!w.past.length} aria-label="Undo the last workflow change" title="Undo" className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Undo2 size={15} aria-hidden /></button>
          <button type="button" onClick={w.redo} disabled={!w.future.length} aria-label="Redo" title="Redo" className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Redo2 size={15} aria-hidden /></button>
          <button type="button" onClick={() => setFit(!fit)} aria-pressed={fit} title="Fit the whole workflow in view" className={`${btn} ${fit ? 'bg-selected text-accent-hover' : ''}`}><Expand size={14} aria-hidden />Fit</button>
          <SaveAsPreset board={board} />
          <button type="button" onClick={() => setAi(!ai)} aria-expanded={ai} data-testid="dock-ask-toggle" title="Describe a change in words; the suggestion is shown on the lanes before anything changes"
            className={`${btn} ${ai ? 'bg-ai-surface text-ai' : ''}`}><Sparkles size={14} aria-hidden />Suggest</button>
          {dirty && <button type="button" onClick={() => { discardSinceOpen(); openOverview('close') }} data-testid="overview-discard" title="Put back the workflow you had when you opened the editor, and return to the design"
            className={`${btn} text-error`}><X size={14} aria-hidden />Discard changes</button>}
          <button type="button" onClick={() => openOverview('close')} data-testid="overview-close" title={dirty ? 'Keep these changes and go back to the design (Esc)' : 'Back to the design, where you were (Esc)'}
            className="flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={14} aria-hidden />{dirty ? 'Confirm workflow' : 'Return to design'}</button>
        </div>
      </div>
      {/* what is picked, and what can be done with it */}
      {(ed || sel || reconnect || link) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-control">
          {ed && !link && (
            <span className="flex flex-wrap items-center gap-1 text-meta" data-testid="dock-node-actions">
              <span className="font-semibold text-ink">{info(ed).name}</span><span className="text-muted">{PHASE_NAME[phaseOfId(ed)]}</span>
              <button type="button" onClick={() => open(ed)} data-testid="overview-open" className="ml-1 rounded-lg bg-accent px-2 py-0.5 text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Open in workspace</button>
              <button type="button" disabled={idx <= 0} onClick={() => w.commit(moveNode(board, ed, order[idx - 1], 'before'), `${info(ed).name} moved before ${info(order[idx - 1]).name}`)} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><ArrowLeft size={12} aria-hidden />Move before</button>
              <button type="button" disabled={idx < 0 || idx >= order.length - 1} onClick={() => w.commit(moveNode(board, ed, order[idx + 1], 'after'), `${info(ed).name} moved after ${info(order[idx + 1]).name}`)} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">Move after<ArrowRight size={12} aria-hidden /></button>
              <button type="button" onClick={() => setLink({ from: ed, x: 0, y: 0, over: null })} className="flex items-center gap-0.5 rounded px-1 outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"><Link2 size={12} aria-hidden />Connect to…</button>
              <button type="button" onClick={() => { w.commit(removeNode(board, ed), `${info(ed).name} taken off the workflow (its results and your model stay)`); w.setEditing(null) }} data-testid="dock-remove" className="flex items-center gap-0.5 rounded px-1 text-error outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={12} aria-hidden />Remove</button>
            </span>
          )}
          {sel && (
            <span className="flex items-center gap-1.5 rounded-lg bg-selected px-2 py-0.5 text-meta text-accent-hover" data-testid="dock-edge">
              {sel.kind === 'return' ? <><span aria-hidden>↻</span>Return to {info(sel.b).name}<span className="text-muted"> · from {info(sel.a).name}</span></> : <>{sel.a === 'start' ? 'Start' : info(sel.a).name} → {sel.b === 'enter' ? 'End' : info(sel.b).name}</>}
              <button type="button" onClick={() => { setReconnect(sel.key) }} className="rounded px-1 font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">Reconnect</button>
              <button type="button" onClick={() => { w.commit(disconnect(board, sel.key), sel.kind === 'return' ? `Loop removed: ${info(sel.a).name} no longer returns to ${info(sel.b).name}` : 'Connection removed'); w.setEdge(null) }} data-testid="dock-edge-remove" className="flex items-center gap-0.5 rounded px-1 font-semibold text-error outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={12} aria-hidden />Remove connection</button>
              <button type="button" onClick={() => w.setEdge(null)} aria-label="Clear the selected connection" className="rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={12} aria-hidden /></button>
            </span>
          )}
          {reconnect && <span className="text-meta text-accent-hover" role="status">Choose the tool it should go to.</span>}
          {link && !linkFrom.current && <span className="flex items-center gap-2 text-meta text-accent-hover" role="status">Choose a tool to connect {info(link.from).name} to; an earlier one creates a loop.
            <button type="button" onClick={() => setLink(null)} className="rounded px-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">Cancel</button></span>}
        </div>
      )}
      {ai && <AskAssistant board={w.wf} focus={ed ?? current} />}
      {w.proposal && changed && (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-ai-line bg-ai-surface px-3 py-1.5 text-meta" data-testid="dock-proposal">
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-semibold text-ai ring-1 ring-ai-line"><Sparkles size={12} aria-hidden />AI suggestion</span>
          <span className="text-ink">{[addedNodes.length ? `adds ${addedNodes.length} node${addedNodes.length > 1 ? 's' : ''}` : '', w.wf.nodes.filter((x) => !w.proposal!.nodes.includes(x)).length ? `takes off ${w.wf.nodes.filter((x) => !w.proposal!.nodes.includes(x)).length}` : '', changed.added.length + changed.removed.length ? `changes ${changed.added.length + changed.removed.length} connection${changed.added.length + changed.removed.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') || 'no change'}; shown below in cyan.</span>
          <button type="button" onClick={() => w.applyProposal('Suggested change applied')} data-testid="dock-apply" className="ml-auto flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={13} aria-hidden />Apply</button>
          <button type="button" onClick={() => w.preview(null)} data-testid="dock-discard" className="flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden />Discard</button>
        </div>
      )}
      {/* the workflow itself, in the five phase lanes; the shelf of tools to add is under it */}
      <div className="mx-2 mb-1 mt-1 flex min-h-0 flex-1">
      <div aria-hidden className="relative w-24 shrink-0 overflow-hidden" data-testid="lane-labels">
        <div style={{ transform: `translateY(${-scrollY}px)` }}>
          {PHASE_IDS.map((ph, i) => (
            <div key={ph} data-here={ph === phase ? '' : undefined} className="absolute left-0 right-0 flex flex-col justify-center rounded-l-lg pl-2 text-control font-medium"
              style={{ top: (top + i * LANE - 4) * scale, height: (LANE - 4) * scale, color: PHASE_COLOR[ph].ink, background: ph === phase ? PHASE_COLOR[ph].surface : i % 2 ? undefined : UI.canvas }}>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[ph].accent }} />{PHASE_NAME[ph]}</span>
              {ph === phase && <span className="pl-4 text-meta font-normal">You are here</span>}
            </div>
          ))}
        </div>
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }} onScroll={(e) => setScrollY(e.currentTarget.scrollTop)}
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (drag) setDrag(null); if (link && linkFrom.current) { linkFrom.current = null; setLink(null) } }} data-testid="dock-canvas"
        onClick={(e) => { if (e.target === e.currentTarget) { w.setEditing(null); setLink(null); setReconnect(null) } }}>
        <div className="relative origin-top-left" style={{ width: W * scale, height: H * scale }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            {/* the five phase lanes, as on the landing page; the one you are in is tinted in its colour */}
            {PHASE_IDS.map((ph, i) => (
              <div key={ph} aria-hidden data-lane={ph} className="absolute left-0 rounded-r-lg" style={{ top: top + i * LANE - 4, height: LANE - 4, width: Math.max(W, avail / scale - 2), background: ph === phase ? PHASE_COLOR[ph].surface : i % 2 ? undefined : UI.canvas }} />
            ))}
            <svg width={W} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
              <defs>
                {[['edge', UI.edge], ['active', UI.accent], ['ai', UI.ai]].map(([k, c]) => <marker key={k} id={`dock-arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>)}
              </defs>
              {layout.edges.map((e) => {
                const A = pos(e.a), B = pos(e.b)
                if (!A || !B) return null
                const active = w.edge === e.key, ai2 = !!changed?.added.some((x) => edgeKey(x) === e.key)
                const col = active ? UI.accent : ai2 ? UI.ai : UI.edge
                const mk = active ? 'active' : ai2 ? 'ai' : 'edge'
                let d: string
                if (e.kind === 'return') { const h = 16 + e.level * 12, y0 = Math.min(A.y, B.y) - TILE / 2 - 3; d = `M${A.x},${A.y - TILE / 2 - 3} C${A.x},${y0 - h} ${B.x},${y0 - h} ${B.x},${B.y - TILE / 2 - 3}` }
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
              {dropPreview && <g>{dropPreview.prev && (() => { const A = pos(dropPreview.prev!), D = pos(drag!.id), x = GUT + drag!.gap! * COL; return A && D ? <path d={`M${A.x + TILE / 2},${A.y} L${x},${D.y}`} stroke={UI.accent} strokeDasharray="4 3" fill="none" /> : null })()}
                {dropPreview.next && (() => { const B = pos(dropPreview.next!), D = pos(drag!.id), x = GUT + drag!.gap! * COL; return B && D ? <path d={`M${x},${D.y} L${B.x - TILE / 2},${B.y}`} stroke={UI.accent} strokeDasharray="4 3" fill="none" markerEnd="url(#dock-arrow-active)" /> : null })()}</g>}
              {link && linkFrom.current && (() => { const A = pos(link.from); return A ? <path d={`M${A.x},${A.y} L${link.x},${link.y}`} stroke={UI.accent} strokeWidth={1.8} strokeDasharray="6 5" fill="none" markerEnd="url(#dock-arrow-active)" /> : null })()}
            </svg>
            {/* insertion points while dragging */}
            {(drag || newDrag) && Array.from({ length: layout.cols - 1 }, (_, k) => k + 1).map((g) => (
              <span key={g} aria-hidden data-gap={g} className={`absolute w-1 rounded-full ${showGap === g ? 'bg-accent' : 'bg-accent/20'}`} style={{ left: GUT + g * COL - 2, top: top - 4, height: PHASE_IDS.length * LANE - 4 }} />
            ))}
            {/* the best place for the tool being dragged from the shelf, and where it would go now */}
            {newDrag && (() => {
              const ph = phaseOfId(newDrag.id), g = gapAfter(idealAfter(newDrag.id)), lane = PHASE_IDS.indexOf(ph), here = newDrag.gap === g && newDrag.lane === ph
              return (
                <span aria-hidden data-ideal-slot={`${ph}:${g}`} className={`absolute flex justify-center rounded-lg border-2 border-dashed border-accent ${here ? 'bg-accent/15' : 'animate-pulse bg-accent/5 motion-reduce:animate-none'}`}
                  style={{ left: GUT + g * COL - 26, top: top + lane * LANE - 2, width: 52, height: LANE - 8 }}>
                  <span className="absolute -top-5 whitespace-nowrap rounded bg-accent px-1.5 text-meta text-white">Best place</span>
                </span>
              )
            })()}
            {newDrag?.lane && newDrag.gap != null && !(newDrag.gap === gapAfter(idealAfter(newDrag.id)) && newDrag.lane === phaseOfId(newDrag.id)) && (
              <span aria-hidden data-drop-slot className="absolute rounded-lg ring-2 ring-accent/60" style={{ left: GUT + newDrag.gap * COL - 26, top: top + PHASE_IDS.indexOf(newDrag.lane) * LANE - 2, width: 52, height: LANE - 8 }} />
            )}
            {/* the two ends: Start, and Enter, which takes you back to the design with this workflow (as on the landing page) */}
            {(['start', 'enter'] as const).map((id) => { const p = pos(id)!; return id === 'start' ? (
              <span key={id} data-dock-node={id} className="absolute flex flex-col items-center gap-0.5" style={{ left: p.x - TILE / 2, top: p.y - TILE / 2 }}>
                <span className="flex items-center justify-center rounded-full border border-line bg-white text-muted" style={{ width: TILE, height: TILE }}><Play size={15} aria-hidden /></span>
                <span className="text-meta text-muted">Start</span>
              </span>) : (
              <button key={id} type="button" data-dock-node={id} data-testid="overview-enter" onClick={() => { if (!link) openOverview('close') }} title={dirty ? 'Enter: confirm this workflow and go back to the design' : 'Enter: back to the design'}
                className="absolute flex flex-col items-center gap-0.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ left: p.x - TILE / 2 - 6, top: p.y - TILE / 2, width: TILE + 12 }}>
                <span className="flex items-center justify-center rounded-full bg-accent text-white shadow" style={{ width: TILE, height: TILE }}><ArrowRight size={16} aria-hidden /></span>
                <span className="text-meta font-semibold text-accent-hover">Enter</span>
              </button>) })}
            {/* the nodes */}
            {[...layout.at.keys()].filter((id) => id !== 'start' && id !== 'enter').map((id) => {
              const p = pos(id)!, n = info(id), cur = current === id, ending = sel && (sel.a === id || sel.b === id), aiNode = addedNodes.includes(id)
              const target = link && link.over === id && link.from !== id
              const valid = link && link.from !== id
              return (
                <span key={id} className="group absolute" style={{ left: p.x - COL / 2 + 6, top: p.y - TILE / 2 - 2, width: COL - 12 }}>
                  <button type="button" data-dock-node={id} data-node={id} data-current={cur ? '' : undefined} data-selected={cur || ending ? '' : undefined} data-valid={valid ? '' : undefined}
                    aria-current={cur ? 'step' : undefined} aria-pressed={w.editing === id} aria-label={`${n.name}, ${PHASE_NAME[phaseOfId(id)]}: select${cur ? ' (open in the workspace)' : ''}`}
                    onPointerDown={(e) => onNodeDown(id, e)} onClick={(e) => { if (e.detail === 0) pick(id) }}
                    onKeyDown={(e) => {
                      // the keyboard, as on the landing page: ← → move the tool along the workflow, Delete takes it off
                      const i = order.indexOf(id)
                      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); w.commit(moveNode(board, id, order[i - 1], 'before'), `${n.name} moved before ${info(order[i - 1]).name}`) }
                      else if (e.key === 'ArrowRight' && i >= 0 && i < order.length - 1) { e.preventDefault(); w.commit(moveNode(board, id, order[i + 1], 'after'), `${n.name} moved after ${info(order[i + 1]).name}`) }
                      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); w.commit(removeNode(board, id), `${n.name} taken off the workflow (its results and your model stay)`); w.setEditing(null) }
                      else return
                      requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-dock-node="${CSS.escape(id)}"]`)?.focus())
                    }}
                    aria-keyshortcuts="ArrowLeft ArrowRight Delete"
                    className={`node-hit flex w-full touch-none flex-col items-center gap-0.5 rounded-lg py-0.5 outline-none ${cur ? 'bg-selected' : ''} ${w.editing === id ? 'outline-2 outline-dashed outline-ink' : ''} ${aiNode ? 'outline-2 outline-ai' : ''} ${valid ? (target ? 'outline-2 outline-accent' : 'outline-2 outline-offset-2 outline-accent/35') : ''} ${drag?.id === id ? 'opacity-40' : ''} ${layout.unwired.includes(id) ? 'outline-1 outline-dashed outline-boundary' : ''} cursor-grab`} title={layout.unwired.includes(id) ? `${n.name}: not connected yet (drag from one of its connection points)` : n.name}>
                    <NodeTile id={id} size={TILE} art={<NodeArtwork id={id} size={Math.round(TILE * 0.9)} category={n.category} />} />
                    <span className={`block max-w-full truncate text-node ${cur ? 'font-semibold text-accent-hover' : 'text-ink'}`} title={n.name}>{n.word}</span>
                  </button>
                  {/* four connection points, on hover, focus or selection (as on the landing page): drag to another tool to connect */}
                  {!link && SIDES.map((side) => (
                    <span key={side} data-handle={side} role={side === 'e' ? 'button' : undefined} tabIndex={side === 'e' ? 0 : -1} aria-hidden={side === 'e' ? undefined : true}
                      aria-label={side === 'e' ? `Connect ${n.name} to another tool` : undefined}
                      onPointerDown={(e) => startLink(id, e)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLink({ from: id, x: 0, y: 0, over: null }) } }}
                      className={`group/h absolute z-10 h-3.5 w-3.5 cursor-crosshair items-center justify-center rounded-full border-2 border-white bg-accent shadow outline-none focus-visible:ring-2 focus-visible:ring-accent ${w.editing === id ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}
                      style={HANDLE_AT[side]}>
                      <span className="h-1 w-1 rounded-full bg-white" />
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-left shadow-float group-hover/h:block">
                        <span className="block text-meta font-semibold text-ink">Connect nodes</span><span className="block text-meta text-muted">Drag to a tool; back to an earlier one makes a loop.</span>
                      </span>
                      <span className="pointer-events-none absolute hidden border-dashed group-hover/h:block"
                        style={{ borderColor: UI.accent, ...(side === 'n' ? { bottom: '100%', left: '50%', height: 16, borderLeftWidth: 2, marginLeft: -1 } : side === 's' ? { top: '100%', left: '50%', height: 16, borderLeftWidth: 2, marginLeft: -1 } : side === 'e' ? { left: '100%', top: '50%', width: 16, borderTopWidth: 2, marginTop: -1 } : { right: '100%', top: '50%', width: 16, borderTopWidth: 2, marginTop: -1 }) }} />
                    </span>
                  ))}
                  {target && <span role="status" className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 text-meta text-white">{wouldLoop(board, link!.from, id) ? '↻ Create loop' : 'Connect'}</span>}
                  {link && !linkFrom.current && link.from !== id && (
                    <button type="button" onClick={() => { connectTo(link.from, id); setLink(null) }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-accent px-1.5 text-meta text-white outline-none focus-visible:ring-2 focus-visible:ring-accent">{wouldLoop(board, link.from, id) ? '↻ Create loop' : 'Connect'}</button>
                  )}
                </span>
              )
            })}

          </div>
        </div>
      </div>
      </div>
      <AddTray info={info} board={board} onStart={startNew} onKey={(id) => addAt(id, idealAfter(id), phaseOfId(id))} dragging={dragging} />
      {newDrag && (
        <span aria-hidden className="pointer-events-none fixed z-[70] flex items-center gap-1.5 rounded-lg border border-accent/50 bg-panel px-2 py-1 text-meta text-ink shadow-float" style={{ left: newDrag.x + 10, top: newDrag.y + 10 }}>
          <NodeTile id={newDrag.id} size={22} art={<NodeArtwork id={newDrag.id} size={20} category={info(newDrag.id).category} />} />{info(newDrag.id).name}
        </span>
      )}
      {w.note && <p role="status" className="px-3 pb-1.5 text-meta text-muted" data-testid="dock-note">{w.note}{w.past.length > 0 ? ' · Undo is above' : ''}</p>}
    </div>
  )
}

/**
 * The shelf: the tools not in the workflow, in one slim row under the lanes: a phase's tools at a time, the current phase
 * first; a search looks through every phase. Drag one up into the lanes (the best place lights up), or click it (or press
 * Enter) to put it in the best place.
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
        <span className="text-meta text-muted">Drag one up: the best place lights up. Or click to put it there.</span>
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
          <li key={id} className="shrink-0"><button type="button" data-tray={id} title={`${PHASE_NAME[phaseOfId(id)]} / ${n.name}: drag into the lanes, or click to put it in the best place`}
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
