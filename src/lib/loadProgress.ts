// How much of the map is loaded (Ruijie, 7 Nov: "when the map on the Real Vancouver context is still loading, indicate
// that it is still loading … a progress bar showing how much it is loaded"). Every data file the map fetches goes through
// `trackedFetch`, which reads the download as it streams and counts its bytes against the file's size from the data
// manifest (public/data/layers.json `bytes`, the uncompressed size, which is what the browser hands over after any
// compression); textures and other loads without a byte count go through `trackJob` and count as one step each. The bar
// (components/LoadingBar.tsx) shows the batch: everything started since it last emptied, until all of it is done.
import { create } from 'zustand'

export interface LoadJob { label: string; loaded: number; total: number; done: boolean; failed: boolean }
interface LoadState { jobs: Record<number, LoadJob> }
export const useLoadProgress = create<LoadState>(() => ({ jobs: {} }))

let seq = 0
let settleTimer: ReturnType<typeof setTimeout> | undefined
const start = (label: string, total: number) => { clearTimeout(settleTimer); const id = ++seq; useLoadProgress.setState((s) => ({ jobs: { ...s.jobs, [id]: { label, loaded: 0, total, done: false, failed: false } } })); return id }
const update = (id: number, patch: Partial<LoadJob>) => useLoadProgress.setState((s) => (s.jobs[id] ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], ...patch } } } : s))
/**
 * Once every job of a batch is done and nothing new has started for a moment, the batch is cleared. The map loads in
 * stages (the terrain and footprints, then the detailed buildings, streets and ground); waiting keeps them one climb on
 * the bar instead of several restarts from 0%.
 */
function settle() {
  clearTimeout(settleTimer)
  const jobs = Object.values(useLoadProgress.getState().jobs)
  if (jobs.length && jobs.every((j) => j.done)) settleTimer = setTimeout(() => { if (Object.values(useLoadProgress.getState().jobs).every((j) => j.done)) useLoadProgress.setState({ jobs: {} }) }, 2500)
}

/** A fetch whose download is counted. `expectedBytes`: the file's (uncompressed) size, when known. */
export async function trackedFetch(url: string, label: string, expectedBytes?: number): Promise<Response> {
  const id = start(label, expectedBytes ?? 0)
  try {
    const r = await fetch(url)
    const len = Number(r.headers.get('content-length')) || 0
    const total = expectedBytes || (r.headers.get('content-encoding') ? 0 : len)
    if (!r.ok || !r.body) { update(id, { done: true, failed: !r.ok, loaded: total, total }); settle(); return r }
    update(id, { total })
    const reader = r.body.getReader(), parts: Uint8Array[] = []
    let loaded = 0, last = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value); loaded += value.byteLength
      if (loaded - last > 65536) { last = loaded; update(id, { loaded }) }
    }
    update(id, { loaded, total: Math.max(total, loaded), done: true }); settle()
    return new Response(new Blob(parts as BlobPart[]), { status: r.status, statusText: r.statusText, headers: r.headers })
  } catch (e) {
    update(id, { done: true, failed: true }); settle()
    throw e
  }
}

/** Any other load (a texture, a decode): one step of the batch, done when the promise settles. */
export function trackJob<T>(label: string, p: Promise<T>): Promise<T> {
  const id = start(label, 0)
  p.then(() => { update(id, { done: true }); settle() }, () => { update(id, { done: true, failed: true }); settle() })
  return p
}

/** The batch as a share: bytes where they are known, and each byte-less job as an equal step. */
export function progressOf(jobs: LoadJob[]): { share: number; label: string | null; done: boolean } {
  if (!jobs.length) return { share: 1, label: null, done: true }
  const sized = jobs.filter((j) => j.total > 0), counted = jobs.filter((j) => j.total <= 0)
  const bytesTotal = sized.reduce((s, j) => s + j.total, 0), bytesIn = sized.reduce((s, j) => s + Math.min(j.loaded, j.total), 0)
  // a byte-less job weighs as much as an average sized one (or 1 when there are none)
  const unit = sized.length ? bytesTotal / sized.length : 1
  const total = bytesTotal + counted.length * unit, got = bytesIn + counted.filter((j) => j.done).length * unit
  const pending = jobs.find((j) => !j.done)
  return { share: total ? Math.min(1, got / total) : 1, label: pending?.label ?? null, done: jobs.every((j) => j.done) }
}

// ---------- the map's data files, sized from the manifest (public/data/layers.json) ----------
const SIZES = new Map<string, { bytes: number; title: string }>()
/** Remembers each data file's size and title, so its download can be counted (called when layers.json arrives). */
export function noteManifest(layers: { id?: string; file?: string; bytes?: number; title?: string }[]) {
  for (const l of layers) if (l.file) SIZES.set(l.file, { bytes: l.bytes ?? 0, title: friendly(l.id ?? '') ?? l.title ?? l.file })
}
/** What a layer is, in the words a visitor would use (the manifest's titles are for the sources page). */
function friendly(id: string): string | null {
  const words: [RegExp, string][] = [[/^terrain_ground/, 'Ground detail'], [/^terrain/, 'Terrain'], [/^footprint/, 'Buildings'], [/^building_forms/, 'Building forms'],
    [/^vista_buildings/, 'Buildings'], [/^vista_streets|^city_streets/, 'Streets'], [/^vista_labels/, 'Place names'], [/^parcels/, 'Lots'], [/^parks|^osm_green/, 'Parks'],
    [/^water|^shoreline/, 'Water'], [/^trees/, 'Trees'], [/^traffic/, 'Traffic'], [/^zoning/, 'Zoning'], [/^heritage/, 'Heritage'], [/^trails/, 'Trails']]
  return words.find(([re]) => re.test(id))?.[1] ?? null
}
/** A data file (public/data/<file>), its download counted against its manifest size. */
export function dataFetch(file: string, label?: string): Promise<Response> {
  const s = SIZES.get(file)
  return trackedFetch(`./data/${file}`, label ?? (s ? s.title.charAt(0).toLowerCase() + s.title.slice(1) : file), s?.bytes || undefined)
}
