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
