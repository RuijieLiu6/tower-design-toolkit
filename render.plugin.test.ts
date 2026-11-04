// The local render helper (render.plugin.ts) on a real local server, with a stand-in for Codex: nothing is sent anywhere.
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allowed, pngBytes, renderHandler, validJob, type Runner } from './render.plugin'
import { FIXED_CONSTRAINTS, makeJob } from './src/engine/renderPrompt'

// A 1 × 1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const job = (id: string) => makeJob(id, '2026-11-03T20:00:00.000Z', { file: `${id}.png`, label: 'Clay view', shotId: 's1', width: 1, height: 1 }, { style: 'clay', cameraNote: 'aerial', programNote: 'office', notes: '' }, 'vtc')

let server: Server, base = '', folder = ''
const ran: string[] = []
/** Stand-in for tools/render.mjs: copies the capture to the outbox with a manifest, like a successful Codex run. */
const fakeRun: Runner = async (id, onLine) => {
  ran.push(id)
  onLine(`Rendering ${id} …`)
  const j = JSON.parse(readFileSync(join(folder, 'inbox', `${id}.json`), 'utf8'))
  writeFileSync(join(folder, 'outbox', `${id}.ai.png`), readFileSync(join(folder, 'inbox', `${id}.png`)))
  writeFileSync(join(folder, 'outbox', `${id}.ai.json`), JSON.stringify({ format: 'tower-studio-render-result@1', id, job: j, image: `${id}.ai.png`, tool: 'stand-in', model: 'none', rendered: '2026-11-03T20:01:00.000Z' }))
  return 0
}

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'tsr-'))
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(folder, 'outbox'), { recursive: true })
  const handle = renderHandler({ folder, run: fakeRun, codex: () => 'codex-cli test' })
  server = createServer((req, res) => {
    req.url = req.url!.replace(/^\/__render/, '') || '/'
    handle(req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const a = server.address() as { port: number }
  base = `http://127.0.0.1:${a.port}/__render`
})
afterAll(() => server?.close())

const post = (body: unknown, headers: Record<string, string> = { 'x-tower-render': '1' }) =>
  fetch(`${base}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('render helper', () => {
  it('only serves this computer and this origin, and POSTs need its header', () => {
    const req = (o: { ip?: string; origin?: string; method?: string; header?: string }) => ({
      method: o.method ?? 'GET', socket: { remoteAddress: o.ip ?? '127.0.0.1' },
      headers: { host: 'localhost:5173', ...(o.origin ? { origin: o.origin } : {}), ...(o.header ? { 'x-tower-render': o.header } : {}) },
    })
    expect(allowed(req({}))).toBe(true)
    expect(allowed(req({ ip: '::1', origin: 'http://localhost:5173' }))).toBe(true)
    expect(allowed(req({ ip: '192.168.1.20' }))).toBe(false)
    expect(allowed(req({ origin: 'https://evil.example' }))).toBe(false)
    expect(allowed(req({ method: 'POST' }))).toBe(false)
    expect(allowed(req({ method: 'POST', header: '1', origin: 'http://localhost:5173' }))).toBe(true)
  })

  it('accepts only the app’s own job files and real PNGs', () => {
    expect(validJob(job('tsr-20261103-200000'))).toBe(true)
    expect(validJob({ ...job('tsr-20261103-200000'), id: '../../etc' })).toBe(false)
    expect(validJob({ ...job('tsr-20261103-200000'), capture: { file: 'other.png' } })).toBe(false)
    expect(pngBytes(PNG)).not.toBeNull()
    expect(pngBytes('data:image/png;base64,AAAA')).toBeNull()
    expect(pngBytes('data:image/jpeg;base64,/9j/')).toBeNull()
  })

  it('renders a sent job and serves the result back (stand-in for Codex)', async () => {
    const status = await (await fetch(`${base}/status`)).json()
    expect(status).toMatchObject({ available: true, codex: 'codex-cli test' })
    const id = 'tsr-20261103-200001'
    const r = await post({ job: job(id), png: PNG })
    expect(r.status).toBe(202)
    expect(existsSync(join(folder, 'inbox', `${id}.png`))).toBe(true)
    let st: { state: string; result?: { image: string; job: { constraints: string[] } } } = { state: 'queued' }
    for (let i = 0; i < 50 && st.state !== 'done' && st.state !== 'failed'; i++) {
      await new Promise((ok) => setTimeout(ok, 20))
      st = await (await fetch(`${base}/jobs/${id}`)).json()
    }
    expect(st.state).toBe('done')
    expect(st.result?.job.constraints).toEqual(FIXED_CONSTRAINTS) // the fixed prompt lines travel with the job
    const img = await fetch(`${base}/outbox/${st.result!.image}`)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await img.arrayBuffer()).subarray(1, 4).toString()).toBe('PNG')
    expect(ran).toEqual([id])
    expect((await post({ job: job(id), png: PNG })).status).toBe(409) // sent once only
  })

  it('refuses bad requests without running anything', async () => {
    const before = ran.length
    expect((await post({ job: job('tsr-20261103-200002'), png: PNG }, {})).status).toBe(403)
    expect((await post({ job: { format: 'x' }, png: PNG })).status).toBe(400)
    expect((await post({ job: job('tsr-20261103-200003'), png: 'data:image/png;base64,AAAA' })).status).toBe(400)
    expect((await fetch(`${base}/outbox/..%2F..%2Fsecret.txt`)).status).toBe(404)
    expect((await fetch(`${base}/jobs/tsr-20990101-000000`)).status).toBe(404)
    expect(ran.length).toBe(before)
  })
})
