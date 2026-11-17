// The drawing tools' state (Ruijie, 17 Nov: Sinnie Choi's modelling tools in the main tool; design after her Toolkit
// build, artifact 1794900977-6d89, and github.com/xubynii/towerdesigntool). Which tool is on, its modes (Line: freeform
// or an offset band; Boolean: union, subtract, intersect), the snapping panel's settings (remembered in this browser),
// the value being typed (Enter commits it), the live dimension tag, the last toast, the first mass of a Boolean. The
// pointer work itself is components/draw/DrawTools3D.tsx; the geometry lib/draw/geometry.ts.
import { create } from 'zustand'
import type { Pt } from './geometry'
import { registerUiItems } from '../ui/registry'
import { useStep } from '../step'
import { useStore } from '../../store'

export type DrawTool = 'select' | 'line' | 'rect' | 'circle' | 'erase' | 'move' | 'copy' | 'rotate' | 'offset' | 'pull' | 'split' | 'bool' | 'length' | 'core' | 'tape'
export interface DrawToolDef { id: DrawTool; label: string; word: string; key: string; hint: string; group: number }

/**
 * The tools and their keys. Sinnie's keys where ours were free; where hers clashed with a Toolkit key (V = Model /
 * Presentation, L = Align to lot, R = Rotate, O = overlays, F = Face / Mass, P = Place) ours stay and the tool takes a
 * free letter: Select S, Line N, Rectangle B, Circle I, Offset G, Push / pull U. Move and Rotate are one tool each: M and
 * R act on whatever is selected, a drawn mass here or a parametric tower through its gizmo.
 */
export const DRAW_TOOLS: DrawToolDef[] = [
  { id: 'select', label: 'Select a mass', word: 'Select', key: 'S', group: 0, hint: 'Click a mass to select it; drag empty space to orbit, right-drag pans, the wheel zooms; Del deletes.' },
  { id: 'line', label: 'Line: a footprint by its corners', word: 'Line', key: 'N', group: 1, hint: 'Click each corner; click the first corner or press Enter to close; Esc cancels. Type a length, Tab for the angle. Offset mode makes a band of a set width.' },
  { id: 'rect', label: 'Rectangle: drag a footprint', word: 'Rectangle', key: 'B', group: 1, hint: 'Drag a footprint on the ground. Start on a roof to stack the new mass on it.' },
  { id: 'circle', label: 'Circle: drag from the centre', word: 'Circle', key: 'I', group: 1, hint: 'Drag from the centre of the circle outwards.' },
  { id: 'erase', label: 'Erase a mass', word: 'Erase', key: 'E', group: 1, hint: 'Click a mass to delete it (Ctrl+Z brings it back).' },
  { id: 'move', label: 'Move the selected mass', word: 'Move', key: 'M', group: 2, hint: 'Drag a mass; the parts of one building move together. A parametric tower moves with its arrows.' },
  { id: 'copy', label: 'Copy / array', word: 'Copy', key: 'C', group: 2, hint: 'Drag a mass to copy it, then type a number and Enter for that many copies at the same spacing.' },
  { id: 'rotate', label: 'Rotate the selected mass', word: 'Rotate', key: 'R', group: 2, hint: 'Drag left or right on a mass, in 5° steps. A parametric tower turns with its arc.' },
  { id: 'offset', label: 'Offset the outline', word: 'Offset', key: 'G', group: 2, hint: 'Drag on a mass to grow or shrink its outline, or type metres and Enter.' },
  { id: 'pull', label: 'Push / pull a face', word: 'Pull', key: 'U', group: 3, hint: 'The face under the pointer lights up; click it, move, click again (or drag). A roof changes storeys, a wall moves. Type a value and Enter.' },
  { id: 'split', label: 'Split a mass', word: 'Split', key: 'X', group: 3, hint: 'Click where the cut starts, then the other end; it snaps to corners, middles and edges. In a side view, click at a floor to split into lower and upper.' },
  { id: 'bool', label: 'Boolean: union, subtract, intersect', word: 'Boolean', key: 'J', group: 3, hint: 'Click the first mass, then the second. Each part keeps its own height.' },
  { id: 'length', label: 'Edit a wall’s length', word: 'Length', key: '', group: 3, hint: 'Click a wall, type its new length and press Enter.' },
  { id: 'core', label: 'Place the core', word: 'Core', key: '', group: 3, hint: 'Drag inside a mass to place its core; click a core to remove it.' },
  { id: 'tape', label: 'Tape measure', word: 'Tape', key: 'T', group: 4, hint: 'Click two points to read the distance.' },
]
export const drawToolDef = (id: DrawTool) => DRAW_TOOLS.find((t) => t.id === id)!
// Each drawing tool is a part of the interface the drawer can hide (lib/ui/registry.ts), under Design tools › Drawing tools.
registerUiItems('tools.draw', [{ id: 'tools.draw', label: 'Drawing tools (Form step)', parent: 'tools', mode: 'model' }, ...DRAW_TOOLS.filter((t) => t.id !== 'move' && t.id !== 'rotate').map((t) => ({ id: `tools.draw.${t.id}`, label: t.label, parent: 'tools.draw', mode: 'model' as const, hint: t.hint }))])
export const DRAW_KEY: Record<string, DrawTool> = Object.fromEntries(DRAW_TOOLS.filter((t) => t.key).map((t) => [t.key.toLowerCase(), t.id]))

