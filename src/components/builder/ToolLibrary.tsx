// The workflow builder's tool library (Ruijie's Result A brief, 9 Nov, §3 and §6): the left column, where a designer
// finds a tool to add. Search, the five phases as filters, then Available (the design steps, then the implemented
// checks; a preview says so, and a tool that only runs in the other project is muted with that said), My tools (the
// custom tools installed here, then the references a saved workflow still holds to ones that are not: kept visible, never
// dropped) and, closed, the planned and research-only modules (details only, never Add). Each entry: the node's own
// artwork, its full name, one line of purpose, Add (or Show, when it is already in the workflow: a tool appears once, so
// the card is selected instead) and a details toggle. Add, a drop on a slot of the sequence, or Enter on Add all end in
// the pending card (builderState.ts `pending`), which shows the position before anything is committed (brief §7). Every
// word here comes from the view model (lib/workflow/builderModel.ts); nothing here edits the workflow or runs a check.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown, PackagePlus, Plus, Search, X } from '../icons'
import Help from '../Help'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import { ALL_NODES, type Category } from '../../data/registry'
import { useCommunityStore } from '../../lib/communityStore'
import { PHASE_COLOR } from '../../lib/design/tokens'
import type { PhaseId } from '../../lib/phases'
import { addPreview, applicability, bestAfter, entryFor, filterEntries, libraryEntries, phaseName, previewWords, runsInProject, TOOL_STATE_DETAIL, type ToolEntry } from '../../lib/workflow/builderModel'
import { PHASE_IDS, usePhaseTools } from '../../lib/workflow/phaseTools'
import { useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import type { Board } from '../../lib/workflowGraph'
import { useStore } from '../../store'
import { useDesignTools } from '../../lib/designTools/store'
import { useTransfer } from '../../lib/porting/transfer'
import { homeOf } from '../workflow/WorkflowOverview'
import { slotAt, useBuilderUi } from './builderState'

/** The one word for an entry's availability (brief §6: availability is not result quality). */
export function availabilityWords(e: Pick<ToolEntry, 'availability' | 'toolState'>): { word: string; detail: string } {
  switch (e.availability) {
    case 'available': return { word: 'Available', detail: 'Implemented; whether it can run depends on its inputs.' }
    case 'preview': return { word: 'Preview', detail: 'Implemented and still being checked; read its results with care.' }
    case 'custom': return { word: 'Installed custom tool', detail: 'A package imported into this browser.' }
    // a connected design tool's word is its state (Connected and compatible … External reference), never a result
    case 'tool': return { word: e.toolState ?? 'Connected', detail: TOOL_STATE_DETAIL[e.toolState ?? 'Connected'] }
    case 'missing': return { word: 'Missing tool', detail: 'Not installed in this browser. Import its package under My tools to use it; the workflow keeps its place.' }
    case 'research': return { word: 'Not runnable', detail: 'Planned or research only: nothing is implemented for it yet.' }
  }
}

/** The tile's state in the library: in the workflow (on), available (soft), or not for this project (off). */
export const tileState = (e: Pick<ToolEntry, 'inWorkflow' | 'availability'>, runs: boolean): 'on' | 'soft' | 'off' =>
  e.inWorkflow ? 'on' : runs && e.availability !== 'missing' && e.availability !== 'research' ? 'soft' : 'off'

const DRAG_START = 6
const ctl = 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent'

export default function ToolLibrary() {
  const wf = useProjectWorkflow((s) => s.wf)
  const packages = useCommunityStore((s) => s.packages)
  const tools = useDesignTools((s) => s.definitions)
  const placed = usePhaseTools((s) => s.placed)
  const project = useStore((s) => s.project)
  const { query, phase, selected, drag, setQuery, setPhase, select, setDrag, setPending } = useBuilderUi(useShallow((s) => ({
    query: s.query, phase: s.phase, selected: s.selected, drag: s.drag, setQuery: s.setQuery, setPhase: s.setPhase, select: s.select, setDrag: s.setDrag, setPending: s.setPending,
  })))

  // The catalogue once per workflow change; the filters narrow it without rebuilding it.
  const library = useMemo(() => libraryEntries({ board: wf, packages, placed, tools, research: ALL_NODES }), [wf, packages, placed, tools])
  const shown = useMemo(() => ({
    available: filterEntries(library.available, { query, phase }),
    mine: filterEntries(library.mine, { query, phase }),
    research: filterEntries(library.research, { query, phase }),
  }), [library, query, phase])
  const filtering = !!query.trim() || !!phase
  const entryOf = useMemo(() => {
    const all = new Map([...library.available, ...library.mine, ...library.research].map((e) => [e.id, e]))
    return (id: string): ToolEntry => all.get(id) ?? entryFor(id, { board: wf, packages, placed, tools })
  }, [library, wf, packages, placed, tools])

  // Show: a tool that is already in the workflow is never added twice; its card is selected and brought into view.
  const show = (id: string) => {
    select(id)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' }))
  }
  // Add: the pending card at the best place (after the last tool of its phase or an earlier one); the person can move it before saying yes.
  const add = (e: ToolEntry) => {
    if (e.inWorkflow) { show(e.id); return }
    setPending({ id: e.id, after: bestAfter(wf, e.id, homeOf) })
  }

  // Drag from the tile: after 6 px the ghost follows the pointer and the sequence lights its slots; a drop on one makes
  // the pending card there, a drop anywhere else (or Esc) cancels, and a press without movement is a click (Add).
  const startDrag = (e: ToolEntry, ev: RPointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0 || e.inWorkflow || e.availability === 'research') return
    const sx = ev.clientX, sy = ev.clientY
    let moved = false
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key) }
    const move = (p: PointerEvent) => {
      if (!moved && Math.hypot(p.clientX - sx, p.clientY - sy) < DRAG_START) return
      moved = true
      setDrag({ kind: 'add', id: e.id, x: p.clientX, y: p.clientY, over: slotAt(p.clientX, p.clientY) })
    }
    const up = (p: PointerEvent) => {
      stop()
      if (!moved) { add(e); return }
      const over = slotAt(p.clientX, p.clientY)
      setDrag(null)
      if (over) setPending({ id: e.id, after: over.after })
    }
    const cancel = () => { stop(); setDrag(null) }
    const key = (k: KeyboardEvent) => { if (k.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key)
  }

  const entryProps = { project, selected, dragging: drag?.kind === 'add' ? drag.id : null, onAdd: add, onDrag: startDrag }
  const create = (
    <span className="flex flex-wrap gap-1.5">
      <button type="button" data-testid="library-create" onClick={() => useCommunityStore.getState().openDialog('build')}
        title="Build a custom tool here, or import a package someone shared"
        className={`${ctl} flex items-center gap-1.5 bg-panel px-2 py-1 text-control text-ink hover:border-boundary`}><PackagePlus size={14} aria-hidden />Add or create a custom tool</button>
      {/* a connected design tool registers through Import (brief §5): identify, check, explain, confirm, then it lands here */}
      <button type="button" data-testid="library-add-tool" onClick={(e) => useTransfer.getState().open('import', e.currentTarget, { purpose: 'tool' })}
        title="Register a connected design tool from its definition file; nothing connects until you open it in a workflow"
        className={`${ctl} flex items-center gap-1.5 bg-panel px-2 py-1 text-control text-ink hover:border-boundary`}><Plus size={14} aria-hidden />Add tool</button>
    </span>
  )

  return (
    // the column itself: WorkflowBuilder.tsx puts it in an <aside aria-label="Tool library"> of 256 px (or a drawer), with the panel border
    <div data-testid="tool-library" className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex items-center gap-1.5 px-3 pt-3">
        <h2 className="text-section text-ink">Tool library</h2>
        <Help label="About the tool library">Every tool you can put in your workflow. Add puts it in the best place (after the last tool of its phase), where you can still move it before saying yes; or drag its picture onto a gap between the cards. A tool appears once: Show takes you to its card. Available means a tool is implemented; whether it can run depends on its inputs, which its card says. Planned and research-only tools are listed at the bottom for reading, never for adding.</Help>
      </div>
      <label className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 focus-within:ring-2 focus-within:ring-accent">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Search tools by name or purpose</span>
        <input data-testid="library-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools" autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-control text-ink outline-none placeholder:text-muted" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear the search" className={`${ctl} rounded-full p-0.5 text-muted hover:text-ink`}><X size={12} aria-hidden /></button>}
      </label>
      <div role="group" aria-label="Show the tools of one phase" className="flex flex-wrap gap-1 px-3 pt-2">
        <PhaseButton id="all" on={phase === null} onClick={() => setPhase(null)}>All</PhaseButton>
        {PHASE_IDS.map((p) => <PhaseButton key={p} id={p} on={phase === p} onClick={() => setPhase(phase === p ? null : p)} dot={PHASE_COLOR[p].accent}>{phaseName(p)}</PhaseButton>)}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3" style={{ scrollbarWidth: 'thin' }}>
        <Section testId="library-available" title="Available" count={shown.available.length} of={library.available.length}>
          {shown.available.map((e) => <Entry key={e.id} e={e} {...entryProps} />)}
          {!shown.available.length && <Empty filtering={filtering} what="available tool" />}
        </Section>
        <Section testId="library-mine" title="My tools" count={shown.mine.length} of={library.mine.length} foot={create}>
          {shown.mine.map((e) => <Entry key={e.id} e={e} {...entryProps} />)}
          {!shown.mine.length && (library.mine.length ? <Empty filtering={filtering} what="custom tool" /> : <li className="px-1 py-1 text-meta text-muted">No custom tools yet.</li>)}
        </Section>
        <ResearchSection entries={shown.research} total={library.research.length} filtering={filtering} {...entryProps} />
      </div>

      {/* the ghost that follows an add drag; the sequence lights the slot under it. Over a slot it says where the tool would go. */}
      {drag?.kind === 'add' && <AddGhost drag={drag} entryOf={entryOf} wf={wf} />}
    </div>
  )
}

