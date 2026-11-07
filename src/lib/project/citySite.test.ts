// The Real Vancouver study site in the design (Integrate Vista's StudySite, wired by the Rhino upload session, 4 Nov 2026):
// saved and reopened unchanged, absent from older files, undoable, and checked by the schema.
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudySite } from '../../engine/site'
import { useStore } from '../../store'
import { defaultDesign, pickDesign } from './design'
import { startHistory, undo } from './history'
import { exportProject, readProject, toDesign } from './projectFile'

const site: StudySite = {
  ring: [[300, 120], [380, 120], [380, 190], [300, 190]], source: 'geojson', note: 'GeoJSON lot.geojson (Test lot), EPSG:4326 → EPSG:26910',
  label: '1000 Test Street', replaced: [12, -1000123], keepReplaced: false, parcelsAdd: [4], parcelsSkip: [], parcelLayer: 'ab12', areaBasis: 'parcels',
}

describe('citySite in the project file', () => {
  beforeEach(() => useStore.setState(useStore.getInitialState(), true))

  it('saves and reopens a study site byte for byte, and files without one open with none', () => {
    const text = exportProject({ ...defaultDesign(), citySite: site })
    const r = readProject(text)
    expect(r.problems).toEqual([])
    expect(toDesign(r.file!).citySite).toEqual(site)
    expect(exportProject(toDesign(r.file!))).toBe(text)
    expect(JSON.parse(exportProject(defaultDesign())).citySite).toBeUndefined()
    expect(toDesign(readProject(exportProject(defaultDesign())).file!).citySite).toBeNull()
  })

  it('is part of the design, so setting it is one undo step', () => {
    expect(pickDesign(useStore.getState()).citySite).toBeNull()
    const stop = startHistory()
    useStore.setState({ citySite: site })
    expect(useStore.getState().citySite).toEqual(site)
    undo()
    expect(useStore.getState().citySite).toBeNull()
    stop()
  })

  it('rejects a ring of two points, an unknown source and an over-long note, in words', () => {
    const text = exportProject({ ...defaultDesign(), citySite: site })
    const bad = (patch: Partial<StudySite>) => { const f = JSON.parse(text); f.citySite = { ...f.citySite, ...patch }; return readProject(JSON.stringify(f)).problems.join(' ') }
    expect(bad({ ring: [[0, 0], [1, 1]] })).toMatch(/citySite › ring/)
    expect(bad({ source: 'guess' as StudySite['source'] })).toMatch(/citySite › source/)
    expect(bad({ note: 'x'.repeat(401) })).toMatch(/citySite › note/)
  })

  it('keeps the street types, frontage inputs, link and station answer (7 Nov), and checks them', () => {
    const withStreets: StudySite = { ...site, streets: { 'GRANVILLE ST': { type: 'retail', active: 0.95, crossings: 0 }, 'HOWE ST': { type: null } },
      link: { enabled: true, along: false, offset: 4, width: 9.1, openToSky: true, srw: true }, station: 'GRANVILLE ST' }
    const text = exportProject({ ...defaultDesign(), citySite: withStreets })
    const r = readProject(text)
    expect(r.problems).toEqual([])
    expect(toDesign(r.file!).citySite).toEqual(withStreets)
    const f = JSON.parse(text)
    f.citySite.streets['HOWE ST'].type = 'boulevard'
    expect(readProject(JSON.stringify(f)).problems.join(' ')).toMatch(/citySite › streets/)
  })
})
