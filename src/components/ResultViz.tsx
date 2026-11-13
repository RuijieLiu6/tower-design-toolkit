// Visual result rows shared by every analysis tool (Sinnie, 13 Nov: "make sure stuff are represented through visual
// graphs instead of text heavy descriptions"). After Sun & Wind Studio's Key results panel (study.js KR): one row per
// reading with a bar against the passing range, a tick at the threshold and a pass / check / fail pill; the
// explanation is in the hover text, never a paragraph.
import type { ReactNode } from 'react'
import { FLAG_ICONS } from '../data/icons'
import type { Flag, RuleResult, RuleState, Source } from '../engine/types'
import { CardChip } from './RuleCardView'
import { FLAG_META, FlagChip, StateChip } from './ui'
import { keepUnits, useUnitText } from './Units'

export const STATE_COL: Record<RuleState, string> = { pass: '#2f855a', warn: '#c27c0e', fail: '#c53030', unknown: '#64748b' }

export interface BarSpec {
  /** Scale end and the reading on it. */
  max: number
  v: number
  /** The passing range, shaded. */
  zone?: [number, number]
  /** Threshold ticks with a short label. */
  ticks?: [number, string][]
}
export interface KeySpec {
  id: string
  label: string
  /** The standard or method, shown small (LEED, Lawson, ASHRAE 62.1 …). */
  std?: string
  value: string
  unit?: string
  state: RuleState
  /** Hover text: what it means and what it needs. */
  tip?: string
  bar?: BarSpec
  /** A stacked bar of shares (e.g. the Lawson bands) instead of a single reading. */
  stack?: { parts: number[]; colors: string[]; names: string[] }
  /** An A–E rating (0 = A). */
  rating?: number
  /** Evidence quality, drawn as a small icon (its name is the icon's hover text). */
  flag?: Flag | string
  /** A plain reading with nothing to pass or fail: no state pill when its state is unknown. */
  reading?: boolean
}

const RATE = ['#1F7A4D', '#7fb800', '#fab219', '#ec835a', '#B3362B']

function Bar({ bar, color }: { bar: BarSpec; color: string }) {
  const W = 100, x = (v: number) => Math.max(0, Math.min(W, (v / (bar.max || 1)) * W))
  return (
    <svg viewBox={`0 0 ${W} 10`} preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
      <rect width={W} height={6} y={2} rx={1} fill="#eef0f3" />
      {bar.zone && <rect x={x(bar.zone[0])} width={Math.max(0, x(bar.zone[1]) - x(bar.zone[0]))} y={2} height={6} fill="#2f855a" opacity={0.16} />}
      <rect width={x(bar.v)} height={6} y={2} rx={1} fill={color} />
      {(bar.ticks ?? []).map(([v], i) => <rect key={i} x={x(v) - 0.4} width={0.8} height={10} fill="#1f2328" />)}
    </svg>
  )
}

