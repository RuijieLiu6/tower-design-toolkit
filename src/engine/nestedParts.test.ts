import { describe, expect, it } from 'vitest'
import { dropNestedLoops, mergeMeshes, plateAt, type Pt } from './importGeom'
import { box } from './testMeshes'

const sq = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

describe('G53: a part inside a plate is not facade', () => {
  it('drops a loop nested in a larger loop of the same winding, keeps a courtyard hole and a separate part', () => {
    const plate = sq(0, 0, 50, 50), room = sq(10, 10, 20, 20), hole = [...sq(30, 30, 40, 40)].reverse(), apart = sq(60, 0, 70, 10)
    const out = dropNestedLoops([plate, room, hole, apart])
    expect(out).toEqual([plate, hole, apart])
    // a part sharing the plate's edge still lies within it
    expect(dropNestedLoops([plate, sq(0, 0, 10, 50)])).toEqual([plate])
    // two identical parts: one kept
    expect(dropNestedLoops([plate, plate])).toHaveLength(1)
  })

  it('slices a model of a plate with a room solid inside it into one outline, area unchanged', () => {
    const m = mergeMeshes([box(0, 0, 0, 50, 50, 40), box(10, 10, 0, 20, 20, 40)])
    const p = plateAt(m, 20)
    expect(p.loops).toHaveLength(1)
    expect(p.area).toBeCloseTo(2500, 3)
  })
})
