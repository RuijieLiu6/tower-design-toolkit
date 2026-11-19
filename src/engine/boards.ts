// Boards and submission (research P13-M01 tracker, P13-M06 validator and layout). Pure functions: the app draws and
// encodes the boards; this module lays them out, reads the exported JPEG bytes and checks them against the brief.
// Brief = VTC competition brief (English PDF, SHA-256 73b1f4ed…8efdc, opened 22 Oct 2026); page numbers are its own.
import type { AiMeta } from './renderPrompt'
import type { Flag, RuleResult, RuleState, Source } from './types'

// ---------------------------------------------------------------- sources
const BRIEF = (page: string): Source => ({ label: 'VTC brief', page })
const TERMS = (clause: string): Source => ({ label: 'Buildner Terms (read in research P13)', page: clause })
const TEAM: Source = { label: 'Team assumption (research P13)' }

// ---------------------------------------------------------------- sheet
/**
 * The sheet in millimetres: A2 landscape by default (brief p.27: four A2 landscape boards; ISO 216 size). Portrait
 * (18 Nov, Sinnie: "page size, orientation") swaps the two; these are live bindings, so every importer sees the change.
 */
export let BOARD_W = 594
export let BOARD_H = 420
export let A2_RATIO = BOARD_W / BOARD_H
export type Orientation = 'landscape' | 'portrait'
/**
 * Paper sizes, long × short side in real millimetres (19 Nov, Sinnie: "add arch sizes"): ISO 216 A sizes and the US
 * ARCH series (ANSI/ASME Y14.1). The board is drawn in sheet units with the long side always 594, so an A sheet is
 * 594 × 420 and an ARCH sheet keeps its own proportion (ARCH D 594 × 396); `k` is real mm per sheet unit.
 */
const SIZE_MM = {
  A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841],
  'ARCH A': [304.8, 228.6], 'ARCH B': [457.2, 304.8], 'ARCH C': [609.6, 457.2], 'ARCH D': [914.4, 609.6], 'ARCH E1': [1066.8, 762], 'ARCH E': [1219.2, 914.4],
} as const
export type SheetSize = keyof typeof SIZE_MM
const inch = (mm: number) => +(mm / 25.4).toFixed(1)
export const SHEET_SIZES = Object.fromEntries((Object.keys(SIZE_MM) as SheetSize[]).map((s) => {
  const [l, sh] = SIZE_MM[s], arch = s.startsWith('ARCH')
  return [s, { label: `${s}${s === 'A2' ? ' (competition)' : ''}: ${arch ? `${inch(sh)} × ${inch(l)} in` : `${sh} × ${l} mm`}`, short: arch ? s.slice(5) : s, series: arch ? 'ARCH' : 'ISO', mm: [l, sh] as const, k: l / 594 }]
})) as Record<SheetSize, { label: string; short: string; series: 'ISO' | 'ARCH'; mm: readonly [number, number]; k: number }>
let SIZE: SheetSize = 'A2', ORIENT: Orientation = 'landscape'
function applySheet() {
  const [l, s] = SIZE_MM[SIZE] ?? SIZE_MM.A2
  const short = SIZE.startsWith('A') && !SIZE.startsWith('ARCH') ? 420 : Math.round((594 * s) / l * 10) / 10
  BOARD_W = ORIENT === 'portrait' ? short : 594
  BOARD_H = ORIENT === 'portrait' ? 594 : short
  A2_RATIO = BOARD_W / BOARD_H
}
export function setOrientation(o: Orientation) { ORIENT = o; applySheet() }
export function setSheetSize(s: SheetSize) { SIZE = SHEET_SIZES[s] ? s : 'A2'; applySheet() }
/** The page in real millimetres, as it prints (for the PDF). */
export const sheetMm = () => { const [l, s] = SHEET_SIZES[SIZE].mm; return ORIENT === 'portrait' ? { w: s, h: l } : { w: l, h: s } }
/** A board's frames moved and sized to the other orientation, in proportion (the title band keeps its height). */
export function reorientBoard(b: Board, from: { w: number; h: number }, to: { w: number; h: number }): Board {
  // Inside the 12 mm margins: across from margin to margin, down from under the title band to the bottom margin.
  const sx = (to.w - 24) / (from.w - 24), sy = (to.h - TITLE_BAND - 12) / (from.h - TITLE_BAND - 12)
  const x = (f: Frame) => ({ x: 12 + (f.x - 12) * sx, w: f.w * sx })
  return { ...b, frames: b.frames.map((f) => f.role === 'title'
    ? { ...f, ...x(f) }
    : { ...f, ...x(f), y: TITLE_BAND + (f.y - TITLE_BAND) * sy, h: f.h * sy }) }
}
const TITLE_BAND = 38 // the top of the body frames: margin + title band + gutter
export const MAX_BYTES = 10_000_000 // brief p.27 "must not exceed 10MB"; MB is not defined, so the stricter 10^7 bytes
export const TARGET_BYTES = 9_500_000 // team margin for MB/MiB and portal overhead (research P13 HR-02t)
export const BOARD_COUNT = 4

export const pxForDpi = (dpi: number) => ({ w: Math.round((BOARD_W / 25.4) * dpi), h: Math.round((BOARD_H / 25.4) * dpi) })

// ---------------------------------------------------------------- deliverables (brief p.30, "a suggestion only")
export type DeliverableId =
  | 'programme' | 'structure' | 'massing' | 'wind' | 'solar' | 'sustain'
  | 'site' | 'ground' | 'plan-low' | 'plan-mid' | 'plan-up' | 'sections'
  | 'skyline' | 'midcity' | 'street' | 'policy'