function PhaseButton({ id, on, onClick, dot, children }: { id: string; on: boolean; onClick: () => void; dot?: string; children: string }) {
  return (
    <button type="button" data-testid={`library-phase-${id}`} aria-pressed={on} onClick={onClick}
      className={`${ctl} flex items-center gap-1 px-1.5 py-0.5 text-meta font-medium ${on ? 'bg-selected text-accent-hover' : 'bg-panel text-muted hover:text-ink'}`}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}{children}
    </button>
  )
}

function Section({ testId, title, count, of, foot, children }: { testId: string; title: string; count: number; of: number; foot?: ReactNode; children: ReactNode }) {
  const hid = `${testId}-heading`
  return (
    <section data-testid={testId} aria-labelledby={hid} className="mb-3">
      <h3 id={hid} className="flex items-baseline gap-1.5 px-1 pb-1 text-control text-ink">{title}<span className="text-meta font-normal tabular-nums text-muted" aria-label={count === of ? `${of} tools` : `${count} of ${of} tools shown`}>{count === of ? of : `${count} / ${of}`}</span></h3>
      <ul className="grid grid-cols-1 gap-1">{children}</ul>
      {foot && <div className="px-1 pt-2">{foot}</div>}
    </section>
  )
}

function Empty({ filtering, what }: { filtering: boolean; what: string }) {
  const { setQuery, setPhase } = useBuilderUi(useShallow((s) => ({ setQuery: s.setQuery, setPhase: s.setPhase })))
  return (
    <li className="flex flex-wrap items-center gap-x-2 px-1 py-1 text-meta text-muted">
      {filtering ? <>No {what} matches.<button type="button" onClick={() => { setQuery(''); setPhase(null) }} className={`${ctl} px-1 font-medium text-accent-hover hover:underline`}>Show all</button></> : `No ${what}.`}
    </li>
  )
}

