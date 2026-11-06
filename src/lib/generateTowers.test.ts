import { describe, expect, it } from 'vitest'
import { defaultBrief, generate, type GenBrief, type GenKey } from '../engine/dtmassGen'
import { gfaByUse, towerFloors, towerFootprint } from '../engine/massing'
import { DEFAULT_LIFT_PRESETS } from '../engine/lifts'
import { DEFAULT_EGRESS_PRESETS } from '../engine/egress'
import type { UseId } from '../engine/types'
import { cityRect, placeGenerated, sideBearing, toProject, USE_MAP, vtcSiteRect } from './generateTowers'

const presets = { liftPresets: DEFAULT_LIFT_PRESETS, egressPresets: DEFAULT_EGRESS_PRESETS }
const tall: GenBrief = { ...defaultBrief(), gfa: 120000, plate: 1800, heightTarget: 285, parkingLevels: 0, mix: { residential: 50, hotel: 15, office: 25, retail: 6, restaurant: 2, amenity: 2 } }
const vtc = vtcSiteRect()
const site = { w: vtc.w, d: vtc.d, frontage: 'S' as const, area: vtc.area }

/** Generated floor area by Toolkit use, from the generator's own blocks. */
function wanted(key: GenKey, brief: GenBrief) {
  const r = generate(site, brief, key, {}, 0, { plateLimit: null })
  const out: Partial<Record<UseId, number>> = {}
  for (const b of r.blocks) if (b.use !== 'parking') out[USE_MAP[b.use]] = (out[USE_MAP[b.use]] ?? 0) + b.w * b.d * b.floors
  return { r, out }
}

