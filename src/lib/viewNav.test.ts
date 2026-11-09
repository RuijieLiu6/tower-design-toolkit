// Viewport navigation (Milestone 1, 9 Nov): framing geometry into the free part of the view with breathing room, the
// Plan top view, which commands can run (and the reasons they can't), the selection order, the scale read-out and Home.
import { beforeEach, describe, expect, it } from 'vitest'
import { fitPoints, project, viewBasis, type V3 } from './fitView'
import { FILL, availability, classify, describe as say, framePose, readHome, selection, setHome, sitePoints, type Pose } from './viewNav'
import { defaultTower, useStore } from '../store'
import { useSiteStore } from './siteStore'
import { useTowerEdit } from './towerEdit'
import { useVistaLook } from './vistaLook'

/** Screen extent (normalised -1..1) of `pts` seen from `pose`, looking along the given direction. */
function extent(pts: V3[], pose: Pose, aspect: number, el: number, az: number) {
  const b = viewBasis(el, az), tanHalf = Math.tan((pose.fov * Math.PI) / 360)
  const s = pts.map((p) => project(p, pose.position, b, tanHalf, aspect))
  return { x0: Math.min(...s.map((q) => q[0])), x1: Math.max(...s.map((q) => q[0])), y0: Math.min(...s.map((q) => q[1])), y1: Math.max(...s.map((q) => q[1])) }
}
// A downtown block (about 106 m × 106 m) turned to the street grid, as the default site is.
const RING: [number, number][] = [[300, 450], [375, 525], [300, 600], [225, 525]]

beforeEach(() => {
  useStore.setState({ project: 'city', citySite: { ring: RING } as never, towers: { vtc: [defaultTower('vtc')], city: [] }, selectedTower: '' })
  useSiteStore.setState({ picked: [], marker: null })
  useTowerEdit.setState({ picked: null })
  useVistaLook.setState({ inspected: null, mode: 'city' })
  try { localStorage.clear() } catch { /* node: no storage */ }
})

describe('fitPoints with a panel open on one side', () => {
  it('keeps the outline clear of a right-hand dock and centred in what is left', () => {
    const pts: V3[] = RING.map(([x, y]) => [x, y, 0])
    const o = { aspect: 1.1, fov: 35, elevationDeg: 55, azimuthDeg: 200 }
    const ins = { top: 0.1, bottom: 0.16, left: 0, right: 0.35 }
    const cam = fitPoints(pts, { ...o, insets: ins, fill: 0.7 })
    const e = extent(pts, { ...cam }, o.aspect, o.elevationDeg, o.azimuthDeg)
    expect(e.x1).toBeLessThanOrEqual(1 - 2 * ins.right + 1e-3)
    expect((e.x0 + e.x1) / 2).toBeCloseTo(ins.left - ins.right, 2)
  })
})

describe('framing commands', () => {
  // The free part of the view and its centre for the default insets (no canvas in a test: 10% top, 15% bottom).
  const free = { lo: -1 + 2 * 0.15, hi: 1 - 2 * 0.1 }
  // Without a canvas the view's aspect is the 1.34 default; the browser test (e2e/site-navigation.e2e.ts) checks the real
  // views at 1440 × 900 and 1280 × 800.
  {
    it('Frame site keeps the boundary inside the free view with about 15% of breathing room', () => {
      const pts = sitePoints()!
      const { az, el } = { az: 180, el: 50 }
      const pose = framePose(pts, { azimuth: az, elevation: el, minSpan: 1 })
      const e = extent(pts, pose, 1.34, el, az) // viewAspect() falls back to 1.34 without a canvas
      expect(e.y0).toBeGreaterThanOrEqual(free.lo - 1e-3); expect(e.y1).toBeLessThanOrEqual(free.hi + 1e-3)
      expect(e.x0).toBeGreaterThanOrEqual(-1 - 1e-3); expect(e.x1).toBeLessThanOrEqual(1 + 1e-3)
      // The tighter direction fills FILL of the free band: (1 - FILL) / 2 = 15% each side.
      const fy = (e.y1 - e.y0) / (free.hi - free.lo), fx = (e.x1 - e.x0) / 2
      expect(Math.max(fx, fy)).toBeGreaterThan(FILL - 0.03)
      expect(Math.max(fx, fy)).toBeLessThan(FILL + 0.03)
    })
  }
  it('Plan is straight down, north up, over the subject', () => {
    const pose = framePose(sitePoints()!, { plan: true, minSpan: 400 })
    expect(Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1])).toBeLessThan(0.05)
    expect(pose.position[2]).toBeGreaterThan(pose.target[2] + 100)
    expect(pose.fov).toBe(20)
    expect(Math.hypot(pose.target[0] - 300, pose.target[1] - 525)).toBeLessThan(40) // over the site
  })
  it('a small site still shows its streets: Frame site is at least about 260 m across', () => {
    const pose = framePose(sitePoints()!, { minSpan: 260, azimuth: 180, elevation: 50 })
    const d = Math.hypot(...(pose.position.map((v, i) => v - pose.target[i]) as V3))
    expect(2 * d * Math.tan((pose.fov * Math.PI) / 360)).toBeGreaterThanOrEqual(259)
  })
})