export interface Deliverable { id: DeliverableId; group: string; label: string; min: number; jury: string }

export const DELIVERABLES: Deliverable[] = [
  { id: 'programme', group: 'Organizational diagrams', label: 'Programme organization', min: 1, jury: 'Design 20%' },
  { id: 'structure', group: 'Organizational diagrams', label: 'Structural strategy', min: 1, jury: 'Design 20%' },
  { id: 'massing', group: 'Organizational diagrams', label: 'Building form and massing', min: 1, jury: 'Design 20%' },
  { id: 'wind', group: 'Performance studies', label: 'Wind studies', min: 1, jury: 'Human scale 40%' },
  { id: 'solar', group: 'Performance studies', label: 'Solar / shadow studies', min: 1, jury: 'Human scale 40%' },
  { id: 'sustain', group: 'Performance studies', label: 'Sustainability and environmental performance', min: 1, jury: 'Design 20%' },
  { id: 'site', group: 'Drawings', label: 'Site plan', min: 1, jury: 'Urban integration 10%' },
  { id: 'ground', group: 'Drawings', label: 'Ground floor plan', min: 1, jury: 'Human scale 40%' },
  { id: 'plan-low', group: 'Drawings', label: 'Typical lower-level plan', min: 1, jury: 'Design 20%' },
  { id: 'plan-mid', group: 'Drawings', label: 'Typical mid-level plan', min: 1, jury: 'Design 20%' },
  { id: 'plan-up', group: 'Drawings', label: 'Typical upper-level plan', min: 1, jury: 'Design 20%' },
  { id: 'sections', group: 'Drawings', label: 'Primary cross sections', min: 2, jury: 'Design 20%' },
  { id: 'skyline', group: 'Visualizations', label: 'Skyline view from the Queen Elizabeth Park viewpoint', min: 1, jury: 'Cultural context 30%' },
  { id: 'midcity', group: 'Visualizations', label: 'Mid-city view', min: 1, jury: 'Urban integration 10%' },
  { id: 'street', group: 'Visualizations', label: 'Ground-level perspectives (public realm, pedestrians, servicing)', min: 4, jury: 'Human scale 40%' },
  { id: 'policy', group: 'Policy reflection', label: 'Policy reflection summary', min: 1, jury: 'Cultural context 30%' },
]

// ---------------------------------------------------------------- layout
export type ImageSource = 'capture' | 'ai' | 'own'
export const SOURCE_LABEL: Record<ImageSource, string> = { capture: 'Tool capture', ai: 'AI-generated', own: 'Own drawing or photo' }

export interface BoardImage { id: string; dataUrl: string; w: number; h: number; source: ImageSource; label: string; vector?: boolean; /** Set for AI renders imported from the render workflow: the image is AI-generated, whatever `source` says. */ ai?: AiMeta }

/** Who made the image, for labels and checks: an AI render always counts as AI (label rule, research P13-M05). */
export const imageSource = (img: BoardImage | undefined): ImageSource | undefined => (img?.ai ? 'ai' : img?.source)

export type FrameContent =
  | { kind: 'empty' }
  | { kind: 'image'; imageId: string; fit: 'cover' | 'contain' }
  | { kind: 'text'; text: string; sizeMm: number; bold?: boolean; /** A family of its own (lib/fonts); the board's heading or body face otherwise. */ font?: string }
  | { kind: 'evidence'; nodeId: string }
  /** A vector drawing of the design at true scale (lib/boardDrawings.ts, from the Tower Workspace's Presentation page). */
  | { kind: 'drawing'; vt: 'site' | 'plan' | 'elev' | 'section' | 'context' | 'roof' | 'axo' | 'program'; level?: number; dir?: 'N' | 'E' | 'S' | 'W'; scale?: number; axis?: 'long' | 'cross'; label?: string }
  /** The analysis summary table: one line per check. */
  | { kind: 'table' }

export interface Frame { id: string; x: number; y: number; w: number; h: number; role: 'title' | 'body'; content: FrameContent; caption?: string; tag?: DeliverableId | null }

export type TemplateId = 'hero' | 'grid' | 'plans' | 'story' | 'single' | 'halves' | 'feature' | 'six' | 'sidebar' | 'mosaic'
export interface Board { id: string; template: TemplateId; frames: Frame[]; /** The board's own name (Ruijie, 17 Nov): shown on its tab, used for the file name and to order the boards. */ name?: string }

/** Sheet sizes (ISO A, landscape): all share one proportion, so a board laid out on A2 prints on the others to scale. */
export const MAX_SHEETS = 40

/** A sheet's name: the one given, else the first line of its title, else its place. */
export function sheetName(b: Board, i: number): string {
  if (b.name?.trim()) return b.name.trim()
  const t = b.frames.find((f) => f.role === 'title' && f.content.kind === 'text')
  const line = t && t.content.kind === 'text' ? t.content.text.trim().split(String.fromCharCode(10))[0] : ''
  return line || `Sheet ${i + 1}`
}
/** Sheet numbers as a drawing set has them: A-0xx site, A-1xx plans, A-2xx elevations, A-3xx sections, A-9xx everything else. */
export function sheetNumbers(boards: Board[]): string[] {
  const seen: Record<number, number> = {}
  return boards.map((b, i) => {
    const first = b.frames.find((f) => f.content.kind === 'drawing')
    // The cover: the architectural set's, or a first sheet that leads with the axonometric (the drawing set's).
    if (b.id.startsWith('arch-cover') || (i === 0 && first?.content.kind === 'drawing' && first.content.vt === 'axo')) return 'A-000'
    const d = b.frames.find((f) => f.content.kind === 'drawing')
    const vt = d && d.content.kind === 'drawing' ? d.content.vt : null
    const series = vt === 'site' || vt === 'context' ? 0 : vt === 'plan' || vt === 'roof' ? 1 : vt === 'elev' ? 2 : vt === 'section' ? 3 : vt === 'axo' || vt === 'program' ? 4 : 9
    seen[series] = (seen[series] ?? 0) + 1
    return `A-${series}${String(seen[series]).padStart(2, '0')}`
  })
}

