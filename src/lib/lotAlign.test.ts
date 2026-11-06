import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rectCorners, towerMasses } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useStore } from '../store'
import { decodeFootprints } from './cityLayers'
import { parcelRow, type ParcelAttrs } from './contextLayers'
import type { Pt } from './edgeSnap'
import { chooseRotation, footBox, inLot, lotAt, lotFrame, nearestLot, placeOnLot, type Lots } from './lotAlign'
import { resetHistory, startHistory, undo } from './project/history'
import { alignToLot, confirmProposal, proposePlace, setLotsForTest, setMetresPerPx, setShiftHeld, useTowerEdit } from './towerEdit'

const mod90 = (a: number) => ((a % 90) + 90) % 90
const angDiff90 = (a: number, b: number) => { const d = Math.abs(mod90(a) - mod90(b)); return Math.min(d, 90 - d) }
const tower = (w: number, d: number, extra: Partial<Tower> = {}): Tower => ({ ...useStore.getInitialState().towers.city[0], width: w, depth: d, podiumHeight: 0, rotation: 0, blocks: undefined, ...extra })
const inside = (t: Tower, ring: Pt[]) => towerMasses(t).every((m) => m.ring.every((p) => inLot(p as Pt, ring)))
const longestEdgeAngle = (r: Pt[]) => {
  let best = 0, ang = 0
  r.forEach((a, k) => { const b = r[(k + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI } })
  return ang
}

describe('a lot’s lines: the minimum-area rectangle', () => {
  it('reads a rectangular lot’s own sides, at any turn', () => {
    const f = lotFrame(rectCorners(10, 20, 30, 40, 45))
    expect(f.angle).toBeCloseTo(45, 9)
    expect([f.hu, f.hv]).toEqual([expect.closeTo(15, 9), expect.closeTo(20, 9)])
    expect(f.centre[0]).toBeCloseTo(10, 9)
    expect(f.centre[1]).toBeCloseTo(20, 9)
    const g = lotFrame(rectCorners(0, 0, 30, 40, 135)) // the same lot a quarter turn on: the axes swap
    expect(g.angle).toBeCloseTo(45, 9)
    expect([g.hu, g.hv]).toEqual([expect.closeTo(20, 9), expect.closeTo(15, 9)])
  })
  it('reads an irregular corner lot from its dominant pair of lines (a corner cut off does not tilt it)', () => {
    const lot: Pt[] = [[0, 0], [50, 0], [50, 20], [30, 40], [0, 40]] // 50 × 40 with a 20 m × 20 m corner cut
    expect(lotFrame(lot).angle).toBeCloseTo(0, 9)
  })
})

describe('turning and placing on a lot', () => {
  it('takes the quarter turn that fits, long side along the lot’s long side, nearest the current rotation', () => {
    const lot = lotFrame(rectCorners(0, 0, 40, 60, 45)) // u at 45° is the 40 m side, v the 60 m side
    expect(chooseRotation(lot, footBox(tower(30, 20)), 0)).toBeCloseTo(-45, 9) // the 30 m side along the 60 m side
    expect(chooseRotation(lot, footBox(tower(30, 20)), 170)).toBeCloseTo(135, 9) // the same lines, nearer 170°
    expect(chooseRotation(lot, footBox(tower(55, 20)), 0)).toBeCloseTo(-45, 9) // only that turn fits
  })
  it('a downtown lot on the 45° grid: centred on the click, moved just inside, flush with the lot line', () => {
    const ring = rectCorners(100, 100, 40, 60, 45)
    const t = tower(30, 20)
    // Click 25 m along the lot's long axis from its centre: the tower's end would cross the lot line, so it is held flush.
    const a = (135 * Math.PI) / 180
    const click: Pt = [100 + 25 * Math.cos(a), 100 + 25 * Math.sin(a)]
    const r = placeOnLot(t, click, ring, 2)
    expect(r.fits).toBe(true)
    expect(r.spans).toBe(false)
    expect(mod90(r.pose.rotation)).toBeCloseTo(45, 9)
    const placed = { ...t, ...r.pose }
    expect(inside(placed, ring)).toBe(true)
    const far = Math.max(...towerMasses(placed).flatMap((m) => m.ring).map(([x, y]) => (x - 100) * Math.cos(a) + (y - 100) * Math.sin(a)))
    expect(far).toBeCloseTo(30, 6) // flush with the lot's end line, 30 m from its centre
    expect(r.segments).toHaveLength(4)
  })
  it('an irregular corner lot: the nearest spot that keeps the whole tower inside', () => {
    const lot: Pt[] = [[0, 0], [50, 0], [50, 20], [30, 40], [0, 40]]
    const t = tower(20, 20)
    const r = placeOnLot(t, [42, 32], lot, 1) // a click in the cut corner
    expect(r.fits).toBe(true)
    expect(inside({ ...t, ...r.pose }, lot)).toBe(true)
    expect(mod90(r.pose.rotation)).toBeCloseTo(0, 9)
  })
  it('a tower bigger than its lot keeps the alignment, stays on the click, and is not resized', () => {
    const ring = rectCorners(0, 0, 20, 20, 30)
    const t = tower(46, 46)
    const r = placeOnLot(t, [3, 4], ring, 2)
    expect(r.spans).toBe(true)
    expect(r.fits).toBe(false)
    expect(mod90(r.pose.rotation)).toBeCloseTo(30, 9)
    expect([r.pose.x, r.pose.y]).toEqual([3, 4])
    expect(footBox({ ...t, ...r.pose })).toEqual(footBox(t))
  })
})

describe('the City parcel layer (OGL-Vancouver, public/data)', () => {
  const DIR = new URL('../../public/data/', import.meta.url)
  const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
  const polys = decodeFootprints(read('parcels.bin'))
  const attrs = JSON.parse(readFileSync(new URL('parcels.json', DIR), 'utf8')) as ParcelAttrs
  const lots: Lots = { rings: polys.map((p) => p.outer as Pt[]), label: (i) => parcelRow(attrs, i).address || `Parcel ${i + 1}` }

  it('downtown (the study tower’s spot, cone 3.2.3): a narrow lot on the 45° grid; the 30 m study tower spans more than one lot', () => {
    const i = lotAt(lots, [336, 156])!
    expect(i).not.toBeNull()
    const ring = lots.rings[i], f = lotFrame(ring)
    expect(angDiff90(f.angle, longestEdgeAngle(ring))).toBeLessThan(0.5)
    expect(mod90(f.angle)).toBeGreaterThan(40) // the downtown peninsula grid, about 45° off the UTM grid
    expect(mod90(f.angle)).toBeLessThan(50)
    const study = useStore.getInitialState().towers.city[0]
    const r = placeOnLot(study, [336, 156], ring, 2)
    expect(angDiff90(r.pose.rotation, f.angle)).toBeLessThan(1e-6)
    expect(r.spans).toBe(true)
    const slim = tower(6, 20)
    const s = placeOnLot(slim, [336, 156], ring, 2) // a slim tower fits the lot, its long side along the lot
    expect(s.fits).toBe(true)
    expect(inside({ ...slim, ...s.pose }, ring)).toBe(true)
  })
  it('south of False Creek: the north–south grid, and the 30 m tower fits its 33 m lot', () => {
    const i = lotAt(lots, [-600, -1600])!
    expect(i).not.toBeNull()
    const ring = lots.rings[i], f = lotFrame(ring)
    expect(angDiff90(f.angle, 0)).toBeLessThan(3) // N–S within the City grid's ~1.5° from UTM north
    const t = tower(30, 30)
    const r = placeOnLot(t, [-600, -1600], ring, 2)
    expect(r.fits).toBe(true)
    expect(inside({ ...t, ...r.pose }, ring)).toBe(true)
    expect(angDiff90(r.pose.rotation, 0)).toBeLessThan(3)
  })
  it('a street: no lot under the local origin; the nearest lot lines are found within reach', () => {
    expect(lotAt(lots, [0, 0])).toBeNull()
    const n = nearestLot(lots, [0, 0], 200)
    expect(n).not.toBeNull()
    expect(n!.distance).toBeGreaterThan(0)
  })
})

describe('placing in Real Vancouver: a click lines the tower up and moves it at once', () => {
  let stop: (() => void) | undefined
  // Two downtown-style lots on the 45° grid with a 20 m street between them, centred around the study tower.
  const a45 = (45 * Math.PI) / 180, ux: Pt = [Math.cos(a45), Math.sin(a45)], vx: Pt = [-Math.sin(a45), Math.cos(a45)]
  const at = (u: number, v: number): Pt => [336 + u * ux[0] + v * vx[0], 156 + u * ux[1] + v * vx[1]]
  const lotA = rectCorners(...at(-30, 0), 40, 60, 45), lotB = rectCorners(...at(30, 0), 40, 60, 45) // 20 m apart
  const tiny = rectCorners(...at(0, 120), 12, 12, 45)
  const lots: Lots = { rings: [lotA, lotB, tiny], label: (i) => ['100 Test St', '120 Test St', '10 Small St'][i] }
  const city = () => useStore.getState().towers.city[0]
  // What the last move did (lined up with, snapped to) and where the tower now stands: moves apply at once (6 Nov).
  const proposal = () => { const a = useTowerEdit.getState().applied; return a ? { ...a, pose: { x: city().x, y: city().y, rotation: city().rotation } } : null }
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true)
    useTowerEdit.setState(useTowerEdit.getInitialState(), true)
    useStore.getState().setProject('city')
    setLotsForTest(lots)
    setShiftHeld(false)
    setMetresPerPx(0.25)
    stop?.(); stop = startHistory(); resetHistory()
  })
  afterEach(() => { stop?.(); stop = undefined; setLotsForTest(null) })

  it('a click on a lot turns the tower to its lines and keeps it inside, as one undo step', () => {
    const before = { x: city().x, y: city().y, rotation: city().rotation }
    proposePlace(city().id, ...at(-30, 5))
    const p = proposal()!
    expect(p.align).toMatchObject({ how: 'lot', fits: true })
    expect(p.align!.text).toMatch(/Aligned to the lot lines \(lot at 100 Test St\)/)
    expect(angDiff90(p.pose.rotation, 45)).toBeLessThan(1e-6)
    expect(p.hit).toMatchObject({ kind: 'parcel', how: 'aligned' })
    expect(p.hit!.segments.length).toBe(4)
    expect(inside({ ...city(), ...p.pose }, lotA)).toBe(true)
    expect(angDiff90(city().rotation, 45)).toBeLessThan(1e-6)
    undo()
    expect({ x: city().x, y: city().y, rotation: city().rotation }).toEqual(before)
  })
  it('a tower bigger than its lot is turned anyway and the hint says it spans more than one lot', () => {
    proposePlace(city().id, ...at(0, 120))
    expect(proposal()!.align).toMatchObject({ how: 'lot', fits: false })
    expect(proposal()!.align!.text).toMatch(/spans more than one lot \(30 m × 30 m on 12 m × 12 m\)/)
    expect(angDiff90(proposal()!.pose.rotation, 45)).toBeLessThan(1e-6)
  })
  it('a click on the street turns the tower to the nearest lot lines within 30 m, and says so', () => {
    const click = at(0, 0) // mid-street, 10 m from both lots
    proposePlace(city().id, ...click)
    const p = proposal()!
    expect(p.align!.how).toBe('nearby')
    expect(p.align!.text).toMatch(/Nothing under the click: turned to the lot lines 10 m away/)
    expect(angDiff90(p.pose.rotation, 45)).toBeLessThan(1e-6)
  })
  it('far from any lot the rotation is kept, and Shift places freely with no alignment', () => {
    proposePlace(city().id, ...at(0, 300))
    expect(proposal()!.align).toMatchObject({ how: 'none' })
    expect(proposal()!.pose.rotation).toBe(0)
    setShiftHeld(true)
    const click = at(-30, 5)
    proposePlace(city().id, ...click)
    expect(proposal()!.align).toMatchObject({ how: 'free' })
    expect(proposal()!.pose).toEqual({ x: Math.round(click[0] * 1e6) / 1e6, y: Math.round(click[1] * 1e6) / 1e6, rotation: 0 })
  })
  it('"Align to lot" (L) lines up a tower already placed, at once; a second press has nothing to do', () => {
    useStore.getState().updateTower(city().id, { ...((([x, y]) => ({ x, y }))(at(30, -5))), rotation: 10 })
    resetHistory()
    expect(alignToLot(city().id)).toBe(true)
    expect(proposal()).toMatchObject({ via: 'align', align: { how: 'lot', fits: true } })
    expect(proposal()!.align!.text).toMatch(/120 Test St/)
    expect(angDiff90(city().rotation, 45)).toBeLessThan(1e-6)
    expect(alignToLot(city().id)).toBe(false)
    undo()
    expect(city().rotation).toBe(10)
  })
  it('a study site from the site tools wins over the lots under it', async () => {
    const { setSiteBoundary } = await import('./siteGeometry')
    setSiteBoundary('city', { ring: rectCorners(...at(-30, 0), 36, 56, 45), label: 'Study site at 100 Test St', flag: 'team_assumption', source: 'test' })
    proposePlace(city().id, ...at(-30, 0))
    expect(proposal()!.align).toMatchObject({ how: 'site', fits: true })
    expect(proposal()!.align!.text).toMatch(/the study site \(Study site at 100 Test St\)/)
    setSiteBoundary('city', null)
  })
})
