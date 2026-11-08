// The phase row (Ruijie, 8 Nov: "The top navigation selects the design phase … consolidate any competing phase navigation
// into the five-phase row"): Site, Form, Program, Schematic and Present, the same five as the landing page, each with
// its phase colour and the number of its checks that are on. A phase is always revisitable: switching keeps every
// setting and the model. At the right: Next phase as a shortcut (it never runs anything), the Library (every check's
// switch) and the Analysis switch. The whole workflow is the strip along the bottom (workflow/WorkflowOverview.tsx).
import { ArrowRight, Library, X } from './icons'
import { EVALUATE } from '../data/stages'
import { useEffect, useRef, useState } from 'react'
import { whenRestored } from '../lib/project/session'
import { goToStep, startOnSite, startStepFollow, useStep } from '../lib/step'
import { PHASES } from '../lib/phases'
import { PHASE_COLOR } from '../lib/design/tokens'
import { PHASE_IDS, PHASE_NAME, PHASE_STEP, STEP_PHASE } from '../lib/workflow/phaseTools'
import { useStore } from '../store'
import Help from './Help'
import NodeLibrary from './NodeLibrary'

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
  const enabled = useStore((s) => s.enabled)
  const phase = STEP_PHASE[step]
  const onIn = (p: string) => (PHASES.find((x) => x.id === p)?.nodes ?? []).filter((n) => enabled[n])
  const at = PHASE_IDS.indexOf(phase)
  const next = at >= 0 && at < PHASE_IDS.length - 1 ? PHASE_IDS[at + 1] : null
  const goNext = () => {
    if (!next) return
    goToStep(PHASE_STEP[next])
    useStore.setState({ announce: `${PHASE_NAME[next]} phase` })
  }
  const [lib, setLib] = useState(false)
  const libBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lib) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setLib(false) }
    const away = (e: PointerEvent) => { if (!libBox.current?.contains(e.target as Node)) setLib(false) }
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', away, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away, true) }
  }, [lib])

  return (
    <nav aria-label="Design process" className="glass-edge flex h-11 shrink-0 items-center gap-1 rounded-2xl bg-panel px-2 text-control">
      <div role="list" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        {PHASE_IDS.map((p) => {
          const lit = p === phase, n = onIn(p).length
          return (
            <span role="listitem" key={p}>
              <button type="button" onClick={() => goToStep(PHASE_STEP[p])} aria-current={lit ? 'step' : undefined} data-step={PHASE_STEP[p]} data-phase={p}
                className={`relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${lit ? 'bg-selected font-semibold text-accent-hover' : 'text-ink hover:bg-subtle'}`}>
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[p].accent }} />{PHASE_NAME[p]}
                {analysis && n > 0 && <span className="rounded-full bg-subtle px-1.5 text-meta tabular-nums text-muted" title={`${n} check${n === 1 ? '' : 's'} on in this phase`} data-testid={`step-count-${PHASE_STEP[p]}`}>{n}</span>}
                {lit && <span aria-hidden className="absolute inset-x-2 -bottom-[3px] h-[3px] rounded-full bg-accent" />}
              </button>
            </span>
          )
        })}
      </div>
      {next && (
        <button type="button" onClick={goNext} data-testid="rail-next" title={`Go on to ${PHASE_NAME[next]} (navigation only: nothing runs)`}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-meta text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
          Next: {PHASE_NAME[next]}<ArrowRight size={13} aria-hidden />
        </button>
      )}
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
      <div ref={libBox} className="relative shrink-0">
        <button type="button" onClick={() => setLib((v) => !v)} aria-expanded={lib} data-testid="library-button" title="Every check: switch it on or off, or find one"
          className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-1.5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><Library size={15} aria-hidden />Library</button>
        {lib && (
          <div role="dialog" aria-label="Node library" className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(36rem,72vh)] w-[22rem] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-float">
            <div className="flex items-center justify-between border-b border-line px-3 py-2"><h2 className="text-control font-semibold text-ink">Node library</h2>
              <button type="button" onClick={() => setLib(false)} aria-label="Close the node library" className="rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={14} /></button></div>
            <div className="min-h-0 overflow-y-auto p-2"><NodeLibrary /></div>
          </div>
        )}
      </div>
      <button type="button" role="switch" aria-checked={analysis} onClick={() => setAnalysis(!analysis)} data-testid="analysis-switch"
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${analysis ? 'border-accent/50 bg-panel text-ink' : 'border-line text-muted hover:text-ink'}`}>
        <Gauge size={13} className={analysis ? 'text-accent' : ''} />Analysis
        <span className={`rounded-full px-1.5 text-meta font-semibold ${analysis ? 'bg-accent text-white' : 'bg-black/[0.06] text-muted'}`}>{analysis ? 'On' : 'Off'}</span>
      </button>
      <Help label="About the phases">
        The five phases of the design, the same as on the start page. Each phase's tools and their order are in the left panel; the strip along the bottom shows the whole workflow (Expand to see the connections between phases, Edit to rearrange it). Switching phase keeps your model and every setting. Analysis On runs the checks that are on; Off designs without them (your choices are kept).
      </Help>
    </nav>
  )
}
