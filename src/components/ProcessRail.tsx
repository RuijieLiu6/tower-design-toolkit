import { ChevronRight, Cuboid, Layers, MapPin, PencilRuler, Presentation } from 'lucide-react'
import { EVALUATE, PROCESS } from '../data/stages'
import { useStore } from '../store'

const STEP_ICON = { site: MapPin, volume: Cuboid, program: Layers, plates: PencilRuler, frame: Presentation } as const

/** The mental map of the design process. Steps of the current stage are lit; clicking a step jumps to its stage. */
export default function ProcessRail() {
  const { phase, setPhase } = useStore()
  const Gauge = EVALUATE.icon
  return (
    <nav aria-label="Design process" className="stage-fade flex h-9 items-center gap-1 border-b border-line bg-paper px-4 text-[11px]">
      {PROCESS.map((s, i) => {
        const Icon = STEP_ICON[s.id as keyof typeof STEP_ICON]
        const lit = s.stage === phase
        return (
          <span key={s.id} className="flex items-center gap-1">
            <button onClick={() => setPhase(s.stage)} aria-current={lit ? 'step' : undefined}
              className={`stage-fade flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${lit ? 'border-accent/50 bg-panel font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              <Icon size={13} className={lit ? 'text-accent' : ''} />{s.label}
            </button>
            {i < PROCESS.length - 1 && <ChevronRight size={12} className="text-muted/60" aria-hidden />}
          </span>
        )
      })}
      <span className="ml-auto flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-0.5 text-muted" title="Evaluation runs on every stage: results stay one tab away">
        <Gauge size={13} />{EVALUATE.label} on every step
      </span>
    </nav>
  )
}
