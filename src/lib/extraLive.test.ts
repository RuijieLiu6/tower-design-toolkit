import { describe, expect, it } from 'vitest'
import { economics } from '../engine/economics'
import { DEFAULT_FACADE, facadeCheck } from '../engine/facade'
import { DEFAULT_MOBILITY, mobilityCheck } from '../engine/mobility'
import { useStore } from '../store'
import { extraOutput, type ExtraInputs } from './extraLive'

const towers = useStore.getInitialState().towers.vtc
const x: ExtraInputs = {
  econ: economics(towers, { permitYear: 2027, landPrice: null, siteArea: 11468, includeRegional: true, homeM2: 75, hotelM2PerKey: 40 }),
  mobility: mobilityCheck(towers, DEFAULT_MOBILITY, { project: 'vtc', transitLink: false, homeM2: 75, hotelM2PerKey: 40 }),
  facade: facadeCheck(towers, DEFAULT_FACADE, 45),
  culture: { findings: [], gate: [{ id: 'a', label: 'A', ok: true }, { id: 'b', label: 'B', ok: false }] },
  provenance: { prov: [], issues: [] },
}

describe('Customize live lines for the extra built nodes', () => {
  it('gives each node a headline and keeps flags and sources on its lines', () => {
    for (const id of ['built.economics', 'built.mobility', 'built.facade', 'built.culture-claims', 'built.provenance']) {
      const o = extraOutput(id, x)!
      expect(o.headline.length).toBeGreaterThan(3)
      for (const i of o.items) { expect(i.flag).toBeTruthy(); expect(i.source?.label).toBeTruthy() }
    }
    expect(extraOutput('built.culture-claims', x)!.headline).toMatch(/1 of 2 export checks/)
    expect(extraOutput('built.provenance', x)!.state).toBe('unknown')
  })
  it('ignores other nodes', () => {
    expect(extraOutput('built.vtc-rules', x)).toBeNull()
  })
})
