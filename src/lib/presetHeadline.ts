// The line that leads a node's results in a workflow preset (node placement, 21 Nov 2026). Sun on the design's own
// square (P1 #3, engine/publicRealm.ts squareSunLine) heads Sun and shadow for the people who come for their street, a
// co-design workshop or the public realm (designer.neighbourhood, designer.codesign, planner.public: lib/userTypes.ts
// `headline`). Display only: the line keeps its id and the node that computes it (Open space and links, inside Public
// realm), so the evidence hub and the trace list it as before.
import type { RuleResult } from '../engine/types'
import { presetById } from './userTypes'
import type { Item, NodeOutput } from './workflowLogic'

/** The rule id that leads `node` in the preset, or null. */
export function headlineLineId(node: string, presetId: string | null | undefined): string | null {
  if (!presetId) return null
  return presetById(presetId)?.headline?.[node] ?? null
}

/** Where a headline line is computed, and how to get it when that node is off. */
const HOME: Record<string, { label: string; off: string }> = {
  'pr-square-sun': { label: 'Sun on this design\'s square', off: 'Switch on Public realm (Open space and links) and Solar access & sun hours' },
}

/** Results that may hold the line (hooks/useResults: the ground plane carries the square's sun). */
export interface HeadlineSources { groundPlane?: { rules: RuleResult[] } | null }

/**
 * The headline line from the results; when its node is off it says what to switch on (never a verdict).
 * Solar access off is said by the line itself ("Switch on Solar access & sun hours").
 */
export function headlineLine(id: string, r: HeadlineSources | null | undefined): RuleResult {
  const found = r?.groundPlane?.rules.find((x) => x.id === id)
  if (found) return found
  const home = HOME[id]
  return { id, label: home?.label ?? id, value: home?.off ?? 'Not computed in this workflow', threshold: '', state: 'unknown', flag: 'team_assumption', source: { label: 'Workflow preset headline (lib/presetHeadline.ts)' } }
}

/** A node's canvas output led by the preset's headline line (its state and value become the node's headline). */
export function ledOutput(out: NodeOutput | null, line: RuleResult): NodeOutput {
  const item: Item = { id: line.id, label: line.label, value: line.value, threshold: line.threshold, state: line.state, flag: line.flag, source: line.source, note: line.note }
  const rest = (out?.items ?? []).filter((i) => i.id !== line.id)
  return { ...(out ?? { items: [] }), state: line.state, headline: `${line.label}: ${line.value}`, items: [item, ...rest] }
}
