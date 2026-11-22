// Open-storey soft and weak storey check (tool cycle 12, R7 synthesis §3 tool 5): Types 1, 4, 5 and 6 at open garden
// storeys, gates and voids, and over a core top, by the core-alone proxy.
import { describe, expect, it } from 'vitest'
import { fixFor } from '../lib/fixes'
import { defaultTower } from '../store'
import { f1Empirical } from './acrossWind'
import { columnContinuity } from './continuity'
import { openStoreyLines, openStoreys } from './openStorey'
import { structureCheck, STRUCTURE_TABS } from './structure'
import type { CoreStiffness } from './storeyWeight'
import { importedTower, rect, stack, type P } from './testStoreys'
import type { ImportedStorey, Tower } from './types'
import { windProcedure } from './windStructure'

const build = (runs: { n: number; ring: P[] | P[][]; f2f?: number }[], o: Partial<Tower> = {}): Tower => {
  const storeys: ImportedStorey[] = stack([{ n: 3, f2f: 4, ring: rect(90, 60), podium: true }])
  let z = 12
  for (const r of runs) for (let i = 0; i < r.n; i++) {
    const loops = (Array.isArray(r.ring[0][0]) ? r.ring : [r.ring]) as P[][]
    const area = loops.reduce((s, l) => s + Math.abs(l.reduce((a, [x, y], k) => { const [x2, y2] = l[(k + 1) % l.length]; return a + x * y2 - x2 * y }, 0) / 2), 0)
    storeys.push({ level: storeys.length + 1, z0: z, z1: z + (r.f2f ?? 4), area, use: 'residential', podium: false, hasFloor: true, loops })
    z += r.f2f ?? 4
  }
  return { ...importedTower(storeys, { podiumTop: 12, coreSide: 24 }), ...o }
}
/** A free form with an opening: a 50 m square on a 24 m core, open garden storeys L15–L17 (the plate is the core alone). */
const opening = (o: Partial<Tower> = {}) => build([{ n: 11, ring: rect(50, 50) }, { n: 3, ring: rect(24, 24) }, { n: 12, ring: rect(50, 50) }], o)
/** The core-alone reading at a chosen share s of the 46/H stiffness. */
const coreAt = (H: number, s: number) => ({ f1: Math.sqrt(s) * f1Empirical(H).central }) as CoreStiffness
const read = (t: Tower, s: number, coreTop?: number) => { const H = t.height; const r = openStoreys(t, { core: coreAt(H, s), H, coreTop }); return { r, lines: openStoreyLines(r, columnContinuity(t)) } }
const id = (ls: { id: string }[], x: string) => ls.find((l) => l.id === x) as ReturnType<typeof openStoreyLines>[number]

