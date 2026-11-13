// Key results in the larger, calmer setting of Sun & Wind Studio's panel, for the daylight tools: the name with its
// standard, the value large, a badge in the Studio's words ("3 pts", "glare", "medium"), and one bar with its thresholds
// ticked and labelled. The longer explanation stays in the hover text.
import type { RuleState } from '../../engine/types'
import type { SwKey } from '../../lib/swRun'

const COL: Record<RuleState, string> = { pass: '#1F7A4D', warn: '#D9982B', fail: '#B8362B', unknown: '#5F6875' }
const BADGE: Record<RuleState, string> = { pass: 'bg-[#DDF0E4] text-[#17603C]', warn: 'bg-[#FBEBCB] text-[#8A5A00]', fail: 'bg-[#F8DDD9] text-[#8E2A21]', unknown: 'bg-subtle text-muted' }
const WORD: Record<RuleState, string> = { pass: 'meets', warn: 'close', fail: 'short', unknown: '' }

export function BigKey({ k }: { k: SwKey }) {
  const badge = k.badge ?? WORD[k.state], b = k.bar, pos = (v: number) => (b ? Math.max(0, Math.min(1, v / (b.max || 1))) * 100 : 0)
  return (
    <li className="grid min-w-0 gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0" title={k.tip} data-key={k.id} data-state={k.state}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1">
        <span className="min-w-0 text-[15px] font-medium leading-5 text-ink">{k.label}</span>
        <b className="text-right text-[24px] font-semibold leading-6 tabular-nums text-ink">{k.value}{k.unit && <span className="ml-1 text-meta font-normal text-muted">{k.unit}</span>}</b>
        <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-muted">{k.std}</span>
        {badge ? <span className={`justify-self-end rounded-full px-2 py-0.5 text-meta font-medium ${BADGE[k.state]}`} data-testid="key-badge">{badge}</span> : <span />}
      </div>
      {b && (
        <div className="grid gap-1">
          <div className="relative h-2 rounded-full bg-[#E6E8EC]" role="img" aria-label={`${k.label}: ${k.value}${k.unit ? ` ${k.unit}` : ''}`}>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pos(b.v)}%`, background: COL[k.state] }} />
            {b.ticks?.map(([v], i) => <span key={i} className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-sm bg-ink" style={{ left: `${pos(v)}%` }} />)}
          </div>
          {b.ticks?.some(([, l]) => l) && <div className="relative h-4 text-meta tabular-nums text-muted">{b.ticks.filter(([, l]) => l).map(([v, l], i) => <span key={i} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.max(6, Math.min(94, pos(v)))}%` }}>{l}</span>)}</div>}
        </div>
      )}
      {k.stack && (
        <div className="grid gap-1.5">
          <div className="flex h-2 w-full overflow-hidden rounded-full" role="img" aria-label={k.stack.names.map((n, i) => `${n} ${Math.round(k.stack!.parts[i] * 100)}%`).join(', ')}>{k.stack.parts.map((p, i) => <span key={i} style={{ width: `${p * 100}%`, background: k.stack!.colors[i] }} title={`${k.stack!.names[i]} ${Math.round(p * 100)}%`} />)}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-muted">{k.stack.names.map((n, i) => <span key={i} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: k.stack!.colors[i] }} />{n} {Math.round(k.stack!.parts[i] * 100)}%</span>)}</div>
        </div>
      )}
    </li>
  )
}

export function BigKeyList({ keys }: { keys: SwKey[] }) {
  return <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-line bg-panel p-3" data-testid="key-list">{keys.map((k) => <BigKey key={k.id} k={k} />)}</ul>
}

/** A big reading with its meaning beside it and a small caps label under (the Studio's plan stats). */
export function BigReadings({ items }: { items: { value: string; words: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="big-readings">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dd className="m-0 text-meta leading-snug text-muted"><b className="mr-1.5 text-[20px] font-semibold leading-6 tabular-nums text-ink">{it.value}</b>{it.words}</dd>
          <dt className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{it.label}</dt>
        </div>
      ))}
    </dl>
  )
}
