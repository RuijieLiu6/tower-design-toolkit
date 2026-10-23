import { describe, expect, it } from 'vitest'
import { liftCheck, suggestSkyLobby } from './lifts'
import { floorHeights, liftStrategies } from './liftStrategy'
import type { Floor, Tower } from './types'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.25, plantEvery: 0,
}
const short: Tower = { ...vtc, podiumHeight: 0, height: 40, f2f: 4, bands: [{ use: 'office', share: 1 }] }
const floor = (level: number, z0: number, z1: number, extra: Partial<Floor> = {}): Floor => ({ level, z0, z1, use: 'office', area: 2000, podium: false, ...extra })

describe('lift strategy comparator', () => {
  it('direct and sky lobby are the lift check itself, with no numbers for double-deck or destination control', () => {
    const s = liftStrategies(vtc)
    const [direct, sky, dd, dc] = s.options
    expect(s.options.map((o) => o.id)).toEqual(['direct', 'skylobby', 'doubledeck', 'destination'])
    expect(direct.result!.totalCars).toBe(liftCheck(vtc, undefined, undefined, { skipDirect: true }).totalCars)
    const level = suggestSkyLobby(vtc)!
    expect(sky.name).toContain(`L${level}`)
    expect(sky.result!.requiredMax).toBeCloseTo(liftCheck({ ...vtc, skyLobbies: [level] }, undefined, undefined, { skipDirect: true }).requiredMax, 6)
    for (const o of [dd, dc]) { expect(o.computed).toBe(false); expect(o.result).toBeNull() }
    expect(dd.checks.find((c) => c.id === 'dd-capacity')!.flag).toBe('unresolved')
    expect(dc.checks.find((c) => c.id === 'dc-awt')!.value).toBe('simulation not performed')
    expect(dc.checks.find((c) => c.id === 'dc-gain')!.flag).toBe('unverified')
  })

  it('keeps the sky lobbies the tower already has, and compares them with direct', () => {
    const t = { ...vtc, skyLobbies: [30] }
    const s = liftStrategies(t)
    expect(s.options[1].name).toBe('Sky lobby at L30')
    expect(s.options[0].result!.skyLobbies).toEqual([])
    expect(s.options[1].result!.skyLobbies.map((f) => f.level)).toEqual([30])
  })

  it('recommends the computed layout with the smallest core among those with no failing lift rule', () => {
    const s = liftStrategies(vtc)
    const ok = s.options.filter((o) => o.computed && o.fails === 0)
    if (!ok.length) expect(s.best).toBeNull()
    else expect(s.best).toBe(ok.reduce((a, b) => (b.result!.requiredMax < a.result!.requiredMax ? b : a)).id)
    // The competition tower: a sky lobby saves core area (backlog record: 21% direct, 17.5% with one at L40).
    expect(s.options[1].result!.requiredMax).toBeLessThan(s.options[0].result!.requiredMax)
  })

  it('a short tower gets no suggested sky lobby and the option is not computed', () => {
    const s = liftStrategies(short)
    expect(suggestSkyLobby(short)).toBeNull()
    expect(s.options[1].computed).toBe(false)
    expect(s.best).toBe(s.options[0].fails === 0 ? 'direct' : null)
  })

  it('double-deck passes floor heights only when every served floor is the same height', () => {
    expect(liftStrategies(vtc).options[2].checks[0].state).toBe('pass')
    const mixed = [floor(1, 0, 6, { podium: true }), floor(2, 6, 10), floor(3, 10, 14), floor(4, 14, 18.5), floor(5, 18.5, 24, { use: 'mechanical' })]
    const h = floorHeights(mixed)
    expect(h.served.map((f) => f.level)).toEqual([2, 3, 4])
    expect(h.heights).toEqual([4, 4.5])
    expect(h.uniform).toBe(false)
    expect(floorHeights(mixed.slice(0, 3)).uniform).toBe(true)
  })
})
