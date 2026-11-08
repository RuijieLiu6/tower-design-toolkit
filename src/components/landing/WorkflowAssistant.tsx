// The workflow assistant on the cover, directly below the workflow canvas (Ruijie, 7 Nov: "Define the AI as a workflow-
// building assistant … translates a user's design intention into an editable arrangement of available nodes, and helps
// them modify and understand that workflow"). The visitor describes an intention; the assistant (lib/agent/
// workflowAssistant.ts) prepares a proposal, the canvas above previews it, a short summary says what changed, and the
// visitor applies or discards it; applied changes come back with Undo. It can also explain a node (what it answers,
// what it reads, what it asks for) and asks one focused question when a request can't be placed. It only arranges the
// built nodes; Open workspace opens whatever the canvas shows.
//
// Design system (7 Nov, §5–§7): a stable place with one short purpose line ("Describe your tower or workflow."); what it
// can do, how it works and the examples wait behind controls; an AI proposal wears its own treatment (a small "AI
// suggestion" tag on a pale cyan container) so it never looks like applied work or a calculated result, states its scope
// ("adds 2 nodes, changes 1 connection") before it is applied, explains itself on demand, and comes back with Undo.
import { useMemo, useState } from 'react'
import { Check, ChevronDown, Loader2, Lock, Sparkles, Undo2, X } from '../icons'
import Help from '../Help'
import { buildIndex } from '../../lib/agent/match'
import { loadEmbedder, MODEL_BYTES } from '../../lib/agent/model2vec'
import { interpret, nodeName, type Model, type Proposal, type Reply } from '../../lib/agent/workflowAssistant'
import { edgeKey, type Board } from '../../lib/workflowGraph'

const CAPABILITIES: { word: string; what: string }[] = [
  { word: 'Suggest', what: 'proposes a starting workflow from a project description' },
  { word: 'Modify', what: 'proposes adding, removing or looping nodes on the workflow above' },
  { word: 'Explain', what: 'says what a node answers, what it reads from the model and what it asks you for' },
  { word: 'Clarify', what: 'asks one focused question when a detail is missing' },
]
/** Example requests: a short label, and the full request it runs. The first two show in the input; the rest wait behind
 *  "More". */
const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Mixed-use tower', text: 'Help me explore a mixed-use tower with a public ground floor.' },
  { label: 'Massing + sunlight', text: 'Add a sunlight study after massing, with a loop back to massing.' },
  { label: 'Water systems after program', text: 'Add a water-systems study after the program stage.' },
  { label: 'Iterate massing and checks', text: 'Create an iteration between massing and the relevant constraint checks.' },
  { label: 'What does this node need?', text: 'Explain what information this node needs.' },
]

export interface AssistantProps {
  board: Board
  /** The node last touched on the canvas, for "this node". */
  focus: string | null
  previewing: boolean
  canUndo: boolean
  onPreview: (p: Proposal) => void
  onApply: () => void
  onDiscard: () => void
  onUndo: () => void
}

