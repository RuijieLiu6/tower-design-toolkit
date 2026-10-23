import { describe, expect, it } from 'vitest'
import {
  deleteWorkflow, emptyWorkflow, exportName, listWorkflows, loadWorkflow, nodesToEnable, parseWorkflow, saveWorkflow, serializeWorkflow,
  WORKFLOW_FORMAT, type KV, type Workflow,
} from './workflows'

const memory = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}
const throwing: KV = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('denied') } }

function sample(name = 'Views and lifts'): Workflow {
  const wf = emptyWorkflow(name)
  wf.nodes = [
    { id: 's1', kind: 'source', ref: 'src.site', x: 0, y: 0 },
    { id: 's2', kind: 'source', ref: 'src.massing', x: 0, y: 150 },
    { id: 'g1', kind: 'group', ref: 'group', x: 300, y: -40, w: 320, h: 400, label: 'Checks', params: { color: '#1f5f8b' } },
    { id: 'v', kind: 'eval', ref: 'built.viewcones', x: 20, y: 40, parent: 'g1' },
    { id: 'r', kind: 'eval', ref: 'P02-M02', x: 20, y: 220, parent: 'g1' },
    { id: 'l', kind: 'logic', ref: 'logic.score', x: 700, y: 100, params: { passMark: 60, failMark: 30, weights: { v: 2 } } },
  ]
  wf.edges = [
    { id: 'e1', source: 's1', sourceHandle: 'out', target: 'v', targetHandle: 'site' },
    { id: 'e2', source: 'v', sourceHandle: 'out', target: 'l', targetHandle: 'in' },
  ]
  return wf
}

describe('workflow files', () => {
  it('round-trips through JSON unchanged', () => {
    const wf = sample()
    const r = parseWorkflow(serializeWorkflow(wf))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.workflow).toEqual(wf); expect(r.warnings).toEqual([]) }
  })

  it('refuses a file that is not a workflow, with a plain reason', () => {
    expect(parseWorkflow('not json').ok).toBe(false)
    const wrong = parseWorkflow(JSON.stringify({ format: 'tower-studio-node@1', nodes: [], edges: [] }))
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.errors[0]).toMatch(/Expected format/)
    const dup = parseWorkflow(JSON.stringify({ format: WORKFLOW_FORMAT, nodes: [{ id: 'a', kind: 'eval', ref: 'x', x: 0, y: 0 }, { id: 'a', kind: 'eval', ref: 'y', x: 0, y: 0 }], edges: [] }))
    expect(dup.ok).toBe(false)
    const badKind = parseWorkflow(JSON.stringify({ format: WORKFLOW_FORMAT, nodes: [{ id: 'a', kind: 'script', ref: 'x', x: 0, y: 0 }], edges: [] }))
    expect(badKind.ok).toBe(false)
  })

  it('drops dangling wires and missing groups with warnings, and flags unknown nodes', () => {
    const wf = sample()
    wf.edges.push({ id: 'e9', source: 'ghost', sourceHandle: 'out', target: 'l', targetHandle: 'in' })
    wf.nodes.push({ id: 'x', kind: 'eval', ref: 'someone.else', x: 0, y: 0, parent: 'nope' })
    const r = parseWorkflow(serializeWorkflow(wf), (ref) => ref !== 'someone.else')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.workflow.edges.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(r.workflow.nodes.find((n) => n.id === 'x')?.parent).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/missing node/)
    expect(r.warnings.join(' ')).toMatch(/not in this library/)
    expect(r.warnings.join(' ')).toMatch(/missing group/)
  })

  it('saves, lists newest first, loads and deletes', () => {
    const kv = memory()
    const a = sample('A'), b = sample('B')
    expect(saveWorkflow(kv, a)).toBe(true)
    expect(saveWorkflow(kv, b)).toBe(true)
    const list = listWorkflows(kv)
    expect(list).toHaveLength(2)
    expect(list.find((e) => e.id === a.id)?.nodes).toBe(5) // groups are not counted
    const loaded = loadWorkflow(kv, a.id)
    expect(loaded?.name).toBe('A')
    expect(loaded?.nodes).toEqual(a.nodes)
    expect(loaded?.edges).toEqual(a.edges)
    // Saving again under the same id overwrites, it does not duplicate.
    expect(saveWorkflow(kv, { ...a, name: 'A, renamed' })).toBe(true)
    expect(listWorkflows(kv)).toHaveLength(2)
    expect(loadWorkflow(kv, a.id)?.name).toBe('A, renamed')
    expect(deleteWorkflow(kv, a.id)).toBe(true)
    expect(listWorkflows(kv).map((e) => e.id)).toEqual([b.id])
    expect(loadWorkflow(kv, a.id)).toBeNull()
  })

  it('fails softly when storage is missing, blocked or holds junk', () => {
    expect(saveWorkflow(null, sample())).toBe(false)
    expect(listWorkflows(null)).toEqual([])
    expect(saveWorkflow(throwing, sample())).toBe(false)
    expect(loadWorkflow(throwing, 'x')).toBeNull()
    expect(deleteWorkflow(throwing, 'x')).toBe(false)
    const kv = memory()
    kv.setItem('ts.workflows', '{oops')
    expect(listWorkflows(kv)).toEqual([])
    kv.setItem('ts.workflow.bad', '[]')
    expect(loadWorkflow(kv, 'bad')).toBeNull()
  })

  it('switches on only the runnable checks, once each', () => {
    const wf = sample()
    wf.nodes.push({ id: 'v2', kind: 'eval', ref: 'built.viewcones', x: 0, y: 0 })
    const runnable = (ref: string) => ref.startsWith('built.')
    expect(nodesToEnable(wf, runnable)).toEqual(['built.viewcones'])
  })

  it('makes a safe file name', () => {
    expect(exportName({ name: 'View cones + lifts (v2)' })).toBe('view-cones-lifts-v2.workflow.json')
    expect(exportName({ name: '   ' })).toBe('workflow.workflow.json')
  })
})
