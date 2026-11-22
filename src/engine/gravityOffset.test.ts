// G5 (vtc-entry TOOL_DEFICITS): off-centre gravity load and accidental torsion, research R5 §2. C7a–C7e moved their
// upper tiers up to 4.24 m off the core by plate centre (harness arithmetic); the structural review asked for it declared.
import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { structureCheck } from './structure'
import { DEFAULT_WEIGHT_PRESETS, GAMMA_C, gravityEccentricity, storeyWeights, USE_LOADS, type WeightResult } from './storeyWeight'
import { exportProject, readProject, toDesign } from '../lib/project/projectFile'
import { defaultDesign } from '../lib/project/design'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'
import { windProcedure } from './windStructure'

// The use presets of slab thickness (0.20 m homes at any span), which the hand arithmetic below uses (P1 #13 made the span the default).
const run = (t: Tower) => structureCheck(t, windProcedure(t), { ...DEFAULT_WEIGHT_PRESETS, slabFrom: 'use' })
const rule = (r: ReturnType<typeof run>, id: string) => r.rules.find((x) => x.id === id)!

/** C7a in miniature: a podium under a 54 m tier on the core at (30, 0), then tiers that step and shift by `s` metres. */
const c7 = (s: number) => importedTower(stack([
  { n: 4, f2f: 4, ring: rect(76, 76, 30, 0), podium: true },
  { n: 38, f2f: 4, ring: rect(54, 54, 30, 0) },
  { n: 8, f2f: 4, ring: rect(48, 54, 30 - s, 0) },
  { n: 8, f2f: 4, ring: rect(48, 48, 30 - s, s) },
  { n: 8, f2f: 4, ring: rect(42, 48, 30, s) },
  { n: 8, f2f: 4, ring: rect(42, 42, 30, 0) },
]), { podiumTop: 16, coreSide: 24 })

