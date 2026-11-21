// G18 (vtc-entry TOOL_DEFICITS): the core was one fixed square for the whole height, so deeper setbacks left little
// depth from core to glass (tower C: 9 m steps leave 6 m) and tower A's scheme needed a separate residential core.
// A core can now step with the tiers (Tower.coreSteps), and each storey reads its own core.
import { describe, expect, it } from 'vitest'
import { exportProject, readProject, toDesign } from '../lib/project/projectFile'
import { defaultDesign } from '../lib/project/design'
import { screenUse } from './daylightDepth'
import { interiorCheck, plateTower } from './interior'
import { DEFAULT_LIFT_PRESETS, liftCheck } from './lifts'
import { coreSide, coreSideAt, coreStepAt, coreStepsOf, netToGross, netToGrossAt, towerFloors } from './massing'
import { coreBoxes, gravityEccentricity, storeyWeights, DEFAULT_WEIGHT_PRESETS, GAMMA_C } from './storeyWeight'
import { structureCheck } from './structure'
import { importedTower, rect, stack } from './testStoreys'
import type { CoreStep, Tower } from './types'
import { DEFAULT_INTERIOR } from './interior'
import { windProcedure } from './windStructure'

const run = (t: Tower) => structureCheck(t, windProcedure(t))
const srule = (t: Tower, id: string) => run(t).rules.find((x) => x.id === id)!
const lrule = (t: Tower, id: string) => liftCheck(t).rules.find((x) => x.id === `${id}-${t.id}`)!
const homesOn = (t: Tower, level: number) => { const fl = towerFloors(t); return interiorCheck({ ...t, interior: DEFAULT_INTERIOR }, fl.filter((f) => f.level === level)).totals.homes }

// Tower C's proposal in miniature (structural review, 21 Nov): a podium, then 9 m steps held to the (−x, +y) corner:
// 54 m (L5–L42) on the core at (30, 0), 45 m (L43–L50) and 36 m (L51–L60), all homes.
const C = (steps?: CoreStep[]): Tower => {
  const t = importedTower(stack([
    { n: 4, f2f: 4, ring: rect(76, 76, 30, 0), podium: true },
    { n: 38, f2f: 3.2, ring: rect(54, 54, 30, 0) },
    { n: 8, f2f: 3.2, ring: rect(45, 45, 25.5, 4.5) },
    { n: 10, f2f: 3.2, ring: rect(36, 36, 21, 9) },
  ]), { podiumTop: 16, coreSide: 24 })
  return { ...t, coreCentre: [30, 0], interior: DEFAULT_INTERIOR, ...(steps ? { coreSteps: steps } : {}) }
}
const C_STEPS: CoreStep[] = [{ fromLevel: 5, side: 24, centre: [30, 0] }, { fromLevel: 43, side: 19.5, centre: [27.75, 2.25] }, { fromLevel: 51, side: 15, centre: [25.5, 4.5] }]

// A plain 60-storey residential tower on one 44 m plate with a 24 m core, for the task's 24 → 16 m case.
const plain = (steps?: CoreStep[]): Tower => {
  const t = importedTower(stack([{ n: 3, f2f: 4.5, ring: rect(60, 60), podium: true }, { n: 60, f2f: 3.2, ring: rect(44, 44) }]), { podiumTop: 13.5, coreSide: 24 })
  return { ...t, interior: DEFAULT_INTERIOR, ...(steps ? { coreSteps: steps } : {}) }
}

