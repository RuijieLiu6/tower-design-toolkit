import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../store'
import { liftCheck } from '../../engine/lifts'
import { fsrSummary, vtcRules } from '../../engine/vtcRules'
import type { Tower } from '../../engine/types'
import { exportProject, readProject } from '../project/projectFile'
import { pickDesign } from '../project/design'
import { resetHistory, startHistory, undo } from '../project/history'
import { counts, diffResults, digestResults, weakestFlag, worstState } from './digest'
import { MAX_ITERATIONS, addDecision, currentDesign, designHash, diffDesign, loadTrace, recordIteration, restoreIteration, setLive, traceForFile, useTrace } from './trace'

/** The live results the app would compute (the parts the digest reads), without React. */
function results(towers: Tower[]) {
  const s = useStore.getState()
  return {
    fsr: fsrSummary(towers),
    rules: vtcRules(towers, { fsrTier: s.fsrTier, transitLink: s.transitLink }),
    lifts: towers.map((t) => ({ tower: t, ...liftCheck(t, s.liftPresets, s.egressPresets) })),
    cones: [{ tower: towers[0], checks: [], overall: 'limit_unknown', topZ: 135 }],
  } as Record<string, unknown>
}
const digestNow = () => digestResults(results(useStore.getState().towers[useStore.getState().project]))
const sync = () => setLive(designHash(currentDesign()), digestNow())

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  loadTrace(undefined)
  useTrace.setState({ live: null, author: '' })
})

describe('results digest', () => {
  it('finds every result with a state and flag, with tower names and groups, plus FSR metrics', () => {
    const d = digestNow()
    const ids = d.lines.map((l) => l.id)
    expect(ids).toContain('rules:height-t1')
    expect(ids).toContain('rules:fsr-nonres')
    expect(ids.some((id) => id.startsWith('lifts:t1:'))).toBe(true)
    expect(d.lines.find((l) => l.id === 'cones:t1:overall')).toMatchObject({ state: 'warn', flag: 'unresolved' })
    expect(d.lines.find((l) => l.id.startsWith('lifts:'))!.group).toBe('Core & lifts')
    expect(d.metrics['fsr.tier2']).toBeGreaterThan(9)
    expect(counts(d).pass).toBeGreaterThan(0)
    expect(['fail', 'warn']).toContain(worstState(d))
    expect(weakestFlag(d)).toBe('unresolved')
  })
  it('keeps each tower’s results apart (two towers, same rule ids)', () => {
    useStore.getState().addTower()
    const second = useStore.getState().towers.vtc[1].id
    const lifts = digestNow().lines.filter((l) => l.id.startsWith('lifts:'))
    expect(lifts.some((l) => l.id.startsWith('lifts:t1:'))).toBe(true)
    expect(lifts.some((l) => l.id.startsWith(`lifts:${second}:`))).toBe(true)
    expect(lifts.find((l) => l.id.startsWith(`lifts:${second}:`))!.label).toMatch(/Tower 2/)
  })
  it('lists what changed in the results, worst news first', () => {
    const a = digestNow()
    useStore.getState().updateTower('t1', { height: 320 })
    const b = digestNow()
    const ch = diffResults(a, b)
    const height = ch.find((c) => c.id === 'rules:height-t1')!
    expect(height).toMatchObject({ kind: 'worse', before: { state: 'pass' }, after: { state: 'fail' } })
    expect(ch[0].kind).toBe('worse')
  })
})

