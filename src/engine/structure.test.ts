import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { towerFloors } from './massing'
import { SEISMIC_FALSE_ASSUMPTIONS, structureCheck, suggestOutriggers } from './structure'
import type { Tower } from './types'
import { windProcedure } from './windStructure'

const vtc = (patch: Partial<Tower> = {}): Tower => ({ ...useStore.getInitialState().towers.vtc[0], ...patch })
const city = (patch: Partial<Tower> = {}): Tower => ({ ...useStore.getInitialState().towers.city[0], ...patch })
const run = (t: Tower) => structureCheck(t, windProcedure(t))
const rule = (r: ReturnType<typeof run>, id: string) => r.rules.find((x) => x.id === id)

describe('structure screening (P10-M01, M03, M05)', () => {
  it('downtown Vancouver is SC4 and a 285 m tower needs dynamic analysis', () => {
    const r = run(vtc())
    expect(r.seismicCategory).toBe('SC4')
    expect(rule(r, 'seismic-category')!.value).toMatch(/1\.04 g/)
    expect(rule(r, 'dynamic')!.state).toBe('warn')
  })
  it('gives the empirical wall period for seismic forces only', () => {
    const r = run(vtc())
    expect(r.Ta).toBeCloseTo(0.05 * 285 ** 0.75, 6)
    expect(r.Ta).toBeGreaterThan(3.4)
    expect(rule(r, 'period')!.note).toMatch(/never as the wind frequency/)
  })
  it('the modelled core is continuous; an imported mass is not judged', () => {
    expect(rule(run(vtc()), 'continuity')!.state).toBe('pass')
    expect(rule(run(vtc({ imported: { storeys: [], f2f: 4, podiumTop: 0, podiumF2F: 4.5, top: 285 } as unknown as Tower['imported'] })), 'continuity')!.state).toBe('unknown')
  })
  it('flags the podium-to-tower step as a weight irregularity (floor area as the proxy)', () => {
    const w = rule(run(vtc()), 'weight')!
    expect(w.state).toBe('warn') // 100 × 64 m podium over a 46 × 46 m plate: about 302%
    expect(w.value).toMatch(/302%/)
    expect(rule(run(city()), 'weight')!.state).toBe('pass') // no podium: uniform
  })
  it('keeps only valid tower levels as outriggers, and puts the outrigger system on the shortlist', () => {
    const levels = towerFloors(vtc()).filter((f) => !f.podium).map((f) => f.level)
    const r = run(vtc({ outriggerFloors: [levels[30], 2, 999, levels[30]] }))
    expect(r.outriggers).toEqual([levels[30]])
    expect(rule(r, 'outriggers')!.value).toBe(`L${levels[30]}`)
    const sys = r.systems.find((s) => s.id === 'outriggers')!
    expect(sys.fit).toBe('shortlist')
    expect(sys.reason).toMatch(/You placed outriggers/)
    expect(rule(run(vtc()), 'outriggers')).toBeUndefined()
  })
  it('suggests outriggers near 1/2 and 2/3 of the height on tall towers only', () => {
    const t = vtc()
    const s = suggestOutriggers(t)
    const z = (l: number) => towerFloors(t).find((f) => f.level === l)!.z0
    expect(s.length).toBe(2)
    expect(Math.abs(z(s[0]) - 0.5 * t.height)).toBeLessThan(t.f2f)
    expect(Math.abs(z(s[1]) - 0.67 * t.height)).toBeLessThan(t.f2f)
    expect(suggestOutriggers(city({ height: 60 }))).toEqual([])
  })
  it('keeps the corrected hazard assumption visible', () => {
    expect(SEISMIC_FALSE_ASSUMPTIONS[0].claim).toMatch(/0\.85 g/)
  })
})
