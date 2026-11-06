import { describe, expect, it } from 'vitest'
import { towerFloors } from './massing'
import { stackingDiagram, stackZones } from './stacking'
import type { Tower } from './types'

const t: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 0,
}

describe('programme stacking diagram (brief p.30, run-through G1)', () => {
  it('zones cover every floor once, bottom to top, and their areas add up to the tower', () => {
    const floors = towerFloors(t), zones = stackZones(floors)
    expect(zones.reduce((s, z) => s + z.floors, 0)).toBe(floors.length)
    expect(zones.reduce((s, z) => s + z.area, 0)).toBeCloseTo(floors.reduce((s, f) => s + f.area, 0), 6)
    expect(zones[0].podium).toBe(true)
    for (let i = 1; i < zones.length; i++) expect(zones[i].l0).toBe(zones[i - 1].l1 + 1)
  })

  it('draws one bar per zone with its levels and share, and the LOD note', () => {
    const d = stackingDiagram(t, { projectLabel: 'Competition site', date: '2026-11-04' })
    expect((d.svg.match(/data-zone=/g) ?? []).length).toBe(d.zones.length)
    expect(d.svg).toContain('Office')
    expect(d.svg).toContain('LOD 100')
    expect(d.svg).toMatch(/L\d+–L\d+/)
  })
})
