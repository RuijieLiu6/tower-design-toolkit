// The workflow assistant (7 Nov): suggest, modify, explain, clarify, on Ruijie's example requests. Keyword mode (no
// language model in Node); the model only sharpens the ranking.
import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../../data/registry'
import { NODE_NEEDS } from '../../data/nodeNeeds'
import { byPhase, isLoopIn, linear, walk, type Board } from '../workflowGraph'
import { interpret, references } from './workflowAssistant'

const board = (ids: string[]): Board => { const nodes = byPhase(ids); return { nodes, edges: linear(nodes) } }
const start = board(['built.vtc-rules', 'built.viewcones', 'built.sun', 'built.wind-screen', 'built.fsr', 'built.pr-streetwall', 'built.core-lifts'])

describe('the workflow assistant', () => {
  it('every built node has what it reads and asks for', () => {
    for (const n of BUILT_NODES) expect(NODE_NEEDS[n.id], n.id).toBeDefined()
  })

  it('reads names, phases and "checks" in what was typed', () => {
    const r = references('create an iteration between massing and the relevant constraint checks')
    expect(r.map((x) => x.kind)).toEqual(['phase', 'checks'])
  })

  it('Suggest: "Help me explore a mixed-use tower with a public ground floor" puts frontage and open space on a fresh workflow', () => {
    const r = interpret('Help me explore a mixed-use tower with a public ground floor.', board([]))
    expect(r.kind).toBe('proposal')
    if (r.kind !== 'proposal') return
    expect(r.capability).toBe('suggest')
    expect(r.board.nodes).toEqual(expect.arrayContaining(['built.pr-frontage', 'built.pr-ground']))
    expect(walk(r.board.edges)).toEqual(r.board.nodes) // a straight run in phase order
    expect(r.summary.length).toBeGreaterThan(20)
  })

  it('Clarify: "Add a water-systems study after the program stage" asks which water node, keeping the position', () => {
    const r = interpret('Add a water-systems study after the program stage.', start)
    expect(r.kind).toBe('clarify')
    if (r.kind !== 'clarify') return
    expect(r.options.map((o) => o.text)).toEqual(['Add Code & life safety after the program stage', 'Add City in Nature ledger after the program stage'])
    // Picking one adds it right after the last Program node.
    const p = interpret(r.options[0].text, start)
    expect(p.kind).toBe('proposal')
    if (p.kind !== 'proposal') return
    const run = walk(p.board.edges)
    expect(run[run.indexOf('built.pr-streetwall') + 1]).toBe('built.life-safety')
    expect(p.added).toEqual(['built.life-safety'])
  })

  it('Modify: "Create an iteration between massing and the relevant constraint checks" loops from the last check back to the first Form node', () => {
    const r = interpret('Create an iteration between massing and the relevant constraint checks', start)
    expect(r.kind).toBe('proposal')
    if (r.kind !== 'proposal') return
    expect(r.loops).toEqual([{ a: 'built.core-lifts', b: 'built.sun' }])
    expect(isLoopIn(r.board.edges, r.loops[0])).toBe(true)
    expect(r.added).toEqual([])
  })

  it('Explain: "Explain what information this node needs" explains the node last touched, or asks which', () => {
    const r = interpret('Explain what information this node needs', start, null, 'built.viewcones')
    expect(r).toMatchObject({ kind: 'explain', node: 'built.viewcones', onBoard: true })
    if (r.kind === 'explain') expect(r.reads.length + r.asks.length).toBeGreaterThan(0)
    expect(interpret('Explain what information this node needs', start).kind).toBe('clarify')
    expect(interpret('Why is the core & lift check here?', start)).toMatchObject({ kind: 'explain', node: 'built.core-lifts' })
  })

  it('Modify: remove a node (its neighbours joined) and remove the loops', () => {
    const r = interpret('Remove the wind screen', start)
    expect(r.kind).toBe('proposal')
    if (r.kind !== 'proposal') return
    expect(r.removed).toEqual(['built.wind-screen'])
    expect(walk(r.board.edges)).toEqual(start.nodes.filter((x) => x !== 'built.wind-screen'))
    const looped = interpret('loop the whole workflow', start)
    expect(looped.kind === 'proposal' && looped.loops.length).toBe(1)
    if (looped.kind !== 'proposal') return
    const off = interpret('remove the loop', looped.board)
    expect(off.kind === 'proposal' && off.unlooped).toBe(1)
  })

  it('never invents a node: an unknown request gets a question with built nodes to choose from', () => {
    const r = interpret('Add a karaoke lounge study', start)
    expect(r.kind).toBe('clarify')
    if (r.kind === 'clarify') for (const o of r.options) expect(BUILT_NODES.some((n) => o.label.startsWith(n.name))).toBe(true)
  })
})
