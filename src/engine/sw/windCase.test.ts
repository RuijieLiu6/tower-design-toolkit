import { describe, expect, it } from 'vitest'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import type { Pt } from '../shadow'
import type { ClimatePayload } from './types'
import { compass16, runWindStudy, singleRose, windRose } from './wind'

const C = climateJson as unknown as ClimatePayload

describe('wind: the Studio time period and one wind case', () => {
  it('a day range picks its hours only; a range over the new year wraps', () => {
    const week = windRose(C, 'year', { d0: 77, d1: 83 })
    expect(week.hours).toBe(7 * 24)
    const winter = windRose(C, 'year', { d0: 335, d1: 59 })
    expect(winter.hours).toBe(90 * 24)
    expect(windRose(C, 'winter').hours).toBe(winter.hours)
  })
  it('one wind case is a single sector at full share', () => {
    const r = singleRose(270, 3.5)
    expect(r.sectors).toHaveLength(1)
    expect(r.sectors[0]).toMatchObject({ name: 'W', f: 1, s: 3.5 })
    expect(compass16(292)).toBe('WNW')
  })
  it('a single case runs one flow with the tower and reads its ground', () => {
    const ring: Pt[] = [[-15, -15], [15, -15], [15, 15], [-15, 15]]
    const w = runWindStudy({ project: 'vtc', ring: null, context: [], latLon: [49.28, -123.12], northDeg: 0, ground: 0 } as never,
      { towers: [{ id: 't', name: 'T', height: 120, blocks: [{ ring, z0: 0, z1: 120, podium: false }] }] } as never, C, { season: 'year', cell: 8, single: { dir: 270, speed: 5 } })
    expect(w.runs).toBe(1)
    expect(w.sectors).toHaveLength(1)
    expect(w.maxS).toBeGreaterThan(5)
  })
})
