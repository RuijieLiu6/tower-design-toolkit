// Skyline silhouette (vtc-entry R10 juries, capability (a)): a reading of form at city scale. Generated towers only.
import { describe, expect, it } from 'vitest'
import { withBlocks } from './massing'
import { arcmin, DEFAULT_VIEW_M, LEGIBLE_ARCMIN, metresAt, silhouetteReading, type SilhouetteReading } from './silhouette'
import { importedTower, rect, ringArea, stack, type P } from './testStoreys'
import { formBlocks } from './towerForms'
import type { Block, ImportedStorey, Tower } from './types'

const T0: Tower = { id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 50, depth: 50, height: 300, f2f: 4, podiumHeight: 0, podiumWidth: 50, podiumDepth: 50, podiumUse: 'retail', bands: [{ use: 'residential', share: 1 }], coreShare: 0.25, plantEvery: 0 }
const blk = (id: string, height: number, width: number, depth: number, dx = 0, dy = 0, podium = false): Block => ({ id, height, width, depth, dx, dy, rotation: 0, ...(podium ? { podium } : {}) })
const tower = (blocks: Block[]) => withBlocks(T0, blocks)
const axis = (r: SilhouetteReading, pair: string) => r.axes.find((a) => a.pair === pair)!
const line = (r: SilhouetteReading, id: string) => r.rules.find((x) => x.id === id)!

/** C's rule in miniature on a 54 m square: the east, north and west faces step back `u` metres each, at +100, +150, +200 m. */
const cRule = (u: number) => tower([
  blk('b0', 100, 54, 54),
  blk('b1', 50, 54 - u, 54, -u / 2, 0),
  blk('b2', 50, 54 - u, 54 - u, -u / 2, -u / 2),
  blk('b3', 50, 54 - 2 * u, 54 - u, 0, -u / 2),
])