/** Planned and research-only modules: closed by default, listed only when opened (the registry holds many), never Add. */
function ResearchSection({ entries, total, filtering, ...rest }: { entries: ToolEntry[]; total: number; filtering: boolean } & EntryShared) {
  const [open, setOpen] = useState(false)
  return (
    <details data-testid="library-research" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group mb-2 rounded-lg bg-subtle">
      <summary className={`${ctl} flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-control text-ink [&::-webkit-details-marker]:hidden`}>
        <ChevronDown size={14} aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        Planned and research-only tools<span className="ml-auto text-meta font-normal tabular-nums text-muted">{filtering ? `${entries.length} / ${total}` : total}</span>
      </summary>
      <p className="px-2 pb-1 text-meta text-muted">Not runnable: for reading what is planned, never a step of the workflow.</p>
      {open && (
        <ul className="grid grid-cols-1 gap-1 px-1 pb-1">
          {entries.map((e) => <Entry key={e.id} e={e} {...rest} />)}
          {!entries.length && <Empty filtering={filtering} what="planned tool" />}
        </ul>
      )}
    </details>
  )
}

interface EntryShared { project: 'vtc' | 'city'; selected: string | null; dragging: string | null; onAdd: (e: ToolEntry) => void; onDrag: (e: ToolEntry, ev: RPointerEvent<HTMLButtonElement>) => void }

