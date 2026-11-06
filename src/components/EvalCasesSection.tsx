// "Evaluation cases" on the Status page (backlog item 28): every case with its type, expectation and basis, and the
// last run's result from public/eval/last-run.json (written by `npm run eval`). A case that failed shows as failed.
import { ClipboardCheck } from './icons'
import { useEffect, useState } from 'react'
import { CASES } from '../eval/cases'
import { U } from './Units'

interface LastRun { date: string; time: string; total: number; passed: number; failed: string[]; uiRunFailed?: boolean; report: string; cases: { id: string; pass: boolean; observed: string }[] }

const TYPE_LABEL: Record<string, string> = { typical: 'Typical', boundary: 'Boundary', 'out-of-scope': 'Out of scope', repeated: 'Repeated', definition: 'Definition' }

export default function EvalCasesSection() {
  const [run, setRun] = useState<LastRun | null>(null)
  const [state, setState] = useState<'loading' | 'none' | 'ok'>('loading')
  useEffect(() => {
    let live = true
    fetch('./eval/last-run.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) { setRun(j); setState(j ? 'ok' : 'none') } }, () => live && setState('none'))
    return () => { live = false }
  }, [])
  const byId = new Map(run?.cases.map((c) => [c.id, c]) ?? [])
  return (
    <section className="mt-5 rounded-lg border border-line bg-panel" aria-labelledby="eval-title">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 id="eval-title" className="flex items-center gap-1.5 text-sm font-semibold"><ClipboardCheck size={14} aria-hidden />Evaluation cases</h2>
        <span className="text-[11px] text-muted">{CASES.length} cases: typical, boundary, out of scope, repeated</span>
        <span className="ml-auto text-[11px]">
          {state === 'ok' && run ? <><b className={run.failed.length || run.uiRunFailed ? 'text-red-700' : 'text-emerald-800'}>{run.passed} of {run.total} pass</b>{run.uiRunFailed && <b className="text-red-700"> · UI run incomplete</b>} · last run {run.date} {run.time} · report <code className="text-[10px]">{run.report}</code></>
            : state === 'loading' ? 'Loading the last run…' : 'Not run yet: npm run eval'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[11px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-muted">
              <th className="px-3 py-1.5 font-medium">Case</th><th className="px-3 py-1.5 font-medium">Type</th><th className="px-3 py-1.5 font-medium">Expected</th><th className="px-3 py-1.5 font-medium">Basis</th><th className="px-3 py-1.5 font-medium">Last run</th>
            </tr>
          </thead>
          <tbody>
            {CASES.map((c) => {
              const r = byId.get(c.id)
              return (
                <tr key={c.id} className="border-b border-line/70 align-top">
                  <td className="px-3 py-1.5"><b>{c.id}</b> <U>{c.title}</U><div className="text-[10px] text-muted">{c.node}{c.ui ? ' · also run through the UI' : ''}</div></td>
                  <td className="px-3 py-1.5">{TYPE_LABEL[c.type]}</td>
                  <td className="px-3 py-1.5"><U>{c.expected}</U></td>
                  <td className="px-3 py-1.5 text-muted">{c.basis}{c.basisFlag === 'team_assumption' ? ' (team reasoning)' : ''}</td>
                  <td className="px-3 py-1.5">{!r ? <span className="text-muted">not run</span> : r.pass ? <span className="font-semibold text-emerald-800">Pass</span> : <span className="font-semibold text-red-700">Fail</span>}
                    {r && <div className="text-[10px] text-muted"><U>{r.observed}</U></div>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
