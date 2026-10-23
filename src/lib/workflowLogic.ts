// Workflow graph logic for the Customize builder: typed ports, the workflow-logic nodes and a deterministic
// evaluation of the whole graph (topological order, loops refused). Pure: no React, no store, so it is tested directly.
import type { Category } from '../data/registry'
import type { Flag, RuleState, Source } from '../engine/types'

/** Layer 0 sources feed evaluation nodes; evaluation and logic nodes pass results on. */
export type PortType = 'site' | 'massing' | 'program' | 'result'
export type NodeKind = 'source' | 'eval' | 'logic' | 'group'
export type Params = Record<string, number | string | Record<string, number>>

export interface PortDef { id: string; label: string; type: PortType; multi?: boolean }

export const PORT_COLOR: Record<PortType, string> = { site: '#1f5f8b', massing: '#1f2328', program: '#b5651d', result: '#2a9d8f' }
export const PORT_LABEL: Record<PortType, string> = { site: 'Site', massing: 'Massing', program: 'Program', result: 'Result' }

export const SOURCES = [
  { ref: 'src.site', name: 'Site & context', type: 'site' as const, blurb: 'Block, context buildings, view cones and terrain' },
  { ref: 'src.massing', name: 'Massing', type: 'massing' as const, blurb: 'Towers, podium, floors, core' },
  { ref: 'src.program', name: 'Program', type: 'program' as const, blurb: 'Uses by floor band' },
]

export type LogicRef = 'logic.all-pass' | 'logic.any-fail' | 'logic.score' | 'logic.compare'
export const LOGIC: { ref: LogicRef; name: string; blurb: string }[] = [
  { ref: 'logic.all-pass', name: 'All pass', blurb: 'Passes only when every connected result passes' },
  { ref: 'logic.any-fail', name: 'Any fail', blurb: 'Fails as soon as one connected result fails' },
  { ref: 'logic.score', name: 'Weighted score', blurb: 'Scores the connected checks 0–100 with your weights' },
  { ref: 'logic.compare', name: 'Compare two options', blurb: 'Scores two towers side by side on the connected checks' },
]
export const isLogic = (ref: string): ref is LogicRef => LOGIC.some((l) => l.ref === ref)

/** Default parameters (all team assumptions, editable on the node). */
export const LOGIC_DEFAULTS: Record<LogicRef, Params> = {
  'logic.all-pass': {},
  'logic.any-fail': {},
  'logic.score': { passMark: 70, failMark: 40, weights: {} },
  'logic.compare': { a: '', b: '' },
}

/** Inputs an evaluation node needs, by category (the research registry does not list ports yet: a team assumption). */
export function evalInputs(id: string, category: Category): PortType[] {
  if (id === 'built.fsr' || id === 'built.core-lifts' || id === 'built.egress' || id === 'built.sky-room') return ['program', 'massing']
  if (id === 'built.sun') return ['site', 'massing']
  if (id === 'built.vtc-rules' || id === 'built.viewcones') return ['site', 'massing', 'program']
  switch (category) {
    case 'PROG': case 'STRC': case 'SYST': case 'SPAC': case 'ENER': return ['massing', 'program']
    case 'PRES': case 'DATA': return ['massing']
    case 'MOBI': case 'PUBL': return ['site', 'massing', 'program']
    default: return ['site', 'massing']
  }
}

export function portsFor(kind: NodeKind, ref: string, category?: Category): { inputs: PortDef[]; outputs: PortDef[] } {
  if (kind === 'source') {
    const s = SOURCES.find((x) => x.ref === ref)
    return { inputs: [], outputs: s ? [{ id: 'out', label: PORT_LABEL[s.type], type: s.type }] : [] }
  }
  if (kind === 'eval') {
    return {
      inputs: evalInputs(ref, category ?? 'DATA').map((t) => ({ id: t, label: PORT_LABEL[t], type: t })),
      outputs: [{ id: 'out', label: 'Result', type: 'result' }],
    }
  }
  if (kind === 'logic') {
    return { inputs: [{ id: 'in', label: ref === 'logic.compare' ? 'Checks' : 'Results', type: 'result', multi: true }], outputs: [{ id: 'out', label: 'Result', type: 'result' }] }
  }
  return { inputs: [], outputs: [] }
}

/** One result line travelling along a wire. Every line keeps its evidence flag and source. */
export interface Item {
  id: string
  label: string
  value?: string
  threshold?: string
  state: RuleState
  flag: Flag
  source?: Source
  towerId?: string
  towerName?: string
  note?: string
  /** Label of the node the line came from (set when it crosses a wire). */
  from?: string
}

