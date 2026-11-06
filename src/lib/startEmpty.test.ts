import { beforeEach, describe, expect, it } from 'vitest'
import { defaultTower, startingTowers, useStore } from '../store'
import { DEFAULT_TOOL_STEP, TOOL_STEPS, toolsForStep } from './step'
import { nodeOn } from './analysis'
import { DESIGN_TOOLS, toolsFor } from '../components/tools/registry'

// Ruijie, 6 Nov: "start the project with no tower, and then introduce the placing tower experience"; "only have site
// selection and Rhino import in the Site panel"; "they could choose to run analysis or not".
describe('a project starts empty and site-first', () => {
  beforeEach(() => useStore.setState({ ...useStore.getInitialState(), towers: startingTowers(), selectedTower: '' }, true))

  it('opens with no tower in either project', () => {
    expect(startingTowers()).toEqual({ vtc: [], city: [] })
  })
  it('places the starting tower on the study site, then later towers copy the last one', () => {
    const s = useStore.getState()
    s.setProject('city')
    useStore.setState({ citySite: { ring: [[100, 100], [140, 100], [140, 160], [100, 160]], source: 'drawn', note: '', label: null, replaced: [], keepReplaced: false } as never })
    useStore.getState().addTower()
    const [t] = useStore.getState().towers.city
    expect(t.id).toBe(defaultTower('city').id)
    expect(t.x).toBeCloseTo(120, 6)
    expect(t.y).toBeCloseTo(130, 6)
    expect(useStore.getState().selectedTower).toBe(t.id)
    useStore.getState().addTower()
    expect(useStore.getState().towers.city).toHaveLength(2)
  })
  it('without a site the starting tower keeps its own spot; the competition one stands on the block', () => {
    useStore.getState().addTower()
    expect(useStore.getState().towers.vtc[0]).toMatchObject({ id: 't1', x: defaultTower('vtc').x, y: defaultTower('vtc').y })
  })
  it('the last tower can be removed: the project is empty again and nothing is selected', () => {
    useStore.getState().addTower()
    useStore.setState({ placing: true })
    useStore.getState().removeTower('t1')
    expect(useStore.getState().towers.vtc).toEqual([])
    expect(useStore.getState().selectedTower).toBe('')
    expect(useStore.getState().placing).toBe(false)
  })
  it('Site holds only the site and the Rhino import; neither shows past Site; no Massing tool is lost', () => {
    const basic = toolsFor(DESIGN_TOOLS, 'basic')
    expect(toolsForStep(basic, 'site').map((t) => t.id).sort()).toEqual(['rhino-import', 'site'])
    for (const step of ['volume', 'program'] as const) {
      const ids = toolsForStep(basic, step).map((t) => t.id)
      expect(ids).not.toContain('site')
      expect(ids).not.toContain('rhino-import')
    }
    const placed = new Set((['site', 'volume', 'program'] as const).flatMap((st) => toolsForStep(basic, st).map((t) => t.id)))
    expect(placed.size).toBe(basic.length)
    expect(TOOL_STEPS.brief ?? DESIGN_TOOLS.find((t) => t.id === 'brief')?.steps).toEqual(['program'])
    expect(DEFAULT_TOOL_STEP).toBe('volume')
  })
  it('analysis off: no check runs, and the picks are kept for when it is back on', () => {
    useStore.setState({ enabled: { 'built.vtc-rules': true }, analysis: true })
    expect(nodeOn(useStore.getState(), 'built.vtc-rules')).toBe(true)
    useStore.setState({ analysis: false })
    expect(nodeOn(useStore.getState(), 'built.vtc-rules')).toBe(false)
    expect(useStore.getState().enabled['built.vtc-rules']).toBe(true)
  })
})
