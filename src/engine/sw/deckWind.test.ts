import { describe, expect, it } from 'vitest'
import type { ClimatePayload } from './types'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import { BINS, CRITERIA, classOf, deckHours, exceeded, freeStream, powerRatio, readSeasons, speedRatio, type Exposure } from './deckWind'
import { computeSw } from '../../lib/swRun'
import { SW_DEFAULTS } from '../../lib/swStudy'
import type { SwInputs } from '../../lib/swInputs'
import type { Tower } from '../types'

const C = climateJson as unknown as ClimatePayload
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** A typical year with every hour from one direction at one speed, or speeds set by hour. */
const flat = (wd: number, ws: (k: number) => number): ClimatePayload => ({ ...C, days: DAYS, hourly: { ...C.hourly, wd: Array.from({ length: 8760 }, () => wd), ws: Array.from({ length: 8760 }, (_, k) => ws(k)) } })
const ALL_OPEN: Exposure[] = Array(8).fill('open'), ALL_ROUGH: Exposure[] = Array(8).fill('rough')
const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 300, f2f: 4, podiumHeight: 0, podiumWidth: 60, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, ...patch,
})

describe('deck wind: the profile (R5 §1.2)', () => {
  it('rough terrain reproduces the NBC Commentary sample CeH = 1.9 at 183 m', () => {
    expect(speedRatio(183, 'rough') ** 2).toBeCloseTo(1.9, 1)
  })
  it('over rough fetch it reads 0.666 of the earlier power law at every height (R5: about 1.5 times too high before)', () => {
    for (const z of [30, 100, 171, 250]) expect(speedRatio(z, 'rough') / powerRatio(z)).toBeCloseTo(0.666, 2)
  })
  it('open terrain is the reference at 10 m and is capped at Ce 2.5', () => {
    expect(speedRatio(10, 'open')).toBeCloseTo(1, 6)
    expect(speedRatio(5, 'open')).toBeCloseTo(1, 6)
    expect(speedRatio(1e5, 'open') ** 2).toBeCloseTo(2.5, 6)
    expect(speedRatio(5, 'rough') ** 2).toBeCloseTo(0.5, 6)
  })
})

