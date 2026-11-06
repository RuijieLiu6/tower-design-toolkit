// Design options and decision visuals (backlog item 26). An option is a saved project (tower-studio-project@1) in the
// project store under an "option:" key, carrying one trace iteration: its design and the results digest at save time.
// Comparison, the jury-criterion weighting and "explain the difference" are pure functions below, tested in options.test.ts.
import { BUILT_NODES, JURY_LABEL, nodeById } from '../data/registry'
import type { Flag, RuleState } from '../engine/types'
import type { Design } from './project/design'
import { diffResults, type Digest, type ResultChange } from './trace/digest'
import { diffDesign, type Iteration } from './trace/trace'

export const OPTION_PREFIX = 'option:'
export const MAX_OPTIONS = 4

export interface OptionRecord { key: string; name: string; savedAt: string; design: Design; digest: Digest }

// ---- results by node ---------------------------------------------------------------------------------------------

/** Result groups of the decision trace's digest (lib/trace/digest.ts) and the node each comes from. */
export const GROUP_NODE: Record<string, string> = {
  rules: 'built.vtc-rules', fsr: 'built.fsr', cones: 'built.viewcones', lifts: 'built.core-lifts', egress: 'built.egress', skyRooms: 'built.sky-room',
  streetwall: 'built.pr-streetwall', frontage: 'built.pr-frontage', groundPlane: 'built.pr-ground', nature: 'built.city-in-nature',
  wind: 'built.wind-procedure', structure: 'built.structure', windStudy: 'built.wind-study', lifeSafety: 'built.life-safety',
  relaxAviation: 'built.relax-aviation',
}

/** Node a digest line belongs to: "rules:t1:height-t1" → built.vtc-rules; "community:<result>:<package>" → the package. */
export function nodeOfLine(id: string): string | null {
  if (id.startsWith('community:')) return id.slice(id.lastIndexOf(':') + 1)
  return GROUP_NODE[id.slice(0, id.indexOf(':'))] ?? null
}

const STATE_RANK: Record<RuleState, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 }
const FLAG_RANK: Record<string, number> = { false_assumption: 0, unresolved: 1, unverified: 2, team_assumption: 3, verified: 4 }
const weakest = (flags: string[]): Flag | null => (flags.length ? (flags.reduce((w, f) => ((FLAG_RANK[f] ?? 2) < (FLAG_RANK[w] ?? 2) ? f : w)) as Flag) : null)

export interface NodeSummary {
  nodeId: string
  name: string
  /** False when the decision trace does not record this node's results yet. */
  recorded: boolean
  state: RuleState
  counts: Record<RuleState, number>
  flag: Flag | null
  headline: string
  /** Every line's value and state, to tell "unchanged" from "values moved, states did not". */
  sig: string
  jury: string[]
}

/** Every switched-on node of an option, with its worst state, counts and weakest evidence flag. */
export function nodeSummaries(design: Design, digest: Digest, names: Record<string, string> = {}): NodeSummary[] {
  const byNode = new Map<string, Digest['lines']>()
  for (const l of digest.lines) {
    const n = nodeOfLine(l.id)
    if (n) byNode.set(n, [...(byNode.get(n) ?? []), l])
  }
  const ids = Object.keys(design.enabled).filter((id) => design.enabled[id])
  // Built nodes in registry order, then community nodes.
  ids.sort((a, b) => (BUILT_NODES.findIndex((n) => n.id === a) + 1 || 999) - (BUILT_NODES.findIndex((n) => n.id === b) + 1 || 999))
  return ids.map((id) => {
    const def = nodeById(id)
    if (def?.projects && !def.projects.includes(design.project)) return null
    const lines = byNode.get(id) ?? []
    const counts: Record<RuleState, number> = { pass: 0, warn: 0, fail: 0, unknown: 0 }
    for (const l of lines) counts[l.state]++
    // Info lines (unknown) do not pull a node down: its state is the worst of its pass / check / fail lines.
    const scored = lines.filter((l) => l.state !== 'unknown')
    const state = scored.reduce<RuleState>((w, l) => (STATE_RANK[l.state] < STATE_RANK[w] ? l.state : w), scored.length ? 'pass' : 'unknown')
    let headline = !lines.length ? '' : [counts.fail && `${counts.fail} fail`, counts.warn && `${counts.warn} to check`, counts.pass && `${counts.pass} pass`, counts.unknown && `${counts.unknown} info`].filter(Boolean).join(' · ')
    let recorded = lines.length > 0
    if (id === 'built.fsr' && Number.isFinite(digest.metrics['fsr.totalFsr'])) {
      headline = `FSR ${digest.metrics['fsr.totalFsr'].toFixed(2)} · non-res ${(digest.metrics['fsr.tier2'] ?? NaN).toFixed(2)}`
      recorded = true
    }
    return { nodeId: id, name: def?.name ?? names[id] ?? id, recorded, state, counts, flag: weakest(lines.map((l) => l.flag)), headline: recorded ? headline : 'not in the decision trace yet', sig: lines.map((l) => `${l.id}=${l.state}:${l.value}`).sort().join('|'), jury: def?.jury ?? [] }
  }).filter((x): x is NodeSummary => !!x)
}

export type Delta = 'better' | 'worse' | 'same' | 'changed' | 'n/a'

