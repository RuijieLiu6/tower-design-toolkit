import { afterEach, describe, expect, it } from 'vitest'
import { breakStep, startHistory, undo } from '../lib/project/history'
import { useStore } from '../store'
import { DEFAULT_DOOR_FACES, doorFacesOf, egressCheck, withDoorFace } from './egress'
import type { Tower } from './types'

const s0 = useStore.getInitialState()
const core = (patch: Partial<Tower> = {}): Tower => ({ ...s0.towers.vtc[0], ...patch })
const presets = { ...s0.egressPresets, placement: 'core' as const }

describe('Egress › Stair doors (node placement, 21 Nov)', () => {
  afterEach(() => useStore.setState(s0, true))

  it('reads the door faces, defaults first, and writes only the stair picked', () => {
    expect(doorFacesOf({}, 2)).toEqual(['n', 's'])
    expect(doorFacesOf({ stairDoorFaces: ['e'] }, 2)).toEqual(['e', 's'])
    expect(withDoorFace({}, 2, 1, 'w')).toEqual(['n', 'w'])
    expect(withDoorFace({ stairDoorFaces: ['e', 'w'] }, 2, 0, 'n')).toEqual(['n', 'w'])
    // Back to the defaults: undefined, as before the input existed.
    expect(withDoorFace({ stairDoorFaces: ['e', 's'] }, 2, 0, DEFAULT_DOOR_FACES[0])).toBeUndefined()
  })

  it('moves the smoke-path reading, never the straight line of record', () => {
    const a = egressCheck(core(), presets)
    const b = egressCheck(core({ stairDoorFaces: withDoorFace({}, 2, 1, 'e') }), presets)
    expect(a.spots.filter((x) => x.inCore)).toHaveLength(2)
    expect(b.separation).toBe(a.separation)
    // Opposite faces (n, s) are farther apart round the core than adjacent ones (n, e).
    expect(b.smoke.d).toBeLessThan(a.smoke.d)
    expect(b.smoke.faces.filter(Boolean)).toEqual(['n', 'e'])
    expect(b.rules.find((r) => r.id.startsWith('separation-smoke'))!.note).toMatch(/faces you set \(Egress › Stair doors\)/)
  })

  it('applies at once and Ctrl+Z takes it back', () => {
    const stop = startHistory()
    const t = useStore.getState().towers[useStore.getState().project][0]
    breakStep()
    useStore.getState().updateTower(t.id, { stairDoorFaces: withDoorFace(t, 2, 0, 'w') })
    breakStep()
    const now = () => useStore.getState().towers[useStore.getState().project].find((x) => x.id === t.id)!
    expect(now().stairDoorFaces).toEqual(['w', 's'])
    undo()
    expect(now().stairDoorFaces).toBe(t.stairDoorFaces)
    stop()
  })
})
