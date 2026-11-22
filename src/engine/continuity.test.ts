// "No column starts" and the cantilever reader (tool cycle 12, R7 synthesis §3 tool 2): overhangs past the column lines
// below, declared carries, where column lines stop, and the lean of a column that follows a sloping facade (Type 10).
import { describe, expect, it } from 'vitest'
import { fixFor } from '../lib/fixes'
import { defaultTower } from '../store'
import { CANTILEVER_MAX, columnContinuity, continuityLines } from './continuity'
import { structureCheck, STRUCTURE_TABS } from './structure'
import { importedTower, rect, stack, type P } from './testStoreys'
import type { StructureCarry, Tower } from './types'
import { windProcedure } from './windStructure'

const lines = (t: Tower, north = 0) => structureCheck(t, windProcedure(t), undefined, north).rules
const line = (t: Tower, id: string, north = 0) => lines(t, north).find((r) => r.id === id)!
/** A tower from runs of plates: a 3-storey 90 × 60 m podium, then the runs (4 m storeys). */
const build = (runs: { n: number; ring: P[] }[], o: Partial<Tower> = {}): Tower => ({
  ...importedTower(stack([{ n: 3, f2f: 4, ring: rect(90, 60), podium: true }, ...runs.map((r) => ({ ...r, f2f: 4 }))]), { podiumTop: 12, coreSide: 24 }), ...o })

/** Tower C in small: 54 m tier, a NE step of 4.5 m on a belt, then a 9 m SE step with a two-storey open loggia under its roof. */
function stepped(carries?: StructureCarry[]): Tower {
  const tier1 = rect(54, 54)
  const tier2: P[] = [[-27, -27], [22.5, -27], [22.5, 27], [-27, 27]] // +x face in 4.5 m
  const tier3: P[] = [[-27, -18], [22.5, -18], [22.5, 27], [-27, 27]] // −y face in 9 m more
  const loggia: P[] = [[-27, -27], [22.5, -27], [22.5, 27], [-27, 27]] // the loggia roof brings the strip back
  // L4–L12 tier 1, L13–L19 tier 2, L20–L21 open loggia (tier 3 outline), L22 the loggia roof, L23–L30 tier 3
  return build([{ n: 9, ring: tier1 }, { n: 7, ring: tier2 }, { n: 2, ring: tier3 }, { n: 1, ring: loggia }, { n: 8, ring: tier3 }], { outriggerFloors: [12, 19], ...(carries ? { carries } : {}) })
}
/** A free form with an opening: a 50 m square on a 24 m core, open garden storeys L15–L17 (the plate is the core alone). */
const opening = (o: Partial<Tower> = {}) => build([{ n: 11, ring: rect(50, 50) }, { n: 3, ring: rect(24, 24) }, { n: 12, ring: rect(50, 50) }], o)