/** The name shown and written: the board's own, else "Board n" by its place. */
export const boardName = (b: Board, i: number) => sheetName(b, i) // one naming rule for both: own name, else the title line, else "Sheet n"
/** A neutral file name from the board's place and name: "01-site-strategy". A number leading the name (the way people
 *  order boards by name, "1 Site strategy") gives way to the place, which already leads the file name. */
export function boardFileStem(b: Board, i: number): string {
  const slug = boardName(b, i).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^\d+(?:-|$)/, '').slice(0, 48)
  return `${String(i + 1).padStart(2, '0')}-${slug || 'board'}`
}
/** Move one board to another place; the others keep their order. */
export function moveBoard<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const out = list.slice(); const [b] = out.splice(from, 1); out.splice(to, 0, b); return out
}
/** The boards ordered by their names, numbers read as numbers ("2 Plans" before "10 Views"); unnamed boards keep their order after the named ones. */
export function sortBoardsByName(list: Board[]): Board[] {
  const all = list.map((b, i) => ({ b, i }))
  const named = all.filter((x) => x.b.name?.trim())
  const rest = all.filter((x) => !x.b.name?.trim())
  named.sort((x, y) => x.b.name!.trim().localeCompare(y.b.name!.trim(), undefined, { numeric: true, sensitivity: 'base' }) || x.i - y.i)
  return [...named, ...rest].map((x) => x.b)
}
/** The board-wide pair (Ruijie, 17 Nov): headings (the title band) and text (frames, captions, evidence), as CSS family names. */
export interface BoardFonts { heading: string; body: string }
/** Every family a board names: the pair and each text frame's own, in use order (the first is the heading). */
export const familiesUsed = (b: Board, fonts: BoardFonts): string[] => [...new Set([fonts.heading, fonts.body, ...b.frames.flatMap((f) => (f.content.kind === 'text' && f.content.font ? [f.content.font] : []))])]

/** `text`: frame indices the layout means for text, drawn as lines on its thumbnail (any frame still takes anything). */
export const TEMPLATES: Record<TemplateId, { label: string; hint: string; text?: number[] }> = {
  hero: { label: 'Hero + two', hint: 'One large view, two smaller, a text block', text: [4] },
  grid: { label: 'Four up', hint: 'Four equal images' },
  plans: { label: 'Three plans', hint: 'Three drawings in a row over a text band', text: [4] },
  story: { label: 'Text + two', hint: 'A text column and two stacked images', text: [1] },
  single: { label: 'Full sheet', hint: 'One view across the whole sheet' },
  halves: { label: 'Two up', hint: 'Two equal views side by side' },
  feature: { label: 'Feature + three', hint: 'One wide view over three smaller' },
  six: { label: 'Six up', hint: 'Six equal images, three by two' },
  sidebar: { label: 'View + notes', hint: 'One large view with a text column beside it', text: [2] },
  mosaic: { label: 'Hero + four', hint: 'One large view and four small ones' },
}

const M = 12 // margin, mm
const G = 6 // gutter, mm
const TITLE_H = 20
const BODY_Y = M + TITLE_H + G

