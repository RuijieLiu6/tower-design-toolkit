import { describe, expect, it } from 'vitest'
import { USES } from '../engine/types'
import { BUILDING_USES, SWATCH_BORDER, contrast, luminance, partUse, useColor, useFromBuildingTag } from './buildingUse'

describe('building types for the Plain style', () => {
  it('reads the type from the OpenStreetMap building tag and never guesses one', () => {
    expect(useFromBuildingTag('apartments')).toEqual({ use: 'residential', basis: 'osm-building' })
    expect(useFromBuildingTag('office').use).toBe('office')
    expect(useFromBuildingTag('train_station').use).toBe('transit')
    expect(useFromBuildingTag('church').use).toBe('cultural')
    expect(useFromBuildingTag('school').use).toBe('institutional')
    expect(useFromBuildingTag('yes')).toEqual({ use: 'other', basis: 'none' })
    expect(useFromBuildingTag('industrial').use).toBe('other')
    expect(useFromBuildingTag(undefined).use).toBe('other')
  })

  it('prefers the layer’s type and source, else the building tag alone', () => {
    const v = { use: Uint8Array.of(2, 7), useBasis: Uint8Array.of(2, 0), osmType: ['yes', 'apartments'] }
    expect(partUse(v, 0)).toEqual({ use: 'office', basis: 'osm-poi' })
    expect(partUse(v, 1)).toEqual({ use: 'other', basis: 'none' })
    expect(partUse({ use: null, useBasis: null, osmType: ['apartments'] }, 0)).toEqual({ use: 'residential', basis: 'osm-building' })
  })

  it('tints the design tower’s programme colours, lighter than the tower, each swatch 3:1 against its border', () => {
    expect(BUILDING_USES.find((u) => u.id === 'office')!.base).toBe(USES.office.color)
    for (const u of BUILDING_USES) {
      const c = useColor(u.id)
      expect(luminance(c)).toBeGreaterThan(luminance(u.base))
      expect(contrast(c, SWATCH_BORDER), u.id).toBeGreaterThanOrEqual(3)
    }
    expect(new Set(BUILDING_USES.map((u) => useColor(u.id))).size).toBe(BUILDING_USES.length)
  })
})