describe('skyline silhouette: 8 views of the tower part', () => {
  it('a plain 50 m square box reports no silhouette change, and its podium is left out', () => {
    for (const t of [tower([blk('s', 300, 50, 50)]), tower([blk('p', 20, 90, 70, 0, 0, true), blk('s', 280, 50, 50)])]) {
      const r = silhouetteReading(t)
      expect(r.axes.every((a) => a.changes.length === 0)).toBe(true)
      expect(r.largest).toBeNull()
      expect(r.legibleViews).toBe(0)
      expect(r.state).toBe('warn')
      expect(r.topBase.mean).toBeCloseTo(1, 9)
      expect(r.turn?.deg ?? 0).toBeCloseTo(0, 9)
      expect(line(r, 'sil-legible').value).toMatch(/^0 of 8 views: the outline is straight/)
    }
    // Face-on 50 m, diagonal 70.7 m.
    const r = silhouetteReading(tower([blk('s', 300, 50, 50)]))
    expect(axis(r, 'N/S').edges[0].r - axis(r, 'N/S').edges[0].l).toBeCloseTo(50, 6)
    expect(axis(r, 'NE/SW').edges[0].r - axis(r, 'NE/SW').edges[0].l).toBeCloseTo(50 * Math.SQRT2, 6)
  })

  it('a single 9 m step on all faces at mid-height reports one legible change in every view', () => {
    const r = silhouetteReading(tower([blk('lo', 150, 50, 50), blk('hi', 150, 32, 32)]))
    for (const a of r.axes) {
      expect(a.changes).toHaveLength(1)
      expect(a.legible).toBe(1)
      expect(a.changes[0].z0).toBeCloseTo(150, 6)
      expect(a.changes[0].dw).toBeLessThan(0)
    }
    expect(axis(r, 'N/S').changes[0].size).toBeCloseTo(18, 6)
    expect(axis(r, 'NE/SW').changes[0].size).toBeCloseTo(18 * Math.SQRT2, 6)
    expect(r.largest?.pair).toBe('NE/SW')
    expect(r.largest!.arcmin).toBeCloseTo(arcmin(18 * Math.SQRT2, DEFAULT_VIEW_M), 9)
    expect(r.largest!.arcmin).toBeGreaterThan(40) // about 44′ from 2 km
    expect(r.legibleViews).toBe(8)
    expect(r.state).toBe('pass')
    expect(r.topBase.min).toBeCloseTo(32 / 50, 9)
    expect(line(r, 'sil-legible').value).toMatch(/^8 of 8 views; largest: narrows 25\.5 m at \+150 m seen from NE\/SW, 44′ from 2 km$/)
    // The project's north turns the views: on the competition model (north 45°) the diagonals are true N/S and E/W.
    expect(silhouetteReading(tower([blk('lo', 150, 50, 50), blk('hi', 150, 32, 32)]), { northDeg: 45 }).largest?.pair).toBe('N/S')
  })

  it('C’s rule in miniature (three one-face 4.5 m steps) reads smaller than the two-unit (9 m) version', () => {
    const one = silhouetteReading(cRule(4.5)), two = silhouetteReading(cRule(9))
    expect(one.largest!.size).toBeCloseTo(4.5, 6)
    expect(two.largest!.size).toBeCloseTo(9, 6)
    for (const k of [0, 1, 2, 3]) expect(one.axes[k].largest!.size).toBeLessThan(two.axes[k].largest!.size)
    // Seen face-on from N/S, the east and west steps are two changes 100 m apart; the north step shows from E/W only.
    expect(axis(one, 'N/S').changes.map((c) => Math.round(c.z0))).toEqual([100, 200])
    expect(axis(one, 'E/W').changes.map((c) => Math.round(c.z0))).toEqual([150])
    // Diagonally each step moves the outline by u·cos 45°.
    expect(axis(one, 'NE/SW').largest!.size).toBeCloseTo(4.5 * Math.SQRT1_2, 6)
    // From 2 km, 4.5 m is about 7.7′ (under the 10′), 9 m about 15′.
    expect(one.legibleViews).toBe(0)
    expect(one.state).toBe('warn')
    expect(two.legibleViews).toBe(8)
    expect(two.state).toBe('pass')
    expect(axis(two, 'N/S').legible).toBe(2)
    // From 5 km the two-unit steps no longer read either.
    expect(silhouetteReading(cRule(9), { distance: 5000 }).legibleViews).toBe(0)
  })

  it('a 90° twisting square turns its widest outline by about 90°, parametric or imported', () => {
    const blocks = formBlocks('twist', { twist: 90, twistTaper: 1 }, { w: 50, d: 50, h: 300, f2f: 4 })
    const r = silhouetteReading(tower(blocks))
    expect(Math.abs(r.turn!.deg)).toBeGreaterThan(85)
    expect(Math.abs(r.turn!.deg)).toBeLessThan(92)
    expect(r.turn!.deg).toBeLessThan(0) // a positive block rotation is counter-clockwise seen from above
    expect(line(r, 'sil-turn').value).toMatch(/^8[5-9]° anticlockwise over \+\d+–\d+ m$/)
    // The square swings between face-on (50 m) and diagonal (70.7 m), so its outline changes legibly too.
    expect(r.state).toBe('pass')
    // The same tower as imported storey outlines (60 storeys of 4 m, 0° to 90°).
    const sq = (deg: number): P[] => { const a = (deg * Math.PI) / 180; return ([[-25, -25], [25, -25], [25, 25], [-25, 25]] as P[]).map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]) }
    const storeys: ImportedStorey[] = Array.from({ length: 60 }, (_, i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, area: 2500, use: 'residential', podium: false, hasFloor: true, loops: [sq((90 * i) / 59)] }))
    const imp = silhouetteReading(importedTower(storeys))
    expect(imp.turn!.deg).toBeCloseTo(-90, 6)
    expect(imp.state).toBe('pass')
  })

  it('a block that slides sideways reads as a change though the width stays the same', () => {
    const r = silhouetteReading(tower([blk('lo', 150, 40, 40), blk('hi', 150, 40, 40, 10, 0)]))
    const c = axis(r, 'N/S').changes[0]
    expect(c.size).toBeCloseTo(20, 6)
    expect(c.dw).toBeCloseTo(0, 6)
    expect(axis(r, 'E/W').changes).toHaveLength(0)
    expect(line(r, 'sil-views').value).toContain('N/S 20.0 m at +150 m (34′)')
  })

  it('a taper of small steps reads as one change, and its top-to-base ratio', () => {
    const blocks = formBlocks('taper', { taper: 0.6, profile: 1 }, { w: 50, d: 50, h: 300, f2f: 4 })
    const r = silhouetteReading(tower(blocks))
    expect(axis(r, 'N/S').changes).toHaveLength(1)
    expect(axis(r, 'N/S').changes[0].dw).toBeLessThan(-15)
    expect(r.topBase.mean).toBeGreaterThan(0.55)
    expect(r.topBase.mean).toBeLessThan(0.7)
    expect(Math.abs(r.turn!.deg)).toBeLessThan(0.5)
  })

  it('reports eight lines, judges two (the outline and the sky through it), and never fails', () => {
    const towers = [tower([blk('s', 300, 50, 50)]), cRule(4.5), cRule(9), tower(formBlocks('twist', { twist: 180 }, { w: 40, d: 30, h: 280, f2f: 3.5 }))]
    for (const t of towers) {
      const r = silhouetteReading(t)
      expect(r.rules.map((x) => x.id)).toEqual(['sil-legible', 'sil-views', 'sil-distance', 'sil-count', 'sil-taper', 'sil-turn', 'sil-sky', 'sil-sky-views'])
      expect(r.rules.some((x) => x.state === 'fail')).toBe(false)
      expect(['pass', 'warn']).toContain(line(r, 'sil-legible').state)
      expect(['pass', 'warn']).toContain(line(r, 'sil-sky').state)
      expect(r.rules.filter((x) => x.id !== 'sil-legible' && x.id !== 'sil-sky').every((x) => x.state === 'unknown')).toBe(true)
      expect(line(r, 'sil-legible').threshold).toContain(`${LEGIBLE_ARCMIN}′ (${metresAt(LEGIBLE_ARCMIN, DEFAULT_VIEW_M).toFixed(1)} m from 2 km)`)
    }
    expect(line(silhouetteReading(cRule(9)), 'sil-distance').value).toMatch(/^62′ · 15′ · 6\.2′; legible up to about 3\.1 km \(from 500 m, 2 km\)$/)
  })
})

