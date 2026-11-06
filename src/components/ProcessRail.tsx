import { ChevronRight, Cuboid, Layers, MapPin, PencilRuler, Presentation } from './icons'
import { useEffect } from 'react'
import { EVALUATE, PROCESS } from '../data/stages'
import { whenRestored } from '../lib/project/session'
import { goToStep, startOnSite, startStepFollow, useStep, type StepId } from '../lib/step'
import { useStore } from '../store'
import Help from './Help'

const STEP_ICON = { site: MapPin, volume: Cuboid, program: Layers, plates: PencilRuler, frame: Presentation } as const

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
  const analysis = useStore((s) => s.analysis)
  const setAnalysis = useStore((s) => s.setAnalysis)
  return (
    <nav aria-label="Design process" className="stage-fade flex h-9 items-center gap-1 border-b border-line bg-paper px-4 text-[11px]">
      {PROCESS.map((s, i) => {
        const Icon = STEP_ICON[s.id as keyof typeof STEP_ICON]
        const lit = s.id === step
        return (
          <span key={s.id} className="flex items-center gap-1">
            <button onClick={() => goToStep(s.id as StepId)} aria-current={lit ? 'step' : undefined} data-step={s.id}
              className={`stage-fade flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${lit ? 'border-accent/50 bg-panel font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              <Icon size={13} className={lit ? 'text-accent' : ''} />{s.label}
            </button>
            {i < PROCESS.length - 1 && <ChevronRight size={12} className="text-muted/60" aria-hidden />}
          </span>
        )
      })}
      <span className="ml-auto flex items-center gap-1">
        <button type="button" role="switch" aria-checked={analysis} onClick={() => setAnalysis(!analysis)} data-testid="analysis-switch"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${analysis ? 'border-accent/50 bg-panel text-ink' : 'border-line text-muted hover:text-ink'}`}>
          <Gauge size={13} className={analysis ? 'text-accent' : ''} />Analysis
          <span className={`rounded-full px-1.5 text-[10px] font-semibold ${analysis ? 'bg-accent text-white' : 'bg-black/[0.06] text-muted'}`}>{analysis ? 'On' : 'Off'}</span>
        </button>
        <Help label="About the analysis switch">
          On: the checks switched on in the bottom bar run on every step, and their results show under Results &amp; evidence. Off: you design without checks; the ones you picked stay remembered for when you turn it back on.
        </Help>
      </span>
    </nav>
  )
}
