// Decision trace tab (research P16-M04, with rule cards from P16-M02): what changed since the last iteration, a
// timeline of iterations coloured by their worst result, the diff to the previous one, human-written decisions, and
// the rule cards behind the checks. The tool records; people decide and write the reasons.
import { BookOpen, ChevronDown, ChevronRight, Diamond, GitCommitHorizontal, MessageSquarePlus, RotateCcw, ScrollText } from './icons'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { RULE_CARDS } from '../data/ruleCards'
import { linesForCard, sourceIndex } from '../lib/trace/sources'
import { reviewStatus } from '../lib/trace/review'
import { RuleCardView, SourceList } from './RuleCardView'
import TraceExport from './TraceExport'
import type { RuleState } from '../engine/types'
import { useCommunityResults } from '../hooks/useCommunityResults'
import { useResults } from '../hooks/useResults'
import { useCommunityStore } from '../lib/communityStore'
import { counts, diffResults, digestResults, weakestFlag, worstState, type Digest, type ResultChange } from '../lib/trace/digest'
import { pickDesign } from '../lib/project/design'
import { addDecision, currentDesign, designHash, diffDesign, recordIteration, restoreIteration, setLive, useTrace, type Iteration, type Outcome } from '../lib/trace/trace'
import { useStore } from '../store'
import { useNature } from './NatureLedger'
import { useWindProcedures } from './WindStructurePanel'
import { useStructures } from './StructurePanel'
import { useLifeSafety } from './LifeSafetyPanel'
import { useRelaxAviation } from './RelaxAviationPanel'
import { windStudyRules } from '../engine/windStructure'
import { FlagChip, Section, StateChip } from './ui'

/** Keeps the trace's view of the live results current. Renders nothing; mounted once with the top bar. */
export function TraceRecorder() {
  const results = useResults()
  const runs = useCommunityResults()
  const packages = useCommunityStore((s) => s.packages)
  const design = useStore(useShallow(pickDesign))
  const nature = useNature(design.project === 'city' ? results.cones : null)
  const wind = useWindProcedures()
  const structure = useStructures()
  const lifeSafety = useLifeSafety()
  const relaxAviation = useRelaxAviation()
  useEffect(() => {
    const names = Object.fromEntries(packages.map((p) => [p.id, p.name]))
    const on = new Map([...runs].filter(([id]) => design.enabled[id]))
    const isOn = (id: string) => !!design.enabled[id]
    const towers = design.towers[design.project]
    const all = {
      ...results,
      nature: isOn('built.city-in-nature') ? nature.rules : [],
      wind: isOn('built.wind-procedure') ? wind.map((w) => ({ tower: w.tower, rules: w.rules })) : [],
      structure: isOn('built.structure') ? structure.map((s) => ({ tower: s.tower, rules: s.rules })) : [],
      windStudy: isOn('built.wind-study') ? windStudyRules(Math.max(0, ...towers.map((t) => t.height))) : [],
      lifeSafety: isOn('built.life-safety') ? lifeSafety.map((r) => ({ tower: r.tower, rules: r.rules })) : [],
      relaxAviation: isOn('built.relax-aviation') ? relaxAviation.map((r) => ({ tower: r.tower, rules: r.rules })) : [],
    }
    setLive(designHash(design), digestResults(all as unknown as Record<string, unknown>, on, names))
  }, [results, runs, packages, design, nature, wind, structure, lifeSafety, relaxAviation])
  return null
}

const DOT: Record<RuleState, string> = { fail: 'bg-red-600', warn: 'bg-amber-500', unknown: 'bg-slate-400', pass: 'bg-emerald-600' }
const DIAMOND: Record<RuleState, string> = { fail: 'text-red-600', warn: 'text-amber-500', unknown: 'text-slate-400', pass: 'text-emerald-600' }
const time = (iso: string) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const KIND: Record<Iteration['kind'], string> = { checkpoint: 'Recorded', saved: 'Saved', opened: 'Opened', new: 'New project', decision: 'Decision' }
const OUTCOME: Record<Outcome, string> = { chosen: 'bg-emerald-50 text-emerald-800 border-emerald-200', rejected: 'bg-red-50 text-red-800 border-red-200', deferred: 'bg-slate-50 text-slate-700 border-slate-200' }

