import { describe, expect, it } from 'vitest'
import type { Tower } from '../types'
import type { ClimatePayload } from './types'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import { DEFAULT_ZONES, swFloors, type FacadeZone } from './plate'
import { FULL_YEAR } from './climate'
import { VENT_DEFAULTS, airFlow, ventFloor, ventHours, ventTower } from './vent'
import { formStudy } from './form'
import { photovoltaics, PV_DEFAULTS } from './pv'
import { glazingStudy } from './glazing'
import { thermalFloor, thermMoments } from './thermal'

const C = climateJson as unknown as ClimatePayload

const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 150, f2f: 3.75, podiumHeight: 0, podiumWidth: 60, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.2, plantEvery: 0, ...patch,
})
const curtain = (patch: Partial<FacadeZone> = {}): FacadeZone[] => [{ face: 'all', from: 1, to: 999, strat: 'curtain', wwr: 0.6, shgc: 0.4, depth: 0, pv: 0, operable: true, ...patch }]

describe('Sun & Wind interior studies', () => {
  const slim = swFloors(tower(), 0)
  const deep = swFloors(tower({ width: 60, depth: 60 }), 0)
  const mid = slim[Math.floor(slim.length / 2)]
  const midDeep = deep[Math.floor(deep.length / 2)]

  it('ventilation reach: within 8 m share falls with a deeper plate, no operable face means no free area', () => {
    const w = { dir: 270, speed: 4 }
    const a = ventFloor(mid, DEFAULT_ZONES, w), b = ventFloor(midDeep, DEFAULT_ZONES, w)
    expect(a.within8).toBeGreaterThan(0); expect(a.within8).toBeLessThanOrEqual(1)
    expect(b.within8).toBeLessThan(a.within8)
    expect(a.freePct).toBeGreaterThan(0)
    expect(Number.isFinite(a.ach)).toBe(true)
    const shut = ventTower(slim, curtain({ operable: false }))
    expect(shut.freePct).toBe(0); expect(shut.operable).toBe(0)
    const open = ventTower(slim, DEFAULT_ZONES)
    expect(open.within8).toBeGreaterThan(0); expect(open.within8).toBeLessThanOrEqual(1)
    expect(open.operable).toBe(slim.length)
  })

  it('ventilation hours: a share of the year between 0 and 1, by month', () => {
    const r = ventHours(slim, DEFAULT_ZONES, C, VENT_DEFAULTS, FULL_YEAR)
    expect(r.hoursTot).toBe(8760)
    expect(r.share).toBeGreaterThan(0); expect(r.share).toBeLessThan(1)
    expect(r.rows).toHaveLength(12)
    expect(r.rows.reduce((s, m) => s + m.hours, 0)).toBe(8760)
    const adaptive = ventHours(slim, DEFAULT_ZONES, C, { ...VENT_DEFAULTS, band: 'adaptive' }, FULL_YEAR)
    expect(adaptive.share).toBeGreaterThanOrEqual(0); expect(adaptive.share).toBeLessThan(1)
  })

  it('air flow field: finite velocities, cross flow moves air', () => {
    const F = airFlow(mid, curtain(), { dir: 270, speed: 2 }, VENT_DEFAULTS) // gusts 1.8 × 3.3 m/s at mid-height stay under 8 m/s
    expect(F.on).toBe(true)
    let fin = true
    for (let k = 0; k < F.spd.length; k++) if (!Number.isFinite(F.spd[k])) fin = false
    expect(fin).toBe(true)
    expect(F.mean).toBeGreaterThan(0)
    expect(F.seeds.length).toBeGreaterThan(0)
    const M = airFlow(mid, curtain(), { dir: 270, speed: 3 }, VENT_DEFAULTS, { sys: 'mech' })
    expect(M.diff.length).toBeGreaterThan(3); expect(M.mean).toBeGreaterThan(0)
  })

  it('form: a slim shaft has a plausible form factor and a podium tower rates no better', () => {
    const a = formStudy(slim)
    expect(a.ff).toBeGreaterThan(0.2); expect(a.ff).toBeLessThan(0.6)
    expect(a.relHeat).toBeGreaterThan(0.9); expect(a.relHeat).toBeLessThan(1.2)
    const b = formStudy(swFloors(tower({ podiumHeight: 15, podiumWidth: 70, podiumDepth: 60 }), 0))
    expect(b.score).toBeGreaterThanOrEqual(a.score)
    expect(b.roof + b.soffit).toBeGreaterThan(a.roof + a.soffit)
  })

  it('PV: roof yield of the order of area × ~1000 kWh/m² × eff × PR', () => {
    const r = photovoltaics(slim, curtain({ pv: 0.8, wwr: 0.4 }), C, PV_DEFAULTS, FULL_YEAR)
    const roof = r.rows.find((x) => x.zone === 'roof')!
    expect(roof.kwh).toBeGreaterThan(0)
    const ref = 30 * 30 * PV_DEFAULTS.roof * 1000 * PV_DEFAULTS.eff * PV_DEFAULTS.pr
    expect(roof.kwh / ref).toBeGreaterThan(0.6); expect(roof.kwh / ref).toBeLessThan(1.8)
    expect(r.byFace.S).toBeGreaterThan(r.byFace.N)
    expect(r.facadeKwh).toBeGreaterThan(0)
  })

  it('glazing: more heat through the south curtain wall than the north; WWR over the tower', () => {
    const g = glazingStudy(slim, [
      { face: 'N', from: 1, to: 999, strat: 'curtain', wwr: 0.6, shgc: 0.4, depth: 0, pv: 0, operable: true },
      { face: 'S', from: 1, to: 999, strat: 'curtain', wwr: 0.6, shgc: 0.4, depth: 0, pv: 0, operable: true },
      { face: 'E', from: 1, to: 999, strat: 'fins', wwr: 0.4, shgc: 0.4, depth: 0.6, pv: 0, operable: true },
      { face: 'W', from: 1, to: 999, strat: 'overhang', wwr: 0.4, shgc: 0.4, depth: 0.9, pv: 0, operable: true },
    ], C, FULL_YEAR)
    expect(g.byFace.S.sh).toBeGreaterThan(g.byFace.N.sh)
    expect(g.wwr).toBeCloseTo(0.5, 2)
    const east = g.zones.find((z) => z.strat === 'fins')!
    expect(east.sh).toBeLessThan(east.un)
    expect(east.glare).toBeGreaterThanOrEqual(0)
    const west = g.zones.find((z) => z.strat === 'overhang')!
    expect(west.tAvg).toBeLessThan(1)
    expect(g.blocked).toBeGreaterThan(0); expect(g.blocked).toBeLessThan(1)
  })

  it('thermal zones: finite hourly temperatures per zone, loss paths, overheating free-running', () => {
    const M = thermMoments(C)
    const T = thermalFloor(mid, slim, DEFAULT_ZONES, C, { sys: 'none', hour: M.hot.k })
    expect(T.zones.map((z) => z.key).sort()).toEqual(['C', 'E', 'N', 'S', 'W'])
    for (const z of T.zones) {
      let fin = true
      for (let k = 0; k < z.To.length; k++) if (!Number.isFinite(z.To[k])) fin = false
      expect(fin).toBe(true)
      expect(z.tMin).toBeLessThan(z.tMax)
      expect(z.Tk).not.toBeNull()
    }
    expect(T.loss.glass).toBeGreaterThan(0); expect(T.loss.infil).toBeGreaterThan(0)
    const full = thermalFloor(mid, slim, DEFAULT_ZONES, C, { sys: 'full' })
    const s = full.zones.find((z) => z.key === 'S')!, sFree = T.zones.find((z) => z.key === 'S')!
    expect(s.over26).toBeLessThanOrEqual(sFree.over26)
    expect(s.heat).toBeGreaterThan(0)
    let cells = 0
    for (let k = 0; k < T.zid.length; k++) if (T.zid[k] >= 0) cells++
    expect(cells * T.cell * T.cell).toBeCloseTo(T.zones.reduce((a, z) => a + z.area, 0), 3)
  })
})
