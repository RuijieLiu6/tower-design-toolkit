// Runs the generated service worker against a fake cache and network: install, the page offline, the private model
// never stored, importers kept after first use, and old caches cleared.
import { describe, expect, it } from 'vitest'
import { NEVER_CACHE } from './precache'
import { serviceWorker } from './swSource'

const SCOPE = 'http://localhost:4173/app/'
type Req = { url: string; method: string; mode: string; cache: string; origin?: string }
type Res = { ok: boolean; type: string; body: string; headers: { get: (k: string) => string | null }; clone: () => Res }
const res = (body: string, type = 'text/javascript'): Res => {
  const r: Res = { ok: true, type: 'basic', body, headers: { get: (k) => (k === 'content-type' ? type : null) }, clone: () => res(body, type) }
  return r
}
const abs = (u: string | Req) => new URL(typeof u === 'string' ? u : u.url, SCOPE).href

function worker(files: string[], cache = 'tower-studio-new') {
  const listeners: Record<string, (e: unknown) => void> = {}
  const stores = new Map<string, Map<string, Res>>([['tower-studio-old', new Map()], ['someone-else', new Map()]])
  const net = { online: true, served: [] as string[] }
  const fetchFake = async (u: string | Req) => {
    const url = abs(u)
    net.served.push(url)
    if (!net.online) throw new TypeError('Failed to fetch')
    return res(`body of ${url}`, url.endsWith('/') || url.endsWith('.html') ? 'text/html' : 'text/javascript')
  }
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)!
    return {
      addAll: async (us: string[]) => { for (const u of us) m.set(abs(u), await fetchFake(u)) },
      put: async (u: string | Req, r: Res) => { m.set(abs(u), r) },
    }
  }
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (k: string) => stores.delete(k),
    // Like a server sending "Vary: Origin": entries were stored without an Origin header, so a request that has one
    // only matches when the lookup ignores Vary.
    match: async (u: string | Req, o?: { ignoreVary?: boolean }) => {
      if (typeof u !== 'string' && u.origin && !o?.ignoreVary) return undefined
      const k = abs(u).split('?')[0]; for (const m of stores.values()) if (m.has(k)) return m.get(k); return undefined
    },
  }
  const self = { registration: { scope: SCOPE }, addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f } }
  new Function('self', 'caches', 'fetch', 'Response', serviceWorker(cache, files, NEVER_CACHE))(self, caches, fetchFake, { error: () => ({ ok: false, type: 'error' }) })

  const waitFor = async (type: string) => { let p: Promise<unknown> = Promise.resolve(); listeners[type]({ waitUntil: (x: Promise<unknown>) => { p = x } }); await p }
  /** Fire a fetch; returns the response, or null when the worker leaves the request to the browser. */
  const request = async (path: string, mode = 'no-cors', cacheMode = 'default') => {
    let out = null as Promise<Res> | null // set inside the callback
    listeners.fetch({ request: { url: new URL(path, SCOPE).href, method: 'GET', mode, cache: cacheMode, origin: mode === 'cors' ? 'http://localhost:4173' : undefined }, respondWith: (p: Promise<Res>) => { out = p } })
    return out ? await out : null
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))
  return { stores, net, waitFor, request, settle }
}

describe('service worker', () => {
  const files = ['index.html', 'assets/index-abc.js', 'data/layers.json']

  it('downloads the app at install and opens it offline', async () => {
    const w = worker(files)
    await w.waitFor('install')
    expect([...w.stores.get('tower-studio-new')!.keys()]).toEqual(files.map((f) => SCOPE + f))
    w.net.online = false
    expect((await w.request('', 'navigate'))?.body).toBe(`body of ${SCOPE}index.html`)
    expect((await w.request('#/guided', 'navigate'))?.body).toBe(`body of ${SCOPE}index.html`)
    expect((await w.request('assets/index-abc.js'))?.body).toBe(`body of ${SCOPE}assets/index-abc.js`)
    // Module scripts (<script type="module" crossorigin>) carry an Origin header: still served offline.
    expect((await w.request('assets/index-abc.js', 'cors'))?.body).toBe(`body of ${SCOPE}assets/index-abc.js`)
  })

  it('takes the page from the network when online, and keeps it for later', async () => {
    const w = worker(files)
    await w.waitFor('install')
    w.net.served.length = 0
    expect((await w.request('', 'navigate'))?.body).toBe(`body of ${SCOPE}`)
    expect(w.net.served).toEqual([SCOPE])
  })

  it('never stores the private competition model or the live evaluation run', async () => {
    const w = worker(files)
    await w.waitFor('install')
    expect(await w.request('local/vtc_context.json')).toBeNull() // straight to the network, untouched
    expect(await w.request('eval/last-run.json')).toBeNull()
    expect(await w.request('data/layers.json', 'no-cors', 'no-store')).toBeNull()
    for (const m of w.stores.values()) for (const k of m.keys()) expect(k).not.toMatch(/\/(local|eval)\//)
  })

  it('keeps the massing importers after their first download', async () => {
    const w = worker(files)
    await w.waitFor('install')
    expect((await w.request('assets/web-ifc.wasm'))?.body).toBe(`body of ${SCOPE}assets/web-ifc.wasm`)
    await w.settle()
    w.net.online = false
    expect((await w.request('assets/web-ifc.wasm'))?.body).toBe(`body of ${SCOPE}assets/web-ifc.wasm`)
  })

  it("clears the previous build's cache and leaves other caches alone", async () => {
    const w = worker(files)
    await w.waitFor('install')
    await w.waitFor('activate')
    expect([...w.stores.keys()].sort()).toEqual(['someone-else', 'tower-studio-new'])
  })

  it('ignores other sites', async () => {
    const w = worker(files)
    expect(await w.request('https://example.org/x.js')).toBeNull()
  })
})
