// Landing page (Ruijie, 6 Nov: "as clean and minimal as possible but bring the main idea of the tool … a platform which
// designers of different focus could use to develop their design … start the page with a natural language model agent
// to help the tool define its users … for each user type at least 3 preset node combinations and workflows"). The
// first screen of the tool: the idea in one line, the agent that finds the visitor's user type and starting workflows,
// one live drawing of the idea (components/landing/Orbit.tsx), then the research figures and the other ways in.
import { BookOpen, Box, Download, ExternalLink, FileUp, LayoutGrid, ListChecks, MessageSquare, PlayCircle, Puzzle, Route as RouteIcon, Workflow, type LucideIcon } from '../components/icons'
import { useEffect, useRef, useState } from 'react'
import Agent, { type AgentResult } from '../components/landing/Agent'
import Composer, { type Draft } from '../components/landing/Composer'
import { firstPhase } from '../lib/phases'
import { openPresetInCustomize, saveWorkflowFile, startPreset } from '../lib/startPreset'
import Orbit from '../components/landing/Orbit'
import PresetCards from '../components/landing/PresetCards'
import ResearchFigures from '../components/landing/ResearchFigures'
import { installApp, installHint, useOffline } from '../lib/pwa/install'
import { useImportStore } from '../lib/import/store'
import { navigate } from '../lib/route'
import { openDemo, useTour } from '../lib/tour'
import { USER_TYPES, type Preset } from '../lib/userTypes'
import { useStore } from '../store'

const RESEARCH = 'https://ruijieliu6.github.io/vancouver-tower-toolbench/#research'
const quiet = 'flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export default function Landing() {
  const reduced = useStore((s) => s.reducedMotion)
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
  const WAYS: { icon: LucideIcon; word: string; hint: string; go: () => void }[] = [
    { icon: MessageSquare, word: 'Ask', hint: 'Say who you are; the agent picks starting workflows for you.', go: () => { scrollTo('agent-input'); document.getElementById('agent-input')?.focus() } },
    { icon: LayoutGrid, word: 'Presets', hint: 'Start from a ready-made workflow for your kind of work, then change it.', go: () => { if (!result) setResult({ type: 'designer', presets: [...USER_TYPES[0].presets], via: 'picked' }); setTimeout(() => scrollTo('presets-title'), 50) } },
    { icon: RouteIcon, word: 'Phases', hint: 'Pick the analysis nodes phase by phase, from Site to Present.', go: () => scrollTo('composer-title') },
    { icon: Workflow, word: 'Graph', hint: 'Wire nodes and logic on an open canvas, like Grasshopper.', go: () => navigate('customize') },
    { icon: FileUp, word: 'Import', hint: 'Open a workflow file someone shared (Customize › Open).', go: () => navigate('customize') },
    { icon: Puzzle, word: 'Your node', hint: 'Turn your own method into a node with the node-builder skill, then wire it in.', go: () => navigate('customize') },
  ]

  return (
    <div data-stage="basic" data-reduced={reduced} className="h-full overflow-y-auto bg-paper text-ink">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-5 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden><rect x="7" y="2" width="6" height="16" rx="1" fill="currentColor" /><rect x="3" y="11" width="14" height="7" rx="1" fill="currentColor" opacity=".35" /></svg>
            <span className="text-[15px] font-semibold tracking-tight">Tower Design Toolkit</span>
          </span>
          <nav aria-label="About the toolkit" className="flex flex-wrap items-center gap-1">
            <a href={RESEARCH} target="_blank" rel="noreferrer" className={quiet}><ExternalLink size={14} aria-hidden />Research</a>
            <a href="#/guide" className={quiet}><BookOpen size={14} aria-hidden />User guide</a>
            <a href="#/status" className={quiet}><ListChecks size={14} aria-hidden />Build status</a>
            {!installed && <button type="button" onClick={install} className={`${quiet} ${offer ? 'text-accent' : ''}`} title={offer ? 'Install as an app: its own window, works offline' : 'How to install it as an app'}><Download size={14} aria-hidden />Install app</button>}
          </nav>
        </header>
        {hint && <p role="status" className="mt-2 self-end rounded-md border border-line bg-panel px-3 py-1.5 text-[12px] text-muted">{hint} After the first visit it also works offline. <button type="button" onClick={() => setHint('')} className="ml-1 text-accent hover:underline">OK</button></p>}

        <main className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14">
          <div className="grid gap-7">
            <div>
              <h1 className="max-w-[17ch] text-balance text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.025em] md:text-[3.25rem]">One tower model. Every analysis a node. You decide.</h1>
              <p className="mt-4 max-w-[38rem] text-[16px] leading-[1.6] text-muted">
                A platform for anyone shaping a tall building in Vancouver, from students and curious citizens to architects, planners and engineers.
                Tell the agent who you are and it sets up a workflow to start from.
              </p>
            </div>
            <Agent onResult={(r) => { setResult(r); setActive(null); if (r?.presets[0]) load(r.presets[0]) }} />
          </div>
          <div className="hidden justify-self-center lg:block lg:pt-2"><Orbit nodes={lit?.nodes ?? []} label={lit?.name ?? null} /></div>
        </main>

        <nav aria-label="Ways to design your workflow" className="mt-12 grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="landing-ways">
          {WAYS.map((w) => (
            <button key={w.word} type="button" onClick={w.go} title={w.hint} aria-label={`${w.word}: ${w.hint}`}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-panel px-2 py-3 text-[13px] font-medium text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white" aria-hidden><w.icon size={26} /></span>
              {w.word}
            </button>
          ))}
        </nav>

        {result && <div className="mt-10"><PresetCards type={result.type} presets={result.presets} onActive={setActive} onEdit={(p) => load(p, true)} /></div>}

        <div className="mt-12">
          <Composer draft={draft} onChange={setDraft} onStart={() => void startPreset(run())} onGraph={() => void openPresetInCustomize(run())} onSave={() => void saveWorkflowFile(run())} />
        </div>

        <div className="mt-14"><ResearchFigures /></div>

        <section aria-labelledby="other-title" className="mt-12 border-t border-line pt-5">
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
