import { describe, expect, it } from 'vitest'
import { towerFloors } from '../engine/massing'
import type { Tower } from '../engine/types'
import { bandsFromFloors } from './floorPick'

const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 120, f2f: 4, podiumHeight: 0, podiumWidth: 30, podiumDepth: 30, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.5 }, { use: 'residential', share: 0.5 }], coreShare: 0.25, plantEvery: 0, coreAuto: true, skyLobbies: [], skyRoom: null, material: 'concrete', ...patch,
} as Tower)

describe('floors edited one by one fold into the bands', () => {
  it('a run of hotel floors at the top becomes a third band, and the floors read the same', () => {
    const t = tower({ floorUses: { 21: 'hotel', 22: 'hotel', 23: 'hotel', 24: 'hotel', 25: 'hotel', 26: 'hotel', 27: 'hotel', 28: 'hotel', 29: 'hotel', 30: 'hotel' } })
    const before = towerFloors(t).map((f) => f.use)
    const r = bandsFromFloors(t)!
    expect(r.bands.map((b) => [b.use, Math.round(b.share * 30)])).toEqual([['office', 15], ['residential', 5], ['hotel', 10]])
    expect(r.floorUses).toBeUndefined()
    const after = towerFloors({ ...t, bands: r.bands, floorUses: r.floorUses }).map((f) => f.use)
    expect(after).toEqual(before)
  })
  it('a sky lobby keeps its band; podium overrides stay as overrides', () => {
    const t = tower({ height: 128, podiumHeight: 8, podiumWidth: 50, podiumDepth: 40, skyLobbies: [16], floorUses: { 2: 'office', 10: 'amenity' } })
    const r = bandsFromFloors(t)!
    expect(r.floorUses).toEqual({ 2: 'office' })
    expect(r.bands.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6)
    const after = towerFloors({ ...t, bands: r.bands, floorUses: r.floorUses })
    expect(after.find((f) => f.level === 10)?.use).toBe('amenity')
    expect(after.find((f) => f.level === 16)?.skyLobby).toBe(true)
    expect(after.find((f) => f.level === 2)?.use).toBe('office')
  })
  it('bands with their own floor-to-floor are left alone', () => {
    expect(bandsFromFloors(tower({ bands: [{ use: 'office', share: 0.5, f2f: 4.5 }, { use: 'residential', share: 0.5 }], floorUses: { 3: 'hotel' } }))).toBeNull()
  })
})
