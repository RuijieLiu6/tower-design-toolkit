// The input snapshot (brief §6: only the required scope): the selected tower alone, the frame, the tool's own
// parameters, and the ids that tie the answer back to this run.
import { beforeEach, describe, expect, it } from 'vitest'
import type { ImportedMass, Tower } from '../../engine/types'
import { defaultTower, useStore } from '../../store'
import { useProjectMeta } from '../project/session'
import { modelRevision } from '../workflow/phasePackage'
import { DESIGN_TOOL_FORMAT, PROTOCOL, type ToolDefinition, type ToolInstance } from './contract'
import { makeSnapshot, permissionWords, projectId, targetOf } from './snapshot'
import { useDesignTools } from './store'

const definition = (): ToolDefinition => ({
  format: DESIGN_TOOL_FORMAT, id: 'tool.form-studio', version: '1.0.0', name: 'Form Studio',
  purpose: 'Tapered and twisted tower plates with a podium retreat', author: { name: 'Ruijie Liu' }, licence: 'MIT',
  phases: ['form'], connection: { method: 'web', url: 'https://ruijieliu6.github.io/form-studio/', origin: 'https://ruijieliu6.github.io', protocol: PROTOCOL },
  runtime: { browser: true, network: ['https://ruijieliu6.github.io'] }, inputs: ['tower.selected'], outputs: ['geometry.storeys', 'parameters'], operations: ['replace-geometry'],
  units: { length: 'm', frame: 'tower-local', up: 'z' }, destination: { sends: ['footprint', 'height', 'storeys', 'floor-to-floor', 'podium'], to: 'ruijieliu6.github.io, in your browser', stores: 'the tool page’s own localStorage' },
  limits: [], editability: 'externally-generated',
})
const instance = (over: Partial<ToolInstance> = {}): ToolInstance => ({ toolId: 'tool.form-studio', toolVersion: '1.0.0', targets: ['t1'], parameters: null, runs: [], mappings: {}, ...over })
const towers = () => useStore.getState().towers[useStore.getState().project]
/** A plain parametric tower (no blocks), 30×20, 100 m, no podium. */
const plain = (): Tower => ({
  id: 'p1', name: 'Plain', x: 0, y: 0, rotation: 30, width: 30, depth: 20, height: 100, f2f: 4, podiumHeight: 0, podiumWidth: 30, podiumDepth: 20, podiumUse: 'retail',
  bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0,
})

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  useProjectMeta.setState({ name: null })
  useDesignTools.setState({ definitions: {}, instances: {}, run: null, pending: null, workspace: null, consented: {} })
})

describe('targetOf', () => {
  it('describes the starting tower: box, podium, storey count and the footprint of the box', () => {
    const t = targetOf(defaultTower('vtc'))
    expect(t).toMatchObject({ id: 't1', name: 'Tower 1', width: 46, depth: 46, height: 285, f2f: 4.2, rotation: 0, podium: { height: 18, width: 100, depth: 64 } })
    // 64 tower floors at 4.2 m above an 18 m podium of 4 podium floors
    expect(t.storeys).toBe(68)
    // the footprint is the box of the widest part (the podium here), counter-clockwise from the south-west corner
    expect(t.footprint).toEqual([[-50, -32], [50, -32], [50, 32], [-50, 32]])
  })
  it('a tower without a podium sends its own box', () => {
    const t = targetOf(plain())
    expect(t.footprint).toEqual([[-15, -10], [15, -10], [15, 10], [-15, 10]])
    expect(t).toMatchObject({ height: 100, storeys: 25, rotation: 30, podium: { height: 0, width: 30, depth: 20 } })
  })
  it('an imported tower sends its hull and counts only the storeys with a floor', () => {
    const hull: [number, number][] = [[-12, -12], [12, -12], [0, 14]]
    const imported: ImportedMass = {
      meshId: 'm', fileName: 'x.3dm', format: '3dm', unit: 'm', unitSource: 'file', fileNorthDeg: null, northSource: '', datumShift: 0, datumSource: '', f2f: 4, podiumTop: 0, podiumF2F: 4.5,
      storeys: [
        { level: 1, z0: 0, z1: 4, area: 300, use: 'office', podium: false, hasFloor: true, loops: [hull] },
        { level: 2, z0: 4, z1: 8, area: 300, use: 'office', podium: false, hasFloor: true, loops: [hull] },
        { level: 3, z0: 8, z1: 12, area: 10, use: 'office', podium: false, hasFloor: false, loops: [] },
      ],
      hull, volume: 2400, top: 12, health: { block: 0, warn: 0 },
    }
    const t = targetOf({ ...plain(), id: 'imp1', imported, height: 12 })
    expect(t.footprint).toBe(hull)
    expect(t.storeys).toBe(2)
    expect(t.height).toBe(12)
  })
})

