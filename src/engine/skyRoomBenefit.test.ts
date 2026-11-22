// P1 #2 (21 Nov, built.hbp-benefit): the sky room lines re-sourced from the 1997 platform text to the 2026 Higher
// Buildings Policy, 2.1(g) community benefit and 2.1(f) Class A heritage, declared by the team.
import { describe, expect, it } from 'vitest'
import { DEFAULT_EGRESS_PRESETS, egressCheck } from './egress'
import { DEFAULT_LIFT_PRESETS, liftCheck } from './lifts'
import { skyRoomCheck } from './skyRoom'
import { fixFor } from '../lib/fixes'
import type { SkyRoom, Tower } from './types'

const base: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'residential', share: 0.3 }],
  coreShare: 0.21, plantEvery: 0, skyLobbies: [], skyRoom: null,
}
const room: SkyRoom = { level: 40, access: 'dedicated', free: true, hoursOpen: 12, visitorShare: 0.6, loadBasis: 'dining', visitMinutes: 60 }
const check = (t: Tower) => skyRoomCheck(t, liftCheck(t, DEFAULT_LIFT_PRESETS, DEFAULT_EGRESS_PRESETS), egressCheck(t, DEFAULT_EGRESS_PRESETS), DEFAULT_EGRESS_PRESETS, DEFAULT_LIFT_PRESETS)
const line = (t: Tower, id: string) => check(t).rules.find((r) => r.id === `${id}-t1`)!

describe('community benefit, HBP 2026 2.1(g) (P1 #2)', () => {
  it('no line cites the 1997 platform text any more; the policy lines cite the 2026 text pp.3–4', () => {
    for (const t of [base, { ...base, skyLobbies: [40], skyRoom: room }]) {
      for (const r of check(t).rules) expect(r.source.label, r.id).not.toMatch(/1997/)
    }
    expect(line(base, 'skyroom-benefit').source).toMatchObject({ page: 'pp.3–4' })
    expect(line(base, 'skyroom-benefit').source.label).toMatch(/Higher Buildings Policy.*2026/)
  })
  it('the public-amenity lines rest on public engagement (Dobson p.91), unverified, and keep their states', () => {
    expect(line(base, 'skyroom-none')).toMatchObject({ state: 'warn', flag: 'unverified', source: { page: 'p.91' } })
    expect(line({ ...base, skyLobbies: [40], skyRoom: room }, 'skyroom-amenity')).toMatchObject({ state: 'pass', flag: 'unverified', source: { page: 'p.91' } })
  })
  it('open until declared; pass with the type and what delivers it: the public room, its public stops, civic floors', () => {
    expect(line(base, 'skyroom-benefit')).toMatchObject({ state: 'unknown', flag: 'verified', value: 'Not declared' })
    const t: Tower = { ...base, skyLobbies: [40], skyRoom: room, publicStops: [{ level: 41, visitorShare: 0.5 }], floorUses: { 10: 'civic', 11: 'civic' }, communityBenefit: 'cultural' }
    const b = line(t, 'skyroom-benefit')
    expect(b.state).toBe('pass')
    // L41 lies in this tower's hotel band: since book node #2's addition it is named and not counted.
    expect(b.value).toBe('2.1(g): community benefit — significant cultural facility, public room L40 + civic floors L10–L11; not counted: L41, a hotel floor or lobby, which is not public space')
    expect(line({ ...t, publicStops: [{ level: 30, visitorShare: 0.5 }] }, 'skyroom-benefit').value).toBe('2.1(g): community benefit — significant cultural facility, public room L40 + public stops L30 + civic floors L10–L11')
    expect(line({ ...base, skyLobbies: [40], skyRoom: room }, 'skyroom-benefit').value).toMatch(/^Not declared; in the model: public room L40/)
    expect(line({ ...base, communityBenefit: 'housing' }, 'skyroom-benefit')).toMatchObject({ state: 'pass', value: '2.1(g): community benefit — low-cost housing' })
  })
  it('Class A heritage (2.1(f)): open until declared, pass for none or retained, fail when demolished', () => {
    expect(line(base, 'skyroom-heritage').state).toBe('unknown')
    expect(line({ ...base, heritageA: 'none' }, 'skyroom-heritage').state).toBe('pass')
    expect(line({ ...base, heritageA: 'retained' }, 'skyroom-heritage').state).toBe('pass')
    expect(line({ ...base, heritageA: 'demolished' }, 'skyroom-heritage')).toMatchObject({ state: 'fail', flag: 'verified' })
  })
  it('keeps the sky room checks working: share, access, lifts, step-free and exits are still there', () => {
    const ids = check({ ...base, skyLobbies: [40], skyRoom: room }).rules.map((r) => r.id.replace(/-t1$/, ''))
    for (const id of ['skyroom-amenity', 'skyroom-benefit', 'skyroom-heritage', 'skyroom-share', 'skyroom-access', 'skyroom-lifts', 'skyroom-security', 'skyroom-stepfree', 'skyroom-exits', 'skyroom-wind']) expect(ids).toContain(id)
  })
})

