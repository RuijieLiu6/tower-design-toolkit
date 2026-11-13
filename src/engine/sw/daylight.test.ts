import { describe, expect, it } from 'vitest'
import { defaultTower } from '../../store'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import type { Tower } from '../types'
import type { ClimatePayload } from './types'
import { aseFloor, daylightFloor, daylightTower, lightAtHour } from './daylight'
import { swFloors, type FacadeZone } from './plate'

const C = climateJson as unknown as ClimatePayload
const tower = (w: number, d: number, coreShare = 0.25): Tower => ({ ...defaultTower('city'), x: 0, y: 0, rotation: 0, width: w, depth: d, height: 80, podiumHeight: 0, coreShare })
const midFloor = (t: Tower) => { const fs = swFloors(t, 0, 1); return fs[Math.floor(fs.length / 2)] }
const all = (strat: FacadeZone['strat'], depth: number): FacadeZone[] => [{ face: 'all', from: 1, to: 999, strat, wwr: 0.45, shgc: 0.4, depth, pv: 0, operable: false }]
const FAST = { step: 2, hs: 4 }

describe('Sun & Wind daylight port', () => {
  const sq = midFloor(tower(30, 30))
  const curtain = all('curtain', 0)

  it('gives a sane daylight factor and sDA on a 30 × 30 m floor', () => {
    const r = daylightFloor(sq, curtain, C, FAST)
    expect(r.hourly).toBe(true)
    expect(r.cells).toBeGreaterThan(50)
    expect(r.mean).toBeGreaterThan(0.005)
    expect(r.mean).toBeLessThan(0.1)
    expect(r.pctLit).toBeGreaterThanOrEqual(0)
    expect(r.pctLit).toBeLessThanOrEqual(1)
    expect(r.udiS + r.udiU + r.udiE).toBeCloseTo(1, 5)
    expect(r.en).not.toBeNull()
    expect(r.dsf).toHaveLength(12)
    // without a climate it falls back to DF estimates
    const nc = daylightFloor(sq, curtain, null, FAST)
    expect(nc.hourly).toBe(false)
    expect(nc.mean).toBeCloseTo(r.mean, 6)
  })

  it('gives a deeper plate a lower sDA', () => {
    // 80 × 80 m with a small core: up to 30 m from the glass
    const deep = midFloor(tower(80, 80, 0.05))
    const a = daylightFloor(sq, curtain, C, FAST), b = daylightFloor(deep, curtain, C, FAST)
    expect(b.pctLit).toBeLessThan(a.pctLit)
    expect(b.mean).toBeLessThan(a.mean)
  })

  it('cuts ASE with an overhang or louvres against a plain curtain wall', () => {
    const base = aseFloor(sq, curtain, C, undefined, { step: 2 })
    const oh = aseFloor(sq, all('overhang', 1.5), C, undefined, { step: 2 })
    const lv = aseFloor(sq, all('louvres', 0.4), C, undefined, { step: 2 })
    expect(base.pctOver).toBeGreaterThan(0)
    expect(oh.pctOver).toBeLessThan(base.pctOver)
    expect(lv.pctOver).toBeLessThan(base.pctOver)
  })

  it('lights the floor at noon on 21 June and not at midnight', () => {
    const noon = lightAtHour(sq, curtain, C, { doy: 172, hour: 13 })
    expect(noon.sunUp).toBe(true)
    expect(noon.over300).toBeGreaterThan(0)
    expect(Math.max(...noon.lux)).toBeGreaterThan(0)
    const night = lightAtHour(sq, curtain, C, { doy: 172, hour: 0 })
    expect(night.sunUp).toBe(false)
    expect(Math.max(...night.lux)).toBe(0)
    const shut = lightAtHour(sq, curtain, C, { doy: 172, hour: 13 }, { blinds: true })
    expect(shut.over3000).toBeLessThanOrEqual(noon.over3000)
  })

  it('summarises a tower, computing identical floors once', () => {
    const fs = swFloors(tower(30, 30), 0, 1)
    const r = daylightTower(fs, curtain, C, FAST)
    expect(r.rows).toHaveLength(fs.length)
    expect(r.unique).toBeLessThan(fs.length)
    expect(r.sda).toBeGreaterThanOrEqual(0)
    expect(r.sda).toBeLessThanOrEqual(1)
  })
})
