// What the Toolkit sends a design tool (brief §6: only the required scope): the selected tower as the tool needs it,
// the frame, the tool's own last parameters, and the ids that tie the answer back to this run. Never the other
// towers, the city or the site unless the definition asks for the site outline.
import { blocksOf } from '../../engine/blocks'
import type { Tower } from '../../engine/types'
import { modelRevision } from '../workflow/phasePackage'
import { useProjectMeta } from '../project/session'
import { useStore } from '../../store'
import { VTC_NORTH_DEG } from '../../context'
import { PROTOCOL, type InputSnapshot, type SnapshotTarget, type ToolDefinition, type ToolInstance } from './contract'
import { newId, useDesignTools } from './store'

/** The tower as a target: its box and footprint in its own frame (m). Imported towers send their hull. */
export function targetOf(t: Tower): SnapshotTarget {
  const half = (w: number, d: number): [number, number][] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
  const top = blocksOf(t).reduce((z, b) => z + b.height, 0) || t.height
  const storeys = t.imported ? t.imported.storeys.filter((s) => s.hasFloor).length : Math.max(1, Math.round((t.height - t.podiumHeight) / t.f2f) + Math.round(t.podiumHeight / 4.5))
  return {
    id: t.id, name: t.name, width: t.width, depth: t.depth, height: top, storeys, f2f: t.f2f, rotation: t.rotation,
    podium: { height: t.podiumHeight, width: t.podiumWidth, depth: t.podiumDepth },
    footprint: t.imported?.hull?.length ? t.imported.hull : half(Math.max(t.width, t.podiumWidth), Math.max(t.depth, t.podiumDepth)),
  }
}

/** A stable project id for this browser's project: its name, or the project kind for an untitled one. */
export const projectId = () => `${useStore.getState().project}:${useProjectMeta.getState().name ?? 'untitled'}`

export function makeSnapshot(def: ToolDefinition, inst: ToolInstance, towers: Tower[]): InputSnapshot {
  const s = useStore.getState()
  const targets = inst.targets.map((id) => towers.find((t) => t.id === id)).filter((t): t is Tower => !!t).map(targetOf)
  return {
    protocol: PROTOCOL, type: 'tdt:inputs', sessionId: useDesignTools.getState().sessionId, runId: newId(), projectId: projectId(), toolId: def.id,
    baseRevision: modelRevision(towers), units: def.units, frame: { northDeg: s.project === 'vtc' ? VTC_NORTH_DEG : 0, groundElevation: s.groundElevation },
    targets, parameters: inst.parameters,
  }
}

/** The permission statement shown before the first send (brief §6): what, to whom, why. */
export function permissionWords(def: ToolDefinition, targets: SnapshotTarget[]): string[] {
  return [
    `Sends: ${def.destination.sends.join(', ')} of ${targets.map((t) => t.name).join(', ') || 'the selected tower'} (${def.units.length}, tower frame).`,
    `To: ${def.destination.to}. Stored: ${def.destination.stores}.`,
    `Why: so ${def.name} can propose a change; nothing is applied until you Apply it here.`,
  ]
}