export default function WorkflowAssistant(p: AssistantProps) {
  const [text, setText] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState<Model>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [pct, setPct] = useState(0)
  const [examples, setExamples] = useState(false)

  /** The language model loads on first focus (in this browser); until then, and if it can't, words are matched. */
  const warm = (): Promise<Model> => {
    if (model) return Promise.resolve(model)
    if (status === 'failed') return Promise.resolve(null)
    setStatus((s) => (s === 'idle' ? 'loading' : s))
    return loadEmbedder((d, t) => setPct(Math.min(1, d / t)))
      .then((e) => { const m = { e, index: buildIndex(e) }; setModel(m); setStatus('ready'); return m })
      .catch(() => { setStatus('failed'); return null })
  }

  const ask = async (said: string) => {
    const s = said.trim()
    if (!s || busy) return
    setBusy(true); setApplied(null); setExamples(false)
    try {
      const m = model ?? (await Promise.race([warm(), new Promise<null>((r) => setTimeout(() => r(null), 4000))]))
      if (p.previewing) p.onDiscard() // a new request replaces a proposal still open
      const r = interpret(s, p.board, m, p.focus)
      setReply(r)
      if (r.kind === 'proposal') p.onPreview(r)
    } finally { setBusy(false) }
  }
  const apply = () => { if (reply?.kind === 'proposal') setApplied(reply.summary); p.onApply(); setReply(null) }
  const discard = () => { p.onDiscard(); setReply(null) }

  const proposal = reply?.kind === 'proposal' ? reply : null
  return (
    <section aria-labelledby="assistant-title" data-testid="workflow-assistant"
      className="pointer-events-auto relative w-[min(42rem,calc(100vw-2rem))] rounded-2xl border border-white/80 bg-panel px-5 pb-4 pt-3.5 text-ink shadow-float">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="assistant-title" className="flex items-center gap-1.5 text-control font-semibold text-ink"><Sparkles size={16} className="text-ai" aria-hidden />Workflow assistant</h2>
        <span className="flex items-center gap-1 text-meta text-muted" data-testid="assistant-model">
          {status === 'ready' ? <Sparkles size={13} className="text-ai" aria-hidden /> : status === 'loading' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Lock size={13} aria-hidden />}
          {status === 'ready' ? 'Model ready' : status === 'loading' ? `Loading ${Math.round(pct * 100)}%` : status === 'failed' ? 'Keywords' : 'In this browser'}
        </span>
        <Help label="About the workflow assistant">
          Describe your tower or workflow and it turns that into a workflow you can edit: it {CAPABILITIES.map((c) => `${c.word.toLowerCase()}s (${c.what})`).join('; ')}. It only arranges the toolkit's built nodes; it never writes analysis, invents a node or runs a check. Every change is a suggestion you see on the workflow first, then apply or discard; applied changes can be undone. A small language model (minishlab/potion-base-8M, MIT, {Math.round(MODEL_BYTES / 1e6)}&nbsp;MB, loaded once from Hugging Face and cached) reads your words in this browser; nothing you type leaves it. Until it has loaded, or if it can't, it matches words.
        </Help>
      </div>

      <form className="mt-2.5" onSubmit={(e) => { e.preventDefault(); void ask(text) }}>
        {/* one clear input: the request, two example requests and the main action inside the same box */}
        <div className="rounded-xl border border-line bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <label htmlFor="assistant-input" className="sr-only">Describe your tower or workflow</label>
          <textarea id="assistant-input" data-testid="assistant-input" value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { void warm() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
            placeholder="Describe your tower or workflow…" rows={2}
            className="block w-full resize-none rounded-xl border-0 bg-transparent px-4 pb-1 pt-3 text-body text-ink outline-none placeholder:text-muted focus-visible:outline-none" />
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-1">
            {EXAMPLES.slice(0, examples ? EXAMPLES.length : 2).map((x) => (
              <button key={x.label} type="button" onClick={() => { setText(x.text); void ask(x.text) }} title={x.text}
                className="rounded-lg bg-subtle px-2.5 py-1 text-meta text-ink outline-none hover:bg-selected focus-visible:ring-2 focus-visible:ring-accent">{x.label}</button>
            ))}
            <button type="button" onClick={() => setExamples((v) => !v)} aria-expanded={examples} data-testid="assistant-examples-toggle"
              className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-meta text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
              {examples ? 'Fewer' : 'More'}<ChevronDown size={12} className={examples ? 'rotate-180' : ''} aria-hidden />
            </button>
            <button type="submit" disabled={busy || !text.trim()} data-testid="assistant-suggest"
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}Suggest workflow
            </button>
          </div>
        </div>
      </form>

      <div role="status" aria-live="polite" data-testid="assistant-reply" className="mt-2.5 max-h-44 overflow-y-auto empty:hidden">
        {proposal && <ProposalCard p={proposal} current={p.board} onApply={apply} onDiscard={discard} />}
        {reply?.kind === 'explain' && (
          <div className="rounded-lg bg-subtle px-3.5 py-2.5" data-testid="assistant-explain">
            <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-node text-ink">{reply.name}</span><span className="text-meta text-muted">{reply.phase} phase{reply.onBoard ? ' · on the workflow' : ''}</span></div>
            <p className="mt-0.5 text-sm text-ink">{reply.question}</p>
            {reply.reads.length > 0 && <p className="mt-1 text-meta text-muted"><span className="font-semibold text-ink">It reads</span> {reply.reads.join('; ')}.</p>}
            {reply.asks.length > 0 ? <p className="text-meta text-muted"><span className="font-semibold text-ink">You give it</span> {reply.asks.join('; ')}.</p> : <p className="text-meta text-muted">Nothing to enter: it runs on the model.</p>}
            {!reply.onBoard && <button type="button" onClick={() => void ask(`Add ${reply.name}`)} className="mt-1.5 rounded-lg bg-panel px-3 py-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent">Add it to the workflow</button>}
          </div>
        )}
        {reply?.kind === 'clarify' && (
          <div className="rounded-lg border border-ai-line bg-ai-surface px-3.5 py-2.5" data-testid="assistant-clarify">
            <AiTag />
            <p className="mt-1 text-sm text-ink">{reply.question}</p>
            {reply.options.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">
              {reply.options.map((o) => <button key={o.label} type="button" onClick={() => { setText(o.text); void ask(o.text) }} className="rounded-lg bg-panel px-2.5 py-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent">{o.label}</button>)}
            </div>}
          </div>
        )}
        {!reply && applied && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3.5 py-2" data-testid="assistant-applied">
            <Check size={15} className="text-success" aria-hidden /><span className="min-w-0 flex-1 text-sm text-ink"><span className="font-semibold">Applied to your workflow.</span> {applied}</span>
            {p.canUndo && <button type="button" onClick={() => { p.onUndo(); setApplied(null) }} className="flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent"><Undo2 size={14} aria-hidden />Undo</button>}
          </div>
        )}
      </div>
    </section>
  )
}