describe('Open-storey soft and weak storey (tool cycle 12, Table 4.1.8.6 Types 1, 4, 5, 6)', () => {
  it('a straight tower reads no open storey: every line passes and says what it read', () => {
    const { r, lines } = read(build([{ n: 30, ring: rect(50, 50) }]), 0.5)
    expect(r.bands).toEqual([])
    expect(r.crown).toBeNull()
    expect(lines.map((l) => l.id)).toEqual(['soft-storey', 'weak-storey', 'open-discontinuity'])
    for (const l of lines) { expect(l.state).toBe('pass'); expect(l.value).toBe('no open storey, gate, void or core top read') }
  })

  it('a free form with open garden storeys, when the frame carries part of the stiffness: soft, weak and a broken path', () => {
    const t = opening()
    const { r, lines } = read(t, 0.32)
    expect(r.bands).toEqual([expect.objectContaining({ from: 15, to: 17, kind: 'garden', below: 14, above: 18, share: 0, coreIn: true })])
    expect(r.s).toBeCloseTo(0.32, 6)
    expect(r.frame).toBeCloseTo(0.68, 6)
    expect(r.ratios[0].lo).toBeCloseTo(0.32, 3) // the core alone: 32% of the storey below
    const soft = id(lines, 'soft-storey')
    expect(soft.state).toBe('warn')
    expect(soft.value).toBe('L15–L17 open garden storeys: ≈ 32% of the storey below (proxy: the core alone gives 32% of the stiffness 46/H assumes, the frame, belts and floors the other 68%)')
    expect(soft.flag).toBe('team_assumption')
    expect(soft.specialist).toMatch(/candidate soft storey/)
    expect(soft.source.page).toMatch(/4-482–4-484/)
    expect(soft.note).toMatch(/Confidence C/)
    const weak = id(lines, 'weak-storey')
    expect(weak.state).toBe('warn')
    expect(weak.value).toMatch(/^L15–L17 under L18: the core walls alone carry the storey shear the frame shares above/)
    expect(weak.flag).toBe('unverified')
    const lp = id(lines, 'open-discontinuity')
    expect(lp.state).toBe('warn')
    expect(lp.value).toBe('L15–L17: the core walls continue; the frame loses its floors there (Type 4) and its columns start over it at L18 (Type 5)')
    for (const l of lines) expect(fixFor(l.id, l.state, l.value)).not.toMatch(/^Rule: /)
    // the loggia carry keeps the columns through: no Type 5 offset, the floors still go
    const carried = opening({ carries: [{ kind: 'loggia', level: 18, from: 15 }] })
    expect(id(read(carried, 0.32).lines, 'open-discontinuity').value).toBe('L15–L17: the core walls continue; the frame loses its floors there (Type 4)')
  })

  it('the same opening when the core alone reaches 46/H: a pass that names its proxy', () => {
    const { lines } = read(opening(), 1.2)
    const soft = id(lines, 'soft-storey')
    expect(soft.state).toBe('pass')
    expect(soft.value).toBe('L15–L17 open garden storeys: ≈ 100% of the storey below (proxy: the core alone gives 100% of the stiffness 46/H assumes, so the frame is not counted on)')
    expect(id(lines, 'weak-storey').state).toBe('pass')
    expect(id(lines, 'weak-storey').value).toMatch(/the core walls carry the storey shear above and below, with no less wall/)
    expect(id(lines, 'open-discontinuity').state).toBe('pass')
  })

  it('a tall open storey loses stiffness with its height: a range from flexural to shear', () => {
    const t = build([{ n: 11, ring: rect(50, 50) }, { n: 1, ring: rect(24, 24), f2f: 12 }, { n: 12, ring: rect(50, 50) }])
    const { r } = read(t, 1.2)
    expect(r.bands[0].tall).toBeCloseTo(4 / 12, 6)
    expect(r.ratios[0].hi).toBeCloseTo(1 / 3, 3)
    expect(r.ratios[0].lo).toBeCloseTo(1 / 27, 3)
  })

  it('a stepped plate (setbacks) is not an opening', () => {
    const t = build([{ n: 10, ring: rect(54, 54) }, { n: 10, ring: [[-27, -27], [22.5, -27], [22.5, 27], [-27, 27]] }, { n: 10, ring: [[-27, -18], [22.5, -18], [22.5, 27], [-27, 27]] }])
    const { r, lines } = read(t, 0.32)
    expect(r.bands).toEqual([])
    expect(lines.every((l) => l.state === 'pass')).toBe(true)
  })

  it('a gate at the crown over a core top: the frame on the core reads soft and breaks the path', () => {
    // two ears either side of a 30 m slot at the top four storeys; the core ends under them
    const ears: P[][] = [rect(40, 6, 0, -17), rect(40, 10, 0, 15)]
    const t = build([{ n: 26, ring: rect(40, 40) }, { n: 4, ring: ears }])
    const top = 12 + 26 * 4
    const { r, lines } = read(t, 0.32, top)
    expect(r.bands).toEqual([expect.objectContaining({ from: 30, to: 33, kind: 'gate', above: null })])
    expect(r.crown).toEqual(expect.objectContaining({ coreTop: top, from: 30, below: 29 }))
    const soft = id(lines, 'soft-storey')
    expect(soft.state).toBe('warn')
    expect(soft.value).toMatch(/above the core top \(\+116\.0 m, L30 up\): ≈ \d+% of the storey below/)
    expect(id(lines, 'weak-storey').value).toMatch(/^no open band under a fuller storey; the crown over the core top is weaker than the storey below it/)
    const lp = id(lines, 'open-discontinuity')
    expect(lp.state).toBe('warn')
    expect(lp.value).toMatch(/^L30–L33: above the core top, no core walls; the frame loses its floors there \(Type 4\)/)
    expect(r.bands[0].core).toBe(0) // no core above its top
    expect(soft.value).toMatch(/^L30–L33 gate storeys \(the plate splits\): ≈ \d+% of the storey below/)
    expect(lp.value).toMatch(/above the core top \(L30 up\): the frame’s storey shear ends on the core top \(Type 5/)
    // without a core top the gate still reads (the core then runs through the slot and breaks), and the crown does not
    const noTop = read(t, 0.32)
    expect(noTop.r.crown).toBeNull()
    expect(id(noTop.lines, 'open-discontinuity').value).toMatch(/^L30–L33: the core walls do not stand inside the open storey’s plate \(they break\)/)
  })

  it('runs inside the structure check on both projects, takes a core top, and shows in System & seismic', () => {
    for (const t of [defaultTower('vtc'), defaultTower('city', [254, 486])]) {
      const rules = structureCheck(t, windProcedure(t)).rules
      for (const x of ['soft-storey', 'weak-storey', 'open-discontinuity']) expect(rules.find((r) => r.id === x)?.state).toBe('pass')
    }
    const t = opening()
    const res = structureCheck(t, windProcedure(t))
    expect(res.open.bands.map((b) => [b.from, b.to])).toEqual([[15, 17]])
    const withTop = structureCheck(t, windProcedure(t), undefined, 0, { coreTop: 12 + 20 * 4 })
    expect(withTop.open.crown?.from).toBe(24)
    expect(STRUCTURE_TABS.find((g) => g.id === 'seismic')!.lines).toEqual(expect.arrayContaining(['soft-storey', 'weak-storey', 'open-discontinuity']))
  })
})
