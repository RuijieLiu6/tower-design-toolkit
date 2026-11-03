import { describe, expect, it } from 'vitest'
import { buildScene } from '../lib/export/scene'
import { sectionDrawing } from './drawings'
import { DEFAULT_ENERGY, pvPotential } from './energyCarbon'
import { floorCounts, interiorCheck, DEFAULT_INTERIOR } from './interior'
import { liftCheck } from './lifts'
import { applyTowerPatch, blockSpans, floorRing, legacyBlocks, migrateTower, towerFloors, towerFootprint, towerMasses, withBlocks } from './massing'
import { towerOccluders } from './solarRules'
import { checkTowerCones } from './towerCones'
import type { Block, Tower } from './types'
import { checkFootprint } from './viewCones'
import { vtcRules } from './vtcRules'

/** An old save: the two-field tower, no blocks. */
const old: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.25, plantEvery: 0,
}
const blk = (id: string, height: number, width: number, depth: number, extra: Partial<Block> = {}): Block => ({ id, height, width, depth, dx: 0, dy: 0, rotation: 0, ...extra })
/** Podium 60 × 50 × 18 m, a 40 m square shaft to 120 m, a 30 m setback block to 200 m. */
const stacked = withBlocks({ ...old, f2f: 4, bands: [{ use: 'office', share: 1 }] }, [
  blk('p', 18, 60, 50, { podium: true }), blk('a', 102, 40, 40), blk('b', 80, 30, 30),
])
const shoelace = (r: [number, number][]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0)) / 2
const centroid = (r: [number, number][]) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]

describe('stacked blocks: floors and GFA', () => {
  it('an old two-field tower reads exactly as before, migrated or not', () => {
    const m = migrateTower(old)
    expect(m.blocks!.map((b) => [b.id, b.height, b.width, b.depth, !!b.podium])).toEqual([['podium', 18, 100, 64, true], ['tower', 267, 46, 46, false]])
    expect(towerFloors(m)).toEqual(towerFloors(old))
    expect(towerFootprint(m)).toEqual(towerFootprint(old))
    expect(towerFootprint(m, true)).toEqual(towerFootprint(old, true))
    expect(migrateTower(m)).toBe(m) // idempotent
    expect(migrateTower({ ...old, imported: { meshId: 'x' } as Tower['imported'] }).blocks).toBeUndefined()
  })
  it('gives each floor the plate of the block at its mid-height, and the GFA adds up', () => {
    const fl = towerFloors(stacked)
    const pod = fl.filter((f) => f.podium), up = fl.filter((f) => !f.podium)
    expect(pod).toHaveLength(4) // 18 m / 4.5 m
    expect(pod.every((f) => f.area === 3000)).toBe(true)
    expect(up).toHaveLength(Math.floor((200 - 18) / 4)) // 45 floors
    // Floors whose mid-height is below 120 m sit on block a, the rest on block b.
    for (const f of up) expect(f.area).toBe((f.z0 + f.z1) / 2 < 120 ? 1600 : 900)
    const gfa = fl.reduce((s, f) => s + f.area, 0)
    expect(gfa).toBe(4 * 3000 + up.filter((f) => (f.z0 + f.z1) / 2 < 120).length * 1600 + up.filter((f) => (f.z0 + f.z1) / 2 >= 120).length * 900)
    expect(stacked.height).toBe(200)
    expect(stacked.width).toBe(40) // the typical block is the tallest above the podium
  })
  it('a twisted block keeps its area; a shifted block moves its plate, turned with the tower', () => {
    const t = withBlocks({ ...stacked, rotation: 30, x: 10, y: -5 }, [blk('p', 18, 60, 50, { podium: true }), blk('a', 102, 40, 40, { rotation: 45 }), blk('b', 80, 30, 30, { dx: 6, dy: 0 })])
    const fl = towerFloors(t)
    const lowA = fl.find((f) => !f.podium)!, topB = fl[fl.length - 1]
    expect(lowA.area).toBe(1600)
    expect(shoelace(floorRing(t, lowA))).toBeCloseTo(1600, 6)
    const ra = floorRing(t, lowA)
    // Twist 45° on a tower turned 30°: the plate's edge runs at 75°.
    expect((Math.atan2(ra[1][1] - ra[0][1], ra[1][0] - ra[0][0]) * 180) / Math.PI).toBeCloseTo(75, 6)
    const cb = centroid(floorRing(t, topB))
    expect(cb[0]).toBeCloseTo(10 + 6 * Math.cos(Math.PI / 6), 6)
    expect(cb[1]).toBeCloseTo(-5 + 6 * Math.sin(Math.PI / 6), 6)
  })
})

