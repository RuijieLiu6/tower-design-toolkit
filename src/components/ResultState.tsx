// The status and results components of the design system (Ruijie, 7 Nov): a symbol and a short word on every status,
// in the STATUS colours (lib/status.ts, lib/design/tokens.ts). Assessment results (Pass, Check, Fail, Unknown, Needs
// model) use circle symbols; execution status (Complete, Waiting for input, Blocked, Off, Error) uses square ones, so
// "Complete" never looks like "Pass". The results panel's three states live here too: a check that waits for an input
// (NeedsInput), a check whose engine stopped (ResultError, ResultBoundary); complete results are the panels themselves.
import { Component, type ReactNode } from 'react'
import { Ban, CircleAlert, CircleCheck, CircleDashed, CircleHelp, CircleX, Hourglass, PowerOff, Square, SquareDashed, TriangleAlert } from './icons'
import type { RuleState } from '../engine/types'
import { goToStep } from '../lib/step'
import type { InputGap } from '../lib/missingInput'
import { KIND_CLASS, RESULT_WORD, RUN_CLASS, RUN_WORD, resultClass, type ResultShow, type RunStatus } from '../lib/status'

export const RESULT_ICON: Record<ResultShow, typeof CircleCheck> = { pass: CircleCheck, warn: CircleAlert, fail: CircleX, unknown: CircleHelp, missing: CircleDashed }

/** An assessment as a chip: circle symbol + word, in its status colour. `word` overrides the state's own word. */
export function ResultBadge({ state, word, className = '' }: { state: ResultShow; word?: string; className?: string }) {
  const Icon = RESULT_ICON[state]
  return (
    <span data-result={state} className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-meta font-semibold leading-none ${resultClass(state).chip} ${className}`}>
      <Icon size={12} aria-hidden />{word ?? RESULT_WORD[state]}
    </span>
  )
}

/** Counts of results by state, each with its symbol and word ("2 fail", "1 check", "5 pass", "3 unknown"). */
export function ResultCounts({ counts, className = '' }: { counts: Partial<Record<RuleState, number>>; className?: string }) {
  const order: RuleState[] = ['fail', 'warn', 'unknown', 'pass']
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}>
      {order.filter((s) => (counts[s] ?? 0) > 0).map((s) => {
        const Icon = RESULT_ICON[s]
        return <span key={s} className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${resultClass(s).fg}`}><Icon size={12} aria-hidden />{counts[s]} {RESULT_WORD[s].toLowerCase()}</span>
      })}
    </span>
  )
}

const RUN_ICON: Record<RunStatus, typeof Square> = { complete: Square, 'waiting-input': SquareDashed, 'needs-model': SquareDashed, 'not-run': Hourglass, blocked: Ban, off: PowerOff, error: TriangleAlert }

/** Execution status: square symbol + word, neutral unless the process stopped. Not a verdict. */
export function RunBadge({ status, detail, className = '' }: { status: RunStatus; detail?: ReactNode; className?: string }) {
  const Icon = RUN_ICON[status]
  return (
    <span data-run-status={status} className={`inline-flex min-w-0 items-center gap-1 text-meta font-medium leading-none ${RUN_CLASS[status]} ${className}`}>
      {/* Complete: a solid square (the process ran to the end); the open shapes are processes still waiting. */}
      <Icon size={11} aria-hidden {...(status === 'complete' ? { fill: 'currentColor' } : {})} />
      <span className="shrink-0">{RUN_WORD[status]}</span>
      {detail != null && detail !== '' && <span className="min-w-0 truncate font-normal text-muted">· {detail}</span>}
    </span>
  )
}

const STEP_LABEL: Record<string, string> = { site: 'Go to the Site step', volume: 'Go to the Form step' }

/** Results panel, missing input: what the check waits for and what to do next. Never a pass, never a zero. */
export function NeedsInput({ gap, name }: { gap: InputGap; name?: string }) {
  const c = KIND_CLASS.pending
  return (
    <section data-testid="needs-input" data-gap={gap.status} aria-label={`${name ?? 'This check'}: ${gap.word}`} className="border-b border-line px-4 py-3">
      <div className={`rounded-lg border border-dashed border-pending/40 ${c.surface} p-3`}>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${c.fg}`}><CircleDashed size={18} aria-hidden />{gap.word}</p>
        <p className="mt-1 text-meta text-muted">{gap.reason}</p>
        <p className="mt-1 text-meta font-medium text-ink">{gap.next}</p>
        <button type="button" onClick={() => goToStep(gap.step)}
          className="mt-2 rounded-md bg-accent px-2.5 py-1.5 text-meta font-semibold text-white outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          {STEP_LABEL[gap.step] ?? 'Go there'}
        </button>
      </div>
    </section>
  )
}

/** Results panel, error: the check stopped; a short reason, and what to try. */
export function ResultError({ reason, name, onRetry }: { reason: string; name?: string; onRetry?: () => void }) {
  const c = KIND_CLASS.error
  const short = reason.length > 160 ? `${reason.slice(0, 157)}…` : reason
  return (
    <section role="alert" data-testid="result-error" className="border-b border-line px-4 py-3">
      <div className={`rounded-lg border border-error/30 ${c.surface} p-3`}>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${c.fg}`}><TriangleAlert size={18} aria-hidden />Error</p>
        <p className="mt-1 text-meta text-ink">{name ?? 'This check'} stopped before it gave a result: <span className="font-mono">{short || 'no reason given'}</span></p>
        <p className="mt-1 text-meta text-muted">Nothing here is a result. Undo the last change (Ctrl+Z), or change the input it names, then try again.</p>
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="mt-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-meta font-semibold text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
            Try again
          </button>
        )}
      </div>
    </section>
  )
}

/** Catches a check's panel that throws while it renders, and shows the error state in its place. */
export class ResultBoundary extends Component<{ name?: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.warn(`${this.props.name ?? 'A check'} failed to render its results.`, error) }
  render() {
    if (!this.state.error) return this.props.children
    return <ResultError reason={this.state.error.message} name={this.props.name} onRetry={() => this.setState({ error: null })} />
  }
}
