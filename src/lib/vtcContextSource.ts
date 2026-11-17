// Where the competition context comes from, in this order:
//   1. your own model, read in this browser and kept in its own storage (IndexedDB; nothing is uploaded): a copy of
//      Buildner's "Vancouver Tall Base Model.3dm" (lib/vtcContextBuild.ts), or since 17 Nov any other 3DM, OBJ, glTF or
//      IFC model (lib/vtcContextAny.ts; Ruijie: "let users upload any model of their own", no block required). You chose
//      it, so it comes first, also on a developer's computer;
//   2. public/local/vtc_context.json on a developer's computer (tools/build_vtc_context.py, git-ignored; never on the
//      published site);
//   3. the included context, public/context/vtc/context.json: the same derived outlines, heights and simplified meshes,
//      shipped with the app so the competition site opens with its context without a download (Ruijie, 13 Nov). The
//      brief (p.36) gives the materials "for the sole purpose of an academic exercise", to be used "at the participant's
//      discretion", and Buildner's terms restrict only the paid template package; the model itself is not shipped.
// Every reader of the context (context.ts, useSolarAccess, vtcNeighbours, vtcShadeContext) follows this store, so adding
// or removing the model updates the view and the checks at once.

import { create } from 'zustand'
import type { VtcContext } from '../context'
import { SITE } from '../engine/vtcRules'

export type VtcStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'reading' | 'error'

interface VtcSourceState {
  ctx: VtcContext | null
  status: VtcStatus
  /** 'dev-file': public/local on this computer; 'browser': the entrant's own copy, kept in this browser; 'included':
   *  the context shipped with the app. */
  source: 'dev-file' | 'browser' | 'included' | null
  /** Bumped on every change of `ctx`, for caches keyed by the context (the solar worker). */
  version: number
  fileName: string
  addedAt: string
  /** Why the last file was refused, or a note that this browser could not keep it. */
  error: string
  /** For source 'browser': 'base' = a copy of Buildner's base model (its own reader); 'model' = any other model, read by
   *  lib/vtcContextAny.ts (Ruijie, 17 Nov). */
  own: 'base' | 'model' | null
  /** What was assumed while reading your own model (units, up axis, where it was placed, the site line). */
  notes: string[]
}

export const useVtcSource = create<VtcSourceState>(() => ({ ctx: null, status: 'idle', source: null, version: 0, fileName: '', addedAt: '', error: '', own: null, notes: [] }))

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
/** Bump when vtcContextBuild changes its output: a saved context is then rebuilt from the saved file. 2: ground uses. */
const BUILD_VERSION = 2

interface Saved { buildVersion: number; ctx: VtcContext; bytes: ArrayBuffer; fileName: string; addedAt: string; kind?: 'base' | 'model'; notes?: string[] }

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
  // The published site (vite --mode pages) never has the file: don't ask, so its console shows no 404 on every visit.
  if (import.meta.env.MODE === 'pages') return null
  try {
    const r = await fetch('./local/vtc_context.json')
    if (!r.ok) return null
    // A dev server may answer a missing file with the app's index.html: only real context JSON counts.
    const j: unknown = await r.json()
    return looksLikeContext(j) ? j : null
  } catch { return null }
}

/** The context shipped with the app (public/context/vtc/context.json); null when the file is missing or malformed. */
export const INCLUDED_FILE = './context/vtc/context.json'
async function includedFile(): Promise<VtcContext | null> {
  try {
    const r = await fetch(INCLUDED_FILE)
    if (!r.ok) return null
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

/** The context without your own model: the developer's file on this computer, else the one included with the app. */
async function fallback(): Promise<{ ctx: VtcContext; source: 'dev-file' | 'included'; fileName: string } | null> {
  const dev = await devFile()
  if (dev) return { ctx: dev, source: 'dev-file', fileName: 'public/local/vtc_context.json' }
  const included = await includedFile()
  return included ? { ctx: included, source: 'included', fileName: INCLUDED_FILE } : null
}

/**
 * The competition context, loaded once: your own model kept in this browser first (you chose it), else the developer's
 * file, else the included one, else null ("missing").
 */
export function loadVtcContext(): Promise<VtcContext | null> {
  return (loading ??= (async () => {
    if (useVtcSource.getState().status === 'idle') set({ status: 'loading' }, false)
    const saved = await readSaved()
    if (saved?.ctx) {
      let ctx = saved.ctx
      // Only the base model has a reader that changes with BUILD_VERSION; any other model keeps what was read.
      if (saved.kind !== 'model' && saved.buildVersion !== BUILD_VERSION && saved.bytes) {
        try { ctx = await build(new Uint8Array(saved.bytes)); await idb('readwrite', (s) => { s.put({ ...saved, ctx, buildVersion: BUILD_VERSION }, KEY) }).catch(() => undefined) } catch { /* keep the saved context */ }
      }
      set({ ctx, status: 'ready', source: 'browser', fileName: saved.fileName, addedAt: saved.addedAt, error: '', own: saved.kind ?? 'base', notes: saved.notes ?? [] })
      return ctx
    }
    const f = await fallback()
    if (f) { set({ ...f, status: 'ready', addedAt: '', error: '', own: null, notes: [] }); return f.ctx }
    set({ status: 'missing' }, false)
    return null
  })())
}

/** Model files the context accepts: the base model, or any model the massing import reads. */
export const CONTEXT_ACCEPT = '.3dm,.obj,.glb,.gltf,.ifc'

/** True when the bytes are a Rhino file. */
const isRhino = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 32)).startsWith('3D Geometry File Format')

