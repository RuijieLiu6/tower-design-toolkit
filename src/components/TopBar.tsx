// The project bar (overnight brief, 8 Nov: "Project/context, file actions, Undo/Redo and a compact Assistant entry.
// Consolidate secondary controls in a discoverable menu. Keep the project identity visible; do not build another phase
// selector here"). 52 px tall, every control 14/20 px. Left: the toolkit's name, the project (Competition site / Real
// Vancouver), the project file menu with Undo / Redo, Export model. Right: the view (model, model + data graph, data
// graph), Auto-run checks (what the old "Analysis On/Off" really controls: checks recompute with the model, or pause),
// the Assistant, and More (the check library, role, units, motion, Customize, Options, guide, tour, build status,
// sources). Present adds Model locked and Capture. The phase row under this bar is the only phase selector.
import { Aperture, Axis3d, BookOpen, CircleQuestionMark, Columns2, Library, ListChecks, LockKeyhole, MoreHorizontal, Network, PlayCircle, Scale, Sparkles, Waves, Workflow, X } from './icons'
import { useEffect, useRef, useState } from 'react'
import { showIntro } from '../lib/intro'
import { openCity } from '../lib/openCity'
import { captureShot } from '../lib/capture'
import { navigate } from '../lib/route'
import { useTour } from '../lib/tour'
import { openOverview } from '../lib/workflow/projectWorkflow'
import ProjectMenu from './ProjectMenu'
import ExportMenu from './ExportMenu'
import NodeLibrary from './NodeLibrary'
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
  { id: 'split', icon: Columns2, label: 'Model and data graph' },
  { id: 'canvas', icon: Network, label: 'Data graph' },
]
const icon = 'flex h-8 w-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** Auto-run checks: on, checks recompute whenever the model changes; off, they pause (choices and results kept). */
function AutoRun() {
  const analysis = useStore((s) => s.analysis)
  const setAnalysis = useStore((s) => s.setAnalysis)
  return (
    <button type="button" role="switch" aria-checked={analysis} onClick={() => setAnalysis(!analysis)} data-testid="analysis-switch"
      title={analysis ? 'Checks recompute whenever the model changes. Turn off to pause them while you sketch (your checks and choices are kept).' : 'Checks are paused: results wait. Turn on to recompute them with the model.'}
      className={`flex h-8 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${analysis ? 'border-line bg-panel text-ink' : 'border-warning/40 bg-warning-surface text-warning'}`}>
      <span className="whitespace-nowrap">Auto-run checks</span>
      <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${analysis ? 'bg-accent' : 'bg-boundary'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${analysis ? 'left-[0.875rem]' : 'left-0.5'}`} /></span>
      <span className="sr-only">{analysis ? 'On' : 'Off'}</span>
    </button>
  )
}

/** More: the secondary controls in one discoverable menu, and the check library it opens. */
function MoreMenu() {
  const [open, setOpen] = useState(false)
  const [lib, setLib] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const set = useStore((s) => s.set)
  useEffect(() => {
    if (!open && !lib) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setLib(false) } }
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setLib(false) } }
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', away, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away, true) }
  }, [open, lib])
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent'
  const go = (f: () => void) => () => { setOpen(false); f() }
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => { setOpen((v) => !v); setLib(false) }} aria-expanded={open} aria-haspopup="menu" data-testid="more-menu" aria-label="More: library, settings and help" title="More: check library, role, units, motion, Customize, Options, help"
        className={`${icon} bg-panel text-ink`}><MoreHorizontal size={16} aria-hidden /></button>
      {open && (
        <div role="menu" aria-label="More" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-panel p-1.5 text-ink shadow-float">
          <button role="menuitem" type="button" onClick={() => { setOpen(false); setLib(true) }} data-testid="library-button" className={item}><Library size={15} aria-hidden />Check library<span className="ml-auto text-meta text-muted">switch checks on or off</span></button>
          <div className="my-1 border-t border-line" />
          <div className="flex items-center justify-between gap-2 px-2.5 py-1"><span className="text-control text-ink">Role</span><RoleSelect /></div>
          <div className="flex items-center justify-between gap-2 px-2.5 py-1"><span className="text-control text-ink">Units</span><UnitSelect /></div>
          <button role="menuitemcheckbox" aria-checked={reducedMotion} type="button" onClick={() => set({ reducedMotion: !reducedMotion })} className={item}><Waves size={15} aria-hidden />Reduce motion<span className="ml-auto text-meta text-muted">{reducedMotion ? 'On' : 'Off'}</span></button>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" type="button" onClick={go(() => navigate('customize'))} className={item} aria-label="Customize"><Workflow size={15} aria-hidden />Customize<span className="ml-auto text-meta text-muted">data graph builder</span></button>
          <button role="menuitem" type="button" onClick={go(() => navigate('options'))} className={item} aria-label="Options"><Scale size={15} aria-hidden />Options<span className="ml-auto text-meta text-muted">compare designs</span></button>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" type="button" onClick={go(() => set({ showOnboarding: true }))} className={item} aria-label="How it works"><CircleQuestionMark size={15} aria-hidden />How it works</button>
          <button role="menuitem" type="button" onClick={go(() => useTour.getState().start())} className={item} aria-label="Take the guided tour"><PlayCircle size={15} aria-hidden />Guided tour</button>
          <button role="menuitem" type="button" onClick={go(() => navigate('status'))} className={item} aria-label="Build status"><ListChecks size={15} aria-hidden />Build status</button>
          <button role="menuitem" type="button" onClick={go(() => navigate('sources'))} className={item} aria-label="Sources and assumptions"><BookOpen size={15} aria-hidden />Sources and assumptions</button>
        </div>
      )}
      {lib && (
        <div role="dialog" aria-label="Node library" className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(36rem,72vh)] w-[22rem] flex-col overflow-hidden rounded-xl border border-line bg-panel text-ink shadow-float">
          <div className="flex items-center justify-between border-b border-line px-3 py-2"><h2 className="text-control font-semibold">Check library</h2>
            <button type="button" onClick={() => setLib(false)} aria-label="Close the node library" className="rounded p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={14} /></button></div>
          <div className="min-h-0 overflow-y-auto p-2"><NodeLibrary /></div>
        </div>
      )}
    </div>
  )
}

export default function TopBar() {
  const { project, phase, view, setProject, setView } = useStore(useShallow((s) => ({ project: s.project, phase: s.phase, view: s.view, setProject: s.setProject, setView: s.setView })))
  const present = phase === 'present'
  return (
    <header className="glass-edge stage-fade flex h-[52px] shrink-0 items-center gap-2 rounded-2xl bg-chrome px-3 text-control text-chrome-ink">
      <button onClick={showIntro} aria-label="Tower Design Toolkit" title="Back to the start" className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-0.5 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><rect x="7" y="2" width="6" height="16" rx="1" fill="currentColor" /><rect x="3" y="11" width="14" height="7" rx="1" fill="currentColor" opacity=".35" /></svg>
        <span className="hidden whitespace-nowrap font-semibold min-[1500px]:inline">Tower Design Toolkit</span>
      </button>
      <div role="tablist" aria-label="Project" className={`flex shrink-0 rounded-lg p-0.5 ${present ? 'bg-white/10' : 'bg-subtle'}`}>
        {PROJECTS.map((p) => (
          <button key={p.id} role="tab" aria-selected={project === p.id} title={p.hint} onClick={() => (p.id === 'city' && project !== 'city' ? openCity() : setProject(p.id))}
            className={`h-7 whitespace-nowrap rounded-md px-2.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${project === p.id ? (present ? 'bg-white/90 text-ink' : 'bg-panel text-ink shadow-sm') : present ? 'text-chrome-ink hover:bg-white/10' : 'text-muted hover:text-ink'}`}>{p.label}</button>
        ))}
      </div>
      <ProjectMenu />
      <ExportMenu />
      <span className="mx-auto" />
      {present && (
        <>
          <span title="Model locked: go back to Form or Schematic to change it" className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white/10 px-2 py-1 text-meta"><LockKeyhole size={13} aria-hidden />Model locked</span>
          <button onClick={() => captureShot(false)} aria-label="Capture" className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 font-medium text-ink hover:bg-white/90"><Aperture size={14} aria-hidden />Capture</button>
        </>
      )}
      <div className="flex items-center gap-0.5" role="group" aria-label="View">
        {VIEWS.map(({ id, icon: Icon, label }) => (
          <button key={id} title={label} aria-label={label} aria-pressed={view === id} onClick={() => setView(id)}
            className={`${icon} ${view === id ? (present ? 'bg-white/15' : 'bg-selected text-accent-hover') : present ? 'text-chrome-ink opacity-80 hover:opacity-100' : 'text-muted hover:text-ink'}`}><Icon size={16} /></button>
        ))}
      </div>
      <AutoRun />
      <button type="button" onClick={() => { openOverview('edit'); setTimeout(() => document.getElementById('dock-ask-input')?.focus(), 60) }} data-testid="assistant-button" title="Ask the workflow assistant to change the workflow (its suggestion is shown before anything changes)"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ai-line bg-ai-surface px-2.5 font-medium text-ai outline-none focus-visible:ring-2 focus-visible:ring-accent"><Sparkles size={15} aria-hidden />Assistant</button>
      <MoreMenu />
    </header>
  )
}
