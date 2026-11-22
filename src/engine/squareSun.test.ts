// P1 #3 (21 Nov, built.square-sun): sun on the design's own square, beside the line that reads the protected and
// base-map open spaces. Shadow masks and hour grid as the sun-hours map (engine/solarRules.ts squareSun).
import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLIC_REALM, groundPlaneCheck, sunLine, squareSunLine } from './publicRealm'
import { emptyOccluders, type Pt } from './shadow'
import { runSolarJob } from './solarJob'
import { squareSun, towerOccluders, winterSquareWindow } from './solarRules'
import type { Tower } from './types'

const tower: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 150, f2f: 4.2, podiumHeight: 0, podiumWidth: 30, podiumDepth: 30,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: false, skyLobbies: [],
}
const sq = (cx: number, cy: number, h = 15): Pt[] => [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]]

describe('sun on the design\'s own square (P1 #3)', () => {
  it('a square north of a tower loses sun; one south of it keeps every hour (north = +y)', () => {
    const prop = towerOccluders([tower])
    const north = squareSun(sq(0, 40), emptyOccluders(), prop, { northDeg: 0 })!
    const south = squareSun(sq(0, -40), emptyOccluders(), prop, { northDeg: 0 })!
    expect(south.sep.share2h).toBe(1)
    expect(south.dec.share2h).toBe(1)
    expect(south.sep.meanHours).toBeCloseTo(6, 1)
    expect(north.sep.meanHours).toBeLessThan(south.sep.meanHours)
    expect(north.dec.share2h).toBeLessThan(south.dec.share2h)
    expect(north.area).toBeCloseTo(900, 0)
    expect(winterSquareWindow().label).toBe('21 Dec, 11:00–14:00')
  })
  it('the solar run reads the square when given one', () => {
    const out = runSolarJob({ project: 'city', towers: [{ ...tower, x: 2500, y: 2500 }], ctx: null, readings: {}, mapDate: 'equinox', half: 200, cell: 10, square: sq(2500, 2540) })
    expect(out.square).toBeTruthy()
    expect(out.square!.sep.label).toBe('22 Sep, 10:00–16:00 PT')
    expect(runSolarJob({ project: 'city', towers: [{ ...tower, x: 2500, y: 2500 }], ctx: null, readings: {}, mapDate: 'equinox', half: 200, cell: 10 }).square).toBeNull()
  })
  it('pr-sun says it reads the protected and base-map open spaces; the square line describes, never judges', () => {
    expect(sunLine(null).label).toBe('Sun on protected and base-map open spaces')
    const off = groundPlaneCheck([{ ...tower, x: -40 }], DEFAULT_PUBLIC_REALM).rules.find((r) => r.id === 'pr-square-sun')!
    expect(off).toMatchObject({ state: 'unknown', flag: 'team_assumption', value: 'Switch on Solar access & sun hours', source: { page: 'p.49' } })
    const line = squareSunLine({ area: 1200, sep: { label: '22 Sep, 10:00–16:00 PT', meanHours: 3.2, share2h: 0.64 }, dec: { label: '21 Dec, 11:00–14:00', meanHours: 0.8, share2h: 0.1 } }, true)
    expect(line.value).toBe('Square ≥ 2 h: 64% on 22 Sep, 10:00–16:00 PT (mean 3.2 h), 10% on 21 Dec, 11:00–14:00 (mean 0.8 h)')
    expect(line).toMatchObject({ state: 'unknown', flag: 'team_assumption' })
    const on = groundPlaneCheck([{ ...tower, x: -40 }], DEFAULT_PUBLIC_REALM, { square: { area: 1200, sep: { label: 'a', meanHours: 3, share2h: 0.5 }, dec: { label: 'b', meanHours: 1, share2h: 0.2 } } }).rules.find((r) => r.id === 'pr-square-sun')!
    expect(on.value).toMatch(/^Square ≥ 2 h: 50% on a/)
  })
})