export interface SnapSettings { grid: boolean; gridSize: 0.25 | 0.5 | 1 | 2 | 5; corner: boolean; mid: boolean; edge: boolean; align: boolean; dir: boolean; angle: 0 | 5 | 15 | 30 | 45 | 90 }
export const DEFAULT_SNAP: SnapSettings = { grid: true, gridSize: 0.5, corner: true, mid: true, edge: true, align: true, dir: true, angle: 15 }
const SNAP_KEY = 'ts.draw.snap'
function readSnap(): SnapSettings {
  try { const v = JSON.parse(localStorage.getItem(SNAP_KEY) ?? 'null'); return v && typeof v === 'object' ? { ...DEFAULT_SNAP, ...v } : DEFAULT_SNAP } catch { return DEFAULT_SNAP }
}

export interface DrawState {
  tool: DrawTool | null
  lineMode: 'free' | 'offset'
  lineWidth: number
  lineAlign: 'c' | 'i' | 'e'
  boolMode: 'union' | 'subtract' | 'intersect'
  snap: SnapSettings
  /** The digits typed for the tool (Enter commits, Backspace edits, Esc clears). */
  typed: string
  /** The live dimension tag: text at a point in the project frame (x, y, z). */
  tag: { text: string; at: [number, number, number] } | null
  /** The last short toast, with a counter so the same text shows again. */
  toast: { text: string; n: number } | null
  /** The first mass of a Boolean, waiting for the second. */
  boolFirst: string | null
  /** A wall picked for Edit length: the mass and the edge. */
  edge: { id: string; i: number } | null
  /** The last copy drag, so a typed count lays the row. */
  lastCopy: { id: string; dx: number; dy: number } | null
  /** The two points of the tape. */
  tape: Pt[]
}
export const useDraw = create<DrawState>(() => ({
  tool: null, lineMode: 'free', lineWidth: 12, lineAlign: 'c', boolMode: 'union', snap: typeof window !== 'undefined' ? readSnap() : DEFAULT_SNAP,
  typed: '', tag: null, toast: null, boolFirst: null, edge: null, lastCopy: null, tape: [],
}))
useDraw.subscribe((s, prev) => { if (s.snap !== prev.snap) try { localStorage.setItem(SNAP_KEY, JSON.stringify(s.snap)) } catch { /* this visit only */ } })

/** Start a tool (null: back to Select, which is "no tool" for the rest of the app). The tool's own state resets. */
export function setDrawTool(tool: DrawTool | null) {
  useDraw.setState({ tool: tool === 'select' ? 'select' : tool, typed: '', tag: null, boolFirst: null, edge: null, tape: [] })
}
export const endDrawTool = () => setDrawTool(null)
// The tools belong to the Form step in Model: leaving the step or the stage ends the one that is on.
useStep.subscribe((s, prev) => { if (s.step !== prev.step && useDraw.getState().tool) endDrawTool() })
useStore.subscribe((s, prev) => { if (s.phase !== prev.phase && useDraw.getState().tool) endDrawTool() })
export const toast = (text: string) => useDraw.setState((s) => ({ toast: { text, n: (s.toast?.n ?? 0) + 1 } }))
export const setTag = (tag: DrawState['tag']) => useDraw.setState({ tag })
export const setSnap = (patch: Partial<SnapSettings>) => useDraw.setState((s) => ({ snap: { ...s.snap, ...patch } }))
/** The value typed so far, as a number, or null. */
export const typedNumber = (s = useDraw.getState()) => { const v = parseFloat(s.typed); return Number.isFinite(v) ? v : null }
/** Grid snapping of one coordinate (Alt held: a tenth of a metre). */
export const snapTo = (v: number, snap: SnapSettings, alt = false) => (snap.grid && !alt ? Math.round(v / snap.gridSize) * snap.gridSize : Math.round(v * 10) / 10)
