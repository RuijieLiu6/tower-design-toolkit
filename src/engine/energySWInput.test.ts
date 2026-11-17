// The Toolkit's model into Sinnie's energy engine (engine/energySWInput.ts): every floor with its program, plate, facade
// lengths and exposed top; the evidence lines' invariants (every line sourced and flagged, none verified).
import { describe, expect, it } from 'vitest'
import hourly from '../data/sunWindHourly.json'
import { DEFAULT_ZONES, prep } from './daylightSW'
import { energyHourly } from './energySW'
import { DEFAULT_ENERGY_PRESETS, energyModelOf, energyRules, PROG_OF } from './energySWInput'
import type { ImportedStorey, Tower } from './types'

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
  it('review fix 6: an imported tower uses each storey’s own loops for area and facade', () => {
    const sq = (h: number): [number, number][] => [[-h, -h], [h, -h], [h, h], [-h, h]]
    const st = (level: number, half: number): ImportedStorey => ({ level, z0: (level - 1) * 4, z1: level * 4, area: 4 * half * half, use: 'office', podium: false, hasFloor: true, loops: [sq(half)] })
    const imp = { ...tower, plantEvery: 0, height: 8, imported: { storeys: [st(1, 20), st(2, 12)], hull: sq(20), f2f: 4, podiumTop: 0, podiumF2F: 4 } } as unknown as Tower
    const m = energyModelOf(imp, [0, 0], 0, glazing)
    expect(m.floors.map((f) => f.area)).toEqual([1600, 576])
    expect(m.floors[0].terrace).toBe(1600 - 576) // the step-back is an exposed terrace
  })
  it('review fix 8: no floor area is one unknown line, never a NaN pass', () => {
    const lines = energyRules({ result: { gfa: 0 } as never, presets: DEFAULT_ENERGY_PRESETS, glazing, towerName: 'T', dimmed: false })
    expect(lines).toHaveLength(1); expect(lines[0].state).toBe('unknown')
  })
})
