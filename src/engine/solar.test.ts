import { describe, expect, it } from 'vitest'
import { bcClock, bcUtcOffset, dayWindow, instants, selfTest, solarPosition, studyWindow, sunDirection } from './solar'
import { footprintMask, gridOver, polygonMask, ringArea, shadowMask, type Occluders } from './shadow'

describe('solar frame', () => {
  it('matches the NOAA reference the research recorded (11 Nov 2026, 17:00 UTC)', () => {
    const t = selfTest()
    expect(t.ok).toBe(true)
    expect(t.altitude).toBeCloseTo(12.65, 1)
  })

  it('puts the equinox sun where the research says the shadows point (bearing 306° at 10:00, 52° at 16:00 PT)', () => {
    const w = studyWindow('equinox')
    const at10 = solarPosition(w.startUtc), at16 = solarPosition(w.endUtc)
    expect((at10.azimuth + 180) % 360).toBeCloseTo(306, -0.3) // within about 1°
    expect(Math.abs((at16.azimuth + 180) % 360 - 52)).toBeLessThan(1.5)
    expect(at10.altitude).toBeGreaterThan(25)
    expect(at10.altitude).toBeLessThan(29)
    // Noon height on 22 Sep: about 90° − 49.28° + a small declination.
    const noon = Math.max(...instants(w, 5).map((t) => solarPosition(t).altitude))
    expect(noon).toBeGreaterThan(40.4)
    expect(noon).toBeLessThan(41.4)
  })

  it('keeps BC on UTC-7 all year from 8 Mar 2026, and on the old switch dates before', () => {
    expect(bcUtcOffset(Date.UTC(2025, 6, 1))).toBe(-7)
    expect(bcUtcOffset(Date.UTC(2025, 11, 1))).toBe(-8)
    expect(bcUtcOffset(Date.UTC(2026, 0, 15))).toBe(-8)
    expect(bcUtcOffset(Date.UTC(2026, 2, 8, 9))).toBe(-8)
    expect(bcUtcOffset(Date.UTC(2026, 2, 8, 11))).toBe(-7)
    expect(bcUtcOffset(Date.UTC(2026, 10, 11, 18))).toBe(-7)
    expect(bcClock(2026, 12, 21, 12)).toBe(Date.UTC(2026, 11, 21, 19))
  })

  it('turns each rule window into explicit UTC instants', () => {
    expect(studyWindow('equinox').startUtc).toBe(Date.UTC(2026, 8, 22, 17))
    expect(studyWindow('equinox').endUtc).toBe(Date.UTC(2026, 8, 22, 23))
    expect(studyWindow('robson').endUtc).toBe(Date.UTC(2026, 8, 22, 22))
    expect(studyWindow('cenotaphA').startUtc).toBe(Date.UTC(2026, 10, 11, 18))
    expect(studyWindow('cenotaphB').startUtc).toBe(Date.UTC(2026, 10, 11, 17))
    expect(instants(studyWindow('equinox'), 15)).toHaveLength(25) // the Detailed study's 25 intervals (5.2.1)
    expect(instants(studyWindow('equinox'), 120)).toHaveLength(4) // the Basic study's 10, 12, 14, 16 (5.1.1)
    expect(dayWindow(6, 21).offsetH).toBe(-7)
  })

  it('rotates the sun into a model frame whose north is turned', () => {
    const south = { azimuth: 180, altitude: 45 }
    const [x, y, z] = sunDirection(south, 0)
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(-Math.SQRT1_2); expect(z).toBeCloseTo(Math.SQRT1_2)
    const [x2, y2] = sunDirection(south, 45) // VTC: true north is 45° clockwise from +Y
    expect(x2).toBeCloseTo(-0.5); expect(y2).toBeCloseTo(-0.5)
  })
})

describe('ground shadows', () => {
  const box = (cx: number, cy: number, w: number, h: number, z0 = 0): Occluders => ({
    prisms: [{ ring: [[cx - w / 2, cy - w / 2], [cx + w / 2, cy - w / 2], [cx + w / 2, cy + w / 2], [cx - w / 2, cy + w / 2]], z0, z1: h }], tris: [],
  })
  const g = gridOver(-50, -50, 50, 200, 1)
  const at = (m: Uint8Array, x: number, y: number) => m[Math.floor(y - g.y0) * g.nx + Math.floor(x - g.x0)]
  const fromSouth45: [number, number, number] = [0, -Math.SQRT1_2, Math.SQRT1_2]

  it('casts a 100 m box\'s shadow 100 m north under a 45° southern sun', () => {
    const m = shadowMask(box(0, 0, 10, 100), g, fromSouth45)
    expect(at(m, 0, 50)).toBe(1)
    expect(at(m, 0, 104)).toBe(1)
    expect(at(m, 0, 106)).toBe(0)
    expect(at(m, 0, -8)).toBe(0)
    expect(at(m, 20, 50)).toBe(0)
  })

  it('lifts the shadow of a floating mass off the ground below it', () => {
    const m = shadowMask(box(0, 0, 10, 100, 60), g, fromSouth45)
    expect(at(m, 0, 30)).toBe(0) // under the gap
    expect(at(m, 0, 80)).toBe(1)
  })

  it('fills polygons by cell centre and measures rings', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const m = polygonMask([sq], g)
    expect(m.reduce((s, v) => s + v, 0)).toBe(100)
    expect(ringArea(sq)).toBe(100)
    expect(footprintMask(box(0, 0, 10, 100), g).reduce((s, v) => s + v, 0)).toBe(100)
  })

  it('casts triangles too', () => {
    const tri: Occluders = { prisms: [], tris: [-5, 0, 0, 5, 0, 0, 0, 0, 50] } // a vertical triangle, apex 50 m up
    const m = shadowMask(tri, g, fromSouth45)
    expect(at(m, 0, 40)).toBe(1)
    expect(at(m, 0, 55)).toBe(0)
  })
})
