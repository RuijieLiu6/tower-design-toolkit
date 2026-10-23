// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Community nodes ("My nodes") and the node builder on the Customize page.
// The node-builder work owns the package format (lib/nodePackages.ts), local import (lib/communityStore.ts), live
// runs (hooks/useCommunityResults.ts) and the dialog (components/NodeBuilder.tsx → NodeBuilderDialog). This file is
// the only place the builder touches them, so a change to their API is fixed here.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react'
import type { NodeDef } from '../../data/registry'
import { useCommunityResults } from '../../hooks/useCommunityResults'
import { useCommunityNodeDefs, useCommunityStore, type BuilderTab } from '../../lib/communityStore'
import { summarize } from '../../lib/nodePackages'
import type { Item, NodeOutput } from '../../lib/workflowLogic'

export { NodeBuilderHost } from '../NodeBuilder'

/** Imported packages as library entries (shown under "My nodes"). */
export const useCommunityNodes = (): NodeDef[] => useCommunityNodeDefs()

/** Open the node builder dialog on its build (AI skill) or import tab. */
export const openNodeBuilder = (tab: BuilderTab) => useCommunityStore.getState().openDialog(tab)

const TONE_STATE = { ok: 'pass', warn: 'warn', bad: 'fail', muted: 'unknown' } as const

/** Live output of an imported node on the current design, as workflow lines (flags and sources kept). */
export function useCommunityOutput(): (def: NodeDef) => NodeOutput | null {
  const runs = useCommunityResults()
  return useCallback((def: NodeDef) => {
    const run = runs.get(def.id)
    if (!run) return null
    if (!run.applies) return { state: 'idle', headline: 'Does not apply to this project', items: [] }
    if (run.error) return { state: 'fail', headline: `Could not run: ${run.error}`, items: [] }
    const items: Item[] = run.results.map((r) => ({
      id: r.id, label: r.label, value: r.value, threshold: r.threshold, state: r.state, flag: r.flag, source: r.source, note: r.note,
      // Result ids are "<metric>@<tower id>" for per-tower metrics, so Compare can split them by option.
      towerId: r.per === 'tower' ? r.id.slice(r.id.indexOf('@') + 1) : undefined, towerName: r.towerName,
    }))
    const s = summarize(run.results)
    return { state: TONE_STATE[s.tone], headline: s.text, items }
  }, [runs])
}
