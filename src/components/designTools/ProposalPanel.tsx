// The Design Change Proposal tab (brief §8): what a connected tool wants changed, before anything changes. Summary
// (tool, run, targets, whether the model moved on), one line per operation, the checks as status rows with a word each
// (identity, run, units, geometry, freshness), the results that will be marked Needs update, then Discard / Apply.
// Apply is one project change with one Undo (lib/designTools/apply.ts); it is blocked while the proposal is stale or
// failed a check. Discard changes nothing.
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { RuleState } from '../../engine/types'
import { applyPending, discardPending } from '../../lib/designTools/apply'
import type { Operation } from '../../lib/designTools/contract'
import { useDesignTools } from '../../lib/designTools/store'
import { useStore, useTowers } from '../../store'
import StatusRow from '../StatusRow'

type Line = { id: string; title: string; state: RuleState; value: string; detail?: string }

/** Sort the checker's sentences into the five lines the panel shows. */
function lines(problems: string[], warnings: string[], stale: boolean): Line[] {
  const pick = (re: RegExp) => ({ p: problems.filter((s) => re.test(s)), w: warnings.filter((s) => re.test(s)) })
  const row = (id: string, title: string, { p, w }: { p: string[]; w: string[] }, pass: string): Line =>
    p.length ? { id, title, state: 'fail', value: p[0], detail: p.length > 1 ? p.join(' ') : undefined } : w.length ? { id, title, state: 'warn', value: w[0], detail: w.length > 1 ? w.join(' ') : undefined } : { id, title, state: 'pass', value: pass }
  const identity = pick(/^Not a |^It comes from|another session|another project|^Made by version/)
  const run = pick(/^No run is waiting|answers another run|already applied/)
  const units = pick(/^Units must be/)
  const geometry = pick(/^operation \d|^No operations|^The proposal is |must be a list of sentences|under \d+ m² will count/)
  const other = { p: problems.filter((s) => ![identity, run, units, geometry].some((g) => g.p.includes(s))), w: [] }
  return [
    row('identity', 'Identity', identity, 'Tool, version, session and project match'),
    row('run', 'Run', run, 'Answers the run that was sent'),
    row('units', 'Units', units, 'Metres, tower frame, z up'),
    row('geometry', 'Geometry', { p: [...geometry.p, ...other.p], w: geometry.w }, 'Finite, in order, within bounds'),
    stale ? { id: 'freshness', title: 'Freshness', state: 'warn', value: 'The model changed since the inputs were sent', detail: 'Apply is blocked: run the tool again (Update preview) so it reads the model as it is now.' } : { id: 'freshness', title: 'Freshness', state: 'pass', value: 'Same model as sent' },
  ]
}

/** Downstream results that read the tower (names the person knows from the results tab). */
const IMPACTED = 'FSR, floor area, lifts, egress, sun & shadow, view cones, economics'

