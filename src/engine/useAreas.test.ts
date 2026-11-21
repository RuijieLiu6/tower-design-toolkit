// G14 (vtc-entry tool deficits, tower C review R4-7): uses were set per storey only, so a winter garden or an amenity
// room inside a home storey was laid out as homes and counted as residential floor area. `useAreas` on an imported
// storey gives part of the storey its own use.
import { describe, expect, it } from 'vitest'
import { towerPatch } from './imported'
import { interiorCheck } from './interior'
import { floorAreasByUse, gfaByUse, towerFloors } from './massing'
import type { ImportedMass, ImportedStorey, Tower, UseArea } from './types'
import { fsrSummary } from './vtcRules'

type P = [number, number]
const rect = (w: number, d: number): P[] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]

/** Ten 40 × 40 m home storeys, 3.2 m floor to floor; `parts` on level 5 only. */
function tower(parts?: UseArea[]): Tower {
  const ring = rect(40, 40)
  const storeys: ImportedStorey[] = Array.from({ length: 10 }, (_, i) => ({
    level: i + 1, z0: i * 3.2, z1: (i + 1) * 3.2, area: 1600, use: 'residential', podium: false, hasFloor: true, loops: [ring],
    ...(parts && i === 4 ? { useAreas: parts } : {}),
  }))
  const mass: ImportedMass = {
    meshId: 'm', fileName: 'g14.3dm', format: '3dm', unit: 'm', unitSource: 'confirmed', fileNorthDeg: 0, northSource: 'test', datumShift: 0, datumSource: 'test',
    f2f: 3.2, podiumTop: 0, podiumF2F: 4, storeys, hull: ring, volume: null, top: 32, health: { block: 0, warn: 0 },
  }
  const base: Tower = { id: 'g14', name: 'G14', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, f2f: 3.2, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.15, plantEvery: 0 }
  return { ...base, ...towerPatch(mass) }
}

const homesOn = (t: Tower) => {
  const fl = towerFloors(t)
  return { fl, homes: interiorCheck(t, fl).totals.homes }
}

describe('G14: part of a storey in another use', () => {
  it('a home storey with a 378 m² amenity area lays out fewer homes and counts 378 m² as amenity', () => {
    const plain = tower(), mixed = tower([{ use: 'amenity', area: 378 }])
    const a = homesOn(plain), b = homesOn(mixed)
    expect(b.homes).toBeLessThan(a.homes)
    const ga = gfaByUse([plain]), gb = gfaByUse([mixed])
    expect(gb.amenity).toBeCloseTo(378, 6)
    expect(gb.residential).toBeCloseTo(ga.residential - 378, 6)
    // floor area is moved between uses, not lost: the total and the storey's own area are the same
    expect(fsrSummary([mixed]).total).toBeCloseTo(fsrSummary([plain]).total, 6)
    expect(b.fl.find((f) => f.level === 5)!.area).toBe(1600)
    // the non-residential tiers take the amenity part in
    expect(fsrSummary([mixed]).tier3 - fsrSummary([plain]).tier3).toBeCloseTo(378 / fsrSummary([plain]).siteArea, 9)
  })

  it("an unheated winter garden ('none') leaves floor area and homes but is counted in no use", () => {
    const plain = tower(), garden = tower([{ use: 'none', area: 378 }])
    const g = gfaByUse([garden])
    expect(g.residential).toBeCloseTo(gfaByUse([plain]).residential - 378, 6)
    expect(g.amenity).toBe(0)
    expect(fsrSummary([garden]).total).toBeCloseTo(fsrSummary([plain]).total - 378, 6)
    expect(homesOn(garden).homes).toBe(homesOn(tower([{ use: 'amenity', area: 378 }])).homes)
  })

  it('a storey without useAreas is unchanged', () => {
    const t = tower()
    const fl = towerFloors(t)
    expect(fl.every((f) => !('useAreas' in f))).toBe(true)
    expect(gfaByUse([t]).residential).toBe(16000)
    expect(floorAreasByUse(fl[0])).toEqual({ residential: 1600 })
    // the same homes as a tower that never had the field: every storey on the typical plate
    expect(homesOn(t).homes).toBe(homesOn(tower([])).homes)
  })

  it('parts never take more than the storey', () => {
    expect(floorAreasByUse({ use: 'residential', area: 1000, useAreas: [{ use: 'amenity', area: 700 }, { use: 'civic', area: 700 }] })).toEqual({ amenity: 700, civic: 300, residential: 0 })
  })
})