describe('design diff in plain words', () => {
  it('names tower edits, added towers, rule switches, node switches and input changes', () => {
    const a = currentDesign()
    const s = useStore.getState()
    s.updateTower('t1', { height: 250, bands: [{ use: 'office', share: 1 }] })
    s.addTower()
    s.toggleNode('built.sun')
    useStore.setState({ fsrTier: 3, publicRealm: { ...s.publicRealm, openPublicShare: 0.5 } })
    const lines = diffDesign(a, currentDesign())
    expect(lines).toContain('Tower 1 height: 285 m → 250 m')
    expect(lines.find((l) => l.startsWith('Tower 1 program'))).toMatch(/→ Office 100%/)
    expect(lines).toContain('Added Tower 2')
    expect(lines).toContain('FSR reading: tier 2 → tier 3')
    expect(lines).toContain('Public realm › openPublicShare: 0.85 → 0.5')
    expect(lines.find((l) => l.startsWith('Switched off'))).toMatch(/Sun & shadow preview/)
    expect(lines.some((l) => l.includes('core share'))).toBe(false) // an automatic core follows the lifts
  })
})

describe('recording iterations and decisions', () => {
  it('records the current design with its results, once per distinct design', () => {
    sync()
    const a = recordIteration('Start')!
    expect(a.digest.lines.length).toBeGreaterThan(3)
    expect(recordIteration('Again')).toBe(a) // same design: no duplicate
    useStore.getState().updateTower('t1', { height: 260 })
    expect(recordIteration('Lower')).toBeNull() // results not computed yet: waits
    sync()
    expect(useTrace.getState().iterations.map((i) => i.label)).toEqual(['Start', 'Lower'])
  })
  it('records a decision only with a question and a human rationale, tied to an iteration', () => {
    sync()
    expect(addDecision({ issue: 'Height?', option: '285 m', outcome: 'chosen', rationale: ' ', author: 'RL' })).toBeNull()
    const d = addDecision({ issue: 'Height?', option: '285 m', outcome: 'chosen', rationale: 'Keeps the skyline gap.', author: 'RL' })!
    expect(d.origin).toBe('human')
    expect(useTrace.getState().iterations.find((i) => i.id === d.iterationId)!.kind).toBe('decision')
    expect(useTrace.getState().author).toBe('RL')
  })
  it('restores an earlier design as one undo step', () => {
    const stop = startHistory(); resetHistory()
    sync(); const first = recordIteration('Start')!
    useStore.getState().updateTower('t1', { height: 250 }); sync(); recordIteration('Lower')
    restoreIteration(first.id)
    expect(useStore.getState().towers.vtc[0].height).toBe(285)
    undo()
    expect(useStore.getState().towers.vtc[0].height).toBe(250)
    stop()
  })
  it('caps the trace but keeps iterations that decisions point to', () => {
    sync(); recordIteration('Start')
    addDecision({ issue: 'Keep?', option: '', outcome: 'deferred', rationale: 'Wait for Q&A.', author: 'RL' })
    const kept = useTrace.getState().decisions[0].iterationId
    for (let i = 0; i < MAX_ITERATIONS + 5; i++) { useStore.getState().updateTower('t1', { height: 250 + (i % 50) + i / 1000 }); sync(); recordIteration(`It ${i}`) }
    const its = useTrace.getState().iterations
    expect(its.length).toBe(MAX_ITERATIONS)
    expect(its.some((i) => i.id === kept)).toBe(true)
  })
})

describe('trace in the project file', () => {
  it('travels with the project, and only person-written decisions are accepted', () => {
    sync(); recordIteration('Start')
    addDecision({ issue: 'Height?', option: '285 m', outcome: 'chosen', rationale: 'Keeps the skyline gap.', author: 'RL' })
    const text = exportProject(pickDesign(useStore.getState()), undefined, traceForFile())
    const r = readProject(text)
    expect(r.ok).toBe(true)
    expect(r.file!.trace!.decisions[0].rationale).toBe('Keeps the skyline gap.')
    const f = JSON.parse(text)
    f.trace.decisions[0].origin = 'ai_drafted'
    expect(readProject(JSON.stringify(f)).problems.join(' ')).toMatch(/origin/)
  })
  it('leaves the trace out of the file when there is none', () => {
    expect(JSON.parse(exportProject(pickDesign(useStore.getState()), undefined, traceForFile())).trace).toBeUndefined()
  })
})

