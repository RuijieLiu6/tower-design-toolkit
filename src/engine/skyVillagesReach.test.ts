import { describe, expect, it } from 'vitest'
import { fixFor } from '../lib/fixes'
import { useStore } from '../store'
import { liftCheck } from './lifts'
import { towerFloors } from './massing'
import { reachAt, skyVillages } from './skyVillages'
import type { Tower } from './types'

const s0 = useStore.getInitialState()
// Office below, homes above (as C): a tenants' floor in the office stack, a lounge in the homes' stack.
const base: Tower = { ...s0.towers.vtc[0], bands: [{ use: 'office', share: 0.45 }, { use: 'residential', share: 0.55 }] }
const tower = (floorUses: Tower['floorUses']): Tower => ({ ...base, floorUses })
const levels = (t: Tower, use: string) => towerFloors(t).filter((f) => !f.podium && f.use === use).map((f) => f.level)
const officeMid = levels(base, 'office')[6]
const homeMid = levels(base, 'residential')[8]
const read = (t: Tower) => skyVillages(t, towerFloors(t), { rises: liftCheck(t, s0.liftPresets, s0.egressPresets).rises })
const line = (t: Tower, id: string) => read(t).rules.find((r) => r.id === id)

describe('Shared levels by who can reach them (tool cycle 11, review R6-6)', () => {
  it('knows whose lifts stop at a floor', () => {
    const t = tower({ [officeMid]: 'amenity', [homeMid]: 'amenity' })
    const rises = liftCheck(t, s0.liftPresets, s0.egressPresets).rises
    expect(reachAt(rises, officeMid).has('residential')).toBe(false)
    expect(reachAt(rises, officeMid).has('office')).toBe(true)
    expect(reachAt(rises, homeMid).has('residential')).toBe(true)
  })

  it('a lounge in the office stack does not count for the homes, and says so', () => {
    const t = tower({ [officeMid]: 'amenity', [homeMid]: 'amenity' })
    const reach = line(t, 'sv-reach')!
    expect(reach.state).toBe('warn')
    expect(reach.value).toMatch(new RegExp(`not from the homes: L${officeMid} amenity \\(office lifts only\\)`))
    expect(reach.value).toMatch(/^1 of 2 shared levels/)
    expect(line(t, 'sv-homes')!.value).toMatch(/over 1 shared level above the base/)
    expect(fixFor('sv-reach', 'warn', reach.value, reach.threshold, reach.flag)).toMatch(/homes’ lifts/)
  })

  it('a lounge in the homes’ stack counts, and the line passes when every lounge is reached and the gap is in the band', () => {
    const t = tower({ [homeMid]: 'amenity' })
    const reach = line(t, 'sv-reach')!
    expect(reach.value).toMatch(/^1 of 1 shared levels/)
    expect(reach.value).not.toMatch(/not from the homes/)
  })

  it('without the lift plan it reads as before (no reach line; every shared level counts)', () => {
    const t = tower({ [officeMid]: 'amenity', [homeMid]: 'amenity' })
    const r = skyVillages(t, towerFloors(t))
    expect(r.rules.some((x) => x.id === 'sv-reach')).toBe(false)
    expect(r.rules.find((x) => x.id === 'sv-homes')!.value).toMatch(/over 2 shared levels/)
  })
})

describe('the homes’ gap over the storeys the homes occupy', () => {
  it('does not count the office storeys below the homes', () => {
    const t = tower({ [homeMid]: 'amenity' })
    const reach = line(t, 'sv-reach')!
    const homes = levels(t, 'residential')
    expect(reach.value).toMatch(new RegExp(`homes L${homes[0]}–L${homes[homes.length - 1]}`))
    // The gap starts at the base below the homes only if nothing reached sits lower; it never spans the office stack alone.
    const m = /largest gap (\d+) storeys \((.+?) → (.+?),/.exec(reach.value)!
    expect(m).toBeTruthy()
    expect(Number(m[1])).toBeLessThanOrEqual(homes.length + 1)
  })
})