describe('G5: off-centre storey weight against the code’s accidental arm (R5 §2)', () => {
  const q = USE_LOADS.residential.slab * GAMMA_C + USE_LOADS.residential.sdl + USE_LOADS.residential.part
  const coreW = 4 * 24 * DEFAULT_WEIGHT_PRESETS.coreWall * GAMMA_C * 4
  /** Weight-centre offset of a typical floor of a w × d tier shifted by `off` from the core (plate and facade at its centre, core walls on the core). */
  const offset = (w: number, d: number, off: number) => { const W = w * d * q + 2 * (w + d) * 4 * DEFAULT_WEIGHT_PRESETS.facadeKpa; return (off * W) / (W + coreW) }

  it('reads the core of an imported tower at its typical tower storey, and each tier’s offset by weight', () => {
    const r = run(c7(3))
    expect(r.weights.core).toMatchObject({ x: 30, y: 0 })
    expect(r.weights.core.how).toMatch(/typical tower storey, L5/)
    // A typical tier-3 floor (48 × 48 m, 3 m west and 3 m north): the plate's 4.24 m shrinks to about 3.1 m once the core walls count.
    const t3 = r.gravity.levels.find((l) => l.level === 55)! // L51–L58
    expect(t3.ex).toBeCloseTo(-offset(48, 48, 3), 6)
    expect(t3.ey).toBeCloseTo(offset(48, 48, 3), 6)
    expect(t3.e).toBeCloseTo(Math.SQRT2 * offset(48, 48, 3), 6)
    expect(t3.e).toBeGreaterThan(3)
    expect(t3.e).toBeLessThan(3.2)
    // The largest e/D, about 0.047: 3 m west across a 48 m plate (a typical tier-2 floor reads 0.04704; the first
    // tier-3 floor, carrying the tier-2 terrace on the same x, a hair more).
    const g = r.gravity.worst!
    expect(g.ratio).toBeGreaterThanOrEqual(offset(48, 54, 3) / 48 - 1e-12)
    expect(g.ratio).toBeCloseTo(0.047, 3)
    expect(g.D).toBe(48)
    const line = rule(r, 'gravity-offset')
    expect(line.value).toBe(`largest e/D 0.047 at L${g.level} (2.3 m across a 48 m plate)`)
    expect(line.state).toBe('pass') // under 0.05 by weight
    expect(line.note).toMatch(/Largest offset 3\.1 m at L5\d/)
  })

  it('declares larger shifts, and says when one exceeds the code’s 0.10·D accidental arm', () => {
    const six = rule(run(c7(6)), 'gravity-offset')
    expect(six.state).toBe('warn')
    expect(Number(six.value.match(/e\/D (\d\.\d+)/)![1])).toBeCloseTo(offset(48, 54, 6) / 48, 3)
    expect(six.note).toMatch(/Within the code’s accidental arm: declare it/)
    const ten = run(c7(10))
    expect(ten.gravity.worst!.ratio).toBeGreaterThan(0.1)
    expect(rule(ten, 'gravity-offset').note).toMatch(/Beyond the code’s accidental arm/)
  })

  it('reads the net offset and its sustained sway, and flags camber', () => {
    const r = run(c7(3))
    const net = rule(r, 'gravity-net')
    expect(r.gravity.net.e).toBeGreaterThan(0.1)
    expect(net.value).toMatch(/^E = \d\.\d\d m \(e\/D 0\.\d{3}\); top sway ≈ \d+ mm elastic, ≈ \d+ mm long term$/)
    expect(r.gravity.sway.lt).toBeCloseTo(r.gravity.sway.el * 3.35, 9)
    expect(net.state).toBe(r.gravity.sway.lt > 0.025 ? 'warn' : 'pass')
  })

  it('reproduces R5’s worked sway: 250 m, 70 floors of 22.5 MN all 0.8 m off the core give about 97 mm elastic, 0.32 m long term', () => {
    const levels = Array.from({ length: 70 }, (_, i) => ({ level: i + 2, roof: false, z: ((i + 1) * 250) / 70, W: 22500, area: 2500, deck: 0, deckKind: 'none' as const, garden: false, podium: false, transitional: false, onPodium: false, use: 'residential' as const, cx: 0.8, cy: 0, dx: 50, dy: 50 }))
    const w: WeightResult = { levels, total: 70 * 22500, density: 0, core: { x: 0, y: 0, side: 24, how: 'test' }, presets: DEFAULT_WEIGHT_PRESETS }
    const g = gravityEccentricity(w, 250)
    expect(g.sway.EI / 1e14).toBeCloseTo(2.7, 1)
    expect(g.sway.el).toBeCloseTo(0.097, 2)
    expect(g.sway.lt).toBeGreaterThan(0.315) // R5: about 0.32 m (0.098 m × 3.35)
    expect(g.sway.lt).toBeLessThan(0.335)
    expect(g.net.e).toBeCloseTo(0.8, 9)
    expect(g.QG).toBeCloseTo(70 * 22500 * 0.8, 6)
  })

  it('a tower on its core passes both lines; podium storeys and the podium roof are left out', () => {
    const t = useStore.getInitialState().towers.vtc[0]
    const r = run(t)
    expect(rule(r, 'gravity-offset')).toMatchObject({ value: 'weight centred on the core at every tower storey', state: 'pass' })
    expect(rule(r, 'gravity-net').state).toBe('pass')
    expect(r.gravity.levels.some((l) => l.level <= 5)).toBe(false) // L1–L4 podium, L5 on the podium roof
    // A tower 17 m east of the podium's centre: the podium roof's weight is not read against the tower's core.
    const a8 = importedTower(stack([{ n: 4, f2f: 4, ring: rect(90, 60), podium: true }, { n: 30, f2f: 4, ring: rect(50, 50, 17, 2) }]), { podiumTop: 16 })
    expect(rule(run(a8), 'gravity-offset').state).toBe('pass')
  })

  // A11a in miniature: a 50 × 50 m shaft at (17, 2) on a podium whose upper storey, L5, is a wider 66 × 55 m plate centred
  // at (9, 0.5) just above the podium top, then a double-height garden at 100 m behind a Z-shaped wind wall. Read from the
  // lowest tower storey, the core sat at (9, 0.5) and the check read e/D 0.190 at L25 and E = 6 m (the coordinator's run).
  const wall: [number, number][] = [[-8, -23], [5, -23], [5, -10], [29, -10], [29, 14], [42, 14], [42, 27], [-8, 27]]
  const a11a = () => importedTower(stack([
    { n: 4, f2f: 4.8, ring: rect(64, 60, 24, 0), podium: true },
    { n: 1, f2f: 4.8, ring: rect(66, 55, 9, 0.5), use: 'office' },
    { n: 19, f2f: 4, ring: rect(50, 50, 17, 2), use: 'office' },
    { n: 2, f2f: 4, ring: wall, use: 'amenity' },
    { n: 30, f2f: 4, ring: rect(50, 50, 17, 2), use: 'office' },
  ]), { podiumTop: 19.2 })

  it('A11a: reads the core at the typical tower storey, not a wider transitional storey above the podium', () => {
    const r = run(a11a())
    expect(r.weights.core).toMatchObject({ x: 17, y: 2 })
    expect(r.weights.core.how).toMatch(/typical tower storey, L6/)
    const l5 = r.weights.levels.find((l) => l.level === 5)!, l6 = r.weights.levels.find((l) => l.level === 6)!
    expect(l5.transitional).toBe(true) // one storey, wider than the shaft, just above the podium
    expect(l6.onPodium).toBe(true) // its floor is L5's roof
    expect(r.gravity.levels.some((l) => l.level <= 6)).toBe(false)
    // The shaft's own floors sit on the core; what is left is the enclosed half of the double-height garden (L26).
    expect(r.gravity.levels.find((l) => l.level === 10)!.e).toBeLessThan(1e-6)
    expect(r.gravity.worst!.level).toBe(26)
    expect(r.gravity.worst!.ratio).toBeLessThan(0.1)
    expect(r.gravity.net.e).toBeLessThan(0.2)
    expect(r.gravity.sway.lt).toBeLessThan(0.05)
    expect(rule(r, 'gravity-net').state).toBe('pass')
    expect(rule(r, 'gravity-offset').value).not.toMatch(/0\.190/)
  })

  it('takes a core centre placed by hand, and saves it in the project file', () => {
    const t = { ...a11a(), coreCentre: [9, 0.5] as [number, number] }
    const r = run(t)
    expect(r.weights.core).toMatchObject({ x: 9, y: 0.5 })
    expect(r.weights.core.how).toMatch(/placed by hand/)
    expect(r.gravity.worst!.ratio).toBeGreaterThan(0.1) // now the shaft is 8 m off the core you placed
    // A parametric tower takes it too (the toolkit otherwise centres its core on the tower).
    expect(storeyWeights({ ...useStore.getInitialState().towers.vtc[0], coreCentre: [3, -2] }).core).toMatchObject({ x: 3, y: -2 })
    const d = defaultDesign()
    const design = { ...d, towers: { ...d.towers, vtc: [{ ...d.towers.vtc[0], coreCentre: [4.5, -1.25] as [number, number] }] } }
    const back = readProject(exportProject(design))
    expect(back.ok).toBe(true)
    expect(toDesign(back.file!).towers.vtc[0].coreCentre).toEqual([4.5, -1.25])
  })

  it('takes the core from an open garden storey whose plate is the core alone', () => {
    const t = importedTower(stack([
      { n: 4, f2f: 4, ring: rect(90, 60), podium: true },
      { n: 10, f2f: 4, ring: rect(50, 50, 15, 0) },
      { n: 1, f2f: 4, ring: rect(24, 24, 17, 2), use: 'amenity' },
      { n: 10, f2f: 4, ring: rect(50, 50, 15, 0) },
    ]), { podiumTop: 16 })
    expect(run(t).weights.core).toMatchObject({ x: 17, y: 2 })
    expect(run(t).weights.core.how).toMatch(/core-only plate of the open garden storey L15/)
  })
})
