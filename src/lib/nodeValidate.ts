// Checks a community node package before it joins the library: JSON Schema (Ajv, the schema shipped with the skill),
// then formulas, thresholds, evidence rules and the package's own tests on the sample fixtures. Every problem is
// written in plain words, so a designer can paste it back to their AI.
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import schema from '../../skills/tower-studio-node-builder/references/node-package.schema.json'
import fixturesFile from '../../skills/tower-studio-node-builder/references/fixtures.json'
import { ExprError, parse, suggest, variablesOf } from './nodeExpr'
import { VARIABLE_NAMES } from './layer0Summary'
import { isCodeMetric, runPackage, runTests, type CommunityResult, type Fixture, type NodePackage, type TestOutcome, type ThresholdDef } from './nodePackages'
import { checkCode } from './sandbox/sandbox'

export const FIXTURES = (fixturesFile as unknown as { fixtures: Fixture[] }).fixtures
export const MAX_CHARS = 200_000

export interface Problem { level: 'error' | 'warning'; where: string; message: string }
export interface Report {
  ok: boolean
  pkg?: NodePackage
  problems: Problem[]
  tests: TestOutcome[]
  preview: { fixture: Fixture; results: CommunityResult[] }[]
}

const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: true, strictTypes: false, strictRequired: false })
const validateSchema = ajv.compile(schema)

/** Read pasted text or a file's contents: tolerate a BOM and a ```json fence around the package. */
export function parsePackageText(text: string): { data?: unknown; problem?: Problem } {
  if (text.length > MAX_CHARS) return { problem: { level: 'error', where: 'The file', message: `is ${Math.round(text.length / 1000)} kB; a node package should be well under ${MAX_CHARS / 1000} kB. Is this the right file?` } }
  let t = text.replace(/^﻿/, '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t)
  if (fence) t = fence[1].trim()
  if (!t) return { problem: { level: 'error', where: 'The package', message: 'is empty. Paste the JSON your AI produced, or choose the .json file.' } }
  try {
    return { data: JSON.parse(t) }
  } catch (e) {
    const msg = (e as Error).message
    const pos = /position (\d+)/.exec(msg)
    const lc = /line (\d+) column (\d+)/.exec(msg)
    let at = lc ? ` at line ${lc[1]}, column ${lc[2]}` : ''
    if (pos && !lc) {
      const before = t.slice(0, Number(pos[1]))
      const line = before.split('\n').length, col = before.length - before.lastIndexOf('\n')
      at = ` at line ${line}, column ${col}`
    }
    return { problem: { level: 'error', where: 'The package', message: `isn't valid JSON${at}. Ask your AI to send the whole package again as one JSON block, with no comments or trailing commas.` } }
  }
}

export function validatePackageText(text: string): Report {
  const { data, problem } = parsePackageText(text)
  return problem ? { ok: false, problems: [problem], tests: [], preview: [] } : validatePackage(data)
}

export function validatePackage(data: unknown): Report {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, problems: [{ level: 'error', where: 'The package', message: 'should be one JSON object { … }, not a list or a single value.' }], tests: [], preview: [] }
  }
  const problems: Problem[] = []
  const pkg = data as NodePackage
  if (!validateSchema(data)) {
    const errors = validateSchema.errors ?? []
    problems.push(...explain(errors, data))
    // When the metrics and parameters themselves are well-formed, also report formula and threshold problems now,
    // so the designer can hand everything back to their AI in one round.
    if (!errors.some((e) => /^\/(metrics|parameters)(\/|$)/.test(e.instancePath) || (e.instancePath === '' && ['metrics', 'parameters'].includes((e.params as { missingProperty?: string }).missingProperty ?? '')))) {
      try { problems.push(...semanticProblems({ ...pkg, inputs: Array.isArray(pkg.inputs) ? pkg.inputs : [] })) } catch { /* malformed beyond what the schema reported */ }
    }
    return { ok: false, problems, tests: [], preview: [] }
  }

  problems.push(...semanticProblems(pkg))
  if (problems.some((p) => p.level === 'error')) return { ok: false, problems, tests: [], preview: [] }

  const tests = runTests(pkg, FIXTURES)
  for (const t of tests) if (!t.ok) problems.push({ level: 'warning', where: 'Test', message: t.message })
  if (!pkg.tests?.length) problems.push({ level: 'warning', where: 'Tests', message: 'none yet. Ask your AI to add a few tests on the sample fixtures, so a later change that breaks a formula shows up.' })
  const preview = FIXTURES.filter((f) => !pkg.projects || pkg.projects.includes(f.design.project)).map((fixture) => ({ fixture, results: runPackage(pkg, fixture.summary) }))
  return { ok: true, pkg, problems, tests, preview }
}

