// Phase packages (Ruijie, 8 Nov: "Preview imports and distinguish merging from replacing phase content"), since 9 Nov
// reached through the transfer centre (components/porting/TransferDialog.tsx): the package of one phase, and the preview
// of what importing one would do. Three kinds of file, never mixed up:
//   Phase package (.json, tower-studio-phase@1): this phase's tools, their connections and the links to other phases,
//     its settings and geometry, the units / origin / north / datum, the results with the model revision they belong
//     to, and tool versions (lib/workflow/phasePackage.ts). Importing shows what it would do first; Merge adds, Replace
//     swaps this phase only.
//   Model snapshot (.json, tower-studio-project@1): the whole project as it is now (the Project menu's file), for a
//     backup or a hand-off. Opening one replaces the open design; Ctrl+Z takes it back.
//   External format (.3dm, OBJ + MTL, .glb in; IFC too): the massing for other software, with no tool settings.
// Files are made and read in this browser; nothing is uploaded.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from '../icons'
import { APP_LABEL } from '../../lib/project/appLabel'
import { useImportStore } from '../../lib/import/store'
import { useCommunityStore } from '../../lib/communityStore'
import { useTrace } from '../../lib/trace/trace'
import type { PhaseId } from '../../lib/phases'
import { goToStep } from '../../lib/step'
import { useStore } from '../../store'
import { buildPhasePackage, modelRevision, PHASE_SLICES, planImport, readPhasePackage, SLICE_WORDS, type ImportMode, type PhasePackage } from '../../lib/workflow/phasePackage'
import { PHASE_NAME, PHASE_STEP, phasePortion, usePhaseTools } from '../../lib/workflow/phaseTools'
import { knownNode, useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import { homeOf, useInfo } from './WorkflowOverview'
import type { Portion } from './PhasePanel'

const APP_VERSION = APP_LABEL.split(' ').pop() ?? '0'
const PROJECT_NAME = { vtc: 'Competition site', city: 'Real Vancouver' } as const

const item = 'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const Drawer = ({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) => (
  <div role="region" aria-label={label} className="border-b border-line bg-canvas px-2 py-1.5 text-control" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex items-center px-1"><h3 className="text-meta font-semibold text-muted">{label}</h3>
      <button type="button" onClick={onClose} aria-label={`Close ${label}`} className="ml-auto rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button></div>
    {children}
  </div>
)
const Line = ({ title, note }: { title: string; note: string }) => <span className="min-w-0"><span className="block font-semibold text-ink">{title}</span><span className="block text-meta text-muted">{note}</span></span>

/** One phase of the open project as a package (what Export from the phase header and the transfer centre write). */
export function phasePackageOf(phase: PhaseId, portion: Portion = phasePortion(useProjectWorkflow.getState().wf, phase, homeOf)): PhasePackage {
  const s = useStore.getState()
  return buildPhasePackage({
    phase, project: s.project, units: 'metres', nodes: portion.nodes, internal: portion.internal, crossing: portion.crossing,
    state: s as unknown as Record<string, unknown>, digest: useTrace.getState().live?.digest ?? null,
    versions: Object.fromEntries(useCommunityStore.getState().packages.map((p) => [p.id, p.version])), appVersion: APP_VERSION,
  })
}
export const phasePackageName = (phase: PhaseId) => `${phase}-phase-${useStore.getState().project}-${new Date().toISOString().slice(0, 10)}.json`

