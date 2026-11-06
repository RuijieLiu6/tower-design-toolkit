// One rule card (research P16-M02) and a list of cited sources, shared by the Inspector ("Rules behind this node", the
// chip on each result) and the Trace tab. Card text is a summary, never a quotation: the link opens the source to check
// it. While someone reviews a card, the card is hidden until they have typed their own reading (blind-first).
import { ScrollText } from './icons'
import { useState } from 'react'
import { CARDS_DRAFTED_BY, RULE_CARDS, type RuleCard } from '../data/ruleCards'
import type { ResultLine } from '../lib/trace/digest'
import { REVIEW_LABEL, reviewStatus, type ReviewState } from '../lib/trace/review'
import { cardsForResult, worstOf, type SourceEntry } from '../lib/trace/sources'
import { useTrace } from '../lib/trace/trace'
import { useStore } from '../store'
import CardReviewForm from './CardReviewForm'
import { FlagChip, StateChip } from './ui'

const DEONTIC: Record<RuleCard['deontic'], string> = { obligation: 'Obligation', prohibition: 'Prohibition', permission: 'Permission', recommendation: 'Guidance only' }
const TITLE = Object.fromEntries(RULE_CARDS.map((c) => [c.id, c.title]))
const chip = 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700'
const REVIEW_CHIP: Record<ReviewState, string> = {
  unreviewed: 'border-dashed border-slate-300 text-muted', reviewed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  disputed: 'border-red-300 bg-red-50 text-red-800', stale: 'border-amber-300 bg-amber-50 text-amber-900',
}
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

export function useReviewStatus(c: RuleCard) {
  const reviews = useTrace((s) => s.reviews)
  return reviewStatus(c, reviews)
}

export function RuleCardView({ card: c, lines }: { card: RuleCard; lines: ResultLine[] }) {
  const state = worstOf(lines)
  const review = useReviewStatus(c)
  const present = useStore((s) => s.phase === 'present')
  const [reviewing, setReviewing] = useState(false)
  if (reviewing) {
    return (
      <div className="rounded-md border border-line p-2 text-[11px]">
        <div className="text-[10px] text-muted">Card hidden until you have typed your reading</div>
        <CardReviewForm card={c} onDone={() => setReviewing(false)} />
      </div>
    )
  }
  return (
    <div className="rounded-md border border-line p-2 text-[11px]">
      <div className="flex items-start justify-between gap-2"><span className="font-semibold">{c.title}</span>{state && <StateChip state={state} />}</div>
      <p className="mt-1 text-slate-800">{c.summary}</p>
      <div className="mt-1 text-[10px] text-muted">
        {c.source.url ? <a href={c.source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-accent">{c.source.label}</a> : c.source.label}
        {c.source.page ? `, ${c.source.page}` : ''} · a summary, not a quotation: open the source to check
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className={chip}>{DEONTIC[c.deontic]}</span>
        <span className={`${chip} capitalize`}>{c.strength}</span>
        <FlagChip flag={c.flag} />
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${REVIEW_CHIP[review.state]}`} title={review.reason ?? (review.state === 'unreviewed' ? 'No person has reviewed this card blind yet' : undefined)}>{REVIEW_LABEL[review.state]}</span>
      </div>
      <div className="mt-1 text-slate-700"><span className="text-muted">Checks</span> {c.parameter}: <b>{c.rule}</b></div>
      {c.note && <div className="mt-0.5 text-[10px] text-slate-600">{c.note}</div>}
      {lines.length > 0 && <div className="mt-1 text-[10px] text-muted">Backs {lines.length === 1 ? 'the result' : `${lines.length} results`}: {lines.slice(0, 3).map((l) => l.label).join('; ')}{lines.length > 3 ? '; …' : ''}</div>}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted">
        <span>
          Drafted by {CARDS_DRAFTED_BY}
          {review.latest && <> · last review: {review.latest.reviewer}, {day(review.latest.at)}, {review.latest.verdict}{review.state !== 'reviewed' && review.reason ? `. ${review.reason}` : ''}</>}
        </span>
        {!present && <button onClick={() => setReviewing(true)} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-700 hover:border-accent hover:text-accent">Review blind</button>}
      </div>
    </div>
  )
}

/** A small chip on a result card that opens the rule card behind it. Renders nothing when no card backs the result. */
export function CardChip({ ruleId }: { ruleId: string }) {
  const node = useStore((s) => s.selectedNode)
  const [open, setOpen] = useState(false)
  const cards = cardsForResult(node, ruleId)
  if (!cards.length) return null
  return (
    <>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title="The rule card behind this result"
        className="flex items-center gap-0.5 rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-700 hover:border-accent hover:text-accent">
        <ScrollText size={10} />Rule card
      </button>
      {open && <div className="grid basis-full gap-1">{cards.map((c) => <RuleCardView key={c.id} card={c} lines={[]} />)}</div>}
    </>
  )
}

export function SourceList({ entries }: { entries: SourceEntry[] }) {
  return (
    <div className="grid gap-1">
      {entries.map((e) => (
        <div key={e.key} className="rounded border border-line px-2 py-1.5 text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-slate-800">{e.label}{e.page && <span className="text-muted">, {e.page}</span>}</span>
            <StateChip state={e.state} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted">
            <FlagChip flag={e.flag} />
            {e.cards.length
              ? <span>Card: {e.cards.map((id) => TITLE[id]).join(', ')}</span>
              : <span className="rounded border border-dashed border-slate-300 px-1">No card yet</span>}
            <span>· {e.lines.slice(0, 3).map((l) => l.label).join('; ')}{e.lines.length > 3 ? ` and ${e.lines.length - 3} more` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