describe('G18: the core of each storey', () => {
  it('reads each level’s step, and the core share’s core below the first step', () => {
    const t = C(C_STEPS)
    expect(coreStepsOf({ ...t, coreSteps: [C_STEPS[2], C_STEPS[0], { fromLevel: 7, side: 0 }, C_STEPS[1]] }).map((s) => s.fromLevel)).toEqual([5, 43, 51]) // sorted; a zero side is dropped
    expect(coreSideAt(t, 2)).toBeCloseTo(24, 6) // the podium: the core share's core
    expect(coreSideAt(t, 42)).toBe(24)
    expect(coreSideAt(t, 43)).toBe(19.5)
    expect(coreSideAt(t, 60)).toBe(15)
    expect(coreStepAt(t, 4)).toBeNull()
    // Without steps nothing changes.
    const f = towerFloors(t).find((x) => x.level === 55)!
    expect(netToGrossAt(C(), f)).toBe(netToGross(C()))
    expect(netToGrossAt(t, f)).toBeCloseTo(1 - 225 / (36 * 36), 9)
  })

  it('lays out more homes on the upper floors with a 24 m core stepping to 16 m above level 50', () => {
    const fixed = plain(), stepped = plain([{ fromLevel: 51, side: 16 }])
    const fl = towerFloors(fixed)
    expect(plateTower(stepped, fl.find((f) => f.level === 55)!).coreShare * 44 * 44).toBeCloseTo(256, 6)
    expect(plateTower(stepped, fl.find((f) => f.level === 40)!).coreShare * 44 * 44).toBeCloseTo(576, 6)
    expect(homesOn(stepped, 55)).toBeGreaterThan(homesOn(fixed, 55))
    expect(homesOn(stepped, 40)).toBe(homesOn(fixed, 40))
    expect(interiorCheck(stepped, fl).totals.homes).toBeGreaterThan(interiorCheck(fixed, fl).totals.homes)
  })

  it('gives tower C’s upper tiers their homes back with its stepped core (24 → 19.5 → 15 m)', () => {
    const fixed = C([C_STEPS[0]]), stepped = C(C_STEPS)
    const fl = towerFloors(stepped)
    expect(homesOn(stepped, 45)).toBeGreaterThan(homesOn(fixed, 45))
    expect(homesOn(stepped, 55)).toBeGreaterThan(homesOn(fixed, 55))
    expect(homesOn(stepped, 20)).toBe(homesOn(fixed, 20))
    expect(interiorCheck(stepped, fl).totals.homes).toBeGreaterThan(interiorCheck(fixed, fl).totals.homes)
    // On the 36 m tier a 24 m core and its corridor leave 4.2 m to the glass; the 15 m core leaves 8.7 m.
    const home = (t: Tower) => interiorCheck(t, fl.filter((f) => f.level === 55)).home!
    expect(home(fixed).depth).toBeCloseTo((36 - 24 - 2 * 1.8) / 2, 6)
    expect(home(stepped).depth).toBeCloseTo((36 - 15 - 2 * 1.8) / 2, 6)
  })

  it('reads the daylight depth from the screened floor’s own core', () => {
    const fl = towerFloors(plain())
    const a = screenUse(plain(), 'residential', fl)!, b = screenUse(plain([{ fromLevel: 1, side: 16 }]), 'residential', fl)!
    expect(a.plate.hole).toBeCloseTo(24 + 3.6, 6)
    expect(b.plate.hole).toBeCloseTo(16 + 3.6, 6)
    // The smaller core gives back floor, deeper from the glass: the depth grows and a smaller share is within reach.
    expect(b.depthLong).toBeCloseTo((44 - 19.6) / 2, 6)
    expect(b.depthLong).toBeGreaterThan(a.depthLong)
    expect(b.withinReach).toBeLessThan(a.withinReach)
  })
})

