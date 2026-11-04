// Local render helper for the Render tab (Present; research P13-M05). Only in `vite` dev and `vite preview` on this
// computer, never in a build or on GitHub Pages. The page sends one capture and its prompt file; this writes them to
// renders/inbox and runs tools/render.mjs for that one item with the user's own Codex CLI and ChatGPT plan, then serves
// the result back so the page can import it. The page asks the user before every render; this only runs what it is sent.
//   GET  /__render/status          → { available, codex, folder }
//   POST /__render/jobs            { job, png } → { id }   (header x-tower-render: 1, same origin, from this computer)
//   GET  /__render/jobs/<id>       → { id, state, seconds, log, result? }
//   GET  /__render/outbox/<file>   → the rendered image or its manifest
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'

const JOB_FORMAT = 'tower-studio-render-job@1'
const ID = /^tsr-\d{8}-\d{6}$/
const OUT_FILE = /^(tsr-\d{8}-\d{6})\.ai\.(png|jpe?g|webp|json)$/
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', json: 'application/json' }
/** A capture at the largest render size is a few MB as base64; anything far bigger is not one. */
const MAX_BODY = 40 * 1024 * 1024
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export type JobState = { id: string; state: 'queued' | 'running' | 'done' | 'failed'; started: number; ended: number | null; log: string[] }
export type Runner = (id: string, onLine: (line: string) => void) => Promise<number>

/** Requests from another computer, or from a page on another origin, never reach Codex. */
export function allowed(req: Pick<IncomingMessage, 'method' | 'headers'> & { socket: { remoteAddress?: string } }): boolean {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return false
  const origin = req.headers.origin
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return false } catch { return false } }
  if (req.method === 'POST' && req.headers['x-tower-render'] !== '1') return false // forces a CORS preflight cross-site
  return true
}

/** A prepared job as the app writes it (engine/renderPrompt.ts makeJob). */
export function validJob(job: unknown): job is { format: string; id: string; prompt: string; capture: { file: string } } {
  const j = job as { format?: unknown; id?: unknown; prompt?: unknown; capture?: { file?: unknown } } | null
  return !!j && j.format === JOB_FORMAT && typeof j.id === 'string' && ID.test(j.id) && typeof j.prompt === 'string' && j.capture?.file === `${j.id}.png`
}

export function pngBytes(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return null
  const b = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
  return b.length > 8 && b.readUInt32BE(0) === 0x89504e47 ? b : null
}

/** The renders folder, the same one tools/render.mjs uses: "04 Tool Plan/renders" beside tower-studio, else ./renders. */
export function rendersFolder(appRoot: string): string {
  const plan = resolve(appRoot, '..', '04 Tool Plan')
  return existsSync(plan) ? join(plan, 'renders') : resolve(appRoot, 'renders')
}

/** The Codex CLI version, or null when it is not installed (asked once; the same lookup as tools/render.mjs). */
function codexVersion(): string | null {
  const js = process.platform === 'win32' && process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : null
  const r = js && existsSync(js) ? spawnSync(process.execPath, [js, '--version'], { encoding: 'utf8' }) : spawnSync('codex', ['--version'], { encoding: 'utf8', shell: false })
  return r.status === 0 ? (r.stdout || '').trim() || 'Codex CLI' : null
}

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let n = 0
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => { n += c.length; if (n > MAX_BODY) { fail(new Error('too large')); req.destroy() } else parts.push(c) })
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8')))
    req.on('error', fail)
  })
}

