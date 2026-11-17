// The competition context's load order (lib/vtcContextSource.ts): the dev file, else this browser's own copy, else the
// context included with the app (Ruijie, 13 Nov), else "missing". IndexedDB is absent here, so no browser copy exists.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const included = JSON.parse(readFileSync(new URL('../../public/context/vtc/context.json', import.meta.url), 'utf8'))

const answer = (routes: Record<string, unknown>) => vi.fn(async (url: string) => {
  const hit = Object.entries(routes).find(([k]) => url.endsWith(k))
  return hit ? { ok: true, json: async () => hit[1] } : { ok: false, json: async () => ({}) }
})

describe('competition context sources', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', undefined) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('ships the derived context: 99 buildings, 3 future towers, the 144.78 x 79.2 m site (as measured in the model), true north 45 deg', () => {
    expect(included.buildings).toHaveLength(99)
    expect(included.future_towers).toHaveLength(3)
    expect(included.site.width_m).toBeCloseTo(144.8, 0)
    expect(included.site.depth_m).toBeCloseTo(79.2, 0)
    expect(included.meta.true_north_deg_clockwise_from_plus_y).toBe(45)
    expect(included.meta.source).toMatch(/not the model file/)
  })

  it('loads the included context when there is no dev file and no copy in this browser', async () => {
    vi.stubGlobal('fetch', answer({ 'context/vtc/context.json': included }))
    const m = await import('./vtcContextSource')
    const ctx = await m.loadVtcContext()
    expect(ctx?.buildings).toHaveLength(99)
    const s = m.useVtcSource.getState()
    expect(s.status).toBe('ready')
    expect(s.source).toBe('included')
  })

  it('prefers the developer file when this computer has it', async () => {
    const dev = { ...included, buildings: included.buildings.slice(0, 5) }
    vi.stubGlobal('fetch', answer({ 'local/vtc_context.json': dev, 'context/vtc/context.json': included }))
    const m = await import('./vtcContextSource')
    await m.loadVtcContext()
    expect(m.useVtcSource.getState().source).toBe('dev-file')
    expect(m.useVtcSource.getState().ctx?.buildings).toHaveLength(5)
  })

  it('is "missing" only when the included file is absent or not a context', async () => {
    vi.stubGlobal('fetch', answer({ 'context/vtc/context.json': { hello: 'index.html' } }))
    const m = await import('./vtcContextSource')
    expect(await m.loadVtcContext()).toBeNull()
    expect(m.useVtcSource.getState().status).toBe('missing')
  })
})
