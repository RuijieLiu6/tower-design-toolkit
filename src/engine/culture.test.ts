import { describe, expect, it } from 'vitest'
import { DEFAULT_RECORD, exportGate, lintClaims, NATIONS, recordIssues, statementFor, type Nation, type NationRecord } from './culture'
import { boardAppendix, IPTC, provenanceIssues, type ProvEntry } from './provenance'

const all = (r: Partial<NationRecord> = {}): Record<Nation, NationRecord> => Object.fromEntries(NATIONS.map((n) => [n, { ...DEFAULT_RECORD, ...r }])) as Record<Nation, NationRecord>

describe('claims lint (P07-M01 stage A, regex only)', () => {
  it('bans duty-sense "consulted" next to a Nation, whatever the status', () => {
    const f = lintClaims('The plaza was consulted on with the Musqueam.', all({ status: 4, counterpart: 'authorized', reference: 'L-1' }))
    expect(f).toHaveLength(1)
    expect(f[0].rule.id).toBe('consulted')
    expect(f[0].pass).toBe(false)
  })
  it('leaves sentences without a Nation alone', () => {
    expect(lintClaims('We consulted the zoning by-law and met with the structural engineer.', all())).toEqual([])
  })
  it('needs N3 for "spoke with" for the Nation named, and only that Nation', () => {
    const rec = all()
    rec.Squamish = { ...rec.Squamish, status: 3, counterpart: 'staff', evidence: 'call', date: '2026-10-20' }
    expect(lintClaims('We spoke with Squamish Nation staff about the plaza.', rec)[0].pass).toBe(true)
    expect(lintClaims('We spoke with Musqueam staff about the plaza.', rec)[0].pass).toBe(false)
  })
  it('checks a general reference to Nations against all three', () => {
    const rec = all({ status: 3, counterpart: 'member', evidence: 'x', date: 'd' })
    rec['Tsleil-Waututh'] = { ...DEFAULT_RECORD }
    const f = lintClaims('The design was shaped through engagement with the host Nations.', rec)
    expect(f[0].nations).toHaveLength(3)
    expect(f[0].pass).toBe(false)
    expect(f[0].reason).toMatch(/Tsleil-Waututh/)
  })
  it('bars collaboration phrases below N4 and approval wording without a reference', () => {
    expect(lintClaims('Co-designed with Tsleil-Waututh knowledge keepers.', all({ status: 3, counterpart: 'member' }))[0].pass).toBe(false)
    expect(lintClaims('The garden was approved by Musqueam.', all({ status: 4, counterpart: 'authorized', reference: '' }))[0].pass).toBe(false)
    expect(lintClaims('The garden was approved by Musqueam.', all({ status: 4, counterpart: 'authorized', reference: 'Letter 2026-10-01' }))[0].pass).toBe(true)
  })
  it('never lets an entry claim free, prior and informed consent', () => {
    expect(lintClaims('This tower respects FPIC.', all({ status: 4, counterpart: 'authorized', reference: 'x' }))[0].pass).toBe(false)
  })
})

describe('ledger, statements and export gate', () => {
  it('asks for evidence, counterpart and reference by status', () => {
    expect(recordIssues(DEFAULT_RECORD)).toEqual([])
    expect(recordIssues({ ...DEFAULT_RECORD, status: 4 }).length).toBeGreaterThanOrEqual(4)
  })
  it('says at N0 that no Nation took part', () => {
    expect(statementFor('Musqueam', DEFAULT_RECORD)).toMatch(/^No Musqueam representative took part/)
  })
  it('holds the gate until every item is done', () => {
    const rec = all({ confirmed: true })
    expect(exportGate(rec, [], true, { authors: true, associate: true, instructor: true }).every((g) => g.ok)).toBe(true)
    expect(exportGate(all(), [], true, { authors: true, associate: true, instructor: true }).find((g) => g.id === 'declared')?.ok).toBe(false)
  })
})

describe('provenance (P07-M07)', () => {
  const base: ProvEntry = { id: 'a', element: 'Board 2 hero render', kind: 'image', involvement: 'none', tool: '', toolGenerative: false, date: '2026-10-22', humanContribution: 'Modelled and rendered', decidedBy: 'person', cultural: false, reviewer: '', licence: '', sourceIds: '' }
  it('maps involvement to the IPTC term, generated to trainedAlgorithmicMedia', () => {
    expect(IPTC.generated.term).toBe('trainedAlgorithmicMedia')
    expect(IPTC.none.term).toBe('digitalCreation')
    expect(IPTC.capture.term).toBe('digitalCapture')
  })
  it('catches an understated level, a missing licence and AI cultural text without a reviewer', () => {
    const issues = provenanceIssues([
      { ...base, involvement: 'assist', toolGenerative: true, tool: 'gpt-image-2' },
      { ...base, id: 'b', element: 'Narrative', kind: 'text', involvement: 'generated', cultural: true },
    ])
    expect(issues.map((i) => i.id)).toEqual(expect.arrayContaining(['understated', 'licence', 'reviewer']))
  })
  it('writes an appendix with no people in it', () => {
    const txt = boardAppendix([{ ...base, involvement: 'generated', tool: 'gpt-image-2', reviewer: 'Ruijie', humanContribution: 'Ruijie prompted' }], [{ name: 'three.js', licence: 'MIT' }])
    expect(txt).toMatch(/trainedAlgorithmicMedia/)
    expect(txt).not.toMatch(/Ruijie/)
  })
})
