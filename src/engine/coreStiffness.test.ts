// P1 #10 core stiffness (NODE_LIST row 10): the sway and across-wind lines took EI and f1 from 46/H, whatever the core
// (storeyWeight.ts gravityEccentricity, acrossWind.ts f1Empirical), and the walls were 0.6 m full height. Now the walls
// come in bands, the modelled core gives its own f1 (square tube, E from f′c, cracked, Rayleigh on the storey weights),
// and the across-wind and sway lines show that reading beside 46/H.
import { describe, expect, it } from 'vitest'
import { acrossWindAccel, ACCEL_LIMIT, f1Empirical } from './acrossWind'
import { coreLines, structureCheck } from './structure'
import { concreteE, coreStiffness, DEFAULT_WEIGHT_PRESETS, storeyWeights, tubeI, wallAt, type CoreStiffness, type StoreyWeight, type WeightPresets, type WeightResult } from './storeyWeight'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'
import { dampingOf, windProcedure } from './windStructure'

const tower = (): Tower => importedTower(stack([{ n: 75, f2f: 4, ring: rect(50, 50) }]), { podiumTop: 0, coreSide: 24 })

describe('P1 #10: the core alone', () => {
  it('a known tube gives the hand-calculated I; E follows RC2 p.381', () => {
    expect(tubeI(24, 0.6)).toBeCloseTo((24 ** 4 - 22.8 ** 4) / 12, 9)
    expect(tubeI(24, 0.6)).toBeCloseTo(5128.53, 2)
    expect(tubeI(10, 6)).toBeCloseTo(10 ** 4 / 12, 9) // walls meeting in the middle: a solid square
    expect(concreteE(60)).toBeCloseTo(33500, 9)
    expect(concreteE(70)).toBeCloseTo(33500 * (70 / 60) ** (1 / 3), 6)
  })

  it('bands the walls by thirds of the height; a full-height thickness comes back with no bands', () => {
    expect(wallAt(DEFAULT_WEIGHT_PRESETS, 10, 300)).toBe(0.95)
    expect(wallAt(DEFAULT_WEIGHT_PRESETS, 150, 300)).toBe(0.85)
    expect(wallAt(DEFAULT_WEIGHT_PRESETS, 299, 300)).toBe(0.75)
    expect(wallAt({ ...DEFAULT_WEIGHT_PRESETS, coreWallBands: null, coreWall: 0.6 }, 10, 300)).toBe(0.6)
  })

  it('Rayleigh on a uniform cantilever matches 3.516/(2π)·√(EI/(m·H⁴)) within 2%', () => {
    const H = 300, n = 100, W = 20000, side = 24, t = 0.8
    const p: WeightPresets = { ...DEFAULT_WEIGHT_PRESETS, coreWallBands: null, coreWall: t, coreFc: 60, cracked: 1 }
    const levels: StoreyWeight[] = Array.from({ length: n }, (_, i) => ({ level: i + 2, roof: false, z: ((i + 1) * H) / n, W, area: 2500, deck: 0, deckKind: 'none', garden: false, podium: false, transitional: false, onPodium: false, use: 'residential', cx: 0, cy: 0, dx: 50, dy: 50, coreSide: side }))
    const w: WeightResult = { levels, total: n * W, density: 0, core: { x: 0, y: 0, side, how: 'test' }, presets: p }
    const c = coreStiffness(w, H)
    const EI = 33500e6 * tubeI(side, t), m = (W * 1000) / 9.81 / (H / n)
    const exact = (3.516 / (2 * Math.PI)) * Math.sqrt(EI / (m * H ** 4))
    expect(c.gross / exact).toBeGreaterThan(0.98)
    expect(c.gross / exact).toBeLessThan(1.02)
    expect(c.f1).toBeCloseTo(c.gross, 9) // cracked 1
    expect(c.pDelta).toBeGreaterThan(1)
  })

  it('a stiffer core raises f1; cracking lowers it by √factor', () => {
    const t = tower()
    const f = (p: Partial<WeightPresets>) => coreStiffness(storeyWeights(t, { ...DEFAULT_WEIGHT_PRESETS, ...p }), t.height)
    expect(f({ coreWallBands: [{ upTo: 1, t: 1.0 }] }).f1).toBeGreaterThan(f({ coreWallBands: [{ upTo: 1, t: 0.6 }] }).f1)
    expect(f({ coreFc: 90 }).f1).toBeGreaterThan(f({ coreFc: 50 }).f1)
    const c = f({})
    expect(c.f1).toBeCloseTo(c.gross * Math.sqrt(0.6), 9)
    expect(c.range[0]).toBeCloseTo(c.gross * Math.sqrt(0.5), 9)
    expect(c.range[1]).toBeCloseTo(c.gross * Math.sqrt(0.7), 9)
  })

  it('reads the line states at the band edges: Pass at the central value, Check inside the band, Fail below it', () => {
    const t = tower(), H = 300, emp = f1Empirical(H)
    const base: CoreStiffness = { f1: 0, range: [0, 0], gross: 0, E: 35000, fc: 70, cracked: 0.6, base: { side: 24, t: 0.95, I: 1 }, pDelta: 1.05, sections: [{ z0: 0, side: 24, t: 0.95 }] }
    const st = (f1: number, pDelta = 1.05) => coreLines(t, { ...base, f1, pDelta }, H)
    expect(st(emp.central)[0].state).toBe('pass')
    expect(st(emp.central - 1e-6)[0].state).toBe('warn')
    expect(st(emp.lower)[0].state).toBe('warn')
    expect(st(emp.lower - 1e-6)[0].state).toBe('fail')
    expect(st(0.103)[0].value).toBe(`core alone 0.103 Hz vs 46/H 0.153 Hz (${Math.round((0.103 / (46 / 300)) ** 2 * 100)}%)`)
    expect(st(0.1, 1.1)[1]).toMatchObject({ id: 'p-delta', value: 'P-Δ ×1.10', state: 'pass' })
    expect(st(0.1, 1.11)[1].state).toBe('warn')
    expect(st(0.1, Infinity)[1].state).toBe('warn')
    expect(st(0.1)[0].flag).toBe('unverified')
    expect(st(0.1)[0].source.page).toMatch(/p\.381/)
  })

  it('the structure check gives both lines, and marks a stepped core or a tower past 300 m for a specialist', () => {
    const r = structureCheck(tower(), windProcedure(tower()))
    const c = r.rules.find((x) => x.id === 'core-alone')!
    expect(c.value).toMatch(/^core alone 0\.\d{3} Hz vs 46\/H 0\.153 Hz \(\d+%\)$/)
    expect(r.rules.find((x) => x.id === 'p-delta')!.value).toMatch(/^P-Δ ×\d\.\d\d$/)
    expect(c.specialist).toBeUndefined()
    const stepped: Tower = { ...tower(), coreSteps: [{ fromLevel: 40, side: 19.5 }] }
    expect(structureCheck(stepped, windProcedure(stepped)).rules.find((x) => x.id === 'core-alone')!.specialist).toMatch(/the core steps/)
    const tall = importedTower(stack([{ n: 80, f2f: 4, ring: rect(50, 50) }]), { podiumTop: 0, coreSide: 24 })
    expect(structureCheck(tall, windProcedure(tall)).rules.find((x) => x.id === 'core-alone')!.specialist).toMatch(/past the book's tallest RC example/)
  })

  it('the across-wind line reads Check when it passes at both 46/H readings but not at the core alone', () => {
    const t = tower(), H = t.height
    const wp = windProcedure(t)
    const sw = storeyWeights(t)
    const f = coreStiffness(sw, H).f1, emp = f1Empirical(H)
    expect(f).toBeLessThan(emp.lower) // the core alone sits below the band here
    const d0 = dampingOf({ tunnelDefaultHeight: 180, f1: null }).total
    const g = (fr: number, d: number) => acrossWindAccel({ H, w: wp.w, d: wp.d, f: fr, damping: d, density: sw.density }).g
    // a damping that puts the lower 46/H reading under the limit and the core-alone one over it
    const k = Math.sqrt(g(emp.lower, d0) * g(f, d0)) / ACCEL_LIMIT.residential
    const damping = d0 * k * k
    const a = windProcedure(t, { tunnelDefaultHeight: 180, f1: null, damping }).rules.find((x) => x.id === 'across-wind-accel')!
    expect(a.value).toMatch(/; core alone \d+\.\d% g at 0\.\d{3} Hz$/)
    expect(a.state).toBe('warn')
    expect(a.note).toMatch(/its pass rests on 46\/H/)
  })

  it('a full-height core wall from the evidence input drops the bands', async () => {
    const { evidenceGroups } = await import('../lib/evidence/engines')
    const { useStore } = await import('../store')
    const s = useStore.getState()
    const base = { project: 'vtc' as const, towers: [tower()], fsrTier: 2 as const, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets }
    const line = (wp: Partial<WeightPresets> | null) => (evidenceGroups({ ...base, weightPresets: wp })['built.structure'] as { id: string; note?: string }[][])[0].find((x) => x.id === 'core-alone')!
    expect(line({ coreWall: 0.6 }).note).toMatch(/0\.60 m walls\)$|0\.60 m walls\), I/)
    expect(line(null).note).toMatch(/0\.95 m walls/)
  })
})
