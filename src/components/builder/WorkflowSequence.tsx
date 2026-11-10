// The centre of the workflow builder (Result A brief §3, §7): the project's actual process as a row of illustrated
// cards in working order, from Start to End, with branches under their column, return paths as dashed arcs over the row
// (and chips on their source card), and the cards Start cannot reach in a "Not connected" group. Everything drawn comes
// from sequenceModel (lib/workflow/builderModel.ts) over the one project workflow (lib/workflow/projectWorkflow.ts);
// every edit is that store's commit, with Undo and Redo. Selecting a card changes only the selection.
//   Add      the library sets a pending insertion (builderState.pending); the proposed place shows as a card here,
//            its position can be changed, and only Yes commits it (AddConfirm). A tool already in the workflow is never
//            added twice: it is selected and scrolled to instead.
//   Move     drag the card's handle to a gap (the slot under the pointer lights up and a ghost says which connections
//            change), or Move before / after in the card's menu, or Alt+← / Alt+→ on the card.
//   Remove   Delete on the card or Remove in its menu: results and the model stay; the note says Undo is there.
//   Return   "Return to…" in the menu lists the earlier steps; the return shows as an arc and a chip, removable.
// The row scrolls horizontally on its own (the app never scrolls sideways).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { ArrowRight, Play } from '../icons'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import { useCommunityStore } from '../../lib/communityStore'
import { UI } from '../../lib/design/tokens'
import { useProjectSiteArea } from '../../lib/siteArea'
import { useStore } from '../../store'
import { insertAfter, linear, walk, type Board } from '../../lib/workflowGraph'
import { addPreview, cardState, designSummary, entryFor, movePreview, previewWords, sequenceModel, type EditPreview, type ToolEntry } from '../../lib/workflow/builderModel'
import { designNode, isDesignNode } from '../../lib/workflow/designNodes'
import { PHASE_NAME, usePhaseTools } from '../../lib/workflow/phaseTools'
import { addNode, connect, disconnect, edgeDiff, moveNode, removeNode, useProjectWorkflow, wouldLoop } from '../../lib/workflow/projectWorkflow'
import { AddConfirm } from '../workflow/AddConfirm'
import { homeOf, type Info } from '../workflow/WorkflowOverview'
import { useNodeSummaries } from '../../hooks/useNodeSummaries'
import { slotAt, useBuilderUi, type Drag } from './builderState'
import { openToolInWorkspace } from './openTool'
import { arcPath, arcSpace, returnKey } from './ReturnPathControl'
import WorkflowBranchGroup, { UnwiredGroup } from './WorkflowBranchGroup'
import { CARD_WIDTH, WorkflowStepCard } from './WorkflowStepCard'

/** The forward wire between two columns is drawn through the slot at this height: the middle of the artwork area. */
const WIRE_Y = 92

// ---------- pure helpers (tested in WorkflowSequence.test.ts) ----------

/** What a drop on the slot `after` does to a card: the move the sequence commits, or null when nothing would change. */
export function movePlan(b: Board, id: string, after: string): { target: string; where: 'before' | 'after' } | null {
  if (after === id) return null
  const run = walk(b.edges)
  if (after === 'start') { const first = run[0]; return first && first !== id ? { target: first, where: 'before' } : null }
  if (!run.includes(after)) return null
  if (run[run.indexOf(after) + 1] === id) return null
  return { target: after, where: 'after' }
}

/** Add a tool at a slot: at the start, or after a card (as WorkflowOverview.addAt does; addNode alone puts null at the end). */
export function addAt(b: Board, id: string, after: string): Board {
  if (b.nodes.includes(id)) return b
  if (after === 'start') return insertAfter({ nodes: b.nodes, edges: b.edges.length ? b.edges : linear([]) }, id, 'start')
  return addNode(b, id, after)
}

