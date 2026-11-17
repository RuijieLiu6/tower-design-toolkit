import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type R = typeof import('./registry')
function storage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear(), key: () => null, length: 0, map: m }
}
const T = (id: string, parent: string | null, extra = {}) => ({ id, label: id, parent, ...extra })
const TREE = [T('a', null), T('a.1', 'a'), T('a.2', 'a'), T('a.2.x', 'a.2'), T('a.2.y', 'a.2'), T('b', null, { locked: true }), T('c', null, { defaultVisible: false })]

// The drawer's logic, pure: visibility inherits down, groups read on / off / mixed, locked parts never hide, and the
// choice is kept in this browser as the hidden ids.
describe('a hidden layer remembers what it was', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', storage()) })
  afterEach(() => vi.unstubAllGlobals())
  it('keeps the earlier state in this browser until the layer is shown again', async () => {
    const a = await import('./addons')
    a.rememberLayer('trees', true); a.rememberLayer('zoning', false)
    expect(a.layersWere()).toEqual({ trees: true, zoning: false })
    a.rememberLayer('trees', undefined)
    expect(a.layersWere()).toEqual({ zoning: false })
  })
})

describe('the interface registry', () => {
  it('keeps the phases line: the only phase navigation in Model is locked, like the switch and the project menu', async () => {
    const line = r.STATIC_ITEMS.find((x) => x.id === 'left.workflow.line')
    expect(line?.locked).toBe(true)
    expect(r.isVisible('left.workflow.line', r.withVisible({}, 'left.workflow.line', false, r.STATIC_ITEMS), r.STATIC_ITEMS)).toBe(true)
  })
  let r: R
  beforeEach(async () => { vi.resetModules(); vi.stubGlobal('localStorage', storage()); vi.stubGlobal('window', {}); r = await import('./registry') })
  afterEach(() => vi.unstubAllGlobals())

  it('inherits: hiding a group hides everything under it; an unknown id is visible', () => {
    const h = r.withVisible({}, 'a.2', false, TREE)
    expect(r.isVisible('a.2.x', h, TREE)).toBe(false)
    expect(r.isVisible('a.1', h, TREE)).toBe(true)
    expect(r.isVisible('nobody.registered', h, TREE)).toBe(true)
  })
  it('reads a group as on, off or mixed and counts its hidden leaves', () => {
    expect(r.groupState('a', {}, TREE)).toBe('on')
    const one = r.withVisible({}, 'a.2.x', false, TREE)
    expect(r.groupState('a', one, TREE)).toBe('mixed')
    expect(r.groupState('a.2', one, TREE)).toBe('mixed')
    expect(r.hiddenCount('a', one, TREE)).toBe(1)
    const all = r.withVisible(r.withVisible(one, 'a.2.y', false, TREE), 'a.1', false, TREE)
    expect(r.groupState('a', all, TREE)).toBe('off')
    expect(r.groupVisible('a', all, TREE)).toBe(false) // every child hidden: the container goes too
    expect(r.groupVisible('a', one, TREE)).toBe(true)
  })
  it('showing clears the item, its descendants and its ancestors', () => {
    const h = r.withVisible(r.withVisible({}, 'a', false, TREE), 'a.2.x', false, TREE)
    const shown = r.withVisible(h, 'a.2', true, TREE)
    expect(shown).toEqual({})
    expect(r.isVisible('a.2.x', shown, TREE)).toBe(true)
  })
  it('never hides a locked part', () => {
    expect(r.withVisible({}, 'b', false, TREE)).toEqual({})
  })
  it('starts from the defaults and remembers the hidden ids in this browser', async () => {
    expect(r.defaultHidden(TREE)).toEqual({ c: true })
    r.registerUiItems('test', TREE)
    r.setUiVisible('a.1', false)
    const saved = JSON.parse((globalThis.localStorage as unknown as ReturnType<typeof storage>).getItem('ts.ui.visibility')!)
    expect(saved).toEqual({ format: 'tower-studio-ui@1', hidden: ['a.1'] })
    expect(r.loadUiLayout(JSON.stringify({ format: 'tower-studio-ui@1', hidden: ['a.2', 'b'] }))).toEqual({ ok: true, n: 2 })
    expect(r.useUiVisibility.getState().hidden).toEqual({ 'a.2': true }) // b is locked: not taken
    expect(r.loadUiLayout('{"nope":1}')).toMatchObject({ ok: false })
    r.showAllUi()
    expect(r.useUiVisibility.getState().hidden).toEqual({})
  })
  it('tells a part when its effective visibility changes (a layer turns off and back on)', () => {
    const seen: boolean[] = []
    r.registerUiItems('layers', [T('v', null), { ...T('v.l', 'v'), apply: (on: boolean) => seen.push(on) }])
    r.setUiVisible('v', false)
    r.setUiVisible('v', true)
    r.setUiVisible('v.l', false)
    expect(seen).toEqual([false, true, false])
  })
})
