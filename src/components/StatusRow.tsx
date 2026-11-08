// One status line with the app's result symbols (Ruijie, 6 Nov: "use icons and symbols to simplify … pass or fail"):
// ✓ pass, ✕ fail, ! check, ? unknown, ◌ needs model or input, each with its short word beside it (design system,
// 7 Nov: a symbol and a word on every status, never colour alone), then a short title and the number that decides it.
// The long text (what was checked, the source, the evidence flag) sits behind a "?" (Help.tsx); a fix, when there is
// one, shows under it. Used by the results checklist (ResultChecklist.tsx) and the viewport's proposal card
// (TowerToolbar.tsx).
import type { ReactNode } from 'react'
import { Wrench } from './icons'
import type { Flag, RuleState } from '../engine/types'
import { resultClass, resultWord, type ResultShow } from '../lib/status'
import Help from './Help'
import { RESULT_ICON } from './ResultState'
import { FlagChip } from './ui'

export const STATUS_ICON: Record<RuleState, (typeof RESULT_ICON)[RuleState]> = { pass: RESULT_ICON.pass, fail: RESULT_ICON.fail, warn: RESULT_ICON.warn, unknown: RESULT_ICON.unknown }
export const STATUS_TONE: Record<RuleState, string> = { pass: resultClass('pass').fg, fail: resultClass('fail').fg, warn: resultClass('warn').fg, unknown: resultClass('unknown').fg }

/** Evidence flags worth showing on the row itself (a pass keeps its flag in the details). */
const LOUD = new Set(['unverified', 'unresolved', 'false_assumption'])

export default function StatusRow({ state, title, value, detail, fix, flag, size = 'md', testId }: {
  state: RuleState
  title: ReactNode
  value?: ReactNode
  /** The long text: what was checked, the source. Behind a "?". */
  detail?: ReactNode
  fix?: string | null
  flag?: string
  size?: 'md' | 'sm'
  testId?: string
}) {
  // An open line whose value says what it waits for shows that ("Needs model", "Needs input") in place of "Unknown".
  const word = resultWord(state, typeof value === 'string' ? value : undefined)
  const shown: ResultShow = state === 'unknown' && word !== 'Unknown' ? 'missing' : state
  const Icon = RESULT_ICON[shown]
  const tone = resultClass(shown).fg
  const text = size === 'md' ? 'text-xs' : 'text-meta'
  return (
    <li className="grid grid-cols-[1.25rem_auto_1fr] items-start gap-x-1.5 py-1" data-testid={testId} data-state={state}>
      <Icon size={size === 'md' ? 18 : 16} className={`mt-px ${tone}`} aria-hidden />
      <span className={`mt-0.5 min-w-[2.6rem] text-meta font-semibold leading-snug ${tone}`}>{word}<span className="sr-only">: </span></span>
      <div className="min-w-0">
        <p className={`flex flex-wrap items-center gap-x-1 ${text} leading-snug`}>
          <b className="font-semibold text-ink">{title}</b>
          {value != null && value !== '' && <span className="tabular-nums text-muted">· {value}</span>}
          {detail && <Help label="Details">{detail}</Help>}
        </p>
        {fix && <p className="mt-0.5 flex items-start gap-1 text-meta leading-snug text-ink"><Wrench size={12} className="mt-px shrink-0 text-accent" aria-hidden /><span><span className="sr-only">How to fix: </span>{fix}</span></p>}
        {state !== 'pass' && flag && LOUD.has(flag) && <span className="mt-0.5 inline-flex"><FlagChip flag={flag as Flag} /></span>}
      </div>
    </li>
  )
}
