// Live link to a Rhino file: in browsers with the File System Access API (Chrome, Edge), the person picks the .3dm once
// and the upload re-reads it whenever it is saved again, then updates the uploaded model in place with the same layer
// mapping, units, north, datum and placement. A plugin-free stand-in for a live Rhino link: the file stays on this
// computer, nothing is uploaded, and the link lasts while this tab is open.
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../../context'
import { CITY_ORIGIN, useStore } from '../../store'
import type { ImportOptions, ProjectFrame } from '../import/pipeline'
import type { LoadedImport } from '../import/load'
import { applyModel } from './apply'
import { buildModel } from './build'
import { autoMapping } from './mapping'
import { ringMetrics } from '../../engine/site'
import type { Mapping } from './model'

/** How often a linked file is checked while the tab is open (ms). */
export const POLL_MS = 2000

/** The part of a FileSystemFileHandle the link uses (so tests can pass a stand-in); `kind: 'rhino'` is the Rhino plugin (rhinoLink.ts). */
export interface FileHandleLike { name: string; getFile(): Promise<File>; kind?: 'file' | 'rhino' }
export interface LinkConfig { mapping: Mapping; opts: ImportOptions; project: 'vtc' | 'city' }

interface LiveState {
  name: string | null
  status: 'off' | 'watching' | 'reading' | 'error'
  /** Time of the last update from the file (ISO), and what it said. */
  lastSync: string | null
  message: string | null
}
export const useLiveLink = create<LiveState>(() => ({ name: null, status: 'off', lastSync: null, message: null }))

/** Where "centre on the site" puts a model: the competition block, the study site's centre, else the selected tower. */
export function siteCentreOf(s = useStore.getState()): [number, number] {
  if (s.project === 'vtc') return [0, 0]
  if (s.citySite && s.citySite.ring.length >= 3) return ringMetrics(s.citySite.ring).centre
  const sel = s.towers[s.project].find((t) => t.id === s.selectedTower) ?? s.towers[s.project][0]
  return [sel?.x ?? 0, sel?.y ?? 0]
}

/** The project frame an upload is placed in (north, site centre, ground, map origin), as the upload dialog uses it. */
export function projectFrame(s = useStore.getState()): ProjectFrame {
  return {
    project: s.project, northDeg: s.project === 'vtc' ? VTC_NORTH_DEG : 0,
    siteCentre: siteCentreOf(s),
    groundElevation: s.groundElevation, utmOrigin: s.project === 'city' ? CITY_ORIGIN : null,
  }
}

export const canLink = () => typeof window !== 'undefined' && 'showOpenFilePicker' in window

/** Asks the browser for a file to link (Chromium only). Null when the person cancels or the browser cannot. */
export async function pickLinkedFile(): Promise<{ handle: FileHandleLike; file: File } | null> {
  if (!canLink()) return null
  try {
    const picker = (window as unknown as { showOpenFilePicker: (o: unknown) => Promise<FileHandleLike[]> }).showOpenFilePicker
    const [handle] = await picker({ multiple: false, types: [{ description: 'Rhino and other 3D models', accept: { 'application/octet-stream': ['.3dm', '.obj', '.glb', '.gltf', '.ifc'] } }] })
    return handle ? { handle, file: await handle.getFile() } : null
  } catch { return null }
}

type Reader = (f: File) => Promise<LoadedImport>
let link: { handle: FileHandleLike; cfg: LinkConfig; last: number; timer: ReturnType<typeof setInterval> | null; read: Reader; busy: boolean } | null = null

const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void checkLinkNow() }