// --- Plain words for schema errors ------------------------------------------------------------------------------

const LIST_NAME: Record<string, string> = {
  metrics: 'Metric', parameters: 'Parameter', tests: 'Test', falseAssumptions: 'False assumption', inputs: 'Input', jury: 'Jury tag', projects: 'Project',
}
const HELP: Record<string, string> = {
  format: 'Set it to "tower-studio-node@1".',
  id: 'Use community.<your-handle>.<node-name>, e.g. community.rliu.daylight-depth.',
  version: 'Start with "0.1.0".',
  licence: 'MIT matches Tower Design Toolkit; CC-BY-4.0 suits text-only nodes.',
  author: 'Add { "name": "Your name" }.',
  category: 'Pick one of the 13 categories (SITE, PROG, CLIM, ENER, ECOL, PUBL, CULT, MOBI, STRC, SYST, SPAC, PRES, DATA).',
  stage: 'Pick massing, schematic or present.',
  question: 'One sentence: the design question this node answers.',
  inputs: 'List every Layer 0 value the formulas read, e.g. ["tower.height", "tower.width"].',
  method: 'Explain in plain words how the node works, including simplifications.',
  human: 'Say what stays a human judgment.',
  limits: 'Say what the node cannot tell you.',
  metrics: 'Add at least one metric.',
  threshold: 'Every metric needs one, even if it is { "flag": "unresolved", "source": { "label": "what was searched" } }.',
  source: 'Every threshold, parameter and false assumption needs a source: a document and page, or "Team assumption: who, date, why".',
  label: 'A short name or, for a source, the document title.',
  flag: 'Use verified, team_assumption, unverified or unresolved.',
  direction: 'Use higher_is_better, lower_is_better or range for a check, or "info" for a value shown on purpose with no good or bad.',
  good: 'Give the good value (or [low, high] range) only if it comes from a source or the designer. Never invent one: if this metric has no threshold on purpose, set "direction": "info" (no good or bad); if the number is not known yet, set "flag": "unresolved".',
  expression: 'The formula, e.g. "tower.height / tower.minSide".',
  per: 'Use "tower" (one result per tower) or "project" (one result for the whole design).',
  unit: 'e.g. "m", "m²", "%", "ratio" or "count".',
  default: 'The starting value.',
  claim: 'The wrong belief, in one sentence.',
  correction: 'What is true instead, with its source.',
  fixture: 'Use vtc-default, city-study or vtc-two-towers.',
  metric: 'The id of the metric this test checks.',
}
function patternHelp(path: string): string {
  if (path === '/id') return 'It must look like community.your-handle.node-name: lowercase letters, numbers and hyphens, in three parts separated by dots.'
  if (path === '/version') return 'Use three numbers like 0.1.0.'
  if (path.endsWith('/url')) return 'A link must start with https:// (or http://).'
  if (path.startsWith('/parameters/')) return 'Use letters, numbers and underscores, starting with a letter, e.g. frontage.'
  return 'Use lowercase letters, numbers and underscores, starting with a letter, e.g. plate_depth.'
}
const TYPE_WORD: Record<string, string> = { number: 'a number', integer: 'a whole number', string: 'text in quotes', array: 'a list [ … ]', object: 'an object { … }', boolean: 'true or false', null: 'null' }

function where(path: string, data: unknown): string {
  const seg = path.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  const parts: string[] = []
  let cur: any = data
  seg.forEach((s, i) => {
    const next = cur?.[s]
    if (/^\d+$/.test(s) && Array.isArray(cur)) {
      const id = next && typeof next === 'object' && typeof next.id === 'string' ? ` (“${next.id}”)` : ''
      const parent = seg[i - 1]
      if (LIST_NAME[parent]) parts[parts.length - 1] = `${LIST_NAME[parent]} ${Number(s) + 1}${id}`
      else parts.push(`item ${Number(s) + 1}`)
    } else parts.push(`“${s}”`)
    cur = next
  })
  return parts.length ? parts.join(' › ') : 'The package'
}

const show = (v: unknown) => (typeof v === 'string' ? `“${v}”` : JSON.stringify(v))

