import { describe, expect, it } from 'vitest'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import type { Pt } from '../shadow'
import { sunImpact } from './sunImpact'
import type { ClimatePayload, Prism } from './types'

const C = climateJson as unknown as ClimatePayload
const box = (x: number, y: number, w: number, d: number, h: number): Prism => ({ ring: [[x, y], [x + w, y], [x + w, y + d], [x, y + d]] as Pt[], z0: 0, z1: h })

describe('sun on the tower and sunlight lost by neighbours (clear day)', () => {
  const tower = box(-15, -15, 30, 30, 150)
  it('the south face gets the most beam on the equinox, the north the least; roofs get sun all day', () => {
    const r = sunImpact([tower], [], C, 80)
    expect(r.intensity.S).toBeGreaterThan(r.intensity.E)
    expect(r.intensity.S).toBeGreaterThan(r.intensity.N)
    expect(r.sunH.roof).toBeGreaterThan(10)
    expect(r.sunH.N).toBeLessThan(3)
    expect(r.area.N).toBeCloseTo(30 * 150, -1)
    expect(r.lostKWh).toBe(0)
  })
  it('a low neighbour north of the tower loses sun; one to the south loses none', () => {
    const north = sunImpact([tower], [box(-20, 40, 40, 20, 15)], C, 80)
    const south = sunImpact([tower], [box(-20, -80, 40, 20, 15)], C, 80)
    expect(north.lostKWh).toBeGreaterThan(100)
    expect(south.lostKWh).toBeLessThan(north.lostKWh / 10)
  })
})
