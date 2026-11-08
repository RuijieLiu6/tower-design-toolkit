import { ArrowRight, ChevronRight } from './icons'
import { STEP_ICONS, WAY_ICONS } from '../data/icons'
import { openWorkflowBuilder } from '../lib/intro'
import { useEffect } from 'react'
import { EVALUATE, PROCESS, STAGES } from '../data/stages'
import { whenRestored } from '../lib/project/session'
import { goToStep, startOnSite, startStepFollow, useStep, type StepId } from '../lib/step'
import { PHASES } from '../lib/phases'
import { useStore } from '../store'
import Help from './Help'

const STEP_ICON = STEP_ICONS
const BuildIcon = WAY_ICONS.phases

/**
 * The mental map of the design process. Only the current step is lit (lib/step.ts); clicking a step goes to it and to
 * its stage. A first open of the guided app starts on Site (Integrate Vista, Site step, 3 Nov). The Analysis switch at
 * the right end turns the checks on or off for every step (Ruijie, 6 Nov: "they could choose to run analysis or not").
 */
export default function ProcessRail() {
  const step = useStep((s) => s.step)
  useEffect(() => {
    const stop = startStepFollow()
    startOnSite(whenRestored())
    return stop
  }, [])
  const Gauge = EVALUATE.icon
  // Which mode you are in (Ruijie, 7 Nov: "indicate which mode it is"): named at the start of the rail, and the steps of
  // this mode backed in glass, so the rail reads as one mode's steps within the whole process.
  const phase = useStore((s) => s.phase)
  const mode = STAGES.find((x) => x.id === phase) ?? STAGES[0]
  const ModeIcon = mode.icon
  const analysis = useStore((s) => s.analysis)
  const setAnalysis = useStore((s) => s.setAnalysis)
  const enabled = useStore((s) => s.enabled)
  // Step to step (Ruijie, 7 Nov: "the experience where the users move on from one step to another"): each step shows how
  // many of the workflow's checks belong to it, and Next goes on, with that step's first check in the results.
  const onIn = (id: string) => (PHASES.find((p) => p.step === id)?.nodes ?? []).filter((n) => enabled[n])
  const at = PROCESS.findIndex((s) => s.id === step)
  const next = at >= 0 && at < PROCESS.length - 1 ? PROCESS[at + 1] : null
  const goNext = () => {
    if (!next) return
    goToStep(next.id as StepId)
    const nodes = onIn(next.id)
    if (nodes[0]) useStore.getState().selectNode(nodes[0])
    useStore.setState({ announce: `${next.label}: ${nodes.length ? `${nodes.length} check${nodes.length === 1 ? '' : 's'} in your workflow` : 'no checks of your workflow here'}` })
  }
  return (
    <nav aria-label="Design process" className="glass-edge stage-fade flex h-10 shrink-0 items-center gap-1 rounded-2xl bg-glass-2 px-3 text-meta">
      <span data-testid="mode-indicator" title={`${mode.label} mode: ${mode.purpose}`} className="flex shrink-0 items-center gap-1.5 pr-1 text-[12.5px] font-semibold text-accent">
        <ModeIcon size={16} aria-hidden />{mode.label}<span className="sr-only"> mode</span>
      </span>
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-ink/15" />
      {PROCESS.map((s, i) => {
        const Icon = STEP_ICON[s.id as keyof typeof STEP_ICON]
        const lit = s.id === step, other = s.stage !== phase
        return (
          <span key={s.id} className="flex items-center gap-1">
            <button onClick={() => goToStep(s.id as StepId)} aria-current={lit ? 'step' : undefined} data-step={s.id}
              className={`stage-fade flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${lit ? 'border-accent/50 bg-panel font-semibold text-ink' : `border-transparent text-muted hover:text-ink ${other ? '' : 'bg-white/45'}`}`}>
              <Icon size={13} className={lit ? 'text-accent' : ''} />{s.label}
              {analysis && onIn(s.id).length > 0 && <span className="rounded-full bg-accent/15 px-1.5 text-meta font-semibold tabular-nums text-accent" title={`${onIn(s.id).length} check${onIn(s.id).length === 1 ? '' : 's'} of your workflow at this step`} data-testid={`step-count-${s.id}`}>{onIn(s.id).length}</span>}
            </button>
            {i < PROCESS.length - 1 && <ChevronRight size={12} className="text-muted/60" aria-hidden />}
          </span>
        )
      })}
      {next && (
        <button type="button" onClick={goNext} data-testid="rail-next" title={`Go on to ${next.label}${onIn(next.id).length ? `: ${onIn(next.id).length} checks of your workflow` : ''}`}
          className="ml-2 flex items-center gap-1.5 rounded-full bg-accent px-3 py-0.5 font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1">
          Next: {next.label}<ArrowRight size={13} aria-hidden />
        </button>
      )}
      <span className="ml-auto flex items-center gap-1">
        {/* Not your workflow? The phase board, with this one on it, and the ready-made ones. */}
        <button type="button" onClick={openWorkflowBuilder} data-testid="rail-workflow" title="Build my workflow: change this one on the phase board, or pick a ready-made one"
          className="mr-1 flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-muted outline-none hover:border-accent/40 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
          <BuildIcon size={13} aria-hidden />Build my workflow
        </button>
        <button type="button" role="switch" aria-checked={analysis} onClick={() => setAnalysis(!analysis)} data-testid="analysis-switch"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${analysis ? 'border-accent/50 bg-panel text-ink' : 'border-line text-muted hover:text-ink'}`}>
          <Gauge size={13} className={analysis ? 'text-accent' : ''} />Analysis
          <span className={`rounded-full px-1.5 text-meta font-semibold ${analysis ? 'bg-accent text-white' : 'bg-black/[0.06] text-muted'}`}>{analysis ? 'On' : 'Off'}</span>
        </button>
        <Help label="About the analysis switch">
          On: the checks switched on in the bottom bar run on every step, and their results show under Results &amp; evidence. Off: you design without checks; the ones you picked stay remembered for when you turn it back on.
        </Help>
      </span>
    </nav>
  )
}