export default function ProposalPanel() {
  const { pending, def } = useDesignTools(useShallow((s) => ({ pending: s.pending, def: s.pending ? s.definitions[s.pending.proposal.toolId] : undefined })))
  const towers = useTowers()
  const [note, setNote] = useState<string | null>(null)
  const nameOf = (id: string) => towers.find((t) => t.id === id)?.name ?? id
  const ops = useMemo(() => (pending ? ((Array.isArray(pending.proposal.operations) ? pending.proposal.operations : []) as Operation[]) : []), [pending])
  const targets = useMemo(() => [...new Set(ops.map((o) => o.target).filter((t): t is string => typeof t === 'string'))], [ops])
  if (!pending) return <p className="p-4 text-body text-muted" data-testid="proposal-summary">No proposal is waiting. A connected tool's Send to Toolkit puts one here.</p>
  const { proposal: p, check } = pending
  const stale = check.stale
  const canApply = check.ok && !stale && !!def
  const checks = lines(check.problems, check.warnings, stale)
  const toolWords = check.warnings.filter((w) => w.startsWith('Tool: ')).map((w) => w.slice(6))
  const apply = () => {
    const r = applyPending()
    if (!r.ok) { setNote(r.reason); useStore.setState({ announce: r.reason }) }
    else setNote(null)
  }
  const btn = 'h-9 rounded-lg px-3 text-control font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50'

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="proposal-panel" data-stale={stale} data-ok={check.ok}>
      <section data-testid="proposal-summary" aria-labelledby="proposal-summary-h">
        <h3 id="proposal-summary-h" className="text-section font-semibold text-ink">Design change proposal</h3>
        <p className="mt-1 text-body text-ink">
          From <b>{def?.name ?? String(p.toolId)}</b> <span className="text-muted">{String(p.toolVersion ?? '')}</span>, run <span className="tabular-nums text-muted">{String(p.runId ?? '').slice(0, 8)}</span>
          {targets.length > 0 && <> · for <b>{targets.map(nameOf).join(', ')}</b></>}
        </p>
        {stale && <p className="mt-2 rounded-lg border border-warning/40 bg-warning-surface px-3 py-2 text-control text-warning" data-testid="proposal-stale"><b>Check</b>: based on an older model. The model changed since the inputs were sent, so Apply is blocked. Update preview sends the model as it is now.</p>}
        {!check.ok && <p className="mt-2 rounded-lg border border-error/40 bg-error-surface px-3 py-2 text-control text-error"><b>Fail</b>: {check.problems[0]}</p>}
        {(p.assumptions?.length > 0 || toolWords.length > 0) && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-meta text-muted" aria-label="The tool's assumptions and warnings">
            {p.assumptions?.map((a) => <li key={`a-${a}`}>{a}</li>)}
            {toolWords.map((w) => <li key={`w-${w}`} className="text-warning">{w}</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="proposal-changes-h">
        <h4 id="proposal-changes-h" className="text-control font-semibold text-ink">Changes</h4>
        <ul className="mt-1 space-y-1" data-testid="proposal-changes">
          {ops.length === 0 && <li className="text-meta text-muted" data-change="none">No operations.</li>}
          {ops.map((o, i) => (
            <li key={i} className="rounded-lg bg-subtle px-3 py-1.5 text-control text-ink" data-change={o.op} data-target={o.target}>
              {o.op === 'replace-geometry'
                ? <>Replace geometry · <b>{nameOf(o.target)}</b> · {Array.isArray(o.storeys) ? o.storeys.length : 0} storeys, top <span className="tabular-nums">{Array.isArray(o.storeys) && o.storeys.length ? Math.round(Math.max(...o.storeys.map((s) => Number(s.z1) || 0))) : 0} m</span>{o.keep?.length ? <span className="text-muted"> · keeps {o.keep.join(', ')}</span> : null}</>
                : <>Set <b>{String(o.field)}</b> = <span className="tabular-nums">{String(o.value)}</span> · {nameOf(o.target)}</>}
            </li>
          ))}
          <li className="text-meta text-muted" data-change="objects">Objects added or removed: none (this version replaces geometry and sets parameters only).</li>
        </ul>
      </section>

      <section aria-labelledby="proposal-validation-h">
        <h4 id="proposal-validation-h" className="text-control font-semibold text-ink">Validation</h4>
        <ul className="mt-1" data-testid="proposal-validation">
          {checks.map((c) => <StatusRow key={c.id} state={c.state} title={c.title} value={c.value} detail={c.detail} size="sm" testId={`proposal-check-${c.id}`} />)}
        </ul>
      </section>

      <section aria-labelledby="proposal-impacts-h" data-testid="proposal-impacts">
        <h4 id="proposal-impacts-h" className="text-control font-semibold text-ink">Impacts</h4>
        {targets.length ? (
          <ul className="mt-1 space-y-0.5 text-meta text-ink">
            {targets.map((t) => <li key={t}>Results of <b>{nameOf(t)}</b> will be marked <b>Needs update</b>: {IMPACTED}.</li>)}
            <li className="text-muted">Other towers are not touched. One Undo takes the change back.</li>
          </ul>
        ) : <p className="mt-1 text-meta text-muted">No tower is changed.</p>}
      </section>

      {note && <p className="rounded-lg border border-error/40 bg-error-surface px-3 py-2 text-control text-error" role="status"><b>Fail</b>: {note}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={discardPending} data-testid="proposal-discard" className={`${btn} border border-line bg-panel font-medium text-ink hover:border-[#778294]`}>Discard</button>
        <button type="button" onClick={apply} disabled={!canApply} data-testid="proposal-apply" title={stale ? 'Based on an older model: run the tool again' : !check.ok ? check.problems[0] : undefined}
          className={`${btn} bg-accent text-white hover:bg-[#1D4ED8]`}>Apply change</button>
      </div>
    </div>
  )
}
