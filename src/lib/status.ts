// Status and results vocabulary (Ruijie, 7 Nov, design system: "say what is known, proposed, calculated or missing").
// Two families that must never look alike:
//   ASSESSMENT  a check against stated criteria: Pass ✓, Check !, Fail ✕, Unknown ?, and a check that has nothing to
//               read yet (Needs model / Needs input). Circle symbols, coloured by the STATUS tokens.
//   EXECUTION   whether a process ran: Complete, Waiting for input, Needs model, Not run yet, Blocked, Off, Error.
//               Square symbols, neutral ink unless something stopped it. "Complete" never means "Pass".
// Every status shows a symbol and a short word, never colour alone. Colours are the tokens in lib/design/tokens.ts
// (STATUS), used through the Tailwind classes src/index.css defines.
import type { StatusKind } from './design/tokens'
import type { RuleState } from '../engine/types'

/** An assessment as shown: a rule's state, or "missing" when the check has no input to read. */
export type ResultShow = RuleState | 'missing'

export const RESULT_KIND: Record<ResultShow, StatusKind> = { pass: 'success', warn: 'warning', fail: 'error', unknown: 'pending', missing: 'pending' }
export const RESULT_WORD: Record<ResultShow, string> = { pass: 'Pass', warn: 'Check', fail: 'Fail', unknown: 'Unknown', missing: 'Needs input' }

/** Tailwind classes per status colour: text, pale surface, a chip (surface + keyline + text), a solid dot. */
export const KIND_CLASS: Record<StatusKind, { fg: string; surface: string; chip: string; dot: string; line: string }> = {
  success: { fg: 'text-success', surface: 'bg-success-surface', chip: 'border-success/30 bg-success-surface text-success', dot: 'bg-success', line: 'border-success' },
  warning: { fg: 'text-warning', surface: 'bg-warning-surface', chip: 'border-warning/30 bg-warning-surface text-warning', dot: 'bg-warning', line: 'border-warning' },
  error: { fg: 'text-error', surface: 'bg-error-surface', chip: 'border-error/30 bg-error-surface text-error', dot: 'bg-error', line: 'border-error' },
  pending: { fg: 'text-pending', surface: 'bg-pending-surface', chip: 'border-line bg-pending-surface text-pending', dot: 'bg-pending', line: 'border-pending' },
}

export const resultClass = (s: ResultShow) => KIND_CLASS[RESULT_KIND[s]]

/**
 * The word for a result line. An open ("unknown") line says what it waits for when its value says so: a building
 * model, or an input someone has to enter. Otherwise Pass, Check, Fail or Unknown.
 */
export function resultWord(state: RuleState, value?: string): string {
  if (state !== 'unknown' || !value) return RESULT_WORD[state]
  if (/^needs model\b/i.test(value)) return 'Needs model'
  if (/\bnot (entered|answered)\b|^needs (a|an|the) |^enter /i.test(value)) return 'Needs input'
  return RESULT_WORD.unknown
}

/** Execution status of a process (a workflow node, a run). */
export type RunStatus = 'complete' | 'waiting-input' | 'needs-model' | 'not-run' | 'blocked' | 'off' | 'error'
export const RUN_WORD: Record<RunStatus, string> = {
  complete: 'Complete', 'waiting-input': 'Waiting for input', 'needs-model': 'Needs model', 'not-run': 'Not run yet', blocked: 'Blocked', off: 'Off', error: 'Error',
}
/** Neutral unless the process stopped on something: a finished run is not a verdict. */
export const RUN_CLASS: Record<RunStatus, string> = {
  complete: 'text-muted', 'waiting-input': 'text-pending', 'needs-model': 'text-pending', 'not-run': 'text-pending', blocked: 'text-warning', off: 'text-pending', error: 'text-error',
}