describe('deck wind: exceedance statistics from the hourly record (R5 §1.5)', () => {
  it('counts comfort hours 06:00–23:00 only, by season', () => {
    const H = deckHours(flat(270, () => 5))
    expect(H.comfort.year.n).toBe(365 * 17)
    expect(H.all.n).toBe(8760)
    expect(H.comfort.winter.n + H.comfort.spring.n + H.comfort.summer.n + H.comfort.fall.n).toBe(365 * 17)
    expect(H.comfort.winter.n).toBe((31 + 31 + 28) * 17)
  })
  it('a steady wind is its own 5%-exceedance speed, scaled by the profile of its sector', () => {
    const H = deckHours(flat(270, () => 5))
    expect(exceeded(H.comfort.year, freeStream(10, { exposure: ALL_OPEN, profile: 'nbc' }), 0.05)).toBeCloseTo(5, 3)
    expect(exceeded(H.comfort.year, freeStream(100, { exposure: ALL_OPEN, profile: 'nbc' }), 0.05)).toBeCloseTo(5 * Math.sqrt(10 ** 0.28), 3)
    // west rough, the rest open: only the west bin moves
    const westRough: Exposure[] = ['open', 'open', 'open', 'open', 'open', 'open', 'rough', 'open']
    expect(exceeded(H.comfort.year, freeStream(100, { exposure: westRough, profile: 'nbc' }), 0.05)).toBeCloseTo(5 * speedRatio(100, 'rough'), 3)
  })
  it('the 5% speed of a ramp of hourly speeds sits at its 95th percentile', () => {
    // comfort hours carry speeds 0..16 m/s by the hour of day, the same every day
    const H = deckHours(flat(180, (k) => k % 24))
    const f = new Float32Array(BINS).fill(1)
    const v = exceeded(H.comfort.year, f, 0.05)
    // comfort hours start 6..22: speeds 6..22, 17 values; 5% of 17 = 0.85 hours a day may exceed → the top value, 22
    expect(v).toBeCloseTo(22, 2)
    // 20% of 17 = 3.4 hours a day: 20, 21 and 22 exceed 19
    expect(exceeded(H.comfort.year, f, 0.2)).toBeCloseTo(19, 2)
  })
  it('on the CWEC record the 5% speed is about twice the comfort-hour mean (R5: about 1.95 for Rayleigh speeds)', () => {
    const H = deckHours(C)
    const f = new Float32Array(BINS).fill(1)
    let s = 0
    for (const a of H.comfort.year.byBin) for (const v of a) s += v
    const mean = s / H.comfort.year.n, p95 = exceeded(H.comfort.year, f, 0.05)
    expect(p95 / mean).toBeGreaterThan(1.6); expect(p95 / mean).toBeLessThan(2.4)
  })
  it('scales linearly: all-rough reads the all-open speed times the ratio of the profiles', () => {
    const H = deckHours(C)
    const o = readSeasons(H, freeStream(171, { exposure: ALL_OPEN, profile: 'nbc' }), CRITERIA.london2019)
    const r = readSeasons(H, freeStream(171, { exposure: ALL_ROUGH, profile: 'nbc' }), CRITERIA.london2019)
    expect(r.seasons.year.v / o.seasons.year.v).toBeCloseTo(speedRatio(171, 'rough') / speedRatio(171, 'open'), 2)
    expect(r.cls).toBeLessThanOrEqual(o.cls)
  })
  it('classes: London 2019 limits 2.5 / 4 / 6 / 8 and Toronto 2022 10 / 15 / 20 km/h', () => {
    expect(classOf(CRITERIA.london2019, 2.5)).toBe(0); expect(classOf(CRITERIA.london2019, 3.9)).toBe(1); expect(classOf(CRITERIA.london2019, 8.1)).toBe(4)
    expect(classOf(CRITERIA.toronto2022, 2.7)).toBe(0); expect(classOf(CRITERIA.toronto2022, 4.1)).toBe(1); expect(classOf(CRITERIA.toronto2022, 6)).toBe(3)
  })
  it('the worst season is the windiest one', () => {
    // winter (Dec–Feb) at 8 m/s, the rest at 2 m/s
    const ends = [31, 59, 334]
    const H = deckHours(flat(270, (k) => { const d = Math.floor(k / 24) + 1; return d <= ends[1] || d > ends[2] ? 8 : 2 }))
    const r = readSeasons(H, freeStream(10, { exposure: ALL_OPEN, profile: 'nbc' }), CRITERIA.london2019)
    expect(r.worst).toBe('winter'); expect(r.v).toBeCloseTo(8, 3); expect(r.seasons.summer.v).toBeCloseTo(2, 3)
  })
})

describe('the "Windiest deck" line after the fix', () => {
  const inp = (t: Tower): SwInputs => ({ project: 'city', towers: [t], north: 0, site: null, context: [], ctxBlocks: [], C })
  it('keeps its id, reads the 5% speed with NBC exposure and shows the earlier reading beside it', async () => {
    const out = await computeSw('built.sw-wind-height', inp(tower()), SW_DEFAULTS)
    const deck = out.rules.find((r) => r.id === 'sw-wind-deck')!
    expect(deck).toBeTruthy()
    expect(deck.value).toMatch(/m\/s at 300 m/)
    expect(deck.note).toMatch(/Earlier reading/)
    expect(deck.threshold).toMatch(/occasional sitting/)
    const rows = (out.data as { rows: { z: number; u: number; uOld: number }[] }).rows
    const top = rows.find((r) => Math.round(r.z) === 300)!
    // the earlier mean is about half the 5% speed on open fetch; the NBC profile pulls it back down
    expect(top.u).toBeGreaterThan(top.uOld)
    expect(top.u).toBeLessThan(top.uOld * 1.95)
  })
  it('the profile switch brings back the power law', async () => {
    const a = await computeSw('built.sw-wind-height', inp(tower()), SW_DEFAULTS)
    const b = await computeSw('built.sw-wind-height', inp(tower()), { ...SW_DEFAULTS, deckProfile: 'power' })
    const ua = (a.data as { rows: { u: number }[] }).rows.at(-1)!.u, ub = (b.data as { rows: { u: number }[] }).rows.at(-1)!.u
    expect(ub).toBeGreaterThan(ua)
  })
})
