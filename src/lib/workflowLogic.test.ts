import { describe, expect, it } from 'vitest'
import type { RuleState } from '../engine/types'
import {
  allPass, anyFail, canConnect, compareOptions, evaluateGraph, scoreItems, topoOrder, weakestFlag, weightedScore, wouldCycle,
  type EvalContext, type GraphEdge, type GraphNode, type Item,
} from './workflowLogic'

const item = (state: RuleState, extra: Partial<Item> = {}): Item => ({ id: `${state}-${Math.random()}`, label: state, state, flag: 'verified', ...extra })

describe('logic nodes', () => {
  it('All pass: pass only when everything passes; unknown is not a pass', () => {
    expect(allPass([item('pass'), item('pass')]).state).toBe('pass')
    expect(allPass([item('pass'), item('warn')]).state).toBe('warn')
    expect(allPass([item('pass'), item('unknown')]).state).toBe('warn')
    expect(allPass([item('pass'), item('fail'), item('warn')]).state).toBe('fail')
    expect(allPass([]).state).toBe('idle')
  })

  it('Any fail: fails on one fail, otherwise passes and says how many are unknown', () => {
    const r = anyFail([item('pass'), item('fail', { label: 'Height band' })])
    expect(r.state).toBe('fail')
    expect(r.headline).toMatch(/Height band/)
    const ok = anyFail([item('pass'), item('warn'), item('unknown')])
    expect(ok.state).toBe('pass')
    expect(ok.items[0].note).toMatch(/1 unknown/)
  })

  it('keeps the weakest evidence flag, so a false assumption stays visible', () => {
    expect(weakestFlag([item('pass'), item('pass', { flag: 'false_assumption' }), item('pass', { flag: 'unverified' })])).toBe('false_assumption')
    expect(allPass([item('pass'), item('pass', { flag: 'false_assumption' })]).items[0].flag).toBe('false_assumption')
    expect(weakestFlag([item('pass')])).toBe('verified')
  })

  it('scores lines pass 1, check 0.5, fail 0 and leaves unknown out', () => {
    expect(scoreItems([item('pass'), item('warn'), item('fail'), item('unknown')])).toEqual({ score: 0.5, scored: 3, unscored: 1 })
    expect(Number.isNaN(scoreItems([item('unknown')]).score)).toBe(true)
  })

  it('Weighted score uses the user weights and marks, and is never better than a team assumption', () => {
    const inputs = [
      { id: 'a', label: 'A', items: [item('pass'), item('pass')] }, // 1.0
      { id: 'b', label: 'B', items: [item('fail')] }, // 0.0
    ]
    expect(weightedScore(inputs).score).toBeCloseTo(50)
    const weighted = weightedScore(inputs, { weights: { a: 3, b: 1 }, passMark: 70, failMark: 40 })
    expect(weighted.score).toBeCloseTo(75)
    expect(weighted.state).toBe('pass')
    expect(weighted.items[0].flag).toBe('team_assumption')
    expect(weightedScore(inputs, { weights: { a: 1, b: 3 } }).state).toBe('fail') // 25
    expect(weightedScore(inputs, { weights: { a: 0, b: 0 } }).state).toBe('unknown')
    // An input with only unknown lines is skipped, not counted as zero.
    const gap = weightedScore([...inputs, { id: 'c', label: 'C', items: [item('unknown')] }])
    expect(gap.score).toBeCloseTo(50)
    expect(gap.items[0].note).toMatch(/1 input not scored/)
    expect(weightedScore([{ id: 'a', label: 'A', items: [item('pass', { flag: 'false_assumption' })] }]).items[0].flag).toBe('false_assumption')
  })

  it('Compare two options: per-tower lines go to their tower, project-wide lines count for both', () => {
    const towers = [{ id: 't1', name: 'Tower 1' }, { id: 't2', name: 'Tower 2' }]
    const items = [
      item('pass', { towerId: 't1' }), item('pass', { towerId: 't1' }),
      item('fail', { towerId: 't2' }), item('pass', { towerId: 't2' }),
      item('pass'), // project-wide
    ]
    const r = compareOptions(items, towers, { a: 't1', b: 't2' })
    expect(r.breakdown?.map((b) => Math.round(b.score * 100))).toEqual([100, 67])
    expect(r.headline).toBe('Tower 1 leads by 33 points')
    expect(r.items[1].note).toMatch(/1 project-wide result/)
    expect(compareOptions(items, towers, { a: 't2', b: 't2' }).breakdown?.map((b) => b.id)).toEqual(['t2', 't1'])
    expect(compareOptions(items, [towers[0]]).headline).toMatch(/second tower/)
  })
})

