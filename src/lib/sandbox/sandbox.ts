// Sandbox for community code nodes (research P15-M04, T1 in the browser). The node's code never runs in the app's page:
// - a hidden iframe with sandbox="allow-scripts" and no allow-same-origin, so it has an opaque origin (no app storage,
//   cookies, DOM or same-origin requests);
// - its srcdoc carries a strict CSP: default-src 'none', connect-src 'none' (no network), and script-src allowing only
//   the one inline shim by its SHA-256, so no eval and no other script;
// - the shim starts the node's code in a blob Worker (which inherits that CSP), so an endless loop can't freeze the
//   app; the host's watchdog removes the iframe, which ends the worker;
// - host and sandbox talk over a transferred MessagePort; a second load of the frame stops the run.
// Code returns plain numbers for the metrics it declares. Labels, thresholds, sources and flags come from the package,
// checked by the host, so code can't put text or markup on screen.
import { isCodeMetric, type CodeValues, type NodePackage } from '../nodePackages'
import type { Layer0Summary } from '../layer0Summary'

export const SANDBOX_ATTRIBUTE = 'allow-scripts'
export const MAX_CODE_CHARS = 20000
export const DEFAULT_TIMEOUT_MS = 1500
export const DEFAULT_MAX_BYTES = 20000

/** The sandbox document's policy: nothing but its own shim, a blob worker, and no network of any kind. */
export function cspFor(scriptHash: string): string {
  return [
    "default-src 'none'", `script-src 'sha256-${scriptHash}'`, 'worker-src blob:', "connect-src 'none'", "img-src 'none'", "style-src 'none'",
    "font-src 'none'", "media-src 'none'", "object-src 'none'", "frame-src 'none'", "manifest-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ')
}

/** What the package's code may not contain: markup breakers, and the entry point must exist. */
export function checkCode(source: string): string[] {
  const out: string[] = []
  if (!source.trim()) out.push('The code is empty.')
  if (source.length > MAX_CODE_CHARS) out.push(`The code is ${source.length.toLocaleString()} characters; the limit is ${MAX_CODE_CHARS.toLocaleString()}.`)
  if (!/\bfunction\s+run\s*\(/.test(source)) out.push('The code must define function run(input) { … } and return the metric values.')
  return out
}

/** Worker script: the node's code after a prelude that records and refuses network and script loading (CSP blocks them anyway). */
export function workerSource(code: string): string {
  return `'use strict';
const __denied = [];
const __deny = (name) => function () { __denied.push(name); throw new Error(name + ' is blocked in the Tower Design Toolkit sandbox'); };
for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker']) { try { Object.defineProperty(self, n, { value: __deny(n), writable: false, configurable: false }); } catch (e) {} }
${code}
self.onmessage = (e) => {
  const t0 = Date.now();
  Promise.resolve().then(() => run(e.data.input)).then(
    (out) => self.postMessage({ type: 'result', out, denied: __denied, ms: Date.now() - t0 }),
    (err) => self.postMessage({ type: 'error', message: String((err && err.message) || err), denied: __denied }));
};`
}

/** The iframe's one inline script: waits for the host's port, starts the worker, relays messages. */
export function shimSource(code: string): string {
  // JSON keeps the code a string; escaping "<" means nothing in it can close the script element.
  const BS = String.fromCharCode(92), LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029)
  const worker = JSON.stringify(workerSource(code)).split('<').join(BS + 'u003c').split(LS).join(BS + 'u2028').split(PS).join(BS + 'u2029')
  return `(() => {
let port = null, worker = null;
addEventListener('message', (e) => {
  if (e.source !== parent || port || !e.data || e.data.type !== 'ts-sandbox-init' || !e.ports || !e.ports[0]) return;
  port = e.ports[0];
  try { worker = new Worker(URL.createObjectURL(new Blob([${worker}], { type: 'text/javascript' }))); }
  catch (err) { port.postMessage({ type: 'error', message: 'The sandbox could not start its worker: ' + String((err && err.message) || err) }); return; }
  worker.onmessage = (m) => port.postMessage(m.data);
  worker.onerror = (ev) => { ev.preventDefault(); port.postMessage({ type: 'error', message: ev.message || 'The node code failed' }); };
  port.onmessage = (m) => { if (m.data && m.data.type === 'run') worker.postMessage({ input: m.data.input }); };
  port.postMessage({ type: 'ready' });
});
})();`
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  let bin = ''
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** The sandbox document: CSP first, then the shim (its hash is the only script the policy allows). */
export async function buildSrcdoc(code: string): Promise<{ html: string; csp: string; hash: string; script: string }> {
  const script = shimSource(code)
  const hash = await sha256Base64(script)
  const csp = cspFor(hash)
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"></head><body><script>${script}</script></body></html>`
  return { html, csp, hash, script }
}

// --- Output: plain numbers for declared metrics only ---------------------------------------------------------------

export type { CodeValues }
export type OutputCheck = { ok: true; values: CodeValues } | { ok: false; problems: string[] }

const num = (v: unknown): number | null | undefined => (v === null ? null : typeof v === 'number' ? (Number.isFinite(v) ? v : null) : undefined)

/** Check what the code returned against the package: an object with a number (project metric) or one number per tower
 *  (tower metric) for every metric whose expression is "code", and nothing else. */
export function validateOutput(p: NodePackage, out: unknown, towerCount: number): OutputCheck {
  const problems: string[] = []
  if (!out || typeof out !== 'object' || Array.isArray(out)) return { ok: false, problems: ['run(input) must return an object such as { "metric_id": 12.5 }.'] }
  const o = out as Record<string, unknown>
  const codeMetrics = p.metrics.filter(isCodeMetric)
  const ids = new Set(codeMetrics.map((m) => m.id))
  for (const k of Object.keys(o)) if (!ids.has(k)) problems.push(`returned “${k.slice(0, 40)}”, which is not one of the node's code metrics.`)
  const values: CodeValues = {}
  for (const m of codeMetrics) {
    const v = o[m.id]
    if (v === undefined) { problems.push(`returned nothing for “${m.id}”.`); continue }
    if (m.per === 'project') {
      const n = num(v)
      if (n === undefined) problems.push(`“${m.id}” must be a number (or null), not ${Array.isArray(v) ? 'a list' : typeof v}.`)
      else values[m.id] = n
    } else {
      if (!Array.isArray(v) || v.length !== towerCount) { problems.push(`“${m.id}” is per tower, so it must be a list of ${towerCount} number${towerCount === 1 ? '' : 's'}.`); continue }
      const list = v.map(num)
      if (list.some((x) => x === undefined)) problems.push(`“${m.id}” must hold only numbers (or null).`)
      else values[m.id] = list as (number | null)[]
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, values }
}

// --- Running ----------------------------------------------------------------------------------------------------------

export interface SandboxInput { project: Layer0Summary['project']; sun: Layer0Summary['sun']; towers: Layer0Summary['towers']; params: Record<string, number> }
export type SandboxOutcome =
  | { ok: true; values: CodeValues; ms: number; denied: string[] }
  | { ok: false; reason: 'timeout' | 'error' | 'too-large' | 'invalid' | 'bad-code' | 'unavailable'; message: string; ms: number; denied: string[] }

/** One sandbox frame, as the runner sees it (the real one is an iframe; tests use a stand-in). */
export interface SandboxFrame { send(msg: unknown): void; onMessage(cb: (msg: unknown) => void): void; destroy(): void }
export type FrameFactory = (srcdoc: string) => SandboxFrame

/** The real frame: a hidden, sandboxed iframe with its own MessageChannel. */
export const iframeFactory: FrameFactory = (srcdoc) => {
  const f = document.createElement('iframe')
  f.setAttribute('sandbox', SANDBOX_ATTRIBUTE)
  f.setAttribute('referrerpolicy', 'no-referrer')
  f.setAttribute('aria-hidden', 'true')
  f.setAttribute('title', 'Community node sandbox')
  f.tabIndex = -1
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none'
  const channel = new MessageChannel()
  let listener: ((m: unknown) => void) | null = null
  let loads = 0
  const destroy = () => { channel.port1.onmessage = null; channel.port1.close(); f.remove() }
  f.addEventListener('load', () => {
    loads++
    // A second load means the document navigated: never hand data to whatever loaded.
    if (loads > 1) { listener?.({ type: 'error', message: 'The sandbox document reloaded or navigated, so the run was stopped.' }); destroy(); return }
    f.contentWindow?.postMessage({ type: 'ts-sandbox-init' }, '*', [channel.port2])
  })
  channel.port1.onmessage = (e) => listener?.(e.data)
  f.srcdoc = srcdoc
  document.body.appendChild(f)
  return { send: (m) => channel.port1.postMessage(m), onMessage: (cb) => { listener = cb }, destroy }
}

export async function runInSandbox(p: NodePackage, input: SandboxInput, opts: { factory?: FrameFactory; timeoutMs?: number; maxBytes?: number } = {}): Promise<SandboxOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const t0 = Date.now()
  const code = p.code?.source ?? ''
  const bad = checkCode(code)
  if (bad.length) return { ok: false, reason: 'bad-code', message: bad.join(' '), ms: 0, denied: [] }
  if (!opts.factory && typeof document === 'undefined') return { ok: false, reason: 'unavailable', message: 'No browser to run the sandbox in.', ms: 0, denied: [] }
  const { html } = await buildSrcdoc(code)
  return new Promise((resolve) => {
    let frame: SandboxFrame
    let done = false
    const finish = (o: Omit<Extract<SandboxOutcome, { ok: false }>, 'ms'> | Omit<Extract<SandboxOutcome, { ok: true }>, 'ms'>) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { frame?.destroy() } catch { /* already gone */ }
      resolve({ ...o, ms: Date.now() - t0 } as SandboxOutcome)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout', message: `Stopped after ${timeoutMs} ms: the code did not finish (an endless loop, or too much work).`, denied: [] }), timeoutMs)
    try { frame = (opts.factory ?? iframeFactory)(html) } catch (e) { finish({ ok: false, reason: 'unavailable', message: `The sandbox could not start: ${(e as Error).message}`, denied: [] }); return }
    frame.onMessage((raw) => {
      if (!raw || typeof raw !== 'object') return
      const m = raw as { type?: unknown; out?: unknown; message?: unknown; denied?: unknown }
      const denied = Array.isArray(m.denied) ? m.denied.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
      if (m.type === 'ready') { frame.send({ type: 'run', input }); return }
      if (m.type === 'error') { finish({ ok: false, reason: 'error', message: String(m.message ?? 'The node code failed').slice(0, 300), denied }); return }
      if (m.type !== 'result') return
      let size = Infinity
      try { size = JSON.stringify(m.out ?? null).length } catch { /* cycles or the like: rejected below */ }
      if (size > maxBytes) { finish({ ok: false, reason: 'too-large', message: `The result is ${Number.isFinite(size) ? size.toLocaleString() : 'not plain'} bytes; the limit is ${maxBytes.toLocaleString()}.`, denied }); return }
      const check = validateOutput(p, m.out, input.towers.length)
      if (!check.ok) { finish({ ok: false, reason: 'invalid', message: `The code's output was rejected: ${check.problems.slice(0, 4).join(' ')}`, denied }); return }
      finish({ ok: true, values: check.values, denied })
    })
  })
}
