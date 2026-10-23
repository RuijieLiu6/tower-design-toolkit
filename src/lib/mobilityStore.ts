// Inputs of the parking, loading and bicycle node (provided counts, dock screening, access points on the VTC block).
// Kept in this browser (localStorage `ts.mobility`); not yet in the project file.
import { create } from 'zustand'
import { DEFAULT_MOBILITY, type AccessPoint, type MobilityInput } from '../engine/mobility'

interface MobilityState extends MobilityInput {
  selected: string | null
  set: (patch: Partial<MobilityInput & { selected: string | null }>) => void
  moveAccess: (id: string, patch: Partial<AccessPoint>) => void
  addAccess: (kind: AccessPoint['kind']) => void
  removeAccess: (id: string) => void
}

const KEY = 'ts.mobility'
const load = (): Partial<MobilityInput> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }

export const useMobilityStore = create<MobilityState>((set) => ({
  ...DEFAULT_MOBILITY,
  ...load(),
  selected: null,
  set: (patch) => set(patch),
  moveAccess: (id, patch) => set((s) => ({ access: s.access.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  addAccess: (kind) => set((s) => { const id = `a${Date.now().toString(36)}`; return { access: [...s.access, { id, kind, edge: 'north', at: 0.4 }], selected: id } }),
  removeAccess: (id) => set((s) => ({ access: s.access.filter((a) => a.id !== id), selected: s.selected === id ? null : s.selected })),
}))

useMobilityStore.subscribe((s) => {
  const { carStalls, accessibleStalls, loadingB, loadingC, bikeA, bikeB, trucksPerHour, dwellMin, access } = s
  try { localStorage.setItem(KEY, JSON.stringify({ carStalls, accessibleStalls, loadingB, loadingC, bikeA, bikeB, trucksPerHour, dwellMin, access })) } catch { /* private mode */ }
})
