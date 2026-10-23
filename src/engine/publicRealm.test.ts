import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLIC_REALM, SITE_AREA, VTC_SITE, frontageCheck, groundPlaneCheck, openSpace, podiumBand, polyDistance, streetwallCheck, type PublicRealmInput } from './publicRealm'
import type { Tower } from './types'

// The default competition tower: podium 100 × 64 m, 18 m high, centred on a 46 m tower at x = -20.
const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 0,
}
const input: PublicRealmInput = DEFAULT_PUBLIC_REALM
const find = (rules: { id: string }[], id: string) => rules.find((r) => r.id === id) as { state: string; value: string } | undefined

describe('site and geometry', () => {
  it('uses the brief block, about 79.2 × 144.8 m', () => {
    expect(VTC_SITE.xMax - VTC_SITE.xMin).toBeCloseTo(144.78, 2)
    expect(VTC_SITE.yMax - VTC_SITE.yMin).toBeCloseTo(79.25, 2)
  })
  it('reads Table 2.2b podium bands by street width', () => {
    expect(podiumBand(20.1)).toBe(15.2)
    expect(podiumBand(30.2)).toBe(18.3)
    expect(podiumBand(32)).toBe(23.0)
  })
  it('measures polygon distance', () => {
    const a: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const b: [number, number][] = [[20, 0], [30, 0], [30, 10], [20, 10]]
    expect(polyDistance(a, b)).toBeCloseTo(10, 6)
    expect(polyDistance(a, [[5, 5], [6, 5], [6, 6], [5, 6]])).toBe(0)
  })
})

describe('open space', () => {
  it('counts the unbuilt site and finds the largest clear rectangle', () => {
    const os = openSpace([vtc], input)
    // 0.5 m raster: within 1% of the exact area.
    expect(Math.abs(os.open - (SITE_AREA - 100 * 64)) / (SITE_AREA - 100 * 64)).toBeLessThan(0.01)
    // East of the podium: 42.4 m × 79.25 m.
    expect(os.largest!.area).toBeGreaterThan(3200)
    expect(os.largest!.x0).toBeCloseTo(30, 0)
    expect(os.transitPlaza).toBe(true)
  })
  it('fails the transit plaza and POPS when the podium fills the block', () => {
    const full = { ...vtc, x: 0, podiumWidth: 144.78, podiumDepth: 79.25 }
    const g = groundPlaneCheck([full], input)
    expect(find(g.rules, 'pr-transit-plaza')!.state).toBe('fail')
    expect(find(g.rules, 'pr-open-share')!.state).toBe('fail')
  })
})

describe('streetwall and tower form (P06-M02)', () => {
  const s = streetwallCheck([vtc], input)
  it('allows an 18 m podium on every street with enhanced open space (S2.2.8b), not without', () => {
    for (const e of s.edges) expect(e.state).toBe('pass')
    const tight = streetwallCheck([{ ...vtc, x: 0, podiumWidth: 144.78, podiumDepth: 79.25 }], input)
    expect(tight.edges.find((e) => e.edge.id === 'south')!.state).toBe('fail')
  })
  it('treats a tower flush with its podium as streetwall', () => {
    const flush = streetwallCheck([{ ...vtc, podiumWidth: 46, podiumDepth: 64 }], input)
    expect(flush.edges.find((e) => e.edge.id === 'west')!.wallHeight).toBe(285)
  })
  it('flags the 46 m, 2,116 m² plate against Table 2.3 and S2.3.2', () => {
    expect(find(s.rules, 'pr-plate-t1')!.state).toBe('warn')
    expect(find(s.rules, 'pr-dim-t1')!.state).toBe('warn')
    expect(find(s.rules, 'pr-slender-t1')!.state).toBe('pass')
  })
  it('checks separation against a neighbour by Table 1.5', () => {
    const near = { label: 'Future tower', height: 244, footprint: [[10, -20], [40, -20], [40, 10], [10, 10]] as [number, number][] }
    const r = streetwallCheck([vtc], input, [near])
    expect(find(r.rules, 'pr-separation')!.state).toBe('fail')
    const far = { ...near, footprint: near.footprint.map(([x, y]) => [x + 40, y] as [number, number]) }
    expect(find(streetwallCheck([vtc], input, [far]).rules, 'pr-separation')!.state).toBe('pass')
  })
})

describe('frontage (P06-M01)', () => {
  it('reads active share, entrance spacing and crossings by street', () => {
    const f = frontageCheck([vtc], input)
    expect(find(f.rules, 'pr-active-south')!.state).toBe('pass')
    expect(find(f.rules, 'pr-entrances-south')!.state).toBe('pass')
    expect(find(f.rules, 'pr-crossings')!.state).toBe('pass')
    const loading = frontageCheck([vtc], { ...input, frontage: { ...input.frontage, south: { ...input.frontage.south, crossings: 1 } } })
    expect(find(loading.rules, 'pr-crossings')!.state).toBe('fail')
  })
  it('flags a 4.5 m ground storey against the 4.6–6.1 m active-use range', () => {
    expect(find(frontageCheck([vtc], input).rules, 'pr-ground-height')!.state).toBe('warn')
    expect(find(frontageCheck([{ ...vtc, podiumHeight: 15 }], input).rules, 'pr-ground-height')!.state).toBe('pass')
  })
})

describe('links (P06-M04)', () => {
  it('needs a mid-block link and measures the longest block side without one', () => {
    const none = groundPlaneCheck([vtc], { ...input, link: { ...input.link, enabled: false } })
    expect(find(none.rules, 'pr-link')!.state).toBe('fail')
    expect(none.longestGap).toBeCloseTo(144.78, 1)
    const mid = groundPlaneCheck([{ ...vtc, x: -40, podiumWidth: 60 }], { ...input, link: { ...input.link, offset: 0 } })
    expect(mid.link!.through).toBe('clear')
    // The long sides split at 72.4 m; the 79.25 m short sides are now the longest stretch.
    expect(mid.longestGap).toBeCloseTo(79.25, 1)
  })
  it('fails a link through the tower and warns one through the podium', () => {
    expect(groundPlaneCheck([vtc], { ...input, link: { ...input.link, offset: -20 } }).link!.through).toBe('tower')
    expect(groundPlaneCheck([vtc], { ...input, link: { ...input.link, offset: 20 } }).link!.through).toBe('podium')
  })
})
