// P1 #13 floor reach (NODE_LIST row 13): the slab was 0.20 / 0.25 m whatever the span (storeyWeight.ts USE_LOADS). Now
// each tower storey's core-to-facade reach sets its slab (post-tensioned plate about L/45, Allen & Iano pp.118–119), and
// the structure check reads the reach against one flat plate (9.1 m, Ching p.8).
import { describe, expect, it } from 'vitest'
import { structureCheck } from './structure'
import { DEFAULT_WEIGHT_PRESETS, floorReach, GAMMA_C, slabForSpan, storeyWeights, USE_LOADS } from './storeyWeight'
import { importedTower, rect, stack, type P } from './testStoreys'
import type { Tower } from './types'
import { windProcedure } from './windStructure'

const turn = (r: P[], deg: number): P[] => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return r.map(([x, y]) => [x * c - y * s, x * s + y * c]) }
/** A 50 m square tower of homes on a 24 m core (A and B in Ching's reading: 13.0 m on axis, 18.4 m to the corner). */
const tower = (ring: P[] = rect(50, 50), n = 40): Tower => importedTower(stack([{ n, f2f: 4, ring }]), { podiumTop: 0, coreSide: 24 })
const line = (t: Tower, id: string) => structureCheck(t, windProcedure(t)).rules.find((x) => x.id === id)

describe('P1 #13: floor reach and the slab from the span', () => {
  it('reads a 50 m plate on a 24 m core as 13.0 m on axis and 18.4 m to the corner', () => {
    const r = floorReach(rect(50, 50), { side: 24, x: 0, y: 0 })
    expect(r.axial).toBeCloseTo(13, 9)
    expect(r.corner).toBeCloseTo(13 * Math.SQRT2, 9)
    // off-centre core: the long side governs
    expect(floorReach(rect(50, 50), { side: 24, x: 3, y: 0 }).axial).toBeCloseTo(16, 9)
    // turned 45° on a straight core: the plate's corner sits on the core's axis, about 23.4 m out (Ching's B top)
    expect(floorReach(turn(rect(50, 50), 45), { side: 24, x: 0, y: 0 }).axial).toBeCloseTo(25 * Math.SQRT2 - 12, 6)
  })

  it('sets the slab from the span: L/45, at least 150 mm', () => {
    expect(slabForSpan(13)).toBeCloseTo(13 / 45, 9)
    expect(slabForSpan(6)).toBe(0.15)
    const lv = storeyWeights(tower()).levels.find((l) => l.level === 10)!
    expect(lv.slab).toBeCloseTo(13 / 45, 9)
    expect(lv.reach!.axial).toBeCloseTo(13, 9)
    // the use presets come back with slabFrom 'use'
    expect(storeyWeights(tower(), { ...DEFAULT_WEIGHT_PRESETS, slabFrom: 'use' }).levels.find((l) => l.level === 10)!.slab).toBe(USE_LOADS.residential.slab)
  })

  it('feeds the slab into the storey weight: a home plate gains (13/45 − 0.20) × 24 kN/m³', () => {
    const at = (p = DEFAULT_WEIGHT_PRESETS) => storeyWeights(tower(), p).levels.find((l) => l.level === 10)!.W
    expect(at() - at({ ...DEFAULT_WEIGHT_PRESETS, slabFrom: 'use' })).toBeCloseTo(2500 * (13 / 45 - 0.2) * GAMMA_C, 6)
  })

  it('a 13 m reach is a Check past one flat plate, with the dead load rise and the ways out', () => {
    const r = line(tower(), 'floor-reach')!
    expect(r.value).toBe('depth axial 13.0 m (L2), corner 18.4 m (L2)')
    expect(r.state).toBe('warn')
    expect(r.flag).toBe('unverified')
    expect(r.threshold).toMatch(/≤ 9\.1 m: one flat plate/)
    expect(r.note).toMatch(/interior column ring/)
    expect(r.note).toMatch(/0\.54–0\.65 m deep/) // post-tensioned beams L/20–24 on 13 m
    expect(r.note).toMatch(/12\.5 m \(41 ft\) deep core/)
    expect(r.source.page).toMatch(/pp\.8, 10/)
    const d = line(tower(), 'floor-dead-load')!
    expect(d.value).toMatch(/^residential dead load \+34% \(8\.4 against 6\.3 kPa\); tower weight \+\d+%$/)
    expect(d.state).toBe('unknown')
  })

  it('a small plate within one flat plate passes; a declared column ring halves the span', () => {
    expect(line(tower(rect(40, 40)), 'floor-reach')!.state).toBe('pass') // 8 m
    const ringed: Tower = { ...tower(), columnRing: true }
    const r = line(ringed, 'floor-reach')!
    expect(r.state).toBe('pass')
    expect(r.value).toMatch(/with the column ring \(every storey\), worst span ≈ 6\.5 m$/)
    expect(storeyWeights(ringed).levels.find((l) => l.level === 10)!.slab).toBe(0.15)
  })

  it('leaves podium storeys on the use presets', () => {
    const t = importedTower(stack([{ n: 4, f2f: 4, ring: rect(90, 60), podium: true }, { n: 30, f2f: 4, ring: rect(50, 50) }]), { podiumTop: 16, coreSide: 24 })
    const pod = storeyWeights(t).levels.find((l) => l.level === 3)!
    expect(pod.slab).toBe(USE_LOADS[pod.use].slab)
  })
})

describe('P1 #13: outside the rules of thumb', () => {
  it('marks a plate turning on a straight core as needing a specialist, and not a straight one', () => {
    const n = 40
    const t = importedTower(Array.from({ length: n }, (_, k) => ({ level: k + 1, z0: 4 * k, z1: 4 * k + 4, area: 2500, use: 'residential' as const, podium: false, hasFloor: true, loops: [turn(rect(50, 50), (45 * k) / (n - 1))] })), { podiumTop: 0, coreSide: 24 })
    expect(line(t, 'floor-reach')!.specialist).toMatch(/turns 45° on a straight core/)
    expect(line(tower(), 'floor-reach')!.specialist).toBeUndefined()
  })
})
