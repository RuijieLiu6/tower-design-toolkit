// The sequence's pure helpers: what a drop on a slot does, what an add at a slot does, and the words under a drag.
import { describe, expect, it } from 'vitest'
import { linear, walk, type Board } from '../../lib/workflowGraph'
import { connect, moveNode } from '../../lib/workflow/projectWorkflow'
import { addAt, addAtPreview, dragWords, movePlan } from './WorkflowSequence'
import { arcPath, arcSpace, returnKey, returnTargets } from './ReturnPathControl'
import { statusOf } from './WorkflowStepCard'

const board = (ids: string[]): Board => ({ nodes: ids, edges: linear(ids) })
const name = (id: string) => id.toUpperCase()

describe('movePlan: a drop on a slot', () => {
  const b = board(['a', 'b', 'c', 'd'])
  it('puts the card right after the slot\'s node, or first for the start slot', () => {
    expect(movePlan(b, 'd', 'a')).toEqual({ target: 'a', where: 'after' })
    expect(walk(moveNode(b, 'd', 'a', 'after').edges)).toEqual(['a', 'd', 'b', 'c'])
    expect(movePlan(b, 'd', 'start')).toEqual({ target: 'a', where: 'before' })
    expect(walk(moveNode(b, 'd', 'a', 'before').edges)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('does nothing for the card\'s own slot, the slot before it, or an unknown slot', () => {
    expect(movePlan(b, 'b', 'b')).toBeNull()
    expect(movePlan(b, 'b', 'a')).toBeNull()
    expect(movePlan(b, 'a', 'start')).toBeNull()
    expect(movePlan(b, 'b', 'zz')).toBeNull()
  })
  it('brings an unwired card into the run', () => {
    const u: Board = { nodes: ['a', 'b', 'x'], edges: linear(['a', 'b']) }
    expect(movePlan(u, 'x', 'a')).toEqual({ target: 'a', where: 'after' })
    expect(walk(moveNode(u, 'x', 'a', 'after').edges)).toEqual(['a', 'x', 'b'])
  })
})

describe('addAt: the pending insertion', () => {
  it('adds at the start, after a card, and never twice', () => {
    const b = board(['a', 'b'])
    expect(walk(addAt(b, 'n', 'start').edges)).toEqual(['n', 'a', 'b'])
    expect(walk(addAt(b, 'n', 'a').edges)).toEqual(['a', 'n', 'b'])
    expect(addAt(b, 'a', 'b')).toBe(b)
    expect(walk(addAt({ nodes: [], edges: [] }, 'n', 'start').edges)).toEqual(['n'])
  })
  it('previews the connections an add changes, the start slot included', () => {
    const b = board(['a', 'b'])
    const p = addAtPreview(b, 'n', 'start')
    expect(p.added.map((e) => `${e.a}>${e.b}`).sort()).toEqual(['n>a', 'start>n'])
    expect(p.removed.map((e) => `${e.a}>${e.b}`)).toEqual(['start>a'])
    expect(dragWords(b, { kind: 'add', id: 'n' }, 'a', name)).toBe('connects A → N, N → B; removes A → B')
  })
})

describe('dragWords', () => {
  const b = board(['a', 'b', 'c'])
  it('says where to drop, what a move changes, and when nothing would change', () => {
    expect(dragWords(b, { kind: 'move', id: 'c' }, null, name)).toBe('Drop on a gap between cards')
    expect(dragWords(b, { kind: 'move', id: 'c' }, 'a', name)).toBe('connects B → End, A → C, C → B; removes A → B, B → C, C → End')
    expect(dragWords(b, { kind: 'move', id: 'c' }, 'b', name)).toBe('Already here')
  })
})

describe('return paths', () => {
  const b = connect(board(['a', 'b', 'c', 'd']), 'c', 'a')
  it('lists the earlier steps not yet returned to, and keys the wire as disconnect reads it', () => {
    expect(returnTargets(b, 'c')).toEqual(['b'])
    expect(returnTargets(b, 'd')).toEqual(['a', 'b', 'c'])
    expect(returnTargets(b, 'a')).toEqual([])
    expect(returnKey('c', 'a')).toBe('c>a')
  })
  it('draws an arc above both tops, higher for a higher level, and reserves the space for it', () => {
    expect(arcPath(100, 50, 20, 50, 1)).toBe('M100,50 C100,26 20,26 20,50')
    expect(arcPath(100, 60, 20, 50, 2)).toBe('M100,60 C100,12 20,12 20,50')
    expect(arcSpace(0)).toBe(0)
    expect(arcSpace(2)).toBeGreaterThan(arcSpace(1))
  })
})

describe('card state colours', () => {
  it('keeps Ready neutral and marks missing inputs and missing tools apart', () => {
    expect(statusOf('ready')).toBe('pending')
    expect(statusOf('design')).toBe('pending')
    expect(statusOf('needs-model')).toBe('warning')
    expect(statusOf('paused')).toBe('warning')
    expect(statusOf('missing')).toBe('error')
    expect(statusOf('other-project')).toBe('error')
  })
})
