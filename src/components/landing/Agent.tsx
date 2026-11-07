// The landing page's agent. The whole first screen is the agent asking one open question (Ruijie, 7 Nov: "the landing
// page whole spread should just be the agent asking … the natural language AI agent could actually be benefiting more
// with the more open ended questions like what is the concept of your design and provide suggested workflows or
// otherwise just let the users select the roles"). The visitor describes the concept of their design; a small language
// model running in their browser (lib/agent/model2vec.ts) reads it against the built analysis nodes and the preset
// workflows (lib/agent/match.ts suggest) and offers a workflow made from the closest nodes plus the three closest
// presets. Or the visitor picks a role, and gets that role's presets. It never writes free text of its own: its reply
// is a fixed sentence around what it matched, and it says how it matched.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, Loader2, Lock, Sparkles } from '../icons'
import { ROLE_ICON } from '../RolePicker'
import Help from '../Help'
import { buildIndex, rankPresets, suggest, type Index, type Reading } from '../../lib/agent/match'
import { loadEmbedder, MODEL_BYTES, type Embedder } from '../../lib/agent/model2vec'
import { firstPhase } from '../../lib/phases'
import { BUILT_NODES } from '../../data/registry'
import { USER_TYPES, aType, presetById, typeInSentence, userType, useUserType, type Preset, type UserTypeId } from '../../lib/userTypes'

type Model = { e: Embedder; index: Index }
export interface AgentResult {
  /** The role, when the visitor picked one or the words made it clear (remembered for the top bar). */
  type: UserTypeId | null
  presets: Preset[]
  via: Reading['via'] | 'picked'
  /** The heading over the suggested workflows. */
  title: string
  /** Shown without moving the page (a returning visitor's workflows on load). */
  quiet?: boolean
}

