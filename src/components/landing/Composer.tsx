// "Design your workflow" on the landing page (Ruijie, 7 Nov: "prioritize showing the concept through customization,
// provide a lot of ways that users can design their workflow, which around different phases of using different tools …
// the experience where the users move on from one step to another"). Five phases left to right (lib/phases.ts), each
// with its design tools and the analysis nodes that fit it as big tiles to switch on or off; the competition site or a
// real Vancouver site; then Start (the guided app opens on the first phase with a node), see it as a graph, or save it
// as a workflow file. A preset or the agent's answer fills it; every tile stays editable. Icons first, words on hover.
import { ArrowRight, Building, Camera, ChevronRight, Cuboid, Download, Grid2x2, FileUp, Image, Layers, Layers2, LayoutGrid, MapPin, PersonStanding, Presentation, Ruler, Scissors, ScrollText, Square, Sun, TowerOnSite, Trash2, Trophy, Workflow, type LucideIcon } from '../icons'
import { iconFor } from '../workflow/nodeIcons'
import { BUILT_NODES, CATEGORIES } from '../../data/registry'
import { firstPhase, PHASES, type PhaseId } from '../../lib/phases'
import Help from '../Help'

export interface Draft { name: string; nodes: string[]; project: 'vtc' | 'city'; from: string | null }

const PHASE_ICON: Record<PhaseId, LucideIcon> = { site: MapPin, form: Cuboid, program: Layers, schematic: Grid2x2, present: Presentation }
const TOOL_ICON: Record<string, LucideIcon> = {
  Site: MapPin, Import: FileUp, Position: TowerOnSite, Height: Ruler, Sun, Massing: Cuboid, Basement: Layers2, Program: Layers,
  Ground: PersonStanding, Brief: ScrollText, Core: Building, Anatomy: Layers2, Plan: Square, Section: Scissors,
  Camera, Capture: Camera, Boards: LayoutGrid, Render: Image,
}
const runsOn = (id: string, project: 'vtc' | 'city') => (BUILT_NODES.find((n) => n.id === id)?.projects ?? ['vtc', 'city']).includes(project)