function explain(errors: ErrorObject[], data: unknown): Problem[] {
  // anyOf/if produce a summary error plus one per branch; keep the summary only.
  const anyOfPaths = errors.filter((e) => e.keyword === 'anyOf').map((e) => e.instancePath)
  const kept = errors.filter((e) => e.keyword !== 'if' && !(e.schemaPath.includes('/anyOf/') && anyOfPaths.some((p) => e.instancePath.startsWith(p))))
  const seen = new Set<string>()
  const out: Problem[] = []
  for (const e of kept) {
    const w = where(e.instancePath, data)
    const p = e.params as Record<string, any>
    let message: string
    switch (e.keyword) {
      case 'required': message = `is missing “${p.missingProperty}”. ${HELP[p.missingProperty] ?? ''}`; break
      case 'additionalProperties': {
        const allowed = Object.keys((e.parentSchema as any)?.properties ?? {})
        const s = suggest(p.additionalProperty, allowed)
        message = `has “${p.additionalProperty}”, which isn't part of the format${s ? `. Did you mean “${s}”?` : '.'} Remove it or fix the spelling (names are case-sensitive).`
        break
      }
      case 'enum': {
        const allowed = p.allowedValues as unknown[]
        if (allowed.length > 15) {
          const s = typeof e.data === 'string' ? suggest(e.data, allowed as string[]) : null
          message = `is ${show(e.data)}, which isn't a Layer 0 value Tower Design Toolkit provides${s ? `. Did you mean “${s}”?` : '.'} See the variable list in the skill.`
        } else message = `is ${show(e.data)}; it must be one of: ${allowed.join(', ')}.`
        break
      }
      case 'const': message = `must be ${show(p.allowedValue)}.`; break
      case 'pattern': message = `is ${show(e.data)}. ${patternHelp(e.instancePath)}`; break
      case 'type': message = `should be ${TYPE_WORD[p.type] ?? p.type}, not ${Array.isArray(e.data) ? 'a list' : e.data === null ? 'null' : typeof e.data === 'string' ? 'text' : typeof e.data}.`; break
      case 'minLength': message = `is too short: write at least ${p.limit} characters.`; break
      case 'maxLength': message = `is too long: keep it under ${p.limit} characters.`; break
      case 'minItems': message = `needs at least ${p.limit} item${p.limit === 1 ? '' : 's'}.`; break
      case 'maxItems': message = `has too many items (at most ${p.limit}).`; break
      case 'uniqueItems': message = `lists ${show((e.data as unknown[])[p.j])} twice.`; break
      case 'minimum': case 'maximum': case 'exclusiveMinimum': message = `is ${show(e.data)}; it must be ${e.keyword === 'minimum' ? 'at least' : e.keyword === 'maximum' ? 'at most' : 'more than'} ${p.limit}.`; break
      case 'anyOf':
        message = e.schemaPath.startsWith('#/$defs/test/') ? 'needs an expected “value”, an expected “state”, or both.' : 'must be a number, or two numbers in a list like [10, 20].'
        break
      default: message = e.message ?? 'is not valid.'
    }
    const line = `${w} ${message}`.trim()
    if (!seen.has(line)) { seen.add(line); out.push({ level: 'error', where: w, message: message.trim() }) }
  }
  return out
}

// --- Formulas, thresholds and evidence ---------------------------------------------------------------------------