describe('makeSnapshot', () => {
  it('sends only the selected tower of a two-tower project', () => {
    useStore.getState().addTower()
    const list = towers()
    expect(list).toHaveLength(2)
    const other = list[1]
    const snap = makeSnapshot(definition(), instance(), list)
    expect(snap.targets).toHaveLength(1)
    expect(snap.targets[0]).toMatchObject({ id: 't1', name: 'Tower 1' })
    const text = JSON.stringify(snap)
    expect(text).not.toContain(other.id)
    expect(text).not.toContain(other.name)
    expect(text).not.toContain('"bands"')
    expect(text).not.toContain('citySite')
  })
  it('sends the second tower when that one is the target, and nothing when the target is gone', () => {
    useStore.getState().addTower()
    const other = towers()[1]
    const snap = makeSnapshot(definition(), instance({ targets: [other.id] }), towers())
    expect(snap.targets.map((t) => t.id)).toEqual([other.id])
    expect(makeSnapshot(definition(), instance({ targets: ['gone'] }), towers()).targets).toEqual([])
  })
  it('carries the ids that tie the answer back: protocol, session, a fresh run id, project, tool, base revision', () => {
    const def = definition()
    const a = makeSnapshot(def, instance(), towers())
    const b = makeSnapshot(def, instance(), towers())
    expect(a).toMatchObject({ protocol: PROTOCOL, type: 'tdt:inputs', toolId: 'tool.form-studio', projectId: 'vtc:untitled', units: def.units })
    expect(a.sessionId).toBe(useDesignTools.getState().sessionId)
    expect(a.runId).toMatch(/\S{8,}/)
    expect(a.runId).not.toBe(b.runId)
    expect(a.sessionId).toBe(b.sessionId)
    expect(a.baseRevision).toBe(modelRevision(towers()))
    useStore.getState().updateTower('t1', { height: 300 })
    expect(makeSnapshot(def, instance(), towers()).baseRevision).not.toBe(a.baseRevision)
  })
  it('gives the frame: the competition north and the ground elevation; Real Vancouver has north up', () => {
    expect(makeSnapshot(definition(), instance(), towers()).frame).toEqual({ northDeg: 45, groundElevation: 15 })
    useStore.getState().setProject('city')
    const snap = makeSnapshot(definition(), instance({ targets: ['c1'] }), towers())
    expect(snap.frame.northDeg).toBe(0)
    expect(snap.projectId).toBe('city:untitled')
    expect(snap.targets.map((t) => t.id)).toEqual(['c1'])
  })
  it('echoes the tool’s own last parameters, or null before the first run', () => {
    expect(makeSnapshot(definition(), instance(), towers()).parameters).toBeNull()
    const params = { taper: 0.7, twist: 12, podium: { retreat: 3 } }
    expect(makeSnapshot(definition(), instance({ parameters: params }), towers()).parameters).toEqual(params)
  })
})

describe('projectId', () => {
  it('is the project kind and the open project’s name', () => {
    expect(projectId()).toBe('vtc:untitled')
    useProjectMeta.setState({ name: 'Burrard tower' })
    expect(projectId()).toBe('vtc:Burrard tower')
    useStore.getState().setProject('city')
    expect(projectId()).toBe('city:Burrard tower')
  })
})

describe('permissionWords', () => {
  it('says what is sent, to whom, and why, naming the tower', () => {
    const w = permissionWords(definition(), [targetOf(defaultTower('vtc'))])
    expect(w).toHaveLength(3)
    expect(w[0]).toBe('Sends: footprint, height, storeys, floor-to-floor, podium of Tower 1 (m, tower frame).')
    expect(w[1]).toBe('To: ruijieliu6.github.io, in your browser. Stored: the tool page’s own localStorage.')
    expect(w[2]).toMatch(/^Why: so Form Studio can propose a change; nothing is applied until you Apply it here\.$/)
  })
  it('falls back to "the selected tower" when none is chosen yet', () => {
    expect(permissionWords(definition(), [])[0]).toMatch(/of the selected tower/)
  })
})