/** Frame rectangles (mm) for a template, on the sheet as it is now oriented. Frame 0 is always the title band. */
export function templateRects(t: TemplateId): { x: number; y: number; w: number; h: number; role: 'title' | 'body' }[] {
  const BODY_H = BOARD_H - BODY_Y - M, BODY_W = BOARD_W - 2 * M
  const title = { x: M, y: M, w: BODY_W, h: TITLE_H, role: 'title' as const }
  const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, role: 'body' as const })
  if (t === 'hero') {
    const hw = Math.round((BODY_W - G) * 0.64), sw = BODY_W - hw - G, sx = M + hw + G, ih = Math.round((BODY_H - 2 * G) * 0.355)
    return [title, r(M, BODY_Y, hw, BODY_H), r(sx, BODY_Y, sw, ih), r(sx, BODY_Y + ih + G, sw, ih), r(sx, BODY_Y + 2 * (ih + G), sw, BODY_H - 2 * (ih + G))]
  }
  if (t === 'grid') {
    const w = (BODY_W - G) / 2, h = (BODY_H - G) / 2
    return [title, r(M, BODY_Y, w, h), r(M + w + G, BODY_Y, w, h), r(M, BODY_Y + h + G, w, h), r(M + w + G, BODY_Y + h + G, w, h)]
  }
  if (t === 'plans') {
    const w = (BODY_W - 2 * G) / 3, h = Math.round(BODY_H * 0.75)
    return [title, r(M, BODY_Y, w, h), r(M + w + G, BODY_Y, w, h), r(M + 2 * (w + G), BODY_Y, w, h), r(M, BODY_Y + h + G, BODY_W, BODY_H - h - G)]
  }
  if (t === 'single') return [title, r(M, BODY_Y, BODY_W, BODY_H)]
  if (t === 'halves') {
    const w = (BODY_W - G) / 2
    return [title, r(M, BODY_Y, w, BODY_H), r(M + w + G, BODY_Y, w, BODY_H)]
  }
  if (t === 'feature') {
    const h = Math.round(BODY_H * 0.6), w = (BODY_W - 2 * G) / 3, y = BODY_Y + h + G, bh = BODY_H - h - G
    return [title, r(M, BODY_Y, BODY_W, h), r(M, y, w, bh), r(M + w + G, y, w, bh), r(M + 2 * (w + G), y, w, bh)]
  }
  if (t === 'six') {
    const w = (BODY_W - 2 * G) / 3, h = (BODY_H - G) / 2
    return [title, ...[0, 1].flatMap((row) => [0, 1, 2].map((c) => r(M + c * (w + G), BODY_Y + row * (h + G), w, h)))]
  }
  if (t === 'sidebar') {
    const tw = Math.round(BODY_W * 0.26), iw = BODY_W - tw - G
    return [title, r(M, BODY_Y, iw, BODY_H), r(M + iw + G, BODY_Y, tw, BODY_H)]
  }
  if (t === 'mosaic') {
    const hw = Math.round((BODY_W - G) * 0.55), sw = (BODY_W - hw - 2 * G) / 2, sh = (BODY_H - G) / 2, sx = M + hw + G
    return [title, r(M, BODY_Y, hw, BODY_H), r(sx, BODY_Y, sw, sh), r(sx + sw + G, BODY_Y, sw, sh), r(sx, BODY_Y + sh + G, sw, sh), r(sx + sw + G, BODY_Y + sh + G, sw, sh)]
  }
  const tw = Math.round(BODY_W * 0.32), iw = BODY_W - tw - G, ih = (BODY_H - G) / 2
  return [title, r(M, BODY_Y, tw, BODY_H), r(M + tw + G, BODY_Y, iw, ih), r(M + tw + G, BODY_Y + ih + G, iw, ih)]
}

const emptyText = (role: 'title' | 'body'): FrameContent => role === 'title' ? { kind: 'text', text: '', sizeMm: 9, bold: true } : { kind: 'empty' }

export function newBoard(index: number, template: TemplateId = index === 0 ? 'hero' : index === 1 ? 'plans' : index === 2 ? 'grid' : 'story'): Board {
  return { id: `board-${index + 1}`, template, frames: templateRects(template).map((rect, i) => ({ id: `f${i}`, ...rect, content: emptyText(rect.role), tag: null })) }
}

/** Switch template, keeping the title and moving the other contents into the new frames in order (extras are kept as hidden overflow). */
export function applyTemplate(board: Board, template: TemplateId): { board: Board; dropped: Frame[] } {
  const rects = templateRects(template)
  const title = board.frames.find((f) => f.role === 'title')
  const filled = board.frames.filter((f) => f.role === 'body' && f.content.kind !== 'empty')
  const frames: Frame[] = rects.map((rect, i) => {
    if (rect.role === 'title') return { ...(title ?? { id: 'f0', content: emptyText('title'), tag: null }), ...rect, id: `f${i}` }
    const src = filled.shift()
    return src ? { ...src, ...rect, id: `f${i}` } : { id: `f${i}`, ...rect, content: { kind: 'empty' }, tag: null }
  })
  return { board: { ...board, template, frames }, dropped: filled }
}

export const CAPTION_MM = 3.5 // caption type height on the board (team: 3.5 mm ≈ 11 px when a 594 mm board is shown 1920 px wide)
export const CAPTION_BAND = 7 // mm reserved under an image for its caption

/** The caption actually printed under an image: AI images always carry the disclosure (research P13-M06, team rule). */
export function printedCaption(frame: Frame, img: BoardImage | undefined): string {
  const own = (frame.caption ?? '').trim()
  if (imageSource(img) === 'ai') return own ? `AI-generated image · ${own}` : 'AI-generated image'
  return own
}

/** Where an image lands inside its frame (mm), leaving room for the caption; cover crops, contain letterboxes. */
export function imagePlacement(frame: Frame, img: { w: number; h: number }, fit: 'cover' | 'contain', hasCaption: boolean) {
  const fh = frame.h - (hasCaption ? CAPTION_BAND : 0)
  const s = fit === 'cover' ? Math.max(frame.w / img.w, fh / img.h) : Math.min(frame.w / img.w, fh / img.h) // mm per image px
  const w = img.w * s, h = img.h * s
  return { clip: { x: frame.x, y: frame.y, w: frame.w, h: fh }, x: frame.x + (frame.w - w) / 2, y: frame.y + (fh - h) / 2, w, h, mmPerPx: s }
}

/** Effective resolution of a placed raster (px per inch on the printed board). */
export const effectivePpi = (mmPerPx: number) => 25.4 / mmPerPx

