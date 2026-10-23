import { describe, expect, it } from 'vitest'
import type { VtcContext } from '../context'
import { gridOver, type Occluders, type Pt } from './shadow'
import { studyWindow } from './solar'
import {
  evaluateSpace, ruleForClass, ruleState, RULES, solarRuleResults, summariseHours, sunHoursMap, TABLE_1, towerOccluders, vtcOccluders, vtcSpaces, type ProtectedSpace,
} from './solarRules'
import type { Tower } from './types'

const tower = (over: Partial<Tower> = {}): Tower => ({
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 200, f2f: 4, podiumHeight: 0, podiumWidth: 30, podiumDepth: 30,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: false, skyLobbies: [], ...over,
})
const square = (cx: number, cy: number, s: number): Pt[] => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]]
const space = (id: string, ring: Pt[], t1: ProtectedSpace['t1'] = null): ProtectedSpace => ({ id, name: id, rings: [ring], t1, source: 'test' })
// Frame with true north on +Y: at 10:00 PT on 22 Sep the shadow points to 306° (north-west).
const NW = (d: number): [number, number] => [Math.sin((306 * Math.PI) / 180) * d, Math.cos((306 * Math.PI) / 180) * d]
const none: Occluders = { prisms: [], tris: [] }
const opts = { northDeg: 0 }

describe('Table 1 and the rules', () => {
  it('holds the 58 spaces of Table 1 with the section 4 special cases', () => {
    expect(TABLE_1).toHaveLength(58)
    expect(TABLE_1.filter((s) => s.note === '4.2').map((s) => s.name)).toEqual(['Dilawri Square South', 'Jack Poole Plaza', 'Robson Square'])
    expect(TABLE_1.find((s) => s.name.startsWith('Dr. Sun'))?.note).toBe('4.1')
  })

  it('routes classes to their clause', () => {
    expect(ruleForClass('Community')).toBe('park')
    expect(ruleForClass('School Site')).toBe('park')
    expect(ruleForClass('Urban Plaza')).toBe('minimise')
    expect(ruleForClass('Urban Plaza', '4.2')).toBe('park') // 4.2.1: consult 3.1
    expect(ruleForClass('Local', '4.1')).toBe('sunyatsen')
    expect(RULES.robson.window).toBe('robson') // 3.3.1(b): 10 am to 3 pm
  })
})

describe('the Downtown test on one space', () => {
  const prop = towerOccluders([tower()])
  const win = studyWindow('equinox')

  it('finds new shadow on a park the morning shadow crosses, and the 25 Detailed intervals', () => {
    const [cx, cy] = NW(250)
    const r = evaluateSpace(space('park', square(cx, cy, 40)), none, prop, win, opts)
    expect(r.area).toBe(1600)
    expect(r.swept).toBeGreaterThan(100)
    expect(r.firstNew).toBe('10:00')
    expect(r.detailed).toHaveLength(25)
    expect(r.basic.map((b) => b.label)).toEqual(['10:00', '12:00', '14:00', '16:00'])
    expect(r.basic[0].added).toBeGreaterThan(0)
    expect(r.basic[3].added).toBe(0) // by 16:00 the shadow points north-east
    expect(ruleState(r, RULES.park)).toBe('fail')
    expect(ruleState(r, RULES.minimise)).toBe('unknown')
    // Coverage % = sum of interval areas / (area × 25), per 5.2.1(c).
    expect(r.coverage.added).toBeCloseTo((100 * r.detailed.reduce((s, i) => s + i.added, 0)) / (1600 * 25), 6)
  })

  it('passes a park south of the tower, which the sun never puts in its shadow', () => {
    const r = evaluateSpace(space('south', square(0, -250, 40)), none, prop, win, opts)
    expect(r.swept).toBe(0)
    expect(ruleState(r, RULES.park)).toBe('pass')
  })

  it('counts only new shadow: a park already in a baseline tower\'s shadow gains none from the same tower', () => {
    const [cx, cy] = NW(250)
    const r = evaluateSpace(space('park', square(cx, cy, 40)), prop, prop, win, opts)
    expect(r.swept).toBe(0)
    expect(r.coverage.existing).toBeGreaterThan(0)
  })

  it('reads a shorter tower as clear where a taller one is not', () => {
    const [cx, cy] = NW(420)
    const tall = evaluateSpace(space('p', square(cx, cy, 30)), none, towerOccluders([tower({ height: 300 })]), win, opts)
    const short = evaluateSpace(space('p', square(cx, cy, 30)), none, towerOccluders([tower({ height: 100 })]), win, opts)
    expect(tall.swept).toBeGreaterThan(0)
    expect(short.swept).toBe(0)
  })
})

