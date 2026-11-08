// Community registry browser (research P15-M05, M06) for the Customize page: browse the local sample registry, open a
// node, install it into My nodes through the node builder's own import check, and prepare a pull request locally.
// No network beyond this app's own files: comments are a stub, and nothing is ever uploaded or published.
import { strToU8, zipSync } from 'fflate'
import {
  ArrowLeft, BadgeCheck, Check, ClipboardCopy, Download, ExternalLink, FileJson, FlaskConical, GitPullRequest, History, Loader2, MessagesSquare,
  PackageCheck, PackagePlus, Search, ShieldAlert, Star, Users, X,
} from '../icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_ICONS } from '../../data/icons'
import { CATEGORIES, type Category } from '../../data/registry'
import type { Flag } from '../../engine/types'
import { useCommunityStore } from '../../lib/communityStore'
import type { NodePackage } from '../../lib/nodePackages'
import {
  checkDownload, compareSemver, flagCovers, flagShownStatus, giscusConfig, installability, latestVersion, makeSubmission, parseFlags, parseRatings,
  parseRegistry, ratingSummary, REVIEW_LABEL, type FlagRecord, type RegistryIndex, type RegistryModule, type RegistryVersion, type Submission,
} from '../../lib/registry'
import { FlagChip } from '../ui'

interface Loaded { index: RegistryIndex; problems: string[]; flags: FlagRecord[]; ratings: Record<string, { up: number; down: number }> }

let cache: Promise<Loaded> | null = null
/** The registry is three static files next to the app (public/registry/), read once per session. */
function loadRegistry(): Promise<Loaded> {
  cache ??= (async () => {
    const get = async (f: string) => { const r = await fetch(`./registry/${f}`); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.text() }
    const [i, f, r] = await Promise.all([get('index.json'), get('flags.json').catch(() => '{}'), get('ratings.json').catch(() => '{}')])
    const parsed = parseRegistry(i)
    if (!parsed.ok) throw new Error(parsed.problems.join(' '))
    return { index: parsed.index, problems: parsed.problems, flags: parseFlags(f), ratings: parseRatings(r) }
  })()
  cache.catch(() => { cache = null })
  return cache
}

const FLAG_ORDER: Flag[] = ['false_assumption', 'unresolved', 'unverified', 'team_assumption', 'verified']

function CatTile({ cat, size = 'h-9 w-9', icon = 18 }: { cat: Category; size?: string; icon?: number }) {
  const Icon = CATEGORY_ICONS[cat]
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-md text-white`} style={{ background: CATEGORIES[cat].color }}><Icon size={icon} aria-hidden /></span>
}

function ReviewBadge({ review }: { review: RegistryModule['review'] }) {
  const cls = review === 'expert' ? 'border-flag-verified/40 text-flag-verified' : review === 'community' ? 'border-accent/40 text-accent' : 'border-line text-muted'
  return <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-meta font-medium ${cls}`}>{review === 'unreviewed' ? <ShieldAlert size={10} aria-hidden /> : <BadgeCheck size={10} aria-hidden />}{REVIEW_LABEL[review]}</span>
}

/** Thresholds by the flag the author claims. Community claims display as unverified in the app until reviewed. */
function Claims({ v }: { v: RegistryVersion }) {
  const flags = FLAG_ORDER.filter((f) => v.evidence[f])
  if (!flags.length) return null
  return <span className="flex flex-wrap items-center gap-1">{flags.map((f) => <span key={f} className="inline-flex items-center gap-0.5"><FlagChip flag={f} /><span className="text-meta tabular-nums text-muted">×{v.evidence[f]}</span></span>)}</span>
}

function useInstalled() {
  const packages = useCommunityStore((s) => s.packages)
  return (id: string) => packages.find((p) => p.id === id)?.version ?? null
}

