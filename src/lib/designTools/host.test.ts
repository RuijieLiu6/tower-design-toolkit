// The host side of tdt-design-tool@1 (host.ts): nothing goes out before consent and a target; a snapshot goes to the
// pinned origin and starts a run; a proposal is read only from the frame's own window and origin, only for the run in
// flight; cancel drops a late answer; the url carries the host origin and the session.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../store'
import { DESIGN_TOOL_FORMAT, PROTOCOL, type Proposal, type ToolDefinition } from './contract'
import { attachFrame, cancelRun, frameUrl, isFrameReady, requestSend, sendBlocker, useFrameState, type FrameLike, type MessageTarget } from './host'
import { useDesignTools } from './store'

const ORIGIN = 'http://localhost:5177'
const def: ToolDefinition = {
  format: DESIGN_TOOL_FORMAT, id: 'tool.form-studio', version: '1.0.0', name: 'Form Studio', purpose: 'Massing', author: { name: 'Ruijie' }, licence: 'MIT',
  phases: ['form'], connection: { method: 'web', url: `${ORIGIN}/form-studio/?embed=1`, origin: ORIGIN, protocol: PROTOCOL }, runtime: { browser: true, network: [ORIGIN] },
  inputs: ['tower.selected'], outputs: ['geometry.storeys'], operations: ['replace-geometry'], units: { length: 'm', frame: 'tower-local', up: 'z' },
  destination: { sends: ['footprint', 'height'], to: ORIGIN, stores: 'nothing' }, limits: [], editability: 'externally-generated',
}

/** A fake window to listen on and a fake iframe whose content window records what the host posts. */
function harness() {
  const listeners = new Set<(e: MessageEvent) => void>()
  const win: MessageTarget = { addEventListener: (_t, fn) => listeners.add(fn), removeEventListener: (_t, fn) => listeners.delete(fn) }
  const posted: { msg: unknown; origin: string }[] = []
  const content = { postMessage: (msg: unknown, origin: string) => posted.push({ msg, origin }) }
  const frame: FrameLike = { contentWindow: content }
  const say = (data: unknown, origin = ORIGIN, source: unknown = content) => listeners.forEach((fn) => fn({ data, origin, source } as unknown as MessageEvent))
  return { win, frame, posted, say, content, listeners }
}

const box = (w: number, d: number): [number, number][] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
const proposalFor = (runId: string, target: string, extra: Partial<Proposal> = {}): Proposal => ({
  protocol: PROTOCOL, type: 'tdt:proposal', toolId: def.id, toolVersion: def.version, sessionId: useDesignTools.getState().sessionId, runId, projectId: useDesignTools.getState().run?.projectId ?? '',
  baseRevision: useDesignTools.getState().run?.baseRevision ?? '', units: { length: 'm', frame: 'tower-local', up: 'z' },
  operations: [{ op: 'replace-geometry', target, storeys: Array.from({ length: 12 }, (_, i) => ({ z0: i * 4, z1: (i + 1) * 4, loops: [box(30 - i, 24)] })), keep: ['name', 'bands'] }],
  parameters: { taper: 0.2 }, assumptions: [], warnings: [], ...extra,
})

beforeEach(() => {
  useDesignTools.setState({ definitions: {}, instances: {}, run: null, pending: null, workspace: null, consented: {} })
  useDesignTools.getState().install(def)
})
const t1 = () => useStore.getState().towers[useStore.getState().project][0]

describe('frameUrl', () => {
  it('adds the host origin and the session to the tool url, after its own query', () => {
    const u = frameUrl(def, 'sess-1', 'https://ruijieliu6.github.io')
    expect(u).toBe(`${ORIGIN}/form-studio/?embed=1&host=https%3A%2F%2Fruijieliu6.github.io&session=sess-1`)
    expect(frameUrl({ ...def, connection: { ...def.connection, url: `${ORIGIN}/tool` } }, 's', 'http://localhost:5173')).toBe(`${ORIGIN}/tool?host=http%3A%2F%2Flocalhost%3A5173&session=s`)
  })
})