/** The request handler, mounted at /__render. `run` renders one inbox item (tools/render.mjs by default; a stand-in in tests). */
export function renderHandler(opts: { folder: string; run: Runner; codex: () => string | null }): Connect.NextHandleFunction {
  const jobs = new Map<string, JobState>()
  let queue: Promise<void> = Promise.resolve()
  let version: string | null | undefined
  const inbox = join(opts.folder, 'inbox'), outbox = join(opts.folder, 'outbox')

  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (!allowed(req)) return send(res, 403, { error: 'Only the app on this computer can use the render helper.' })

    if (req.method === 'GET' && url.pathname === '/status') {
      if (version === undefined) version = opts.codex()
      return send(res, 200, { available: true, codex: version, folder: opts.folder })
    }

    if (req.method === 'POST' && url.pathname === '/jobs') {
      readBody(req).then((text) => {
        let body: { job?: unknown; png?: unknown }
        try { body = JSON.parse(text) } catch { return send(res, 400, { error: 'Not JSON.' }) }
        if (!validJob(body.job)) return send(res, 400, { error: 'Not a render job from the app.' })
        const png = pngBytes(body.png)
        if (!png) return send(res, 400, { error: 'The capture must be a PNG.' })
        const id = body.job.id
        if (jobs.has(id)) return send(res, 409, { error: `${id} was already sent.` })
        mkdirSync(inbox, { recursive: true })
        writeFileSync(join(inbox, `${id}.png`), png)
        writeFileSync(join(inbox, `${id}.json`), JSON.stringify(body.job, null, 2))
        const st: JobState = { id, state: 'queued', started: Date.now(), ended: null, log: [] }
        jobs.set(id, st)
        // One at a time: Codex renders are slow and each one uses the plan.
        queue = queue.then(async () => {
          st.state = 'running'; st.started = Date.now()
          const code = await opts.run(id, (line) => { st.log.push(line); if (st.log.length > 200) st.log.shift() }).catch((e) => { st.log.push(String(e)); return 1 })
          st.state = code === 0 && existsSync(join(outbox, `${id}.ai.json`)) ? 'done' : 'failed'
          st.ended = Date.now()
        })
        send(res, 202, { id })
      }, () => send(res, 413, { error: 'Too large.' }))
      return
    }

    const job = /^\/jobs\/(tsr-\d{8}-\d{6})$/.exec(url.pathname)
    if (req.method === 'GET' && job) {
      const st = jobs.get(job[1])
      if (!st) return send(res, 404, { error: 'No such render in this session.' })
      const manifest = join(outbox, `${st.id}.ai.json`)
      const result = st.state === 'done' && existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : undefined
      return send(res, 200, { id: st.id, state: st.state, seconds: Math.round(((st.ended ?? Date.now()) - st.started) / 1000), log: st.log.slice(-12), result })
    }

    const file = /^\/outbox\/(.+)$/.exec(url.pathname)
    if (req.method === 'GET' && file) {
      const m = OUT_FILE.exec(decodeURIComponent(file[1]))
      const p = m ? join(outbox, m[0]) : null
      if (!m || !p || !existsSync(p)) return send(res, 404, { error: 'Not found.' })
      res.statusCode = 200
      res.setHeader('content-type', TYPES[m[2].toLowerCase()])
      res.setHeader('cache-control', 'no-store')
      return res.end(readFileSync(p))
    }
    next()
  }
}

/** Runs tools/render.mjs for one inbox item, without asking (the page already asked). */
export function scriptRunner(appRoot: string, folder: string): Runner {
  const script = join(appRoot, 'tools', 'render.mjs')
  return (id, onLine) => new Promise((done) => {
    const p = spawn(process.execPath, [script, '--dir', folder, '--only', id, '--yes'], { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let rest = ''
    const take = (c: Buffer) => { const lines = (rest + c.toString('utf8')).split(/\r?\n/); rest = lines.pop() ?? ''; for (const l of lines) if (l.trim()) onLine(l) }
    p.stdout.on('data', take); p.stderr.on('data', take)
    p.on('close', (code) => { if (rest.trim()) onLine(rest); done(code ?? 1) })
    p.on('error', (e) => { onLine(e.message); done(1) })
  })
}

export function renderHelper(): Plugin {
  let root = process.cwd()
  const mount = (mw: Connect.Server) => {
    const folder = rendersFolder(root)
    mw.use('/__render', renderHandler({ folder, run: scriptRunner(root, folder), codex: codexVersion }))
  }
  return {
    name: 'tower-studio-render-helper',
    configResolved(c) { root = c.root },
    configureServer(s) { mount(s.middlewares) },
    configurePreviewServer(s) { mount(s.middlewares) },
  }
}
