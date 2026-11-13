import { describe, expect, it } from 'vitest'
import type { Tower } from '../types'
import type { ClimatePayload, Prism } from './types'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import { DEFAULT_ZONES, swFloors, toNorth } from './plate'
import { daylightFloor } from './daylight'
import { energyModel, ENERGY_DEFAULTS, END_USES } from './energy'
import { faceSunHours, hull, peopleOf, roofYear, shadowRange, stormOnFaces, temporalMaps, windProfile } from './detail'

const C = climateJson as unknown as ClimatePayload
const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 150, f2f: 3.75, podiumHeight: 0, podiumWidth: 60, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.2, plantEvery: 0, ...patch,
})
const box = (x: number, y: number, w: number, h: number): Prism => ({ ring: [[x - w / 2, y - w / 2], [x + w / 2, y - w / 2], [x + w / 2, y + w / 2], [x - w / 2, y + w / 2]], z0: 0, z1: h })

describe('Sun & Wind detail readings', () => {
  const floors = swFloors(tower(), 0)

  it('shadow range: one hull an hour, shadows fall north at noon and are longest in winter', () => {
    const own = [box(0, 0, 30, 150)]
    const eq = shadowRange(own, C, 264, 8, 10, 16), wi = shadowRange(own, C, 355, 11, 10, 16)
    expect(eq.hours.length).toBeGreaterThan(4)
    const noon = eq.hours.find((h) => h.h === 13)!
    expect(noon.dir[1]).toBeGreaterThan(0.8) // towards north
    expect(wi.hours.every((h) => h.cot > noon.cot)).toBe(true)
    expect(hull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])).toHaveLength(4)
  })

  it('sun hours by face: south sees more than north; a tall neighbour to the south takes sun from the low floors', () => {
    const open = faceSunHours(floors, [], C, 264)
    expect(open.levels).toHaveLength(floors.length)
    expect(open.byFace.S).toBeGreaterThan(open.byFace.N)
    expect(open.byFace.S).toBeGreaterThan(8); expect(open.byFace.S).toBeLessThanOrEqual(13)
    const shaded = faceSunHours(floors, [box(0, -60, 60, 100)], C, 264)
    expect(shaded.hours.S[0]!).toBeLessThan(open.hours.S[0]!)
    expect(shaded.hours.S[floors.length - 1]!).toBeCloseTo(open.hours.S[floors.length - 1]!, 5)
    // the tower's own block, drawn a little wider than its plates, does not shade them
    expect(faceSunHours(floors, [box(0, 0, 31, 150)], C, 264).byFace.S).toBeCloseTo(open.byFace.S, 5)
  })

  it('design storm on the faces: the windward face catches the rain, more at the top', () => {
    const S = stormOnFaces(floors, [], { dir: 90, speed: 8 })
    const E = S.faces.find((f) => f.o === 'E')!, W = S.faces.find((f) => f.o === 'W')!
    expect(E.storm).toBeGreaterThan(0); expect(W.storm).toBe(0)
    expect(E.wetShare).toBeCloseTo(1, 5); expect(W.wetShare).toBe(0)
    expect(E.byHeight[E.byHeight.length - 1].storm).toBeGreaterThan(E.byHeight[0].storm)
    expect(S.alphaDeg).toBeGreaterThan(50)
  })

  it('roof water by month sums to the year, the wind rises with height', () => {
    const people = peopleOf(floors)
    expect(people).toBeGreaterThan(100)
    const Y = roofYear(C, 900, 0.8, people)
    expect(Y.months).toHaveLength(12)
    const mm = Y.months.reduce((s, m) => s + m.mm, 0)
    expect(Y.months.reduce((s, m) => s + m.m3, 0)).toBeCloseTo((900 * mm * 0.8) / 1000, 3)
    expect(Y.flushShare).toBeGreaterThan(0); expect(Y.flushShare).toBeLessThanOrEqual(1)
    const P = windProfile(4, 150)
    expect(P[P.length - 1].z).toBe(150)
    expect(P[P.length - 1].U).toBeGreaterThan(P[0].U)
    expect(P[0].gust).toBeCloseTo(P[0].U * 1.8, 6)
  })

  it('daylight temporal maps: 365 days by 10 occupied hours, shares between 0 and 1', () => {
    const f = floors[Math.floor(floors.length / 2)]
    const d = daylightFloor(f, DEFAULT_ZONES, C, { step: 3, hs: 8 })
    expect(d.temporal).not.toBeNull()
    const M = temporalMaps(d.temporal!, C)
    expect(M.sda).toHaveLength(3650)
    let n = 0, ok = true
    for (const v of M.sda) { if (v === v) { n++; if (v < 0 || v > 1) ok = false } }
    expect(n).toBeGreaterThan(3000); expect(ok).toBe(true)
  })

  it('energy model: months sum to the year by end use, loss paths are positive, hourly loads have the peaks', () => {
    const r = energyModel(floors.map((f) => ({ z0: f.z, z1: f.z + f.h, area: f.area, use: f.use, ring: f.rings[0].map(([x, y]) => toNorth(f, x, y)) })), C, ENERGY_DEFAULTS)
    for (const u of END_USES) expect(r.mon[u].reduce((a, b) => a + b, 0)).toBeCloseTo(r.zones.reduce((a, z) => a + z[u], 0), 0)
    expect(END_USES.reduce((a, u) => a + r.mon[u].reduce((x, y) => x + y, 0), 0)).toBeCloseTo(r.total, 0)
    expect(r.loss.glass.N).toBeGreaterThan(0); expect(r.loss.vent).toBeGreaterThan(0); expect(r.loss.recov).toBeGreaterThan(r.loss.vent)
    expect((Math.max(...r.hourly.heat) * 1000) / r.gfa).toBeCloseTo(r.peakH, 3)
    expect(r.people).toBeGreaterThan(100)
  })
})
