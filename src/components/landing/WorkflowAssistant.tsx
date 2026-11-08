// The workflow assistant on the cover, directly below the workflow canvas (Ruijie, 7 Nov: "Define the AI as a workflow-
// building assistant … translates a user's design intention into an editable arrangement of available nodes, and helps
// them modify and understand that workflow"). The visitor describes an intention; the assistant (lib/agent/
// workflowAssistant.ts) prepares a proposal, the canvas above previews it, a short summary says what changed, and the
// visitor applies or discards it; applied changes come back with Undo. It can also explain a node (what it answers,
// what it reads, what it asks for) and asks one focused question when a request can't be placed. It only arranges the
// built nodes; Open workspace opens whatever the canvas shows.
import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, Loader2, Lock, Sparkles, Undo2, X } from '../icons'
import Help from '../Help'
import { buildIndex } from '../../lib/agent/match'
import { loadEmbedder, MODEL_BYTES } from '../../lib/agent/model2vec'
import { interpret, nodeName, type Model, type Proposal, type Reply } from '../../lib/agent/workflowAssistant'
import type { Board } from '../../lib/workflowGraph'

const CAPABILITIES: { word: string; what: string }[] = [
  { word: 'Suggest', what: 'Proposes a starting workflow from a project description.' },
  { word: 'Modify', what: 'Proposes adding, removing or looping nodes on the workflow above.' },
  { word: 'Explain', what: 'Says what a node answers, what it reads from the model and what it asks you for.' },
  { word: 'Clarify', what: 'Asks one focused question when a detail is missing.' },
]
/** Example requests: a short label, and the full request it runs. */
const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Mixed-use, public ground floor', text: 'Help me explore a mixed-use tower with a public ground floor.' },
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
  onOpenWorkspace: (from: HTMLElement) => void
  canOpen: boolean
  /** The Presets control, at the right of the assistant's header (Ruijie, 7 Nov: it replaces "Other ways in"). */
  headerRight?: ReactNode
}

export default function WorkflowAssistant(p: AssistantProps) {
  const [text, setText] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState<Model>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [pct, setPct] = useState(0)

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
    setBusy(true); setApplied(null)
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
      className="glass glass-tile pointer-events-auto relative w-[min(45rem,calc(100vw-2rem))] rounded-xl bg-glass-1 px-5 pb-4 pt-3.5 text-ink">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-control font-semibold text-accent"><Sparkles size={16} aria-hidden />Workflow assistant</span>
        <ul className="flex flex-wrap items-center gap-x-2.5 text-meta text-muted" aria-label="What it can do">
          {CAPABILITIES.map((c) => <li key={c.word} title={c.what}>{c.word}</li>)}
        </ul>
        <span className="flex items-center gap-1 text-meta text-muted" data-testid="assistant-model">
          {status === 'ready' ? <Sparkles size={13} className="text-accent" aria-hidden /> : <Lock size={13} aria-hidden />}
          {status === 'ready' ? 'Model ready' : status === 'loading' ? `Loading ${Math.round(pct * 100)}%` : status === 'failed' ? 'Keywords' : 'In this browser'}
          <Help label="About the workflow assistant">It arranges the built analysis nodes into a workflow you can edit: it suggests, modifies, explains and asks; it never writes analysis or invents a node. A small language model (minishlab/potion-base-8M, MIT, {Math.round(MODEL_BYTES / 1e6)}&nbsp;MB, loaded once from Hugging Face and cached) reads your words in this browser; nothing you type leaves it. Until it has loaded, or if it can't, it matches words.</Help>
        </span>
        {p.headerRight}
      </div>
      <h2 id="assistant-title" className="mt-1.5 text-section text-ink">What would you like to explore?</h2>
      <p className="text-meta text-muted">Describe your project and goals. The assistant will suggest nodes and connect an editable workflow.</p>

      <form className="mt-2.5" onSubmit={(e) => { e.preventDefault(); void ask(text) }}>
        <div className="relative">
          <label htmlFor="assistant-input" className="sr-only">Describe your project and goals</label>
          <textarea id="assistant-input" data-testid="assistant-input" value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { void warm() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
            placeholder="Explore a mixed-use tower in Vancouver with a public ground floor…" rows={4}
            className="block h-[7.5rem] w-full resize-none rounded-xl border border-line bg-white/70 px-3.5 pb-12 pt-3 text-body text-ink outline-none placeholder:text-muted/80 focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/40" />
          <button type="submit" disabled={busy || !text.trim()} data-testid="assistant-suggest"
            className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}Suggest workflow
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-meta text-muted">Try</span>
          {EXAMPLES.map((x) => (
            <button key={x.label} type="button" onClick={() => { setText(x.text); void ask(x.text) }} title={x.text}
              className="rounded-xl bg-white/45 px-2.5 py-1 text-meta text-muted outline-none hover:bg-white/80 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">{x.label}</button>
          ))}
          <button type="button" onClick={(e) => p.onOpenWorkspace(e.currentTarget)} disabled={!p.canOpen} data-testid="assistant-open"
            title="Open the workspace with the workflow shown above"
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-control text-ink outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">Open workspace<ArrowRight size={15} aria-hidden /></button>
        </div>
      </form>

      <div role="status" aria-live="polite" data-testid="assistant-reply" className="mt-2.5 max-h-40 overflow-y-auto empty:hidden">
        {proposal && <ProposalCard p={proposal} onApply={apply} onDiscard={discard} />}
        {reply?.kind === 'explain' && (
          <div className="rounded-xl bg-white/55 px-3.5 py-2.5" data-testid="assistant-explain">
            <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-node text-ink">{reply.name}</span><span className="text-meta text-muted">{reply.phase} phase{reply.onBoard ? ' · on the workflow' : ''}</span></div>
            <p className="mt-0.5 text-sm text-ink">{reply.question}</p>
            {reply.reads.length > 0 && <p className="mt-1 text-meta text-muted"><span className="font-semibold text-ink">It reads</span> {reply.reads.join('; ')}.</p>}
            {reply.asks.length > 0 ? <p className="text-meta text-muted"><span className="font-semibold text-ink">You give it</span> {reply.asks.join('; ')}.</p> : <p className="text-meta text-muted">Nothing to enter: it runs on the model.</p>}
            {!reply.onBoard && <button type="button" onClick={() => void ask(`Add ${reply.name}`)} className="mt-1.5 rounded-xl bg-white px-3 py-1 text-control outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-accent">Add it to the workflow</button>}
          </div>
        )}
        {reply?.kind === 'clarify' && (
          <div className="rounded-xl bg-white/55 px-3.5 py-2.5" data-testid="assistant-clarify">
            <p className="text-sm text-ink">{reply.question}</p>
            {reply.options.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">
              {reply.options.map((o) => <button key={o.label} type="button" onClick={() => { setText(o.text); void ask(o.text) }} className="rounded-xl bg-white px-2.5 py-1 text-control outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-accent">{o.label}</button>)}
            </div>}
          </div>
        )}
        {!reply && applied && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/55 px-3.5 py-2" data-testid="assistant-applied">
            <Check size={15} className="text-[#2e8b57]" aria-hidden /><span className="min-w-0 flex-1 text-sm text-ink">Applied. {applied}</span>
            {p.canUndo && <button type="button" onClick={() => { p.onUndo(); setApplied(null) }} className="flex items-center gap-1 rounded-xl bg-white px-2.5 py-1 text-control outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-accent"><Undo2 size={14} aria-hidden />Undo</button>}
          </div>
        )}
      </div>
    </section>
  )
}