// Book node #2 addition (21 Nov): a hotel lobby never counts as public space (Placemaking p.241 against skyRoom.ts's
// City staff finding, 2002; p.249), so a hotel floor offered as the public room or a public stop is named, not counted.
describe('community benefit: a hotel floor or lobby is never counted (book node #2 addition)', () => {
  it('a public room on a hotel floor is named and not counted; a declared facility it alone delivers warns', () => {
    // Level 40 set to hotel floor by floor: the sky lobby there takes a hotel floor.
    const t: Tower = { ...base, floorUses: { 40: 'hotel' }, skyLobbies: [40], skyRoom: room, communityBenefit: 'cultural' }
    expect(line({ ...t, floorUses: undefined, skyLobbies: [44], skyRoom: { ...room, level: 44 } }, 'skyroom-benefit').value).toMatch(/not counted: L44/)
    const b = line(t, 'skyroom-benefit')
    expect(b.value).toBe('2.1(g): community benefit — significant cultural facility; not counted: L40, a hotel floor or lobby, which is not public space')
    expect(b.state).toBe('warn')
    expect(b.note).toMatch(/p\.241 and p\.249/)
    expect(b.threshold).toMatch(/a hotel lobby never counts/)
    expect(fixFor('skyroom-benefit', 'warn', b.value, b.threshold, b.flag)).toMatch(/hotel floor or lobby does not count/)
  })
  it('a hotel stop (a hotel floor, or "hotel" in its label) is left out; the rest still counts', () => {
    // L40 is the first hotel floor (office below): a transfer floor between uses, counted. L41 lies in the hotel band; L30
    // is an office floor labelled a hotel bar; L31 an office floor opened as a garden.
    const t: Tower = { ...base, skyLobbies: [40], skyRoom: room, floorUses: { 10: 'civic' }, publicStops: [{ level: 41, visitorShare: 0.5 }, { level: 30, visitorShare: 0.5, label: 'hotel bar' }, { level: 31, visitorShare: 0.5, label: 'garden' }], communityBenefit: 'social' }
    const b = line(t, 'skyroom-benefit')
    expect(b.value).toBe('2.1(g): community benefit — significant social facility, public room L40 + public stops L31 + civic floor L10; not counted: L30, L41, a hotel floor or lobby, which is not public space')
    expect(b.state).toBe('pass')
  })
  it('a room at the change from office to hotel (a transfer floor) reads as before', () => {
    const t: Tower = { ...base, skyLobbies: [40], skyRoom: room, communityBenefit: 'cultural' }
    expect(line(t, 'skyroom-benefit').value).toBe('2.1(g): community benefit — significant cultural facility, public room L40')
    expect(line(t, 'skyroom-benefit').note).not.toMatch(/hotel/)
  })
})
