import { describe, expect, it } from 'vitest'
import type { Tower } from './types'
import { DEFAULT_WIND_SCREEN, YVR_ROSE, projectedWidth, sectorStats, strongSectors, upwind, upwindMax, windScreen, type WindRose } from './windScreen'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.6 }, { use: 'residential', share: 0.4 }], coreShare: 0.25, plantEvery: 0,
}
const noPodium: Tower = { ...vtc, podiumHeight: 0 }
/** A rose where every strong hour comes from one sector (k), at 30-39 km/h. */
const oneSector = (k: number): WindRose => {
  const bins = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0])
  bins[k] = [20, 20, 10, 10, 0]
  return { ...YVR_ROSE, rose: { 'year.comfort': { hours: 100, calm: 40, variable: 0, bins } } }
}
const square = (cx: number, cy: number, s: number): [number, number][] => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]]
const run = (towers: Tower[], k = 0, extra: Partial<typeof DEFAULT_WIND_SCREEN> = {}, context: { footprint: [number, number][]; height: number }[] = []) =>
  windScreen(towers, { northDeg: 0, context, contextLoaded: true }, { ...DEFAULT_WIND_SCREEN, ...extra }, oneSector(k))

describe('wind climate (ECCC, Vancouver Intl A)', () => {
  it('keeps calms and variable hours in the denominator, so sector shares and calms add up to the whole window', () => {
    for (const season of ['year', 'winter', 'summer'] as const) {
      const b = YVR_ROSE.rose[`${season}.comfort`]
      const sum = sectorStats(YVR_ROSE, season, 30).reduce((s, x) => s + x.all, 0) + (b.calm + b.variable) / b.hours
      expect(sum).toBeCloseTo(1, 3)
    }
    expect(YVR_ROSE.years).toEqual([2016, 2025])
  })
  it('finds the strong-wind sectors from the data: westerlies first at YVR', () => {
    const s = strongSectors(sectorStats(YVR_ROSE, 'year', 30), 0.6, 4)
    expect(s[0].name).toBe('WNW')
    expect(s.map((x) => x.name)).toContain('W')
    expect(s.reduce((a, x) => a + x.share, 0)).toBeGreaterThanOrEqual(0.6)
    expect(s.length).toBeLessThanOrEqual(4)
  })
  it('takes the fewest sectors that reach the cover, capped', () => {
    const stats = [0.5, 0.3, 0.2].map((strong, k) => ({ k, name: String(k), fromDeg: k * 22.5, all: strong, strong }))
    expect(strongSectors(stats, 0.6, 4).map((x) => x.name)).toEqual(['0', '1'])
    expect(strongSectors(stats, 1, 2)).toHaveLength(2)
  })
})

describe('geometry', () => {
  it('turns a true bearing into the model frame and measures the windward width', () => {
    const u = upwind(0, 45) // north wind on the VTC site comes from model bearing 45°
    expect(u[0]).toBeCloseTo(Math.SQRT1_2, 6); expect(u[1]).toBeCloseTo(Math.SQRT1_2, 6)
    const sq = square(0, 0, 46)
    expect(projectedWidth(sq, upwind(0, 0))).toBeCloseTo(46, 6)
    expect(projectedWidth(sq, upwind(45, 0))).toBeCloseTo(46 * Math.SQRT2, 6)
  })
  it('counts only context upwind, inside the angle and the radius', () => {
    const u = upwind(0, 0)
    const ctx = [{ footprint: square(0, 200, 20), height: 150 }, { footprint: square(200, 0, 20), height: 250 }, { footprint: square(0, 900, 20), height: 300 }]
    expect(upwindMax([0, 0], u, ctx, 570)).toBe(150)
  })
})

