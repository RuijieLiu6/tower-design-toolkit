// "Design your workflow" on the landing page (Ruijie, 7 Nov: "prioritize showing the concept through customization,
// provide a lot of ways that users can design their workflow, which around different phases of using different tools …
// the experience where the users move on from one step to another"). Five phases left to right (lib/phases.ts), each
// with its design tools and the analysis nodes that fit it as big tiles to switch on or off; the competition site or a
// real Vancouver site; then Start (the guided app opens on the first phase with a node), see it as a graph, or save it
// as a workflow file. A preset or the agent's answer fills it; every tile stays editable. Icons first, words on hover.
import { ArrowRight, Building, Camera, ChevronRight, Cuboid, Download, Grid2x2, FileUp, Image, Layers, Layers2, LayoutGrid, MapPin, PersonStanding, Presentation, Ruler, Scissors, ScrollText, Square, Sun, TowerOnSite, Trash2, Trophy, Workflow, type LucideIcon } from '../icons'
import { iconFor } from '../workflow/nodeIcons'
import { NODE_ICONS, STEP_ICONS, TOOL_ICONS, TOOL_WORDS } from '../../data/icons'
import { BUILT_NODES, CATEGORIES } from '../../data/registry'
import { firstPhase, PHASE_HUE, PHASES } from '../../lib/phases'
import Help from '../Help'
import GlassIcon, { HUES, ICON, nodeHue } from '../GlassIcon'
import { NodeTile } from '../NodeTile'
import { hasNodeArt } from '../icons/nodeArt'
import { nodeWord } from '../../data/nodeWords'

export interface Draft { name: string; nodes: string[]; project: 'vtc' | 'city'; from: string | null }

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
    <section aria-labelledby="composer-title" data-testid="landing-composer" className="glass-edge grid gap-4 rounded-3xl bg-glass-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="composer-title" className="flex items-center gap-2 text-section text-ink">
          Design your workflow
          <Help label="About designing a workflow">Every phase has its design tools; switch on the analysis nodes you want at each one. They all read the same tower model. Start opens the guided app on your first phase, and Next takes you through the rest. Nothing is fixed: change the nodes at any time.</Help>
        </h2>
        <span className="text-[12.5px] text-muted" data-testid="composer-summary"><b className="tabular-nums text-ink">{count}</b> node{count === 1 ? '' : 's'} · {draft.name}</span>
        <div role="radiogroup" aria-label="Site" className="ml-auto flex gap-1">
          {([['vtc', Trophy, 'Competition'], ['city', MapPin, 'Vancouver']] as const).map(([id, I, word]) => (
            <button key={id} type="button" role="radio" aria-checked={draft.project === id} onClick={() => setProject(id)} title={id === 'vtc' ? 'The competition block' : 'A real Vancouver site (the default block until you choose one)'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${draft.project === id ? 'bg-ink font-semibold text-white' : 'text-muted hover:bg-white/50 hover:text-ink'}`}>
              <I size={16} aria-hidden />{word}
            </button>
          ))}
        </div>
      </div>

      <ol className="flex snap-x gap-2 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible" aria-label="Phases">
        {PHASES.map((ph, i) => {
          const Icon = STEP_ICONS[ph.step], lit = ph.nodes.some((id) => on.has(id))
          return (
            <li key={ph.id} data-phase={ph.id} className={`relative flex min-w-[15rem] snap-start flex-col gap-3 rounded-xl p-2 transition-colors md:min-w-0 ${lit ? 'bg-white/45' : ''}`}>
              <div className="flex items-center gap-2">
                <GlassIcon icon={Icon} hue={PHASE_HUE[ph.id]} size={ICON.feature} level={lit ? 'on' : 'soft'} />
                <span className="min-w-0">
                  <span className="block text-meta tabular-nums text-muted">Step {i + 1}</span>
                  <span className="block text-node font-semibold text-ink">{ph.name}</span>
                </span>
                <span className="ml-auto"><Help label={`About ${ph.name}`}>{ph.about}</Help></span>
              </div>
              <ul className="flex flex-wrap gap-1" aria-label={`${ph.name} design tools`}>
                {ph.tools.map((t) => { const T = TOOL_ICONS[t]; return <li key={t} title={`Design tool: ${TOOL_WORDS[t]}`} className="flex h-6 w-6 items-center justify-center text-ink"><T size={15} aria-hidden /><span className="sr-only">{TOOL_WORDS[t]}</span></li> })}
              </ul>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`${ph.name} analysis nodes`}>
                {ph.nodes.map((id) => {
                  const n = BUILT_NODES.find((x) => x.id === id)
                  if (!n) return null
                  const c = CATEGORIES[n.category], NI = NODE_ICONS[id] ?? iconFor(n.name, n.category), pressed = on.has(id), ok = runsOn(id, draft.project)
                  return (
                    <span key={id} className="group relative">
                      <button type="button" aria-pressed={pressed} disabled={!ok} onClick={() => toggle(id)} data-node={id} aria-label={`${n.name}${ok ? '' : ` (not on the ${draft.project === 'vtc' ? 'competition site' : 'Vancouver site'})`}`}
                        className="node-hit flex w-[4.25rem] flex-col items-center gap-1 rounded-xl outline-none disabled:cursor-not-allowed disabled:opacity-40">
                        {hasNodeArt(id) ? <NodeTile id={id} size={ICON.feature} state={pressed ? 'on' : 'off'} /> : <GlassIcon icon={NI} hue={PHASE_HUE[ph.id]} size={ICON.feature} level={pressed ? 'on' : 'off'} />}
                        <span aria-hidden className={`max-w-full text-center text-meta leading-tight ${pressed ? 'font-medium text-ink' : 'text-muted'}`}>{nodeWord(n)}</span>
                      </button>
                      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[15rem] -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-meta leading-snug text-white shadow-lg group-focus-within:block group-hover:block">
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
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-control font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40">
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
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-panel text-ink outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
      <Icon size={20} aria-hidden />
    </button>
  )
}