/** The small, consistent mark of AI-proposed content. */
function AiTag() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-meta font-semibold text-ai ring-1 ring-ai-line" data-testid="ai-tag"><Sparkles size={12} aria-hidden />AI suggestion</span>
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** What a proposal would change, counted against the workflow on the canvas: nodes added and taken off, connections changed. */
export function proposalScope(p: Proposal, current: Board): { added: number; removed: number; connections: number; text: string } {
  const before = new Set(current.edges.map(edgeKey)), after = new Set(p.board.edges.map(edgeKey))
  const connections = [...after].filter((k) => !before.has(k)).length + [...before].filter((k) => !after.has(k)).length
  const parts = [
    p.added.length ? `adds ${plural(p.added.length, 'node')}` : '',
    p.removed.length ? `takes off ${plural(p.removed.length, 'node')}` : '',
    connections ? `changes ${plural(connections, 'connection')}` : '',
  ].filter(Boolean)
  const text = parts.length ? `${parts.join(', ')}.` : 'changes nothing on the workflow.'
  return { added: p.added.length, removed: p.removed.length, connections, text: text[0].toUpperCase() + text.slice(1) }
}

/** An AI proposal: its tag, scope and summary, the nodes it adds, takes off or loops, an explanation on demand, then
 *  Apply or Discard. Previewed on the canvas above, not yet part of the workflow. */
function ProposalCard({ p, current, onApply, onDiscard }: { p: Proposal; current: Board; onApply: () => void; onDiscard: () => void }) {
  const scope = useMemo(() => proposalScope(p, current), [p, current])
  const chip = 'inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-meta text-ink ring-1 ring-line'
  return (
    <div className="rounded-lg border border-ai-line bg-ai-surface px-3.5 py-2.5" data-testid="assistant-proposal">
      <div className="flex flex-wrap items-center gap-2">
        <AiTag />
        <span className="text-sm font-semibold text-ink" data-testid="assistant-scope">{scope.text}</span>
        <Help label="Why this suggestion">
          {p.preset ? `It starts from the “${p.preset.name}” preset and adjusts it to your words. ` : 'It places nodes whose questions match your words. '}
          {p.via === 'model' ? 'Your words were matched to the nodes by the small language model in this browser.' : 'Your words were matched to the nodes by keywords (the language model was not loaded).'} It only arranges built nodes: nothing is calculated until you open the workspace, and nothing changes until you apply it.
        </Help>
      </div>
      <p className="mt-1 text-sm text-ink">{p.capability === 'suggest' ? 'Suggested workflow, previewed above.' : 'Proposed change, previewed above.'} {p.summary}</p>
      {(p.added.length > 0 || p.removed.length > 0 || p.loops.length > 0 || p.unlooped > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {p.added.map((id) => <span key={`a${id}`} className={chip}><span aria-hidden className="font-semibold">+</span><span className="sr-only">Adds</span>{nodeName(id)}</span>)}
          {p.removed.map((id) => <span key={`r${id}`} className={`${chip} text-muted`}><span aria-hidden className="font-semibold">−</span><span className="sr-only">Takes off</span>{nodeName(id)}</span>)}
          {p.loops.map((e) => <span key={`l${e.a}${e.b}`} className={chip}><span aria-hidden>↻</span><span className="sr-only">Return connection</span>{nodeName(e.a)} → {nodeName(e.b)}</span>)}
          {p.unlooped > 0 && <span className={`${chip} text-muted`}>{p.unlooped === 1 ? 'return connection removed' : `${p.unlooped} return connections removed`}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApply} data-testid="assistant-apply" className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={15} aria-hidden />Apply changes</button>
        <button type="button" onClick={onDiscard} data-testid="assistant-discard" className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-1.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><X size={15} aria-hidden />Discard</button>
      </div>
    </div>
  )
}
