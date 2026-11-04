// Which City buildings the study site hides in 3D (useRemoval in CityContext): the replaced footprints by id, none when
// the user keeps them, none without a site.
import { describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { demolishedIndices, idsToIndices, newSite, useSiteStore } from './siteStore'

const footprints = [{ id: 40 }, { id: 7 }, { id: 913 }, { id: 7 }]
const ring: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]

describe('study site: replaced buildings', () => {
  it('maps footprint ids to indices in the loaded layer, ignoring ids it does not have', () => {
    expect(idsToIndices(footprints, [913, 7, 5])).toEqual([1, 2, 3])
    expect(idsToIndices(footprints, [])).toEqual([])
  })
  it('hides the replaced buildings unless they are kept, and nothing without a site', () => {
    const site = newSite(ring, 'buildings', 'Two City buildings', { replaced: [40, 913] })
    expect(demolishedIndices(footprints, site)).toEqual([0, 2])
    expect(demolishedIndices(footprints, { ...site, keepReplaced: true })).toEqual([])
    expect(demolishedIndices(footprints, newSite(ring, 'drawn', 'Drawn'))).toEqual([])
    expect(demolishedIndices(footprints, null)).toEqual([])
  })
  it("is the project's citySite: setting it writes the design, and an undo or an opened file shows in the site tools", () => {
    const site = newSite(ring, 'drawn', 'Drawn on the plan (4 corners)')
    useSiteStore.getState().setSite(site)
    expect(useStore.getState().citySite).toBe(site)
    expect(useSiteStore.getState().site).toBe(site)
    useStore.getState().set({ citySite: null })
    expect(useSiteStore.getState().site).toBeNull()
  })
})
