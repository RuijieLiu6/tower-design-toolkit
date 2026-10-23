#!/usr/bin/env node
// Check a Tower Design Toolkit node package (tower-studio-node@1) before importing it. No dependencies; Node 18+.
//
//   node scripts/check_node.mjs my-node.json
//
// It parses every formula, checks names against the Layer 0 list, checks thresholds and evidence rules, prints what
// each metric gives on the sample fixtures, and runs the package's own tests. Tower Design Toolkit repeats all of this, plus
// the full JSON Schema check, when you import the package. Exit code 1 means something must be fixed.
// The formula code below is a copy of Tower Design Toolkit's src/lib/nodeExpr.ts (the app's tests keep the two identical).
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ---- formula language -----------------------------------------------------------------------------------------
export class ExprError extends Error {
  constructor(message, at) { super(message); this.at = at }
}
const MAX_LENGTH = 500
const MAX_DEPTH = 40
const deg = Math.PI / 180
export const FUNCTIONS = {
  min: [1, 20, (...x) => Math.min(...x)],
  max: [1, 20, (...x) => Math.max(...x)],
  abs: [1, 1, Math.abs],
  sqrt: [1, 1, Math.sqrt],
  pow: [2, 2, Math.pow],
  round: [1, 2, (x, n = 0) => { const f = 10 ** Math.round(n); return Math.round(x * f) / f }],
  floor: [1, 1, Math.floor],
  ceil: [1, 1, Math.ceil],
  clamp: [3, 3, (x, lo, hi) => Math.min(hi, Math.max(lo, x))],
  log: [1, 1, Math.log],
  log10: [1, 1, Math.log10],
  exp: [1, 1, Math.exp],
  sin: [1, 1, Math.sin],
  cos: [1, 1, Math.cos],
  tan: [1, 1, Math.tan],
  asin: [1, 1, Math.asin],
  acos: [1, 1, Math.acos],
  atan: [1, 1, Math.atan],
  atan2: [2, 2, Math.atan2],
  rad: [1, 1, (x) => x * deg],
  deg: [1, 1, (x) => x / deg],
  if: [3, 3, (c, a, b) => (c ? a : b)],
  finite: [1, 1, (x) => (Number.isFinite(x) ? 1 : 0)],
}
// NA = not available on purpose, e.g. `tower.gfa_office > 0 ? … : NA` skips towers with no office.
const CONSTANTS = { PI: Math.PI, NA: NaN }
const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '<', '>', '!', '?', ':', '(', ')', ',']

function tokenize(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      if (!m) throw new ExprError(`“${c}” is not a number`, i)
      out.push({ t: 'num', v: Number(m[0]), at: i }); i += m[0].length; continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i))
      out.push({ t: 'name', v: m[0], at: i }); i += m[0].length; continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (!op) throw new ExprError(`“${c}” can't be used in a formula`, i)
    out.push({ t: 'op', v: op, at: i }); i += op.length
  }
  return out
}

