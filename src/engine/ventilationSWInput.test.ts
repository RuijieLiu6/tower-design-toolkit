// The Toolkit's presets into Sinnie's ventilation engine (engine/ventilationSWInput.ts): operable faces on the glazing
// zones, and the evidence lines' invariants (every line sourced and flagged, none verified; no opening is never a pass).
import { describe, expect, it } from 'vitest'
import hourly from '../data/sunWindHourly.json'
import { DEFAULT_ZONES, maskFloor, prep, type Zone } from './daylightSW'
import { ventStudy, ventTowerQuick } from './ventilationSW'
import { DEFAULT_VENT_PRESETS, operableZones, readingsOf, ventRules } from './ventilationSWInput'

const P = prep(hourly as never)
const C = { temp: hourly.temp, months: hourly.months, days: hourly.days }
const floors = [0, 1, 2].map((i) => maskFloor({ i, z: i * 4, h: 4, w: 40, d: 24, cx: 0, cy: 0, rot: 0, core: 10 }))
const run = (zones: Zone[]) => {
  const v = ventStudy(P, C, floors, zones, DEFAULT_VENT_PRESETS, DEFAULT_VENT_PRESETS.period, 12), q = ventTowerQuick(floors, zones, DEFAULT_VENT_PRESETS.open, 0, 0)
  return ventRules({ readings: readingsOf(v, q), presets: DEFAULT_VENT_PRESETS, glazing: { from: 'studio', note: 'n' }, towerName: 'T', period: 'whole year', levels: [1, 2, 3], left: 0 })
}

describe('ventilation input', () => {
  it('sets the operable faces on the glazing zones, splitting an all-faces zone', () => {
    const z = operableZones([{ face: 'all', from: 1, to: 999, strat: 'curtain', wwr: 0.5, shgc: 0.4, depth: 0, pv: 0, operable: false }], { ...DEFAULT_VENT_PRESETS, operable: { N: true, E: false, S: true, W: false } })
    expect(z.map((x) => [x.face, x.operable, x.wwr])).toEqual([['N', true, 0.5], ['E', false, 0.5], ['S', true, 0.5], ['W', false, 0.5]])
    expect(operableZones(DEFAULT_ZONES, DEFAULT_VENT_PRESETS).every((x) => x.operable)).toBe(true)
  })
  it('evidence lines: sourced, flagged, none verified; a sealed facade fails 62.1', () => {
    const open = run(DEFAULT_ZONES)
    for (const r of open) { expect(r.flag).not.toBe('verified'); expect(r.source.label.length).toBeGreaterThan(10) }
    const sealed = run(operableZones(DEFAULT_ZONES, { ...DEFAULT_VENT_PRESETS, operable: { N: false, E: false, S: false, W: false } }))
    expect(sealed.find((r) => r.id === 'sw-vt-openable')!.state).toBe('fail')
    expect(sealed.find((r) => r.id === 'sw-vt-within8')!.state).toBe('fail')
  })
})
