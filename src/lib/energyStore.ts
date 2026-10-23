// Energy and carbon node inputs (research P04 / P11-M04). Kept in this browser (localStorage `ts.energy`).
import { create } from 'zustand'
import { DEFAULT_ENERGY, type EnergyInput } from '../engine/energyCarbon'

interface EnergyState {
  input: EnergyInput
  set: (patch: Partial<EnergyInput>) => void
  setPv: (patch: Partial<EnergyInput['pv']>) => void
  reset: () => void
}

const KEY = 'ts.energy'
function load(): EnergyInput {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<EnergyInput> | null
    return saved ? { ...DEFAULT_ENERGY, ...saved, pv: { ...DEFAULT_ENERGY.pv, ...(saved.pv ?? {}) } } : DEFAULT_ENERGY
  } catch { return DEFAULT_ENERGY }
}
const save = (input: EnergyInput) => { try { localStorage.setItem(KEY, JSON.stringify(input)) } catch { /* private mode */ } }

export const useEnergyStore = create<EnergyState>((set) => ({
  input: load(),
  set: (patch) => set((s) => { const input = { ...s.input, ...patch }; save(input); return { input } }),
  setPv: (patch) => set((s) => { const input = { ...s.input, pv: { ...s.input.pv, ...patch } }; save(input); return { input } }),
  reset: () => { save(DEFAULT_ENERGY); set({ input: DEFAULT_ENERGY }) },
}))
