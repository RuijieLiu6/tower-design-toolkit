import { beforeEach, describe, expect, it } from 'vitest'
import { rectCorners, towerFootprint } from '../engine/massing'
import { checkTowerCones } from '../engine/towerCones'
import { CITY_ORIGIN, useStore } from '../store'
import type { Pt } from './edgeSnap'
import { proposalReport, type ProposalInput } from './proposalCheck'
import { VTC_SITE, type SiteBoundary } from './siteGeometry'

const rules = { fsrTier: 2 as const, transitLink: false }
const vtc = () => useStore.getInitialState().towers.vtc[0]
const city = () => useStore.getInitialState().towers.city[0]
const flat = (h: number) => (corners: Pt[]) => (corners.length ? { value: h, min: h, max: h } : null)

describe('proposal report: the checks at a position that is not confirmed yet', () => {
  beforeEach(() => useStore.setState(useStore.getInitialState(), true))

  it('competition site: runs the containment rule on the proposed footprint, with its flag and the brief as source', () => {
    const inside = proposalReport({ project: 'vtc', tower: vtc(), pose: { x: 0, y: 0, rotation: 0 }, site: VTC_SITE, ground: { mode: 'manual', elevation: 0, under: null }, rules })
    expect(inside.fit).toEqual([expect.objectContaining({ id: 'site', state: 'pass', flag: 'team_assumption' })])
    expect(inside.fit[0].source).toMatch(/p\.15/)
    expect(inside.cones).toEqual([])
    const out = proposalReport({ project: 'vtc', tower: vtc(), pose: { x: 60, y: 0, rotation: 0 }, site: VTC_SITE, ground: { mode: 'manual', elevation: 0, under: null }, rules })
    expect(out.fit[0]).toMatchObject({ state: 'fail' })
    expect(out.fit[0].text).toMatch(/extends past the block/)
  })

  it('the footprint is the tower outline at the proposed pose (rotation consistent with rectCorners)', () => {
    const t = { ...vtc(), podiumHeight: 0 }
    const r = proposalReport({ project: 'vtc', tower: t, pose: { x: 12, y: -7, rotation: 33 }, site: VTC_SITE, ground: { mode: 'manual', elevation: 0, under: null }, rules })
    expect(r.footprint).toEqual(rectCorners(12, -7, t.width, t.depth, 33))
    expect(r.footprint).toEqual(towerFootprint({ ...t, x: 12, y: -7, rotation: 33 }))
  })

  it('Real Vancouver: view cones from the existing check, on the base the terrain gives at the new spot', () => {
    const t = city()
    const pose = { x: t.x, y: t.y, rotation: 0 }
    const input: ProposalInput = { project: 'city', tower: t, pose, site: null, ground: { mode: 'terrain', elevation: 15, under: flat(31.24) }, rules }
    const r = proposalReport(input)
    expect(r.base).toBe(31.2)
    expect(r.baseNote).toMatch(/Terrain under the footprint/)
    // The same check as Results & evidence (useResults → checkTowerCones), at the proposed pose and base.
    const expected = checkTowerCones({ ...t, ...pose }, 31.2, CITY_ORIGIN)
    expect(r.cones.map((c) => [c.cone.id, c.state, c.exceed])).toEqual(expected.map((c) => [c.cone.id, c.state, c.exceed]))
    expect(r.cones.find((c) => c.cone.id === '3.2.3')?.state).not.toBe('outside') // evaluation case 5's spot
    const manual = proposalReport({ ...input, ground: { ...input.ground, mode: 'manual' } })
    expect(manual.base).toBe(15)
    expect(manual.baseNote).toMatch(/by hand/)
  })

  it('Real Vancouver: says when there is no site yet, checks a site when the site tools supply one, and flags water', () => {
    const t = city()
    const pose = { x: t.x, y: t.y, rotation: 0 }
    const base: ProposalInput = { project: 'city', tower: t, pose, site: null, ground: { mode: 'terrain', elevation: 15, under: flat(20) }, rules }
    const none = proposalReport(base)
    expect(none.fit.find((f) => f.id === 'site')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(none.fit.find((f) => f.id === 'land')).toMatchObject({ state: 'pass', flag: 'unverified' })
    const site: SiteBoundary = { ring: rectCorners(t.x, t.y, 40, 40, 0), label: 'Drawn study boundary', flag: 'team_assumption', source: 'test' }
    expect(proposalReport({ ...base, site }).fit.find((f) => f.id === 'site')).toMatchObject({ state: 'pass', flag: 'team_assumption' })
    const off = proposalReport({ ...base, site, pose: { ...pose, x: t.x + 12 } })
    expect(off.fit.find((f) => f.id === 'site')?.state).toBe('fail')
    expect(off.fit.find((f) => f.id === 'site')?.text).toMatch(/by up to 7\.0 m/) // east face 12 + 15 = 27 vs the site's 20
    const water = proposalReport({ ...base, ground: { ...base.ground, under: (c) => (c.length ? { value: 2, min: -1.5, max: 4 } : null) } })
    expect(water.fit.find((f) => f.id === 'land')).toMatchObject({ state: 'fail' })
    const unloaded = proposalReport({ ...base, ground: { mode: 'terrain', elevation: 15, under: null } })
    expect(unloaded.fit.find((f) => f.id === 'land')?.state).toBe('unknown')
    expect(unloaded.base).toBe(15)
  })
})
