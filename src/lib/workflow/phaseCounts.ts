// Fail and check counts per phase, for the compact phase list in the left panel (Ruijie, 17 Nov: the reference's phase
// rows carry their counts). The same source as the builder's card summaries (hooks/useNodeSummaries.ts): the decision
// trace's live digest, counted per node and summed per the node's home phase, for the nodes whose check is on; nothing
// while the digest belongs to another design than the one on screen.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { PhaseId } from '../phases'
import { pickDesign } from '../project/design'
import { nodeOfLine } from '../options'
import type { Digest } from '../trace/digest'
import { designHash, useTrace } from '../trace/trace'
import { useStore } from '../../store'

export interface PhaseCount { pass: number; warn: number; fail: number; unknown: number }
export type PhaseCounts = Partial<Record<PhaseId, PhaseCount>>

/** The digest's lines counted per phase (a node's lines go to its home phase), for the nodes that are on. Pure. */
export function countByPhase(d: Pick<Digest, 'lines'>, enabled: Record<string, boolean>, home: (id: string) => PhaseId): PhaseCounts {
  const out: PhaseCounts = {}
  for (const l of d.lines) {
    const node = nodeOfLine(l.id)
    if (!node || !enabled[node]) continue
    const p = home(node)
    const c = out[p] ?? (out[p] = { pass: 0, warn: 0, fail: 0, unknown: 0 })
    c[l.state]++
  }
  return out
}

const NONE: PhaseCounts = {}

/** Counts by phase from the live digest of the current design only; empty otherwise. */
export function usePhaseCounts(home: (id: string) => PhaseId): PhaseCounts {
  const live = useTrace((s) => s.live)
  const enabled = useStore((s) => s.enabled)
  const design = useStore(useShallow(pickDesign))
  const hash = useMemo(() => designHash(design), [design])
  return useMemo(() => (live && live.hash === hash ? countByPhase(live.digest, enabled, home) : NONE), [live, hash, enabled, home])
}
