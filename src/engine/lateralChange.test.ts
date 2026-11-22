// Tool cycle 12 (R7 Ridge Gate: "the lateral system changes at +283.8 m, from a core to a frame ... TP4 must read it"):
// the lateral-system change at the core top, read honestly in Structure › Lateral & sway.
import { describe, expect, it } from 'vitest'
import { fixFor } from '../lib/fixes'
import { defaultTower } from '../store'
import { DEFAULT_INTERIOR } from './interior'
import { towerFloors } from './massing'
import { lateralChange, lateralChangeLines } from './lateralChange'
import { storeyWeights } from './storeyWeight'
import { structureCheck, structureTabOf } from './structure'
import { withStructureOnly } from './structureOnly'
import { importedTower, rect, stack } from './testStoreys'
import type { Aperture, RuleResult, Tower } from './types'
import { windProcedure } from './windStructure'

// The Ridge Gate in miniature (as aperture.test.ts): a 16.5 m core ending at +173.5 m under four storeys of two plant
// ears either side of a 30 m gate, with or without a structure-only bridge over them.
function ridge(bridge = true): Tower {
  const st = stack([
    { n: 3, f2f: 4.5, ring: rect(70, 70), podium: true },
    { n: 40, f2f: 4, ring: rect(54, 54) },
    { n: 4, f2f: 4, ring: rect(54, 54), use: 'mechanical' },
    ...(bridge ? [{ n: 1, f2f: 5, ring: rect(36, 6), use: 'mechanical' as const }] : []),
  ])
  for (const s of st.slice(43, 47)) { s.loops = [rect(12, 54, -21, 0), rect(12, 54, 21, 0)]; s.area = 2 * 12 * 54 }
  if (bridge) st[47] = withStructureOnly(st[47], [rect(36, 6)])
  const t = importedTower(st, { podiumTop: 13.5, coreSide: 16.5 })
  return { ...t, interior: DEFAULT_INTERIOR, coreTop: 173.5, apertures: [GATE] }
}
const GATE: Aperture = { label: 'Ridge Gate', z0: 173.5, z1: 189.5, bearing: 0, width: 30 }
const lines = (t: Tower, rules?: RuleResult[]) => lateralChangeLines(t, storeyWeights(t), { north: 0, rules })

describe('the lateral-system change at the core top', () => {
  it('reads the Ridge Gate: the ears as separate frames tied by the bridge, a Type 3 jump, never a pass', () => {
    const t = ridge(), c = lateralChange(t, storeyWeights(t))!
    expect(c.last).toBe(43)
    expect(c.levels).toEqual([44, 45, 46, 47])
    expect(c.parts).toBe(2)
    expect(c.names).toEqual(['W ear', 'E ear'])
    expect(c.tie).toEqual({ kind: 'bridge', z0: 189.5, z1: 194.5 })
    expect(c.coreSide).toBeCloseTo(16.5, 6)
    expect(c.extent).toBeCloseTo(54, 6)
    expect(c.share).toBeGreaterThan(0)
    expect(c.share).toBeLessThan(0.2)
    const [l] = lines(t)
    expect(l.id).toBe('lateral-change')
    expect(l.state).toBe('warn')
    expect(l.flag).toBe('unverified')
    expect(l.specialist).toMatch(/changes at \+173\.5 m from the core to separate frames/)
    expect(l.value).toMatch(/^at \+173\.5 m \(above L43\) the core ends: L44–L47 carried by the W ear and E ear as separate frames, tied by the structure-only bridge at \+189\.5–194\.5 m; SFRS plan dimension 16\.5 m core → 54\.0 m of frame \(327%\)/)
    expect(l.note).toMatch(/Type 3 irregularity/)
    expect(l.note).toMatch(/not computed/)
    expect(fixFor('lateral-change', l.state, l.value, l.threshold, l.flag)).toMatch(/carry the core to the roof/)
  })

  it('says when nothing ties the ears, and reads one storey above the core as a frame on the core top', () => {
    expect(lines(ridge(false))[0].value).toMatch(/standing apart \(nothing ties them\)/)
    const p = { ...defaultTower('vtc'), interior: DEFAULT_INTERIOR }
    const fl = towerFloors(p)
    const [l] = lines({ ...p, coreTop: fl[fl.length - 4].z0 })
    expect(l.value).toMatch(/carried by a frame on the core top/)
    expect(l.state).toBe('warn')
  })

  it('stays silent while the core runs to the roof', () => {
    const t = { ...ridge(), coreTop: undefined }
    expect(lines(t)).toEqual([])
    expect(structureCheck(t, windProcedure(t)).rules.some((r) => r.id === 'lateral-change')).toBe(false)
  })

  it('names an open-storey soft or weak storey check when the tool has one, and does not repeat it', () => {
    const soft: RuleResult = { id: 'soft-storey', label: 'Open storey: soft or weak storey', value: '', threshold: '', state: 'warn', flag: 'verified', source: { label: 'x' } }
    expect(lines(ridge(), [soft])[0].note).toMatch(/read by "Open storey: soft or weak storey"/)
    expect(lines(ridge())[0].note).toMatch(/No storey stiffness or strength is computed here/)
  })

  it('shows under Structure › Lateral & sway', () => {
    const t = ridge()
    const l = structureCheck(t, windProcedure(t)).rules.find((r) => r.id === 'lateral-change')!
    expect(l).toBeTruthy()
    expect(structureTabOf('lateral-change')).toBe('lateral')
  })
})
