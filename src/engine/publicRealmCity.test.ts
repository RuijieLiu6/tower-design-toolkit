// The three public realm nodes on Real Vancouver with the study site's streets (7 Nov): the default site's four streets
// found in the City layers, right-of-way measured to the facing parcels, types picked by the user (never guessed).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import defaultSite from '../data/defaultSite.json'
import { decodeFootprints } from '../lib/cityLayers'
import { defaultTower } from '../store'
import { DEFAULT_PUBLIC_REALM, cityFrontageCheck, cityGroundPlaneCheck, cityStreetwallCheck, type CityStreetsCtx } from './publicRealm'
import { DEFAULT_CITY_LINK, siteStreets, type StreetLineLike, type StreetSetting } from './siteStreets'
import type { Tower } from './types'

type Pt = [number, number]
const data = (f: string) => new URL(`../../public/data/${f}`, import.meta.url)
const lines = (JSON.parse(readFileSync(data('city_streets.json'), 'utf8')) as { lines: StreetLineLike[] }).lines
const buf = readFileSync(data('parcels.bin'))
const parcels = decodeFootprints(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
const ring = defaultSite.ring as Pt[]
const found = siteStreets(ring, lines, parcels)
const tower: Tower = { ...defaultTower('city', [254, 486]), height: 285, rotation: 45.2 }
const input = DEFAULT_PUBLIC_REALM
const ctx = (settings: Record<string, StreetSetting> = {}, extra: Partial<CityStreetsCtx> = {}): CityStreetsCtx => ({ streets: found.streets, settings, link: null, station: null, ...extra })
const typed: Record<string, StreetSetting> = { 'GRANVILLE ST': { type: 'retail' }, 'W PENDER ST': { type: 'local' }, 'HOWE ST': { type: 'arterial' }, 'DUNSMUIR ST': { type: 'local' } }
const ids = (r: { rules: { id: string }[] }) => r.rules.map((x) => x.id)

describe('Streetwall & tower form with the study site’s streets', () => {
  it('checks each street’s streetwall against the band for its measured width, before any type is picked', () => {
    const r = cityStreetwallCheck([tower], ctx(), ring)
    expect(ids(r)).toEqual(expect.arrayContaining(['pr-podium-granville-st', 'pr-podium-howe-st', 'pr-podium-dunsmuir-st', 'pr-podium-w-pender-st', 'pr-share-' + tower.id]))
    const g = r.rules.find((x) => x.id === 'pr-podium-granville-st')!
    expect(g.flag).toBe('unverified') // the width is the Toolkit's measurement
    expect(g.note).toMatch(/24\.4 m right-of-way, measured to the facing lots/)
    expect(g.threshold).toMatch(/15\.2 m|21\.3 m/) // Table 2.2b: up to 27.5 m wide
    // The study tower (30 m square, no podium, centred on the 79.2 m deep block) stands about 24.6 m back: not a streetwall.
    expect(g.value).toMatch(/no streetwall: the nearest face is 24\.\d m back/)
    expect(g.state).toBe('pass')
    // Continuity needs the type: none yet, and one open line says which streets wait.
    expect(ids(r).some((id) => id.startsWith('pr-continuity'))).toBe(false)
    expect(r.rules.find((x) => x.id === 'pr-street-types')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(r.rules.find((x) => x.id === 'pr-streets')).toBeUndefined()
  })
  it('a podium on the property line is the streetwall: its height against the band for the street’s width', () => {
    const deep: Tower = { ...tower, podiumDepth: 79, podiumHeight: 18 }
    const r = cityStreetwallCheck([deep], ctx(), ring)
    const g = r.rules.find((x) => x.id === 'pr-podium-granville-st')!
    expect(g.value).toMatch(/^18\.0 m on a 24\.4 m street/)
    expect(g.state).toBe(g.threshold.startsWith('≤ 21.3') ? 'pass' : 'fail') // 15.2 m band, or 21.3 m with enhanced open space
  })
  it('checks continuity on the retail and arterial streets once typed, and drops the open line', () => {
    const r = cityStreetwallCheck([tower], ctx(typed), ring)
    expect(ids(r).filter((id) => id.startsWith('pr-continuity')).sort()).toEqual(['pr-continuity-granville-st', 'pr-continuity-howe-st'])
    expect(r.rules.find((x) => x.id === 'pr-street-types')).toBeUndefined()
    expect(r.walls).toHaveLength(4)
  })
  it('without streets (none found yet) it keeps the tower rules and one open street line', () => {
    expect(cityStreetwallCheck([tower]).rules.find((x) => x.id === 'pr-streets')).toMatchObject({ state: 'unknown' })
  })
})

describe('Active frontage with the study site’s streets', () => {
  it('needs the type for the active share target; entrances and weather protection need none', () => {
    const open = cityFrontageCheck([tower], ctx())
    expect(open.rules.find((x) => x.id === 'pr-active-granville-st')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(ids(open)).toEqual(expect.arrayContaining(['pr-canopy', 'pr-crossings', 'pr-ground-height', 'pr-street-types-frontage']))
    const r = cityFrontageCheck([tower], ctx(typed))
    const g = r.rules.find((x) => x.id === 'pr-active-granville-st')!
    expect(g.threshold).toMatch(/≥ 90%/)
    expect(g.state).toBe('pass') // the retail starting value is 90%
    expect(r.rules.find((x) => x.id === 'pr-crossings')).toMatchObject({ state: 'pass' }) // driveways start on the local streets
  })
  it('fails a driveway across the retail high street', () => {
    const r = cityFrontageCheck([tower], ctx({ ...typed, 'GRANVILLE ST': { type: 'retail', crossings: 1 } }))
    expect(r.rules.find((x) => x.id === 'pr-crossings')).toMatchObject({ state: 'fail' })
  })
})

describe('Open space & links with the study site’s streets', () => {
  it('asks about a station entrance, and leaves the link open until answered', () => {
    const r = cityGroundPlaneCheck([tower], ring, input, {}, ctx(typed))
    expect(r.rules.find((x) => x.id === 'pr-station-question')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(r.rules.find((x) => x.id === 'pr-link')).toMatchObject({ state: 'unknown', value: 'None' })
    // Without a link the longest frontage is a long side of the block (about 141.7 m): warn.
    expect(r.rules.find((x) => x.id === 'pr-perimeter')).toMatchObject({ state: 'warn' })
    expect(r.longestGap).toBeCloseTo(141.7, 0)
  })
  it('requires a link and a transit plaza when a station entrance is on Granville; a link across the middle halves the run', () => {
    const noLink = cityGroundPlaneCheck([tower], ring, input, {}, ctx(typed, { station: 'GRANVILLE ST' }))
    expect(noLink.rules.find((x) => x.id === 'pr-link')).toMatchObject({ state: 'fail', flag: 'verified' })
    expect(ids(noLink)).toEqual(expect.arrayContaining(['pr-transit-plaza', 'pr-station', 'pr-station-active']))
    expect(noLink.rules.find((x) => x.id === 'pr-station-question')).toBeUndefined()
    const withLink = cityGroundPlaneCheck([tower], ring, input, {}, ctx(typed, { station: 'GRANVILLE ST', link: { ...DEFAULT_CITY_LINK, enabled: true } }))
    expect(withLink.rules.find((x) => x.id === 'pr-link')).toMatchObject({ state: 'pass' })
    expect(withLink.rules.find((x) => x.id === 'pr-link-width')).toMatchObject({ state: 'pass' })
    expect(withLink.longestGap).toBeLessThan(80) // the link crosses the two long sides near their middles
    expect(withLink.linkRing).toHaveLength(4)
    // The default tower's podium covers the middle of the block, so a link across it passes under the podium or tower.
    expect(['podium', 'tower']).toContain(withLink.linkThrough)
  })
  it('says the link trigger does not apply with no station entrance, and keeps the other triggers open', () => {
    const r = cityGroundPlaneCheck([tower], ring, input, {}, ctx(typed, { station: 'none' }))
    expect(r.rules.find((x) => x.id === 'pr-link')).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(ids(r).includes('pr-transit-plaza')).toBe(false)
  })
})
