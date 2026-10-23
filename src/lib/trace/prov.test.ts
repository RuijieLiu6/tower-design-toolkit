import { describe, expect, it } from 'vitest'
import { RULE_CARDS } from '../../data/ruleCards'
import { useStore } from '../../store'
import { pickDesign } from '../project/design'
import type { Digest } from './digest'
import { traceToProv } from './prov'
import { makeReview } from './review'
import type { Decision, Iteration, Trace } from './trace'

const digest = (state: 'pass' | 'fail'): Digest => ({ lines: [{ id: 'rules:height-t1', group: 'VTC rules', label: 'Height band', value: '285 m', state, flag: 'verified' }], metrics: {} })
const design = pickDesign(useStore.getInitialState())
const iter = (id: string, hash: string, state: 'pass' | 'fail'): Iteration => ({ id, at: '2026-10-22T09:00:00.000Z', label: id, kind: 'checkpoint', hash, design, digest: digest(state) })
const decision: Decision = { id: 'd1', at: '2026-10-22T09:05:00.000Z', iterationId: 'i2', issue: 'Height', option: '285 m', outcome: 'chosen', rationale: 'Clears the cones', author: 'Ruijie Liu', origin: 'human' }
const card = RULE_CARDS.find((c) => c.id === 'egress.exits')!
const review = makeReview(card, 'Sinnie Choi', { requires: 'Two exits', parameter: 'exits', rule: '2', deontic: 'obligation', strength: 'strict' }, 'agree', '', 3000)!
const trace: Trace = { iterations: [iter('i1', 'aaa', 'fail'), iter('i2', 'bbb', 'pass')], decisions: [decision], reviews: [review] }
const opts = { app: 'Tower Design Toolkit 0.1.0', cards: RULE_CARDS, exportedAt: '2026-10-22T10:00:00.000Z' }

// PROV-O terms (W3C Recommendation, 30 Apr 2013) this export may use; anything else would be invented.
const PROV_TERMS = new Set(['prov:Agent', 'prov:SoftwareAgent', 'prov:Person', 'prov:Entity', 'prov:Activity', 'prov:Bundle', 'prov:Collection',
  'prov:used', 'prov:wasGeneratedBy', 'prov:wasDerivedFrom', 'prov:wasAssociatedWith', 'prov:wasAttributedTo', 'prov:hadMember', 'prov:startedAtTime', 'prov:generatedAtTime'])

describe('decision trace as W3C PROV (P16-M04)', () => {
  it('models runs, results, derivation, decisions and reviews', () => {
    const g = traceToProv(trace, { ...opts, anonymise: true })['@graph']
    const node = (id: string) => g.find((n) => n['@id'] === id)!
    expect(node('urn:tower-studio:run:i2')).toMatchObject({ '@type': 'prov:Activity', 'prov:used': 'urn:tower-studio:design:bbb', 'prov:wasAssociatedWith': 'urn:tower-studio:agent:tool' })
    expect(node('urn:tower-studio:results:i2')).toMatchObject({ 'prov:wasGeneratedBy': 'urn:tower-studio:run:i2', 'ts:worstState': 'pass' })
    expect(node('urn:tower-studio:results:i1')['ts:worstState']).toBe('fail')
    expect(node('urn:tower-studio:design:bbb')['prov:wasDerivedFrom']).toBe('urn:tower-studio:design:aaa')
    expect(node('urn:tower-studio:decision:d1')).toMatchObject({ 'prov:used': 'urn:tower-studio:results:i2', 'ts:origin': 'human', 'ts:rationale': 'Clears the cones' })
    const rv = node(`urn:tower-studio:review:${review.id}`)
    expect(String(rv['prov:used'])).toMatch(/^urn:tower-studio:card:egress\.exits@/)
    expect(g.some((n) => n['@id'] === rv['prov:used'])).toBe(true)
    expect(g[0]['@type']).toEqual(['prov:Bundle', 'prov:Entity'])
    expect(new Set(g.map((n) => n['@id'])).size).toBe(g.length)
  })
  it('replaces names unless asked to keep them', () => {
    const anon = JSON.stringify(traceToProv(trace, { ...opts, anonymise: true }))
    expect(anon).not.toMatch(/Ruijie|Sinnie/)
    expect(anon).toMatch(/Person 1/)
    expect(anon).toMatch(/Person 2/)
    const named = JSON.stringify(traceToProv(trace, { ...opts, anonymise: false }))
    expect(named).toMatch(/Ruijie Liu/)
    expect(named).toMatch(/Sinnie Choi/)
  })
  it('uses only real PROV-O terms, and says the AI drafted the cards', () => {
    const b = traceToProv(trace, { ...opts, anonymise: true })
    const used = new Set<string>()
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k.startsWith('prov:')) used.add(k); if (typeof x === 'string' && x.startsWith('prov:')) used.add(x); walk(x) }
    }
    walk(b['@graph'])
    for (const t of used) expect(PROV_TERMS.has(t), t).toBe(true)
    expect(b['@context'].prov).toBe('http://www.w3.org/ns/prov#')
    const drafter = b['@graph'].find((n) => n['@id'] === 'urn:tower-studio:agent:card-drafter')!
    expect(drafter['rdfs:label']).toMatch(/AI \(Claude\)/)
  })
})