describe('editing towers with blocks', () => {
  const m = migrateTower(old)
  it('maps the old controls onto the blocks', () => {
    expect(applyTowerPatch(m, { height: 300 }).blocks!.at(-1)!.height).toBeCloseTo(282, 9)
    const w = applyTowerPatch(stacked, { width: 50 })
    expect(w.blocks!.map((b) => b.width)).toEqual([60, 50, 37.5]) // tower blocks scaled, podium untouched
    const np = applyTowerPatch(m, { podiumHeight: 0 })
    expect(np.blocks).toHaveLength(1)
    expect(np.height).toBeCloseTo(285, 9) // the architectural top stays
    expect(towerFloors(np).every((f) => !f.podium)).toBe(true)
  })
  it('a what-if copy that sets a box field directly is honoured by every reader', () => {
    const lower = { ...m, height: 150 }
    expect(blockSpans(lower).at(-1)!.z1).toBeCloseTo(150, 9)
    expect(Math.max(...towerFloors(lower).map((f) => f.z1))).toBeLessThanOrEqual(150 + 1e-9)
    expect(towerFootprint({ ...m, width: 30, depth: 30 })).toEqual(towerFootprint({ ...old, width: 30, depth: 30 }))
  })
  it('blocks set by hand win over stale box fields', () => {
    const t: Tower = { ...old, blocks: [blk('p', 20, 60, 60, { podium: true }), blk('t', 180, 20, 20)] }
    expect(blockSpans(t).map((s) => s.z1)).toEqual([20, 200])
  })
})

describe('every engine receives per-level plates', () => {
  const t = withBlocks({ ...stacked }, [blk('p', 18, 60, 50, { podium: true }), blk('a', 102, 40, 40), blk('b', 80, 30, 30, { dx: 5 })])
  const floors = towerFloors(t)
  it('export: one storey solid per floor on its own block plate', () => {
    const sc = buildScene([t], { project: 'vtc', northDeg: 45, groundElevation: 0, utmOrigin: null, meshOf: () => undefined })
    const storeys = sc.solids.filter((s) => s.strings.level)
    expect(storeys).toHaveLength(floors.length)
    for (const s of storeys) {
      const f = floors.find((x) => String(x.level) === s.strings.level)!
      expect(Number(s.strings.gross_area_m2)).toBeCloseTo(f.area, 0)
    }
  })
  it('interior: homes per floor follow the plate, so a setback floor holds fewer', () => {
    const res = { ...t, bands: [{ use: 'residential' as const, share: 1 }], interior: DEFAULT_INTERIOR }
    const fl = towerFloors(res).filter((f) => !f.podium)
    const low = floorCounts(res, fl[0])!.homes!, high = floorCounts(res, fl[fl.length - 1])!.homes!
    expect(high).toBeLessThan(low)
    const total = fl.reduce((s, f) => s + floorCounts(res, f)!.homes!, 0)
    expect(interiorCheck(res, towerFloors(res)).totals.homes).toBe(total)
  })
  it('drawings, solar, cones, containment, PV and lifts read the blocks', () => {
    expect((sectionDrawing(t, { northDeg: 45, projectLabel: 'test', mode: 'tight' }).svg.match(/data-block=/g) ?? []).length).toBe(3)
    expect(towerOccluders([t]).prisms.map((p) => p.z1)).toEqual([18, 120, 200])
    expect(towerMasses(t).map((m) => [m.z0, m.z1, m.podium])).toEqual([[0, 18, true], [18, 120, false], [120, 200, false]])
    // Cones: each cone keeps the worse of the per-block checks.
    const origin: [number, number] = [491300, 5458600]
    const per = towerMasses(t).map((m) => checkFootprint(m.ring.map(([x, y]) => [x + origin[0], y + origin[1]] as [number, number]), 10 + m.z1))
    const all = checkTowerCones(t, 10, origin)
    all.forEach((c, i) => { if (c.exceed !== null) expect(c.exceed).toBeCloseTo(Math.max(...per.map((p) => p[i].exceed ?? -Infinity)), 9) })
    // A block shifted past the block edge fails containment even though the typical plate is inside.
    const out = withBlocks({ ...t }, [...blocksOfT(t).slice(0, 2), blk('b', 80, 30, 30, { dx: 60 })])
    expect(vtcRules([out], { fsrTier: 2, transitLink: false }).find((r) => r.id === 'containment')!.state).toBe('fail')
    // PV: the setback terrace on block a is a roof of its own.
    const pv = pvPotential([t], DEFAULT_ENERGY, { northDeg: 45, lat: 49.28, lon: -123.12, obstacles: [], mfa: 1e5, elec: 1e6 })
    const setback = pv.surfaces.find((s) => s.id === `${t.id}-roof-1`)!
    expect(setback.area).toBeCloseTo(1600 - 900, 6)
    expect(pv.surfaces.find((s) => s.id === `${t.id}-podium`)!.area).toBeCloseTo(3000 - 1600, 6)
    // Lifts size their populations from the floor plates.
    expect(liftCheck(t).rises.reduce((s, r) => s + r.population, 0)).toBeLessThan(liftCheck({ ...t, blocks: [blk('p', 18, 60, 50, { podium: true }), blk('a', 182, 40, 40)] }).rises.reduce((s, r) => s + r.population, 0))
  })
})

function blocksOfT(t: Tower): Block[] { return t.blocks ?? legacyBlocks(t) }
