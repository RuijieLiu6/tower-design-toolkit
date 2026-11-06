// Landing page: choose the guided process (the default staged app) or Customize (build your own workflow).
import { ArrowRight, Blocks, BookOpen, Box, Download, FlaskConical, ListChecks, Lock, PlayCircle, Route as RouteIcon, Sparkles, Upload, Workflow } from '../components/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FlagChip } from '../components/ui'
import { CATEGORY_ICONS } from '../data/icons'
import { ALL_NODES, BUILT_NODES, CATEGORIES, type Category } from '../data/registry'
import { STAGES } from '../data/stages'
import { installApp, installHint, useOffline } from '../lib/pwa/install'
import { useImportStore } from '../lib/import/store'
import { navigate, setSkipTarget, skipTarget } from '../lib/route'
import { openDemo, useTour } from '../lib/tour'
import { useStore } from '../store'
import { RoleCards } from '../components/RolePicker'

const FLAGS = ['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption'] as const
/** Faint drafting grid behind the page. */
const GRID = {
  backgroundImage: 'linear-gradient(color-mix(in srgb, var(--color-line) 60%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-line) 60%, transparent) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
}

/** Quiet elevation drawing: North Shore line, podium, a tower inside the 244–305 m band. */
function Elevation() {
  const y = (m: number) => 300 - m * 0.86 // 0 m at y=300
  return (
    <svg viewBox="0 0 300 330" className="h-full w-full text-ink" aria-hidden>
      <path d="M0 196 L38 170 L66 182 L104 140 L132 156 L170 120 L204 150 L236 132 L270 158 L300 146" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="1" />
      <line x1="0" y1={y(0)} x2="300" y2={y(0)} stroke="currentColor" strokeWidth="1.2" />
      {[30, 70, 210, 248].map((x, i) => <rect key={x} x={x} y={y([34, 52, 46, 28][i])} width={[26, 22, 24, 30][i]} height={[34, 52, 46, 28][i] * 0.86} fill="none" stroke="currentColor" strokeOpacity=".25" />)}
      <rect x="104" y={y(18)} width="92" height={18 * 0.86} fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".55" />
      <rect x="128" y={y(285)} width="44" height={(285 - 18) * 0.86} fill="var(--color-panel)" stroke="currentColor" strokeWidth="1.2" />
      {Array.from({ length: 30 }, (_, i) => 18 + (i + 1) * 9).filter((m) => m < 285).map((m) => <line key={m} x1="128" x2="172" y1={y(m)} y2={y(m)} stroke="currentColor" strokeOpacity=".16" />)}
      <rect x="143" y={y(285)} width="14" height={(285 - 18) * 0.86} fill="var(--color-accent)" fillOpacity=".12" />
      {/* Height band */}
      <rect x="214" y={y(305)} width="6" height={(305 - 244) * 0.86} fill="var(--color-accent)" fillOpacity=".25" />
      <line x1="217" x2="217" y1={y(0)} y2={y(305)} stroke="currentColor" strokeOpacity=".35" strokeDasharray="2 3" />
      {[244, 305].map((m) => <g key={m}><line x1="210" x2="224" y1={y(m)} y2={y(m)} stroke="currentColor" strokeOpacity=".6" /><text x="228" y={y(m) + 3} fontSize="9" fill="currentColor" fillOpacity=".7" fontFamily="ui-monospace, monospace">{m} m</text></g>)}
      <text x="228" y={y(274.5) + 3} fontSize="8" fill="currentColor" fillOpacity=".5">VTC band</text>
    </svg>
  )
}

function Choice({ icon, title, tag, children, cta, onChoose, accent, footer, shortcut }: {
  icon: ReactNode; title: string; tag: string; children: ReactNode; cta: string; onChoose: () => void; accent?: boolean; footer: ReactNode; shortcut: string
}) {
  return (
    <section className={`group flex flex-col rounded-xl border bg-panel p-6 shadow-sm transition-shadow hover:shadow-md ${accent ? 'border-accent/40' : 'border-line'}`} aria-labelledby={`choice-${shortcut}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-accent text-white' : 'bg-ink text-white'}`}>{icon}</span>
        <div className="min-w-0">
          <h2 id={`choice-${shortcut}`} className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{tag}</p>
        </div>
      </div>
      <div className="mt-4 flex-1 text-sm leading-relaxed text-ink/80">{children}</div>
      <div className="mt-4">{footer}</div>
      <button onClick={onChoose}
        className={`mt-5 flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium outline-none ring-offset-2 ring-offset-panel focus-visible:ring-2 focus-visible:ring-accent ${accent ? 'bg-accent text-white hover:opacity-90' : 'border border-ink/80 text-ink hover:bg-ink hover:text-white'}`}>
        <span>{cta}</span>
        <span className="flex items-center gap-2"><kbd className="rounded border border-current/40 px-1 font-mono text-[10px] opacity-70">{shortcut.toUpperCase()}</kbd><ArrowRight size={16} /></span>
      </button>
    </section>
  )
}

