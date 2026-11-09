// The transfer centre (Ruijie's Result B brief, 9 Nov, step 1): one Import and one Export entry in the project bar
// open this dialog on the matching tab. It starts with the person's purpose (lib/porting/capabilities.ts says which
// are implemented), shows what the chosen route needs and what it will do, and only the footer's named action does it:
// nothing is downloaded, replaced or installed by opening the dialog or choosing a file. It routes to the existing
// readers, writers and dialogs (the model import dialog, the phase-package preview, the node builder) and adds none.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FileDown, FileUp, X } from '../icons'
import { useStore } from '../../store'
import { saveFile } from '../../lib/download'
import { EXPORTS, forProject, IMPORTS, type Capability, type ExportPurpose, type ImportPurpose } from '../../lib/porting/capabilities'
import { useTransfer } from '../../lib/porting/transfer'
import { useImportStore } from '../../lib/import/store'
import { useCommunityStore } from '../../lib/communityStore'
import { currentText, exportName, openText, useProjectMeta } from '../../lib/project/session'
import { readProject } from '../../lib/project/projectFile'
import { readPhasePackage, type PhasePackage } from '../../lib/workflow/phasePackage'
import { PHASE_IDS, PHASE_NAME, STEP_PHASE } from '../../lib/workflow/phaseTools'
import { useStep } from '../../lib/step'
import type { PhaseId } from '../../lib/phases'
import { useTrace } from '../../lib/trace/trace'
import { traceToProv } from '../../lib/trace/prov'
import { APP_LABEL } from '../../lib/project/appLabel'
import { RULE_CARDS } from '../../data/ruleCards'
import { exportModel, exportScene, type ModelFormat } from '../ExportMenu'
import SunWindSend from '../SunWindSend'
import { PackagePreview, phasePackageName, phasePackageOf } from '../workflow/PhasePorting'
import { homeOf } from '../workflow/WorkflowOverview'
import { openToolInWorkspace } from '../builder/openTool'
import { readSiteBoundary, setSiteBoundary } from '../../lib/siteImport'
import { ringMetrics } from '../../engine/site'
import type { ImportedBoundary } from '../../engine/geoLocate'

const PROJECT_NAME = { vtc: 'Competition site', city: 'Real Vancouver' } as const
const btn = 'flex h-8 items-center gap-1 rounded-lg px-3 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
const primary = `${btn} bg-accent text-white focus-visible:ring-offset-2`
const quiet = `${btn} bg-panel text-ink hover:bg-subtle`