export interface NodeOutput {
  /** 'idle' = not run (missing inputs, a source, a placeholder). */
  state: RuleState | 'idle'
  headline: string
  items: Item[]
  /** Required input ports that are not connected. */
  missing?: string[]
  score?: number
  /** Per input node: its 0–1 score and weight (weighted score), or per option (compare). */
  breakdown?: { id: string; label: string; score: number; weight?: number; scored: number; unscored: number }[]
}

export interface GraphNode { id: string; kind: NodeKind; ref: string; label: string; category?: Category; params?: Params }
export interface GraphEdge { id?: string; source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }
export interface TowerRef { id: string; name: string }

export interface EvalContext {
  /** Live output of an evaluation node once its inputs are connected. */
  evalNode: (n: GraphNode) => NodeOutput
  sourceHeadline?: (ref: string) => string
  towers: TowerRef[]
}

// ---- scoring ---------------------------------------------------------------------------------------------------

/** Points per state: pass 1, check 0.5, fail 0. Unknown is not scored (team assumption). */
export const POINTS: Record<RuleState, number | null> = { pass: 1, warn: 0.5, fail: 0, unknown: null }

export function scoreItems(items: Item[]): { score: number; scored: number; unscored: number } {
  const pts = items.map((i) => POINTS[i.state])
  const known = pts.filter((p): p is number => p !== null)
  return { score: known.length ? known.reduce((a, b) => a + b, 0) / known.length : NaN, scored: known.length, unscored: pts.length - known.length }
}

/** Weakest evidence among the lines: a false assumption shows first, then unresolved, unverified, team, verified. */
const FLAG_RANK: Record<Flag, number> = { false_assumption: 0, unresolved: 1, unverified: 2, team_assumption: 3, verified: 4 }
export function weakestFlag(items: Item[], fallback: Flag = 'team_assumption'): Flag {
  return items.reduce<Flag>((w, i) => (FLAG_RANK[i.flag] < FLAG_RANK[w] ? i.flag : w), items.length ? 'verified' : fallback)
}
export function flagCounts(items: Item[]): Partial<Record<Flag, number>> {
  const c: Partial<Record<Flag, number>> = {}
  for (const i of items) c[i.flag] = (c[i.flag] ?? 0) + 1
  return c
}

const count = (items: Item[], s: RuleState) => items.filter((i) => i.state === s).length
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const LOGIC_SOURCE: Source = { label: 'Workflow logic in Tower Design Toolkit (team assumption: pass 1, check 0.5, fail 0, unknown not scored)' }

export function allPass(items: Item[]): NodeOutput {
  if (!items.length) return { state: 'idle', headline: 'Connect results', items: [] }
  const f = count(items, 'fail'), w = count(items, 'warn'), u = count(items, 'unknown')
  const state: RuleState = f ? 'fail' : w || u ? 'warn' : 'pass'
  const headline = state === 'pass' ? `All ${items.length} pass` : f ? `${plural(f, 'fail')} of ${items.length}` : `${w + u} of ${items.length} not yet a pass`
  return { state, headline, items: [{ id: 'all-pass', label: 'All pass', value: headline, threshold: 'every connected result passes', state, flag: weakestFlag(items), source: LOGIC_SOURCE, note: u ? `${u} unknown or not runnable: they count as "not a pass".` : undefined }] }
}

