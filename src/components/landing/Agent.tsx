// The landing page's agent (Ruijie, 6 Nov: "start the page with a landing page with an natural language model agent to
// help the tool define its users"). The visitor says who they are in their own words; a small language model running in
// their browser (lib/agent/model2vec.ts) reads it against the four user types (lib/userTypes.ts) and offers that type's
// starting workflows, the closest first. When it is unsure it asks; the visitor can always pick a type by hand. It never
// writes free text of its own: its replies are fixed sentences around what it matched, and it says how it matched.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Lock, Sparkles } from '../icons'
import { ROLE_ICON } from '../RolePicker'
import Help from '../Help'
import { buildIndex, rankPresets, readText, type Index, type Reading } from '../../lib/agent/match'
import { loadEmbedder, MODEL_BYTES, type Embedder } from '../../lib/agent/model2vec'
import { USER_TYPES, aType, presetById, typeInSentence, userType, useUserType, type Preset, type UserTypeId } from '../../lib/userTypes'

type Model = { e: Embedder; index: Index }
interface Msg { from: 'agent' | 'you'; body: ReactNode; id: number }
export interface AgentResult { type: UserTypeId; presets: Preset[]; via: Reading['via'] | 'picked' }

let nextId = 1

export default function Agent({ onResult }: { onResult: (r: AgentResult | null) => void }) {
  const remembered = useUserType()
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ from: 'agent', id: 0, body: remembered.type
    ? <>Welcome back. Last time you started as {aType(remembered.type).replace(/ .*/, '')} <b>{typeInSentence(remembered.type)}</b>{remembered.preset && presetById(remembered.preset) ? <> with <b>{presetById(remembered.preset)!.name}</b></> : null}. Tell me if you are working on something else.</>
    : <>Who are you, and what are you designing? A sentence is enough.</> }])
  const [text, setText] = useState('')
  const [model, setModel] = useState<Model | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [pct, setPct] = useState(0)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<UserTypeId[] | null>(null)
  const last = useRef('')
  const log = useRef<HTMLOListElement>(null)

  // A returning visitor sees their type's workflows straight away.
  useEffect(() => { if (remembered.type) onResult({ type: remembered.type, presets: rankPresets('', remembered.type), via: 'picked' }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' }) }, [msgs])

  const say = (from: Msg['from'], body: ReactNode) => setMsgs((m) => [...m, { from, body, id: nextId++ }])

  /** Starts loading the model (on first focus): by the time a sentence is typed it is usually ready. */
  const warm = (): Promise<Model | null> => {
    if (model) return Promise.resolve(model)
    if (status === 'failed') return Promise.resolve(null)
    setStatus((s) => (s === 'idle' ? 'loading' : s))
    return loadEmbedder((d, t) => setPct(Math.min(1, d / t)))
      .then((e) => { const m = { e, index: buildIndex(e) }; setModel(m); setStatus('ready'); return m })
      .catch(() => { setStatus('failed'); return null })
  }

  const settle = (type: UserTypeId, said: string, m: Model | null, via: AgentResult['via']) => {
    setAsking(null)
    const t = userType(type), presets = rankPresets(said, type, m)
    say('agent', <>
      {via === 'picked' ? <>{t.name}.</> : <>You sound like {aType(type).replace(/ .*/, '')} <b>{typeInSentence(type)}</b>.</>}
      {' '}Your {presets.length} starting workflows are below{said.trim() ? ', the closest first' : ''}, and the first is on the board to change.
    </>)
    onResult({ type, presets, via })
  }

  const ask = async (said: string) => {
    const s = said.trim()
    if (!s || busy) return
    last.current = s
    setText('')
    say('you', s)
    setBusy(true)
    try {
      let m = model
      // Keywords first when they are clear and the model is still on its way; else wait for the model.
      const quick = readText(s, null)
      if (!m && quick.confident && status !== 'ready') { void warm(); settle(quick.types[0].type, s, null, 'words'); return }
      m = m ?? (await warm())
      const r = readText(s, m)
      if (r.confident) { settle(r.types[0].type, s, m, r.via); return }
      const top = r.types.slice(0, 2).map((x) => x.type)
      setAsking(top)
      say('agent', <>I'm not sure yet. Are you closer to {aType(top[0]).replace(/ .*/, '')} <b>{typeInSentence(top[0])}</b> or {aType(top[1]).replace(/ .*/, '')} <b>{typeInSentence(top[1])}</b>? Pick one below, or tell me more.</>)
    } finally { setBusy(false) }
  }

  // A type picked by hand: its workflows in their curated order (a sentence about another type should not reorder them),
  // unless the agent was asking between the two closest, when the sentence was about this choice.
  const pick = (type: UserTypeId) => { say('you', userType(type).name); settle(type, asking?.includes(type) ? last.current : '', model, 'picked') }

  return (
    <section aria-labelledby="agent-title" className="grid gap-3" data-testid="landing-agent">
      <h2 id="agent-title" className="sr-only">Find your starting workflow</h2>
      <div role="log" aria-live="polite" aria-label="Conversation with the agent"><ol ref={log} className="grid max-h-[17rem] gap-2 overflow-y-auto pr-1">
        {msgs.map((m) => (
          <li key={m.id} className={m.from === 'you' ? 'justify-self-end' : 'justify-self-start'}>
            <p className={`max-w-[34rem] break-words rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed ${m.from === 'you' ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border border-line bg-panel text-ink'}`}>
              <span className="sr-only">{m.from === 'you' ? 'You: ' : 'Agent: '}</span>{m.body}
            </p>
          </li>
        ))}
        {busy && <li className="justify-self-start text-[13px] text-muted"><Loader2 size={13} className="mr-1 inline animate-spin" aria-hidden />Reading{status === 'loading' ? `, loading the language model: ${Math.round(pct * 100)}%` : '…'}</li>}
      </ol></div>

      {asking && (
        <div role="group" aria-label="Which describes you?" className="flex flex-wrap gap-1.5">
          {[...asking, ...USER_TYPES.map((t) => t.id).filter((id) => !asking.includes(id))].map((id) => <TypeChip key={id} id={id} strong={asking.includes(id)} onPick={pick} />)}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void ask(text) }} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-2 shadow-[0_1px_0_rgba(31,35,40,0.04)] focus-within:border-accent sm:flex-row sm:items-end">
        <label htmlFor="agent-input" className="sr-only">Tell the agent who you are and what you are designing</label>
        <textarea id="agent-input" name="about-you" autoComplete="off" data-testid="agent-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { void warm() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
          placeholder="For example: I'm an architect testing a rezoning downtown…"
          className="min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-snug text-ink outline-none placeholder:text-muted/80" />
        <button type="submit" disabled={busy} data-testid="agent-send"
          className="rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40">Find my workflows</button>
      </form>

      {/* Or pick a type: four big tiles, who each one is on hover. */}
      <div role="group" aria-label="Or pick who you are" className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="agent-types">
        {USER_TYPES.map((t) => { const Icon = ROLE_ICON[t.id]; return (
          <button key={t.id} type="button" onClick={() => pick(t.id)} title={t.who} aria-label={`${t.name}: ${t.who}`} data-type={t.id}
            className="group flex items-center gap-2.5 rounded-2xl border border-line bg-panel p-2 text-left text-[13px] font-medium leading-tight text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white" aria-hidden><Icon size={24} /></span>{t.name}
          </button>
        ) })}
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted" data-testid="agent-model-status">
        {status === 'ready' ? <Sparkles size={14} className="text-accent" aria-hidden /> : <Lock size={14} aria-hidden />}
        <span>{status === 'ready' ? 'Language model ready, in this browser' : status === 'failed' ? 'Matching by keywords' : 'Runs in this browser'}</span>
        {status === 'loading' && <span className="h-1.5 w-28 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Loading the language model" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}><span className="block h-full bg-accent" style={{ width: `${Math.round(pct * 100)}%` }} /></span>}
        <Help label="About the agent">A small language model (minishlab/potion-base-8M, MIT) reads your words in this browser: {Math.round(MODEL_BYTES / 1e6)}&nbsp;MB, loaded once from Hugging Face, then cached. Nothing you type leaves the browser. Before it has loaded, or if it can't, I match by keywords. I only pick a type and order the presets; I never decide anything for you.</Help>
      </p>
    </section>
  )
}

function TypeChip({ id, strong, onPick }: { id: UserTypeId; strong: boolean; onPick: (id: UserTypeId) => void }) {
  const t = userType(id), Icon = ROLE_ICON[id]
  return (
    <button type="button" onClick={() => onPick(id)} data-type={id}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent ${strong ? 'border-accent bg-accent/[0.07] font-semibold text-ink' : 'border-line bg-panel text-muted hover:border-accent hover:text-ink'}`}>
      <Icon size={14} className="text-accent" aria-hidden />{t.name}
    </button>
  )
}
