// Presets of the pedestrian wind screen (team assumptions, editable), kept in this browser (localStorage `ts.windScreen`).
import { create } from 'zustand'
import { DEFAULT_WIND_SCREEN, type WindScreenPresets } from '../engine/windScreen'

const KEY = 'ts.windScreen'
function read(): WindScreenPresets {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...DEFAULT_WIND_SCREEN, ...JSON.parse(raw) } : DEFAULT_WIND_SCREEN } catch { return DEFAULT_WIND_SCREEN }
}

export const useWindScreenStore = create<{ presets: WindScreenPresets; set: (p: Partial<WindScreenPresets>) => void; reset: () => void }>((set, get) => ({
  presets: read(),
  set: (p) => { const presets = { ...get().presets, ...p }; set({ presets }); try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* storage blocked: keep in memory */ } },
  reset: () => { set({ presets: DEFAULT_WIND_SCREEN }); try { localStorage.removeItem(KEY) } catch { /* ignore */ } },
}))