describe('graph', () => {
  const nodes: GraphNode[] = [
    { id: 'site', kind: 'source', ref: 'src.site', label: 'Site' },
    { id: 'mass', kind: 'source', ref: 'src.massing', label: 'Massing' },
    { id: 'prog', kind: 'source', ref: 'src.program', label: 'Program' },
    { id: 'fsr', kind: 'eval', ref: 'built.fsr', label: 'FSR', category: 'PROG' },
    { id: 'sun', kind: 'eval', ref: 'built.sun', label: 'Sun', category: 'CLIM' },
    { id: 'all', kind: 'logic', ref: 'logic.all-pass', label: 'All pass' },
    { id: 'fail', kind: 'logic', ref: 'logic.any-fail', label: 'Any fail' },
  ]
  const wired: GraphEdge[] = [
    { source: 'prog', sourceHandle: 'out', target: 'fsr', targetHandle: 'program' },
    { source: 'mass', sourceHandle: 'out', target: 'fsr', targetHandle: 'massing' },
    { source: 'fsr', sourceHandle: 'out', target: 'all', targetHandle: 'in' },
    { source: 'sun', sourceHandle: 'out', target: 'all', targetHandle: 'in' },
    { source: 'all', sourceHandle: 'out', target: 'fail', targetHandle: 'in' },
  ]
  const ctx: EvalContext = {
    towers: [{ id: 't1', name: 'Tower 1' }],
    evalNode: (n) => ({ state: n.ref === 'built.fsr' ? 'pass' : 'warn', headline: n.label, items: [item(n.ref === 'built.fsr' ? 'pass' : 'warn', { label: n.label })] }),
  }

  it('checks port types, single inputs and loops before wiring', () => {
    expect(canConnect(nodes, [], { source: 'site', sourceHandle: 'out', target: 'fsr', targetHandle: 'program' })).toEqual({ ok: false, reason: 'Site cannot plug into Program' })
    expect(canConnect(nodes, [], { source: 'prog', sourceHandle: 'out', target: 'fsr', targetHandle: 'program' }).ok).toBe(true)
    expect(canConnect(nodes, wired, { source: 'prog', sourceHandle: 'out', target: 'fsr', targetHandle: 'program' }).ok).toBe(false) // already wired
    expect(canConnect(nodes, wired, { source: 'site', sourceHandle: 'out', target: 'sun', targetHandle: 'site' }).ok).toBe(true)
    expect(canConnect(nodes, wired, { source: 'fail', sourceHandle: 'out', target: 'all', targetHandle: 'in' }).reason).toBe('That would make a loop')
    expect(canConnect(nodes, wired, { source: 'fsr', sourceHandle: 'out', target: 'fail', targetHandle: 'in' }).ok).toBe(true) // logic takes many
    expect(wouldCycle(wired, 'fsr', 'fsr')).toBe(true)
  })

  it('runs upstream first; an unwired check waits and counts as unknown downstream', () => {
    const order = topoOrder(nodes, wired).order
    expect(order.indexOf('fsr')).toBeLessThan(order.indexOf('all'))
    expect(order.indexOf('all')).toBeLessThan(order.indexOf('fail'))
    const out = evaluateGraph(nodes, wired, ctx)
    expect(out.fsr.state).toBe('pass')
    expect(out.sun.state).toBe('idle') // no site or massing wired
    expect(out.sun.missing).toEqual(['site', 'massing'])
    expect(out.all.state).toBe('warn') // FSR passes, Sun is unknown
    expect(out.fail.state).toBe('pass') // chained: "all pass" is a check, not a fail
  })

  it('carries lines through chained logic with their origin', () => {
    const full = [...wired, { source: 'site', sourceHandle: 'out', target: 'sun', targetHandle: 'site' }, { source: 'mass', sourceHandle: 'out', target: 'sun', targetHandle: 'massing' }]
    const out = evaluateGraph(nodes, full, ctx)
    expect(out.sun.state).toBe('warn')
    expect(out.all.state).toBe('warn')
    expect(out.fail.items[0].state).toBe('pass')
    expect(evaluateGraph(nodes, full, ctx).all.items[0].flag).toBe('verified')
  })

  it('refuses to run nodes on a loop', () => {
    const loop: GraphEdge[] = [...wired, { source: 'fail', sourceHandle: 'out', target: 'all', targetHandle: 'in' }]
    const out = evaluateGraph(nodes, loop, ctx)
    expect(out.all.headline).toMatch(/loop/)
    expect(out.fail.headline).toMatch(/loop/)
    expect(out.fsr.state).toBe('pass')
  })
})
