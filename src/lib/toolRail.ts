// The tool rail beside the model (components/ToolRail.tsx): whether it is showing and which side of the model it is on.
// H hides and shows it; its grip drags it to the other side (or the arrow keys on the grip). Both remembered in this
// browser (ts.toolRail.hidden, ts.toolRail.side), like the side panels (lib/panels.ts).
import { create } from 'zustand'

export type RailSide = 'left' | 'right'
const HIDDEN = 'ts.toolRail.hidden', SIDE = 'ts.toolRail.side'
const DEFAULT = { hidden: false, side: 'left' as RailSide }
function read(): { hidden: boolean; side: RailSide } {
  try { return { hidden: localStorage.getItem(HIDDEN) === '1', side: localStorage.getItem(SIDE) === 'right' ? 'right' : 'left' } } catch { return DEFAULT }
}

export const useToolRail = create<{ hidden: boolean; side: RailSide }>(() => (typeof window !== 'undefined' ? read() : DEFAULT))
useToolRail.subscribe((s) => { try { localStorage.setItem(HIDDEN, s.hidden ? '1' : '0'); localStorage.setItem(SIDE, s.side) } catch { /* storage off: this session only */ } })

export const toggleToolRail = () => useToolRail.setState((s) => ({ hidden: !s.hidden }))
export const setToolRailSide = (side: RailSide) => useToolRail.setState({ side })
