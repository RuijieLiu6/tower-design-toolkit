import { describe, expect, it } from 'vitest'
import { generate, type GenBrief, type GenKey, type GenParams, type GenSite } from './dtmassGen'
import fixtures from './dtmassGen.fixtures.json'

// The fixtures are outputs of Sinnie Choi's own generator (dtmass src/gen.js, commit 2ef1d96) for the same inputs, run in
// Node with no setback set (tools/dtmass-fixtures.cjs, 6 Nov 2026): 5 sites (both frontage axes, the competition block, a
// lot too small for a courtyard) × 4 typologies × 4 briefs (hers, her README example, a supertall, housing), plus moved
// parameters and a variation seed. The port must give the same blocks, areas, notes and conflicts.
type Case = { id: string; site: GenSite; brief: GenBrief; key: GenKey; P: GenParams; seed: number; expect: Record<string, unknown> & { blocks: Record<string, unknown>[] } }
const cases = (fixtures as unknown as { cases: Case[] }).cases

const near = (a: unknown, b: unknown, path: string): void => {
  if (typeof a === 'number' && typeof b === 'number') { expect(a, path).toBeCloseTo(b, 6); return }
  if (Array.isArray(b)) { expect(Array.isArray(a), path).toBe(true); expect((a as unknown[]).length, `${path}.length`).toBe(b.length); b.forEach((x, i) => near((a as unknown[])[i], x, `${path}[${i}]`)); return }
  if (b && typeof b === 'object') { for (const k of Object.keys(b)) near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`); return }
  expect(a, path).toEqual(b)
}

describe('massing generator ported from Sinnie Choi\'s Downtown Massing Tool', () => {
  it(`matches her generator on all ${cases.length} recorded cases`, () => {
    expect(cases.length).toBe(120)
    for (const c of cases) {
      const r = generate(c.site, c.brief, c.key, c.P, c.seed)
      const blocks = r.blocks.map((b) => ({ use: b.use, name: b.name, x: b.x, y: b.y, w: b.w, d: b.d, z0: b.z0, floors: b.floors, f2f: b.f2f }))
      const { blocks: want, ...rest } = c.expect
      near(blocks, want, `${c.id} blocks`)
      near({ rows: r.rows, genTotal: r.genTotal, reqTotal: r.reqTotal, height: r.height, storeys: r.storeys, fsr: r.fsr, towers: r.towers, podiumStoreys: r.podiumStoreys, notes: r.notes, conflicts: r.conflicts, label: r.label }, rest, c.id)
    }
  })

  it('her README example lands where she reports it (no setbacks here, so within a storey of her 101.0 m)', () => {
    const c = cases.find((x) => x.id === 's75x60/readme/podium/none/0')!
    const r = generate(c.site, c.brief, 'podium')
    expect(Math.abs(r.genTotal - 24000)).toBeLessThan(24000 * 0.05)
    expect(r.blocks.filter((b) => b.use !== 'parking').every((b) => b.z0 >= 0)).toBe(true)
  })

  it('courtyard: four bars around an open court; split: two towers at least 24.4 m apart', () => {
    const site: GenSite = { w: 90, d: 70, frontage: 'S' }
    const court = generate(site, cases[0].brief, 'court')
    expect(court.court).not.toBeNull()
    const bars = court.blocks.filter((b) => b.bar)
    expect(new Set(bars.map((b) => b.bar))).toEqual(new Set(['south', 'north', 'west', 'east']))
    const split = generate(site, cases[0].brief, 'split')
    const [a, b] = split.towerRects
    expect(Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))).toBeGreaterThanOrEqual(24.4 - 1e-6)
  })
})