/** One tool: its artwork (the drag handle), name, one line of purpose, Add or Show, and a details toggle. */
function Entry({ e, project, selected, dragging, onAdd, onDrag }: { e: ToolEntry } & EntryShared) {
  const [details, setDetails] = useState(false)
  const runs = runsInProject(e, project)
  const where = applicability(e)
  const avail = availabilityWords(e)
  const research = e.availability === 'research', missing = e.availability === 'missing'
  const muted = !runs || missing || research
  const detailsId = `library-detail-${e.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const chips: { text: string; tone: 'subtle' | 'warning' | 'pending' }[] = []
  if (e.availability === 'preview') chips.push({ text: 'preview', tone: 'subtle' })
  if (where) chips.push({ text: where, tone: 'subtle' })
  if (missing) chips.push({ text: 'Missing tool', tone: 'warning' })
  if (research) chips.push({ text: 'Not runnable', tone: 'pending' })
  // a connected design tool wears its state word (brief §5); only Connected is a plain chip, the rest ask for attention
  const toolChip = e.kind === 'tool' ? { text: avail.word, tone: (e.toolState === 'Connected' ? 'subtle' : 'warning') as 'subtle' | 'warning' } : null
  const tone = { subtle: 'bg-subtle text-muted', warning: 'bg-warning-surface text-warning', pending: 'bg-pending-surface text-pending' }
  const handleLabel = e.inWorkflow ? `${e.name} is in the workflow: show its card` : research ? `${e.name}: not runnable` : `Drag to add ${e.name} to the workflow, or press Enter to add it in the best place`
  return (
    <li data-testid={`library-entry-${e.id}`} data-entry={e.id} data-missing={missing ? '' : undefined} data-muted={muted ? '' : undefined} data-in-workflow={e.inWorkflow ? '' : undefined}
      className={`rounded-lg border border-line bg-panel ${dragging === e.id ? 'opacity-40' : ''} ${selected === e.id && e.inWorkflow ? 'ring-1 ring-accent' : ''}`}>
      <div className="flex items-center gap-2 p-1.5">
        {/* a mouse press that does not move ends in Add through the drag's pointerup; the keyboard (detail 0) and an in-workflow tool (no drag) come through click */}
        <button type="button" data-testid={`library-handle-${e.id}`} aria-label={handleLabel} title={research ? avail.detail : e.inWorkflow ? 'In the workflow: show its card' : 'Drag onto a gap between the cards, or press Enter'}
          onPointerDown={(ev) => onDrag(e, ev)} onClick={(ev) => { if (!research && (e.inWorkflow || ev.detail === 0)) onAdd(e) }} disabled={research}
          className={`node-hit shrink-0 rounded-lg outline-none ${research ? 'cursor-default' : e.inWorkflow ? 'cursor-pointer' : 'cursor-grab touch-none'}`}>
          <NodeTile id={e.id} size={36} state={tileState(e, runs)} art={<NodeArtwork id={e.id} size={32} category={e.category} muted={muted} />} />
        </button>
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 text-control ${muted ? 'text-muted' : 'text-ink'}`}>
            <span className="min-w-0 truncate" title={e.name}>{e.name}</span>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[e.phase].accent }} title={phaseName(e.phase)} />
          </span>
          <span className="block truncate text-meta text-muted" title={e.purpose}>{e.purpose}</span>
          {(chips.length > 0 || toolChip) && (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {toolChip && <span data-testid={`tool-state-${e.id}`} title={avail.detail} className={`rounded-full px-1.5 text-meta ${tone[toolChip.tone]}`}>{toolChip.text}</span>}
              {chips.map((c) => <span key={c.text} className={`rounded-full px-1.5 text-meta ${tone[c.tone]}`}>{c.text}</span>)}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-stretch gap-0.5">
          {!research && (
            <button type="button" data-testid={`library-add-${e.id}`} onClick={() => onAdd(e)} aria-label={e.inWorkflow ? `Show ${e.name} in the workflow` : `Add ${e.name} to the workflow`}
              title={e.inWorkflow ? 'Already in the workflow: select its card' : !runs ? `${where}; it can still be added for when that project is open` : 'Add it in the best place; you can move it before saying yes'}
              className={`${ctl} flex items-center justify-center gap-0.5 px-2 py-0.5 text-meta font-medium ${e.inWorkflow ? 'bg-selected text-accent-hover' : 'bg-panel text-ink hover:border-boundary'}`}>
              {e.inWorkflow ? 'Show' : <><Plus size={12} aria-hidden />Add</>}
            </button>
          )}
          <button type="button" data-testid={`library-details-${e.id}`} aria-expanded={details} aria-controls={detailsId} aria-label={`${details ? 'Hide' : 'Show'} details of ${e.name}`} onClick={() => setDetails(!details)}
            className={`${ctl} flex items-center justify-center py-0.5 text-muted hover:text-ink`}><ChevronDown size={14} aria-hidden className={`transition-transform motion-reduce:transition-none ${details ? 'rotate-180' : ''}`} /></button>
        </span>
      </div>
      {details && (
        <dl id={detailsId} className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-line px-2 py-1.5 text-meta">
          <dt className="text-muted">Purpose</dt><dd className="text-ink">{e.purpose}</dd>
          <dt className="text-muted">Phase</dt><dd className="flex items-center gap-1 text-ink"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_COLOR[e.phase].accent }} />{phaseName(e.phase)}</dd>
          <dt className="text-muted">Project</dt><dd className="text-ink">{where ?? 'Both projects'}{where && !runs ? ' (not the open one)' : ''}</dd>
          <dt className="text-muted">Availability</dt><dd className="text-ink">{avail.word}<span className="block text-muted">{avail.detail}</span></dd>
        </dl>
      )}
    </li>
  )
}

