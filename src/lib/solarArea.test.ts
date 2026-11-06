import { describe, expect, it } from 'vitest'
import { autoBounds, mapCell, MAX_MAP_CELLS, runSolarJob } from '../engine/solarJob'
import type { Tower } from '../engine/types'
import { areaOutline, dragArea, handleAt, MAX_SIDE, MIN_SIDE, roundArea } from './solarArea'

describe('sun-hours map area (editable boundary)', () => {
  const b: [number, number, number, number] = [-640, -640, 640, 640]

  it('a corner moves its two sides, a side one, the middle the whole area', () => {
    expect(dragArea(b, 'ne', [640, 640], [700, 600])).toEqual([-640, -640, 700, 600])
    expect(dragArea(b, 'w', [-640, 0], [-500, 30])).toEqual([-500, -640, 640, 640])
    expect(dragArea(b, 'move', [0, 0], [100, -50])).toEqual([-540, -690, 740, 590])
  })

  it('stops at the smallest and largest side instead of flipping', () => {
    expect(dragArea(b, 'e', [640, 0], [-2000, 0])).toEqual([-640, -640, -640 + MIN_SIDE, 640])
    expect(dragArea(b, 's', [0, -640], [0, -9000])).toEqual([-640, 640 - MAX_SIDE, 640, 640])
  })

  it('places the handles on the corners, the sides and the middle', () => {
    expect(handleAt(b, 'sw')).toEqual([-640, -640])
    expect(handleAt(b, 'n')).toEqual([0, 640])
    expect(handleAt(b, 'move')).toEqual([0, 0])
    expect(roundArea([0.4, 1.6, 10.5, -2.2])).toEqual([0, 2, 11, -2])
  })

  it('outlines the area as a closed ring along its four sides', () => {
    const o = areaOutline([0, 0, 100, 50], 25)
    expect(o[0]).toEqual(o[o.length - 1])
    expect(o.length).toBe(4 + 2 + 4 + 2 + 1)
  })

  it('keeps 5 m cells up to the automatic size, and caps the cell count above it', () => {
    expect(mapCell(autoBounds([0, 0]))).toBe(5)
    const big: [number, number, number, number] = [0, 0, 3000, 2500]
    const c = mapCell(big)
    expect(c).toBeGreaterThan(5)
    expect(Math.ceil(3000 / c) * Math.ceil(2500 / c)).toBeLessThanOrEqual(MAX_MAP_CELLS * 1.01)
  })

  it('the solar run maps the area it is given, and the automatic square without one', () => {
    const t = { id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 120, podiumHeight: 0, podiumWidth: 0, podiumDepth: 0, f2f: 4, bands: [] } as unknown as Tower
    const auto = runSolarJob({ project: 'vtc', towers: [t], ctx: null, readings: {}, mapDate: 'equinox', cell: 40 })
    expect(auto.custom).toBe(false)
    expect(auto.bounds).toEqual([-640, -640, 640, 640])
    const own = runSolarJob({ project: 'vtc', towers: [t], ctx: null, readings: {}, mapDate: 'equinox', cell: 40, bounds: [-200, -400, 600, 0] })
    expect(own.custom).toBe(true)
    expect(own.bounds).toEqual([-200, -400, 600, 0])
    expect(own.map!.grid).toMatchObject({ x0: -200, y0: -400, nx: 20, ny: 10 })
  })
})
