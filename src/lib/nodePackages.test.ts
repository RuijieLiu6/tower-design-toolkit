import { readFileSync, writeFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../data/registry'
import schema from '../../skills/tower-studio-node-builder/references/node-package.schema.json'
import example from '../../skills/tower-studio-node-builder/references/example-node.json'
import { ExprError, evaluate, parse, variablesOf } from './nodeExpr'
import { layer0Summary, VARIABLE_NAMES, type Layer0Input, type Layer0Summary } from './layer0Summary'
import { runPackage, summarize, type NodePackage } from './nodePackages'
import { FIXTURES, validatePackage, validatePackageText } from './nodeValidate'
import { SKILL_FILES, promptText, skillZip } from './skillFiles'

const SKILL = new URL('../../skills/tower-studio-node-builder/', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, SKILL), 'utf8')
const UPDATE = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.UPDATE_SKILL_FIXTURES
const calc = (src: string, vars: Record<string, number | null> = {}) => evaluate(parse(src), vars)
const clone = (): any => JSON.parse(JSON.stringify(example))
const messages = (data: unknown) => validatePackage(data).problems.map((p) => `${p.where} ${p.message}`).join('\n')

describe('formula language (no eval)', () => {
  it('follows the usual precedence', () => {
    expect(calc('1 + 2 * 3')).toBe(7)
    expect(calc('(1 + 2) * 3')).toBe(9)
    expect(calc('-2 ^ 2')).toBe(-4)
    expect(calc('2 ^ 3 ^ 2')).toBe(512)
    expect(calc('10 % 4 - 1')).toBe(1)
    expect(calc('2 * -3')).toBe(-6)
  })
  it('has comparisons, logic and a conditional that return numbers', () => {
    expect(calc('3 > 2 && 1 < 0')).toBe(0)
    expect(calc('3 >= 3 || 0')).toBe(1)
    expect(calc('!0 + !5')).toBe(1)
    expect(calc('x > 5 ? 1 : x > 2 ? 2 : 3', { x: 4 })).toBe(2)
    expect(calc('1 == 1 != 0')).toBe(1)
  })
  it('has a small set of functions and PI', () => {
    expect(calc('max(1, 4, 2) + min(3, 5)')).toBe(7)
    expect(calc('round(3.14159, 2)')).toBe(3.14)
    expect(calc('clamp(15, 0, 10)')).toBe(10)
    expect(calc('if(0, 2, 3)')).toBe(3)
    expect(calc('deg(PI)')).toBeCloseTo(180)
    expect(calc('sqrt(tower.plateArea)', { 'tower.plateArea': 2116 })).toBe(46)
    expect(calc('finite(project.siteArea)', { 'project.siteArea': null })).toBe(0)
    expect(calc('NA')).toBeNaN()
    expect(calc('x > 0 ? 5 : NA', { x: 1 })).toBe(5)
    expect([...variablesOf(parse('x > 0 ? PI : NA'))]).toEqual(['x'])
  })
  it('turns missing inputs into NaN, never a guess', () => {
    expect(calc('tower.height / project.siteArea', { 'tower.height': 285, 'project.siteArea': null })).toBeNaN()
    expect(calc('unknown.value + 1')).toBeNaN()
    expect(Number.isFinite(calc('1 / 0'))).toBe(false)
  })
  it('cannot reach JavaScript objects or globals', () => {
    for (const src of ['constructor', 'toString', '__proto__', 'tower.constructor', 'globalThis', 'window']) expect(calc(src)).toBeNaN()
    expect(() => parse('alert("x")')).toThrow(ExprError)
    expect(() => parse('tower["height"]')).toThrow(/can't be used/)
    expect(() => parse('a = 1')).toThrow(/can't be used/)
  })
  it('explains broken formulas in plain words', () => {
    expect(() => parse('sqr(4)')).toThrow(/Did you mean “sqrt”/)
    expect(() => parse('1 +')).toThrow(/ended early/)
    expect(() => parse('round(1, 2, 3)')).toThrow(/takes 1 or 2 values, not 3/)
    expect(() => parse('max + 1')).toThrow(/is a function/)
    expect(() => parse('(1 + 2')).toThrow(/Expected “\)”/)
    expect(() => parse('1 2')).toThrow(/after the end/)
    expect(() => parse('x'.repeat(501))).toThrow(/limit is 500/)
    expect(() => parse('('.repeat(60) + '1' + ')'.repeat(60))).toThrow(/nested too deeply/)
  })
  it('lists the variables a formula reads', () => {
    expect([...variablesOf(parse('tower.height / max(tower.width, params.frontage) * PI'))].sort()).toEqual(['params.frontage', 'tower.height', 'tower.width'])
  })
})

describe('package validation', () => {
  it('accepts the worked example, with its tests passing on every fixture', () => {
    const r = validatePackage(example)
    expect(r.problems.filter((p) => p.level === 'error')).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.tests.length).toBe(7)
    expect(r.tests.every((t) => t.ok)).toBe(true)
    expect(r.preview.map((p) => p.fixture.id)).toEqual(['vtc-default', 'city-study', 'vtc-two-towers'])
  })
  it('names missing fields and says what to write', () => {
    const p = clone(); delete p.human
    expect(messages(p)).toMatch(/missing “human”. Say what stays a human judgment/)
  })
  it('explains a wrong id, an unknown field and a typo in inputs', () => {
    const p = clone()
    p.id = 'My Node'
    p.metrics[0].threshhold = p.metrics[0].threshold
    p.inputs[0] = 'tower.heigth'
    const m = messages(p)
    expect(m).toMatch(/“id” is “My Node”. It must look like community.your-handle.node-name/)
    expect(m).toMatch(/Metric 1 \(“plan_dimension”\) has “threshhold”, which isn't part of the format. Did you mean “threshold”\?/)
    expect(m).toMatch(/Input 1 is “tower.heigth”, which isn't a Layer 0 value Tower Design Toolkit provides. Did you mean “tower.height”\?/)
  })
  it('requires a source and flag on every threshold, and numbers unless unresolved', () => {
    const p = clone(); delete p.metrics[1].threshold.source; delete p.metrics[2].threshold.good
    const m = messages(p)
    expect(m).toMatch(/Metric 2 \(“height_to_width”\) › “threshold” is missing “source”/)
    expect(m).toMatch(/Metric 3 \(“frontage_share”\) › “threshold” is missing “good”/)
  })
  it('rejects a false assumption used as a threshold flag', () => {
    const p = clone(); p.metrics[0].threshold.flag = 'false_assumption'
    expect(messages(p)).toMatch(/“flag” is “false_assumption”; it must be one of: verified, team_assumption, unverified, unresolved/)
  })
  it('checks formulas against the Layer 0 list and the node parameters', () => {
    const p = clone()
    p.metrics[0].expression = 'tower.maxSdie'
    p.metrics[2].expression = 'tower.maxSide / params.frontge'
    p.metrics[3].per = 'project'
    const m = messages(p)
    expect(m).toMatch(/uses “tower.maxSdie”, which Tower Design Toolkit doesn't provide. Did you mean “tower.maxSide”\?/)
    expect(m).toMatch(/uses “params.frontge”, but no parameter has the id “frontge”/)
    expect(m).toMatch(/is per project but reads “tower.plateArea”/)
  })
  it('reports formula and threshold problems together with top-level ones, so one round with the AI fixes all', () => {
    const p = clone()
    delete p.limits
    p.metrics[0].expression = 'tower.maxSdie'
    p.metrics[0].threshold.bad = 20
    const m = messages(p)
    expect(m).toMatch(/missing “limits”/)
    expect(m).toMatch(/Did you mean “tower.maxSide”/)
    expect(m).toMatch(/lower is better, but bad \(20\) is below good \(29\)/)
    const q = clone(); delete q.metrics[0].threshold.source; q.metrics[1].expression = 'tower.heigth'
    expect(messages(q)).not.toMatch(/tower.heigth/) // a malformed metric list is fixed first
  })
  it('points at the character where a formula breaks', () => {
    const p = clone(); p.metrics[1].expression = 'tower.height / (tower.maxSide'
    expect(messages(p)).toMatch(/Metric 2 \(“height_to_width”\) › formula Expected “\)” but the formula ended, at character 30/)
  })
  it('checks threshold logic and evidence rules', () => {
    const p = clone()
    p.metrics[0].threshold.bad = 20
    p.metrics[1].threshold.source = { label: 'Some guide' }
    p.metrics[1].threshold.flag = 'verified'
    p.metrics[3].threshold.good = 2000
    const m = messages(p)
    expect(m).toMatch(/lower is better, but bad \(20\) is below good \(29\)/)
    expect(m).toMatch(/flagged verified, but its source has no page, clause or link/)
    expect(m).toMatch(/is unresolved but has numbers/)
    const q = clone(); q.metrics[0].threshold = { direction: 'range', good: 20, flag: 'team_assumption', source: { label: 'Team assumption: RL, 22 Oct 2026' } }
    expect(messages(q)).toMatch(/is a range, so good \(and bad, if given\) must be \[low, high\] lists/)
  })
  it('keeps going when the package has warnings: unlisted inputs and failing tests', () => {
    const p = clone()
    p.inputs = ['tower.maxSide', 'tower.height', 'tower.plateArea', 'tower.gfa']
    p.tests[0].value = 45
    const r = validatePackage(p)
    expect(r.ok).toBe(true)
    expect(r.problems.map((x) => x.message).join('\n')).toMatch(/list “tower.gfa”, but no formula reads it/)
    expect(r.problems.map((x) => x.message).join('\n')).toMatch(/“plan_dimension” on vtc-default, tower 0: expected 45, Tower Design Toolkit computes 46/)
  })
  it('reads pasted text with a code fence, and explains broken JSON with its line', () => {
    expect(validatePackageText('Here it is:\n```json\n' + JSON.stringify(example) + '\n```').ok).toBe(true)
    const r = validatePackageText('{\n  "format": "tower-studio-node@1",\n  "id": "community.a.b",\n}')
    expect(r.ok).toBe(false)
    expect(r.problems[0].message).toMatch(/isn't valid JSON( at line \d+, column \d+)?\. Ask your AI/)
    expect(validatePackageText('[]').problems[0].message).toMatch(/one JSON object/)
    expect(validatePackageText('x'.repeat(200_001)).problems[0].message).toMatch(/well under 200 kB/)
  })
})

describe('a package ChatGPT wrote from the paste-in prompt (end-to-end test, 22 Oct 2026)', () => {
  const chatgpt = () => JSON.parse(readFileSync(new URL('./testdata/chatgpt-office-daylight-depth.v1.json', import.meta.url), 'utf8'))
  it('as written: the information-only metric is refused with advice that never asks for an invented number', () => {
    const m = messages(chatgpt())
    expect(m).toMatch(/Metric 2 \(“estimated_square_core_side”\) › “threshold” is missing “direction”.*"info"/)
    expect(m).not.toMatch(/missing “good”/) // info is a valid choice, so only the direction is asked for
  })
  it('with "direction": "info" it imports, its own tests pass, and the info metric shows as Info', () => {
    const p = chatgpt()
    p.metrics[1].threshold.direction = 'info'
    const r = validatePackage(p)
    expect(r.problems.filter((x) => x.level === 'error')).toEqual([])
    expect(r.tests.every((t) => t.ok)).toBe(true)
    expect(r.problems.map((x) => x.message).join('\n')).toMatch(/list “tower.gfa_office”, but no formula reads it/)
    const vtc = r.preview.find((x) => x.fixture.id === 'vtc-default')!.results
    expect(vtc.map((x) => [x.metricId, x.value, x.state, x.info])).toEqual([
      ['short_side_facade_to_core_depth', '9.99 m', 'pass', false],
      ['estimated_square_core_side', '26.02 m', 'unknown', true],
    ])
    expect(summarize(vtc)).toEqual({ text: '1 pass · 1 info', tone: 'ok' })
  })
  it('NA lets the node skip towers without office space, as the designer asked', () => {
    const p = chatgpt()
    p.metrics[1].threshold.direction = 'info'
    p.metrics[0].expression = 'tower.gfa_office > 0 ? (tower.minSide - sqrt(tower.coreArea)) / 2 : NA'
    const two = validatePackage(p).preview.find((x) => x.fixture.id === 'vtc-two-towers')!.results.filter((x) => x.metricId === 'short_side_facade_to_core_depth')
    expect(two.map((x) => [x.towerName, x.value, x.state])).toEqual([['Slender residential', 'not available', 'unknown'], ['Office tower', '9.61 m', 'pass']])
  })
  it('refuses numbers on an info metric', () => {
    const p = chatgpt()
    p.metrics[1].threshold = { ...p.metrics[1].threshold, direction: 'info', good: 20 }
    expect(messages(p)).toMatch(/information only \("direction": "info"\), so it takes no good or bad/)
  })
})

describe('running a community node', () => {
  const vtc = FIXTURES.find((f) => f.id === 'vtc-default')!
  it('judges each metric against its own threshold and keeps evidence flags', () => {
    const r = runPackage(example as NodePackage, vtc.summary)
    expect(r.map((x) => [x.metricId, x.state])).toEqual([['plan_dimension', 'warn'], ['height_to_width', 'pass'], ['frontage_share', 'pass'], ['plate_area', 'unknown']])
    expect(r[0].value).toBe('46.0 m')
    expect(r[0].threshold).toBe('at most 29.0 m, or clear volumetric articulation')
    // A community node can't show green until reviewed: the author's "verified" displays as unverified.
    expect(r[0].claimed).toBe('verified')
    expect(r[0].flag).toBe('unverified')
    expect(r[0].note).toMatch(/not yet reviewed/)
    expect(r[3].flag).toBe('unresolved')
    expect(summarize(r)).toEqual({ text: '1 check · 2 pass · 1 no threshold', tone: 'warn' })
  })
  it('uses edited parameters', () => {
    const r = runPackage(example as NodePackage, vtc.summary, { frontage: 70 })
    expect(r.find((x) => x.metricId === 'frontage_share')!.state).toBe('warn')
  })
  it('says "not available" instead of guessing when the project lacks an input', () => {
    const p = clone() as NodePackage
    p.metrics = [{ id: 'fsr', label: 'FSR', unit: 'ratio', per: 'project', expression: 'project.gfa / project.siteArea', threshold: { direction: 'higher_is_better', good: 9, bad: 9, flag: 'team_assumption', source: { label: 'Team assumption: test' } } }]
    const city = FIXTURES.find((f) => f.id === 'city-study')!
    const r = runPackage(p, city.summary)
    expect(r[0].value).toBe('not available')
    expect(r[0].state).toBe('unknown')
    expect(r[0].note).toMatch(/Can't compute here/)
    expect(runPackage(p, vtc.summary)[0].value).toBe('13.9')
    expect(runPackage(p, vtc.summary)[0].state).toBe('pass')
  })
  it('handles range thresholds', () => {
    const withFormula = (expression: string) => {
      const p = clone() as NodePackage
      p.metrics = [{ id: 'h', label: 'Height', unit: 'm', per: 'tower', expression, threshold: { direction: 'range', good: [244, 305], bad: [200, 320], flag: 'team_assumption', source: { label: 'Team assumption: test' } } }]
      return p
    }
    const two = FIXTURES.find((f) => f.id === 'vtc-two-towers')!
    expect(runPackage(withFormula('tower.height'), vtc.summary)[0].state).toBe('pass')
    expect(runPackage(withFormula('tower.height'), two.summary).map((x) => x.state)).toEqual(['pass', 'pass'])
    expect(runPackage(withFormula('tower.height - 60'), vtc.summary)[0].state).toBe('warn')
    expect(runPackage(withFormula('tower.height + 60'), vtc.summary)[0].state).toBe('fail')
  })
})

describe('the skill stays in step with the app', () => {
  it('lists exactly the Layer 0 names and categories the app provides', () => {
    expect(schema.properties.inputs.items.enum).toEqual(VARIABLE_NAMES)
    expect(schema.properties.category.enum).toEqual(Object.keys(CATEGORIES))
  })
  it('documents every Layer 0 name in the contract and the paste-in prompt', () => {
    const contract = read('references/node-package-contract.md'), prompt = read('PROMPT.md')
    for (const v of VARIABLE_NAMES) {
      expect(contract, v).toContain(`\`${v}\``)
      expect(prompt, v).toContain(v)
    }
  })
  it('has Agent Skills frontmatter that matches its folder', () => {
    const md = read('SKILL.md')
    const fm = /^---\n([\s\S]*?)\n---/.exec(md.replace(/\r/g, ''))![1]
    expect(fm).toMatch(/^name: tower-studio-node-builder$/m)
    const desc = /^description: (.+)$/m.exec(fm)![1]
    expect(desc.length).toBeGreaterThan(100)
    expect(desc.length).toBeLessThanOrEqual(1024)
  })
  it('ships fixtures whose values match the app (UPDATE_SKILL_FIXTURES=1 regenerates them)', () => {
    const file = JSON.parse(read('references/fixtures.json')) as { fixtures: { id: string; design: Layer0Input; summary: Layer0Summary }[] }
    const fresh = file.fixtures.map((f) => ({ ...f, summary: rounded(layer0Summary(f.design)) }))
    const block = fixtureTable(fresh)
    if (UPDATE) {
      writeFileSync(new URL('references/fixtures.json', SKILL), JSON.stringify({ ...file, fixtures: fresh }, null, 2) + '\n')
      const prompt = read('PROMPT.md')
      writeFileSync(new URL('PROMPT.md', SKILL), prompt.replace(/<!-- fixtures:start -->[\s\S]*<!-- fixtures:end -->/, `<!-- fixtures:start -->\n${block}\n<!-- fixtures:end -->`))
    }
    expect(file.fixtures.map((f) => f.summary)).toEqual(fresh.map((f) => f.summary))
    expect(read('PROMPT.md').replace(/\r/g, '')).toContain(block)
  })
  it('has a valid example inside the paste-in prompt (assistants copy it)', () => {
    const block = /```json\n([\s\S]*?)\n```/.exec(read('PROMPT.md').replace(/\r/g, ''))![1]
    const r = validatePackageText(block)
    expect(r.problems.filter((p) => p.level === 'error')).toEqual([])
    expect(r.tests.every((t) => t.ok)).toBe(true)
  })
  it('hands out the whole skill folder as a zip, and the prompt without HTML comments', () => {
    const files = unzipSync(skillZip())
    const names = Object.keys(files).sort()
    expect(names).toEqual(SKILL_FILES.map((f) => `tower-studio-node-builder/${f.path}`).sort())
    for (const f of ['SKILL.md', 'PROMPT.md', 'references/node-package.schema.json', 'references/example-node.json', 'references/fixtures.json', 'references/evidence-flags.md', 'references/upload-steps.md', 'references/node-package-contract.md', 'scripts/check_node.mjs']) {
      expect(names, f).toContain(`tower-studio-node-builder/${f}`)
    }
    expect(strFromU8(files['tower-studio-node-builder/SKILL.md'])).toBe(read('SKILL.md'))
    const prompt = promptText('wind comfort')
    expect(prompt.startsWith('# You are the Tower Design Toolkit node builder')).toBe(true)
    expect(prompt).not.toContain('<!--')
    expect(prompt).toContain('| tower.height | 285 | 120 | 262 / 250 |')
    expect(prompt).toMatch(/searched Tower Design Toolkit's node library for “wind comfort”/)
  })
  it('ships a checker script that computes exactly what the app computes', async () => {
    const script = await import(/* @vite-ignore */ new URL('scripts/check_node.mjs', SKILL).href)
    for (const fx of FIXTURES) {
      const app = runPackage(example as NodePackage, fx.summary)
      const theirs = script.runOnFixture(example, fx) as { metric: string; value: number; state: string }[]
      expect(theirs.map((r) => [r.metric, r.value, r.state])).toEqual(app.map((r) => [r.metricId, r.raw, r.state]))
    }
    const check = script.checkPackage(example, FIXTURES, VARIABLE_NAMES) as { errors: string[]; warnings: string[]; tests: string[] }
    expect(check.errors).toEqual([])
    expect(check.warnings).toEqual([])
    expect(check.tests.length).toBe(7)
    const broken = clone(); broken.metrics[0].expression = 'tower.maxSdie'
    expect(script.checkPackage(broken, FIXTURES, VARIABLE_NAMES).errors.join()).toMatch(/Did you mean “tower.maxSide”/)
    for (const src of ['1 + 2 * 3', '-2 ^ 2', 'x > 5 ? 1 : x > 2 ? 2 : 3', 'round(3.14159, 2)', 'clamp(15, 0, 10)', 'finite(y)']) {
      expect(script.evaluate(script.parse(src), { x: 4, y: null })).toBe(calc(src, { x: 4, y: null }))
    }
  })
})

function rounded(s: Layer0Summary): Layer0Summary {
  const r = (v: Record<string, number | null>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null ? null : Number(x.toFixed(4))]))
  return { project: r(s.project), sun: r(s.sun), towers: s.towers.map((t) => ({ ...t, values: r(t.values) })) }
}

/** The fixture table in PROMPT.md, for assistants that can't open fixtures.json. */
function fixtureTable(fixtures: { id: string; summary: Layer0Summary }[]): string {
  const f = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${Number(v.toFixed(3))}`)
  const head = `| Value | ${fixtures.map((x) => `${x.id}${x.summary.towers.length > 1 ? ` (tower 0 / 1)` : ''}`).join(' | ')} |`
  const rows = VARIABLE_NAMES.map((name) => {
    const [scope, key] = name.split('.')
    const cells = fixtures.map((x) => scope === 'tower'
      ? x.summary.towers.map((t) => f(t.values[key])).join(' / ')
      : f((scope === 'project' ? x.summary.project : x.summary.sun)[key]))
    return `| ${name} | ${cells.join(' | ')} |`
  })
  return [head, `|---|${fixtures.map(() => '---').join('|')}|`, ...rows].join('\n')
}