function Row({ m, data, onOpen }: { m: RegistryModule; data: Loaded; onOpen: () => void }) {
  const v = latestVersion(m)
  const installed = useInstalled()(m.id)
  const flags = data.flags.filter((f) => f.module === m.id && v && flagCovers(f, v.version))
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-3 rounded-lg border border-line bg-panel p-3 text-left outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
        <CatTile cat={m.category} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-node font-semibold">{m.name}</span>
            {m.kind === 'code' && <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-400 px-1.5 py-0.5 text-meta text-muted"><FlaskConical size={10} aria-hidden />Code module · no bundle yet</span>}
            {installed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-meta font-medium text-emerald-800"><Check size={10} aria-hidden />Installed {installed}</span>}
          </span>
          <span className="mt-0.5 block text-meta text-muted">{m.author.name} · {v ? `v${v.version}` : 'no installable version'} · {m.licence} · {CATEGORIES[m.category].label}</span>
          <span className="mt-1 line-clamp-2 block text-[11.5px] leading-snug text-ink/80">{m.summary}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ReviewBadge review={m.review} />
            {v && <Claims v={v} />}
            {flags.length > 0 && <span className="inline-flex items-center gap-1 text-meta text-flag-false"><ShieldAlert size={10} aria-hidden />{flags.length} flag{flags.length > 1 ? 's' : ''}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

function FlagItem({ f }: { f: FlagRecord }) {
  const shown = flagShownStatus(f)
  return (
    <li className={`rounded-md border p-2 text-meta ${shown === 'false_assumption' ? 'border-flag-false/50' : 'border-line'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown === 'disputed' ? <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-meta font-medium text-amber-900">Disputed (no evidence yet)</span> : <FlagChip flag={shown} />}
        <span className="text-meta text-muted">{f.threshold ? `threshold ${f.threshold}` : 'whole package'} · versions {f.versions} · {f.state}</span>
      </div>
      <p className={`mt-1 ${shown === 'false_assumption' ? 'line-through decoration-flag-false/60' : ''}`}>{f.claim}</p>
      {f.correctedValue && <p className="mt-0.5 text-ink"><b>Correction:</b> {f.correctedValue}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
        {f.evidenceUrl && <a href={f.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent">Evidence<ExternalLink size={9} aria-hidden /></a>}
        {f.history.length > 0 && <span className="inline-flex items-center gap-0.5" title={f.history.map((h) => `${h.date}: ${h.status} (${h.note})`).join('\n')}><History size={10} aria-hidden />{f.history.length} change{f.history.length > 1 ? 's' : ''}</span>}
      </div>
    </li>
  )
}

function Detail({ m, data, onBack, onAddToCanvas }: { m: RegistryModule; data: Loaded; onBack: () => void; onAddToCanvas: (id: string) => void }) {
  const latest = latestVersion(m)
  const [ver, setVer] = useState<string | null>(latest?.version ?? m.versions[0].version)
  const v = m.versions.find((x) => x.version === ver) ?? m.versions[0]
  const [pkg, setPkg] = useState<{ text: string; json: NodePackage } | null>(null)
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; msg: string }>({ kind: 'idle', msg: '' })
  const installed = useInstalled()(m.id)
  const addPackage = useCommunityStore((s) => s.addPackage)
  const can = installability(m, v)
  const flags = data.flags.filter((f) => f.module === m.id && flagCovers(f, v.version))
  const rating = ratingSummary(data.ratings[m.id])

  useEffect(() => {
    setPkg(null)
    if (!v.file) return
    let live = true
    fetch(`./registry/${v.file}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((text) => { if (live) setPkg({ text, json: JSON.parse(text) }) }).catch(() => {})
    return () => { live = false }
  }, [v.file])

  const install = async () => {
    if (!pkg) return
    setStatus({ kind: 'busy', msg: 'Checking the package…' })
    const integrity = await checkDownload(m, v, pkg.text)
    if (!integrity.ok) { setStatus({ kind: 'error', msg: integrity.problem! }); return }
    // The node builder's own import check: schema, formulas, thresholds and the package's tests (loads on demand).
    const { validatePackageText } = await import('../../lib/nodeValidate')
    const report = validatePackageText(pkg.text)
    const errors = report.problems.filter((p) => p.level === 'error')
    if (!report.ok || !report.pkg || errors.length) { setStatus({ kind: 'error', msg: `The import check refused it: ${errors.map((e) => `${e.where} ${e.message}`).join(' ')}` }); return }
    addPackage(report.pkg)
    const warn = report.problems.length ? ` ${report.problems.length} note${report.problems.length > 1 ? 's' : ''} from the import check (see My nodes).` : ''
    setStatus({ kind: 'ok', msg: `Installed ${m.id}@${v.version} in My nodes, switched on in the guided app. It shows as Community · Unverified until reviewed.${warn}` })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <button onClick={onBack} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft size={14} aria-hidden />All nodes</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex items-start gap-3">
          <CatTile cat={m.category} size="h-11 w-11" icon={22} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-tight">{m.name}</h3>
            <p className="mt-0.5 font-mono text-[10.5px] text-muted">{m.id}</p>
            <p className="mt-0.5 text-meta text-muted">{m.author.name}{m.author.github ? ` (@${m.author.github})` : ''} · {m.licence} · {CATEGORIES[m.category].label} · {m.stage}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ReviewBadge review={m.review} />
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted"><Star size={11} aria-hidden />
                {rating.shown ? `${Math.round(rating.lower * 100)}% lower bound (${rating.n} ratings)` : `${rating.n ? `${rating.n} rating${rating.n > 1 ? 's' : ''}` : 'No ratings'}: shown from 5`}
                {data.index.sample && ' · sample data'}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-meta leading-relaxed text-ink/85">{pkg?.json.question ?? m.summary}</p>

        <section className="mt-3">
          <h4 className="text-meta font-semibold text-muted">Versions</h4>
          <ul className="mt-1 space-y-1">
            {m.versions.map((x) => (
              <li key={x.version}>
                <label className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-meta ${x.version === v.version ? 'border-accent/50 bg-accent/5' : 'border-line'}`}>
                  <input type="radio" name="version" checked={x.version === v.version} onChange={() => setVer(x.version)} className="mt-0.5 accent-accent" />
                  <span className="min-w-0 flex-1">
                    <span className={`font-medium ${x.yanked ? 'line-through text-muted' : ''}`}>v{x.version}</span>
                    <span className="text-muted"> · {x.published} · {x.tier === 'declarative' ? 'declarative formulas' : `${x.tier} sandbox`}{x.permissions.length ? ` · asks for ${x.permissions.join(', ')}` : ''}</span>
                    {x.yanked && <span className="block text-amber-800">Yanked: {x.reason}</span>}
                    {latest && x.version === latest.version && !x.yanked && <span className="ml-1 rounded bg-slate-100 px-1 text-[9.5px] text-muted">latest</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-3">
          <h4 className="text-meta font-semibold text-muted">Evidence the author claims</h4>
          <div className="mt-1"><Claims v={v} /></div>
          <p className="mt-1 text-[10.5px] text-muted">Community nodes show as unverified in Tower Design Toolkit until a reviewer checks every source; an author's "verified" is a claim.</p>
        </section>

        {pkg && (
          <section className="mt-3">
            <h4 className="text-meta font-semibold text-muted">What it measures</h4>
            <ul className="mt-1 space-y-1">
              {pkg.json.metrics.map((x) => (
                <li key={x.id} className="rounded-md border border-line p-2 text-meta">
                  <div className="flex items-start justify-between gap-2"><span className="font-medium">{x.label}</span><FlagChip flag={x.threshold.flag === 'verified' ? 'unverified' : x.threshold.flag} /></div>
                  <div className="mt-0.5 font-mono text-meta text-muted">{x.expression}</div>
                  <div className="mt-0.5 text-[10.5px] text-muted">{x.threshold.text ?? (x.threshold.good !== undefined ? `good ${x.threshold.direction === 'lower_is_better' ? '≤' : '≥'} ${String(x.threshold.good)}${x.threshold.bad !== undefined ? `, bad ${x.threshold.direction === 'lower_is_better' ? '>' : '<'} ${String(x.threshold.bad)}` : ''}` : 'no threshold')} · {x.threshold.source.label}{x.threshold.source.page ? `, ${x.threshold.source.page}` : ''}</div>
                </li>
              ))}
            </ul>
            <details className="mt-1.5 text-meta">
              <summary className="cursor-pointer text-accent">Method, human judgement and limits</summary>
              <p className="mt-1 text-ink/80"><b>Method.</b> {pkg.json.method}</p>
              <p className="mt-1 text-ink/80"><b>Stays with people.</b> {pkg.json.human}</p>
              <p className="mt-1 text-ink/80"><b>Limits.</b> {pkg.json.limits}</p>
            </details>
          </section>
        )}

        {flags.length > 0 && (
          <section className="mt-3">
            <h4 className="text-meta font-semibold text-muted">Flags on this version</h4>
            <ul className="mt-1 space-y-1.5">{flags.map((f, k) => <FlagItem key={k} f={f} />)}</ul>
          </section>
        )}

        <section className="mt-3 rounded-md border border-line bg-paper p-2.5 text-meta">
          <div className="flex items-center gap-1.5 font-medium"><PackageCheck size={13} aria-hidden />How it runs</div>
          <p className="mt-0.5 text-muted">{m.kind === 'declarative'
            ? 'Declarative formulas over the Layer 0 summary, read by Tower Design Toolkit\'s own parser: no third-party code runs, and the package is checked against the registry\'s SHA-256 before install.'
            : 'Code nodes run in a sandboxed frame with no network and a time limit, only after you allow them (research P15-M04). This sample has no code bundle in the registry yet, so it cannot be installed from here.'}</p>
        </section>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={install} disabled={!can.ok || !pkg || status.kind === 'busy'}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            {status.kind === 'busy' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <PackagePlus size={14} aria-hidden />}
            {installed === v.version ? 'Reinstall' : installed && compareSemver(v.version, installed) > 0 ? `Update from v${installed}` : 'Install in My nodes'}
          </button>
          {installed && (
            <button onClick={() => onAddToCanvas(m.id)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">Add to the canvas</button>
          )}
          {!can.ok && <span className="text-meta text-muted">{can.reason}</span>}
        </div>
        {status.kind !== 'idle' && status.kind !== 'busy' && (
          <p role="status" className={`mt-2 rounded px-2 py-1 text-meta ${status.kind === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>{status.msg}</p>
        )}

        <section className="mt-4 rounded-md border border-dashed border-line p-2.5 text-meta">
          <div className="flex items-center gap-1.5 font-medium"><MessagesSquare size={13} aria-hidden />Comments and reviews: coming</div>
          <p className="mt-0.5 text-muted">Each node will get one public discussion thread (giscus, GitHub Discussions), and structured reviews will count one vote per account per major version. Nothing is loaded yet: no script, no network call.</p>
          <p className="mt-1 text-amber-900">When it opens: please don't discuss your own competition scheme there before the results (VTC anonymity).</p>
          <details className="mt-1">
            <summary className="cursor-pointer text-accent">Planned thread settings</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-panel p-2 font-mono text-meta leading-snug">{JSON.stringify(giscusConfig(m.id, data.index.repo), null, 2)}</pre>
          </details>
        </section>
      </div>
    </div>
  )
}

function SubmitHelper() {
  const packages = useCommunityStore((s) => s.packages)
  const [id, setId] = useState(packages[0]?.id ?? '')
  const [sub, setSub] = useState<Submission | null>(null)
  const [copied, setCopied] = useState(false)
  const pkg = packages.find((p) => p.id === id) ?? null
  useEffect(() => { setSub(null); setCopied(false); if (pkg) makeSubmission(pkg).then(setSub) }, [pkg])

  const download = () => {
    if (!sub || !pkg) return
    const files: Record<string, Uint8Array> = {}
    for (const [path, text] of Object.entries(sub.files)) files[`tower-studio-registry-pr/${path}`] = strToU8(text)
    files['tower-studio-registry-pr/PULL_REQUEST.md'] = strToU8(`# ${sub.prTitle}\n\n${sub.prBody}\n`)
    const url = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${pkg.id}@${pkg.version}-registry-pr.zip`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-meta">
      <p className="text-ink/85">Share one of your nodes through a pull request to the community registry. Tower Design Toolkit only prepares the files: <b>nothing is uploaded or published</b>, and you open the pull request yourself.</p>
      {!packages.length ? (
        <p className="mt-3 rounded-md border border-line bg-paper p-3 text-[11.5px] text-muted">You have no node in My nodes yet. Build one with the node-builder skill (ribbon → My nodes → Build a node), or install one from Browse.</p>
      ) : (
        <>
          <label className="mt-3 flex items-center gap-2 text-[11.5px]">Node
            <select value={id} onChange={(e) => setId(e.target.value)} className="min-w-0 flex-1 rounded border border-line bg-panel px-2 py-1 text-[11.5px]" aria-label="Node to submit">
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>)}
            </select>
          </label>
          {sub && (
            <>
              <h4 className="mt-3 text-meta font-semibold text-muted">Files for the pull request</h4>
              <ul className="mt-1 space-y-1">
                {Object.entries(sub.files).map(([path, text]) => (
                  <li key={path} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 font-mono text-[10.5px]"><FileJson size={13} className="shrink-0 text-muted" aria-hidden /><span className="min-w-0 flex-1 truncate">{path}</span><span className="text-muted">{text.length.toLocaleString()} B</span></li>
                ))}
              </ul>
              <pre className="mt-1.5 overflow-x-auto rounded bg-paper p-2 font-mono text-meta leading-snug">{sub.indexLine}</pre>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={download} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Download size={14} aria-hidden />Download the PR files (.zip)</button>
                <button onClick={async () => { try { await navigator.clipboard.writeText(`${sub.prTitle}\n\n${sub.prBody}`); setCopied(true) } catch { setCopied(false) } }}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">{copied ? <Check size={14} aria-hidden /> : <ClipboardCopy size={14} aria-hidden />}{copied ? 'Copied' : 'Copy the PR description'}</button>
              </div>
              <h4 className="mt-4 text-meta font-semibold text-muted">Steps</h4>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-[11.5px] text-ink/85">
                <li>Fork the registry repository on GitHub <span className="text-muted">(not created yet: the address will appear here)</span>.</li>
                <li>Add the two files at the paths shown (the zip keeps them), on a new branch.</li>
                <li>Open a pull request titled <code className="rounded bg-paper px-1">{sub.prTitle}</code> and paste the description.</li>
                <li>Automated checks run the same import check as Tower Design Toolkit, verify the SHA-256 and the licence; a maintainer reviews the sources.</li>
                <li>Once merged it appears under Browse as <b>Unreviewed</b>; a reviewer can later mark it community- or expert-reviewed.</li>
              </ol>
              <p className="mt-3 flex items-start gap-1.5 text-meta text-muted"><GitPullRequest size={13} className="mt-0.5 shrink-0" aria-hidden />Only declarative packages (formulas and sources) are accepted for now. Code modules wait for the sandbox (research P15-M04).</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default function CommunityDrawer({ open, onClose, onAddToCanvas }: { open: boolean; onClose: () => void; onAddToCanvas: (id: string) => void }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'browse' | 'submit'>('browse')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open && !data) loadRegistry().then(setData, (e: Error) => setError(e.message)) }, [open, data])
  useEffect(() => {
    if (!open) return
    panel.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [open, onClose])

  const list = useMemo(() => {
    if (!data) return []
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return data.index.modules.filter((m) => (cat === 'all' || m.category === cat) && words.every((w) => `${m.name} ${m.id} ${m.summary} ${m.tags.join(' ')} ${m.author.name}`.toLowerCase().includes(w)))
  }, [data, q, cat])
  const cats = useMemo(() => (data ? [...new Set(data.index.modules.map((m) => m.category))] : []), [data])
  const current = data?.index.modules.find((m) => m.id === openId) ?? null

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onMouseDown={onClose}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Community registry" onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-[min(560px,96vw)] flex-col border-l border-line bg-panel shadow-2xl outline-none">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Users size={17} className="text-accent" aria-hidden />
          <h2 className="text-sm font-semibold">Community</h2>
          {data?.index.sample && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-meta font-medium text-amber-900" title={data.index.note}>Sample registry · local, not real submissions</span>}
          <button onClick={onClose} aria-label="Close the community panel" className="ml-auto rounded p-1 text-muted hover:bg-black/5 hover:text-ink"><X size={16} /></button>
        </div>
        <div role="tablist" aria-label="Community" className="flex gap-1 border-b border-line px-3 pt-1.5">
          {(['browse', 'submit'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-t-md border border-b-0 px-3 py-1 text-xs ${tab === t ? 'border-line bg-paper font-semibold' : 'border-transparent text-muted hover:text-ink'}`}>{t === 'browse' ? 'Browse nodes' : 'Submit via GitHub PR'}</button>
          ))}
        </div>

        {tab === 'submit' ? <SubmitHelper /> : current && data ? (
          <Detail m={current} data={data} onBack={() => setOpenId(null)} onAddToCanvas={(id) => { onAddToCanvas(id); onClose() }} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-2 border-b border-line px-4 py-2.5">
              <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-2 py-1.5 focus-within:border-accent">
                <Search size={14} className="text-muted" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search community nodes" aria-label="Search community nodes" className="w-full bg-transparent text-xs outline-none" />
              </label>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Category">
                {(['all', ...cats] as const).map((c) => (
                  <button key={c} role="radio" aria-checked={cat === c} onClick={() => setCat(c)}
                    className={`rounded-full border px-2 py-0.5 text-[10.5px] ${cat === c ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'}`}>{c === 'all' ? 'All' : CATEGORIES[c].label}</button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {!data && !error && <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 size={13} className="animate-spin" aria-hidden />Reading the registry…</p>}
              {error && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">The registry could not be read: {error}</p>}
              {data && data.problems.length > 0 && <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-meta text-amber-900">{data.problems.length} entr{data.problems.length > 1 ? 'ies were' : 'y was'} left out: {data.problems.join(' ')}</p>}
              <ul className="space-y-2">{data && list.map((m) => <Row key={m.id} m={m} data={data} onOpen={() => setOpenId(m.id)} />)}</ul>
              {data && !list.length && <p className="text-xs text-muted">No community node matches.</p>}
              {data?.index.note && <p className="mt-4 text-[10.5px] text-muted">{data.index.note}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
