// Landing page (Ruijie, 6 Nov: "as clean and minimal as possible but bring the main idea of the tool … a platform which
// designers of different focus could use to develop their design … start the page with a natural language model agent
// to help the tool define its users … for each user type at least 3 preset node combinations and workflows"). The
// first screen of the tool: the idea in one line, the agent that finds the visitor's user type and starting workflows,
// one live drawing of the idea (components/landing/Orbit.tsx), then the research figures and the other ways in.
import { BookOpen, Box, Download, ExternalLink, FileUp, LayoutGrid, ListChecks, MessageSquare, PlayCircle, Puzzle, Route as RouteIcon, Workflow, type LucideIcon } from '../components/icons'
import { useEffect, useRef, useState } from 'react'
import Agent, { type AgentResult } from '../components/landing/Agent'
import GlassIcon, { HUES, ICON } from '../components/GlassIcon'
import { WAY_ICONS } from '../data/icons'
import Composer, { type Draft } from '../components/landing/Composer'
import { firstPhase } from '../lib/phases'
import { openPresetInCustomize, saveWorkflowFile, startPreset } from '../lib/startPreset'
import Orbit from '../components/landing/Orbit'
import Intro from '../components/landing/Intro'
import { enterToolkit, showIntro, useIntro } from '../lib/intro'
import PresetCards from '../components/landing/PresetCards'
import ResearchFigures from '../components/landing/ResearchFigures'
import { installApp, installHint, useOffline } from '../lib/pwa/install'
import { useImportStore } from '../lib/import/store'
import { navigate } from '../lib/route'
import { openDemo, useTour } from '../lib/tour'
import { USER_TYPES, type Preset } from '../lib/userTypes'
import { useStore } from '../store'