describe('skyline silhouette in the evidence groups (what the design harness reads)', () => {
  it('lists one set of lines per tower under built.silhouette, at the chosen distance', async () => {
    const { evidenceGroups } = await import('../lib/evidence/engines')
    const { defaultTower, useStore } = await import('../store')
    const s = useStore.getState()
    const base = { fsrTier: 2 as const, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets }
    const g = evidenceGroups({ ...base, project: 'vtc', towers: [defaultTower('vtc'), cRule(9)] })
    const lines = g['built.silhouette'] as { id: string; state: string; threshold: string }[][]
    expect(lines).toHaveLength(2)
    expect(lines[1][0]).toMatchObject({ id: 'sil-legible', state: 'pass' })
    const far = evidenceGroups({ ...base, project: 'vtc', towers: [cRule(9)], silhouetteDistance: 5000 })['built.silhouette'] as typeof lines
    expect(far[0][0]).toMatchObject({ state: 'warn' })
    expect(far[0][0].threshold).toContain('from 5 km')
  })

  it('checks what stands behind the sky through each tower against the design’s other towers', async () => {
    const { evidenceGroups } = await import('../lib/evidence/engines')
    const { useStore } = await import('../store')
    const s = useStore.getState()
    const base = { fsrTier: 2 as const, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets }
    const open = tower([blk('lo', 100, 50, 50), blk('neck', 12, 30, 30), blk('hi', 100, 50, 50)])
    const sky = (towers: Tower[]) => (evidenceGroups({ ...base, project: 'city', towers })['built.silhouette'] as { id: string; value: string }[][])[0].find((x) => x.id === 'sil-sky')!.value
    expect(sky([open])).toMatch(/; behind: not checked$/)
    // A second tower due south, behind the neck seen from the north (the city project's north is the model's +Y).
    const south: Tower = { ...tower([blk('s', 300, 40, 40)]), id: 'b', name: 'Tower B', y: -120 }
    expect(sky([open, south])).toMatch(/; behind: Tower B from N \(the design's other towers checked\)$/)
  })
})

// G23 (vtc-entry R3-6 jury on A21a): sky seen through an opening, not only the outline. A 50 m square shaft with a
// 24 m core at its centre and three open storeys (12 m) at +80–92 m, read as imported storey outlines.
describe('sky through the tower (G23)', () => {
  const shaft = rect(50, 50), core = rect(24, 24)
  // The garden of A21a, centred: the enclosed part leaves an arm open on the east and the south faces (each 13 m deep),
  // and a 13 × 13 m corner room closes the corner between them.
  const wall: P[] = [[-25, -25], [-12, -25], [-12, -12], [12, -12], [12, 12], [25, 12], [25, 25], [-25, 25]]
  const room = rect(13, 13, 18.5, -18.5)
  const k2 = (10800 / (Math.PI * DEFAULT_VIEW_M)) ** 2 // arcmin² per m² from 2 km
  const view = (r: SilhouetteReading, v: string) => r.sky.views.find((x) => x.view === v)!
  /** The shaft with three open storeys whose loops (and marked glass) are given. */
  const gap = (loops: P[][], glazed?: P[][]) => importedTower(stack([{ n: 20, f2f: 4, ring: shaft }, { n: 3, f2f: 4, ring: core }, { n: 20, f2f: 4, ring: shaft }])
    .map((s) => (s.level >= 21 && s.level <= 23 ? { ...s, loops, area: loops.reduce((a, r) => a + ringArea(r), 0), ...(glazed ? { glazed } : {}) } : s)), { coreSide: 24 })

  it('a solid box reads no sky in any view', () => {
    for (const t of [tower([blk('s', 300, 50, 50)]), importedTower(stack([{ n: 40, f2f: 4, ring: shaft }]))]) {
      const r = silhouetteReading(t)
      expect(r.sky.read).toBe(true)
      expect(r.sky.bands).toEqual([])
      expect(r.sky.views.every((v) => v.area === 0 && v.openings.length === 0)).toBe(true)
      expect(r.sky.legibleViews).toBe(0)
      expect(line(r, 'sil-sky')).toMatchObject({ state: 'warn' })
      expect(line(r, 'sil-sky').value).toMatch(/^0 of 8 views: no open storey/)
    }
  })

  it('three open storeys round the 24 m core show sky through the 13 m strips beside it in the face-on views', () => {
    const r = silhouetteReading(gap([core]))
    expect(r.sky.bands).toEqual([{ z0: 80, z1: 92, levels: [21, 23], share: 576 / 2500 }])
    for (const v of ['N', 'E', 'S', 'W']) {
      const x = view(r, v)
      expect(x.openings).toHaveLength(2)
      for (const o of x.openings) {
        expect(o.width).toBeCloseTo(13, 6)
        expect(o.z1 - o.z0).toBeCloseTo(12, 6)
        expect(o.area).toBeCloseTo(156, 6)
        expect(o.arcmin2).toBeCloseTo(156 * k2, 6) // about 461 arcmin² from 2 km
      }
      expect(x.share).toBeCloseTo(26 / 50, 6)
      expect(x.legible).toBe(true)
      expect(x.behind).toBeNull()
    }
    // Diagonally the strips are wider: half the difference of the plate's and the core's diagonals.
    expect(view(r, 'NE').openings[0].width).toBeCloseTo((50 - 24) * Math.SQRT1_2, 6)
    expect(r.sky.legibleViews).toBe(8)
    expect(r.sky.state).toBe('pass')
    expect(line(r, 'sil-sky').value).toMatch(/^8 of 8 views; largest opening 652 arcmin² \(18\.4 × 12\.0 m at \+80–92 m\) seen from NE, SE, SW, NW, 2 km; behind: not checked$/)
    expect(line(r, 'sil-sky-views').value).toMatch(/^N 922 \(52%\) · NE 1,304 \(52%\)/)
  })

  it('a gap that wraps a corner reads more than arms that frame the core (A21a’s loggia)', () => {
    // Arms on two faces with the corner room glazed: every line through the gap meets the core, the wall or the glass.
    const loggia = silhouetteReading(gap([wall, room], [room]))
    expect(loggia.sky.bands).toHaveLength(1)
    expect(loggia.sky.views.every((v) => v.area === 0)).toBe(true)
    expect(loggia.sky.state).toBe('warn')
    // The glass alone closes the corner, seen from NE and SW (an 18.4 m strip, 12 m high), and counts as blocked.
    expect(view(loggia, 'NE').glass).toBeCloseTo(26 * Math.SQRT1_2 * 12, 6)
    expect(view(loggia, 'N').glass).toBe(0)
    expect(line(loggia, 'sil-sky').value).toMatch(/^0 of 8 views: the open storeys at \+80–92 m show no sky; every line through them meets a plate, glass or the core \(652 arcmin² behind glass from NE, SW, counted as blocked\)$/)
    // Unmarked, the room is simply opaque.
    expect(silhouetteReading(gap([wall, room])).sky.views.every((v) => v.area === 0 && v.glass === 0)).toBe(true)
    // The corner room taken out: the gap wraps the corner and the sky shows from NE and SW only (the jury's 2 of 8).
    const wrapped = silhouetteReading(gap([wall]))
    expect(view(wrapped, 'NE').openings).toHaveLength(1)
    expect(view(wrapped, 'NE').openings[0].width).toBeCloseTo(26 * Math.SQRT1_2, 6)
    expect(view(wrapped, 'NE').arcmin2).toBeCloseTo(26 * Math.SQRT1_2 * 12 * k2, 6)
    expect(wrapped.sky.views.filter((v) => v.legible).map((v) => v.view)).toEqual(['NE', 'SW'])
    expect(wrapped.sky.state).toBe('pass')
    const total = (r: SilhouetteReading) => r.sky.views.reduce((s, v) => s + v.arcmin2, 0)
    expect(total(wrapped)).toBeGreaterThan(total(loggia))
    // On the competition model (north 45°) the model's diagonals are true N and S, as the jury found.
    expect(silhouetteReading(gap([wall]), { northDeg: 45 }).sky.views.filter((v) => v.legible).map((v) => v.view)).toEqual(['N', 'S'])
  })

  it('says what stands behind: a neighbour behind the gap hides its sky from that side only', () => {
    const behind = { prisms: [{ ring: rect(30, 30, -41.5, -78.5), z0: 0, z1: 300, name: 'Tower B' }], what: 'the test neighbour' }
    const r = silhouetteReading(gap([wall]), { context: behind })
    // Seen from NE the line through the gap runs on to Tower B; seen from SW, Tower B stands in front, not behind.
    expect(view(r, 'NE').behind?.names).toEqual(['Tower B'])
    expect(view(r, 'NE').behind?.area).toBeCloseTo(26 * Math.SQRT1_2 * 12, 6)
    expect(view(r, 'NE').openings).toHaveLength(0)
    expect(view(r, 'SW').behind).toEqual({ area: 0, names: [] })
    expect(view(r, 'SW').legible).toBe(true)
    expect(r.sky.legibleViews).toBe(1)
    expect(r.sky.state).toBe('warn')
    expect(line(r, 'sil-sky').value).toMatch(/; behind: Tower B from NE \(the test neighbour checked\)$/)
    // A context with nothing behind reads sky.
    const clear = silhouetteReading(gap([wall]), { context: { prisms: [], what: 'nothing' } })
    expect(line(clear, 'sil-sky').value).toMatch(/; behind: sky \(nothing checked\)$/)
  })

  it('a parametric neck block reads sky beside it; a drawn mass is not read', () => {
    const r = silhouetteReading(tower([blk('lo', 100, 50, 50), blk('neck', 12, 30, 30), blk('hi', 100, 50, 50)]))
    expect(r.sky.bands).toHaveLength(1)
    expect(view(r, 'N').openings.map((o) => Math.round(o.width * 10) / 10)).toEqual([10, 10])
    expect(r.sky.state).toBe('pass')
    const imp = importedTower(stack([{ n: 75, f2f: 4, ring: shaft }]))
    const drawn: Tower = { ...imp, drawn: { pts: shaft, base: 0, floors: 75, f2f: 4 } }
    const d = silhouetteReading(drawn)
    expect(d.sky.read).toBe(false)
    expect(line(d, 'sil-sky')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
  })
})
