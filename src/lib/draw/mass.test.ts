import { describe, expect, it } from 'vitest'
import { addDrawnMass, towerFromDrawn, updateDrawnMass, updateDrawnMany } from './mass'
import { towerFloors, towerFootprint, towerMasses } from '../../engine/massing'
import { defaultTower, useStore } from '../../store'

const box = (w: number, d: number, cx = 0, cy = 0): [number, number][] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]

// A drawn mass is a Tower like any other (after Sinnie Choi's build): the engines read its sliced storeys.
describe('a tower from a drawn mass', () => {
  it('has the outline\'s centroid, box, height and a storey per floor with the plate area', () => {
    const t = towerFromDrawn({ ...defaultTower('vtc'), id: 'm1', name: 'Mass 1' }, { pts: box(20, 10, 100, 50), base: 0, floors: 6, f2f: 3.6 })
    expect([t.x, t.y]).toEqual([100, 50])
    expect([t.width, t.depth]).toEqual([20, 10])
    expect(t.height).toBeCloseTo(21.6, 6)
    expect(t.imported?.storeys).toHaveLength(6)
    expect(t.imported!.storeys.every((s) => s.hasFloor && Math.abs(s.area - 200) < 1)).toBe(true)
    expect(t.imported?.volume).toBe(4320)
    const floors = towerFloors(t)
    expect(floors).toHaveLength(6)
    expect(floors[0].area).toBeCloseTo(200, 0)
    expect(towerMasses(t)[0].z1).toBeCloseTo(21.6, 6)
    expect(towerFootprint(t).length).toBeGreaterThanOrEqual(4)
  })
  it('keeps a courtyard out of the floor area and lifts a stacked mass to its base', () => {
    const ring = towerFromDrawn({ ...defaultTower('vtc'), id: 'm2', name: 'Mass 2' }, { pts: box(40, 40), holes: [box(20, 20)], base: 0, floors: 2, f2f: 4 })
    expect(ring.imported!.storeys[0].area).toBeCloseTo(1200, 0)
    const up = towerFromDrawn({ ...defaultTower('vtc'), id: 'm3', name: 'Mass 3' }, { pts: box(10, 10), base: 12, floors: 3, f2f: 4 })
    expect(up.height).toBe(24)
    expect(up.imported!.storeys.filter((s) => s.hasFloor)).toHaveLength(3)
    expect(up.imported!.storeys.filter((s) => !s.hasFloor)).toHaveLength(3) // the air below it: voids, not floor area
  })
  it('adds, changes and joins masses in the store, each as a tower', () => {
    const s = useStore.getState()
    useStore.setState({ project: 'vtc', towers: { ...s.towers, vtc: [] } })
    const a = addDrawnMass(box(20, 10), 0)!
    expect(a).not.toBeNull()
    expect(useStore.getState().towers.vtc).toHaveLength(1)
    expect(useStore.getState().selectedTower).toBe(a.id)
    expect(addDrawnMass(box(1, 1), 0)).toBeNull() // too small to be a mass
    expect(updateDrawnMass(a.id, { floors: 10 })).toBe(true)
    expect(useStore.getState().towers.vtc[0].height).toBeCloseTo(36, 6)
    updateDrawnMany([{ id: a.id, patch: { part: 'p1' } }], [{ pts: box(10, 10, 20, 0), base: 0, floors: 3, f2f: 3.6, part: 'p1' }])
    const list = useStore.getState().towers.vtc
    expect(list).toHaveLength(2)
    expect(list.every((t) => t.drawn?.part === 'p1')).toBe(true)
    updateDrawnMany([], [], [list[1].id])
    expect(useStore.getState().towers.vtc).toHaveLength(1)
  })
})
