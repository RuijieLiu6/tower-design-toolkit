// Views inside a merged tool's lead (node placement, 21 Nov 2026): a lead whose results are long splits them into tabs of
// its own, shown in the same strip as its parts' tabs (components/RightPanel.tsx). A view is display only: the lines keep
// their ids, the evidence hub and the trace list them as before, and switching a view runs nothing. First: Structure
// (System & seismic, Lateral & sway, Floors & spans), beside its part Wind procedure.
import { create } from 'zustand'
import { STRUCTURE_TABS, structureTabOf } from '../engine/structure'

export interface LeadView { id: string; tab: string; /** The view shows this line (a rule id inside the node's results). */ has: (lineId: string) => boolean }

export const LEAD_VIEWS: Record<string, LeadView[]> = {
  'built.structure': STRUCTURE_TABS.map((g) => ({ id: g.id, tab: g.tab, has: (lineId: string) => structureTabOf(lineId) === g.id })),
}

/** The view picked for each lead in this visit (the first view until one is picked). */
export const useLeadView = create<{ view: Record<string, string>; setView: (lead: string, id: string) => void }>((set) => ({
  view: {},
  setView: (lead, id) => set((s) => ({ view: { ...s.view, [lead]: id } })),
}))

/** The lead's current view, or null for a lead without views. */
export function viewOf(lead: string, picked: Record<string, string> = useLeadView.getState().view): LeadView | null {
  const views = LEAD_VIEWS[lead]
  if (!views?.length) return null
  return views.find((v) => v.id === picked[lead]) ?? views[0]
}

/** Rule id of a decision-trace line ("structure:t1:core-alone" → "core-alone"; one tower: "structure:core-alone"). */
export function lineRuleId(id: string): string {
  const parts = id.split(':')
  return parts.slice(parts.length > 2 ? 2 : 1).join(':')
}

/** The lines a view shows, in their order; a lead without views (or no view) shows them all. */
export function inView<T extends { id: string }>(lines: T[], view: LeadView | null, idOf: (x: T) => string = (x) => x.id): T[] {
  return view ? lines.filter((x) => view.has(idOf(x))) : lines
}
