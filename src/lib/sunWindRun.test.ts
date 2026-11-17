// The shared plumbing of the Sun & Wind Studio checks (lib/sunWindRun.ts), after the 17 Nov review: City readiness and its
// key (2), whether a stored result is current (3), one run at a time and a debounced start that survives a closing view (5).
import { describe, expect, it, vi } from 'vitest'
import { cityDetailReady, cityKey, isCurrent, runScheduler, workerRunner } from './sunWindRun'

const city = (detailStatus: string, n: number, heights: boolean, hidden: number[]) => ({ data: { model: 'city', detailStatus, footprints: new Array(n).fill(0) }, heights: heights ? {} : null, hidden: new Set(hidden) })

describe('review fix 2: the City buildings reach the run', () => {
  it('waits for the detailed stage (the first stage has no buildings)', () => {
    expect(cityDetailReady(city('loading', 0, false, []))).toBe(false)
    expect(cityDetailReady(city('ready', 120, true, []))).toBe(true)
    expect(cityDetailReady(city('partial', 120, true, []))).toBe(true)
    expect(cityDetailReady({ data: null, heights: null, hidden: new Set() })).toBe(false)
  })
  it('keys on the building model, stage, count, heights and the hidden set (in any order)', () => {
    const a = cityKey(city('ready', 120, true, [3, 1]))
    expect(cityKey(city('ready', 120, true, [1, 3]))).toBe(a)
    expect(cityKey(city('loading', 0, false, []))).not.toBe(cityKey(city('ready', 120, true, [])))
    expect(cityKey(city('ready', 121, true, [1, 3]))).not.toBe(a)
    expect(cityKey(city('ready', 120, false, [1, 3]))).not.toBe(a)
    expect(cityKey(city('ready', 120, true, [1, 4]))).not.toBe(a)
    expect(cityKey({ ...city('ready', 120, true, [1, 3]), data: { model: 'vista', detailStatus: 'ready', footprints: new Array(120).fill(0) } })).not.toBe(a)
  })
})

describe('review fix 3: only a current result is recorded or drawn', () => {
  it('needs the same project and model revision and a finished run', () => {
    const out = { project: 'vtc', rev: 'r1' }
    expect(isCurrent(out, 'ready', 'vtc', 'r1')).toBe(true)
    expect(isCurrent(out, 'ready', 'city', 'r1')).toBe(false)
    expect(isCurrent(out, 'ready', 'vtc', 'r2')).toBe(false)
    expect(isCurrent(out, 'running', 'vtc', 'r1')).toBe(false)
    expect(isCurrent(out, 'error', 'vtc', 'r1')).toBe(false)
    expect(isCurrent(null, 'ready', 'vtc', 'r1')).toBe(false)
  })
})

describe('review fix 5: one run at a time', () => {
  class FakeWorker { terminated = false; posted: unknown[] = []; onmessage: ((e: MessageEvent) => void) | null = null; onerror: ((e: ErrorEvent) => void) | null = null
    postMessage(m: unknown) { this.posted.push(m) } terminate() { this.terminated = true } }
  it('stops a job still in flight before the next, and ignores its late answer', () => {
    const made: FakeWorker[] = []; const got: number[] = []
    const r = workerRunner<{ id: number }>(() => { const w = new FakeWorker(); made.push(w); return w as unknown as Worker }, { message: (o) => { got.push(o.id); return true }, error: () => {} })
    const id1 = r.post({ a: 1 })
    const id2 = r.post({ a: 2 })
    expect(made).toHaveLength(2); expect(made[0].terminated).toBe(true)
    made[1].onmessage!({ data: { id: id1 } } as MessageEvent) // a late answer from the stopped job
    made[1].onmessage!({ data: { id: id2 } } as MessageEvent)
    expect(got).toEqual([id2])
    r.post({ a: 3 }) // the last job finished: the worker is reused
    expect(made).toHaveLength(2)
  })
  it('an error stops the worker, the next job starts a fresh one', () => {
    const made: FakeWorker[] = []; const errs: string[] = []
    const r = workerRunner<{ id: number }>(() => { const w = new FakeWorker(); made.push(w); return w as unknown as Worker }, { message: () => true, error: (m) => errs.push(m) })
    r.post({}); made[0].onerror!({ message: 'boom' } as ErrorEvent)
    expect(made[0].terminated).toBe(true); expect(errs).toEqual(['boom'])
    r.post({}); expect(made).toHaveLength(2)
  })
  it('a view that closes hands its pending start back; the newest key wins', () => {
    vi.useFakeTimers()
    const s = runScheduler(400), fired: string[] = []
    const a = Symbol('a'), b = Symbol('b')
    s.schedule('k1', '', a, () => fired.push('k1'))
    s.schedule('k1', '', b, () => fired.push('k1 again')) // the same key is not scheduled twice
    expect(s.release(b)).toBe(false)
    expect(s.release(a)).toBe(true) // view a closes: its start is dropped and reported
    s.schedule('k1', '', b, () => fired.push('k1 by b'))
    s.schedule('k2', '', b, () => fired.push('k2')) // a newer key replaces it
    s.schedule('k3', 'k3', b, () => fired.push('k3')) // already posted: nothing
    vi.advanceTimersByTime(500)
    expect(fired).toEqual(['k2'])
    vi.useRealTimers()
  })
})
