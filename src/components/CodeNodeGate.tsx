// "This node runs code" panel for a community code node (research P15-M04): what the sandbox allows, the code itself
// to read first, an explicit per-node "Allow this node to run code" (kept in this browser only), and the last run's
// outcome, including a stop by the watchdog or a refused network call.
import { Code2, ShieldAlert, ShieldCheck } from './icons'
import { useState } from 'react'
import type { NodePackage } from '../lib/nodePackages'
import { allowCode, isAllowed, revokeCode, useCodeRuns } from '../lib/sandbox/codeRuns'
import { DEFAULT_TIMEOUT_MS } from '../lib/sandbox/sandbox'
import { Section } from './ui'

const REASON: Record<string, string> = { timeout: 'Stopped by the time guard', error: 'The code failed', 'too-large': 'Result too large', invalid: 'Output rejected', 'bad-code': 'Code refused', unavailable: 'Sandbox unavailable' }

export default function CodeNodeGate({ p }: { p: NodePackage }) {
  const grants = useCodeRuns((s) => s.grants)
  const run = useCodeRuns((s) => s.runs[p.id])
  const [showCode, setShowCode] = useState(false)
  const [sure, setSure] = useState(false)
  if (!p.code) return null
  const allowed = isAllowed(p, grants)
  const o = run?.outcome
  return (
    <Section title="This node runs code">
      <div className={`rounded-md border p-2 text-meta ${allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
        <div className="flex items-start gap-1.5">
          {allowed ? <ShieldCheck size={14} className="mt-px shrink-0" /> : <ShieldAlert size={14} className="mt-px shrink-0" />}
          <span>
            {allowed ? <b>Allowed in this browser for v{p.version}.</b> : <b>Not allowed to run yet.</b>}{' '}
            Its code runs only in a sandbox: a separate, sandboxed frame with no network, no storage, no access to this page or your files, and a {DEFAULT_TIMEOUT_MS / 1000} s time limit.
            It receives only the Layer 0 summary (heights, areas, program shares) and returns numbers, which are checked before they are shown, flagged unverified.
          </span>
        </div>
      </div>
      <button onClick={() => setShowCode((v) => !v)} aria-expanded={showCode} className="mt-2 flex items-center gap-1 text-meta text-accent hover:underline"><Code2 size={12} />{showCode ? 'Hide the code' : `Read the code first (${p.code.source.length.toLocaleString()} characters)`}</button>
      {showCode && <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-900 p-2 text-meta leading-snug text-slate-100"><code>{p.code.source}</code></pre>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-meta">
        {allowed ? (
          <button onClick={() => revokeCode(p.id)} className="rounded border border-line px-2 py-1 hover:border-red-300 hover:text-red-800">Stop allowing this node</button>
        ) : (
          <>
            <label className="flex items-center gap-1.5"><input type="checkbox" aria-label="I have read the code and want to run it" checked={sure} onChange={(e) => setSure(e.target.checked)} />I have read the code and want to run it</label>
            <button disabled={!sure} onClick={() => allowCode(p)} className="rounded bg-ink px-2 py-1 font-semibold text-white disabled:opacity-40">Allow this node to run code</button>
          </>
        )}
      </div>
      {allowed && run && (
        <div className="mt-2 text-meta" aria-live="polite">
          {run.status === 'running' && <span className="text-muted">Running in the sandbox…</span>}
          {o?.ok && <span className="text-emerald-800">Ran in {o.ms} ms in the sandbox; results below.</span>}
          {o && !o.ok && <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-900"><b>{REASON[o.reason] ?? 'Stopped'}.</b> {o.message}</div>}
          {!!o?.denied.length && <div className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-900"><b>Blocked:</b> the code tried to use {[...new Set(o.denied)].join(', ')}. The sandbox has no network.</div>}
        </div>
      )}
      <p className="mt-2 text-meta text-muted">A changed version or changed code asks again. Declarative formula nodes never need this.</p>
    </Section>
  )
}