export default function Landing() {
  const [skip, setSkip] = useState(() => skipTarget() !== null)
  const [demo, setDemo] = useState<'idle' | 'loading' | 'error'>('idle')
  const reduced = useStore((s) => s.reducedMotion)
  const built = BUILT_NODES.length
  const researched = ALL_NODES.filter((n) => n.status === 'researched').length

  const { offer, installed } = useOffline()
  const [hint, setHint] = useState('')
  const install = async () => { if (!(await installApp())) setHint(installHint()) }
  const choose = (r: 'guided' | 'customize') => { setSkipTarget(skip ? r : null); navigate(r) }

  useEffect(() => { document.title = 'Tower Design Toolkit · Start' }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement | null
      const typing = el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type))
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'g' || e.key === 'G') choose('guided')
      if (e.key === 'c' || e.key === 'C') choose('customize')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div data-stage="basic" data-reduced={reduced} className="h-full overflow-y-auto bg-paper text-ink" style={GRID}>
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-6 md:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden><rect x="7" y="2" width="6" height="16" rx="1" fill="currentColor" /><rect x="3" y="11" width="14" height="7" rx="1" fill="currentColor" opacity=".35" /></svg>
            <span className="text-sm font-semibold tracking-tight">Tower Design Toolkit</span>
          </div>
          <span className="flex items-center gap-3 text-[11px] text-muted"><button onClick={() => navigate('status')} className="flex items-center gap-1 rounded px-1 py-0.5 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ListChecks size={13} aria-hidden />Build status</button><button onClick={() => navigate('guide')} className="flex items-center gap-1 rounded px-1 py-0.5 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><BookOpen size={13} aria-hidden />User guide</button>{!installed && <button onClick={install} title={offer ? 'Install Tower Design Toolkit as an app: its own window, works offline' : 'How to install Tower Design Toolkit as an app'} className={`flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${offer ? 'font-medium text-accent hover:underline' : 'hover:text-ink'}`}><Download size={13} aria-hidden />Install app</button>}<span>Open source · MIT · v0.1</span></span>
        </header>
        {hint && <p role="status" className="mt-2 self-end rounded-md border border-line bg-panel px-3 py-1.5 text-[11px] text-muted">{hint} After the first visit it also works offline. <button onClick={() => setHint('')} className="ml-1 text-accent hover:underline">OK</button></p>}

        <div className="mt-10 grid items-end gap-8 md:grid-cols-[1fr_220px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Vancouver tall building · 244–305 m</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">How do you want to design today?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Two ways into the same engines. Follow our staged process, or lay out your own workflow from the node library. Either way, every result cites its source and shows its evidence flag.</p>
          </div>
          <div className="hidden h-56 md:block"><Elevation /></div>
        </div>

        <RoleCards />

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Choice accent shortcut="g" icon={<RouteIcon size={22} />} title="Guided process" tag="Default · best for a first visit" cta="Start the guided process" onChoose={() => choose('guided')}
            footer={
              <ol className="flex flex-wrap items-center gap-1.5" aria-label="Stages">
                {STAGES.map((s, i) => {
                  const Icon = s.icon
                  return (
                    <li key={s.id} className="flex items-center gap-1.5">
                      {i > 0 && <ArrowRight size={12} className="text-muted" aria-hidden />}
                      <span className="flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-xs"><Icon size={14} className="text-accent" />{s.label}</span>
                    </li>
                  )
                })}
              </ol>
            }>
            <p>Our default process in three stages. Shape the tower, switch on the checks you need, then compose evidence-labelled board shots.</p>
            <ul className="mt-3 space-y-1.5 text-[13px]">
              <li className="flex gap-2"><Sparkles size={15} className="mt-0.5 shrink-0 text-accent" />{built} built nodes run live as you change the design</li>
              <li className="flex gap-2"><RouteIcon size={15} className="mt-0.5 shrink-0 text-accent" />A process rail, stage keys 1–3 and a short tour on the way in</li>
              <li className="flex gap-2"><Workflow size={15} className="mt-0.5 shrink-0 text-accent" />Switch to Customize at any time from the top bar</li>
            </ul>
          </Choice>

          <Choice shortcut="c" icon={<Workflow size={22} />} title="Customize" tag="Open canvas · your own workflow and tools" cta="Open the workflow builder" onChoose={() => choose('customize')}
            footer={
              <div className="flex flex-wrap gap-1" aria-label="Node categories">
                {(Object.keys(CATEGORIES) as Category[]).map((c) => {
                  const Icon = CATEGORY_ICONS[c]
                  return <span key={c} title={CATEGORIES[c].label} className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ background: CATEGORIES[c].color }}><Icon size={14} /><span className="sr-only">{CATEGORIES[c].label}</span></span>
                })}
              </div>
            }>
            <p>Build your own workflow on an open canvas, the way Grasshopper works: drop icon nodes, wire them, and decide the logic.</p>
            <ul className="mt-3 space-y-1.5 text-[13px]">
              <li className="flex gap-2"><Blocks size={15} className="mt-0.5 shrink-0" />{built + researched} nodes in 13 categories ({researched} researched, <FlaskConical size={13} className="inline" aria-hidden /> not yet runnable)</li>
              <li className="flex gap-2"><Workflow size={15} className="mt-0.5 shrink-0" />Logic: all pass, any fail, weighted score, compare two options</li>
              <li className="flex gap-2"><Upload size={15} className="mt-0.5 shrink-0" />Import your own nodes or write one with the node-builder skill; save, export and run a workflow in the guided app</li>
            </ul>
          </Choice>
        </div>

        <UploadStrip />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="h-4 w-4 accent-accent" />
            Skip this page next time and open my choice directly
          </label>
          <span className="text-[11px] text-muted">You can always come back: click the Tower Design Toolkit name in either view.</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3">
          <PlayCircle size={18} className="text-accent" aria-hidden />
          <span className="mr-auto text-[12.5px]"><b>New here?</b> A 2-minute tour through the three stages, Real Vancouver and Customize, on a demo project.</span>
          <button onClick={() => { setDemo('loading'); useTour.getState().start({ demo: true }).finally(() => setDemo('idle')) }} disabled={demo === 'loading'}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            {demo === 'loading' ? 'Opening the demo…' : 'Take the tour'}
          </button>
          <button onClick={async () => { setDemo('loading'); const ok = await openDemo(); setDemo(ok ? 'idle' : 'error') }} disabled={demo === 'loading'}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium outline-none hover:border-accent disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent">Open the demo project</button>
          {demo === 'error' && <span className="w-full text-[11px] text-red-800">The demo project could not be opened.</span>}
          <span className="w-full text-[10.5px] text-muted">Opening the demo replaces the current design as one step: Ctrl+Z in the guided app brings yours back.</span>
        </div>

        <div className="mt-8 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Evidence flags</span>
            {FLAGS.map((f) => <FlagChip key={f} flag={f} />)}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">False assumptions stay visible, in magenta, with their correction.</p>
        </div>

        <footer className="mt-auto pt-10 text-[11px] text-muted">
          UBC SALA ARCH 540 · Ruijie Liu and Sinnie Choi · instructor Xun Liu · An early estimate tool: the City and the competition rules govern.
        </footer>
      </div>
    </div>
  )
}

