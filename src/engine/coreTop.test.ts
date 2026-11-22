// Tool cycle 12 (R7 Ridge Gate, R7_SYNTHESIS §3 tool 4): the core may end below an opening (Tower.coreTop). Storeys
// above the core top have no core: no core area or walls, no lift, no core stair; the lines say what that leaves.
import { describe, expect, it } from 'vitest'
import { exportProject, readProject, toDesign } from '../lib/project/projectFile'
import { defaultDesign } from '../lib/project/design'
import { defaultTower } from '../store'
import { egressCheck } from './egress'
import { interiorCheck, plateTower, DEFAULT_INTERIOR } from './interior'
import { liftCheck } from './lifts'
import { coreAreaAt, coreSideAt, coreTopLevel, coreTopZ, floorsAboveCore, hasCoreAt, netToGross, netToGrossAt, towerFloors } from './massing'
import { coreBoxes, coreStiffness, DEFAULT_WEIGHT_PRESETS, GAMMA_C, storeyCore, storeyWeights, wallAt } from './storeyWeight'
import { structureCheck } from './structure'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower, UseId } from './types'
import { windProcedure } from './windStructure'

// A free form through the import route in miniature: a podium, 40 storeys of a 44 m plate on a 20 m core at the
// centre, then four storeys of two 12 m ears either side of a 20 m gate (the core would stand in it), plant by default.
function gate(o: { top?: boolean; earUse?: UseId; earStairs?: number } = {}): Tower {
  const st = stack([
    { n: 3, f2f: 4.5, ring: rect(60, 60), podium: true },
    { n: 40, f2f: 4, ring: rect(44, 44) },
    { n: 4, f2f: 4, ring: rect(44, 44), use: o.earUse ?? 'mechanical' },
  ])
  for (const s of st.slice(-4)) { s.loops = [rect(12, 44, -16, 0), rect(12, 44, 16, 0)]; s.area = 2 * 12 * 44 }
  const t = importedTower(st, { podiumTop: 13.5, coreSide: 20 })
  return { ...t, interior: DEFAULT_INTERIOR, ...(o.top !== false ? { coreTop: 13.5 + 40 * 4 } : {}), ...(o.earStairs != null ? { earStairs: o.earStairs } : {}) }
}
const egressLine = (t: Tower, id: string) => egressCheck(t, undefined, undefined, 0).rules.find((r) => r.id === `${id}-${t.id}`)
const liftLine = (t: Tower, id: string) => liftCheck(t).rules.find((r) => r.id === `${id}-${t.id}`)
const srule = (t: Tower, id: string) => structureCheck(t, windProcedure(t)).rules.find((r) => r.id === id)!

