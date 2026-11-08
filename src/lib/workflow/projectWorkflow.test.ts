// The project workflow's edits and the dock's layout (Ruijie, 7 Nov: one workflow for the landing page and the
// workspace; the dock compact, aligned and orderly).
import { describe, expect, it } from 'vitest'
import { addNode, connect, disconnect, edgeDiff, moveNode, removeNode, runOrder, wouldLoop } from './projectWorkflow'
import { dockLayout } from './dockLayout'
import { DESIGN_NODES, analysisOnly, designForStep, withDesignSteps } from './designNodes'
import { edgeKey, linear, returnEdges, walk, type Board } from '../workflowGraph'
import { phaseOfNode } from '../phases'

const board = (ids: string[]): Board => ({ nodes: ids, edges: linear(ids) })

describe('design nodes', () => {
  it('lead each phase a preset uses, and are never counted as checks', () => {
    const nodes = withDesignSteps(['built.vtc-rules', 'built.sun', 'built.fsr'], (id) => phaseOfNode(id)?.id)
    expect(nodes).toEqual(['design.site', 'built.vtc-rules', 'design.massing', 'built.sun', 'design.program', 'built.fsr'])
    expect(analysisOnly(nodes)).toEqual(['built.vtc-rules', 'built.sun', 'built.fsr'])
    expect(withDesignSteps(nodes, (id) => phaseOfNode(id)?.id)).toBe(nodes) // already a design process: unchanged
    expect(designForStep('volume')?.id).toBe('design.massing')
    expect(DESIGN_NODES).toHaveLength(5)
  })
})

describe('workflow edits', () => {
  const b = board(['design.massing', 'built.fsr'])
  it('the acceptance scenario: a sunlight study after massing, with a return to massing', () => {
    const withSun = addNode(b, 'built.solar-access', 'design.massing')
    expect(walk(withSun.edges)).toEqual(['design.massing', 'built.solar-access', 'built.fsr'])
    expect(wouldLoop(withSun, 'built.solar-access', 'design.massing')).toBe(true)
    const looped = connect(withSun, 'built.solar-access', 'design.massing')
    expect(returnEdges(looped.edges).has('built.solar-access>design.massing')).toBe(true)
    expect(walk(looped.edges)).toEqual(['design.massing', 'built.solar-access', 'built.fsr']) // the loop doesn't change the order
  })
  it('moves a node before or after another, keeping unrelated paths and its loops that still run back', () => {
    const c = board(['a', 'b', 'c', 'd'])
    expect(runOrder(moveNode(c, 'd', 'b', 'before'))).toEqual(['a', 'd', 'b', 'c'])
    expect(runOrder(moveNode(c, 'a', 'c', 'after'))).toEqual(['b', 'c', 'a', 'd'])
    const looped = connect(c, 'c', 'a')
    const moved = moveNode(looped, 'd', 'a', 'before')
    expect(runOrder(moved)).toEqual(['d', 'a', 'b', 'c'])
    expect(returnEdges(moved.edges).has('c>a')).toBe(true)
  })
  it('removes a node by joining its neighbours, and a connection on its own', () => {
    const c = board(['a', 'b', 'c'])
    expect(walk(removeNode(c, 'b').edges)).toEqual(['a', 'c'])
    const cut = disconnect(c, 'b>c')
    expect(cut.nodes).toEqual(['a', 'b', 'c'])
    expect(runOrder(cut)).toEqual(['a', 'b', 'c']) // c is now unwired, still on the board
    expect(edgeDiff(c.edges, cut.edges).removed.map(edgeKey)).toEqual(['b>c'])
  })
})

describe('the dock layout', () => {
  it('puts the run on one row, branches on a second, and stacks return arcs so they never overlap', () => {
    const c = board(['a', 'b', 'c', 'd'])
    const branched = { nodes: [...c.nodes, 'x'], edges: [...c.edges, { a: 'b', b: 'x' }, { a: 'x', b: 'enter' }] }
    const looped = connect(connect(branched, 'c', 'a'), 'd', 'b')
    const l = dockLayout(looped)
    expect(['start', 'a', 'b', 'c', 'd', 'enter'].every((id) => l.at.get(id)!.row === 0)).toBe(true)
    expect(l.at.get('x')!.row).toBe(1)
    expect(new Set([...l.at.values()].map((p) => p.col)).size).toBe(l.cols) // one column each
    const rets = l.edges.filter((e) => e.kind === 'return')
    expect(rets.map((e) => e.key).sort()).toEqual(['c>a', 'd>b'])
    expect(new Set(rets.map((e) => e.level)).size).toBe(2) // overlapping spans: two levels
    expect(l.edges.find((e) => e.key === 'b>x')!.kind).toBe('branch')
  })
  it('keeps unwired nodes at the end, on the second row', () => {
    const l = dockLayout({ nodes: ['a', 'b'], edges: linear(['a']) })
    expect(l.unwired).toEqual(['b'])
    expect(l.at.get('b')).toEqual({ col: 2, row: 1 })
  })
})
