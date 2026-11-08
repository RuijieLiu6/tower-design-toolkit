// Community node packages (tower-studio-node@1): types, compiling formulas, running a node on the Layer 0 summary,
// and judging each metric against its threshold. Validation (schema + plain-words errors) is in nodeValidate.ts,
// which loads only when someone imports a package.
import type { Category, NodeDef, NodeStatus } from '../data/registry'
import type { Flag, RuleResult, RuleState, Source } from '../engine/types'
import { evaluate, parse, type Ast } from './nodeExpr'
import { scopeVars, type Layer0Input, type Layer0Summary } from './layer0Summary'
import type { PackageIcon } from './nodeIcons/fromPackage'

export const FORMAT = 'tower-studio-node@1'
export type Stage = 'massing' | 'schematic' | 'present'
export type ThresholdFlag = Exclude<Flag, 'false_assumption'>

export interface ThresholdDef {
  /** info = a value shown on purpose with no good or bad. */
  direction?: 'higher_is_better' | 'lower_is_better' | 'range' | 'info'
  good?: number | [number, number]
  bad?: number | [number, number]
  text?: string
  flag: ThresholdFlag
  source: Source
}
export interface MetricDef { id: string; label: string; unit: string; per: 'tower' | 'project'; expression: string; decimals?: number; threshold: ThresholdDef; note?: string }
export interface ParamDef { id: string; label: string; unit: string; default: number; min?: number; max?: number; step?: number; flag: ThresholdFlag; source: Source; note?: string }
export interface FalseAssumptionDef { claim: string; correction: string; source: Source }
export interface NodeTest { fixture: string; tower?: number; metric: string; value?: number | null; tolerance?: number; state?: RuleState }

export interface NodePackage {
  format: typeof FORMAT
  id: string
  version: string
  licence: string
  name: string
  author: { name: string; contact?: string }
  category: Category
  stage: Stage
  question: string
  jury?: string[]
  projects?: ('vtc' | 'city')[]
  inputs: string[]
  method: string
  human: string
  limits: string
  parameters?: ParamDef[]
  metrics: MetricDef[]
  falseAssumptions?: FalseAssumptionDef[]
  tests?: NodeTest[]
  createdWith?: string
  /** Code node (research P15-M04): JavaScript that runs only in the sandbox, after the user allows it. Metrics whose
   *  expression is "code" take their value from run(input). */
  code?: { language: 'javascript'; source: string }
  /** Optional icon (artwork only; nodeIcons/fromPackage.ts). Taken out on import into the icon store, so a package in
   *  My nodes never carries it: how a node looks is kept apart from what it does. */
  icon?: PackageIcon
}

/** A metric whose value comes from the package's code (expression "code"), not a formula. */
export const isCodeMetric = (m: MetricDef) => m.expression.trim() === 'code'
export const isCodeNode = (p: NodePackage) => !!p.code && p.metrics.some(isCodeMetric)
/** Values a sandbox run returned, by metric id: a number per project metric, one per tower for tower metrics. */
export type CodeValues = Record<string, number | null | (number | null)[]>

export const STAGE_LABEL: Record<Stage, string> = { massing: 'Massing', schematic: 'Schematic', present: 'Present' }

/** Library entry for an imported package (status 'community'; registry.ts's NodeStatus doesn't list it yet). */
export function toNodeDef(p: NodePackage): NodeDef {
  const phase = p.stage === 'massing' ? 'basic' : p.stage === 'schematic' ? 'advanced' : 'present'
  return {
    id: p.id, name: p.name, category: p.category, phase, priority: 'roadmap', status: 'community' as NodeStatus,
    question: p.question, jury: p.jury ?? [], method: p.method, human: p.human, limits: p.limits, projects: p.projects,
  }
}

const compiled = new WeakMap<NodePackage, Record<string, Ast>>()
/** Parsed formulas, cached per package. Throws ExprError if a formula is broken (validation catches that first). */
export function compile(p: NodePackage): Record<string, Ast> {
  let c = compiled.get(p)
  if (!c) { c = Object.fromEntries(p.metrics.filter((m) => !isCodeMetric(m)).map((m) => [m.id, parse(m.expression)])); compiled.set(p, c) }
  return c
}

export function paramValues(p: NodePackage, overrides: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries((p.parameters ?? []).map((x) => [x.id, Number.isFinite(overrides[x.id]) ? overrides[x.id] : x.default]))
}

