// The builder's contextual inspector (Result A brief §9): the selected card's tool in plain words (name, purpose,
// phase, state, Uses, You enter, Produces, settings, what comes next and where it returns), with Open tool and Remove
// from workflow; with nothing selected, the workflow itself (name, the preset it started from, the phases it covers,
// Save as preset). Every word comes from the view model (lib/workflow/builderModel.ts), the project workflow store or
// the live digest (hooks/useNodeSummaries.ts): nothing is invented, and selection never runs anything. It collapses to
// a 40 px rail when space is short (useBuilderUi.inspector).
import { useEffect, useMemo, type ReactNode } from 'react'
import { ArrowRight, PanelRightClose, PanelRightOpen, Trash2, Upload } from '../icons'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import Help from '../Help'
import { SaveAsPreset, homeOf } from '../workflow/WorkflowOverview'
import { useStore } from '../../store'
import { useCommunityStore } from '../../lib/communityStore'
import { PHASE_COLOR } from '../../lib/design/tokens'
import { KIND_CLASS } from '../../lib/status'
import { useProjectSiteArea } from '../../lib/siteArea'
import { presetById } from '../../lib/userTypes'
import { listMyPresets } from '../../lib/workflow/myPresets'
import { cardState, designSummary, entryFor, plainWords, sequenceModel, type CardStateKind } from '../../lib/workflow/builderModel'
import { designNode } from '../../lib/workflow/designNodes'
import { PHASE_IDS, PHASE_NAME, usePhaseTools } from '../../lib/workflow/phaseTools'
import { removeNode, useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import type { PhaseId } from '../../lib/phases'
import { useNodeSummaries } from '../../hooks/useNodeSummaries'
import { openToolInWorkspace } from './openTool'
import { useBuilderUi } from './builderState'

/** The state word's colour family (design system §3.3): a missing input or a pause is pending, a missing tool an error, another project's tool a warning; the rest plain ink. */
const STATE_CLASS: Record<CardStateKind, string> = {
  design: 'border-line bg-subtle text-ink', available: 'border-line bg-subtle text-ink', ready: 'border-line bg-subtle text-ink',
  'needs-model': KIND_CLASS.pending.chip, 'waiting-input': KIND_CLASS.pending.chip, paused: KIND_CLASS.pending.chip,
  missing: KIND_CLASS.error.chip, 'other-project': KIND_CLASS.warning.chip,
}

export default function WorkflowInspector() {
  const shown = useBuilderUi((s) => s.inspector)
  const setInspector = useBuilderUi((s) => s.setInspector)
  const selected = useBuilderUi((s) => s.selected)
  const wf = useProjectWorkflow((s) => s.wf)
  const inBoard = selected && wf.nodes.includes(selected) ? selected : null

  if (!shown) return (
    <aside data-testid="workflow-inspector" data-collapsed="" aria-label="Inspector" className="flex w-10 shrink-0 flex-col items-center border-l border-line bg-panel py-2">
      <button type="button" onClick={() => setInspector(true)} data-testid="inspector-expand" aria-label="Show the inspector" title="Show the inspector"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"><PanelRightOpen size={16} aria-hidden /></button>
    </aside>
  )
  return (
    <aside data-testid="workflow-inspector" aria-label="Inspector" className="flex w-[280px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-meta font-semibold text-muted">{inBoard ? 'Selected tool' : 'This workflow'}</span>
        <button type="button" onClick={() => setInspector(false)} data-testid="inspector-collapse" aria-label="Hide the inspector" title="Hide the inspector"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><PanelRightClose size={15} aria-hidden /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'thin' }}>
        {inBoard ? <ToolView id={inBoard} /> : <WorkflowView />}
      </div>
    </aside>
  )
}

/** A labelled row: the label in metadata type, the content under it. */
function Row({ label, testId, children, help }: { label: string; testId: string; children: ReactNode; help?: ReactNode }) {
  return (
    <div data-testid={testId} className="grid gap-0.5">
      <dt className="flex items-center gap-1 text-meta font-semibold text-muted">{label}{help && <Help label={`About ${label}`}>{help}</Help>}</dt>
      <dd className="text-control font-normal text-ink">{children}</dd>
    </div>
  )
}

