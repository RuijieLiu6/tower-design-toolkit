import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../store'
import { useCommunityStore } from '../communityStore'
import example from '../../../skills/tower-studio-node-builder/references/example-node.json'
import type { NodePackage } from '../nodePackages'
import { defaultDesign, pickDesign, type Design } from './design'
import { exportProject, readProject, stableStringify, toDesign, toProjectFile, type ProjectFile } from './projectFile'
import { MERGE_MS, redo, resetHistory, startHistory, undo, withoutHistory } from './history'
import { getProject, listProjects, putProject, storageAvailable } from './storage'
import { openText } from './session'

const fresh = () => { useStore.setState(useStore.getInitialState(), true); useCommunityStore.setState({ packages: [], params: {} }) }
const file = (d: Design = defaultDesign()) => JSON.parse(exportProject(d)) as ProjectFile
const problems = (f: unknown) => readProject(JSON.stringify(f)).problems.join('\n')

describe('project file: deterministic export and import', () => {
  beforeEach(fresh)
  it('round-trips: export → import → export gives the same bytes', () => {
    const d = defaultDesign()
    const text = exportProject(d)
    const r = readProject(text)
    expect(r.ok).toBe(true)
    expect(exportProject(toDesign(r.file!))).toBe(text)
  })
  it('round-trips an edited design, both projects included', () => {
    const s = useStore.getState()
    s.updateTower('t1', { height: 291.5, bands: [{ use: 'office', share: 0.7 }, { use: 'residential', share: 0.3 }], skyLobbies: [30] })
    s.addTower()
    useStore.setState({ fsrTier: 3, transitLink: true, groundElevation: 22.4, sun: { month: 6, day: 21, hour: 15.5 }, publicRealm: { ...useStore.getState().publicRealm, openPublicShare: 0.4 } })
    s.setProject('city')
    s.updateTower('c1', { height: 140, rotation: 12.5 })
    const d = pickDesign(useStore.getState())
    const text = exportProject(d)
    const back = toDesign(readProject(text).file!)
    expect(back.towers.vtc.length).toBe(2)
    expect(back.towers.vtc[0].height).toBe(291.5)
    expect(back.towers.city[0].rotation).toBe(12.5)
    expect(back.project).toBe('city')
    expect(back.groundElevation).toBe(22.4)
    expect(back.sun).toEqual({ month: 6, day: 21, hour: 15.5 })
    expect(back.publicRealm.openPublicShare).toBe(0.4)
    expect(exportProject(back)).toBe(text)
  })
  it('is deterministic: key order and float noise do not change the bytes, and there are no timestamps', () => {
    const d = defaultDesign()
    const shuffled: Design = { ...d, towers: { vtc: d.towers.vtc.map((t) => Object.fromEntries(Object.entries(t).reverse()) as typeof t), city: d.towers.city }, enabled: Object.fromEntries(Object.entries(d.enabled).reverse()) }
    expect(exportProject(shuffled)).toBe(exportProject(d))
    expect(stableStringify({ b: 0.1 + 0.2, a: -0 })).toBe('{\n  "a": 0,\n  "b": 0.3\n}\n')
    const text = exportProject(d)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    expect(Object.keys(JSON.parse(text)).slice(0, 4)).toEqual(['format', 'app', 'project', 'site'])
  })
  it('records true north and datum for each project', () => {
    const f = file()
    expect(f.site.vtc.north.deg).toBe(45)
    expect(f.site.vtc.datum.groundElevation).toBeNull()
    expect(f.site.city.datum.vertical).toMatch(/CGVD28/)
    expect(f.site.city.datum.groundElevation).toBe(15)
    expect(f.site.city.datum.groundMode).toBe('terrain') // the base follows the terrain by default (27 Oct)
    expect(f.site.city.datum.basis).toMatch(/follows the terrain/)
    expect(f.site.city.frame).toMatch(/EPSG:26910/)
  })
  it('keeps the base of files saved before the ground mode existed (set by hand)', () => {
    const f = file()
    delete f.site.city.datum.groundMode
    f.site.city.datum.groundElevation = 18.5
    const r = readProject(JSON.stringify(f))
    expect(r.ok).toBe(true)
    const d = toDesign(r.file!)
    expect([d.groundElevation, d.groundMode]).toEqual([18.5, 'manual'])
    expect(toDesign(readProject(exportProject({ ...d, groundMode: 'terrain' })).file!).groundMode).toBe('terrain')
    expect(problems({ ...f, site: { ...f.site, city: { ...f.site.city, datum: { ...f.site.city.datum, groundMode: 'guess' } } } })).toMatch(/groundMode|allowed/)
  })
  it('switches on built nodes that did not exist when the file was saved', () => {
    const f = file()
    f.nodes.enabled = f.nodes.enabled.filter((id) => id !== 'built.fsr')
    f.nodes.known = f.nodes.known!.filter((id) => id !== 'built.sun')
    f.nodes.enabled = f.nodes.enabled.filter((id) => id !== 'built.sun')
    const d = toDesign(readProject(JSON.stringify(f)).file!)
    expect(d.enabled['built.fsr']).toBeUndefined() // switched off by the designer: stays off
    expect(d.enabled['built.sun']).toBe(true) // unknown when saved: on by default
  })
  it('lists switched-on nodes, sorted', () => {
    const f = file()
    expect(f.nodes.enabled).toEqual([...f.nodes.enabled].sort())
    expect(f.nodes.enabled).toContain('built.vtc-rules')
  })
})