/** Compare one node across two options: worst state first, then fewer fails and checks; else same or values changed. */
export function compareNode(a: NodeSummary | undefined, b: NodeSummary | undefined): Delta {
  if (!a || !b || !a.recorded || !b.recorded) return 'n/a'
  if (STATE_RANK[b.state] !== STATE_RANK[a.state]) return STATE_RANK[b.state] > STATE_RANK[a.state] ? 'better' : 'worse'
  if (b.counts.fail !== a.counts.fail) return b.counts.fail < a.counts.fail ? 'better' : 'worse'
  if (b.counts.warn !== a.counts.warn) return b.counts.warn < a.counts.warn ? 'better' : 'worse'
  return a.headline === b.headline && a.sig === b.sig ? 'same' : 'changed'
}

// ---- jury criteria -------------------------------------------------------------------------------------------------

/** The brief's jury criteria and weights (VTC brief; the tag names carry the percentage). */
export const CRITERIA = ['human_scale_40', 'cultural_context_30', 'design_excellence_20', 'urban_integration_10'] as const
export type Criterion = (typeof CRITERIA)[number]
export const BRIEF_WEIGHTS: Record<Criterion, number> = { human_scale_40: 40, cultural_context_30: 30, design_excellence_20: 20, urban_integration_10: 10 }
export const criterionLabel = (c: Criterion) => (JURY_LABEL[c] ?? c).replace(/\s+\d+%$/, '')

/** Points per state (team assumption, as in the workflow logic): pass 1, check 0.5, fail 0, unknown left out. */
const POINTS: Record<RuleState, number | null> = { pass: 1, warn: 0.5, fail: 0, unknown: null }

export interface CriterionScore { criterion: Criterion; score: number; nodes: number; flag: Flag | null }

/**
 * Score per criterion, 0–100: each tagged node scores the mean points of its result lines, and the criterion takes
 * the mean of its nodes (so a node with many lines does not outweigh one with few). NaN when no tagged node has a
 * scorable line. This is a study aid, never the jury's score.
 */
export function criterionScores(design: Design, digest: Digest): CriterionScore[] {
  const lines = new Map<string, Digest['lines']>()
  for (const l of digest.lines) { const n = nodeOfLine(l.id); if (n && design.enabled[n]) lines.set(n, [...(lines.get(n) ?? []), l]) }
  return CRITERIA.map((c) => {
    const nodeScores: number[] = [], flags: string[] = []
    for (const [id, ls] of lines) {
      if (!(nodeById(id)?.jury ?? []).includes(c)) continue
      const pts = ls.map((l) => POINTS[l.state]).filter((p): p is number => p !== null)
      if (!pts.length) continue
      nodeScores.push(pts.reduce((s, p) => s + p, 0) / pts.length)
      flags.push(...ls.map((l) => l.flag))
    }
    return { criterion: c, score: nodeScores.length ? (100 * nodeScores.reduce((s, x) => s + x, 0)) / nodeScores.length : NaN, nodes: nodeScores.length, flag: weakest(flags) }
  })
}

/** Weighted total over the criteria that have a score (weights are the user's; negative weights count as 0). */
export function weightedTotal(scores: CriterionScore[], weights: Record<Criterion, number>): number {
  let sum = 0, w = 0
  for (const s of scores) {
    const k = Math.max(0, weights[s.criterion] ?? 0)
    if (!Number.isFinite(s.score) || k === 0) continue
    sum += k * s.score; w += k
  }
  return w > 0 ? sum / w : NaN
}

export const weightsChanged = (w: Record<Criterion, number>) => CRITERIA.some((c) => w[c] !== BRIEF_WEIGHTS[c])

// ---- explain the difference --------------------------------------------------------------------------------------

/** The input a plain-words design change is about ("Tower 1 Height: 285 m → 250 m" → "Tower 1 Height"). */
export const changeKey = (line: string) => (line.includes(':') ? line.slice(0, line.indexOf(':')) : line)

export interface Explanation {
  /** Inputs that differ, in plain words, each with the results that moved in trace steps that changed only it. */
  inputs: { change: string; key: string; moved: ResultChange[]; steps: number }[]
  /** Every result that differs between the two options. */
  results: ResultChange[]
  /** Results that moved but that no single-input trace step explains. */
  unexplained: ResultChange[]
}

/**
 * List the inputs that differ between two options and attribute result changes to them through the decision trace:
 * a trace step (consecutive iterations) that changed exactly one input shows what that input moves. Two options that
 * differ by one input are such a step themselves.
 */
export function explainDifference(a: OptionRecord, b: OptionRecord, trace: Iteration[]): Explanation {
  const changes = diffDesign(a.design, b.design)
  const results = diffResults(a.digest, b.digest)
  const steps: { key: string; moved: ResultChange[] }[] = []
  const own = [...new Set(changes.map(changeKey))]
  if (own.length === 1) steps.push({ key: own[0], moved: results })
  const its = [...trace].sort((x, y) => x.at.localeCompare(y.at))
  for (let i = 1; i < its.length; i++) {
    const keys = [...new Set(diffDesign(its[i - 1].design, its[i].design).map(changeKey))]
    if (keys.length === 1) steps.push({ key: keys[0], moved: diffResults(its[i - 1].digest, its[i].digest) })
  }
  const explained = new Set<string>()
  const inputs = changes.map((change) => {
    const key = changeKey(change)
    const mine = steps.filter((s) => s.key === key)
    const ids = new Set(mine.flatMap((s) => s.moved.map((m) => m.id)))
    const moved = results.filter((r) => ids.has(r.id))
    moved.forEach((m) => explained.add(m.id))
    return { change, key, moved, steps: mine.length }
  })
  return { inputs, results, unexplained: results.filter((r) => !explained.has(r.id)) }
}
