import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A localStorage for the test: the module reads it once at import and writes every change. */
function storage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear(), key: () => null, length: 0 }
}
const load = async (st = storage()) => { vi.stubGlobal('localStorage', st); vi.stubGlobal('window', {}); return { st, m: await import('./toolRail') } }

// The rail's place and whether it shows are the viewer's choice, kept in this browser (Ruijie, 17 Nov: drag it, snap it
// to the right side as well).
describe('the tool rail preferences', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())
  it('starts on the left and showing when nothing is remembered', async () => {
    const { m } = await load()
    expect(m.useToolRail.getState()).toEqual({ hidden: false, side: 'left' })
  })
  it('remembers the side and the hidden state as ts.toolRail.side and ts.toolRail.hidden', async () => {
    const { st, m } = await load()
    m.setToolRailSide('right')
    expect(st.getItem('ts.toolRail.side')).toBe('right')
    expect(st.getItem('ts.toolRail.hidden')).toBe('0')
    m.toggleToolRail()
    expect(st.getItem('ts.toolRail.hidden')).toBe('1')
    expect(m.useToolRail.getState()).toEqual({ hidden: true, side: 'right' })
  })
  it('reads a remembered side back; anything but right means left', async () => {
    const st = storage()
    st.setItem('ts.toolRail.side', 'right'); st.setItem('ts.toolRail.hidden', '1')
    expect((await load(st)).m.useToolRail.getState()).toEqual({ hidden: true, side: 'right' })
    vi.resetModules()
    st.setItem('ts.toolRail.side', 'top')
    expect((await load(st)).m.useToolRail.getState().side).toBe('left')
  })
})