export default function Composer({ draft, onChange, onStart, onGraph, onSave }: {
  draft: Draft; onChange: (d: Draft) => void; onStart: () => void; onGraph: () => void; onSave: () => void
}) {
  const on = new Set(draft.nodes)
  const toggle = (id: string) => onChange({ ...draft, from: null, name: draft.from ? `${draft.name} (edited)` : draft.name, nodes: on.has(id) ? draft.nodes.filter((x) => x !== id) : [...draft.nodes, id] })
  const setProject = (project: 'vtc' | 'city') => onChange({ ...draft, project, nodes: draft.nodes.filter((id) => runsOn(id, project)) })
  const start = firstPhase(draft.nodes)
  const count = draft.nodes.length
  return (
    <section aria-labelledby="composer-title" data-testid="landing-composer" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="composer-title" className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Design your workflow
          <Help label="About designing a workflow">Every phase has its design tools; switch on the analysis nodes you want at each one. They all read the same tower model. Start opens the guided app on your first phase, and Next takes you through the rest. Nothing is fixed: change the nodes at any time.</Help>
        </h2>
        <span className="rounded-full bg-paper px-2.5 py-1 text-[12.5px] text-muted" data-testid="composer-summary"><b className="tabular-nums text-ink">{count}</b> node{count === 1 ? '' : 's'} · {draft.name}</span>
        <div role="radiogroup" aria-label="Site" className="ml-auto flex rounded-xl border border-line bg-panel p-1">
          {([['vtc', Trophy, 'Competition'], ['city', MapPin, 'Vancouver']] as const).map(([id, I, word]) => (
            <button key={id} type="button" role="radio" aria-checked={draft.project === id} onClick={() => setProject(id)} title={id === 'vtc' ? 'The competition block' : 'A real Vancouver site (the default block until you choose one)'}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent ${draft.project === id ? 'bg-ink font-semibold text-white' : 'text-muted hover:text-ink'}`}>
              <I size={16} aria-hidden />{word}
            </button>
          ))}
        </div>
      </div>

      <ol className="flex snap-x gap-2 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible" aria-label="Phases">
        {PHASES.map((ph, i) => {
          const Icon = PHASE_ICON[ph.id], lit = ph.nodes.some((id) => on.has(id))
          return (
            <li key={ph.id} data-phase={ph.id} className={`relative flex min-w-[15rem] snap-start flex-col gap-3 rounded-2xl border p-3 md:min-w-0 ${lit ? 'border-accent/40 bg-panel' : 'border-line bg-panel/60'}`}>
              <div className="flex items-center gap-2">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${lit ? 'bg-accent text-white' : 'bg-paper text-accent'}`} aria-hidden><Icon size={24} /></span>
                <span className="min-w-0">
                  <span className="block text-[11px] tabular-nums text-muted">Step {i + 1}</span>
                  <span className="block text-[15px] font-semibold leading-tight text-ink">{ph.name}</span>
                </span>
                <span className="ml-auto"><Help label={`About ${ph.name}`}>{ph.about}</Help></span>
              </div>
              <ul className="flex flex-wrap gap-1" aria-label={`${ph.name} design tools`}>
                {ph.tools.map((t) => { const T = TOOL_ICON[t] ?? Square; return <li key={t} title={`Design tool: ${t}`} className="flex h-7 w-7 items-center justify-center rounded-lg bg-paper text-ink"><T size={15} aria-hidden /><span className="sr-only">{t}</span></li> })}
              </ul>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`${ph.name} analysis nodes`}>
                {ph.nodes.map((id) => {
                  const n = BUILT_NODES.find((x) => x.id === id)
                  if (!n) return null
                  const c = CATEGORIES[n.category], NI = iconFor(n.name, n.category), pressed = on.has(id), ok = runsOn(id, draft.project)
                  return (
                    <span key={id} className="group relative">
                      <button type="button" aria-pressed={pressed} disabled={!ok} onClick={() => toggle(id)} data-node={id} aria-label={`${n.name}${ok ? '' : ` (not on the ${draft.project === 'vtc' ? 'competition site' : 'Vancouver site'})`}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-25"
                        style={pressed ? { background: c.color, borderColor: c.color } : { background: `color-mix(in srgb, ${c.color} 8%, transparent)`, borderColor: `color-mix(in srgb, ${c.color} 30%, transparent)` }}>
                        <NI size={22} color={pressed ? '#fff' : c.color} aria-hidden />
                      </button>
                      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[15rem] -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg group-focus-within:block group-hover:block">
                        <b className="block font-semibold">{n.name}</b>
                        <span className="block opacity-80">{n.question}</span>
                        {!ok && <span className="block text-amber-200">Runs on the {draft.project === 'vtc' ? 'Vancouver' : 'competition'} site only</span>}
                      </span>
                    </span>
                  )
                })}
              </div>
              {i < PHASES.length - 1 && <ChevronRight size={18} className="absolute -right-[15px] top-6 z-10 hidden text-muted md:block" aria-hidden />}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onStart} disabled={!count} data-testid="composer-start"
          className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40">
          Start at {start.name}<ArrowRight size={18} aria-hidden />
        </button>
        <ActionTile icon={Workflow} label="See it as a node graph in Customize" onClick={onGraph} disabled={!count} />
        <ActionTile icon={Download} label="Save it as a workflow file (.json) to share or open later" onClick={onSave} disabled={!count} testId="composer-save" />
        <ActionTile icon={Trash2} label="Clear every node" onClick={() => onChange({ ...draft, nodes: [], from: null, name: 'Your workflow' })} disabled={!count} />
      </div>
    </section>
  )
}

function ActionTile({ icon: Icon, label, onClick, disabled, testId }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} data-testid={testId}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel text-ink outline-none hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
      <Icon size={20} aria-hidden />
    </button>
  )
}
