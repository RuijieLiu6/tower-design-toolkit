// The Toolkit's model into Sinnie's energy engine (engine/energySWInput.ts): every floor with its program, plate, facade
// lengths and exposed top; the evidence lines' invariants (every line sourced and flagged, none verified).
import { describe, expect, it } from 'vitest'
import hourly from '../data/sunWindHourly.json'
import { DEFAULT_ZONES, prep } from './daylightSW'
import { energyHourly } from './energySW'
import { DEFAULT_ENERGY_PRESETS, energyModelOf, energyRules, PROG_OF } from './energySWInput'
import type { Tower } from './types'

const tower: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 40, depth: 30, height: 42, f2f: 4.2,
  podiumHeight: 0, podiumWidth: 40, podiumDepth: 30, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.5 }, { use: 'residential', share: 0.5 }], coreShare: 0.25, plantEvery: 5,
}
const glazing = { zones: DEFAULT_ZONES, vt: 0.6, from: 'studio' as const, note: 'her defaults' }

describe('energy input', () => {
  it('maps the Toolkit uses to her programs (amenity stays conditioned)', () => {
    expect(PROG_OF).toMatchObject({ residential: 'resi', civic: 'public', amenity: 'public', mechanical: 'mep', office: 'office' })
  })
  it('takes every floor, plant floors as her plant zone, facade lengths from the plate and the roof on top', () => {
    const m = energyModelOf(tower, [0, 0], 0, glazing)
    expect(m.floors).toHaveLength(10)
    expect(m.floors.filter((f) => f.prog === 'mep')).toHaveLength(2)
    const f0 = m.floors[0]
    expect(f0.area).toBe(1200)
    expect(f0.facade).toEqual({ N: 40, S: 40, E: 30, W: 30 })
    expect(m.floors.slice(0, -1).every((f) => f.roof === 0 && f.terrace === 0)).toBe(true)
    expect(m.floors[9].roof).toBe(1200)
  })
  it('evidence lines: sourced and flagged, none verified; TEUI judged against the weighted target', () => {
    const m = energyModelOf(tower, [0, 0], 45, glazing)
    const r = energyHourly(prep(hourly as never), { tz: hourly.tz, days: hourly.days }, m.floors, DEFAULT_ENERGY_PRESETS, null)
    const lines = energyRules({ result: r, presets: DEFAULT_ENERGY_PRESETS, glazing, towerName: 'T', dimmed: false })
    for (const x of lines) { expect(x.flag).not.toBe('verified'); expect(x.source.label.length).toBeGreaterThan(10) }
    expect(['pass', 'fail']).toContain(lines.find((x) => x.id === 'sw-en-teui')!.state)
    expect(lines.some((x) => x.id === 'sw-en-overheat')).toBe(true) // the plant floors are an unconditioned zone
  })
})
