#!/usr/bin/env node
// Tower Design Toolkit AI render runner (research P13-M05). Renders each prepared capture in renders/inbox with YOUR OWN
// Codex CLI (ChatGPT plan, built-in imagegen) and writes the result plus a manifest to renders/outbox, so the app can
// import it labelled "AI-generated" and linked to its capture. Node built-ins only; no keys are read or stored.
//
//   node tower-studio/tools/render.mjs --collect     copy prepared files from Downloads into the inbox
//   node tower-studio/tools/render.mjs --dry-run     show what would run (uses nothing)
//   node tower-studio/tools/render.mjs               render, after asking (add --yes to skip the question)
//
// Options: --dir <renders folder>  --downloads <folder>  --codex <codex.js or executable>  --only <id>  --force
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const JOB_FORMAT = 'tower-studio-render-job@1'
const RESULT_FORMAT = 'tower-studio-render-result@1'
const ID = /^tsr-\d{8}-\d{6}$/

function args(argv) {
  const o = { dryRun: false, collect: false, yes: false, force: false, help: false, dir: null, downloads: null, codex: null, only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') o.dryRun = true
    else if (a === '--collect') o.collect = true
    else if (a === '--yes' || a === '-y') o.yes = true
    else if (a === '--force') o.force = true
    else if (a === '--help' || a === '-h') o.help = true
    else if (a === '--dir') o.dir = argv[++i]
    else if (a === '--downloads') o.downloads = argv[++i]
    else if (a === '--codex') o.codex = argv[++i]
    else if (a === '--only') o.only = argv[++i]
    else { console.error(`Unknown option: ${a}`); process.exit(2) }
  }
  return o
}

const here = dirname(fileURLToPath(import.meta.url))
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

/** The renders folder: --dir, else "04 Tool Plan/renders" next to tower-studio, else ./renders. */
function rendersDir(o) {
  if (o.dir) return resolve(o.dir)
  const project = resolve(here, '..', '..', '04 Tool Plan', 'renders')
  return existsSync(dirname(project)) ? project : resolve(process.cwd(), 'renders')
}

/** How to start Codex without a shell (the prompt is long and full of quotes). */
function codexCommand(o) {
  const viaNode = (js) => ({ cmd: process.execPath, pre: [js], label: `node ${js}` })
  if (o.codex) return o.codex.endsWith('.js') || o.codex.endsWith('.mjs') ? viaNode(resolve(o.codex)) : { cmd: o.codex, pre: [], label: o.codex }
  if (process.platform === 'win32' && process.env.APPDATA) {
    const js = join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    if (existsSync(js)) return viaNode(js)
  }
  return { cmd: 'codex', pre: [], label: 'codex' }
}

function readJobs(inbox) {
  if (!existsSync(inbox)) return []
  const jobs = []
  for (const f of readdirSync(inbox).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const j = JSON.parse(readFileSync(join(inbox, f), 'utf8'))
      if (j.format !== JOB_FORMAT || !ID.test(j.id)) continue
      const png = join(inbox, j.capture?.file ?? `${j.id}.png`)
      jobs.push({ job: j, png, ok: existsSync(png) })
    } catch { /* not a job file */ }
  }
  return jobs
}

/** The instruction handed to Codex: the app's prompt (fixed constraints included) plus where to save. */
function codexPrompt(job) {
  return [
    'Use $imagegen to edit the attached image.',
    job.prompt,
    job.size ? `Make the output landscape, ${job.size.w} x ${job.size.h} px if the tool allows it.` : '',
    `Save the image in the current working folder as ${job.id}.ai.png. Do not create or edit any other files.`,
    'When it is saved, reply with one line: "Model: " and the name of the image model you used.', // read into the manifest
  ].filter(Boolean).join(' ')
}

function codexArgs(job, png, work) {
  // `--` ends the options: Codex's -i takes several files and otherwise reads the prompt as a second image, then waits
  // for a prompt on stdin (first test run from the Render tab, 3 Nov 2026).
  return ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', work, '-o', join(work, 'last_message.txt'), '-i', png, '--', codexPrompt(job)]
}

function collect(o, inbox) {
  const from = o.downloads ? resolve(o.downloads) : join(homedir(), 'Downloads')
  if (!existsSync(from)) { console.log(`No Downloads folder at ${from}`); return 0 }
  const names = readdirSync(from).filter((n) => /^tsr-\d{8}-\d{6}\.(png|json)$/.test(n))
  let n = 0
  for (const name of names) {
    const dest = join(inbox, name)
    if (existsSync(dest)) continue
    if (o.dryRun) { console.log(`would copy ${name}`); n++; continue }
    mkdirSync(inbox, { recursive: true })
    copyFileSync(join(from, name), dest) // copy, never move: the downloads stay where they are
    console.log(`copied ${name}`)
    n++
  }
  console.log(`${n} file${n === 1 ? '' : 's'} ${o.dryRun ? 'would be ' : ''}copied from ${from} to ${inbox}`)
  return n
}