/** Starts watching a file just uploaded (its `file` is the version already applied). `poll: false` for tests. */
export function startLink(handle: FileHandleLike, cfg: LinkConfig, file: File, o: { read?: Reader; poll?: boolean } = {}) {
  stopLink()
  const read: Reader = o.read ?? (async (f) => (await import('../import/load')).readModelFile(f))
  link = { handle, cfg, last: file.lastModified, read, busy: false, timer: o.poll === false ? null : setInterval(() => void checkLinkNow(), POLL_MS) }
  if (o.poll !== false && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  useLiveLink.setState({ name: handle.name, status: 'watching', message: handle.kind === 'rhino' ? 'Linked to Rhino: the model updates a second or two after each change you make there.' : `Linked to ${handle.name}: the model updates when you save it in Rhino.`, lastSync: null })
}

/** The project the link updates, or null when nothing is linked. */
export const linkProject = () => link?.cfg.project ?? null

/**
 * Changes how the link places the model from its next update on (the place step after an upload: the model moved and
 * turned on the site becomes an anchor placement, so Rhino's next change keeps it there).
 */
export function setLinkPlacement(patch: Partial<ImportOptions>) {
  if (link) link.cfg = { ...link.cfg, opts: { ...link.cfg.opts, ...patch } }
}

/** The link's placement options (for tests and the place step). */
export const linkOptions = () => link?.cfg.opts ?? null

export function stopLink() {
  if (link?.timer) clearInterval(link.timer)
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  link = null
  useLiveLink.setState({ name: null, status: 'off', message: null })
}

/**
 * Re-reads the linked file if it changed since the last read, and updates the uploaded model with it. Returns what
 * happened. The mapping keeps every row the person set; rows new in this save get a guessed role (team assumption).
 */
export async function checkLinkNow(now = () => new Date()): Promise<'unchanged' | 'updated' | 'stopped' | 'skipped' | 'error'> {
  if (!link || link.busy) return 'skipped'
  const l = link
  let file: File
  try { file = await l.handle.getFile() } catch {
    useLiveLink.setState({ status: 'error', message: l.handle.kind === 'rhino'
      ? 'Rhino stopped answering (the link was stopped, or Rhino closed). Run tdt_link.py in Rhino again; the link picks up again by itself.'
      : `${l.handle.name} can no longer be read (moved, renamed or permission withdrawn). Link it again.` })
    return 'error'
  }
  if (file.lastModified === l.last) {
    // Back after a dropout (Rhino restarted, the file readable again) with nothing new: the link is fine again.
    if (useLiveLink.getState().status === 'error') useLiveLink.setState({ status: 'watching', message: l.handle.kind === 'rhino' ? 'Linked to Rhino again.' : `Linked to ${l.handle.name} again.` })
    return 'unchanged'
  }
  const s = useStore.getState()
  if (s.project !== l.cfg.project) { useLiveLink.setState({ message: `${l.handle.name} changed: switch to the ${l.cfg.project === 'vtc' ? 'competition site' : 'Real Vancouver'} project to update it.` }); return 'skipped' }
  l.busy = true
  useLiveLink.setState({ status: 'reading' })
  try {
    const raw = await l.read(file)
    if (link !== l) return 'stopped'
    const guess = autoMapping(raw, l.cfg.mapping.by, l.cfg.mapping.key)
    const mapping: Mapping = { ...guess, rules: { ...guess.rules, ...Object.fromEntries(Object.keys(guess.rules).filter((k) => l.cfg.mapping.rules[k]).map((k) => [k, l.cfg.mapping.rules[k]])) }, confirmed: l.cfg.mapping.confirmed }
    const sel = s.towers[s.project].find((t) => t.id === s.selectedTower) ?? s.towers[s.project][0]
    const built = buildModel({ raw, mapping, opts: l.cfg.opts, frame: projectFrame(s), bands: sel?.bands ?? [{ use: 'office', share: 1 }], podiumUse: sel?.podiumUse ?? 'retail', takenIds: s.towers[s.project].map((t) => t.id), liftPresets: s.liftPresets, egressPresets: s.egressPresets })
    l.last = file.lastModified
    if (built.blocked) { useLiveLink.setState({ status: 'error', message: `The saved ${l.handle.name} was not used: ${built.blocked}` }); return 'error' }
    applyModel(built, raw, 'update')
    const at = now()
    const time = at.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    useLiveLink.setState({ status: 'watching', lastSync: at.toISOString(), message: l.handle.kind === 'rhino' ? `Updated from Rhino at ${time}.` : `Updated from ${l.handle.name} saved at ${time}.` })
    return 'updated'
  } catch (e) {
    useLiveLink.setState({ status: 'error', message: `Could not read the saved ${l.handle.name}: ${(e as Error).message}` })
    return 'error'
  } finally { l.busy = false; if (link === l && useLiveLink.getState().status === 'reading') useLiveLink.setState({ status: 'watching' }) }
}