describe('massing screen', () => {
  it('rates a 285 m tower on open ground High for downwash and corners, and says a wind study is required', () => {
    const r = windScreen([noPodium], { northDeg: 0, context: [], contextLoaded: false }, DEFAULT_WIND_SCREEN, oneSector(0))
    const s = r.towers[0].sectors[0]
    expect(r.sectors.map((x) => x.name)).toEqual(['N'])
    expect([s.downwash, s.base, s.corner]).toEqual(['high', 'high', 'high'])
    expect(r.study.required).toBe(true)
    expect(r.rules.find((x) => x.id === 'wind-study')!.value).toContain('3 of 3')
    expect(r.zones.filter((z) => z.kind === 'downwash')).toHaveLength(1)
    expect(r.zones.filter((z) => z.kind === 'corner')).toHaveLength(2)
  })
  it('places the downwash band in front of the windward face and the corner wedges off its ends', () => {
    const r = run([noPodium], 0)
    const dw = r.zones.find((z) => z.kind === 'downwash')!
    expect(Math.min(...dw.poly.map((q) => q[1]))).toBeCloseTo(23, 6) // starts at the north face
    expect(Math.max(...dw.poly.map((q) => q[1]))).toBeCloseTo(23 + 0.5 * 46, 6)
    const corners = r.zones.filter((z) => z.kind === 'corner')
    expect(corners.map((c) => Math.sign(c.poly[0][0])).sort()).toEqual([-1, 1])
    for (const c of corners) expect(Math.min(...c.poly.map((q) => q[1]))).toBeLessThan(23) // streams run downwind along the sides
  })
  it('a podium step toward the wind lowers the risk at grade by one level and lifts the band onto the podium roof', () => {
    const r = run([vtc], 0) // podium 64 deep vs tower 46: 9 m step to the north
    const s = r.towers[0].sectors[0]
    expect(s.podiumStep).toBeCloseTo(9, 6)
    expect([s.downwash, s.base]).toEqual(['high', 'medium'])
    expect(r.zones.find((z) => z.kind === 'downwash')!.z).toBe(18)
    expect(run([vtc], 0, { podiumStepMin: 10 }).towers[0].sectors[0].base).toBe('high')
  })
  it('uses the tallest upwind roof for exposure', () => {
    expect(run([noPodium], 0, {}, [{ footprint: square(0, 150, 30), height: 200 }]).towers[0].sectors[0].downwash).toBe('medium') // 1.43×
    expect(run([noPodium], 0, {}, [{ footprint: square(0, 150, 30), height: 250 }]).towers[0].sectors[0].downwash).toBe('low') // 1.14×
    expect(run([noPodium], 8, {}, [{ footprint: square(0, 150, 30), height: 250 }]).towers[0].sectors[0].downwash).toBe('high') // that roof is downwind of a south wind
  })
  it('treated corners rate Low', () => {
    expect(run([noPodium], 0, { corner: 'chamfered' }).towers[0].sectors[0].corner).toBe('low')
  })
  it('flags a gap between towers only when a strong wind runs along it, and never above Medium', () => {
    const a = { ...noPodium, id: 'a', name: 'A', x: -38 }, b = { ...noPodium, id: 'b', name: 'B', x: 38 } // 30 m clear, gap runs north-south
    const along = run([a, b], 0)
    expect(along.gaps).toHaveLength(1)
    expect(along.gaps[0].clear).toBeCloseTo(30, 6)
    expect(along.zones.filter((z) => z.kind === 'gap').every((z) => z.level === 'medium')).toBe(true)
    expect(run([a, b], 4).gaps).toHaveLength(0) // east wind crosses the gap
  })
  it('every result carries a threshold, a flag and a source, and names comfort classes without judging them', () => {
    const r = windScreen([vtc], { northDeg: 45, context: [], contextLoaded: false })
    for (const x of r.rules) { expect(x.threshold).toBeTruthy(); expect(x.flag).toBeTruthy(); expect(x.source.label).toBeTruthy() }
    expect(r.rules.find((x) => x.id === 'comfort-targets')!.state).toBe('unknown')
    expect(r.rules.some((x) => x.state === 'fail')).toBe(false)
  })
})
