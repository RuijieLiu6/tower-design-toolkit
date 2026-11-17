// The fonts available to the boards: the built-in set (lib/fonts/catalog.ts, files under public/fonts/) and the
// viewer's own ("Your fonts"), kept in this browser's IndexedDB and never sent anywhere. Every face is registered
// with the FontFace API on demand (the composer opening, a font picked, an export), and `loaded` ticks when faces
// arrive so previews and the fit measurement redraw with the real font. A family a saved board names that is in
// neither set (a font added in another browser) falls back to Inter, and `missing()` says which.
import { create } from 'zustand'
import { BUILTIN_FONTS, DEFAULT_FAMILY, isBuiltin } from './catalog'
import { checkFontFile, type FontCheck, type FontFormat } from './fontFile'

export interface UserFont { id: string; family: string; file: string; format: FontFormat; size: number; addedAt: string }
interface FontState { user: UserFont[]; hydrated: boolean; /** Ticks whenever a face finishes loading. */ loaded: number }
export const useFonts = create<FontState>(() => ({ user: [], hydrated: false, loaded: 0 }))

// ---------------------------------------------------------------- IndexedDB
const DB = 'tower-studio-fonts', STORE = 'fonts'
interface Stored { meta: UserFont; bytes: ArrayBuffer }
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
async function idb(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<unknown> {
  const d = await db()
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => res(req ? req.result : undefined)
    tx.onerror = () => rej(tx.error)
  })
}
const bytesCache = new Map<string, ArrayBuffer>()

let hydrating: Promise<void> | null = null
/** Read "Your fonts" from this browser once per page. */
export function hydrateUserFonts(): Promise<void> {
  hydrating ??= (async () => {
    try {
      const all = ((await idb('readonly', (s) => s.getAll())) as Stored[] | undefined) ?? []
      for (const x of all) bytesCache.set(x.meta.id, x.bytes)
      useFonts.setState({ user: all.map((x) => x.meta).sort((a, b) => a.addedAt.localeCompare(b.addedAt)), hydrated: true })
    } catch { useFonts.setState({ hydrated: true }) }
  })()
  return hydrating
}

/** Add a font file: checked (lib/fonts/fontFile.ts), stored here, registered at once. Returns the check. */
export async function addUserFont(file: File): Promise<FontCheck> {
  const r = await checkFontFile(file)
  if (!r.ok) return r
  await hydrateUserFonts()
  const same = useFonts.getState().user.find((f) => f.family === r.family)
  const meta: UserFont = { id: same?.id ?? `font-${Date.now().toString(36)}`, family: r.family, file: file.name, format: r.format, size: file.size, addedAt: same?.addedAt ?? new Date().toISOString() }
  bytesCache.set(meta.id, r.bytes)
  try { await idb('readwrite', (s) => { s.put({ meta, bytes: r.bytes } satisfies Stored, meta.id) }) } catch { /* storage off: the font lasts this visit */ }
  useFonts.setState((s) => ({ user: [...s.user.filter((f) => f.id !== meta.id), meta] }))
  faces.delete(meta.family)
  await ensureFontsLoaded([meta.family])
  return r
}

/** Remove one of "Your fonts" (from this browser; boards that name it fall back to Inter). */
export async function removeUserFont(id: string) {
  const meta = useFonts.getState().user.find((f) => f.id === id)
  bytesCache.delete(id)
  try { await idb('readwrite', (s) => { s.delete(id) }) } catch { /* ignore */ }
  if (meta) for (const face of faces.get(meta.family) ?? []) try { document.fonts.delete(face) } catch { /* ignore */ }
  if (meta) faces.delete(meta.family)
  useFonts.setState((s) => ({ user: s.user.filter((f) => f.id !== id), loaded: s.loaded + 1 }))
}

// ---------------------------------------------------------------- loading
const faces = new Map<string, FontFace[]>()
const base = () => { try { return import.meta.env.BASE_URL || './' } catch { return './' } }

/** Register a family's faces with the document (once) and wait for them; unknown families are left to the fallback. */
export async function ensureFontsLoaded(families: string[]): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const wanted = [...new Set(families)].filter((f) => f && !faces.has(f))
  const jobs: Promise<unknown>[] = []
  for (const family of wanted) {
    const builtin = BUILTIN_FONTS.find((b) => b.family === family)
    if (builtin) {
      if (!builtin.files.length) { faces.set(family, []); continue } // Inter: the app's CSS loads it
      const list = builtin.files.map((f) => new FontFace(family, `url(${base()}${f.file.includes('/') ? f.file : `fonts/${builtin.id}/${f.file}`})`, { weight: String(f.weight) }))
      faces.set(family, list)
      for (const face of list) { document.fonts.add(face); jobs.push(face.load().catch(() => undefined)) }
      continue
    }
    const user = useFonts.getState().user.find((u) => u.family === family)
    const bytes = user && bytesCache.get(user.id)
    if (!user || !bytes) continue
    const face = new FontFace(family, bytes)
    faces.set(family, [face])
    document.fonts.add(face)
    jobs.push(face.load().catch(() => undefined))
  }
  if (!jobs.length) return
  await Promise.all(jobs)
  try { await document.fonts.ready } catch { /* ignore */ }
  useFonts.setState((s) => ({ loaded: s.loaded + 1 }))
}

/** Every family on offer: the built-in set, then the viewer's own. */
export const allFamilies = (user: UserFont[] = useFonts.getState().user) => [...BUILTIN_FONTS.map((b) => b.family), ...user.map((u) => u.family)]
export const familyAvailable = (family: string, user: UserFont[] = useFonts.getState().user) => isBuiltin(family) || user.some((u) => u.family === family)
/** The family to draw with: itself when it is on offer, else Inter (pure). */
export const resolveFamily = (family: string | undefined, available: (f: string) => boolean = (f) => familyAvailable(f)): string => (family && available(family) ? family : DEFAULT_FAMILY)
/** The families a board names that this browser does not have (pure). */
export function missingFamilies(named: string[], available: (f: string) => boolean = (f) => familyAvailable(f)): string[] {
  return [...new Set(named.filter((f) => f && !available(f)))]
}
