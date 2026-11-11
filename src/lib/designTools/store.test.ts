// The design-tools store: installed definitions, per-project instances with their runs, the run in flight and the
// pending proposal. Nothing here touches the model (apply.test.ts covers that).
import { beforeEach, describe, expect, it } from 'vitest'
import { DESIGN_TOOL_FORMAT, PROTOCOL, type InputSnapshot, type ToolDefinition } from './contract'
import { appliedRuns, newId, useDesignTools } from './store'

const definition = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  format: DESIGN_TOOL_FORMAT, id: 'tool.form-studio', version: '1.0.0', name: 'Form Studio',
  purpose: 'Tapered and twisted tower plates with a podium retreat', author: { name: 'Ruijie Liu' }, licence: 'MIT',
  phases: ['form'], connection: { method: 'web', url: 'https://ruijieliu6.github.io/form-studio/', origin: 'https://ruijieliu6.github.io', protocol: PROTOCOL },
  runtime: { browser: true, network: ['https://ruijieliu6.github.io'] }, inputs: ['tower.selected'], outputs: ['geometry.storeys', 'parameters'], operations: ['replace-geometry'],
  units: { length: 'm', frame: 'tower-local', up: 'z' }, destination: { sends: ['footprint', 'height'], to: 'ruijieliu6.github.io', stores: 'localStorage' },
  limits: [], editability: 'externally-generated', ...over,
})
const snapshot = (runId: string, over: Partial<InputSnapshot> = {}): InputSnapshot => ({
  protocol: PROTOCOL, type: 'tdt:inputs', sessionId: useDesignTools.getState().sessionId, runId, projectId: 'vtc:untitled', toolId: 'tool.form-studio', baseRevision: 'rev-a',
  units: { length: 'm', frame: 'tower-local', up: 'z' }, frame: { northDeg: 45, groundElevation: 15 },
  targets: [{ id: 't1', name: 'Tower 1', width: 46, depth: 46, height: 285, storeys: 68, f2f: 4.2, rotation: 0, podium: { height: 18, width: 100, depth: 64 }, footprint: [[-50, -32], [50, -32], [50, 32], [-50, 32]] }],
  parameters: null, ...over,
})
const dt = () => useDesignTools.getState()
const inst = () => dt().instanceOf('tool.form-studio')

beforeEach(() => { useDesignTools.setState({ definitions: {}, instances: {}, run: null, pending: null, workspace: null, consented: {} }) })

describe('ids', () => {
  it('has a session id for this visit, and new ids never repeat', () => {
    expect(dt().sessionId).toMatch(/\S{8,}/)
    const ids = new Set(Array.from({ length: 50 }, newId))
    expect(ids.size).toBe(50)
  })
})

describe('install and uninstall', () => {
  it('installs the definition and starts a blank instance for it', () => {
    dt().install(definition())
    expect(dt().definitions['tool.form-studio']?.name).toBe('Form Studio')
    expect(inst()).toEqual({ toolId: 'tool.form-studio', toolVersion: '1.0.0', targets: [], parameters: null, runs: [], mappings: {} })
  })
  it('installing a new version keeps the instance (targets, parameters, runs) and updates its version', () => {
    dt().install(definition())
    dt().setTargets('tool.form-studio', ['t1'])
    dt().startRun(snapshot('r-1'))
    dt().endRun('returned')
    dt().install(definition({ version: '1.2.0' }))
    expect(dt().definitions['tool.form-studio'].version).toBe('1.2.0')
    expect(inst()).toMatchObject({ toolVersion: '1.2.0', targets: ['t1'] })
    expect(inst().runs.map((r) => r.runId)).toEqual(['r-1'])
  })
  it('uninstalling removes the definition and the consent, closes its workspace, and keeps the instance with its runs', () => {
    dt().install(definition())
    dt().setTargets('tool.form-studio', ['t1'])
    dt().consent('tool.form-studio')
    dt().setWorkspace('tool.form-studio')
    dt().startRun(snapshot('r-1'))
    dt().endRun('applied')
    dt().uninstall('tool.form-studio')
    expect(dt().definitions['tool.form-studio']).toBeUndefined()
    expect(dt().consented['tool.form-studio']).toBeUndefined()
    expect(dt().workspace).toBeNull()
    expect(inst()).toMatchObject({ targets: ['t1'] })
    expect(inst().runs).toEqual([expect.objectContaining({ runId: 'r-1', status: 'applied' })])
    expect(appliedRuns('tool.form-studio')).toEqual(new Set(['r-1']))
  })
  it('uninstalling one tool leaves another tool’s workspace and consent alone', () => {
    dt().install(definition())
    dt().install(definition({ id: 'tool.other' }))
    dt().consent('tool.other')
    dt().setWorkspace('tool.other')
    dt().uninstall('tool.form-studio')
    expect(dt().workspace).toBe('tool.other')
    expect(dt().consented['tool.other']).toBeDefined()
    expect(dt().definitions['tool.other']).toBeDefined()
  })
  // instanceOf(id) for a tool that was never installed in this browser (a project file naming it) throws today:
  // blank(definitions[id]) reads `.id` of undefined. Fix in store.ts: blank(get().definitions[toolId] ?? { id: toolId, version: '' } as ToolDefinition).
  it('instanceOf of a tool never installed here gives a blank instance instead of throwing', () => {
    expect(dt().instanceOf('tool.never')).toMatchObject({ toolId: 'tool.never', targets: [], runs: [] })
  })
})

