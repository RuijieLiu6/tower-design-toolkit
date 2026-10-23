// Presets of the trips & station-entrance node (team assumptions and your own station inputs), kept in this browser
// (localStorage `ts.trips`).
import { create } from 'zustand'
import { DEFAULT_TRIPS, type TripPresets } from '../engine/trips'

const KEY = 'ts.trips'
function read(): TripPresets {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...DEFAULT_TRIPS, ...JSON.parse(raw) } : DEFAULT_TRIPS } catch { return DEFAULT_TRIPS }
}

export const useTripStore = create<{ presets: TripPresets; set: (p: Partial<TripPresets>) => void; reset: () => void }>((set, get) => ({
  presets: read(),
  set: (p) => { const presets = { ...get().presets, ...p }; set({ presets }); try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* storage blocked: keep in memory */ } },
  reset: () => { set({ presets: DEFAULT_TRIPS }); try { localStorage.removeItem(KEY) } catch { /* ignore */ } },
}))
