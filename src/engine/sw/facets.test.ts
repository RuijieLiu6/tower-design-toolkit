import { describe, expect, it } from 'vitest'
import type { ClimatePayload } from './types'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import type { ImportedStorey, Tower } from '../types'
import { withBlocks } from '../massing'
import { DEFAULT_ZONE, mainGrid, swFloors, zoneFor, zoneFacesOf, type FacadeZone } from './plate'
import { glazingStudy } from './glazing'
import { aseFloor } from './daylight'
import { FULL_YEAR } from './climate'

const C = climateJson as unknown as ClimatePayload
const base = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 50, depth: 50, height: 40, f2f: 4, podiumHeight: 0, podiumWidth: 60, podiumDepth: 60,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.2, plantEvery: 0, ...patch,
})
/** An imported tower of ten 4 m storeys with one plate outline (tower frame, counter-clockwise). */
const imported = (loop: [number, number][]): Tower => {
  const storeys: ImportedStorey[] = Array.from({ length: 10 }, (_, i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, area: 2500, use: 'office', podium: false, hasFloor: true, loops: [loop] }))
  return { ...base(), imported: { storeys } as unknown as Tower['imported'] }
}
const square: [number, number][] = [[-25, -25], [25, -25], [25, 25], [-25, 25]]
/** The 50 m square with 3 m chamfer legs (B8a in miniature). */
const chamfered: [number, number][] = [[-22, -25], [22, -25], [25, -22], [25, 22], [22, 25], [-22, 25], [-25, 22], [-25, -22]]
/** Tower B's box façade (B7q): fins N, curtain E, egg-crate S and W (review R1). */
const B7Q: FacadeZone[] = [
  { face: 'N', from: 1, to: 999, strat: 'fins', wwr: 0.4, shgc: 0.35, depth: 0.6, pv: 0, operable: true },
  { face: 'E', from: 1, to: 999, strat: 'curtain', wwr: 0.4, shgc: 0.35, depth: 0, pv: 0, operable: true },
  { face: 'S', from: 1, to: 999, strat: 'eggcrate', wwr: 0.4, shgc: 0.35, depth: 0.4, pv: 0, operable: true },
  { face: 'W', from: 1, to: 999, strat: 'eggcrate', wwr: 0.4, shgc: 0.35, depth: 0.5, pv: 0, operable: true },
]
const NORTH = 45 // the competition grid: +x faces true NE, the chamfers face true N, E, S and W

