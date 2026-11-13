import { describe, expect, it } from 'vitest'
import { defaultTower } from '../../store'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import type { Tower } from '../types'
import type { ClimatePayload } from './types'
import { aseFloor, daylightFloor, lightAtHour } from './daylight'
import { hourBase, hourLight, MULL } from './hourLight'
import { swFloors, type FacadeZone } from './plate'

const C = climateJson as unknown as ClimatePayload
const tower = (w: number, d: number, rotation = 0): Tower => ({ ...defaultTower('city'), x: 0, y: 0, rotation, width: w, depth: d, height: 80, podiumHeight: 0, coreShare: 0.2 })
const midFloor = (t: Tower) => { const fs = swFloors(t, 0, 1); return fs[Math.floor(fs.length / 2)] }
const all = (strat: FacadeZone['strat'], depth: number): FacadeZone[] => [{ face: 'all', from: 1, to: 999, strat, wwr: 0.6, shgc: 0.4, depth, pv: 0, operable: false }]
const NOON_MAR = { doy: 74, hour: 12 }

describe('light at one hour on the fine grid (the Studio plan quality)', () => {
  const f = midFloor(tower(34, 31)), curtain = all('curtain', 0)

  it('traces the sun patch on a 0.1 m grid with mullion shadows as stripes', () => {
    const base = hourBase(f, curtain, {})
    expect(base.fine.h).toBeCloseTo(0.1, 6)
    const L = hourLight(f, curtain, C, NOON_MAR, {}, base)
    expect(L.sunUp).toBe(true)
    expect(L.sunShare).toBeGreaterThan(0.01)
    expect(L.sunShare).toBeLessThan(0.3)
    // along the south façade, one metre in: lit cells broken by a mullion shadow every 1.5 m
    const G = L.grid, iy = Math.round((-31 / 2 + 1 - G.y0) / G.h)
    let runs = 0, lit = 0, prev = 0
    for (let ix = 0; ix < G.nx; ix++) { const d = L.dim[iy * G.nx + ix] > 0.5 ? 1 : 0; if (d && !prev) runs++; lit += d; prev = d }
    expect(runs).toBeGreaterThanOrEqual(Math.floor(34 / MULL.pitch) - 3)
    expect(lit / G.nx).toBeGreaterThan(0.7)
    expect(lit / G.nx).toBeLessThan(0.98)
  })

  it('agrees with the coarse study on the size of the patch and the sky light', () => {
    const fine = hourLight(f, curtain, C, NOON_MAR), f05 = midFloor(tower(34, 31)), coarse = lightAtHour(f05, curtain, C, NOON_MAR, { sub: 2 })
    expect(Math.abs(fine.sunShare - coarse.sunShare)).toBeLessThan(0.06)
    expect(fine.sunShare).toBeLessThan(coarse.sunShare) // the mullions take their share
    expect(Math.abs(fine.over300 - coarse.over300)).toBeLessThan(0.08)
    expect(fine.alt).toBeCloseTo(coarse.alt, 6)
  })

  it('devices cut the patch; night is dark; a turned tower still gets a patch', () => {
    const open = hourLight(f, curtain, C, NOON_MAR).sunShare, fins = hourLight(f, all('eggcrate', 0.6), C, NOON_MAR).sunShare, over = hourLight(f, all('overhang', 1.5), C, NOON_MAR).sunShare
    expect(fins).toBeLessThan(open)
    expect(over).toBeLessThan(open)
    const night = hourLight(f, curtain, C, { doy: 74, hour: 2 })
    expect(night.sunUp).toBe(false)
    expect(Math.max(...night.lux)).toBeLessThan(5)
    const turned = hourLight(midFloor(tower(34, 31, 30)), curtain, C, NOON_MAR)
    expect(turned.sunShare).toBeGreaterThan(0.01)
  })

  it('timings', () => {
    const g = midFloor(tower(36, 32)), z = all('fins', 0.5)
    let t = performance.now(); const base = hourBase(g, z, {}); const tb = performance.now() - t
    t = performance.now(); for (let h = 8; h < 18; h++) hourLight(g, z, C, { doy: 74, hour: h }, {}, base); const th = (performance.now() - t) / 10
    t = performance.now(); const d = daylightFloor(g, z, C, { sub: 2, step: 1, hs: 2 }); const td = performance.now() - t
    t = performance.now(); aseFloor(g, z, C, undefined, { sub: 2 }); const ta = performance.now() - t
    console.log(`TIMING base ${tb.toFixed(0)} ms · hour ${th.toFixed(1)} ms · daylightFloor 0.5 m ${td.toFixed(0)} ms (${d.cells} sensors) · aseFloor 0.5 m ${ta.toFixed(0)} ms`)
    expect(th).toBeLessThan(400)
  })
})