describe('G18: storey weights and the off-centre lines take each storey’s own core', () => {
  it('moves each step’s wall weight with it, and measures each level from its own core', () => {
    const fixed = storeyWeights(C([C_STEPS[0]])), stepped = storeyWeights(C(C_STEPS))
    const at = (w: typeof fixed, level: number) => w.levels.find((l) => l.level === level && !l.roof)!
    expect(at(stepped, 55)).toMatchObject({ coreX: 25.5, coreY: 4.5, coreSide: 15 })
    expect(at(stepped, 45)).toMatchObject({ coreX: 27.75, coreY: 2.25, coreSide: 19.5 })
    expect(at(fixed, 55)).toMatchObject({ coreX: 30, coreY: 0, coreSide: 24 })
    // A typical L55 floor carries 3.2 m of walls: 4 × (24 − 15) m × 0.6 m × 24 kN/m³ lighter.
    expect(at(fixed, 55).W - at(stepped, 55).W).toBeCloseTo(4 * 9 * DEFAULT_WEIGHT_PRESETS.coreWall * GAMMA_C * 3.2, 6)
    // The walls move with the core: the L55 weight centre sits nearer its own core than to the fixed one.
    const e = (w: typeof fixed, level: number) => { const l = at(w, level); return Math.hypot(l.cx - l.coreX!, l.cy - l.coreY!) }
    expect(e(stepped, 55)).toBeLessThan(Math.hypot(4.5, 4.5))
    expect(e(stepped, 55)).toBeLessThan(e(fixed, 55))
    // Each level's moment about its own core: offsets, net offset and sustained sway all fall with a core that follows the tiers.
    const gs = gravityEccentricity(stepped, C(C_STEPS).height), gf = gravityEccentricity(fixed, C().height)
    const off = (g: typeof gs, level: number) => g.levels.find((l) => l.level === level)!
    expect(off(gs, 55).e).toBeCloseTo(e(stepped, 55), 9)
    expect(off(gf, 55).e).toBeCloseTo(e(fixed, 55), 9)
    expect(gs.largest!.e).toBeLessThan(gf.largest!.e)
    expect(gs.sway.lt).toBeLessThan(gf.sway.lt)
    // A step whose centre does not follow the tier (left on the core below) reads the full offset.
    const lazy = storeyWeights(C(C_STEPS.map((s) => ({ fromLevel: s.fromLevel, side: s.side, ...(s.fromLevel === 5 ? { centre: s.centre } : {}) }))))
    expect(at(lazy, 55)).toMatchObject({ coreX: 30, coreY: 0 })
    expect(gravityEccentricity(lazy, C().height).largest!.e).toBeGreaterThan(gs.largest!.e)
  })

  it('checks that each upper core stands inside the core below, and reads Type 3 from the steps', () => {
    const c = srule(C(C_STEPS), 'continuity')
    expect(c.state).toBe('pass')
    expect(c.value).toBe('the core steps in 2 times, each upper core inside the one below')
    expect(c.note).toMatch(/L1 24\.0 m at \(30\.0, 0\.0\) → L43 19\.5 m at \(27\.8, 2\.3\) → L51 15\.0 m at \(25\.5, 4\.5\)/)
    // 24 → 19.5 is 123%, 19.5 → 15 exactly 130%: within Type 3.
    const g = srule(C(C_STEPS), 'geometric')
    expect(g.state).toBe('pass')
    expect(g.value).toBe('core 19.5 → 15.0 m at L51: 130%')
    // The task's 24 → 16 m step is 150%: Type 3.
    expect(srule(plain([{ fromLevel: 51, side: 16 }]), 'geometric')).toMatchObject({ state: 'warn', value: 'core 24.0 → 16.0 m at L51: 150%' })
    // An upper core outside the one below needs a transfer.
    const off = srule(C([C_STEPS[0], { fromLevel: 43, side: 19.5, centre: [25.75, 2.25] }]), 'continuity')
    expect(off.state).toBe('fail')
    expect(off.value).toBe('the core from L43 stands 2.0 m outside the core below')
    expect(srule(C(C_STEPS), 'gravity-offset').note).toMatch(/each storey against the core of its own step \(from L43 at \(27\.8, 2\.3\), from L51 at \(25\.5, 4\.5\)\), whose walls move with it/)
    // No steps: the old lines.
    expect(srule(C(), 'geometric').value).toBe('core constant over the height')
  })

  it('draws and exports one core box per step', () => {
    const b = coreBoxes(C(C_STEPS))
    expect(b).toHaveLength(3) // the podium's core share core is the 24 m step's: one box
    expect(b[0].side).toBeCloseTo(24, 6)
    expect(b.slice(1).map((x) => [x.side, x.x, x.y])).toEqual([[19.5, 27.75, 2.25], [15, 25.5, 4.5]])
    expect(b[0].z0).toBe(0)
    expect(b[1].z0).toBeCloseTo(16 + 38 * 3.2, 6)
    expect(b[2].z1).toBeCloseTo(16 + 56 * 3.2, 6)
    expect(coreBoxes(C())).toHaveLength(1)
  })
})

describe('G18: lifts and the core-fit line, step by step', () => {
  it('checks each core step against the cars of the rises that pass through it', () => {
    const t = plain([{ fromLevel: 51, side: 16 }])
    const r = liftCheck(t)
    const fit = lrule(t, 'core-fit')
    // The rises run from grade; at L55 only the rise that serves the top storeys passes.
    const through = r.rises.filter((x) => x.baseZ <= 0.5 && x.topZ >= towerFloors(t).find((f) => f.level === 55)!.z0)
    const l55 = r.profile.find((c) => c.level === 55)!
    expect(l55.passenger).toBeCloseTo(through.reduce((s, x) => s + x.cars, 0) * DEFAULT_LIFT_PRESETS.shaftM2, 9)
    expect(r.profile.find((c) => c.level === 5)!.passenger).toBeCloseTo(r.totalCars * DEFAULT_LIFT_PRESETS.shaftM2, 9) // the lowest core holds every car
    expect(fit.value).toMatch(/^\d[\d,]* m² modelled vs \d[\d,]* m² needed at level \d+; from L51, 16\.0 m core: 256 m² modelled vs \d+ m² needed at level \d+ \(\d cars? run through\)$/)
    expect(fit.threshold).toBe('each core ≥ what its storeys need (amber within 10%)')
    expect(fit.note).toMatch(/each upper core holds only the cars whose rise runs through its storeys/)
  })

  it('flags an upper core too small for its rises', () => {
    const ok = plain([{ fromLevel: 51, side: 16 }])
    const small = plain([{ fromLevel: 51, side: 9 }])
    expect(lrule(small, 'core-fit').state).toBe('fail')
    expect(lrule(small, 'core-fit').value).toMatch(/from L51, 9\.0 m core: 81 m² modelled vs \d+ m² needed/)
    expect(lrule(small, 'core-fit').note).toMatch(/The 9\.0 m core from L51 is \d+ m² short at level \d+: widen it, or end a rise below L51 \(a sky lobby\)\./)
    // The same 9 m core over the base storeys would be far too small, but the line only asks it to hold what passes it.
    expect(lrule(ok, 'core-fit').state).toBe(lrule(plain(), 'core-fit').state)
  })

  it('saves the core steps in the project file', () => {
    const d = defaultDesign()
    const design = { ...d, towers: { ...d.towers, vtc: [{ ...d.towers.vtc[0], coreSteps: C_STEPS }] } }
    const back = readProject(exportProject(design))
    expect(back.ok).toBe(true)
    expect(toDesign(back.file!).towers.vtc[0].coreSteps).toEqual(C_STEPS)
    expect(coreSide(C())).toBeCloseTo(24, 6)
  })
})

