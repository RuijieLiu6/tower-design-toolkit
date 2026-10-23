import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import example from '../../../skills/tower-studio-node-builder/references/example-code-node.json'
import loop from './samples/endless-loop.json'
import phoneHome from './samples/phone-home.json'
import { useStore } from '../../store'
import { layer0Summary } from '../layer0Summary'
import { runPackage, type NodePackage } from '../nodePackages'
import { validatePackage } from '../nodeValidate'
import { allowCode, grantKey, isAllowed, requestCodeRun, revokeCode, useCodeRuns } from './codeRuns'
import { SANDBOX_ATTRIBUTE, buildSrcdoc, checkCode, cspFor, runInSandbox, validateOutput, workerSource, type FrameFactory, type SandboxInput } from './sandbox'

const pkg = example as unknown as NodePackage
const s = useStore.getInitialState()
const summary = layer0Summary({ project: 'vtc', towers: s.towers.vtc, sun: s.sun, groundElevation: s.groundElevation })
const input: SandboxInput = { project: summary.project, sun: summary.sun, towers: summary.towers, params: {} }

/** A stand-in frame: says ready, then answers a run with whatever `reply` gives (or nothing). */
function fakeFrame(reply: (input: SandboxInput) => unknown, opts: { ready?: boolean } = {}) {
  const log = { srcdoc: '', destroyed: false, sent: [] as unknown[] }
  const factory: FrameFactory = (srcdoc) => {
    log.srcdoc = srcdoc
    let cb: (m: unknown) => void = () => {}
    if (opts.ready !== false) setTimeout(() => cb({ type: 'ready' }), 0)
    return {
      send: (m) => { log.sent.push(m); const r = reply((m as { input: SandboxInput }).input); if (r !== undefined) setTimeout(() => cb(r), 0) },
      onMessage: (f) => { cb = f },
      destroy: () => { log.destroyed = true },
    }
  }
  return { factory, log }
}
/** Run the node's code as the worker would, in-process (tests only: the app never evaluates package code itself). */
const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker']
function runCode(code: string, inp: SandboxInput) {
  const posted: unknown[] = []
  const self: Record<string, unknown> = { postMessage: (m: unknown) => posted.push(m) }
  // In a real worker `fetch` and `self.fetch` are one binding; here the names are parameters that go through self.
  const viaSelf = NETWORK.map((n) => function (this: unknown, ...a: unknown[]) { return (self[n] as (...x: unknown[]) => unknown).apply(this, a) })
  new Function('self', ...NETWORK, workerSource(code).replace(/^'use strict';/, ''))(self, ...viaSelf)
  ;(self.onmessage as (e: unknown) => void)({ data: { input: inp } })
  return new Promise<Record<string, unknown>>((r) => setTimeout(() => r(posted[0] as Record<string, unknown>), 5))
}

// Belt and braces: nothing in this file may reach the network, whatever a sample tries.
beforeAll(() => { for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket']) vi.stubGlobal(n, () => { throw new Error(`${n} is not allowed in tests`) }) })
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => useCodeRuns.setState({ grants: {}, runs: {} }))

describe('sandbox document (P15-M04)', () => {
  it('has no same-origin access and no network: sandbox attribute and CSP', async () => {
    expect(SANDBOX_ATTRIBUTE).toBe('allow-scripts')
    expect(SANDBOX_ATTRIBUTE).not.toMatch(/same-origin|top-navigation|popups|forms|modals/)
    const { html, csp, hash, script } = await buildSrcdoc(pkg.code!.source)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain('worker-src blob:')
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|\*|https?:|'self'/)
    expect(csp).toContain(`script-src 'sha256-${hash}'`)
    expect(hash).toBe(createHash('sha256').update(script).digest('base64'))
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${csp}">`)
    expect(html.match(/<script>/g)).toHaveLength(1)
    expect(cspFor('abc')).toMatch(/^default-src 'none'; script-src 'sha256-abc'/)
  })
  it('keeps hostile text inside the one script element', async () => {
    const { html } = await buildSrcdoc("function run(i) { return '</script><img src=x onerror=alert(1)>' }")
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toContain('<img')
  })
  it('refuses code without run(), or too long', () => {
    expect(checkCode('const x = 1')).toEqual([expect.stringMatching(/function run\(input\)/)])
    expect(checkCode(`function run(i) {}\n${'x'.repeat(20001)}`).join(' ')).toMatch(/limit is 20,000/)
    expect(checkCode(pkg.code!.source)).toEqual([])
  })
})

