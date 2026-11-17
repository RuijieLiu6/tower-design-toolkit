import { describe, expect, it } from 'vitest'
import { addDrawnMass, crossesHole, moveDrawn, oneCorePerBuilding, rotateDrawn, towerFromDrawn, updateDrawnMass, updateDrawnMany } from './mass'
import { resetHistory, startHistory, undo } from '../project/history'
import { useImportStore } from '../import/store'
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
    expect(up.imported!.storeys).toHaveLength(3) // it starts at its base: no empty storeys up from the ground
    expect(up.imported!.storeys[0].z0).toBe(12)
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

describe('a drawn mass and its mesh, its copies and its building', () => {
  const reset = () => { const s = useStore.getState(); useStore.setState({ project: 'vtc', towers: { ...s.towers, vtc: [] } }) }

  it('keeps a mesh per shape, so Undo finds the old one (the view and the export follow the outline)', () => {
    reset()
    resetHistory(); const stop = startHistory()
    const a = addDrawnMass(box(20, 10), 0)!
    const id1 = a.imported!.meshId
    expect(id1.startsWith('drawn:')).toBe(true)
    expect(useImportStore.getState().meshes[id1]).toBeTruthy()
    updateDrawnMass(a.id, { floors: 9 })
    const id2 = useStore.getState().towers.vtc[0].imported!.meshId
    expect(id2).not.toBe(id1)
    expect(useImportStore.getState().meshes[id1]).toBeTruthy() // the old shape's mesh is still there
    expect(undo()).toBe(true)
    const back = useStore.getState().towers.vtc[0]
    expect(back.drawn!.floors).toBe(6)
    expect(back.imported!.meshId).toBe(id1)
    expect(useImportStore.getState().meshes[back.imported!.meshId]).toBeTruthy()
    stop()
  })
  it('a copy, a split part or a cut piece takes its settings from its source, never the first mass; what is the source\'s alone is cleared', () => {
    reset()
    const first = addDrawnMass(box(20, 10), 0)!
    updateDrawnMass(first.id, { floors: 3 })
    const second = addDrawnMass(box(20, 10, 60, 0), 0)!
    const s = useStore.getState()
    useStore.setState({ towers: { ...s.towers, vtc: s.towers.vtc.map((t) => (t.id === second.id ? { ...t, bands: [{ use: 'residential' as const, share: 1 }], basement: { levels: 2 } as never, form: { type: 'taper', p: {}, base: { w: 1, d: 1, h: 1, f2f: 1 } } } : t)) } })
    updateDrawnMany([], [{ pts: box(20, 10, 120, 0), base: 0, floors: 6, f2f: 3.6, name: 'Mass 2 copy', from: second.id }])
    const copy = useStore.getState().towers.vtc.find((t) => t.name === 'Mass 2 copy')!
    expect(copy.bands).toEqual([{ use: 'residential', share: 1 }])
    expect(copy.basement).toBeUndefined()
    expect(copy.form).toBeUndefined()
    expect(copy.interior).toBeUndefined()
  })
  it('rotates holes and the core with the outline, and refuses an offset into a courtyard', () => {
    const d = { pts: box(40, 40), holes: [box(10, 10, 10, 0)], base: 0, floors: 2, f2f: 4, core: { x: 10, y: -15, w: 6, d: 6 } }
    const r = rotateDrawn(d, 90, [0, 0])
    expect(r.holes![0].map((p) => [Math.round(p[0]), Math.round(p[1])])).toEqual(expect.arrayContaining([[-5, 5], [5, 5], [5, 15], [-5, 15]]))
    expect(r.core).toMatchObject({ w: 6, d: 6 })
    expect([r.core!.x + 3, r.core!.y + 3].map(Math.round)).toEqual([12, 13])
    expect(crossesHole(d, box(34, 34))).toBe(false)
    expect(crossesHole(d, box(26, 26))).toBe(true) // the hole at x 5..15 would stick out of a 26 m box
  })
  it('a building of parts shares one core; a move by the tower tools takes every part and its outline', () => {
    reset()
    const a = addDrawnMass(box(20, 20), 0)!
    updateDrawnMany([{ id: a.id, patch: { part: 'b1' } }], [{ pts: box(10, 10, 15, 0), base: 0, floors: 2, f2f: 3.6, part: 'b1', from: a.id }])
    const [big, small] = useStore.getState().towers.vtc
    expect(big.coreShare).toBeGreaterThan(0)
    expect(small.coreShare).toBe(0)
    expect(small.coreAuto).toBe(false)
    expect(oneCorePerBuilding(useStore.getState().towers.vtc)).toEqual(useStore.getState().towers.vtc)
    expect(moveDrawn(big.id, 5, 0, 0)).toBe(true)
    const [b2, s2] = useStore.getState().towers.vtc
    expect(b2.x).toBeCloseTo(big.x + 5, 6)
    expect(s2.x).toBeCloseTo(small.x + 5, 6)
    expect(s2.drawn!.pts[0][0]).toBeCloseTo(small.drawn!.pts[0][0] + 5, 6)
  })
})
