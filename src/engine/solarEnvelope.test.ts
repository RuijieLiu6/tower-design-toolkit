import { describe, expect, it } from 'vitest'
import { instants, solarPosition, studyWindow } from './solar'
import { MISSING_SPACES, cenotaphSpace, table1Spaces } from './solarCity'
import { envelopeUnder, rayToRings, solarEnvelope, type EnvSpace } from './solarEnvelope'
import { RULES } from './solarRules'
import type { Pt } from './shadow'

const sq = (cx: number, cy: number, s: number): Pt[] => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]]
const win = studyWindow('equinox')
// A 40 m park centred 100 m north of the origin (city frame: +y is north).
const park: EnvSpace = { id: 'p', name: 'Test park', rings: [sq(0, 100, 40)], z: 0, win }

describe('ray to a space', () => {
  it('finds the first edge, zero inside and nothing when facing away', () => {
    expect(rayToRings([0, 0], [0, 1], park.rings)).toBeCloseTo(80, 6)
    expect(rayToRings([0, 100], [0, 1], park.rings)).toBe(0)
    expect(rayToRings([0, 0], [0, -1], park.rings)).toBe(Infinity)
  })
})

describe('solar envelope', () => {
  const env = solarEnvelope([park], { x0: -20, y0: -60, x1: 20, y1: 60 }, { cell: 10, base: 0, northDeg: 0 })
  const at = (x: number, y: number) => env.h[Math.floor((y - env.y0) / env.cell) * env.nx + Math.floor((x - env.x0) / env.cell)]
  it('is zero inside the park and rises with distance to its south', () => {
    expect(at(5, 55)).toBeLessThan(at(5, -55)) // nearer the park: lower
    for (let j = 1; j < env.ny; j++) expect(env.h[j * env.nx + 2]).toBeLessThanOrEqual(env.h[(j - 1) * env.nx + 2] + 1e-6)
  })
  it('never lets a column reach the park at any 15-minute instant', () => {
    const p: Pt = [5, -55], h = at(5, -55)
    for (const utc of instants(win, 15)) {
      const s = solarPosition(utc)
      if (s.altitude <= 0.5) continue
      const len = h / Math.tan((s.altitude * Math.PI) / 180) // shadow length of the column top
      const az = (s.azimuth * Math.PI) / 180, u: Pt = [-Math.sin(az), -Math.cos(az)]
      expect(rayToRings(p, u, park.rings)).toBeGreaterThanOrEqual(len - 0.5)
    }
  })
  it('a site standing higher than the park gets a lower envelope', () => {
    const high = solarEnvelope([park], { x0: -20, y0: -60, x1: 20, y1: 60 }, { cell: 10, base: 10, northDeg: 0 })
    expect(high.h[2]).toBeCloseTo(Math.max(0, env.h[2] - 10), 4)
  })
  it('reports how much of a footprint a tower pokes through', () => {
    const fp = sq(0, -40, 20)
    const low = envelopeUnder(env, fp, 1), tall = envelopeUnder(env, fp, 400)
    expect(low.share).toBe(0)
    expect(tall.share).toBe(1)
    expect(tall.by).toBe('Test park')
    expect(tall.min).toBeGreaterThan(0)
  })
})

describe('rest-of-city spaces', () => {
  const all = table1Spaces()
  it('adds the four Table-1 school sites from City parcels, as school sites under 3.1.1', () => {
    const schools = all.filter((s) => s.t1?.cls === 'School Site')
    expect(schools.map((s) => s.name).sort()).toEqual(['Elsie Roy Elementary', 'King George Secondary', 'Lord Roberts Annex', 'Lord Roberts Elementary'])
    expect(MISSING_SPACES.some((m) => m.cls === 'School Site')).toBe(false)
  })
  it('adds the Davie and Robson Village north sidewalks under 3.3.1 with their own windows', () => {
    const davie = all.find((s) => s.rule === 'davie')!, robson = all.find((s) => s.rule === 'robson')!
    expect(davie.rings.length).toBeGreaterThan(0)
    expect(RULES[davie.rule!].window).toBe('equinox')
    expect(RULES[robson.rule!].window).toBe('robson')
    expect(davie.t1).toBeNull()
  })
  it('keeps the plazas without a City outline listed as missing, and the cenotaph out of the judged spaces', () => {
    expect(MISSING_SPACES.map((m) => m.name)).toContain('Jack Poole Plaza')
    expect(cenotaphSpace()?.name).toMatch(/Cenotaph/)
    expect(all.some((s) => /Cenotaph/.test(s.name))).toBe(false)
  })
})
