// Which side panels are showing (UI review, 3 Nov: at 1440 px the two panels left the map about half the window).
// Hidden, a panel folds to a thin rail with a button to bring it back; [ and ] toggle them. Remembered in this browser.
import { create } from 'zustand'

export type Side = 'left' | 'right'
const KEY = 'ts.panels'

function read(): Record<Side, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Side, boolean>>
    return { left: v.left !== false, right: v.right !== false }
  } catch { return { left: true, right: true } }
}

export const usePanels = create<Record<Side, boolean>>(() => read())
usePanels.subscribe((s) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage off: still works this session */ } })

export function togglePanel(side: Side) {
  usePanels.setState((s) => ({ [side]: !s[side] }) as Record<Side, boolean>)
}

export const PANEL_NAME: Record<Side, string> = { left: 'design tools', right: 'results' }

// ---------------------------------------------------------------- widths (overnight brief, 8 Nov)
// "Start with narrower, adjustable panels": about 288 px left and 304 px right at 1440 px (264 / 280 px below 1400 px,
// so the model keeps at least 55% of a 1280 px window; src/index.css --left-w / --right-w). A drag on the edge between a
// panel and the model, or the arrow keys on it, sets a width of its own (240–440 px); a double-click goes back to the
// default. Remembered in this browser.
const WKEY = 'ts.panelWidths'
export const WIDTH_MIN = 240, WIDTH_MAX = 440
type Widths = Partial<Record<Side, number>>
function readWidths(): Widths {
  try { const v = JSON.parse(localStorage.getItem(WKEY) ?? '{}') as Widths; return v && typeof v === 'object' ? v : {} } catch { return {} }
}
export const usePanelWidths = create<Widths>(() => readWidths())
usePanelWidths.subscribe((s) => { try { localStorage.setItem(WKEY, JSON.stringify(s)) } catch { /* this session only */ } })
export const clampWidth = (w: number) => Math.round(Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, w)))
export function setPanelWidth(side: Side, w: number | null) {
  usePanelWidths.setState((s) => { const n = { ...s }; if (w == null) delete n[side]; else n[side] = clampWidth(w); return n }, true)
}
