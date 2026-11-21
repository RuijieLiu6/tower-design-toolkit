// Skyline silhouette (vtc-entry R10 juries, capability (a)): a reading of form at city scale. Generated towers only.
import { describe, expect, it } from 'vitest'
import { withBlocks } from './massing'
import { arcmin, DEFAULT_VIEW_M, LEGIBLE_ARCMIN, metresAt, silhouetteReading, type SilhouetteReading } from './silhouette'
import { importedTower, type P } from './testStoreys'
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

  it('reports six lines, judges only one, and never fails', () => {
    const towers = [tower([blk('s', 300, 50, 50)]), cRule(4.5), cRule(9), tower(formBlocks('twist', { twist: 180 }, { w: 40, d: 30, h: 280, f2f: 3.5 }))]
    for (const t of towers) {
      const r = silhouetteReading(t)
      expect(r.rules.map((x) => x.id)).toEqual(['sil-legible', 'sil-views', 'sil-distance', 'sil-count', 'sil-taper', 'sil-turn'])
      expect(r.rules.some((x) => x.state === 'fail')).toBe(false)
      expect(['pass', 'warn']).toContain(line(r, 'sil-legible').state)
      expect(r.rules.slice(1).every((x) => x.state === 'unknown')).toBe(true)
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
})
