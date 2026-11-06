// Where the competition context comes from. Buildner's base model is never published, so the live website has no copy:
// each entrant adds the "Vancouver Tall Base Model.3dm" they downloaded with the brief, it is read in their browser
// (lib/vtcContextBuild.ts) and kept in this browser's own storage (IndexedDB) on their computer. Nothing is uploaded.
// On a developer's computer, public/local/vtc_context.json (tools/build_vtc_context.py, git-ignored) is used first.
// Every reader of the context (context.ts, useSolarAccess, vtcNeighbours, vtcShadeContext) follows this store, so adding
// or removing the model updates the view and the checks at once.

import { create } from 'zustand'
import type { VtcContext } from '../context'
import { SITE } from '../engine/vtcRules'

export type VtcStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'reading' | 'error'

interface VtcSourceState {
  ctx: VtcContext | null
  status: VtcStatus
  /** 'dev-file': public/local on this computer; 'browser': the entrant's own copy, kept in this browser. */
  source: 'dev-file' | 'browser' | null
  /** Bumped on every change of `ctx`, for caches keyed by the context (the solar worker). */
  version: number
  fileName: string
  addedAt: string
  /** Why the last file was refused, or a note that this browser could not keep it. */
  error: string
}

export const useVtcSource = create<VtcSourceState>(() => ({ ctx: null, status: 'idle', source: null, version: 0, fileName: '', addedAt: '', error: '' }))

/**
 * The competition block from the brief (p.15: 144.8 x 79.2 m), centred on the model origin like the containment rule
 * (engine/vtcRules SITE, lib/siteGeometry VTC_SITE). Drawn as the site when no base model is loaded, so the design and
 * its checks still have a site to sit on. Not from Buildner's model file.
 */
export const BRIEF_SITE: NonNullable<VtcContext['site']> = (() => {
  const w = SITE.width / 2, d = SITE.depth / 2
  return { outline: [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]], width_m: SITE.width, depth_m: SITE.depth, area_m2: SITE.area }
})()

/** The base model's file name in the competition download, used to route a dropped copy here instead of the massing import. */
export const BASE_MODEL_NAME = /vancouver\s*tall.*base\s*model.*\.3dm$/i

// ---------------------------------------------------------------- IndexedDB (this browser, this computer)
const DB = 'tower-studio-local', STORE = 'vtc', KEY = 'base-model'
/** Bump when vtcContextBuild changes its output: a saved context is then rebuilt from the saved file. */
const BUILD_VERSION = 1

interface Saved { buildVersion: number; ctx: VtcContext; bytes: ArrayBuffer; fileName: string; addedAt: string }

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    } catch (e) { rej(e) }
  })
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const d = await db()
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const tx = d.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => res(req ? (req.result as T) : undefined)
      tx.onerror = () => rej(tx.error)
      tx.onabort = () => rej(tx.error)
    })
  } finally { d.close() }
}
const readSaved = () => idb<Saved>('readonly', (s) => s.get(KEY)).catch(() => undefined)

// ---------------------------------------------------------------- loading
let loading: Promise<VtcContext | null> | null = null

const looksLikeContext = (j: unknown): j is VtcContext => !!j && typeof j === 'object' && Array.isArray((j as VtcContext).buildings) && 'site' in (j as object)

/** public/local/vtc_context.json when this computer has it (a dev server; never on the published site). */
async function devFile(): Promise<VtcContext | null> {
  try {
    const r = await fetch('./local/vtc_context.json')
    if (!r.ok) return null
    // A dev server may answer a missing file with the app's index.html: only real context JSON counts.
    const j: unknown = await r.json()
    return looksLikeContext(j) ? j : null
  } catch { return null }
}

/** Reads the model's bytes into a context (rhino3dm and the builder load only now). */
async function build(bytes: Uint8Array): Promise<VtcContext> {
  const [{ loadRhino3dm }, { buildVtcContext }] = await Promise.all([import('./import/load'), import('./vtcContextBuild')])
  const rh = await loadRhino3dm()
  return buildVtcContext(rh, bytes)
}

const set = (p: Partial<VtcSourceState>, changed = true) => useVtcSource.setState((s) => ({ ...p, ...(changed ? { version: s.version + 1 } : {}) }))

/** The competition context, loaded once: the dev file, else this browser's saved copy, else null ("missing"). */
export function loadVtcContext(): Promise<VtcContext | null> {
  return (loading ??= (async () => {
    if (useVtcSource.getState().status === 'idle') set({ status: 'loading' }, false)
    const dev = await devFile()
    if (dev) { set({ ctx: dev, status: 'ready', source: 'dev-file', fileName: 'public/local/vtc_context.json', addedAt: '', error: '' }); return dev }
    const saved = await readSaved()
    if (saved?.ctx) {
      let ctx = saved.ctx
      if (saved.buildVersion !== BUILD_VERSION && saved.bytes) {
        try { ctx = await build(new Uint8Array(saved.bytes)); await idb('readwrite', (s) => { s.put({ ...saved, ctx, buildVersion: BUILD_VERSION }, KEY) }).catch(() => undefined) } catch { /* keep the saved context */ }
      }
      set({ ctx, status: 'ready', source: 'browser', fileName: saved.fileName, addedAt: saved.addedAt, error: '' })
      return ctx
    }
    set({ status: 'missing' }, false)
    return null
  })())
}

/** Reads the entrant's copy of the base model, keeps it in this browser and shows it. Resolves false when refused. */
export async function addVtcModel(file: File): Promise<boolean> {
  const before = useVtcSource.getState()
  set({ status: 'reading', error: '' }, false)
  // Let the "Reading" state paint before rhino3dm takes the main thread.
  await new Promise((r) => setTimeout(r, 30))
  try {
    if (!/\.3dm$/i.test(file.name)) throw new Error(`"${file.name}" is not a Rhino file. Add "Vancouver Tall Base Model.3dm" from the competition download.`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!new TextDecoder().decode(bytes.slice(0, 32)).startsWith('3D Geometry File Format')) throw new Error(`"${file.name}" could not be read as a Rhino .3dm file.`)
    const ctx = await build(bytes)
    const addedAt = new Date().toISOString()
    let kept = true
    try { await idb('readwrite', (s) => { s.put({ buildVersion: BUILD_VERSION, ctx, bytes: bytes.buffer, fileName: file.name, addedAt } satisfies Saved, KEY) }) } catch { kept = false }
    loading = Promise.resolve(ctx)
    set({ ctx, status: 'ready', source: 'browser', fileName: file.name, addedAt, error: kept ? '' : 'Shown for this visit only: this browser would not keep it (a private window, or site storage is blocked). Add it again next time.' })
    return true
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    set({ status: before.ctx ? 'ready' : 'error', error: msg }, false)
    return false
  }
}

/** Forgets the copy kept in this browser (the dev file, if any, stays: it is not this browser's to remove). */
export async function removeVtcModel(): Promise<void> {
  await idb('readwrite', (s) => { s.delete(KEY) }).catch(() => undefined)
  if (useVtcSource.getState().source !== 'browser') return
  loading = Promise.resolve(null)
  set({ ctx: null, status: 'missing', source: null, fileName: '', addedAt: '', error: '' })
}
