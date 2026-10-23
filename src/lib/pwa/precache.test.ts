import { describe, expect, it } from 'vitest'
import { cacheName, fnv, hashRoute, neverCached, precacheList } from './precache'

describe('offline precache', () => {
  const built = [
    'index.html', 'assets/index-abc.js', 'assets/App-def.js', 'assets/index-123.css', 'assets/web-ifc-api-xyz.js', 'assets/web-ifc.wasm',
    'assets/rhino3dm-q.wasm', 'assets/App-def.js.map', 'local/vtc_context.json', './local/other.bin', 'eval/last-run.json', 'data/layers.json',
    'data\\terrain_r1.bin', '/demo/demo-project.json', 'manifest.webmanifest', 'icons/icon-192.png', 'sw.js', '404.html', '.nojekyll',
  ]

  it('downloads the app and its data, starting with the page', () => {
    expect(precacheList(built)).toEqual([
      'index.html', 'assets/App-def.js', 'assets/index-123.css', 'assets/index-abc.js', 'data/layers.json', 'data/terrain_r1.bin',
      'demo/demo-project.json', 'icons/icon-192.png', 'manifest.webmanifest',
    ])
  })

  it('never caches the private competition model or the live evaluation run', () => {
    const list = precacheList(built)
    expect(list.some((f) => f.startsWith('local/'))).toBe(false)
    expect(list).not.toContain('eval/last-run.json')
    expect(neverCached('./local/vtc_context.json')).toBe(true)
    expect(neverCached('data/layers.json')).toBe(false)
  })

  it('leaves the massing importers to first use', () => {
    expect(precacheList(built).some((f) => /web-ifc|rhino3dm|\.wasm$/.test(f))).toBe(false)
  })

  it('names the cache after the files and their content', () => {
    const a = cacheName([{ file: 'index.html', hash: '1' }, { file: 'data/x.bin', hash: '2' }])
    expect(a).toMatch(/^tower-studio-[0-9a-f]{8}$/)
    expect(cacheName([{ file: 'data/x.bin', hash: '2' }, { file: './index.html', hash: '1' }])).toBe(a) // order and "./" don't matter
    expect(cacheName([{ file: 'index.html', hash: '1' }, { file: 'data/x.bin', hash: '3' }])).not.toBe(a) // content does
    expect(fnv('')).toBe('811c9dc5')
  })
})

describe('GitHub Pages 404 fallback', () => {
  it('turns a path into the hash route', () => {
    expect(hashRoute('/tower-studio/guided', '/tower-studio/', '', '')).toBe('/tower-studio/#/guided')
    expect(hashRoute('/tower-studio/options/', '/tower-studio', '', '')).toBe('/tower-studio/#/options')
    expect(hashRoute('/tower-studio/', '/tower-studio/', '', '')).toBe('/tower-studio/')
    expect(hashRoute('/tower-studio/index.html', '/tower-studio/', '', '')).toBe('/tower-studio/')
    expect(hashRoute('/guide', '/', '', '')).toBe('/#/guide')
  })

  it('keeps a query and an existing hash', () => {
    expect(hashRoute('/tower-studio/guide', '/tower-studio/', '?a=1', '')).toBe('/tower-studio/?a=1#/guide')
    expect(hashRoute('/tower-studio/x', '/tower-studio/', '', '#/status')).toBe('/tower-studio/#/status')
  })
})
