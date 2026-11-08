// Loops from the directed wires alone (Ruijie, 7 Nov): a return connection is found from the graph, not from positions or
// stage columns; several returns can exist; adding one keeps every forward wire; removing one removes only it.
import { describe, expect, it } from 'vitest'
import { closesLoop, edgeKey, linear, loopRing, returnEdges, walk, type Edge } from './workflowGraph'

const run = ['a', 'b', 'c', 'd', 'e']
const base = linear(run)

describe('loops from the directed wires', () => {
  it('a straight run has no return connection', () => {
    expect(returnEdges(base).size).toBe(0)
  })
  it('a wire back to an earlier task is a return; the forward wires stay', () => {
    const es: Edge[] = [...base, { a: 'd', b: 'b' }]
    expect([...returnEdges(es)]).toEqual(['d>b'])
    expect(walk(es)).toEqual(run) // the run's order is unchanged
    expect(es.filter((e) => !returnEdges(es).has(edgeKey(e)))).toEqual(base)
  })
  it('several local loops, across stage boundaries, each with its own ring', () => {
    const es: Edge[] = [...base, { a: 'c', b: 'b' }, { a: 'e', b: 'd' }]
    const back = returnEdges(es)
    expect([...back].sort()).toEqual(['c>b', 'e>d'])
    expect([...loopRing(es, { a: 'c', b: 'b' }, back)].sort()).toEqual(['b>c', 'c>b'])
    expect([...loopRing(es, { a: 'e', b: 'd' }, back)].sort()).toEqual(['d>e', 'e>d'])
  })
  it('a loop away from Start and Enter still counts', () => {
    const es: Edge[] = [...base, { a: 'x', b: 'y' }, { a: 'y', b: 'x' }]
    expect(returnEdges(es).size).toBe(1)
  })
  it('knows before connecting whether a wire would close a loop', () => {
    expect(closesLoop(base, 'd', 'b')).toBe(true) // b already reaches d
    expect(closesLoop(base, 'b', 'd')).toBe(false) // a shortcut forward
    expect(closesLoop(base, 'c', 'c')).toBe(true)
  })
  it('moving nodes changes nothing: the answer depends only on the wires', () => {
    const es: Edge[] = [...base, { a: 'd', b: 'b' }]
    // The same wires listed in another order give the same return connection.
    expect([...returnEdges([...es].reverse())]).toEqual(['d>b'])
  })
})