describe('core.top: the core ends below an opening', () => {
  it('leaves the storeys above the core top without a core', () => {
    const t = gate(), fl = towerFloors(t)
    expect(coreTopZ(t)).toBe(173.5)
    expect(coreTopLevel(t)).toBe(43)
    expect(floorsAboveCore(t, fl).map((f) => f.level)).toEqual([44, 45, 46, 47])
    expect(hasCoreAt(t, 43)).toBe(true)
    expect(hasCoreAt(t, 44)).toBe(false)
    expect(coreSideAt(t, 43)).toBeCloseTo(20, 6)
    expect(coreSideAt(t, 44)).toBe(0)
    expect(coreAreaAt(t, 44)).toBe(0)
    const ear = fl.find((f) => f.level === 45)!
    expect(netToGrossAt(t, ear)).toBe(1)
    expect(netToGrossAt(t, fl.find((f) => f.level === 20)!)).toBe(netToGross(t))
    // homes and keys on a plate with no core
    expect(plateTower(t, ear).coreShare).toBe(0)
    // the core of each storey: none above the top, at the centre of the core below
    const at = storeyCore(t)
    expect(at(43).side).toBeCloseTo(20, 6)
    expect(at(44)).toMatchObject({ side: 0, x: 0, y: 0 })
    // the X-ray core and the export stop at the core top
    expect(coreBoxes(t).map((b) => [b.z0, b.z1, Math.round(b.side)])).toEqual([[0, 173.5, 20]])
  })

  it('changes nothing without a core top, or with one above every storey', () => {
    const t = gate({ top: false })
    expect(coreTopLevel(t)).toBe(Infinity)
    expect(coreSideAt(t, 47)).toBeCloseTo(20, 6)
    expect(coreBoxes(t)).toHaveLength(1)
    expect(coreBoxes(t)[0].z1).toBe(13.5 + 44 * 4)
    expect(egressLine(t, 'ear-exits')).toBeUndefined()
    expect(liftLine(t, 'core-top-lifts')).toBeUndefined()
    const high = { ...t, coreTop: 500 }
    expect(floorsAboveCore(high)).toEqual([])
    expect(coreSideAt(high, 47)).toBeCloseTo(20, 6)
    expect(egressLine(high, 'ear-exits')).toBeUndefined()
  })

  it('carries no core walls above the core top in the storey weights', () => {
    const t = gate(), w = storeyWeights(t), w0 = storeyWeights(gate({ top: false }))
    expect(w.coreTop).toBe(173.5)
    expect(w0.coreTop).toBeUndefined()
    const l45 = w.levels.find((l) => l.level === 45)!, l45o = w0.levels.find((l) => l.level === 45)!
    expect(l45.coreSide).toBe(0)
    // L45's floor carries half the walls of L44 and of L45 (2 m each): 4 walls × 20 m × thickness × 24 kN/m³
    const H = 13.5 + 44 * 4
    const walls = 4 * 20 * GAMMA_C * 2 * (wallAt(DEFAULT_WEIGHT_PRESETS, 173.5 + 2, H) + wallAt(DEFAULT_WEIGHT_PRESETS, 177.5 + 2, H))
    expect(l45o.W - l45.W).toBeCloseTo(walls, 0)
  })

  it('stops the core-alone cantilever at the core top and says so', () => {
    const t = gate(), c = coreStiffness(storeyWeights(t), t.height)
    expect(c.top).toBe(173.5)
    expect(c.f1).toBeGreaterThan(0)
    expect(Number.isFinite(c.pDelta)).toBe(true)
    expect(c.sections.every((s) => s.side > 0)).toBe(true)
    expect(coreStiffness(storeyWeights(gate({ top: false })), t.height).top).toBeUndefined()
    const core = srule(t, 'core-alone')
    expect(core.specialist).toMatch(/core ends at \+173\.5 m/)
    expect(core.note).toMatch(/upper bound/)
    expect(srule(t, 'continuity').value).toMatch(/declared to end at \+173\.5 m/)
    expect(srule(t, 'continuity').note).toMatch(/L44–L47 have no core/)
  })

  it('ends the lift rises at the core top and flags the storeys above', () => {
    const plant = gate()
    const served = liftCheck(plant).rises.flatMap((r) => r.floors.map((f) => f.level))
    expect(Math.max(...served)).toBeLessThanOrEqual(43)
    const l = liftLine(plant, 'core-top-lifts')!
    expect(l.state).toBe('warn')
    expect(l.value).toBe('no lift above L43: L44–L47, plant only, not served')
    expect(l.specialist).toBeTruthy()
    const hotel = liftLine(gate({ earUse: 'hotel' }), 'core-top-lifts')!
    expect(hotel.state).toBe('fail')
    expect(hotel.value).toMatch(/L44–L47 \(hotel\) not served/)
    // the core profile stops at the core top: no storey above it needs a core
    expect(Math.max(...liftCheck(plant).profile.map((c) => c.level))).toBe(43)
  })

  it('asks each ear for two exits of its own', () => {
    const none = egressLine(gate(), 'ear-exits')!
    expect(none.state).toBe('warn') // plant only, no stair declared
    expect(none.value).toBe('L44–L47 above the core top (+173.5 m): W ear (L44–L47, plant); E ear (L44–L47, plant); 0 exit stairs declared in each part')
    expect(none.specialist).toMatch(/plant-only/)
    expect(egressLine(gate({ earStairs: 2 }), 'ear-exits')!.state).toBe('pass')
    const hotel = egressLine(gate({ earUse: 'hotel', earStairs: 1 }), 'ear-exits')!
    expect(hotel.state).toBe('fail')
    expect(hotel.value).toMatch(/1 exit stair declared/)
    // north names the ears: on the competition frame (true north 45° clockwise from +y) the +x ear faces north-east
    const vtc = egressCheck(gate(), undefined, undefined, 45).rules.find((r) => r.id.startsWith('ear-exits'))!
    expect(vtc.value).toMatch(/SW ear .*; NE ear/)
  })

  it('works on a parametric tower too', () => {
    const p = { ...defaultTower('vtc'), interior: DEFAULT_INTERIOR }
    const fl = towerFloors(p)
    const t = { ...p, coreTop: fl[fl.length - 3].z0 }
    expect(floorsAboveCore(t).map((f) => f.level)).toEqual(fl.slice(-3).map((f) => f.level))
    expect(liftLine(t, 'core-top-lifts')!.state).toBe('fail') // occupied storeys above the core top
    const ex = egressLine(t, 'ear-exits')!
    expect(ex.state).toBe('fail')
    expect(ex.value).toMatch(/one part/)
    expect(() => structureCheck(t, windProcedure(t))).not.toThrow()
    expect(interiorCheck(t, fl).totals.homes).toBeGreaterThan(interiorCheck(p, fl).totals.homes - 1)
  })

  it('saves the core top and the ear stairs in the project file', () => {
    const d = defaultDesign()
    const design = { ...d, towers: { ...d.towers, vtc: [{ ...d.towers.vtc[0], coreTop: 240.5, earStairs: 2 }] } }
    const back = readProject(exportProject(design))
    expect(back.ok).toBe(true)
    const t = toDesign(back.file!).towers.vtc[0]
    expect(t.coreTop).toBe(240.5)
    expect(t.earStairs).toBe(2)
  })
})