export function parse(src) {
  if (src.length > MAX_LENGTH) throw new ExprError(`The formula is ${src.length} characters long; the limit is ${MAX_LENGTH}`, MAX_LENGTH)
  const toks = tokenize(src)
  let p = 0, depth = 0
  const peek = () => toks[p]
  const isOp = (v) => peek()?.t === 'op' && peek().v === v
  const where = () => (peek() ? peek().at : src.length)
  const expect = (v) => {
    if (!isOp(v)) throw new ExprError(peek() ? `Expected “${v}” but found “${String(peek().v)}”` : `Expected “${v}” but the formula ended`, where())
    p++
  }
  const enter = () => { if (++depth > MAX_DEPTH) throw new ExprError('The formula is nested too deeply', where()) }
  const binary = (next, ops) => () => {
    let a = next()
    while (peek()?.t === 'op' && ops.includes(peek().v)) { const op = toks[p++].v; a = { k: 'bin', op, a, b: next() } }
    return a
  }
  const expr = () => { enter(); const r = ternary(); depth--; return r }
  const ternary = () => {
    const c = or()
    if (!isOp('?')) return c
    p++
    const a = expr(); expect(':'); const b = expr()
    return { k: 'if', c, a, b }
  }
  const unary = () => {
    if (isOp('-') || isOp('+') || isOp('!')) { const op = toks[p++].v; enter(); const a = unary(); depth--; return { k: 'un', op, a } }
    return power()
  }
  const power = () => {
    const a = atom()
    if (!isOp('^')) return a
    p++
    enter(); const b = unary(); depth--
    return { k: 'bin', op: '^', a, b }
  }
  const mult = binary(unary, ['*', '/', '%'])
  const add = binary(mult, ['+', '-'])
  const cmp = binary(add, ['<', '<=', '>', '>='])
  const eq = binary(cmp, ['==', '!='])
  const and = binary(eq, ['&&'])
  const or = binary(and, ['||'])
  const atom = () => {
    const tk = peek()
    if (!tk) throw new ExprError('The formula ended early', src.length)
    if (tk.t === 'num') { p++; return { k: 'num', v: tk.v } }
    if (tk.t === 'name') {
      p++
      if (isOp('(')) {
        const spec = Object.hasOwn(FUNCTIONS, tk.v) ? FUNCTIONS[tk.v] : undefined
        if (!spec) throw new ExprError(`“${tk.v}” is not a function Tower Design Toolkit knows${suggestText(tk.v, Object.keys(FUNCTIONS))}`, tk.at)
        p++
        const args = []
        if (!isOp(')')) { do { args.push(expr()) } while (isOp(',') && ++p) }
        expect(')')
        if (args.length < spec[0] || args.length > spec[1]) {
          const want = spec[0] === spec[1] ? `${spec[0]}` : spec[1] >= 20 ? `at least ${spec[0]}` : `${spec[0]} or ${spec[1]}`
          throw new ExprError(`“${tk.v}” takes ${want} value${want === '1' ? '' : 's'}, not ${args.length}`, tk.at)
        }
        return { k: 'call', fn: tk.v, args }
      }
      if (Object.hasOwn(FUNCTIONS, tk.v) && !tk.v.includes('.')) throw new ExprError(`“${tk.v}” is a function: write ${tk.v}(…)`, tk.at)
      return { k: 'var', name: tk.v }
    }
    if (tk.v === '(') { p++; const e = expr(); expect(')'); return e }
    throw new ExprError(`Unexpected “${tk.v}”`, tk.at)
  }
  if (!toks.length) throw new ExprError('The formula is empty', 0)
  const ast = expr()
  if (p < toks.length) throw new ExprError(`Unexpected “${String(toks[p].v)}” after the end of the formula`, toks[p].at)
  return ast
}

export function variablesOf(ast, out = new Set()) {
  switch (ast.k) {
    case 'var': if (!Object.hasOwn(CONSTANTS, ast.name)) out.add(ast.name); break
    case 'un': variablesOf(ast.a, out); break
    case 'bin': variablesOf(ast.a, out); variablesOf(ast.b, out); break
    case 'if': variablesOf(ast.c, out); variablesOf(ast.a, out); variablesOf(ast.b, out); break
    case 'call': ast.args.forEach((x) => variablesOf(x, out)); break
  }
  return out
}

export function evaluate(ast, vars) {
  switch (ast.k) {
    case 'num': return ast.v
    case 'var': {
      if (Object.hasOwn(CONSTANTS, ast.name)) return CONSTANTS[ast.name]
      const v = Object.hasOwn(vars, ast.name) ? vars[ast.name] : undefined
      return typeof v === 'number' ? v : NaN
    }
    case 'un': {
      const a = evaluate(ast.a, vars)
      return ast.op === '-' ? -a : ast.op === '+' ? a : a ? 0 : 1
    }
    case 'if': return evaluate(ast.c, vars) ? evaluate(ast.a, vars) : evaluate(ast.b, vars)
    case 'call': return FUNCTIONS[ast.fn][2](...ast.args.map((x) => evaluate(x, vars)))
    case 'bin': {
      if (ast.op === '&&') return evaluate(ast.a, vars) && evaluate(ast.b, vars) ? 1 : 0
      if (ast.op === '||') return evaluate(ast.a, vars) || evaluate(ast.b, vars) ? 1 : 0
      const a = evaluate(ast.a, vars), b = evaluate(ast.b, vars)
      switch (ast.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '%': return a % b
        case '^': return a ** b
        case '<': return a < b ? 1 : 0
        case '<=': return a <= b ? 1 : 0
        case '>': return a > b ? 1 : 0
        case '>=': return a >= b ? 1 : 0
        case '==': return a === b ? 1 : 0
        case '!=': return a !== b ? 1 : 0
      }
    }
  }
  return NaN
}

export function suggest(name, known) {
  let best = null, bestD = 4
  for (const k of known) {
    const d = editDistance(name.toLowerCase(), k.toLowerCase())
    if (d < bestD) { bestD = d; best = k }
  }
  return best
}
const suggestText = (name, known) => { const s = suggest(name, known); return s ? `. Did you mean “${s}”?` : '' }
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

