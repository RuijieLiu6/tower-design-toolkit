// Engagement ledger, claims text, contact-guard acknowledgement, eligibility records and the AI-use log
// (research P07-M01, M07). Private: kept in this browser only (localStorage `ts.culture`), never in a project file
// or an export. The eligibility records in particular are never exported.
import { create } from 'zustand'
import { DEFAULT_RECORD, NATIONS, type Nation, type NationRecord } from '../engine/culture'
import type { ProvEntry } from '../engine/provenance'

interface CultureState {
  records: Record<Nation, NationRecord>
  claimsText: string
  contactAck: boolean
  verifiedBy: string
  verifiedOn: string
  eligibility: { authors: boolean; associate: boolean; instructor: boolean }
  prov: ProvEntry[]
  setRecord: (n: Nation, patch: Partial<NationRecord>) => void
  set: (patch: Partial<Omit<CultureState, 'set' | 'setRecord' | 'addProv' | 'updateProv' | 'removeProv'>>) => void
  addProv: () => void
  updateProv: (id: string, patch: Partial<ProvEntry>) => void
  removeProv: (id: string) => void
}

const KEY = 'ts.culture'
const load = (): Partial<CultureState> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const saved = load()

export const useCultureStore = create<CultureState>((set) => ({
  records: Object.fromEntries(NATIONS.map((n) => [n, { ...DEFAULT_RECORD, ...(saved.records?.[n] ?? {}) }])) as Record<Nation, NationRecord>,
  claimsText: saved.claimsText ?? '',
  contactAck: saved.contactAck ?? false,
  verifiedBy: saved.verifiedBy ?? '',
  verifiedOn: saved.verifiedOn ?? '',
  eligibility: saved.eligibility ?? { authors: false, associate: false, instructor: false },
  prov: saved.prov ?? [],
  setRecord: (n, patch) => set((s) => ({ records: { ...s.records, [n]: { ...s.records[n], ...patch } } })),
  set: (patch) => set(patch),
  addProv: () => set((s) => ({ prov: [...s.prov, { id: `p${Date.now().toString(36)}`, element: '', kind: 'image', involvement: 'none', tool: '', toolGenerative: false, date: new Date().toISOString().slice(0, 10), humanContribution: '', decidedBy: 'person', cultural: false, reviewer: '', licence: '', sourceIds: '' }] })),
  updateProv: (id, patch) => set((s) => ({ prov: s.prov.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  removeProv: (id) => set((s) => ({ prov: s.prov.filter((e) => e.id !== id) })),
}))

useCultureStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ records: s.records, claimsText: s.claimsText, contactAck: s.contactAck, verifiedBy: s.verifiedBy, verifiedOn: s.verifiedOn, eligibility: s.eligibility, prov: s.prov }))
  } catch { /* private mode: the ledger lives for this session only */ }
})