/** What a proposal changes, as a short summary and the nodes it adds, takes off or loops; then Apply or Discard. */
function ProposalCard({ p, onApply, onDiscard }: { p: Proposal; onApply: () => void; onDiscard: () => void }) {
  const chip = 'inline-flex items-center rounded-xl px-2 py-0.5 text-meta'
  return (
    <div className="rounded-xl bg-white/55 px-3.5 py-2.5" data-testid="assistant-proposal">
      <p className="text-sm text-ink"><span className="font-semibold">{p.capability === 'suggest' ? 'Suggested workflow, shown above.' : 'Proposed change, shown above.'}</span> {p.summary}</p>
      {(p.added.length > 0 || p.removed.length > 0 || p.loops.length > 0 || p.unlooped > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {p.added.map((id) => <span key={`a${id}`} className={`${chip} bg-[#2e8b57]/12 text-[#1f6b42]`}>+ {nodeName(id)}</span>)}
          {p.removed.map((id) => <span key={`r${id}`} className={`${chip} bg-[#d0453a]/10 text-[#a0322a]`}>− {nodeName(id)}</span>)}
          {p.loops.map((e) => <span key={`l${e.a}${e.b}`} className={`${chip} bg-[hsl(26_92%_54%/0.14)] text-[hsl(26_80%_32%)]`}>↻ {nodeName(e.a)} → {nodeName(e.b)}</span>)}
          {p.unlooped > 0 && <span className={`${chip} bg-black/5 text-muted`}>{p.unlooped === 1 ? 'loop removed' : `${p.unlooped} loops removed`}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApply} data-testid="assistant-apply" className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent"><Check size={15} aria-hidden />Apply changes</button>
        <button type="button" onClick={onDiscard} data-testid="assistant-discard" className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-control text-ink outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-accent"><X size={15} aria-hidden />Discard</button>
        {p.via === 'words' && <span className="text-meta text-muted">Matched by keywords</span>}
      </div>
    </div>
  )
}