function semanticProblems(pkg: NodePackage): Problem[] {
  const out: Problem[] = []
  const err = (w: string, message: string) => out.push({ level: 'error', where: w, message })
  const warn = (w: string, message: string) => out.push({ level: 'warning', where: w, message })
  const mName = (i: number) => `Metric ${i + 1} (“${pkg.metrics[i].id}”)`

  const dup = (ids: string[], what: string) => ids.forEach((id, i) => { if (ids.indexOf(id) !== i) err(what, `use the id “${id}” twice. Each needs its own id.`) })
  dup(pkg.metrics.map((m) => m.id), 'Two metrics')
  dup((pkg.parameters ?? []).map((p) => p.id), 'Two parameters')

  const params = new Set((pkg.parameters ?? []).map((p) => p.id))
  const used = new Set<string>()
  pkg.metrics.forEach((m, i) => {
    if (isCodeMetric(m)) {
      if (!pkg.code) err(`${mName(i)} › formula`, 'is "code", but the package has no "code" section. Write a formula, or add the code that computes it.')
      checkThreshold(m.threshold, `${mName(i)} › threshold`, err)
      return
    }
    let ast
    try { ast = parse(m.expression) } catch (e) {
      if (!(e instanceof ExprError)) throw e
      err(`${mName(i)} › formula`, `${e.message}, at character ${e.at + 1}: “${m.expression.slice(Math.max(0, e.at - 10), e.at + 10)}”.`)
      return
    }
    for (const v of variablesOf(ast)) {
      if (v.startsWith('params.')) {
        if (!params.has(v.slice(7))) err(`${mName(i)} › formula`, `uses “${v}”, but no parameter has the id “${v.slice(7)}”. Add it to "parameters" or fix the name.`)
        continue
      }
      if (!VARIABLE_NAMES.includes(v)) {
        const s = suggest(v, VARIABLE_NAMES)
        err(`${mName(i)} › formula`, `uses “${v}”, which Tower Design Toolkit doesn't provide${s ? `. Did you mean “${s}”?` : '.'} Formulas can read the Layer 0 values in the skill's list, params.<id> and PI.`)
        continue
      }
      if (m.per === 'project' && v.startsWith('tower.')) err(`${mName(i)} › formula`, `is per project but reads “${v}”. Set "per": "tower", or use a project.* value.`)
      used.add(v)
    }
    checkThreshold(m.threshold, `${mName(i)} › threshold`, err)
  })
  for (const v of used) if (!pkg.inputs.includes(v)) warn('Inputs', `don't list “${v}”, which a formula reads. Add it, so reviewers see everything the node reads.`)
  const codeMetrics = pkg.metrics.filter(isCodeMetric).length
  if (!codeMetrics) for (const v of pkg.inputs) if (!used.has(v) && VARIABLE_NAMES.includes(v)) warn('Inputs', `list “${v}”, but no formula reads it.`)
  if (pkg.code) {
    for (const m of checkCode(pkg.code.source)) err('Code', m)
    if (!codeMetrics) warn('Code', 'is included, but no metric uses it (set a metric’s expression to "code"). Remove the code if formulas are enough.')
    else warn('Code', `This node runs its own code for ${codeMetrics} metric${codeMetrics > 1 ? 's' : ''}. It runs only in a sandbox (no network, no storage, no access to the page, stopped after 1.5 s), and only after you choose “Allow this node to run code”. Read the code first.`)
  }

  ;(pkg.parameters ?? []).forEach((p, i) => {
    const w = `Parameter ${i + 1} (“${p.id}”)`
    if (p.min !== undefined && p.max !== undefined && p.min > p.max) err(w, `has min ${p.min} above max ${p.max}.`)
    if ((p.min !== undefined && p.default < p.min) || (p.max !== undefined && p.default > p.max)) err(w, `has a default (${p.default}) outside its min–max range.`)
    if (p.flag === 'verified' && !p.source.page && !p.source.url) err(w, 'is flagged verified, but its source has no page, clause or link. Add source.page or source.url so a reviewer can find it, or flag it unverified.')
  })
  return out
}

function checkThreshold(th: ThresholdDef, w: string, err: (w: string, m: string) => void) {
  if (th.direction === 'info') {
    if (th.good !== undefined || th.bad !== undefined) err(w, 'is information only ("direction": "info"), so it takes no good or bad. Remove them, or choose a direction that judges the value.')
    else if (th.flag === 'verified' && !th.source.page && !th.source.url) err(w, 'is flagged verified, but its source has no page, clause or link. Add source.page or source.url so a reviewer can find it, or flag it unverified.')
    return
  }
  if (th.flag === 'unresolved') {
    if (th.good !== undefined || th.bad !== undefined) err(w, 'is unresolved but has numbers. An unresolved threshold has no sourced value yet: remove good and bad, or give the numbers their own flag and source.')
    return
  }
  if (th.flag === 'verified' && !th.source.page && !th.source.url) err(w, 'is flagged verified, but its source has no page, clause or link. Add source.page or source.url so a reviewer can find it, or flag it unverified.')
  const isPair = (x: unknown): x is [number, number] => Array.isArray(x)
  if (th.direction === 'range') {
    if (!isPair(th.good) || (th.bad !== undefined && !isPair(th.bad))) { err(w, 'is a range, so good (and bad, if given) must be [low, high] lists, e.g. "good": [18, 24].'); return }
    if (th.good[0] > th.good[1]) err(w, `has good [${th.good}] with the low value first? Write it as [${th.good[1]}, ${th.good[0]}].`)
    if (isPair(th.bad) && (th.bad[0] > th.good[0] || th.bad[1] < th.good[1])) err(w, `has a bad range [${th.bad}] that doesn't enclose the good range [${th.good}]. Bad is the outer limit: outside it fails, between the two is "Check".`)
    return
  }
  if (isPair(th.good) || isPair(th.bad)) { err(w, 'uses a [low, high] list, but only a range threshold takes lists. Use one number for good and bad, or set "direction": "range".'); return }
  if (th.bad !== undefined) {
    if (th.direction === 'higher_is_better' && th.bad > th.good!) err(w, `says higher is better, but bad (${th.bad}) is above good (${th.good}). Swap them or change the direction.`)
    if (th.direction === 'lower_is_better' && th.bad < th.good!) err(w, `says lower is better, but bad (${th.bad}) is below good (${th.good}). Swap them or change the direction.`)
  }
}
