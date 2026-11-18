// Board composer state (research P13-M06a): four A2 boards, the images placed on them, the deny-list and the upload
// gates. Kept apart from the app store. Layouts and ticks persist in localStorage; image pixels persist in IndexedDB
// (they are too large for localStorage). Nothing here is uploaded anywhere.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { BOARD_COUNT, DEFAULT_DENY, MAX_SHEETS, applyTemplate, moveBoard, newBoard, sheetNumbers, sortBoardsByName, type SheetSize, type Board, type BoardFonts, type BoardImage, type Frame, type FrameContent, type Manifest, type TemplateId } from '../engine/boards'
import type { RuleResult } from '../engine/types'
import type { StyleId } from './boardDrawings'
import { DEFAULT_FONTS } from './fonts/catalog'

/** The drawings of one workflow phase for the Architectural set (lib/boardCapture.ts). */
export interface ArchGroup { title: string; items: { imageId: string; caption: string }[] }

export interface ExportRecord { at: string; name: string; bytes: number; quality: number; dpi: number; manifest: Manifest; rules: RuleResult[]; /** The families the JPEG was drawn with (after any fallback). */ fonts?: string[]; /** Families the board names that did not load, drawn as the fallback. */ missingFonts?: string[] }

interface BoardState {
  open: boolean
  boards: Board[]
  images: Record<string, BoardImage>
  denyList: string[]
  dpi: 150 | 200
  /** The heading and body faces of the boards (Ruijie, 17 Nov; lib/fonts): family names, Inter behind each. */
  fonts: BoardFonts
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
  /** Makes the five sheets of the drawing set (an axonometric cover with the site plan, floor plans, elevations, section, analysis); what was on them is kept aside. */
  makeDrawingSet: (typicalLevel: number, topLevel: number) => void
  /** The Architectural set: the drawing set's sheets, then analysis sheets (six drawings each) for every workflow phase. */
  makeArchSet: (typicalLevel: number, topLevel: number, groups: ArchGroup[], o?: { title?: string; renders?: string[] }) => void
  setOpen: (open: boolean) => void
  select: (board: number, frame?: string | null) => void
  setTemplate: (board: number, t: TemplateId) => void
  updateFrame: (board: number, frame: string, patch: Partial<Frame> & { content?: FrameContent }) => void
  addImage: (img: BoardImage) => void
  removeImage: (id: string) => void
  setDeny: (terms: string[]) => void
  setDpi: (dpi: 150 | 200) => void
  setFonts: (patch: Partial<BoardFonts>) => void
  tick: (key: string) => void
  setExport: (boardId: string, rec: ExportRecord | null) => void
  unpark: (i: number, board: number, frame: string) => void
  /** Name a board (Ruijie, 17 Nov); empty goes back to "Board n". */
  renameBoard: (board: number, name: string) => void
  /** Move a board to another place; the selection follows it. */
  moveBoard: (from: number, to: number) => void
  /** Order the boards by their names. */
  sortByName: () => void
  /** The export format chosen last: JPEG (the submission), PNG or PDF. */
  format: 'jpeg' | 'png' | 'pdf'
  setFormat: (f: 'jpeg' | 'png' | 'pdf') => void
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
  fonts: DEFAULT_FONTS,
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
    // The cover (17 Nov, Sinnie: "bring back the axo drawing as the cover sheet"): the exterior axonometric large, the
    // analysis summary and the site plan beside it.
    fill(0, 'hero', 'Cover', [{ kind: 'drawing', vt: 'axo' }, { kind: 'table' }, { kind: 'drawing', vt: 'site' }, null])
    fill(1, 'plans', 'Floor plans', [{ kind: 'drawing', vt: 'plan', level: 1 }, { kind: 'drawing', vt: 'plan', level: typ }, { kind: 'drawing', vt: 'plan', level: top }, null])
    fill(2, 'grid', 'Elevations', [{ kind: 'drawing', vt: 'elev', dir: 'N' }, { kind: 'drawing', vt: 'elev', dir: 'E' }, { kind: 'drawing', vt: 'elev', dir: 'S' }, { kind: 'drawing', vt: 'elev', dir: 'W' }])
    fill(3, 'hero', 'Section', [{ kind: 'drawing', vt: 'section' }, { kind: 'drawing', vt: 'plan', level: typ }, { kind: 'table' }, null])
    // The last sheet is left for the 3D view and the analysis drawings (Add to sheet fills its frames).
    fill(4, 'grid', 'Analysis', [null, null, null, null])
    return { boards, parked: [...s.parked, ...kept], exports: {}, selected: { board: 0, frame: null } }
  }),
  makeArchSet: (typ, top, groups, o = {}) => set((s) => {
    // The Architectural set (17 Nov 2026, Sinnie): cover, context plan, site plan, the analysis drawings, the program
    // diagram, floor plans (ground, typical mid, typical high, roof), two sections, the exterior axonometric and the
    // renders, in the black-and-white poche style. It replaces the sheets; what was placed on them is kept aside.
    const M = 12, G = 6, TITLE_H = 20, W = 594, H = 420, y0 = M + TITLE_H + G, BW = W - 2 * M, BH = H - y0 - M
    const stamp = Date.now().toString(36)
    const mk = (key: string, name: string, frames: Omit<Frame, 'id' | 'role' | 'tag'>[]): Board => ({
      id: `arch-${key}-${stamp}`, template: 'grid', name,
      frames: [{ id: 'f0', x: M, y: M, w: BW, h: TITLE_H, role: 'title', content: { kind: 'text', text: name, sizeMm: 9, bold: true }, tag: null },
        ...frames.map((f, i) => ({ ...f, id: `f${i + 1}`, role: 'body' as const, tag: null }))],
    })
    const one = (content: FrameContent) => [{ x: M, y: y0, w: BW, h: BH, content }]
    const two = (a: FrameContent, b: FrameContent) => { const w = (BW - G) / 2; return [{ x: M, y: y0, w, h: BH, content: a }, { x: M + w + G, y: y0, w, h: BH, content: b }] }
    const mid = Math.max(2, Math.min(top - 1, typ)), high = Math.max(mid + 1, Math.min(top, Math.round(top * 0.85)))
    const sheets: Board[] = []
    const coverW = Math.round(BW * 0.62)
    sheets.push(mk('cover', o.title ?? 'Architectural set', [
      { x: M, y: y0, w: coverW, h: BH, content: { kind: 'drawing', vt: 'axo' } },
      { x: M + coverW + G, y: y0, w: BW - coverW - G, h: BH, content: { kind: 'text', text: '', sizeMm: 3.6 } },
    ]))
    sheets.push(mk('context', 'Context plan', one({ kind: 'drawing', vt: 'context' })))
    sheets.push(mk('site', 'Site plan', one({ kind: 'drawing', vt: 'site' })))
    const cols = 3, rows = 2, fw = (BW - (cols - 1) * G) / cols, fh = (BH - (rows - 1) * G) / rows
    for (const g of groups) {
      const pages = Math.ceil(g.items.length / (cols * rows))
      for (let p = 0; p < pages; p++) {
        const name = `${g.title} analysis${pages > 1 ? ` ${p + 1} of ${pages}` : ''}`
        sheets.push(mk(`an${sheets.length}`, name, g.items.slice(p * cols * rows, (p + 1) * cols * rows).map((it, k) => ({ x: M + (k % cols) * (fw + G), y: y0 + Math.floor(k / cols) * (fh + G), w: fw, h: fh, content: { kind: 'image', imageId: it.imageId, fit: 'contain' } as FrameContent, caption: it.caption }))))
      }
    }
    sheets.push(mk('program', 'Program diagram', one({ kind: 'drawing', vt: 'program' })))
    sheets.push(mk('plans1', 'Floor plans: ground and typical mid level', two({ kind: 'drawing', vt: 'plan', level: 1 }, { kind: 'drawing', vt: 'plan', level: mid, label: 'Typical mid-level plan' })))
    sheets.push(mk('plans2', 'Floor plans: typical high level and roof', two({ kind: 'drawing', vt: 'plan', level: high, label: 'Typical high-level plan' }, { kind: 'drawing', vt: 'roof' })))
    sheets.push(mk('sections', 'Sections', two({ kind: 'drawing', vt: 'section', axis: 'long' }, { kind: 'drawing', vt: 'section', axis: 'cross' })))
    sheets.push(mk('axo', 'Exterior axonometric', one({ kind: 'drawing', vt: 'axo' })))
    const rs = (o.renders ?? []).slice(0, 4), rw = (BW - G) / 2, rh = (BH - G) / 2
    sheets.push(mk('renders', 'Renders', (rs.length ? rs : [null, null, null, null]).map((id, k) => {
      const big = rs.length === 1
      return { x: big ? M : M + (k % 2) * (rw + G), y: big ? y0 : y0 + Math.floor(k / 2) * (rh + G), w: big ? BW : rw, h: big ? BH : rh, content: id ? ({ kind: 'image', imageId: id, fit: 'cover' } as FrameContent) : ({ kind: 'empty' } as FrameContent) }
    })))
    const all = sheets.slice(0, MAX_SHEETS)
    // the cover's sheet index
    const nos = sheetNumbers(all)
    const index = ['SHEETS', '', ...all.map((b, i) => `${nos[i]}   ${b.name}`)].join(String.fromCharCode(10))
    all[0] = { ...all[0], frames: all[0].frames.map((f) => (f.id === 'f2' ? { ...f, content: { kind: 'text', text: index, sizeMm: 3.6 } } : f)) }
    const kept = s.boards.filter((b) => !b.id.startsWith('arch-')).flatMap((b) => b.frames.filter((f) => f.role === 'body' && f.content.kind !== 'empty' && f.content.kind !== 'drawing'))
    return { boards: all, parked: [...s.parked, ...kept], exports: {}, style: 'architectural' as StyleId, selected: { board: 0, frame: null } }
  }),
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
  setFonts: (patch) => set((s) => ({ fonts: { ...s.fonts, ...patch }, exports: {} })),
  tick: (key) => set((s) => ({ ticks: { ...s.ticks, [key]: !s.ticks[key] } })),
  setExport: (id, rec) => set((s) => { const ex = { ...s.exports }; if (rec) ex[id] = rec; else delete ex[id]; return { exports: ex } }),
  unpark: (k, i, id) => set((s) => {
    const p = s.parked[k]; if (!p) return {}
    const boards = s.boards.slice()
    boards[i] = { ...boards[i], frames: boards[i].frames.map((f) => (f.id === id ? { ...f, content: p.content, caption: p.caption, tag: p.tag } : f)) }
    return { boards, parked: s.parked.filter((_, j) => j !== k) }
  }),
  renameBoard: (i, name) => set((s) => {
    const boards = s.boards.slice(); boards[i] = { ...boards[i], name: name.slice(0, 80) || undefined }
    const ex = { ...s.exports }; delete ex[boards[i].id]
    return { boards, exports: ex }
  }),
  // The board number printed in each title band follows the order, so a move or sort asks for fresh exports.
  moveBoard: (from, to) => set((s) => {
    const boards = moveBoard(s.boards, from, to)
    if (boards === s.boards) return {}
    const id = s.boards[s.selected.board]?.id
    return { boards, exports: {}, selected: { board: Math.max(0, boards.findIndex((b) => b.id === id)), frame: s.selected.frame } }
  }),
  sortByName: () => set((s) => {
    const boards = sortBoardsByName(s.boards)
    if (boards.every((b, i) => b === s.boards[i])) return {}
    const id = s.boards[s.selected.board]?.id
    return { boards, exports: {}, selected: { board: Math.max(0, boards.findIndex((b) => b.id === id)), frame: s.selected.frame } }
  }),
  format: 'jpeg',
  setFormat: (format) => set({ format }),
  reset: () => set({ boards: freshBoards(), parked: [], exports: {}, ticks: {}, selected: { board: 0, frame: null } }),
}), {
  name: 'ts.boards',
  // v2 (17 Nov, Sinnie: "all the analysis drawing should only appear if the user presses (add on sheet) … remove all the
  // analysis page by default"): sheets filled by the old automatic capture (images 'arch-…') are dropped from saved sets.
  version: 2,
  migrate: (state, from) => {
    const st = state as { boards?: { frames: { content?: { kind: string; imageId?: string } }[] }[] }
    if (from < 2 && Array.isArray(st.boards)) {
      const auto = (b: (typeof st.boards)[number]) => b.frames.some((f) => f.content?.kind === 'image' && f.content.imageId?.startsWith('arch-'))
      const kept = st.boards.filter((b) => !auto(b))
      st.boards = kept.length ? kept : st.boards
    }
    return state as never
  },
  storage: createJSONStorage(() => {
    try { return localStorage } catch { return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } }
  }),
  // Image pixels live in IndexedDB; exports are re-made on demand.
  partialize: (s) => ({ boards: s.boards, denyList: s.denyList, dpi: s.dpi, fonts: s.fonts, ticks: s.ticks, parked: s.parked, style: s.style, sheet: s.sheet, format: s.format }),
}))

let hydrated = false
/** Load saved image pixels once per page (call when the composer first opens). */
export async function hydrateBoardImages() {
  if (hydrated) return
  hydrated = true
  // Drawings the old automatic capture saved (ids 'arch-…') are dropped; the user's own Sheet adds ('analysis-…') stay.
  const all = await loadImages()
  for (const i of all) if (i.id.startsWith('arch-')) void deleteImage(i.id)
  const list = all.filter((i) => !i.id.startsWith('arch-'))
  if (list.length) useBoardStore.setState((s) => ({ images: { ...Object.fromEntries(list.map((i) => [i.id, i])), ...s.images } }))
}