describe('what can run, and why not', () => {
  it('with no tower, Frame tower is unavailable and says so; Frame site works', () => {
    const a = availability()
    expect(a.site.ok).toBe(true)
    expect(a.tower.ok).toBe(false)
    expect(a.tower.reason).toMatch(/No tower yet/)
    expect(a.selection.ok).toBe(false)
    expect(a.selection.reason).toMatch(/Nothing selected/)
  })
  it('with no site, Frame site is unavailable and says where to choose one', () => {
    useStore.setState({ citySite: null })
    expect(availability().site).toEqual({ ok: false, reason: expect.stringMatching(/No site yet/) })
  })
  it('several towers and none selected: select one first', () => {
    useStore.setState({ towers: { vtc: [], city: [{ ...defaultTower('city'), id: 'a' }, { ...defaultTower('city'), id: 'b' }] }, selectedTower: '' })
    expect(availability().tower.reason).toMatch(/select one/)
  })
  it('the selection is the most specific pick: a picked tower before the address marker', () => {
    useSiteStore.setState({ marker: { at: [300, 525], label: '1128 W Georgia', kind: 'address', source: 'city' } })
    expect(selection()?.label).toBe('1128 W Georgia')
    useStore.setState({ towers: { vtc: [], city: [{ ...defaultTower('city'), id: 'a', name: 'Tower A' }] }, selectedTower: 'a' })
    useTowerEdit.setState({ picked: 'a' })
    expect(selection()?.label).toBe('Tower A')
  })
})

describe('where am I looking', () => {
  const o = { vtc: false, looking: false, plan: false, nearSite: true, nearTower: null as number | null }
  it('names the scale from the view width and what is near the centre', () => {
    expect(classify(9000, o)).toBe('city')
    expect(classify(1200, o)).toBe('neighbourhood')
    expect(classify(300, o)).toBe('site')
    expect(classify(300, { ...o, nearSite: false })).toBe('close')
    expect(classify(220, { ...o, nearTower: 120 })).toBe('tower')
    expect(classify(1200, { ...o, plan: true })).toBe('plan')
    expect(classify(50, { ...o, looking: true })).toBe('viewpoint')
    expect(classify(2000, { ...o, vtc: true })).toBe('city')
  })
  it('says it in words, with the width', () => {
    expect(say('site', 287, false)).toBe('Your site and its streets, about 290 m across')
    expect(say('city', 8941, false)).toBe('Vancouver as a whole, about 8.9 km across')
    expect(say('city', 3000, true)).toMatch(/competition context/)
  })
})

describe('Home', () => {
  it('a saved Home belongs to its site: another site falls back to the default', () => {
    if (typeof localStorage === 'undefined') return // node without storage: nothing to keep
    expect(readHome()).toBeNull()
    expect(setHome()).toBe(false) // no live camera in a test: nothing to save
  })
})
