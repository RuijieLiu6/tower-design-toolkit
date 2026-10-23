// Board composer state (research P13-M06a): four A2 boards, the images placed on them, the deny-list and the upload
// gates. Kept apart from the app store. Layouts and ticks persist in localStorage; image pixels persist in IndexedDB
// (they are too large for localStorage). Nothing here is uploaded anywhere.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { BOARD_COUNT, DEFAULT_DENY, applyTemplate, newBoard, type Board, type BoardImage, type Frame, type FrameContent, type Manifest, type TemplateId } from '../engine/boards'
import type { RuleResult } from '../engine/types'

export interface ExportRecord { at: string; name: string; bytes: number; quality: number; dpi: number; manifest: Manifest; rules: RuleResult[] }

interface BoardState {
  open: boolean
  boards: Board[]
  images: Record<string, BoardImage>
  denyList: string[]
  dpi: 150 | 200
  /** Ticks for the upload gates: `${gateId}` or `${gateId}:${boardId}` for per-board gates. */
  ticks: Record<string, boolean>
  exports: Record<string, ExportRecord>
  selected: { board: number; frame: string | null }
  /** Contents that no longer fit after a template change, kept so nothing is lost silently. */
  parked: Frame[]
  setOpen: (open: boolean) => void
  select: (board: number, frame?: string | null) => void
  setTemplate: (board: number, t: TemplateId) => void
  updateFrame: (board: number, frame: string, patch: Partial<Frame> & { content?: FrameContent }) => void
  addImage: (img: BoardImage) => void
  removeImage: (id: string) => void
  setDeny: (terms: string[]) => void
  setDpi: (dpi: 150 | 200) => void
  tick: (key: string) => void
  setExport: (boardId: string, rec: ExportRecord | null) => void
  unpark: (i: number, board: number, frame: string) => void
  reset: () => void
}

const freshBoards = () => Array.from({ length: BOARD_COUNT }, (_, i) => newBoard(i))

// ---------------------------------------------------------------- IndexedDB for image pixels
const DB = 'tower-studio-boards', STORE = 'images'
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
const putImage = (img: BoardImage) => idb('readwrite', (s) => { s.put(img, img.id) }).catch(() => undefined)
const deleteImage = (id: string) => idb('readwrite', (s) => { s.delete(id) }).catch(() => undefined)
async function loadImages(): Promise<BoardImage[]> {
  try { return ((await idb('readonly', (s) => s.getAll())) as BoardImage[] | undefined) ?? [] } catch { return [] }
}

// ---------------------------------------------------------------- store
export const useBoardStore = create<BoardState>()(persist((set) => ({
  open: false,
  boards: freshBoards(),
  images: {},
  denyList: DEFAULT_DENY,
  dpi: 150,
  ticks: {},
  exports: {},
  selected: { board: 0, frame: null },
  parked: [],
  setOpen: (open) => set({ open }),
  select: (board, frame = null) => set({ selected: { board, frame } }),
  setTemplate: (i, t) => set((s) => {
    const { board, dropped } = applyTemplate(s.boards[i], t)
    const boards = s.boards.slice(); boards[i] = board
    const ex = { ...s.exports }; delete ex[board.id]
    return { boards, parked: [...s.parked, ...dropped], selected: { board: i, frame: null }, exports: ex }
  }),
  updateFrame: (i, id, patch) => set((s) => {
    const boards = s.boards.slice()
    boards[i] = { ...boards[i], frames: boards[i].frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }
    const ex = { ...s.exports }; delete ex[boards[i].id]
    return { boards, exports: ex }
  }),
  addImage: (img) => { void putImage(img); set((s) => ({ images: { ...s.images, [img.id]: img } })) },
  removeImage: (id) => { void deleteImage(id); set((s) => {
    const images = { ...s.images }; delete images[id]
    const boards = s.boards.map((b) => ({ ...b, frames: b.frames.map((f) => (f.content.kind === 'image' && f.content.imageId === id ? { ...f, content: { kind: 'empty' } as FrameContent } : f)) }))
    return { images, boards }
  }) },
  setDeny: (denyList) => set({ denyList }),
  setDpi: (dpi) => set({ dpi, exports: {} }),
  tick: (key) => set((s) => ({ ticks: { ...s.ticks, [key]: !s.ticks[key] } })),
  setExport: (id, rec) => set((s) => { const ex = { ...s.exports }; if (rec) ex[id] = rec; else delete ex[id]; return { exports: ex } }),
  unpark: (k, i, id) => set((s) => {
    const p = s.parked[k]; if (!p) return {}
    const boards = s.boards.slice()
    boards[i] = { ...boards[i], frames: boards[i].frames.map((f) => (f.id === id ? { ...f, content: p.content, caption: p.caption, tag: p.tag } : f)) }
    return { boards, parked: s.parked.filter((_, j) => j !== k) }
  }),
  reset: () => set({ boards: freshBoards(), parked: [], exports: {}, ticks: {}, selected: { board: 0, frame: null } }),
}), {
  name: 'ts.boards',
  version: 1,
  storage: createJSONStorage(() => {
    try { return localStorage } catch { return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } }
  }),
  // Image pixels live in IndexedDB; exports are re-made on demand.
  partialize: (s) => ({ boards: s.boards, denyList: s.denyList, dpi: s.dpi, ticks: s.ticks, parked: s.parked }),
}))

let hydrated = false
/** Load saved image pixels once per page (call when the composer first opens). */
export async function hydrateBoardImages() {
  if (hydrated) return
  hydrated = true
  const list = await loadImages()
  if (list.length) useBoardStore.setState((s) => ({ images: { ...Object.fromEntries(list.map((i) => [i.id, i])), ...s.images } }))
}
