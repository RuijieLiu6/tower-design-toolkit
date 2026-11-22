import { describe, expect, it } from 'vitest'
import { plantReach, reachHvacNote } from './lifeSafety'
import type { Floor } from './types'

const fl = (n: number, plantAt: number[] = []): Floor[] => Array.from({ length: n }, (_, i) => ({ level: i + 1, z0: i * 4, z1: (i + 1) * 4, area: 1000, use: plantAt.includes(i + 1) ? 'mechanical' : 'office', podium: false } as Floor))

describe('G54: plant reach counts plant that is not a storey, and reads the HVAC system', () => {
  it('a basement fan room serves the lowest storeys', () => {
    const f = fl(40, [30])
    expect(plantReach(f).storeys).toBe(29) // L1 from the L30 plant floor
    const b = plantReach(f, [0])
    expect(b.storeys).toBeLessThan(29)
    expect(plantReach(fl(3), [0]).from).not.toBe('')
  })
  it('a podium-roof plant sits between its storey and the one above', () => {
    const r = plantReach(fl(40, [30]), [5])
    expect(r.storeys).toBe(12) // L18 from the L30 plant floor or the L5 roof
  })
  it('says the reach band is for all-air and asks the engineer otherwise', () => {
    expect(reachHvacNote({ hvac: 'all-air' })).toMatch(/applies as written/)
    expect(reachHvacNote({ hvac: 'air-water' })).toMatch(/primary air.*p\.172.*mechanical engineer/)
  })
})