/**
 * Reads a model as the competition context (Ruijie, 17 Nov: any model, no block required): Buildner's base model through
 * its own reader, every other Rhino, OBJ, glTF or IFC file through lib/vtcContextAny.ts. Kept in this browser and shown
 * in place of the included context. Resolves false when the file cannot be read.
 */
export async function addVtcModel(file: File): Promise<boolean> {
  const before = useVtcSource.getState()
  set({ status: 'reading', error: '' }, false)
  // Let the "Reading" state paint before rhino3dm takes the main thread.
  await new Promise((r) => setTimeout(r, 30))
  try {
    if (!/\.(3dm|obj|glb|gltf|ifc)$/i.test(file.name)) throw new Error(`"${file.name}" is not a model this app reads. Use a 3DM, OBJ, glTF / GLB or IFC file.`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    let ctx: VtcContext | null = null, kind: 'base' | 'model' = 'base', notes: string[] = []
    if (isRhino(bytes)) {
      try { ctx = await build(bytes) } catch (e) {
        const { NotTheBaseModel } = await import('./vtcContextBuild')
        if (!(e instanceof NotTheBaseModel)) throw e
      }
    }
    if (!ctx) {
      const [{ readModelFile }, { contextFromRaw }] = await Promise.all([import('./import/load'), import('./vtcContextAny')])
      const read = contextFromRaw(await readModelFile(file))
      ctx = read.ctx; notes = read.notes; kind = 'model'
    }
    return await keepOwn(ctx, { fileName: file.name, kind, notes, bytes })
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    set({ status: before.ctx ? 'ready' : 'error', error: msg }, false)
    return false
  }
}

/**
 * Shows a context read elsewhere (the import dialog's "Use as the context", from a file it has already read) and keeps
 * it in this browser like an added file.
 */
export async function keepOwn(ctx: VtcContext, o: { fileName: string; kind: 'base' | 'model'; notes: string[]; bytes?: Uint8Array }): Promise<boolean> {
  const addedAt = new Date().toISOString()
  let kept = true
  // The base model's bytes are kept so a newer reader can rebuild it; any other model keeps only what was read.
  const bytes = o.kind === 'base' && o.bytes ? o.bytes.buffer as ArrayBuffer : new ArrayBuffer(0)
  try { await idb('readwrite', (s) => { s.put({ buildVersion: BUILD_VERSION, ctx, bytes, fileName: o.fileName, addedAt, kind: o.kind, notes: o.notes } satisfies Saved, KEY) }) } catch { kept = false }
  loading = Promise.resolve(ctx)
  set({ ctx, status: 'ready', source: 'browser', fileName: o.fileName, addedAt, own: o.kind, notes: o.notes, error: kept ? '' : 'Shown for this visit only: this browser would not keep it (a private window, or site storage is blocked). Add it again next time.' })
  return true
}

/** Forgets your own model kept in this browser and goes back to the competition model (the developer's file, else the
 *  included context). */
export async function removeVtcModel(): Promise<void> {
  await idb('readwrite', (s) => { s.delete(KEY) }).catch(() => undefined)
  if (useVtcSource.getState().source !== 'browser') return
  const f = await fallback()
  loading = Promise.resolve(f?.ctx ?? null)
  if (f) set({ ...f, status: 'ready', addedAt: '', error: '', own: null, notes: [] })
  else set({ ctx: null, status: 'missing', source: null, fileName: '', addedAt: '', error: '', own: null, notes: [] })
}
