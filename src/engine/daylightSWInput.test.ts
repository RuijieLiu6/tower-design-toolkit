// The Toolkit's model into Sinnie's daylight engine (engine/daylightSWInput.ts): plates in her frame turned to true north,
// the facade node's glazing as her zones, plant floors left out, and the evidence lines' invariants.
import { describe, expect, it } from 'vitest'
import hourly from '../data/sunWindHourly.json'
import { DEFAULT_FACADE } from './facade'
import type { Tower } from './types'
import { aseTower, daylightTower, DEFAULT_ZONES, maskFloor, newCache, prep } from './daylightSW'
import { daylightModelOf, daylightRules, DEFAULT_DAYLIGHT_PRESETS, glazingOf, plateOf, readingsOf, toHer } from './daylightSWInput'

const tower: Tower = {
  id: 't1', name: 'Tower 1', x: 10, y: -20, rotation: 0, width: 46, depth: 30, height: 42, f2f: 4.2,
  podiumHeight: 0, podiumWidth: 46, podiumDepth: 30, podiumUse: 'retail',
  bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 5,
}

describe('daylight input', () => {
  it('turns the project frame so that true north is her +y', () => {
    const [x, y] = toHer(0, 10, [0, 0], 45) // a point 10 m up the model grid; true north is 45° clockwise of it
    expect(x).toBeCloseTo(-7.0711, 4); expect(y).toBeCloseTo(7.0711, 4)
    expect(toHer(5, 5, [5, 5], 30)).toEqual([0, 0])
  })
  it('reads a turned rectangle as her plate: size, turn, centre, every cell solid', () => {
    const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a)
    const ring = ([[-23, -15], [23, -15], [23, 15], [-23, 15]] as [number, number][]).map(([u, v]) => [3 + u * c - v * s, 4 + u * s + v * c] as [number, number])
    const f = plateOf(ring, { i: 0, z: 0, h: 4, core: 12 })!
    expect(f.w).toBe(46); expect(f.d).toBe(30)
    expect(f.rot).toBeCloseTo(a, 9); expect(f.cx).toBeCloseTo(3, 9); expect(f.cy).toBeCloseTo(4, 9)
    expect(f.area).toBe(46 * 30)
    expect(f.mask.cells.every((v) => v === 1)).toBe(true)
    expect(maskFloor({ i: 0, z: 0, h: 4, w: 46, d: 30, cx: 0, cy: 0, rot: 0, core: 12 }).mask.cells).toEqual(f.mask.cells)
  })
  it('takes the occupied floors of the tower and leaves the plant floors out', () => {
    const m = daylightModelOf(tower, [0, 0], 45)
    expect(m.floors.length + m.left).toBe(10)
    expect(m.left).toBe(2) // every 5th tower floor is plant
    expect(m.levels).not.toContain(5)
    const [px, py] = toHer(10, -20, [0, 0], 45)
    expect(m.posX).toBeCloseTo(px, 9); expect(m.posY).toBeCloseTo(py, 9)
    expect(m.floors.every((f) => Math.abs(f.rot - Math.PI / 4) < 1e-9 || Math.abs(f.rot - Math.PI / 4 - Math.PI / 2) < 1e-9 || Math.abs(f.rot + Math.PI / 4) < 1e-9 || Math.abs(f.rot - (3 * Math.PI) / 4) < 1e-9)).toBe(true)
  })
  it('glazing: the facade node as her zones when it is on, her default facade otherwise', () => {
    const fromFacade = glazingOf(DEFAULT_DAYLIGHT_PRESETS, { ...DEFAULT_FACADE, wwr: { N: 0.3, E: null, S: 0.5, W: null }, vlt: 0.45 })
    expect(fromFacade.from).toBe('facade')
    expect(fromFacade.zones.map((z) => [z.face, z.strat, z.wwr])).toEqual([['N', 'curtain', 0.3], ['E', 'curtain', 0.6], ['S', 'curtain', 0.5], ['W', 'curtain', 0.6]])
    expect(fromFacade.vt).toBe(0.45)
    expect(glazingOf({ ...DEFAULT_DAYLIGHT_PRESETS, vt: 0.7 }, { ...DEFAULT_FACADE, system: 'punched' }).zones[0]).toMatchObject({ strat: 'punched', depth: 0.4, wwr: 0.35 })
    const studio = glazingOf(DEFAULT_DAYLIGHT_PRESETS, null)
    expect(studio.from).toBe('studio'); expect(studio.zones).toBe(DEFAULT_ZONES); expect(studio.vt).toBe(0.6)
    expect(glazingOf({ ...DEFAULT_DAYLIGHT_PRESETS, glazing: 'studio' }, DEFAULT_FACADE).from).toBe('studio')
  })
  it('evidence lines: every line sourced and flagged, none verified; open without context', () => {
    const floors = [0, 1].map((i) => maskFloor({ i, z: i * 4.2, h: 4.2, w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16 }))
    const s = { zones: DEFAULT_ZONES, vt: 0.6, target: 300, posX: 0, posY: 0, bld: [], period: { from: '01-01', to: '12-31' } }
    const P = prep(hourly as never), cache = newCache()
    const D = daylightTower(P, floors, s, cache), A = aseTower(P, floors, s, hourly.days, cache)
    const readings = readingsOf(D, A, [1, 2])
    const make = (loaded: boolean) => daylightRules({ readings, contextLoaded: loaded, unknownHeights: 0, glazing: { from: 'studio', note: 'n' }, presets: DEFAULT_DAYLIGHT_PRESETS, towerName: 'T', period: A.period, left: 0 })
    const on = make(true), off = make(false)
    for (const r of on) { expect(r.flag).not.toBe('verified'); expect(r.source.label.length).toBeGreaterThan(10) }
    expect(on.find((r) => r.id === 'sw-dl-sda')!.state).toBe(readings.points > 0 ? 'pass' : 'fail')
    expect(off.filter((r) => ['sw-dl-sda', 'sw-dl-ase', 'sw-dl-df'].includes(r.id)).every((r) => r.state === 'unknown')).toBe(true)
    expect(D.unique).toBe(1) // two identical floors without neighbours: her signature computes one
  })
})
