// One status line with the app's result symbols (Ruijie, 6 Nov: "use icons and symbols to simplify … pass or fail"):
// ✓ pass, ✕ fail, ! check, ? unknown, then a short title and the number that decides it. The long text (what was
// checked, the source, the evidence flag) sits behind a "?" (Help.tsx); a fix, when there is one, shows under it.
// Used by the results checklist (ResultChecklist.tsx) and the viewport's proposal card (TowerToolbar.tsx).
import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, CircleHelp, CircleX, Wrench } from './icons'
import type { Flag, RuleState } from '../engine/types'
import { STATE_WORD } from '../lib/fixes'
import Help from './Help'
import { FlagChip } from './ui'

export const STATUS_ICON: Record<RuleState, typeof CircleCheck> = { pass: CircleCheck, fail: CircleX, warn: CircleAlert, unknown: CircleHelp }
export const STATUS_TONE: Record<RuleState, string> = { pass: 'text-emerald-700', fail: 'text-red-700', warn: 'text-amber-700', unknown: 'text-slate-500' }

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
  const Icon = STATUS_ICON[state]
  const text = size === 'md' ? 'text-xs' : 'text-meta'
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-1.5 py-1" data-testid={testId} data-state={state}>
      <Icon size={size === 'md' ? 18 : 16} className={`mt-px ${STATUS_TONE[state]}`} aria-hidden />
      <div className="min-w-0">
        <p className={`flex flex-wrap items-center gap-x-1 ${text} leading-snug`}>
          <span className="sr-only">{STATE_WORD[state]}: </span>
          <b className="font-semibold text-ink">{title}</b>
          {value != null && value !== '' && <span className="text-muted">· {value}</span>}
          {detail && <Help label="Details">{detail}</Help>}
        </p>
        {fix && <p className="mt-0.5 flex items-start gap-1 text-meta leading-snug text-ink"><Wrench size={12} className="mt-px shrink-0 text-accent" aria-hidden /><span><span className="sr-only">How to fix: </span>{fix}</span></p>}
        {state !== 'pass' && flag && LOUD.has(flag) && <span className="mt-0.5 inline-flex"><FlagChip flag={flag as Flag} /></span>}
      </div>
    </li>
  )
}
