import { Aperture, Axis3d, BookOpen, CircleQuestionMark, Columns2, ListChecks, LockKeyhole, Network, PlayCircle, Scale, Waves, Workflow } from './icons'
import { showIntro } from '../lib/intro'
import { openCity } from '../lib/openCity'
import { STAGES } from '../data/stages'
import { captureShot } from '../lib/capture'
import { navigate } from '../lib/route'
import { useTour } from '../lib/tour'
import ProjectMenu from './ProjectMenu'
import ExportMenu from './ExportMenu'
import { UnitSelect } from './Units'
import { RoleSelect } from './RolePicker'
import { useStore, type ProjectKind, type ViewMode } from '../store'
import { useShallow } from 'zustand/react/shallow'

const PROJECTS: { id: ProjectKind; label: string; hint: string }[] = [
  { id: 'vtc', label: 'Competition site', hint: 'Hypothetical VTC block with the supplied context model' },
  { id: 'city', label: 'Real Vancouver', hint: 'Real City view cones; place a tower anywhere downtown' },
]
const VIEWS: { id: ViewMode; icon: typeof Axis3d; label: string }[] = [
  { id: '3d', icon: Axis3d, label: '3D model' },
  { id: 'split', icon: Columns2, label: 'Model and node canvas' },
  { id: 'canvas', icon: Network, label: 'Node canvas' },
]

export default function TopBar() {
  const { project, phase, view, setProject, setPhase, setView, set, reducedMotion } = useStore(useShallow((s) => ({ project: s.project, phase: s.phase, view: s.view, setProject: s.setProject, setPhase: s.setPhase, setView: s.setView, set: s.set, reducedMotion: s.reducedMotion })))
  const present = phase === 'present'
  // The bar is about 1,580 px wide with every label (1,780 px in Present): below that, labels give way to icons
  // (names kept for screen readers) so no control is pushed off screen on a 1,366–1,600 px laptop.
  const navLabel = present ? 'hidden min-[1800px]:inline' : 'hidden min-[1440px]:inline'
  return (
    <header className="glass-edge stage-fade flex h-14 shrink-0 items-center gap-3 rounded-2xl bg-chrome px-3 text-chrome-ink 2xl:gap-4">
      <button onClick={showIntro} aria-label="Tower Design Toolkit" title="Back to the start" className="flex items-center gap-2 rounded-md px-1 py-0.5 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><rect x="7" y="2" width="6" height="16" rx="1" fill="currentColor" /><rect x="3" y="11" width="14" height="7" rx="1" fill="currentColor" opacity=".35" /></svg>
        <span className="hidden whitespace-nowrap text-sm font-semibold min-[1500px]:inline">Tower Design Toolkit</span>
      </button>
      <div role="tablist" aria-label="Project" className={`flex rounded-md p-0.5 ${present ? 'bg-white/10' : 'bg-black/5'}`}>
        {PROJECTS.map((p) => (
          <button key={p.id} role="tab" aria-selected={project === p.id} title={p.hint} onClick={() => (p.id === 'city' && project !== 'city' ? openCity() : setProject(p.id))}
            className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition ${project === p.id ? (present ? 'bg-white/90 text-ink' : 'bg-white text-ink shadow-sm') : 'opacity-80 hover:opacity-100'}`}>{p.label}</button>
        ))}
      </div>
      <ProjectMenu />
      <ExportMenu />

      {/* Stage tabs: icon + label + subtitle, keys 1-3 */}
      <div role="tablist" aria-label="Design stage" className="mx-auto flex items-stretch gap-1">
        {STAGES.map((s) => {
          const Icon = s.icon
          const on = phase === s.id
          return (
            <button key={s.id} role="tab" aria-selected={on} onClick={() => setPhase(s.id)} title={`${s.purpose} (key ${s.key})`}
              className={`stage-fade flex items-center gap-2 rounded-lg border px-3 py-1 text-left ${on ? (present ? 'border-white/40 bg-white/15 font-semibold' : 'border-transparent bg-ink') : 'border-transparent text-muted hover:bg-subtle hover:text-ink'}`}>
              <Icon size={18} className={on && !present ? 'text-accent' : ''} />
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="hidden whitespace-nowrap text-meta min-[1800px]:block">{s.subtitle}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="View">
        {present && (
          <>
            <span title="Model locked: go back to Massing or Schematic to change it" className="mr-1 flex items-center gap-1 whitespace-nowrap rounded-full bg-white/10 px-2 py-1 text-meta"><LockKeyhole size={13} /><span className="hidden min-[1800px]:inline">Model locked</span><span className="sr-only min-[1800px]:hidden">Model locked</span></span>
            <button onClick={() => captureShot(false)} aria-label="Capture" className="mr-2 flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-white/90"><Aperture size={14} aria-hidden /><span className="hidden min-[1440px]:inline">Capture</span></button>
          </>
        )}
        {VIEWS.map(({ id, icon: Icon, label }) => (
          <button key={id} title={label} aria-label={label} aria-pressed={view === id} onClick={() => setView(id)}
            className={`rounded p-1.5 ${view === id ? (present ? 'bg-white/15' : 'bg-black/5') : 'opacity-60 hover:opacity-100'}`}><Icon size={16} /></button>
        ))}
        <button title={reducedMotion ? 'Motion: reduced (click for full)' : 'Motion: full (click to reduce)'} aria-label="Toggle reduced motion" aria-pressed={reducedMotion}
          onClick={() => set({ reducedMotion: !reducedMotion })} className={`rounded p-1.5 ${reducedMotion ? 'bg-black/10' : 'opacity-60 hover:opacity-100'}`}><Waves size={16} /></button>
        <RoleSelect className={present ? 'bg-transparent text-inherit' : ''} />
        <UnitSelect className={present ? 'bg-transparent text-inherit' : ''} />
        <button onClick={() => navigate('customize')} aria-label="Customize" title="Customize: build your own workflow from the node library"
          className={`ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium ${present ? 'border-white/30 hover:bg-white/10' : 'border-line hover:border-accent hover:text-accent'}`}><Workflow size={14} aria-hidden /><span className={navLabel}>Customize</span></button>
        <button onClick={() => navigate('options')} aria-label="Options" title="Design options: save versions of the design and compare them by node and jury criterion"
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium ${present ? 'border-white/30 hover:bg-white/10' : 'border-line hover:border-accent hover:text-accent'}`}><Scale size={14} aria-hidden /><span className={navLabel}>Options</span></button>
        <button title="How it works" aria-label="How it works" onClick={() => set({ showOnboarding: true })} className="rounded p-1.5 opacity-60 hover:opacity-100"><CircleQuestionMark size={16} /></button>
        <button title="Take the guided tour (on your current design)" aria-label="Take the guided tour" onClick={() => useTour.getState().start()} className="rounded p-1.5 opacity-60 hover:opacity-100"><PlayCircle size={16} /></button>
        <button title="Build status: what is built and what is next" aria-label="Build status" onClick={() => navigate('status')} className="rounded p-1.5 opacity-60 hover:opacity-100"><ListChecks size={16} /></button>
        <button title="Sources & assumptions: every source cited, every team assumption, every false assumption with its correction" aria-label="Sources and assumptions" onClick={() => navigate('sources')} className="rounded p-1.5 opacity-60 hover:opacity-100"><BookOpen size={16} /></button>
      </div>
    </header>
  )
}