// ---- thresholds and running --------------------------------------------------------------------------------------
const first = (x) => (Array.isArray(x) ? x[0] : x)
const pair = (x) => (Array.isArray(x) ? x : x === undefined ? undefined : [x, x])

export function thresholdState(v, th) {
  if (!Number.isFinite(v) || th.flag === 'unresolved' || !th.direction || th.direction === 'info' || th.good === undefined) return 'unknown'
  if (th.direction === 'range') {
    const [a, b] = pair(th.good), bad = pair(th.bad)
    if (v >= a && v <= b) return 'pass'
    return bad && (v < bad[0] || v > bad[1]) ? 'fail' : 'warn'
  }
  const g = first(th.good), b = first(th.bad)
  if (th.direction === 'higher_is_better') return v >= g ? 'pass' : b !== undefined && v < b ? 'fail' : 'warn'
  return v <= g ? 'pass' : b !== undefined && v > b ? 'fail' : 'warn'
}

export function scopeVars(summary, towerIndex, params = {}) {
  const out = {}
  for (const [k, v] of Object.entries(summary.project)) out[`project.${k}`] = v
  for (const [k, v] of Object.entries(summary.sun)) out[`sun.${k}`] = v
  if (towerIndex !== null) for (const [k, v] of Object.entries(summary.towers[towerIndex]?.values ?? {})) out[`tower.${k}`] = v
  for (const [k, v] of Object.entries(params)) out[`params.${k}`] = v
  return out
}

const defaults = (pkg) => Object.fromEntries((pkg.parameters ?? []).map((p) => [p.id, p.default]))

/** Every metric on every tower (or the project) of one fixture: [{ metric, tower, value, state }]. */
export function runOnFixture(pkg, fixture) {
  const out = []
  for (const m of pkg.metrics) {
    const ast = parse(m.expression)
    const scopes = m.per === 'tower' ? fixture.summary.towers.map((_, i) => i) : [null]
    for (const i of scopes) {
      const value = evaluate(ast, scopeVars(fixture.summary, i, defaults(pkg)))
      out.push({ metric: m.id, tower: i, value, state: thresholdState(value, m.threshold) })
    }
  }
  return out
}

// ---- checks ------------------------------------------------------------------------------------------------------
const REQUIRED = ['format', 'id', 'version', 'licence', 'name', 'author', 'category', 'stage', 'question', 'inputs', 'method', 'human', 'limits', 'metrics']

