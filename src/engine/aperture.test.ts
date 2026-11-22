// Tool cycle 12 (R7 Ridge Gate, R7_SYNTHESIS §1 Concept 2 and §3 tool 4): an opening cut through the tower along a line
// of sight. Its lines read the core inside it, the sky through it and what spans its head as a tie between the ears.
import { describe, expect, it } from 'vitest'
import { exportProject, readProject, toDesign } from '../lib/project/projectFile'
import { defaultDesign } from '../lib/project/design'
import { fixFor, ruleKey } from '../lib/fixes'
import { liftCheck } from './lifts'
import { defaultTower } from '../store'
import { egressCheck } from './egress'
import { DEFAULT_INTERIOR } from './interior'
import { apertureDir, apertureLines, apertureReading, OVERCAST_ARCMIN2 } from './openingField'
import { structureCheck, structureTabOf } from './structure'
import { withStructureOnly } from './structureOnly'
import { importedTower, rect, stack } from './testStoreys'
import type { Aperture, Tower } from './types'
import { windProcedure } from './windStructure'

// The Ridge Gate in miniature: 40 storeys of a 54 m plate on a 16.5 m core, then four plant storeys of two 12 m ears
// either side of a 30 m gate (+173.5–189.5 m), and over them a bridge 36 × 6 m (structure-only, 5 m deep unless set).
function ridge(o: { top?: number | null; bridge?: 'structure' | 'floors' | 'none'; depth?: number } = {}): Tower {
  const runs = [
    { n: 3, f2f: 4.5, ring: rect(70, 70), podium: true },
    { n: 40, f2f: 4, ring: rect(54, 54) },
    { n: 4, f2f: 4, ring: rect(54, 54), use: 'mechanical' as const },
    ...((o.bridge ?? 'structure') === 'structure' ? [{ n: 1, f2f: o.depth ?? 5, ring: rect(36, 6), use: 'mechanical' as const }] : []),
    ...(o.bridge === 'floors' ? [{ n: 2, f2f: 4, ring: rect(54, 54), use: 'mechanical' as const }] : []),
  ]
  const st = stack(runs)
  for (const s of st.slice(43, 47)) { s.loops = [rect(12, 54, -21, 0), rect(12, 54, 21, 0)]; s.area = 2 * 12 * 54 }
  if ((o.bridge ?? 'structure') === 'structure') st[47] = withStructureOnly(st[47], [rect(36, 6)])
  const t = importedTower(st, { podiumTop: 13.5, coreSide: 16.5 })
  const top = o.top === undefined ? 173.5 : o.top
  return { ...t, interior: DEFAULT_INTERIOR, ...(top != null ? { coreTop: top } : {}) }
}
const GATE: Aperture = { label: 'Ridge Gate', z0: 173.5, z1: 189.5, bearing: 0, width: 30, distance: 4710, overcast: true }
const line = (t: Tower, id: string, a: Aperture = GATE) => apertureLines({ ...t, apertures: [a] }, 0).find((r) => r.id === id)!

