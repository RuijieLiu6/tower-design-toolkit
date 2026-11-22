import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDesign } from './project/design'
import { toDesign, toProjectFile } from './project/projectFile'
import { SPLIT_IDS, splitKeys, upgradeBoard, upgradeEnabled, upgradeIds } from './nodeSplits'
import { emptyWorkflow, parseWorkflow, serializeWorkflow, type Workflow } from './workflows'
import { listMyPresets } from './workflow/myPresets'
import { useStore } from '../store'

// Node placement (21 Nov 2026): built.hbp left Relaxations & aviation (a part of Site limits, built.viewcones). Every record
// saved before the split that had the old host switched on gains the new node, once; records saved since keep their choice.
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear() } }

describe('node splits: built.hbp out of Relaxations & aviation', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memory()) })
  afterEach(() => { vi.unstubAllGlobals(); useStore.setState(useStore.getInitialState(), true) })

  it('adds the split-out node right after its host in a list saved before the split, once', () => {
    expect(SPLIT_IDS).toEqual(['built.hbp'])
    expect(upgradeIds(['built.fsr', 'built.viewcones', 'built.sun'])).toEqual(['built.fsr', 'built.viewcones', 'built.hbp', 'built.sun'])
    expect(upgradeIds(['built.relax-aviation'])).toEqual(['built.relax-aviation', 'built.hbp'])
    expect(upgradeIds(['built.fsr'])).toEqual(['built.fsr']) // no host: nothing added
    expect(upgradeIds(['built.viewcones', 'built.hbp'])).toEqual(['built.viewcones', 'built.hbp']) // already there
    // Saved after the split (it lists the split as done): a node taken out stays out.
    expect(upgradeIds(['built.viewcones'], ['built.hbp'])).toEqual(['built.viewcones'])
  })

  it('puts it on the wire after its host in a saved board', () => {
    const b = upgradeBoard({ nodes: ['built.fsr', 'built.viewcones', 'built.sun'], edges: [{ a: 'start', b: 'built.fsr' }, { a: 'built.fsr', b: 'built.viewcones' }, { a: 'built.viewcones', b: 'built.sun' }, { a: 'built.sun', b: 'enter' }] })
    expect(b.nodes).toContain('built.hbp')
    expect(b.edges.some((e) => e.a === 'built.viewcones' && e.b === 'built.hbp')).toBe(true)
    expect(b.edges.some((e) => e.a === 'built.hbp' && e.b === 'built.sun')).toBe(true)
    const done = { nodes: ['built.viewcones'], edges: [] }
    expect(upgradeBoard(done, ['built.hbp'])).toBe(done)
  })

  it('a switched-on record without the key takes its host switch; one with the key is left alone', () => {
    expect(upgradeEnabled({ 'built.viewcones': true })['built.hbp']).toBe(true)
    expect(upgradeEnabled({ 'built.viewcones': false })['built.hbp']).toBe(false)
    expect(upgradeEnabled({ 'built.viewcones': true, 'built.hbp': false })['built.hbp']).toBe(false)
    expect(splitKeys(['built.fsr'])).toEqual({ 'built.hbp': false })
    expect(splitKeys(['built.hbp'])).toEqual({})
  })

  it('opens a project file saved before the split with the node on when Site limits was on, and keeps an explicit off after it', () => {
    const d = defaultDesign()
    expect(d.enabled['built.hbp']).toBe(true) // a new project has it on (built nodes start on)
    const now = toProjectFile(d)
    expect(now.nodes.known).toContain('built.hbp')
    // Before the split: the node was neither known nor enabled.
    const old = { ...now, nodes: { enabled: now.nodes.enabled.filter((x) => x !== 'built.hbp'), known: now.nodes.known!.filter((x) => x !== 'built.hbp') } }
    expect(toDesign(old).enabled['built.hbp']).toBe(true)
    const oldOff = { ...old, nodes: { ...old.nodes, enabled: old.nodes.enabled.filter((x) => !['built.viewcones', 'built.relax-aviation'].includes(x)) } }
    expect(toDesign(oldOff).enabled['built.hbp']).toBeFalsy()
    // Saved after the split with the node switched off: it stays off.
    const off = { ...now, nodes: { ...now.nodes, enabled: now.nodes.enabled.filter((x) => x !== 'built.hbp') } }
    expect(toDesign(off).enabled['built.hbp']).toBe(false)
  })

  it('imports a workflow file saved before the split with the node beside its host, wired as the host is', () => {
    const wf: Workflow = { ...emptyWorkflow('Old'), nodes: [
      { id: 'a', kind: 'source', ref: 'src.site', x: 0, y: 0 }, { id: 'b', kind: 'eval', ref: 'built.viewcones', x: 200, y: 0 },
    ], edges: [{ id: 'e1', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' }] }
    const old = JSON.parse(serializeWorkflow(wf)) as Record<string, unknown>
    delete old.splits
    const r = parseWorkflow(JSON.stringify(old))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const added = r.workflow.nodes.find((n) => n.ref === 'built.hbp')!
    expect(added.kind).toBe('eval')
    expect(r.workflow.edges.some((e) => e.source === 'a' && e.target === added.id)).toBe(true)
    // Saved today (with its splits): nothing is added.
    const today = parseWorkflow(serializeWorkflow(wf))
    expect(today.ok && today.workflow.nodes.some((n) => n.ref === 'built.hbp')).toBe(false)
  })

  it('upgrades a preset copy saved in this browser before the split', () => {
    localStorage.setItem('ts.myPresets', JSON.stringify([{ id: 'my.1', name: 'Mine', nodes: ['built.viewcones', 'built.fsr'], edges: [{ a: 'start', b: 'built.viewcones' }, { a: 'built.viewcones', b: 'built.fsr' }, { a: 'built.fsr', b: 'enter' }], savedAt: '2026-11-20T00:00:00Z' }]))
    const [p] = listMyPresets()
    expect(p.nodes).toEqual(['built.viewcones', 'built.hbp', 'built.fsr'])
    expect(p.splits).toEqual(['built.hbp'])
  })

  it('setEnabled writes the split key, so a record made today never reads as one from before the split', () => {
    useStore.getState().setEnabled(['built.viewcones'])
    expect(useStore.getState().enabled['built.hbp']).toBe(false)
  })
})
