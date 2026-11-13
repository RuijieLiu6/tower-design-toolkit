// Towers hidden from the 3D view by the eye in the set-up panel's Massing tab (Sinnie, 12 Nov). View only: a hidden
// tower still counts in every check.
import { create } from 'zustand'

export const useHiddenTowers = create<{ hidden: Record<string, boolean>; toggle: (id: string) => void }>((set) => ({
  hidden: {},
  toggle: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })),
}))
