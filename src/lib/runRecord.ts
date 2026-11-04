// Run record for a workflow run (research P15-M02, "results show their work"): which graph ran, in which mode, on which
// design, and what every node returned: status, verdict, headline, lines with flags and sources, time taken. Canonical
// JSON (keys sorted, as RFC 8785 asks; numbers as JavaScript prints them) so the same run gives the same bytes on the
// same browser engine, and a SHA-256 of the graph and of the whole record. Engines may differ in the last digits of
// maths functions, so cross-browser comparisons should use the values, not the hash (critic r1 on P15-M02).
import type { GraphEdge, GraphNode, NodeOutput } from './workflowLogic'

export const RUN_FORMAT = 'tower-studio-run@1'

/** JSON with object keys sorted at every level; undefined values dropped (JCS-style canonical form). */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type RunMode = 'live' | 'manual' | 'step'

export interface RunRecordInput {
  workflow: { id: string; name: string }
  mode: RunMode
  nodes: GraphNode[]
  edges: GraphEdge[]
  outputs: Record<string, NodeOutput>
  /** The design the run read: project and towers (whatever the caller passes; it goes into the record as given). */
  design: unknown
  /** Environment block (app version, user agent); left out of the record hash's graph part. */
  environment: Record<string, string>
  ranAt: string
}

/** The graph alone (structure, labels, params, off switches), in canonical form: its hash names the revision that ran. */
export function graphText(nodes: GraphNode[], edges: GraphEdge[]): string {
  return canonical({
    nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)).map((n) => ({ id: n.id, kind: n.kind, ref: n.ref, label: n.label, params: n.params, off: n.off || undefined })),
    edges: [...edges].map((e) => ({ s: e.source, sh: e.sourceHandle ?? 'out', t: e.target, th: e.targetHandle ?? 'in' })).sort((a, b) => canonical(a).localeCompare(canonical(b))),
  })
}

export async function makeRunRecord(r: RunRecordInput): Promise<{ text: string; hash: string; graphHash: string }> {
  const graphHash = await sha256(graphText(r.nodes, r.edges))
  const designHash = await sha256(canonical(r.design))
  const body = {
    format: RUN_FORMAT,
    workflow: r.workflow,
    mode: r.mode,
    ranAt: r.ranAt,
    graphHash,
    designHash,
    environment: r.environment,
    nodes: [...r.nodes].filter((n) => n.kind !== 'group').sort((a, b) => a.id.localeCompare(b.id)).map((n) => {
      const o = r.outputs[n.id]
      return {
        id: n.id, ref: n.ref, label: n.label, kind: n.kind, params: n.params,
        status: o?.run?.status ?? (o ? (o.state === 'idle' ? 'idle' : 'ran') : 'not-run'),
        ...(o?.run?.by ? { blockedBy: o.run.by } : {}),
        state: o?.state, headline: o?.headline, score: o?.score, ms: o?.ms === undefined ? undefined : Math.round(o.ms * 100) / 100,
        upstream: r.edges.filter((e) => e.target === n.id).map((e) => e.source).sort(),
        lines: (o?.items ?? []).map((i) => ({ label: i.label, value: i.value, threshold: i.threshold, state: i.state, flag: i.flag, source: i.source?.label, tower: i.towerName, from: i.from })),
      }
    }),
  }
  const text = canonical(body)
  return { text, hash: await sha256(text), graphHash }
}
