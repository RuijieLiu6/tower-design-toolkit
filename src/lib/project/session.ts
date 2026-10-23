// The open project: autosave and restore, New, Open, Save as, Export and Import. Opening anything replaces the design
// as one undo step, so Ctrl+Z brings the previous design back. Validation (Ajv) loads on first use.
import { create } from 'zustand'
import { useCommunityStore } from '../communityStore'
import type { NodePackage } from '../nodePackages'
import { useStore } from '../../store'
import { applyDesign, defaultDesign, pickDesign, type Design } from './design'
import { breakStep, resetHistory } from './history'
import { AUTOSAVE_KEY, getProject, listProjects, putProject, deleteProject, storageAvailable, type StoredProject } from './storage'
import type { ProjectFile } from './projectFile'
import { designHash, loadTrace, recordIteration, traceForFile, useTrace } from '../trace/trace'
import { restoreImports, serializeImports } from '../import/store'

const projectFile = () => import('./projectFile')

interface ProjectMeta {
  /** Name of the open project (null = untitled). */
  name: string | null
  /** Last autosave time (ISO), or null before the first save. */
  autosavedAt: string | null
  storage: 'unknown' | 'ok' | 'unavailable'
  /** Last message for the project menu (plain words). */
  message: { tone: 'ok' | 'warn' | 'error'; text: string; details?: string[] } | null
  saved: Omit<StoredProject, 'text'>[]
}
export const useProjectMeta = create<ProjectMeta>(() => ({ name: null, autosavedAt: null, storage: 'unknown', message: null, saved: [] }))
const say = (tone: 'ok' | 'warn' | 'error', text: string, details?: string[]) => {
  useProjectMeta.setState({ message: { tone, text, details } })
  useStore.setState({ announce: text })
}

/** Community packages the design switches on, so a shared file opens complete elsewhere. */
function communityFor(d: Design): ProjectFile['communityNodes'] {
  const c = useCommunityStore.getState()
  const packages = c.packages.filter((p) => d.enabled[p.id])
  return { packages, params: Object.fromEntries(packages.filter((p) => c.params[p.id] && Object.keys(c.params[p.id]).length).map((p) => [p.id, c.params[p.id]])) }
}

/** The open project as file text. Meshes of imported towers go into exports and saved projects, not the autosave. */
export async function currentText(withMeshes = true): Promise<string> {
  const { exportProject, importedMeshIds } = await projectFile()
  const d = pickDesign(useStore.getState())
  return exportProject(d, communityFor(d), traceForFile(), withMeshes ? serializeImports(importedMeshIds(d)) : undefined)
}

/** Add community packages a file brings that this browser doesn't have; each is re-validated first. */
async function mergeCommunity(c: ProjectFile['communityNodes']): Promise<string[]> {
  if (!c?.packages.length) return []
  const have = new Set(useCommunityStore.getState().packages.map((p) => p.id))
  const missing = c.packages.filter((p) => p && typeof p === 'object' && !have.has((p as NodePackage).id))
  if (!missing.length) return []
  const { validatePackage } = await import('../nodeValidate')
  const added: NodePackage[] = [], notes: string[] = []
  for (const p of missing) {
    const r = validatePackage(p)
    if (r.ok && r.pkg) added.push(r.pkg)
    else notes.push(`Left out the community node "${(p as NodePackage).name ?? (p as NodePackage).id ?? '?'}": it doesn't pass the node check.`)
  }
  if (added.length) {
    useCommunityStore.setState((s) => ({
      packages: [...s.packages, ...added],
      params: { ...s.params, ...Object.fromEntries(added.filter((p) => c.params?.[p.id]).map((p) => [p.id, c.params[p.id]])) },
    }))
    notes.push(`Added ${added.length} community node${added.length > 1 ? 's' : ''} to My nodes: ${added.map((p) => p.name).join(', ')} (unverified until reviewed).`)
  }
  return notes
}

/** Read a project file's text and, if it checks out, open it as one undo step. */
export async function openText(text: string, name: string | null): Promise<boolean> {
  const { readProject, toDesign } = await projectFile()
  const r = readProject(text)
  if (!r.ok || !r.file) { say('error', `Couldn't open ${name ? `"${name}"` : 'the file'}.`, r.problems); return false }
  if (r.file.importedMeshes) restoreImports(r.file.importedMeshes)
  breakStep()
  applyDesign(toDesign(r.file))
  breakStep()
  const notes = [...r.notes, ...(await mergeCommunity(r.file.communityNodes))]
  loadTrace(r.file.trace)
  const last = useTrace.getState().iterations.at(-1)
  if (!last || last.hash !== designHash(pickDesign(useStore.getState()))) recordIteration(`Opened “${name ?? 'project'}”`, 'opened')
  useProjectMeta.setState({ name })
  say('ok', `Opened ${name ? `"${name}"` : 'the project'}. Ctrl+Z goes back to the previous design.`, notes.length ? notes : undefined)
  return true
}