/** The newest image Codex left in the work folder (or the file its last message links to). */
function findOutput(work, id) {
  const exact = ['png', 'jpg', 'jpeg', 'webp'].map((e) => join(work, `${id}.ai.${e}`)).find(existsSync)
  if (exact) return exact
  const imgs = readdirSync(work).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).map((n) => join(work, n))
  if (imgs.length) return imgs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  const msg = existsSync(join(work, 'last_message.txt')) ? readFileSync(join(work, 'last_message.txt'), 'utf8') : ''
  const link = /\]\(<?([^)>]+\.(?:png|jpe?g|webp))>?\)/i.exec(msg)?.[1]
  return link && existsSync(link) ? link : null
}

function run(cmd, argv) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { stdio: 'inherit', shell: false })
    p.on('close', (code) => res(code ?? 1))
    p.on('error', (e) => { console.error(e.message); res(1) })
  })
}

async function ask(q) {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await new Promise((r) => rl.question(q, r))
  rl.close()
  return /^y(es)?$/i.test(String(a).trim())
}

async function main() {
  const o = args(process.argv.slice(2))
  if (o.help) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return 0 }
  const dir = rendersDir(o), inbox = join(dir, 'inbox'), outbox = join(dir, 'outbox')
  console.log(`Renders folder: ${dir}${o.dryRun ? '  (dry run: nothing is written and Codex is not started)' : ''}`)
  if (o.collect) { collect(o, inbox); if (!o.dryRun) return 0 }

  const all = readJobs(inbox).filter((j) => !o.only || j.job.id === o.only)
  const todo = all.filter((j) => j.ok && (o.force || !existsSync(join(outbox, `${j.job.id}.ai.json`))))
  for (const j of all.filter((x) => !x.ok)) console.log(`skip ${j.job.id}: capture ${basename(j.png)} is missing`)
  if (!todo.length) { console.log(all.length ? 'Every inbox item already has a result (use --force to redo one).' : `No prepared items in ${inbox}. In Present → Render, use "Prepare the files", then run with --collect.`); return 0 }

  const codex = codexCommand(o)
  console.log(`${todo.length} item${todo.length > 1 ? 's' : ''} to render with: ${codex.label}`)
  for (const { job, png } of todo) {
    const work = join(outbox, 'work', job.id)
    console.log(`\n• ${job.id}  ${job.capture?.label ?? ''}  style: ${job.style}`)
    console.log(`  input   ${png}`)
    console.log(`  output  ${join(outbox, `${job.id}.ai.png`)} + ${job.id}.ai.json`)
    console.log(`  command ${codex.label} ${codexArgs(job, png, work).slice(0, -1).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')} "<prompt>"`)
    console.log(`  prompt  ${codexPrompt(job)}`)
  }
  if (o.dryRun) { console.log('\nDry run only. Nothing was sent; your ChatGPT plan was not used.'); return 0 }

  console.log('\nEach image (an unpublished design) goes to OpenAI under your ChatGPT plan and its data settings.')
  if (!o.yes && !(await ask(`Render ${todo.length} image${todo.length > 1 ? 's' : ''} now? [y/N] `))) { console.log('Stopped. Nothing was sent.'); return 0 }

  const version = spawnSync(codex.cmd, [...codex.pre, '--version'], { encoding: 'utf8' }).stdout?.trim() || 'Codex CLI (version unknown)'
  let failed = 0
  for (const { job, png } of todo) {
    const work = join(outbox, 'work', job.id)
    mkdirSync(work, { recursive: true })
    console.log(`\nRendering ${job.id} …`)
    const code = await run(codex.cmd, [...codex.pre, ...codexArgs(job, png, work)])
    const out = code === 0 ? findOutput(work, job.id) : null
    if (!out) { console.error(`  no image came back for ${job.id} (exit ${code}); see ${work}`); failed++; continue }
    const ext = extname(out).toLowerCase() || '.png'
    const image = `${job.id}.ai${ext}`
    copyFileSync(out, join(outbox, image))
    const msg = existsSync(join(work, 'last_message.txt')) ? readFileSync(join(work, 'last_message.txt'), 'utf8') : ''
    const model = /Model:\s*([^\n]+)/i.exec(msg)?.[1].trim() || 'image model not reported by Codex'
    const result = { format: RESULT_FORMAT, id: job.id, job, image, tool: version, model, rendered: new Date().toISOString(), inputSha256: sha256(png), outputSha256: sha256(join(outbox, image)) }
    writeFileSync(join(outbox, `${job.id}.ai.json`), JSON.stringify(result, null, 2))
    // One line per call: the AI-use record the boards and the provenance log rely on.
    appendFileSync(join(dir, 'render-log.jsonl'), JSON.stringify({ id: job.id, rendered: result.rendered, tool: version, model, input: result.inputSha256, output: result.outputSha256, data: 'ChatGPT plan; retention per your OpenAI data controls (not read by this script)' }) + '\n')
    console.log(`  saved ${join(outbox, image)}`)
  }
  console.log(`\nDone: ${todo.length - failed} rendered, ${failed} failed. In Present → Render, use "Import results" and pick the .ai files in ${outbox}.`)
  return failed ? 1 : 0
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1) })