// ---------------------------------------------------------------- text checks
/** Deny-list match: case-insensitive, whitespace-tolerant ("ARCH 540" also finds "ARCH540"), whole words for short terms. */
export function findTerms(text: string, terms: string[]): string[] {
  const hay = text.normalize('NFC').replace(/[_\-.]+/g, ' ')
  const out: string[] = []
  for (const raw of terms) {
    const term = raw.normalize('NFC').trim()
    if (term.length < 2) continue
    const body = term.split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${body}(?=$|[^\\p{L}\\p{N}])`, 'iu')
    if (re.test(hay)) out.push(term)
  }
  return out
}

/** Characters a board font often lacks: modifier letters and combining marks used in Nation names (e.g. xʷməθkʷəy̓əm). */
export function needsGlyphCheck(text: string): boolean {
  return /[ʰ-˿̀-ͯ᷀-᷿]/u.test(text.normalize('NFC'))
}

/** Every text printed on a board (title, text frames, captions), for the anonymity and glyph checks. */
export function boardTexts(board: Board, images: Record<string, BoardImage>): string[] {
  const out: string[] = []
  for (const f of board.frames) {
    if (f.content.kind === 'text' && f.content.text.trim()) out.push(f.content.text)
    if (f.content.kind === 'image') { const c = printedCaption(f, images[f.content.imageId]); if (c) out.push(c) }
  }
  return out
}

// ---------------------------------------------------------------- board checks
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

export interface BoardCheckInput { boards: Board[]; images: Record<string, BoardImage>; denyList: string[]; overflow?: Record<string, string[]> }

export function isBoardUsed(b: Board) { return b.frames.some((f) => f.role === 'body' && f.content.kind !== 'empty') }

/** Checks on one composed board (before export): resolution, type size, AI labels, identifying words, glyphs. */
export function boardChecks(b: Board, n: number, input: BoardCheckInput): RuleResult[] {
  const out: RuleResult[] = []
  const placed = b.frames.flatMap((f) => f.content.kind === 'image' ? [{ f, c: f.content, img: input.images[f.content.imageId] }] : []).filter((p) => p.img)
  const raster = placed.filter((p) => !p.img!.vector)
  if (raster.length) {
    const ppis = raster.map((p) => ({ p, ppi: effectivePpi(imagePlacement(p.f, p.img!, p.c.fit, !!printedCaption(p.f, p.img)).mmPerPx) }))
    const low = ppis.reduce((a, x) => (x.ppi < a.ppi ? x : a))
    out.push(rule(`b${n}-ppi`, 'Image resolution', `lowest ${Math.round(low.ppi)} px/inch (${low.p.img!.label})`, '≥ 150 px/inch; below 100 looks soft', low.ppi >= 150 ? 'pass' : low.ppi >= 100 ? 'warn' : 'fail', 'team_assumption', TEAM,
      low.ppi < 150 ? 'Capture with a larger window, use a render at its native size, or give the image a smaller frame. Floor plans added as vector stay sharp at any size.' : undefined))
  }
  const sizes = b.frames.flatMap((f) => f.content.kind === 'text' && f.content.text.trim() ? [f.content.sizeMm] : [])
  if (placed.some((p) => printedCaption(p.f, p.img))) sizes.push(CAPTION_MM)
  if (sizes.length) {
    const min = Math.min(...sizes)
    out.push(rule(`b${n}-type`, 'Smallest type', `${min} mm`, '≥ 3.5 mm (about 11 px when the board is shown 1920 px wide); below 2.5 mm is unreadable', min >= 3.5 ? 'pass' : min >= 2.5 ? 'warn' : 'fail', 'team_assumption', TEAM))
  }
  const ai = placed.filter((p) => imageSource(p.img) === 'ai')
  if (ai.length) out.push(rule(`b${n}-ai`, 'AI images labelled', `${ai.length} of ${ai.length} carry "AI-generated image"`, 'every AI-derived image has a visible label', 'pass', 'team_assumption', TEAM, 'The label is printed by the composer and cannot be removed; Buildner\'s terms read in research have no AI rule.'))
  const texts = boardTexts(b, input.images)
  const found = [...new Set(texts.flatMap((t) => findTerms(t, input.denyList)))]
  if (texts.length) out.push(rule(`b${n}-anon`, 'No identifying words', found.length ? `found: ${found.join(', ')}` : `none of ${input.denyList.length} listed words`, 'no names, school, course or tool names on the board', found.length ? 'fail' : 'pass', 'verified', BRIEF('p.27'),
    'Boards "must not indicate any information related to an individual\'s/team\'s identity"; entrants who do not comply are disqualified without refund. This scans the text the composer prints, not text inside images: the visual check covers those.'))
  if (texts.some(needsGlyphCheck)) out.push(rule(`b${n}-glyph`, 'Nation names: glyphs', 'text with modifier letters or combining marks', 'every character drawn by the board font', 'warn', 'team_assumption', TEAM, 'Check these names at 100% zoom in the exported JPEG: a font without the glyphs substitutes them and misspells the name.'))
  const over = input.overflow?.[b.id] ?? []
  if (over.length) out.push(rule(`b${n}-overflow`, 'Text fits its frame', `${over.length} frame${over.length > 1 ? 's' : ''} cut off`, 'all text visible', 'warn', 'team_assumption', TEAM, 'Shorten the text, lower the type size (not below 3.5 mm) or use a larger frame.'))
  return out
}

/** Count of each deliverable placed across the boards (frame tags). */
export function coverage(boards: Board[]): Record<DeliverableId, number> {
  const c = Object.fromEntries(DELIVERABLES.map((d) => [d.id, 0])) as Record<DeliverableId, number>
  for (const b of boards) for (const f of b.frames) if (f.tag && f.content.kind !== 'empty') c[f.tag] += 1
  return c
}

/** Submission-level checks: board count and the brief's suggested set. */
export function submissionChecks(boards: Board[]): RuleResult[] {
  const used = boards.filter(isBoardUsed).length
  const cov = coverage(boards)
  const met = DELIVERABLES.filter((d) => cov[d.id] >= d.min).length
  return [
    rule('sub-count', 'Four A2 landscape boards', `${used} of ${BOARD_COUNT} boards have content`, 'four (4) boards', used === BOARD_COUNT ? 'pass' : 'warn', used === BOARD_COUNT ? 'verified' : 'unresolved', BRIEF('p.27'),
      used === BOARD_COUNT ? undefined : 'The brief says "four (4) A2 landscape-orientated presentation boards" and also shows "up to 4 panels" on the same page. Ask Buildner whether fewer are allowed (questions close 3 Nov, p.25).'),
    rule('sub-coverage', 'Suggested deliverables placed', `${met} of ${DELIVERABLES.length}`, 'the brief\'s minimum materials (a suggestion only)', met === DELIVERABLES.length ? 'pass' : 'warn', 'verified', BRIEF('p.30'),
      'Tag each frame with what it shows. The set is "a suggestion only": leaving an item out is allowed, but say why the boards answer it another way.'),
  ]
}

// ---------------------------------------------------------------- JPEG reading (validator, P13-M06v)
export interface JpegInfo {
  isJpeg: boolean
  width: number
  height: number
  sof: 'baseline' | 'extended' | 'progressive' | 'lossless' | 'other' | null
  components: number
  subsampling: '4:4:4' | '4:2:2' | '4:2:0' | '4:4:0' | '4:1:1' | 'grey' | 'other' | null
  jfifDpi: number | null
  segments: { exif: boolean; xmp: boolean; iptc: boolean; icc: boolean; comment: boolean; adobe: boolean }
  /** Printable text found in metadata segments (EXIF, XMP, IPTC, comments), for the anonymity scan. */
  metadataText: string
}

const SOF: Record<number, JpegInfo['sof']> = { 0xc0: 'baseline', 0xc1: 'extended', 0xc2: 'progressive', 0xc3: 'lossless', 0xc5: 'other', 0xc6: 'other', 0xc7: 'other', 0xc9: 'other', 0xca: 'other', 0xcb: 'other', 0xcd: 'other', 0xce: 'other', 0xcf: 'other' }

const startsWith = (b: Uint8Array, at: number, s: string) => { for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false; return true }

/** Printable ASCII runs (≥ 4 characters) and UTF-16LE runs (Windows XP* tags), like the `strings` tool. */
function strings(b: Uint8Array, from: number, to: number): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = from; i < to; i++) { const c = b[i]; if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c); else { if (cur.length >= 4) out.push(cur); cur = '' } }
  if (cur.length >= 4) out.push(cur)
  cur = ''
  for (let i = from; i + 1 < to; i += 2) { const c = b[i] | (b[i + 1] << 8); if (c >= 0x20 && c < 0xd800 && c !== 0x7f) cur += String.fromCharCode(c); else { if (cur.length >= 4) out.push(cur); cur = '' } }
  if (cur.length >= 4) out.push(cur)
  return out
}

/** Read the header of a JPEG: frame type, size, chroma sampling and metadata segments (stops at the first scan). */
export function parseJpeg(b: Uint8Array): JpegInfo {
  const info: JpegInfo = { isJpeg: false, width: 0, height: 0, sof: null, components: 0, subsampling: null, jfifDpi: null, segments: { exif: false, xmp: false, iptc: false, icc: false, comment: false, adobe: false }, metadataText: '' }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return info
  info.isJpeg = true
  const text: string[] = []
  let p = 2
  while (p + 3 < b.length) {
    if (b[p] !== 0xff) break
    let m = b[p + 1]
    while (m === 0xff && p + 2 < b.length) { p++; m = b[p + 1] }
    if (m === 0xd9) break
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue }
    const len = (b[p + 2] << 8) | b[p + 3]
    const s = p + 4, e = Math.min(b.length, p + 2 + len)
    if (len < 2) break
    if (SOF[m] !== undefined && e - s >= 6) {
      info.sof = SOF[m]
      info.height = (b[s + 1] << 8) | b[s + 2]
      info.width = (b[s + 3] << 8) | b[s + 4]
      info.components = b[s + 5]
      const comps = Array.from({ length: info.components }, (_, i) => ({ h: b[s + 7 + i * 3] >> 4, v: b[s + 7 + i * 3] & 15 }))
      if (info.components === 1) info.subsampling = 'grey'
      else if (comps.length >= 3) {
        const [y, cb, cr] = comps
        const hr = y.h / Math.max(cb.h, cr.h), vr = y.v / Math.max(cb.v, cr.v)
        info.subsampling = hr === 1 && vr === 1 ? '4:4:4' : hr === 2 && vr === 1 ? '4:2:2' : hr === 2 && vr === 2 ? '4:2:0' : hr === 1 && vr === 2 ? '4:4:0' : hr === 4 && vr === 1 ? '4:1:1' : 'other'
      }
    } else if (m === 0xe0 && startsWith(b, s, 'JFIF\0') && e - s >= 12) {
      const units = b[s + 7], xd = (b[s + 8] << 8) | b[s + 9]
      info.jfifDpi = units === 1 ? xd : units === 2 ? Math.round(xd * 2.54) : null
    } else if (m === 0xe1 && startsWith(b, s, 'Exif\0')) { info.segments.exif = true; text.push(...strings(b, s + 6, e)) }
    else if (m === 0xe1 && startsWith(b, s, 'http://ns.adobe.com/xap/1.0/')) { info.segments.xmp = true; text.push(new TextDecoder().decode(b.subarray(s + 29, e))) }
    else if (m === 0xe2 && startsWith(b, s, 'ICC_PROFILE\0')) info.segments.icc = true
    else if (m === 0xed) { info.segments.iptc = true; text.push(...strings(b, s, e)) }
    else if (m === 0xee && startsWith(b, s, 'Adobe')) info.segments.adobe = true
    else if (m === 0xfe) { info.segments.comment = true; text.push(new TextDecoder().decode(b.subarray(s, e))) }
    if (m === 0xda) break
    p = e
  }
  info.metadataText = text.join('\n')
  return info
}

export interface ValidateOptions { denyList: string[]; profile: 'board' | 'cover'; targetBytes?: number }
export interface Manifest { name: string; bytes: number; info: JpegInfo; ratio: number; dpiOnA2: number }

/** Check one JPEG against the brief and Buildner's rules (P13-M06v). The tool never uploads. */
export function validateJpeg(name: string, bytes: Uint8Array, o: ValidateOptions): { manifest: Manifest; rules: RuleResult[] } {
  const info = parseJpeg(bytes)
  const ratio = info.height ? info.width / info.height : 0
  const dpiOnA2 = info.width / (BOARD_W / 25.4)
  const manifest: Manifest = { name, bytes: bytes.length, info, ratio, dpiOnA2 }
  const rules: RuleResult[] = []
  const ext = /\.jpe?g$/i.test(name)
  rules.push(rule('jpg-format', 'JPEG file', info.isJpeg ? (ext ? 'JPEG, .jpg name' : 'JPEG data, but the name does not end in .jpg') : 'not a JPEG', 'saved as .jpg or .jpeg', info.isJpeg && ext ? 'pass' : 'fail', 'verified',
    o.profile === 'cover' ? BRIEF('p.28') : TERMS('4.8'), o.profile === 'board' ? 'The brief (p.27) states size and orientation; the JPEG format comes from Buildner\'s Terms 4.8 as read in research P13.' : undefined))
  const target = o.targetBytes ?? TARGET_BYTES
  const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`
  rules.push(rule('jpg-size', 'File size', `${mb(bytes.length)} (${bytes.length.toLocaleString('en-CA')} bytes)`, `≤ 10 MB, read as ${MAX_BYTES.toLocaleString('en-CA')} bytes; team target ${mb(target)}`,
    bytes.length > MAX_BYTES ? 'fail' : bytes.length > target ? 'warn' : 'pass', 'verified', BRIEF(o.profile === 'cover' ? 'p.28' : 'p.27'), 'MB is not defined, so the stricter 10,000,000 bytes is used.'))
  if (!info.isJpeg || !info.width) return { manifest, rules }
  if (o.profile === 'board') {
    const off = Math.abs(ratio - A2_RATIO)
    rules.push(rule('jpg-ratio', 'A2 landscape proportion', `${info.width} × ${info.height} px, ${ratio.toFixed(3)} : 1`, `landscape, ${A2_RATIO.toFixed(3)} : 1 ± 0.005`,
      ratio < 1 ? 'fail' : off <= 0.005 ? 'pass' : off <= 0.02 ? 'warn' : 'fail', 'verified', BRIEF('p.27'), 'A2 is 594 × 420 mm (ISO 216); the ± 0.005 tolerance is a team choice.'))
    rules.push(rule('jpg-pixels', 'Pixels for print', `${Math.round(dpiOnA2)} dpi at A2`, '≥ 150 dpi (3508 px wide)', dpiOnA2 >= 149.5 ? 'pass' : dpiOnA2 >= 100 ? 'warn' : 'fail', 'team_assumption', TEAM, 'No pixel rule was found in the brief; 150 dpi keeps 2.5 mm text legible.'))
  } else {
    const ok = info.width >= 2000 && info.height >= 1680 && info.width > info.height
    rules.push(rule('jpg-cover', 'Cover image size', `${info.width} × ${info.height} px`, 'at least 2000 × 1680 px, horizontal', ok ? 'pass' : 'fail', 'verified', BRIEF('p.28'), 'The jury does not see the cover image (p.28).'))
  }
  const enc = `${info.sof ?? 'unknown'}${info.subsampling ? `, ${info.subsampling}` : ''}`
  const encState: RuleState = info.sof === 'baseline' && (info.subsampling === '4:4:4' || info.subsampling === 'grey') ? 'pass' : 'warn'
  rules.push(rule('jpg-encoding', 'Encoding', enc, 'baseline, 4:4:4 chroma', encState, 'team_assumption', TEAM,
    encState === 'pass' ? undefined : `${info.sof === 'progressive' ? 'The portal\'s handling of progressive JPEG is not documented. ' : ''}${info.subsampling === '4:2:0' || info.subsampling === '4:2:2' ? 'Chroma subsampling smears thin coloured lines and small coloured type: check them at 100% zoom. ' : ''}Ask Buildner before 3 Nov if unsure.`.trim()))
  const seg = info.segments
  const fields = [seg.exif && 'EXIF', seg.xmp && 'XMP', seg.iptc && 'IPTC', seg.comment && 'comment'].filter(Boolean) as string[]
  const metaHits = findTerms(info.metadataText, o.denyList)
  rules.push(rule('jpg-metadata', 'Metadata', metaHits.length ? `names found: ${metaHits.join(', ')}` : fields.length ? `${fields.join(', ')} present` : 'none (no EXIF, XMP, IPTC or comment)', 'no author, software or location data',
    metaHits.length ? 'fail' : fields.length ? 'warn' : 'pass', 'verified', BRIEF('p.27'), fields.length ? 'Metadata can carry author names, software and location. Re-export from the composer, or strip it (e.g. "Export without metadata"), then check again.' : undefined))
  const nameHits = findTerms(name, o.denyList)
  rules.push(rule('jpg-name', 'File name', nameHits.length ? `contains: ${nameHits.join(', ')}` : name, 'neutral name, no team or school words', nameHits.length ? 'fail' : 'pass', 'verified', BRIEF('p.27')))
  rules.push(rule('jpg-visual', 'Visual check at 100%', 'by a person', 'no logos, crests, signatures, watermarks or names inside the images', 'unknown', 'verified', BRIEF('p.27'), 'This check cannot read text inside images. Open the file at 100% zoom and tick the visual check below.'))
  return { manifest, rules }
}

// ---------------------------------------------------------------- export quality search
/**
 * Highest JPEG quality whose file stays under the target: try the top, then bisect. `encode` returns the byte size
 * for a quality in 0..1. Returns fits=false when even `lo` is too big (then lower the pixel size).
 */
export async function searchQuality(encode: (q: number) => Promise<number>, target: number, lo = 0.7, hi = 0.95, steps = 6): Promise<{ q: number; bytes: number; fits: boolean }> {
  const top = await encode(hi)
  if (top <= target) return { q: hi, bytes: top, fits: true }
  const bottom = await encode(lo)
  if (bottom > target) return { q: lo, bytes: bottom, fits: false }
  let best = { q: lo, bytes: bottom }, a = lo, b = hi
  for (let i = 0; i < steps; i++) {
    const q = Math.round(((a + b) / 2) * 1000) / 1000
    const n = await encode(q)
    if (n <= target) { best = { q, bytes: n }; a = q } else b = q
  }
  return { ...best, fits: true }
}

// ---------------------------------------------------------------- deadline (brief p.25)
/** Closing instant: 30 Nov 2026, 11:59 PM London time (GMT in November) = 23:59 UTC. */
export const DEADLINE_UTC = Date.UTC(2026, 10, 30, 23, 59)
export const MILESTONES: { date: string; label: string; source: Source }[] = [
  { date: '2026-10-29', label: 'Registration closes', source: BRIEF('p.25') },
  { date: '2026-11-03', label: 'Questions close', source: BRIEF('p.25') },
  { date: '2026-11-30', label: 'Upload closes, 11:59 PM London', source: BRIEF('p.25') },
  { date: '2027-01-26', label: 'Winners announced', source: BRIEF('p.25') },
]

/** UTC offset of a time zone at an instant, in minutes (parsed from Intl "GMT-07:00"; "GMT" = 0). */
export function tzOffsetMinutes(instant: number, timeZone: string): number | null {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(instant)).find((p) => p.type === 'timeZoneName')?.value ?? ''
    const m = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(part)
    if (!m) return null
    return m[1] ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
  } catch { return null }
}

