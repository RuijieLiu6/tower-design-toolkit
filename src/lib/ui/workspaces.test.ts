// Workspaces (Ruijie, 17 Nov: Illustrator-style presets): switching applies the whole arrangement, a change shows as
// "changed" and Reset puts it back, your own workspaces are made, renamed, updated and deleted, and they persist.
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A browser storage stand-in that outlives a module reload (the tests run outside a browser). */
let mem = new Map<string, string>()
const storage = () => ({ getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)) }, removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, get length() { return mem.size } })
beforeEach(() => { vi.resetModules(); mem = new Map(); vi.stubGlobal('localStorage', storage()); vi.stubGlobal('window', globalThis) })
const load = async () => {
  const ws = await import('./workspaces')
  const reg = await import('./registry')
  const { usePanels, usePanelWidths } = await import('../panels')
  const { useToolRail } = await import('../toolRail')
  const { useStore } = await import('../../store')
  return { ws, reg, usePanels, usePanelWidths, useToolRail, useStore }
}

describe('workspaces', () => {
  it('starts in Essentials, the default arrangement', async () => {
    const { ws } = await load()
    expect(ws.useWorkspaces.getState().active).toBe('essentials')
    expect(ws.sameLayout(ws.currentLayout(), ws.BUILT_IN.find((w) => w.id === 'essentials')!.layout)).toBe(true)
  })

  it('applies a built-in workspace in full: hidden parts, panels, widths, tool rail, view', async () => {
    const { ws, reg, usePanels, usePanelWidths, useToolRail, useStore } = await load()
    ws.switchWorkspace('classic')
    expect(useStore.getState().view).toBe('split')
    expect(useToolRail.getState()).toMatchObject({ side: 'right', hidden: false })
    expect(usePanelWidths.getState()).toEqual({ left: 240, right: 360 })
    expect(usePanels.getState()).toEqual({ left: true, right: true })
    ws.switchWorkspace('getting-started')
    const hidden = reg.useUiVisibility.getState().hidden
    expect(hidden['right.tab.trace']).toBe(true)
    expect(hidden['tools.modes.mass']).toBe(true)
    expect(useStore.getState().view).toBe('3d')
    expect(usePanelWidths.getState()).toEqual({})
    expect(useToolRail.getState().side).toBe('left')
    expect(ws.useWorkspaces.getState().active).toBe('getting-started')
  })

  it('never hides a locked part, whatever a workspace lists', async () => {
    const { reg } = await load()
    reg.setUiHidden(['topbar.mode-switch', 'topbar.autorun'])
    expect(reg.useUiVisibility.getState().hidden).toEqual({ 'topbar.autorun': true })
  })

  it('shows a change against the active workspace, and Reset puts it back', async () => {
    const { ws, reg, useToolRail } = await load()
    ws.switchWorkspace('essentials')
    expect(ws.sameLayout(ws.currentLayout(), ws.workspaceById('essentials')!.layout)).toBe(true)
    reg.setUiVisible('topbar.autorun', false)
    useToolRail.setState({ side: 'right' })
    expect(ws.sameLayout(ws.currentLayout(), ws.workspaceById('essentials')!.layout)).toBe(false)
    ws.resetWorkspace()
    expect(reg.useUiVisibility.getState().hidden).toEqual({})
    expect(useToolRail.getState().side).toBe('left')
  })

  it('makes, renames, updates and deletes a workspace of your own; names must be new', async () => {
    const { ws, reg, usePanels } = await load()
    usePanels.setState({ left: false, right: true })
    reg.setUiVisible('right.tab.trace', false)
    expect(ws.nameProblem('  ')).toMatch(/name/)
    expect(ws.nameProblem('essentials')).toMatch(/already/)
    const mine = ws.newWorkspace('  Review   desk ')!
    expect(mine.name).toBe('Review desk')
    expect(ws.useWorkspaces.getState().active).toBe(mine.id)
    expect(mine.layout).toMatchObject({ panels: { left: false, right: true }, hidden: ['right.tab.trace'] })
    expect(ws.newWorkspace('review DESK')).toBeNull()

    ws.switchWorkspace('essentials')
    expect(usePanels.getState().left).toBe(true)
    ws.switchWorkspace(mine.id)
    expect(usePanels.getState().left).toBe(false)
    expect(reg.useUiVisibility.getState().hidden['right.tab.trace']).toBe(true)

    expect(ws.renameWorkspace(mine.id, 'Classic')).toBe(false)
    expect(ws.renameWorkspace(mine.id, 'Crit desk')).toBe(true)
    usePanels.setState({ left: true, right: false })
    ws.updateWorkspace(mine.id)
    expect(ws.workspaceById(mine.id)!.layout.panels).toEqual({ left: true, right: false })

    ws.deleteWorkspace(mine.id)
    expect(ws.useWorkspaces.getState()).toMatchObject({ active: 'essentials', mine: [] })
  })

  it('keeps your workspaces and the active one in this browser', async () => {
    let { ws } = await load()
    const mine = ws.newWorkspace('Night shift')!
    vi.resetModules()
    ;({ ws } = await load())
    expect(ws.useWorkspaces.getState().active).toBe(mine.id)
    expect(ws.useWorkspaces.getState().mine.map((w) => w.name)).toEqual(['Night shift'])
  })

  it('falls back to Essentials when the saved data is broken', async () => {
    localStorage.setItem('ts.workspaces', JSON.stringify({ active: 'gone', mine: [{ id: 'x', name: 'Bad' }] }))
    const { ws } = await load()
    expect(ws.useWorkspaces.getState()).toEqual({ active: 'essentials', mine: [] })
  })
})
