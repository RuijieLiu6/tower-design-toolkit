// Apply and Discard (brief §8–§10): the whole host side of one run, driven as the panel would drive it:
// install → targets → snapshot/startRun → proposal → checkProposal/setPending/endRun → Apply or Discard.
// One tower changes, the other stays the same record; one Undo brings the old towers back; a run applies once.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Tower } from '../../engine/types'
import { useStore } from '../../store'
import { useImportStore } from '../import/store'
import { resetHistory, startHistory, undo } from '../project/history'
import { modelRevision } from '../workflow/phasePackage'
import { DESIGN_TOOL_FORMAT, PROTOCOL, type InputSnapshot, type Proposal, type ProposalStorey, type ToolDefinition } from './contract'
import { applyPending, discardPending, proposedTowers } from './apply'
import { makeSnapshot } from './snapshot'
import { appliedRuns, useDesignTools, type Pending } from './store'
import { checkProposal } from './validate'

const definition = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  format: DESIGN_TOOL_FORMAT, id: 'tool.form-studio', version: '1.0.0', name: 'Form Studio',
  purpose: 'Tapered and twisted tower plates with a podium retreat', author: { name: 'Ruijie Liu' }, licence: 'MIT',
  phases: ['form'], connection: { method: 'web', url: 'https://ruijieliu6.github.io/form-studio/', origin: 'https://ruijieliu6.github.io', protocol: PROTOCOL },
  runtime: { browser: true, network: ['https://ruijieliu6.github.io'] }, inputs: ['tower.selected'], outputs: ['geometry.storeys', 'parameters'], operations: ['replace-geometry'],
  units: { length: 'm', frame: 'tower-local', up: 'z' }, destination: { sends: ['footprint', 'height', 'storeys', 'floor-to-floor', 'podium'], to: 'ruijieliu6.github.io, in your browser', stores: 'the tool page’s own localStorage' },
  limits: [], editability: 'externally-generated', ...over,
})
const rect = (w: number, d: number): [number, number][] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
/** Two podium storeys of 5 m on 50×40, then `n` tower storeys of 4 m on 30×30 (10 storeys → top at 42 m). */
const storeys = (n = 8): ProposalStorey[] => [
  { z0: 0, z1: 5, loops: [rect(50, 40)], podium: true },
  { z0: 5, z1: 10, loops: [rect(50, 40)], podium: true },
  ...Array.from({ length: n }, (_, i) => ({ z0: 10 + i * 4, z1: 14 + i * 4, loops: [rect(30, 30)] })),
]
const proposalFor = (snap: InputSnapshot, over: Partial<Proposal> = {}): Proposal => ({
  protocol: PROTOCOL, type: 'tdt:proposal', toolId: snap.toolId, toolVersion: '1.0.0', sessionId: snap.sessionId, runId: snap.runId, projectId: snap.projectId, baseRevision: snap.baseRevision,
  units: { length: 'm', frame: 'tower-local', up: 'z' }, operations: [{ op: 'replace-geometry', target: snap.targets[0]?.id ?? 't1', storeys: storeys(), keep: ['name', 'bands'] }],
  parameters: { taper: 0.8, twist: 15 }, assumptions: ['Plates are rectangles'], warnings: [], ...over,
})

const towers = () => useStore.getState().towers[useStore.getState().project]
const dt = () => useDesignTools.getState()
const inst = () => dt().instanceOf('tool.form-studio')
const runOf = (runId: string) => inst().runs.find((r) => r.runId === runId)

/** The panel's send: targets chosen, a snapshot made and the run started (the iframe would get the snapshot). */
function send(def = definition()) {
  dt().install(def)
  dt().setTargets(def.id, ['t1'])
  const snap = makeSnapshot(def, dt().instanceOf(def.id), towers())
  dt().startRun(snap)
  return snap
}
/** The host's 'tdt:proposal' handler: check against the waiting run, keep it pending, close the run. */
function receive(p: unknown) {
  const def = dt().definitions[(p as Proposal).toolId]
  const check = checkProposal(p, { def, session: dt().run, currentRevision: modelRevision(towers()), applied: appliedRuns(def.id) })
  if (check.proposal) dt().setPending({ proposal: check.proposal, check, receivedAt: new Date().toISOString() })
  dt().endRun(check.ok ? 'returned' : 'rejected')
  return check
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  useStore.getState().addTower()
  useStore.getState().selectTower('t1')
  useImportStore.setState({ meshes: {} })
  useDesignTools.setState({ definitions: {}, instances: {}, run: null, pending: null, workspace: null, consented: {} })
})