describe('No column starts (tool cycle 12)', () => {
  it('a straight tower: no starts, no stops, no cantilever', () => {
    const t = build([{ n: 40, ring: rect(50, 50) }])
    const r = columnContinuity(t)
    expect(r.starts).toEqual([])
    expect(r.stops).toEqual([])
    expect(r.cantilever).toBeNull()
    expect(r.lean).toBeNull()
    const s = line(t, 'column-starts')
    expect(s.state).toBe('pass')
    expect(s.value).toMatch(/^no column starts: every storey stands within 3\.0 m/)
    expect(s.flag).toBe('team_assumption')
    expect(s.specialist).toBeUndefined()
    expect(line(t, 'cantilever').value).toMatch(/^none/)
    expect(line(t, 'column-stops').state).toBe('pass')
  })

  it('a stepped plate (tower C in small): the stops on the belts, and the loggia roof as a start until its carry is declared', () => {
    const r = columnContinuity(stepped(), { north: 45 })
    // the NE step stops the +x face at L12, on the belt there; the SE step at L19, on the belt; the roof strip at L22, off a belt
    expect(r.stops.map((s) => [s.level, Math.round(s.depth * 10) / 10, s.on])).toEqual([[12, 4.5, 'the belt at L12'], [19, 9, 'the belt at L19'], [22, 9, null]])
    expect(r.stops[0].face).toBe('NE') // +x with true north 45° from +y
    expect(r.stops[1].face).toBe('SE')
    // the loggia roof overhangs the open storeys by 9 m: a column would start, or the columns of L19 continue through L20–L21
    expect(r.starts).toHaveLength(1)
    expect(r.starts[0]).toMatchObject({ level: 22, face: 'SE', carry: null, gradual: false, suggest: { kind: 'loggia', level: 22, from: 20 } })
    expect(r.starts[0].depth).toBeCloseTo(9, 1)
    const s = line(stepped(), 'column-starts', 45)
    expect(s.state).toBe('warn')
    expect(s.value).toBe('columns would start at L22 (SE, 9.0 m past the column lines below)')
    expect(s.note).toMatch(/L22: if the columns of L19 continue through L20–L21, declare a loggia carry/)
    expect(fixFor('column-starts', 'warn', s.value)).toMatch(/pull it back within 3 m/)
    const st = line(stepped(), 'column-stops', 45)
    expect(st.state).toBe('warn')
    expect(st.value).toMatch(/^1 of 3 stops off a belt: L22 \(SE, 9\.0 m\)/)
    expect(fixFor('column-stops', 'warn', st.value)).toMatch(/move the step to a belt/)
  })

  it('declaring the loggia carry: no start, and the roof\'s stop sits on the declared carry', () => {
    const t = stepped([{ kind: 'loggia', level: 22, from: 20 }])
    const r = columnContinuity(t)
    expect(r.starts).toEqual([])
    expect(r.carried).toHaveLength(1)
    expect(r.carried[0].level).toBe(22)
    expect(r.carried[0].depth).toBeCloseTo(9, 1)
    expect(r.stops.map((s) => [s.level, s.on])).toEqual([[12, 'the belt at L12'], [22, 'the declared loggia roof']]) // L19's SE face continues through the loggia
    expect(line(t, 'column-starts').state).toBe('pass')
    expect(line(t, 'column-starts').value).toMatch(/or on a declared carry \(L22\)/)
    expect(line(t, 'column-stops').state).toBe('pass')
    expect(line(t, 'cantilever').state).toBe('pass')
  })

  it('a free form with an opening storey: the storey over the open garden starts its columns unless a carry is declared', () => {
    const r = columnContinuity(opening())
    expect(r.starts.map((s) => s.level)).toEqual([18])
    expect(r.starts[0].depth).toBeCloseTo(13 * Math.SQRT2, 0) // to the corner, past the core
    expect(r.starts[0].suggest).toEqual({ kind: 'loggia', level: 18, from: 15 })
    // the garden's columns continue through the three open storeys: carried
    const lg = opening({ carries: [{ kind: 'loggia', level: 18, from: 15 }] })
    expect(columnContinuity(lg).starts).toEqual([])
    expect(line(lg, 'column-starts').state).toBe('pass')
    // a lid truss under L18 instead: the columns start on it, declared
    const tr = opening({ carries: [{ kind: 'transfer', level: 18 }] })
    const s = line(tr, 'column-starts')
    expect(s.state).toBe('warn')
    expect(s.value).toMatch(/^columns start on declared carries at L18 \(.*on the declared transfer at L18\)$/)
    expect(s.specialist).toMatch(/declared transfer, belt or hung truss/)
    expect(fixFor('column-starts', 'warn', s.value)).toMatch(/declared transfer, belt or hung truss/)
    // a belt at the storey below carries it too (a transfer by truss)
    expect(columnContinuity(opening({ outriggerFloors: [17] })).starts[0].carry?.kind).toBe('belt')
    // more open storeys than a loggia's columns may cross unbraced: noted
    const tall = build([{ n: 11, ring: rect(50, 50) }, { n: 5, ring: rect(24, 24) }, { n: 10, ring: rect(50, 50) }], { carries: [{ kind: 'loggia', level: 20, from: 15 }] })
    expect(columnContinuity(tall).tall).toHaveLength(1)
    expect(line(tall, 'column-starts').note).toMatch(/free-standing columns need ties/)
  })

  it('a short overhang is a cantilever, not a start', () => {
    const t = build([{ n: 10, ring: rect(50, 50) }, { n: 10, ring: [[-25, -25], [27, -25], [27, 25], [-25, 25]] }])
    const r = columnContinuity(t)
    expect(r.starts).toEqual([])
    expect(r.cantilever!.depth).toBeCloseTo(2, 6)
    expect(r.cantilever!.level).toBe(14)
    expect(line(t, 'cantilever').value).toBe('deepest 2.0 m at L14 (E)')
    expect(line(t, 'cantilever').state).toBe('pass')
    // 4 m is past the limit
    const far = build([{ n: 10, ring: rect(50, 50) }, { n: 10, ring: [[-25, -25], [29, -25], [29, 25], [-25, 25]] }])
    expect(columnContinuity(far).starts.map((s) => s.level)).toEqual([14])
    expect(CANTILEVER_MAX).toBe(3)
  })

  it('a leaning plate: a column that follows it leans (Type 10), else columns start as the overhang grows', () => {
    // 30 storeys, each shifted 0.3 m along +x: a 4.3° lean
    const t = build(Array.from({ length: 30 }, (_, k) => ({ n: 1, ring: rect(50, 50, 0.3 * k, 0) })))
    const r = columnContinuity(t)
    expect(r.gradual).toHaveLength(1)
    expect(r.gradual[0].sense).toBe('both')
    expect(r.lean!.deg).toBeCloseTo((Math.atan(0.3 / 4) * 180) / Math.PI, 3)
    // kept vertical, the +x edge grows 0.3 m a storey: a start past 3 m, then again
    expect(r.starts.length).toBeGreaterThanOrEqual(2)
    expect(r.starts.every((s) => s.gradual)).toBe(true)
    expect(r.specialist).toMatch(/moves storey by storey/)
    const sl = line(t, 'sloped-columns')
    expect(sl.state).toBe('warn')
    expect(sl.value).toMatch(/^perimeter columns that follow the sloping facade lean about 4\.3°/)
    expect(sl.specialist).toMatch(/Type 10/)
    expect(line(t, 'column-starts').specialist).toMatch(/tapered, leaning or morphed plate/)
    expect(fixFor('sloped-columns', 'warn', sl.value)).toMatch(/slope per storey/)
  })

  it('a morph to an octagon (compass facets growing at the corners): columns lean or stop, none starts', () => {
    // 54 m square; from L20 the corner cut grows 0.6 m a storey to 16.8 m
    const oct = (c: number): P[] => { const x = 27; return [[-x + c, -x], [x - c, -x], [x, -x + c], [x, x - c], [x - c, x], [-x + c, x], [-x, x - c], [-x, -x + c]] }
    const t = build([{ n: 16, ring: oct(0) }, ...Array.from({ length: 28 }, (_, k) => ({ n: 1, ring: oct(0.6 * (k + 1)) }))])
    const r = columnContinuity(t)
    expect(r.starts).toEqual([])
    expect(r.stops).toEqual([]) // gradual: no step stops
    expect(r.gradual[0].sense).toBe('in')
    expect(r.lean!.move).toBeCloseTo(0.6 / Math.SQRT2, 2) // the facet moves 0.42 m a storey
    expect(line(t, 'sloped-columns').state).toBe('warn') // 6.1°
    expect(line(t, 'column-stops').value).toMatch(/facade moves gradually/)
  })

  it('a column ring on the top storeys only starts its own columns, unless a belt carries them', () => {
    const t = build([{ n: 30, ring: rect(50, 50) }], { columnRing: { from: 20 } })
    const r = columnContinuity(t)
    expect(r.starts).toEqual([expect.objectContaining({ level: 20, ring: true, carry: null })])
    expect(line(t, 'column-starts').value).toBe('columns would start at L20 (the column ring’s columns)')
    const belt = build([{ n: 30, ring: rect(50, 50) }], { columnRing: { from: 20 }, outriggerFloors: [19] })
    expect(columnContinuity(belt).starts[0].carry?.kind).toBe('belt')
    // a ring on every storey starts nothing
    expect(columnContinuity(build([{ n: 30, ring: rect(50, 50) }], { columnRing: true })).starts).toEqual([])
  })

  it('works on both projects\' default towers, and shows in Floors & spans', () => {
    for (const t of [defaultTower('vtc'), defaultTower('city', [254, 486])]) {
      const ids = lines(t).map((r) => r.id)
      for (const id of ['column-starts', 'cantilever', 'column-stops']) expect(ids).toContain(id)
      expect(line(t, 'column-starts').state).toBe('pass')
    }
    expect(STRUCTURE_TABS.find((g) => g.id === 'floors')!.lines).toEqual(expect.arrayContaining(['column-starts', 'cantilever', 'column-stops']))
    // the lines read straight from the reading
    expect(continuityLines(columnContinuity(stepped())).map((r) => r.id)).toEqual(['column-starts', 'cantilever', 'column-stops'])
  })
})
