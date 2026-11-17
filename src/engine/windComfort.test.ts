// The port of Sinnie Choi's wind engine against her own outputs: src/engine/windComfort.fixtures.json was recorded from
// her code (tools/sunwind-fixtures.cjs, study.js + core.js at c24addb) on her competition-site model; the port must give
// the same comfort-band areas, plaza readings, downwash zone and ratio fields. The annual cases take a few seconds each
// (eight sectors, two or three flows per sector), as they do in her app.
import { describe, expect, it } from 'vitest'
import fixtures from './windComfort.fixtures.json'
import { lawsonBand, maskFromSparse, periodInfo, rasterFromSparse, roseFor, runWind, summarise, windProfile, windStudy, type SiteBuilding, type WindStrategy, type WindTower } from './windComfort'

type Sample = { idx: number[]; vals: number[]; sum: number; max: number }
type Summary = { cats: number[]; catsB: number[]; worse: number; better: number; maxS: number; plazaWorst: number; plazaMean: number }
type Zone = { depth: number; half: number; amp: number; amp0: number; hn: number; note: string[] } | null
type Raster = { cs: number; nx: number; ny: number; H: number[]; bld: SiteBuilding[]; plaza: number[] }
type Case = {
  id: string; mode: 'one' | 'annual'; tower: WindTower; future: boolean; dir?: number; speed?: number; period?: { from: string; to: string }
  strat: WindStrategy | null; raster: string
  expected: Summary & { zone: Zone; solidA?: number; solidB?: number; ratioA?: Sample; ratioB?: Sample; vsBase?: Summary & { plazaMean0: number }; gusty?: number; gustyB?: number; sectors?: (Summary & { name: string; f: number; s: number })[]; meanA?: Sample; meanB?: Sample }
}
const FX = fixtures as unknown as { rasters: Record<string, Raster>; cases: Case[] }

const rasterOf = (key: string) => { const r = FX.rasters[key]; return { sr: rasterFromSparse(r.cs, r.nx, r.ny, r.H, r.bld), plaza: maskFromSparse(r.nx, r.ny, r.plaza) } }
const expectSummary = (got: Summary, exp: Summary) => {
  expect(got.cats).toEqual(exp.cats)
  expect(got.catsB).toEqual(exp.catsB)
  expect(got.worse).toBe(exp.worse)
  expect(got.better).toBe(exp.better)
  expect(got.maxS).toBeCloseTo(exp.maxS, 2)
  expect(got.plazaWorst).toBeCloseTo(exp.plazaWorst, 2)
  expect(got.plazaMean).toBeCloseTo(exp.plazaMean, 2)
}
const expectSample = (arr: Float32Array, s: Sample) => {
  s.idx.forEach((k, i) => expect(arr[k]).toBeCloseTo(s.vals[i], 4))
  let sum = 0, max = 0
  for (let k = 0; k < arr.length; k++) { sum += arr[k]; if (arr[k] > max) max = arr[k] }
  expect(sum).toBeCloseTo(s.sum, 1)
  expect(max).toBeCloseTo(s.max, 4)
}

describe('wind comfort: the port reproduces Sun & Wind Studio', () => {
  it('Lawson bands and the wind profile are hers', () => {
    expect([2.5, 4, 6, 8, 8.01].map(lawsonBand)).toEqual([0, 1, 2, 3, 4])
    const p = windProfile(4.5, 285)
    expect(p.map((x) => x.z)).toEqual([10, 30, 60, 100, 150, 200, 250, 285])
    expect(p[0]).toEqual({ z: 10, U: 4.5, gust: 8.1, q: 0.613 * 4.5 * 4.5 })
    expect(p[7].U).toBeCloseTo(4.5 * Math.pow(28.5, 0.25), 6)
  })

  it('the whole-year and winter roses match the recorded sectors', () => {
    for (const c of FX.cases.filter((c) => c.mode === 'annual')) {
      const rs = roseFor(periodInfo(c.period!))
      const exp = (c as unknown as { rose: { dir: number; name: string; f: number; s: number }[] }).rose
      rs.forEach((r, i) => { expect(r.name).toBe(exp[i].name); expect(r.f).toBeCloseTo(exp[i].f, 6); expect(r.s).toBeCloseTo(exp[i].s, 6) })
      expect(rs.reduce((s, r) => s + r.f, 0)).toBeCloseTo(1, 3) // her monthly roses sum to 1 within rounding
    }
    expect(periodInfo({ from: '12-01', to: '02-28' })).toMatchObject({ days: 90, full: false })
    expect(periodInfo({ from: '01-01', to: '12-31' }).full).toBe(true)
  })

  for (const c of FX.cases.filter((c) => c.mode === 'one')) {
    it(`one case ${c.id}: wind from ${c.dir}° at ${c.speed} m/s${c.strat ? ' with strategies' : ''}`, () => {
      const { sr, plaza } = rasterOf(c.raster)
      const a = runWind(sr, c.tower, true, c.dir!, c.strat, plaza), b = runWind(sr, null, false, c.dir!, null, plaza)
      expect(a.solid.reduce((p, x) => p + x, 0)).toBe(c.expected.solidA)
      expect(b.solid.reduce((p, x) => p + x, 0)).toBe(c.expected.solidB)
      expectSample(a.ratio, c.expected.ratioA!)
      expectSample(b.ratio, c.expected.ratioB!)
      expectSummary(summarise(a, b, c.speed!, plaza), c.expected)
      if (c.expected.zone) { const z = a.zone!; expect(z.depth).toBeCloseTo(c.expected.zone.depth, 2); expect(z.half).toBeCloseTo(c.expected.zone.half, 2); expect(z.amp).toBeCloseTo(c.expected.zone.amp, 2); expect(z.amp0).toBeCloseTo(c.expected.zone.amp0, 2); expect(z.hn).toBeCloseTo(c.expected.zone.hn, 2); expect(z.note).toEqual(c.expected.zone.note) }
      const study = windStudy(sr, c.tower, plaza, { annual: false, dir: c.dir!, speed: c.speed!, period: { from: '01-01', to: '12-31' }, strat: c.strat })
      expectSummary(study, c.expected)
      if (c.expected.vsBase) { expectSummary(study.vsBase!, c.expected.vsBase); expect(study.vsBase!.plazaMean0).toBeCloseTo(c.expected.vsBase.plazaMean0, 2) }
      else expect(study.vsBase).toBeNull()
    }, 60_000)
  }

  for (const c of FX.cases.filter((c) => c.mode === 'annual')) {
    it(`annual ${c.id}: eight sectors of the ${c.period!.from}–${c.period!.to} rose`, () => {
      const { sr, plaza } = rasterOf(c.raster)
      const study = windStudy(sr, c.tower, plaza, { annual: true, dir: 0, speed: 0, period: c.period!, strat: c.strat })
      expectSummary(study, c.expected)
      expect(study.gusty).toBe(c.expected.gusty)
      expect(study.gustyB).toBe(c.expected.gustyB)
      expect(study.sectors).toHaveLength(8)
      study.sectors.forEach((s, i) => { const e = c.expected.sectors![i]; expect(s.name).toBe(e.name); expectSummary(s, e) })
      expectSample(study.a.ratio, c.expected.meanA!)
      expectSample(study.b.ratio, c.expected.meanB!)
      const z = study.a.zone!, ez = c.expected.zone!
      expect(z.amp).toBeCloseTo(ez.amp, 2); expect(z.hn).toBeCloseTo(ez.hn, 2)
    }, 120_000)
  }
})