export function newProject() {
  breakStep()
  applyDesign(defaultDesign())
  breakStep()
  loadTrace(undefined)
  recordIteration('New project', 'new')
  useProjectMeta.setState({ name: null })
  say('ok', 'New project with the default towers. Ctrl+Z goes back to the previous design.')
}

export async function openStored(key: string) {
  const rec = await getProject(key)
  if (!rec) { say('error', "That project isn't in this browser any more."); return }
  await openText(rec.text, rec.name)
}

export async function saveAs(name: string) {
  const clean = name.trim().slice(0, 80) || 'Untitled project'
  recordIteration(`Saved as “${clean}”`, 'saved')
  const ok = await putProject({ key: `project:${Date.now().toString(36)}`, name: clean, savedAt: new Date().toISOString(), text: await currentText() })
  if (!ok) { say('error', "This browser won't store projects (private window or blocked site data). Use Export to keep a copy."); return }
  useProjectMeta.setState({ name: clean })
  await refreshList()
  say('ok', `Saved "${clean}" in this browser.`)
}

export async function removeStored(key: string) {
  await deleteProject(key)
  await refreshList()
}

export async function refreshList() {
  useProjectMeta.setState({ saved: await listProjects() })
}

export const exportName = () => `${(useProjectMeta.getState().name ?? 'tower-studio-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tower-studio-project'}.json`

// --- Autosave -----------------------------------------------------------------------------------------------------

let restored = false
let restoring: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const AUTOSAVE_MS = 800

async function autosaveNow() {
  const ok = await putProject({ key: AUTOSAVE_KEY, name: useProjectMeta.getState().name ?? 'Untitled project', savedAt: new Date().toISOString(), text: await currentText(false) })
  useProjectMeta.setState(ok ? { autosavedAt: new Date().toISOString(), storage: 'ok' } : { storage: 'unavailable' })
}

/** Restore the last autosave once per page load (not per mount: React may mount twice in development). */
function restoreOnce(): Promise<void> {
  restoring ??= (async () => {
    try {
      const available = await storageAvailable()
      useProjectMeta.setState({ storage: available ? 'ok' : 'unavailable' })
      const rec = available ? await getProject(AUTOSAVE_KEY) : null
      if (rec) {
        const { readProject, toDesign } = await projectFile()
        const r = readProject(rec.text)
        if (r.ok && r.file) {
          if (r.file.importedMeshes) restoreImports(r.file.importedMeshes)
          applyDesign(toDesign(r.file))
          loadTrace(r.file.trace)
          useProjectMeta.setState({ name: rec.name === 'Untitled project' ? null : rec.name, autosavedAt: rec.savedAt })
          if (r.file.communityNodes) await mergeCommunity(r.file.communityNodes)
        } else {
          say('warn', "The last autosave couldn't be restored, so the default design is open.", r.problems)
        }
      }
      if (available) await refreshList()
    } catch {
      useProjectMeta.setState({ storage: 'unavailable' })
    } finally {
      restored = true
      resetHistory() // the first undo shouldn't jump back to the defaults
    }
  })()
  return restoring
}

/** Resolves once the last autosave has been restored (starting the restore if no page has yet). */
export const whenRestored = () => restoreOnce()

/**
 * Restore the last autosave, then keep saving the design shortly after each change. Returns a stop function.
 * Nothing is written before the restore finishes, so a slow restore can't overwrite the saved work with defaults.
 */
export function startPersistence(): () => void {
  let stopped = false
  let pending = false
  let lastDesign = pickDesign(useStore.getState())
  const schedule = () => {
    if (!restored) return
    clearTimeout(timer)
    pending = true
    timer = setTimeout(() => { pending = false; if (!stopped) void autosaveNow() }, AUTOSAVE_MS)
  }
  const unsub = useStore.subscribe((s) => {
    const d = pickDesign(s)
    if ((Object.keys(d) as (keyof Design)[]).every((k) => d[k] === lastDesign[k])) return
    lastDesign = d
    schedule()
  })
  // A recorded decision changes no design input, but it must be kept too.
  const unsubTrace = useTrace.subscribe((t, prev) => { if (t.iterations !== prev.iterations || t.decisions !== prev.decisions || t.reviews !== prev.reviews) schedule() })
  void restoreOnce().then(() => { lastDesign = pickDesign(useStore.getState()) })
  // Leaving the page (guided app ↔ Customize ↔ Options) saves a change made just before, rather than dropping it.
  return () => { stopped = true; unsub(); unsubTrace(); clearTimeout(timer); if (pending) void autosaveNow() }
}
