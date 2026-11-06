import { describe, expect, it } from 'vitest'
import { readDockPrefs, writeDockPrefs } from './ViewportDock'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

describe('viewport dock preferences (per viewer, localStorage)', () => {
  it('round-trips open state, open sections and dismissed hints', () => {
    const s = memory()
    writeDockPrefs(s, { open: false, sections: { more: true, ground: false }, hints: { 'city-cones': true } })
    expect(readDockPrefs(s)).toEqual({ open: false, sections: { more: true, ground: false }, hints: { 'city-cones': true } })
  })
  it('falls back to the defaults when storage is missing, blocked or holds something else', () => {
    expect(readDockPrefs(null)).toEqual({ open: false, sections: {}, hints: {} })
    expect(readDockPrefs({ getItem: () => { throw new Error('SecurityError') } })).toEqual({ open: false, sections: {}, hints: {} })
    expect(readDockPrefs({ getItem: () => '{not json' })).toEqual({ open: false, sections: {}, hints: {} })
    expect(readDockPrefs({ getItem: () => JSON.stringify({ open: 'yes', sections: { a: 1, b: true }, hints: [] }) })).toEqual({ open: false, sections: { b: true }, hints: {} })
  })
  it('never throws when writing fails (private window, quota)', () => {
    expect(() => writeDockPrefs({ setItem: () => { throw new Error('QuotaExceededError') } }, { open: true, sections: {}, hints: {} })).not.toThrow()
    expect(() => writeDockPrefs(null, { open: true, sections: {}, hints: {} })).not.toThrow()
  })
})
