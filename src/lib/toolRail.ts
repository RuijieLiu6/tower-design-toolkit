// Whether the tool rail beside the model (components/ToolRail.tsx) is showing. H hides and shows it; remembered in this
// browser (ts.toolRail.hidden), like the side panels (lib/panels.ts).
import { create } from 'zustand'

const KEY = 'ts.toolRail.hidden'
function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export const useToolRail = create<{ hidden: boolean }>(() => ({ hidden: typeof window !== 'undefined' ? read() : false }))
useToolRail.subscribe((s) => { try { localStorage.setItem(KEY, s.hidden ? '1' : '0') } catch { /* storage off: this session only */ } })

export const toggleToolRail = () => useToolRail.setState((s) => ({ hidden: !s.hidden }))
