// The selected check's results at a glance (Ruijie, 6 Nov: "use icons and symbols to simplify the right side analysis
// result and turn them into pass or fail as well as instructions on fixing them"). One row per result: a status symbol
// (✓ pass, ✕ fail, ! check, ? unknown), the result and the number that decides it, and for anything that does not pass,
// what to change and where (lib/fixes.ts). Rows come from the decision trace's live digest (TraceRecorder keeps it
// current), and for view cones from the cone checks themselves, one per cone the tower enters. The full cards, sources,
// flags and settings stay below under Details.
import { useMemo, type ReactNode } from 'react'
import { CircleCheck } from './icons'
import type { RuleState } from '../engine/types'
import { useResults } from '../hooks/useResults'
import { byState, coneRows, fixFor, ruleKey, STATE_WORD, type CheckRow } from '../lib/fixes'
import { nodeOfLine } from '../lib/options'
import { useTrace } from '../lib/trace/trace'
import StatusRow, { STATUS_ICON as ICON } from './StatusRow'

const CHIP: Record<RuleState, string> = { pass: 'border-emerald-200 bg-emerald-50 text-emerald-800', fail: 'border-red-200 bg-red-50 text-red-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', unknown: 'border-slate-200 bg-slate-50 text-slate-700' }
const ORDER: RuleState[] = ['fail', 'warn', 'unknown', 'pass']

/** The rows for a check, or null when it has no list of results to show this way. */
export function useCheckRows(nodeId: string): { rows: CheckRow[]; extra: string | null } | null {
  const digest = useTrace((s) => s.live?.digest)
  const { cones } = useResults()
  return useMemo(() => {
    if (nodeId === 'built.viewcones') {
      if (!cones.length) return null
      let outside = 0
      const rows = cones.flatMap((r) => { const c = coneRows(r.tower.id, r.tower.name, r.checks, r.topZ); outside += c.outside; return cones.length > 1 ? c.rows.map((x) => ({ ...x, title: `${x.title} (${r.tower.name})` })) : c.rows })
      return { rows: rows.sort(byState), extra: outside ? `${outside} protected view${outside === 1 ? '' : 's'} the tower${cones.length > 1 ? 's do' : ' does'} not enter` : null }
    }
    const lines = (digest?.lines ?? []).filter((l) => nodeOfLine(l.id) === nodeId)
    if (!lines.length) return null
    const rows = lines.map((l): CheckRow => {
      const parts = l.id.split(':'), towerId = parts.length > 2 ? parts[1] : '', ruleId = parts.slice(parts.length > 2 ? 2 : 1).join(':')
      return { id: l.id, state: l.state, title: l.label, value: l.value, flag: l.flag, fix: fixFor(ruleKey(ruleId, towerId), l.state, l.value, l.threshold, l.flag) }
    })
    return { rows: rows.sort(byState), extra: null }
  }, [nodeId, digest, cones])
}

/** One result: the shared status row (StatusRow.tsx), also used by the viewport's proposal card. */
function Row({ r }: { r: CheckRow }) {
  return <StatusRow state={r.state} title={r.title} value={r.value} fix={r.fix} flag={r.flag} testId="check-row" />
}

export default function ResultChecklist({ nodeId }: { nodeId: string }) {
  const data = useCheckRows(nodeId)
  if (!data) return null
  const { rows, extra } = data
  const count = (s: RuleState) => rows.filter((r) => r.state === s).length
  const open = rows.filter((r) => r.state !== 'pass'), passed = rows.filter((r) => r.state === 'pass')
  return (
    <section aria-label="Results at a glance" data-testid="result-checklist" className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap gap-1" role="list" aria-label="Counts">
        {ORDER.filter((s) => count(s) > 0).map((s) => {
          const Icon = ICON[s]
          return <span key={s} role="listitem" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP[s]}`}><Icon size={13} aria-hidden />{count(s)} {STATE_WORD[s].toLowerCase()}</span>
        })}
      </div>
      {open.length === 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><CircleCheck size={16} aria-hidden />Everything here passes.</p>}
      {open.length > 0 && <ul className="mt-1 divide-y divide-line">{open.map((r) => <Row key={r.id} r={r} />)}</ul>}
      {passed.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-muted"><span className="font-semibold text-emerald-800">{passed.length} pass</span>{open.length ? '' : ': show them'}</summary>
          <ul className="divide-y divide-line">{passed.map((r) => <Row key={r.id} r={r} />)}</ul>
        </details>
      )}
      {extra && <p className="mt-1 text-[11px] text-muted">{extra}.</p>}
    </section>
  )
}

/** The full results, sources and settings under one fold when the checklist leads; open as before otherwise. */
export function DetailsFold({ nodeId, children }: { nodeId: string; children: ReactNode }) {
  const lead = useCheckRows(nodeId)
  if (!lead) return <>{children}</>
  return (
    <details key={nodeId} className="group border-b border-line" data-testid="result-details">
      <summary className="cursor-pointer px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink">Details, sources and settings</summary>
      <div>{children}</div>
    </details>
  )
}