const List = ({ items, empty }: { items: string[]; empty: string }) => items.length
  ? <ul className="list-disc pl-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
  : <span className="text-muted">{empty}</span>

/** The selected card's tool. */
function ToolView({ id }: { id: string }) {
  const w = useProjectWorkflow()
  const select = useBuilderUi((s) => s.select)
  const packages = useCommunityStore((s) => s.packages)
  const placed = usePhaseTools((s) => s.placed)
  const project = useStore((s) => s.project)
  const towers = useStore((s) => s.towers[s.project])
  const citySite = useStore((s) => s.citySite)
  const analysis = useStore((s) => s.analysis)
  const siteArea = useProjectSiteArea().area
  const summaries = useNodeSummaries()

  const entry = useMemo(() => entryFor(id, { board: w.wf, packages, placed }), [id, w.wf, packages, placed])
  const seq = useMemo(() => sequenceModel(w.wf, homeOf), [w.wf, placed]) // eslint-disable-line react-hooks/exhaustive-deps
  const card = seq.cards.find((c) => c.id === id)
  const installed = useMemo(() => new Set(packages.map((p) => p.id)), [packages])
  const state = cardState(id, { project, towers: towers.length, siteArea, analysis, installed })
  const words = plainWords(id, packages)
  const nameOf = (x: string) => (x === 'enter' ? 'End' : x === 'start' ? 'Start' : entryFor(x, { board: w.wf, packages, placed }).name)
  const design = designNode(id)
  const now = design ? designSummary(id, { project, towers, hasSite: !!citySite, siteName: citySite?.label ?? null }) : null
  const result = summaries[id]
  const missing = entry.kind === 'missing'
  const phase: PhaseId = design?.phase ?? card?.phase ?? entry.phase

  // Selection is UI state only: a card taken off the workflow by Undo or Remove leaves the inspector on the workflow.
  useEffect(() => { if (!w.wf.nodes.includes(id)) select(null) }, [w.wf.nodes, id, select])

  const remove = () => {
    w.commit(removeNode(w.wf, id), `${entry.name} taken off the workflow (its results and your model stay)`)
    select(null)
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-start gap-3">
        <NodeTile id={id} size={48} state={missing ? 'off' : 'on'} art={<NodeArtwork id={id} size={43} category={entry.category} muted={missing} />} />
        <div className="min-w-0">
          <h3 data-testid="inspector-title" className="text-section font-semibold text-ink">{entry.name}</h3>
          <p className="text-control font-normal text-muted">{entry.purpose}</p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3">
        <Row label="Phase" testId="inspector-phase">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[phase].accent }} />{PHASE_NAME[phase]}</span>
        </Row>
        <Row label="State" testId="inspector-state" help="Available means the tool is implemented; Ready means its inputs are present; Pass or Fail come from a finished check. They are kept apart.">
          <span data-state={state.kind} className={`inline-flex items-center rounded-lg border px-1.5 py-0.5 text-meta font-medium ${STATE_CLASS[state.kind]}`}>{state.word}</span>
          <span className="mt-0.5 block text-meta text-muted">{state.detail}</span>
          {now && <span className="mt-0.5 block text-meta text-ink" data-testid="inspector-now">{now}</span>}
          {result && <span className="mt-0.5 block text-meta text-ink" data-testid="inspector-results">Results now: {result}</span>}
        </Row>
        {missing ? (
          <Row label="Missing tool" testId="inspector-missing">
            <span>This workflow keeps it as a reference; nothing is deleted. To use it again, import its package in the node builder.</span>
            <button type="button" onClick={() => useCommunityStore.getState().openDialog('import')} data-testid="inspector-import"
              className="mt-1.5 flex h-8 items-center gap-1 rounded-lg bg-panel px-2.5 text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"><Upload size={14} aria-hidden />Import its package</button>
          </Row>
        ) : (
          <>
            <Row label="Uses" testId="inspector-uses"><List items={words.uses} empty="Nothing from the model" /></Row>
            <Row label="You enter" testId="inspector-asks"><List items={words.asks} empty="Nothing to enter" /></Row>
            <Row label="Produces" testId="inspector-produces">{words.produces}</Row>
            {words.settings.length > 0 && (
              <Row label="Settings" testId="inspector-settings">Its settings are in {words.settings.join(', ')}; Open tool shows them.</Row>
            )}
          </>
        )}
        <Row label="Next" testId="inspector-next">
          {card && card.next.length ? card.next.map(nameOf).join(', ') : <span className="text-muted">{card?.lane === 'unwired' ? 'Not connected yet' : 'Nothing follows'}</span>}
          {card && card.branchesTo.length > 0 && <span className="block text-meta text-muted">A second route: also goes to {card.branchesTo.map(nameOf).join(', ')}.</span>}
        </Row>
        <Row label="Returns to" testId="inspector-returns" help="A return path is a route for revisiting a step; it never reruns anything on its own.">
          {card && card.returnsTo.length ? card.returnsTo.map(nameOf).join(', ') : <span className="text-muted">No return path</span>}
          {card && card.returnedFrom.length > 0 && <span className="block text-meta text-muted">{card.returnedFrom.map(nameOf).join(', ')} {card.returnedFrom.length > 1 ? 'return' : 'returns'} here.</span>}
        </Row>
      </dl>
      <div className="flex flex-wrap items-center gap-1.5">
        {!missing && (
          <button type="button" onClick={() => openToolInWorkspace(id)} data-testid="inspector-open" title="Go to this tool in the workspace; the builder closes keeping its changes"
            className="flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Open tool<ArrowRight size={14} aria-hidden /></button>
        )}
        <button type="button" onClick={remove} data-testid="inspector-remove" title="Take it off the workflow; its results and your model stay, and Undo brings it back"
          className="flex h-8 items-center gap-1 rounded-lg bg-panel px-2.5 text-control text-error outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={14} aria-hidden />Remove from workflow</button>
      </div>
    </div>
  )
}

