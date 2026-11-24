import { describe, expect, it } from 'vitest'
import { partFrameAt, rippleAt, scaleAt, scaleLawIssues, scalePeak, swellLaw, type ScaleLaw } from './scaleLaw'
import { formBlocks } from './towerForms'

describe('scale law (G78)', () => {
  const swell = swellLaw(0.5, 1.3, 0.9)

  it('passes through its points and peaks where asked, with no overshoot', () => {
    expect(scaleAt(swell, 0)).toBeCloseTo(1, 9)
    expect(scaleAt(swell, 0.5)).toBeCloseTo(1.3, 9)
    expect(scaleAt(swell, 1)).toBeCloseTo(0.9, 9)
    const pk = scalePeak(swell)
    expect(pk.t).toBeCloseTo(0.5, 2)
    expect(pk.scale).toBeCloseTo(1.3, 6)
    for (let k = 0; k <= 200; k++) expect(scaleAt(swell, k / 200)).toBeLessThanOrEqual(1.3 + 1e-9)
  })

  it('is smooth at the peak (zero slope, no kink) and rises then falls', () => {
    const e = 1e-4
    expect(Math.abs(scaleAt(swell, 0.5 + e) - scaleAt(swell, 0.5 - e)) / (2 * e)).toBeLessThan(1e-3)
    expect(scaleAt(swell, 0.25)).toBeGreaterThan(1)
    expect(scaleAt(swell, 0.25)).toBeLessThan(1.3)
    expect(scaleAt(swell, 0.75)).toBeGreaterThan(0.9)
    let up = true
    for (let k = 1; k <= 100; k++) { const a = scaleAt(swell, (k - 1) / 100), b = scaleAt(swell, k / 100); if (k <= 50) up = up && b >= a - 1e-12; else expect(b).toBeLessThanOrEqual(a + 1e-12) }
    expect(up).toBe(true)
  })

  it('linear curve is a polyline; points out of order or as pairs read the same', () => {
    const lin: ScaleLaw = { points: [[1, 0.9], [0, 1], [0.5, 1.3]], curve: 'linear' }
    expect(scaleAt(lin, 0.25)).toBeCloseTo(1.15, 9)
    expect(scaleAt(lin, 0.75)).toBeCloseTo(1.1, 9)
    expect(scaleAt({ points: [{ t: 0.2, scale: 1.1 }] }, 0.9)).toBe(1.1)
  })

  it('flags unusable laws', () => {
    expect(scaleLawIssues(swell)).toEqual([])
    expect(scaleLawIssues({ points: [] })).toHaveLength(1)
    expect(scaleLawIssues({ points: [[1.5, 1]] }).join()).toMatch(/outside/)
    expect(scaleLawIssues({ points: [[0.5, 0]] }).join()).toMatch(/above 0/)
  })
})

describe('partFrameAt (the free-form slicer frame)', () => {
  it('reproduces the scaleTop/scaleProfile/steps/twist/lean rule exactly when no law is given', () => {
    const p = { z0: 10, z1: 110, scaleTop: 0.7, scaleProfile: 1.4, steps: [{ z: 80, scale: 0.9 }], rotation: 5, twist: 40, centre: [3, 4] as [number, number], lean: [2, -6] as [number, number] }
    for (const z of [10, 33, 79.9, 80, 105, 110]) {
      const t = (z - 10) / 100
      let k = 1 - 0.3 * t ** 1.4
      if (z >= 80) k *= 0.9
      const f = partFrameAt(p, z)
      expect(f.k).toBeCloseTo(k, 12)
      expect(f.rot).toBeCloseTo(5 + 40 * t, 12)
      expect(f.centre[0]).toBeCloseTo(3 + 2 * t, 12)
      expect(f.centre[1]).toBeCloseTo(4 - 6 * t, 12)
    }
  })

  it('uses the law in place of scaleTop, with steps still on top', () => {
    const p = { z0: 16, z1: 296, scaleTop: 0.5, scaleLaw: swellLaw(0.5, 1.3, 0.9), steps: [{ z: 290, scale: 0.7 }] }
    expect(partFrameAt(p, 156).k).toBeCloseTo(1.3, 9)
    expect(partFrameAt(p, 296).k).toBeCloseTo(0.9 * 0.7, 9)
  })

  it('ripple (G85): storeys turn alternately +deg and −deg at mid-height with a two-storey wavelength and phase 0', () => {
    const r = { deg: 15, wavelength: 8, phase: 90 }
    // storeys of 4 m from z0 = 16: mid-heights 18, 22, 26 …; with phase 90° the mid-heights fall on the zeros
    const offs = [18, 22, 26, 30].map((z) => rippleAt(r, z, 16))
    expect(Math.abs(offs[0])).toBeLessThan(1e-9) // a 90° phase on a 2 m offset lands on zero: the phase is the designer's
    const r2 = { deg: 15, wavelength: 8, phase: 0 }
    const o2 = [18, 22, 26, 30].map((z) => rippleAt(r2, z, 16))
    expect(o2[0]).toBeCloseTo(15, 9)
    expect(o2[1]).toBeCloseTo(-15, 9)
    expect(o2[2]).toBeCloseTo(15, 9)
    expect(partFrameAt({ z0: 16, z1: 56, rotation: 10, ripple: r2 }, 22).rot).toBeCloseTo(-5, 9)
    expect(rippleAt(null, 30, 0)).toBe(0)
  })
})

describe('Swelling shaft form', () => {
  it('widens to its peak part-way up and narrows to the top scale, as one curve of storeys', () => {
    const bl = formBlocks('swell', { swellAt: 0.5, swellScale: 1.3, swellTop: 0.9, swellTwist: 0 }, { w: 40, d: 30, h: 240, f2f: 4 })
    const widest = bl.reduce((a, b) => (b.width > a.width ? b : a))
    const i = bl.indexOf(widest)
    expect(i).toBeGreaterThan(bl.length * 0.35)
    expect(i).toBeLessThan(bl.length * 0.65)
    expect(widest.width).toBeGreaterThan(40 * 1.28)
    expect(bl[0].width).toBeLessThan(41)
    expect(bl[bl.length - 1].width).toBeLessThan(40 * 0.95)
    expect(bl.reduce((a, b) => a + b.height, 0)).toBeCloseTo(240, 6)
  })
  it('twists when asked', () => {
    const bl = formBlocks('swell', { swellTwist: 90 }, { w: 40, d: 30, h: 120, f2f: 4 })
    expect(bl[bl.length - 1].rotation).toBeGreaterThan(80)
  })
})