/** The id of the workflow the agent builds from a concept (data/icons.ts PRESET_ICONS has its picture). */
export const CONCEPT_ID = 'concept'
const nodeName = (id: string) => BUILT_NODES.find((n) => n.id === id)?.name ?? id
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export default function Agent({ onResult }: { onResult: (r: AgentResult | null) => void }) {
  const remembered = useUserType()
  const [reply, setReply] = useState<ReactNode>(() => remembered.type
    ? <>Welcome back. Last time you started as {aType(remembered.type).replace(/ .*/, '')} <b>{typeInSentence(remembered.type)}</b>{remembered.preset && presetById(remembered.preset) ? <> with <b>{presetById(remembered.preset)!.name}</b></> : null}; your workflows are below.</>
    : null)
  const [text, setText] = useState('')
  const [model, setModel] = useState<Model | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [pct, setPct] = useState(0)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<UserTypeId | null>(null)

  // A returning visitor sees their role's workflows straight away.
  useEffect(() => { if (remembered.type) onResult({ type: remembered.type, presets: rankPresets('', remembered.type), via: 'picked', title: `Starting workflows for ${aType(remembered.type)}`, quiet: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Starts loading the model (on first focus): by the time a sentence is typed it is usually ready. */
  const warm = (): Promise<Model | null> => {
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
    setBusy(true)
    setPicked(null)
    try {
      // The model if it is (or soon is) ready; after 6 s the keywords answer and the model keeps loading for next time.
      const m = model ?? (await Promise.race([warm(), new Promise<null>((r) => setTimeout(() => r(null), 6000))]))
      const r = suggest(s, m)
      const type = r.reading.confident ? r.reading.types[0].type : null
      const concept: Preset[] = r.nodes.length ? [{
        id: CONCEPT_ID, type: type ?? 'designer', name: 'From your concept', goal: s, project: 'vtc', step: firstPhase(r.nodes).step, nodes: r.nodes, says: [],
      }] : []
      setReply(<>
        {r.nodes.length
          ? <>Your concept reads closest to <b>{list(r.nodes.slice(0, 3).map(nodeName))}</b>. I made a workflow from it and found {r.presets.length} more that fit; the first is on the board to change.</>
          : <>I couldn't tie that to a check yet. Here are {r.presets.length} workflows to start from, or pick a role below.</>}
        {r.reading.via === 'words' ? <span className="text-muted"> (matched by keywords)</span> : null}
      </>)
      onResult({ type, presets: [...concept, ...r.presets], via: r.reading.via, title: 'Workflows for your concept' })
    } finally { setBusy(false) }
  }

  const pick = (type: UserTypeId) => {
    setPicked(type)
    const presets = rankPresets('', type)
    setReply(<>{userType(type).name}: your {presets.length} starting workflows are below, and the first is on the board to change.</>)
    onResult({ type, presets, via: 'picked', title: `Starting workflows for ${aType(type)}` })
  }

  return (
    <section aria-labelledby="agent-title" className="grid w-full max-w-[44rem] justify-items-center gap-4" data-testid="landing-agent">
      <h2 id="agent-title" className="text-center text-[17px] font-medium text-ink">What is the concept of your design?</h2>

      <form onSubmit={(e) => { e.preventDefault(); void ask(text) }} className="glass flex w-full items-end gap-2 rounded-xl bg-glass-1 p-2.5 focus-within:ring-2 focus-within:ring-accent/40">
        <label htmlFor="agent-input" className="sr-only">Describe the concept of your design</label>
        <textarea id="agent-input" name="concept" autoComplete="off" data-testid="agent-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { void warm() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
          placeholder="A slender tower that keeps the mountain views and gives its ground floor back to the street…"
          className="min-h-[4.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[16px] leading-snug text-ink outline-none placeholder:text-muted/80" />
        <button type="submit" disabled={busy || !text.trim()} data-testid="agent-send" aria-label="Suggest workflows for this concept" title="Suggest workflows (Enter)"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
          {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ArrowUp size={20} aria-hidden />}
        </button>
      </form>

      {/* Or pick a role: chips under the box, who each one is on hover. */}
      <div role="group" aria-label="Or start as" className="flex flex-wrap items-center justify-center gap-2" data-testid="agent-types">
        <span className="text-[13px] text-muted">Or start as</span>
        {USER_TYPES.map((t) => { const Icon = ROLE_ICON[t.id]; return (
          <button key={t.id} type="button" onClick={() => pick(t.id)} title={t.who} aria-label={`${t.name}: ${t.who}`} aria-pressed={picked === t.id} data-type={t.id}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${picked === t.id ? 'border-white/90 bg-white/90 font-semibold text-ink shadow-sm' : 'border-white/70 bg-white/35 text-ink hover:bg-white/70'}`}>
            <Icon size={16} className="text-accent" aria-hidden />{t.name}
          </button>
        ) })}
      </div>

      <div role="status" aria-live="polite" data-testid="agent-reply" className="min-h-[1.5rem] max-w-[40rem] text-center text-[15px] leading-relaxed text-ink">
        {busy ? <span className="text-muted"><Loader2 size={14} className="mr-1 inline animate-spin" aria-hidden />Reading{status === 'loading' ? `, loading the language model: ${Math.round(pct * 100)}%` : '…'}</span> : reply}
      </div>

      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-muted" data-testid="agent-model-status">
        {status === 'ready' ? <Sparkles size={14} className="text-accent" aria-hidden /> : <Lock size={14} aria-hidden />}
        <span>{status === 'ready' ? 'Language model ready, in this browser' : status === 'failed' ? 'Matching by keywords' : 'Runs in this browser'}</span>
        {status === 'loading' && <span className="h-1.5 w-28 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Loading the language model" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}><span className="block h-full bg-accent" style={{ width: `${Math.round(pct * 100)}%` }} /></span>}
        <Help label="About the agent">A small language model (minishlab/potion-base-8M, MIT) reads your words in this browser: {Math.round(MODEL_BYTES / 1e6)}&nbsp;MB, loaded once from Hugging Face, then cached. Nothing you type leaves the browser. Before it has loaded, or if it can't, I match by keywords. I only rank the built analysis nodes and the preset workflows against your concept; I never decide anything for you, and every suggestion stays editable.</Help>
      </p>
    </section>
  )
}
