// Apply and Discard (brief §8): a checked proposal becomes one project change. The target tower keeps its id, name
// and design inputs (updateTower, lib/interchange/apply.ts) and takes the returned geometry as an imported mass; the
// mesh goes to the import store; the run is marked applied (never applied twice); the trace records an iteration;
// everything is one Undo step (history.ts breakStep on both sides). Other towers are not touched. Results invalidate
// by themselves: they key on the towers. Discard clears the proposal and changes nothing.
import { withAutoCore } from '../../engine/lifts'
import type { Tower } from '../../engine/types'
import { useStore } from '../../store'
import { useImportStore } from '../import/store'
import { updateTower } from '../interchange/apply'
import { breakStep } from '../project/history'
import { recordIteration } from '../trace/trace'
import { modelRevision } from '../workflow/phasePackage'
import type { Operation, Proposal, ToolDefinition } from './contract'
import { massFromStoreys } from './geometry'
import { appliedRuns, useDesignTools } from './store'

/** The towers as the proposal would leave them (pure; the preview and Apply both use it). */
export function proposedTowers(towers: Tower[], p: Proposal, def: ToolDefinition, meshId = `tool-${p.runId.slice(0, 8)}`): { towers: Tower[]; meshes: Record<string, ReturnType<typeof massFromStoreys>['mesh']> } {
  const meshes: Record<string, ReturnType<typeof massFromStoreys>['mesh']> = {}
  const s = useStore.getState()
  const next = towers.map((old) => {
    let t = old
    for (const op of p.operations as Operation[]) {
      if (op.target !== old.id) continue
      if (op.op === 'set-parameter') { t = { ...t, [op.field]: op.value }; continue }
      const id = `${meshId}-${old.id}`
      const { mass, mesh } = massFromStoreys(op.storeys, { meshId: id, toolName: def.name, f2f: old.f2f, podiumUse: old.podiumUse, bandUse: old.bands[0]?.use ?? 'residential' })
      meshes[id] = mesh
      const provenance = { ...mass, tool: { toolId: p.toolId, version: p.toolVersion, runId: p.runId, at: new Date().toISOString(), parameters: p.parameters } }
      // a fresh tower record carrying the mass; updateTower keeps the old id, name, bands and design inputs
      const fresh: Tower = { ...old, imported: provenance, blocks: undefined, boxFromBlocks: undefined }
      t = withAutoCore(updateTower({ ...t, blocks: undefined, boxFromBlocks: undefined }, fresh), s.liftPresets, s.egressPresets)
    }
    return t
  })
  return { towers: next, meshes }
}

/** Apply the pending proposal: one change, one undo step, provenance kept, the run marked applied. */
export function applyPending(): { ok: true; changed: string[] } | { ok: false; reason: string } {
  const dt = useDesignTools.getState()
  const pend = dt.pending
  if (!pend) return { ok: false, reason: 'Nothing to apply.' }
  const def = dt.definitions[pend.proposal.toolId]
  if (!def) return { ok: false, reason: 'The tool is no longer installed.' }
  if (!pend.check.ok) return { ok: false, reason: pend.check.problems[0] ?? 'The proposal did not pass its checks.' }
  if (appliedRuns(def.id).has(pend.proposal.runId)) return { ok: false, reason: 'This proposal was already applied.' }
  const s = useStore.getState()
  const list = s.towers[s.project]
  // stale: the model moved on since the inputs went out (brief §9): never applied silently
  if (modelRevision(list) !== pend.proposal.baseRevision) return { ok: false, reason: 'The model changed since the inputs were sent. Run the tool again.' }
  const { towers, meshes } = proposedTowers(list, pend.proposal, def)
  const changed = towers.filter((t, i) => t !== list[i]).map((t) => t.id)
  for (const [id, mesh] of Object.entries(meshes)) useImportStore.getState().putMesh(id, mesh)
  breakStep()
  useStore.setState({ towers: { ...s.towers, [s.project]: towers }, announce: `${def.name}: ${changed.length} tower${changed.length === 1 ? '' : 's'} changed. Ctrl+Z takes it back.` })
  breakStep()
  useDesignTools.setState((st) => {
    const inst = st.instanceOf(def.id)
    return { pending: null, run: null, instances: { ...st.instances, [def.id]: { ...inst, parameters: pend.proposal.parameters ?? inst.parameters, runs: inst.runs.map((r) => (r.runId === pend.proposal.runId ? { ...r, status: 'applied' as const } : r)), mappings: { ...inst.mappings, ...Object.fromEntries(changed.map((id) => [id, id])) } } } }
  })
  recordIteration(`Applied ${def.name} ${def.version} (run ${pend.proposal.runId.slice(0, 8)}) to ${changed.join(', ')}`, 'checkpoint')
  return { ok: true, changed }
}

/** Discard: the proposal goes, the model stays; the run is recorded as discarded. */
export function discardPending() {
  const dt = useDesignTools.getState()
  if (!dt.pending) return
  const toolId = dt.pending.proposal.toolId, runId = dt.pending.proposal.runId
  useDesignTools.setState((st) => { const inst = st.instanceOf(toolId); return { pending: null, run: null, instances: { ...st.instances, [toolId]: { ...inst, runs: inst.runs.map((r) => (r.runId === runId ? { ...r, status: 'discarded' as const } : r)) } } } })
}
