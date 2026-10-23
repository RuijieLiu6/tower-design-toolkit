import { beforeEach, describe, expect, it } from 'vitest'
import { RULE_CARDS, type RuleCard } from '../../data/ruleCards'
import { useStore } from '../../store'
import { pickDesign } from '../project/design'
import { exportProject, readProject } from '../project/projectFile'
import { cardsForResult } from './sources'
import { cardHash, makeReview, reviewStatus, type Reading } from './review'
import { addReview, loadTrace, traceForFile, useTrace } from './trace'

const card = RULE_CARDS.find((c) => c.id === 'egress.exits')!
const reading = (patch: Partial<Reading> = {}): Reading => ({ requires: 'Each floor needs two separate ways out', parameter: 'exits', rule: '2 or more', deontic: 'obligation', strength: 'strict', ...patch })

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  loadTrace(undefined)
})

describe('blind-first rule-card review (P16-M02)', () => {
  it('needs a reviewer, their own reading, a type and a strength', () => {
    expect(makeReview(card, '', reading(), 'agree', '', 1000)).toBeNull()
    expect(makeReview(card, 'Sinnie', reading({ requires: '', rule: '' }), 'agree', '', 1000)).toBeNull()
    expect(makeReview(card, 'Sinnie', reading({ deontic: '' }), 'agree', '', 1000)).toBeNull()
    const r = makeReview(card, ' Sinnie ', reading(), 'agree', '', 1234.6)!
    expect(r).toMatchObject({ reviewer: 'Sinnie', mode: 'blind-first', origin: 'human', dwellMs: 1235, cardHash: cardHash(card), matches: { deontic: true, strength: true } })
  })
  it('counts agreement only when the blind reading matched; disagreement and edits are visible', () => {
    expect(reviewStatus(card, []).state).toBe('unreviewed')
    const ok = makeReview(card, 'Sinnie', reading(), 'agree', '', 5000)!
    expect(reviewStatus(card, [ok]).state).toBe('reviewed')
    const differs = makeReview(card, 'Sinnie', reading({ strength: 'defeasible' }), 'agree', '', 5000)!
    const s = reviewStatus(card, [differs])
    expect(s.state).toBe('disputed')
    expect(s.reason).toMatch(/differed on strength/)
    expect(reviewStatus(card, [ok, makeReview(card, 'Ruijie', reading(), 'disagree', 'Clause has a small-floor exception', 9000)!]).state).toBe('disputed')
    expect(reviewStatus(card, [makeReview(card, 'Ruijie', reading(), 'unsure', '', 9000)!]).state).toBe('unreviewed')
    const edited: RuleCard = { ...card, rule: 'at least 3' }
    expect(reviewStatus(edited, [ok]).state).toBe('stale')
    expect(cardHash(edited)).not.toBe(cardHash(card))
  })
  it('travels in the project trace, schema-checked', () => {
    addReview(makeReview(card, 'Sinnie', reading(), 'agree', 'Matches 3.4.2.1', 4200)!)
    const t = traceForFile()!
    expect(t.reviews).toHaveLength(1)
    expect(t.iterations).toEqual([])
    const text = exportProject(pickDesign(useStore.getState()), undefined, t)
    const back = readProject(text)
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.file!.trace!.reviews![0]).toMatchObject({ cardId: 'egress.exits', verdict: 'agree', reviewer: 'Sinnie' })
    const bad = JSON.parse(text)
    bad.trace.reviews[0].mode = 'card-first'
    expect(readProject(JSON.stringify(bad)).ok).toBe(false)
    loadTrace(undefined)
    expect(useTrace.getState().reviews).toEqual([])
  })
  it('puts the right card on each result card of a node, without crossing nodes', () => {
    expect(cardsForResult('built.core-lifts', 'ntg-t1').map((c) => c.id)).toEqual(['lifts.net-to-gross'])
    expect(cardsForResult('built.wind-procedure', 'height-60').map((c) => c.id)).toEqual(['nbc.wind-procedure'])
    expect(cardsForResult('built.vtc-rules', 'height-t1').map((c) => c.id)).toEqual(['vtc.height-band'])
    expect(cardsForResult('built.city-in-nature', 'views').map((c) => c.id)).toEqual(['pvg.3.1.1'])
    expect(cardsForResult('built.core-lifts', 'core-fit-t1')).toEqual([])
    expect(cardsForResult(null, 'ntg-t1')).toEqual([])
  })
})
