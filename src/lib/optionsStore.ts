// Saving and reading design options in the node builder's project store (IndexedDB, lib/project/storage.ts) and
// format (lib/project/projectFile.ts): one project file per option, under an "option:" key, whose trace holds the
// single iteration that snapshots the design and its results at save time. No second store.
import { create } from 'zustand'
import { useStore } from '../store'
import { pickDesign } from './project/design'
import { deleteProject, getProject, listProjects, putProject } from './project/storage'
import { whenRestored } from './project/session'
import { designHash, recordIteration, useTrace, type Iteration } from './trace/trace'
import { MAX_OPTIONS, OPTION_PREFIX, type OptionRecord } from './options'

interface OptionsState { options: OptionRecord[]; loaded: boolean; error: string }
export const useOptions = create<OptionsState>(() => ({ options: [], loaded: false, error: '' }))

export async function refreshOptions() {
  try {
    const { readProject, toDesign } = await import('./project/projectFile')
    const keys = await listProjects(OPTION_PREFIX)
    const out: OptionRecord[] = []
    for (const k of keys) {
      const p = await getProject(k.key)
      if (!p) continue
      const r = readProject(p.text)
      const it = r.file?.trace?.iterations?.[0]
      if (!r.ok || !r.file || !it) continue
      out.push({ key: p.key, name: p.name, savedAt: p.savedAt, design: toDesign(r.file), digest: it.digest })
    }
    useOptions.setState({ options: out.sort((a, b) => a.savedAt.localeCompare(b.savedAt)), loaded: true, error: '' })
  } catch (e) {
    useOptions.setState({ loaded: true, error: (e as Error).message })
  }
}

/** Is the live results digest the current design's? (It is kept fresh by the trace recorder.) */
export function liveDigestReady(): boolean {
  const live = useTrace.getState().live
  return !!live && live.hash === designHash(pickDesign(useStore.getState()))
}

/** Save the current design and its results as a named option. */
export async function saveOption(name: string): Promise<{ ok: boolean; reason?: string }> {
  const clean = name.trim().slice(0, 60)
  if (!clean) return { ok: false, reason: 'Give the option a name.' }
  if (useOptions.getState().options.length >= MAX_OPTIONS) return { ok: false, reason: `Up to ${MAX_OPTIONS} options: delete one first.` }
  const live = useTrace.getState().live
  const design = pickDesign(useStore.getState())
  if (!live || live.hash !== designHash(design)) return { ok: false, reason: 'The checks are still running for this design: wait a second and try again.' }
  const { exportProject } = await import('./project/projectFile')
  const at = new Date().toISOString()
  // Sources stay out of stored snapshots, as in the decision trace, so files stay lean.
  const it: Iteration = { id: `opt${Date.now().toString(36)}`, at, label: `Option: ${clean}`, kind: 'saved', hash: live.hash, design, digest: { metrics: live.digest.metrics, lines: live.digest.lines.map(({ source: _s, ...l }) => l) } }
  const text = exportProject(design, undefined, { iterations: [it], decisions: [] })
  const ok = await putProject({ key: `${OPTION_PREFIX}${Date.now().toString(36)}`, name: clean, savedAt: at, text })
  if (!ok) return { ok: false, reason: 'Browser storage is unavailable here (private window?).' }
  // As saving a project does: the trace then holds each option's state, so "explain the difference" can use it.
  recordIteration(`Saved option "${clean}"`, 'saved')
  await refreshOptions()
  return { ok: true }
}

export async function deleteOption(key: string) {
  await deleteProject(key)
  await refreshOptions()
}

/**
 * Bring an option's design back into the app as one undo step. Only the design is applied: unlike opening a project
 * file, this keeps the current decision trace (the option's own snapshot would replace it), and records the switch.
 */
export async function openOption(o: OptionRecord): Promise<void> {
  await whenRestored() // else the guided app's restore of the autosave would replace the option
  const { breakStep } = await import('./project/history')
  const { applyDesign } = await import('./project/design')
  breakStep()
  applyDesign(o.design, `Option "${o.name}" opened`)
  breakStep()
  recordIteration(`Opened option "${o.name}"`, 'opened')
  useStore.setState({ showOnboarding: false, announce: `Option "${o.name}" opened` })
}
