// "Rules behind this node" in the Inspector (research P16-M02): the curated rule cards a built node applies, with the
// live result each one backs, then every other source its results cite that has no card yet. Folded by default.
import { ChevronDown, ChevronRight, ScrollText } from './icons'
import { useMemo, useState } from 'react'
import { NODE_GROUPS, RULE_CARDS } from '../data/ruleCards'
import { rulesBehind } from '../lib/trace/sources'
import { useTrace } from '../lib/trace/trace'
import { RuleCardView, SourceList } from './RuleCardView'
import { Section } from './ui'

const HAS_RULES = new Set([...Object.keys(NODE_GROUPS), ...RULE_CARDS.flatMap((c) => c.usedBy)])

export default function RulesBehind({ nodeId }: { nodeId: string }) {
  const live = useTrace((s) => s.live)
  const [open, setOpen] = useState(false)
  const r = useMemo(() => rulesBehind(nodeId, live?.digest.lines ?? []), [nodeId, live])
  if (!HAS_RULES.has(nodeId) || (!r.cards.length && !r.other.length)) return null
  return (
    <Section title="Rules behind this node">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-1 text-left text-[11px] text-slate-700 hover:text-ink">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<ScrollText size={12} />
        {r.cards.length} rule card{r.cards.length === 1 ? '' : 's'}{r.other.length ? `, ${r.other.length} other source${r.other.length === 1 ? '' : 's'} cited` : ''}
      </button>
      {open && (
        <div className="mt-2 grid gap-2">
          {r.cards.map(({ card, lines }) => <RuleCardView key={card.id} card={card} lines={lines} />)}
          {r.other.length > 0 && (
            <>
              <h4 className="mt-1 text-[11px] font-semibold text-slate-700">Other sources these results cite (no card yet)</h4>
              <SourceList entries={r.other} />
            </>
          )}
          {r.uncited.length > 0 && <p className="text-[10px] text-muted">{r.uncited.length} result{r.uncited.length === 1 ? '' : 's'} cite no document: derived values or team presets.</p>}
          <p className="text-[10px] text-muted">A card counts as reviewed once a person reads the source blind and agrees (Review blind). The Trace tab lists every source in use.</p>
        </div>
      )}
    </Section>
  )
}