describe('targets and consent', () => {
  it('setTargets keeps the rest of the instance', () => {
    dt().install(definition())
    dt().startRun(snapshot('r-1'))
    dt().endRun('discarded')
    dt().setTargets('tool.form-studio', ['t1'])
    expect(inst().targets).toEqual(['t1'])
    expect(inst().runs).toHaveLength(1)
    dt().setTargets('tool.form-studio', [])
    expect(inst().targets).toEqual([])
  })
  it('consent is per tool, dated', () => {
    dt().install(definition())
    expect(dt().consented['tool.form-studio']).toBeUndefined()
    dt().consent('tool.form-studio')
    expect(dt().consented['tool.form-studio']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
  it('the workspace is one tool or none', () => {
    dt().setWorkspace('tool.form-studio')
    expect(dt().workspace).toBe('tool.form-studio')
    dt().setWorkspace(null)
    expect(dt().workspace).toBeNull()
  })
})

describe('runs', () => {
  beforeEach(() => { dt().install(definition()); dt().setTargets('tool.form-studio', ['t1']) })

  it('startRun records the run in flight and on the instance as sent, and clears any pending proposal', () => {
    dt().setPending({ proposal: {} as never, check: { ok: true, stale: false, problems: [], warnings: [] }, receivedAt: 'x' })
    dt().startRun(snapshot('r-1'))
    expect(dt().run).toMatchObject({ toolId: 'tool.form-studio', sessionId: dt().sessionId, runId: 'r-1', projectId: 'vtc:untitled', baseRevision: 'rev-a', targets: ['t1'] })
    expect(dt().run?.sentAt).toMatch(/^\d{4}-/)
    expect(dt().pending).toBeNull()
    expect(inst().runs).toEqual([{ runId: 'r-1', sentAt: dt().run?.sentAt, baseRevision: 'rev-a', status: 'sent' }])
  })
  it('endRun closes the run with its outcome and note; without a run it changes nothing', () => {
    dt().startRun(snapshot('r-1'))
    dt().endRun('returned', 'two operations')
    expect(dt().run).toBeNull()
    expect(inst().runs[0]).toMatchObject({ runId: 'r-1', status: 'returned', note: 'two operations' })
    const before = useDesignTools.getState()
    dt().endRun('cancelled')
    expect(useDesignTools.getState().instances).toBe(before.instances)
  })
  it('a new run replaces the one in flight; the older one stays in the history as it ended', () => {
    dt().startRun(snapshot('r-1'))
    dt().endRun('cancelled')
    dt().startRun(snapshot('r-2'))
    expect(dt().run?.runId).toBe('r-2')
    expect(inst().runs.map((r) => [r.runId, r.status])).toEqual([['r-1', 'cancelled'], ['r-2', 'sent']])
  })
  it('keeps the last 20 runs', () => {
    for (let i = 0; i < 25; i++) { dt().startRun(snapshot(`r-${i}`)); dt().endRun('discarded') }
    expect(inst().runs).toHaveLength(20)
    expect(inst().runs[0].runId).toBe('r-5')
    expect(inst().runs[19].runId).toBe('r-24')
  })
  it('appliedRuns lists only the runs that were applied', () => {
    dt().startRun(snapshot('r-1')); dt().endRun('discarded')
    dt().startRun(snapshot('r-2')); dt().endRun('applied')
    dt().startRun(snapshot('r-3')); dt().endRun('returned')
    expect(appliedRuns('tool.form-studio')).toEqual(new Set(['r-2']))
    expect(appliedRuns('tool.form-studio').has('r-3')).toBe(false)
  })
  it('setPending holds the one proposal waiting for Apply, or none', () => {
    const pending = { proposal: { runId: 'r-1' } as never, check: { ok: true, stale: false, problems: [], warnings: [] }, receivedAt: '2026-11-11T10:00:00.000Z' }
    dt().setPending(pending)
    expect(dt().pending).toBe(pending)
    dt().setPending(null)
    expect(dt().pending).toBeNull()
  })
})
