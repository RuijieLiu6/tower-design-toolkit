import { beforeEach, describe, expect, it } from 'vitest'
import { observeTowers, resetTowerAdds, seenTower, useTowerAdds } from './towerAdds'
import { findRhino, rhinoHandle } from './interchange/rhinoLink'

const state = (project: 'vtc' | 'city', ids: string[]) => ({ project, towers: { vtc: [], city: [], [project]: ids.map((id) => ({ id })) } }) as never

describe('towers just added (Your site marks them New)', () => {
  beforeEach(() => resetTowerAdds())

  it('marks a tower that appears next to the ones already there', () => {
    observeTowers(state('city', ['a']), 1)
    observeTowers(state('city', ['a', 'b']), 2)
    expect(useTowerAdds.getState().added).toEqual({ b: 2 })
    expect(useTowerAdds.getState().seq).toBe(1)
  })

  it('a project switch or a restore (the whole list replaced) adds nothing', () => {
    observeTowers(state('city', ['a']), 1)
    observeTowers(state('vtc', ['v1', 'v2']), 2)
    observeTowers(state('vtc', ['r1', 'r2']), 3)
    expect(useTowerAdds.getState().added).toEqual({})
    expect(useTowerAdds.getState().seq).toBe(0)
  })

  it('clears the mark when seen, and when the tower is deleted', () => {
    observeTowers(state('city', ['a']), 1)
    observeTowers(state('city', ['a', 'b', 'c']), 2)
    seenTower('b')
    expect(Object.keys(useTowerAdds.getState().added)).toEqual(['c'])
    observeTowers(state('city', ['a']), 3)
    expect(useTowerAdds.getState().added).toEqual({})
  })
})

describe('Rhino live link handle (tdt_link.py protocol)', () => {
  const server = (rev: { n: number }) => {
    const calls: string[] = []
    const f = (async (url: string) => {
      calls.push(url)
      if (url.endsWith('/tdt/rev')) return new Response(JSON.stringify({ rev: rev.n, doc: 'Tower.3dm', objects: 3, units: 'Meters', port: 8798, version: '1.0' }))
      if (url.endsWith('/tdt/model.3dm')) return new Response(new Uint8Array([51, 68]), { headers: { 'X-TDT-Rev': String(rev.n) } })
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch
    return { f, calls }
  }

  it('finds the plugin on the first port that answers', async () => {
    const { f } = server({ n: 4 })
    const miss = (async (url: string) => (url.includes(':8798') ? Promise.reject(new Error('refused')) : f(url))) as unknown as typeof fetch
    expect(await findRhino(miss)).toMatchObject({ rev: 4, port: 8798 })
    expect(await findRhino((async () => Promise.reject(new Error('refused'))) as unknown as typeof fetch)).toBeNull()
  })

  it('downloads the model only when the revision changes; the revision is the file time', async () => {
    const rev = { n: 1 }
    const { f, calls } = server(rev)
    const h = rhinoHandle(8798, f)
    const a = await h.getFile()
    const b = await h.getFile()
    expect(a).toBe(b)
    expect(a.name).toBe('Tower.3dm')
    expect(a.lastModified).toBe(1)
    expect(calls.filter((c) => c.endsWith('.3dm'))).toHaveLength(1)
    rev.n = 2
    const c = await h.getFile()
    expect(c.lastModified).toBe(2)
    expect(calls.filter((x) => x.endsWith('.3dm'))).toHaveLength(2)
    expect(h.kind).toBe('rhino')
  })
})
