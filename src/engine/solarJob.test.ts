import { existsSync, readFileSync } from 'node:fs'
import { table1Spaces } from './solarCity'
import { describe, expect, it } from 'vitest'
import type { VtcContext } from '../context'
import type { CityInput } from './solarCity'
import { runSolarJob } from './solarJob'
import type { Tower } from './types'

// The competition model is local-only (never published); this test runs where it exists.
const file = new URL('../../public/local/vtc_context.json', import.meta.url)
const ctx: VtcContext | null = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null

const tower: Tower = {
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2, podiumHeight: 18, podiumWidth: 100, podiumDepth: 64,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: false, skyLobbies: [],
}

describe('solar job on the VTC model', () => {
  it.skipIf(!ctx)('tests every public space of the model and maps sun hours, fast enough for a worker', { timeout: 60000 }, () => {
    const first = runSolarJob({ project: 'vtc', towers: [tower], ctx, ctxKey: 'test', readings: {}, mapDate: 'equinox' })
    // Moving the tower reuses the baseline masks.
    const out = runSolarJob({ project: 'vtc', towers: [{ ...tower, x: 0 }], ctx, ctxKey: 'test', readings: {}, mapDate: 'equinox' })
    const fresh = runSolarJob({ project: 'vtc', towers: [{ ...tower, x: 0 }], ctx, readings: {}, mapDate: 'equinox' })
    expect(out.spaces.map((s) => s.swept)).toEqual(fresh.spaces.map((s) => s.swept))
    expect(Array.from(out.map!.proposal)).toEqual(Array.from(fresh.map!.proposal))
    // eslint-disable-next-line no-console
    console.log(`solar job: first ${first.ms} ms, cached ${out.ms} ms, uncached ${fresh.ms} ms`)
    expect(out.spaces.length).toBe(ctx!.plazas.length + ctx!.midblock.length)
    expect(out.spaces.every((s) => !s.inTable1 && s.reading === 'unresolved' && s.state === 'unknown')).toBe(true)
    expect(out.map!.possible).toBeCloseTo(6)
    expect(out.lines.find((l) => l.id === 'solar-hours')).toBeTruthy()
    expect(out.ms).toBeLessThan(8000)
    // eslint-disable-next-line no-console
    console.log(`solar job: ${out.ms} ms; ${out.spaces.map((s) => `${s.name} ${Math.round(s.swept)} m² (${s.firstNew ?? '-'}–${s.lastNew ?? '-'})`).join('; ')}`)
  })

  it('runs without the city layers (Real Vancouver, still loading)', () => {
    const out = runSolarJob({ project: 'city', towers: [{ ...tower, x: 2500, y: 2500 }], ctx: null, readings: {}, mapDate: 'dec21', half: 300, cell: 10 })
    expect(out.spaces).toHaveLength(0) // far from every Table-1 space
    expect(out.centre).toEqual([2500, 2500])
    expect(out.lines.find((l) => l.id === 'solar-table1')?.value).toMatch(/loading/)
  })
})

describe('solar job in Real Vancouver', () => {
  // Cathedral Square (Table 1: Urban Plaza, 3.2.1) sits near local (431, 266); a 150 m tower 150 m to its south-east
  // throws its 10:00 shadow (bearing 306°) across it.
  const t: Tower = { ...tower, x: 431 + 0.809 * 150, y: 266 - 0.588 * 150, width: 30, depth: 30, height: 150, podiumHeight: 0 }
  const square = (cx: number, cy: number, s: number): [number, number][] => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]]
  const empty: CityInput = { buildings: [], unknown: [], terrain: null }

  it('tests the Table-1 spaces in reach under their own clause, and says why the rest are not tested', () => {
    const out = runSolarJob({ project: 'city', towers: [t], ctx: null, city: { ...empty, unknown: [[500, 200], [5000, 5000]] }, groundElevation: 20, readings: {}, mapDate: 'equinox', half: 300, cell: 10 })
    const cathedral = out.spaces.find((s) => s.name === 'Cathedral Square')!
    expect(cathedral.inTable1).toBe(true)
    expect(cathedral.reading).toBe('minimise') // 3.2.1: report, no pass/fail
    expect(cathedral.state).toBe('unknown')
    expect(cathedral.swept).toBeGreaterThan(0)
    expect(cathedral.z).toBe(20) // no terrain: tested at the tower base
    const line = out.lines.find((l) => l.id === `solar-space-${cathedral.id}`)!
    expect(line.source.page).toBe('s.3.2.1, p.5')
    expect(line.flag).toBe('unverified')
    const t1 = out.lines.find((l) => l.id === 'solar-table1')!
    expect(t1.value).toMatch(new RegExp(`^${out.spaces.length} within shadow reach and tested; ${table1Spaces().length - out.spaces.length} beyond reach`))
    expect(t1.note).toMatch(/Jack Poole Plaza/) // no polygon in the parks data: listed, not tested
    expect(out.lines.find((l) => l.id === 'solar-baseline')!.value).toMatch(/0 buildings with LiDAR heights; 1 nearby footprints without a height/)
  })

  it('counts only new shadow against buildings with LiDAR heights, and never gives an unknown building a height', () => {
    const same = runSolarJob({ project: 'city', towers: [t], ctx: null, city: { ...empty, buildings: [{ ring: square(t.x, t.y, 30), ground: 20, roof: 170 }] }, groundElevation: 20, readings: {}, mapDate: 'equinox', half: 300, cell: 10 })
    expect(same.spaces.find((s) => s.name === 'Cathedral Square')!.swept).toBe(0) // an existing twin already shades it
    const unknown = runSolarJob({ project: 'city', towers: [t], ctx: null, city: { ...empty, unknown: [[t.x, t.y]] }, groundElevation: 20, readings: {}, mapDate: 'equinox', half: 300, cell: 10 })
    expect(unknown.spaces.find((s) => s.name === 'Cathedral Square')!.swept).toBeGreaterThan(0)
  })

  it('tests a space at its own elevation: a space 60 m above the tower base gets less of its shadow', () => {
    const flat = runSolarJob({ project: 'city', towers: [t], ctx: null, city: empty, groundElevation: 20, readings: {}, mapDate: 'equinox', half: 300, cell: 10 })
    const terrain = { cols: 3, rows: 3, step: 1000, x0: -500, y0: -500, z: new Float32Array(9).fill(80) }
    const raised = runSolarJob({ project: 'city', towers: [t], ctx: null, city: { ...empty, terrain }, groundElevation: 20, readings: {}, mapDate: 'equinox', half: 300, cell: 10 })
    const a = flat.spaces.find((s) => s.name === 'Cathedral Square')!, b = raised.spaces.find((s) => s.name === 'Cathedral Square')
    expect(b ? b.swept : 0).toBeLessThan(a.swept)
    expect(raised.mapTerrain?.z[0]).toBe(80)
  })
})
