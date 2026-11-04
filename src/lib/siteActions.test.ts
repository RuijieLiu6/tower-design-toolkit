import { beforeEach, describe, expect, it } from 'vitest'
import type { Pt } from '../engine/site'
import { useStore } from '../store'
import { breakStep, resetHistory, startHistory, undo } from './project/history'
import { buildingsOn, idsOf, lotsTouching, replaceBuildings, replacedFor, siteFromLots, unionOfLots, useSiteStep, type LotLayer } from './siteActions'
import { newSite, useSiteStore } from './siteStore'

const sq = (x: number, y: number, w = 10, h = 10): { outer: Pt[]; holes: Pt[][] } => ({ outer: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], holes: [] })
// Lots: A | B share a lot line; C (larger) sits across a 15 m street; D repeats A's outline (a strata record).
const LOTS = [sq(0, 0), sq(10, 0), sq(35, 0, 25, 10), sq(0, 0)]
const layer: LotLayer = { polys: LOTS, sha: 'test', label: (i) => `Lot ${'ABCD'[i]}` }
// Buildings: 1 stands on A, 2 straddles A and B, 3 stands on C, 4 is a second part of building 1.
const FP = [{ id: 1, ...sq(2, 2, 4, 4) }, { id: 2, ...sq(8, 2, 4, 4) }, { id: 3, ...sq(40, 2, 5, 5) }, { id: 1, ...sq(6, 6, 2, 2) }]

describe('lots combine only along shared lot lines', () => {
  it('joins adjacent lots into one ring, counting a repeated outline once', () => {
    const u = unionOfLots(LOTS, [0, 1, 3])
    expect(u.ok).toBe(true)
    if (!u.ok) return
    expect(u.area).toBe(200)
    expect(u.lots.sort()).toEqual([0, 1])
    expect(u.duplicates).toBe(1)
  })
  it('refuses lots across a street, or keeps the largest block for a box', () => {
    const r = unionOfLots(LOTS, [0, 2])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/do not share a lot line/)
    const b = unionOfLots(LOTS, [0, 1, 2], true)
    expect(b.ok && b.lots).toEqual([2])
    expect(b.ok && b.dropped.sort()).toEqual([0, 1])
    // A box mostly over A and B keeps that block, though C is larger.
    const box: Pt[] = [[2, 2], [38, 2], [38, 8], [2, 8]]
    const k = unionOfLots(LOTS, [0, 1, 2], box)
    expect(k.ok && k.lots.sort()).toEqual([0, 1])
    expect(k.ok && k.dropped).toEqual([2])
  })
  it('a box selects every lot it touches by at least 1 m²', () => {
    expect(lotsTouching([5, 5, 12, 12], LOTS).sort()).toEqual([0, 1, 3])
    expect(lotsTouching([21, 0, 34, 10], LOTS)).toEqual([])
  })
})

describe('buildings on a site', () => {
  it('counts a building when at least half of it stands inside; parts share one id', () => {
    const a = LOTS[0].outer
    expect(buildingsOn(a, FP).sort()).toEqual([0, 1, 3])
    expect(idsOf(FP, buildingsOn(a, FP)).sort()).toEqual([1, 2])
  })
  it('keeps buildings replaced by hand outside the old site; ones on the old site return when the site moves', () => {
    const prev = newSite(LOTS[0].outer, 'parcels', 'A', { replaced: [1, 3] }) // 3 was replaced by hand, across the street
    expect(replacedFor(LOTS[2].outer, prev, FP).sort()).toEqual([3])
    expect(replacedFor(unionOfLots(LOTS, [0, 1]).ok ? (unionOfLots(LOTS, [0, 1]) as { ring: Pt[] }).ring : [], prev, FP).sort()).toEqual([1, 2, 3])
  })
})

describe('site actions are single undo steps and say what they did', () => {
  let stop: () => void
  beforeEach(() => {
    stop?.()
    useStore.setState({ citySite: null, project: 'city' })
    stop = startHistory()
    resetHistory()
    useSiteStep.setState({ toast: null })
  })
  it('use a lot, add the next one, undo back to one lot', () => {
    expect(siteFromLots([0], layer, FP, 'use')).toBe(true)
    breakStep()
    // Building 2 stands half on lot A: half counts (ON_SITE_SHARE).
    expect(useSiteStore.getState().site?.replaced.sort()).toEqual([1, 2])
    expect(siteFromLots([0, 1], layer, FP, 'add')).toBe(true)
    const s = useSiteStore.getState().site!
    expect(s.source).toBe('parcels')
    expect(s.replaced.sort()).toEqual([1, 2])
    expect(useSiteStep.getState().toast?.text).toMatch(/^Lot added: site 200 m² from 2 lots; 2 buildings on it shown as demolished/)
    expect(useSiteStep.getState().toast?.undoable).toBe(true)
    expect(undo()).toBe(true)
    expect(useSiteStore.getState().site?.label).toBe('Lot A')
  })
  it('refuses to combine lots across a street and leaves the site alone', () => {
    siteFromLots([0], layer, FP, 'use')
    const before = useSiteStore.getState().site
    expect(siteFromLots([0, 2], layer, FP, 'add')).toBe(false)
    expect(useSiteStore.getState().site).toBe(before)
    expect(useSiteStep.getState().toast?.kind).toBe('error')
  })
  it('replace a building: without a site its footprint becomes the site; with one it joins the replaced list', () => {
    expect(replaceBuildings([2], FP)).toBe(true)
    expect(useSiteStore.getState().site?.source).toBe('buildings')
    expect(useSiteStore.getState().site?.replaced).toEqual([3])
    breakStep()
    expect(replaceBuildings([0, 3], FP)).toBe(true)
    expect(useSiteStore.getState().site?.replaced.sort()).toEqual([1, 3])
    expect(useSiteStep.getState().toast?.text).toMatch(/outside the study site/)
    expect(undo()).toBe(true)
    expect(useSiteStore.getState().site?.replaced).toEqual([3])
  })
})