const MODEL_FILE = /\.(3dm|obj|glb|gltf|ifc)$/i

/** Opens the guided app with the upload dialog reading this file. */
function uploadModel(f: File) {
  useImportStore.getState().openDialog(f)
  // Straight into the upload, like the demo: the first-visit guide would cover the dialog.
  useStore.setState({ showOnboarding: false })
  navigate('guided')
}

/** "Bring your Rhino model": choose or drop a file here (or anywhere on this page) and map it in the guided app. */
function UploadStrip() {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  useEffect(() => {
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const over = (e: DragEvent) => { if (has(e)) { e.preventDefault(); setOver(true) } }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setOver(false) }
    const drop = (e: DragEvent) => {
      setOver(false)
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => MODEL_FILE.test(x.name))
      if (!f) return
      e.preventDefault()
      uploadModel(f)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [])
  return (
    <section aria-labelledby="upload-title" className={`mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-dashed bg-panel px-5 py-4 transition-colors ${over ? 'border-accent bg-accent/5' : 'border-line'}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Box size={20} aria-hidden /></span>
      <div className="mr-auto min-w-0">
        <h2 id="upload-title" className="text-sm font-semibold">Bring your Rhino model</h2>
        <p className="text-[12.5px] text-muted">Drop a .3dm here (or OBJ, glTF, IFC). Map its layers to tower, podium, program, core, site and context in one screen; every check then runs on it, traced back to your layers.</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><Lock size={11} aria-hidden />Read in this browser; nothing is uploaded to a server.</p>
      </div>
      <button onClick={() => input.current?.click()} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Upload size={14} aria-hidden />Choose a model file</button>
      <input ref={input} type="file" accept=".3dm,.obj,.glb,.gltf,.ifc" className="hidden" aria-label="Model file to upload" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadModel(f); e.target.value = '' }} />
    </section>
  )
}