describe('apertures: an opening along a line of sight', () => {
  it('reads the Ridge Gate: clear of the core, 480 m² of sky, 256 arcmin² from QE Park, a bridge tying the ears', () => {
    const r = apertureReading(ridge(), GATE, 0)
    expect(r.rows.map((x) => x.level)).toEqual([44, 45, 46, 47])
    expect(r.core).toBeNull()
    expect(r.clearArea).toBeCloseTo(480, 6)
    expect(r.gross).toBeCloseTo(480, 6)
    // the R7 synthesis' arithmetic: 30 × 16 m at 4.71 km is 256 arcmin², just over the overcast line
    expect(r.arcmin2).toBeCloseTo(255.7, 1)
    expect(r.outline.reduce((s, q) => s + (q.u1 - q.u0) * (q.z1 - q.z0), 0)).toBeCloseTo(480, 6)
    expect(r.head).toEqual({ z0: 189.5, z1: 194.5, depth: 5, structureOnly: true })
    expect(r.ears.map((e) => e.name)).toEqual(['E ear', 'W ear'])
    const core = line(ridge(), 'aperture-core'), sky = line(ridge(), 'aperture-sky'), bridge = line(ridge(), 'aperture-bridge')
    expect(core.state).toBe('pass')
    expect(core.value).toBe('Ridge Gate: clear: the core ends at +173.5 m, at or below the sill (+173.5 m)')
    expect(sky.state).toBe('pass')
    expect(sky.value).toBe('Ridge Gate: clear 480 of 480 m² (30.0 × 16.0 m); straight on from 4.71 km: 256 arcmin²')
    expect(bridge.state).toBe('pass')
    expect(bridge.value).toMatch(/5\.0 m deep structure-only bridge at \+189\.5–194\.5 m spans the 30\.0 m opening and ties the E ear and W ear: span\/depth 6\.0/)
    expect(bridge.specialist).toBeTruthy()
    // a 16.5 m gate (the top core's width) is under the overcast line
    const narrow = line(ridge(), 'aperture-sky', { ...GATE, width: 16.5 })
    expect(narrow.state).toBe('warn')
    expect(Number(/(\d+) arcmin²$/.exec(narrow.value)![1])).toBeLessThan(OVERCAST_ARCMIN2)
  })

  it('fails when the core stands in the opening, in full or in part', () => {
    const full = line(ridge({ top: null }), 'aperture-core')
    expect(full.state).toBe('fail')
    expect(full.value).toBe('Ridge Gate: the 16.5 m core stands in the opening over +173.5–189.5 m (16.0 of 16.0 m)')
    expect(apertureReading(ridge({ top: null }), GATE, 0).clearArea).toBeCloseTo((30 - 16.5) * 16, 6)
    const half = line(ridge({ top: 181.5 }), 'aperture-core')
    expect(half.value).toMatch(/over \+173\.5–181\.5 m \(8\.0 of 16\.0 m\)/)
    expect(fixFor('aperture-core', 'fail', full.value, full.threshold, full.flag)).toMatch(/Core top/)
    // ears beside a core that reaches them are not the core's: Egress asks them for their own exits
    const ex = egressCheck({ ...ridge({ top: null }), apertures: [GATE] }, undefined, undefined, 0).rules.find((x) => x.id.startsWith('ear-exits'))!
    expect(ex.value).toMatch(/^L44–L47 beside an opening: W ear .*; E ear /)
  })

  it('reads what spans the head: a shallow bridge, floors, or nothing', () => {
    const shallow = line(ridge({ depth: 2 }), 'aperture-bridge')
    expect(shallow.state).toBe('warn')
    expect(shallow.value).toMatch(/span\/depth 15\.0/)
    expect(fixFor('aperture-bridge', 'warn', shallow.value, shallow.threshold, shallow.flag)).toMatch(/deepen/)
    const floors = line(ridge({ bridge: 'floors' }), 'aperture-bridge')
    expect(floors.state).toBe('warn')
    expect(floors.value).toMatch(/floors span the 30\.0 m opening at \+189\.5–197\.5 m, tying the E ear and W ear/)
    const none = line(ridge({ bridge: 'none' }), 'aperture-bridge')
    expect(none.state).toBe('unknown')
    expect(none.value).toMatch(/no bridge over the opening: the E ear and W ear stand as two separate towers/)
  })

  it('turns a true bearing into the tower frame with the project north', () => {
    const t = ridge()
    const d = apertureDir(t, { z0: 0, z1: 1, width: 1, bearing: 315 }, 45)
    expect(d[0]).toBeCloseTo(0, 9)
    expect(d[1]).toBeCloseTo(1, 9)
    const turned = apertureDir({ rotation: 90 }, { z0: 0, z1: 1, width: 1, bearing: 0 }, 0)
    expect(turned[0]).toBeCloseTo(1, 9)
    expect(turned[1]).toBeCloseTo(0, 9)
    expect(apertureDir(t, { z0: 0, z1: 1, width: 1, axis: 90 })[1]).toBeCloseTo(1, 9)
  })

  it('says a parametric box has no cut, and shows the lines under Lateral & sway', () => {
    const p = { ...defaultTower('vtc'), apertures: [{ z0: 200, z1: 216, bearing: 0, width: 20 }] }
    const sky = apertureLines(p, 45).find((r) => r.id === 'aperture-sky')!
    expect(sky.value).toMatch(/clear 0 of 320 m²/)
    expect(sky.state).toBe('warn')
    expect(sky.specialist).toMatch(/parametric box/)
    expect(fixFor('aperture-sky', 'warn', sky.value, sky.threshold, sky.flag)).toMatch(/cut it in the model/)
    const rules = structureCheck({ ...ridge(), apertures: [GATE] }, windProcedure(ridge())).rules
    for (const id of ['aperture-core', 'aperture-sky', 'aperture-bridge']) {
      expect(rules.some((r) => r.id === id)).toBe(true)
      expect(structureTabOf(id)).toBe('lateral')
    }
    expect(structureCheck(ridge(), windProcedure(ridge())).rules.some((r) => r.id.startsWith('aperture'))).toBe(false)
  })

  it('gives every new warning and failure an instruction of its own', () => {
    const lines = [ridge({ top: null }), ridge({ depth: 2 }), { ...ridge(), earStairs: 1 }, ridge({ bridge: 'floors' })].flatMap((t0) => {
      const t = { ...t0, apertures: [{ ...GATE, width: 16.5 }] }
      return [...structureCheck(t, windProcedure(t)).rules, ...egressCheck(t).rules, ...liftCheck(t).rules].map((r) => ({ r, t }))
    }).filter(({ r }) => (r.state === 'warn' || r.state === 'fail') && /^(aperture|ear-exits|core-top)/.test(ruleKey(r.id, 'i')))
    expect(new Set(lines.map(({ r }) => ruleKey(r.id, 'i')))).toEqual(new Set(['aperture-core', 'aperture-sky', 'aperture-bridge', 'ear-exits', 'core-top-lifts']))
    for (const { r } of lines) expect(fixFor(ruleKey(r.id, 'i'), r.state, r.value, r.threshold, r.flag) ?? '').not.toMatch(/^Rule: |See Details for the rule/)
  })

  it('saves the openings in the project file', () => {
    const d = defaultDesign()
    const design = { ...d, towers: { ...d.towers, vtc: [{ ...d.towers.vtc[0], apertures: [GATE] }] } }
    const back = readProject(exportProject(design))
    expect(back.ok).toBe(true)
    expect(toDesign(back.file!).towers.vtc[0].apertures).toEqual([GATE])
  })
})
