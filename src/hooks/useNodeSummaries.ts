// A small real result summary per workflow node, for the builder's cards and inspector (Result A brief §4: "an
// optional real result summary … Do not copy the demo's sample … check count"). Every word comes from the decision
// trace's live digest (lib/trace/trace.ts `live`, kept fresh by components/TracePanel.tsx Recorder): the lines of each
// node, counted by state. Nothing is computed here, and nothing is shown for a node whose check is off, or while the
// digest belongs to another design than the one on screen (its hash is compared with the current design's, the same
// way the recorder stamps it). A node with no lines has no summary: the card then shows its state word alone.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { pickDesign } from '../lib/project/design'
import { nodeOfLine } from '../lib/options'
import type { Digest } from '../lib/trace/digest'
import { designHash, useTrace } from '../lib/trace/trace'

/** "2 pass · 1 check · 1 fail": warn reads "check" (lib/status.ts); open lines are left out unless they are all there is. */
export function summaryWords(c: { pass: number; warn: number; fail: number; unknown: number }): string | undefined {
  const parts: string[] = []
  if (c.pass) parts.push(`${c.pass} pass`)
  if (c.warn) parts.push(`${c.warn} check`)
  if (c.fail) parts.push(`${c.fail} fail`)
  if (!parts.length && c.unknown) parts.push(`${c.unknown} open`)
  return parts.length ? parts.join(' · ') : undefined
}

/** The digest's lines counted per node, as words, for the nodes that are on. Pure (tested in useNodeSummaries.test.ts). */
export function summarizeDigest(d: Digest, enabled: Record<string, boolean>): Record<string, string | undefined> {
  const counts = new Map<string, { pass: number; warn: number; fail: number; unknown: number }>()
  for (const l of d.lines) {
    const node = nodeOfLine(l.id)
    if (!node || !enabled[node]) continue
    const c = counts.get(node) ?? { pass: 0, warn: 0, fail: 0, unknown: 0 }
    c[l.state]++
    counts.set(node, c)
  }
  const out: Record<string, string | undefined> = {}
  for (const [node, c] of counts) { const w = summaryWords(c); if (w) out[node] = w }
  return out
}

const NONE: Record<string, string | undefined> = {}

/** Result summaries by node id, from the live digest of the current design only; an empty record otherwise. */
export function useNodeSummaries(): Record<string, string | undefined> {
  const live = useTrace((s) => s.live)
  const enabled = useStore((s) => s.enabled)
  const design = useStore(useShallow(pickDesign))
  const hash = useMemo(() => designHash(design), [design])
  return useMemo(() => (live && live.hash === hash ? summarizeDigest(live.digest, enabled) : NONE), [live, hash, enabled])
}
