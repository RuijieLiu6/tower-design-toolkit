// Facade node inputs (research P12-M06a/b): system, WWR by facing, bird-zone treatment and glass properties.
// Kept in this browser (localStorage `ts.facade`); not yet in the project file.
import { create } from 'zustand'
import { DEFAULT_FACADE, type FacadeInput } from '../engine/facade'

interface FacadeState extends FacadeInput { set: (patch: Partial<FacadeInput>) => void }

const KEY = 'ts.facade'
const load = (): Partial<FacadeInput> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }

export const useFacadeStore = create<FacadeState>((set) => ({ ...DEFAULT_FACADE, ...load(), set: (patch) => set(patch) }))

useFacadeStore.subscribe((s) => {
  const { system, wwr, treated, vegetation, vlt, shgc } = s
  try { localStorage.setItem(KEY, JSON.stringify({ system, wwr, treated, vegetation, vlt, shgc })) } catch { /* private mode */ }
})
