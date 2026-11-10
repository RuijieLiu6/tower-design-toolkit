// The phase row (overnight brief, 8 Nov: "Keep exactly one permanent phase-navigation row: Site / Form / Program /
// Schematic / Present … Remove nonessential counts"; Overview went on 9 Nov: Edit workflow does the same). The same five phases as the landing
// page, each with its colour dot; the chosen one in the selected look. A phase is always revisitable: switching keeps
// every setting, the model and each phase's open tool. Overview opens the whole project workflow on demand; it is
// closed on entry, and closing it restores the working state (workflow/WorkflowOverview.tsx). Project-wide controls
// (Auto-run checks, the check library, units, role, help) live in the project bar, not here.
import { useEffect, type KeyboardEvent } from 'react'
import { whenRestored } from '../lib/project/session'
import { goToStep, startOnSite, startStepFollow, useStep } from '../lib/step'
import { PHASE_COLOR } from '../lib/design/tokens'
import { PHASE_IDS, PHASE_NAME, PHASE_STEP, STEP_PHASE } from '../lib/workflow/phaseTools'
import Help from './Help'

export default function ProcessRail() {
  const step = useStep((s) => s.step)
  useEffect(() => {
    const stop = startStepFollow()
    startOnSite(whenRestored())
    return stop
  }, [])
  const phase = STEP_PHASE[step]
  // Arrow keys move along the phases (one tab stop for the row), Home / End to the ends.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = PHASE_IDS.indexOf(phase)
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? PHASE_IDS.length - 1 : null
    if (j === null) return
    e.preventDefault()
    const next = PHASE_IDS[(j + PHASE_IDS.length) % PHASE_IDS.length]
    goToStep(PHASE_STEP[next])
    document.querySelector<HTMLElement>(`nav[aria-label="Design process"] [data-phase="${next}"]`)?.focus()
  }

  return (
    <nav aria-label="Design process" className="glass-edge flex h-11 shrink-0 items-center gap-1 rounded-2xl bg-panel px-2 text-control">
      <div role="list" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {PHASE_IDS.map((p) => {
          const lit = p === phase
          return (
            <span role="listitem" key={p}>
              <button type="button" onClick={() => goToStep(PHASE_STEP[p])} onKeyDown={onKey} aria-current={lit ? 'step' : undefined} tabIndex={lit ? 0 : -1}
                data-step={PHASE_STEP[p]} data-phase={p}
                className={`relative flex h-8 items-center gap-2 rounded-lg px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${lit ? 'bg-selected font-semibold text-accent-hover' : 'text-ink hover:bg-subtle'}`}>
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[p].accent }} />{PHASE_NAME[p]}
                {lit && <span aria-hidden className="absolute inset-x-2 -bottom-[5px] h-[3px] rounded-full bg-accent" />}
              </button>
            </span>
          )
        })}
      </div>
      <Help label="About the phases">
        The five phases of the design, the same as on the start page; the arrow keys move between them. Each phase's tools and their order are in the left panel, with the open tool's controls under them. Edit workflow (project bar) shows the whole project workflow, to rearrange it or add tools; closing it brings you back to where you were. Switching phase keeps your model, every setting and each phase's open tool.
      </Help>
    </nav>
  )
}
