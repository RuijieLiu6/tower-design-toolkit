import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { blocksOf } from './blocks'
import { diagridGeometry, diagridLines, minWidth } from './diagrid'
import { towerFloors, withBlocks } from './massing'
import { structureCheck, structureTabOf } from './structure'
import { formBlocks } from './towerForms'
import { windProcedure } from './windStructure'
import type { Tower } from './types'
import { fixFor } from '../lib/fixes'

/** A 40 × 40 m shaft of 4 m storeys on the default podium, shaped by a form. */
function shaft(type: 'none' | 'swell' | 'twist', p: Record<string, number> = {}): Tower {
  const t0 = defaultTower('vtc'), podium = blocksOf(t0).filter((b) => b.podium)
  return withBlocks({ ...t0, f2f: 4 }, [...podium, ...formBlocks(type, p, { w: 40, d: 40, h: 240, f2f: 4 })])
}

describe('diagrid geometry (G79)', () => {
  it('lays an even ring of nodes near the aimed angle and counts members and diamonds', () => {
    const t: Tower = { ...shaft('none'), diagrid: { module: 6, angle: 68 } }
    const g = diagridGeometry(t)!
    expect(g).not.toBeNull()
    // perimeter 160 m, rise 24 m: a 68° member runs 9.70 m, a bay 19.4 m → 8.25 bays → 8 (even)
    expect(g.nodes).toBe(8)
    expect(g.nodes % 2).toBe(0)
    expect(g.members.length).toBe(2 * g.nodes * (g.rings.length - 1))
    expect(g.diamonds).toBe(g.nodes * (g.rings.length - 2))
    expect(g.angle.mean).toBeGreaterThan(64)
    expect(g.angle.mean).toBeLessThan(72)
    // node rings every 6 storeys
    for (let k = 1; k < g.rings.length; k++) expect(g.rings[k].z - g.rings[k - 1].z).toBeCloseTo(24, 6)
  })

  it('a straight box has flat diamonds except those folded over a corner; a twist warps more of them', () => {
    const flat = diagridGeometry({ ...shaft('none'), diagrid: { module: 6 } })!
    const swell = diagridGeometry({ ...shaft('swell', { swellAt: 0.5, swellScale: 1.3, swellTop: 0.9, swellTwist: 0 }), diagrid: { module: 6 } })!
    const twist = diagridGeometry({ ...shaft('twist', { twist: 90, twistTaper: 1 }), diagrid: { module: 6 } })!
    expect(twist.warped).toBeGreaterThan(flat.warped)
    expect(flat.warped).toBeLessThan(flat.diamonds)
    // a swell changes the perimeter, so the member angle spreads (flatter where the plate is widest)
    expect(swell.angle.max - swell.angle.min).toBeGreaterThan(flat.angle.max - flat.angle.min)
  })

  it('follows the twist: every ring keeps its node count and the nodes turn with the plate', () => {
    const t = { ...shaft('twist', { twist: 90, twistTaper: 1 }), diagrid: { module: 6 } }
    const g = diagridGeometry(t)!
    expect(new Set(g.rings.map((r) => r.pts.length)).size).toBe(1)
    // members stay short: no member jumps across the plate (a lost start would make one about the plate width)
    expect(g.length.max).toBeLessThan(Math.hypot(24, 25))
  })

  it('needs one module of storeys; the narrowest width of a ring', () => {
    expect(diagridGeometry({ ...shaft('none'), diagrid: { module: 6, fromLevel: 999 } })).toBeNull()
    expect(minWidth([[0, 0], [40, 0], [40, 30], [0, 30]])).toBeCloseTo(30, 9)
    expect(diagridGeometry(shaft('none'))).toBeNull()
  })
})

describe('diagrid lines in the Structure node', () => {
  const t: Tower = { ...shaft('none'), diagrid: { module: 6, angle: 68 } }
  const lines = diagridLines(t, towerFloors(t))
  it('reads the grid, the angle against slenderness, the code route, and states what is not assessed', () => {
    expect(lines.map((l) => l.id)).toEqual(['diagrid', 'diagrid-angle', 'diagrid-route', 'diagrid-stiffness', 'diagrid-panels'])
    const stiff = lines.find((l) => l.id === 'diagrid-stiffness')!
    expect(stiff.value).toBe('not assessed')
    expect(stiff.state).toBe('unknown')
    expect(lines.find((l) => l.id === 'diagrid-route')!.state).toBe('warn')
    // every line carries a source; no number in the angle line is a coefficient: only the 7:1 aspect the book gives
    for (const l of lines) expect(l.source.label.length).toBeGreaterThan(10)
  })
  it('the angle line passes under 7:1 and warns from it', () => {
    const angle = lines.find((l) => l.id === 'diagrid-angle')!
    const aspect = Number(/aspect ([\d.]+):1/.exec(angle.value)![1])
    expect(angle.state).toBe(aspect < 7 ? 'pass' : 'warn')
  })
  it('shows under Lateral & sway in the structure check, with an instruction for every warning', () => {
    const r = structureCheck(t, windProcedure(t))
    const ids = r.rules.filter((x) => x.id.startsWith('diagrid')).map((x) => x.id)
    expect(ids).toHaveLength(5)
    for (const id of ids) expect(structureTabOf(id)).toBe('lateral')
    for (const l of r.rules.filter((x) => x.id.startsWith('diagrid') && (x.state === 'warn' || x.state === 'fail')))
      expect(fixFor(l.id, l.state, l.value, l.threshold, l.flag) ?? '').not.toMatch(/^Rule: |See Details for the rule/)
    expect(structureCheck(shaft('none'), windProcedure(shaft('none'))).rules.some((x) => x.id.startsWith('diagrid'))).toBe(false)
  })
})
