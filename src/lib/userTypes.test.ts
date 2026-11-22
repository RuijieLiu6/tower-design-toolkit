// The landing page's user types and their starting workflows (6 Nov).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_NODES, canonicalNode, withParts } from '../data/registry'
import { useStore } from '../store'
import { startPreset } from './startPreset'
import { aType, presetById, USER_TYPES, useUserType } from './userTypes'

describe('user types and starting workflows', () => {
  // The guided app is opened through the address bar (#/guided): a stand-in window holds it.
  beforeEach(() => { useStore.setState(useStore.getInitialState(), true); vi.stubGlobal('window', { location: { hash: '' } }) })

  it('five types, each with at least three workflows of built nodes that run on the workflow\'s project', () => {
    expect(USER_TYPES.map((t) => t.id)).toEqual(['designer', 'practitioner', 'planner', 'engineer', 'developer'])
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
    expect(aType('developer')).toBe('a developer or feasibility')
  })

  it('the developer\'s workflows read the residual, storey height by use and the wind procedure\'s slenderness band (21 Nov)', () => {
    const dev = USER_TYPES.find((t) => t.id === 'developer')!
    expect(dev.presets.map((p) => p.id)).toEqual(['developer.feasibility', 'developer.office', 'developer.height'])
    // The wind procedure is a part of Structure (data/registry.ts MERGES): the preset keeps its lead, and switching it on brings the part.
    for (const p of dev.presets) for (const id of ['built.economics', 'built.f2f-use', canonicalNode('built.wind-procedure'), 'built.fsr']) expect(p.nodes, `${p.id}: ${id}`).toContain(id)
    for (const p of dev.presets) expect(withParts(p.nodes), p.id).toContain('built.wind-procedure')
    // Both sites: a real Vancouver site and the competition block.
    expect(new Set(dev.presets.map((p) => p.project))).toEqual(new Set(['city', 'vtc']))
  })

  it('starting a workflow opens its project and step with exactly its checks on, sets a site in Real Vancouver, and remembers the choice', async () => {
    const towers = useStore.getState().towers
    const p = presetById('planner.views')!
    await startPreset(p)
    const s = useStore.getState()
    expect(s.project).toBe('city')
    expect(Object.keys(s.enabled).filter((k) => s.enabled[k]).sort()).toEqual(withParts(p.nodes).sort())
    expect(s.citySite?.label).toMatch(/Granville/)
    expect(s.towers).toBe(towers) // the design is untouched
    expect(useUserType.getState()).toEqual({ type: 'planner', preset: 'planner.views' })
    expect(window.location.hash).toBe('/guided') // navigate() sets the hash; a browser shows it as #/guided
  })
})
