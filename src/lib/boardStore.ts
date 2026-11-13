// Board composer state (research P13-M06a): four A2 boards, the images placed on them, the deny-list and the upload
// gates. Kept apart from the app store. Layouts and ticks persist in localStorage; image pixels persist in IndexedDB
// (they are too large for localStorage). Nothing here is uploaded anywhere.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { BOARD_COUNT, DEFAULT_DENY, MAX_SHEETS, applyTemplate, newBoard, type SheetSize, type Board, type BoardImage, type Frame, type FrameContent, type Manifest, type TemplateId } from '../engine/boards'
import type { RuleResult } from '../engine/types'
import type { StyleId } from './boardDrawings'

/** The drawings of one workflow phase for the Architectural set (lib/boardCapture.ts). */
export interface ArchGroup { title: string; items: { imageId: string; caption: string }[] }

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
  /** The sheet style (the Tower Workspace's four architectural styles). */
  style: StyleId
  setStyle: (s: StyleId) => void
  /** Sheet size for export (the layout is drawn on A2; A3 and A1 print it to scale). */
  sheet: SheetSize
  setSheet: (s: SheetSize) => void
  addBoard: () => void
  removeBoard: (i: number) => void
  renameBoard: (i: number, name: string) => void
  /** Makes the five sheets of the drawing set (site plan, floor plans, elevations, section, axonometric and analysis); what was on them is kept aside. */
  makeDrawingSet: (typicalLevel: number, topLevel: number) => void
  /** The Architectural set: the drawing set's sheets, then analysis sheets (six drawings each) for every workflow phase. */
  makeArchSet: (typicalLevel: number, topLevel: number, groups: ArchGroup[]) => void
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
export const useBoardStore = create<BoardState>()(persist((set, get) => ({
  open: false,
  boards: freshBoards(),
  images: {},
  denyList: DEFAULT_DENY,
  dpi: 150,
  ticks: {},
  exports: {},
  selected: { board: 0, frame: null },
  parked: [],
  style: 'competition',
  setStyle: (style) => set({ style, exports: {} }),
  sheet: 'A2',
  setSheet: (sheet) => set({ sheet, exports: {} }),
  addBoard: () => set((s) => {
    if (s.boards.length >= MAX_SHEETS) return {}
    const b = { ...newBoard(s.boards.length, 'grid'), id: `board-${Date.now().toString(36)}`, name: 'New sheet' }
    return { boards: [...s.boards, b], selected: { board: s.boards.length, frame: null } }
  }),
  removeBoard: (i) => set((s) => {
    if (s.boards.length <= 1 || !s.boards[i]) return {}
    const kept = s.boards[i].frames.filter((f) => f.role === 'body' && f.content.kind !== 'empty')
    const boards = s.boards.filter((_, k) => k !== i)
    const ex = { ...s.exports }; delete ex[s.boards[i].id]
    return { boards, parked: [...s.parked, ...kept], exports: ex, selected: { board: Math.min(s.selected.board > i ? s.selected.board - 1 : s.selected.board, boards.length - 1), frame: null } }
  }),
  renameBoard: (i, name) => set((s) => ({ boards: s.boards.map((b, k) => (k === i ? { ...b, name } : b)) })),
  makeDrawingSet: (typ, top) => set((s) => {
    const boards = s.boards.slice()
    while (boards.length < 5) boards.push({ ...newBoard(boards.length, 'grid'), id: `board-${Date.now().toString(36)}${boards.length}` })
    const kept: Frame[] = []
    const fill = (i: number, t: TemplateId, title: string, contents: (FrameContent | null)[]) => {
      const { board } = applyTemplate({ ...boards[i], frames: boards[i].frames.filter((f) => f.role === 'title') }, t)
      kept.push(...boards[i].frames.filter((f) => f.role === 'body' && f.content.kind !== 'empty'))
      let n = 0
      boards[i] = { ...board, name: title, frames: board.frames.map((f) => {
        if (f.role === 'title') return { ...f, content: { kind: 'text', text: title, sizeMm: 9, bold: true } }
        const c = contents[n++]
        return c ? { ...f, content: c } : f
      }) }
    }
    fill(0, 'hero', 'Site plan', [{ kind: 'drawing', vt: 'site' }, { kind: 'table' }, { kind: 'drawing', vt: 'elev', dir: 'S' }, null])
    fill(1, 'plans', 'Floor plans', [{ kind: 'drawing', vt: 'plan', level: 1 }, { kind: 'drawing', vt: 'plan', level: typ }, { kind: 'drawing', vt: 'plan', level: top }, null])
    fill(2, 'grid', 'Elevations', [{ kind: 'drawing', vt: 'elev', dir: 'N' }, { kind: 'drawing', vt: 'elev', dir: 'E' }, { kind: 'drawing', vt: 'elev', dir: 'S' }, { kind: 'drawing', vt: 'elev', dir: 'W' }])
    fill(3, 'hero', 'Section', [{ kind: 'drawing', vt: 'section' }, { kind: 'drawing', vt: 'plan', level: typ }, { kind: 'table' }, null])
    // The last sheet is left for the 3D view and the analysis drawings (Add to sheet fills its frames).
    fill(4, 'grid', 'Axonometric and analysis', [null, null, null, null])
    return { boards, parked: [...s.parked, ...kept], exports: {}, selected: { board: 0, frame: null } }
  }),
  makeArchSet: (typ, top, groups) => {
    get().makeDrawingSet(typ, top)
    set((s) => {
      // The fifth sheet of the drawing set (left for analysis) and any earlier analysis sheets give way to the new ones.
      const base = s.boards.slice(0, 4)
      const later = s.boards.slice(5).filter((b) => !b.id.startsWith('arch-'))
      const M = 12, G = 6, TITLE_H = 20, W = 594, H = 420, y0 = M + TITLE_H + G, cols = 3, rows = 2
      const fw = (W - 2 * M - (cols - 1) * G) / cols, fh = (H - y0 - M - (rows - 1) * G) / rows
      const sheets: Board[] = []
      for (const g of groups) {
        const pages = Math.ceil(g.items.length / (cols * rows))
        for (let p = 0; p < pages; p++) {
          const name = `${g.title} analysis${pages > 1 ? ` ${p + 1} of ${pages}` : ''}`
          const frames: Frame[] = [{ id: 'f0', x: M, y: M, w: W - 2 * M, h: TITLE_H, role: 'title', content: { kind: 'text', text: name, sizeMm: 9, bold: true }, tag: null }]
          g.items.slice(p * cols * rows, (p + 1) * cols * rows).forEach((it, k) => frames.push({ id: `f${k + 1}`, x: M + (k % cols) * (fw + G), y: y0 + Math.floor(k / cols) * (fh + G), w: fw, h: fh, role: 'body', content: { kind: 'image', imageId: it.imageId, fit: 'contain' }, caption: it.caption, tag: null }))
          sheets.push({ id: `arch-${sheets.length + 1}-${Date.now().toString(36)}`, template: 'grid', name, frames })
        }
      }
      return { boards: [...base, ...sheets, ...later].slice(0, MAX_SHEETS), exports: {}, selected: { board: 0, frame: null } }
    })
  },
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
  partialize: (s) => ({ boards: s.boards, denyList: s.denyList, dpi: s.dpi, ticks: s.ticks, parked: s.parked, style: s.style, sheet: s.sheet }),
}))

let hydrated = false
/** Load saved image pixels once per page (call when the composer first opens). */
export async function hydrateBoardImages() {
  if (hydrated) return
  hydrated = true
  const list = await loadImages()
  if (list.length) useBoardStore.setState((s) => ({ images: { ...Object.fromEntries(list.map((i) => [i.id, i])), ...s.images } }))
}
