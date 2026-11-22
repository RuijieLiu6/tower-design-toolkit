import { describe, expect, it } from 'vitest'
import { straightStairSpot } from './egress'

type P = [number, number]
const sq = (h: number): P[] => [[-h, -h], [h, -h], [h, h], [-h, h]]

describe('G55: the straight-shaft test sizes each storey’s enclosure from its own stair', () => {
  // A low storey with a wide plate and wide stairs, an upper storey with a small plate and narrow stairs.
  const storeys = [[sq(20)], [sq(8)]]
  const from = { x: 0, y: 0 }, dir: [number, number] = [1, 1]
  it('the widest enclosure everywhere finds no spot clear of the small plate’s facade', () => {
    expect(straightStairSpot(storeys, 8.5, from, from, dir)).toBeNull()
  })
  it('each storey’s own enclosure finds one, inside both plates by their own clearance', () => {
    const p = straightStairSpot(storeys, [8.5, 3], from, from, dir)!
    expect(p).not.toBeNull()
    expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(8 - 3 + 1e-6)
    expect(p.x).toBeGreaterThan(0)
  })
  it('a single number still means the same clearance on every storey', () => {
    expect(straightStairSpot(storeys, 3, from, from, dir)).toEqual(straightStairSpot(storeys, [3, 3], from, from, dir))
  })
})