describe('proposedTowers (pure: the preview and Apply share it)', () => {
  it('changes only the target; the other tower is the same record; id, name and bands stay', () => {
    const list = towers()
    const snap = send()
    const p = proposalFor(snap)
    const before = { ...list[0] }
    const { towers: next, meshes } = proposedTowers(list, p, definition())
    expect(next).toHaveLength(2)
    expect(next[1]).toBe(list[1])
    expect(next[0]).not.toBe(list[0])
    expect(next[0]).toMatchObject({ id: 't1', name: 'Tower 1', x: before.x, y: before.y, rotation: before.rotation })
    expect(next[0].bands).toEqual(before.bands)
    expect(next[0].height).toBe(42)
    expect(next[0].podiumHeight).toBe(10)
    expect(next[0]).toMatchObject({ width: 30, depth: 30, podiumWidth: 50, podiumDepth: 40, f2f: 4 })
    expect(next[0].blocks).toBeUndefined()
    expect(next[0].imported).toMatchObject({ format: 'design-tool', top: 42, tool: { toolId: 'tool.form-studio', version: '1.0.0', runId: snap.runId, parameters: { taper: 0.8, twist: 15 } } })
    expect(next[0].imported?.storeys).toHaveLength(10)
    const id = `tool-${snap.runId.slice(0, 8)}-t1`
    expect(Object.keys(meshes)).toEqual([id])
    expect(next[0].imported?.meshId).toBe(id)
    // pure: the store did not move
    expect(towers()).toBe(list)
    expect(useImportStore.getState().meshes).toEqual({})
  })
  it('set-parameter writes one field of the target and nothing else', () => {
    const list = towers()
    const snap = send(definition({ operations: ['replace-geometry', 'set-parameter'] }))
    const p = proposalFor(snap, { operations: [{ op: 'set-parameter', target: 't1', field: 'height', value: 200 }] })
    const { towers: next, meshes } = proposedTowers(list, p, dt().definitions['tool.form-studio'])
    expect(next[0].height).toBe(200)
    expect(next[0].width).toBe(list[0].width)
    expect(next[0].imported).toBeUndefined()
    expect(next[1]).toBe(list[1])
    expect(meshes).toEqual({})
  })
  it('an operation aimed at a tower that is not there changes nothing', () => {
    const list = towers()
    const snap = send()
    const { towers: next } = proposedTowers(list, proposalFor(snap, { operations: [{ op: 'replace-geometry', target: 'gone', storeys: storeys() }] }), definition())
    expect(next[0]).toBe(list[0])
    expect(next[1]).toBe(list[1])
  })
})

