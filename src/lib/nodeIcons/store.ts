// User-created nodes' icons, kept apart from the nodes themselves (Ruijie, 7 Nov: "Changing an icon must not change how a
// node behaves"): a node package (lib/communityStore.ts) holds what it does; this store holds only how it looks, keyed by
// the node's id. Each icon records where it came from and the style pack it was made with, so a new style pack never
// silently redraws it. Uploaded originals are kept whole in this browser's IndexedDB (a restyled copy never replaces
// them); the small display assets live with the record. Nothing is uploaded anywhere.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { STYLE_VERSIONS, type IconBrief, type StyleVersion } from './brief'
import type { Adjust, QualityCheck } from './image'
import type { PackageIcon } from './fromPackage'

export type IconSource = 'editor' | 'assistant' | 'agent' | 'upload'
export type IconRecord =
  | { kind: 'generated'; brief: IconBrief; variant: number; styleVersion: StyleVersion; source: IconSource; updatedAt: string }
  | {
      kind: 'image'; source: IconSource; styleVersion: StyleVersion; updatedAt: string
      /** The 256 px display asset (PNG data URL) as fitted or cropped; and the restyled copy, when made. */
      display: string; restyled: string | null; useRestyled: boolean
      adjust: Adjust; width: number; height: number; type: string
      checks: QualityCheck[]
    }

interface IconState {
  icons: Record<string, IconRecord>
  setIcon: (nodeId: string, icon: IconRecord) => void
  clearIcon: (nodeId: string) => void
}

const memory = new Map<string, string>()
const storage: StateStorage = {
  getItem: (k) => { try { return window.localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  setItem: (k, v) => { try { window.localStorage.setItem(k, v) } catch { memory.set(k, v) } },
  removeItem: (k) => { try { window.localStorage.removeItem(k) } catch { memory.delete(k) } },
}
const looksLikeIcon = (x: unknown): x is IconRecord => {
  const r = x as IconRecord | null
  if (!r || typeof r !== 'object' || !STYLE_VERSIONS.includes(r.styleVersion)) return false
  return r.kind === 'generated' ? !!r.brief && typeof r.variant === 'number' : r.kind === 'image' ? typeof r.display === 'string' && r.display.startsWith('data:image/') : false
}

export const useNodeIcons = create<IconState>()(persist((set) => ({
  icons: {},
  setIcon: (nodeId, icon) => set((s) => ({ icons: { ...s.icons, [nodeId]: icon } })),
  clearIcon: (nodeId) => { set((s) => { const { [nodeId]: _gone, ...rest } = s.icons; return { icons: rest } }); void deleteOriginal(nodeId) },
}), {
  name: 'tower-studio.node-icons',
  version: 1,
  storage: createJSONStorage(() => storage),
  partialize: (s) => ({ icons: s.icons }),
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<IconState>
    const icons = Object.fromEntries(Object.entries(p.icons ?? {}).filter(([, v]) => looksLikeIcon(v)))
    return { ...current, icons }
  },
}))

// ---------------------------------------------------------------- originals (IndexedDB)
const DB = 'tower-studio-icons', STORE = 'originals'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) } catch (e) { rej(e) }
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const d = await db()
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE))
      t.oncomplete = () => res(req ? (req.result as T) : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error)
    })
  } finally { d.close() }
}
export interface Original { bytes: ArrayBuffer; type: string; name: string; savedAt: string }
/** Keeps the uploaded file exactly as it came (false when this browser will not keep it). */
export const saveOriginal = (nodeId: string, o: Original) => tx('readwrite', (s) => { s.put(o, nodeId) }).then(() => true, () => false)
export const loadOriginal = (nodeId: string) => tx<Original>('readonly', (s) => s.get(nodeId)).catch(() => undefined)
export const deleteOriginal = (nodeId: string) => tx('readwrite', (s) => { s.delete(nodeId) }).catch(() => undefined)

/** The icon as a package carries it (schema property `icon`): a brief, or the image as shown (fitted, or restyled). */
export function packageIconOf(icon: IconRecord): PackageIcon {
  return icon.kind === 'generated'
    ? { kind: 'brief', brief: icon.brief }
    : { kind: 'image', dataUrl: icon.useRestyled && icon.restyled ? icon.restyled : icon.display, source: icon.source === 'agent' ? 'agent' : 'upload', styleVersion: icon.styleVersion }
}
