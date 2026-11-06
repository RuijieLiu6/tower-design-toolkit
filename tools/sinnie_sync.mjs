// Sinnie sync (Ruijie, 6 Nov 2026: "when I work here you will consistently check on her github push … and automatically
// adapt the changes she made on the smaller tool … match the changes in the main tool").
//
//   node tools/sinnie_sync.mjs                 report Sinnie's commits not matched yet, with the Toolkit files each touches
//   node tools/sinnie_sync.mjs --json          the same as JSON
//   node tools/sinnie_sync.mjs --mark <repo> <sha>   record that the Toolkit now matches <repo> up to <sha>
//
// It fetches her repositories in their local clones (read-only: it never checks out, commits or pushes there) and compares
// origin/main with the last commit the Toolkit matched (tools/sinnie-sync.json). The recurring "Sinnie sync" scheduled task
// runs it and ports what it finds; the mapping and the rules (what may be ported) are in 04 Tool Plan/SINNIE_SYNC.md.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const STATE = join(here, 'sinnie-sync.json')
const COURSE = resolve(here, '..', '..')

/** Her files → the Toolkit's counterparts (first match wins). `port` = may be ported with her permission; `match` = match the behaviour in our own code; `check` = keep compatible; `note` = report only. */
const MAP = {
  dtmass: [
    [/^src\/gen\.js$/, 'port', 'src/engine/dtmassGen.ts (re-record tools/dtmass-fixtures.cjs, run src/engine/dtmassGen.test.ts)'],
    [/^src\/(views|form|model|stack)\.js$/, 'port', 'Massing tool and in-view block editing (src/components/generate/, src/components/DesignPanel.tsx MassingTool)'],
    [/^src\/brief\.js$/, 'port', 'Generate brief inputs (src/lib/generateStore.ts startingBrief, GenerateTool)'],
    [/^src\/(codes|rules|links|checks)\.js$/, 'note', 'her rule packs are not ported: check whether a Toolkit node\'s threshold or source should follow'],
    [/^src\/(site|map|city-data|osm-data|comp-site)\.js$/, 'match', 'Site step (src/components/site/, src/lib/siteActions.ts)'],
    [/^src\/(daylight|daydiag|sun)\.js$/, 'match', 'Daylight and sun nodes (src/engine/daylight*.ts, src/engine/solar*.ts)'],
    [/^src\/(plans|plan-res|plan-comm|plan-park)\.js$/, 'match', 'Schematic plans (src/engine/plan.ts, src/components/PlanDrawing.tsx)'],
    [/^src\/(report|compare|dxf|zip)\.js$/, 'note', 'Present / Options counterparts (report only)'],
    [/./, 'note', 'no direct counterpart'],
  ],
  'sun-wind-studio': [
    [/^(io|link)\.js$|^index\.html$/, 'check', 'Send to Sun & Wind Studio stays readable by her importer (src/lib/interchange/sunWind.ts; run e2e/sun-wind-link.e2e.ts)'],
    [/^toolkit\.js$/, 'check', 'our receiver on her branch ruijie/tower-toolkit-link: keep it working on her new main'],
    [/^rhino\//, 'match', 'Rhino link features (public/rhino/tdt_link.py, src/lib/interchange/rhinoLink.ts); no code copied'],
    [/^(physics|climate|weather\.json)/, 'match', 'Sun and wind climate (src/engine/solar*.ts, src/engine/windScreen*.ts, src/data/windRoseYVR.json)'],
    [/^energy\.js$/, 'match', 'Energy & carbon node (src/engine/energyCarbon.ts)'],
    [/^(study|core|parts|program|viz|rain)\.js$/, 'match', 'her analysis views: match what the Toolkit\'s nodes show (solar, wind screen, daylight, energy)'],
    [/^report\.js$/, 'note', 'report only'],
    [/./, 'note', 'no direct counterpart'],
  ],
}

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const state = () => JSON.parse(readFileSync(STATE, 'utf8'))

if (process.argv[2] === '--mark') {
  const [repo, sha] = process.argv.slice(3)
  const s = state()
  if (!s.repos[repo] || !/^[0-9a-f]{7,40}$/.test(sha ?? '')) { console.error('usage: --mark <repo> <sha>'); process.exit(2) }
  const clone = join(COURSE, s.repos[repo].clone)
  s.repos[repo].synced = git(clone, ['rev-parse', sha])
  s.repos[repo].syncedAt = new Date().toISOString()
  writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n')
  console.log(`${repo} matched up to ${s.repos[repo].synced.slice(0, 7)}`)
  process.exit(0)
}

const s = state()
const report = []
for (const [repo, r] of Object.entries(s.repos)) {
  const clone = join(COURSE, r.clone)
  if (!existsSync(join(clone, '.git'))) git(COURSE, ['clone', '-q', `https://github.com/${r.github}.git`, r.clone])
  git(clone, ['fetch', '-q', 'origin'])
  const head = git(clone, ['rev-parse', 'origin/main'])
  if (head === r.synced) { report.push({ repo, head, synced: r.synced, commits: [] }); continue }
  const commits = git(clone, ['log', '--reverse', '--format=%H%x09%an%x09%ad%x09%s', '--date=iso', `${r.synced}..origin/main`]).split('\n').filter(Boolean).map((line) => {
    const [sha, author, date, subject] = line.split('\t')
    const files = git(clone, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean)
    return { sha, author, date, subject, files: files.map((f) => { const [, how, where] = MAP[repo].find(([re]) => re.test(f)); return { file: f, how, where } }) }
  })
  report.push({ repo, head, synced: r.synced, commits })
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
else {
  const fresh = report.filter((x) => x.commits.length)
  if (!fresh.length) console.log(`No new commits from Sinnie (${report.map((x) => `${x.repo} at ${x.head.slice(0, 7)}`).join(', ')}).`)
  for (const x of fresh) {
    console.log(`\n${x.repo}: ${x.commits.length} new commit${x.commits.length === 1 ? '' : 's'} (${x.synced.slice(0, 7)}..${x.head.slice(0, 7)})`)
    for (const c of x.commits) {
      console.log(`  ${c.sha.slice(0, 7)} ${c.date.slice(0, 16)} ${c.subject}`)
      for (const f of c.files) console.log(`      ${f.how.padEnd(5)} ${f.file}  →  ${f.where}`)
    }
  }
}
