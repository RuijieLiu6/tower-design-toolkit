import { describe, expect, it } from 'vitest'
import type { RuleResult } from '../engine/types'
import { headlineLine, headlineLineId, ledOutput } from './presetHeadline'
import { presetById, USER_TYPES } from './userTypes'

const square: RuleResult = { id: 'pr-square-sun', label: 'Sun on this design\'s square', value: '62% gets 2 h or more', threshold: 'at least half', state: 'pass', flag: 'team_assumption', source: { label: 'Placemaking critique', page: 'p.49' } }

describe('preset headline (node placement, 21 Nov)', () => {
  it('leads Sun and shadow with the square sun in the street, workshop and public-realm presets only', () => {
    for (const id of ['designer.neighbourhood', 'designer.codesign', 'planner.public']) {
      expect(headlineLineId('built.sw-shadow', id)).toBe('pr-square-sun')
      // The preset runs Sun and shadow (its parts map to the lead) and Public realm, which computes the line.
      expect(presetById(id)!.nodes).toContain('built.sw-shadow')
      expect(presetById(id)!.nodes).toContain('built.pr-streetwall')
    }
    const led = USER_TYPES.flatMap((t) => t.presets).filter((p) => p.headline).map((p) => p.id).sort()
    expect(led).toEqual(['designer.codesign', 'designer.neighbourhood', 'planner.public'])
    expect(headlineLineId('built.sw-shadow', 'designer.form')).toBeNull()
    expect(headlineLineId('built.sw-shadow', null)).toBeNull()
    expect(headlineLineId('built.sw-wind-comfort', 'planner.public')).toBeNull()
  })

  it('reads the line from the ground plane, and says what to switch on when it is not computed', () => {
    expect(headlineLine('pr-square-sun', { groundPlane: { rules: [square] } })).toBe(square)
    const off = headlineLine('pr-square-sun', { groundPlane: null })
    expect(off.state).toBe('unknown')
    expect(off.value).toMatch(/Switch on Public realm/)
    expect(off.value).toMatch(/Solar access/)
  })

  it('puts the line first on the node and takes its state, without dropping the other lines', () => {
    const out = ledOutput({ state: 'pass', headline: 'No new shadow', items: [{ id: 'sw-shadow-site', label: 'Open site in new shadow', state: 'pass', flag: 'team_assumption' }] }, { ...square, state: 'warn' })
    expect(out.state).toBe('warn')
    expect(out.headline).toBe('Sun on this design\'s square: 62% gets 2 h or more')
    expect(out.items.map((i) => i.id)).toEqual(['pr-square-sun', 'sw-shadow-site'])
    expect(ledOutput(null, square).items.map((i) => i.id)).toEqual(['pr-square-sun'])
  })
})
