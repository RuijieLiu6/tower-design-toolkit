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
    // Flush with the podium, both on the arterial's property line (x = xMin + 23).
    const flush = streetwallCheck([{ ...vtc, x: VTC_SITE.xMin + 23, podiumWidth: 46, podiumDepth: 64 }], input)
    expect(flush.edges.find((e) => e.edge.id === 'west')!.wallHeight).toBe(285)
    // G9: the same tower 29.4 m back from the arterial stands behind open ground, so there is no streetwall there.
    const back = streetwallCheck([{ ...vtc, podiumWidth: 46, podiumDepth: 64 }], input)
    expect(back.edges.find((e) => e.edge.id === 'west')).toMatchObject({ wallHeight: 0, stepBack: null, state: 'pass' })
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

// Node audit (7 Nov): the ground plane's sun and wind lines said "Not assessed" although both nodes are built.
import { sunLine, windLine } from './publicRealm'
import type { RuleResult as RR } from './types'

describe('open space reads the solar access and wind screen nodes', () => {
  const line = (state: RR['state'], flag: RR['flag']): RR => ({ id: `s-${state}-${flag}`, label: 'x', value: 'x', threshold: 'x', state, flag, source: { label: 'x' } })
  it('says which node answers when it is off', () => {
    expect(sunLine(null)).toMatchObject({ state: 'unknown', flag: 'unresolved', value: 'Switch on Solar access & sun hours' })
    expect(windLine(null)).toMatchObject({ state: 'unknown', flag: 'unresolved', value: 'Switch on Pedestrian wind: massing screen' })
    expect(sunLine(null).source.label).not.toMatch(/next build item/)
  })
  it('takes the solar lines\' worst state and weakest flag', () => {
    expect(sunLine([line('pass', 'verified'), line('pass', 'verified')])).toMatchObject({ state: 'pass', flag: 'verified', value: '2 pass of 2 solar lines' })
    expect(sunLine([line('pass', 'verified'), line('fail', 'verified'), line('unknown', 'unresolved')])).toMatchObject({ state: 'fail', flag: 'unresolved', value: '1 pass, 1 fail, 1 open of 3 solar lines' })
    expect(sunLine([line('pass', 'verified'), line('unknown', 'team_assumption')])).toMatchObject({ state: 'unknown', flag: 'team_assumption' })
  })
  it('counts only the wind zones that reach the ground, and never fails on a screen', () => {
    const z = (level: 'low' | 'medium' | 'high', zz = 0) => ({ level, kind: 'downwash', z: zz })
    expect(windLine({ zones: [z('high'), z('medium'), z('high', 18), z('low')], note: 'screen' })).toMatchObject({ state: 'warn', flag: 'team_assumption', value: '1 high and 1 medium risk zones at the ground' })
    expect(windLine({ zones: [z('low'), z('high', 18)], note: 'screen' })).toMatchObject({ state: 'pass', value: 'no medium or high risk zone at the ground' })
  })
  it('passes them through groundPlaneCheck', () => {
    const r = groundPlaneCheck([vtc], DEFAULT_PUBLIC_REALM, { solar: [line('pass', 'verified')], wind: { zones: [], note: 'screen' } }).rules
    expect(r.find((x) => x.id === 'pr-sun')?.state).toBe('pass')
    expect(r.find((x) => x.id === 'pr-wind')?.state).toBe('pass')
  })
})

// Node audit (7 Nov): Streetwall & tower form on Real Vancouver runs the rules that need no street.
import { cityStreetwallCheck, towerFormRules } from './publicRealm'

