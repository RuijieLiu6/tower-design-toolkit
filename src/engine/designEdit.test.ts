import { describe, expect, it } from 'vitest'
import { coreSideEdit, floorLines, moveBlock, planChecks, preview, resizeBlockEdge, rotateBlock, sectionChecks, setBandF2f, setBlockTop, toggleLevel } from './designEdit'
import { bandCounts, blockSpans, coreSide, towerFloors, withBlocks } from './massing'
import type { Block, Tower } from './types'

const base: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.6 }, { use: 'residential', share: 0.4 }], coreShare: 0.25, plantEvery: 0,
}
const blk = (id: string, height: number, width: number, depth: number, extra: Partial<Block> = {}): Block => ({ id, height, width, depth, dx: 0, dy: 0, rotation: 0, ...extra })
const t = withBlocks(base, [blk('p', 18, 100, 64, { podium: true }), blk('a', 168, 46, 46), blk('b', 99, 36, 36)])
const west = (b: Block) => b.dx - b.width / 2

describe('plan edits', () => {
  it('moves one edge and keeps the opposite one', () => {
    const b = resizeBlockEdge(t, 1, 'e', 5)[1]
    expect(b.width).toBe(51)
    expect(west(b)).toBeCloseTo(west(t.blocks![1]), 9)
    const n = resizeBlockEdge(t, 1, 'n', -6)[1]
    expect(n.depth).toBe(40)
    expect(n.dy - n.depth / 2).toBeCloseTo(-23, 9) // south edge stays at -23
  })
  it('follows a turned block: its east edge pushes along its own x axis', () => {
    const turned = withBlocks(t, t.blocks!.map((b, i) => (i === 1 ? { ...b, rotation: 90 } : b)))
    const b = resizeBlockEdge(turned, 1, 'e', 4)[1]
    expect(b.dx).toBeCloseTo(0, 9)
    expect(b.dy).toBeCloseTo(2, 9)
  })
  it('never shrinks a block below the minimum side', () => {
    expect(resizeBlockEdge(t, 2, 'w', -100)[2].width).toBe(6)
  })
  it('moves and turns a block relative to the tower', () => {
    expect(moveBlock(t, 2, 3, -2)[2]).toMatchObject({ dx: 3, dy: -2 })
    expect(rotateBlock(t, 2, 370)[2].rotation).toBe(10)
  })
  it('sizes the core by its side and switches it to manual', () => {
    const e = coreSideEdit(t, 20)
    expect(e.coreAuto).toBe(false)
    expect(e.coreShare).toBeCloseTo(400 / (46 * 46), 3)
    expect(coreSide({ ...t, ...e })).toBeCloseTo(20, 1)
    expect(coreSideEdit(t, 100).coreShare).toBe(0.6)
  })
  it('gives the live checks from the lift and egress engines', () => {
    const c = planChecks(t, towerFloors(t)[10].level)
    expect(c.rules.map((r) => r.id)).toEqual(['core-fit-t1', 'ntg-t1', 'separation-t1', 'travel-t1'])
    expect(c.ntgFloor).toBeCloseTo(1 - coreSide(t) ** 2 / c.floor!.area, 9)
    expect(sectionChecks(t).floors).toBe(towerFloors(t).length)
  })
})

describe('section edits', () => {
  it('snaps a block top to a floor line, and the blocks above ride with it', () => {
    const before = blockSpans(t)
    const nb = setBlockTop(t, 1, 150)
    const after = blockSpans(withBlocks(t, nb))
    expect(floorLines(t)).toContain(after[1].z1)
    expect(after[2].z1 - after[2].z0).toBeCloseTo(before[2].z1 - before[2].z0, 9)
    expect(setBlockTop(t, 1, 150, false)[1].height).toBeCloseTo(150 - 18, 9)
  })
  it('places sky lobbies, plant and outrigger floors one level at a time', () => {
    const fl = towerFloors(t)
    const lv = fl[30].level
    const sky = toggleLevel(t, lv, 'sky')
    expect(towerFloors({ ...t, ...sky }).find((f) => f.level === lv)!.skyLobby).toBe(true)
    const plant = toggleLevel(t, lv, 'plant')
    expect(towerFloors({ ...t, ...plant }).find((f) => f.level === lv)!.use).toBe('mechanical')
    expect(toggleLevel({ ...t, ...plant }, lv, 'plant')).toEqual({ plantLevels: [] })
    expect(toggleLevel(t, lv, 'outrigger')).toEqual({ outriggerFloors: [lv] })
  })
  it('gives a band its own floor-to-floor: more, lower floors that still fit the height', () => {
    const r = setBandF2f(t, 1, 3.2)
    const t2 = { ...t, ...r }
    const fl = towerFloors(t2), up = fl.filter((f) => !f.podium)
    expect(up.filter((f) => f.use === 'residential').every((f) => Math.abs(f.z1 - f.z0 - 3.2) < 1e-9)).toBe(true)
    expect(up.filter((f) => f.use === 'office').every((f) => Math.abs(f.z1 - f.z0 - 4.2) < 1e-9)).toBe(true)
    expect(fl.length).toBeGreaterThan(towerFloors(t).length)
    expect(fl[fl.length - 1].z1).toBeLessThanOrEqual(t2.height + 1e-9)
    expect(setBandF2f(t2, 1, undefined).bands[1]).toEqual({ use: 'residential', share: 0.4 })
  })
  it('without a band of its own, the band counts are the old allocation', () => {
    const n = Math.floor((285 - 18) / 4.2)
    expect(bandCounts(t, 285 - 18)).toEqual([Math.round(0.6 * n), n - Math.round(0.6 * n)])
  })
  it('previews a drag without touching the stored tower', () => {
    const p = preview(t, { blocks: resizeBlockEdge(t, 1, 'e', 4) })
    expect(p.blocks![1].width).toBe(50)
    expect(t.blocks![1].width).toBe(46)
  })
})

describe('floor count at exact heights', () => {
  it('counts a floor that fits exactly, despite floating point', () => {
    const exact = withBlocks(base, [blk('p', 18, 100, 64, { podium: true }), blk('a', 214.2, 46, 46)])
    expect(towerFloors(exact).filter((f) => !f.podium)).toHaveLength(51)
    expect(towerFloors(exact).at(-1)!.z1).toBeCloseTo(232.2, 9)
  })
})