const num = (x: number | [number, number] | undefined) => (Array.isArray(x) ? x[0] : x)
const pair = (x: number | [number, number] | undefined): [number, number] | undefined => (Array.isArray(x) ? x : x === undefined ? undefined : [x, x])

export function thresholdState(v: number, th: ThresholdDef): RuleState {
  if (!Number.isFinite(v) || th.flag === 'unresolved' || !th.direction || th.direction === 'info' || th.good === undefined) return 'unknown'
  if (th.direction === 'range') {
    const [a, b] = pair(th.good)!, bad = pair(th.bad)
    if (v >= a && v <= b) return 'pass'
    return bad && (v < bad[0] || v > bad[1]) ? 'fail' : 'warn'
  }
  const g = num(th.good)!, b = num(th.bad)
  if (th.direction === 'higher_is_better') return v >= g ? 'pass' : b !== undefined && v < b ? 'fail' : 'warn'
  return v <= g ? 'pass' : b !== undefined && v > b ? 'fail' : 'warn'
}

const SILENT_UNITS = ['ratio', 'count', '0/1', '-', 'state']
export function formatValue(v: number, unit: string, decimals?: number): string {
  if (!Number.isFinite(v)) return 'not available'
  const d = decimals ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)
  const s = v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d })
  return SILENT_UNITS.includes(unit) ? s : unit === '%' ? `${s}%` : `${s} ${unit}`
}

export function thresholdText(th: ThresholdDef, unit: string, decimals?: number): string {
  if (th.text) return th.text
  if (th.direction === 'info') return 'information only, no threshold'
  if (th.flag === 'unresolved' || !th.direction || th.good === undefined) return 'no sourced threshold yet'
  const f = (x: number) => formatValue(x, unit, decimals ?? (Number.isInteger(x) ? 0 : undefined))
  if (th.direction === 'range') {
    const [a, b] = pair(th.good)!, bad = pair(th.bad)
    return `good ${f(a)} to ${f(b)}${bad ? `; bad below ${f(bad[0])} or above ${f(bad[1])}` : ''}`
  }
  const hi = th.direction === 'higher_is_better'
  const b = num(th.bad)
  return `good ${hi ? '≥' : '≤'} ${f(num(th.good)!)}${b !== undefined ? `; bad ${hi ? '<' : '>'} ${f(b)}` : ' (no sourced fail value, so at worst "Check")'}`
}

/** Community nodes can't show green until reviewed: an author's "verified" displays as unverified. */
export const displayFlag = (claimed: ThresholdFlag): Flag => (claimed === 'verified' ? 'unverified' : claimed)

export interface CommunityResult extends RuleResult {
  metricId: string
  per: 'tower' | 'project'
  towerName?: string
  raw: number
  claimed: ThresholdFlag
  /** Shown for information on purpose (direction "info"): no good or bad. */
  info: boolean
}

/** Run a package on the Layer 0 summary. Code metrics take `code.values` from a sandbox run; until then (or if it was
 *  refused or failed) they show as not computed, with `code.note` saying why. */
export function runPackage(p: NodePackage, s: Layer0Summary, params: Record<string, number> = {}, code?: { values?: CodeValues; note?: string }): CommunityResult[] {
  const asts = compile(p)
  const pv = paramValues(p, params)
  const out: CommunityResult[] = []
  for (const m of p.metrics) {
    const scopes: (number | null)[] = m.per === 'tower' ? s.towers.map((_, i) => i) : [null]
    for (const i of scopes) {
      const fromCode = isCodeMetric(m)
      const cv = fromCode ? code?.values?.[m.id] : undefined
      const raw = fromCode ? (Array.isArray(cv) ? cv[i ?? 0] ?? NaN : typeof cv === 'number' ? cv : NaN) : evaluate(asts[m.id], scopeVars(s, i, pv))
      const state = thresholdState(raw, m.threshold)
      const notes: string[] = []
      if (fromCode) notes.push(Number.isFinite(raw) ? 'Computed by the node’s own code in the sandbox (community code, unreviewed).' : code?.note ?? 'This value comes from the node’s code, which has not run.')
      else if (!Number.isFinite(raw)) notes.push("Can't compute here: this project lacks an input the formula needs, or it divides by zero.")
      else if (m.threshold.flag === 'unresolved' && m.threshold.direction !== 'info') notes.push('No sourced threshold yet, so the node shows the value only.')
      if (m.threshold.flag === 'verified') notes.push('The author marks this threshold verified; not yet reviewed in Tower Design Toolkit.')
      if (m.note) notes.push(m.note)
      const tower = i === null ? undefined : s.towers[i]
      out.push({
        id: `${m.id}@${tower?.id ?? 'project'}`,
        label: m.label,
        value: formatValue(raw, m.unit, m.decimals),
        threshold: thresholdText(m.threshold, m.unit, m.decimals),
        state,
        flag: displayFlag(m.threshold.flag),
        source: m.threshold.source,
        note: notes.join(' ') || undefined,
        metricId: m.id,
        per: m.per,
        towerName: tower?.name,
        raw,
        claimed: m.threshold.flag,
        info: m.threshold.direction === 'info',
      })
    }
  }
  return out
}

