// The landing page's user types and their starting workflows (6 Nov).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { useStore } from '../store'
import { startPreset } from './startPreset'
import { aType, presetById, USER_TYPES, useUserType } from './userTypes'

describe('user types and starting workflows', () => {
  // The guided app is opened through the address bar (#/guided): a stand-in window holds it.
  beforeEach(() => { useStore.setState(useStore.getInitialState(), true); vi.stubGlobal('window', { location: { hash: '' } }) })

  it('four types, each with at least three workflows of built nodes that run on the workflow\'s project', () => {
    expect(USER_TYPES.map((t) => t.id)).toEqual(['designer', 'practitioner', 'planner', 'engineer'])
    const ids = new Set<string>()
    for (const t of USER_TYPES) {
      expect(t.presets.length, t.id).toBeGreaterThanOrEqual(3)
      expect(t.says.length, t.id).toBeGreaterThanOrEqual(5)
      for (const p of t.presets) {
        expect(ids.has(p.id), p.id).toBe(false); ids.add(p.id)
        expect(p.type).toBe(t.id)
        expect(p.nodes.length, p.id).toBeGreaterThanOrEqual(4)
        expect(new Set(p.nodes).size, p.id).toBe(p.nodes.length)
        for (const id of p.nodes) {
          const n = BUILT_NODES.find((x) => x.id === id)
          expect(n, `${p.id}: ${id}`).toBeDefined()
          expect(n!.projects ?? ['vtc', 'city'], `${p.id}: ${id} on ${p.project}`).toContain(p.project)
        }
      }
    }
  })

  it('the type inside a sentence keeps proper nouns and takes the right article', () => {
    expect(aType('planner')).toBe('a planner or City reviewer')
    expect(aType('engineer')).toBe('an engineer or consultant')
  })

  it('starting a workflow opens its project and step with exactly its checks on, sets a site in Real Vancouver, and remembers the choice', async () => {
    const towers = useStore.getState().towers
    const p = presetById('planner.views')!
    await startPreset(p)
    const s = useStore.getState()
    expect(s.project).toBe('city')
    expect(Object.keys(s.enabled).filter((k) => s.enabled[k]).sort()).toEqual([...p.nodes].sort())
    expect(s.citySite?.label).toMatch(/Granville/)
    expect(s.towers).toBe(towers) // the design is untouched
    expect(useUserType.getState()).toEqual({ type: 'planner', preset: 'planner.views' })
    expect(window.location.hash).toBe('/guided') // navigate() sets the hash; a browser shows it as #/guided
  })
})
