// Node builder dialog: hand the skill to the user's AI (copy the prompt, download the folder), then import the node
// package it produces. Loaded on demand (it bundles the skill files, the zip writer and the validator).
import {
  ArrowRight, BadgeCheck, Check, CircleCheckBig, ClipboardCopy, Copy, FileDown, FileUp, FlaskConical, FolderDown, GitPullRequest,
  MessagesSquare, OctagonX, PackagePlus, ShieldQuestionMark, TriangleAlert, X,
} from './icons'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import example from '../../skills/tower-studio-node-builder/references/example-node.json'
import { CATEGORIES } from '../data/registry'
import { useCommunityStore } from '../lib/communityStore'
import { STAGE_LABEL, displayFlag } from '../lib/nodePackages'
import { validatePackageText, type Report } from '../lib/nodeValidate'
import { SKILL_FILES, SKILL_NAME, promptText, saveFile, sizeLabel, skillZip } from '../lib/skillFiles'
import { ResultChip } from './CommunityInspector'
import { FlagChip } from './ui'
// The "Make it here" form loads only when its tab opens.
const NodeAuthor = lazy(() => import('./NodeAuthor'))

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

export default function NodeBuilderDialog() {
  const tab = useCommunityStore((s) => s.dialog) ?? 'build'
  const seed = useCommunityStore((s) => s.seed)
  const openDialog = useCommunityStore((s) => s.openDialog)
  const close = useCommunityStore((s) => s.closeDialog)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => opener?.focus?.()
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation() // keep the app's shortcuts (stages 1–3, P) out of the dialog
    if (e.key === 'Escape') { close(); return }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // Render inside the app root so the stage palette (Massing / Schematic) still applies.
  const host = document.querySelector('[data-stage]') ?? document.body
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="nb-title" onKeyDown={onKeyDown}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-panel text-ink shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white"><PackagePlus size={18} /></span>
            <div>
              <h2 id="nb-title" className="text-base font-semibold">Build your own node</h2>
              <p className="mt-0.5 text-xs text-muted">Can't find the check you need? Your AI assistant can build it with you, with a source behind every threshold.</p>
            </div>
          </div>
          <button aria-label="Close" onClick={close} className="rounded p-1 text-muted hover:bg-black/5"><X size={18} /></button>
        </div>
        <div role="tablist" aria-label="Node builder" className="mx-5 mt-4 flex gap-1 rounded-lg bg-black/[0.04] p-1">
          {([['build', 'Build with your AI'], ['make', 'Make it here'], ['import', 'Import a node']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => openDialog(id, seed)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === id ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          {tab === 'build' ? <BuildTab seed={seed} onImport={() => openDialog('import', seed)} /> : tab === 'make' ? <Suspense fallback={<p className="text-xs text-muted">Loading the form…</p>}><NodeAuthor /></Suspense> : <ImportTab />}
        </div>
      </div>
    </div>,
    host,
  )
}

// --- Build with your AI ------------------------------------------------------------------------------------------

const STEPS = [
  { title: 'Copy the skill', text: 'One prompt, or the skill folder' },
  { title: 'Talk to your AI', text: 'It asks one question at a time' },
  { title: 'Get a node package', text: 'A .json file with sources and tests' },
  { title: 'Import it here', text: 'Checked, then added to My nodes' },
]

function BuildTab({ seed, onImport }: { seed: string; onImport: () => void }) {
  const text = useMemo(() => promptText(seed), [seed])
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied('ok') } catch { setCopied('fail'); setShowPrompt(true) }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(null), 2500)
  }
  const total = SKILL_FILES.reduce((s, f) => s + f.text.length, 0)

  return (
    <>
      <ol className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4" aria-label="Workflow">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative">
            {i < STEPS.length - 1 && <span aria-hidden className="absolute left-7 right-0 top-3 hidden h-px bg-line sm:block" />}
            <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-accent text-meta font-semibold text-white">{i + 1}</span>
            <div className="mt-1.5 text-xs font-semibold">{s.title}</div>
            <div className="text-meta leading-snug text-muted">{s.text}</div>
            {i === 3 && <button onClick={onImport} className="mt-1 flex items-center gap-1 text-meta font-medium text-accent hover:underline">Import a node<ArrowRight size={12} /></button>}
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card icon={<Copy size={16} />} title="Copy skill" tone="primary">
          <p>Paste it into ChatGPT, Gemini, Claude, Copilot or any chat, then say what you want to check. For Codex and other coding agents, save it as <code className="rounded bg-black/5 px-1">AGENTS.md</code>.</p>
          {seed.trim() && <p className="mt-1 text-meta text-accent">Includes your search “{seed.trim()}” as the starting point.</p>}
          <button data-autofocus onClick={copy} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white hover:opacity-90">
            {copied === 'ok' ? <><Check size={14} />Copied: now paste it into your AI</> : <><ClipboardCopy size={14} />Copy skill prompt</>}
          </button>
          <div className="mt-1.5 flex items-center justify-between text-meta text-muted">
            <span>{Math.round(text.length / 1000)}k characters · works in any chat</span>
            <button onClick={() => setShowPrompt((v) => !v)} className="text-accent hover:underline" aria-expanded={showPrompt}>{showPrompt ? 'Hide prompt' : 'Show prompt'}</button>
          </div>
          {copied === 'fail' && <p className="mt-1 text-meta text-amber-800">Couldn't reach the clipboard. Select the text below and copy it.</p>}
        </Card>
        <Card icon={<FolderDown size={16} />} title="Download skill">
          <p>The skill folder for assistants that load skills: upload the .zip as a skill in Claude, or unzip it into <code className="rounded bg-black/5 px-1">~/.claude/skills/</code> for Claude Code. It adds the full reference files and a checker script.</p>
          <button onClick={() => saveFile(`${SKILL_NAME}.zip`, skillZip())} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent px-3 py-2 text-xs font-medium text-accent hover:bg-accent/[0.06]">
            <FileDown size={14} />Download skill (.zip)
          </button>
          <div className="mt-1.5 flex items-center justify-between text-meta text-muted">
            <span>{SKILL_FILES.length} files · {Math.round(total / 1000)} kB</span>
            <button onClick={() => setShowFiles((v) => !v)} className="text-accent hover:underline" aria-expanded={showFiles}>{showFiles ? 'Hide files' : 'Or single files'}</button>
          </div>
        </Card>
      </div>

      {showPrompt && (
        <textarea readOnly value={text} onFocus={(e) => e.currentTarget.select()} aria-label="Skill prompt"
          className="mt-3 h-48 w-full resize-y rounded-md border border-line bg-black/[0.02] p-2 font-mono text-meta leading-snug outline-none focus:border-accent" />
      )}
      {showFiles && (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line" aria-label="Skill files">
          {SKILL_FILES.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-meta">
              <span className="truncate font-mono">{SKILL_NAME}/{f.path}</span>
              <span className="flex shrink-0 items-center gap-2 text-muted">{sizeLabel(f.text)}
                <button onClick={() => saveFile(f.path.split('/').pop()!, f.text)} aria-label={`Download ${f.path}`} className="rounded p-0.5 text-accent hover:bg-accent/10"><FileDown size={13} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-meta font-semibold text-muted">What your AI will do</h3>
      <ul className="mt-2 grid gap-2 text-meta leading-snug text-slate-700 sm:grid-cols-2">
        <Point icon={<MessagesSquare size={14} />}>Interview you one question at a time: the question, category, stage, inputs, method, and good / bad values.</Point>
        <Point icon={<BadgeCheck size={14} />}>Tie every threshold to a source with a flag, never invent one, and keep false assumptions visible.</Point>
        <Point icon={<CircleCheckBig size={14} />}>Show you a spec and wait for your yes before writing anything.</Point>
        <Point icon={<FlaskConical size={14} />}>Write the node package and test it on three sample designs.</Point>
      </ul>

      <ComingSoon />
    </>
  )
}

function Card({ icon, title, tone, children }: { icon: ReactNode; title: string; tone?: 'primary'; children: ReactNode }) {
  return (
    <section className={`flex flex-col rounded-lg border p-3 text-xs text-slate-700 ${tone === 'primary' ? 'border-accent/40 bg-accent/[0.03]' : 'border-line'}`}>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">{icon}</span>{title}</div>
      <div className="flex flex-1 flex-col justify-between leading-snug">{children}</div>
    </section>
  )
}

const Point = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <li className="flex gap-2"><span className="mt-px shrink-0 text-accent">{icon}</span><span>{children}</span></li>
)

function ComingSoon() {
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-black/[0.03] p-3">
      <GitPullRequest size={16} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs font-semibold">Share with everyone <span className="rounded-full border border-line px-1.5 py-px text-meta font-medium text-muted">Coming</span></div>
        <p className="mt-0.5 text-meta leading-snug text-muted">A shared registry is planned: submit a node by GitHub pull request, automatic checks run, a reviewer opens every verified source, and each node gets a comment thread. Today your nodes stay in this browser and nothing is uploaded. To share one, send its .json file.</p>
      </div>
      <button disabled className="shrink-0 cursor-not-allowed rounded-md border border-line px-2 py-1 text-meta text-muted opacity-60" title="Not open yet">Submit</button>
    </div>
  )
}

// --- Import a node --------------------------------------------------------------------------------------------------

const FIXTURE_LABEL: Record<string, string> = { 'vtc-default': 'Competition, default', 'city-study': 'Real Vancouver', 'vtc-two-towers': 'Two towers' }

function ImportTab() {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [drag, setDrag] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const packages = useCommunityStore((s) => s.packages)
  const addPackage = useCommunityStore((s) => s.addPackage)
  const close = useCommunityStore((s) => s.closeDialog)

  const check = (t: string) => { setReport(validatePackageText(t)); setCopied(false) }
  // A package from the "Make it here" form arrives as a draft: check it at once, the same way as a file.
  const draft = useCommunityStore((s) => s.draft)
  useEffect(() => {
    if (!draft) return
    setText(draft); setFileName('made-here.json'); check(draft)
    useCommunityStore.getState().setDraft(null)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  const readFile = async (f: File) => { const t = await f.text(); setText(t); setFileName(f.name); check(t) }
  const tryExample = () => { const t = JSON.stringify(example, null, 2); setText(t); setFileName('example-node.json'); check(t) }
  const problems = report?.problems ?? []
  const errors = problems.filter((p) => p.level === 'error'), warnings = problems.filter((p) => p.level === 'warning')
  const pkg = report?.ok ? report.pkg! : null
  const existing = pkg ? packages.find((p) => p.id === pkg.id) : undefined

  const copyProblems = async () => {
    const msg = `Tower Design Toolkit checked the node package and found these problems. Please fix them and send the whole corrected package as one JSON block.\n\n${problems.map((p) => `- ${p.level === 'error' ? 'Must fix' : 'Check'}: ${p.where} ${p.message}`).join('\n')}`
    try { await navigator.clipboard.writeText(msg); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <>
      <p className="text-xs text-slate-700">Choose the <b>.json</b> file your AI gave you, drop it here, or paste it. Tower Design Toolkit checks it against the node format, runs its tests on three sample designs and shows what it would report. Nothing is uploaded.</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void readFile(f) }}
        className={`mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-4 text-center text-xs ${drag ? 'border-accent bg-accent/[0.06]' : 'border-line'}`}>
        <FileUp size={20} className="text-muted" />
        <div className="mt-1">Drop a node package here, or <button data-autofocus onClick={() => fileInput.current?.click()} className="font-medium text-accent hover:underline">choose a file</button></div>
        {fileName && <div className="mt-1 font-mono text-meta text-muted">{fileName}</div>}
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = '' }} />
      </div>
      <label className="mt-3 block text-meta text-muted" htmlFor="nb-paste">Or paste the package (a ```json block is fine)</label>
      <textarea id="nb-paste" value={text} onChange={(e) => { setText(e.target.value); setFileName(null) }} spellCheck={false} placeholder='{ "format": "tower-studio-node@1", … }'
        className="mt-1 h-28 w-full resize-y rounded-md border border-line bg-panel p-2 font-mono text-meta leading-snug outline-none focus:border-accent" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => check(text)} disabled={!text.trim()} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">Check package</button>
        <button onClick={tryExample} className="rounded-md border border-line px-3 py-1.5 text-xs text-ink hover:border-accent hover:text-accent">Try the worked example</button>
      </div>

      {report && (
        <div className="mt-4 rounded-lg border border-line" aria-live="polite">
          <div className={`flex items-start gap-2 rounded-t-lg px-3 py-2.5 ${report.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {report.ok ? <CircleCheckBig size={18} className="mt-0.5 shrink-0 text-emerald-700" /> : <OctagonX size={18} className="mt-0.5 shrink-0 text-red-700" />}
            <div className="min-w-0 flex-1">
              {pkg ? (
                <>
                  <div className="text-sm font-semibold text-emerald-900">Ready to add: {pkg.name} <span className="font-normal text-emerald-800">v{pkg.version}</span></div>
                  <div className="text-meta text-emerald-900/80">{CATEGORIES[pkg.category].label} · {STAGE_LABEL[pkg.stage]} · {pkg.metrics.length} metric{pkg.metrics.length === 1 ? '' : 's'} · by {pkg.author.name} · {pkg.licence}</div>
                </>
              ) : (
                <div className="text-sm font-semibold text-red-900">{errors.length} problem{errors.length === 1 ? '' : 's'} to fix before this node can be added</div>
              )}
            </div>
          </div>
          <div className="grid gap-3 p-3">
            {errors.length > 0 && <ProblemList title="Problems to fix" tone="error" items={errors} />}
            {warnings.length > 0 && <ProblemList title="Worth a look" tone="warning" items={warnings} />}
            {problems.length > 0 && (
              <button onClick={copyProblems} className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-meta hover:border-accent hover:text-accent">
                {copied ? <><Check size={13} />Copied: paste it to your AI</> : <><ClipboardCopy size={13} />Copy problems for your AI</>}
              </button>
            )}
            {pkg && report.tests.length > 0 && (
              <div className="text-meta text-slate-700">
                <b>Package tests:</b> {report.tests.filter((t) => t.ok).length} of {report.tests.length} match what Tower Design Toolkit computes.
              </div>
            )}
            {pkg && <Preview report={report} />}
            {pkg && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <div className="flex min-w-0 flex-1 items-start gap-1.5 text-meta text-muted">
                  <ShieldQuestionMark size={14} className="mt-px shrink-0" />
                  <span>Added as <b className="text-ink">Community · Unverified until reviewed</b>, stored only in this browser.{existing ? ` Replaces version ${existing.version} in My nodes.` : ''}</span>
                </div>
                <button onClick={() => { addPackage(pkg); close() }} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  <PackagePlus size={14} />{existing ? `Replace v${existing.version} with v${pkg.version}` : 'Add to My nodes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ProblemList({ title, tone, items }: { title: string; tone: 'error' | 'warning'; items: Report['problems'] }) {
  const Icon = tone === 'error' ? OctagonX : TriangleAlert
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1 text-meta font-semibold ${tone === 'error' ? 'text-red-800' : 'text-amber-800'}`}><Icon size={13} />{title}</div>
      <ul className="grid gap-1">
        {items.map((p, i) => (
          <li key={i} className={`rounded border-l-2 py-0.5 pl-2 text-meta leading-snug ${tone === 'error' ? 'border-red-400 text-red-950' : 'border-amber-400 text-amber-950'}`}>
            <span className="font-medium">{p.where}</span> {p.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What each metric reports on the sample designs, with its flag, before the node is added. */
function Preview({ report }: { report: Report }) {
  const pkg = report.pkg!
  return (
    <div>
      <div className="mb-1 text-meta font-semibold text-slate-700">Preview on the sample designs</div>
      <div className="overflow-x-auto">
        <table className="w-full text-meta">
          <thead>
            <tr className="border-b border-line text-left text-meta text-muted">
              <th className="py-1 pr-2 font-medium">Metric</th>
              {report.preview.map((p) => <th key={p.fixture.id} className="py-1 pr-2 font-medium" title={p.fixture.label}>{FIXTURE_LABEL[p.fixture.id] ?? p.fixture.id}</th>)}
            </tr>
          </thead>
          <tbody>
            {pkg.metrics.map((m) => (
              <tr key={m.id} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{m.label}</div>
                  <div className="mt-0.5"><FlagChip flag={displayFlag(m.threshold.flag)} /></div>
                </td>
                {report.preview.map((p) => {
                  const rs = p.results.filter((r) => r.metricId === m.id)
                  return (
                    <td key={p.fixture.id} className="py-1.5 pr-2">
                      {rs.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center gap-1 pb-0.5">
                          {rs.length > 1 && <span className="text-meta text-muted">{r.towerName}:</span>}
                          <span className="tabular-nums">{r.value}</span>
                          <ResultChip r={r} />
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
