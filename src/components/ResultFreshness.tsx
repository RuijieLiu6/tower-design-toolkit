// Which model a result was evaluated for (overnight brief, 8 Nov, F02/UI08: "Confirm each result identifies the model
// revision it evaluated. Missing or failed evaluation remains explicit; old results do not silently become current").
// One line above the open check's results: the revision of the model it evaluated (lib/workflow/phasePackage.ts
// modelRevision of the towers), whether that is the current model, and the execution state. Most checks evaluate in the
// same render as the model, so their result is always the current model's; the sun-hours check runs in a worker and says
// when it is evaluating, out of date or failed. A paused or switched-off check says it was not evaluated.
import type { ReactNode } from 'react'
import { useStore, useTowers } from '../store'
import { modelRevision } from '../lib/workflow/phasePackage'
import { NEEDS_MODEL } from '../lib/missingInput'
import { useSolar, SOLAR_NODE } from '../hooks/useSolarAccess'
import { CircleAlert, CircleCheck, CircleDashed, Loader2 } from './icons'

export default function ResultFreshness() {
  const node = useStore((s) => s.selectedNode)
  const enabled = useStore((s) => (s.selectedNode ? !!s.enabled[s.selectedNode] : false))
  const analysis = useStore((s) => s.analysis)
  const towers = useTowers()
  const rev = modelRevision(towers)
  const solar = { status: useSolar((s) => s.status), outRev: useSolar((s) => s.outRev), runRev: useSolar((s) => s.runRev), error: useSolar((s) => s.error) }
  if (!node) return null
  const line = (icon: ReactNode, text: ReactNode, tone: string, state: string) => (
    <p role="status" data-testid="result-freshness" data-state={state} className={`mx-3 mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-meta ${tone}`}>{icon}<span>{text}</span></p>
  )
  if (!analysis) return line(<CircleDashed size={13} className="mt-0.5 shrink-0" aria-hidden />, 'Not evaluated: checks are paused (Auto-run checks is off).', 'bg-pending-surface text-pending', 'paused')
  if (!enabled) return line(<CircleDashed size={13} className="mt-0.5 shrink-0" aria-hidden />, 'Not evaluated: this check is off.', 'bg-pending-surface text-pending', 'off')
  if (!towers.length && NEEDS_MODEL.has(node)) return line(<CircleDashed size={13} className="mt-0.5 shrink-0" aria-hidden />, 'Not evaluated: there is no model yet.', 'bg-pending-surface text-pending', 'no-model')
  if (node === SOLAR_NODE) {
    if (solar.status === 'error') return line(<CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />, `Evaluation failed: ${solar.error || 'the sun-hours worker stopped'}. The result below is not for the current model.`, 'bg-error-surface text-error', 'failed')
    if (solar.status === 'running') return line(<Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" aria-hidden />, <>Evaluating for the current model (revision {solar.runRev ?? rev})…{solar.outRev && solar.outRev !== rev ? <> Shown until then: revision {solar.outRev}, <b>out of date</b>.</> : null}</>, 'bg-pending-surface text-pending', 'running')
    if (!solar.outRev) return line(<CircleDashed size={13} className="mt-0.5 shrink-0" aria-hidden />, 'Not evaluated yet.', 'bg-pending-surface text-pending', 'idle')
    if (solar.outRev !== rev) return line(<CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />, <><b>Out of date</b>: evaluated for revision {solar.outRev}; the model is now revision {rev}. Re-evaluating…</>, 'bg-warning-surface text-warning', 'stale')
  }
  return line(<CircleCheck size={13} className="mt-0.5 shrink-0" aria-hidden />, `Evaluated for the current model (revision ${rev}).`, 'bg-subtle text-muted', 'current')
}