/** The connections an add at a slot changes (addPreview, which knows no 'start'). */
export function addAtPreview(b: Board, id: string, after: string): EditPreview {
  if (after !== 'start') return addPreview(b, id, after)
  const next = addAt(b, id, after)
  return { ...edgeDiff(b.edges, next.edges), loopsDropped: 0, board: next }
}

/** The words under a drag: what the drop on `after` would change, or where to drop. */
export function dragWords(b: Board, d: Pick<Drag, 'kind' | 'id'>, after: string | null, name: (id: string) => string): string {
  if (!after) return 'Drop on a gap between cards'
  if (d.kind === 'add') return previewWords(addAtPreview(b, d.id, after), name)
  const plan = movePlan(b, d.id, after)
  return plan ? previewWords(movePreview(b, d.id, plan.target, plan.where), name) : 'Already here'
}

// ---------- the component ----------

export default function WorkflowSequence() {
  const wf = useProjectWorkflow((s) => s.wf)
  const commit = useProjectWorkflow((s) => s.commit)
  const note = useProjectWorkflow((s) => s.note)
  const canUndo = useProjectWorkflow((s) => s.past.length > 0)
  const packages = useCommunityStore((s) => s.packages)
  const placed = usePhaseTools((s) => s.placed)
  const project = useStore((s) => s.project)
  const towers = useStore((s) => s.towers[s.project])
  const citySite = useStore((s) => s.citySite)
  const analysis = useStore((s) => s.analysis)
  const reduced = useStore((s) => s.reducedMotion)
  const siteArea = useProjectSiteArea().area
  const summaries = useNodeSummaries()
  const selected = useBuilderUi((s) => s.selected)
  const drag = useBuilderUi((s) => s.drag)
  const pending = useBuilderUi((s) => s.pending)
  const returnFrom = useBuilderUi((s) => s.returnFrom)
  const select = useBuilderUi((s) => s.select)
  const setPending = useBuilderUi((s) => s.setPending)
  const setReturnFrom = useBuilderUi((s) => s.setReturnFrom)

  const track = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  // the view model: the sequence (placed-aware homes), one entry per node, the state words and the summaries
  const home = useCallback((id: string) => homeOf(id), [placed, packages]) // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => sequenceModel(wf, home), [wf, home])
  const entries = useMemo(() => new Map(wf.nodes.map((id) => [id, entryFor(id, { board: wf, packages, placed })])), [wf, packages, placed])
  const entry = useCallback((id: string): ToolEntry => entries.get(id) ?? entryFor(id, { board: wf, packages, placed }), [entries, wf, packages, placed])
  const name = useCallback((id: string) => (id === 'start' ? 'Start' : id === 'enter' ? 'End' : entry(id).name), [entry])
  const installed = useMemo(() => new Set(packages.map((p) => p.id)), [packages])
  const stateOf = (id: string) => cardState(id, { project, towers: towers.length, siteArea, analysis, installed })
  const summaryOf = (id: string) => (isDesignNode(id) ? designSummary(id, { project, towers, hasSite: !!citySite, siteName: citySite?.label ?? null }) : summaries[id])
  const cardOf = (id: string) => model.cards.find((c) => c.id === id)!
  const board = () => useProjectWorkflow.getState().wf

  // ---- the edits, each one commit with a note in the editor's words
  const moveTo = (id: string, target: string, where: 'before' | 'after') => {
    commit(moveNode(board(), id, target, where), `${name(id)} moved ${where} ${name(target)}`)
    select(id)
    requestAnimationFrame(() => refs.current[id]?.focus({ preventScroll: true }))
  }
  const moveBy = (id: string, where: 'before' | 'after') => {
    const run = walk(board().edges), i = run.indexOf(id), t = where === 'before' ? run[i - 1] : run[i + 1]
    if (i < 0 || !t) return
    moveTo(id, t, where)
  }
  const dropMove = (id: string, after: string) => { const plan = movePlan(board(), id, after); if (plan) moveTo(id, plan.target, plan.where) }
  const remove = (id: string) => {
    commit(removeNode(board(), id), `${name(id)} taken off the workflow (its results and your model stay)`)
    if (useBuilderUi.getState().selected === id) select(null)
    requestAnimationFrame(() => track.current?.focus({ preventScroll: true }))
  }
  const returnTo = (from: string, to: string) => {
    const b = board()
    if (!wouldLoop(b, from, to)) return
    commit(connect(b, from, to), `Loop created: ${name(from)} returns to ${name(to)}`)
  }
  const removeReturn = (from: string, to: string) => commit(disconnect(board(), returnKey(from, to)), `Loop removed: ${name(from)} no longer returns to ${name(to)}`)
  const confirmAdd = () => {
    const pnd = useBuilderUi.getState().pending
    if (!pnd) return
    const b = board(), { id, after } = pnd
    setPending(null)
    if (b.nodes.includes(id)) { select(id); return } // never twice: the card it already has
    const e = entry(id), ph = designNode(id)?.phase ?? e.phase
    usePhaseTools.getState().place(id, ph)
    commit(addAt(b, id, after), `${e.name} added to ${PHASE_NAME[ph]} after ${after === 'start' ? 'the start' : name(after)}${designNode(id) ? '' : '; its check is on'}`)
    select(id)
  }
  const focusMove = (id: string, dir: -1 | 1) => {
    const list = [...(track.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])]
    const i = list.indexOf(refs.current[id] as HTMLElement)
    list[i + dir]?.focus()
  }

  // ---- moving a card by its handle: window listeners from the pointer down, the slot under the pointer from the DOM
  const startMove = (id: string, e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY
    let moved = false
    const ui = useBuilderUi.getState()
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      moved = true
      ui.setDrag({ kind: 'move', id, x: ev.clientX, y: ev.clientY, over: slotAt(ev.clientX, ev.clientY) })
      // the row scrolls when the pointer nears its edges
      const t = track.current, r = t?.getBoundingClientRect()
      if (t && r) { if (ev.clientX < r.left + 48) t.scrollLeft -= 14; else if (ev.clientX > r.right - 48) t.scrollLeft += 14 }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      ui.setDrag(null)
      if (!moved) { select(id); return }
      const over = slotAt(ev.clientX, ev.clientY)
      if (over) dropMove(id, over.after)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  // ---- the arcs: card positions measured after each layout change (relative to the content, so scrolling never moves them)
  const [pos, setPos] = useState<Map<string, { x: number; y: number }>>(new Map())
  const measure = useCallback(() => {
    const c = content.current
    if (!c) return
    const r0 = c.getBoundingClientRect(), next = new Map<string, { x: number; y: number }>()
    for (const [id, el] of Object.entries(refs.current)) if (el && c.contains(el)) { const r = el.getBoundingClientRect(); next.set(id, { x: Math.round(r.left - r0.left + r.width / 2), y: Math.round(r.top - r0.top) }) }
    setPos((old) => (old.size === next.size && [...next].every(([k, v]) => old.get(k)?.x === v.x && old.get(k)?.y === v.y) ? old : next))
  }, [])
  const slots = useMemo(() => ['start', ...model.columns.filter((c) => c.main).map((c) => c.main!)], [model])
  const pendingSlot = pending ? (slots.includes(pending.after) ? pending.after : slots[slots.length - 1]) : null
  useLayoutEffect(measure, [measure, model, pendingSlot, drag?.id, selected])
  useEffect(() => {
    const c = content.current
    if (!c) return
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    return () => ro.disconnect()
  }, [measure])
  // the selected card and a pending insertion come into view
  useEffect(() => { if (selected) refs.current[selected]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' }) }, [selected, reduced])
  useEffect(() => { if (pendingSlot) content.current?.querySelector<HTMLElement>('[data-testid="pending-add"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' }) }, [pendingSlot, pending?.id, reduced])

  const levels = model.returns.reduce((m, r) => Math.max(m, r.level), 0)
  const overSlot = drag?.over?.after ?? null
  const card = (id: string) => {
    const c = cardOf(id), e = entry(id)
    return (
      <WorkflowStepCard key={id} card={c} entry={e} state={stateOf(id)} summary={summaryOf(id)} board={wf} run={model.run} name={name}
        selected={selected === id} dragging={drag?.kind === 'move' && drag.id === id} reducedMotion={reduced} chooserOpen={returnFrom === id}
        onSelect={() => select(id)} onClear={() => select(null)} onOpen={() => openToolInWorkspace(id)}
        onMove={(where) => moveBy(id, where)} onRemove={() => remove(id)}
        onReturnOpen={(open) => setReturnFrom(open ? id : null)} onReturnTo={(to) => returnTo(id, to)} onRemoveReturn={(to) => removeReturn(id, to)}
        onHandleDown={(ev) => startMove(id, ev)} onFocusMove={(dir) => focusMove(id, dir)}
        cardRef={(el) => { refs.current[id] = el }} />
    )
  }
  const slot = (after: string) => (
    <SlotMark key={`slot-${after}`} after={after} active={!!drag} over={overSlot === after} reduced={reduced}
      words={drag && overSlot === after ? dragWords(wf, drag, after, name) : null} />
  )
  const pendingCard = pending && (
    <PendingCard key="pending" info={infoOf(entry(pending.id))} after={pending.after} run={model.run} name={name}
      onAfter={(after) => setPending({ id: pending.id, after })} onYes={confirmAdd} onNo={() => setPending(null)} />
  )

  return (
    <section data-testid="workflow-sequence" aria-label="Workflow" className="flex min-h-0 flex-1 flex-col">
      <div ref={track} tabIndex={-1} className="min-h-0 flex-1 overflow-auto outline-none" style={{ scrollbarWidth: 'thin' }} data-testid="sequence-track"
        onClick={(e) => { if (e.target === e.currentTarget || e.target === content.current) { select(null); setReturnFrom(null) } }}>
        <div ref={content} className="relative inline-flex min-w-full items-stretch px-4 pb-4" style={{ paddingTop: 12 + arcSpace(levels) }}>
          {/* return paths: dashed arcs over the row, the selected card's in blue */}
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            <defs>
              {[['edge', UI.edge], ['active', UI.accent]].map(([k, c]) => <marker key={k} id={`seq-arrow-${k}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>)}
            </defs>
            {model.returns.map((r) => {
              const A = pos.get(r.from), B = pos.get(r.to)
              if (!A || !B) return null
              const hot = selected === r.from || selected === r.to
              return <path key={r.key} data-return={`${r.from}>${r.to}`} d={arcPath(A.x, A.y - 3, B.x, B.y - 3, r.level)} fill="none" stroke={hot ? UI.accent : UI.edge} strokeWidth={hot ? 2 : 1.4} strokeDasharray="5 4" markerEnd={`url(#seq-arrow-${hot ? 'active' : 'edge'})`} />
            })}
          </svg>
          <EndMark kind="start" />
          {pendingSlot === 'start' ? pendingCard : slot('start')}
          {model.columns.map((col) => (
            <div key={col.col} className="contents">
              <div className="flex shrink-0 flex-col items-center" data-column={col.col}>
                {col.main ? card(col.main) : <span className="h-6" aria-hidden />}
                {col.branches.length > 0 && <WorkflowBranchGroup col={col.col} phase={cardOf(col.branches[0]).phase}>{col.branches.map(card)}</WorkflowBranchGroup>}
              </div>
              {col.main && (pendingSlot === col.main ? pendingCard : slot(col.main))}
            </div>
          ))}
          <EndMark kind="end" />
        </div>
        <UnwiredGroup count={model.unwired.length}>{model.unwired.map(card)}</UnwiredGroup>
      </div>
      {/* the last change, for the status line and screen readers */}
      <p role="status" aria-live="polite" data-testid="sequence-note" className="min-h-6 border-t border-line px-3 py-1 text-meta text-muted">{note}{note && canUndo ? ' · Undo is available' : ''}</p>
      {drag?.kind === 'move' && (
        <span aria-hidden data-testid="drag-ghost" className="pointer-events-none fixed z-[70] flex max-w-72 items-center gap-2 rounded-lg border border-accent/50 bg-panel px-2 py-1 text-meta text-ink shadow-float" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          <NodeTile id={drag.id} size={22} art={<NodeArtwork id={drag.id} size={20} category={entry(drag.id).category} />} />
          <span className="min-w-0"><span className="block truncate font-semibold">{name(drag.id)}</span><span className="block text-muted">{dragWords(wf, drag, overSlot, name)}</span></span>
        </span>
      )}
    </section>
  )
}

/** The shape AddConfirm reads, from a library entry. */
export const infoOf = (e: ToolEntry): Info => ({ id: e.id, name: e.name, word: e.word, phase: e.phase, design: e.kind === 'design', category: e.category })

/** A gap between columns: the forward wire through it, and the drop target while a drag is on. */
function SlotMark({ after, active, over, words, reduced }: { after: string; active: boolean; over: boolean; words: string | null; reduced: boolean }) {
  return (
    <span data-slot={after} data-testid={`slot-${after}`} data-over={over ? '' : undefined} data-active={active ? '' : undefined} aria-hidden
      className={`relative flex shrink-0 self-stretch ${active ? 'w-12' : 'w-7'} ${reduced ? '' : 'transition-[width] duration-150 ease-standard'}`} style={{ minHeight: WIRE_Y + 24 }}>
      <span className="absolute left-0 right-0 flex items-center" style={{ top: WIRE_Y }}>
        <span className="h-px flex-1" style={{ background: UI.edge }} /><ArrowRight size={12} style={{ color: UI.edge, marginLeft: -4 }} />
      </span>
      {active && <span className={`absolute inset-y-1 left-1/2 w-1.5 -translate-x-1/2 rounded-full ${over ? 'bg-accent' : 'bg-accent/25'}`} />}
      {over && words && <span className="absolute left-1/2 z-20 w-48 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-center text-meta text-white shadow-float" style={{ top: WIRE_Y + 28 }}>{words}</span>}
    </span>
  )
}

/** Start and End, the two ends of the sequence; the forward wire meets them at the artwork's height. */
function EndMark({ kind }: { kind: 'start' | 'end' }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1" style={{ paddingTop: WIRE_Y - 20 }} data-testid={`sequence-${kind}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${kind === 'start' ? 'border border-line bg-panel text-muted' : 'bg-subtle text-muted'}`}>{kind === 'start' ? <Play size={15} aria-hidden /> : <ArrowRight size={16} aria-hidden />}</span>
      <span className="text-meta text-muted">{kind === 'start' ? 'Start' : 'End'}</span>
    </div>
  )
}

/** The proposed insertion: a card-sized AddConfirm at the slot, with the position changeable before Yes. */
function PendingCard({ info, after, run, name, onAfter, onYes, onNo }: {
  info: Info; after: string; run: string[]; name: (id: string) => string; onAfter: (after: string) => void; onYes: () => void; onNo: () => void
}) {
  return (
    <div data-testid="pending-add" className="shrink-0 self-start" style={{ width: CARD_WIDTH, marginTop: WIRE_Y - 56 }}>
      <AddConfirm info={info} className="flex-col items-stretch" onConfirm={onYes} onCancel={onNo}
        placement={
          <label className="flex flex-col gap-0.5">
            <span className="text-meta text-muted">Where</span>
            <select data-testid="pending-after" value={run.includes(after) ? after : 'start'} onChange={(e) => onAfter(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-1.5 py-1 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <option value="start">At the start</option>
              {run.filter((id) => id !== info.id).map((id) => <option key={id} value={id}>After {name(id)}</option>)}
            </select>
          </label>
        } />
    </div>
  )
}