describe('applyPending', () => {
  it('refuses when nothing is pending', () => {
    expect(applyPending()).toEqual({ ok: false, reason: 'Nothing to apply.' })
  })
  it('refuses a proposal that did not pass its checks, with the first problem as the reason', () => {
    const snap = send()
    const bad = proposalFor(snap, { sessionId: 'someone-else' })
    const check = receive(bad)
    expect(check.ok).toBe(false)
    expect(dt().pending).toBeNull()
    expect(runOf(snap.runId)?.status).toBe('rejected')
    // even if a panel kept it pending, Apply refuses it
    dt().setPending({ proposal: bad, check, receivedAt: 'x' } as Pending)
    const before = towers()
    expect(applyPending()).toEqual({ ok: false, reason: 'It belongs to another session.' })
    expect(towers()).toBe(before)
  })
  it('refuses a stale proposal: the model changed after the inputs went out (brief §9)', () => {
    const snap = send()
    useStore.getState().updateTower('t1', { height: 300 })
    const check = receive(proposalFor(snap))
    expect(check).toMatchObject({ ok: true, stale: true })
    expect(dt().pending?.check.stale).toBe(true)
    const before = towers()
    const r = applyPending()
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/The model changed since the inputs were sent\. Run the tool again\./)
    expect(towers()).toBe(before)
    expect(towers()[0].height).toBe(300)
    expect(dt().pending).not.toBeNull() // still there to review or discard
  })
  it('refuses a proposal whose run was cancelled (a late answer never applies)', () => {
    const snap = send()
    dt().endRun('cancelled')
    const check = receive(proposalFor(snap))
    expect(check.ok).toBe(false)
    expect(check.problems.join(' ')).toMatch(/No run is waiting/)
    expect(dt().pending).toBeNull()
    expect(runOf(snap.runId)?.status).toBe('cancelled')
    expect(applyPending()).toEqual({ ok: false, reason: 'Nothing to apply.' })
  })
  it('refuses when the tool was uninstalled meanwhile', () => {
    const snap = send()
    receive(proposalFor(snap))
    dt().uninstall('tool.form-studio')
    expect(applyPending()).toEqual({ ok: false, reason: 'The tool is no longer installed.' })
  })
  it('applies once: the target changes, the other tower is the same record, the run is applied, a second Apply is refused', () => {
    const list = towers()
    const other = list[1]
    const revision = modelRevision(list)
    const snap = send()
    const check = receive(proposalFor(snap))
    expect(check.ok).toBe(true)
    expect(runOf(snap.runId)?.status).toBe('returned')
    expect(dt().run).toBeNull()

    expect(applyPending()).toEqual({ ok: true, changed: ['t1'] })
    const after = towers()
    expect(after).toHaveLength(2)
    expect(after[1]).toBe(other)
    expect(after[0]).toMatchObject({ id: 't1', name: 'Tower 1', height: 42, podiumHeight: 10, f2f: 4 })
    expect(after[0].bands).toEqual(list[0].bands)
    expect(after[0].imported?.tool).toMatchObject({ toolId: 'tool.form-studio', runId: snap.runId, parameters: { taper: 0.8, twist: 15 } })
    expect(useStore.getState().selectedTower).toBe('t1')
    expect(useStore.getState().announce).toBe('Form Studio: 1 tower changed. Ctrl+Z takes it back.')
    // the mesh is in the import store under the tower's mesh id
    expect(useImportStore.getState().meshes[after[0].imported!.meshId]?.report.objects).toBe(10)
    // the run is applied, the tool's parameters and the mapping are kept on the instance, nothing is pending
    expect(dt().pending).toBeNull()
    expect(runOf(snap.runId)?.status).toBe('applied')
    expect(appliedRuns('tool.form-studio')).toEqual(new Set([snap.runId]))
    expect(inst().parameters).toEqual({ taper: 0.8, twist: 15 })
    expect(inst().mappings).toEqual({ t1: 't1' })
    // downstream reads the new model: the revision moved
    expect(modelRevision(after)).not.toBe(revision)

    // the same proposal again (a panel re-sending it) is refused: the run id was applied
    dt().setPending({ proposal: check.proposal!, check, receivedAt: 'x' })
    expect(applyPending()).toEqual({ ok: false, reason: 'This proposal was already applied.' })
    expect(towers()).toBe(after)
    expect(applyPending()).toEqual({ ok: false, reason: 'This proposal was already applied.' })
  })
  it('a second run on the same tower replaces it again: no duplicate tower (brief §9)', () => {
    const first = send()
    receive(proposalFor(first))
    expect(applyPending().ok).toBe(true)
    const second = send()
    expect(second.runId).not.toBe(first.runId)
    expect(second.targets[0]).toMatchObject({ id: 't1', height: 42, storeys: 10 })
    receive(proposalFor(second, { operations: [{ op: 'replace-geometry', target: 't1', storeys: storeys(12) }], parameters: { taper: 0.6 } }))
    expect(applyPending()).toEqual({ ok: true, changed: ['t1'] })
    const list = towers()
    expect(list).toHaveLength(2)
    expect(list.map((t) => t.id)).toEqual(['t1', list[1].id])
    expect(list[0].height).toBe(58)
    expect(list[0].imported?.tool?.runId).toBe(second.runId)
    expect(inst().parameters).toEqual({ taper: 0.6 })
    expect(appliedRuns('tool.form-studio')).toEqual(new Set([first.runId, second.runId]))
    expect(Object.keys(useImportStore.getState().meshes)).toHaveLength(2)
  })
  it('uninstalling the tool afterwards never removes the accepted tower (brief §10)', () => {
    const snap = send()
    receive(proposalFor(snap))
    expect(applyPending().ok).toBe(true)
    const list = towers()
    dt().uninstall('tool.form-studio')
    expect(towers()).toBe(list)
    expect(towers()[0].imported?.tool?.runId).toBe(snap.runId)
    expect(runOf(snap.runId)?.status).toBe('applied')
  })
})