const RESEARCH = 'https://ruijieliu6.github.io/vancouver-tower-toolbench/#research'
const quiet = 'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export default function Landing() {
  const reduced = useStore((s) => s.reducedMotion)
  const intro = useIntro((s) => s.show)
  // Just past the intro: the agent's question takes the focus (not on a plain visit, where a phone keyboard would pop up).
  const entered = useRef(false)
  const [arrived, setArrived] = useState(false)
  useEffect(() => { if (!intro && entered.current) { entered.current = false; document.getElementById('agent-input')?.focus({ preventScroll: true }) } }, [intro])
  const [result, setResult] = useState<AgentResult | null>(null)
  const [active, setActive] = useState<Preset | null>(null)
  // The workflow on the phase board: a preset or the agent's answer fills it, and every node stays editable.
  const [draft, setDraft] = useState<Draft>({ name: 'Your workflow', nodes: [], project: 'vtc', from: null })
  const load = (p: Preset, scroll = false) => {
    setDraft({ name: p.name, nodes: [...p.nodes], project: p.project, from: p.id })
    if (scroll) document.getElementById('composer-title')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }
  const run = () => ({ id: draft.from, type: result?.type ?? null, name: draft.name, project: draft.project, step: firstPhase(draft.nodes).step, nodes: draft.nodes })
  const [demo, setDemo] = useState<'idle' | 'loading' | 'error'>('idle')
  const { offer, installed } = useOffline()
  const [hint, setHint] = useState('')
  const install = async () => { if (!(await installApp())) setHint(installHint()) }
  useEffect(() => { document.title = 'Tower Design Toolkit' }, [])
  const lit = active ?? (draft.nodes.length ? { name: draft.name, nodes: draft.nodes } : null)
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  // Six ways to design a workflow, as big icons; what each does is on hover.
  const WAYS: { icon: LucideIcon; hue: number; word: string; hint: string; go: () => void }[] = [
    { icon: WAY_ICONS.ask, hue: HUES.sky, word: 'Ask', hint: 'Say who you are; the agent picks starting workflows for you.', go: () => { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); document.getElementById('agent-input')?.focus({ preventScroll: true }) } },
    { icon: WAY_ICONS.presets, hue: HUES.green, word: 'Presets', hint: 'Start from a ready-made workflow for your kind of work, then change it.', go: () => { if (!result) setResult({ type: 'designer', presets: [...USER_TYPES[0].presets], via: 'picked', title: 'Starting workflows for a passionate designer' }); setTimeout(() => scrollTo('presets-title'), 50) } },
    { icon: WAY_ICONS.phases, hue: HUES.orange, word: 'Phases', hint: 'Pick the analysis nodes phase by phase, from Site to Present.', go: () => scrollTo('composer-title') },
    { icon: WAY_ICONS.graph, hue: HUES.violet, word: 'Graph', hint: 'Wire nodes and logic on an open canvas, like Grasshopper.', go: () => navigate('customize') },
    { icon: WAY_ICONS.import, hue: HUES.teal, word: 'Import', hint: 'Open a workflow file someone shared (Customize › Open).', go: () => navigate('customize') },
    { icon: WAY_ICONS.node, hue: HUES.pink, word: 'Your node', hint: 'Turn your own method into a node with the node-builder skill, then wire it in.', go: () => navigate('customize') },
  ]

  // The intro is a screen of its own (lib/intro.ts): the name and its icons, no scroll; the way in is at the name's heart.
  if (intro) return (
    <div data-stage="basic" data-reduced={reduced} className="h-full overflow-hidden text-ink">
      <Intro reduced={reduced} onEnter={() => { entered.current = true; setArrived(true); enterToolkit() }} />
    </div>
  )

  return (
    <div data-stage="basic" data-reduced={reduced} className={`h-full overflow-y-auto bg-paper text-ink ${arrived ? 'tdt-arrive' : ''}`} onAnimationEnd={() => setArrived(false)}>
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-5 md:px-10">
        <header id="welcome" className="flex scroll-mt-0 flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={showIntro} title="Back to the start" aria-label="Tower Design Toolkit: back to the start" data-testid="brand-home"
            className="flex items-center gap-2 rounded-xl px-1 py-0.5 text-ink outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent">
            <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden><rect x="7" y="2" width="6" height="16" rx="1" fill="currentColor" /><rect x="3" y="11" width="14" height="7" rx="1" fill="currentColor" opacity=".35" /></svg>
            <span className="text-[15px] font-semibold tracking-tight">Tower Design Toolkit</span>
          </button>
          <nav aria-label="About the toolkit" className="glass-edge flex flex-wrap items-center gap-0.5 rounded-full bg-glass-2 px-1.5 py-1">
            <a href={RESEARCH} target="_blank" rel="noreferrer" className={quiet}><ExternalLink size={14} aria-hidden />Research</a>
            <a href="#/guide" className={quiet}><BookOpen size={14} aria-hidden />User guide</a>
            <a href="#/status" className={quiet}><ListChecks size={14} aria-hidden />Build status</a>
            {!installed && <button type="button" onClick={install} className={`${quiet} ${offer ? 'text-accent' : ''}`} title={offer ? 'Install as an app: its own window, works offline' : 'How to install it as an app'}><Download size={14} aria-hidden />Install app</button>}
          </nav>
        </header>
        {hint && <p role="status" className="mt-2 self-end rounded-md border border-line bg-panel px-3 py-1.5 text-[12px] text-muted">{hint} After the first visit it also works offline. <button type="button" onClick={() => setHint('')} className="ml-1 text-accent hover:underline">OK</button></p>}

        {/* The first screen is the agent alone (Ruijie, 7 Nov): the idea in one line, then its one open question. */}
        <main className="flex min-h-[calc(100svh-6rem)] flex-col items-center justify-center gap-9 py-10">
          <div className="grid justify-items-center gap-3 text-center">
            <h2 className="max-w-[20ch] text-balance text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.025em] md:text-[3.1rem]">One tower model. Every analysis a node. You decide.</h2>
            <p className="max-w-[36rem] text-pretty text-[16px] leading-[1.6] text-muted">For anyone shaping a tall building in Vancouver: students and curious citizens, architects, planners and engineers.</p>
          </div>
          <Agent onResult={(r) => {
            setResult(r); setActive(null)
            if (r?.presets[0]) load(r.presets[0])
            if (r && !r.quiet) setTimeout(() => scrollTo('presets-title'), 80)
          }} />
        </main>

        {result && <div className="mt-2"><PresetCards title={result.title} presets={result.presets} onActive={setActive} onEdit={(p) => load(p, true)} /></div>}

        <section aria-labelledby="ways-title" className="mt-14 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="grid gap-5">
            <h2 id="ways-title" className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Design your workflow your way</h2>
            <nav aria-label="Ways to design your workflow" className="grid grid-cols-3 gap-x-2 gap-y-5" data-testid="landing-ways">
              {WAYS.map((w) => (
                <button key={w.word} type="button" onClick={w.go} title={w.hint} aria-label={`${w.word}: ${w.hint}`}
                  className="group flex flex-col items-center gap-2 rounded-xl px-2 py-2 text-[13px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <GlassIcon icon={w.icon} hue={w.hue} size={ICON.feature} />
                  <span className="group-hover:text-accent">{w.word}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="w-full max-w-[440px] justify-self-center"><Orbit nodes={lit?.nodes ?? []} label={lit?.name ?? null} /></div>
        </section>

        <div className="mt-12">
          <Composer draft={draft} onChange={setDraft} onStart={() => void startPreset(run())} onGraph={() => void openPresetInCustomize(run())} onSave={() => void saveWorkflowFile(run())} />
        </div>

        <div className="mt-14"><ResearchFigures /></div>

        <section aria-labelledby="other-title" className="glass-edge mt-12 rounded-3xl bg-glass-3 px-5 py-4">
          <h2 id="other-title" className="text-[13px] font-semibold text-ink">Other ways in</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" onClick={async () => { setDemo('loading'); const ok = await openDemo(); setDemo(ok ? 'idle' : 'error') }} disabled={demo === 'loading'} className={quiet}><Box size={14} aria-hidden />Open the demo project</button>
            <button type="button" onClick={() => { setDemo('loading'); useTour.getState().start({ demo: true }).finally(() => setDemo('idle')) }} disabled={demo === 'loading'} className={quiet}><PlayCircle size={14} aria-hidden />Take the tour</button>
            <UploadButton />
            <a href="#/guided" className={quiet}><RouteIcon size={14} aria-hidden />Guided process</a>
            <a href="#/customize" className={quiet}><Workflow size={14} aria-hidden />Customize from scratch</a>
          </div>
          {demo === 'error' && <p role="status" className="mt-1 text-[12px] text-red-800">The demo project could not be opened. Reload the page and try again, or start from a workflow above.</p>}
        </section>

        <footer className="mt-auto pt-10 text-[12px] leading-relaxed text-muted">
          UBC SALA ARCH 540, Ruijie Liu and Sinnie Choi, instructor Xun Liu. Generate uses the massing generator from Sinnie Choi's <a href="https://github.com/xubynii/dtmass" target="_blank" rel="noreferrer" className="underline">Downtown Massing Tool</a>, with her permission. Open source (MIT). A study tool: the City and the competition rules govern.
        </footer>
      </div>
    </div>
  )
}

const MODEL_FILE = /\.(3dm|obj|glb|gltf|ifc)$/i

/** Opens the guided app with the upload dialog reading this file. */
function uploadModel(f: File) {
  useImportStore.getState().openDialog(f)
  useStore.setState({ showOnboarding: false })
  navigate('guided')
}

/** "Bring your model": choose a file, or drop one anywhere on this page. */
function UploadButton() {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault() }
    const drop = (e: DragEvent) => {
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => MODEL_FILE.test(x.name))
      if (!f) return
      e.preventDefault()
      uploadModel(f)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={quiet} title="Rhino .3dm, OBJ, glTF or IFC: read in this browser, never uploaded. You can also drop a file anywhere on this page."><Download size={14} className="rotate-180" aria-hidden />Bring your model</button>
      <input ref={input} type="file" accept=".3dm,.obj,.glb,.gltf,.ifc" className="hidden" aria-label="Model file to upload" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadModel(f); e.target.value = '' }} />
    </>
  )
}