describe('Streetwall & tower form on Real Vancouver', () => {
  const second: Tower = { ...vtc, id: 't2', name: 'Tower 2', x: 30 }
  it('keeps the competition check exactly as it was: its tower lines are the shared helper\'s', () => {
    const all = streetwallCheck([vtc, second], input).rules.map((r) => r.id)
    const form = towerFormRules([vtc, second]).map((r) => r.id)
    // The parts of one drawn building (a split, a union of different heights) stand together: no separation pair.
    const partA = { ...vtc, id: 'pa', drawn: { pts: [], base: 0, floors: 1, f2f: 4, part: 'b1' } }, partB = { ...vtc, id: 'pb', name: 'Tower 1 part', drawn: { pts: [], base: 0, floors: 1, f2f: 4, part: 'b1' } }
    expect(towerFormRules([partA, partB]).find((r) => r.id === 'pr-separation')).toBeUndefined()
    expect(towerFormRules([partA, { ...partB, drawn: { ...partB.drawn, part: 'b2' } }]).find((r) => r.id === 'pr-separation')?.state).toBe('fail')
    expect(form.length).toBeGreaterThan(5)
    expect(all.filter((id) => form.includes(id))).toEqual(form)
    expect(form).toContain('pr-share-t1')
  })
  it('runs floorplate, plan dimension, slenderness, separation and variation, and leaves the street rules open', () => {
    const r = cityStreetwallCheck([vtc, second])
    const ids = r.rules.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['pr-plate-t1', 'pr-dim-t1', 'pr-slender-t1', 'pr-separation', 'pr-variation']))
    expect(ids.some((id) => id.startsWith('pr-share') || id.startsWith('pr-continuity') || id.startsWith('pr-stepback'))).toBe(false)
    expect(r.rules.find((x) => x.id === 'pr-streets')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(r.edges).toEqual([])
    expect(cityStreetwallCheck([]).rules).toEqual([])
  })
})

// Node audit (7 Nov): Open space & links on Real Vancouver, over the study site in its own frame.
import { cityGroundPlaneCheck, cityOpenSpace, siteFrame } from './publicRealm'
import defaultSite from '../data/defaultSite.json'

describe('Open space & links on Real Vancouver', () => {
  const ring = defaultSite.ring as [number, number][]
  const cityTower: Tower = { ...vtc, x: 254, y: 486.1, rotation: 45.2 }
  it('turns the site so its longest side runs along x', () => {
    const f = siteFrame(ring)
    const local = ring.map(f.toLocal)
    const ys = local.map((p) => p[1]), xs = local.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(141.7, 0)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(79.2, 0)
  })
  it('measures the site, the built footprint and the largest clear rectangle', () => {
    const os = cityOpenSpace([cityTower], ring, 0.85)
    expect(os.siteArea).toBeGreaterThan(11224.7 * 0.99)
    expect(os.siteArea).toBeLessThan(11224.7 * 1.01)
    // The 100 × 64 m podium covers 6,400 m² (it fits inside the 141.7 × 79.2 m block).
    expect(os.built).toBeGreaterThan(6400 * 0.98)
    expect(os.built).toBeLessThan(6400 * 1.02)
    expect(os.largest!.area).toBeGreaterThan(500)
  })
  it('judges the share on a large site, reports it on a small one, and leaves the street lines open', () => {
    const r = cityGroundPlaneCheck([cityTower], ring, input, { solar: null, wind: null }).rules
    const share = r.find((x) => x.id === 'pr-open-share')!
    expect(share.flag).toBe('team_assumption')
    expect(['pass', 'warn', 'fail']).toContain(share.state)
    expect(r.find((x) => x.id === 'pr-streets-ground')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(r.map((x) => x.id)).toEqual(expect.arrayContaining(['pr-pops', 'pr-sun', 'pr-wind']))
    const small: [number, number][] = [[200, 450], [260, 450], [260, 520], [200, 520]]
    expect(cityGroundPlaneCheck([cityTower], small, input).rules.find((x) => x.id === 'pr-open-share')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(cityGroundPlaneCheck([cityTower], null, input).rules.find((x) => x.id === 'pr-open-share')?.value).toBe('needs a site area')
    expect(cityGroundPlaneCheck([], ring, input).rules).toEqual([])
  })
})

import { cityFrontageCheck, groundStoreyRule } from './publicRealm'
describe('Active frontage on Real Vancouver', () => {
  it('checks the ground storey height and leaves the street lines open', () => {
    const r = cityFrontageCheck([vtc]).rules
    expect(r.map((x) => x.id)).toEqual(['pr-streets-frontage', 'pr-ground-height'])
    expect(r[0]).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(r[1]).toEqual(groundStoreyRule([vtc]))
    expect(frontageCheck([vtc], input).rules.find((x) => x.id === 'pr-ground-height')).toEqual(groundStoreyRule([vtc]))
    expect(cityFrontageCheck([]).rules).toEqual([])
  })
})

describe('the study site frame', () => {
  it('turns points into the site frame and back', () => {
    const ring = defaultSite.ring as [number, number][]
    const f = siteFrame(ring)
    for (const p of ring) {
      const q = f.toWorld(f.toLocal(p))
      expect(q[0]).toBeCloseTo(p[0], 6)
      expect(q[1]).toBeCloseTo(p[1], 6)
    }
    // The POPS rectangle drawn on the plan lies inside the site.
    const os = cityOpenSpace([{ ...vtc, x: 254, y: 486.1, rotation: 45.2 }], ring, 0.85)
    const inRing = (p: [number, number]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c } return c }
    const mid = os.largestRing!.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]) as [number, number]
    expect(inRing(mid)).toBe(true)
  })
})

