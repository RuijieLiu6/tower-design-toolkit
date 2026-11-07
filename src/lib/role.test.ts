import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { useStore } from '../store'
import { chooseRole, ROLE_PRESETS, useRole } from './role'

describe('role presets (workflow study §7, approved 4 Nov)', () => {
  it('every preset check is a built node, listed once', () => {
    const built = new Set(BUILT_NODES.map((n) => n.id))
    for (const p of Object.values(ROLE_PRESETS)) {
      expect(p.nodes.filter((id) => !built.has(id))).toEqual([])
      expect(new Set(p.nodes).size).toBe(p.nodes.length)
    }
  })

  it('a role opens its project and switches on exactly its checks; the design is not touched', () => {
    const towers = useStore.getState().towers
    chooseRole('designer')
    expect(useRole.getState().role).toBe('designer')
    expect(useStore.getState().project).toBe('vtc')
    expect(Object.keys(useStore.getState().enabled).filter((k) => useStore.getState().enabled[k]).sort()).toEqual([...ROLE_PRESETS.designer.nodes].sort())
    chooseRole('practitioner')
    expect(useStore.getState().project).toBe('city')
    expect(useStore.getState().enabled['built.heights']).toBe(true) // its first workflow: rezoning feasibility
    expect(useStore.getState().towers).toBe(towers)
  })

  it('"just exploring" changes nothing', () => {
    const before = useStore.getState().enabled, project = useStore.getState().project
    expect(chooseRole('explore')).toMatch(/Nothing was changed/)
    expect(useStore.getState().enabled).toBe(before)
    expect(useStore.getState().project).toBe(project)
  })
})
