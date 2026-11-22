import { describe, expect, it } from 'vitest'
import { liftCheck } from '../engine/lifts'
import type { Tower } from '../engine/types'
import { fixFor } from '../lib/fixes'
import { useStore } from '../store'
import { coreSplit } from './CoreNeed'

const s0 = useStore.getInitialState()
const office = (patch: Partial<Tower> = {}): Tower => ({ ...s0.towers.vtc[0], bands: [{ use: 'office', share: 1 }], coreAuto: false, coreShare: 0.1, ...patch } as Tower)

describe('Services → core fit (node placement, 21 Nov)', () => {
  it('splits the worst level need into lifts, stairs, services and walls, from the same numbers as the core-fit line', () => {
    const r = liftCheck(office(), s0.liftPresets, s0.egressPresets)
    const s = coreSplit(r)
    expect(s.total).toBeCloseTo(r.requiredMax, 6)
    expect(s.short).toBeCloseTo(r.requiredMax - r.modelledCore, 6)
    expect(s.short).toBeGreaterThan(0) // a 10% core is short for an office tower
    expect(r.rules.find((x) => x.id.startsWith('core-fit'))!.state).not.toBe('pass')
  })

  it('moves with the HVAC choice the panel offers (air-water needs fewer services shafts than all-air)', () => {
    const allAir = coreSplit(liftCheck(office({ hvac: 'all-air' }), s0.liftPresets, s0.egressPresets))
    const airWater = coreSplit(liftCheck(office({ hvac: 'air-water' }), s0.liftPresets, s0.egressPresets))
    expect(airWater.services).toBeLessThanOrEqual(allAir.services)
    expect(airWater.lifts).toBeCloseTo(allAir.lifts, 6)
  })

  it('points the core-fit fix at the need and the HVAC choice', () => {
    expect(fixFor('core-fit', 'fail', '120 m² needed vs 80 m² modelled', '', 'team_assumption')).toMatch(/HVAC/)
  })
})