describe('one undo step', () => {
  let stop: (() => void) | undefined
  const t = 0
  beforeEach(() => { stop?.(); stop = startHistory(() => t); resetHistory() })
  afterEach(() => { stop?.(); stop = undefined })

  it('Apply is one step: Ctrl+Z restores the previous towers, and there is nothing more to undo', () => {
    const before = towers()
    const snap = send()
    receive(proposalFor(snap))
    resetHistory() // the set-up above is not the person's edit
    expect(applyPending().ok).toBe(true)
    expect(towers()).not.toBe(before)
    expect(undo()).toBe(true)
    expect(towers()).toBe(before)
    expect(towers()[0].height).toBe(285)
    expect(towers()[0].imported).toBeUndefined()
    expect(undo()).toBe(false)
  })
  it('Apply right after an edit is still its own step (the merge window is closed on both sides)', () => {
    // the edit comes first: an edit after the send would make the proposal stale (any tower moves the revision)
    useStore.getState().updateTower(towers()[1].id, { height: 250 })
    const edited = towers()
    const snap = send()
    receive(proposalFor(snap))
    expect(applyPending().ok).toBe(true)
    expect(undo()).toBe(true)
    expect(towers()).toBe(edited)
    expect(towers()[1].height).toBe(250)
    expect(undo()).toBe(true)
    expect(towers()[1].height).not.toBe(250)
    expect(undo()).toBe(false)
  })
})

describe('discardPending', () => {
  it('clears the proposal, marks the run discarded and leaves the towers untouched', () => {
    const before = towers()
    const snap = send()
    receive(proposalFor(snap))
    expect(dt().pending).not.toBeNull()
    discardPending()
    expect(dt().pending).toBeNull()
    expect(dt().run).toBeNull()
    expect(runOf(snap.runId)?.status).toBe('discarded')
    expect(towers()).toBe(before)
    expect(towers()[0]).toBe(before[0])
    expect(useImportStore.getState().meshes).toEqual({})
    expect(appliedRuns('tool.form-studio').size).toBe(0)
    expect(applyPending()).toEqual({ ok: false, reason: 'Nothing to apply.' })
  })
  it('does nothing when nothing is pending', () => {
    const before = useDesignTools.getState()
    discardPending()
    expect(useDesignTools.getState().instances).toBe(before.instances)
  })
  it('a discarded run can be re-sent as a new run and then applied', () => {
    const first = send()
    receive(proposalFor(first))
    discardPending()
    const second = send()
    receive(proposalFor(second))
    expect(applyPending()).toEqual({ ok: true, changed: ['t1'] })
    expect(inst().runs.map((r) => r.status)).toEqual(['discarded', 'applied'])
  })
})

describe('the untouched tower', () => {
  it('is the very same object before and after Apply, so its results and selection stay valid', () => {
    const other: Tower = towers()[1]
    const snap = send()
    receive(proposalFor(snap))
    applyPending()
    expect(towers()[1]).toBe(other)
    expect(JSON.stringify(towers()[1])).toBe(JSON.stringify(other))
  })
})
