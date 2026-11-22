import { describe, expect, it } from 'vitest'
import { f2fUse, TYPICAL_F2F } from '../engine/f2fUse'
import { towerFloors } from '../engine/massing'
import type { Tower } from '../engine/types'
import { NODE_CONTROLS } from '../lib/workflow/phaseTools'
import { collectTools, type DesignTool } from './tools/registry'
import { useStore } from '../store'
import { f2fEditable, withUseF2f } from './F2fUsePanel'

const s0 = useStore.getInitialState()
const mixed = (patch: Partial<Tower> = {}): Tower => ({ ...s0.towers.vtc[0], bands: [{ use: 'office', share: 0.4 }, { use: 'residential', share: 0.6, f2f: 4.0 }], ...patch } as Tower)
const use = (t: Tower, u: 'residential' | 'office') => f2fUse(t, towerFloors(t)).uses.find((x) => x.use === u)!

describe('Storey height by use: actionable (node placement, 21 Nov)', () => {
  it('Use typical sets every band of that use, keeps the height and changes the storey count', () => {
    const t = mixed()
    const typ = { ...t, bands: withUseF2f(t.bands, 'residential', TYPICAL_F2F.residential) }
    expect(typ.bands[1].f2f).toBe(3.05)
    expect(typ.bands[0]).toBe(t.bands[0]) // the office band is untouched
    expect(use(typ, 'residential').mean).toBeCloseTo(3.05, 2)
    expect(use(typ, 'residential').extra).toBeLessThan(use(t, 'residential').extra)
    expect(use(typ, 'residential').floors).toBeGreaterThan(use(t, 'residential').floors)
    // About the same height: whole storeys, so within one storey of the old top.
    expect(Math.abs(Math.max(...towerFloors(typ).map((f) => f.z1)) - Math.max(...towerFloors(t).map((f) => f.z1)))).toBeLessThan(4.0)
  })

  it('rounds to the centimetre and keeps the value in a sane range', () => {
    expect(withUseF2f(mixed().bands, 'office', 4.234)[0].f2f).toBe(4.23)
    expect(withUseF2f(mixed().bands, 'office', 0.5)[0].f2f).toBe(2.4)
  })

  it('says plainly what it cannot change: imported storeys, or a use given floor by floor', () => {
    expect(f2fEditable(mixed(), 'residential').ok).toBe(true)
    expect(f2fEditable(mixed(), 'residential').why).toMatch(/keeps about its height/)
    const imp = f2fEditable(mixed({ imported: {} as Tower['imported'] }), 'office')
    expect(imp.ok).toBe(false)
    expect(imp.why).toMatch(/imported model/)
    const byFloor = f2fEditable(mixed({ bands: [{ use: 'office', share: 1 }], floorUses: { 30: 'hotel' } }), 'hotel')
    expect(byFloor.ok).toBe(false)
  })

  it('opens its own settings in the left panel instead of "no settings of its own"', () => {
    expect(NODE_CONTROLS['built.f2f-use']).toEqual(['f2f-use-set'])
    // Collected fresh: the shared test transform cache can hold an older registry.ts glob (node_modules is one junction).
    const tools = collectTools(import.meta.glob<{ default: DesignTool | DesignTool[] }>('/src/**/*.tool.tsx', { eager: true }))
    expect(tools.some((x) => x.id === 'f2f-use-set')).toBe(true)
  })
})
