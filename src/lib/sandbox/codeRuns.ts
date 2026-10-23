// Which code nodes the user allowed (kept in this browser only) and their latest sandbox runs. A grant names the node,
// its version and a hash of its code, so a changed package asks again. Runs are keyed by node, code, design summary and
// parameters: asking twice for the same run starts it once.
import { create } from 'zustand'
import type { Layer0Summary } from '../layer0Summary'
import type { CodeValues, NodePackage } from '../nodePackages'
import { hashOf } from '../project/stable'
import { runInSandbox, type SandboxOutcome } from './sandbox'

const GRANTS_KEY = 'ts.codeGrants'
export interface CodeRun { key: string; status: 'running' | 'done' | 'failed'; values?: CodeValues; outcome?: SandboxOutcome }
interface CodeRunState { grants: Record<string, string>; runs: Record<string, CodeRun> }

function loadGrants(): Record<string, string> {
  try { const raw = window.localStorage.getItem(GRANTS_KEY); return raw ? (JSON.parse(raw) as Record<string, string>) : {} } catch { return {} }
}
function saveGrants(g: Record<string, string>) {
  try { window.localStorage.setItem(GRANTS_KEY, JSON.stringify(g)) } catch { /* private mode: the grant lasts this session only */ }
}

export const useCodeRuns = create<CodeRunState>(() => ({ grants: typeof window === 'undefined' ? {} : loadGrants(), runs: {} }))

/** What a grant covers: this node, this version, this exact code. */
export const grantKey = (p: NodePackage) => `${p.version}#${hashOf(p.code?.source ?? '')}`
export const isAllowed = (p: NodePackage, grants = useCodeRuns.getState().grants) => !!p.code && grants[p.id] === grantKey(p)

export function allowCode(p: NodePackage) {
  const grants = { ...useCodeRuns.getState().grants, [p.id]: grantKey(p) }
  saveGrants(grants)
  useCodeRuns.setState({ grants })
}
export function revokeCode(id: string) {
  const { [id]: _gone, ...grants } = useCodeRuns.getState().grants
  const { [id]: _run, ...runs } = useCodeRuns.getState().runs
  saveGrants(grants)
  useCodeRuns.setState({ grants, runs })
}

/** Start a sandbox run unless the same one is running or done. Results land in the store. */
export function requestCodeRun(p: NodePackage, s: Layer0Summary, params: Record<string, number>, run: typeof runInSandbox = runInSandbox): void {
  if (!isAllowed(p)) return
  const key = hashOf({ id: p.id, g: grantKey(p), s, params })
  const cur = useCodeRuns.getState().runs[p.id]
  if (cur?.key === key) return
  useCodeRuns.setState((st) => ({ runs: { ...st.runs, [p.id]: { key, status: 'running', values: cur?.values } } }))
  void run(p, { project: s.project, sun: s.sun, towers: s.towers, params }).then((outcome) => {
    if (useCodeRuns.getState().runs[p.id]?.key !== key) return // a newer run replaced this one
    useCodeRuns.setState((st) => ({ runs: { ...st.runs, [p.id]: outcome.ok ? { key, status: 'done', values: outcome.values, outcome } : { key, status: 'failed', outcome } } }))
  })
}

/** Plain-words note for code metrics that have no value yet. */
export function codeNote(p: NodePackage, run: CodeRun | undefined, allowed: boolean): string {
  if (!allowed) return 'This node runs its own code. Open it in the library and choose “Allow this node to run code” to compute this value in the sandbox.'
  if (!run || run.status === 'running') return 'Running in the sandbox…'
  if (run.status === 'failed' && run.outcome && !run.outcome.ok) return `The sandbox stopped this node: ${run.outcome.message}`
  return 'This value comes from the node\'s code, which returned nothing for it.'
}