describe('requestSend', () => {
  it('sends nothing without consent or a target, and says why', () => {
    const h = harness()
    const off = attachFrame(def.id, h.frame, h.win)
    h.say({ protocol: PROTOCOL, type: 'tdt:ready', toolId: def.id, toolVersion: def.version })
    expect(isFrameReady(def.id)).toBe(true)
    expect(requestSend(def.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/agree/) })
    useDesignTools.getState().consent(def.id)
    expect(sendBlocker(def.id)).toMatch(/Choose a tower/)
    expect(requestSend(def.id)).toMatchObject({ ok: false })
    expect(h.posted).toHaveLength(0)
    expect(useDesignTools.getState().run).toBeNull()
    off()
  })

  it('with the frame ready: makes a snapshot of the target only, starts the run and posts to the pinned origin', () => {
    const h = harness()
    const off = attachFrame(def.id, h.frame, h.win)
    h.say({ protocol: PROTOCOL, type: 'tdt:ready', toolId: def.id, toolVersion: def.version })
    useDesignTools.getState().consent(def.id)
    useDesignTools.getState().setTargets(def.id, [t1().id])
    const r = requestSend(def.id)
    expect(r.ok).toBe(true)
    expect(h.posted).toHaveLength(1)
    expect(h.posted[0].origin).toBe(ORIGIN)
    const snap = h.posted[0].msg as Record<string, unknown>
    expect(snap).toMatchObject({ protocol: PROTOCOL, type: 'tdt:inputs', toolId: def.id, sessionId: useDesignTools.getState().sessionId })
    expect((snap.targets as unknown[]).length).toBe(1)
    expect(useDesignTools.getState().run?.runId).toBe((snap as { runId: string }).runId)
    expect(useDesignTools.getState().instanceOf(def.id).runs.at(-1)?.status).toBe('sent')
    off()
  })

  it('with no frame open: opens the workspace and sends once the tool says ready', () => {
    useDesignTools.getState().consent(def.id)
    useDesignTools.getState().setTargets(def.id, [t1().id])
    expect(requestSend(def.id)).toMatchObject({ ok: false, queued: true })
    expect(useDesignTools.getState().workspace).toBe(def.id)
    const h = harness()
    const off = attachFrame(def.id, h.frame, h.win)
    expect(h.posted).toHaveLength(0)
    h.say({ protocol: PROTOCOL, type: 'tdt:ready', toolId: def.id, toolVersion: def.version })
    expect(h.posted).toHaveLength(1)
    expect(useFrameState.getState().ready[def.id]).toBe(true)
    expect(useDesignTools.getState().run).not.toBeNull()
    off()
    expect(useFrameState.getState().ready[def.id]).toBe(false)
  })
})

describe('attachFrame: proposals', () => {
  function sent() {
    const h = harness()
    const off = attachFrame(def.id, h.frame, h.win)
    h.say({ protocol: PROTOCOL, type: 'tdt:ready', toolId: def.id, toolVersion: def.version })
    useDesignTools.getState().consent(def.id)
    useDesignTools.getState().setTargets(def.id, [t1().id])
    const r = requestSend(def.id)
    if (!r.ok) throw new Error(r.reason)
    return { ...h, off, runId: r.runId }
  }

  it('a good proposal for the run in flight becomes pending and ends the run as returned', () => {
    const h = sent()
    h.say(proposalFor(h.runId, t1().id))
    const s = useDesignTools.getState()
    expect(s.pending?.check.ok).toBe(true)
    expect(s.pending?.check.stale).toBe(false)
    expect(s.pending?.proposal.runId).toBe(h.runId)
    expect(s.run).toBeNull()
    expect(s.instanceOf(def.id).runs.find((r) => r.runId === h.runId)?.status).toBe('returned')
    h.off()
  })

  it('a proposal with a problem is kept for the panel but the run is rejected', () => {
    const h = sent()
    h.say(proposalFor(h.runId, t1().id, { units: { length: 'mm' as 'm', frame: 'tower-local', up: 'z' } }))
    const s = useDesignTools.getState()
    expect(s.pending?.check.ok).toBe(false)
    expect(s.pending?.check.problems[0]).toMatch(/Units/)
    expect(s.instanceOf(def.id).runs.find((r) => r.runId === h.runId)?.status).toBe('rejected')
    h.off()
  })

  it('a proposal after the model changed is stale: pending, blocked, run marked stale', () => {
    const h = sent()
    useStore.getState().updateTower(t1().id, { height: t1().height + 10 })
    h.say(proposalFor(h.runId, t1().id))
    const s = useDesignTools.getState()
    expect(s.pending?.check.stale).toBe(true)
    expect(s.instanceOf(def.id).runs.find((r) => r.runId === h.runId)?.status).toBe('stale')
    h.off()
  })

  it('ignores another window, another origin, another protocol and another run (logged, no pending)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = sent()
    const good = proposalFor(h.runId, t1().id)
    h.say(good, 'https://evil.example')
    h.say(good, ORIGIN, { postMessage: () => {} })
    h.say({ ...good, protocol: 'tdt-sunwind@1' })
    expect(useDesignTools.getState().pending).toBeNull()
    expect(useDesignTools.getState().run?.runId).toBe(h.runId)
    expect(warn).not.toHaveBeenCalled()
    h.say({ ...good, runId: 'someone-else' })
    expect(useDesignTools.getState().pending).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    h.off()
    warn.mockRestore()
  })

  it('cancelRun tells the tool and a late proposal is dropped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = sent()
    cancelRun(def.id)
    expect(h.posted.at(-1)?.msg).toMatchObject({ protocol: PROTOCOL, type: 'tdt:cancel', runId: h.runId })
    expect(useDesignTools.getState().run).toBeNull()
    expect(useDesignTools.getState().instanceOf(def.id).runs.find((r) => r.runId === h.runId)?.status).toBe('cancelled')
    h.say(proposalFor(h.runId, t1().id))
    expect(useDesignTools.getState().pending).toBeNull()
    expect(warn).toHaveBeenCalled()
    h.off()
    warn.mockRestore()
  })

  it('a tdt:cancel from the tool ends the run as cancelled', () => {
    const h = sent()
    h.say({ protocol: PROTOCOL, type: 'tdt:cancel', runId: h.runId })
    expect(useDesignTools.getState().run).toBeNull()
    expect(useDesignTools.getState().instanceOf(def.id).runs.find((r) => r.runId === h.runId)?.status).toBe('cancelled')
    h.off()
  })

  it('detach stops listening', () => {
    const h = sent()
    h.off()
    expect(h.listeners.size).toBe(0)
    expect(isFrameReady(def.id)).toBe(false)
  })
})