/** What follows the pointer during an add drag: the tool, and over a slot, where it would go and what that connects. */
function AddGhost({ drag, entryOf, wf }: { drag: { id: string; x: number; y: number; over: { after: string } | null }; entryOf: (id: string) => ToolEntry; wf: Board }) {
  const box = useRef<HTMLSpanElement>(null)
  // kept out of the pointer's way (pointer-events none, offset), so the slot under the pointer is found, and inside the window
  useEffect(() => { const el = box.current; if (el) { const r = el.getBoundingClientRect(); el.style.left = `${Math.min(drag.x + 12, window.innerWidth - r.width - 8)}px`; el.style.top = `${Math.min(drag.y + 12, window.innerHeight - r.height - 8)}px` } }, [drag.x, drag.y])
  const nameOf = (id: string) => entryOf(id).name
  const words = drag.over ? previewWords(addPreview(wf, drag.id, drag.over.after), nameOf) : null
  const category: Category | undefined = entryOf(drag.id).category
  return (
    <span ref={box} aria-hidden data-testid="library-drag-ghost" className="pointer-events-none fixed z-[70] flex max-w-64 items-start gap-1.5 rounded-lg border border-accent/50 bg-panel px-2 py-1 text-meta text-ink shadow-float" style={{ left: drag.x + 12, top: drag.y + 12 }}>
      <NodeTile id={drag.id} size={22} art={<NodeArtwork id={drag.id} size={20} category={category} />} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{nameOf(drag.id)}</span>
        {drag.over ? <span className="block text-muted">{drag.over.after === 'start' ? 'At the start' : `After ${nameOf(drag.over.after)}`}: {words}</span> : <span className="block text-muted">Drop on a gap between the cards</span>}
      </span>
    </span>
  )
}
