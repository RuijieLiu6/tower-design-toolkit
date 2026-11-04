import { describe, expect, it } from 'vitest'
import { canonical, graphText, makeRunRecord, sha256 } from './runRecord'
import { evaluateGraph, runSchedule, type EvalContext, type GraphEdge, type GraphNode, type NodeOutput } from './workflowLogic'

// A small workflow: massing source -> two checks (categories that need only massing) -> all pass.
const nodes: GraphNode[] = [
  { id: 's', kind: 'source', ref: 'src.massing', label: 'Massing' },
  { id: 'a', kind: 'eval', ref: 'test.a', label: 'VTC rules', category: 'PRES' },
  { id: 'b', kind: 'eval', ref: 'test.b', label: 'FSR', category: 'PRES' },
  { id: 'all', kind: 'logic', ref: 'logic.all-pass', label: 'All pass' },
]
const edges: GraphEdge[] = [
  { source: 's', sourceHandle: 'out', target: 'a', targetHandle: 'massing' },
  { source: 's', sourceHandle: 'out', target: 'b', targetHandle: 'massing' },
  { source: 'a', sourceHandle: 'out', target: 'all', targetHandle: 'in' },
  { source: 'b', sourceHandle: 'out', target: 'all', targetHandle: 'in' },
]
const ok = (label: string): NodeOutput => ({ state: 'pass', headline: `${label} passes`, items: [{ id: label, label, state: 'pass', flag: 'verified' }] })
const ctx: EvalContext = { evalNode: (n) => ok(n.label), towers: [] }

describe('workflow run modes (research P15-M02)', () => {
  it('runs every node upstream first and times it', () => {
    const r = evaluateGraph(nodes, edges, ctx, { now: (() => { let t = 0; return () => (t += 1) })() })
    expect(r.all.state).toBe('pass')
    expect(r.a.ms).toBeGreaterThan(0)
    expect(runSchedule(nodes, edges)).toEqual(['a', 'b', 'all'])
  })

  it('a node switched off gives no verdict and blocks every node after it (block, never bypass)', () => {
    const r = evaluateGraph(nodes.map((n) => (n.id === 'a' ? { ...n, off: true } : n)), edges, ctx)
    expect(r.a.run?.status).toBe('off')
    expect(r.all.run).toEqual({ status: 'blocked', by: 'VTC rules' })
    expect(r.all.state).toBe('idle') // not "pass" on the strength of FSR alone
    expect(r.b.state).toBe('pass') // a sibling is unaffected
  })

  it('step-through runs the schedule up to the current step; later nodes wait', () => {
    const r = evaluateGraph(nodes, edges, ctx, { until: 0 })
    expect(r.a.state).toBe('pass')
    expect(r.b.run?.status).toBe('waiting')
    expect(r.all.run?.status).toBe('waiting')
  })

  it('the run record is canonical: same run, same bytes and hash; a changed graph changes the graph hash', async () => {
    expect(canonical({ b: 1, a: [2, { d: undefined, c: 'x' }] })).toBe('{"a":[2,{"c":"x"}],"b":1}')
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const outputs = evaluateGraph(nodes, edges, ctx, { now: () => 0 })
    const base = { workflow: { id: 'w', name: 'Test' }, mode: 'manual' as const, nodes, edges, outputs, design: { towers: [1] }, environment: { app: 'test' }, ranAt: '2026-11-04T00:00:00Z' }
    const one = await makeRunRecord(base), two = await makeRunRecord({ ...base, nodes: [...nodes].reverse() })
    expect(one.hash).toBe(two.hash)
    expect(JSON.parse(one.text).nodes.find((n: { id: string }) => n.id === 'all').status).toBe('ran')
    const off = await makeRunRecord({ ...base, nodes: nodes.map((n) => (n.id === 'a' ? { ...n, off: true } : n)) })
    expect(off.graphHash).not.toBe(one.graphHash)
    expect(graphText(nodes, edges)).toContain('"ref":"logic.all-pass"')
  })
})