/** The workflow itself, when no card is selected. */
function WorkflowView() {
  const w = useProjectWorkflow()
  const placed = usePhaseTools((s) => s.placed)
  const name = w.wf.customName ?? (w.wf.presetId ? presetById(w.wf.presetId)?.name : null) ?? 'My workflow'
  const started = useMemo(() => {
    const p = w.wf.presetId ? presetById(w.wf.presetId) : null
    if (p) return `Started from ${p.name}`
    const mine = w.wf.customName ? listMyPresets().find((x) => x.name === w.wf.customName) : null
    return mine ? `Started from your preset ${mine.name}` : 'Built from scratch'
  }, [w.wf.presetId, w.wf.customName])
  const phases = useMemo(() => {
    const used = new Set(w.wf.nodes.map((id) => designNode(id)?.phase ?? homeOf(id)))
    return PHASE_IDS.filter((p) => used.has(p))
  }, [w.wf.nodes, placed]) // eslint-disable-line react-hooks/exhaustive-deps
  const returns = useMemo(() => sequenceModel(w.wf, homeOf).returns.length, [w.wf, placed]) // eslint-disable-line react-hooks/exhaustive-deps
  const tools = w.wf.nodes.length
  return (
    <div data-testid="inspector-workflow" className="grid grid-cols-1 gap-4">
      <div>
        <h3 className="text-section font-semibold text-ink">{name}</h3>
        <p className="text-control font-normal text-muted" data-testid="inspector-started">{started}</p>
      </div>
      <dl className="grid grid-cols-1 gap-3">
        <Row label="Phases" testId="inspector-phases">
          {phases.length ? (
            <ul className="flex flex-wrap gap-1">
              {phases.map((p) => (
                <li key={p} data-phase={p} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-meta font-medium" style={{ background: PHASE_COLOR[p].surface, color: PHASE_COLOR[p].ink }}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_COLOR[p].accent }} />{PHASE_NAME[p]}
                </li>
              ))}
            </ul>
          ) : <span className="text-muted">No tools yet: add one from the library.</span>}
        </Row>
        <Row label="Size" testId="inspector-counts">
          <span data-num>{tools} {tools === 1 ? 'tool' : 'tools'} · {returns} return {returns === 1 ? 'path' : 'paths'}</span>
        </Row>
      </dl>
      <div className="flex flex-wrap items-center gap-1.5">
        <SaveAsPreset board={w.wf} />
      </div>
    </div>
  )
}
