import { describe, expect, it } from 'vitest'
import { AXO_DIR, EYE, STREET_VIEWS, axoShot, bearing, cityFrame, viewpointShot, viewpointsFor } from './presentViews'
import { VTC_SITE } from '../engine/publicRealm'
import { CONE_VIEWPOINTS, viewSite } from '../engine/silhouetteViewpoint'

const inBlock = ([x, y]: [number, number]) => x > VTC_SITE.xMin && x < VTC_SITE.xMax && y > VTC_SITE.yMin && y < VTC_SITE.yMax

describe('presentation camera presets', () => {
  it('street views stand at eye level, off the block, and look toward it', () => {
    expect(STREET_VIEWS.length).toBeGreaterThanOrEqual(3)
    for (const v of STREET_VIEWS) {
      const [x, y, z] = v.shot.position
      expect(z).toBe(EYE)
      expect(inBlock([x, y])).toBe(false)
      const [tx, ty] = v.shot.target
      // The target lies at or on the block's edge, so the podium is in view.
      expect(tx).toBeGreaterThanOrEqual(VTC_SITE.xMin - 15); expect(tx).toBeLessThanOrEqual(VTC_SITE.xMax)
      expect(ty).toBeGreaterThanOrEqual(VTC_SITE.yMin - 1); expect(ty).toBeLessThanOrEqual(VTC_SITE.yMax + 1)
      for (const p of v.people ?? []) expect(inBlock(p)).toBe(false)
    }
    expect(new Set(STREET_VIEWS.map((v) => v.id)).size).toBe(STREET_VIEWS.length)
  })
  it('the axonometric keeps one direction and frames the tower and the block', () => {
    for (const top of [150, 300, 420]) {
      const s = axoShot(top)
      const d = s.position.map((v, i) => v - s.target[i])
      const l = Math.hypot(...d), a = Math.hypot(...AXO_DIR)
      d.forEach((v, i) => expect(v / l).toBeCloseTo(AXO_DIR[i] / a, 6))
      expect(s.height).toBeGreaterThanOrEqual(top * 1.2)
    }
  })
  it('Queen Elizabeth Park comes first for the default site, and its cone covers the site', () => {
    const site = viewSite('vtc').origin
    const rows = viewpointsFor(site)
    expect(rows[0].vp.id).toBe('qe')
    expect(rows[0].inCone).toBe(true)
    expect(rows.length).toBeGreaterThan(1)
    expect(rows[1].vp.id).not.toBe('qe')
  })
  it('a viewpoint shot stands at the cone origin at Lv and narrows its lens with distance', () => {
    const qe = CONE_VIEWPOINTS.find((v) => v.id === 'qe')!
    const centre = cityFrame(viewSite('vtc').origin)
    const s = viewpointShot(qe, centre, 30, 300)
    expect(s.position[2]).toBe(qe.eye)
    expect(s.position.slice(0, 2)).toEqual(cityFrame(qe.at))
    expect(s.fov).toBeGreaterThan(4); expect(s.fov).toBeLessThan(12)
    expect(bearing(qe.at, viewSite('vtc').origin)).toBeGreaterThan(330) // the park is south-east of downtown, looking north-north-west
  })
})

describe('hero views (Real Vancouver) and the street view looking up', async () => {
  const { BOARD4_FROM, BOARD4_PEOPLE, HERO_VIEWS, heroShot, upShot } = await import('./presentViews')
  const centre: [number, number] = [254, 486], ground = 23.4, top = 300
  it('every hero view has a camera from data, aimed at the tower, the frame sized to the tower', () => {
    expect(new Set(HERO_VIEWS.map((v) => v.id)).size).toBe(HERO_VIEWS.length)
    for (const v of HERO_VIEWS) {
      const s = heroShot(v, centre, ground, top, () => 10)
      expect(s, v.id).not.toBeNull()
      const [x, y, z] = s!.position
      const d = Math.hypot(centre[0] - x, centre[1] - y)
      expect(d, v.id).toBeGreaterThan(150)
      // The frame at the tower is `frame` × its height tall.
      expect(2 * d * Math.tan((s!.fov * Math.PI) / 360)).toBeCloseTo(Math.min(v.frame * top, 2 * d * Math.tan((75 * Math.PI) / 360)), 0)
      expect(s!.target[2]).toBeCloseTo(ground + top * v.aim, 6)
      if (v.from.kind === 'cone') expect(z).toBeGreaterThan(4) // the cone's Lv
      if (v.from.kind === 'point') expect(z).toBe(10 + v.from.eyeAboveGround)
    }
  })
  it('looks up at the given pitch from 1.6 m on the street, off the block, figures off the block too', () => {
    const s = upShot(BOARD4_FROM, EYE, [0, 0], 42, 100)
    const [x, y, z] = s.position, [tx, ty, tz] = s.target
    expect(inBlock([x, y])).toBe(false)
    expect((Math.atan2(tz - z, Math.hypot(tx - x, ty - y)) * 180) / Math.PI).toBeCloseTo(42, 6)
    expect(Math.hypot(tx - x, ty - y) > 0 && ty > y).toBe(true) // toward the block (north)
    for (const p of BOARD4_PEOPLE) expect(inBlock(p)).toBe(false)
  })
})