function Changes({ design, results, max = 8 }: { design: string[]; results: ResultChange[]; max?: number }) {
  const [all, setAll] = useState(false)
  const r = all ? results : results.slice(0, max), d = all ? design : design.slice(0, max)
  if (!design.length && !results.length) return <p className="text-[11px] text-muted">No changes.</p>
  return (
    <div className="grid gap-2 text-[11px]">
      {d.length > 0 && (
        <div>
          <div className="mb-0.5 font-semibold text-slate-700">Design</div>
          <ul className="grid gap-0.5">{d.map((x, i) => <li key={i} className="text-slate-700">{x}</li>)}</ul>
        </div>
      )}
      {r.length > 0 && (
        <div>
          <div className="mb-0.5 font-semibold text-slate-700">Results</div>
          <ul className="grid gap-1">
            {r.map((c) => (
              <li key={c.id} className={`rounded border-l-2 pl-1.5 ${c.kind === 'worse' ? 'border-red-400' : c.kind === 'better' ? 'border-emerald-500' : 'border-line'}`}>
                <div className="text-slate-800">{c.label} <span className="text-[10px] text-muted">· {c.group}</span></div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
                  {c.before ? <><span className="tabular-nums">{c.before.value}</span><StateChip state={c.before.state} /></> : <span>new</span>}
                  <span>→</span>
                  {c.after ? <><span className="tabular-nums">{c.after.value}</span><StateChip state={c.after.state} /></> : <span>no longer checked</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(results.length > max || design.length > max) && <button onClick={() => setAll((v) => !v)} className="w-fit text-[11px] text-accent hover:underline">{all ? 'Show fewer' : 'Show all changes'}</button>}
    </div>
  )
}

function Summary({ d }: { d: Digest }) {
  const c = counts(d), flag = weakestFlag(d)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
      {c.fail > 0 && <span className="font-semibold text-red-700">{c.fail} fail</span>}
      {c.warn > 0 && <span className="font-semibold text-amber-700">{c.warn} check</span>}
      <span>{c.pass} pass</span>
      {c.unknown > 0 && <span className="text-muted">{c.unknown} unknown</span>}
      {flag && <span className="flex items-center gap-1 text-[10px] text-muted">weakest evidence <FlagChip flag={flag} /></span>}
    </div>
  )
}

function DecisionForm({ onDone }: { onDone: () => void }) {
  const lastAuthor = useTrace((s) => s.author)
  const [issue, setIssue] = useState(''), [option, setOption] = useState(''), [rationale, setRationale] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('chosen'), [author, setAuthor] = useState(lastAuthor)
  const ok = issue.trim() && rationale.trim()
  const field = 'w-full rounded border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent'
  return (
    <form className="grid gap-2 rounded-md border border-accent/40 bg-accent/[0.03] p-2" onSubmit={(e) => { e.preventDefault(); if (addDecision({ issue, option, outcome, rationale, author })) onDone() }}>
      <label className="grid gap-0.5 text-[11px] text-muted">Question you were deciding<input value={issue} onChange={(e) => setIssue(e.target.value)} className={field} placeholder="e.g. Keep the tower at 285 m or lower it?" maxLength={500} required /></label>
      <label className="grid gap-0.5 text-[11px] text-muted">Option<input value={option} onChange={(e) => setOption(e.target.value)} className={field} placeholder="e.g. Lower to 250 m" maxLength={500} /></label>
      <fieldset className="flex gap-1 text-[11px]">
        <legend className="sr-only">Outcome</legend>
        {(['chosen', 'rejected', 'deferred'] as const).map((o) => (
          <label key={o} className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 capitalize ${outcome === o ? OUTCOME[o] : 'border-line text-muted'}`}>
            <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="sr-only" />{o}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-0.5 text-[11px] text-muted">Why (in your own words)<textarea value={rationale} onChange={(e) => setRationale(e.target.value)} className={`${field} h-16 resize-y`} maxLength={2000} required /></label>
      <label className="grid gap-0.5 text-[11px] text-muted">Your name<input value={author} onChange={(e) => setAuthor(e.target.value)} className={field} maxLength={80} /></label>
      <p className="text-[10px] text-muted">The current design and its results are recorded with the decision. Rationales are always written by people; the tool never drafts one.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded border border-line px-2.5 py-1 text-xs">Cancel</button>
        <button type="submit" disabled={!ok} className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">Record decision</button>
      </div>
    </form>
  )
}

export default function TracePanel() {
  const { iterations, decisions, live } = useTrace()
  const present = useStore((s) => s.phase === 'present')
  const [selected, setSelected] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [cardsOpen, setCardsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const sources = useMemo(() => sourceIndex(live?.digest.lines ?? []), [live])
  const reviews = useTrace((s) => s.reviews)
  const reviewedCount = RULE_CARDS.filter((c) => reviewStatus(c, reviews).state === 'reviewed').length
  const last = iterations[iterations.length - 1]
  const sel = iterations.find((i) => i.id === selected) ?? last
  const selIndex = sel ? iterations.indexOf(sel) : -1
  const prev = selIndex > 0 ? iterations[selIndex - 1] : undefined

  const pending = useMemo(() => {
    if (!live || !last || live.hash === last.hash) return null
    return { design: diffDesign(last.design, currentDesign()), results: diffResults(last.digest, live.digest) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, last])

  const record = () => { recordIteration(label || `Iteration ${iterations.length + 1}`); setLabel(''); setSelected(null) }

  return (
    <div>
      <Section title="Decision trace" help="Record iterations as you work: each keeps the design and what every check said, so you can compare, explain and go back. A decision records your reason; the tool never writes one.">
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); record() }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Iteration ${iterations.length + 1}`} aria-label="Iteration name" maxLength={200}
            className="min-w-0 flex-1 rounded border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent" />
          <button type="submit" className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"><GitCommitHorizontal size={14} />Record</button>
        </form>
        {live && <div className="mt-2"><Summary d={live.digest} /></div>}
      </Section>

      {(pending || !last) && (
        <Section title={last ? 'Since the last iteration' : 'Nothing recorded yet'}>
          {pending ? <Changes design={pending.design} results={pending.results} max={5} /> : <p className="text-[11px] text-muted">Record the current design to start the trace. Saving, opening and decisions record iterations too.</p>}
        </Section>
      )}

      {iterations.length > 0 && (
        <Section title={`Iterations · ${iterations.length}`}>
          <div className="flex items-center gap-1 overflow-x-auto pb-1" role="listbox" aria-label="Iterations">
            {iterations.map((it, i) => {
              const decided = decisions.some((d) => d.iterationId === it.id)
              const on = sel?.id === it.id
              return (
                <button key={it.id} role="option" aria-selected={on} onClick={() => setSelected(it.id)} title={`${it.label} · ${time(it.at)}`}
                  className={`flex shrink-0 flex-col items-center gap-0.5 rounded px-1 py-1 ${on ? 'bg-accent/10' : 'hover:bg-black/5'}`}>
                  {decided ? <Diamond size={12} className={`${DIAMOND[worstState(it.digest)]} fill-current`} /> : <span className={`h-3 w-3 rounded-full ${DOT[worstState(it.digest)]}`} />}
                  <span className="text-[9px] tabular-nums text-muted">{i + 1}</span>
                </button>
              )
            })}
          </div>
          {sel && (
            <div className="mt-2 grid gap-2">
              <div>
                <div className="text-xs font-semibold">{sel.label}</div>
                <div className="text-[10px] text-muted">{KIND[sel.kind]} · {time(sel.at)}</div>
                <div className="mt-1"><Summary d={sel.digest} /></div>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{prev ? `Compared with ${selIndex}. ${prev.label}` : 'First iteration'}</div>
              {prev && <Changes design={diffDesign(prev.design, sel.design)} results={diffResults(prev.digest, sel.digest)} />}
              <div className="flex flex-wrap gap-2">
                <button disabled={present || sel.hash === live?.hash} onClick={() => restoreIteration(sel.id)} title={present ? 'The model is locked in Present' : sel.hash === live?.hash ? 'This is the current design' : 'Put this design back (Ctrl+Z undoes it)'}
                  className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent hover:text-accent disabled:opacity-40"><RotateCcw size={12} />Restore this design</button>
                <button onClick={() => setDeciding(true)} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent hover:text-accent"><MessageSquarePlus size={12} />Record a decision</button>
              </div>
            </div>
          )}
        </Section>
      )}

      {(deciding || decisions.length > 0) && (
        <Section title={`Decisions · ${decisions.length}`} right={!deciding ? <button onClick={() => setDeciding(true)} className="text-[11px] text-accent hover:underline">Add</button> : undefined}>
          {deciding && <DecisionForm onDone={() => setDeciding(false)} />}
          <div className="mt-2 grid gap-2">
            {[...decisions].reverse().map((d) => {
              const it = iterations.findIndex((x) => x.id === d.iterationId)
              return (
                <div key={d.id} className="rounded-md border border-line p-2 text-[11px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink">{d.issue}</span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${OUTCOME[d.outcome]}`}>{d.outcome}</span>
                  </div>
                  {d.option && <div className="text-slate-700">Option: {d.option}</div>}
                  <blockquote className="mt-1 border-l-2 border-line pl-2 text-slate-800">{d.rationale}</blockquote>
                  <div className="mt-1 text-[10px] text-muted">{d.author} · {time(d.at)} · written by a person{it >= 0 && <> · <button className="text-accent hover:underline" onClick={() => setSelected(d.iterationId)}>iteration {it + 1}</button></>}</div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Rule cards">
        <button onClick={() => setCardsOpen((v) => !v)} aria-expanded={cardsOpen} className="flex w-full items-center gap-1 text-left text-[11px] text-slate-700 hover:text-ink">
          {cardsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<ScrollText size={12} />The {RULE_CARDS.length} clauses the built checks apply · {reviewedCount} reviewed
        </button>
        {cardsOpen && (
          <div className="mt-2 grid gap-2">
            {RULE_CARDS.map((c) => <RuleCardView key={c.id} card={c} lines={linesForCard(c, live?.digest.lines ?? [])} />)}
            <p className="text-[10px] text-muted">Review blind (research P16-M02): a person who did not draft the card opens the source, types their own reading with the card hidden, then compares and gives a verdict. It counts only if the blind reading also gave the same type and strength. Reviews are saved in this project's trace. Drill cards and the second-model agreement check are roadmap.</p>
          </div>
        )}
        <button onClick={() => setSourcesOpen((v) => !v)} aria-expanded={sourcesOpen} className="mt-2 flex w-full items-center gap-1 text-left text-[11px] text-slate-700 hover:text-ink">
          {sourcesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<BookOpen size={12} />All sources in use · {sources.length} ({sources.filter((e) => !e.cards.length).length} without a card)
        </button>
        {sourcesOpen && (
          <div className="mt-2">
            <SourceList entries={sources} />
            <p className="mt-1 text-[10px] text-muted">Every document and clause the live results cite, by document, each with its worst result and weakest evidence. A source without a card is cited by a check but not yet summarised for review.</p>
          </div>
        )}
      </Section>
      <TraceExport />
    </div>
  )
}