describe('project file: validation in plain words', () => {
  it('refuses files that are not projects', () => {
    expect(readProject('not json').problems[0]).toMatch(/not JSON/)
    expect(readProject(JSON.stringify(example)).problems[0]).toMatch(/node package, not a project/)
    expect(readProject('{"format":"something@2"}').problems[0]).toMatch(/not a Tower Design Toolkit project/)
  })
  it('checks towers, rules and the sun against the schema', () => {
    const f = file()
    f.towers.vtc[0].width = -5
    ;(f.rules as { fsrTier: number }).fsrTier = 4
    f.sun.month = 13
    const m = problems(f)
    expect(m).toMatch(/towers › vtc › 0 › width must be > 0/)
    expect(m).toMatch(/rules › fsrTier must be equal to one of the allowed values/)
    expect(m).toMatch(/sun › month must be <= 12/)
  })
  it('needs at least one tower per project, and unique tower ids', () => {
    const f = file()
    f.towers.city = []
    expect(problems(f)).toMatch(/towers › city must NOT have fewer than 1 items/)
    const g = file()
    g.towers.vtc.push({ ...g.towers.vtc[0] })
    expect(problems(g)).toMatch(/share the id "t1"/)
  })
  it('refuses unknown top-level fields but accepts tower and preset fields from newer versions', () => {
    const f = file() as ProjectFile & { extra?: number }
    f.extra = 1
    expect(problems(f)).toMatch(/has "extra", which this version doesn't know/)
    const g = file()
    ;(g.towers.vtc[0] as unknown as Record<string, unknown>).facadeType = 'unitised'
    g.presets.lifts.newPreset = 3
    expect(readProject(JSON.stringify(g)).ok).toBe(true)
  })
  it('fills presets a file lacks with defaults, and re-sizes automatic cores with the current engine', () => {
    const f = file()
    delete f.presets.lifts.carPersons
    f.towers.vtc[0].coreShare = 0.9
    const d = toDesign(readProject(JSON.stringify(f)).file!)
    expect(d.liftPresets.carPersons).toBe(defaultDesign().liftPresets.carPersons)
    expect(d.towers.vtc[0].coreShare).toBe(defaultDesign().towers.vtc[0].coreShare)
    f.towers.vtc[0].coreAuto = false
    expect(toDesign(readProject(JSON.stringify(f)).file!).towers.vtc[0].coreShare).toBe(0.9)
  })
  it('opens files saved before public realm inputs existed, with the defaults', () => {
    const f = file() as ProjectFile
    delete f.publicRealm
    delete f.cityInNature
    const d = toDesign(readProject(JSON.stringify(f)).file!)
    expect(d.publicRealm).toEqual(defaultDesign().publicRealm)
    expect(d.cityInNature).toEqual(defaultDesign().cityInNature)
  })
  it('picks the first tower when the selected one is missing', () => {
    const f = file()
    f.selectedTower = 'gone'
    const r = readProject(JSON.stringify(f))
    expect(r.notes[0]).toMatch(/first tower is selected/)
    expect(toDesign(r.file!).selectedTower).toBe('t1')
  })
})

describe('undo and redo', () => {
  let t = 0
  let stop: () => void
  beforeEach(() => { fresh(); stop?.(); t = 0; stop = startHistory(() => t); resetHistory() })
  const height = () => useStore.getState().towers.vtc[0].height
  it('undoes and redoes design edits step by step', () => {
    const s = useStore.getState()
    s.updateTower('t1', { height: 250 }); t += MERGE_MS + 1
    s.updateTower('t1', { height: 260 }); t += MERGE_MS + 1
    expect(undo()).toBe(true)
    expect(height()).toBe(250)
    expect(undo()).toBe(true)
    expect(height()).toBe(285)
    expect(undo()).toBe(false)
    expect(redo()).toBe(true)
    expect(height()).toBe(250)
    expect(redo()).toBe(true)
    expect(height()).toBe(260)
    expect(redo()).toBe(false)
  })
  it('folds the base following the terrain into the move that caused it', () => {
    const s = useStore.getState()
    s.setProject('city')
    s.updateTower('c1', { x: 500 }); t += MERGE_MS + 1
    withoutHistory(() => useStore.getState().set({ groundElevation: 41.3 })) // what CityContext's GroundFollow does
    t += MERGE_MS + 1
    expect(undo()).toBe(true)
    expect(useStore.getState().towers.city[0].x).not.toBe(500)
    expect(useStore.getState().groundElevation).toBe(15) // the base it had before the move
    expect(undo()).toBe(false) // the follow-up was not a step of its own
    expect(redo()).toBe(true)
    expect(useStore.getState().groundElevation).toBe(41.3)
  })
  it('merges a quick run of edits (a slider drag) into one step', () => {
    const s = useStore.getState()
    for (const h of [270, 271, 272, 273]) { s.updateTower('t1', { height: h }); t += 50 }
    undo()
    expect(height()).toBe(285)
  })
  it('a new edit clears the redo list', () => {
    const s = useStore.getState()
    s.updateTower('t1', { height: 250 }); t += MERGE_MS + 1
    undo()
    s.updateTower('t1', { height: 255 }); t += MERGE_MS + 1
    expect(redo()).toBe(false)
  })
  it('does not record switching project, stage or tower, and fixes the selection after undoing a new tower', () => {
    const s = useStore.getState()
    s.setPhase('advanced')
    s.setProject('city'); s.setProject('vtc')
    expect(undo()).toBe(false)
    s.addTower(); t += MERGE_MS + 1
    expect(useStore.getState().towers.vtc.length).toBe(2)
    undo()
    expect(useStore.getState().towers.vtc.length).toBe(1)
    expect(useStore.getState().selectedTower).toBe('t1')
  })
  it('undoes public realm inputs', () => {
    useStore.setState({ publicRealm: { ...useStore.getState().publicRealm, openPublicShare: 0.5 } }); t += MERGE_MS + 1
    undo()
    expect(useStore.getState().publicRealm.openPublicShare).toBe(0.85)
  })
  it('undoes node switches and rule changes too', () => {
    const s = useStore.getState()
    s.toggleNode('built.fsr'); t += MERGE_MS + 1
    useStore.setState({ fsrTier: 1 }); t += MERGE_MS + 1
    undo()
    expect(useStore.getState().fsrTier).toBe(2)
    undo()
    expect(useStore.getState().enabled['built.fsr']).toBe(true)
  })
})

describe('opening a file in the app', () => {
  let stop: () => void
  beforeEach(() => { fresh(); stop?.(); stop = startHistory(); resetHistory() })
  it('replaces the design as one undo step', async () => {
    const f = file()
    f.towers.vtc[0].height = 300
    f.towers.vtc[0].name = 'From file'
    expect(await openText(JSON.stringify(f), 'Test')).toBe(true)
    expect(useStore.getState().towers.vtc[0].name).toBe('From file')
    undo()
    expect(useStore.getState().towers.vtc[0].name).toBe('Tower 1')
  })
  it('brings the community nodes a design uses, re-validated', async () => {
    const pkg = example as NodePackage
    useCommunityStore.setState({ packages: [pkg], params: { [pkg.id]: { frontage: 70 } } })
    useStore.getState().toggleNode(pkg.id)
    const d = pickDesign(useStore.getState())
    const text = exportProject(d, { packages: [pkg], params: { [pkg.id]: { frontage: 70 } } })
    expect(JSON.parse(text).communityNodes.packages[0].id).toBe(pkg.id)
    useCommunityStore.setState({ packages: [], params: {} })
    await openText(text, 'With nodes')
    expect(useCommunityStore.getState().packages.map((p) => p.id)).toEqual([pkg.id])
    expect(useCommunityStore.getState().params[pkg.id]).toEqual({ frontage: 70 })
    const broken = JSON.parse(text)
    broken.communityNodes.packages[0].metrics[0].expression = 'tower.nope'
    useCommunityStore.setState({ packages: [], params: {} })
    await openText(JSON.stringify(broken), 'Broken node')
    expect(useCommunityStore.getState().packages).toEqual([])
  })
  it('refuses a bad file without touching the design', async () => {
    const before = useStore.getState().towers
    expect(await openText('{"format":"tower-studio-project@1"}', 'Bad')).toBe(false)
    expect(useStore.getState().towers).toBe(before)
  })
})

describe('code & life safety presets in the file', () => {
  it('saves them, reads them back, and gives older files the defaults', () => {
    const d: Design = { ...defaultDesign(), systemsPresets: { ...defaultDesign().systemsPresets, liftKw: 75, firePump: false } }
    const text = exportProject(d)
    const back = readProject(text)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(toDesign(back.file!).systemsPresets).toMatchObject({ liftKw: 75, firePump: false })
    const old = JSON.parse(text)
    delete old.systemsPresets
    const r = readProject(JSON.stringify(old))
    expect(r.ok).toBe(true)
    if (r.ok) expect(toDesign(r.file!).systemsPresets).toEqual(defaultDesign().systemsPresets)
    const bad = JSON.parse(text)
    bad.systemsPresets.pMinKpa = 600
    expect(readProject(JSON.stringify(bad)).ok).toBe(false)
  })
})

describe('imported meshes in the file', () => {
  const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 0, 1, 3] }
  it('travel with an export and come back into the import store on open', async () => {
    const { useImportStore } = await import('../import/store')
    const text = exportProject(defaultDesign(), undefined, undefined, { m1: mesh })
    const r = readProject(text)
    expect(r.ok).toBe(true)
    expect(r.file!.importedMeshes!.m1.indices).toEqual(mesh.indices)
    expect(await openText(text, 'With mesh')).toBe(true)
    expect(Array.from(useImportStore.getState().meshes.m1.indices)).toEqual(mesh.indices)
  })
  it('are optional, and checked when present', () => {
    expect(JSON.parse(exportProject(defaultDesign())).importedMeshes).toBeUndefined()
    const f = JSON.parse(exportProject(defaultDesign(), undefined, undefined, { m1: mesh }))
    f.importedMeshes.m1.indices[0] = -1
    expect(readProject(JSON.stringify(f)).ok).toBe(false)
  })
})

describe('browser storage', () => {
  it('works without IndexedDB (private windows, tests): nothing throws, nothing is kept', async () => {
    expect(await storageAvailable()).toBe(false)
    expect(await putProject({ key: 'autosave', name: 'x', savedAt: '2026-10-22T00:00:00Z', text: '{}' })).toBe(false)
    expect(await getProject('autosave')).toBeNull()
    expect(await listProjects()).toEqual([])
  })
})