export function anyFail(items: Item[]): NodeOutput {
  if (!items.length) return { state: 'idle', headline: 'Connect results', items: [] }
  const f = count(items, 'fail'), u = count(items, 'unknown')
  const state: RuleState = f ? 'fail' : 'pass'
  const headline = f ? `${plural(f, 'fail')}: ${items.filter((i) => i.state === 'fail').slice(0, 2).map((i) => i.label).join('; ')}` : `No fails in ${items.length}`
  return { state, headline, items: [{ id: 'any-fail', label: 'Any fail', value: headline, threshold: 'no connected result fails', state, flag: weakestFlag(items), source: LOGIC_SOURCE, note: u ? `${u} unknown or not runnable: unknown is not a fail, so check them by hand.` : undefined }] }
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const scoreState = (score: number, passMark: number, failMark: number): RuleState =>
  !Number.isFinite(score) ? 'unknown' : score >= passMark ? 'pass' : score < failMark ? 'fail' : 'warn'

/** Weighted score over input nodes: each input scores 0–1 from its lines, then a weighted mean (weights are the user's). */
export function weightedScore(inputs: { id: string; label: string; items: Item[] }[], params: Params = {}): NodeOutput {
  if (!inputs.length) return { state: 'idle', headline: 'Connect checks to score', items: [] }
  const weights = (params.weights && typeof params.weights === 'object' ? params.weights : {}) as Record<string, number>
  const passMark = num(params.passMark, 70), failMark = num(params.failMark, 40)
  const breakdown = inputs.map((i) => ({ id: i.id, label: i.label, weight: Math.max(0, num(weights[i.id], 1)), ...scoreItems(i.items) }))
  const used = breakdown.filter((b) => Number.isFinite(b.score) && b.weight > 0)
  const wsum = used.reduce((s, b) => s + b.weight, 0)
  const score = wsum > 0 ? (100 * used.reduce((s, b) => s + b.weight * b.score, 0)) / wsum : NaN
  const state = scoreState(score, passMark, failMark)
  const all = inputs.flatMap((i) => i.items)
  const skipped = breakdown.length - used.length
  const headline = Number.isFinite(score) ? `${Math.round(score)} / 100` : 'No scorable results yet'
  return {
    state, headline, score, breakdown,
    items: [{
      id: 'score', label: 'Weighted score', value: headline, threshold: `pass ≥ ${passMark}; fail < ${failMark} (your marks)`, state,
      // Weights and marks are the user's choice, so the score can never read better than a team assumption.
      flag: FLAG_RANK[weakestFlag(all)] < FLAG_RANK.team_assumption ? weakestFlag(all) : 'team_assumption',
      source: LOGIC_SOURCE,
      note: skipped ? `${plural(skipped, 'input')} not scored (no known result or weight 0).` : undefined,
    }],
  }
}

/** Two towers in the same project scored on the same checks. Project-wide lines count for both. */
export function compareOptions(items: Item[], towers: TowerRef[], params: Params = {}): NodeOutput {
  if (towers.length < 2) return { state: 'idle', headline: 'Add a second tower to compare', items: [] }
  const a = towers.find((t) => t.id === params.a) ?? towers[0]
  const b = towers.find((t) => t.id === params.b && t.id !== a.id) ?? towers.find((t) => t.id !== a.id)!
  if (!items.length) return { state: 'idle', headline: `Connect checks to compare ${a.name} and ${b.name}`, items: [] }
  const side = (t: TowerRef) => items.filter((i) => !i.towerId || i.towerId === t.id)
  const sa = scoreItems(side(a)), sb = scoreItems(side(b))
  const shared = items.filter((i) => !i.towerId).length
  const breakdown = [{ id: a.id, label: `A · ${a.name}`, ...sa }, { id: b.id, label: `B · ${b.name}`, ...sb }]
  const pa = Math.round(100 * sa.score), pb = Math.round(100 * sb.score)
  const ok = Number.isFinite(pa) && Number.isFinite(pb)
  const headline = !ok ? 'Not enough known results' : pa === pb ? `${a.name} and ${b.name} tie at ${pa}` : `${pa > pb ? a.name : b.name} leads by ${Math.abs(pa - pb)} points`
  const line = (t: TowerRef, s: { score: number }, tag: string): Item => ({
    id: `option-${tag}`, label: `Option ${tag.toUpperCase()}: ${t.name}`, value: Number.isFinite(s.score) ? `${Math.round(100 * s.score)} / 100` : 'no score',
    threshold: 'share of checks passed (check counts half)', state: scoreState(100 * s.score, 70, 40), flag: weakestFlag(side(t)), source: LOGIC_SOURCE, towerId: t.id, towerName: t.name,
    note: shared ? `${plural(shared, 'project-wide result')} count for both options.` : undefined,
  })
  return { state: ok ? 'unknown' : 'idle', headline, breakdown, score: ok ? pa - pb : undefined, items: [line(a, sa, 'a'), line(b, sb, 'b')] }
}

// ---- graph -----------------------------------------------------------------------------------------------------

/** True if adding source → target would close a loop. */
export function wouldCycle(edges: GraphEdge[], source: string, target: string): boolean {
  if (source === target) return true
  const out = new Map<string, string[]>()
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  const seen = new Set<string>(), stack = [target]
  while (stack.length) {
    const n = stack.pop()!
    if (n === source) return true
    if (seen.has(n)) continue
    seen.add(n)
    stack.push(...(out.get(n) ?? []))
  }
  return false
}

/** Can a wire run from this output to this input? Types must match, and single inputs take one wire. */
export function canConnect(
  nodes: GraphNode[], edges: GraphEdge[], c: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null },
): { ok: boolean; reason?: string } {
  const s = nodes.find((n) => n.id === c.source), t = nodes.find((n) => n.id === c.target)
  if (!s || !t) return { ok: false, reason: 'Unknown node' }
  const out = portsFor(s.kind, s.ref, s.category).outputs.find((p) => p.id === (c.sourceHandle ?? 'out'))
  const inp = portsFor(t.kind, t.ref, t.category).inputs.find((p) => p.id === c.targetHandle)
  if (!out || !inp) return { ok: false, reason: 'No such port' }
  if (out.type !== inp.type) return { ok: false, reason: `${PORT_LABEL[out.type]} cannot plug into ${PORT_LABEL[inp.type]}` }
  if (edges.some((e) => e.source === c.source && e.target === c.target && e.targetHandle === c.targetHandle)) return { ok: false, reason: 'Already connected' }
  if (!inp.multi && edges.some((e) => e.target === c.target && e.targetHandle === c.targetHandle)) return { ok: false, reason: `${inp.label} already has a wire` }
  if (wouldCycle(edges, c.source, c.target)) return { ok: false, reason: 'That would make a loop' }
  return { ok: true }
}