/** The evidence flag as an icon only; the flag's name and meaning are its hover text. */
export function FlagDot({ flag }: { flag: Flag | string }) {
  const f = (flag === 'false_assumption_corrected' ? 'false_assumption' : flag) as Flag
  const m = FLAG_META[f] ?? FLAG_META.unverified, Icon = FLAG_ICONS[f] ?? FLAG_ICONS.unverified
  return <span title={`${m.label}: ${m.title}`} aria-label={m.label} data-flag={f} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${m.className}`}><Icon size={10} /></span>
}

/** One reading as a row: name and standard, the value, a bar or stack, a state pill. A long value takes its own line. */
export function KeyBar({ k, children, frame = 'border border-line' }: { k: KeySpec; children?: ReactNode; frame?: string }) {
  const col = STATE_COL[k.state]
  // A value in words (or a long one) takes its own line, so the name keeps the row.
  const long = !k.unit && (k.value.length > 14 || !/\d/.test(k.value))
  return (
    <li className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-md px-2 py-1.5 ${frame}`} title={k.tip} data-key={k.id} data-state={k.state}>
      <div className="flex min-w-0 items-start gap-1.5">
        <span className="line-clamp-2 min-w-0 flex-1 break-words text-meta text-ink">{k.label}{k.std && <span className="ml-1 text-muted">· {k.std}</span>}</span>
        {!long && <b className="shrink-0 text-meta tabular-nums text-ink">{k.value}{k.unit && <span className="ml-0.5 font-normal text-muted">{k.unit}</span>}</b>}
        {k.flag && <FlagDot flag={k.flag} />}
        {!(k.reading && k.state === 'unknown') && <StateChip state={k.state} value={k.value} />}
      </div>
      {long && <div className="line-clamp-2 min-w-0 break-words text-meta font-medium tabular-nums text-ink">{k.value}</div>}
      {k.bar && <div className="grid gap-0.5"><Bar bar={k.bar} color={col} />{k.bar.ticks?.some(([, l]) => l) && (
        <div className="relative h-3 text-[10px] leading-3 text-muted">{k.bar.ticks.filter(([, l]) => l).map(([v, l], i) => <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.max(8, Math.min(92, (v / (k.bar!.max || 1)) * 100))}%` }}>{l}</span>)}</div>)}</div>}
      {k.stack && (
        <div className="flex h-2.5 w-full overflow-hidden rounded-sm" role="img" aria-label={k.stack.names.map((n, i) => `${n} ${Math.round(k.stack!.parts[i] * 100)}%`).join(', ')}>
          {k.stack.parts.map((p, i) => <span key={i} style={{ width: `${p * 100}%`, background: k.stack!.colors[i] }} title={`${k.stack!.names[i]} ${Math.round(p * 100)}%`} />)}
        </div>
      )}
      {k.rating != null && <div className="flex gap-0.5" role="img" aria-label={`Rating ${'ABCDE'[k.rating]}`}>{RATE.map((c, i) => <span key={i} className="flex h-4 flex-1 items-center justify-center rounded-sm text-[10px] font-semibold text-white" style={{ background: c, opacity: i === k.rating ? 1 : 0.25 }}>{'ABCDE'[i]}</span>)}</div>}
      {children}
    </li>
  )
}

export function KeyList({ keys, children }: { keys: KeySpec[]; children?: ReactNode }) {
  return <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-testid="key-list">{keys.map((k) => <KeyBar key={k.id} k={k} />)}{children}</ul>
}

const plain = (s: string) => s.replace(/(\d),(?=\d{3})/g, '$1')
const num = (s: string): number | null => { const m = plain(s).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null }
/** The unit written straight after the first number ("45 m" gives m), so a bar never compares metres with people. */
const unitOf = (s: string): string => plain(s).match(/-?\d+(?:\.\d+)?\s*(m²|m2|mm|km\/h|km|m\/s|kWh|kW|kPa|kg|%|°|×|h\b|s\b|m\b|people|persons|cars|stalls|storeys|floors|homes|keys)?/)?.[1] ?? ''
const BELOW = /at most|≤|<(?!=)|\bmax|under|no more|less than|up to|below|limit|not exceed|within|or fewer|or less/i

/**
 * A rule line as a visual row. When the value and the threshold both carry a number in the same unit, the row gets a
 * bar with a tick at the threshold ("at most" / "≤" / "max" / "under" shade the range below it, otherwise above).
 * The threshold, note and source are the row's hover text; the evidence flag is its small icon.
 */
export function ruleKey(r: RuleResult): KeySpec {
  const v = num(r.value), t = num(r.threshold)
  const pct = r.value.includes('%')
  const uv = unitOf(r.value), ut = unitOf(r.threshold)
  let bar: BarSpec | undefined
  // Only a value that leads with its number is a reading; a number buried in a sentence is not drawn.
  if (/^\s*(about |around |≈|~|\+)?-?\d/i.test(r.value) && v != null && t != null && t > 0 && v >= 0 && (pct === r.threshold.includes('%')) && (uv === ut || !uv || !ut) && v / t < 12 && (v === 0 || t / v < 12)) {
    const below = BELOW.test(r.threshold)
    const max = pct ? Math.max(100, v) : Math.max(v, t) * 1.4
    bar = { max, v, zone: below ? [0, t] : [t, max], ticks: [[t, '']] }
  }
  const src = r.source ? `${r.source.label}${r.source.page ? `, ${r.source.page}` : ''}` : ''
  return { id: r.id, label: r.label, value: r.value, state: r.state, flag: r.flag, tip: [r.label, r.value, r.threshold && `Needs ${r.threshold}`, r.note, src && `Source: ${src}`].filter(Boolean).join('\n'), bar }
}
export function RuleBars({ rules }: { rules: RuleResult[] }) { return <KeyList keys={rules.map(ruleKey)} /> }

// ── Shared pieces for every check's results (13 Nov: graphs first, words on hover or in a fold) ───────────────────

/** A closed block inside a section: the reader opens it for the method, the evidence or a table. */
export function Fold({ title, children, right, testId, open }: { title: ReactNode; children: ReactNode; right?: ReactNode; testId?: string; open?: boolean }) {
  return (
    <details className="group/fold min-w-0 rounded-md border border-line" data-testid={testId} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 text-meta text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform group-open/fold:rotate-90">›</span><span className="min-w-0 flex-1 truncate">{title}</span>{right}
      </summary>
      <div className="min-w-0 border-t border-line p-2 text-meta">{children}</div>
    </details>
  )
}

/** Method notes, assumptions and limits: closed until asked for. */
export function MethodFold({ children, title = 'Method and limits' }: { children: ReactNode; title?: string }) {
  return <div className="mt-2 min-w-0"><Fold title={title} testId="method-fold"><div className="grid min-w-0 gap-1.5 break-words text-slate-600">{children}</div></Fold></div>
}

export function SourceLink({ source, className = 'text-meta text-muted' }: { source: Source; className?: string }) {
  const text = `${source.label}${source.page ? `, ${source.page}` : ''}`
  return source.url ? <a href={source.url} target="_blank" rel="noreferrer" className={`${className} break-words hover:text-accent`}>{text}</a> : <span className={`${className} break-words`}>{text}</span>
}

export interface EvidenceItem { id: string; label: string; flag: Flag | string; source?: Source; threshold?: string; note?: string; value?: string; extra?: ReactNode; card?: boolean }

/** The flag, source, threshold and note behind each row, one fold for the whole list. Nothing is dropped from the cards. */
export function Evidence({ items, title = 'Evidence' }: { items: EvidenceItem[]; title?: string }) {
  const u = useUnitText()
  if (!items.length) return null
  return (
    <Fold title={`${title} · ${items.length} line${items.length === 1 ? '' : 's'}, flag and source`} testId="evidence">
      <ul className="grid min-w-0 gap-2">
        {items.map((r) => (
          <li key={r.id} className="grid min-w-0 gap-0.5" data-evidence={r.id}>
            <div className="flex min-w-0 flex-wrap items-center gap-1"><b className="min-w-0 break-words text-ink">{r.label}</b><FlagChip flag={r.flag} />{r.extra}{r.card !== false && <CardChip ruleId={r.id} />}</div>
            {r.value && <div className="break-words text-ink">{keepUnits(u(r.value))}</div>}
            {r.threshold && <div className="break-words text-muted">Needs {keepUnits(u(r.threshold))}</div>}
            {r.note && <div className="break-words text-slate-600">{keepUnits(u(r.note))}</div>}
            {r.source && <SourceLink source={r.source} />}
          </li>
        ))}
      </ul>
    </Fold>
  )
}

/** A check's rule lines: visual rows (bar against the threshold where both are numbers), then the folded evidence. */
export function RuleRows({ rules, evidence = true, title }: { rules: RuleResult[]; evidence?: boolean; title?: string }) {
  const u = useUnitText()
  if (!rules.length) return null
  const shown = rules.map((r) => ({ ...r, value: keepUnits(u(r.value)), threshold: u(r.threshold), note: r.note ? u(r.note) : r.note }))
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5" data-testid="rule-rows">
      <KeyList keys={shown.map(ruleKey)} />
      {evidence && <Evidence title={title} items={rules.map((r) => ({ id: r.id, label: r.label, flag: r.flag, source: r.source, threshold: r.threshold, note: r.note, value: r.value.length > 14 ? r.value : undefined }))} />}
    </div>
  )
}

export interface Part { label: string; v: number; color: string; tip?: string; text?: string }
const fmtN = (v: number) => Math.round(v).toLocaleString('en-CA')

/** A key of colour swatches with short names, in place of a caption sentence. */
export function Legend({ items, className = '' }: { items: { label: ReactNode; color?: string; line?: boolean; dashed?: boolean; hatch?: boolean; tip?: string }[]; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] leading-4 text-muted ${className}`} data-testid="legend">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1" title={it.tip}>
          {it.line ? <i className="inline-block h-0 w-3 border-t-2" style={{ borderColor: it.color, borderStyle: it.dashed ? 'dashed' : 'solid' }} />
            : <i className={`inline-block h-2 w-2 rounded-sm ${it.hatch ? 'hatch' : ''}`} style={it.hatch ? { outline: `1px solid ${it.color ?? '#64748b'}` } : { background: it.color, outline: it.dashed ? '1px dashed #64748b' : undefined }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** Shares of a whole as one stacked bar with a key (mode split, program mix, end uses). */
export function Stack({ parts, label, unit = '', fmt = fmtN, legend = true, share = true, height = 12 }: { parts: Part[]; label: string; unit?: string; fmt?: (v: number) => string; legend?: boolean; share?: boolean; height?: number }) {
  const shown = parts.filter((p) => p.v > 0), total = shown.reduce((s, p) => s + p.v, 0) || 1
  const text = (p: Part) => `${p.label}: ${p.text ?? `${fmt(p.v)}${unit ? ` ${unit}` : ''}`}${share ? ` (${Math.round((p.v / total) * 100)}%)` : ''}`
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((s, p) => s + (p.v / total) * 100, 0))
  return (
    <div className="grid min-w-0 gap-1" data-testid="stack">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="w-full rounded-sm" style={{ height }} role="img" aria-label={`${label}: ${shown.map(text).join(', ')}`}>
        <rect width="100" height="10" fill="#eef0f3" />
        {shown.map((p, i) => <rect key={p.label} x={starts[i]} width={Math.max(0, (p.v / total) * 100 - 0.3)} height="10" fill={p.color}><title>{p.tip ?? text(p)}</title></rect>)}
      </svg>
      {legend && <div className="flex min-w-0 flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] leading-4 text-muted">{shown.map((p) => <span key={p.label} className="inline-flex items-center gap-1" title={p.tip ?? text(p)}><i className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.label} <b className="font-medium tabular-nums text-ink">{share ? `${Math.round((p.v / total) * 100)}%` : p.text ?? fmt(p.v)}</b></span>)}</div>}
    </div>
  )
}

/** Area by use and other part-of-a-whole readings: a ring with the total in the middle and a key beside it. */
export function Donut({ parts, label, center, sub, unit = '', fmt = fmtN }: { parts: Part[]; label: string; center?: string; sub?: string; unit?: string; fmt?: (v: number) => string }) {
  const shown = parts.filter((p) => p.v > 0), total = shown.reduce((s, p) => s + p.v, 0) || 1
  const R = 26, C = 2 * Math.PI * R
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((s, p) => s + (p.v / total) * C, 0))
  const say = (p: Part) => `${p.label}: ${fmt(p.v)}${unit ? ` ${unit}` : ''} (${Math.round((p.v / total) * 100)}%)`
  return (
    <div className="grid min-w-0 grid-cols-[84px_minmax(0,1fr)] items-center gap-3" data-testid="donut">
      <svg viewBox="0 0 72 72" className="h-[84px] w-[84px]" role="img" aria-label={`${label}: ${shown.map(say).join(', ')}`}>
        <circle cx="36" cy="36" r={R} fill="none" stroke="#eef0f3" strokeWidth="11" />
        {shown.map((p, i) => (
          <circle key={p.label} cx="36" cy="36" r={R} fill="none" stroke={p.color} strokeWidth="11" strokeDasharray={`${Math.max(0, (p.v / total) * C - 0.6)} ${C}`} strokeDashoffset={-starts[i]} transform="rotate(-90 36 36)">
            <title>{p.tip ?? say(p)}</title>
          </circle>
        ))}
        {center && <text x="36" y={sub ? 35 : 39} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#202630">{center}</text>}
        {sub && <text x="36" y="45" textAnchor="middle" fontSize="6.5" fill="#5f6875">{sub}</text>}
      </svg>
      <ul className="grid min-w-0 gap-0.5 text-meta">
        {shown.map((p) => (
          <li key={p.label} className="flex min-w-0 items-center gap-1.5" title={p.tip ?? say(p)}>
            <i className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} /><span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{p.text ?? fmt(p.v)}</span><b className="w-8 shrink-0 text-right font-medium tabular-nums">{Math.round((p.v / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface HBarRow { label: string; v: number; text?: string; color?: string; tip?: string; mark?: number; markTip?: string; bold?: boolean; muted?: boolean; swatch?: string; chip?: ReactNode; range?: [number, number] }

/** Horizontal bars on one shared scale: a short name, the bar (with an optional tick at its limit) and the number. */
export function HBars({ rows, label, max, unit = '', fmt = fmtN, color = '#4a6a8c', labelWidth = '5.5rem', zone, stacked = false }: { rows: HBarRow[]; label: string; max?: number; unit?: string; fmt?: (v: number) => string; color?: string; labelWidth?: string; zone?: [number, number]; stacked?: boolean }) {
  const top = max ?? (Math.max(1e-9, ...rows.flatMap((r) => [Math.abs(r.v), r.mark ?? 0, r.range?.[1] ?? 0])) * 1.08)
  const x = (v: number) => Math.max(0, Math.min(100, (v / top) * 100))
  const text = (r: HBarRow) => r.text ?? `${fmt(r.v)}${unit ? ` ${unit}` : ''}`
  return (
    <div className="grid min-w-0 gap-1" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${text(r)}`).join(', ')}`} data-testid="hbars">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className={`grid min-w-0 items-center gap-2 text-meta ${r.muted ? 'text-muted' : ''}`} style={{ gridTemplateColumns: stacked ? 'minmax(0,1fr) auto' : `minmax(0,${labelWidth}) minmax(0,1fr) auto` }} title={r.tip ?? `${r.label}: ${text(r)}`}>
          <span className={`flex min-w-0 items-center gap-1 ${stacked ? 'col-span-2 -mb-1.5' : ''} ${r.bold ? 'font-semibold' : ''}`}>{r.swatch && <i className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: r.swatch }} />}<span className="truncate">{r.label}</span></span>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full">
            <rect width="100" height="8" rx="1" fill="#eef0f3" />
            {zone && <rect x={x(zone[0])} width={Math.max(0, x(zone[1]) - x(zone[0]))} height="8" fill="#2f855a" opacity="0.16" />}
            {r.range && <rect x={x(r.range[0])} width={Math.max(0.5, x(r.range[1]) - x(r.range[0]))} y="1" height="6" fill={r.color ?? color} opacity="0.3" />}
            <rect width={x(Math.abs(r.v))} height="8" rx="1" fill={r.color ?? color}><title>{r.tip ?? `${r.label}: ${text(r)}`}</title></rect>
            {r.mark != null && <rect x={x(r.mark) - 0.5} width="1" height="8" fill="#1f2328"><title>{r.markTip ?? `Limit ${fmt(r.mark)}${unit ? ` ${unit}` : ''}`}</title></rect>}
          </svg>
          <span className={`flex shrink-0 items-center gap-1 text-right tabular-nums ${r.bold ? 'font-semibold' : ''}`}>{text(r)}{r.chip}</span>
        </div>
      ))}
    </div>
  )
}

/** Two options side by side, row by row (area proxy against layout, direct against sky lobby): each row on its own scale. */
export function PairBars({ rows, a, b, label, aColor = '#b8c0cc', bColor = '#2563eb' }: { rows: { label: string; a: number; b: number; aText: string; bText: string; tip?: string }[]; a: string; b: string; label: string; aColor?: string; bColor?: string }) {
  return (
    <div className="grid min-w-0 gap-1.5" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label}, ${a} ${r.aText}, ${b} ${r.bText}`).join('; ')}`} data-testid="pair-bars">
      <Legend items={[{ label: a, color: aColor }, { label: b, color: bColor }]} />
      {rows.map((r) => {
        const top = Math.max(Math.abs(r.a), Math.abs(r.b), 1e-9)
        return (
          <div key={r.label} className="grid min-w-0 gap-0.5 text-meta" title={r.tip ?? `${r.label}: ${a} ${r.aText}, ${b} ${r.bText}`}>
            <span className="truncate">{r.label}</span>
            {([[r.a, r.aText, aColor, false], [r.b, r.bText, bColor, true]] as const).map(([v, t, c, strong], i) => (
              <div key={i} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-1.5 w-full"><rect width="100" height="6" rx="1" fill="#eef0f3" /><rect width={Math.max(0.5, (Math.abs(v) / top) * 100)} height="6" rx="1" fill={v < 0 ? '#c53030' : c}><title>{`${i ? b : a}: ${t}`}</title></rect></svg>
                <span className={`min-w-[3.5rem] shrink-0 text-right tabular-nums ${strong ? 'font-semibold' : 'text-muted'}`}>{t}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** A reading on a half-ring against its limit: the arc fills to the value, the tick is the limit. */
export function Gauge({ v, max, limit, text, sub, label, color = '#2563eb', zone }: { v: number; max: number; limit?: number; text: string; sub?: string; label: string; color?: string; zone?: [number, number] }) {
  const R = 30, cx = 40, cy = 38, C = Math.PI * R
  const f = (x: number) => Math.max(0, Math.min(1, x / (max || 1)))
  const pt = (t: number, r: number) => [cx - r * Math.cos(Math.PI * t), cy - r * Math.sin(Math.PI * t)]
  const arc = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`
  const tick = limit != null ? [pt(f(limit), R - 6), pt(f(limit), R + 6)] : null
  return (
    <svg viewBox="0 0 80 46" className="h-auto w-full max-w-[120px]" role="img" aria-label={`${label}: ${text}${sub ? ` ${sub}` : ''}`} data-testid="gauge">
      <title>{`${label}: ${text}${sub ? ` ${sub}` : ''}`}</title>
      <path d={arc} fill="none" stroke="#eef0f3" strokeWidth="8" />
      {zone && <path d={arc} fill="none" stroke="#2f855a" opacity="0.2" strokeWidth="8" strokeDasharray={`${(f(zone[1]) - f(zone[0])) * C} ${C}`} strokeDashoffset={-f(zone[0]) * C} />}
      <path d={arc} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${f(v) * C} ${C}`} />
      {tick && <line x1={tick[0][0]} y1={tick[0][1]} x2={tick[1][0]} y2={tick[1][1]} stroke="#1f2328" strokeWidth="1.4" />}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#202630">{text}</text>
      {sub && <text x={cx} y={cy + 6} textAnchor="middle" fontSize="6" fill="#5f6875">{sub}</text>}
    </svg>
  )
}

/** A big number with a short name: for counts that have no scale to draw against. */
export function Stat({ label, value, unit, color, tip, children }: { label: string; value: string; unit?: string; color?: string; tip?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line px-2 py-1.5" title={tip} data-testid="stat">
      <div className="truncate text-[11px] leading-4 text-muted">{label}</div>
      <div className="flex min-w-0 items-baseline gap-1"><span className="truncate text-control font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</span>{unit && <span className="shrink-0 truncate text-[11px] text-muted">{unit}</span>}</div>
      {children}
    </div>
  )
}
export function Stats({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid min-w-0 gap-1.5 ${cols === 3 ? 'grid-cols-[repeat(3,minmax(0,1fr))]' : 'grid-cols-[repeat(2,minmax(0,1fr))]'}`}>{children}</div>
}

/** Results by state as one bar (pass, check, fail, open), with the counts as its key. */
export function StateStack({ counts, label, names }: { counts: Partial<Record<RuleState, number>>; label: string; names?: Partial<Record<RuleState, string>> }) {
  const word: Record<RuleState, string> = { pass: 'pass', warn: 'check', fail: 'fail', unknown: 'open', ...names }
  const order: RuleState[] = ['pass', 'warn', 'fail', 'unknown']
  return <Stack label={label} share={false} parts={order.map((s) => ({ label: word[s], v: counts[s] ?? 0, color: STATE_COL[s] }))} />
}

/** Lines or filled areas over an ordered axis (hours of a day, storeys): small, with first and last labels only. */
export function AreaChart({ series, label, x, unit = '', height = 56 }: { series: { label: string; color: string; values: number[]; fill?: boolean }[]; label: string; x: [string, string]; unit?: string; height?: number }) {
  const n = Math.max(1, ...series.map((s) => s.values.length)), top = Math.max(1e-9, ...series.flatMap((s) => s.values))
  const W = 100, H = 40
  const px = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0), py = (v: number) => H - 1 - (v / top) * (H - 3)
  return (
    <div className="grid min-w-0 gap-0.5" data-testid="area-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={`${label}: ${series.map((s) => `${s.label} peaks at ${fmtN(Math.max(0, ...s.values))}${unit ? ` ${unit}` : ''}`).join(', ')}`}>
        <rect width={W} height={H} fill="#f7f8fa" />
        {series.map((s) => {
          const line = s.values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
          return (
            <g key={s.label}><title>{`${s.label}: up to ${fmtN(Math.max(0, ...s.values))}${unit ? ` ${unit}` : ''}`}</title>
              {s.fill !== false && <path d={`${line} L${px(s.values.length - 1)},${H} L0,${H} Z`} fill={s.color} opacity="0.25" />}
              <path d={line} fill="none" stroke={s.color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-[10px] leading-3 text-muted"><span>{x[0]}</span><span>{`0 – ${fmtN(top)}${unit ? ` ${unit}` : ''}`}</span><span>{x[1]}</span></div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  )
}

/** A warning or scope note cut to one line; the whole text opens on click. */
export function Caveat({ children, tone = 'warn', lead }: { children: ReactNode; tone?: 'warn' | 'info'; lead: string }) {
  return (
    <details className={`group/cav min-w-0 rounded-md border text-meta ${tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-300 bg-slate-100 text-slate-700'}`} data-testid="caveat">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 font-medium [&::-webkit-details-marker]:hidden"><span aria-hidden className="inline-block transition-transform group-open/cav:rotate-90">›</span><span className="min-w-0 flex-1 truncate">{lead}</span></summary>
      <div className="min-w-0 break-words px-2 pb-1.5">{children}</div>
    </details>
  )
}

/** A false assumption that was corrected: the struck claim on one line, the correction and source on opening it. */
export function FalseList({ items }: { items: { claim: string; correction: string; source: Source }[] }) {
  return (
    <ul className="grid min-w-0 gap-1" data-testid="false-list">
      {items.map((f, i) => (
        <li key={i} className="min-w-0">
          <details className="group/fa min-w-0 rounded-md border border-flag-false/40 bg-flag-false/[0.04] text-meta">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 text-flag-false [&::-webkit-details-marker]:hidden" title={f.correction}><FlagDot flag="false_assumption" /><span className="min-w-0 flex-1 truncate line-through decoration-1">{f.claim}</span></summary>
            <div className="grid min-w-0 gap-1 break-words px-2 pb-1.5"><div className="font-medium text-flag-false line-through decoration-1">{f.claim}</div><div className="text-slate-800">{f.correction}</div><div className="flex flex-wrap items-center gap-1"><FlagChip flag="false_assumption" /><SourceLink source={f.source} /></div></div>
          </details>
        </li>
      ))}
    </ul>
  )
}
