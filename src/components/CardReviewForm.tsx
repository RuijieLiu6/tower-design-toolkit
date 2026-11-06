// Blind-first rule-card review (research P16-M02): first the reviewer reads the clause in the source and types their own
// reading, without seeing the card; then the card is shown beside their reading and they give a verdict. The tool fills
// nothing in for them and never records a review on its own.
import { Check, X } from './icons'
import { useRef, useState } from 'react'
import type { Deontic, RuleCard, Strength } from '../data/ruleCards'
import { makeReview, type Reading, type Verdict } from '../lib/trace/review'
import { addReview, useTrace } from '../lib/trace/trace'

const DEONTIC_OPTIONS: [Deontic, string][] = [['obligation', 'Obligation (must)'], ['prohibition', 'Prohibition (must not)'], ['permission', 'Permission (may)'], ['recommendation', 'Guidance only (binds no one)']]
const STRENGTH_OPTIONS: [Strength, string][] = [['strict', 'Strict: no exceptions in the text'], ['defeasible', 'Defeasible: exceptions or departures allowed']]
const input = 'w-full rounded border border-line bg-panel px-1.5 py-1 text-[11px] outline-none focus:border-accent'
const DEONTIC_WORD = Object.fromEntries(DEONTIC_OPTIONS) as Record<Deontic, string>

function Mark({ ok }: { ok: boolean }) {
  return ok ? <Check size={12} className="inline text-emerald-700" aria-label="matches" /> : <X size={12} className="inline text-red-700" aria-label="differs" />
}

export default function CardReviewForm({ card: c, onDone }: { card: RuleCard; onDone: () => void }) {
  const opened = useRef(Date.now())
  const [reviewer, setReviewer] = useState(() => useTrace.getState().author)
  const [reading, setReading] = useState<Reading>({ requires: '', parameter: '', rule: '', deontic: '', strength: '' })
  const [shown, setShown] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | ''>('')
  const [note, setNote] = useState('')
  const set = (patch: Partial<Reading>) => setReading((r) => ({ ...r, ...patch }))
  const ready = !!reviewer.trim() && !!(reading.requires.trim() || reading.rule.trim()) && !!reading.deontic && !!reading.strength
  const save = () => {
    if (!verdict || (verdict === 'disagree' && !note.trim())) return
    const r = makeReview(c, reviewer, reading, verdict, note, Date.now() - opened.current)
    if (r) { addReview(r); onDone() }
  }

  return (
    <div className="mt-2 rounded-md border border-accent/40 bg-accent/[0.03] p-2 text-[11px]">
      <div className="font-semibold">Blind-first review</div>
      <p className="mt-0.5 text-[10px] text-slate-600">
        Open the source and read the clause yourself:{' '}
        {c.source.url ? <a href={c.source.url} target="_blank" rel="noreferrer" className="text-accent underline">{c.source.label}</a> : <b>{c.source.label}</b>}
        {c.source.page ? <>, <b>{c.source.page}</b></> : null}. Type what it says before you see the card.
      </p>
      {!shown ? (
        <div className="mt-2 grid gap-1.5">
          <label className="grid gap-0.5"><span className="text-muted">Your name</span><input className={input} aria-label="Your name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={80} /></label>
          <label className="grid gap-0.5"><span className="text-muted">What the clause requires, in your words</span><textarea className={input} aria-label="What the clause requires" rows={2} value={reading.requires} onChange={(e) => set({ requires: e.target.value })} maxLength={1000} /></label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="grid gap-0.5"><span className="text-muted">What it constrains</span><input className={input} aria-label="What it constrains" value={reading.parameter} onChange={(e) => set({ parameter: e.target.value })} placeholder="e.g. exits per floor" maxLength={300} /></label>
            <label className="grid gap-0.5"><span className="text-muted">The limit</span><input className={input} aria-label="The limit" value={reading.rule} onChange={(e) => set({ rule: e.target.value })} placeholder="e.g. at least 2" maxLength={300} /></label>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="grid gap-0.5"><span className="text-muted">Type</span>
              <select className={input} aria-label="Type" value={reading.deontic} onChange={(e) => set({ deontic: e.target.value as Deontic })}><option value="">Choose…</option>{DEONTIC_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="grid gap-0.5"><span className="text-muted">Strength</span>
              <select className={input} aria-label="Strength" value={reading.strength} onChange={(e) => set({ strength: e.target.value as Strength })}><option value="">Choose…</option>{STRENGTH_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={!ready} onClick={() => setShown(true)} className="rounded bg-ink px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Show the card</button>
            <button onClick={onDone} className="text-[11px] text-muted hover:underline">Cancel</button>
            {!ready && <span className="text-[10px] text-muted">Name, your reading, type and strength first.</span>}
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-line p-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Your reading</div>
              <div className="mt-0.5 text-slate-800">{reading.requires || '—'}</div>
              {(reading.parameter || reading.rule) && <div className="mt-0.5 text-slate-700">{reading.parameter || '—'}: <b>{reading.rule || '—'}</b></div>}
              <div className="mt-0.5">{reading.deontic && DEONTIC_WORD[reading.deontic]} · {reading.strength}</div>
            </div>
            <div className="rounded border border-line p-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">The card</div>
              <div className="mt-0.5 text-slate-800">{c.summary}</div>
              <div className="mt-0.5 text-slate-700">{c.parameter}: <b>{c.rule}</b></div>
              <div className="mt-0.5">{DEONTIC_WORD[c.deontic]} <Mark ok={reading.deontic === c.deontic} /> · {c.strength} <Mark ok={reading.strength === c.strength} /></div>
            </div>
          </div>
          {(reading.deontic !== c.deontic || reading.strength !== c.strength) && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900">Your reading differs on {[reading.deontic !== c.deontic && 'type', reading.strength !== c.strength && 'strength'].filter(Boolean).join(' and ')}. Even if you agree now, the card is marked disputed until whoever drafted it and you settle the difference.</p>
          )}
          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="sr-only">Verdict</legend>
            {(['agree', 'disagree', 'unsure'] as Verdict[]).map((v) => (
              <label key={v} className="flex items-center gap-1"><input type="radio" name={`verdict-${c.id}`} checked={verdict === v} onChange={() => setVerdict(v)} />{v === 'agree' ? 'The card is right' : v === 'disagree' ? 'The card is wrong' : 'Unsure'}</label>
            ))}
          </fieldset>
          <label className="grid gap-0.5"><span className="text-muted">Note{verdict === 'disagree' ? ' (required: what is wrong?)' : ' (optional)'}</span><textarea className={input} aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
          <div className="flex items-center gap-2">
            <button disabled={!verdict || (verdict === 'disagree' && !note.trim())} onClick={save} className="rounded bg-ink px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Save review</button>
            <button onClick={onDone} className="text-[11px] text-muted hover:underline">Cancel</button>
          </div>
          <p className="text-[10px] text-muted">Saved in the project's trace with your name, the time you took and the card version. Editing the card later makes this review stale.</p>
        </div>
      )}
    </div>
  )
}
