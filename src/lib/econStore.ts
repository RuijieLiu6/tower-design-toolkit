// Economics node inputs and edits to its assumption ledger (research P08-M00). Kept in this browser
// (localStorage `ts.econ`); every edited row turns into a team assumption.
import { create } from 'zustand'
import type { AccTreatment } from '../engine/costCharges'
import { DEFAULT_ECON, type EconPresets, type Row } from '../engine/economics'
import type { UseId } from '../engine/types'

export type OverrideKey = Exclude<keyof EconPresets, 'valuePerGfa' | 'hardCost' | 'research'> | `value.${UseId}` | `hard.${UseId}`

interface EconState {
  permitYear: number
  landPrice: number | null
  includeRegional: boolean
  /** P08-M03/M04 choices (item 39). */
  costBasis: 'research' | 'pvv'
  residentialBase: 'coriolis' | 'altus'
  contingency: number
  civicReduced: boolean
  accTreatment: AccTreatment
  overrides: Partial<Record<OverrideKey, number>>
  set: (patch: Partial<Omit<EconState, 'set' | 'setRow' | 'reset'>>) => void
  setRow: (k: OverrideKey, v: number | null) => void
  reset: () => void
}

const KEY = 'ts.econ'
const load = (): Partial<EconState> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }

export const useEconStore = create<EconState>((set) => ({
  permitYear: 2027,
  landPrice: null,
  includeRegional: true,
  costBasis: 'research',
  residentialBase: 'coriolis',
  contingency: 0,
  civicReduced: false,
  accTreatment: 'payable',
  overrides: {},
  ...load(),
  set: (patch) => set(patch),
  setRow: (k, v) => set((s) => {
    const o = { ...s.overrides }
    if (v == null) delete o[k]; else o[k] = v
    return { overrides: o }
  }),
  reset: () => set({ overrides: {} }),
}))

useEconStore.subscribe((s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ permitYear: s.permitYear, landPrice: s.landPrice, includeRegional: s.includeRegional, costBasis: s.costBasis, residentialBase: s.residentialBase, contingency: s.contingency, civicReduced: s.civicReduced, accTreatment: s.accTreatment, overrides: s.overrides })) } catch { /* private mode */ }
})

const edited = (r: Row, v: number): Row => ({ ...r, value: v, flag: 'team_assumption', note: `Edited from ${r.value} (${r.source})`, source: 'Edited by the team' })

/** The default ledger with the user's edits applied. */
export function presetsWith(o: Partial<Record<OverrideKey, number>>): EconPresets {
  const p: EconPresets = { ...DEFAULT_ECON, valuePerGfa: { ...DEFAULT_ECON.valuePerGfa }, hardCost: { ...DEFAULT_ECON.hardCost } }
  for (const [k, v] of Object.entries(o) as [OverrideKey, number][]) {
    if (k.startsWith('value.')) { const u = k.slice(6) as UseId; p.valuePerGfa[u] = edited(p.valuePerGfa[u], v) }
    else if (k.startsWith('hard.')) { const u = k.slice(5) as UseId; const r = p.hardCost[u]; p.hardCost[u] = r ? edited(r, v) : { value: v, unit: 'C$/m² GFA', flag: 'team_assumption', source: 'Entered by the team' } }
    else (p as unknown as Record<string, Row>)[k] = edited((p as unknown as Record<string, Row>)[k], v)
  }
  return p
}
