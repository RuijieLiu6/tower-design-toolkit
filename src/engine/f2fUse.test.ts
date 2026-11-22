import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { f2fUse, F2F_MARGIN, TYPICAL_F2F, useHeights } from './f2fUse'
import { towerFloors } from './massing'
import type { Floor } from './types'

// 27 residential floors at 4.00 m above a 6 m podium storey (the book notes' B and C case).
const storeys = (use: Floor['use'], n: number, f2f: number, from = 1): Floor[] =>
  Array.from({ length: n }, (_, k) => ({ level: from + k, z0: 6 + k * f2f, z1: 6 + (k + 1) * f2f, use, area: 2500, podium: false }))

describe('storey height by use (P1 #8)', () => {
  const t = defaultTower('vtc')

  it('reads 27 residential floors at 4.00 m as 25.6 m (about 8 floors) above 3.05 m, and warns', () => {
    const r = f2fUse(t, storeys('residential', 27, 4.0))
    const line = r.rules.find((x) => x.id === 'f2f-residential')!
    expect(line.value).toBe('residential 4.00 m × 27 floors: 25.6 m (≈ 8 floors) above 3.05 m')
    expect(line).toMatchObject({ state: 'warn', flag: 'unverified' })
    expect(line.source.page).toBe('p.73')
    expect(r.extra).toBeCloseTo(27 * 0.95)
  })

  it('passes within typical + 0.4 m (A35n: residential and hotel at 3.2 m)', () => {
    const r = f2fUse(t, [...storeys('hotel', 12, 3.2), ...storeys('residential', 57, 3.2, 13)])
    expect(r.rules.find((x) => x.id === 'f2f-residential')!.state).toBe('pass')
    expect(r.rules.find((x) => x.id === 'f2f-hotel')!.value).toBe('hotel 3.20 m × 12 floors: 1.2 m (≈ 0 floors) below 3.30 m')
    expect(r.rules.find((x) => x.id === 'f2f-hotel')!.source.page).toBe('pp.206, 208')
    expect(f2fUse(t, storeys('residential', 10, TYPICAL_F2F.residential + F2F_MARGIN)).rules[0].state).toBe('pass')
    expect(f2fUse(t, storeys('office', 10, 4.4)).rules[0].state).toBe('warn')
  })

  it('shows the daylight reach beside the height, so the trade-off is on one line', () => {
    const [u] = useHeights(t, storeys('residential', 27, 4.0))
    expect(u.reach).toBeCloseTo(2.5 * (2.8 - 0.76)) // 5.1 m at a 2.8 m head
    expect(u.reachTypical).toBeCloseTo(2.5 * (2.2 - 0.76)) // the head floor of 2.2 m at 3.05 m
    expect(f2fUse(t, storeys('residential', 27, 4.0)).rules[0].note).toContain('5.1 m at this height')
  })

  it('totals the height spent above typical and skips podium, sky lobbies and other uses', () => {
    const fl = [...storeys('residential', 10, 4.0), { ...storeys('residential', 1, 6, 20)[0], podium: true }, { ...storeys('office', 1, 6, 21)[0], skyLobby: true }, ...storeys('retail', 3, 5, 30)]
    const r = f2fUse(t, fl)
    expect(r.uses.map((u) => u.use)).toEqual(['residential'])
    expect(r.rules.find((x) => x.id === 'f2f-total')!.value).toBe('9.5 m (≈ 3 residential floors at 3.05 m)')
  })

  it('runs on the default towers of both projects and says so when nothing is screened', () => {
    for (const p of ['vtc', 'city'] as const) {
      const x = defaultTower(p, p === 'city' ? [254, 486] : undefined)
      const r = f2fUse(x, towerFloors(x))
      for (const l of r.rules) expect(l.source.label.length).toBeGreaterThan(10)
    }
    expect(f2fUse(t, storeys('retail', 3, 5)).rules[0]).toMatchObject({ id: 'f2f-none', state: 'unknown', flag: 'unresolved' })
  })
})