// G30 (vtc-entry TOOL_DEFICITS, structural review R3-10): the sway line measured each storey from its own core, so the
// jog between stepped cores was left out (tower C: about 2,450 MN·m with the jog against the toolkit's 922).
describe('G30: the sustained-sway line with the jog between stepped cores', () => {
  it('reads more sway and base overturning with the jog when the core steps follow the tiers off-centre', () => {
    const t = C(C_STEPS), r = run(t), g = r.gravity
    expect(g.jog.moved).toBe(true)
    expect(g.jog.sections.map((s) => s.from)).toEqual([0, 43, 51])
    expect(g.jog.sections[1]).toMatchObject({ x: 27.75, y: 2.25, side: 19.5 })
    expect(Math.hypot(g.jog.sections[1].dx, g.jog.sections[1].dy)).toBeCloseTo(Math.hypot(2.25, 2.25), 9)
    // The base overturning about the ground core is |ΣW·(c − c_ground)| over the tower storeys.
    const w = storeyWeights(t), tower = w.levels.filter((l) => !l.podium && !l.transitional && !l.onPodium)
    const mx = tower.reduce((s, l) => s + l.W * (l.cx - 30), 0), my = tower.reduce((s, l) => s + l.W * (l.cy - 0), 0)
    expect(g.jog.QG).toBeCloseTo(Math.hypot(mx, my), 3)
    expect(g.jog.QG).toBeGreaterThan(g.QG)
    expect(g.jog.sway.lt).toBeGreaterThan(g.sway.lt)
    expect(g.jog.sway.lt).toBeCloseTo(g.jog.sway.el * 3.35, 9)
    // The line reads the sway with the jog and keeps the storey-by-storey value beside it.
    const net = srule(t, 'gravity-net')
    const mm = (v: number) => Math.round(v * 1000)
    expect(net.value).toBe(`E = ${g.net.e.toFixed(2)} m (e/D ${g.net.ratio.toFixed(3)}); top sway ≈ ${mm(g.jog.sway.el)} mm elastic, ≈ ${mm(g.jog.sway.lt)} mm long term with the core jog (${mm(g.sway.el)} / ${mm(g.sway.lt)} mm storey by storey)`)
    expect(net.note).toMatch(/With the core jog: each core section carries the tower storeys above it about its own centre/)
    expect(net.note).toMatch(/sections grade 24\.0 m at \(30\.0, 0\.0\); L43 19\.5 m at \(27\.8, 2\.3\), 3\.2 m off the one below/)
    expect(srule(t, 'continuity').note).toMatch(/the sway line adds that jog/)
  })

  it('a tower whose core steps off-centre reads more sway than the same tower with a concentric core', () => {
    // A plain stack centred on its 24 m core; above L50 a 16 m core either stays concentric or sits 4 m east (inside the core below).
    const concentric = run(plain([{ fromLevel: 51, side: 16 }])).gravity, off = run(plain([{ fromLevel: 51, side: 16, centre: [4, 0] }])).gravity
    expect(concentric.jog.moved).toBe(false)
    expect(off.jog.moved).toBe(true)
    expect(off.jog.sway.lt).toBeGreaterThan(concentric.jog.sway.lt)
    expect(off.jog.QG).toBeGreaterThan(concentric.jog.QG)
    // The section on grade carries the upper core's offset (the jog); the upper section has no core above it.
    expect(off.jog.sections[0].Mjog).toBeGreaterThan(0)
    expect(off.jog.sections[1].Mjog).toBe(0)
  })

  it('without core steps the jog reading is the storey-by-storey one', () => {
    const g = run(C()).gravity
    expect(g.jog.moved).toBe(false)
    expect(g.jog.sections).toHaveLength(1)
    expect(g.jog.sway.el).toBeCloseTo(g.sway.el, 12)
    expect(g.jog.QG).toBeCloseTo(g.QG, 6)
    expect(srule(C(), 'gravity-net').value).not.toMatch(/core jog/)
  })
})
