import { describe, expect, it } from 'vitest'
import { EYE_CLEARANCE, MAX_POLAR, clampView, nearFor, polarOf, registerGround, relaxPolar, sceneGround, sightTarget, type V3 } from './cameraClamp'
import type { Plinth } from './plinth'

const plinth: Plinth = { x0: -100, y0: -100, x1: 100, y1: 100, bottom: -10 }
const hill = (x: number) => Math.max(0, 50 - Math.abs(x)) // a 50 m ridge along x = 0
const dir = (c: V3, t: V3) => { const d = [t[0] - c[0], t[1] - c[1], t[2] - c[2]]; const n = Math.hypot(...d); return d.map((v) => v / n) }

describe('camera clamp', () => {
  it('lifts a camera that orbited into the hill to just above it, leaving the target', () => {
    const r = clampView([0, -50, 20], [0, 50, 60], hill, plinth)
    expect(r.cam).toEqual([0, -50, 50 + EYE_CLEARANCE])
    expect(r.target).toEqual([0, 50, 60])
    expect(r.moved).toBe(true)
    expect(r.above).toBeCloseTo(EYE_CLEARANCE)
  })

  it('stops a pan at the plinth edge without turning the view', () => {
    const cam: V3 = [180, -40, 300], target: V3 = [160, 10, 0]
    const r = clampView(cam, target, () => 0, plinth)
    expect(r.target).toEqual([100, 10, 0])
    expect(r.cam).toEqual([120, -40, 300])
    dir(r.cam, r.target).forEach((v, i) => expect(v).toBeCloseTo(dir(cam, target)[i]))
  })

  it('brings a target below the ground up to it, camera and all', () => {
    const r = clampView([60, 0, 80], [10, 0, 0], hill, plinth)
    expect(r.target).toEqual([10, 0, 40])
    expect(r.cam).toEqual([60, 0, 120])
  })

  it('leaves a street-level eye (1.6 m) and an aerial view alone', () => {
    expect(clampView([10, -75, 1.6], [-20, 0, 60], () => 0, plinth).moved).toBe(false)
    expect(clampView([60, -80, 400], [0, 0, 80], hill, plinth).moved).toBe(false)
  })

  it('slides a buried preset target back along the line of sight, keeping the eye and the view', () => {
    // Viewpoint K on 3 Nov: the look-at point 2 km out sat 15.7 m inside a hill; lifting it lifted the eye too.
    const cam: V3 = [-100, 0, 60], target: V3 = [10, 0, 30] // inside the ridge (50 m at x = 0, 40 m at x = 10)
    const t = sightTarget(cam, target, hill)
    dir(cam, t).forEach((v, i) => expect(v).toBeCloseTo(dir(cam, target)[i]))
    expect(t[2]).toBeGreaterThanOrEqual(hill(t[0]))
    expect(t[2] - hill(t[0])).toBeLessThan(0.01)
    expect(t[0]).toBeCloseTo(-13.57, 1) // where the line of sight meets the ridge's near slope
    expect(sightTarget(cam, [100, 0, 15], hill)).toEqual([100, 0, 15]) // above the ground: unchanged
    expect(clampView(cam, t, hill, plinth).moved).toBe(false)
  })

  it('lets a preset start below its target and only ever eases the limit back up', () => {
    const phi = polarOf([10, -75, 1.6], [-20, 0, 60])
    expect(phi).toBeGreaterThan(Math.PI / 2)
    let limit = Math.max(MAX_POLAR, phi)
    limit = relaxPolar(limit, phi - 0.2)
    expect(limit).toBeCloseTo(phi - 0.2)
    expect(relaxPolar(limit, phi)).toBeCloseTo(phi - 0.2) // orbiting back down does not raise it again
    expect(relaxPolar(limit, 0.5)).toBe(MAX_POLAR)
  })

  it('keeps the near plane inside the gap to the ground and the target, never above its own value', () => {
    expect(nearFor(1, EYE_CLEARANCE, 500)).toBeCloseTo(0.6)
    expect(nearFor(25, 3, 400)).toBeCloseTo(1.5)
    expect(nearFor(25, 900, 3000)).toBe(25)
    expect(nearFor(1, 0, 0)).toBe(0.3)
  })

  it('hands the ground back to the flat default only while it is still the current one', () => {
    const a = registerGround({ at: hill, plinth })
    const b = registerGround({ at: () => 7, plinth: null })
    a()
    expect(sceneGround.at(0, 0)).toBe(7)
    b()
    expect(sceneGround.at(0, 0)).toBe(0)
    expect(sceneGround.plinth).toBeNull()
  })
})