describe('bridge, guards and output checks', () => {
  it('sends the Layer 0 summary in and takes checked numbers out', async () => {
    const { factory, log } = fakeFrame((inp) => runCode(pkg.code!.source, inp).then((m) => m))
    // The reply is a promise of the worker's message; unwrap it for the fake.
    const unwrap: FrameFactory = (doc) => { const f = factory(doc); const send = f.send; let cb: (m: unknown) => void = () => {}; f.onMessage((m) => { if (m instanceof Promise) m.then(cb); else cb(m) }); return { ...f, send, onMessage: (x) => { cb = x } } }
    const o = await runInSandbox(pkg, input, { factory: unwrap, timeoutMs: 500 })
    expect(o.ok).toBe(true)
    if (!o.ok) return
    expect((o.values.core_to_facade as number[]).length).toBe(summary.towers.length)
    expect(o.values.deepest).toBeGreaterThan(5)
    expect(log.sent[0]).toMatchObject({ type: 'run', input: { towers: summary.towers } })
    expect(log.destroyed).toBe(true)
    expect(log.srcdoc).toContain('Content-Security-Policy')
  })
  it('stops a run that never answers and removes the frame', async () => {
    const { factory, log } = fakeFrame(() => undefined)
    const t0 = Date.now()
    const o = await runInSandbox(loop as unknown as NodePackage, input, { factory, timeoutMs: 60 })
    expect(o).toMatchObject({ ok: false, reason: 'timeout' })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(log.destroyed).toBe(true)
  })
  it('rejects output that is not plain numbers for the declared metrics', async () => {
    const bad = async (out: unknown) => runInSandbox(pkg, input, { factory: fakeFrame(() => ({ type: 'result', out, denied: [] })).factory, timeoutMs: 300 })
    expect(await bad({ core_to_facade: [1], deepest: 2, extra: 3 })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await bad({ core_to_facade: summary.towers.map(() => '<b>1</b>'), deepest: 2 })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await bad('hello')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(validateOutput(pkg, { core_to_facade: summary.towers.map(() => 1), deepest: null }, summary.towers.length).ok).toBe(true)
    expect(validateOutput(pkg, { core_to_facade: [1, 2, 3], deepest: 1 }, 1).ok).toBe(false)
  })
  it('guards result size, and reports errors and a reloaded frame', async () => {
    const big = await runInSandbox(pkg, input, { factory: fakeFrame(() => ({ type: 'result', out: { deepest: 1, core_to_facade: Array(50000).fill(1) }, denied: [] })).factory, maxBytes: 1000 })
    expect(big).toMatchObject({ ok: false, reason: 'too-large' })
    const err = await runInSandbox(pkg, input, { factory: fakeFrame(() => ({ type: 'error', message: 'The sandbox document reloaded or navigated, so the run was stopped.' })).factory })
    expect(err).toMatchObject({ ok: false, reason: 'error' })
  })
  it('the worker prelude refuses and reports network use', async () => {
    const m = await runCode(phoneHome.code.source, input)
    expect(m.type).toBe('result')
    expect(m.denied).toEqual(['fetch', 'XMLHttpRequest'])
  })
})

describe('code nodes in the package format and the app', () => {
  it('validates: "code" metrics need a code section, and importing warns that the node runs code', () => {
    const r = validatePackage(pkg)
    expect(r.problems.filter((x) => x.level === 'error')).toEqual([])
    expect(r.problems.some((x) => x.level === 'warning' && /runs its own code/.test(x.message))).toBe(true)
    const noCode = validatePackage({ ...pkg, code: undefined })
    expect(noCode.problems.some((x) => x.level === 'error' && /no "code" section/.test(x.message))).toBe(true)
  })
  it('shows code values with the community flag, or says why there are none', () => {
    const towers = summary.towers.length
    const without = runPackage(pkg, summary, {}, { note: 'Allow it first.' })
    expect(without.every((x) => x.value.includes('—') || /n\/a|not/i.test(x.value) || !Number.isFinite(x.raw))).toBe(true)
    expect(without[0].note).toMatch(/Allow it first/)
    const withValues = runPackage(pkg, summary, {}, { values: { core_to_facade: Array(towers).fill(12.34), deepest: 12.34 } })
    expect(withValues[0].raw).toBeCloseTo(12.34)
    expect(withValues[0].flag).not.toBe('verified')
    expect(withValues[0].note).toMatch(/sandbox \(community code, unreviewed\)/)
  })
  it('runs only after the user allows this exact code, and starts one run per design', async () => {
    let calls = 0
    const fake: typeof runInSandbox = async () => { calls++; return { ok: true, values: { core_to_facade: summary.towers.map(() => 3), deepest: 3 }, ms: 1, denied: [] } }
    requestCodeRun(pkg, summary, {}, fake)
    expect(calls).toBe(0)
    allowCode(pkg)
    expect(isAllowed(pkg)).toBe(true)
    expect(isAllowed({ ...pkg, code: { language: 'javascript', source: pkg.code!.source + '\n// changed' } })).toBe(false)
    requestCodeRun(pkg, summary, {}, fake)
    requestCodeRun(pkg, summary, {}, fake)
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toBe(1)
    expect(useCodeRuns.getState().runs[pkg.id]).toMatchObject({ status: 'done' })
    expect(grantKey(pkg)).toMatch(/^0\.1\.0#/)
    revokeCode(pkg.id)
    expect(isAllowed(pkg)).toBe(false)
  })
})