/** What a package would do, before it does it: tools added or taken off, connections, settings, model, results. */
export function PackagePreview({ pkg, current, home, onClose, onDone }: { pkg: PhasePackage; current: PhaseId; home: (id: string) => PhaseId; onClose: () => void; onDone: (msg: string) => void }) {
  const w = useProjectWorkflow()
  const info = useInfo()
  const project = useStore((s) => s.project)
  const towersNow = useStore((s) => s.towers[s.project])
  const [mode, setMode] = useState<ImportMode>('merge')
  const [takeSettings, setTakeSettings] = useState(false)
  const [takeModel, setTakeModel] = useState(false)
  useEffect(() => { setTakeSettings(mode === 'replace'); setTakeModel(mode === 'replace') }, [mode])
  const portion = useMemo(() => phasePortion(w.wf, pkg.phase, home), [w.wf, pkg.phase, home])
  // A custom tool counts only when its package is installed in this browser (8 Nov, F04): an id alone is not a tool.
  const installed = useCommunityStore((s) => s.packages)
  const available = useMemo(() => (id: string) => (id.startsWith('community.') ? installed.some((p) => p.id === id) : knownNode(id)), [installed])
  const plan = useMemo(() => planImport(w.wf, portion.nodes, pkg, mode, available), [w.wf, portion.nodes, pkg, mode, available])
  const allowed = PHASE_SLICES[pkg.phase].filter((k) => k in pkg.settings)
  const settingKeys = allowed.filter((k) => k !== 'towers')
  const towers = Array.isArray(pkg.settings.towers) ? (pkg.settings.towers as unknown[]) : null
  const revNow = modelRevision(towersNow)
  const lines = pkg.results.digest?.lines.length ?? 0
  // what the package refers to that this project or browser doesn't have (8 Nov, F04)
  const missingLinks = pkg.workflow.links.filter((l) => !w.wf.nodes.includes(l.other) && !pkg.workflow.nodes.includes(l.other) && l.other !== 'start' && l.other !== 'enter')
  const meshes = useImportStore((s) => s.meshes)
  const missingMeshes = (towers ?? []).filter((t) => { const m = (t as { imported?: { meshId?: string } }).imported?.meshId; return !!m && !meshes[m] }).map((t) => (t as { name?: string }).name ?? 'a tower')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.querySelector<HTMLElement>('input')?.focus() }, [])

  const apply = () => {
    for (const id of plan.added) usePhaseTools.getState().place(id, pkg.phase)
    w.commit(plan.board, `${PHASE_NAME[pkg.phase]} package ${mode === 'merge' ? 'merged' : 'replaced the phase'}`)
    const patch: Record<string, unknown> = {}
    if (takeSettings) for (const k of settingKeys) patch[k] = pkg.settings[k]
    if (takeModel && towers) patch.towers = { ...useStore.getState().towers, [project]: towers }
    if (Object.keys(patch).length) useStore.setState(patch as never)
    if (pkg.phase !== current) goToStep(PHASE_STEP[pkg.phase])
    onDone(`${PHASE_NAME[pkg.phase]} package ${mode === 'merge' ? 'merged' : 'applied (replace)'}: ${plan.added.length} tool${plan.added.length === 1 ? '' : 's'} added${plan.removed.length ? `, ${plan.removed.length} taken off` : ''}, ${plan.wires} connection${plan.wires === 1 ? '' : 's'}${Object.keys(patch).length ? `, ${Object.keys(patch).length} setting${Object.keys(patch).length === 1 ? '' : 's'} taken` : ''}. Undo is in Edit (workflow) and Ctrl+Z (settings).`)
  }
  const state = (id: string) => (!available(id) ? 'not in this app: skipped' : plan.added.includes(id) ? 'new' : 'already here')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="pp-title" data-testid="phase-package-preview" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="flex max-h-[85vh] w-[min(34rem,100%)] flex-col overflow-hidden rounded-2xl bg-panel shadow-float">
        <div className="flex items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="pp-title" className="text-section font-semibold text-ink">Import a {PHASE_NAME[pkg.phase]} package</h2>
            <p className="text-meta text-muted">Saved {new Date(pkg.exportedAt).toLocaleString()} from Tower Design Toolkit {pkg.app.version}, on the {PROJECT_NAME[pkg.project]}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cancel the import" className="rounded p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={15} aria-hidden /></button>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 text-control">
          {pkg.phase !== current && <p className="rounded-lg bg-subtle px-2 py-1 text-meta text-ink">It belongs to {PHASE_NAME[pkg.phase]}; it goes there, and the panel switches to it.</p>}
          {pkg.project !== project && <p className="rounded-lg bg-warning-surface px-2 py-1 text-meta text-warning">Made on the {PROJECT_NAME[pkg.project]}; you are on {PROJECT_NAME[project]}. Its towers keep their local coordinates, so check where they land.</p>}
          <fieldset>
            <legend className="text-meta font-semibold text-muted">How</legend>
            {(['merge', 'replace'] as const).map((m) => (
              <label key={m} className="mt-1 flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-subtle">
                <input type="radio" name="pp-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1" data-mode={m} />
                <span><span className="block font-semibold text-ink">{m === 'merge' ? 'Merge' : 'Replace'}</span>
                  <span className="block text-meta text-muted">{m === 'merge' ? 'Adds the tools and connections you don’t have; nothing is taken off. Settings and model stay yours unless you tick them below.' : `${PHASE_NAME[pkg.phase]}'s tools and connections become the package's (other phases untouched); its settings and model replace yours, unless you untick them.`}</span></span>
              </label>
            ))}
          </fieldset>
          <section aria-label="Tools">
            <h3 className="text-meta font-semibold text-muted">Tools</h3>
            <ul className="mt-1 space-y-0.5" data-testid="pp-tools">
              {pkg.workflow.nodes.map((id) => <li key={id} className="flex items-center gap-2" data-pp-node={id} data-state={state(id)}><span className="min-w-0 flex-1 truncate text-ink">{available(id) ? info(id).name : id}</span><span className={`text-meta ${state(id) === 'new' ? 'font-semibold text-success' : 'text-muted'}`}>{state(id)}{pkg.tools[id] ? ` · v${pkg.tools[id]}` : ''}</span></li>)}
              {plan.removed.map((id) => <li key={id} className="flex items-center gap-2" data-pp-node={id} data-state="taken off"><span className="min-w-0 flex-1 truncate text-ink">{info(id).name}</span><span className="text-meta font-semibold text-error">taken off (its results and your model stay)</span></li>)}
            </ul>
            {missingLinks.length > 0 && <p className="mt-1 text-meta text-warning" data-testid="pp-missing-links">Links to tools not in this project, not added: {missingLinks.map((l) => `${l.out ? 'to' : 'from'} ${knownNode(l.other) ? info(l.other).name : l.other}`).join(', ')}.</p>}
            <p className="mt-1 text-meta text-muted">{plan.wires} new connection{plan.wires === 1 ? '' : 's'}{pkg.workflow.edges.some((e) => pkg.workflow.nodes.indexOf(e.b) >= 0 && pkg.workflow.nodes.indexOf(e.b) < pkg.workflow.nodes.indexOf(e.a)) ? ', return paths included' : ''}{mode === 'replace' ? `; ${PHASE_NAME[pkg.phase]}'s own connections are replaced` : ''}.{pkg.workflow.links.length ? ` ${pkg.workflow.links.length} link${pkg.workflow.links.length === 1 ? '' : 's'} to other phases are kept as they are here.` : ''}</p>
          </section>
          <section aria-label="Settings and model">
            <h3 className="text-meta font-semibold text-muted">Settings and model</h3>
            {settingKeys.length > 0 && <label className="mt-1 flex items-start gap-2"><input type="checkbox" checked={takeSettings} onChange={(e) => setTakeSettings(e.target.checked)} className="mt-1" data-testid="pp-settings" />
              <span className="text-ink">Take its settings: {settingKeys.map((k) => SLICE_WORDS[k] ?? k).join(', ')}</span></label>}
            {towers && <label className="mt-1 flex items-start gap-2"><input type="checkbox" checked={takeModel} onChange={(e) => setTakeModel(e.target.checked)} className="mt-1" data-testid="pp-model" />
              <span className="text-ink">Take its model: {towers.length} tower{towers.length === 1 ? '' : 's'} in place of your {towersNow.length} on the {PROJECT_NAME[project]}</span></label>}
            {!settingKeys.length && !towers && <p className="text-meta text-muted">No settings in this package.</p>}
            {missingMeshes.length > 0 && <p className="mt-1 text-meta text-warning" data-testid="pp-missing-assets">Imported model files not in this browser: {missingMeshes.join(', ')} would draw as stacked plates until the file is imported again.</p>}
            <p className="mt-1 text-meta text-muted">Units {pkg.frame.units}; origin {pkg.frame.origin}; north {pkg.frame.north}; datum {pkg.frame.datum}.</p>
          </section>
          <section aria-label="Results">
            <h3 className="text-meta font-semibold text-muted">Results</h3>
            <p className="text-meta text-ink">{lines} result line{lines === 1 ? '' : 's'} for model revision {pkg.results.modelRevision}; your model is {revNow}{revNow === pkg.results.modelRevision ? ' (the same model)' : ' (a different model)'}. Results are always recomputed from the model in use; the package keeps its own as a record.</p>
          </section>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-panel px-3 py-1.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Cancel</button>
          <button type="button" onClick={apply} data-testid="pp-apply" className="rounded-lg bg-accent px-3 py-1.5 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">{mode === 'merge' ? 'Merge' : 'Replace'} into {PHASE_NAME[pkg.phase]}</button>
        </div>
      </div>
    </div>
  )
}
