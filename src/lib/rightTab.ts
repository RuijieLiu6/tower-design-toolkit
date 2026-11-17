// The right panel's open tab (components/RightPanel.tsx), kept here so other places can open one: the tool rail's
// Presentation tools open Present and Render (components/ToolRail.tsx). The panel itself sets it as the phase, the Site
// step, a picked node or a new tower ask.
import { create } from 'zustand'

export type RightTab = 'properties' | 'site' | 'results' | 'present' | 'render' | 'trace' | 'draw'
export const useRightTab = create<{ tab: RightTab }>(() => ({ tab: 'results' }))
export const setRightTab = (tab: RightTab | ((cur: RightTab) => RightTab)) => useRightTab.setState((s) => ({ tab: typeof tab === 'function' ? tab(s.tab) : tab }))