/** One-line status for the node canvas and library. */
export function summarize(results: CommunityResult[]): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  const c = (st: RuleState) => results.filter((r) => r.state === st && !r.info).length
  const fail = c('fail'), warn = c('warn'), pass = c('pass'), unknown = c('unknown'), info = results.filter((r) => r.info).length
  const parts = [fail && `${fail} fail`, warn && `${warn} check`, pass && `${pass} pass`, unknown && `${unknown} no threshold`, info && `${info} info`].filter(Boolean)
  return { text: parts.join(' · ') || 'No results', tone: fail ? 'bad' : warn ? 'warn' : pass ? 'ok' : 'muted' }
}

// --- Fixtures and package tests -------------------------------------------------------------------------------

export interface Fixture { id: string; label: string; design: Layer0Input; summary: Layer0Summary }
export interface TestOutcome { test: NodeTest; ok: boolean; actual: number; actualState: RuleState; message: string }

export function runTests(p: NodePackage, fixtures: Fixture[]): TestOutcome[] {
  return (p.tests ?? []).map((t) => {
    const fx = fixtures.find((f) => f.id === t.fixture)
    const m = p.metrics.find((x) => x.id === t.metric)
    const where = `${t.fixture}${m?.per === 'tower' ? `, tower ${t.tower ?? 0}` : ''}`
    if (!fx || !m) return { test: t, ok: false, actual: NaN, actualState: 'unknown' as RuleState, message: `Test for “${t.metric}” on ${t.fixture}: ${!fx ? 'no such fixture' : 'no metric with that id'}.` }
    const i = m.per === 'tower' ? t.tower ?? 0 : null
    if (i !== null && !fx.summary.towers[i]) return { test: t, ok: false, actual: NaN, actualState: 'unknown' as RuleState, message: `Test for “${t.metric}”: ${t.fixture} has no tower ${i} (towers are numbered from 0).` }
    // Code metrics run only in the sandbox, after the user allows the node; their tests can't run at import.
    if (isCodeMetric(m)) return { test: t, ok: true, actual: NaN, actualState: 'unknown' as RuleState, message: `“${m.id}” on ${where}: computed by code, so this test runs only in the sandbox after you allow the node.` }
    const actual = evaluate(compile(p)[m.id], scopeVars(fx.summary, i, paramValues(p)))
    const actualState = thresholdState(actual, m.threshold)
    const problems: string[] = []
    if (t.value !== undefined) {
      if (t.value === null) { if (Number.isFinite(actual)) problems.push(`expected “not available”, Tower Design Toolkit computes ${round(actual)}`) }
      else {
        const tol = t.tolerance ?? Math.max(Math.abs(t.value) * 0.01, 0.005)
        if (!Number.isFinite(actual)) problems.push(`expected ${t.value}, Tower Design Toolkit can't compute it there`)
        else if (Math.abs(actual - t.value) > tol) problems.push(`expected ${t.value}, Tower Design Toolkit computes ${round(actual)}`)
      }
    }
    if (t.state && t.state !== actualState) problems.push(`expected “${t.state}”, Tower Design Toolkit gives “${actualState}”`)
    return {
      test: t, ok: !problems.length, actual, actualState,
      message: problems.length ? `“${m.id}” on ${where}: ${problems.join('; ')}.` : `“${m.id}” on ${where}: ${round(actual)} → ${actualState}.`,
    }
  })
}

const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : NaN)
