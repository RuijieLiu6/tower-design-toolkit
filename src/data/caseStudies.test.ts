import { describe, expect, it } from 'vitest'
import { CASE_STUDIES } from './caseStudies'
import { summarize } from '../engine/blocks'

describe('case studies as block stacks', () => {
  it('each stack reaches its published height, with about its published storeys', () => {
    for (const c of CASE_STUDIES) {
      const b = c.build(), sum = summarize(b.blocks)
      expect(Math.abs(sum.height - c.height), `${c.name} height ${sum.height}`).toBeLessThan(1.5)
      const pod = b.blocks.filter((x) => x.podium).reduce((a, x) => a + Math.round(x.height / (x.f2f ?? 4.5)), 0)
      const shaft = (sum.height - sum.podiumHeight) / c.f2f
      expect(Math.abs(pod + shaft - c.storeys), `${c.name} storeys ${pod + shaft}`).toBeLessThan(2)
      expect(new Set(b.blocks.map((x) => x.id)).size).toBe(b.blocks.length)
      expect(b.blocks.length).toBeLessThanOrEqual(60)
    }
  })
  it('the forms read: a twist, a bulge, a growing plate, open floors, a wedge', () => {
    const by = Object.fromEntries(CASE_STUDIES.map((c) => [c.id, c.build()]))
    const twist = by['trump-vancouver']
    expect(twist.form?.type).toBe('twist')
    expect(twist.blocks[twist.blocks.length - 1].rotation).toBeGreaterThan(35)
    const g = by['st-mary-axe'].blocks.map((x) => x.width)
    expect(Math.max(...g)).toBeGreaterThan(g[0] + 4)
    expect(g[g.length - 1]).toBeLessThan(g[0] * 0.6)
    const vh = by['vancouver-house'].blocks.filter((x) => !x.podium)
    expect(vh[0].depth).toBeLessThan(vh[vh.length - 1].depth / 2)
    expect(vh.every((x) => Math.abs(x.dy + x.depth / 2 - 12) < 0.05)).toBe(true) // one face plumb
    const park = by['432-park'].blocks
    expect(park.filter((x) => x.width < 12)).toHaveLength(5)
    const lh = by['leadenhall'].blocks
    expect(lh[lh.length - 1].depth).toBeLessThan(lh[1].depth / 2)
    expect(lh.every((x) => Math.abs(x.dy + x.depth / 2 - 22.5) < 0.05)).toBe(true)
  })
})