describe('sun-hours map', () => {
  it('gives open ground the whole window and takes hours away north-west of a tower', () => {
    const g = gridOver(-400, -400, 400, 400, 10)
    const m = sunHoursMap(none, towerOccluders([tower()]), g, studyWindow('equinox'), opts)
    expect(m.possible).toBeCloseTo(6)
    const k = (x: number, y: number) => Math.floor((y - g.y0) / g.cell) * g.nx + Math.floor((x - g.x0) / g.cell)
    expect(m.baseline[k(0, -300)]).toBeCloseTo(6)
    expect(m.proposal[k(0, -300)]).toBeCloseTo(6)
    const [x, y] = NW(150)
    expect(m.proposal[k(x, y)]).toBeLessThan(6)
    expect(m.covered[k(0, 0)]).toBe(1)
    const s = summariseHours(m, [0, 0], 300)
    expect(s.meanBaseline).toBeCloseTo(6)
    expect(s.meanProposal).toBeLessThan(6)
    expect(s.lostArea).toBeGreaterThan(0)
  })
})

describe('scene and evidence lines', () => {
  it('builds casters from podium and tower, and from imported storeys', () => {
    expect(towerOccluders([tower({ podiumHeight: 18, podiumWidth: 60, podiumDepth: 50 })]).prisms).toHaveLength(2)
    const imported = tower({
      imported: {
        meshId: 'm', fileName: 'a.obj', format: 'obj', unit: 'm', unitSource: 'file', fileNorthDeg: 0, northSource: 'file', datumShift: 0, datumSource: 'file',
        f2f: 4, podiumTop: 0, podiumF2F: 4, hull: [], volume: null, top: 8, health: { block: 0, warn: 0 },
        storeys: [0, 1].map((i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, area: 100, use: 'office' as const, podium: false, hasFloor: true, loops: [square(0, 0, 10), [[1, 1], [1, 2], [2, 2], [2, 1]] as Pt[]] })),
      },
    })
    expect(towerOccluders([imported]).prisms).toHaveLength(2) // the clockwise hole is not a caster
  })

  it('names the VTC model\'s plazas and keeps them out of Table 1', () => {
    const ctx = {
      meta: { true_north_deg_clockwise_from_plus_y: 45, north_note: '', source: '' }, site: null, blocks: [], curbs: [],
      plazas: [{ positions: [-102, -64, 0, -140, -64, 0, -140, -100, 0, -102, -100, 0], indices: [0, 1, 2, 2, 3, 0] }], midblock: [],
      buildings: [{ footprint: square(50, 50, 20), z0: 0, z1: 40 }], heritage: [], future_towers: [{ footprint: square(-50, 50, 20), z0: 18, z1: 200 }, { footprint: square(0, 90, 10), z0: 0, z1: null }],
      labels: [{ text: 'TRANSIT PLAZA', at: [-121.88, -92.19] }],
    } as unknown as VtcContext
    const s = vtcSpaces(ctx)
    expect(s[0].name).toBe('Transit plaza (VTC model)')
    expect(s[0].t1).toBeNull()
    expect(vtcOccluders(ctx).prisms).toHaveLength(2)
  })

  it('keeps a space outside Table 1 unresolved, and tests it only under a reading the team chooses', () => {
    const [cx, cy] = NW(250)
    const r = evaluateSpace(space('vtc-plaza-0', square(cx, cy, 40)), none, towerOccluders([tower()]), studyWindow('equinox'), opts)
    const lines = solarRuleResults([r], {}, { project: 'vtc', towers: [tower()] })
    const line = lines.find((l) => l.id === 'solar-space-vtc-plaza-0')!
    expect(line.state).toBe('unknown')
    expect(line.flag).toBe('unresolved')
    expect(line.note).toMatch(/would not comply/)
    const asPark = solarRuleResults([r], { 'vtc-plaza-0': 'park' }, { project: 'vtc', towers: [tower()] }).find((l) => l.id === 'solar-space-vtc-plaza-0')!
    expect(asPark.state).toBe('fail')
    expect(asPark.flag).toBe('team_assumption')
    expect(asPark.source.page).toBe('s.3.1.1, p.4')
    expect(lines[0].state).toBe('pass') // the sun self-test
    expect(lines.some((l) => l.id === 'solar-table1' && l.flag === 'unresolved')).toBe(true)
  })
})
