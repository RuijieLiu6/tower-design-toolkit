import { describe, expect, it } from 'vitest'
import type { RuleState } from '../engine/types'
import { demoDesign } from './demo'
import {
  BRIEF_WEIGHTS, changeKey, compareNode, criterionScores, explainDifference, nodeOfLine, nodeSummaries, weightedTotal, weightsChanged, type OptionRecord,
} from './options'
import type { Design } from './project/design'
import type { Digest } from './trace/digest'
import type { Iteration } from './trace/trace'

const line = (id: string, state: RuleState, flag = 'verified', value: string = state) => ({ id, group: id.split(':')[0], label: id, value, state, flag })
const digest = (...lines: ReturnType<typeof line>[]): Digest => ({ lines, metrics: {} })
const only = (d: Design, ids: string[]): Design => ({ ...d, enabled: Object.fromEntries(ids.map((i) => [i, true])) })

describe('results by node', () => {
  it('maps trace lines to their node', () => {
    expect(nodeOfLine('rules:t1:height-t1')).toBe('built.vtc-rules')
    expect(nodeOfLine('lifts:t2:interval')).toBe('built.core-lifts')
    expect(nodeOfLine('community:metric@t1:community.sample.lease-depth')).toBe('community.sample.lease-depth')
    expect(nodeOfLine('unknown:x')).toBeNull()
  })

  it('summarises each switched-on node with its worst state and weakest flag', () => {
    const d = only(demoDesign(), ['built.vtc-rules', 'built.core-lifts', 'built.viewcones', 'built.economics'])
    const s = nodeSummaries(d, digest(line('rules:t1:a', 'pass'), line('rules:t1:b', 'warn', 'team_assumption'), line('lifts:t1:c', 'fail', 'unverified')))
    expect(s.map((x) => x.nodeId)).toEqual(['built.vtc-rules', 'built.core-lifts', 'built.economics']) // view cones run in Real Vancouver only
    expect(s[0]).toMatchObject({ state: 'warn', flag: 'team_assumption', headline: '1 to check · 1 pass', recorded: true })
    expect(s[1]).toMatchObject({ state: 'fail', flag: 'unverified' })
    expect(s[2]).toMatchObject({ recorded: false, headline: 'not in the decision trace yet' })
    // Info lines do not pull a passing node down to unknown.
    expect(nodeSummaries(d, digest(line('lifts:t1:a', 'pass'), line('lifts:t1:b', 'unknown')))[1]).toMatchObject({ state: 'pass', headline: '1 pass · 1 info' })
  })

  it('calls a node better or worse by worst state, then by fails and checks', () => {
    const d = only(demoDesign(), ['built.vtc-rules'])
    const s = (...ls: ReturnType<typeof line>[]) => nodeSummaries(d, digest(...ls))[0]
    const a = s(line('rules:t1:a', 'fail'), line('rules:t1:b', 'pass'))
    expect(compareNode(a, s(line('rules:t1:a', 'warn'), line('rules:t1:b', 'pass')))).toBe('better')
    expect(compareNode(a, s(line('rules:t1:a', 'fail'), line('rules:t1:b', 'fail')))).toBe('worse')
    expect(compareNode(a, s(line('rules:t1:a', 'fail'), line('rules:t1:b', 'pass')))).toBe('same')
    expect(compareNode(a, s(line('rules:t1:a', 'fail', 'verified', 'other'), line('rules:t1:b', 'pass')))).toBe('changed') // value moved, states did not
    expect(compareNode(a, undefined)).toBe('n/a')
  })
})