/** Returns { errors: string[], warnings: string[], tests: string[] }. Not the full schema check: Tower Design Toolkit does that on import. */
export function checkPackage(pkg, fixtures, layer0Names) {
  const errors = [], warnings = [], tests = []
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return { errors: ['The package should be one JSON object.'], warnings, tests }
  for (const k of REQUIRED) if (pkg[k] === undefined) errors.push(`Missing “${k}”.`)
  if (pkg.format !== undefined && pkg.format !== 'tower-studio-node@1') errors.push('“format” must be "tower-studio-node@1".')
  if (typeof pkg.id === 'string' && !/^community\.[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/.test(pkg.id)) errors.push('“id” must look like community.your-handle.node-name.')
  if (!Array.isArray(pkg.metrics) || !pkg.metrics.length) { errors.push('Add at least one metric.'); return { errors, warnings, tests } }
  const params = new Set((pkg.parameters ?? []).map((p) => p.id))
  const used = new Set()
  for (const m of pkg.metrics) {
    const name = `Metric “${m.id}”`
    if (!m.threshold || !m.threshold.source || !m.threshold.flag) { errors.push(`${name}: every threshold needs a flag and a source.`); continue }
    const th = m.threshold
    if (!['verified', 'team_assumption', 'unverified', 'unresolved'].includes(th.flag)) errors.push(`${name}: flag must be verified, team_assumption, unverified or unresolved (false assumptions go in "falseAssumptions").`)
    if ((th.flag === 'unresolved' || th.direction === 'info') && (th.good !== undefined || th.bad !== undefined)) errors.push(`${name}: an ${th.direction === 'info' ? 'information-only' : 'unresolved'} threshold takes no good or bad.`)
    if (th.flag !== 'unresolved' && th.direction !== 'info' && (th.direction === undefined || th.good === undefined)) errors.push(`${name}: give "direction" and a sourced "good"; or "direction": "info" for a value with no threshold on purpose; or flag it unresolved if the number isn't known yet. Never invent one.`)
    if (th.flag === 'verified' && !th.source.page && !th.source.url) errors.push(`${name}: a verified threshold needs source.page or source.url.`)
    if (th.direction === 'higher_is_better' && typeof th.bad === 'number' && th.bad > th.good) errors.push(`${name}: higher is better, but bad is above good.`)
    if (th.direction === 'lower_is_better' && typeof th.bad === 'number' && th.bad < th.good) errors.push(`${name}: lower is better, but bad is below good.`)
    let ast
    try { ast = parse(String(m.expression ?? '')) } catch (e) {
      errors.push(`${name} formula: ${e.message}, at character ${(e.at ?? 0) + 1}.`); continue
    }
    for (const v of variablesOf(ast)) {
      if (v.startsWith('params.')) { if (!params.has(v.slice(7))) errors.push(`${name}: uses “${v}”, but no parameter has that id.`); continue }
      if (!layer0Names.includes(v)) { const s = suggest(v, layer0Names); errors.push(`${name}: “${v}” isn't a Layer 0 value${s ? `. Did you mean “${s}”?` : '.'}`); continue }
      if (m.per === 'project' && v.startsWith('tower.')) errors.push(`${name}: is per project but reads “${v}”.`)
      used.add(v)
    }
  }
  for (const v of used) if (!(pkg.inputs ?? []).includes(v)) warnings.push(`“inputs” doesn't list “${v}”, which a formula reads.`)
  if (errors.length) return { errors, warnings, tests }
  for (const t of pkg.tests ?? []) {
    const fx = fixtures.find((f) => f.id === t.fixture)
    const m = pkg.metrics.find((x) => x.id === t.metric)
    if (!fx || !m) { warnings.push(`Test on ${t.fixture}/${t.metric}: no such ${!fx ? 'fixture' : 'metric'}.`); continue }
    const i = m.per === 'tower' ? t.tower ?? 0 : null
    const value = evaluate(parse(m.expression), scopeVars(fx.summary, i, defaults(pkg)))
    const state = thresholdState(value, m.threshold)
    const bad = []
    if (t.value === null && Number.isFinite(value)) bad.push(`expected not available, got ${value}`)
    if (typeof t.value === 'number') {
      const tol = t.tolerance ?? Math.max(Math.abs(t.value) * 0.01, 0.005)
      if (!(Math.abs(value - t.value) <= tol)) bad.push(`expected ${t.value}, got ${value}`)
    }
    if (t.state && t.state !== state) bad.push(`expected ${t.state}, got ${state}`)
    const line = `${t.metric} on ${t.fixture}${i !== null ? ` tower ${i}` : ''}`
    if (bad.length) warnings.push(`Test ${line}: ${bad.join('; ')}.`)
    else tests.push(`ok  ${line}: ${Number(value.toPrecision(6))} → ${state}`)
  }
  if (!(pkg.tests ?? []).length) warnings.push('No tests yet: add a few on the sample fixtures.')
  return { errors, warnings, tests }
}

// ---- command line ------------------------------------------------------------------------------------------------
function main() {
  const file = process.argv[2]
  if (!file) { console.log('Usage: node scripts/check_node.mjs <package.json>'); process.exit(2) }
  const here = new URL('../references/', import.meta.url)
  const fixtures = JSON.parse(readFileSync(new URL('fixtures.json', here), 'utf8')).fixtures
  const schema = JSON.parse(readFileSync(new URL('node-package.schema.json', here), 'utf8'))
  const names = schema.properties.inputs.items.enum
  let pkg
  try { pkg = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) } catch (e) { console.log(`Not valid JSON: ${e.message}`); process.exit(1) }
  const { errors, warnings, tests } = checkPackage(pkg, fixtures, names)
  for (const e of errors) console.log(`ERROR    ${e}`)
  for (const w of warnings) console.log(`WARNING  ${w}`)
  if (!errors.length) {
    for (const fx of fixtures) {
      if (pkg.projects && !pkg.projects.includes(fx.design.project)) continue
      console.log(`\n${fx.id}: ${fx.label}`)
      for (const r of runOnFixture(pkg, fx)) {
        const info = pkg.metrics.find((m) => m.id === r.metric)?.threshold?.direction === 'info'
        console.log(`  ${r.metric}${r.tower !== null ? ` [tower ${r.tower}]` : ''}  ${Number.isFinite(r.value) ? Number(r.value.toPrecision(6)) : 'not available'}  → ${info ? 'info' : r.state}`)
      }
    }
    if (tests.length) console.log(`\nTests\n  ${tests.join('\n  ')}`)
  }
  console.log(errors.length ? `\n${errors.length} problem(s) to fix.` : '\nReady to import into Tower Design Toolkit (it repeats these checks and the full schema check).')
  process.exit(errors.length || warnings.some((w) => w.startsWith('Test ')) ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
