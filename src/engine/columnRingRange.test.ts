import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { ringAt, ringText, storeyWeights } from './storeyWeight'
import { structureCheck } from './structure'
import type { Tower } from './types'
import { windProcedure } from './windStructure'

const s0 = useStore.getInitialState()
// A deep plate on a small core: every tower storey reaches past one flat plate.
const deep = (patch: Partial<Tower> = {}): Tower => ({ ...s0.towers.vtc[0], width: 50, depth: 50, coreAuto: false, coreShare: 0.1, ...patch })
const slabs = (t: Tower) => storeyWeights(t).levels.filter((l) => !l.roof && !l.podium && !l.transitional && (l.slab ?? 0) > 0)

describe('Interior column ring by storeys (tool cycle 11, review R6-5)', () => {
  it('reads the range: every storey, from a level up, or between two levels', () => {
    expect(ringAt({}, 10)).toBe(false)
    expect(ringAt({ columnRing: true }, 10)).toBe(true)
    expect(ringAt({ columnRing: { from: 40 } }, 39)).toBe(false)
    expect(ringAt({ columnRing: { from: 40 } }, 40)).toBe(true)
    expect(ringAt({ columnRing: { from: 12, to: 20 } }, 21)).toBe(false)
    expect(ringText({ columnRing: { from: 40 } })).toBe('L40 up')
    expect(ringText({ columnRing: { from: 12, to: 20 } })).toBe('L12–L20')
    expect(ringText({ columnRing: true })).toBe('every storey')
  })

  it('halves the span, and thins the slab, only on the ring’s storeys', () => {
    const none = slabs(deep()), all = slabs(deep({ columnRing: true }))
    const mid = none[Math.floor(none.length / 2)].level
    const part = slabs(deep({ columnRing: { from: mid } }))
    for (const l of part) {
      const n = none.find((x) => x.level === l.level)!, a = all.find((x) => x.level === l.level)!
      expect(l.slab).toBeCloseTo(l.level >= mid ? a.slab! : n.slab!, 6)
    }
    expect(part.some((l) => l.level < mid && l.slab! > all.find((x) => x.level === l.level)!.slab!)).toBe(true)
  })

  it('says which storeys the ring serves on the floor-reach line, and keeps the worst span outside it', () => {
    const t = deep({ columnRing: { from: 30 } })
    const reach = structureCheck(t, windProcedure(t)).rules.find((r) => r.id === 'floor-reach')!
    expect(reach.value).toMatch(/with the column ring \(L30 up\)/)
    expect(reach.note).toMatch(/columnRing, L30 up/)
    expect(reach.note).toMatch(/extend the ring’s storeys/)
  })
})
