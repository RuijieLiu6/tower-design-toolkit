// Projects kept in this browser (IndexedDB): the autosave slot and projects saved by name. Every call is wrapped,
// so a browser that blocks storage (private windows, blocked site data) still runs the app; it just can't keep work.
export const AUTOSAVE_KEY = 'autosave'
const DB_NAME = 'tower-studio'
const STORE = 'projects'

/** One stored project. The save time lives here, never inside the project file. */
export interface StoredProject { key: string; name: string; savedAt: string; text: string }

let dbPromise: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' }) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then((d) => new Promise<T | null>((resolve) => {
    if (!d) return resolve(null)
    try {
      const req = op(d.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  }))
}

export const storageAvailable = async () => (await db()) !== null
export const putProject = async (p: StoredProject) => (await run('readwrite', (s) => s.put(p))) !== null
export const getProject = (key: string) => run<StoredProject | undefined>('readonly', (s) => s.get(key)).then((r) => r ?? null)
export const deleteProject = async (key: string) => (await run('readwrite', (s) => s.delete(key))) !== null

/**
 * Saved projects, newest first, without their contents (the autosave slot is not listed). Design options (keys under
 * "option:", lib/optionsStore.ts) are listed only when asked for by that prefix.
 */
export async function listProjects(prefix = ''): Promise<Omit<StoredProject, 'text'>[]> {
  const all = (await run<StoredProject[]>('readonly', (s) => s.getAll())) ?? []
  return all.filter((p) => p.key !== AUTOSAVE_KEY && (prefix ? p.key.startsWith(prefix) : !p.key.startsWith('option:'))).map(({ key, name, savedAt }) => ({ key, name, savedAt })).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}