/** Kahn order; nodes left over sit on a loop. */
export function topoOrder(nodes: GraphNode[], edges: GraphEdge[]): { order: string[]; looped: string[] } {
  const ids = new Set(nodes.map((n) => n.id))
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const out = new Map<string, string[]>()
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
    out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  }
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length) {
    const n = queue.shift()!
    order.push(n)
    for (const m of out.get(n) ?? []) {
      indeg.set(m, indeg.get(m)! - 1)
      if (indeg.get(m) === 0) queue.push(m)
    }
  }
  return { order, looped: nodes.map((n) => n.id).filter((id) => !order.includes(id)) }
}

/** Evaluate every node once, upstream first. */
export function evaluateGraph(nodes: GraphNode[], edges: GraphEdge[], ctx: EvalContext): Record<string, NodeOutput> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const { order, looped } = topoOrder(nodes, edges)
  const res: Record<string, NodeOutput> = {}
  for (const id of looped) res[id] = { state: 'idle', headline: 'On a loop: remove a wire', items: [] }
  for (const id of order) {
    const n = byId.get(id)!
    const incoming = edges.filter((e) => e.target === id && byId.has(e.source))
    if (n.kind === 'group') continue
    if (n.kind === 'source') { res[id] = { state: 'idle', headline: ctx.sourceHeadline?.(n.ref) ?? '', items: [] }; continue }
    if (n.kind === 'eval') {
      const need = portsFor('eval', n.ref, n.category).inputs.map((p) => p.id)
      const missing = need.filter((p) => !incoming.some((e) => e.targetHandle === p))
      res[id] = missing.length ? { state: 'idle', headline: `Connect ${missing.join(' + ')}`, items: [], missing } : ctx.evalNode(n)
      continue
    }
    // Logic: gather the upstream lines, tagged with where they came from.
    const ups = incoming.filter((e) => e.targetHandle === 'in').map((e) => byId.get(e.source)!)
    const inputs = ups.map((u) => ({ id: u.id, label: u.label, items: (res[u.id]?.items ?? []).map((i) => ({ ...i, from: i.from ?? u.label })) }))
    const flat = inputs.flatMap((i) => i.items)
    // A connected node with nothing to say still counts: an unconnected or placeholder node is an unknown, not a pass.
    const withGaps = inputs.flatMap((i) => (i.items.length ? i.items : [{ id: `${i.id}-none`, label: `${i.label}: no result`, state: 'unknown' as RuleState, flag: 'unresolved' as Flag, from: i.label }]))
    if (n.ref === 'logic.all-pass') res[id] = allPass(withGaps)
    else if (n.ref === 'logic.any-fail') res[id] = anyFail(withGaps)
    else if (n.ref === 'logic.score') res[id] = weightedScore(inputs, n.params)
    else if (n.ref === 'logic.compare') res[id] = compareOptions(flat, ctx.towers, n.params)
    else res[id] = { state: 'idle', headline: 'Unknown logic node', items: [] }
  }
  return res
}
