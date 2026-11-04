// A new version of an uploaded model: the update mode, and the live link that re-reads a saved file (Rhino item 3,
// 4 Nov 2026). The browser parts (file picker, worker) are replaced by a stand-in handle and the Node reader.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { towerFloors } from '../../engine/massing'
import { useStore } from '../../store'
import { read3dmWith } from '../import/rhino'
import { tagStoreys } from '../import/store'
import { applyModel } from './apply'
import { buildModel, defaultOptions } from './build'
import { typicalTower } from './fixtures'
import { checkLinkNow, projectFrame, startLink, stopLink, useLiveLink } from './live'
import { autoMapping } from './mapping'

vi.setConfig({ testTimeout: 30_000 })

async function version(towerBTop?: number) {
  const rh = await rhino3dm()
  const f = typicalTower(rh, { towerBTop })
  const raw = read3dmWith(rh, f.bytes, f.name)
  const mapping = { ...autoMapping(raw), confirmed: [] as string[] }
  const frame = projectFrame()
  const opts = defaultOptions(raw, mapping, frame, 4.2)
  const s = useStore.getState()
  const built = buildModel({ raw, mapping, opts, frame, bands: [{ use: 'office', share: 1 }], podiumUse: 'retail', takenIds: s.towers[s.project].map((t) => t.id) })
  return { rh, f, raw, mapping, opts, built }
}
const named = (n: string) => useStore.getState().towers.vtc.find((t) => t.name === n)!

describe('a new version of an uploaded model', () => {
  beforeEach(() => { stopLink(); useStore.setState(useStore.getInitialState(), true) })

  it('update replaces only that model\'s towers, keeping their ids, names and hand-set storey uses, and the person\'s own towers', async () => {
    const v1 = await version()
    applyModel(v1.built, v1.raw, 'add')
    const own = useStore.getState().towers.vtc[0]
    expect(useStore.getState().towers.vtc.map((t) => t.name)).toEqual([own.name, 'Tower A', 'Tower B'])
    const b = named('Tower B')
    useStore.getState().updateTower(b.id, { name: 'Tower B (hotel)' })
    tagStoreys(named('Tower B (hotel)'), [10], { use: 'hotel' })
    const v2 = await version(180)
    applyModel(v2.built, v2.raw, 'update')
    const list = useStore.getState().towers.vtc
    expect(list.map((t) => t.id)).toEqual([own.id, named('Tower A').id, b.id])
    const nb = named('Tower B (hotel)')
    expect(nb.height).toBeCloseTo(180, 6)
    expect(towerFloors(nb).find((f) => f.level === 10)!.use).toBe('hotel')
    expect(towerFloors(nb).find((f) => f.level === 11)!.use).toBe('office')
    // The model points at the same tower records.
    expect(useStore.getState().models.vtc!.towers.map((t) => t.id)).toEqual([named('Tower A').id, b.id])
  })

  it('the live link re-reads the file when it is saved again and updates the model in place', async () => {
    const v1 = await version()
    applyModel(v1.built, v1.raw, 'replace-all')
    const idB = named('Tower B').id
    let current = new File([v1.f.bytes as BlobPart], v1.f.name, { lastModified: 1_000 })
    const handle = { name: v1.f.name, getFile: async () => current }
    startLink(handle, { mapping: v1.mapping, opts: v1.opts, project: 'vtc' }, current, { read: async (f) => read3dmWith(v1.rh, new Uint8Array(await f.arrayBuffer()), f.name), poll: false })
    expect(useLiveLink.getState()).toMatchObject({ status: 'watching', name: v1.f.name })
    expect(await checkLinkNow()).toBe('unchanged')
    // Saved again in Rhino with tower B raised to 180 m.
    const v2 = typicalTower(v1.rh, { towerBTop: 180 })
    current = new File([v2.bytes as BlobPart], v1.f.name, { lastModified: 2_000 })
    expect(await checkLinkNow(() => new Date('2026-11-04T19:32:00Z'))).toBe('updated')
    expect(named('Tower B').id).toBe(idB)
    expect(named('Tower B').height).toBeCloseTo(180, 6)
    expect(useLiveLink.getState()).toMatchObject({ status: 'watching', lastSync: '2026-11-04T19:32:00.000Z' })
    expect(useLiveLink.getState().message).toMatch(/^Updated from typical-two-towers-mm\.3dm saved at/)
    expect(await checkLinkNow()).toBe('unchanged')
    // In the other project it waits instead of updating the wrong one.
    current = new File([v1.f.bytes as BlobPart], v1.f.name, { lastModified: 3_000 })
    useStore.getState().setProject('city')
    expect(await checkLinkNow()).toBe('skipped')
    stopLink()
    expect(useLiveLink.getState().status).toBe('off')
  })
})
