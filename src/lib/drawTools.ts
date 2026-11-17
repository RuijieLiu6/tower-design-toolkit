// The design tools of the Tower Workspace, in the toolkit (Sinnie, 12 Nov: "properly import the design tools from the
// tower design tool to design toolkit. exactly the same"). Same tools, order, keys, icons, hints and snapping settings as
// the workspace's TOOLS / HINTS / S.sn / S.line; the pointer logic is components/draw/DrawTools.tsx.
import { create } from 'zustand'

export type ToolId = 'select' | 'line' | 'rect' | 'circle' | 'erase' | 'move' | 'copy' | 'rotate' | 'off' | 'pull' | 'split' | 'bool' | 'len' | 'core' | 'measure' | 'place'
export interface ToolDef { id: ToolId; label: string; key: string; d: string }

/** The rail, top to bottom; 0 = a divider. Icon paths on a 20-unit grid (the workspace's own). */
export const TOOLS: (ToolDef | 0)[] = [
  { id: 'select', label: 'Select', key: 'V', d: 'M5 3l10 7-5 1-2 5z' }, 0,
  { id: 'line', label: 'Line: click corners, click the first to close', key: 'L', d: 'M4 16L16 4M3 17h2v-2H3zM15 5h2V3h-2z' },
  { id: 'rect', label: 'Rectangle', key: 'R', d: 'M4 5h12v10H4z' },
  { id: 'circle', label: 'Circle', key: 'O', d: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z' },
  { id: 'erase', label: 'Erase', key: 'E', d: 'M8 16h8M5 12l6-7 5 4-6 7H8z' }, 0,
  { id: 'move', label: 'Move', key: 'M', d: 'M10 3v14M3 10h14M8 5l2-2 2 2M8 15l2 2 2-2M5 8l-2 2 2 2M15 8l2 2-2 2' },
  { id: 'copy', label: 'Copy / array', key: 'C', d: 'M7 7h9v9H7zM4 13V4h9' },
  { id: 'rotate', label: 'Rotate', key: 'Q', d: 'M15 10a5 5 0 1 1-2-4M13 3v3h3' },
  { id: 'off', label: 'Offset', key: 'F', d: 'M4 16V4h12M8 16V8h8' }, 0,
  { id: 'pull', label: 'Push / pull', key: 'P', d: 'M5 16h10M10 13V4M7 7l3-3 3 3' },
  { id: 'split', label: 'Split', key: 'X', d: 'M4 4h12v12H4zM3 14L17 6' },
  { id: 'bool', label: 'Boolean', key: 'J', d: 'M8 5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 6a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z' },
  { id: 'len', label: 'Edit length', key: '', d: 'M3 13h14M3 10v6M17 10v6M8 6h4' },
  { id: 'core', label: 'Core', key: '', d: 'M4 4h12v12H4zM8 8h4v4H8zM8 8l4 4M12 8l-4 4' }, 0,
  { id: 'measure', label: 'Tape', key: 'T', d: 'M3 13L13 3l4 4L7 17zM7 9l2 2M10 6l2 2' }, 0,
  { id: 'place', label: 'Place a tower', key: 'A', d: 'M10 17v-5M10 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8z' },
]
export const toolDef = (id: ToolId) => TOOLS.find((t): t is ToolDef => !!t && t.id === id)

export const HINTS: Record<ToolId, string> = {
  select: '<b>Select</b> Click to select · right-drag orbits · drag empty space pans · wheel zooms · Del deletes · Shift+F frames',
  line: '<b>Line</b> Click each corner · click the first corner or press Enter to close · Esc cancels',
  rect: '<b>Rectangle</b> Drag a footprint on the ground. Start on a roof to stack the new mass on it',
  circle: '<b>Circle</b> Drag from the centre',
  erase: '<b>Erase</b> Click a mass',
  move: '<b>Move</b> Drag a mass. Parts of one building move together',
  copy: '<b>Copy / array</b> Drag a mass to copy it · then type a number and Enter for that many copies at the same spacing',
  rotate: '<b>Rotate</b> Drag left or right on a mass, in 5° steps',
  off: '<b>Offset</b> Drag on a mass to grow or shrink its outline · or type metres and Enter',
  pull: '<b>Push / pull</b> The face under the pointer lights up · click it, move, click again to set it (or drag) · a roof changes storeys, a wall moves · type a value and Enter',
  split: '<b>Split</b> Click a mass where the cut starts, then the other end · it snaps to corners, middles and edges · in a side view, click at a floor to split it into lower and upper',
  bool: '<b>Boolean</b> Click the first mass, then the second',
  len: '<b>Edit length</b> Click a wall, type its new length and press Enter',
  core: '<b>Core</b> Drag inside a mass to place its core · click a core to remove it',
  measure: '<b>Tape</b> Click two points',
  place: '<b>Place a tower</b> Click on the site where the toolkit tower should stand',
}

export type V3 = [number, number, number]
export interface OvLine { pts: V3[]; col: string; dashed?: boolean; order?: number }
export interface OvFace { ring: V3[]; holes?: V3[][]; col: string; op: number; order?: number }
export interface OvDot { p: V3; col: string; px: number; kind?: 'sphere' | 'box' | 'wire' }
export interface Overlay { lines: OvLine[]; faces: OvFace[]; dots: OvDot[] }
export const EMPTY_OVERLAY: Overlay = { lines: [], faces: [], dots: [] }

export interface Snapping { gs: number; corner: boolean; mid: boolean; edge: boolean; align: boolean; dir: boolean; angle: number }
interface DrawState {
  tool: ToolId
  /** Select picks a whole mass (drag moves it) or one face (drag pushes / pulls it) (16 Nov, Sinnie). */
  selMode: 'mass' | 'face'
  line: { mode: 'free' | 'offset'; width: number; align: 'c' | 'i' | 'e' }
  bmode: 'union' | 'subtract' | 'intersect'
  sn: Snapping
  /** Grid on (the workspace's P.ui.snap). */
  grid: boolean
  hint: string
  typed: string
  toast: { text: string; n: number } | null
  /** Words by the cursor (the workspace's #dtag), at a point of the model. */
  tag: { text: string; at: V3 } | null
  /** The dimension box by the pointer (the workspace's #dimbox), in canvas pixels. */
  dim: { text: string; x: number; y: number; typing: boolean } | null
  overlay: Overlay
  /** Bumped by setTool so DrawTools drops what the last tool was doing. */
  reset: number
}

export const useDraw = create<DrawState>(() => ({
  tool: 'select', selMode: 'mass', line: { mode: 'free', width: 10, align: 'c' }, bmode: 'union',
  sn: { gs: 0.5, corner: true, mid: true, edge: true, align: true, dir: true, angle: 15 }, grid: true,
  hint: HINTS.select, typed: '', toast: null, tag: null, dim: null, overlay: EMPTY_OVERLAY, reset: 0,
}))

export function setTool(tool: ToolId) {
  useDraw.setState((s) => ({ tool, typed: '', tag: null, dim: null, overlay: EMPTY_OVERLAY, hint: HINTS[tool], reset: s.reset + 1 }))
}
export const hint = (h: string) => useDraw.setState({ hint: h })
export const toast = (text: string) => useDraw.setState((s) => ({ toast: { text, n: (s.toast?.n ?? 0) + 1 } }))
