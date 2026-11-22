// Node built.claims-coverage (NODE_LIST #4, completes gap G26): the claims lint recognises "Salish", stops hitting on
// "United Nations", and checks motif wording (inspired by, evokes, echoes, draws on, homage) in every sentence about a
// Nation, a language, a cultural practice or form and ornament, needing N4 and a person's read (Placemaking pp.87–89,
// 110–111, read as a warning).
import { describe, expect, it } from 'vitest'
import { claimsLines, DEFAULT_RECORD, lintClaims, NATIONS, type Nation, type NationRecord } from './culture'
import { fixFor } from '../lib/fixes'

const all = (r: Partial<NationRecord> = {}): Record<Nation, NationRecord> => Object.fromEntries(NATIONS.map((n) => [n, { ...DEFAULT_RECORD, ...r }])) as Record<Nation, NationRecord>
const N4 = { status: 4 as const, counterpart: 'authorized' as const, reference: 'L-1', use: 'facade pattern' }
const reader = { name: 'A. Reader, cultural advisor', date: '2026-11-21' }

describe('claims coverage (node built.claims-coverage)', () => {
  it('"inspired by Musqueam weaving" fails without a reader, and without N4 even with one', () => {
    const text = 'The facade is inspired by Musqueam weaving.'
    const none = lintClaims(text, all())
    expect(none).toHaveLength(1)
    expect(none[0].rule.id).toBe('motif')
    expect(none[0].pass).toBe(false)
    expect(none[0].reason).toMatch(/no person’s read is recorded/)
    expect(none[0].reason).toMatch(/Musqueam is below N4/)
    expect(lintClaims(text, all(), reader)[0].pass).toBe(false) // read, but no written permission
    const ok = lintClaims(text, { ...all(), Musqueam: { ...DEFAULT_RECORD, ...N4 } }, reader)
    expect(ok[0].pass).toBe(true)
    expect(lintClaims(text, { ...all(), Musqueam: { ...DEFAULT_RECORD, ...N4 } })[0].pass).toBe(false) // N4 alone is not enough
  })

  it('checks sentences that name no Nation: a practice touches all three; form and ornament needs the read only', () => {
    const practice = lintClaims('The crown echoes woven cedar baskets.', all(), reader)
    expect(practice).toHaveLength(1)
    expect(practice[0].nations).toEqual([...NATIONS])
    expect(practice[0].pass).toBe(false)
    const form = 'The twisting top pays homage to the mountains behind it.'
    expect(lintClaims(form, all())[0]).toMatchObject({ pass: false, nations: [] })
    expect(lintClaims(form, all(), reader)[0].pass).toBe(true)
    // A motif verb with no Nation, language, practice or form beside it is not a motif claim.
    expect(lintClaims('The jury brief inspired by its clarity a lot of debate.', all())).toHaveLength(0)
  })

  it('recognises Salish, checking against all three Nations', () => {
    const f = lintClaims('The crown echoes Coast Salish design.', all())
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ general: true, pass: false })
    expect(f[0].nations).toEqual([...NATIONS])
    // Engagement wording next to Salish is checked too (it used to be skipped).
    expect(lintClaims('We spoke with Salish weavers.', all()).map((x) => x.rule.id)).toEqual(['engagement'])
  })

  it('"United Nations" no longer hits; Nations in general still do', () => {
    expect(lintClaims('The plan follows the United Nations goals we worked with on the brief.', all())).toHaveLength(0)
    expect(lintClaims('We worked with the host Nations on the plaza.', all())).toHaveLength(1)
  })

  it('a plain sentence passes', () => {
    const lines = claimsLines('The tower rises 300 m above the station plaza, with a public room at level 45.')
    expect(lines[0]).toMatchObject({ id: 'cc-lint', state: 'pass' })
    expect(lines.some((l) => l.id.startsWith('cc-motif-') || l.id.startsWith('cc-claim-'))).toBe(false)
  })

  it('reports motif lines apart, cited, with a fix of their own', () => {
    const lines = claimsLines('The facade is inspired by Musqueam weaving. We engaged with the Squamish Nation.')
    const motif = lines.find((l) => l.id === 'cc-motif-0')!
    expect(motif.state).toBe('fail')
    expect(motif.source.page).toBe('pp.87–89, 110–111')
    expect(motif.threshold).toMatch(/a person’s read recorded, and Musqueam at N4/)
    expect(lines.find((l) => l.id === 'cc-claim-0')!.label).toMatch(/Engagement wording/)
    expect(lines[0]).toMatchObject({ id: 'cc-lint', state: 'fail' })
    expect(fixFor('cc-motif-0', 'fail', motif.value)).toMatch(/record their name/)
    expect(motif.specialist).toMatch(/person’s read/) // Needs specialist until a reader is recorded
    expect(claimsLines('The facade is inspired by Musqueam weaving.', { Musqueam: N4 }, reader).find((l) => l.id === 'cc-motif-0')!.state).toBe('pass')
  })
})