describe('façade zones by facet facing (G7)', () => {
  it('on the 45° grid the chamfers are facets facing true N, E, S and W; the main faces keep their grid names', () => {
    const f = swFloors(imported(chamfered), NORTH)[0]
    const main = f.edges.filter((e) => !e.facet), facets = f.edges.filter((e) => e.facet)
    expect(main.map((e) => e.o).sort()).toEqual(['E', 'N', 'S', 'W'])
    expect(main.every((e) => e.zf === e.o)).toBe(true)
    expect(facets.map((e) => e.facet).sort()).toEqual(['E', 'N', 'S', 'W'])
    const w = facets.find((e) => e.facet === 'W')!
    expect(w.az).toBeCloseTo(270, 6)
    expect(w.zf).toBe('facet-W')
    // the old naming put it in the W quadrant, with the SW face (true azimuth 225°)
    expect(w.o).toBe('W')
    expect(main.find((e) => e.o === 'W')!.az).toBeCloseTo(225, 6)
  })
  it('the true-W chamfer no longer borrows the SW face\'s egg-crate: it takes a W-facet zone, else none', () => {
    const f = swFloors(imported(chamfered), NORTH)[0]
    const w = f.edges.find((e) => e.facet === 'W')!
    expect(zoneFor(B7Q, w.zf, 1)).toBe(DEFAULT_ZONE)
    const own: FacadeZone = { face: 'facet-W', from: 1, to: 999, strat: 'fins', wwr: 0.35, shgc: 0.25, depth: 1, pv: 0, operable: true }
    expect(zoneFor([...B7Q, own], w.zf, 1)).toBe(own)
    expect(zoneFor([...B7Q, own], 'W', 1).strat).toBe('eggcrate') // the SW face keeps its own zone
    const all: FacadeZone = { ...own, face: 'all', strat: 'louvres' }
    expect(zoneFor([all], w.zf, 1)).toBe(all)
  })
  it('glare is attributed by true facing: the W zone reads the box\'s hours, the W facets have a row of their own', () => {
    const box = glazingStudy(swFloors(imported(square), NORTH), B7Q, C, FULL_YEAR)
    const ch = glazingStudy(swFloors(imported(chamfered), NORTH), B7Q, C, FULL_YEAR)
    for (const k of ['N', 'E', 'S', 'W']) {
      const a = box.zones.find((z) => z.zone.face === k && !z.facet)!, b = ch.zones.find((z) => z.zone.face === k && !z.facet)!
      expect(b.glare).toBe(a.glare) // the main faces' zones no longer take the facets' hours
    }
    const wf = ch.zones.find((z) => z.facet === 'W')!
    expect(wf.label).toMatch(/^W facets · no zone/)
    expect(wf.glare).toBeGreaterThan(0)
    expect(ch.zones.filter((z) => z.facet).map((z) => z.facet).sort()).toEqual(['E', 'N', 'S', 'W'])
    // a zone of its own for the W facets: deep fins cut their glare, and the row is the zone's own
    const own: FacadeZone = { face: 'facet-W', from: 1, to: 999, strat: 'fins', wwr: 0.35, shgc: 0.25, depth: 1, pv: 0, operable: true }
    const fixed = glazingStudy(swFloors(imported(chamfered), NORTH), [...B7Q, own], C, FULL_YEAR)
    const row = fixed.zones.find((z) => z.zone === own)!
    expect(row.label).toMatch(/^W facets · L1/)
    expect(row.glare).toBeLessThan(wf.glare)
  })
  it('the daylight ray walk reads a facet’s own zone where a ray leaves through it', () => {
    const f = swFloors(imported(chamfered), NORTH)[0]
    const shut: FacadeZone = { face: 'facet-W', from: 1, to: 999, strat: 'louvres', wwr: 0.4, shgc: 0.35, depth: 3, pv: 0, operable: true }
    const open = aseFloor(f, B7Q, C, FULL_YEAR, { step: 2 }), closed = aseFloor(f, [...B7Q, shut], C, FULL_YEAR, { step: 2 })
    let a = 0, b = 0
    for (let k = 0; k < open.hrs.length; k++) { a += open.hrs[k]; b += closed.hrs[k] }
    expect(b).toBeLessThan(a)
  })
  it('plain, notched, twisted and round plates have no facets', () => {
    expect(swFloors(imported(square), NORTH)[0].edges.some((e) => e.facet)).toBe(false)
    const notched: [number, number][] = [[-22.5, -25], [22.5, -25], [22.5, -22.5], [25, -22.5], [25, 22.5], [22.5, 22.5], [22.5, 25], [-22.5, 25], [-22.5, 22.5], [-25, 22.5], [-25, -22.5], [-22.5, -22.5]]
    expect(swFloors(imported(notched), NORTH)[0].edges.some((e) => e.facet)).toBe(false)
    const twisted = withBlocks(base({ height: 60 }), [{ id: 'a', height: 30, width: 40, depth: 40, dx: 0, dy: 0, rotation: 0 }, { id: 'b', height: 30, width: 40, depth: 40, dx: 0, dy: 0, rotation: 35 }])
    expect(swFloors(twisted, 0).every((f) => f.edges.every((e) => !e.facet))).toBe(true)
    const round = Array.from({ length: 24 }, (_, i) => [25 * Math.cos((i * Math.PI) / 12), 25 * Math.sin((i * Math.PI) / 12)] as [number, number])
    expect(mainGrid(round.map((p, i) => { const q = round[(i + 1) % 24], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return { L, ox: dy / L, oy: -dx / L } }))).toBeNull()
    expect(swFloors(imported(round), 0)[0].edges.some((e) => e.facet)).toBe(false)
  })
  it('a terrace outline names its edges the same way', () => {
    expect(zoneFacesOf([{ az: 225, L: 44 }, { az: 270, L: 4.2 }, { az: 315, L: 44 }, { az: 0, L: 4.2 }, { az: 45, L: 44 }, { az: 90, L: 4.2 }, { az: 135, L: 44 }, { az: 180, L: 4.2 }]))
      .toEqual(['W', 'facet-W', 'N', 'facet-N', 'E', 'facet-E', 'S', 'facet-S'])
  })
})
