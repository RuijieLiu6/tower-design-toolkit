// Place the model on the site and confirm, after an upload or the first Rhino copy (Ruijie, 6 Nov), and its basement.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { basementRing, basementSummary } from '../../engine/basement'
import type { Tower } from '../../engine/types'
import { defaultTower, useStore } from '../../store'
import { read3dmWith } from './rhino'
import { applyModel, updateTower } from '../interchange/apply'
import { buildModel, defaultOptions } from '../interchange/build'
import { rhinoLinkModel, typicalTower } from '../interchange/fixtures'
import { checkLinkNow, linkOptions, projectFrame, siteCentreOf, startLink, stopLink } from '../interchange/live'
import { autoMapping } from '../interchange/mapping'
import { VTC_SITE } from '../siteGeometry'
import { normalizeDeg, poseOf, setPose } from '../towerEdit'
import { anchorFor, baseOf, confirmPlacement, modelTowers, resetPlacementWatch, rigidFollow, siteFit, startPlaceGuide, usePlaceGuide } from './placeModel'

vi.setConfig({ testTimeout: 30_000 })

async function version(towerBTop?: number) {
  const rh = await rhino3dm()
  const f = typicalTower(rh, { towerBTop })
  const raw = read3dmWith(rh, f.bytes, f.name)
  const mapping = { ...autoMapping(raw), confirmed: [] as string[] }
  const frame = projectFrame()
  const opts = defaultOptions(raw, mapping, frame, 4.2)
  const built = buildModel({ raw, mapping, opts, frame, bands: [{ use: 'office', share: 1 }], podiumUse: 'retail', takenIds: [] })
  return { rh, f, raw, mapping, opts, built }
}
const named = (n: string) => useStore.getState().towers.vtc.find((t) => t.name === n)!
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('placing an uploaded model on the site', () => {
  beforeEach(() => {
    stopLink(); resetPlacementWatch()
    useStore.setState(useStore.getInitialState(), true)
    usePlaceGuide.setState(usePlaceGuide.getInitialState(), true)
  })

  it('a point follows a move and a turn about the moved point', () => {
    const p = rigidFollow({ x: 0, y: 0, rotation: 10 }, { x: 5, y: 0, rotation: 100 }, { x: 10, y: 0, rotation: 20 })
    expect(p.x).toBeCloseTo(5, 9)
    expect(p.y).toBeCloseTo(10, 9)
    expect(p.rotation).toBeCloseTo(110, 9)
  })

  it('the anchor from a moved and turned model rebuilds both towers exactly where they were put', async () => {
    const v = await version()
    applyModel(v.built, v.raw, 'replace-all')
    const model = useStore.getState().models.vtc!
    const [A, B] = modelTowers(useStore.getState(), 'vtc', model.id)
    const to = { x: A.x + 37.5, y: A.y - 12.25, rotation: normalizeDeg(A.rotation + 30) }
    const anchor = anchorFor(baseOf(model, [A, B]), A.id, to)!
    const re = buildModel({ raw: v.raw, mapping: v.mapping, opts: { ...v.opts, placement: 'anchor', anchor }, frame: projectFrame(), bands: [{ use: 'office', share: 1 }], podiumUse: 'retail', takenIds: [] })
    const nA = re.towers.find((t) => t.tower.name === A.name)!.tower, nB = re.towers.find((t) => t.tower.name === B.name)!.tower
    expect([nA.x, nA.y, nA.rotation]).toEqual([expect.closeTo(to.x, 2), expect.closeTo(to.y, 2), expect.closeTo(to.rotation, 3)])
    const eB = rigidFollow(poseOf(A), to, poseOf(B))
    expect([nB.x, nB.y, nB.rotation]).toEqual([expect.closeTo(eB.x, 2), expect.closeTo(eB.y, 2), expect.closeTo(eB.rotation, 3)])
  })

  it('the guide moves the model as one piece, the Rhino link keeps it there, and Confirm records the site', async () => {
    const v1 = await version()
    applyModel(v1.built, v1.raw, 'replace-all')
    let current = new File([v1.f.bytes as BlobPart], v1.f.name, { lastModified: 1_000 })
    startLink({ name: v1.f.name, getFile: async () => current }, { mapping: v1.mapping, opts: v1.opts, project: 'vtc' }, current, { read: async (f) => read3dmWith(v1.rh, new Uint8Array(await f.arrayBuffer()), f.name), poll: false })
    startPlaceGuide('vtc', useStore.getState().models.vtc!.id)
    expect(usePlaceGuide.getState()).toMatchObject({ active: true, step: 'place' })
    expect(useStore.getState().placing).toBe(true)
    const A0 = named('Tower A'), B0 = named('Tower B')
    setPose(A0.id, { x: A0.x + 20, y: A0.y + 5 })
    await settle()
    // Tower B followed, and the link now places the model by an anchor.
    expect(named('Tower B').x).toBeCloseTo(B0.x + 20, 6)
    expect(named('Tower B').y).toBeCloseTo(B0.y + 5, 6)
    expect(linkOptions()).toMatchObject({ placement: 'anchor' })
    // Rhino saves again (tower B raised): the model comes back where it was put, not where the file has it.
    current = new File([typicalTower(v1.rh, { towerBTop: 180 }).bytes as BlobPart], v1.f.name, { lastModified: 2_000 })
    expect(await checkLinkNow()).toBe('updated')
    await settle()
    expect(named('Tower A').x).toBeCloseTo(A0.x + 20, 2)
    expect(named('Tower B').x).toBeCloseTo(B0.x + 20, 2)
    expect(named('Tower B').height).toBeCloseTo(180, 6)
    expect(confirmPlacement(() => new Date('2026-11-06T23:00:00Z'))).toBe(true)
    expect(useStore.getState().models.vtc!.frame.placement).toMatchObject({ mode: 'anchor', confirmed: { at: '2026-11-06T23:00:00.000Z', site: 'the competition block' } })
    expect(usePlaceGuide.getState().active).toBe(false)
    expect(useStore.getState().placing).toBe(false)
  })

  it('says whether the footprint is inside the site, past its edge, or off it', () => {
    const ring = VTC_SITE.ring as [number, number][]
    const t: Tower = { ...defaultTower('vtc'), x: 0, y: 0, rotation: 0, width: 30, depth: 30, podiumWidth: 30, podiumDepth: 30, podiumHeight: 0 }
    expect(siteFit([t], ring).state).toBe('pass')
    expect(siteFit([{ ...t, x: 60 }], ring)).toMatchObject({ state: 'warn' })
    expect(siteFit([{ ...t, x: 400 }], ring)).toMatchObject({ state: 'fail' })
  })

  it('Real Vancouver: a file without map coordinates lands on the study site', async () => {
    const rh = await rhino3dm()
    const f = rhinoLinkModel(rh)
    const raw = read3dmWith(rh, f.bytes, f.name)
    const ring: [number, number][] = [[100, 200], [160, 200], [160, 260], [100, 260]]
    useStore.setState({ project: 'city', citySite: { ring, source: 'drawn', note: 'test', label: '1 Test St', replaced: [], keepReplaced: false, parcelsAdd: [], parcelsSkip: [] } as never })
    expect(siteCentreOf()).toEqual([130, 230])
    const opts = defaultOptions(raw, autoMapping(raw), projectFrame(), 4.2)
    expect(opts.placement).toBe('centre')
  })
})

describe('the basement after an upload', () => {
  it('can be dug to the whole site', () => {
    const ring = VTC_SITE.ring as [number, number][]
    const t: Tower = { ...defaultTower('vtc'), basement: { levels: 2, f2f: 3.2, use: 'parking', extent: 'site', ring } }
    expect(basementRing(t)).toBe(ring)
    expect(basementSummary(t)!.areaPerLevel).toBeCloseTo(144.8 * 79.2, 0)
  })

  it('a model update takes the basement the model sets, and keeps one set in the toolkit when the model has none', async () => {
    const base: Tower = (await version()).built.towers[0].tower
    const own = { levels: 2, f2f: 3.2, use: 'parking' as const, extent: 'podium' as const }
    const fromModel = { ...own, levels: 3, from: 'model' as const }
    expect(updateTower({ ...base, basement: own }, base).basement).toEqual(own)
    expect(updateTower({ ...base, basement: own }, { ...base, basement: fromModel }).basement).toEqual(fromModel)
    expect(updateTower({ ...base, basement: fromModel }, base).basement).toBeUndefined()
  })
})