export default function TransferDialog() {
  const tab = useTransfer((s) => s.tab)
  const init = useTransfer((s) => s.init)
  const close = useTransfer((s) => s.close)
  const project = useStore((s) => s.project)
  const box = useRef<HTMLDivElement>(null)
  const [purpose, setPurpose] = useState<string | null>(null)
  useEffect(() => { setPurpose(init.purpose ?? null) }, [tab, init])
  // focus moves in when it opens; Tab wraps inside (the dialog is modal)
  useEffect(() => { if (tab) requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[role="radio"]')?.focus()) }, [tab])
  // Esc from anywhere while open: after an action the focused button may be disabled, and focus falls to the body
  useEffect(() => { if (!tab) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [tab, close])
  if (!tab) return null
  const list = tab === 'import' ? forProject(IMPORTS, project) : forProject(EXPORTS, project)
  const chosen = list.find((c) => c.key === purpose) ?? null
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return
    const f = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"], a[href]')].filter((x) => x.offsetParent !== null)
    if (!f.length) return
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
  }
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="transfer-title" data-testid="transfer-dialog" data-tab={tab} onKeyDown={trap}
        className="flex max-h-[90vh] w-[min(1120px,100%)] flex-col overflow-hidden rounded-2xl bg-panel text-ink shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <h2 id="transfer-title" className="text-section font-semibold">{tab === 'import' ? 'Import' : 'Export'}</h2>
          <div role="tablist" aria-label="Import or export" className="flex rounded-lg bg-subtle p-0.5">
            {(['import', 'export'] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} data-testid={`transfer-tab-${t}`} onClick={() => useTransfer.setState({ tab: t })}
                className={`flex h-7 items-center gap-1 rounded-md px-2.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${tab === t ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                {t === 'import' ? <FileUp size={13} aria-hidden /> : <FileDown size={13} aria-hidden />}{t === 'import' ? 'Import' : 'Export'}</button>
            ))}
          </div>
          <span className="text-meta text-muted">{PROJECT_NAME[project]}</span>
          <button type="button" onClick={close} aria-label="Close" data-testid="transfer-close" className="ml-auto rounded-lg p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={15} aria-hidden /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 md:flex-row" style={{ scrollbarWidth: 'thin' }}>
          <div role="radiogroup" aria-label={tab === 'import' ? 'What to bring in' : 'What to take out'} className="grid shrink-0 gap-1.5 md:w-72">
            {list.map((c) => (
              <button key={c.key} type="button" role="radio" aria-checked={purpose === c.key} disabled={!c.enabled} data-testid={`purpose-${c.key}`} onClick={() => setPurpose(c.key)}
                title={c.enabled ? c.purpose : `Not available: ${c.projects && !c.projects.includes(project) ? `${PROJECT_NAME[c.projects[0]]} only` : c.via}`}
                className={`rounded-xl border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${purpose === c.key ? 'border-accent bg-selected' : 'border-line bg-panel hover:border-boundary'}`}>
                <span className="block text-control font-semibold text-ink">{c.title}</span>
                <span className="block text-meta text-muted">{c.enabled ? c.purpose : c.projects && !c.projects.includes(project) ? `${PROJECT_NAME[c.projects[0]]} only.` : 'Not available yet.'}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-line bg-canvas p-3" data-testid="transfer-body">
            {!chosen ? <p className="text-control text-muted">Choose what you want to {tab === 'import' ? 'bring in' : 'take out'}. Nothing happens until the action at the bottom.</p>
              : tab === 'import' ? <ImportPane c={chosen} purpose={chosen.key as ImportPurpose} initial={init.file ?? null} /> : <ExportPane c={chosen} purpose={chosen.key as ExportPurpose} initialPhase={init.phase ?? null} />}
          </div>
        </div>
      </div>
    </div>, document.body)
}

/** The footer every pane ends with: Cancel, the named action, and the outcome in words. */
function Footer({ action, onAction, disabled, status, note }: { action: string; onAction: () => void; disabled?: boolean; status: string; note?: string }) {
  const close = useTransfer((s) => s.close)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {note && <span className="text-meta text-muted">{note}</span>}
      {status && <span role="status" data-testid="transfer-status" className="text-meta text-ink">{status}</span>}
      <span className="ml-auto flex gap-1.5">
        <button type="button" onClick={close} data-testid="transfer-cancel" className={quiet}>Cancel</button>
        <button type="button" onClick={onAction} disabled={disabled} data-testid="transfer-action" className={primary}>{action}</button>
      </span>
    </div>
  )
}
const Route = ({ c }: { c: Capability }) => <p className="text-meta text-muted">{c.verified ? 'Checked route' : 'Unverified route'}: {c.via}.</p>
const Pick = ({ c, file, onFile, testId = 'transfer-file' }: { c: Capability; file: File | null; onFile: (f: File | null) => void; testId?: string }) => (
  <label className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-boundary bg-panel px-3 py-2 text-control">
    <span className="font-semibold text-ink">Choose file</span><span className="text-meta text-muted">{c.accept.split(',').filter((x) => x.startsWith('.')).join(' ')}</span>
    <input type="file" accept={c.accept} data-testid={testId} onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-meta" />
    {file && <span className="basis-full text-meta text-ink">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
  </label>
)

function ImportPane({ c, purpose, initial }: { c: Capability; purpose: ImportPurpose; initial: File | null }) {
  const close = useTransfer((s) => s.close)
  const [file, setFile] = useState<File | null>(initial)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [pkg, setPkg] = useState<PhasePackage | null>(null)
  const [site, setSite] = useState<{ r: ImportedBoundary; words: string } | { error: string } | null>(null)
  const phase = STEP_PHASE[useStep((s) => s.step)]
  // a boundary is read and checked when chosen; it becomes the site only on the action
  useEffect(() => { if (purpose === 'site' && file) readSiteBoundary(file).then((r) => setSite({ r, words: `${r.name ?? file.name}: ${r.ring.length} corners, ${Math.round(ringMetrics(r.ring).area).toLocaleString('en-CA')} m², ${r.crs} → EPSG:26910. ${r.notes.join(' ')}` }), (e: Error) => setSite({ error: e.message })) }, [purpose, file])
  useEffect(() => { setFile(initial); setText(''); setStatus(''); setPkg(null); setSite(null) }, [purpose, initial])
  useEffect(() => { if (file && purpose !== 'model') void file.text().then(setText) }, [file, purpose])
  // the file is inspected, not trusted by its extension: a .json is one of three things
  const read = useMemo(() => {
    if (!text) return null
    if (purpose === 'project') { const r = readProject(text); return r.ok && r.file ? { ok: true, words: `${r.file.format}: ${PROJECT_NAME[r.file.project]}, ${r.file.towers[r.file.project].length} towers, ${r.file.trace?.iterations?.length ?? 0} trace entries.`, problems: r.problems } : { ok: false, words: '', problems: r.problems } }
    if (purpose === 'package') { const r = readPhasePackage(text); return r.pkg ? { ok: true, words: `${PHASE_NAME[r.pkg.phase]} package from ${PROJECT_NAME[r.pkg.project]}: ${r.pkg.workflow.nodes.length} tools, ${r.pkg.workflow.edges.length} connections, ${Object.keys(r.pkg.settings).length} settings.`, problems: r.problems, pkg: r.pkg } : { ok: false, words: '', problems: r.problems } }
    return null
  }, [text, purpose])
  const head = <><h3 className="text-control font-semibold text-ink">{c.title}</h3><p className="text-control text-muted">{c.purpose}</p><Route c={c} /></>
  if (purpose === 'model') return (
    <div>{head}<Pick c={c} file={file} onFile={setFile} />
      <p className="mt-2 text-meta text-muted">Rhino: a .3dm with its layers named by role (towers, core, site, context); curved Breps need render meshes saved. Grasshopper: bake, then save the .3dm (a definition is not imported). Revit: export IFC. Units, up axis, north, placement and the layer roles are confirmed on the next screen before anything joins the model.</p>
      <Footer action="Continue to the model import" disabled={!file} status={status} onAction={() => { useImportStore.getState().openDialog(file); close() }} /></div>)
  if (purpose === 'project') return (
    <div>{head}<Pick c={c} file={file} onFile={setFile} />
      {read && (read.ok ? <p className="mt-2 text-control text-ink" data-testid="transfer-preview">{read.words} Opening it replaces the open project; Ctrl+Z takes it back.</p> : <ul role="alert" className="mt-2 text-meta text-error">{read.problems.map((p) => <li key={p}>{p}</li>)}</ul>)}
      <Footer action="Open project" disabled={!read?.ok} status={status} onAction={async () => { const ok = await openText(text, file!.name.replace(/\.json$/i, '')); setStatus(ok ? 'Opened. Ctrl+Z takes it back.' : 'Could not open it (the Project menu says why).'); if (ok) close() }} /></div>)
  if (purpose === 'package') return (
    <div>{head}<Pick c={c} file={file} onFile={setFile} />
      {read && (read.ok ? <p className="mt-2 text-control text-ink" data-testid="transfer-preview">{read.words} The next screen lists what it would add, replace or take off; Merge or Replace there applies it.</p> : <ul role="alert" className="mt-2 text-meta text-error">{read.problems.map((p) => <li key={p}>{p}</li>)}</ul>)}
      <Footer action="Preview the changes" disabled={!read?.ok} status={status} onAction={() => setPkg((read as { pkg?: PhasePackage })?.pkg ?? null)} />
      {pkg && <PackagePreview pkg={pkg} current={phase} home={homeOf} onClose={() => setPkg(null)} onDone={(m) => { setPkg(null); useStore.setState({ announce: m }); close() }} />}</div>)
  if (purpose === 'site') return (
    <div>{head}<Pick c={c} file={file} onFile={setFile} />
      {site && ('error' in site ? <p role="alert" className="mt-2 text-meta text-error">{site.error}</p> : <p className="mt-2 text-control text-ink" data-testid="transfer-preview">{site.words} Positions come from the file's CRS; nothing is assumed from the project.</p>)}
      <Footer action="Set as the study site" disabled={!site || 'error' in site} status={status} onAction={() => { if (site && 'r' in site) { setSiteBoundary(file!.name, site.r); openToolInWorkspace('design.site'); close() } }} /></div>)
  return (
    <div>{head}<p className="mt-2 text-control text-ink">Packages are checked (schema, formulas, tests, icon) and shown before you install; a package's code never runs on selection. It then appears under My tools, and adding it to the workflow is your next step.</p>
      <Pick c={c} file={file} onFile={setFile} />
      <Footer action={file ? 'Check this package in the node builder' : "Open the node builder's Import"} status={status} onAction={() => { const cs = useCommunityStore.getState(); cs.setDraft(text || null); cs.openDialog('import'); close() }} /></div>)
}

function ExportPane({ c, purpose, initialPhase }: { c: Capability; purpose: ExportPurpose; initialPhase: PhaseId | null }) {
  const [kind, setKind] = useState<ModelFormat>('3dm')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const current = STEP_PHASE[useStep((s) => s.step)]
  const [phase, setPhase] = useState<PhaseId>(initialPhase ?? current)
  const meta = useProjectMeta()
  const towers = useStore((s) => s.towers[s.project])
  const trace = useTrace()
  useEffect(() => { setStatus(''); setPhase(initialPhase ?? current) }, [purpose, current, initialPhase])
  const scene = useMemo(() => (purpose === 'geometry' ? exportScene() : null), [purpose, towers])
  const pkg = useMemo(() => (purpose === 'workflow' ? phasePackageOf(phase) : null), [purpose, phase])
  const head = <><h3 className="text-control font-semibold text-ink">{c.title}</h3><p className="text-control text-muted">{c.purpose}</p><Route c={c} /></>
  const row = (k: string, v: ReactNode) => <div className="contents"><dt className="text-meta text-muted">{k}</dt><dd className="text-control text-ink">{v}</dd></div>
  if (purpose === 'geometry') return (
    <div>{head}
      <fieldset className="mt-2"><legend className="text-meta font-semibold text-muted">Format</legend>
        {([['3dm', 'Rhino (.3dm)', 'Layer per use; role, use, level and provenance as user text; north on the Earth anchor'], ['obj', 'OBJ + MTL (.zip)', 'SketchUp and most tools; metres, Y up; one material per layer'], ['glb', 'glTF (.glb)', 'Blender, web viewers and render tools; user text in extras']] as const).map(([k, l, n]) => (
          <label key={k} className="mt-1 flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-subtle"><input type="radio" name="geo-kind" value={k} checked={kind === k} onChange={() => setKind(k)} data-kind={k} className="mt-1" /><span><span className="block text-control font-semibold text-ink">{l}</span><span className="block text-meta text-muted">{n}</span></span></label>))}
      </fieldset>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="transfer-preview">
        {row('Content', `${scene?.solids.length ?? 0} solids on ${scene?.layers.length ?? 0} layers: the massing, one closed solid per storey (LOD 100), imported meshes as imported`)}
        {row('Units', 'Metres, real transformation; north from the project; Real Vancouver: UTM 10N origin')}
        {row('Not included', 'The city context, results, settings and the workflow; IFC has no writer yet')}
      </dl>
      <Footer action="Export file" disabled={busy || !scene?.solids.length} status={status} note={!scene?.solids.length ? 'No tower yet: nothing to write.' : undefined} onAction={async () => { setBusy(true); setStatus(await exportModel(kind)); setBusy(false) }} /></div>)
  if (purpose === 'backup') return (
    <div>{head}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="transfer-preview">
        {row('Project', meta.name ?? 'Untitled project')}{row('Holds', `${towers.length} tower${towers.length === 1 ? '' : 's'}, every phase's settings, imported meshes, the decision trace (${trace.iterations.length} entries)`)}
        {row('File', exportName())}{row('Reopens', 'Import › Open a saved project, with everything editable')}
      </dl>
      <Footer action="Save backup" status={status} onAction={async () => { saveFile(exportName(), await currentText()); setStatus('Saved.') }} /></div>)
  if (purpose === 'workflow') return (
    <div>{head}
      <label className="mt-2 flex items-center gap-2 text-control"><span className="text-meta font-semibold text-muted">Phase</span>
        <select value={phase} onChange={(e) => setPhase(e.target.value as PhaseId)} data-testid="transfer-phase" className="rounded-lg border border-line bg-panel px-2 py-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent">{PHASE_IDS.map((p) => <option key={p} value={p}>{PHASE_NAME[p]}</option>)}</select></label>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="transfer-preview">
        {row('Content', `${pkg?.workflow.nodes.length ?? 0} tools, ${pkg?.workflow.edges.length ?? 0} connections, ${Object.keys(pkg?.settings ?? {}).length} settings, results for model ${pkg?.results.modelRevision ?? '—'}`)}
        {row('Not included', 'Other phases, the city context, imported meshes')}
      </dl>
      <Footer action="Export package" disabled={!pkg?.workflow.nodes.length} status={status} note={!pkg?.workflow.nodes.length ? 'This phase has no tool in the workflow.' : undefined} onAction={() => { saveFile(phasePackageName(phase), JSON.stringify(pkg, null, 2)); setStatus(`Saved the ${PHASE_NAME[phase]} package: ${pkg!.workflow.nodes.length} tools, ${pkg!.workflow.edges.length} connections, ${Object.keys(pkg!.settings).length} settings, results for model ${pkg!.results.modelRevision}.`) }} /></div>)
  if (purpose === 'results') return (
    <div>{head}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="transfer-preview">
        {row('PROV', `${trace.iterations.length} design entries, ${trace.decisions.length} decisions, ${trace.reviews.length} reviews, with the rule cards they cite`)}
        {row('Boards, drawings', 'From the Present phase (Boards › Export, Drawings › SVG), where their layout is')}
      </dl>
      <div className="mt-2 rounded-lg border border-line bg-panel px-1 pb-1"><SunWindSend item="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-control hover:bg-subtle disabled:opacity-50" /></div>
      <Footer action="Export PROV (.jsonld)" disabled={!trace.iterations.length} status={status} note={!trace.iterations.length ? 'No trace entry yet.' : undefined}
        onAction={() => { saveFile('tower-studio-trace.jsonld', JSON.stringify(traceToProv({ iterations: trace.iterations, decisions: trace.decisions, reviews: trace.reviews }, { anonymise: false, app: APP_LABEL, cards: RULE_CARDS, exportedAt: new Date().toISOString() }), null, 2)); setStatus('Saved.') }} /></div>)
  return <div>{head}<p className="mt-2 text-control text-ink">Not available yet.</p></div>
}
