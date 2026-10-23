import { describe, expect, it } from 'vitest'
import { DEFAULT_EGRESS_PRESETS, stairEnclosure, stairSpots, storeyLoads } from './egress'
import { DEFAULT_LIFT_PRESETS, autoCoreShare, liftCheck } from './lifts'
import { coreLayout, fitScale, typicalFloor } from './plan'
import type { Tower } from './types'

const base: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.25, plantEvery: 0, coreAuto: true, skyLobbies: [], skyRoom: null,
}
const sized = (t: Tower): Tower => ({ ...t, coreShare: autoCoreShare(t) })
const layoutOf = (t: Tower) => coreLayout(t, liftCheck(t), DEFAULT_LIFT_PRESETS, DEFAULT_EGRESS_PRESETS)

describe('core layout', () => {
  it('places every shaft, keeps them clear of the in-core stairs, and inside an auto-sized core', () => {
    const t = sized(base)
    const lay = layoutOf(t)
    expect(lay.shafts.length).toBe(liftCheck(t).totalCars + 2)
    expect(lay.overflow).toBe(0)
    const widest = Math.max(...storeyLoads(t, DEFAULT_EGRESS_PRESETS, DEFAULT_LIFT_PRESETS).filter((s) => !s.podium).map((s) => s.stairMm))
    const enc = stairEnclosure(widest, 4.2, DEFAULT_EGRESS_PRESETS)
    for (const st of stairSpots(t, 2, enc.a, enc.b)) for (const sh of lay.shafts) {
      const apart = Math.abs(sh.x - st.x) >= (lay.side + enc.a) / 2 - 1e-6 || Math.abs(sh.y - st.y) >= (lay.side + enc.b) / 2 - 1e-6
      expect(apart).toBe(true)
    }
  })
  it('flags shafts that do not fit a small core', () => {
    expect(layoutOf({ ...base, coreShare: 0.08 }).overflow).toBeGreaterThan(0)
  })
  it('stacks upper rises over lower shafts above a sky lobby', () => {
    const t = sized({ ...base, skyLobbies: [40] })
    const lay = layoutOf(t)
    const positions = new Set(lay.shafts.map((s) => `${s.x},${s.y}`))
    expect(positions.size).toBeLessThan(lay.shafts.length)
    // No two shafts at one position overlap in height.
    const byPos = new Map<string, { z0: number; z1: number }[]>()
    for (const s of lay.shafts) byPos.set(`${s.x},${s.y}`, [...(byPos.get(`${s.x},${s.y}`) ?? []), s])
    for (const list of byPos.values()) {
      list.sort((a, b) => a.z0 - b.z0)
      for (let i = 1; i < list.length; i++) expect(list[i].z0).toBeGreaterThan(list[i - 1].z1)
    }
  })
})

describe('board drawing helpers', () => {
  it('picks the middle floor of the main use as the typical floor', () => {
    const f = typicalFloor(base)!
    expect(f.use).toBe('office')
    expect(f.podium).toBe(false)
  })
  it('draws a 46 m plate at 1:200 and a 100 m podium at 1:300 on A2', () => {
    expect(fitScale(46 + 20, 46 + 20, 408, 362)).toBe(200)
    expect(fitScale(100 + 20, 64 + 20, 408, 362)).toBe(300)
  })
})
