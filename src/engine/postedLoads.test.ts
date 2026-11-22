import { describe, expect, it } from 'vitest'
import { withPosted } from '../components/PostedLoads'
import { fixFor } from '../lib/fixes'
import { useStore } from '../store'
import { egressCheck, postedAt, storeyLoads } from './egress'
import { towerFloors } from './massing'
import type { Tower } from './types'

const s0 = useStore.getInitialState()
const base = s0.towers.vtc[0]
// A civic floor high in the tower (the C36a case): unprogrammed, read at the lounge row.
const civicLevel = towerFloors(base).filter((f) => !f.podium && f.use === 'residential')[3].level
const civic = (patch: Partial<Tower> = {}): Tower => ({ ...base, floorUses: { [civicLevel]: 'civic' }, ...patch })
const at = (t: Tower, level: number) => storeyLoads(t, s0.egressPresets, { homeM2: 75, hotelM2PerKey: 40 }).find((s) => s.level === level)!

describe('Posted occupant loads (tool cycle 11, BCBC 2024 3.1.17.1(1)(c), (2))', () => {
  it('sizes a posted floor for its posted persons and keeps the Table load beside it', () => {
    const table = at(civic(), civicLevel)
    expect(table.posted).toBeUndefined()
    const p = at(civic({ postedLoads: { [civicLevel]: 120 } }), civicLevel)
    expect(p.load).toBe(120)
    expect(p.posted).toEqual({ persons: 120, table: table.load })
    expect(p.needMm).toBeLessThanOrEqual(table.needMm)
    expect(p.basis).toMatch(/^posted 120 persons/)
  })

  it('leaves homes, hotel rooms and plant alone', () => {
    const t = civic()
    const home = towerFloors(t).find((f) => !f.podium && f.use === 'residential' && f.level !== civicLevel)!
    expect(at({ ...t, postedLoads: { [home.level]: 5 } }, home.level).posted).toBeUndefined()
  })

  it('reads JSON keys (strings) as levels, and ignores negative or missing numbers', () => {
    expect(postedAt({ postedLoads: { [String(civicLevel)]: 80 } as never }, civicLevel)).toBe(80)
    expect(postedAt({ postedLoads: { [civicLevel]: -1 } }, civicLevel)).toBeNull()
    expect(postedAt({}, civicLevel)).toBeNull()
  })

  it('reports the posted floors: Check below the Table load with a specialist, Pass at or above it', () => {
    const below = egressCheck(civic({ postedLoads: { [civicLevel]: 100 } }), s0.egressPresets, s0.liftPresets).rules.find((r) => r.id.startsWith('egress-posted'))!
    expect(below.state).toBe('warn')
    expect(below.specialist).toMatch(/fewer people/)
    expect(below.source.page).toBe('p.3-104')
    expect(fixFor('egress-posted-t', 'warn', below.value, below.threshold, below.flag)).toMatch(/permanent sign/)
    const tableLoad = at(civic(), civicLevel).load
    const above = egressCheck(civic({ postedLoads: { [civicLevel]: Math.ceil(tableLoad) + 10 } }), s0.egressPresets, s0.liftPresets).rules.find((r) => r.id.startsWith('egress-posted'))!
    expect(above.state).toBe('pass')
    expect(egressCheck(civic(), s0.egressPresets, s0.liftPresets).rules.some((r) => r.id.startsWith('egress-posted'))).toBe(false)
  })

  it('the panel helper sets, replaces and clears one level', () => {
    expect(withPosted({}, 30, 200)).toEqual({ 30: 200 })
    expect(withPosted({ postedLoads: { 30: 200, 40: 50 } }, 30, null)).toEqual({ 40: 50 })
    expect(withPosted({ postedLoads: { 30: 200 } }, 30, null)).toBeUndefined()
  })
})
