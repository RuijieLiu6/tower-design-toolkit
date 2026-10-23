// Runs every evaluation case and writes a dated report (backlog item 28).
//   node tools/run_eval.mjs        (or: npm run eval)
// 1. Engine level: vitest on src/eval/cases.test.ts (all cases, deterministic).
// 2. UI level: Playwright e2e/eval.e2e.ts (cases 3, 5, 7 through the app, plus a screenshot and the flags shown on
//    each case's node panel).
// 3. Report: 04 Tool Plan/evaluation/<date>/report.md + shots/, and public/eval/last-run.json for the Status page.
// A failing case is written into the report and makes the command exit 1; nothing is hidden.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const now = new Date()
const date = now.toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })
const time = now.toLocaleTimeString('en-GB', { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit' })
const out = resolve(root, '..', '04 Tool Plan', 'evaluation', date)
mkdirSync(join(out, 'shots'), { recursive: true })
writeFileSync(join(out, 'ui.json'), '{}')
writeFileSync(join(out, 'engine.json'), '[]')
const env = { ...process.env, EVAL_OUT: out }

console.log(`Evaluation run ${date} ${time} → ${out}`)
const engine = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/eval/cases.test.ts'], { cwd: root, env, stdio: 'inherit' })
const ui = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'test', 'e2e/eval.e2e.ts'], { cwd: root, env, stdio: 'inherit' })

const read = (f, d) => { try { return JSON.parse(readFileSync(join(out, f), 'utf8')) } catch { return d } }
const results = read('engine.json', [])
const uiRes = read('ui.json', {})
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const rows = results.map((r) => {
  const u = uiRes[r.id]
  const uiPass = u && typeof u.pass === 'boolean' ? u.pass : null
  const pass = r.pass && uiPass !== false
  return { ...r, uiObserved: u?.observed ?? null, uiPass, screenshot: u?.screenshot ?? null, flagsShown: u?.flags ?? [], pass }
})
const failed = rows.filter((r) => !r.pass)
const engineCrash = engine.status !== 0 && !results.length
const uiCrash = ui.status !== 0 && !Object.keys(uiRes).length

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const md = [
  `# Evaluation cases: ${date}`,
  '',
  `Run ${date} ${time} (Vancouver) with \`npm run eval\` · Tower Design Toolkit ${pkg.version} · engine cases: vitest; UI cases: Playwright ${pkg.devDependencies?.['@playwright/test'] ?? ''} in Chrome Headless Shell.`,
  '',
  `**${rows.length - failed.length} of ${rows.length} cases pass.**${failed.length ? ` Failing: ${failed.map((f) => f.id).join(', ')}.` : ''}${engineCrash ? ' The engine run crashed before writing results.' : ''}${uiCrash ? ' The UI run crashed before writing results.' : ''}`,
  '',
  'Course types: typical, boundary, out of scope (must stop), repeated, definition anchor. Expectations come from a source (research, by-law, City sheet) or, where labelled *team reasoning*, from the team. Cases 1-7: `04 Tool Plan/mid-review/FIRST_ATTEMPT_SPEC.md`. The deterministic engines run with no model in the loop.',
  '',
  '| Case | Type | Node | Input | Expected | Observed (engine) | Observed (UI) | Result | Evidence | Basis |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| **${r.id}** ${esc(r.title)} | ${r.type} | \`${r.node}\` | ${esc(r.input)} | ${esc(r.expected)} | ${esc(r.observed)}${r.error ? ` (error: ${esc(r.error)})` : ''} | ${r.uiObserved ? esc(r.uiObserved) : r.uiPass === null ? '–' : ''} | ${r.pass ? '✅ pass' : '❌ **fail**'} | ${r.screenshot ? `[screenshot](${r.screenshot})` : 'no screenshot'}${r.flagsShown.length ? `; flags shown: ${r.flagsShown.join(', ')}` : ''}${r.flag ? `; result flag: ${r.flag}` : ''} | ${esc(r.basis)} (${r.basisFlag === 'team_assumption' ? 'team reasoning' : r.basisFlag}) |`),
  '',
  '## Notes',
  '',
  '- UI cases 3, 5 and 7 set the tower position and height through the app\'s own store, then read the result panel as a user sees it. The other cases\' screenshots show their node panel on the default design with the evidence flags shown there.',
  '- A failing case stays in this table and makes `npm run eval` exit with an error.',
  '',
].join('\n')
writeFileSync(join(out, 'report.md'), md)

const summary = { date, time, total: rows.length, passed: rows.length - failed.length, failed: failed.map((f) => f.id), report: `04 Tool Plan/evaluation/${date}/report.md`, cases: rows.map((r) => ({ id: r.id, type: r.type, node: r.node, title: r.title, pass: r.pass, observed: r.observed })) }
mkdirSync(join(root, 'public', 'eval'), { recursive: true })
writeFileSync(join(root, 'public', 'eval', 'last-run.json'), JSON.stringify(summary, null, 1))
console.log(`\n${summary.passed} of ${summary.total} cases pass. Report: ${join(out, 'report.md')}`)
if (failed.length || engineCrash || uiCrash || !existsSync(join(out, 'report.md'))) process.exit(1)
