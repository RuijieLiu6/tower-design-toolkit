import { describe, expect, it } from 'vitest'
import { blockSpans, towerFloors, withBlocks } from '../engine/massing'
import type { Tower } from '../engine/types'
import { addBlockAbove, axisParam, faceFrame, hitBlocks, moveBlock, planeHit, pushFace, storeyOf } from './blockEdit'

/** A podium (60 × 40 × 9 m, two 4.5 m storeys) and a tower block (30 × 30 × 120 m), rotated 30°, at (100, 50). */
function tower(rotation = 30): Tower {
  const t: Tower = {
    id: 't', name: 'T', x: 100, y: 50, rotation, width: 30, depth: 30, height: 129, f2f: 4, podiumHeight: 9, podiumWidth: 60, podiumDepth: 40,
    podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0,
  }
  return withBlocks(t, [
    { id: 'p', name: 'Podium', height: 9, width: 60, depth: 40, dx: 0, dy: 0, rotation: 0, podium: true },
    { id: 'k', name: 'Tower', height: 120, width: 30, depth: 30, dx: 5, dy: 0, rotation: 0 },
  ])
}
const at = (t: Tower, i: number, u: number, v: number): [number, number] => {
  const s = blockSpans(t)[i], a = (s.rotation * Math.PI) / 180
  return [s.cx + u * Math.cos(a) - v * Math.sin(a), s.cy + u * Math.sin(a) + v * Math.cos(a)]
}

describe('picking blocks in the view (Sinnie Choi: Face / Mass)', () => {
  it('a ray from above hits the tower roof; one from the side hits the podium face it meets first', () => {
    const t = tower()
    const [x, y] = at(t, 1, 0, 0)
    const top = hitBlocks(t, 10, { o: [x, y, 500], d: [0, 0, -1] })
    expect(top).toMatchObject({ index: 1, face: 'top' })
    expect(top!.point[2]).toBeCloseTo(10 + 129, 6)
    // From far out along the podium's +u axis, at 5 m up: the podium's u+ face.
    const [px, py] = at(t, 0, 200, 0), [qx, qy] = at(t, 0, 0, 0)
    const side = hitBlocks(t, 10, { o: [px, py, 15], d: [qx - px, qy - py, 0] })
    expect(side).toMatchObject({ index: 0, face: 'u+' })
    expect(hitBlocks(t, 10, { o: [px, py, 500], d: [0, 0, -1] })).toBeNull()
  })

  it('axisParam follows the pointer along the face normal; planeHit meets the floor', () => {
    expect(axisParam([0, 0, 0], [1, 0, 0], { o: [7, -10, 3], d: [0, 1, 0] })).toBeCloseTo(7, 6)
    expect(planeHit({ o: [1, 2, 10], d: [1, 0, -1] }, 0)).toEqual([11, 2])
    const t = tower()
    const f = faceFrame(t, 0, 0, 'v+')
    expect(Math.hypot(f.N[0], f.N[1])).toBeCloseTo(1, 6)
    expect(f.O[2]).toBeCloseTo(4.5, 6)
  })
})

describe('Face: push and pull', () => {
  it('a side face moves alone: the opposite face stays put, snapped to 0.5 m', () => {
    const t = tower()
    const r = pushFace(t, 1, 'u+', 4.3)
    const b = r.blocks[1]
    expect(b.width).toBe(34.5)
    const before = at(t, 1, -15, 0)
    const after = at(withBlocks(t, r.blocks), 1, -b.width / 2, 0)
    expect(after[0]).toBeCloseTo(before[0], 6); expect(after[1]).toBeCloseTo(before[1], 6)
    expect(r.info.value).toBe('Width 34.5 m')
    // Pushed in on the other side, never below 3 m.
    expect(pushFace(t, 1, 'u-', -100).blocks[1].width).toBe(3)
  })

  it('a side face lines up with another block\'s face when it comes near', () => {
    const t = tower()
    // The tower block's v+ face is 15 m from its centre; the podium's is 20 m. Pulled 4.8 m it lands on the podium face.
    const r = pushFace(t, 1, 'v+', 4.8)
    expect(r.blocks[1].depth).toBe(35)
    expect(r.info.guide).toBe('lined up with Podium')
    expect(pushFace(t, 1, 'v+', 4.8, { free: true }).blocks[1].depth).toBeCloseTo(34.8, 6)
  })

  it('the roof changes height in whole storeys, and the blocks above ride on it', () => {
    const t = tower()
    expect(storeyOf(t, 0)).toBe(4.5)
    const r = pushFace(t, 0, 'top', 3)
    expect(r.blocks[0].height).toBe(13.5)
    const next = withBlocks(t, r.blocks)
    expect(next.height).toBeCloseTo(133.5, 6)
    expect(towerFloors(next).filter((f) => f.podium)).toHaveLength(3)
    expect(pushFace(t, 1, 'top', -10.1).blocks[1].height).toBe(108)
  })
})

describe('Mass: move and add', () => {
  it('a block moves on its floor in 0.5 m steps and carries the blocks above; Shift moves it alone', () => {
    const t = tower(0)
    const r = moveBlock(t, 0, 3.3, -1.1)
    expect([r.blocks[0].dx, r.blocks[0].dy]).toEqual([3.5, -1])
    expect([r.blocks[1].dx, r.blocks[1].dy]).toEqual([8.5, -1])
    const alone = moveBlock(t, 0, 3.3, -1.1, { alone: true })
    expect([alone.blocks[1].dx, alone.blocks[1].dy]).toEqual([5, 0])
  })

  it('moves in the tower frame when the tower is turned, and lines faces up', () => {
    const t = tower(90)
    // Turned 90°: moving +y in the project is +u (along) in the tower frame.
    const r = moveBlock(t, 1, 0, 2, { alone: true })
    expect(r.blocks[1].dx).toBe(7)
    // The tower block's +u face is at 5 + 15 = 20 m; the podium's at 30 m. Moving 9.7 m lines them up.
    const g = moveBlock(t, 1, 0, 9.7, { alone: true })
    expect(g.blocks[1].dx).toBe(15)
    expect(g.info.guide).toContain('Podium')
  })

  it('a new block sits on the chosen block with its footprint, three storeys, and lifts what is above', () => {
    const t = tower()
    const blocks = addBlockAbove(t, 0, 'n')
    expect(blocks.map((b) => b.id)).toEqual(['p', 'n', 'k'])
    expect(blocks[1]).toMatchObject({ width: 60, depth: 40, height: 12 })
    expect(blocks[1].podium).toBeFalsy()
    expect(withBlocks(t, blocks).height).toBeCloseTo(141, 6)
  })
})
