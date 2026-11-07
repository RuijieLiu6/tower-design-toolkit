import { describe, expect, it } from 'vitest'
import { DEFAULT_FACADE, facadeCheck, faces, zoneTop, type FacadeInput } from './facade'
import type { Tower } from './types'

const tower = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 20, height: 100, f2f: 4, podiumHeight: 0, podiumWidth: 60, podiumDepth: 40,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, ...patch,
})
const input = (patch: Partial<FacadeInput> = {}): FacadeInput => ({ ...DEFAULT_FACADE, ...patch })

describe('facade layout (P12-M06a)', () => {
  it('finds four faces facing true N, E, S and W when the model grid is true north', () => {
    const f = faces([tower()], input(), 0)
    expect(f.map((x) => x.bin).sort()).toEqual(['E', 'N', 'S', 'W'])
    expect(f.find((x) => x.bin === 'N')!.length).toBeCloseTo(40, 6)
    expect(f.find((x) => x.bin === 'E')!.area).toBeCloseTo(20 * 100, 6)
  })
  it('turns faces with the VTC north (45°): the model +Y face looks north-west', () => {
    const f = faces([tower()], input(), 45)
    expect(f.find((x) => Math.abs(x.length - 40) < 1e-6 && x.azimuth > 300)!.bin).toBe('NW')
  })
  it('flags faces near a bin edge (±5°)', () => {
    expect(faces([tower()], input(), 22.5).every((x) => x.binFlips)).toBe(true)
    expect(faces([tower()], input(), 0).some((x) => x.binFlips)).toBe(false)
  })
  it('applies WWR by facing, with the system preset as default', () => {
    const r = facadeCheck([tower()], input({ wwr: { N: 0.3, E: null, S: 0.5, W: null } }), 0)
    const wall = 2 * (40 + 20) * 100
    expect(r.wall).toBeCloseTo(wall, 6)
    expect(r.glass).toBeCloseTo(40 * 100 * (0.3 + 0.5) + 2 * 20 * 100 * 0.6, 6)
  })
  it('adds the podium as its own faces', () => {
    const f = faces([tower({ podiumHeight: 18 })], input(), 0)
    expect(f.filter((x) => x.part === 'podium')).toHaveLength(4)
    expect(f.find((x) => x.part === 'tower')!.z0).toBe(18)
  })
})

describe('glazing checks (P12-M06b)', () => {
  it('measures glass in the bird zone to 16 m, or 4 m above taller vegetation', () => {
    expect(zoneTop(0)).toBe(16)
    expect(zoneTop(14)).toBe(18)
    const r = facadeCheck([tower()], input({ treated: 0.9 }), 0)
    expect(r.zoneGlass).toBeCloseTo(2 * (40 + 20) * 16 * 0.6, 6)
    expect(r.rules.find((x) => x.id === 'fa-bird')?.state).toBe('pass')
    expect(facadeCheck([tower()], input({ treated: 0.6 }), 0).rules.find((x) => x.id === 'fa-bird')?.state).toBe('warn')
    expect(facadeCheck([tower()], input({ treated: 0.3 }), 0).rules.find((x) => x.id === 'fa-bird')?.state).toBe('fail')
  })
  it('shows WWR, VLT and SHGC lines without a pass badge', () => {
    const r = facadeCheck([tower()], input({ vlt: 0.6, shgc: 0.3 }), 0).rules
    for (const id of ['fa-wwr', 'fa-vlt', 'fa-shgc']) expect(r.find((x) => x.id === id)?.state).toBe('unknown')
    expect(facadeCheck([tower()], input(), 0).rules.find((x) => x.id === 'fa-vlt')?.flag).toBe('unresolved')
  })
})

describe('bird-friendly glass shared with City in Nature (node audit, 7 Nov)', () => {
  it('names where the treated share came from when it was not entered here', () => {
    const towers = [tower()]
    const bird = (patch: Partial<FacadeInput>) => facadeCheck(towers, input(patch), 45).rules.find((r) => r.id === 'fa-bird')!
    expect(bird({ treated: 0.9, treatedFrom: 'the City in Nature ledger' }).note).toMatch(/^Treated share from the City in Nature ledger\. /)
    expect(bird({ treated: 0.9 }).note).not.toMatch(/^Treated share from/)
    expect(bird({ treated: 0.9, treatedFrom: 'the City in Nature ledger' }).state).toBe('pass')
  })
})