describe('generated massing placed as Toolkit towers', () => {
  it('the competition block: the generator frame sits on the brief\'s block, +x along the Retail High Street', () => {
    expect(toProject(vtc, 0, 0)).toEqual([-72.4, -39.6])
    expect(toProject(vtc, vtc.w, vtc.d)[0]).toBeCloseTo(72.4, 6)
    expect(sideBearing(vtc, 'S', 0)).toBeCloseTo(180, 6)
  })

  for (const key of ['slender', 'podium', 'split'] as const) {
    it(`${key}: parametric towers keep the generated floor area (total, and by use above the ground storey)`, () => {
      const { r, out } = wanted(key, tall)
      const placed = placeGenerated(r, vtc, presets, 'g')
      expect(placed.towers).toHaveLength(r.towerRects.length)
      expect(placed.mesh).toBeNull()
      const got = gfaByUse(placed.towers)
      const sum = (o: Partial<Record<UseId, number>>) => Object.values(o).reduce((a, b) => a + (b ?? 0), 0)
      expect(Math.abs(sum(got) - sum(out))).toBeLessThanOrEqual(sum(out) * 0.002)
      // Above grade every storey keeps its use; only the ground storey (retail with a lobby behind it) is one use.
      const ground = r.blocks.filter((b) => b.role === 'ground')
      for (const [use, area] of Object.entries(out) as [UseId, number][]) {
        const atGrade = ground.filter((b) => USE_MAP[b.use as keyof typeof USE_MAP] === use).reduce((s, b) => s + b.w * b.d * b.floors, 0)
        if (atGrade === 0 && use !== 'retail') expect(Math.abs(got[use] - area), `${key} ${use}`).toBeLessThanOrEqual(area * 0.002 + 1)
      }
      expect(got.retail).toBeGreaterThan(0)
      for (const t of placed.towers) {
        expect(t.height).toBeCloseTo(Math.max(...towerFloors(t).map((f) => f.z1)), 0)
        // The podium storeys keep their own heights: as many podium floors as the generator drew storeys.
        const groundLevels = new Set(ground.flatMap((b) => Array.from({ length: b.floors }, (_, i) => Math.round((b.z0 + i * b.f2f) * 100))))
        const podiumStoreys = r.blocks.filter((b) => b.role === 'podium').reduce((s, b) => s + b.floors, 0) + groundLevels.size
        expect(towerFloors(t).filter((f) => f.podium).length).toBe(podiumStoreys)
        // The tower stands on the block.
        for (const [x, y] of towerFootprint(t, true)) { expect(Math.abs(x)).toBeLessThanOrEqual(72.4 + 1e-6); expect(Math.abs(y)).toBeLessThanOrEqual(39.6 + 1e-6) }
      }
    })
  }

  it('split: the shared podium is halved, not doubled', () => {
    const { r } = wanted('split', tall)
    const placed = placeGenerated(r, vtc, presets, 'g')
    const podiumArea = placed.towers.reduce((s, t) => s + (t.blocks ?? []).filter((b) => b.podium && b.id.endsWith('-g')).reduce((a, b) => a + b.width * b.depth, 0), 0)
    expect(podiumArea).toBeCloseTo(r.podium.w * Math.min(r.podium.d, vtc.d), 0)
  })

  it('courtyard: one exact mass, the ring storeys with the court as a hole, areas by use kept', () => {
    const { r, out } = wanted('court', tall)
    expect(r.court).not.toBeNull()
    const placed = placeGenerated(r, vtc, presets, 'g', 45)
    expect(placed.towers).toHaveLength(1)
    const t = placed.towers[0]
    expect(t.imported?.format).toBe('generated')
    expect(placed.mesh?.id).toBe(t.imported?.meshId)
    const ring = t.imported!.storeys.find((s) => s.podium && s.loops.length === 2)
    expect(ring).toBeDefined()
    const got = gfaByUse([t])
    // Storey areas are kept to 0.1 m² and the lot clips the 79.25 m podium to 79.2 m: within 0.2%.
    for (const [use, area] of Object.entries(out) as [UseId, number][]) expect(Math.abs(got[use] - area), use).toBeLessThanOrEqual(area * 0.002 + 1)
    expect(t.imported!.volume).toBeGreaterThan(0)
  })

  it('a lot that is nearly rectangular: the rectangle is drawn in so every corner is on the lot', () => {
    // 777 Homer St's lot shape: a 4-sided lot a few centimetres off square, turned 35°.
    const a = (35 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    const lot = ([[0, 0], [61.05, 0.12], [60.9, 36.7], [-0.08, 36.55]] as [number, number][]).map(([x, y]) => [300 + x * c - y * s, -20 + x * s + y * c] as [number, number])
    const f = cityRect(lot, 'near-square lot')
    expect(f.w).toBeGreaterThan(60.5); expect(f.d).toBeGreaterThan(36.2)
    const inside = (x: number, y: number) => { let k = false; for (let i = 0, j = lot.length - 1; i < lot.length; j = i++) { const [xi, yi] = lot[i], [xj, yj] = lot[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k } return k }
    for (const [u, v] of [[0.01, 0.01], [f.w - 0.01, 0.01], [f.w - 0.01, f.d - 0.01], [0.01, f.d - 0.01]]) expect(inside(...toProject(f, u, v))).toBe(true)
  })

  it('a Real Vancouver site: the smallest rectangle around the lot, turned along its longer side', () => {
    const a = (30 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    const rect = [[0, 0], [60, 0], [60, 25], [0, 25]].map(([x, y]) => [100 + x * c - y * s, 50 + x * s + y * c] as [number, number])
    const f = cityRect(rect, 'test lot')
    expect(f.w).toBeCloseTo(60, 6); expect(f.d).toBeCloseTo(25, 6); expect(f.area).toBeCloseTo(1500, 6)
    expect(((f.angleDeg - 30) % 180 + 180) % 180).toBeCloseTo(0, 6)
    // Every lot corner lies on the rectangle.
    for (const [x, y] of rect) {
      const r = (f.angleDeg * Math.PI) / 180, u = (x - f.origin[0]) * Math.cos(r) + (y - f.origin[1]) * Math.sin(r), v = -(x - f.origin[0]) * Math.sin(r) + (y - f.origin[1]) * Math.cos(r)
      expect(u).toBeGreaterThanOrEqual(-1e-6); expect(u).toBeLessThanOrEqual(60 + 1e-6); expect(v).toBeGreaterThanOrEqual(-1e-6); expect(v).toBeLessThanOrEqual(25 + 1e-6)
    }
  })
})
