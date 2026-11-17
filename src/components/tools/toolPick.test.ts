import { describe, expect, it } from 'vitest'
import { resolveTools } from './toolPick'
import type { DesignTool } from './registry'

const tool = (id: string, extra: Partial<DesignTool> = {}): DesignTool =>
  ({ id, label: id, icon: (() => null) as unknown as DesignTool['icon'], stages: ['basic'], order: 0, component: () => null, ...extra })
// Volume's tools as the registry orders them: Tower position, Massing (holds Generate once a tower exists), Generate.
const VOLUME = [tool('towers', { defaultOpen: true }), tool('massing', { defaultOpen: true }), tool('generate', { worksWithoutTower: true, emptyOnly: true, opensIn: 'massing' })]

// The left panel and the tool rail beside the model read the same choice (ToolPanel.tsx, ToolRail.tsx): one rule here.
describe('the tools a step offers and the open one', () => {
  it('no tower on Volume: only the tools that make towers, none open until picked', () => {
    const c = resolveTools(VOLUME, { phase: 'basic', step: 'volume', noTower: true, picked: {} })
    expect(c.empty).toBe('place')
    expect(c.shown.map((t) => t.id)).toEqual(['generate'])
    expect(c.activeId).toBeUndefined()
    expect(resolveTools(VOLUME, { phase: 'basic', step: 'volume', noTower: true, picked: { 'basic:volume': 'generate' } }).activeId).toBe('generate')
  })
  it('with a tower: the empty-site tool leaves the row, and a pick of it lights the tool it lives in', () => {
    const c = resolveTools(VOLUME, { phase: 'basic', step: 'volume', noTower: false, picked: { 'basic:volume': 'generate' } })
    expect(c.shown.map((t) => t.id)).toEqual(['towers', 'massing'])
    expect(c.activeId).toBe('massing')
    expect(resolveTools(VOLUME, { phase: 'basic', step: 'volume', noTower: false, picked: {} }).activeId).toBe('towers')
  })
  it('no tower on Program: nothing offered; a check keeps its own control set whatever the step', () => {
    expect(resolveTools(VOLUME, { phase: 'basic', step: 'program', noTower: true, picked: {} })).toMatchObject({ empty: 'none', shown: [], activeId: undefined })
    const all = [...VOLUME, tool('sun', { stages: ['basic', 'advanced'] })]
    const c = resolveTools(VOLUME, { all, phase: 'basic', step: 'program', only: ['sun'], noTower: false, picked: {} })
    expect(c.where).toBe('node:sun')
    expect(c.shown.map((t) => t.id)).toEqual(['sun'])
    expect(c.activeId).toBe('sun')
  })
})