export function deadlineInfo(now: number) {
  const ms = DEADLINE_UTC - now
  const fmt = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(DEADLINE_UTC))
  const vanOffset = tzOffsetMinutes(DEADLINE_UTC, 'America/Vancouver')
  const londonOffset = tzOffsetMinutes(DEADLINE_UTC, 'Europe/London')
  return { ms, days: ms / 86_400_000, london: fmt('Europe/London'), vancouver: fmt('America/Vancouver'), vanOffset, londonOffset, closed: ms <= 0 }
}

// ---------------------------------------------------------------- upload gates (P13-M01, manual attestations)
export interface Gate { id: string; label: string; detail: string; source: Source; flag: Flag; perBoard?: boolean }
export const GATES: Gate[] = [
  { id: 'english', label: 'All text in English', detail: 'Explanatory text is English; Nation names keep their own spelling with an English gloss (team reading, ask Buildner if unsure).', source: BRIEF('p.27'), flag: 'verified', perBoard: true },
  { id: 'visual', label: 'Visual anonymity check at 100%', detail: 'Someone who did not compose the board looks for logos, crests, signatures, watermarks and names inside images.', source: BRIEF('p.27'), flag: 'verified', perBoard: true },
  { id: 'eligible', label: 'Eligibility confirmed', detail: 'Each member has read the eligibility clauses (Terms 3.3: no employment or close relation with the organiser or a juror). If a juror teaches at your school, ask Buildner in writing first and log the answer.', source: TERMS('3.3'), flag: 'unresolved' },
  { id: 'registered', label: 'Registered, identity verified', detail: 'Registration closes 29 Oct; upload instructions come by email after registration.', source: BRIEF('p.25, p.27'), flag: 'verified' },
  { id: 'nocontact', label: 'No contact with jurors', detail: 'All questions go to Buildner staff only; contacting a juror disqualifies.', source: BRIEF('p.32'), flag: 'verified' },
  { id: 'unpublished', label: 'Board images not published', detail: 'No board image posted publicly before closing (public repositories, social media, portfolios).', source: TERMS('4.1'), flag: 'unverified' },
  { id: 'rights', label: 'Rights for every image known', detail: 'Own captures and drawings, AI renders under the image service\'s terms, context from the supplied model.', source: TERMS('4.3, 12.2'), flag: 'unverified' },
  { id: 'signed', label: 'Team sign-off', detail: 'Every member has seen the final JPEGs. Upload once: after the first upload, changes need a paid reactivation.', source: TERMS('4.7'), flag: 'unverified' },
]

export const DEFAULT_DENY = ['UBC', 'University of British Columbia', 'SALA', 'ARCH 540', 'Tower Design Toolkit', 'Tower Studio']