// G35 (vtc-entry urban review R3-15): massing variation read the podium's overall length, so a 4.5 m deep arcade along
// half of C22a's 77.6 m plaza face still read 77.6 m.
import { VARIATION_STEP, facadeRun, streetwallStoreys } from './publicRealm'
import type { ImportedStorey } from './types'

describe('G35: massing variation reads steps in the true podium outline', () => {
  type P = [number, number]
  const box = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  /** A 77.6 × 40 m podium of four 4.8 m storeys under a 30 m tower to +250 m. `low`: the L1–L2 ring; `up`: the L3–L4 ring. */
  const podium = (low: P[], up: P[] = box(-38.8, -20, 38.8, 20)): Tower => {
    const storeys: ImportedStorey[] = []
    for (let i = 0; i < 4; i++) storeys.push({ level: i + 1, z0: i * 4.8, z1: (i + 1) * 4.8, area: 0, use: 'retail', podium: true, hasFloor: true, loops: [i < 2 ? low : up] })
    for (let z = 19.2, l = 5; z < 250; z += 4, l++) storeys.push({ level: l, z0: z, z1: z + 4, area: 0, use: 'office', podium: false, hasFloor: true, loops: [box(-15, -15, 15, 15)] })
    return { ...vtc, x: 0, y: 0, rotation: 0, width: 30, depth: 30, height: 250, podiumHeight: 19.2, podiumWidth: 77.6, podiumDepth: 40, imported: { storeys } as unknown as Tower['imported'] }
  }
  const plain = podium(box(-38.8, -20, 38.8, 20))
  /** The south (plaza) face's two lower storeys pulled back `d` m along its west half: an arcade under L3–L4. */
  const arcade = (d: number): P[] => [[-38.8, -20 + d], [0, -20 + d], [0, -20], [38.8, -20], [38.8, 20], [-38.8, 20]]
  const south: P = [0, -1]
  it('a plain box podium reads its whole 77.6 m face', () => {
    const r = facadeRun(streetwallStoreys(plain), south)
    expect(r.longest).toBeCloseTo(77.6, 1)
    expect(r.extent).toBeCloseTo(77.6, 1)
  })
  it('a 4.5 m deep arcade along half of the face breaks it into two runs of about 38.8 m', () => {
    const t = podium(arcade(4.5))
    expect(streetwallStoreys(t)).toHaveLength(2) // the podium storeys only, not the tower
    const r = facadeRun(streetwallStoreys(t), south)
    expect(r.longest).toBeLessThan(77.6 - 30)
    expect(r.longest).toBeCloseTo(38.8, 0)
    expect(r.extent).toBeCloseTo(77.6, 1)
    // a jog under the team step (1.5 m) is not a plane change
    expect(VARIATION_STEP).toBe(1.5)
    expect(facadeRun(streetwallStoreys(podium(arcade(1.0))), south).longest).toBeCloseTo(77.6, 1)
  })
  it('the rule reads each street face; a step on both long faces brings it within 45.7 m', () => {
    const line = (t: Tower) => towerFormRules([t]).find((x) => x.id === 'pr-variation')!
    expect(line(plain)).toMatchObject({ value: '77.6 m of unbroken facade on the retail high street', state: 'warn' })
    const one = line(podium(arcade(4.5)))
    expect(one.note).toMatch(/the retail high street 38\.\d m/)
    expect(one.value).toBe('77.6 m of unbroken facade on the north street (local)') // the north face is still a plain 77.6 m
    // the north face stepped back 2 m along its east half, on every podium storey
    const stepN = (r: P[]): P[] => r.flatMap((p) => (p[0] === 38.8 && p[1] === 20 ? [[38.8, 18], [0, 18], [0, 20]] as P[] : [p]))
    const both = line(podium(stepN(arcade(4.5)), stepN(box(-38.8, -20, 38.8, 20))))
    expect(both.state).toBe('pass')
    // the halves of the plaza face are now the longest runs (the arcade and the north step also cut the 40 m ends)
    expect(both.value).toMatch(/^38\.\d m of unbroken facade on the retail high street$/)
    expect(both.note).toMatch(/the arterial street 3\d\.\d m/)
  })
})