describe('jury-criterion weighting', () => {
  // VTC rules: urban_integration_10. Core & lifts: human_scale_40, design_excellence_20, urban_integration_10.
  const d = only(demoDesign(), ['built.vtc-rules', 'built.core-lifts'])
  const dg = digest(line('rules:t1:a', 'pass'), line('rules:t1:b', 'fail'), line('rules:t1:c', 'unknown'), line('lifts:t1:d', 'warn', 'false_assumption'))

  it('scores a criterion as the mean of its nodes, each the mean of its lines (unknown left out)', () => {
    const s = Object.fromEntries(criterionScores(d, dg).map((x) => [x.criterion, x]))
    expect(s.urban_integration_10.score).toBeCloseTo(50) // rules (1 + 0) / 2 = 0.5, lifts 0.5 → 50
    expect(s.urban_integration_10.nodes).toBe(2)
    expect(s.human_scale_40.score).toBeCloseTo(50) // lifts only
    expect(s.human_scale_40.flag).toBe('false_assumption') // the weakest evidence travels with the score
    expect(Number.isNaN(s.cultural_context_30.score)).toBe(true) // no tagged node
  })

  it('weights the criteria that have a score, with the brief weights by default', () => {
    const scores = criterionScores(d, digest(line('rules:t1:a', 'pass'), line('lifts:t1:d', 'fail')))
    // human 0 (w40), design 0 (w20), urban (1 + 0)/2 = 50 (w10), cultural none: (0·40 + 0·20 + 50·10) / 70
    expect(weightedTotal(scores, BRIEF_WEIGHTS)).toBeCloseTo(500 / 70)
    expect(weightedTotal(scores, { ...BRIEF_WEIGHTS, human_scale_40: 0, design_excellence_20: 0 })).toBeCloseTo(50)
    expect(Number.isNaN(weightedTotal(scores, { human_scale_40: 0, cultural_context_30: 0, design_excellence_20: 0, urban_integration_10: 0 }))).toBe(true)
    expect(weightedTotal(scores, { ...BRIEF_WEIGHTS, human_scale_40: -5 })).toBeCloseTo((0 * 20 + 50 * 10) / 30) // negative counts as 0
    expect(weightsChanged(BRIEF_WEIGHTS)).toBe(false)
    expect(weightsChanged({ ...BRIEF_WEIGHTS, cultural_context_30: 35 })).toBe(true)
  })
})

describe('explain the difference', () => {
  const base = demoDesign()
  const taller: Design = { ...base, towers: { ...base.towers, vtc: base.towers.vtc.map((t, i) => (i === 0 ? { ...t, height: 300 } : t)) } }
  const both: Design = { ...taller, fsrTier: 3 }
  const opt = (name: string, design: Design, dg: Digest): OptionRecord => ({ key: name, name, savedAt: '', design, digest: dg })
  const iter = (at: string, design: Design, dg: Digest): Iteration => ({ id: at, at, label: at, kind: 'checkpoint', hash: at, design, digest: dg })
  const dA = digest(line('rules:t1:height', 'pass', 'verified', '285.0 m'), line('rules:fsr', 'pass'), line('lifts:t1:n', 'pass'))
  const dB = digest(line('rules:t1:height', 'pass', 'verified', '300.0 m'), line('rules:fsr', 'warn'), line('lifts:t1:n', 'warn'))

  it('lists the inputs that differ and the results that differ', () => {
    const e = explainDifference(opt('A', base, dA), opt('B', both, dB), [])
    expect(e.inputs.map((i) => i.key)).toEqual(['Tower 1 · mixed use height', 'FSR reading'])
    expect(e.results.map((r) => r.id).sort()).toEqual(['lifts:t1:n', 'rules:fsr', 'rules:t1:height'])
    expect(e.unexplained).toHaveLength(3) // two inputs and no trace yet: nothing can be attributed
  })

  it('attributes every result to the one input when the options differ by one input', () => {
    const e = explainDifference(opt('A', base, dA), opt('B', taller, dB), [])
    expect(e.inputs).toHaveLength(1)
    expect(e.inputs[0].moved).toHaveLength(3)
    expect(e.unexplained).toEqual([])
  })

  it('attributes results to an input through trace steps that changed only that input', () => {
    const trace = [
      iter('2026-10-22T01:00:00Z', base, dA),
      // A step that changed only the height moved the height line and the lifts.
      iter('2026-10-22T01:05:00Z', taller, digest(line('rules:t1:height', 'pass', 'verified', '300.0 m'), line('rules:fsr', 'pass'), line('lifts:t1:n', 'warn'))),
      iter('2026-10-22T01:10:00Z', both, dB),
    ]
    const e = explainDifference(opt('A', base, dA), opt('B', both, dB), trace)
    const h = e.inputs.find((i) => i.key.endsWith('height'))!
    expect(h.steps).toBe(1)
    expect(h.moved.map((m) => m.id).sort()).toEqual(['lifts:t1:n', 'rules:t1:height'])
    const f = e.inputs.find((i) => i.key === 'FSR reading')!
    expect(f.moved.map((m) => m.id)).toEqual(['rules:fsr'])
    expect(e.unexplained).toEqual([])
  })

  it('reads the input out of a plain-words change', () => {
    expect(changeKey('Tower 1 Height: 285 m → 300 m')).toBe('Tower 1 Height')
    expect(changeKey('Added Tower 3')).toBe('Added Tower 3')
  })
})
